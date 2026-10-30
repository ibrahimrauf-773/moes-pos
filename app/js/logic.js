// Pure business logic (no DOM, no DB) - unit-testable in Node.
export const TZ_OFFSET_MIN = 300; // Asia/Karachi, UTC+5, no DST
export const pad=n=>String(n).padStart(2,'0');
export function pkParts(ts){ const d=new Date(new Date(ts).getTime()+TZ_OFFSET_MIN*60000);
  return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate(),h:d.getUTCHours(),mi:d.getUTCMinutes(),dow:d.getUTCDay()}; }
// Business date: shift 7PM-3AM. Anything before noon PKT belongs to the previous calendar date.
export function businessDate(ts=Date.now(), cutoffHour=12){
  const p=pkParts(ts); let t=Date.UTC(p.y,p.m-1,p.d); if(p.h<cutoffHour) t-=86400000;
  const d=new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; }
export const fmtTime=ts=>{const p=pkParts(ts);return `${pad(p.h)}:${pad(p.mi)}`;};
export const fmtDT=ts=>{const p=pkParts(ts);return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)} PKT`;};
export const rs=n=>'Rs '+Math.round(n||0).toLocaleString('en-US');

export const lineUnit=l=>(l.unitPrice||0)+(l.addons||[]).reduce((a,x)=>a+(x.price||0),0);
export const lineTotal=l=>l.foc?0:(l.lineTotalOverride!=null?l.lineTotalOverride:lineUnit(l)*(l.qty||1));
// list value of a line ignoring FOC (for 'value given free' reporting)
export const lineList=l=>l.lineTotalOverride!=null?l.lineTotalOverride:lineUnit(l)*(l.qty||1);
export function computeTotals(o, settings={}){
  const subtotal=(o.lines||[]).reduce((a,l)=>a+lineTotal(l),0);
  let discount=0; const d=o.discount;
  if(d){ discount = d.type==='pct'? Math.round(subtotal*d.value/100) : Math.min(subtotal, d.value||0); }
  const delivery=o.delivery?.charge||0;
  const taxable=subtotal-discount;
  const gst = settings.gstOn ? Math.round(taxable*(settings.gstPct||0)/100) : 0;
  let total=taxable+delivery+gst; if(d?.kind==='foc'){ total=0; }
  if(o.channel==='foodpanda' && o.fp?.total!=null) total=o.fp.total; // FP totals are authoritative
  if(o.channel==='website' && o.web?.total!=null) total=o.web.total; // server-recomputed website total is authoritative
  return {subtotal,discount,delivery,gst,total};
}
// Customer payments only (rider settlement is NOT a customer payment). A COD delivery handed to a Speedway rider
// counts as paid once: by the rider collecting o.rider.collect from the customer.
export const isRiderPay=p=>!!(p&&(p.rider||p.method==='rider_fare'||p.method==='speedway_due'||p.ref==='Speedway settlement'));
export const custPayments=o=>(o.payments||[]).filter(p=>!isRiderPay(p));
export const paid=o=>custPayments(o).reduce((a,p)=>a+(p.amount||0),0)+(o.rider?.collect||0);
// Rider settlement as report entries: what reached the shop (cash/bank/still owed) + the fare the rider kept.
export function riderEntries(o){ const r=o.rider; if(!r) return []; const out=[]; const amt=r.amount||0;
  if(amt>0) out.push(r.settledAt?{method:r.settledVia||'cash',amount:amt,bd:r.settledBd||null}:{method:'speedway_due',amount:amt});
  if((r.collect||0)>amt) out.push({method:'rider_fare',amount:r.collect-amt}); return out; }
// One-time repair for orders saved by the old dispatch code (rider settlement stored as payments, sometimes on top of a
// counter payment for the same money). Returns a description of the change, or null.
// Speedway money flow: rider collects the order total from the customer and pays us total minus the delivery charge;
// the delivery charge goes to Speedway (not our income, not drawer cash).
export function riderPaysText(o,policy={}){ const t=computeTotals(o,policy); const r=o.rider; const d=t.delivery||0;
  const collect=r?r.collect:riderCollect(o,policy); const x=r?r.amount:Math.max(0,collect-d);
  return `Collect from rider: Rs ${x}`; }
// Repair orders saved by older code: rider settlement stored as payments, counter cash entered for money that actually
// came through the rider, or settlement not equal to total minus delivery. Idempotent (rider.v=2). Returns a note or null.
export function repairRiderPayments(o,policy={}){ if(!o) return null; const old=o.payments||[];
  if(!o.rider){ if(!old.some(isRiderPay)) return null; o.payments=old.filter(p=>!isRiderPay(p)); return 'moved rider lines off the payments'; }
  if(o.rider.v===2) return null;
  const t=computeTotals(o,policy); const notes=[]; let keep=old.filter(p=>!isRiderPay(p));
  if(keep.length!==old.length) notes.push('moved '+(old.length-keep.length)+' rider settlement line(s) off the payments');
  if(o.rider.method!=='none'){ const mis=keep.filter(p=>p.method==='cash'&&!p.settle); // paid through the rider, so counter cash is a mis-entry
    for(const p of mis) notes.push('removed counter cash '+p.amount+' (paid through rider)'); keep=keep.filter(p=>!mis.includes(p)); }
  const pre=keep.reduce((a,p)=>a+(p.amount||0),0); const collect=Math.max(0,t.total-pre), amount=Math.max(0,collect-(t.delivery||0));
  if(collect!==o.rider.collect||amount!==o.rider.amount) notes.push(`rider settlement ${o.rider.amount} -> ${amount} (total ${t.total} minus delivery ${t.delivery||0})`);
  o.rider={...o.rider,collect,amount,fare:t.delivery||0,v:2}; o.payments=keep; if(o.change&&!keep.some(p=>p.method==='cash')) o.change=0;
  return notes.length?notes.join('; '):null; }
export const refunded=o=>(o.refunds||[]).reduce((a,r)=>a+(r.amount||0),0);
export const isCounted=o=>o.status!=='void' && o.status!=='cancelled';
// Outstanding (Pay Later / COD) amount on an order. Unpaid money is never cash in the drawer.
export const due=(o,policy={})=>isCounted(o)?Math.max(0,computeTotals(o,policy).total-paid(o)):0;
// Pakistani phone normalisation: +92 / 92 / 0092 / 3xx -> 03xxxxxxxxx
export const normPhone=p=>{ p=String(p||'').replace(/[^\d+]/g,''); if(p.startsWith('+92')) p='0'+p.slice(3); else if(p.startsWith('0092')) p='0'+p.slice(4); else if(p.startsWith('92')&&p.length===12) p='0'+p.slice(2); else if(/^3\d{9}$/.test(p)) p='0'+p; return p; };
export const validPhone=p=>/^03\d{9}$/.test(p);
const top=(m,n=3)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({name:k,count:v}));
// Preferences derived from a customer's order history (newest last). drinkIds: menu ids in drink categories.
export function customerPrefs(orders,drinkIds=new Set(),policy={}){ const os=orders.filter(isCounted).sort((a,b)=>a.createdAt-b.createdAt);
  const heat={}, items={}, addons={}, drinks={}, pay={}, addr={};
  for(const o of os){ for(const l of o.lines||[]){ const q=l.qty||1; if(l.heat) heat[l.heat]=(heat[l.heat]||0)+q; (drinkIds.has(l.itemId)?drinks:items)[l.name]=((drinkIds.has(l.itemId)?drinks:items)[l.name]||0)+q;
      for(const a of l.addons||[]) addons[a.name]=(addons[a.name]||0)+q; }
    for(const p of o.payments||[]) if(!p.settle) pay[p.method]=(pay[p.method]||0)+1; if(o.credit) pay.pay_later=(pay.pay_later||0)+1;
    if(o.customer?.address) addr[o.customer.address]=(addr[o.customer.address]||0)+1; }
  const totals=os.map(o=>computeTotals(o,policy).total);
  return {orders:os.length,spent:totals.reduce((a,b)=>a+b,0),due:os.reduce((a,o)=>a+due(o,policy),0),last:os[os.length-1]||null,
    heat:top(heat,1)[0]?.name||null,items:top(items),addons:top(addons),drinks:top(drinks,2),pay:top(pay,1)[0]?.name||null,address:top(addr,1)[0]?.name||null}; }

// Permission rules (policy from owner, Oct 28)
export function discountNeedsOwner(role, d, policy){
  if(!d) return false; if(role==='owner') return false; if(role==='elles') return true; // Elle's login: any discount needs an owner
  if(d.kind==='staff') return d.type!=='pct' || d.value>policy.staffMealPct;
  if(d.kind==='comp') return true;
  return d.type!=='pct' || d.value>policy.cashierMaxDiscountPct;
}
export function canRefund(role,policy){ return role==='owner' || (role==='cashier' && policy.cashierCanRefund); }
export const needsReason=action=>['void','refund','comp','discount'].includes(action);

// Stock deduction for one order. usage: {itemId:[[stockId,qty,takeawayOnly]]}; bom: [{menuItemId,lines:[{stockId,qty}]}]
export function deductionsFor(order, usage={}, bom=[]){
  const out={}; const add=(id,q)=>{ if(!id||!q) return; out[id]=(out[id]||0)+q; };
  const takeaway=order.type!=='dine-in'&&order.type!=='dine_in';
  const bomMap=Object.fromEntries((bom||[]).map(b=>[b.menuItemId,b.lines]));
  const one=(itemId,qty)=>{
    for(const [sid,q,tOnly] of (usage[itemId]||[])) if(!tOnly||takeaway) add(sid,q*qty);
    for(const b of (bomMap[itemId]||[])) add(b.stockId,b.qty*qty);
  };
  for(const l of order.lines||[]){ one(l.itemId,l.qty||1); for(const a of l.addons||[]) one(a.id,l.qty||1); }
  for(const [sid,q,tOnly] of (usage._order||[])) if(!tOnly||takeaway) add(sid,q);
  return out;
}
// Recipe cost per yield unit given costs by ingredient name (owner-only usage)
export function recipeCost(recipe, costByName){ let c=0, missing=[];
  for(const i of recipe.ingredients){ const k=i.name.toLowerCase(); if(costByName[k]==null){missing.push(i.name);continue;} c+=costByName[k]*i.qty; }
  return {batch:c, perUnit:recipe.yieldQty?c/recipe.yieldQty:0, missing}; }

// ---------- Nightly report (Accountant spec) ----------
export function shiftReport({orders, expenses=[], shift=null, zones=[], payMethods=[], policy={}, settlements=[], outstanding=null}){
  const counted=orders.filter(isCounted);
  const r={byChannel:{},byPay:{},items:{},adjustments:[],deliveryByZone:{},expenses:[],foc:[],fp:{orders:0,gross:0,commissionPct:policy.fpCommissionPct??23,commissionEst:0,payoutEst:0},samples:{},collab:{elles:{name:"Elle's x Moe's",units:0,amount:0,items:{}}}};
  const ch=k=>r.byChannel[k]??={orders:0,gross:0};
  for(const o of counted){
    const t=computeTotals(o,policy); const c=ch(o.channel); c.orders++; c.gross+=t.total-(t.delivery||0); r.deliveryToSpeedway=(r.deliveryToSpeedway||0)+(t.delivery||0);
    if(o.rider&&o.rider.speedwayFare!=null&&o.rider.speedwayFare!==(t.delivery||0)){ const diff=o.rider.speedwayFare-(t.delivery||0); (r.speedwayDiff??=[]).push({orderNo:o.orderNo,charged:t.delivery||0,fare:o.rider.speedwayFare,diff,name:'Speedway delivery difference'}); r.speedwayDiffTotal=(r.speedwayDiffTotal||0)+diff; }
    if(o.channel==='foodpanda'){ r.fp.orders++; r.fp.gross+=t.total; }
    for(const p of [...custPayments(o),...riderEntries(o)]){ if((p.settle||p.bd)&&p.bd&&p.bd!==o.businessDate) continue; (r.byPay[p.method]??={count:0,amount:0}); r.byPay[p.method].count++; r.byPay[p.method].amount+=p.amount||0; }
    if(!custPayments(o).length && o.channel==='foodpanda'){ (r.byPay.fp_online??={count:0,amount:0}); r.byPay.fp_online.count++; r.byPay.fp_online.amount+=t.total; }
    for(const l of o.lines||[]){
      const key=l.itemId+'|'+l.name; const it=r.items[key]??={itemId:l.itemId,name:l.name,units:0,amount:0,sample:!!l.sample};
      it.units+=l.qty||1; it.amount+=l.foc?0:(l.unitPrice||0)*(l.qty||1)+(l.lineTotalOverride!=null?l.lineTotalOverride-lineUnit(l)*(l.qty||1):0);
      if(l.foc) r.foc.push({orderNo:o.orderNo,scope:'item',item:`${l.qty}x ${l.name}`,value:lineList(l),reason:l.foc.reason,by:l.foc.by});
      if(isCollabId(l.itemId)){ const cb=r.collab.elles; const ci=cb.items[l.itemId]??={itemId:l.itemId,name:l.name,units:0,amount:0}; const amt=l.foc?0:lineTotal(l);
        ci.units+=l.qty||1; ci.amount+=amt; cb.units+=l.qty||1; cb.amount+=amt; }
      if(l.sample){ r.samples[l.name]=(r.samples[l.name]||0)+(l.qty||1); }
      for(const a of l.addons||[]){ const ak='addon:'+a.id+'|'+a.name; const ai=r.items[ak]??={itemId:a.id,name:'Add-on: '+a.name,units:0,amount:0};
        ai.units+=l.qty||1; ai.amount+=l.foc?0:(a.price||0)*(l.qty||1); }
    }
    if(o.discount?.kind==='foc') r.foc.push({orderNo:o.orderNo,scope:'order',item:(o.lines||[]).map(l=>`${l.qty}x ${l.name}`).join(', '),value:t.discount,reason:o.discount.reason||'',by:o.discount.approvedBy||''});
    else if(o.discount && t.discount) r.adjustments.push({orderNo:o.orderNo,type:o.discount.kind==='comp'?'comp':(o.discount.kind==='staff'?'staff meal':'discount'),amount:t.discount,reason:o.discount.reason||'',by:o.discount.approvedBy||o.staffId||''});
    for(const f of o.refunds||[]) r.adjustments.push({orderNo:o.orderNo,type:'refund',amount:f.amount,reason:f.reason,by:f.by,method:f.method});
    if(o.delivery){ const z=r.deliveryByZone[o.delivery.zone||'?']??={orders:0,charged:0,riderFare:0,diff:0};
      z.orders++; z.charged+=o.delivery.charge||0; z.riderFare+=o.delivery.riderFare||0; z.diff=z.charged-z.riderFare; }
  }
  for(const o of orders.filter(o=>!isCounted(o))) r.adjustments.push({orderNo:o.orderNo,type:o.status,amount:computeTotals(o,policy).total,reason:o.voidReason||'',by:o.voidBy||''});
  r.salesItems=Object.values(r.byChannel).reduce((a,c)=>a+c.gross,0); r.speedwayDiffTotal=r.speedwayDiffTotal||0; r.profitAfterDelivery=r.salesItems-r.speedwayDiffTotal;
  r.dues={newCredit:counted.reduce((a,o)=>a+due(o,policy),0),creditOrders:counted.filter(o=>due(o,policy)>0).map(o=>({orderNo:o.orderNo,name:o.customer?.name||'',phone:o.customer?.phone||'',due:due(o,policy)})),collected:0,collectedList:[],outstanding};
  for(const p of settlements){ (r.byPay[p.method]??={count:0,amount:0}); r.byPay[p.method].count++; r.byPay[p.method].amount+=p.amount; r.dues.collected+=p.amount; r.dues.collectedList.push(p); }
  for(const o of counted) for(const p of custPayments(o)) if(p.settle&&p.bd===o.businessDate){ r.dues.collected+=p.amount; r.dues.collectedList.push({...p,orderNo:o.orderNo,name:o.customer?.name}); }
  // Speedway rider settlements for orders of this business date (cash counts in the drawer only once received)
  r.speedway={orders:counted.filter(o=>o.rider).map(o=>({orderNo:o.orderNo,zone:o.delivery?.zone,collect:o.rider.collect,fare:o.rider.fare,amount:o.rider.amount,method:o.rider.method,settledAt:o.rider.settledAt||null,settledVia:o.rider.settledVia||null})),pendingTonight:0,outstanding:null};
  r.speedway.pendingTonight=r.speedway.orders.filter(x=>x.method==='later'&&!x.settledAt).reduce((a,x)=>a+x.amount,0);
  r.fp.commissionEst=Math.round(r.fp.gross*r.fp.commissionPct/100); r.fp.payoutEst=r.fp.gross-r.fp.commissionEst;
  r.fp.actualPayout = shift?.fpPayout ?? null; r.fp.payoutBatch = shift?.fpPayoutBatch ?? '';
  let cashExp=0, nonExp=0;
  for(const e of expenses){ r.expenses.push(e); if(e.paidFrom!=='bank'){ if(['DRAW','LOAN-IB'].includes(e.code)) nonExp+=e.amount; else cashExp+=e.amount; } }
  const cashIn=(r.byPay.cash?.amount)||0;
  const cashRefunds=counted.flatMap(o=>o.refunds||[]).filter(f=>f.method==='cash').reduce((a,f)=>a+f.amount,0);
  const opening=shift?.openingFloat||0;
  const expected=opening+cashIn-cashRefunds-cashExp-nonExp;
  const countedCash=shift?.countedCash??null;
  r.till={opening,cashSales:cashIn,cashRefunds,cashExpenses:cashExp,nonExpenseCashOut:nonExp,expected,counted:countedCash,
          leftWithCashier:shift?.leftWithCashier??null,overShort:countedCash==null?null:countedCash-expected};
  r.totals={orders:counted.length,gross:counted.reduce((a,o)=>a+computeTotals(o,policy).total,0),
            refunds:counted.reduce((a,o)=>a+refunded(o),0)};
  r.totals.net=r.totals.gross-r.totals.refunds;
  r.itemList=Object.values(r.items).sort((a,b)=>b.amount-a.amount||b.units-a.units);
  // Elle's collab split: line amounts before any order-level discount; Moe's = item sales minus Elle's.
  const cb=r.collab.elles; cb.itemList=Object.values(cb.items).sort((a,b)=>b.amount-a.amount||b.units-a.units); r.moesItems=r.salesItems-cb.amount;
  return r;
}
export const isCollabId=id=>/^elles_/.test(String(id||''));
export function csvEscape(v){ v=v==null?'':String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
export const toCSV=rows=>rows.map(r=>r.map(csvEscape).join(',')).join('\n');
export function reportCSV(r, meta={}){
  const rows=[['Moe\'s Hot Chicken - nightly report'],['Business date',meta.businessDate||''],['Location',meta.location||''],[]];
  rows.push(['Section','Key','Count/Units','Amount (Rs)','Extra']);
  for(const [k,v] of Object.entries(r.byChannel)) rows.push(['Channel',k,v.orders,v.gross]);
  rows.push(['Total','all channels',r.totals.orders,r.totals.gross]);
  for(const [k,v] of Object.entries(r.byPay)) rows.push(['Payment',k,v.count,v.amount]);
  for(const i of r.itemList) rows.push(['Item',i.name,i.units,i.amount]);
  const cb=r.collab?.elles; if(cb&&cb.units){ for(const i of cb.itemList) rows.push(["Elle's x Moe's (collab)",i.name,i.units,i.amount]);
    rows.push(["Elle's x Moe's (collab)","Elle's subtotal (split with Elle's)",cb.units,cb.amount],["Moe's","Moe's items subtotal (excl. Elle's)",'',r.moesItems]); }
  for(const [k,v] of Object.entries(r.samples||{})) rows.push(['Samples (Rs0)',k,v,0]);
  for(const a of r.adjustments) rows.push(['Adjustment:'+a.type,'#'+(a.orderNo??''),'',a.amount,`${a.reason||''} (by ${a.by||'?'})`]);
  for(const [z,v] of Object.entries(r.deliveryByZone)) rows.push(['Delivery zone '+z,'charged / rider fare / diff',v.orders,v.charged,`rider ${v.riderFare}; diff ${v.diff}`]);
  for(const e of r.expenses) rows.push(['Till expense',e.code+' '+(e.codeName||''),'',e.amount,e.note||'']);
  for(const d of r.speedwayDiff||[]) rows.push(['Delivery expense','Speedway delivery difference #'+d.orderNo,'',d.diff,'billed '+d.charged+', Speedway '+d.fare+' (not from drawer)']);
  rows.push(['Foodpanda','orders/gross',r.fp.orders,r.fp.gross],['Foodpanda','commission est '+r.fp.commissionPct+'%','',r.fp.commissionEst],['Foodpanda','payout est','',r.fp.payoutEst],['Foodpanda','actual payout / batch','',r.fp.actualPayout??'',r.fp.payoutBatch||'']);
  if(r.dues){ rows.push(['Dues','new unpaid / Pay Later today (not cash)',r.dues.creditOrders.length,r.dues.newCredit]); for(const c of r.dues.creditOrders) rows.push(['Dues: unpaid order','#'+(c.orderNo??''),'',c.due,`${c.name} ${c.phone}`]);
    rows.push(['Dues','collected today (settlements)',r.dues.collectedList.length,r.dues.collected]); if(r.dues.outstanding!=null) rows.push(['Dues','total outstanding (all customers)','',r.dues.outstanding]); }
  for(const x of r.foc||[]) rows.push(['FOC ('+x.scope+')','#'+(x.orderNo??''),x.item,0,`value ${x.value}; ${x.reason} (approved ${x.by})`]);
  for(const x of meta.lowStock||[]) rows.push(['Low stock (for Supply)',x.name,x.onHand+' '+x.unit,'',`reorder at ${x.reorderLevel}${x.flag?' / flagged':''}`]);
  for(const w of meta.waste||[]) rows.push(['Waste',w.item,w.qty+' '+w.unit,meta.owner?w.cost:'',`${w.reason} (by ${w.by}, ${w.loc})`]);
  for(const v of meta.recon||[]) rows.push(['Inventory '+v.loc,v.name,`open ${v.opening??''} / exp ${v.expected??''} / close ${v.closing??''}`,meta.owner&&v.cost!=null?v.cost:'',`variance ${v.variance??''}${v.flags.length?' FLAG: '+v.flags.join('; '):''}`]);
  const t=r.till; rows.push(['Till','opening','',t.opening],['Till','cash sales','',t.cashSales],['Till','cash refunds','',t.cashRefunds],['Till','cash expenses','',t.cashExpenses],['Till','partner drawings/loan','',t.nonExpenseCashOut],['Till','expected close','',t.expected],['Till','counted','',t.counted??''],['Till','left with cashier','',t.leftWithCashier??''],['Till','over/short','',t.overShort??'']);
  return toCSV(rows);
}
// Convert parsed backlog record -> app order
export function backlogToOrder(b, menus, zones){
  const menu=b.channel==='foodpanda'?menus.fp:menus.store; const name=id=>(menu.find(m=>m.id===id)||{}).name||id;
  const lines=(b.items||[]).map(i=>({itemId:i.itemId,name:name(i.itemId),qty:i.qty,heat:i.heat||null,note:i.note||'',
     unitPrice:i.lineTotal!=null?Math.round(i.lineTotal/i.qty):(i.listPrice??(menu.find(m=>m.id===i.itemId)||{}).price??0),addons:[]}));
  const placed=b.placedAt?Date.parse(b.placedAt):Date.parse(b.businessDate+'T20:00:00+05:00');
  const o={id:'bk-'+(b.fpId||b.orderNo),source:'backlog',channel:b.channel,type:b.channel==='foodpanda'?(b.type||'delivery'):'delivery',businessDate:b.businessDate,
    createdAt:placed,status:'done',location:'main',lines,note:b.note||'',staffId:'import'};
  if(b.channel==='foodpanda'){ o.fp={orderId:b.fpId,total:b.fpTotal,itemsPending:!!b.itemsPending,pricesIncomplete:!!b.pricesIncomplete}; o.payments=[{method:'fp_online',amount:b.fpTotal}]; }
  else { o.orderNo=b.orderNo; const z=zones.find(z=>z.id===b.delivery?.zone);
    o.delivery=b.delivery?{zone:b.delivery.zone,charge:b.delivery.charge,riderFare:z?.riderFare??b.delivery.charge}:null;
    o.customer=b.customer; o.payments=(b.payments||[]).map(p=>({method:p.method,amount:p.amount,note:p.note,verified:p.status!=='unverified'})); }
  return o;
}

// ---------- Inventory reconciliation (pure) ----------
// logs: invLogs for this loc+date (+prevLogs for previous date). counts are in internal units. moves: stockMoves.
// expected = opening + receipts(delivery+transfer-in) - sent(transfer-out) - sales(recipe/usage deductions, net of void returns) - waste
export const LOG_DATE_CUTOFF=6; // shift date: before 6 AM belongs to the previous day (3 AM close; Home opens 10 AM)
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
export function agreed(logs,phase,itemId){ const v=logs.filter(l=>l.phase===phase&&l.counts&&l.counts[itemId]!=null).map(l=>+l.counts[itemId]); return avg(v); }
export function reconcile({items,logs=[],prevLogs=[],moves=[],loc,date,tolPct=10,owner=false}){
  const rows=[]; const day=moves.filter(m=>m.location===loc&&businessDate(m.at,LOG_DATE_CUTOFF)===date&&!String(m.id).startsWith('cnt:'));
  const sum=(id,types)=>day.filter(m=>m.itemId===id&&types.includes(m.type)).reduce((a,m)=>a+m.qty,0);
  for(const it of items){ if(it.check||it.status) continue; if(!(it[loc==='home'?'home':loc==='mashion'?'mashion':'main'])) continue;
    const f=it.countFactor||1, tol=Math.max(f, 0);
    const opens=logs.filter(l=>l.phase==='opening'&&l.counts?.[it.id]!=null), closes=logs.filter(l=>l.phase==='closing'&&l.counts?.[it.id]!=null);
    const prevClose=agreed(prevLogs,'closing',it.id); let opening=agreed(logs,'opening',it.id); const flags=[];
    if(opening==null) opening=prevClose;
    const receipts=sum(it.id,['delivery','transfer-in']), sent=-sum(it.id,['transfer-out']), sales=-sum(it.id,['sale','void-return']), waste=-sum(it.id,['wastage']);
    const closing=agreed(logs,'closing',it.id);
    const expected=opening==null?null:opening+receipts-sent-sales-waste; const variance=(closing==null||expected==null)?null:closing-expected;
    const big=(a,b)=>Math.abs(a-b)>Math.max(tol, Math.abs(b)*tolPct/100);
    if(variance!=null&&big(closing,expected)) flags.push(`variance ${variance>0?'+':''}${+(variance/f).toFixed(2)} ${it.countUnit||it.unit}`);
    for(const [ph,arr] of [['opening',opens],['closing',closes]]) if(arr.length>1){ const vs=arr.map(l=>+l.counts[it.id]); if(Math.max(...vs)-Math.min(...vs)>Math.max(tol*0.5,Math.max(...vs)*tolPct/100)) flags.push(`${ph} counts differ: `+arr.map(l=>`${l.byName} ${+(l.counts[it.id]/f).toFixed(2)}`).join(' vs ')); }
    for(const l of opens) if(prevClose!=null&&big(+l.counts[it.id],prevClose)) flags.push(`${l.byName} opening ${+(l.counts[it.id]/f).toFixed(2)} ≠ previous closing ${+(prevClose/f).toFixed(2)}`);
    const q=v=>v==null?null:+(v/f).toFixed(2);
    rows.push({id:it.id,name:it.name,loc,unit:it.countUnit||it.unit,opening:q(opening),receipts:q(receipts),sent:q(sent),sales:q(sales),waste:q(waste),expected:q(expected),closing:q(closing),variance:q(variance),
      cost:owner&&variance!=null&&it.costPerUnit?Math.round(variance*it.costPerUnit):null,flags}); }
  return rows; }
export function lowStock(items,onHand,loc='main',checks={}){ return items.filter(i=>!i.status&&!i.collab&&(loc==='mashion'?!!i.bazaarOnly:!i.bazaarOnly)).map(i=>({i,oh:onHand[i.id+'|'+loc]||0})).filter(({i,oh})=>(i.reorderLevel>0&&oh<=i.reorderLevel)||i.reorderFlag||checks[i.id]==='reorder')
  .map(({i,oh})=>({id:i.id,name:i.name,onHand:+(oh/(i.countFactor||1)).toFixed(2),unit:i.countUnit||i.unit,reorderLevel:+(i.reorderLevel/(i.countFactor||1)).toFixed(2),flag:!!i.reorderFlag||checks[i.id]==='reorder',supplier:i.supplier||'',bazaar:!!i.bazaarOnly})); }
// Owner dashboard aggregates over orders of one business date
export function dashboard(orders,policy={}){ const c=orders.filter(isCounted); const tot=o=>computeTotals(o,policy).total;
  const hourly={}; const items={}; const pay={}; const ch={};
  for(const o of c){ const h=pkParts(o.createdAt).h; hourly[h]=(hourly[h]||0)+tot(o);
    const k=o.channel==='instore'?'Walk-in':({whatsapp:'WhatsApp',foodpanda:'Foodpanda',mashion:'Mashion'})[o.channel]||o.channel; (ch[k]??={orders:0,gross:0}); ch[k].orders++; ch[k].gross+=tot(o);
    for(const p of o.payments||[]) if(!p.settle){ pay[p.method]=(pay[p.method]||0)+p.amount; } const d=due(o,policy); if(d) pay.unpaid=(pay.unpaid||0)+d;
    for(const l of o.lines||[]){ const it=items[l.name]??={name:l.name,units:0,amount:0}; it.units+=l.qty||1; it.amount+=lineTotal(l); } }
  const gross=c.reduce((a,o)=>a+tot(o),0);
  return {orders:c.length,gross,aov:c.length?Math.round(gross/c.length):0,hourly,top:Object.values(items).sort((a,b)=>b.units-a.units).slice(0,10),pay,ch}; }

// Plain text for the Speedway WhatsApp group (one field per line).
export function speedwayText(o,policy,zones=[]){ const t=computeTotals(o,policy); const c=o.customer||{};
  const pre=(o.payments||[]).filter(p=>p.method&&!/^(cash|pay_later)$/.test(p.method)&&!p.settle).reduce((a,p)=>a+(p.amount||0),0);
  const collect=Math.max(0,Math.round(t.total-pre)); const z=zones.find(x=>x.id===o.delivery?.zone);
  const addr=String(c.address||'').trim();
  const extra=[c.landmark&&('Landmark: '+c.landmark)].filter(Boolean).join(' | ');
  return [`Customer name: ${c.name||'-'}`,`Contact number: ${c.phone||'-'}`,`Address: ${addr||'-'}${extra?' | '+extra:''}`,
   `Area/Zone: ${z?z.name+(z.areas?' ('+String(z.areas).split(',')[0].trim()+')':''):(o.delivery?.zone||'-')}`,`Order #: ${o.orderNo??'-'}`,
   `Customer pays (COD): Rs ${collect}`,`Rider hands over to Moe's: Rs ${Math.max(0,collect-(t.delivery||0))}`,`Payment: ${collect>0?'COD':'Paid'}`,`Notes: ${String(o.note||'').replace(/\s+/g,' ').trim()||'-'}`].join('\n'); }
