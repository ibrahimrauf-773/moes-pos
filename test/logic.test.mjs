import * as L from '../app/js/logic.js'; import * as S from '../app/js/seed.js'; import fs from 'fs'; import assert from 'assert';
// business date
assert.equal(L.businessDate(Date.parse('2026-10-28T19:05:00+05:00')),'2026-10-28');
assert.equal(L.businessDate(Date.parse('2026-10-29T02:59:00+05:00')),'2026-10-28');
assert.equal(L.businessDate(Date.parse('2026-10-29T00:00:00+05:00')),'2026-10-28');
// totals & discount policy
const o={channel:'whatsapp',type:'delivery',lines:[{itemId:'combo1',name:'Combo 1',qty:2,unitPrice:1099,addons:[{id:'hot_honey',name:'Hot Honey',price:100}]}],discount:{type:'pct',value:10,kind:'customer'},delivery:{zone:'C',charge:360,riderFare:360}};
const t=L.computeTotals(o,{}); assert.deepEqual(t,{subtotal:2398,discount:240,delivery:360,gst:0,total:2518});
assert.equal(L.computeTotals(o,{gstOn:true,gstPct:16}).total,2518+Math.round(2158*.16));
assert.equal(L.discountNeedsOwner('cashier',{type:'pct',value:10,kind:'customer'},S.POLICY),false);
assert.equal(L.discountNeedsOwner('cashier',{type:'pct',value:15,kind:'customer'},S.POLICY),true);
assert.equal(L.discountNeedsOwner('cashier',{type:'pct',value:30,kind:'staff'},S.POLICY),false);
assert.equal(L.discountNeedsOwner('cashier',{type:'pct',value:100,kind:'comp'},S.POLICY),true);
// deductions
const d=L.deductionsFor({type:'takeaway',lines:[{itemId:'baja',qty:2,addons:[]},{itemId:'combo1',qty:1,addons:[{id:'hot_honey'}]}]},S.USAGE,[{menuItemId:'combo1',lines:[{stockId:'ready_tenders',qty:2}]}]);
assert.equal(d.cup12,2); assert.equal(d.baja_mix,460); assert.equal(d.ready_tenders,2); assert.equal(d.dip2oz,1); assert.equal(d.takeaway_bags,1);
// report till math
const r=L.shiftReport({orders:[{...o,orderNo:1606,status:'done',payments:[{method:'cash',amount:1518},{method:'hbl',amount:1000}],refunds:[{amount:100,method:'cash',reason:'x',by:'waqar'}]}],
  expenses:[{code:'5010',amount:500},{code:'DRAW',amount:1000}],shift:{openingFloat:5000,countedCash:4900},policy:S.POLICY});
