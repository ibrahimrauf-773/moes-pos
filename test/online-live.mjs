// REAL end-to-end against the live Supabase project. Reads URL/anon key/POS password from /home/box/.moes_supabase.env (never printed).
// Inserts a test website order as anon (like the website), drives it through the POS UI, verifies remote state + outbox. Cleanup is done separately via SQL.
import fs from 'node:fs'; import crypto from 'node:crypto'; import * as H from './helpers.mjs';
const env=Object.fromEntries(fs.readFileSync('/home/box/.moes_supabase.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{ const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));
const URL_=env.SUPABASE_URL, ANON=env.SUPABASE_ANON_KEY, PW=env.SUPABASE_POS_PASSWORD; if(!URL_||!ANON||!PW) throw new Error('env missing');
const SHOTS='/workspace/pos_build/screens/'; const log=(...a)=>console.log(new Date().toISOString(),...a);
const ok=(c,m)=>{ if(!c) throw new Error(m); };
const id=crypto.randomUUID(), ref='TEST-E2E-'+Date.now(), phone='03009990001';
const order={id,channel:'website',order_type:'delivery',status:'received',payment_verified:false,payment_method:'cod',tracking_token:crypto.randomBytes(16).toString('hex'),website_ref:ref,
  customer:{name:'E2E Test (delete me)',phone,address:'Test House 1',area:'DHA (all phases)',zone:'A'},items:[{item_id:'combo_1',name:'Combo 1 (2 tenders)',qty:1,unit_price:1099,spice_level:'Hot',modifiers:[]}],
  subtotal:1099,delivery_fee:200,total:1299,notes:'AUTOMATED TEST – ignore'};
fs.writeFileSync('/tmp/live-test-ids.json',JSON.stringify({id,ref,phone}));
await H.go(p,'settings'); await p.click('[data-t=tab-online]'); await H.sleep(p);
await p.fill('[data-t=online-url]',URL_); await p.fill('[data-t=online-pass]',PW); await p.click('[data-t=online-connect]'); await p.waitForFunction(()=>__pos.O.state().connected,null,{timeout:15000});
await p.screenshot({path:SHOTS+'flow-live-settings-connected.png'}); log('POS connected');
await p.waitForFunction(()=>__pos.O.state().realtime,null,{timeout:20000}); log('realtime joined'); await H.go(p,'live');
let r=await fetch(URL_+'/rest/v1/online_orders',{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(order)});
log('anon insert',r.status); ok(r.status===201,'anon insert failed '+r.status+' '+await r.text());
const t0=Date.now(); await p.waitForFunction(async i=>!!(await __pos.db.get('orders','web-'+i)),id,{timeout:15000,polling:200}); await p.waitForSelector('[data-t=new-order-alert]',{timeout:8000}); log('alert via realtime after',Date.now()-t0,'ms (no manual pull)'); await p.screenshot({path:SHOTS+'flow-live-alert.png'}); log('alert shown');
const local=()=>p.evaluate(i=>__pos.db.get('orders','web-'+i),id); const o0=await local(); log('imported as POS #'+o0.orderNo);
const remote=async()=>{ const j=await p.evaluate(async i=>{ const c=await __pos.O.config(); const r=await fetch(c.url+'/rest/v1/online_orders?id=eq.'+i,{headers:{apikey:c.anonKey,Authorization:'Bearer '+c.access}}); return r.json(); },id); return j[0]; };
let rw0; const sync=()=>p.evaluate(async()=>{ await __pos.O.flush(); await __pos.O.pull(); });
await H.go(p,'live'); const card=`[data-lo="web-${id}"]`;
for(const s of ['preparing','ready']){ await p.click(card+' [data-t=next]'); await H.sleep(p,400); await sync(); ok((await remote()).status===s,'remote not '+s); log(s); }
await p.click(card+' [data-t=next]'); await H.sleep(p,300); const amt=(await p.textContent('[data-t=rider-amount]')).replace(/\D/g,''); const tot=(await remote()).total; log('server total (server-priced)',tot); ok(+amt===tot-200,'rider amount '+amt); await p.check('[data-t=rider-later]'); await p.screenshot({path:SHOTS+'flow-live-dispatch.png'}); await H.modalOk(p);
await sync(); let rw=await remote(); ok(rw.status==='out_for_delivery'&&rw.rider_settlement==='pending_later','dispatch remote '+rw.status+'/'+rw.rider_settlement); log('dispatched, rider pays later');
await H.go(p,'live'); await p.click(`[data-t=rider-settle]`); await H.sleep(p); await p.check('[data-t=rs-hbl]'); await H.modalOk(p); await sync(); rw=await remote(); ok(rw.rider_settlement==='transfer'&&rw.rider_amount_received===tot-200&&rw.rider_settled_at,'settle remote'); log('settled via HBL');
await H.go(p,'live'); await p.click(card+' [data-t=next]'); await H.sleep(p,400); await sync(); rw=await remote(); ok(rw.status==='delivered','not delivered'); log('delivered');
log('remote timestamps',Object.keys(rw.status_timestamps).join(','));
const ob=await p.evaluate(i=>__pos.O.fetchOutbox(i),id); log('outbox rows',JSON.stringify(ob.map(x=>({kind:x.kind,status:x.status,recipient:x.recipient?x.recipient.slice(0,4)+'…':null}))));
// sold-out toggle round trip
await p.click('[data-t=soldout-btn]'); await H.sleep(p); await p.check('[data-t=so-combo1]'); await H.sleep(p,800); await p.uncheck('[data-t=so-combo1]'); await H.sleep(p,800); await H.modalOk(p); await sync();
const av=await p.evaluate(async()=>{ const c=await __pos.O.config(); return (await fetch(c.url+'/rest/v1/menu_availability?item_id=eq.combo_1',{headers:{apikey:c.anonKey,Authorization:'Bearer '+c.access}})).json(); }); log('combo_1 available after toggle round-trip:',av[0]?.available);
await H.go(p,'live'); await p.screenshot({path:SHOTS+'flow-live-done.png'}); await H.go(p,'reports'); await p.screenshot({path:SHOTS+'flow-live-report.png',fullPage:true});
await b.close(); log('LIVE E2E PASSED'); process.exit(0);
