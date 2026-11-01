import * as H from './helpers.mjs';
const b=await H.launch(); const p=await H.newPage(b); await p.goto(H.BASE); await p.waitForFunction(()=>window.__ready); await H.login(p,'shaheer','1111');
await H.go(p,'pos'); await H.add(p,'baja'); await H.add(p,'baja'); await H.openCheckout(p);
const txt=await p.textContent('[data-t=q-card]'); console.log('ROW:',txt.replace(/\s+/g,' '));
await p.screenshot({path:'screens/payment-card-8pct.png'});
await p.click('[data-t=q-card]'); await H.sleep(p,400);
const o=await H.lastOrder(p); console.log(JSON.stringify({pay:o.payments.map(x=>[x.method,x.amount,x.cardTax,x.charged]),cardTax:o.cardTax,total:o.totals.total}));
await H.go(p,'reports'); console.log('REP:',(await p.textContent('[data-t=r-cardtax]')).replace(/\s+/g,' '));
await b.close();
