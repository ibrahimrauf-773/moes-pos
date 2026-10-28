// Offline cache. VERSION is stamped by tools/build.mjs.
const VERSION='dev';
const CACHE='moes-pos-'+VERSION;
const FILES=['./','index.html','app.css','manifest.webmanifest','icons/logo-512.png','icons/logo-192.png','icons/logo-180.png','icons/logo-96.png',
 'js/app.js','js/db.js','js/logic.js','js/seed.js','js/crypto.js','js/escpos.js','js/sync.js','js/print.js'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('moes-pos-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin) return;
  // network-first for app code so updates arrive, cache fallback when offline
  e.respondWith(fetch(e.request).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(CACHE).then(ca=>ca.put(e.request,c)); } return r; })
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html')))); });
