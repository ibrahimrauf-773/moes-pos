// Builds 80mm (48 col, Font A) ESC/POS bytes for receipts and kitchen tickets. Pure; no recipe data ever passes through here.
import {computeTotals,lineTotal,rs,fmtDT} from './logic.js';
const W=48; const ESC=0x1b, GS=0x1d;
const cols=(l,r,w=W)=>{ l=String(l); r=String(r); const sp=Math.max(1,w-l.length-r.length); return (l+' '.repeat(sp)+r).slice(0,Math.max(w,l.length+r.length+1)); };
const wrap=(s,w=W)=>{ const out=[]; let cur=''; for(const word of String(s).split(/\s+/)){ if((cur+' '+word).trim().length>w){ out.push(cur); cur=word; } else cur=(cur+' '+word).trim(); } if(cur) out.push(cur); return out; };
const ascii=s=>String(s).normalize('NFKD').replace(/[^\x20-\x7e\n]/g,'');
export class Doc{ constructor(){this.b=[ESC,0x40]; this.text=[];}
  raw(...x){this.b.push(...x);return this;} line(s=''){ s=ascii(s); this.text.push(s); for(const c of s) this.b.push(c.charCodeAt(0)); this.b.push(0x0a); return this; }
  align(n){return this.raw(ESC,0x61,n);} bold(on){return this.raw(ESC,0x45,on?1:0);} big(on){return this.raw(GS,0x21,on?0x11:0);}
  hr(ch='-'){return this.line(ch.repeat(W));} cut(){ this.raw(0x0a,0x0a,0x0a,GS,0x56,0x42,0x00); return this; }
  bytes(){return new Uint8Array(this.b);} }
const PAY={cash:'Cash',hbl:'HBL 6903',bah:'BAH 5901',card:'Card',fp_online:'Foodpanda online'};
export function receipt(o, settings={}){
  const d=new Doc(), t=computeTotals(o,settings);
  d.align(1).bold(1).big(1).line("MOE'S HOT CHICKEN").big(0).bold(0).line(settings.address||'Sport On, Block 3, Clifton, Karachi');
  if(o.location==='mashion') d.line('Mashion Bazaar - Treat Street stall');
  d.align(0).hr().line(cols(`Order #${o.orderNo??''}`, fmtDT(o.createdAt))).line(cols(chName(o), o.fp?.orderId?('FP '+o.fp.orderId):''));
  if(o.customer?.name) d.bold(1).line('Customer: '+o.customer.name).bold(0);
  if(o.type==='delivery'||o.channel==='whatsapp'){ if(o.customer?.phone) d.line('Phone: '+o.customer.phone); if(o.customer?.address) wrap('Address: '+o.customer.address).forEach(x=>d.line(x)); }
  d.hr();
  for(const l of o.lines){ d.line(cols(`${l.qty} x ${l.name}`, rs(lineTotal(l)).replace('Rs ',''))); if(l.heat) d.line('   Heat: '+l.heat);
    for(const a of l.addons||[]) d.line(cols('   + '+a.name, a.price?String(a.price*l.qty):'')); }
  d.hr().line(cols('Subtotal',rs(t.subtotal)));
  if(t.discount) d.line(cols('Discount'+(o.discount?.kind==='staff'?' (staff meal)':''),'-'+rs(t.discount)));
  if(t.delivery) d.line(cols('Delivery '+(o.delivery.zone?'Zone '+o.delivery.zone:''),rs(t.delivery)));
  if(t.gst) d.line(cols('GST',rs(t.gst)));
  d.bold(1).line(cols('TOTAL',rs(t.total))).bold(0);
  for(const p of o.payments||[]) d.line(cols('Paid: '+(PAY[p.method]||p.method),rs(p.amount)));
  if(o.change) d.line(cols('Change',rs(o.change)));
  { const due=Math.max(0,t.total-(o.payments||[]).reduce((a,p)=>a+(p.amount||0),0)); if(o.status!=='void'&&due>0) d.bold(1).line(cols(o.credit?'PAY LATER - DUE':'UNPAID - DUE',rs(due))).bold(0); }
  d.hr().align(1).line('Thank you! Stay hot.').line(settings.footer||'').cut(); return d;
}
export function kitchenTicket(o){
  const d=new Doc(); d.align(1).bold(1).big(1).line(`#${o.orderNo??''} ${chName(o).toUpperCase()}`).big(0).bold(0).line(fmtDT(o.createdAt)).align(0);
  if(o.customer?.name) d.bold(1).line('CUSTOMER: '+o.customer.name).bold(0);
  d.hr('=');
  for(const l of o.lines){ if(l.sample&&!l.qty) continue; d.bold(1).big(1).line(`${l.qty}x ${l.name}`).big(0).bold(0);
    if(l.heat) d.line('   HEAT: '+l.heat.toUpperCase()); for(const a of l.addons||[]) d.line('   + '+a.name); if(l.note) wrap('NOTE: '+l.note,45).forEach(s=>d.line('   '+s)); }
  if(o.note){ d.hr(); wrap('ORDER NOTE: '+o.note).forEach(s=>d.line(s)); }
  d.cut(); return d;
}
export const chName=o=>({dine_in:'Dine-in',takeaway:'Takeaway',whatsapp:'WhatsApp delivery',foodpanda:'Foodpanda',mashion:'Mashion'})[o.channel==='instore'?o.type:o.channel]||o.channel;
