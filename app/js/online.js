// Online orders (website) via Supabase: password sign-in ONCE (owner Settings) -> refresh token kept on this device.
// Realtime websocket nudges a pull; polling is the fallback. All writes go through an IndexedDB-backed queue
// that retries when offline. Never sends WhatsApp: the server creates notifications_outbox rows on status change.
import * as db from './db.js'; import {ONLINE_DEFAULT} from './seed.js';
let cfg=null, ws=null, hb=null, poll=null, running=false, pulling=null, flushing=null, rtTimer=null;
const L={onRows:null,onStatus:null};
export const on=(k,f)=>{ L[k]=f; };
const emit=()=>{ try{ L.onStatus?.(state()); }catch(e){} };
export async function config(){ return cfg??=await db.kvGet('online',{...ONLINE_DEFAULT,connected:false}); }
async function save(){ await db.kvSet('online',cfg); }
export function state(){ return {url:cfg?.url||'',connected:!!cfg?.connected,lastPull:cfg?.lastPull||null,lastError:cfg?.lastError||null,realtime:!!cfg?._rt,queue:cfg?._q||0,failed:cfg?._f||0,email:cfg?.email}; }
function setTok(j){ cfg.access=j.access_token; cfg.refresh=j.refresh_token; cfg.exp=Date.now()+((j.expires_in||3600)-120)*1000; }
export async function connect(password,{url,anonKey,email}={}){ await config(); if(url) cfg.url=url.replace(/\/+$/,''); if(anonKey) cfg.anonKey=anonKey; if(email) cfg.email=email;
  const r=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:cfg.email,password})});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error('Sign-in failed: '+(j.error_description||j.msg||j.error||r.status));
  if(j.user?.app_metadata?.role!=='pos') throw new Error('This account is not a POS account (app_metadata.role must be "pos")');
  setTok(j); cfg.connected=true; cfg.connectedAt=Date.now(); cfg.lastError=null; await save(); start(); try{ dispatchEvent(new Event('pos-online-connected')); }catch{} return true; }
export async function disconnect(){ await config(); stop(); Object.assign(cfg,{connected:false,access:null,refresh:null,exp:0}); await save(); emit(); }
let refreshing=null;
export async function token(){ await config(); if(cfg.access&&Date.now()<cfg.exp) return cfg.access; if(!cfg.refresh) throw new Error('Online orders not connected');
  return refreshing??=(async()=>{ try{
    const r=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:cfg.refresh})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){ if(r.status>=400&&r.status<500){ cfg.connected=false; cfg.lastError='Session expired – reconnect in Settings → Online orders'; await save(); stop(); emit(); } throw new Error('Token refresh failed: '+r.status); }
    setTok(j); await save(); if(ws){ try{ ws.send(JSON.stringify({topic:'realtime:pos-orders',event:'access_token',payload:{access_token:cfg.access},ref:'t'})); }catch(e){} } return cfg.access; } finally{ refreshing=null; } })(); }
async function api(path,opt={}){ const t=await token();
  const r=await fetch(cfg.url+'/rest/v1/'+path,{...opt,headers:{apikey:cfg.anonKey,Authorization:'Bearer '+t,'Content-Type':'application/json',...(opt.headers||{})}});
  if(!r.ok){ const e=new Error(`${r.status} ${(await r.text().catch(()=>'')).slice(0,200)}`); e.status=r.status; throw e; }
  const tx=await r.text(); return tx?JSON.parse(tx):null; }
// Pull recent + all unfinished orders
export async function pull(){ await config(); if(!cfg.connected) return [];
  return pulling??=(async()=>{ try{ const since=new Date(Date.now()-36*3600e3).toISOString();
    const rows=await api(`online_orders?select=*&or=${encodeURIComponent(`(created_at.gte.${since},status.not.in.(delivered,cancelled))`)}&order=created_at.asc`);
    cfg.lastPull=Date.now(); cfg.lastError=null; await save(); await L.onRows?.(rows); emit(); return rows; }
    catch(e){ cfg.lastError=String(e.message||e); emit(); throw e; } finally{ pulling=null; } })(); }
