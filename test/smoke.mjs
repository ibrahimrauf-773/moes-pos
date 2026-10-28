import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1366,height:850}}); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE '+m.text()); });
await p.goto('http://127.0.0.1:8080/'); await p.waitForFunction(()=>window.__ready);
await p.click('[data-staff="shaheer"]'); await p.fill('[data-t=pin]','1111'); await p.click('[data-k="OK"]'); await p.waitForSelector('[data-nav]');
for(const v of ['pos','orders','kds','inventory','till','reports','customers','recipes','settings']){ await p.evaluate(v=>window.__pos.go(v),v); await p.waitForTimeout(300); console.log(v, (await p.textContent('#main')).slice(0,80).replace(/\s+/g,' ')); }
for(const t of ['menu','addons','zones','staff','policy','print','sync','data','log']){ await p.evaluate(t=>{App.setTab=t; window.__pos.go('settings');},t); await p.waitForTimeout(200); }
console.log('ERRORS',errs);
await b.close();
