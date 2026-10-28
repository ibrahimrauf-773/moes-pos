// Tiny static server for local use / tests: node tools/serve.mjs [dir] [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dir=path.resolve(process.argv[2]||'app'), port=+(process.argv[3]||8080);
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
http.createServer((q,r)=>{ let p=decodeURIComponent(new URL(q.url,'http://x').pathname); if(p.endsWith('/')) p+='index.html'; const f=path.join(dir,p);
  if(!f.startsWith(dir)||!fs.existsSync(f)){ r.writeHead(404); return r.end('not found'); } r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'}); fs.createReadStream(f).pipe(r); })
 .listen(port,'127.0.0.1',()=>console.log('serving',dir,'on http://127.0.0.1:'+port));