export const isDelivery=o=>!!(o.delivery||o.channel==='whatsapp'||o.channel==='website'||o.channel==='phone'||o.type==='delivery');

// ---------- Order status workflow (delivery: website / WhatsApp / phone; pickup: website pickup) ----------
// DB values match online_orders.status. 'ready' = Waiting for rider (delivery) / Ready for pickup.
export const FLOW_DELIVERY=['received','accepted','preparing','ready','out_for_delivery','delivered'];
export const FLOW_PICKUP=['received','accepted','preparing','ready','delivered'];
export const hasFlow=o=>!!o.flow;
export const isPickup=o=>o.flow?.kind==='pickup';
export function flowLabel(o,s=o.flow?.status){ const p=isPickup(o);
  return ({received:'New (not accepted)',accepted:'Accepted',preparing:'Preparing',ready:p?'Ready for pickup':'Waiting for rider',out_for_delivery:'Out for delivery',delivered:p?'Picked up':'Delivered',cancelled:'Cancelled'})[s]||s; }
export function nextStatus(o){ const s=o.flow?.status; if(!s||s==='cancelled') return null; const seq=isPickup(o)?FLOW_PICKUP:FLOW_DELIVERY; const i=seq.indexOf(s); return i>=0&&i<seq.length-1?seq[i+1]:null; }
export function nextLabel(o){ const n=nextStatus(o); if(!n) return null; const p=isPickup(o);
  return ({accepted:'Accept',preparing:'Start preparing',ready:p?'Ready for pickup':'Ready – waiting for rider',out_for_delivery:'Dispatch (rider left)',delivered:p?'Picked up':'Delivered'})[n]; }
