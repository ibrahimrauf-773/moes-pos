// Optional Supabase sync over PostgREST (plain fetch, no SDK). The app never waits on this.
// Each record keeps its UUID id, so pushes are idempotent upserts; pulls go by server sequence number.
import * as db from './db.js';
let running=false;
export async function config(){ return await db.kvGet('sync',{enabled:false,url:'',anonKey:'',shopKey:''}); }
const hdr=c=>({apikey:c.anonKey,Authorization:'Bearer '+c.anonKey,'Content-Type':'application/json','x-shop-key':c.shopKey});
export async function syncNow(log=()=>{}){
  const c=await config(); if(!c.enabled||!c.url||!navigator.onLine||running) return {skipped:true};
  running=true; const deviceId=await db.kvGet('deviceId'); let pushed=0, pulled=0;
  try{
    for(const s of db.SYNCED){
      const dirty=(await db.all(s)).filter(o=>o.dirty);
      for(let i=0;i<dirty.length;i+=200){
        const batch=dirty.slice(i,i+200);
        const rows=batch.map(o=>{ const {dirty:_,...data}=o; return {id:s+':'+o.id,store:s,device_id:deviceId,updated_at:o.updatedAt||0,data}; });
        const r=await fetch(c.url.replace(/\/$/,'')+'/rest/v1/moes_records?on_conflict=id',{method:'POST',headers:{...hdr(c),Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
        if(!r.ok) throw new Error('push '+r.status+' '+(await r.text()).slice(0,200));
        // clear dirty only if record unchanged since we read it
        for(const o of batch){ const cur=await db.get(s,o.id); if(cur && cur.updatedAt===o.updatedAt){ delete cur.dirty; await db.put(s,cur,true); } }
        pushed+=batch.length;
      }
    }
    let since=await db.kvGet('syncSeq',0);
    for(;;){
      const r=await fetch(c.url.replace(/\/$/,'')+`/rest/v1/moes_records?seq=gt.${since}&order=seq.asc&limit=500`,{headers:hdr(c)});
      if(!r.ok) throw new Error('pull '+r.status); const rows=await r.json(); if(!rows.length) break;
      for(const row of rows){ since=Math.max(since,row.seq); if(!db.SYNCED.includes(row.store)) continue;
        const local=await db.get(row.store,row.data.id);
        if(!local || (!local.dirty && (row.updated_at>=(local.updatedAt||0))) || (local.dirty && row.updated_at>local.updatedAt)){ await db.put(row.store,row.data,true); pulled++; } }
      await db.kvSet('syncSeq',since); if(rows.length<500) break;
    }
    await db.kvSet('lastSync',{at:Date.now(),pushed,pulled,ok:true}); return {pushed,pulled};
  }catch(e){ await db.kvSet('lastSync',{at:Date.now(),ok:false,error:String(e.message||e)}); log('sync failed: '+e.message); return {error:String(e.message||e)}; }
  finally{ running=false; }
}
export function startAuto(onDone){ const tick=()=>syncNow().then(r=>onDone&&onDone(r)).catch(()=>{}); setInterval(tick,30000); addEventListener('online',tick); setTimeout(tick,2000); }
