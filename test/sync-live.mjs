// REAL two-device sync test against live Supabase. Two isolated browser contexts = two devices (separate IndexedDB).
// Records it creates are tagged by device ids written to /tmp/sync-test-devices.json for SQL cleanup.
import fs from 'node:fs'; import * as H from './helpers.mjs';
const env=Object.fromEntries(fs.readFileSync('/home/box/.moes_supabase.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{ const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));
const URL_=env.SUPABASE_URL, PW=env.SUPABASE_POS_PASSWORD; const log=(...a)=>console.log(new Date().toISOString(),...a); const ok=(c,m)=>{ if(!c) throw new Error(m); };
const SHOTS='/workspace/pos_build/screens/'; const b=await H.launch();
const A=await H.newPage(b); await H.login(A,'shaheer','1111');            // owner's phone
const B=await H.newPage(b,{ipad:true}); await H.login(B,'waqar','4444');  // Waqar's counter
const ids=await Promise.all([A,B].map(p=>p.evaluate(()=>__pos.db.kvGet('deviceId')))); fs.writeFileSync('/tmp/sync-test-devices.json',JSON.stringify(ids));
// A has an order made BEFORE sync existed (must be pushed on first sync)
await H.go(A,'pos'); await H.add(A,'baja'); let t=+((await A.textContent('[data-t=total]')).replace(/\D/g,'')); await H.pay(A,{cash:t}); const a0=await H.lastOrder(A); log('A pre-existing order #'+a0.orderNo);
await B.evaluate(()=>{ __pos.App.draft=null; }); await H.go(B,'pos'); await H.add(B,'combo1',{heat:'Hot'}); t=+((await B.textContent('[data-t=total]')).replace(/\D/g,'')); await H.pay(B,{cash:t}); const b0=await H.lastOrder(B); log('B pre-existing order #'+b0.orderNo);
const until=async(p,fn,arg,ms=25000,what='')=>{ const end=Date.now()+ms; for(;;){ if(await p.evaluate(fn,arg)) return; if(Date.now()>end) throw new Error('timeout '+what); await new Promise(r=>setTimeout(r,250)); } };
const con=p=>p.evaluate(([u,pw])=>__pos.O.connect(pw,{url:u}),[URL_,PW]);
await con(A); await until(A,async()=>(await __pos.db.kvGet('lastSync'))?.ok,null,20000,'A sync'); log('A connected + first sync',JSON.stringify(await A.evaluate(()=>__pos.db.kvGet('lastSync'))));
await con(B); await until(B,async()=>(await __pos.db.kvGet('lastSync'))?.ok,null,20000,'B sync'); log('B connected + first sync');
await until(B,async()=>!!(await __pos.db.kvGet('syncDevice')),null,20000,'reg'); await B.waitForTimeout(500); const pre=await B.evaluate(()=>__pos.App.settings.devicePrefix); const preA=await A.evaluate(()=>__pos.App.settings.devicePrefix); log('prefixes A=',JSON.stringify(preA),'B=',JSON.stringify(pre)); ok(!preA&&pre==='B-','prefix');
await until(B,async i=>!!(await __pos.db.get('orders',i)),a0.id,20000,'a0'); log('B sees A pre-existing order');
await until(A,async i=>!!(await __pos.db.get('orders',i)),b0.id,25000,'b0.id'); log('A sees B pre-existing order');
// live: Waqar dine-in order appears on owner's phone
await H.go(B,'pos'); await H.add(B,'baja'); t=+((await B.textContent('[data-t=total]')).replace(/\D/g,'')); const t1=Date.now(); await H.pay(B,{cash:t}); const b1=await H.lastOrder(B); log('B new order #'+b1.orderNo); ok(String(b1.orderNo).startsWith('B-'),'B prefix not applied');
await until(A,async i=>!!(await __pos.db.get('orders',i)),b1.id,25000,'b1.id'); log('A got B order in',Date.now()-t1,'ms');
await H.go(A,'orders'); ok(await A.$(`tr[data-no="${b1.orderNo}"]`),'not in owner Orders list'); await A.screenshot({path:SHOTS+'flow-sync-owner-sees-waqar.png'});
// staff PIN change on A reaches B
const nh=await A.evaluate(async()=>{ const s=await __pos.db.get('staff','amir'); s.pinHash='E2E-'+Date.now(); await __pos.db.put('staff',s); return s.pinHash; });
await until(B,async h=>(await __pos.db.get('staff','amir')).pinHash===h,nh,25000,'pin'); log('staff PIN change synced');
// offline queue: B offline makes order, goes online, A receives
await B.context().setOffline(true); await H.go(B,'pos'); await H.add(B,'baja'); t=+((await B.textContent('[data-t=total]')).replace(/\D/g,'')); await H.pay(B,{cash:t}); const b2=await H.lastOrder(B); log('B offline order #'+b2.orderNo);
await B.waitForTimeout(3000); ok(!(await A.evaluate(i=>__pos.db.get('orders',i),b2.id)),'leaked while offline'); await B.context().setOffline(false);
await until(A,async i=>!!(await __pos.db.get('orders',i)),b2.id,30000,'b2.id'); log('offline order delivered after reconnect');
const nos=(await H.orders(A)).map(o=>String(o.orderNo)); log('owner order numbers',nos.join(','));
const recs=await A.evaluate(async()=>{ const c=await __pos.O.config(); return (await fetch(c.url+'/rest/v1/moes_records?select=store&store=eq.secure',{headers:{apikey:c.anonKey,Authorization:'Bearer '+await __pos.O.token()}})).json(); }); ok(recs.length===0,'secure synced!'); log('no recipes on server');
await b.close(); log('SYNC LIVE PASSED'); process.exit(0);