// Speedway rider fare by zone (what the rider keeps). Zone table riderFare wins when edited.
export const SPEEDWAY_FARES={A:200,B:300,C:360,D:460,E:560,F:660,G:760,H:860,I:960};
export const riderFare=(o,zones=[])=>{ const z=zones.find(z=>z.id===o.delivery?.zone); return o.delivery?.riderFare??z?.riderFare??SPEEDWAY_FARES[o.delivery?.zone]??0; };
// What the rider collects from the customer: unpaid balance (COD). Prepaid by bank -> 0.
export function riderCollect(o,policy={}){ return due(o,policy); }
// What the rider owes the shop at dispatch: collected minus his fare (never below 0).
export function riderAmount(o,policy={},zones=[]){ const c=riderCollect(o,policy); return c>0?Math.max(0,c-(computeTotals(o,policy).delivery||0)):0; }
// Speedway receivables: dispatched orders where the rider 'pays later' and hasn't settled.
export const speedwayPending=orders=>orders.filter(o=>isCounted(o)&&o.rider?.method==='later'&&!o.rider.settledAt).map(o=>({id:o.id,orderNo:o.orderNo,businessDate:o.businessDate,zone:o.delivery?.zone,amount:o.rider.amount,at:o.rider.at}));
// Customer WhatsApp messages (copy fallback while automation is down)
export function customerMsg(o,kind,shop="Moe's Hot Chicken"){ const c=o.customer||{}; const nm=(c.name||'').split(' ')[0]||'there'; const no='#'+(o.orderNo??''); const t=computeTotals(o).total;
  const ref=o.web?.ref?` (${o.web.ref})`:'';
  return ({accepted:`Hi ${nm}! ${shop} has accepted your order ${no}${ref}. Total: Rs ${t}. We're firing it up now 🔥`,
    ready:isPickup(o)?`Hi ${nm}, your order ${no}${ref} is ready for pickup at ${shop}!`:`Hi ${nm}, your order ${no}${ref} is packed and waiting for the rider.`,
    out_for_delivery:`Hi ${nm}, your order ${no}${ref} is on the way! ${due(o)>0?`Please keep Rs ${due(o)} ready for the rider.`:'It is already paid.'}`,
    delivered:isPickup(o)?`Thanks ${nm}! Enjoy your order ${no} from ${shop} 🔥`:`Hi ${nm}, your order ${no}${ref} has been delivered. Enjoy the heat! 🔥 – ${shop}`})[kind]||''; }
