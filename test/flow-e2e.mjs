// Order-flow E2E: status workflow, rider settlement, WhatsApp copy, online orders (mock Supabase), alert, sold-out, offline queue.
import http from 'node:http'; import * as H from './helpers.mjs';
const SHOTS='/workspace/pos_build/screens/'; const PORT=54399, URL_=`http://127.0.0.1:${PORT}`;
const eq=(a,e,m='')=>{ if(JSON.stringify(a)!==JSON.stringify(e)) throw new Error(`${m} expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); };
const ok=(c,m)=>{ if(!c) throw new Error(m||'assertion failed'); };
const M={orders:new Map(),patches:[],avail:[],down:false,auth:0};
const mkOrder=(n,{pay='cod',type='delivery',zone='A'}={})=>{ const id=`00000000-0000-4000-8000-00000000000${n}`; const t=new Date().toISOString();
  return {id,website_ref:'MHC-T'+n,order_type:type,status:'received',status_timestamps:{received:t},created_at:t,customer:{name:'Test Cust '+n,phone:'0300123456'+n,address:'House '+n,area:'DHA (all phases)',zone:type==='delivery'?zone:null},
    items:[{item_id:'combo_1',name:'Combo 1',qty:1,unit_price:1099,spice_level:'Hot',modifiers:[]}],delivery_fee:type==='delivery'?200:0,total:type==='delivery'?1299:1099,payment_method:pay,payment_verified:false}; };
const srv=http.createServer((q,r)=>{ const u=new URL(q.url,'http://x'); r.setHeader('Access-Control-Allow-Origin','*'); r.setHeader('Access-Control-Allow-Headers','*'); r.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  if(q.method==='OPTIONS'){ r.writeHead(204); return r.end(); } if(M.down){ r.writeHead(503); return r.end('down'); }
  let b=''; q.on('data',c=>b+=c); q.on('end',()=>{ const J=(c,o)=>{ r.writeHead(c,{'Content-Type':'application/json'}); r.end(JSON.stringify(o)); };
    if(u.pathname==='/auth/v1/token'){ M.auth++; const j=b?JSON.parse(b):{}; if(j.password&&j.password!=='good-pass') return J(400,{error_description:'Invalid login credentials'});
      return J(200,{access_token:'tok'+M.auth,refresh_token:'ref'+M.auth,expires_in:3600,user:{email:'pos@moes.local',app_metadata:{role:'pos'}}}); }
    if(u.pathname==='/rest/v1/online_orders'&&q.method==='GET') return J(200,[...M.orders.values()]);
    if(u.pathname==='/rest/v1/online_orders'&&q.method==='PATCH'){ const id=u.searchParams.get('id').slice(3); const body=JSON.parse(b); M.patches.push({id,body}); const o=M.orders.get(id); if(o){ Object.assign(o,{...body,status_timestamps:{...o.status_timestamps,...(body.status_timestamps||{})}}); } return J(200,[o]); }
    if(u.pathname==='/rest/v1/menu_availability'){ M.avail.push(...JSON.parse(b)); return J(201,[]); }
    if(u.pathname==='/rest/v1/notifications_outbox') return J(200,[]);
    r.writeHead(404); r.end(); }); });
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
const b=await H.launch(); const results=[]; const T=[]; const test=(n,f)=>T.push([n,f]);
const ev=(p,f,a)=>p.evaluate(f,a);
async function connect(p){ if(await ev(p,()=>__pos.App.user.role!=='owner')) return ev(p,u=>__pos.O.connect('good-pass',{url:u}).then(()=>__pos.O.start()),URL_); await H.go(p,'settings'); await p.click('[data-t=tab-online]'); await H.sleep(p); await p.fill('[data-t=online-url]',URL_); await p.fill('[data-t=online-pass]','good-pass'); await p.click('[data-t=online-connect]'); await H.sleep(p,600); }
const flush=p=>ev(p,async()=>{ await __pos.O.flush(); await __pos.O.pull(); });

test('Connect: wrong password rejected; right password connects; password not stored', async()=>{ const p=await H.newPage(b); await H.login(p,'shaheer','1111'); await H.go(p,'settings'); await p.click('[data-t=tab-online]'); await H.sleep(p);
  await p.fill('[data-t=online-url]',URL_); await p.fill('[data-t=online-pass]','nope'); await p.click('[data-t=online-connect]'); await H.sleep(p,500); ok(/Invalid|failed/i.test(await H.toastText(p)),'no error toast');
  await connect(p); const cfg=await ev(p,()=>__pos.db.kvGet('online')); ok(cfg.connected&&cfg.refresh,'not connected'); ok(!JSON.stringify(cfg).includes('good-pass'),'password stored!');
  await p.screenshot({path:SHOTS+'flow-settings-online.png'}); await p.ctx.close(); });

test('Website delivery (COD): alert until Accept → Preparing → Waiting for rider → Dispatch cash → Delivered; status + timestamps written back', async()=>{ M.orders.clear(); M.patches=[]; const w=mkOrder(1); M.orders.set(w.id,w);
  const p=await H.newPage(b); await H.login(p,'waqar','4444'); await connect(p); await flush(p); await ev(p,()=>__pos.alertCheck()); await H.sleep(p,400);
  ok(await p.$('[data-t=new-order-alert]'),'no full-screen alert'); ok((await p.textContent('[data-t=alert-total]')).includes('1,299'),'alert total'); await p.screenshot({path:SHOTS+'flow-new-order-alert.png'});
  const o0=(await H.orders(p)).find(o=>o.id==='web-'+w.id); ok(o0&&o0.orderNo,'imported with POS number'); eq(o0.customer.phone.replace(/\D/g,'').slice(-10),'3001234561');
  await p.click('[data-t=alert-accept]'); await H.sleep(p,400); ok(!(await p.$('[data-t=new-order-alert]')),'alert still up');
  await flush(p); eq(M.orders.get(w.id).pos_order_no,String(o0.orderNo),'pos_order_no written back on accept');
  await H.go(p,'live'); await p.screenshot({path:SHOTS+'flow-live-accepted.png'});
  const card=()=>p.$(`[data-t=lcard][data-lo="web-${w.id}"]`)||p.$('[data-t=lcard]');
  for(const want of ['preparing','ready']){ await p.click('[data-t=next]'); await H.sleep(p,300); eq((await H.lastOrder(p)).flow.status,want); }
  await p.screenshot({path:SHOTS+'flow-live-waiting-rider.png'});
  await p.click('[data-t=next]'); await H.sleep(p,300); ok(!(await p.$('[data-t=rider-fare]')),'delivery shown on collect step'); eq((await p.textContent('[data-t=rider-amount]')).replace(/\D/g,''),'1099');
  await p.screenshot({path:SHOTS+'flow-dispatch-dialog.png'}); await p.check('[data-t=rider-cash]'); await H.modalOk(p);
  let o=await H.lastOrder(p); eq(o.flow.status,'out_for_delivery'); eq(o.rider.method,'cash'); eq(o.unpaid,false);
  await p.click('[data-t=next]'); await H.sleep(p,300); o=await H.lastOrder(p); eq(o.flow.status,'delivered'); ok(['accepted','preparing','ready','out_for_delivery','delivered'].every(k=>o.flow.ts[k]),'missing timestamps');
  await flush(p); const rw=M.orders.get(w.id); eq(rw.status,'delivered'); eq(rw.rider_settlement,'cash'); eq(rw.rider_amount_received,1099); ok(Object.keys(rw.status_timestamps).length>=6,'remote ts');
  ok(M.patches.every(x=>!('total' in x.body)&&!('items' in x.body)),'POS only writes status/rider fields');
  await ev(p,()=>__pos.App.user=null); await p.reload(); await p.waitForFunction(()=>window.__ready); await H.login(p,'shaheer','1111');
  await H.go(p,'reports'); ok((await p.textContent('[data-t=r-speedway]')).includes('1,099'),'speedway in report'); await p.ctx.close(); });

test('Rider pays later: not drawer cash; receivables list; till card; settle via HBL', async()=>{ M.orders.clear(); M.patches=[]; const w=mkOrder(2,{zone:'C'}); w.status='ready'; M.orders.set(w.id,w);
  const p=await H.newPage(b); await H.login(p,'waqar','4444'); await connect(p); await flush(p); await H.go(p,'live');
  await p.click('[data-t=next]'); await H.sleep(p,300); eq((await p.textContent('[data-t=rider-amount]')).replace(/\D/g,''),'1099'); await p.check('[data-t=rider-later]'); await H.modalOk(p);
  await H.go(p,'live'); ok((await p.textContent('[data-t=rcv-total]')).replace(/,/g,'').includes('1099'),'receivable'); await p.screenshot({path:SHOTS+'flow-receivables.png'});
  await H.go(p,'till'); ok((await p.textContent('[data-t=till-sw-out]')).replace(/,/g,'').includes('1099'),'till outstanding'); ok((await p.textContent('[data-t=till-sw-pending]')).replace(/,/g,'').includes('1099'),'till tonight');
  await flush(p); eq(M.orders.get(w.id).rider_settlement,'pending_later');
  await H.go(p,'live'); await p.click('[data-t=rider-settle]'); await H.sleep(p); await p.check('[data-t=rs-hbl]'); await H.modalOk(p);
  const o=await H.lastOrder(p); ok(o.rider.settledAt&&o.rider.settledVia==='hbl'&&!o.payments.some(x=>x.rider),'settled');
  await flush(p); eq(M.orders.get(w.id).rider_settlement,'transfer'); eq(M.orders.get(w.id).rider_amount_received,1099);
  await H.go(p,'till'); ok((await p.textContent('[data-t=till-sw-out]')).includes('0'),'outstanding cleared'); await p.ctx.close(); });

test('Prepaid bank order: verify; rider owes 0; pickup flow ends Picked up', async()=>{ M.orders.clear(); const w=mkOrder(3,{pay:'bank_hbl'}); const pk=mkOrder(4,{type:'pickup'}); pk.status='accepted'; M.orders.set(w.id,w); M.orders.set(pk.id,pk);
  const p=await H.newPage(b); await H.login(p,'waqar','4444'); await connect(p); await flush(p);
  await ev(p,id=>__pos.setFlow(id,'ready'),'web-'+w.id); await H.go(p,'live');
  await p.click(`[data-lo="web-${w.id}"] [data-t=next]`); await H.sleep(p,300); ok(await p.$('[data-t=rider-none]'),'should be nothing to collect'); eq((await p.textContent('[data-t=rider-amount]')).replace(/\D/g,''),'0'); await H.modalOk(p);
  await p.click(`[data-lo="web-${pk.id}"] [data-t=next]`); await H.sleep(p,300); await p.click(`[data-lo="web-${pk.id}"] [data-t=next]`); await H.sleep(p,300);
  ok((await p.textContent(`[data-lo="web-${pk.id}"]`)).match(/Ready for pickup/),'pickup label'); await p.click(`[data-lo="web-${pk.id}"] [data-t=next]`); await H.sleep(p,300);
  const o=(await H.orders(p)).find(x=>x.id==='web-'+pk.id); eq(o.flow.status,'delivered'); await flush(p); eq(M.orders.get(pk.id).status,'delivered'); await p.ctx.close(); });

test('Offline: status changes queue while Supabase is down, flush when back; remote cancel adopted', async()=>{ M.orders.clear(); M.patches=[]; const w=mkOrder(5); w.status='accepted'; const w2=mkOrder(6); w2.status='accepted'; M.orders.set(w.id,w); M.orders.set(w2.id,w2);
  const p=await H.newPage(b); await H.login(p,'waqar','4444'); await connect(p); await flush(p); M.down=true;
  await ev(p,id=>__pos.setFlow(id,'preparing'),'web-'+w.id); await ev(p,()=>__pos.O.flush().catch(()=>{})); ok((await ev(p,()=>__pos.O.queued())).length>=1,'not queued'); eq(M.orders.get(w.id).status,'accepted');
  M.down=false; await flush(p); eq(M.orders.get(w.id).status,'preparing'); eq((await ev(p,()=>__pos.O.queued())).length,0);
  M.orders.get(w2.id).status='cancelled'; await flush(p); eq((await H.orders(p)).find(x=>x.id==='web-'+w2.id).status,'cancelled'); await p.ctx.close(); });

test('Sold-out toggle upserts menu_availability; WhatsApp copy text at each stage; walk-in WhatsApp order starts Accepted', async()=>{ M.avail=[];
  const p=await H.newPage(b); await H.login(p,'shaheer','1111'); await connect(p); await H.go(p,'live'); await p.click('[data-t=soldout-btn]'); await H.sleep(p); await p.check('[data-t=so-combo1]'); await H.sleep(p,300); await H.modalOk(p); await flush(p);
  ok(M.avail.some(a=>a.item_id==='combo_1'&&a.available===false),'availability not pushed');
  await H.go(p,'pos'); await H.whatsapp(p,{phone:'03211234567',name:'WA Cust',zone:'B'}); await H.add(p,'baja'); await H.pay(p,{},{unpaid:true}); const o=await H.lastOrder(p); eq(o.flow?.status,'accepted');
  const msgs=await ev(p,id=>__pos.db.get('orders',id).then(o=>['accepted','ready','out_for_delivery','delivered'].map(s=>__pos.L.customerMsg({...o,flow:{...o.flow,status:s}},__pos.L.MSG_AT[s]))),o.id);
  ok(msgs.every(m=>m&&m.includes(o.orderNo)),'msg missing order no'); await H.go(p,'live'); await p.click(`[data-lo="${o.id}"] [data-t=copy-wa]`); await H.sleep(p,300); await p.screenshot({path:SHOTS+'flow-copy-whatsapp.png'}); await p.ctx.close(); });

for(const [n,f] of T){ if(process.argv[2]&&!n.startsWith(process.argv[2])) continue; try{ await f(); results.push('PASS | '+n); }catch(e){ results.push('FAIL | '+n+' | '+e.message.split('\n')[0]); } console.log(results.at(-1)); }
console.log(`\n${results.filter(r=>r.startsWith('PASS')).length}/${results.length} flow tests passed`); await b.close(); srv.close(); process.exit(0);
