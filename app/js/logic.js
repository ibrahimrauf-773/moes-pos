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
export const lineTotal=l=>l.lineTotalOverride!=null?l.lineTotalOverride:lineUnit(l)*(l.qty||1);
export function computeTotals(o, settings={}){
  const subtotal=(o.lines||[]).reduce((a,l)=>a+lineTotal(l),0);
  let discount=0; const d=o.discount;
  if(d){ discount = d.type==='pct'? Math.round(subtotal*d.value/100) : Math.min(subtotal, d.value||0); }
  const delivery=o.delivery?.charge||0;
  const taxable=subtotal-discount;
  const gst = settings.gstOn ? Math.round(taxable*(settings.gstPct||0)/100) : 0;
  let total=taxable+delivery+gst;
  if(o.channel==='foodpanda' && o.fp?.total!=null) total=o.fp.total; // FP totals are authoritative
  return {subtotal,discount,delivery,gst,total};
}
export const paid=o=>(o.payments||[]).reduce((a,p)=>a+(p.amount||0),0);
export const refunded=o=>(o.refunds||[]).reduce((a,r)=>a+(r.amount||0),0);
export const isCounted=o=>o.status!=='void' && o.status!=='cancelled';

// Permission rules (policy from owner, Oct 28)
export function discountNeedsOwner(role, d, policy){
  if(!d) return false; if(role==='owner') return false;
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
export function shiftReport({orders, expenses=[], shift=null, zones=[], payMethods=[], policy={}}){
  const counted=orders.filter(isCounted);
  const r={byChannel:{},byPay:{},items:{},adjustments:[],deliveryByZone:{},expenses:[],fp:{orders:0,gross:0,commissionPct:policy.fpCommissionPct??23,commissionEst:0,payoutEst:0},samples:{}};
  const ch=k=>r.byChannel[k]??={orders:0,gross:0};
  for(const o of counted){
    const t=computeTotals(o,policy); const c=ch(o.channel); c.orders++; c.gross+=t.total;
    if(o.channel==='foodpanda'){ r.fp.orders++; r.fp.gross+=t.total; }
    for(const p of o.payments||[]){ (r.byPay[p.method]??={count:0,amount:0}); r.byPay[p.method].count++; r.byPay[p.method].amount+=p.amount||0; }
    if(!(o.payments||[]).length && o.channel==='foodpanda'){ (r.byPay.fp_online??={count:0,amount:0}); r.byPay.fp_online.count++; r.byPay.fp_online.amount+=t.total; }
    for(const l of o.lines||[]){
      const key=l.itemId+'|'+l.name; const it=r.items[key]??={itemId:l.itemId,name:l.name,units:0,amount:0,sample:!!l.sample};
      it.units+=l.qty||1; it.amount+=(l.unitPrice||0)*(l.qty||1)+(l.lineTotalOverride!=null?l.lineTotalOverride-lineUnit(l)*(l.qty||1):0);
      if(l.sample){ r.samples[l.name]=(r.samples[l.name]||0)+(l.qty||1); }
      for(const a of l.addons||[]){ const ak='addon:'+a.id+'|'+a.name; const ai=r.items[ak]??={itemId:a.id,name:'Add-on: '+a.name,units:0,amount:0};
        ai.units+=l.qty||1; ai.amount+=(a.price||0)*(l.qty||1); }
    }
    if(o.discount && t.discount) r.adjustments.push({orderNo:o.orderNo,type:o.discount.kind==='comp'?'comp':(o.discount.kind==='staff'?'staff meal':'discount'),amount:t.discount,reason:o.discount.reason||'',by:o.discount.approvedBy||o.staffId||''});
    for(const f of o.refunds||[]) r.adjustments.push({orderNo:o.orderNo,type:'refund',amount:f.amount,reason:f.reason,by:f.by,method:f.method});
    if(o.delivery){ const z=r.deliveryByZone[o.delivery.zone||'?']??={orders:0,charged:0,riderFare:0,diff:0};
      z.orders++; z.charged+=o.delivery.charge||0; z.riderFare+=o.delivery.riderFare||0; z.diff=z.charged-z.riderFare; }
  }
  for(const o of orders.filter(o=>!isCounted(o))) r.adjustments.push({orderNo:o.orderNo,type:o.status,amount:computeTotals(o,policy).total,reason:o.voidReason||'',by:o.voidBy||''});
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
  return r;
}
export function csvEscape(v){ v=v==null?'':String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
export const toCSV=rows=>rows.map(r=>r.map(csvEscape).join(',')).join('\n');
export function reportCSV(r, meta={}){
  const rows=[['Moe\'s Hot Chicken - nightly report'],['Business date',meta.businessDate||''],['Location',meta.location||''],[]];
  rows.push(['Section','Key','Count/Units','Amount (Rs)','Extra']);
  for(const [k,v] of Object.entries(r.byChannel)) rows.push(['Channel',k,v.orders,v.gross]);
  rows.push(['Total','all channels',r.totals.orders,r.totals.gross]);
  for(const [k,v] of Object.entries(r.byPay)) rows.push(['Payment',k,v.count,v.amount]);
  for(const i of r.itemList) rows.push(['Item',i.name,i.units,i.amount]);
  for(const [k,v] of Object.entries(r.samples||{})) rows.push(['Samples (Rs0)',k,v,0]);
  for(const a of r.adjustments) rows.push(['Adjustment:'+a.type,'#'+(a.orderNo??''),'',a.amount,`${a.reason||''} (by ${a.by||'?'})`]);
  for(const [z,v] of Object.entries(r.deliveryByZone)) rows.push(['Delivery zone '+z,'charged / rider fare / diff',v.orders,v.charged,`rider ${v.riderFare}; diff ${v.diff}`]);
  for(const e of r.expenses) rows.push(['Till expense',e.code+' '+(e.codeName||''),'',e.amount,e.note||'']);
  rows.push(['Foodpanda','orders/gross',r.fp.orders,r.fp.gross],['Foodpanda','commission est '+r.fp.commissionPct+'%','',r.fp.commissionEst],['Foodpanda','payout est','',r.fp.payoutEst],['Foodpanda','actual payout / batch','',r.fp.actualPayout??'',r.fp.payoutBatch||'']);
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
