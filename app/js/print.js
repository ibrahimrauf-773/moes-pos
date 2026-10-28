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
export async function queue(kind,order,settings,{force=false}={}){
  if(!force&&!(await printingEnabled())) return {skipped:true};
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
// Browser fallback: render the 80mm text into an in-page print area and call window.print() synchronously
// (no popup, so iPad Safari's popup blocker can't stop it). CSS @media print shows only #printarea.
export function browserPrint(text){ let a=document.getElementById('printarea'); if(!a){ a=document.createElement('div'); a.id='printarea'; document.body.appendChild(a); }
  a.textContent=text; window.__lastBrowserPrint=text; document.body.classList.add('printing');
  const done=()=>{ document.body.classList.remove('printing'); removeEventListener('afterprint',done); }; addEventListener('afterprint',done);
  try{ window.print(); }finally{ setTimeout(done,1000); } }
// Helper liveness is cached so a tap can choose helper vs browser print without awaiting (keeps the user gesture for print()).
export let helperAlive=false;
export async function checkHelper(){ if(!(await printingEnabled())){ helperAlive=false; return false; }
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),1500);
  try{ const r=await fetch((await helperUrl())+'/health',{signal:ctl.signal}); helperAlive=r.ok; }catch{ helperAlive=false; } finally{ clearTimeout(t); } return helperAlive; }
// Reprint: helper when alive (queued + retried), otherwise browser print dialog. Returns 'helper' | 'browser'.
export function reprint(kind,order,settings){ if(helperAlive){ queue(kind,order,settings,{force:true}); return 'helper'; }
  browserPrint(build(kind,order,settings).text.join('\n')); return 'browser'; }
setInterval(()=>checkHelper().catch(()=>{}),20000); setTimeout(()=>checkHelper().catch(()=>{}),500);
setInterval(()=>processQueue().catch(()=>{}),20000);
