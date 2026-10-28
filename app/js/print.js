// Printing: laptop -> local helper (http://127.0.0.1:9123) sends raw ESC/POS to the USB printer.
// Failures go to a persistent retry queue; sales are never blocked. Fallback: browser print with 80mm CSS.
import * as db from './db.js'; import {receipt,kitchenTicket} from './escpos.js';
export const isIPad=()=>/iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||/iPhone|Android/.test(navigator.userAgent);
export async function printingEnabled(){ const s=await db.kvGet('print',{mode:'auto'}); if(s.mode==='off') return false; if(s.mode==='on') return true; return !isIPad(); }
const b64=u8=>{ let s=''; for(const c of u8) s+=String.fromCharCode(c); return btoa(s); };
export async function helperUrl(){ return (await db.kvGet('print',{})).helper||'http://127.0.0.1:9123'; }
async function send(job){ const url=await helperUrl(); const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),4000);
  try{ const r=await fetch(url+'/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,kind:job.kind,data:job.data,text:job.text}),signal:ctl.signal});
    if(!r.ok) throw new Error('helper '+r.status); return true; } finally{ clearTimeout(t); } }
export function build(kind,order,settings){ return kind==='kitchen'?kitchenTicket(order):receipt(order,settings); }
export async function queue(kind,order,settings){
  if(!(await printingEnabled())) return {skipped:true};
  const doc=build(kind,order,settings);
  const job={id:order.id+':'+kind+':'+Date.now(),kind,orderId:order.id,orderNo:order.orderNo,data:b64(doc.bytes()),text:doc.text.join('\n'),tries:0,status:'pending',at:Date.now()};
  await db.put('printJobs',job,true); return processQueue();
}
let busy=false;
export async function processQueue(){ if(busy) return {busy:true}; busy=true; let ok=0, fail=0;
  try{ for(const j of (await db.all('printJobs')).filter(j=>j.status==='pending').sort((a,b)=>a.at-b.at)){
      try{ await send(j); j.status='done'; ok++; }catch(e){ j.tries++; j.error=String(e.message||e); fail++; if(j.tries===1&&j.kind==='receipt'&&(await db.kvGet('print',{})).fallback){ try{ browserPrint(j.text); j.fallbackShown=true; }catch{} } }
      await db.put('printJobs',j,true); if(fail) break; } }
  finally{ busy=false; } return {ok,fail}; }
export async function pending(){ return (await db.all('printJobs')).filter(j=>j.status==='pending'); }
export function browserPrint(text){ const w=window.open('','_blank','width=400,height=600'); if(!w) return;
  w.document.write(`<style>@page{size:80mm auto;margin:0}body{width:72mm;margin:2mm;font:12px/1.25 monospace;white-space:pre}</style>${text.replace(/[<&]/g,c=>c==='<'?'&lt;':'&amp;')}`); w.document.close(); w.focus(); w.print(); }
setInterval(()=>processQueue().catch(()=>{}),20000);
