// E2E: void one item (owner + cashier w/ owner PIN), whole-order void still works, add items to an unpaid order, new fries items.
// Run: node tools/serve.mjs app 8080 &  then  node test/item-void-add-e2e.mjs
import * as H from './helpers.mjs';
const ok=(c,m)=>{ if(!c) throw new Error(m||'assertion failed'); };
const b=await H.launch(); let fails=0; const res=[];
async function t(name,fn){ try{ await fn(); res.push('PASS '+name); }catch(e){ fails++; res.push("FAIL "+name+": "+e.message.slice(0,300)+" @ "+(e.stack.split("\n").find(x=>x.includes("e2e.mjs"))||"")); } }
const total=async p=>+((await p.textContent('[data-t=total]')).replace(/[^\d]/g,''));
async function detail(p,o){ await p.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(m=>m.remove())); await H.sleep(p); await H.go(p,'orders'); await p.click(`tr[data-no="${o.orderNo}"] td.ono`); await H.sleep(p,300); }
await t('Fries items on shop menu: Straight 350 on, Curly 600 sold out', async()=>{ const p=await H.newPage(b); await H.login(p,'shaheer','1111'); await H.go(p,'pos');
  const s=await p.textContent('[data-item=straight_fries]'), c=await p.textContent('[data-item=curly_fries_side]'); ok(/Straight Fries/.test(s)&&/350/.test(s),'straight '+s); ok(/Curly Fries/.test(c)&&/SOLD OUT/.test(c),'curly '+c);
  const fp=await p.evaluate(()=>window.__pos.App.menus.fp.items.some(i=>/straight_fries|curly_fries_side/.test(i.id))); ok(!fp,'FP menu changed');
  await H.add(p,'straight_fries'); ok(await total(p)===350,'total'); await p.ctx.close(); });
await t('Owner voids one item: struck through, totals recalc, stock returned, report void section', async()=>{ const p=await H.newPage(b); await H.login(p,'shaheer','1111'); await H.go(p,'pos');
  await H.add(p,'baja'); await H.add(p,'straight_fries'); const tt=await total(p); ok((await H.pay(p,{cash:tt})).ok,'pay');
  let o=await H.lastOrder(p); await detail(p,o); await p.click('[data-t=d-void-item-1]'); await H.sleep(p); await p.fill('[data-t=vreason]','customer changed mind'); await H.modalOk(p); await H.sleep(p,400);
  o=await H.lastOrder(p); ok(o.lines[1].voided&&o.lines[1].voided.by==='Shaheer'&&o.lines[1].voided.reason==='customer changed mind'&&o.lines[1].voided.at,'voided meta '+JSON.stringify(o.lines[1]));
  ok(o.totals.total===tt-350,'total '+o.totals.total); ok(/voided/.test(await p.getAttribute('[data-t=d-line-1]','class')),'struck through'); ok(/VOID/.test(await p.textContent('[data-t=d-line-1]')),'VOID pill');
  ok(!(await p.$('[data-t=d-void-item-0]')),'last item must use Void order');
  await H.go(p,'reports'); const adj=await p.textContent('[data-t=r-adj]'); ok(/void item: 1x Straight Fries/.test(adj)&&/customer changed mind/.test(adj),'report '+adj); await p.ctx.close(); });
await t('Cashier item void needs owner PIN; whole-order void still works', async()=>{ const p=await H.newPage(b); await H.login(p,'waqar','4444'); await H.go(p,'pos');
  await H.add(p,'baja'); await H.add(p,'baja'); await H.add(p,'straight_fries'); const tt=await total(p); ok((await H.pay(p,{cash:tt})).ok,'pay');
  let o=await H.lastOrder(p); await detail(p,o); ok(o.lines.length===2,'lines '+o.lines.length); await p.click('[data-t=d-void-item-0]'); await H.sleep(p);
  ok(await p.$('[data-t=owner-pin]'),'owner pin asked'); await p.fill('[data-t=owner-pin]','4444'); await p.fill('[data-t=vreason]','x'); await H.modalOk(p); ok(await p.$('[data-t=modal-err]'),'wrong pin accepted');
  await p.fill('[data-t=owner-pin]','2222'); await H.modalOk(p); await H.sleep(p,400); o=await H.lastOrder(p); ok(o.lines[0].voided?.by==='Ibrahim','approver '+JSON.stringify(o.lines[0].voided)); ok(o.totals.total===350,'total');
  await detail(p,o); await p.click('[data-t=d-void]'); await H.sleep(p); await p.fill('[data-t=owner-pin]','1111'); await p.fill('[data-t=vreason]','test void'); await H.modalOk(p); await H.sleep(p,400);
  o=await H.lastOrder(p); ok(o.status==='void'&&o.voidBy==='Shaheer','whole void '+o.status); await p.ctx.close(); });
await t('Add items to unpaid Pay Later order: totals, kitchen add-on print with name, paid orders locked', async()=>{ const p=await H.newPage(b); await H.login(p,'shaheer','1111'); await H.go(p,'pos');
  await p.fill('[data-t=cphone]','03001234999'); await p.press('[data-t=cphone]','Tab'); await H.sleep(p); await p.fill('[data-t=cname]','Tab Cust'); await p.press('[data-t=cname]','Tab');
  await H.add(p,'baja'); await H.openCheckout(p); await p.click('[data-t=pay-split]'); await H.sleep(p); for(const i of await p.$$('[data-t^="pay-"]')) await i.fill(''); await p.check('[data-t=paylater]'); await H.modalOk(p); await H.sleep(p,300);
  let o=await H.lastOrder(p); ok(o&&o.credit,'pay later order '+JSON.stringify(o&&{credit:o.credit,unpaid:o.unpaid}));
  await detail(p,o); ok(await p.$('[data-t=d-add-items]'),'Add items button'); await p.click('[data-t=d-add-items]'); await H.sleep(p,400);
  ok(/Adding items to order #/.test(await p.textContent('[data-t=addto-banner]')),'banner'); await H.add(p,'straight_fries'); await H.add(p,'straight_fries');
  ok(/Add to order #/.test(await p.textContent('[data-t=checkout]')),'checkout label'); await p.evaluate(()=>{ window.print=()=>{}; }); await p.click('[data-t=checkout]'); await H.sleep(p,600);
  o=await H.lastOrder(p); const n=(await H.orders(p)).length; const add=o.lines.filter(l=>l.added); ok(add.reduce((a,l)=>a+l.qty,0)===2&&!o.lines[0].added,'lines '+JSON.stringify(o.lines)); ok(o.totals.total===250+700||o.totals.total===199+700,'total '+o.totals.total); ok(n===1,'no new order created');
  const pr=await p.evaluate(()=>window.__lastBrowserPrint||''); ok(/ADD-ON/.test(pr)&&/Tab Cust/.test(pr)&&(pr.match(/Straight Fries/g)||[]).length===2&&!/Baja/.test(pr),'kitchen add-on ticket: '+pr);
  await p.evaluate(()=>document.querySelectorAll('.modal-bg').forEach(m=>m.remove())); await H.sleep(p); await H.go(p,'customers'); await p.click('[data-cust]'); await H.sleep(p,300); await p.click('[data-t=settle]'); await H.sleep(p); await H.modalOk(p); await H.sleep(p,300);
  o=await H.lastOrder(p); await detail(p,o); ok(!(await p.$('[data-t=d-add-items]')),'paid order still offers Add items'); await p.ctx.close(); });
await b.close(); console.log(res.join('\n')); console.log(fails?`${fails} FAILED`:'ALL ITEM VOID / ADD ITEMS E2E PASSED'); process.exit(fails?1:0);