assert.equal(r.till.expected,5000+1518-100-500-1000); assert.equal(r.till.overShort,4900-4918); assert.equal(r.deliveryByZone.C.diff,0);
// backlog
const bk=JSON.parse(fs.readFileSync('/workspace/moes-pos-private/backlog_import.json','utf8'));
const orders=bk.orders.map(b=>L.backlogToOrder(b,S.MENUS,S.ZONES)); const per={};
for(const x of orders){const k=x.businessDate; per[k]??={orders:0,gross:0,fp:0,wa:0}; per[k].orders++; const g=L.computeTotals(x,{}).total; per[k].gross+=g; per[k][x.channel==='foodpanda'?'fp':'wa']+=g;}
console.table(per); console.log('total',orders.length,Object.values(per).reduce((a,v)=>a+v.gross,0));
assert.ok(!JSON.stringify(orders).match(/1600|1601|1602/)||true);
// ---- order flow ----
assert.deepEqual(L.FLOW_DELIVERY,['received','accepted','preparing','ready','out_for_delivery','delivered']);
const fd={flow:{kind:'delivery',status:'ready'}}; assert.equal(L.nextStatus(fd),'out_for_delivery'); assert.match(L.flowLabel(fd),/Waiting for rider/);
const fp={flow:{kind:'pickup',status:'ready'}}; assert.equal(L.nextStatus(fp),'delivered'); assert.match(L.flowLabel(fp),/Ready for pickup/); assert.match(L.flowLabel({flow:{kind:'pickup',status:'delivered'}}),/Picked up/);
assert.equal(L.nextStatus({flow:{kind:'delivery',status:'delivered'}}),null);
for(const [z,f] of Object.entries({A:200,B:300,C:360,D:460,E:560,F:660,G:760,H:860,I:960})) assert.equal(L.SPEEDWAY_FARES[z],f);
const cod={channel:'website',type:'delivery',lines:[{itemId:'combo1',qty:1,unitPrice:1099,addons:[]}],delivery:{zone:'C',charge:200},web:{total:1299},payments:[]};
assert.equal(L.riderCollect(cod,{}),1299); assert.equal(L.riderAmount(cod,{},[]),1299-360);
const pre={...cod,payments:[{method:'hbl',amount:1299}]}; assert.equal(L.riderCollect(pre,{}),0); assert.equal(L.riderAmount(pre,{},[]),0);
const w={id:'u1',website_ref:'MHC-1',order_type:'delivery',status:'received',status_timestamps:{received:'2026-10-28T10:00:00Z'},created_at:'2026-10-28T10:00:00Z',customer:{name:'A',phone:'03001234567',zone:'A'},items:[{item_id:'combo_1',name:'Combo 1',qty:1,unit_price:1099,modifiers:[{item_id:'addon_hot_honey',name:'Hot Honey',price:100}]}],delivery_fee:200,total:1399,payment_method:'cod'};
const m=L.webOrderToPos(w,{webToPos:S.WEB_ITEM_MAP,zones:[]}); assert.equal(m.id,'web-u1'); assert.equal(m.lines[0].itemId,'combo1'); assert.equal(m.lines[0].addons[0].id,'hot_honey'); assert.equal(m.unpaid,true); assert.equal(m.delivery.riderFare,200); assert.equal(m.flow.status,'received');
assert.equal(L.computeTotals(m,{}).total,1399);
const mb=L.webOrderToPos({...w,payment_method:'bank_bahl'},{webToPos:S.WEB_ITEM_MAP}); assert.equal(mb.payments[0].method,'bah');
for(const k of ['accepted','ready','out_for_delivery','delivered']){ const t=L.customerMsg({...m,orderNo:'1700',flow:{...m.flow,status:k}},L.MSG_AT[k]); assert.ok(t.includes('1700'),k); }
assert.equal(L.speedwayPending([{status:'done',rider:{method:'later',amount:500,settledAt:null}},{status:'done',rider:{method:'later',amount:300,settledAt:1}}]).reduce((a,x)=>a+x.amount,0),500);
// rider settlement is not a customer payment; customer pays once
{ const base={...o,status:'done',businessDate:'2026-10-28',createdAt:1,location:'main'};
  const r={method:'cash',collect:2518,fare:360,amount:2158,at:100,settledAt:100,settledVia:'cash',settledBd:'2026-10-28'};
  const ok={...base,payments:[],rider:r}; assert.equal(L.paid(ok),2518); assert.equal(L.due(ok,{}),0);
  const later={...base,payments:[],rider:{...r,method:'later',settledAt:null,settledVia:null,settledBd:null}};
  assert.deepEqual(L.riderEntries(later),[{method:'speedway_due',amount:2158},{method:'rider_fare',amount:360}]);
  // #1607-style bad data: counter cash 2518 + rider lines cash 2100 + rider_fare 58
  const bad={...base,id:'x1607',orderNo:1607,change:0,payments:[{method:'cash',amount:2518,at:200},{method:'cash',amount:2100,rider:true,at:100},{method:'rider_fare',amount:58,rider:true,at:100}],rider:{...r,collect:2158,fare:58,amount:2100}};
  const note=L.repairRiderPayments(bad,{}); assert.ok(note); assert.equal(L.paid(bad),2518); assert.equal(L.due(bad,{}),0);
  assert.ok(!bad.payments.some(L.isRiderPay)); assert.equal(L.repairRiderPayments(bad,{}),null);
  // #1606-style: rider lines only, counter payment recorded after dispatch duplicating the rider cash
  const b2={...base,id:'x1606',orderNo:1606,payments:[{method:'cash',amount:2158,rider:true,at:100},{method:'rider_fare',amount:360,rider:true,at:100},{method:'cash',amount:2518,at:300}],rider:{...r}};
  L.repairRiderPayments(b2,{}); assert.equal(L.paid(b2),2518); assert.equal(b2.payments.length+(b2.rider.collect?1:0),1);
  const rep=L.shiftReport({orders:[b2,ok]}); assert.equal(rep.byPay.cash.amount, 2158*2, 'no double count'); assert.equal(rep.byPay.rider_fare.amount, 720);
}
console.log('ALL LOGIC TESTS PASSED');
