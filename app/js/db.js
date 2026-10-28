// Tiny IndexedDB wrapper. All data lives on the device; sync is optional.
const DB_NAME='moes-pos', VER=2;
export const STORES=['kv','orders','menus','zones','staff','inventory','stockMoves','expenses','shifts','customers','log','backups','secure','printJobs','invLogs'];
export const SYNCED=['orders','menus','zones','staff','inventory','stockMoves','expenses','shifts','customers','log','invLogs'];
let dbp;
export function open(){ return dbp ??= new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,VER);
  r.onupgradeneeded=()=>{ const db=r.result; for(const s of STORES) if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:'id'}); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
const tx=async(s,mode,fn)=>{ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction(s,mode); const st=t.objectStore(s); let out; const r=fn(st); if(r) r.onsuccess=()=>{out=r.result}; t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); }); };
export const get=(s,id)=>tx(s,'readonly',st=>st.get(id));
export const all=(s)=>tx(s,'readonly',st=>st.getAll());
export const del=(s,id)=>tx(s,'readwrite',st=>st.delete(id));
export const clear=(s)=>tx(s,'readwrite',st=>st.clear());
// put: stamps updatedAt (unless raw) so the sync layer can find changes
let dirtyCb=null; export const onDirty=f=>{dirtyCb=f;}; const ping=()=>{ try{ dirtyCb&&dirtyCb(); }catch{} };
export const put=(s,obj,raw=false)=>{ if(!raw){ obj.updatedAt=Date.now(); obj.dirty=1; ping(); } return tx(s,'readwrite',st=>st.put(obj)); };
export const putMany=async(s,arr,raw=false)=>{ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction(s,'readwrite'); const st=t.objectStore(s);
  for(const o of arr){ if(!raw){o.updatedAt=o.updatedAt||Date.now(); o.dirty=1;} st.put(o);} t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); };
export const kvGet=async(k,d=null)=>{ const r=await get('kv',k); return r?r.v:d; };
export const kvSet=(k,v)=>put('kv',{id:k,v},true);
export const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));
// Atomic multi-store write: [{store, obj, raw}] + optional counter bump. Either everything commits or nothing does.
export async function atomic(ops, counterKey=null, onCounter=null){
  const db=await open(); const stores=[...new Set([...ops.map(o=>o.store), ...(counterKey?['kv']:[])])];
  return new Promise((res,rej)=>{ let t; try{ t=db.transaction(stores,'readwrite'); }catch(e){ return rej(e); }
    let result=null;
    const writeAll=()=>{ for(const o of ops){ if(!o.raw){o.obj.updatedAt=Date.now(); o.obj.dirty=1;} t.objectStore(o.store).put(o.obj);} };
    const fail=e=>{ try{ t.abort(); }catch{} rej(e); };
    if(counterKey){ const kv=t.objectStore('kv'); const r=kv.get(counterKey); r.onsuccess=()=>{ try{ const n=r.result?r.result.v:null; result=onCounter(n); kv.put({id:counterKey,v:result.next}); writeAll(); }catch(e){ fail(e); } }; }
    else { try{ writeAll(); }catch(e){ return fail(e); } }
    t.oncomplete=()=>{ if(ops.some(o=>!o.raw)) ping(); res(result); }; t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error||new Error('Transaction aborted')); });
}
export const isQuotaError=e=>e && (e.name==='QuotaExceededError' || /quota/i.test(e.message||''));
