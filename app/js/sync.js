// Cross-device sync over Supabase PostgREST (plain fetch, no SDK). The app never waits on this.
// Uses the SAME project + signed-in 'pos' session as Online orders: no extra key. On by default once Online orders is connected.
// Each record keeps its UUID id, so pushes are idempotent upserts; pulls go by server sequence number.
// Offline-first: local writes mark records dirty; dirty records are pushed whenever we're online (retry every tick).
// Recipes ('secure' store) and per-device settings ('kv') are NEVER synced.
import * as db from './db.js'; import * as O from './online.js';
let running=false;
const NEVER=['secure','kv','backups','printJobs'];
export const STORES=db.SYNCED.filter(s=>!NEVER.includes(s));
export async function config(){ const oc=await O.config(); const off=await db.kvGet('syncOff',false);
  return {enabled:!!oc.connected&&!off, connected:!!oc.connected, off, url:(oc.url||'').replace(/\/$/,''), anonKey:oc.anonKey}; }
async function hdr(c){ return {apikey:c.anonKey,Authorization:'Bearer '+await O.token(),'Content-Type':'application/json'}; }
async function api(c,path,opt={}){ const r=await fetch(c.url+'/rest/v1/'+path,{...opt,headers:{...await hdr(c),...(opt.headers||{})}});
  if(!r.ok) throw new Error(path.split('?')[0]+' '+r.status+' '+(await r.text()).slice(0,160)); return r.status===204||opt.method==='POST'&&!opt.want?null:r.json(); }
// Registers this device once. First device keeps plain numbers; later devices get B-, C-, ... so numbers never collide.
async function register(c,deviceId){ if(await db.kvGet('syncDevice')) return;
  await api(c,'moes_devices?on_conflict=device_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify([{device_id:deviceId,label:navigator.userAgent.slice(0,120)}])});
  const [row]=await api(c,'moes_devices?select=idx&device_id=eq.'+encodeURIComponent(deviceId));
  const all=await api(c,'moes_devices?select=idx&order=idx.asc'); const rank=all.findIndex(r=>r.idx===row.idx);
  const st=await db.kvGet('settings',{}); if(!st.devicePrefix&&rank>0){ st.devicePrefix=String.fromCharCode(65+Math.min(rank,25))+'-'; await db.kvSet('settings',st); }
  await db.kvSet('syncDevice',{idx:row.idx,rank,at:Date.now()}); }
export async function syncNow(log=()=>{},{full=false}={}){
  const c=await config(); if(!c.enabled||!c.url||!navigator.onLine||running) return {skipped:true};
  running=true; const deviceId=await db.kvGet('deviceId'); let pushed=0, pulled=0;
  try{
    await register(c,deviceId);
    const first=full||!(await db.kvGet('syncInit',false)); // first sync: push EVERYTHING this device has
    for(const s of STORES){
      const dirty=(await db.all(s)).filter(o=>first||o.dirty);
      for(let i=0;i<dirty.length;i+=200){
        const batch=dirty.slice(i,i+200);
        const rows=batch.map(o=>{ const {dirty:_,...data}=o; return {id:s+':'+o.id,store:s,device_id:deviceId,updated_at:o.updatedAt||o.createdAt||0,data}; });
        await api(c,'moes_records?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
        for(const o of batch){ const cur=await db.get(s,o.id); if(cur && cur.updatedAt===o.updatedAt && cur.dirty){ delete cur.dirty; await db.put(s,cur,true); } }
        pushed+=batch.length;
      }
    }
    if(first) await db.kvSet('syncInit',Date.now());
    let since=await db.kvGet('syncSeq',0);
    for(;;){
      const rows=await api(c,`moes_records?select=seq,store,device_id,updated_at,data&seq=gt.${since}&order=seq.asc&limit=500`);
      if(!rows.length) break;
      for(const row of rows){ since=Math.max(since,row.seq); if(!STORES.includes(row.store)||!row.data?.id) continue;
        const local=await db.get(row.store,row.data.id);
        if(local&&!local.dirty&&row.device_id===deviceId&&(local.updatedAt||0)===row.updated_at) continue; // our own echo
        if(!local || (!local.dirty && row.updated_at>=(local.updatedAt||0)) || (local.dirty && row.updated_at>(local.updatedAt||0))){
          if(local && JSON.stringify({...local,dirty:undefined})===JSON.stringify({...row.data,dirty:undefined})) continue;
          await db.put(row.store,{...row.data,updatedAt:row.updated_at},true); pulled++; } }
      await db.kvSet('syncSeq',since); if(rows.length<500) break;
    }
    await db.kvSet('lastSync',{at:Date.now(),okAt:Date.now(),pushed,pulled,ok:true}); return {pushed,pulled};
  }catch(e){ await db.kvSet('lastSync',{at:Date.now(),okAt:(await db.kvGet('lastSync'))?.okAt||0,ok:false,error:String(e.message||e)}); log('sync failed: '+e.message); return {error:String(e.message||e)}; }
  finally{ running=false; }
}
let timer=null;
export function kick(){ clearTimeout(timer); timer=setTimeout(()=>tickFn&&tickFn(),800); }
let tickFn=null;
export function startAuto(onDone){ tickFn=()=>syncNow().then(r=>onDone&&onDone(r)).catch(()=>{}); setInterval(tickFn,5000); addEventListener('online',tickFn); addEventListener('pos-online-connected',()=>kick()); setTimeout(tickFn,2000); document.addEventListener('visibilitychange',()=>{ if(!document.hidden) kick(); }); }
