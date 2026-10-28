// Before/after screenshots for the redesign: node test/screens-redesign.mjs before|after
import * as H from './helpers.mjs';
const tag=process.argv[2]||'after'; const OUT='/workspace/pos_build/screens/redesign-'+tag+'-';
const b=await H.launch();
const VPS=[['1366',{width:1366,height:768},false],['ipad',{width:1024,height:768},true],['phone',{width:390,height:844},false]];
for(const [n,viewport,ipad] of VPS){ const p=await H.newPage(b,{viewport,ipad}); await H.login(p,'shaheer','1111');
  await H.go(p,'pos'); await H.add(p,'combo1',{heat:'Hot'}); await H.add(p,'mac',{heat:'Medium'}); await p.screenshot({path:OUT+n+'-pos.png'});
  const t=+((await p.textContent('[data-t=total]')).replace(/\D/g,'')); await H.pay(p,{cash:t}); await H.sleep(p,400); await p.screenshot({path:OUT+n+'-charged.png'});
  await H.add(p,'baja'); await H.pay(p,{cash:199}); await H.go(p,'orders'); await p.screenshot({path:OUT+n+'-orders.png'});
  await H.go(p,'live'); await p.screenshot({path:OUT+n+'-live.png'}); await p.ctx.close(); }
await b.close(); console.log('shots',OUT);
