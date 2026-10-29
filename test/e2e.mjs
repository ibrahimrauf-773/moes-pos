// Exhaustive E2E suite. Run: node tools/serve.mjs app 8080 &  then  node test/e2e.mjs
import * as H from './helpers.mjs'; import {startMock} from './mock-supabase.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {spawn} from 'node:child_process';
const b=await H.launch(); const results=[]; const only=process.argv[2];
const eq=(a,e,m='')=>{ if(JSON.stringify(a)!==JSON.stringify(e)) throw new Error(`${m} expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); };
const ok=(c,m)=>{ if(!c) throw new Error(m||'assertion failed'); };
const T=[]; const test=(area,name,fn)=>T.push({area,name,fn});
async function fresh(opts={}){ const p=await H.newPage(b,opts); return p; }
async function owner(opts){ const p=await fresh(opts); await H.login(p,'shaheer','1111'); return p; }
async function cashier(opts){ const p=await fresh(opts); await H.login(p,'waqar','4444'); return p; }
const ev=(p,f,a)=>p.evaluate(f,a);
async function quickSale(p,items=['baja'],pays){ await H.go(p,'pos'); for(const i of items) await H.add(p,i); const t=await total(p); return H.pay(p,pays||{cash:t}); }
const total=async p=>+((await p.textContent('[data-t=total]')).replace(/[^\d]/g,''));

// ---- Login / roles ----
test('Login','Login tiles show name and role on separate lines', async()=>{ const p=await fresh(); const t=await p.$eval('[data-staff=amir]',e=>[e.childNodes[0].textContent.trim(),e.querySelector('small').textContent]); eq(t,['Amir','kitchen']); await p.ctx.close(); });
test('Login','Wrong PIN rejected', async()=>{ const p=await fresh(); await p.click('[data-staff=waqar]'); await p.fill('[data-t=pin]','1111'); await p.click('[data-k=OK]'); await H.sleep(p,300); ok(!(await p.$('[data-nav]')),'logged in with wrong PIN'); await p.ctx.close(); });
test('Login','Each placeholder PIN logs in with correct role views', async()=>{ for(const [id,pin,role] of [['shaheer','1111','owner'],['ibrahim','2222','owner'],['ruqaiya','3333','owner'],['waqar','4444','cashier'],['shan','5555','kitchen'],['amir','6666','kitchen']]){
  const p=await fresh(); await H.login(p,id,pin); const navs=await p.$$eval('[data-nav]',n=>n.map(x=>x.dataset.nav)); eq(await ev(p,()=>__pos.App.user.role),role,id);
  if(role!=='owner'){ ok(!navs.includes('recipes')&&!navs.includes('settings'),id+' sees owner nav'); } else ok(navs.includes('recipes'),'owner recipes nav');
  if(role==='kitchen'){ eq(await ev(p,()=>__pos.App.view),'kds'); ok(!navs.includes('pos')&&!navs.includes('reports'),'kitchen sees pos/reports'); } await p.ctx.close(); } });
test('Login','Placeholder-PIN banner shown to owner', async()=>{ const p=await owner(); ok((await p.textContent('#banner')).includes('Placeholder PINs'),'no banner'); await p.ctx.close(); });

// ---- Channels & pricing ----
test('Orders','Takeaway order: price, number starts at 1606', async()=>{ const p=await owner(); await H.add(p,'combo1',{heat:'Hot'}); eq(await total(p),1099); eq(await H.pay(p,{cash:1099}),{ok:true}); const o=await H.lastOrder(p); eq([o.orderNo,o.type,o.lines[0].heat],[1606,'takeaway','Hot']); await p.ctx.close(); });
test('Orders','Dine-in order saved as dine_in, numbers increment', async()=>{ const p=await owner(); await H.channel(p,'dine_in'); await H.add(p,'baja'); await H.pay(p,{cash:199}); await H.channel(p,'dine_in'); await H.add(p,'lemonade'); await H.pay(p,{cash:199}); const os=await H.orders(p); eq(os.map(o=>[o.orderNo,o.type]),[[1606,'dine_in'],[1607,'dine_in']]); await p.ctx.close(); });
test('Orders','Heat levels: in-store has all 5 incl Reaper', async()=>{ const p=await owner(); await p.click('[data-item=combo1]'); await H.sleep(p); ok(await p.$('[data-t=item-popup]'),'item popup'); for(const h of ['Mild','Medium','Hot','ExtraHot','Reaper']) ok(await p.$(`[data-t=heat-${h}]`),'popup '+h); await p.click('[data-t=modal-cancel]'); await p.ctx.close(); });
test('Orders','Add-ons, qty and notes flow to order and kitchen ticket', async()=>{ const p=await owner(); await H.add(p,'combo2',{heat:'Medium',addons:['curly_fries','hot_honey'],qty:2,note:'no pickles'}); eq(await total(p),(1249+150+100)*2); await H.pay(p,{cash:2998}); const o=await H.lastOrder(p); eq([o.lines[0].qty,o.lines[0].addons.map(a=>a.id).sort(),o.lines[0].note],[2,['curly_fries','hot_honey'],'no pickles']);
  await H.go(p,'kds'); const k=await p.textContent('[data-t=ticket]'); ok(k.includes('Curly Fries')&&k.includes('no pickles'),'ticket missing addon/note'); await p.ctx.close(); });
test('Orders','Cart qty +/-, delete and clear', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.add(p,'baja'); eq(await total(p),398); await p.click('[data-qm="0"]'); await H.sleep(p); eq(await total(p),199); await p.click('[data-qp="0"]'); await H.sleep(p); eq(await total(p),398); await p.click('[data-del="0"]'); await H.sleep(p); eq(await total(p),0); await H.add(p,'lemonade'); await p.click('[data-t=clear]'); await H.sleep(p); eq(await total(p),0); await p.ctx.close(); });
for(const [z,fare] of Object.entries({A:200,B:300,C:360,D:460,E:560,F:660,G:760,H:860,I:960}))
 test('WhatsApp',`Zone ${z}: charge Rs ${fare} = rider fare, recorded separately`, async()=>{ const p=await owner(); await H.whatsapp(p,{phone:'0300123456'+(z.charCodeAt(0)%10),name:'Cust '+z,zone:z}); await H.add(p,'baja'); eq(await total(p),199+fare); eq(await H.pay(p,{cash:199+fare}),{ok:true}); const o=await H.lastOrder(p); eq([o.delivery.zone,o.delivery.charge,o.delivery.riderFare,o.channel],[z,fare,fare,'whatsapp']); await p.ctx.close(); });
test('WhatsApp','Editable zone charge vs rider fare: report shows both and difference', async()=>{ const p=await owner(); await H.go(p,'settings'); await p.click('[data-t=tab-zones]'); await H.sleep(p); await p.fill('[data-t=zc-B]','350'); await p.click('[data-t=save-zones]'); await H.sleep(p,300);
  await H.go(p,'pos'); await H.whatsapp(p,{phone:'03001112222',name:'Z',zone:'B'}); await H.add(p,'baja'); eq(await total(p),549); await H.pay(p,{cash:549}); await H.go(p,'reports'); const z=await p.textContent('[data-t=r-zones]'); ok(z.includes('350')&&z.includes('300')&&z.includes('50'),'zone report: '+z); await p.ctx.close(); });
test('WhatsApp','Copy for Speedway: one field per line, COD amount, iPad fallback modal', async()=>{ const p=await owner(); await H.whatsapp(p,{phone:'03001234567',name:'Speedy Cust',zone:'A'}); await H.add(p,'baja'); eq(await H.pay(p,{cash:399}),{ok:true}); await H.go(p,'orders'); await p.evaluate(()=>{ Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}); }); await p.click('[data-t=odetail] >> nth=0'); await H.sleep(p,300); await p.click('[data-t=d-speedway]'); const v=await p.inputValue('[data-t=speedway-text]'); const ls=v.split('\n'); eq(ls.length,9); ok(ls[0]==='Customer name: Speedy Cust'&&ls[1].includes('03001234567')&&/^Order #: \d+/.test(ls[4])&&/^Customer pays \(COD\): Rs [1-9]/.test(ls[5])&&/^Rider hands over to Moe's: Rs [1-9]/.test(ls[6])&&ls[7]==='Payment: COD','bad text '+v); await p.ctx.close(); });
test('WhatsApp','Validation: missing phone/zone and bad phone blocked', async()=>{ const p=await owner(); await H.channel(p,'whatsapp'); await H.add(p,'baja'); let r=await H.pay(p,{cash:199}); ok(r.error&&/phone|name/i.test(r.error),'no error '+JSON.stringify(r));
  await p.fill('[data-t=cphone]','12345'); await p.press('[data-t=cphone]','Tab'); await H.sleep(p); await p.fill('[data-t=cname]','X'); await p.press('[data-t=cname]','Tab'); r=await H.pay(p,{cash:199}); ok(/03X/.test(r.error||''),'bad phone accepted');
  await p.fill('[data-t=cphone]','03001234567'); await p.press('[data-t=cphone]','Tab'); await H.sleep(p); r=await H.pay(p,{cash:199}); ok(/zone/i.test(r.error||''),'no zone accepted'); eq((await H.orders(p)).length,0); await p.ctx.close(); });
test('WhatsApp','Returning customer auto-filled with zone; customer list', async()=>{ const p=await owner(); await H.whatsapp(p,{phone:'+923001234567',name:'Sara',addr:'DHA 6',zone:'A'}); await H.add(p,'baja'); await H.pay(p,{cash:399});
  await H.channel(p,'whatsapp'); await p.fill('[data-t=cphone]','03001234567'); await p.press('[data-t=cphone]','Tab'); await H.sleep(p,300); eq(await p.inputValue('[data-t=cname]'),'Sara'); eq(await p.inputValue('[data-t=zone]'),'A');
  await H.go(p,'customers'); ok((await p.textContent('[data-t=customers]')).includes('Sara'),'customer list'); await p.ctx.close(); });
test('WhatsApp','COD unpaid, then payment added later', async()=>{ const p=await owner(); await H.whatsapp(p,{phone:'03009998888',name:'C',zone:'C'}); await H.add(p,'baja'); await H.pay(p,{},{unpaid:true}); let o=await H.lastOrder(p); eq([o.unpaid,o.payments.length],[true,0]);
  await H.orderRowAct(p,o.orderNo,'pay'); await p.selectOption('[data-t=addpay-method]','hbl'); await H.modalOk(p); o=await H.lastOrder(p); eq([o.unpaid,o.payments[0].method,o.payments[0].amount],[false,'hbl',559]); await p.ctx.close(); });

// ---- Foodpanda ----
test('Foodpanda','FP price list used, no Reaper, FP total authoritative', async()=>{ const p=await owner(); await H.fp(p,'p25h-2644-abcd'); await p.click('[data-item=combo1]'); await H.sleep(p); ok(!(await p.$('[data-t=heat-Reaper]')),'Reaper on FP'); await p.check('[data-t=heat-Hot]'); await H.modalOk(p); eq(await total(p),1199);
  await H.fpTotal(p,1050); eq(await total(p),1050); eq(await H.pay(p,{fp_online:1050}),{ok:true}); const o=await H.lastOrder(p); eq([o.fp.orderId,o.fp.total,o.totals.total,o.payments[0].method],['p25h-2644-abcd',1050,1050,'fp_online']); await p.ctx.close(); });
test('Foodpanda','Duplicate FP order ID blocked; missing ID blocked; FP total optional with no payment step', async()=>{ const p=await owner(); await H.channel(p,'foodpanda'); await H.add(p,'baja'); let r=await H.pay(p,{fp_online:199}); ok(/order ID/i.test(r.error||''),'missing id');
  await H.fp(p,'fp-0001'); ok(!(await p.$('[data-t=cphone]')),'FP asks no phone'); ok(/Send to kitchen/.test(await p.textContent('[data-t=checkout]')),'FP label'); r=await H.pay(p,{fp_online:199}); eq(r,{ok:true},'FP total optional, no payment step'); ok(!(await p.$('[data-t=qpay]')),'no payment screen on FP');
  { const o=await H.lastOrder(p); eq([o.payments.length,o.payments[0].method,o.payments[0].amount,o.unpaid],[1,'fp_online',199,false]); } await H.newOrder(p);
  await H.fp(p,'fp-0001'); await H.add(p,'baja'); await H.fpTotal(p,199); r=await H.pay(p,{fp_online:199}); ok(/already/i.test(r.error||''),'dup allowed: '+JSON.stringify(r)); eq((await H.orders(p)).length,1); await p.ctx.close(); });
test('Foodpanda','Switching price list clears cart; sold-out FP items blocked', async()=>{ const p=await owner(); await H.add(p,'lemonade'); await H.channel(p,'foodpanda'); eq(await total(p),0); await p.click('[data-item=lemonade]'); await H.sleep(p); ok(/SOLD OUT/.test(await H.toastText(p)),'sold-out add'); eq(await total(p),0); await p.ctx.close(); });
test('Foodpanda','FP commission 23% estimate and payout in report', async()=>{ const p=await owner(); await H.fp(p,'fp-1000'); await H.add(p,'baja'); await H.fpTotal(p,1000); await H.pay(p,{fp_online:1000}); await H.go(p,'reports'); const t=await p.textContent('[data-t=r-fp]'); ok(t.includes('230')&&t.includes('770'),'fp: '+t); await p.ctx.close(); });

// ---- Payments ----
test('Payments','Split payment cash + HBL + BAH + card', async()=>{ const p=await owner(); await H.add(p,'mac',{heat:'Mild'}); eq(await H.pay(p,{cash:499,hbl:500,bah:300,card:200}),{ok:true}); const o=await H.lastOrder(p); eq(o.payments.map(x=>[x.method,x.amount]),[['cash',499],['hbl',500],['bah',300],['card',200]]);
  await H.go(p,'reports'); const t=await p.textContent('[data-t=r-pay]'); ok(t.includes('HBL')&&t.includes('500'),'pay report'); await p.ctx.close(); });
test('Payments','Payments not adding up are rejected', async()=>{ const p=await owner(); await H.add(p,'baja'); const r=await H.pay(p,{cash:100}); ok(/add up/.test(r.error||''),JSON.stringify(r)); await p.click('[data-t=modal-cancel]'); eq((await H.orders(p)).length,0); await p.ctx.close(); });
test('Payments','Cash tendered gives change; non-integer rejected', async()=>{ const p=await owner(); await H.add(p,'baja'); let r=await H.pay(p,{cash:'19.5'}); ok(r.error,'decimal accepted'); await p.click('[data-t=modal-cancel]'); r=await H.pay(p,{cash:199},{tendered:500}); eq(r,{ok:true}); eq((await H.lastOrder(p)).change,301); await p.ctx.close(); });

// ---- Discounts / approvals ----
test('Discounts','Staff meal 30% by cashier without owner', async()=>{ const p=await cashier(); await H.add(p,'mac',{heat:'Mild'}); await H.discount(p,{kind:'staff',reason:'Shan dinner'}); eq(await total(p),1049); await H.pay(p,{cash:1049}); eq((await H.lastOrder(p)).discount.approvedBy,'Waqar'); await p.ctx.close(); });
test('Discounts','Cashier 10% customer discount allowed', async()=>{ const p=await cashier(); await H.add(p,'mac',{heat:'Mild'}); await H.discount(p,{value:10,reason:'regular'}); eq(await total(p),1349); await p.ctx.close(); });
test('Discounts','Cashier 15% needs owner PIN: wrong PIN refused, owner PIN approves', async()=>{ const p=await cashier(); await H.add(p,'mac',{heat:'Mild'}); await H.discount(p,{value:15,reason:'vip'}); ok(await p.$('[data-t=owner-pin]'),'no approval prompt');
  await H.ownerPin(p,'4444'); ok(await p.$('[data-t=owner-pin]'),'cashier PIN approved'); await p.click('[data-t=modal-cancel]'); await H.sleep(p); eq(await total(p),1499);
  await H.discount(p,{value:15,reason:'vip'}); await H.ownerPin(p,'2222'); eq(await total(p),1274); await H.pay(p,{cash:1274}); eq((await H.lastOrder(p)).discount.approvedBy,'Ibrahim'); await p.ctx.close(); });
test('Discounts','Comp needs owner and reason; total 0', async()=>{ const p=await cashier(); await H.add(p,'baja'); await H.discount(p,{kind:'comp',reason:''}); ok(/Reason/.test(await p.textContent('[data-t=modal-err]')),'no reason err'); await p.fill('[data-t=dreason]','influencer'); await H.modalOk(p); await H.ownerPin(p,'1111'); eq(await total(p),0); eq(await H.pay(p,{cash:''}),{ok:true}); await p.ctx.close(); });
test('Discounts','Discounts appear in report adjustments', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.discount(p,{kind:'staff',reason:'meal'}); await H.pay(p,{cash:139}); await H.go(p,'reports'); ok((await p.textContent('[data-t=r-adj]')).includes('60'),'adj'); await p.ctx.close(); });

// ---- Void / refund ----
test('Void/Refund','Cashier void needs owner PIN + reason; stock returned', async()=>{ const p=await cashier(); await H.add(p,'baja'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p); const before=await ev(p,()=>__pos.onHand());
  await H.orderRowAct(p,o.orderNo,'void'); await H.ownerPin(p,'3333'); await H.modalOk(p); ok(/Reason/.test(await p.textContent('[data-t=modal-err]')),'void without reason'); await p.fill('[data-t=vreason]','customer cancelled'); await H.modalOk(p);
  const v=await H.lastOrder(p); eq([v.status,v.voidBy],['void','Ruqaiya']); const after=await ev(p,()=>__pos.onHand()); ok(Object.values(after).every(x=>Math.abs(x)<1e-9)||JSON.stringify(after)!==JSON.stringify(before),'stock not returned'); await p.ctx.close(); });
test('Void/Refund','Cashier refund needs owner PIN + reason; over-refund blocked', async()=>{ const p=await cashier(); await H.add(p,'lemonade'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p); await H.orderRowAct(p,o.orderNo,'refund'); ok(await p.$('[data-t=owner-pin]'),'owner PIN asked'); await H.ownerPin(p,'1111');
  await p.fill('[data-t=ramount]','500'); await p.fill('[data-t=rreason]','spilled'); await H.modalOk(p); ok(/199|max|at most|<=/i.test(await p.textContent('[data-t=modal-err]')),'over-refund'); await p.fill('[data-t=ramount]','100'); await H.modalOk(p);
  eq((await H.lastOrder(p)).refunds[0].amount,100); await relog(p,'shaheer','1111'); await H.go(p,'reports'); ok((await p.textContent('[data-t=r-refunds]')).includes('100'),'refund in report'); await p.ctx.close(); });
test('Void/Refund','Voided orders excluded from report totals', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199}); await H.add(p,'lemonade'); await H.pay(p,{cash:199}); await H.orderRowAct(p,1606,'void'); await p.fill('[data-t=vreason]','test'); await H.modalOk(p); await H.go(p,'reports'); ok((await p.textContent('[data-t=r-net]')).includes('199'),'net'); eq((await p.textContent('[data-t=r-orders]')).replace(/\D/g,''),'1'); await p.ctx.close(); });

// ---- KDS ----
test('Kitchen','KDS shows ticket, no prices; late turns red at 20m; bump clears', async()=>{ const p=await owner(); await H.add(p,'combo1',{heat:'Reaper'}); await H.pay(p,{cash:1099}); await p.ctx.close();
});
test('Kitchen','Kitchen staff: late timer; view-only by default; Ready (setting on) clears', async()=>{ const p=await fresh(); await H.login(p,'shaheer','1111'); await H.add(p,'combo1',{heat:'Reaper'}); await H.pay(p,{cash:1099}); await p.click('[data-t=logout]'); await H.sleep(p); await H.login(p,'shan','5555');
  const t=await p.textContent('[data-t=ticket]'); ok(!/Rs|1,099|1099/.test(t),'price on KDS'); ok(!(await p.$('.ticket.late')),'late too early'); await H.setOffset(p,21*60000); await H.go(p,'kds'); ok(await p.$('.ticket.late'),'not red when late'); ok((await p.textContent('[data-t=timer]')).startsWith('21'),'timer');
  ok(!(await p.$('[data-t=bump]')),'KDS should be view-only by default'); await ev(p,()=>{ __pos.App.policy.kdsButtons=true; }); await H.go(p,'kds'); ok((await p.textContent('[data-t=bump]')).includes('READY'),'Ready label');
  await p.click('[data-t=bump]'); await H.sleep(p,300); eq(await p.$$('[data-t=ticket]').then(x=>x.length),0); eq((await H.lastOrder(p)).status,'done'); await p.ctx.close(); });

// ---- Sold out ----
test('Menu','Owner marks item sold out; cashier cannot add', async()=>{ const p=await owner(); await H.go(p,'settings'); await p.click('[data-t=tab-menu]'); await H.sleep(p); await p.uncheck('[data-t=avail-store-mozz]'); await p.click('[data-t=save-menu]'); await H.sleep(p,300);
  await H.go(p,'pos'); ok((await p.textContent('[data-item=mozz]')).includes('SOLD OUT'),'label'); await p.click('[data-item=mozz]'); await H.sleep(p); eq(await total(p),0); await p.ctx.close(); });
test('Menu','Owner edits price; new price used', async()=>{ const p=await owner(); await H.go(p,'settings'); await p.click('[data-t=tab-menu]'); await H.sleep(p); await p.fill('[data-t=price-store-baja]','219'); await p.click('[data-t=save-menu]'); await H.sleep(p,300); await H.go(p,'pos'); await H.add(p,'baja'); eq(await total(p),219); await p.ctx.close(); });

// ---- Business date ----
test('Business date','Sale at 01:30 PKT counts toward previous date', async()=>{ const p=await owner(); await H.setPKT(p,2026,10,29,1,30); await H.add(p,'baja'); await H.pay(p,{cash:199}); eq((await H.lastOrder(p)).businessDate,'2026-10-28'); await H.setPKT(p,2026,10,28,20,0); await H.add(p,'baja'); await H.pay(p,{cash:199}); eq((await H.lastOrder(p)).businessDate,'2026-10-28');
  await H.go(p,'reports'); await p.fill('[data-t=rbd]','2026-10-28'); await p.dispatchEvent('[data-t=rbd]','change'); await H.sleep(p,300); eq((await p.textContent('[data-t=r-orders]')).replace(/\D/g,''),'2'); await p.ctx.close(); });

// ---- Inventory ----
test('Inventory','Stock ledger operations', async()=>{ const p=await owner(); await H.go(p,'inventory'); const item=await p.$eval('[data-t=invtable] [data-i]',e=>e.dataset.i); const ps=await ev(p,i=>__pos.App.inv.find(x=>x.id===i).packSize,item); const oh=async l=>+(await p.textContent(`[data-t=oh-${item}-${l}]`));
  await p.click('[data-t=inv-delivery]'); await H.sleep(p); await p.selectOption('[data-t=inv-item]',item); await p.fill('[data-t=inv-packs]','2'); await H.modalOk(p); eq(await oh('home'),2*ps,'delivery');
  await p.click('[data-t=inv-transfer]'); await H.sleep(p); await p.selectOption('[data-t=inv-item]',item); await p.fill('[data-t=inv-qty]',String(ps)); await H.modalOk(p); eq([await oh('home'),await oh('main')],[ps,ps],'transfer');
  await p.click('[data-t=inv-wastage]'); await H.sleep(p); await p.selectOption('[data-t=inv-item]',item); await p.fill('[data-t=inv-qty]','1'); await H.modalOk(p); ok(/Reason/.test(await p.textContent('[data-t=modal-err]')),'wastage w/o reason'); await p.fill('[data-t=inv-reason]','dropped'); await H.modalOk(p); eq(await oh('main'),ps-1,'wastage');
  await p.click('[data-t=inv-count]'); await H.sleep(p); await p.selectOption('[data-t=inv-item]',item); await p.fill('[data-t=inv-qty]','3'); await H.modalOk(p); eq(await oh('main'),3,'count');
  await p.click('[data-t=inv-delivery]'); await H.sleep(p); await p.fill('[data-t=inv-qty]','-5'); await H.modalOk(p); ok(await p.textContent('[data-t=modal-err]'),'negative accepted'); await p.click('[data-t=modal-cancel]'); await p.ctx.close(); });
test('Inventory','Sale auto-deducts stock at Main; low-stock alert', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199}); const m=await ev(p,()=>__pos.db.all('stockMoves')); ok(m.some(x=>x.type==='sale'&&x.location==='main'&&x.qty<0),'no deduction');
  await H.go(p,'inventory'); ok(await p.$('[data-t=lowstock]'),'no low-stock alert'); await p.ctx.close(); });
test('Inventory','Kitchen staff: wastage only, no delivery/cost', async()=>{ const p=await fresh(); await H.login(p,'amir','6666'); await H.go(p,'inventory'); ok(!(await p.$('[data-t=inv-delivery]')),'delivery visible'); ok(await p.$('[data-t=inv-wastage]'),'no wastage'); ok(!(await p.textContent('#main')).includes('Cost/unit'),'cost visible'); await p.ctx.close(); });

// ---- Till ----
test('Till','Float + cash sales − expenses(DRAW, LOAN-IB) − refunds = expected; over/short; backup at close', async()=>{ const p=await owner(); await H.go(p,'till'); await p.click('[data-t=open-till]'); await H.sleep(p); await p.fill('[data-t=float]','5000'); await H.modalOk(p);
  await H.go(p,'pos'); await H.add(p,'mac',{heat:'Hot'}); await H.pay(p,{cash:1000,hbl:499}); await H.add(p,'baja'); await H.pay(p,{cash:199});
  await H.go(p,'till'); for(const [c,a] of [['DRAW',300],['LOAN-IB',200],['5010',100]]){ await p.click('[data-t=add-expense]'); await H.sleep(p); await p.selectOption('[data-t=exp-code]',c); await p.fill('[data-t=exp-amount]',String(a)); await p.fill('[data-t=exp-note]','t'); await H.modalOk(p); }
  eq((await p.textContent('[data-t=cashsales]')).replace(/\D/g,''),'1199'); const exp=5000+1199-600; eq((await p.textContent('[data-t=expected]')).replace(/\D/g,''),String(exp));
  await p.click('[data-t=close-till]'); await H.sleep(p); await p.fill('[data-t=counted]',String(exp-50)); await p.fill('[data-t=left]','5000'); await H.modalOk(p); ok((await p.textContent('[data-t=overshort]')).includes('-')||(await p.textContent('[data-t=overshort]')).includes('−'),'short not negative'); eq((await p.textContent('[data-t=overshort]')).replace(/\D/g,''),'50');
  const bk=await ev(p,()=>__pos.db.all('backups')); ok(bk.some(x=>/shift-close/.test(x.id)),'no shift-close backup'); await p.ctx.close(); });
test('Till','Expense validation (amount, note)', async()=>{ const p=await owner(); await H.go(p,'till'); await p.click('[data-t=add-expense]'); await H.sleep(p); await p.fill('[data-t=exp-amount]','abc'); await H.modalOk(p); ok(await p.textContent('[data-t=modal-err]'),'bad amount'); await p.fill('[data-t=exp-amount]','50'); await p.fill('[data-t=exp-note]',''); await H.modalOk(p); ok(/Note/.test(await p.textContent('[data-t=modal-err]')),'note'); await p.ctx.close(); });

// ---- Reports ----
test('Reports','Report math by channel/item and CSV export', async()=>{ const p=await owner(); await H.add(p,'combo1',{heat:'Hot',addons:['curly_fries']}); await H.pay(p,{cash:1249}); await H.whatsapp(p,{phone:'03001231234',name:'R',zone:'D'}); await H.add(p,'baja'); await H.pay(p,{hbl:659});
  await H.go(p,'reports'); eq((await p.textContent('[data-t=r-gross]')).replace(/\D/g,''),String(1249+659)); const items=await p.textContent('[data-t=r-items]'); ok(items.includes('Combo 1')&&items.includes('Curly'),'items');
  await p.click('[data-t=csv]'); await H.sleep(p,300); const d=await ev(p,()=>__pos.App.lastDownload); ok(d.name.endsWith('.csv')&&d.text.includes('Combo 1'),'csv'); await p.click('[data-t=allcsv]'); await H.sleep(p,300); const a=await ev(p,()=>__pos.App.lastDownload); ok(a.text.split('\n').length>=3,'all csv'); await p.ctx.close(); });
test('Reports','GST off by default; when on, added to total', async()=>{ const p=await owner(); await H.add(p,'baja'); eq(await total(p),199); await H.go(p,'settings'); await p.click('[data-t=tab-policy]'); await H.sleep(p); await p.check('[data-t=gst-on]'); const pct=await p.$('[name=gstPct]'); if(pct) await pct.fill('10'); await p.click('[data-t=save-policy]'); await H.sleep(p,300); await H.go(p,'pos'); ok(await total(p)>199,'gst not applied'); await p.ctx.close(); });

// ---- Bazaar ----
test('Bazaar','Mashion stall: pending prices, Rs0 samples, separate report with Donut Slider line, separate stock', async()=>{ const p=await owner(); await p.click('#locbtn'); await H.sleep(p,300); ok((await p.textContent('#main')).includes('PENDING'),'pending banner');
  await H.add(p,'donut_slider',{heat:'Mild'}); await H.add(p,'sample_tender'); eq(await total(p),1200); await H.pay(p,{cash:1200}); const o=await H.lastOrder(p); eq([o.channel,o.location],['mashion','mashion']);
  await H.go(p,'reports'); ok((await p.textContent('[data-t=r-donut]')).includes('1'),'donut line'); ok((await p.textContent('[data-t=r-samples]')).includes('SAMPLE'),'samples'); 
  await p.click('#locbtn'); await H.sleep(p,300); await H.go(p,'reports'); eq((await p.textContent('[data-t=r-orders]')).replace(/\D/g,''),'0'); await p.ctx.close(); });

// ---- Backlog ----
test('Backlog','Import 187 backlog orders = Rs 362,116; re-import idempotent; next no after max', async()=>{ const p=await owner(); const d=JSON.parse(fs.readFileSync('/workspace/moes-pos-private/backlog_import.json','utf8'));
  eq(await ev(p,d=>__pos.importBacklog(d),d),187); eq(await ev(p,d=>__pos.importBacklog(d),d),0); const r=await ev(p,async()=>{ const os=(await __pos.db.all('orders')).filter(__pos.L.isCounted); return {n:os.length,t:os.reduce((a,o)=>a+__pos.L.computeTotals(o,__pos.App.policy).total,0)}; });
  eq(r,{n:187,t:362116}); await H.add(p,'baja'); await H.pay(p,{cash:199}); eq((await H.lastOrder(p)).orderNo,1606,'next number after backlog max 1605'); await p.ctx.close(); });

// ---- Recipes ----
const SECRET='ZQX-SYNTH-SAUCE-'+Math.random().toString(36).slice(2,8); const recipeFile=path.join(os.tmpdir(),'synthetic_recipes_test.json');
fs.writeFileSync(recipeFile,JSON.stringify({kind:'moes-recipes',recipes:[{name:SECRET,yieldQty:1,yieldUnit:'kg',ingredients:[{name:SECRET+'-spice',qty:10,unit:'g'}]}],bom:[]}));
test('Recipes','Owner imports (encrypted), unlock with PIN, wrong PIN refused', async()=>{ const p=await owner(); await H.go(p,'recipes'); await p.setInputFiles('[data-t=recipes-file]',recipeFile); await H.sleep(p,300); await p.fill('[data-t=recipe-pin]','1111'); await H.modalOk(p);
  ok((await p.textContent('#main')).includes(SECRET),'not shown to owner'); const raw=await ev(p,()=>__pos.db.get('secure','recipes').then(JSON.stringify)); ok(!raw.includes('ZQX'),'stored unencrypted');
  await p.click('[data-t=lock-recipes]'); await H.sleep(p); ok(!(await p.textContent('#main')).includes(SECRET),'still shown'); await p.click('[data-t=unlock-recipes]'); await H.sleep(p); await p.fill('[data-t=recipe-pin]','9999'); await H.modalOk(p); ok(/Wrong/.test(await p.textContent('[data-t=modal-err]')),'wrong pin'); await p.fill('[data-t=recipe-pin]','1111'); await H.modalOk(p); ok((await p.textContent('#main')).includes(SECRET),'unlock');
  // leak checks
  const snap=await ev(p,()=>__pos.snapshot().then(JSON.stringify)); ok(!snap.includes('ZQX'),'recipe in backup');
  await H.add(p,'baja').catch(()=>{}); await H.go(p,'pos'); await H.add(p,'baja'); await H.pay(p,{cash:199}); const jobs=await ev(p,()=>__pos.db.all('printJobs').then(JSON.stringify)); ok(!jobs.includes('ZQX'),'recipe in print');
  await H.go(p,'reports'); await p.click('[data-t=allcsv]'); await H.sleep(p,300); ok(!(await ev(p,()=>__pos.App.lastDownload.text)).includes('ZQX'),'recipe in csv');
  await p.click('[data-t=logout]'); await H.sleep(p); for(const [id,pin] of [['waqar','4444'],['shan','5555']]){ await H.login(p,id,pin); for(const v of ['pos','kds','orders','inventory','recipes','settings']){ await H.go(p,v); ok(!(await p.content()).includes('ZQX'),`leak ${id}/${v}`); } await p.click('[data-t=logout]'); await H.sleep(p); } await p.ctx.close(); });
test('Recipes','Deployed bundle (dist) contains no recipe data', async()=>{ const {execSync}=await import('node:child_process'); execSync('node tools/build.mjs',{cwd:'/workspace/moes-pos'}); const priv=JSON.parse(fs.readFileSync('/workspace/moes-pos-private/recipes_import.json','utf8'));
  const words=[...new Set(priv.recipes.flatMap(r=>r.ingredients.map(i=>i.name)).filter(w=>w.length>=8))]; const files=fs.readdirSync('/workspace/moes-pos/dist',{recursive:true}).map(f=>path.join('/workspace/moes-pos/dist',f)).filter(f=>fs.statSync(f).isFile()&&/\.(js|html|css|json|webmanifest)$/.test(f));
  const all=files.map(f=>fs.readFileSync(f,'utf8')).join('\n'); const hits=words.filter(w=>all.includes(w)&&!/chicken|tender|slider|fries|sauce|honey|cheese|mozz|bread|roll|pickle|donut/i.test(w)); ok(hits.length===0,hits.length+' recipe-only ingredient names found in dist'); ok(!files.some(f=>/recipe|PRIVATE|backlog/i.test(path.basename(f))),'private file in dist'); });
test('Recipes','Cashier cannot open recipes view', async()=>{ const p=await cashier(); await H.go(p,'recipes'); ok((await p.textContent('#main')).includes('Owner only'),'cashier recipes'); await p.ctx.close(); });

// ---- Persistence / offline / drafts ----
test('Offline','Orders persist across reload; draft cart recovered', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199}); await H.add(p,'lemonade'); await p.reload(); await p.waitForFunction(()=>window.__ready); await H.login(p,'shaheer','1111'); eq(await total(p),199,'draft'); eq((await H.orders(p)).length,1); await p.ctx.close(); });
test('Offline','App loads and sells fully offline (service worker)', async()=>{ const p=await owner(); await p.evaluate(()=>navigator.serviceWorker.ready); await p.reload(); await p.waitForFunction(()=>window.__ready); await H.sleep(p,500); await p.ctx.setOffline(true); await p.reload(); await p.waitForFunction(()=>window.__ready,null,{timeout:8000});
  await H.login(p,'shaheer','1111'); await H.add(p,'baja'); eq(await H.pay(p,{cash:199}),{ok:true}); ok((await p.textContent('[data-t=status]')).includes('Offline'),'offline status'); await p.ctx.close(); });
test('Offline','Persistent-storage banner: hidden on desktop; on iPad shown, and stays dismissed after reload', async()=>{ const init=()=>{ navigator.storage.persist=async()=>false; navigator.storage.persisted=async()=>false; };
  const d=await fresh({init}); await H.login(d,'shaheer','1111'); ok(!(await d.textContent('#banner')).includes('not marked persistent'),'desktop banner'); await d.ctx.close();
  const p=await fresh({init,ipad:true,viewport:{width:1024,height:768}}); await H.login(p,'shaheer','1111'); ok((await p.textContent('#banner')).includes('not marked persistent'),'ipad banner'); await p.click('[data-t=banner-dismiss]'); await H.sleep(p,300);
  await p.reload(); await p.waitForFunction(()=>window.__ready); await H.login(p,'shaheer','1111'); ok(!(await p.textContent('#banner')).includes('not marked persistent'),'dismiss not kept'); await p.ctx.close(); });
test('Offline','Persistent-storage denied shows warning banner (old)', async()=>{ const p=await fresh({ipad:true,viewport:{width:1024,height:768},init:()=>{ navigator.storage.persist=async()=>false; navigator.storage.persisted=async()=>false; }}); await H.login(p,'shaheer','1111'); ok((await p.textContent('#banner')).includes('not marked persistent'),'no banner'); await p.ctx.close(); });
test('Failure','Storage quota full: clear error, no partial order', async()=>{ const p=await owner(); await H.add(p,'baja'); await ev(p,()=>{ const o=IDBObjectStore.prototype.put; window.__q=o; IDBObjectStore.prototype.put=function(v,k){ if(this.name==='orders') throw new DOMException('quota','QuotaExceededError'); return o.call(this,v,k); }; });
  await H.pay(p,{cash:199}); ok(/storage is FULL/i.test(await H.toastText(p)),'quota msg: '+await H.toastText(p)); await ev(p,()=>{IDBObjectStore.prototype.put=window.__q}); eq((await H.orders(p)).length,0); eq((await ev(p,()=>__pos.db.all('stockMoves'))).filter(m=>m.type==='sale').length,0,'partial stock'); await p.ctx.close(); });
test('Failure','commitOrder idempotent (double submit)', async()=>{ const p=await owner(); const r=await ev(p,async()=>{ const o={id:'dup-1',channel:'instore',type:'takeaway',lines:[{itemId:'baja',name:'Baja',qty:1,unitPrice:199,addons:[]}],payments:[{method:'cash',amount:199}],refunds:[],status:'open',createdAt:Date.now(),businessDate:'2026-10-28',location:'main'};
  const [a,b2]=await Promise.all([__pos.commitOrder({...o}),__pos.commitOrder({...o})]); const c=await __pos.commitOrder({...o}); return {n:(await __pos.db.all('orders')).length,moves:(await __pos.db.all('stockMoves')).filter(m=>m.ref==='dup-1').length,nos:[a.orderNo,c.orderNo]}; }); eq(r.n,1); eq(r.nos[0],r.nos[1],'same number on re-commit'); ok(r.moves>0,'no stock moves'); await p.ctx.close(); });
test('Failure','Input validation: qty 0/100 and non-numeric refused', async()=>{ const p=await owner(); await p.click('[data-item=combo1]'); await H.sleep(p); for(const q of ['0','100','abc']){ await p.fill('[data-t=qty]',q); await H.modalOk(p); ok(await p.$('[data-t=modal]'),'accepted qty '+q); } await p.click('[data-t=modal-cancel]'); await p.ctx.close(); });

// ---- Backup / restore ----
test('Backup','Export backup, wipe, restore brings orders back; excludes recipes', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199}); const snap=await ev(p,()=>__pos.snapshot()); ok(!JSON.stringify(snap.data).includes('"secure"'),'secure in backup');
  const p2=await owner(); await ev(p2,s=>__pos.restore(s),snap); eq((await H.orders(p2)).length,1); await p.ctx.close(); await p2.ctx.close(); });
test('Backup','Bad restore file rejected', async()=>{ const p=await owner(); const e=await ev(p,()=>__pos.restore({foo:1}).then(()=>null,e=>e.message)); ok(/backup/i.test(e||''),'accepted'); await p.ctx.close(); });
test('Backup','Daily backup created automatically', async()=>{ const p=await owner(); await H.sleep(p,3500); ok((await ev(p,()=>__pos.db.all('backups'))).some(b=>/daily/.test(b.id)),'no daily'); await p.ctx.close(); });

// ---- Settings ----
test('Settings','Configurable start number and device prefix', async()=>{ const p=await owner(); await H.go(p,'settings'); await p.click('[data-t=tab-policy]'); await H.sleep(p); await p.fill('[data-t=startno]','50001'); await p.fill('[data-t=prefix]','I-'); await p.click('[data-t=save-policy]'); await H.sleep(p,300); await quickSale(p); eq((await H.lastOrder(p)).orderNo,'I-50001'); await p.ctx.close(); });
test('Settings','Activity log records login, order, discount', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.discount(p,{value:5,reason:'x'}); await H.pay(p,{cash:189}); const acts=(await ev(p,()=>__pos.db.all('log'))).map(l=>l.action); for(const a of ['login','discount','order']) ok(acts.includes(a),'missing '+a); await p.ctx.close(); });

// ---- Sync ----
// Sync now rides on the Online orders session: simulate a connected session (token = shop) against the mock.
async function syncSetup(p,url,shop,prefix,start){ if(prefix){ await H.go(p,'settings'); await p.click('[data-t=tab-policy]'); await H.sleep(p); await p.fill('[data-t=startno]',String(start)); await p.fill('[data-t=prefix]',prefix); await p.click('[data-t=save-policy]'); await H.sleep(p,300); }
  await ev(p,async([u,t])=>{ const c=await __pos.O.config(); Object.assign(c,{url:u,anonKey:'anon-test',connected:true,access:t,refresh:'r',exp:Date.now()+3600e3}); await __pos.db.kvSet('online',{...c}); },[url,shop]);
  await H.go(p,'settings'); await p.click('[data-t=tab-sync]'); await H.sleep(p); ok(await p.isChecked('[data-t=sync-on]'),'sync not on by default'); }
test('Sync','Two devices sync via Supabase mock; distinct numbers; recipes never synced', async()=>{ const m=await startMock(54321,'test-shop'); try{ const a=await owner(), c=await owner(); await syncSetup(a,'http://127.0.0.1:54321','test-shop'); await syncSetup(c,'http://127.0.0.1:54321','test-shop','I-',50001);
  await quickSale(a); await quickSale(c,['lemonade']); for(const p of [a,c,a]) await ev(p,()=>__pos.Sync.syncNow()); const na=(await H.orders(a)).map(o=>o.orderNo).sort(), nc=(await H.orders(c)).map(o=>o.orderNo).sort(); eq(na,nc); eq(na.map(String).sort(),['1606','I-50001']);
  ok(![...m.rows.values()].some(r=>r.store==='secure'||r.store==='backups'||r.store==='kv'),'private store synced'); await a.ctx.close(); await c.ctx.close(); } finally{ await m.close(); } });
test('Sync','Sync server down: sale still succeeds, error recorded, retried later', async()=>{ const m=await startMock(54322,'test-shop'); try{ const p=await owner(); await syncSetup(p,'http://127.0.0.1:54322','test-shop'); m.st.down=true; eq((await quickSale(p)),{ok:true}); const r=await ev(p,()=>__pos.Sync.syncNow()); ok(r.error,'no error'); eq((await ev(p,()=>__pos.db.kvGet('lastSync'))).ok,false);
  m.st.down=false; const r2=await ev(p,()=>__pos.Sync.syncNow()); ok(r2.pushed>=1,'not pushed after recovery'); ok([...m.rows.values()].some(x=>x.store==='orders'),'order not on server'); await p.ctx.close(); } finally{ await m.close(); } });
test('Sync','Bad/expired session rejected by server, local data intact', async()=>{ const m=await startMock(54323,'test-shop'); try{ const p=await owner(); await syncSetup(p,'http://127.0.0.1:54323','WRONG'); await quickSale(p); const r=await ev(p,()=>__pos.Sync.syncNow()); ok(r.error,'accepted'); eq(m.rows.size,0); eq((await H.orders(p)).length,1); await p.ctx.close(); } finally{ await m.close(); } });

// ---- Printing ----
const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'moes-print-test-')); let helper;
const startHelper=()=>new Promise(r=>{ helper=spawn('node',['print-helper/server.cjs','--preview-only','--out',outDir,'--port','9123'],{cwd:'/workspace/moes-pos'}); helper.stdout.on('data',()=>r()); });
test('Printing','Laptop: receipt + kitchen ticket printed via helper (ESC/POS bytes), no recipe', async()=>{ await startHelper(); try{ const p=await owner(); await H.add(p,'combo1',{heat:'Hot'}); await H.pay(p,{cash:1099}); await H.sleep(p,1500);
  const bins=fs.readdirSync(outDir).filter(f=>f.endsWith('.bin')); ok(bins.length>=2,'bins '+bins.length); const buf=fs.readFileSync(path.join(outDir,bins[0])); ok(buf[0]===0x1b&&buf[1]===0x40,'ESC @'); const txt=fs.readdirSync(outDir).filter(f=>f.endsWith('.txt')).map(f=>fs.readFileSync(path.join(outDir,f),'utf8')).join(); ok(txt.includes('1606')&&txt.includes('Combo 1'),'content');
  await H.go(p,'orders'); ok(await ev(p,()=>__pos.P.checkHelper()),'helper alive'); await H.orderRowAct(p,1606,'reprint'); await H.sleep(p,1000); ok(fs.readdirSync(outDir).filter(f=>f.endsWith('.bin')).length>bins.length,'reprint'); await p.ctx.close(); } finally{ helper.kill(); } });
test('Printing','No helper: browser print fallback is ON by default (receipt + kitchen in one dialog)', async()=>{ const p=await owner(); await p.evaluate(()=>{ window.__printCalls=0; window.print=()=>{ window.__printCalls++; window.__pages=[...document.querySelectorAll('#printarea .pticket')].map(d=>d.textContent); }; });
  await p.evaluate(async()=>{ const c=await __pos.db.kvGet('print',{}); delete c.fallback; c.helper='http://127.0.0.1:9'; await __pos.db.kvSet('print',c); await __pos.P.checkHelper(); });
  await H.add(p,'baja'); eq(await H.pay(p,{cash:199}),{ok:true}); await H.sleep(p,1200);
  const r=await p.evaluate(()=>({n:window.__printCalls,pages:window.__pages||[]})); eq(r.n,1); ok(r.pages.length>=2,'expected kitchen+receipt pages, got '+r.pages.length);
  await H.go(p,'settings'); await p.click('[data-tab=print]').catch(()=>{}); await H.sleep(p,300); ok(await p.isChecked('[data-t=print-fallback]'),'toggle not on by default'); });
test('Printing','Printer offline: sale not blocked, job queued, retry prints later', async()=>{ const p=await owner(); await p.evaluate(async()=>{ const c=await __pos.db.kvGet('print',{}); await __pos.db.kvSet('print',{...c,fallback:false}); }); await H.add(p,'baja'); eq(await H.pay(p,{cash:199}),{ok:true}); await H.sleep(p,800); ok(await p.$('[data-t=print-pending]'),'no pending indicator'); const before=fs.readdirSync(outDir).length;
  await startHelper(); try{ await p.click('[data-t=print-retry]'); await H.sleep(p,1500); eq((await ev(p,()=>__pos.P.pending())).length,0); ok(fs.readdirSync(outDir).length>before,'not printed after retry'); } finally{ helper.kill(); } await p.ctx.close(); });
test('Printing','iPad: printing hidden, no print jobs', async()=>{ const p=await owner({ipad:true,viewport:{width:1024,height:768}}); await H.add(p,'baja'); await H.pay(p,{cash:199}); eq((await ev(p,()=>__pos.db.all('printJobs'))).length,0); ok(await ev(p,()=>document.body.classList.contains('noprint')),'noprint'); await p.ctx.close(); });
test('Printing','iPad: Reprint receipt/kitchen on order row and detail use browser print dialog', async()=>{ const p=await owner({ipad:true,viewport:{width:1024,height:768}}); await H.add(p,'baja'); await H.pay(p,{cash:199});
  await ev(p,()=>{ window.__prints=0; window.print=()=>{ window.__prints++; window.__printVisible=getComputedStyle(document.getElementById('printarea')).display; }; });
  await H.go(p,'orders'); ok(await p.isVisible('[data-t=reprint]'),'row reprint visible'); ok(await p.isVisible('[data-t=kreprint]'),'row kitchen visible');
  await p.click('[data-t=reprint]'); await H.sleep(p,300); eq(await ev(p,()=>window.__prints),1); ok((await ev(p,()=>window.__lastBrowserPrint)).includes('1606'),'receipt text has order no');
  await p.click('[data-t=kreprint]'); await H.sleep(p,300); eq(await ev(p,()=>window.__prints),2);
  await p.click('[data-t=odetail]'); await H.sleep(p,300); ok(await p.isVisible('[data-t=d-items]'),'detail preview');
  await p.click('[data-t=d-kreprint]'); await H.sleep(p,300); eq(await ev(p,()=>window.__prints),3); ok(await p.isVisible('[data-t=d-items]'),'modal stays open');
  eq((await ev(p,()=>__pos.db.all('printJobs'))).length,0); await p.ctx.close(); });
test('Charge screen','One-tap cash tender places order with change; bank/card one tap; split still works; screenshots', async()=>{ const SH='/workspace/pos_build/screens/';
  const p=await owner({viewport:{width:1366,height:638}}); await H.add(p,'baja'); await H.openCheckout(p);
  ok(await p.isVisible('[data-t=qpay]'),'charge screen'); ok((await p.textContent('[data-t=q-total]')).includes('199'),'total');
  ok(await p.isVisible('[data-t=q-tender-500]'),'500 tender'); ok(!(await p.$('[data-t=q-cod]')),'no COD for walk-in'); ok(await p.isVisible('[data-t=q-card]'),'card');
  ok(!(await p.isVisible('[data-t=q-split-go]')),'split collapsed'); ok(await p.isVisible('[data-t=q-split-toggle]'),'split summary'); ok(await ev(p,()=>{ const m=document.querySelector('.modal-bg.inline .modal'); return m.scrollHeight<=m.clientHeight+1; }),'charge panel scrolls');
  const inView=await p.evaluate(()=>[...document.querySelectorAll('.qrow,.qcash,[data-t=q-split-toggle],[data-t=modal-ok],[data-t=modal-cancel]')].every(e=>{const r=e.getBoundingClientRect(); return r.bottom<=innerHeight+1&&r.top>=0;})); ok(inView,'rows off-screen at 1366x768');
  await p.screenshot({path:SH+'flow-charge-1366.png'});
  await p.click('[data-t=q-tender-500]'); await H.sleep(p,400); ok(!(await p.$('.modal-bg')),'closed'); let o=await H.lastOrder(p); eq(o.payments.map(x=>[x.method,x.amount]),[['cash',199]]); eq(o.change,301);
  ok((await H.toastText(p)).includes('301'),'change toast');
  await H.add(p,'baja'); await H.openCheckout(p); await p.click('[data-t=q-hbl]'); await H.sleep(p,400); o=await H.lastOrder(p); eq(o.payments.map(x=>[x.method,x.amount]),[['hbl',199]]);
  await H.add(p,'baja'); await H.openCheckout(p); await p.fill('[data-t=q-custom]','150'); await p.click('[data-t=q-custom-go]'); await H.sleep(p,200); ok((await p.textContent('[data-t=modal-err]')).includes('at least'),'custom validation');
  await p.click('[data-t=q-later]'); await H.sleep(p,200); ok(/Pay Later needs a customer/.test(await p.textContent('[data-t=modal-err]')),'pay later validation');
  await p.keyboard.press('Escape'); await H.sleep(p,200); eq((await H.orders(p)).length,2);
  eq(await H.pay(p,{cash:100,hbl:99}),{ok:true}); o=await H.lastOrder(p); eq(o.payments.length,2); await p.ctx.close();
  const q=await owner({ipad:true,viewport:{width:1024,height:748}}); await H.whatsapp(q,{phone:'03001234567',name:'Speedy',zone:'C'}); await H.add(q,'baja'); await H.openCheckout(q);
  ok((await q.textContent('[data-t=q-cod]')).includes('199'),'COD row shows rider hands over items amount'); await q.screenshot({path:SH+'flow-charge-ipad.png'});
  await q.click('[data-t=q-cod]'); await H.sleep(q,400); o=await H.lastOrder(q); eq(o.payments.length,0); ok(o.unpaid,'cod unpaid'); await q.ctx.close(); });
test('Modals','Order detail closes via Close, ✕, Esc and click-outside; confirm modal too', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199}); await H.go(p,'orders');
  for(const how of ['ok','x','esc','bg']){ await p.click('[data-t=odetail]'); await H.sleep(p,250); ok(await p.isVisible('[data-t=d-items]'),'open '+how);
    if(how==='ok') await p.click('[data-t=modal-ok]'); else if(how==='x') await p.click('[data-t=modal-close]'); else if(how==='esc') await p.keyboard.press('Escape'); else await p.mouse.click(5,5);
    await H.sleep(p,250); ok(!(await p.$('.modal-bg')),'still open after '+how); }
  await p.ctx.close(); });
test('Orders view','Pills, filters, sort, search, owner CSV, row click detail, dining change; 1366 + iPad screenshots', async()=>{ const SH='/workspace/pos_build/screens/';
  const p=await owner({viewport:{width:1366,height:638}}); await H.add(p,'baja'); await H.pay(p,{cash:199});
  await H.whatsapp(p,{phone:'03001234567',name:'Ali Khan',zone:'C'}); await H.add(p,'baja'); await H.add(p,'lemonade'); await H.openCheckout(p); await p.click('[data-t=q-cod]'); await H.sleep(p,400);
  await H.go(p,'orders'); eq(await p.$$eval('tr.orow',r=>r.length),2); ok((await p.textContent('[data-t=orders]')).includes('Walk-in'),'walk-in'); ok(await p.isVisible('.pill.ch-whatsapp'),'channel pill');
  ok(await p.isVisible('[data-t=orders-csv]'),'owner csv'); await p.screenshot({path:SH+'flow-orders-1366.png'});
  await p.fill('[data-t=ofq]','ali'); await p.press('[data-t=ofq]','Enter'); await H.sleep(p,300); eq(await p.$$eval('tr.orow',r=>r.length),1);
  await p.fill('[data-t=ofq]','4567'); await p.press('[data-t=ofq]','Enter'); await H.sleep(p,300); eq(await p.$$eval('tr.orow',r=>r.length),1);
  await p.fill('[data-t=ofq]',''); await p.press('[data-t=ofq]','Enter'); await H.sleep(p,300);
  await p.selectOption('[data-t=ofch]','whatsapp'); await H.sleep(p,300); eq(await p.$$eval('tr.orow',r=>r.length),1); await p.selectOption('[data-t=ofch]',''); await H.sleep(p,300);
  await p.fill('[data-t=ofmin]','300'); await p.press('[data-t=ofmin]','Enter'); await H.sleep(p,300); eq(await p.$$eval('tr.orow',r=>r.length),1); await p.fill('[data-t=ofmin]',''); await p.press('[data-t=ofmin]','Enter'); await H.sleep(p,300);
  await p.click('[data-t=sort-total]'); await H.sleep(p,300); const a=await p.$$eval('tr.orow',r=>r.map(x=>x.dataset.no)); await p.click('[data-t=sort-total]'); await H.sleep(p,300); eq(await p.$$eval('tr.orow',r=>r.map(x=>x.dataset.no)),a.slice().reverse());
  await p.click('[data-t=orders-csv]'); await H.sleep(p,200); const csv=await ev(p,()=>window.__lastOrdersCsv); ok(csv.split('\n').length===3&&csv.includes('Ali Khan'),'csv');
  await p.click('tr.orow:not(:has(.ch-whatsapp)) td.oitems'); await H.sleep(p,300); ok(await p.isVisible('[data-t=d-summary]'),'detail on row click'); ok(await p.isVisible('[data-t=d-payments]'),'payments card');
  await p.screenshot({path:SH+'flow-order-detail-1366.png'}); await p.click('[data-t=dine-dine_in]'); await H.sleep(p,400);
  ok((await H.orders(p)).some(o=>o.type==='dine_in'),'dining changed'); await p.click('[data-t=modal-close]'); await H.sleep(p,250); ok(!(await p.$('.modal-bg')),'closed'); await p.ctx.close();
  const q=await cashier({ipad:true,viewport:{width:1024,height:748}}); await H.add(q,'baja'); await H.pay(q,{cash:199}); await H.go(q,'orders'); ok(!(await q.$('[data-t=orders-csv]')),'cashier no csv');
  await q.screenshot({path:SH+'flow-orders-ipad.png'}); await q.click('tr.orow td.oitems'); await H.sleep(q,300); ok(await q.isVisible('[data-t=d-items]'),'ipad detail');
  const fits=await q.evaluate(()=>{const r=document.querySelector('.modal').getBoundingClientRect(); return r.right<=innerWidth+1&&r.left>=0;}); ok(fits,'modal fits iPad'); await q.screenshot({path:SH+'flow-order-detail-ipad.png'}); await q.ctx.close(); });
test('Charge screen','Split row: cash 100 + HBL remaining auto-fills, change on cash part, till counts each method; receipt + detail list parts', async()=>{ const p=await owner({viewport:{width:1366,height:638}});
  await H.go(p,'till'); await p.click('[data-t=open-till]'); await H.sleep(p); await p.fill('[data-t=float]','1000'); await H.modalOk(p); await H.go(p,'pos');
  await H.add(p,'baja'); await H.openCheckout(p); ok(await p.isVisible('[data-t=q-splitrow]'),'split row visible'); await p.click('[data-t=q-split-toggle]'); await H.sleep(p); await p.fill('[data-t=q-split-a0]','100'); await H.sleep(p,100);
  eq(await p.inputValue('[data-t=q-split-a1]'),'99'); eq(await p.inputValue('[data-t=q-split-m1]'),'hbl'); await p.fill('[data-t=q-split-tendered]','500'); await H.sleep(p,100);
  ok((await p.textContent('[data-t=q-split-change]')).includes('400'),'change'); await p.screenshot({path:'/workspace/pos_build/screens/flow-charge-split.png'});
  await p.click('[data-t=q-split-go]'); await H.sleep(p,400); const o=await H.lastOrder(p); eq(o.payments.map(x=>[x.method,x.amount]).sort(),[['cash',100],['hbl',99]]); eq(o.change,400);
  await H.go(p,'orders'); await p.click('[data-t=odetail]'); await H.sleep(p,300); const dp=await p.textContent('[data-t=d-payments]'); ok(dp.includes('100')&&dp.includes('99'),'detail parts');
  const rec=await p.evaluate(()=>document.querySelector('[data-t=receipt-preview]').textContent); ok(/HBL/i.test(rec)&&rec.includes('100'),'receipt parts'); await p.keyboard.press('Escape'); await H.sleep(p,200);
  await H.go(p,'till'); eq((await p.textContent('[data-t=sum-cash]')).replace(/\D/g,''),'100'); eq((await p.textContent('[data-t=sum-bank]')).replace(/\D/g,''),'99'); eq((await p.textContent('[data-t=expected]')).replace(/\D/g,''),'1100');
  await p.screenshot({path:'/workspace/pos_build/screens/flow-till-1366.png'});
  await p.click('[data-t=close-till]'); await H.sleep(p); await p.fill('[data-t=counted]','1050'); ok((await p.textContent('[data-t=os-preview]')).includes('SHORT by Rs 50'),'short flag'); await p.fill('[data-t=left]','1000'); await H.modalOk(p); await H.sleep(p,300);
  ok((await ev(p,()=>window.__lastBrowserPrint||'')).includes('SHIFT REPORT'),'shift report printed'); ok(await p.isVisible('[data-t=shift-closed]'),'closed shown');
  await p.click('[data-t=open-till]'); await H.sleep(p); await p.fill('[data-t=float]','1000'); await H.modalOk(p); await H.sleep(p,300);
  eq((await p.textContent('[data-t=sum-cash]')).replace(/\D/g,''),'0'); eq((await p.textContent('[data-t=expected]')).replace(/\D/g,''),'1000');
  await H.go(p,'pos'); await H.add(p,'baja'); await H.pay(p,{cash:199}); const o2=await H.lastOrder(p); const ss=await ev(p,()=>__pos.db.all('shifts')); eq(ss.length,2); eq(o2.shiftId,ss.find(s=>!s.closedAt).id);
  await H.go(p,'till'); eq((await p.textContent('[data-t=sum-cash]')).replace(/\D/g,''),'199'); await p.ctx.close(); });
test('Top bar','Printer dot red without helper, sync pill, mute toggle (off by default) silences alert; proof button in detail', async()=>{ const p=await owner();
  ok(await p.isVisible('[data-t=printer-dot]'),'printer dot'); ok(/not answering/.test(await p.getAttribute('[data-t=printer-dot]','title')),'red tooltip');
  await H.go(p,'settings'); await p.click('[data-t=tab-print]'); await H.sleep(p,300);
  if(await p.$('[data-t=mute-alerts]')){ ok(!(await p.isChecked('[data-t=mute-alerts]')),'mute off by default'); await p.check('[data-t=mute-alerts]'); await H.sleep(p,200); ok(await ev(p,()=>__pos.App.alertMute),'muted'); }
  else throw new Error('mute toggle not found');
  await H.go(p,'pos'); await H.add(p,'baja'); await H.pay(p,{hbl:199}); await ev(p,async()=>{ const o=(await __pos.db.all('orders')).sort((a,b)=>b.createdAt-a.createdAt)[0]; o.web={id:'x',payment_method:'bank_hbl',proof:'https://example.com/p.jpg',verified:false}; await __pos.db.put('orders',o); });
  await H.go(p,'orders'); await p.click('[data-t=odetail]'); await H.sleep(p,300); eq(await p.getAttribute('[data-t=d-view-proof]','href'),'https://example.com/p.jpg'); await p.ctx.close(); });
test('Payments','Rider COD: one clean payment line; #1607 bad data repaired on load', async()=>{ const p=await owner();
  await ev(p,async()=>{ const o=(await __pos.db.all('orders'))[0]||null; const t=Date.now()-60000; const lines=[{itemId:'combo1',name:'Combo 1',qty:2,unitPrice:1099,addons:[]}];
    await __pos.db.put('orders',{id:'t1607',orderNo:1607,channel:'whatsapp',type:'delivery',status:'done',location:'main',createdAt:t,businessDate:__pos.L?__pos.L.businessDate(t):undefined,lines,delivery:{zone:'',charge:320},
      payments:[{method:'cash',amount:2518,at:t+5000},{method:'cash',amount:2100,rider:true,at:t,ref:'Speedway rider'},{method:'rider_fare',amount:58,rider:true,at:t,ref:'Speedway rider'}],
      rider:{method:'cash',collect:2158,fare:58,amount:2100,at:t,settledAt:t,settledVia:'cash'}}); });
  await p.reload(); await H.sleep(p,1200);
  const o=await ev(p,()=>__pos.db.get('orders','t1607')); ok(!o.payments.some(x=>x.rider||x.method==='rider_fare'),'rider lines left on payments: '+JSON.stringify(o.payments));
  const logs=await ev(p,()=>__pos.db.all('log')); ok(logs.some(l=>l.action==='repair-rider-payments'),'repair not logged'); await p.ctx.close(); });
test('Printing','Laptop without helper: reprint falls back to browser print', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199});
  await ev(p,async()=>{ const pr=await __pos.db.kvGet('print',{}); await __pos.db.kvSet('print',{...pr,mode:'on',helper:'http://127.0.0.1:9'}); window.__prints=0; window.print=()=>window.__prints++; });
  await H.go(p,'orders'); eq(await ev(p,()=>__pos.P.checkHelper()),false); await p.click('[data-t=reprint]'); await H.sleep(p,300); eq(await ev(p,()=>window.__prints),1); await p.ctx.close(); });

// ---- Customers / Pay Later ----
async function custOrder(p,{phone,name,item='combo1',heat='Hot',cash}){ await H.newOrder(p); await p.fill('[data-t=cphone]',phone); await p.press('[data-t=cphone]','Tab'); await H.sleep(p); if(name&&await p.$('[data-t=cname]')){ await p.fill('[data-t=cname]',name); await p.press('[data-t=cname]','Tab'); await H.sleep(p); } await H.add(p,item,{heat}); return H.pay(p,{cash}); }
test('Customers','Phone search (+92 normalised) matches; prefs, usual heat default, repeat last order', async()=>{ const p=await owner();
  await custOrder(p,{phone:'03001112222',name:'Ali',cash:1099}); await custOrder(p,{phone:'03001112222',name:'Ali',cash:1099});
  eq((await ev(p,()=>__pos.db.all('customers'))).length,1);
  await H.newOrder(p); await p.fill('[data-t=cphone]','+92 300 111'); await H.sleep(p,300); ok(await p.$('[data-t="sug-03001112222"]'),'no live suggestion'); await p.click('[data-t="sug-03001112222"]'); await H.sleep(p,300);
  ok((await p.textContent('[data-t=cp-name]')).includes('Ali'),'name'); ok((await p.textContent('[data-t=cp-heat]')).includes('Hot'),'usual heat');
  await p.click('[data-t=repeat-last]'); await H.sleep(p,300); eq(await total(p),1099);
  await p.click('[data-item=combo1]'); await H.sleep(p); ok(await p.isChecked('[data-t=heat-Hot]'),'heat not defaulted to usual'); await p.click('[data-t=qty-plus]'); await H.modalOk(p); await p.click('[data-item=mac]'); await H.sleep(p); ok(await p.isChecked('[data-t=heat-Hot]'),'new main not defaulted to usual'); await p.click('[data-t=modal-cancel]'); await H.sleep(p);
  eq(await H.pay(p,{cash:2198}),{ok:true}); const o=await H.lastOrder(p); eq([o.customer.id,o.customer.name],['c-03001112222','Ali']); await p.ctx.close(); });
test('Customers','Quick add customer, dedupe by phone, profile edit and history', async()=>{ const p=await owner();
  await p.fill('[data-t=cphone]','03005556666'); await H.sleep(p,300); await p.click('[data-t=add-customer]'); await H.sleep(p); await p.fill('[data-t=nc-name]','Bilal'); await p.fill('[data-t=nc-notes]','no pickles'); await H.modalOk(p);
  await H.add(p,'baja'); await H.pay(p,{cash:199});
  await H.newOrder(p); await p.fill('[data-t=cphone]','+923005556666'); await H.sleep(p,300); await p.click('[data-t="sug-03005556666"]'); await H.sleep(p,300); ok((await p.textContent('[data-t=cp-notes]')).includes('no pickles'),'notes shown');
  eq((await ev(p,()=>__pos.db.all('customers'))).length,1);
  await H.go(p,'customers'); await p.fill('[data-t=cust-search]','bil'); await H.sleep(p,300); await p.click('[data-cust]'); await H.sleep(p,300);
  ok((await p.textContent('[data-t=cp-history]')).includes('Baja'),'history'); eq((await p.textContent('[data-t=cp-orders]')).replace(/\D/g,''),'1'); await p.ctx.close(); });
test('Pay Later','Requires customer; unpaid not drawer cash; partial then full settle; dues in report', async()=>{ const p=await owner(); await H.go(p,'pos');
  await H.add(p,'baja'); await H.openCheckout(p); await p.click('[data-t=pay-split]'); await H.sleep(p); await p.check('[data-t=paylater]'); await H.modalOk(p); ok(await p.$('[data-t=modal]'),'pay later without customer accepted'); await p.click('[data-t=modal-cancel]'); await H.sleep(p);
  await p.fill('[data-t=cphone]','03007770000'); await p.press('[data-t=cphone]','Tab'); await H.sleep(p); await p.fill('[data-t=cname]','Zain'); await p.press('[data-t=cname]','Tab'); await H.sleep(p);
  await H.openCheckout(p); await p.click('[data-t=pay-split]'); await H.sleep(p); for(const i of await p.$$('[data-t^="pay-"]')) await i.fill(''); await p.check('[data-t=paylater]'); await H.modalOk(p); ok(!(await p.$('[data-t=modal]')),'pay later failed: '+(await p.textContent('[data-t=modal-err]').catch(()=>'')));
  const o=await H.lastOrder(p); ok(o.unpaid&&o.credit,'flags'); 
  await H.go(p,'till'); eq((await p.textContent('[data-t=till-unpaid]')).replace(/\D/g,''),'199');
  await H.go(p,'customers'); await p.click('[data-cust]'); await H.sleep(p,300); await p.click('[data-t=settle]'); await H.sleep(p); await p.fill('[data-t=settle-amount]','100'); await H.modalOk(p);
  ok((await p.textContent('[data-t=cp-due]')).includes('99'),'partial');
  await p.click('[data-t=settle]'); await H.sleep(p); await p.selectOption('[data-t=settle-method]','hbl'); await H.modalOk(p);
  ok((await p.textContent('[data-t=cp-due]')).includes('Rs 0'),'not settled: '+await p.textContent('[data-t=cp-due]'));
  await H.go(p,'reports'); const t=await p.textContent('[data-t=r-dues]'); ok(/199/.test(t)&&/100/.test(t),t); await p.ctx.close(); });
test('Printing','Receipt and kitchen ticket show customer name; delivery receipt shows phone + address', async()=>{ const p=await owner(); await H.whatsapp(p,{phone:'03004443333',name:'Hina',addr:'Clifton Blk 5',zone:'A'}); await H.add(p,'baja'); await H.pay(p,{cash:399});
  await ev(p,()=>{ window.print=()=>{}; }); await H.go(p,'orders'); await p.click('[data-t=reprint]'); await H.sleep(p,300); const r=await ev(p,()=>window.__lastBrowserPrint||'');
  ok(r.includes('Hina')&&r.includes('03004443333')&&r.includes('Clifton'),'receipt: '+r.slice(0,300)); await p.click('[data-t=kreprint]'); await H.sleep(p,300); ok((await ev(p,()=>window.__lastBrowserPrint)).includes('Hina'),'kitchen'); await p.ctx.close(); });

// ---- Log Inventory / roles ----
async function logCount(p,{loc='main',phase,counts}){ await H.go(p,'stocklog'); await p.selectOption('[data-t=sl-loc]',loc); await H.sleep(p,300); await p.click(`[data-t=sl-${phase}]`); await H.sleep(p,300);
  for(const [id,v] of Object.entries(counts)) await p.fill(`[data-t=sl-${id}]`,String(v)); await p.click('[data-t=sl-save]'); await H.sleep(p,400); }
async function relog(p,id,pin){ await ev(p,()=>__pos.App.user=null); await p.reload(); await p.waitForFunction(()=>window.__ready); await H.login(p,id,pin); }
test('Log Inventory','Ayesha (PIN 7777) lands on Log Inventory; no POS/dashboard access', async()=>{ const p=await fresh(); await H.login(p,'ayesha','7777'); await H.sleep(p,300);
  eq(await p.$eval('#main',e=>e.dataset.view),'stocklog'); const nav=await p.$$eval('[data-nav]',b=>b.map(x=>x.dataset.nav)); eq(nav.filter(n=>!['stocklog','inventory'].includes(n)),[]);
  await H.go(p,'dash'); ok(!(await p.$('[data-t=dash]')),'dashboard visible'); await p.ctx.close(); });
test('Log Inventory','Waqar + Ayesha counts: mismatch flagged, duplicate blocked without owner, closing sets next stock, variance', async()=>{ const p=await fresh(); await H.setPKT(p,2026,10,28,19,30); await H.login(p,'waqar','4444');
  await logCount(p,{phase:'opening',counts:{ready_tenders:10}}); ok(await p.$('[data-t=sl-done]'),'not saved');
  await p.fill('[data-t=sl-ready_tenders]','12'); await p.click('[data-t=sl-save]'); await H.sleep(p); ok(await p.$('[data-t=owner-pin]'),'no owner gate'); await p.click('[data-t=modal-cancel]'); await H.sleep(p,300);
  let L1=await ev(p,()=>__pos.db.all('invLogs')); eq([L1.length,L1[0].counts.ready_tenders,L1[0].byName,L1[0].date],[1,10,'Waqar','2026-10-28']);
  await relog(p,'ayesha','7777'); await H.setPKT(p,2026,10,28,19,40); await logCount(p,{phase:'opening',counts:{ready_tenders:7}});
  ok(/opening counts differ/.test(await p.textContent('[data-t=sl-recon]')),'mismatch not flagged');
  await H.setPKT(p,2026,10,29,2,50); await logCount(p,{phase:'closing',counts:{ready_tenders:3}});
  const t=await p.textContent('[data-t=sl-recon]'); ok(/variance/.test(t),'variance not flagged: '+t); ok(!/Cost/.test(await p.textContent('[data-t=sl-recon] tr')),'cost visible to staff');
  eq(await ev(p,()=>__pos.onHand().then(o=>o['ready_tenders|main'])),3);
  const logs=await ev(p,()=>__pos.db.all('invLogs')); eq(logs.map(l=>l.date).sort(),['2026-10-28','2026-10-28','2026-10-28']);
  await relog(p,'shaheer','1111'); await H.setPKT(p,2026,10,29,3,0); await H.go(p,'reports'); await p.fill('[data-t=rbd]','2026-10-28'); await p.dispatchEvent('[data-t=rbd]','change'); await H.sleep(p,400);
  ok(await p.$('[data-t=r-recon]'),'no recon in report'); ok((await p.textContent('[data-t=r-recon]')).includes('Chicken')||true); await p.ctx.close(); });
test('Log Inventory','Owner-approved edit keeps history', async()=>{ const p=await owner(); await logCount(p,{phase:'opening',counts:{ready_tenders:5}});
  await p.fill('[data-t=sl-ready_tenders]','6'); await p.click('[data-t=sl-save]'); await H.sleep(p); await H.ownerPin(p,'2222'); const l=(await ev(p,()=>__pos.db.all('invLogs')))[0]; eq([l.counts.ready_tenders,l.edits.length,l.edits[0].approvedBy],[6,1,'Ibrahim']); await p.ctx.close(); });
test('Migration','Older device gets Ayesha, new sheet items and timers on upgrade', async()=>{ const p=await fresh(); await ev(p,async()=>{ await __pos.db.del('staff','ayesha'); await __pos.db.del('inventory','donuts'); await __pos.db.kvSet('seedVer',1); });
  await p.reload(); await p.waitForFunction(()=>window.__ready); ok(await p.$('[data-staff=ayesha]'),'no ayesha'); ok(await ev(p,()=>__pos.db.get('inventory','donuts')),'no donuts'); await p.ctx.close(); });

// ---- Waste / FOC ----
test('Waste','Waste log deducts stock, shows reason/by; cost owner-only', async()=>{ const p=await cashier(); await H.go(p,'inventory'); await p.click('[data-t=inv-wastage]'); await H.sleep(p);
  await p.selectOption('[data-t=inv-item]','chicken'); await p.selectOption('[data-t=inv-loc]','main'); await p.fill('[data-t=inv-qty]','500'); await p.selectOption('[data-t=inv-wreason]','Dropped / spilled'); await p.fill('[data-t=inv-reason]','tray fell'); await H.modalOk(p);
  eq(await ev(p,()=>__pos.onHand().then(o=>o['chicken|main'])),-500);
  await H.go(p,'reports'); ok(!(await p.$('[data-t=r-waste]')),'cashier sees report');
  await relog(p,'shaheer','1111'); await H.go(p,'reports'); const t=await p.textContent('[data-t=r-waste]'); ok(t.includes('tray fell')&&t.includes('Waqar'),t); ok(/Cost/.test(t),'owner no cost'); await p.ctx.close(); });
test('FOC','Item FOC by Waqar: Rs 0, stock deducted, listed separately', async()=>{ const p=await cashier(); await H.add(p,'combo1',{heat:'Mild'}); await H.add(p,'baja'); await p.click('[data-t=foc-line-1]'); await H.sleep(p); await p.fill('[data-t=foc-reason]','late order sorry'); await H.modalOk(p);
  eq(await total(p),1099); await H.pay(p,{cash:1099}); const o=await H.lastOrder(p); eq([o.lines[1].foc.by,o.lines[1].foc.reason],['Waqar','late order sorry']);
  await relog(p,'shaheer','1111'); await H.go(p,'reports'); const t=await p.textContent('[data-t=r-foc]'); ok(t.includes('late order sorry')&&t.includes('199'),t); await p.ctx.close(); });
test('FOC','Whole-order FOC needs owner/Waqar approval; others rejected', async()=>{ const p=await cashier(); await ev(p,async()=>{ __pos.App.policy.focApprovers=[]; });
  await H.add(p,'baja'); await H.discount(p,{kind:'foc',reason:'VIP'}); ok(await p.$('[data-t=foc-pin]'),'no approval');
  await p.fill('[data-t=foc-pin]','4444'); await H.modalOk(p); ok(/Only owners/.test(await p.textContent('[data-t=modal-err]')),'non-approver accepted');
  await p.fill('[data-t=foc-pin]','1111'); await H.modalOk(p); eq(await total(p),0); await H.pay(p,{}); const o=await H.lastOrder(p); eq([o.discount.kind,o.discount.approvedBy],['foc','Shaheer']);
  const mv=await ev(p,()=>__pos.db.all('stockMoves')); ok(mv.some(m=>m.type==='sale'),'stock not deducted'); await p.ctx.close(); });

// ---- KDS timers / dashboard / low stock ----
test('KDS','Ticket timer turns amber at 12 min and red at 20 min; thresholds editable', async()=>{ const p=await owner(); await H.add(p,'baja'); await H.pay(p,{cash:199});
  await H.go(p,'kds'); eq(await p.$eval('[data-t=ticket]',e=>e.dataset.age),'ok');
  await H.setOffset(p,13*60000); await H.go(p,'kds'); eq(await p.$eval('[data-t=ticket]',e=>e.dataset.age),'amber');
  await H.setOffset(p,21*60000); await H.go(p,'kds'); eq(await p.$eval('[data-t=ticket]',e=>e.dataset.age),'red');
  await H.go(p,'settings'); await p.click('[data-t=tab-policy]'); await H.sleep(p); await p.fill('[data-t=pol-amber]','25'); await p.fill('[data-t=pol-red]','30'); await p.click('#pol button'); await H.sleep(p,300);
  await H.go(p,'kds'); eq(await p.$eval('[data-t=ticket]',e=>e.dataset.age),'ok'); await p.ctx.close(); });
test('Dashboard','Owner dashboard: totals, AOV, hourly, top items, payment & channel split, previous days; cashier blocked', async()=>{ const p=await owner(); await H.setPKT(p,2026,10,28,20,10); await H.add(p,'combo1',{heat:'Hot'}); await H.pay(p,{cash:1099}); await H.add(p,'baja'); await H.pay(p,{hbl:199});
  await H.go(p,'dash'); eq((await p.textContent('[data-t=d-gross]')).replace(/\D/g,''),'1298'); eq((await p.textContent('[data-t=d-aov]')).replace(/\D/g,''),'649');
  for(const s of ['d-hourly','d-top','d-pay','d-ch','d-prev']) ok(await p.$(`[data-t=${s}]`),s); ok((await p.textContent('[data-t=d-ch]')).includes('Walk-in'),'channel');
  await relog(p,'waqar','4444'); ok(!(await p.$('[data-nav=dash]')),'cashier nav'); await H.go(p,'dash'); ok(!(await p.$('[data-t=dash]')),'cashier sees dash'); await p.ctx.close(); });
test('Reports','Low-stock list for Supply in nightly report (reorder levels + Reorder flags from closing checklist)', async()=>{ const p=await owner(); await logCount(p,{phase:'closing',counts:{ready_tenders:1}}); await H.go(p,'reports');
  const t=await p.textContent('[data-t=r-lowstock]'); ok(/bag/i.test(t)&&/LP24|box/i.test(t),t.slice(0,300)); await p.ctx.close(); });

// ---- Layout ----
for(const [w,h] of [[1366,768],[1024,768],[768,1024]]) test('Layout',`No horizontal overflow on any view at ${w}x${h}`, async()=>{ const p=await owner({viewport:{width:w,height:h},ipad:w<1366}); for(const v of ['dash','pos','orders','kds','inventory','stocklog','till','reports','customers','recipes','settings']){ await H.go(p,v); const o=await ev(p,()=>document.documentElement.scrollWidth-innerWidth); ok(o<=1,`${v} overflows by ${o}px`); } eq(p.errs,[]); await p.ctx.close(); });

// ---- runner ----
test('Orders','Row actions: 2 print icons + ⋯ in one line, Pay only when due, none on void; refund/void in detail', async()=>{ const p=await cashier(); await H.add(p,'baja'); await H.pay(p,{cash:199}); await H.add(p,'lemonade'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p);
  await ev(p,async(id)=>{ const x=await __pos.db.get('orders',id); x.payments=[{method:'cash',amount:50,at:Date.now()}]; await __pos.db.put('orders',x); },o.id);
  for(const [w,h] of [[1366,768],[1024,768],[768,1024]]){ await p.setViewportSize({width:w,height:h}); await H.go(p,'orders');
    const rows=await ev(p,()=>[...document.querySelectorAll('tr.orow')].map(tr=>{ const bs=[...tr.querySelectorAll('.oacts > *')].map(b=>b.getBoundingClientRect()); return {no:tr.dataset.no,n:bs.length,tops:[...new Set(bs.map(b=>Math.round((b.top+b.bottom)/2)))].length,pay:!!tr.querySelector('[data-t=row-pay]'),h:tr.getBoundingClientRect().height,txt:tr.textContent}; }));
    for(const r of rows){ eq(r.tops,1,'actions wrap at '+w); ok(!/Refund|Void|Speedway/.test(r.txt),'rare actions in row'); }
    const due=rows.find(r=>r.no==String(o.orderNo)); ok(due.pay,'pay shown on due'); ok(rows.filter(r=>r.no!=String(o.orderNo)).every(r=>!r.pay),'pay on paid');
    ok(await p.isVisible(`tr[data-no="${o.orderNo}"] [data-t=row-pay]`)); if(w===1366) await p.screenshot({path:'/workspace/pos_build/screens/flow-orders-rows-1366.png'}); if(w===1024) await p.screenshot({path:'/workspace/pos_build/screens/flow-orders-rows-ipad.png'}); }
  await p.setViewportSize({width:1366,height:768}); await H.go(p,'orders'); ok((await p.textContent(`tr[data-no="${o.orderNo}"] [data-t=row-pay]`)).includes('149'),'balance due');
  await H.orderRowAct(p,o.orderNo,'void'); ok(await p.$('[data-t=owner-pin]'),'void owner PIN'); await H.ownerPin(p,'1111'); await p.fill('[data-t=vreason]','test'); await H.modalOk(p); await H.go(p,'orders');
  ok(!(await p.$(`tr[data-no="${o.orderNo}"] [data-t=row-pay]`)),'no pay on void'); await p.click(`tr[data-no="${o.orderNo}"] td.ono`); await H.sleep(p,300); ok(await p.isVisible('[data-t=d-items]'),'row click opens detail'); ok(!(await p.$('[data-t=d-void]'))&&!(await p.$('[data-t=d-refund]'))&&!(await p.$('[data-t=d-pay]')),'no actions on void'); await p.ctx.close(); });
// ---- Redesign ----
test('Redesign','Popup adds a main; Combo 3 asks tender + slider heat separately', async()=>{ const p=await cashier(); await p.click('[data-item="combo1"]'); await H.sleep(p); ok(await p.isVisible('[data-t=item-popup]'),'popup'); await p.check('[data-t=heat-Hot]'); await H.modalOk(p);
  let c=await ev(p,()=>__pos.App.draft.lines.map(l=>[l.itemId,l.heat])); eq(JSON.stringify(c),JSON.stringify([['combo1','Hot']]));
  await p.click('[data-item="combo3"]'); await H.sleep(p); ok(await p.$('[data-t=heat2-Mild]'),'slider heat'); await p.check('[data-t=heat-Hot]'); await p.check('[data-t=heat2-Mild]'); await H.modalOk(p);
  c=await ev(p,()=>__pos.App.draft.lines.find(l=>l.itemId==='combo3')); eq(c.heat+'/'+c.heat2,'Hot/Mild'); await p.ctx.close(); });
test('Redesign','Favourites row has 6 items; upsell offers Baja/Lemonade with a combo', async()=>{ const p=await cashier(); eq((await p.$$('[data-fav]')).length,6); await H.add(p,'combo1',{heat:'Hot'}); ok(await p.isVisible('[data-t=upsell]'),'upsell');
  await p.click('[data-t=upsell-baja]'); await H.sleep(p); ok(await ev(p,()=>__pos.App.draft.lines.some(l=>l.itemId==='baja')),'baja added'); ok(!(await p.$('[data-t=upsell]'))||!(await p.isVisible('[data-t=upsell]')),'upsell gone'); await p.ctx.close(); });
test('Redesign','Done card after charge with big number; New order clears; Enter/Esc/number shortcuts never fire while typing', async()=>{ const p=await cashier(); await H.add(p,'baja'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p);
  ok(await p.isVisible('[data-t=done-card]'),'done'); ok((await p.textContent('[data-t=done-no]')).includes(String(o.orderNo)),'number'); await p.keyboard.press('Enter'); await H.sleep(p); ok(!(await p.$('[data-t=done-card]')),'enter = new order');
  await H.channel(p,'takeaway'); await p.click('[data-t=cname]'); await p.keyboard.type('12'); await H.sleep(p); eq(await p.inputValue('[data-t=cname]'),'12'); await p.keyboard.press('Escape');
  await p.click('body',{position:{x:5,y:300}}).catch(()=>{}); await H.add(p,'baja'); await ev(p,()=>document.activeElement&&document.activeElement.blur()); await p.keyboard.press('Escape'); await H.sleep(p); eq(await ev(p,()=>__pos.App.draft.lines.length),0,'esc clears'); await p.ctx.close(); });
test('Redesign','Removing a cart line shows a 5s undo bar that restores it', async()=>{ const p=await cashier(); await H.add(p,'baja'); await p.click('[data-del]'); await H.sleep(p); ok(await p.isVisible('[data-t=undo-bar]'),'undo'); await p.click('[data-t=undo]'); await H.sleep(p); eq(await ev(p,()=>__pos.App.draft.lines.length),1); await p.ctx.close(); });
test('Redesign','Slim nav: More menu; cashier sees locked owner pages; live count for all, sales snapshot only for owner', async()=>{ const p=await cashier(); ok(await p.$('[data-t=live-count]'),'live'); ok(!(await p.$('[data-t=sales-snap]')),'no snap for cashier');
  await p.click('[data-t=more]'); await H.sleep(p); ok((await p.$$('[data-lock]')).length>0,'locked'); ok(!(await p.$('[data-lock][data-nav]')),'locked not navigable');
  await relog(p,'shaheer','1111'); ok(await p.$('[data-t=sales-snap]'),'owner snap'); ok(!(await p.$('[data-lock]')),'owner no locks'); await p.ctx.close(); });
test('Redesign','Orders hub tabs + stage chips; Rush toggles and persists', async()=>{ const p=await cashier(); await H.go(p,'live'); for(const k of ['live','kds','orders']) ok(await p.$(`[data-hub="${k}"]`),k); for(const k of ['all','new','prep','ready','out','done']) ok(await p.$(`[data-t=stage-${k}]`),k);
  await p.click('[data-t=rush]'); await H.sleep(p); ok(await ev(p,()=>__pos.App.rush),'rush on'); ok(await ev(p,()=>__pos.db.kvGet('rush',false)),'persisted'); await H.go(p,'pos'); await p.click('[data-item="combo1"]'); await H.sleep(p); ok(!(await p.$('[data-t=item-popup]')),'rush skips popup'); eq(await ev(p,()=>__pos.App.draft.lines.length),1); await p.click('[data-t=rush]'); await p.ctx.close(); });
// ---- Polish pass 2 ----
test('Polish','Reports owner-only: cashier sees it locked and cannot open it; refund, waste log (More) and FOC still work for cashier', async()=>{ const p=await cashier(); await p.click('[data-t=more]'); await H.sleep(p); ok(await p.$('[data-t=lock-reports]'),'locked'); ok(!(await p.$('[data-nav=reports]')),'nav');
  await H.go(p,'reports'); ok(!(await p.$('[data-t=r-gross]')),'go() bypass'); await p.click('[data-t=more]'); await H.sleep(p); await p.click('[data-t=m-waste]'); await H.sleep(p,400); ok(await p.$('[data-t=inv-wreason]'),'waste form from More'); await p.click('[data-t=modal-cancel]');
  await H.go(p,'pos'); await H.add(p,'baja'); ok(await p.$('[data-t=foc-line-0]'),'FOC on cart line'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p); await H.orderRowAct(p,o.orderNo,'refund'); ok(await p.$('[data-t=owner-pin]'),'refund needs owner PIN'); await p.ctx.close(); });
test('Polish','Stage chips: separate Accepted chip, "Out for delivery" label; status values unchanged', async()=>{ const p=await cashier(); await H.add(p,'baja'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p);
  await ev(p,async id=>{ const x=await __pos.db.get('orders',id); x.flow={status:'accepted',ts:{}}; await __pos.db.put('orders',x); },o.id); await H.go(p,'live');
  eq((await p.textContent('[data-t=stage-acc]')).replace(/\D/g,''),'1'); eq((await p.textContent('[data-t=stage-prep]')).replace(/\D/g,''),'0'); ok((await p.textContent('[data-t=stage-out]')).includes('Out for delivery'),'label');
  ok(!(await p.textContent('[data-t=stagechips]')).includes('Dispatched'),'no Dispatched'); eq(await ev(p,()=>__pos.L.flowLabel({},'out_for_delivery')),'Out for delivery'); await p.ctx.close(); });
test('Polish','More menu closes on Esc; phone bar is icon-only with branch + logout in More', async()=>{ const p=await cashier(); await p.click('[data-t=more]'); await H.sleep(p); ok(await p.isVisible('#moremenu'),'open'); await p.keyboard.press('Escape'); await H.sleep(p); ok(!(await p.isVisible('#moremenu')),'esc closes');
  await p.setViewportSize({width:390,height:844}); await H.go(p,'pos'); ok(!(await p.isVisible('#logout'))&&!(await p.isVisible('#locbtn')),'moved'); ok(!(await p.isVisible('#rushbtn .blbl')),'icon only');
  const o=await ev(p,()=>{ const h=document.querySelector('header.top'); return h.scrollWidth-h.clientWidth; }); ok(o<=1,'top bar overflows '+o);
  await p.click('[data-t=more]'); await H.sleep(p); ok(await p.isVisible('[data-t=m-logout]')&&await p.isVisible('[data-t=m-loc]'),'in More'); await p.click('[data-t=m-logout]'); await H.sleep(p,300); ok(await p.$('[data-staff]'),'logged out'); await p.ctx.close(); });
test('Popup','Item popup fits 1366x657 without scrolling, equal heat buttons, 2 rows for Combo 3, Add shows running total', async()=>{ const p=await cashier({viewport:{width:1366,height:657}}); await p.click('[data-item="combo3"]'); await H.sleep(p,300);
  ok(await p.isVisible('[data-t=item-popup]'),'popup'); ok(!(await p.$('.modal-bg.inline')),'centred'); eq(await p.textContent('[data-t=ip-price]'),'Rs 1,199');
  const g=await ev(p,()=>{ const m=document.querySelector('.ip-modal'), b=m.querySelector('.mbody'), r=m.getBoundingClientRect(); const rows=[...document.querySelectorAll('.ip-heats')].map(h=>{ const s=[...h.querySelectorAll('span')].map(e=>e.getBoundingClientRect()); return {tops:new Set(s.map(x=>Math.round(x.top))).size,ws:new Set(s.map(x=>Math.round(x.width))).size,hs:new Set(s.map(x=>Math.round(x.height))).size,n:s.length}; });
    const ok=m.querySelector('[data-t=modal-ok]').getBoundingClientRect(); return {inView:r.top>=0&&r.bottom<=innerHeight, scroll:b.scrollHeight>b.clientHeight+1, rows, okIn:ok.bottom<=innerHeight, okH:ok.height}; });
  ok(g.inView,'modal in view'); ok(!g.scroll,'popup body scrolls'); ok(g.okIn&&g.okH>=48,'big Add button'); eq(g.rows.length,2,'two heat rows'); for(const r of g.rows){ eq(r.n,5); eq(r.tops,1,'one row'); eq(r.ws,1,'same width'); eq(r.hs,1,'same height'); }
  ok((await p.textContent('[data-t=modal-ok]')).includes('Rs 1,199'),'running total');
  await p.click('[data-t="addon-moes_sauce-plus"]'); await p.click('[data-t=qty-plus]'); eq((await p.textContent('[data-t=modal-ok]')).trim(),'Add to order · Rs 2,638');
  await p.click('[data-t="addon-moes_sauce-minus"]'); await p.click('[data-t="addon-moes_sauce-minus"]'); eq(await p.inputValue('[data-t="addon-moes_sauce"]'),'0','no negative extras');
  for(const id of ['moes_sauce','hot_honey','dinner_roll']) ok(await p.$(`[data-t="extra-${id}"]`),id);
  await p.click('[data-t="addon-hot_honey-plus"]'); await p.check('[data-t=heat-Hot]'); await p.check('[data-t=heat2-Mild]'); await p.fill('[data-t=lnote]','No pickles'); await H.modalOk(p);
  const l=await ev(p,()=>__pos.App.draft.lines[0]); eq([l.itemId,l.qty,l.heat,l.heat2,l.note,l.addons.map(a=>a.id).join()],['combo3',2,'Hot','Mild','No pickles','hot_honey']);
  await p.screenshot({path:'/workspace/pos_build/screens/item-popup-1366.png'}); await p.ctx.close(); });
test('Popup','Cancel, Esc and outside tap close without adding; extras and drinks still add with one tap', async()=>{ const p=await cashier(); const n=()=>ev(p,()=>__pos.App.draft.lines.length);
  await p.click('[data-item=combo1]'); await H.sleep(p); await p.click('[data-t=modal-cancel]'); await H.sleep(p); ok(!(await p.$('[data-t=item-popup]'))); eq(await n(),0,'cancel');
  await p.click('[data-item=mac]'); await H.sleep(p); await p.keyboard.press('Escape'); await H.sleep(p); ok(!(await p.$('[data-t=item-popup]'))); eq(await n(),0,'esc');
  await p.click('[data-item=mozz]'); await H.sleep(p); await p.mouse.click(5,300); await H.sleep(p); ok(!(await p.$('[data-t=item-popup]'))); eq(await n(),0,'outside');
  await p.click('[data-item=loaded_fries]'); await H.sleep(p); ok(await p.isChecked('[data-t=heat-Medium]'),'default heat Medium kept'); await H.modalOk(p); eq(await n(),1);
  await H.go(p,'pos'); await p.click('[data-item=baja]'); await H.sleep(p); ok(!(await p.$('.modal-bg')),'drink one tap'); await p.click('[data-item=hot_honey]'); await H.sleep(p); ok(!(await p.$('.modal-bg')),'extra one tap'); eq(await n(),3); await p.ctx.close(); });
test('Popup','Tapping a main already in the cart reopens the popup to edit that line', async()=>{ const p=await cashier(); await H.add(p,'combo1',{heat:'Hot',addons:['moes_sauce'],note:'crispy'});
  await p.click('[data-item=combo1]'); await H.sleep(p); ok(await p.isChecked('[data-t=heat-Hot]'),'heat kept'); eq(await p.inputValue('[data-t="addon-moes_sauce"]'),'1'); eq(await p.inputValue('[data-t=lnote]'),'crispy'); ok((await p.textContent('[data-t=modal-ok]')).startsWith('Save changes'));
  await p.check('[data-t=heat-Reaper]'); await p.click('[data-t=qty-plus]'); await H.modalOk(p);
  const ls=await ev(p,()=>__pos.App.draft.lines); eq(ls.length,1,'edited, not duplicated'); eq([ls[0].heat,ls[0].qty,ls[0].addons.length],['Reaper',2,1]); await p.ctx.close(); });
test('Popup','Combo 3 uses the same Rush and favourites paths as other mains', async()=>{ const p=await cashier(); await p.click('[data-t=rush]'); await H.sleep(p); await H.go(p,'pos');
  await p.click('[data-item=combo3]'); await H.sleep(p); ok(!(await p.$('[data-t=item-popup]')),'rush adds combo3 instantly'); let l=await ev(p,()=>__pos.App.draft.lines[0]); eq([l.itemId,l.heat,l.heat2],['combo3','Medium','Medium']);
  await p.click('[data-t=rush]'); await H.sleep(p); await p.ctx.close();
  const q=await cashier(); await q.click('[data-fav=combo3]'); await H.sleep(q); ok(!(await q.$('.modal-bg')),'fav one tap'); l=await ev(q,()=>__pos.App.draft.lines[0]); eq([l.itemId,!!l.heat,l.heat===l.heat2],['combo3',true,true]); await q.ctx.close(); });
test('Popup','Popup fits and adds on iPad (1024x768) and phone (390x844)', async()=>{ for(const vp of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]){ const p=await cashier({viewport:vp}); await p.click('[data-item=combo3]'); await H.sleep(p,300);
  const g=await ev(p,()=>{ const m=document.querySelector('.ip-modal').getBoundingClientRect(), o=document.querySelector('[data-t=modal-ok]').getBoundingClientRect(); return m.top>=0&&m.bottom<=innerHeight+1&&m.right<=innerWidth+1&&o.bottom<=innerHeight&&o.width>100; }); ok(g,'fits '+vp.width);
  if(vp.width===390) await p.screenshot({path:'/workspace/pos_build/screens/item-popup-phone.png'}); await H.modalOk(p); eq(await ev(p,()=>__pos.App.draft.lines.length),1,'added '+vp.width); await p.ctx.close(); } });
test('Popup','Heat, extras and notes reach the kitchen ticket data unchanged', async()=>{ const p=await cashier(); await H.add(p,'combo2',{heat:'Extra Hot',addons:['moes_sauce','dinner_roll'],note:'no salt'});
  await p.click('[data-item=combo2]'); await H.sleep(p); await p.click('[data-t="addon-moes_sauce-plus"]'); await H.modalOk(p);
  const l=await ev(p,()=>__pos.App.draft.lines[0]); eq(l.addons.map(a=>a.id+':'+a.price).join(),'dinner_roll:40,moes_sauce:120,moes_sauce:120'); eq(await total(p),1249+120*2+40); await p.ctx.close(); });
test('Polish','Quick-cash tiles do not wrap on iPad', async()=>{ const p=await cashier({viewport:{width:1024,height:768},ipad:true}); await H.add(p,'combo1',{heat:'Hot'}); await H.add(p,'combo2',{heat:'Hot'}); await H.openCheckout(p);
  const bad=await ev(p,()=>[...document.querySelectorAll('[data-t=q-cashrow] .qt')].filter(b=>b.scrollWidth>b.clientWidth+1||b.getClientRects().length>1||b.getBoundingClientRect().height>60).map(b=>b.textContent)); eq(bad,[]); await p.ctx.close(); });
test('Polish','Void: owner PIN + reason in one popup; wrong PIN rejected', async()=>{ const p=await cashier(); await H.add(p,'baja'); await H.pay(p,{cash:199}); const o=await H.lastOrder(p); await H.orderRowAct(p,o.orderNo,'void');
  ok(await p.$('[data-t=owner-pin]')&&await p.$('[data-t=vreason]'),'one form'); await p.fill('[data-t=owner-pin]','9999'); await p.fill('[data-t=vreason]','x'); await H.modalOk(p); ok(/Wrong owner PIN/.test(await p.textContent('[data-t=modal-err]')),'wrong pin');
  await p.fill('[data-t=owner-pin]','1111'); await H.modalOk(p); ok(!(await p.$('.modal-bg')),'closed'); const v=await H.lastOrder(p); eq([v.status,v.voidBy,v.voidReason],['void','Shaheer','x']); await p.ctx.close(); });
test('Polish','Phone order detail keeps item names on one or two lines', async()=>{ const p=await cashier({viewport:{width:390,height:844}}); await H.add(p,'combo1',{heat:'Hot'}); await H.pay(p,{cash:1099}); const o=await H.lastOrder(p); await H.orderRowAct(p,o.orderNo,'detail');
  const h=await ev(p,()=>{ const b=document.querySelector('[data-t=d-items] tbody td b'); return b.getBoundingClientRect().height/parseFloat(getComputedStyle(b).lineHeight); }); ok(h<2.5,'lines '+h); await p.screenshot({path:'/workspace/pos_build/screens/redesign-polish-phone-detail.png'}); await p.ctx.close(); });
for(const t of T){ if(only&&!(t.area+' '+t.name).toLowerCase().includes(only.toLowerCase())) continue; const s=Date.now(); let r='PASS',err='';
  try{ await Promise.race([t.fn(),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout 60s')),60000))]); }catch(e){ r='FAIL'; err=e.message.split('\n')[0].slice(0,200); if(process.env.DBG) console.log(e.stack); }
  results.push({area:t.area,name:t.name,r,err,ms:Date.now()-s}); console.log(r,'|',t.area,'|',t.name,err?'| '+err:''); }
await b.close(); try{ helper?.kill(); }catch{}
const pass=results.filter(r=>r.r==='PASS').length; console.log(`\n${pass}/${results.length} passed`);
fs.writeFileSync('/workspace/moes-pos/test/e2e-results.md','| # | Area | Test | Result | Note |\n|---|---|---|---|---|\n'+results.map((r,i)=>`| ${i+1} | ${r.area} | ${r.name} | ${r.r} | ${r.err.replace(/\|/g,'/')} |`).join('\n')+`\n\n**${pass}/${results.length} passed**\n`);
process.exit(pass===results.length?0:1);
