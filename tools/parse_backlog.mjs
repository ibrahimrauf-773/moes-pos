// Parses pending_orders/orders.md into an import file (NOT shipped in the public app).
// Usage: node tools/parse_backlog.mjs <orders.md> <out.json>
import fs from 'fs';
const [,, src='/workspace/pending_orders/orders.md', out='/workspace/moes-pos-private/backlog_import.json'] = process.argv;
const MON={Oct:10,Nov:11};
const ITEMS=[ // [regex, fp item id, base fp price]
 [/combo\s*1/i,'combo1',1199],[/combo\s*2/i,'combo2',1349],[/combo\s*3/i,'combo3',1299],
 [/loaded\s*fries/i,'loaded_fries',749],[/mozz/i,'mozz',899],[/mac/i,'mac',1499],
 [/white\s*sauce/i,'white_sauce',120],[/moe'?s\s*sauce|extra\s*sauce/i,'moes_sauce',120],[/hot\s*honey/i,'hot_honey',100],
 [/dinner\s*roll|^roll/i,'dinner_roll',40],[/baja/i,'baja',199],[/curly\s*fries/i,'curly_fries',150]];
const HEAT=[[/extra\s*hot|\bXH\b/i,'Extra Hot'],[/\bmild\b/i,'Mild'],[/\bmed(ium)?\b/i,'Medium'],[/\bhot\b/i,'Hot'],[/reaper/i,'Reaper']];
const num=s=>Number(String(s).replace(/,/g,''));
function parseItem(seg){
  seg=seg.trim(); if(!seg) return null;
  let qty=1, m;
  if((m=seg.match(/^(\d+)x\s*/i))){qty=+m[1];seg=seg.slice(m[0].length);}
  if((m=seg.match(/\bx(\d+)\b/i))){qty=+m[1];seg=seg.replace(m[0],'');}
  const main=seg.split(/\s+(?:w\/|\+)\s*|\(/)[0];
  const def=ITEMS.find(([r])=>r.test(main)); if(!def) return {unparsed:seg};
  let heat=null; const hm=seg.match(/\(([^)]*)\)/); const hs=hm?hm[1]:seg.replace(main,'')+' '+main;
  for(const [r,h] of HEAT){ if(r.test(hs.replace(/hot honey/ig,''))){heat=h;break;} }
  const prices=[...seg.matchAll(/(?:@\s*)?(\d{1,2},\d{3}|\d{2,5})(?![\d:])/g)].map(x=>({v:num(x[1]),at:x[0].includes('@')}));
  let lineTotal=null; if(prices.length){const p=prices[prices.length-1]; lineTotal=p.at?p.v*qty:p.v;}
  const notes=[]; const mods=seg.match(/(?:w\/|\+)\s*(.*)$/); if(mods) notes.push(mods[1].replace(/\d[\d,]*$/,'').trim());
  if(hm && /no |allerg|spicy cheese/i.test(hm[1])) notes.push(hm[1]);
  if(/\(spicy\)/.test(seg)) notes.push('spicy');
  return {itemId:def[1],qty,heat,lineTotal,listPrice:def[2],note:notes.filter(Boolean).join('; ')||undefined};
}
function bizToPlaced(date,time){ if(!time) return null; const [h,mi]=time.split(':').map(Number);
  const d=new Date(Date.UTC(2026,date.m-1,date.d,h-5,mi)); if(h<7) d.setUTCDate(d.getUTCDate()+1); return d.toISOString(); }
const lines=fs.readFileSync(src,'utf8').split('\n');
let sec=null; const orders=[], sections=[], issues=[];
for(const raw of lines){ const L=raw.trim(); if(!L) continue;
  let m;
  if((m=L.match(/^##\s*\w{3}\s+(Oct|Nov)\s+(\d+)(.*)$/))){
    const rest=m[3]; const ch=/whatsapp/i.test(rest)&&!/foodpanda/i.test(rest)?'whatsapp':(/foodpanda/i.test(rest)?'foodpanda':null);
    sec={date:{m:MON[m[1]],d:+m[2]},bd:`2026-${String(MON[m[1]]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`,channel:ch,header:L};
    const c=rest.match(/\((\d+)[^,]*,\s*(?:gross\s*)?Rs\s*([\d,]+)/i)||rest.match(/(\d+)\s*completed,\s*Rs\s*([\d,]+)/i)||rest.match(/\((\d+)\s*orders,\s*Rs\s*([\d,]+)/i);
    sections.push({bd:sec.bd,channel:ch,header:L,expCount:c?+c[1]:null,expTotal:c?num(c[2]):null}); continue; }
  if(!sec) continue;
  if(/^WhatsApp:\s*no orders/i.test(L)) continue;
  if((m=L.match(/^Foodpanda:\s*(\d+)\s*completed.*?Rs\s*([\d,]+)/i))){sec.channel='foodpanda';const s=sections.at(-1);s.channel='foodpanda';s.expCount=+m[1];s.expTotal=num(m[2]);continue;}
  if((m=L.match(/full night is (\d+) orders, Rs ([\d,]+)/i))||(m=L.match(/Full night:\s*(\d+) orders, Rs ([\d,]+)/i))){const s=sections.at(-1);s.expCount=+m[1];s.expTotal=num(m[2]);
    if(/CORRECTION/.test(L)) continue; }
  if(/^\d+ completed, subtotal/i.test(L)) continue;
  if(/^(CORRECTION|Item details|Oct \d+ post-midnight)/i.test(L)) continue;
  if(/^8\. apb3 1,439 \|/.test(L)) continue; // totals-only duplicate of lines given later
  // WhatsApp
  if((m=L.match(/^- #(\d+)\s+([^:]+):\s*(.*)$/))){
    const no=+m[1]; if(no>=1600&&no<=1602){issues.push('skipped test order #'+no);continue;}
    const parts=m[3].split(';').map(s=>s.trim()); const items=[]; let deliv=null,total=null,payNote='';
    for(const p of parts){ let mm;
      if((mm=p.match(/delivery Zone (\w)\s*(?:Rs)?\s*(\d+)/i))){deliv={zone:mm[1],charge:+mm[2]};continue;}
      if((mm=p.match(/^total\s*(?:Rs)?\s*([\d,]+)/i))){total=num(mm[1]);continue;}
      if(/bank|COD|Raast|InDrive|cash/i.test(p)){payNote+=(payNote?'; ':'')+p;continue;}
      const it=parseItem(p.replace(/^Extra Dinner Roll/i,'Dinner Roll')); if(it) items.push(it); }
    let pay='cash', status='received';
    if(/HBL|Raast|bank/i.test(payNote)) pay='hbl'; if(/unverified/i.test(payNote)) status='unverified';
    for(const i of items) delete i.listPrice;
    orders.push({orderNo:no,channel:'whatsapp',businessDate:sec.bd,customer:{name:m[2].trim()},items,delivery:deliv,total,payments:[{method:pay,amount:total,status,note:payNote}],note:payNote});
    continue; }
  if(sec.channel!=='foodpanda') { if(!/^#/.test(L)) issues.push('unhandled: '+L); continue; }
  // Totals-only lines "rsjx 2368; e2dc 2518"
  if(/^[a-z0-9]{4} [\d,]+(;|\s*\(|$)/i.test(L) && !/[A-Z][a-z]{2,}\s\d/.test(L.split(';')[0].slice(5))){
    for(const seg of L.split(';')){ const mm=seg.trim().match(/^([a-z0-9]{4})\s+([\d,]+)\s*(?:\((.*)\))?/i); if(mm) orders.push({fpId:mm[1],channel:'foodpanda',businessDate:sec.bd,items:[],fpTotal:num(mm[2]),note:mm[3],itemsPending:true}); }
    continue; }
  // Item lines. forms: "1 03b3 ...", "3. kutw 21:01 - ...", "t31l 19:47 2,068 - ...", "1. p25h-2644-75uj 19:20 Rs 2,218: ..."
  m=L.match(/^(?:\d+\.?\s+)?([a-z0-9]{4}|p25h-\d{4}-[a-z0-9]{4})\s+(?:\((pickup)\)\s*)?(?:(\d{1,2}:\d{2})\s*)?(?:(?:Rs\s*)?([\d,]+)\s*(?:-|:)\s*|-\s*)?(.*)$/i);
  if(!m){issues.push('unparsed: '+L);continue;}
  let [,id,pickup,time,headTotal,body]=m; let note='';
  const dash=body.match(/\s+—\s+note:\s*(.*)$/)||body.match(/\s+—\s+(.*)$/); if(dash){note=dash[1];body=body.slice(0,dash.index);}
  let explicit=null; let mm;
  if((mm=body.match(/=\s*([\d,]+)\s*(\((.*)\))?\s*$/))){explicit=num(mm[1]);if(mm[3])note=(note?note+'; ':'')+mm[3];body=body.slice(0,mm.index);}
  const tailNote=body.match(/\s\(((?:NO|extra|use order|incl\.|missing)[^)]*)\)\s*$/i);
  if(tailNote){ if(!/use order total/i.test(tailNote[1])) note=(note?note+'; ':'')+tailNote[1]; body=body.slice(0,tailNote.index);}
  body=body.replace(/;?\s*Baja Blast refunded \(missing item\)/,()=>{note+=(note?'; ':'')+'Baja Blast refunded (missing item)';return '';});
  const segs=[];for(const sg of body.split(/(?:,(?!\d{3})|;)(?![^()]*\))/)){const prev=segs.at(-1);
    if(prev&&/w\//.test(prev)&&!/\d{3}\s*$/.test(prev)) segs[segs.length-1]=prev+' +'+sg.trim(); else segs.push(sg);}
  const items=segs.map(parseItem).filter(Boolean);
  for(const it of items) if(it.unparsed) issues.push(`${id}: unparsed item "${it.unparsed}"`);
  const clean=items.filter(i=>!i.unparsed);
  const sum=clean.reduce((a,i)=>a+(i.lineTotal??NaN),0);
  let fpTotal = headTotal?num(headTotal): explicit ?? (Number.isNaN(sum)?null:sum);
  if(clean.length===1 && clean[0].lineTotal==null && fpTotal) clean[0].lineTotal=fpTotal;
  if(explicit!=null && !Number.isNaN(sum) && explicit!==sum) issues.push(`${id}: lines ${sum} != total ${explicit}`);
  orders.push({fpId:id,channel:'foodpanda',type:pickup?'pickup':'delivery',businessDate:sec.bd,placedAt:bizToPlaced(sec.date,time),placedTime:time,items:clean,fpTotal,note:note||undefined,
    pricesIncomplete: clean.some(i=>i.lineTotal==null) || undefined});
}
// verify vs headers
const byKey={}; for(const o of orders){const k=o.businessDate+'|'+o.channel;(byKey[k]??={n:0,t:0});byKey[k].n++;byKey[k].t+=(o.fpTotal??o.total??0);}
const check=sections.filter(s=>s.expCount!=null).map(s=>{const g=byKey[s.bd+'|'+s.channel]||{n:0,t:0};return {bd:s.bd,channel:s.channel,expCount:s.expCount,gotCount:g.n,expTotal:s.expTotal,gotTotal:g.t,ok:g.n===s.expCount&&g.t===s.expTotal};});
fs.writeFileSync(out,JSON.stringify({kind:'moes-backlog',version:1,source:'pending_orders/orders.md',generatedAt:new Date().toISOString(),orders},null,1));
console.log(JSON.stringify({orders:orders.length,check,issues},null,1));
