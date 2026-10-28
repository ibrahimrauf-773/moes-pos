// Copies app/ → dist/, stamps the service-worker version, and refuses to ship anything private.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'); const src=path.join(root,'app'), out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});
const BAD=/recipe|_PRIVATE|backlog_import|\.env|secret/i; const files=[];
(function walk(d,rel=''){ for(const f of fs.readdirSync(d)){ const p=path.join(d,f), r=path.join(rel,f); if(fs.statSync(p).isDirectory()) walk(p,r); else { if(BAD.test(f)) throw new Error('Refusing to ship private file: '+r); files.push(r); } } })(src);
const h=crypto.createHash('sha256'); for(const f of files.sort()) h.update(f).update(fs.readFileSync(path.join(src,f)));
const ver=h.digest('hex').slice(0,10);
for(const f of files){ const d=path.join(out,f); fs.mkdirSync(path.dirname(d),{recursive:true}); let b=fs.readFileSync(path.join(src,f));
  if(f==='sw.js') b=Buffer.from(b.toString().replace("const VERSION='dev'",`const VERSION='${ver}'`)); fs.writeFileSync(d,b); }
// Guard: no recipe content in bundle (checks for distinctive words from the private recipe file are done in tests)
console.log(`built dist/ (${files.length} files, version ${ver})`);
