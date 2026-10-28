import * as H from './helpers.mjs'; import fs from 'node:fs';
const OUT='/workspace/pos_build/screens'; fs.mkdirSync(OUT,{recursive:true});
const b=await H.launch();
for(const [tag,vp,ipad] of [['laptop-1366x768',{width:1366,height:768},false],['ipad-landscape-1024x768',{width:1024,height:768},true],['ipad-portrait-768x1024',{width:768,height:1024},true]]){
  const p=await H.newPage(b,{viewport:vp,ipad}); const shot=async n=>{await p.evaluate(()=>document.querySelectorAll('[data-t=toast]').forEach(t=>t.remove()));return p.screenshot({path:`${OUT}/${tag}-${n}.png`})};
  await shot('01-login'); await p.click('[data-staff=waqar]'); await H.sleep(p); await shot('01b-login-pin'); await H.login(p,'shaheer','1111'); await p.evaluate(()=>{App.persisted=true;}); 
  await p.evaluate(async()=>{ for(const s of await __pos.db.all('staff')){ s.mustChangePin=false; await __pos.db.put('staff',s);} App.user.mustChangePin=false; });
  await H.go(p,'pos'); await shot('02-order-screen');
  await H.add(p,'combo1',{heat:'Hot',addons:['curly_fries'],note:'extra pickles'}); await H.add(p,'mozz',{heat:'Mild'}); await H.add(p,'baja'); await shot('03-cart');
  await H.openCheckout(p); await shot('04-checkout'); await H.modalOk(p);
  await H.whatsapp(p,{phone:'03001234567',name:'Ali',zone:'B'}); await H.add(p,'loaded_fries',{heat:'Extra Hot'}); await H.pay(p,{cash:1049});
  await H.setOffset(p,20*60000); await H.go(p,'kds'); await shot('05-kitchen-display');
  await H.setOffset(p,0); await H.go(p,'inventory'); await shot('06-inventory');
  await H.go(p,'till'); await p.click('[data-t=open-till]'); await H.sleep(p); await p.fill('[data-t=float]','5000'); await H.modalOk(p);
  await p.click('[data-t=close-till]'); await H.sleep(p); await shot('07-till-close'); await p.fill('[data-t=counted]','7500'); await p.fill('[data-t=left]','5000'); await H.modalOk(p); await shot('08-till-after-close');
  await H.go(p,'reports'); await shot('09-report');
  await H.go(p,'orders'); await shot('10-orders');
  console.log(tag,'errors',p.errs); await p.ctx.close(); }
await b.close();
