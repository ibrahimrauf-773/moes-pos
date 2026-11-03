// Unit tests: void individual items and add items to an unpaid order (pure logic).
import assert from 'node:assert/strict';
import * as L from '../app/js/logic.js';
const usage={combo1:[['chicken',2]],mozz:[['mozz_stk',3]],straight_fries:[['fries',1]],_order:[['bag',1,true]]};
const mk=(over={})=>({id:'o1',orderNo:1700,channel:'instore',type:'takeaway',status:'open',businessDate:'2026-11-04',payments:[],refunds:[],
  lines:[{itemId:'combo1',name:'Combo 1',qty:2,unitPrice:1249,addons:[{id:'hot_honey',name:'Hot Honey',price:200}]},{itemId:'mozz',name:'Mozz',qty:1,unitPrice:1050}],...over});
// --- item void ---
{ const o=mk({discount:{type:'pct',value:10}}); const pol={gstOn:true,gstPct:5};
  assert.equal(L.computeTotals(o,pol).subtotal,2*1449+1050);
  const r=L.voidLine(o,1,{by:'Shaheer',reason:'customer changed mind',at:123,usage,policy:pol});
  assert.deepEqual(o.lines[1].voided,{by:'Shaheer',reason:'customer changed mind',at:123});
  const t=L.computeTotals(o,pol); assert.equal(t.subtotal,2898); assert.equal(t.discount,290); assert.equal(t.gst,Math.round((2898-290)*0.05)); assert.equal(o.totals.total,t.total);
  assert.deepEqual(r.stockBack,{mozz_stk:3},'stock returned for the voided line only (no per-order packaging)');
  assert.deepEqual(L.deductionsFor(o,usage),{chicken:4,bag:1},'voided line excluded from deductions');
  assert.equal(L.canVoidItem(o,0),false,'last live item must use whole-order void');
  assert.throws(()=>L.voidLine(o,1,{by:'x',reason:'again'}));
}
{ const o=mk({payments:[{method:'card',amount:3948,charged:4264,cardTax:316}]}); o.cardTax=316;
  assert.throws(()=>L.voidLine(o,0,{by:'x',reason:''}),/Reason/);
  const r=L.voidLine(o,1,{by:'Ibrahim',reason:'burnt',usage}); assert.equal(r.total,2898); assert.equal(r.overpaid,1050); assert.equal(o.cardTax,316); assert.equal(o.unpaid,false); }
{ const o=mk({channel:'foodpanda',fp:{orderId:'x',total:3000}}); assert.equal(L.canVoidItem(o,0),false); }
{ const o=mk({status:'void'}); assert.equal(L.canVoidItem(o,0),false); }
// report integration
{   const o=mk({payments:[{method:'cash',amount:2898}]}); L.voidLine(o,1,{by:'Ruqaiya',reason:'wrong item',usage});
  const rep=L.shiftReport({orders:[o]}); assert.ok(L.reportCSV(rep).includes('Adjustment:void item'));
  const v=rep.adjustments.find(a=>a.type==='void item'); assert.ok(v,'void item in report'); assert.equal(v.amount,1050); assert.equal(v.by,'Ruqaiya'); assert.equal(v.reason,'wrong item');
  assert.ok(!rep.itemList.some(i=>i.itemId==='mozz'),'voided item not in item sales'); assert.equal(rep.totals.gross,2898); }
// --- add items ---
{ const o=mk({credit:true,unpaid:true,payments:[{method:'cash',amount:1000}]});
  assert.equal(L.canAddItems(o),true);
  const r=L.addLines(o,[{itemId:'straight_fries',name:'Straight Fries',qty:2,unitPrice:350,addons:[]}],{by:'Waqar',at:5,batch:'b1',usage});
  assert.equal(o.lines.length,3); assert.deepEqual(o.lines[2].added,{by:'Waqar',at:5,batch:'b1'});
  assert.equal(o.totals.total,2898+1050+700); assert.equal(L.due(o),2898+1050+700-1000); assert.equal(o.unpaid,true);
  assert.deepEqual(r.deduct,{fries:2},'only new items deducted'); assert.equal(r.lines.length,1); assert.deepEqual(o.addOns,[{batch:'b1',at:5,by:'Waqar',count:1}]); }
{ const o=mk({payments:[{method:'cash',amount:3948}]}); assert.equal(L.canAddItems(o),false,'fully paid order cannot change');
  assert.throws(()=>L.addLines(o,[{itemId:'x',name:'x',qty:1,unitPrice:1}],{by:'a'})); }
{ assert.equal(L.canAddItems(mk({status:'void'})),false); assert.equal(L.canAddItems(mk({status:'closed'})),false);
  assert.equal(L.canAddItems(mk({channel:'website',web:{id:1,total:100}})),false); assert.equal(L.canAddItems(mk({refunds:[{amount:5}]})),false); }
console.log('ITEM VOID / ADD ITEMS TESTS PASSED');
