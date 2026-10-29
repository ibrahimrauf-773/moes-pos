import {chromium} from 'playwright-core';
export const BASE=process.env.BASE||'http://127.0.0.1:8080/';
export const IPAD_UA='Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const launch=()=>chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
export async function newPage(b,{viewport={width:1366,height:768},ipad=false,init}={}){ const ctx=await b.newContext({viewport,userAgent:ipad?IPAD_UA:undefined,hasTouch:ipad});
  if(init) await ctx.addInitScript(init); const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); p.ctx=ctx;
  await p.goto(BASE); await p.waitForFunction(()=>window.__ready); return p; }
export const sleep=(p,ms=150)=>p.waitForTimeout(ms);
export async function login(p,id,pin){ await p.click(`[data-staff="${id}"]`); await p.fill('[data-t=pin]',pin); await p.click('[data-k="OK"]'); await p.waitForSelector('[data-nav]'); await sleep(p); }
export async function go(p,v){ await p.evaluate(v=>window.__pos.go(v),v); await sleep(p,250); }
export async function channel(p,k){ await p.click(`[data-ch="${k}"]`); await sleep(p); }
export async function add(p,id,{heat,heat2,addons=[],qty,note}={}){ await p.click(`[data-item="${id}"]`); await sleep(p);
  if(await p.$('[data-t=item-popup]')){ if(heat) await p.check(`[data-t="heat-${heat.replace(/ /g,'')}"]`); if(heat2) await p.check(`[data-t="heat2-${heat2.replace(/ /g,'')}"]`);
    for(const a of addons) await p.click(`[data-t="addon-${a}-plus"]`); if(qty) await p.fill('[data-t=qty]',String(qty)); if(note) await p.fill('[data-t=lnote]',note); await p.click('[data-t=modal-ok]'); await sleep(p); return; }
  if(await p.$('[data-t=modal]')){ for(const a of addons) await p.check(`[data-t="addon-${a}"]`);
    if(qty) await p.fill('[data-t=qty]',String(qty)); if(note) await p.fill('[data-t=lnote]',note); await p.click('[data-t=modal-ok]'); await sleep(p); } }
export async function newOrder(p){ if(await p.$('[data-t=done-new]')){ await p.click('[data-t=done-new]'); await sleep(p); } }
export async function whatsapp(p,{phone,name,addr='House 1',zone}){ await channel(p,'whatsapp'); await p.fill('[data-t=cphone]',phone); await p.press('[data-t=cphone]','Tab'); await sleep(p);
  await p.fill('[data-t=cname]',name); await p.press('[data-t=cname]','Tab'); await p.fill('[data-t=caddr]',addr); await p.press('[data-t=caddr]','Tab'); await p.selectOption('[data-t=zone]',zone); await sleep(p); }
export async function fp(p,id,total){ await channel(p,'foodpanda'); await p.fill('[data-t=fpid]',id); await p.press('[data-t=fpid]','Tab'); await sleep(p); }
export async function fpTotal(p,total){ await p.evaluate(()=>{ const d=document.querySelector('details.fpt'); if(d) d.open=true; }); await p.fill('[data-t=fptotal]',String(total)); await p.press('[data-t=fptotal]','Tab'); await sleep(p); }
export async function openCheckout(p){ await p.click('[data-t=checkout]'); await sleep(p); }
export async function pay(p,pays,{unpaid=false,tendered}={}){ await openCheckout(p); const err=await p.$('[data-t=modal]'); if(!err){ const tt=await toastText(p); return / saved/.test(tt)&&await p.$('[data-t=done-card]')?{ok:true}:{error:tt}; }
  if(await p.$('[data-t=pay-split]')){ await p.click('[data-t=pay-split]'); await sleep(p); }
  for(const i of await p.$$('[data-t^="pay-"]')) await i.fill('');
  for(const [m,a] of Object.entries(pays)) await p.fill(`[data-t="pay-${m}"]`,String(a)); if(unpaid) await p.check('[data-t=unpaid]'); if(tendered) await p.fill('[data-t=tendered]',String(tendered));
  await p.click('[data-t=modal-ok]'); await sleep(p,300); if(await p.$('[data-t=modal]')) return {error:await p.textContent('[data-t=modal-err]')}; return {ok:true}; }
export async function toastText(p){ const t=await p.$$('[data-t=toast]'); return t.length?await t[t.length-1].textContent():''; }
export async function modalOk(p){ await p.click('[data-t=modal-ok]'); await sleep(p,250); }
export const orders=p=>p.evaluate(()=>window.__pos.db.all('orders').then(o=>o.sort((a,b)=>a.createdAt-b.createdAt)));
export const lastOrder=async p=>(await orders(p)).at(-1);
export async function setOffset(p,ms){ await p.evaluate(ms=>window.__TEST_OFFSET=ms,ms); }
export async function setPKT(p,y,mo,d,h,mi){ const target=Date.UTC(y,mo-1,d,h-5,mi); await p.evaluate(t=>window.__TEST_OFFSET=t-Date.now(),target); }
export async function discount(p,{kind='customer',type='pct',value='',reason='test'}){ await p.click('[data-t=discount]'); await sleep(p); await p.selectOption('[data-t=dkind]',kind); await p.selectOption('[data-t=dtype]',type); await p.fill('[data-t=dvalue]',String(value)); await p.fill('[data-t=dreason]',reason); await p.click('[data-t=modal-ok]'); await sleep(p,300); }
export async function ownerPin(p,pin){ await p.fill('[data-t=owner-pin]',pin); await p.click('[data-t=modal-ok]'); await sleep(p,400); }
export async function orderRowAct(p,orderNo,act){ await go(p,'orders'); if(act==='pay'||act==='reprint'||act==='kreprint'||act==='detail'){ await p.click(`tr[data-no="${orderNo}"] [data-act="${act}"]`); await sleep(p); return; } await p.click(`tr[data-no="${orderNo}"] [data-act="detail"]`); await sleep(p); await p.click(`[data-t=d-${act}]`); await sleep(p); }