export const MSG_AT={accepted:'accepted',ready:'ready',out_for_delivery:'out_for_delivery',delivered:'delivered'};
// Website order (online_orders row) -> POS order fields (lines/discount/delivery/payments/customer). webToPos maps item ids.
export function webOrderToPos(w,{webToPos={},zones=[]}={}){ const c=w.customer||{};
  const lines=(w.items||[]).map(i=>({itemId:webToPos[i.item_id]||i.item_id,webItemId:i.item_id,name:i.name,qty:i.qty||1,unitPrice:i.unit_price||0,heat:i.spice_level||null,...(i.slider_spice_level&&i.spice_level?{heat2:i.slider_spice_level}:{}),note:i.notes||'',
    addons:(i.modifiers||[]).map(m=>({id:webToPos[m.item_id]||m.item_id,name:m.name,price:m.price||0}))}));
  const z=zones.find(z=>z.id===c.zone);
  const bank={bank_hbl:'hbl',bank_bahl:'bah'}[w.payment_method];
  return {id:'web-'+w.id,channel:'website',type:w.order_type==='pickup'?'takeaway':'delivery',lines,note:[w.notes,c.landmark&&('Landmark: '+c.landmark),c.map_pin_url&&('Pin: '+c.map_pin_url),w.scheduled_for&&('PRE-ORDER for '+fmtDT(Date.parse(w.scheduled_for)))].filter(Boolean).join(' | '),
    discount:w.discount_amount?{kind:'customer',type:'amt',value:w.discount_amount,reason:`Website ${w.discount_pct}%`,approvedBy:'website'}:null,
    customer:{name:c.name||'',phone:normPhone(c.phone),address:c.address||'',landmark:c.landmark||'',area:c.area||''},
    delivery:w.order_type==='delivery'?{zone:c.zone,charge:w.delivery_fee||0,riderFare:z?.riderFare??SPEEDWAY_FARES[c.zone]??0}:null,
    payments:bank?[{method:bank,amount:w.total,at:Date.parse(w.created_at),by:'website',ref:'website transfer',verified:!!w.payment_verified,web:true}]:[],
    unpaid:!bank, web:{id:w.id,ref:w.website_ref,total:w.total,payment_method:w.payment_method,proof:w.payment_proof_url||null,verified:!!w.payment_verified,created_at:w.created_at},
    flow:{kind:w.order_type==='pickup'?'pickup':'delivery',status:w.status,ts:Object.fromEntries(Object.entries(w.status_timestamps||{}).map(([k,v])=>[k,Date.parse(v)]))}}; }
