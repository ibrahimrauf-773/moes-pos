// Minimal PostgREST stand-in for the moes_records table (used by the E2E sync tests).
import http from 'node:http';
export function startMock(port=54321,shopKey='test-shop'){
  const rows=new Map(); let seq=0; const st={down:false,posts:0};
  const srv=http.createServer((q,r)=>{ const u=new URL(q.url,'http://x');
    r.setHeader('Access-Control-Allow-Origin','*'); r.setHeader('Access-Control-Allow-Headers','*'); r.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    if(q.method==='OPTIONS'){ r.writeHead(204); return r.end(); }
    if(st.down){ r.writeHead(503); return r.end('down'); }
    if(q.headers['x-shop-key']!==shopKey){ r.writeHead(401); return r.end('bad shop key'); }
    if(u.pathname!=='/rest/v1/moes_records'){ r.writeHead(404); return r.end(); }
    if(q.method==='POST'){ let b=''; q.on('data',c=>b+=c); q.on('end',()=>{ st.posts++; for(const row of JSON.parse(b)){ if(row.store==='secure'){ r.writeHead(400); return r.end('secure refused'); }
          const ex=rows.get(row.id); if(ex&&row.updated_at<ex.updated_at) continue; rows.set(row.id,{...row,seq:++seq}); } r.writeHead(201); r.end(); }); return; }
    const since=+(u.searchParams.get('seq')||'gt.0').slice(3), lim=+(u.searchParams.get('limit')||500);
    const out=[...rows.values()].filter(x=>x.seq>since).sort((a,b)=>a.seq-b.seq).slice(0,lim); r.writeHead(200,{'Content-Type':'application/json'}); r.end(JSON.stringify(out)); });
  return new Promise(res=>srv.listen(port,'127.0.0.1',()=>res({rows,st,close:()=>srv.close()})));
}