export async function fetchOutbox(orderId){ return api(`notifications_outbox?select=*&order_id=eq.${orderId}&order=created_at.asc`); }
// ---- write queue (survives reloads / offline) ----
async function q(){ return await db.kvGet('onlineQueue',[]); }
async function counts(){ await config(); cfg._q=(await q()).length; cfg._f=(await db.kvGet('onlineFailed',[])).length; }
export async function enqueue(op){ const a=await q(); a.push({id:Math.random().toString(36).slice(2),at:Date.now(),tries:0,...op}); await db.kvSet('onlineQueue',a); await counts(); emit(); flush().catch(()=>{}); }
export async function queued(){ return q(); }
export async function flush(){ await config(); if(!cfg.connected) return;
  return flushing??=(async()=>{ try{ for(;;){ const a=await q(); const op=a[0]; if(!op) break;
    try{ if(op.kind==='patch') await api(`online_orders?id=eq.${op.remoteId}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(op.body)});
      else if(op.kind==='avail') await api('menu_availability?on_conflict=item_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(op.body)}); }
    catch(e){ const b=await q(); const x=b.find(z=>z.id===op.id); if(!x) continue;
      if(e.status&&e.status>=400&&e.status<500&&e.status!==401&&e.status!==408&&e.status!==429){ // permanent: park it so it can't block the queue
        await db.kvSet('onlineQueue',b.filter(z=>z.id!==op.id)); const f=await db.kvGet('onlineFailed',[]); f.push({...x,error:e.message,failedAt:Date.now()}); await db.kvSet('onlineFailed',f.slice(-100)); continue; }
      x.tries++; x.lastError=String(e.message||e); await db.kvSet('onlineQueue',b); cfg.lastError='Write queued (offline?): '+x.lastError; break; }
    await db.kvSet('onlineQueue',(await q()).filter(z=>z.id!==op.id)); } }
  finally{ await counts(); emit(); flushing=null; } })(); }
// ---- realtime (phoenix protocol, no SDK) ----
function rt(){ if(!running||ws||typeof WebSocket==='undefined') return;
  let s; try{ s=new WebSocket(cfg.url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(cfg.anonKey)+'&vsn=1.0.0'); }catch(e){ return; }
  ws=s; s.onopen=async()=>{ try{ s.send(JSON.stringify({topic:'realtime:pos-orders',event:'phx_join',ref:'1',payload:{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'online_orders'}]},access_token:(s._tok=await token())}}));
      hb=setInterval(async()=>{ try{ s.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:'h'})); const t=await token(); if(t!==s._tok){ s._tok=t; s.send(JSON.stringify({topic:'realtime:pos-orders',event:'access_token',payload:{access_token:t},ref:'t'})); } }catch(e){} },25000); }catch(e){ s.close(); } };
  s.onmessage=e=>{ let m; try{ m=JSON.parse(e.data); }catch(x){ return; }
    if(m.event==='phx_reply'&&m.topic==='realtime:pos-orders'&&m.ref==='1'){ cfg._rt=m.payload?.status==='ok'; emit(); if(cfg._rt) pull().catch(()=>{}); }
    if(m.event==='postgres_changes'||m.event==='INSERT'||m.event==='UPDATE'){ clearTimeout(rtTimer); rtTimer=setTimeout(()=>pull().catch(()=>{}),300); }
    if(m.event==='system'&&m.payload?.status==='error'){ cfg._rt=false; emit(); } };
  s.onclose=()=>{ clearInterval(hb); if(ws===s) ws=null; cfg._rt=false; emit(); if(running) setTimeout(rt,8000); };
  s.onerror=()=>{}; }
// Realtime is primary; while the socket is joined we only do a slow safety pull (every 5 min). When it is down, poll every pollMs (20s).
async function tick(){ if(!running) return; try{ await flush(); }catch(e){} if(cfg._rt&&cfg.lastPull&&Date.now()-cfg.lastPull<300000) return; try{ await pull(); }catch(e){} }
export async function start(){ await config(); if(!cfg.connected||running) return; running=true; await counts(); rt(); poll=setInterval(tick,cfg.pollMs||20000); tick();
  if(typeof addEventListener!=='undefined'){ addEventListener('online',tick); } }
export function stop(){ running=false; clearInterval(poll); poll=null; if(ws){ const s=ws; ws=null; try{ s.close(); }catch(e){} } }
export const isRunning=()=>running;
