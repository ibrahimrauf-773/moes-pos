#!/usr/bin/env node
// Moe's POS print helper – zero dependencies. Receives ESC/POS bytes from the POS page and sends them to the 80mm printer.
// Usage (Windows):  node server.js --share "Black Copper"     (printer shared as \\localhost\Black Copper; shown in README)
//        (Linux/mac): node server.js --device /dev/usb/lp0
//        (network):   node server.js --tcp 192.168.1.50:9100
//        (test):      node server.js --preview-only
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os'), net=require('net'), {execFile}=require('child_process');
const args=process.argv.slice(2); const arg=(k,d)=>{ const i=args.indexOf(k); return i>=0?args[i+1]:d; };
const PORT=+arg('--port',9123), SHARE=arg('--share',null), DEVICE=arg('--device',null), TCP=arg('--tcp',null), PREVIEW_ONLY=args.includes('--preview-only');
const OUT=arg('--out',path.join(os.tmpdir(),'moes-print')); fs.mkdirSync(OUT,{recursive:true});
function send(buf){ return new Promise((res,rej)=>{
  if(PREVIEW_ONLY) return res('preview');
  if(TCP){ const [h,p]=TCP.split(':'); const s=net.connect(+p||9100,h,()=>s.end(buf,()=>res('tcp'))); s.setTimeout(8000,()=>{s.destroy();rej(new Error('printer timeout'));}); s.on('error',rej); return; }
  if(DEVICE){ return fs.writeFile(DEVICE,buf,e=>e?rej(e):res('device')); }
  if(SHARE&&process.platform==='win32'){ const f=path.join(OUT,'job-'+Date.now()+'.bin'); fs.writeFileSync(f,buf);
    return execFile('cmd',['/c','copy','/b',f,`\\\\localhost\\${SHARE}`],{windowsHide:true},(e,so,se)=>e?rej(new Error(se||e.message)):res('share')); }
  rej(new Error('No printer configured. Start with --share "<shared printer name>", --device, or --tcp.')); }); }
const srv=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS'){ res.writeHead(204); return res.end(); }
  if(req.method==='GET'&&req.url==='/health'){ res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true,mode:PREVIEW_ONLY?'preview':TCP?'tcp':DEVICE?'device':SHARE?'share':'none'})); }
  if(req.method==='POST'&&req.url==='/print'){ let body=''; req.on('data',c=>{ body+=c; if(body.length>2e6) req.destroy(); });
    req.on('end',async()=>{ try{ const j=JSON.parse(body); const buf=Buffer.from(j.data,'base64'); if(!buf.length) throw new Error('empty job');
        const id=String(j.id||Date.now()).replace(/[^\w.-]/g,'_'); fs.writeFileSync(path.join(OUT,id+'.bin'),buf); if(j.text) fs.writeFileSync(path.join(OUT,id+'.txt'),j.text);
        const how=await send(buf); console.log(new Date().toISOString(),'printed',id,how); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,how}));
      }catch(e){ console.error('print failed:',e.message); res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.message})); } }); return; }
  res.writeHead(404); res.end(); });
srv.listen(PORT,'127.0.0.1',()=>console.log(`Moe's print helper on http://127.0.0.1:${PORT}  (previews in ${OUT})`));
