// Offline-first service worker. VERSION and FILES are stamped by tools/build.mjs from the real dist/ contents.
const VERSION='dev';
const FILES=['./','index.html','app.css','manifest.webmanifest','icons/logo-512.png','icons/logo-192.png','icons/logo-180.png','icons/logo-96.png',
 'js/app.js','js/db.js','js/logic.js','js/seed.js','js/crypto.js','js/escpos.js','js/sync.js','js/print.js'];
const CACHE='moes-pos-'+VERSION;
const INDEX=new URL('index.html',self.registration.scope).href;
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>{
    const u=new URL(f,self.registration.scope).href; // cache:'reload' bypasses the HTTP cache so we store fresh copies
    return fetch(new Request(u,{cache:'reload'})).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return c.put(u,r); }); })))
  .then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('moes-pos-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
const timeout=(p,ms)=>new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('timeout')),ms); p.then(v=>{clearTimeout(t);res(v);},e=>{clearTimeout(t);rej(e);}); });
self.addEventListener('fetch',e=>{ const req=e.request; const u=new URL(req.url);
  if(req.method!=='GET'||u.origin!==location.origin) return;
  if(req.mode==='navigate'){ // page loads: try network briefly (gets updates), else cached app shell
    e.respondWith(timeout(fetch(req),3000).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(CACHE).then(ca=>ca.put(INDEX,c)); return r; } throw new Error('bad'); })
      .catch(()=>caches.match(INDEX,{ignoreSearch:true}).then(r=>r||caches.match(new URL('./',self.registration.scope).href)))); return; }
  // assets: cache first (instant, works offline); new versions arrive via a new sw.js VERSION
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(r=>{ if(r.ok&&!u.pathname.includes('/downloads/')){ const c=r.clone(); caches.open(CACHE).then(ca=>ca.put(req,c)); } return r; }))); });
self.addEventListener('message',e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });
