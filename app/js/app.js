import * as db from './db.js'; import * as L from './logic.js'; import * as S from './seed.js';
import {hashPin,encryptJSON,decryptJSON} from './crypto.js'; import * as P from './print.js'; import * as Sync from './sync.js';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const now=()=>Date.now()+(window.__TEST_OFFSET||0);
const toInt=(v,{min=0,max=10_000_000}={})=>{ const n=Number(String(v??'').replace(/[, ]/g,'')); if(String(v??'').trim()===''||!Number.isFinite(n)||!Number.isInteger(n)||n<min||n>max) throw new Error(`Enter a whole number between ${min} and ${max}`); return n; };
const toNum=(v,{min=0,max=1e9}={})=>{ const n=Number(v); if(String(v??'').trim()===''||!Number.isFinite(n)||n<min||n>max) throw new Error('Enter a valid number'); return n; };
const App={user:null,loc:'main',view:'pos',draft:null,recipes:null,settings:null,policy:null};
window.App=App;

// ---------- boot ----------
async function seed(){
  if(await db.kvGet('seeded')) return;
    for(const s of S.STAFF) await db.put('staff',{id:s.id,name:s.name,role:s.role,pinHash:await hashPin(s.pin,'moes:'+s.id),active:true,mustChangePin:true});
  for(const [k,items] of Object.entries(S.MENUS)) await db.put('menus',{id:k,name:{store:'In-store menu',fp:'Foodpanda menu',mashion:'Mashion stall menu'}[k]||k,items:items.map(i=>({...i})),addons:S.ADDONS[k]});
  for(const z of S.ZONES) await db.put('zones',{...z});
  for(const i of S.INVENTORY) await db.put('inventory',{...i});
  await db.kvSet('policy',{...S.POLICY}); await db.kvSet('usage',S.USAGE);
  await db.kvSet('settings',{address:'Sport On, Block 3, Clifton, Karachi',footer:'',startNo:1606,devicePrefix:''});
  await db.kvSet('seeded',true);
}
async function loadCfg(){ App.settings=await db.kvGet('settings'); App.policy=await db.kvGet('policy'); App.usage=await db.kvGet('usage',S.USAGE);
  App.menus=Object.fromEntries((await db.all('menus')).map(m=>[m.id,m])); App.zones=(await db.all('zones')).sort((a,b)=>a.id.localeCompare(b.id));
  App.staff=await db.all('staff'); App.inv=await db.all('inventory'); App.loc=await db.kvGet('location','main'); App.bom=await db.kvGet('bomPublic',[]); }
export async function boot(){
  try{ await db.open(); }catch(e){ document.body.innerHTML='<div class="fatal">Storage unavailable: '+esc(e.message)+'. In Safari, turn off Private Browsing.</div>'; return; }
  if(!await db.kvGet('deviceId')) await db.kvSet('deviceId',db.uid());
  await seed(); await loadCfg();
  if(navigator.storage?.persist){ try{ const p=await navigator.storage.persisted()||await navigator.storage.persist(); App.persisted=p; }catch{ App.persisted=false; } }
  if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
  App.draft=await db.kvGet('draft',null);
  addEventListener('online',renderStatus); addEventListener('offline',renderStatus);
  Sync.startAuto(()=>renderStatus()); setInterval(dailyBackupCheck,60*60*1000); setTimeout(dailyBackupCheck,3000);
  setInterval(()=>{ if(App.view==='kds'&&App.user) renderKDS(); },10000);
  renderLogin(); window.__ready=true;
}
async function logAct(action,detail={}){ try{ await db.put('log',{id:db.uid(),at:now(),staffId:App.user?.id||'-',staffName:App.user?.name||'-',action,detail,device:await db.kvGet('deviceId')}); }catch{} }
function toast(msg,kind='ok'){ const t=document.createElement('div'); t.className='toast '+kind; t.textContent=msg; t.dataset.t='toast'; document.body.append(t); setTimeout(()=>t.remove(),kind==='err'?6000:2500); }
async function safe(fn){ try{ return await fn(); }catch(e){ console.error(e); toast(db.isQuotaError(e)?'Device storage is FULL. Export a backup and clear old backups in Settings.':(e.message||String(e)),'err'); } }

// ---------- modal ----------
function bindForm(w,res){ const f=$('form',w); f.onsubmit=e=>{ e.preventDefault(); const fd=Object.fromEntries(new FormData(f)); res(fd); };
  const x=$('[data-x]',w); if(x) x.onclick=()=>{ w.remove(); res(null); }; }
function modal(title,body,{ok='OK',cancel='Cancel',wide=false}={}){ closeModal(); return new Promise(res=>{
  const w=document.createElement('div'); w.className='modal-bg'; w.innerHTML=`<form class="modal ${wide?'wide':''}" data-t="modal"><h2>${esc(title)}</h2><div class="mbody">${body}</div><div class="err" data-t="modal-err"></div>
   <div class="mbtns">${cancel?`<button type="button" class="btn ghost" data-x data-t="modal-cancel">${cancel}</button>`:''}<button class="btn primary" data-t="modal-ok">${ok}</button></div></form>`;
  document.body.append(w); const first=$('input:not([type=radio]):not([type=checkbox]),select,textarea',w); first&&first.focus(); bindForm(w,res); }); }
function closeModal(){ $$('.modal-bg').forEach(m=>m.remove()); }
function modalErr(msg){ const e=$('[data-t=modal-err]'); if(e) e.textContent=msg; }
async function form(title,body,validate,opts){ let r=await modal(title,body,opts);
  for(;;){ if(!r) return null; try{ const v=await validate(r); if(v!==false){ closeModal(); return v===true?r:v; } }catch(e){ modalErr(e.message); }
    const w=$('.modal-bg'); if(!w) return null; r=await new Promise(res=>bindForm(w,res)); } }
// PIN hashes are salted per staff id (not per device) so synced staff records work on every device.
async function checkPin(pin,roles){ pin=String(pin||''); if(!/^\d{4,8}$/.test(pin)) return null; for(const s of await db.all('staff')){ if(s.active&&(!roles||roles.includes(s.role))&&s.pinHash===await hashPin(pin,'moes:'+s.id)) return s; } return null; }
async function ownerApprove(why){ return form('Owner approval needed',`<p>${esc(why)}</p><label>Owner PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" data-t="owner-pin"></label>`,
  async r=>{ const s=await checkPin(r.pin,['owner']); if(!s) throw new Error('Wrong owner PIN'); return s; },{ok:'Approve'}); }

// ---------- login ----------
function renderLogin(){ App.user=null; document.body.className='';
  document.body.innerHTML=`<div class="login"><img src="icons/logo-192.png" alt="Moe's Hot Chicken" class="logo"><h1>MOE'S HOT CHICKEN · POS</h1>
  <div class="staff-grid">${App.staff.filter(s=>s.active).map(s=>`<button class="btn staff" data-staff="${s.id}">${esc(s.name)}<small>${s.role}</small></button>`).join('')}</div>
  <form id="pinf" class="pinf hidden"><div id="who"></div><input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="PIN" data-t="pin">
  <div class="pad">${[1,2,3,4,5,6,7,8,9,'C',0,'OK'].map(k=>`<button type="button" class="btn key" data-k="${k}">${k}</button>`).join('')}</div><div class="err" id="perr"></div></form></div>`;
  let sel=null;
  $$('[data-staff]').forEach(b=>b.onclick=()=>{ sel=b.dataset.staff; $('#pinf').classList.remove('hidden'); $('#who').textContent=b.firstChild.textContent; $('#pin').value=''; $('#pin').focus(); });
  $$('[data-k]').forEach(b=>b.onclick=()=>{ const k=b.dataset.k, p=$('#pin'); if(k==='C') p.value=''; else if(k==='OK') $('#pinf').requestSubmit(); else p.value+=k; });
  $('#pinf').onsubmit=async e=>{ e.preventDefault(); const s=await checkPin($('#pin').value); if(!s||s.id!==sel){ $('#perr').textContent='Wrong PIN'; return; }
    App.user=s; await logAct('login'); App.view=s.role==='kitchen'?'kds':'pos'; renderShell(); };
}
// ---------- shell ----------
const NAV=[['pos','New order',['owner','cashier']],['orders','Orders',['owner','cashier']],['kds','Kitchen',['owner','cashier','kitchen']],['inventory','Inventory',['owner','cashier','kitchen']],
  ['till','Till',['owner','cashier']],['reports','Reports',['owner','cashier']],['customers','Customers',['owner','cashier']],['recipes','Recipes',['owner']],['settings','Settings',['owner']]];
function renderShell(){ document.body.className='role-'+App.user.role+(App.loc==='mashion'?' bazaar':'');
  document.body.innerHTML=`<header><img src="icons/logo-96.png" alt="" class="hlogo"><nav>${NAV.filter(n=>n[2].includes(App.user.role)).map(n=>`<button class="nav ${App.view===n[0]?'on':''}" data-nav="${n[0]}">${n[1]}</button>`).join('')}</nav>
   <div class="hright"><span id="status" data-t="status"></span>${App.user.role!=='kitchen'?`<button class="btn small loc" data-t="loc" id="locbtn">${App.loc==='mashion'?'MASHION STALL':'Main Branch'}</button>`:''}<button class="btn small ghost" id="logout" data-t="logout">${esc(App.user.name)} ⏻</button></div></header>
   <div id="banner"></div><main id="main"></main>`;
  $$('[data-nav]').forEach(b=>b.onclick=()=>go(b.dataset.nav)); $('#logout').onclick=async()=>{ await logAct('logout'); App.recipes=null; renderLogin(); };
  $('#locbtn')&&($('#locbtn').onclick=async()=>{ App.loc=App.loc==='mashion'?'main':'mashion'; await db.kvSet('location',App.loc); App.draft=null; await db.kvSet('draft',null); await logAct('location',{loc:App.loc}); renderShell(); });
  renderStatus(); go(NAV.find(n=>n[0]===App.view&&n[2].includes(App.user.role))?App.view:(App.user.role==='kitchen'?'kds':'pos'));
}
async function renderStatus(){ const el=$('#status'); if(!el) return; const ls=await db.kvGet('lastSync'); const sc=await Sync.config(); const pj=(await P.pending()).length;
  el.innerHTML=`<span class="dot ${navigator.onLine?'on':'off'}"></span>${navigator.onLine?'Online':'Offline'}${sc.enabled?` · sync ${ls?(ls.ok?'ok '+L.fmtTime(ls.at):'ERROR'):'…'}`:' · sync off'}${pj?` · <b class="warn" data-t="print-pending">${pj} print job(s) waiting</b> <button class="btn small" id="retryp" data-t="print-retry">Retry</button>`:''}`;
  $('#retryp')&&($('#retryp').onclick=async()=>{ const r=await P.processQueue(); toast(r.fail?'Printer still offline':'Printed'); renderStatus(); });
  const b=$('#banner'); if(b){ const msgs=[]; if(App.persisted===false) msgs.push('Storage is not marked persistent on this device. On iPad, add the app to the Home Screen and export backups regularly.');
    if(App.user?.mustChangePin && App.user.role==='owner') msgs.push('Placeholder PINs in use: change all PINs in Settings → Staff.');
    b.innerHTML=msgs.map(m=>`<div class="bannermsg" data-t="banner">${esc(m)}</div>`).join(''); } }
async function applyPrintClass(){ document.body.classList.toggle('noprint',!(await P.printingEnabled())); }
function go(v){ App.view=v; applyPrintClass(); $$('[data-nav]').forEach(b=>b.classList.toggle('on',b.dataset.nav===v)); const m=$('#main'); m.innerHTML=''; m.dataset.view=v;
  return ({pos:renderPOS,orders:renderOrders,kds:renderKDS,inventory:renderInventory,till:renderTill,reports:renderReports,customers:renderCustomers,recipes:renderRecipes,settings:renderSettings})[v]?.(); }

// ---------- POS ----------
function menuKey(d){ return App.loc==='mashion'?'mashion':(d.channel==='foodpanda'?'fp':'store'); }
function newDraft(kind){ const d={id:db.uid(),channel:'instore',type:'takeaway',lines:[],note:'',discount:null,customer:null,delivery:null,fp:null,location:App.loc};
  if(App.loc==='mashion'){ d.channel='mashion'; } else if(kind==='whatsapp'||kind==='foodpanda'){ d.channel=kind; d.type='delivery'; } else if(kind==='dine_in') d.type='dine_in'; return d; }
async function saveDraft(){ await db.kvSet('draft',App.draft); }
const kindOf=d=>d.channel==='instore'?d.type:d.channel;
async function renderPOS(){
  if(App.draft && (App.draft.location||'main')!==App.loc) App.draft=null;
  const d=App.draft ??= newDraft(); const mk=menuKey(d); const menu=App.menus[mk]; const cats=[...new Set(menu.items.map(i=>i.cat))];
  const heats=mk==='store'?S.HEATS:S.FP_HEATS;
  const t=L.computeTotals(d,App.policy);
  $('#main').innerHTML=`<div class="pos"><section class="menu">
   ${App.loc==='mashion'?'<div class="chan"><b class="bazaar-tag">Bazaar mode – Mashion stall menu (prices PENDING owner confirmation)</b></div>':
   `<div class="chan">${[['dine_in','Dine-in'],['takeaway','Takeaway'],['whatsapp','WhatsApp delivery'],['foodpanda','Foodpanda']].map(([k,n])=>`<button class="btn chip ${kindOf(d)===k?'on':''}" data-ch="${k}">${n}</button>`).join('')}</div>`}
   ${cats.map(c=>`<h3>${esc(c)}</h3><div class="grid">${menu.items.filter(i=>i.cat===c).map(i=>`<button class="item ${i.on?'':'off'}" data-item="${i.id}"><span>${esc(i.name)}</span><b>${i.on?L.rs(i.price):'SOLD OUT'}</b>${i.pending?'<small>pending</small>':''}</button>`).join('')}</div>`).join('')}
  </section><aside class="cart" data-t="cart"><h2>${({foodpanda:'Foodpanda order',whatsapp:'WhatsApp delivery',mashion:'Stall order',dine_in:'Dine-in',takeaway:'Takeaway'})[kindOf(d)]}</h2>
   ${d.channel==='whatsapp'?`<div class="cf"><input id="cphone" data-t="cphone" placeholder="Phone 03XXXXXXXXX" value="${esc(d.customer?.phone)}" inputmode="tel"><input id="cname" data-t="cname" placeholder="Name" value="${esc(d.customer?.name)}"><input id="caddr" data-t="caddr" placeholder="Address / pin" value="${esc(d.customer?.address)}">
     <select id="zone" data-t="zone"><option value="">Zone…</option>${App.zones.map(z=>`<option value="${z.id}" ${d.delivery?.zone===z.id?'selected':''}>${z.name} – ${L.rs(z.customerCharge)} (${esc(z.areas.slice(0,40))}…)</option>`).join('')}</select></div>`:''}
   ${d.channel==='foodpanda'?`<div class="cf"><input id="fpid" data-t="fpid" placeholder="FP order ID (e.g. p25h-2644-xxxx)" value="${esc(d.fp?.orderId)}"><input id="fptotal" data-t="fptotal" inputmode="numeric" placeholder="FP total (authoritative)" value="${d.fp?.total??''}"></div>`:''}
   <ul class="lines">${d.lines.map((l,i)=>`<li data-line="${i}"><div><b>${l.qty}× ${esc(l.name)}</b>${l.heat?` <span class="heat h-${l.heat.replace(/ /g,'')}">${l.heat}</span>`:''}${(l.addons||[]).map(a=>`<div class="sub">+ ${esc(a.name)} ${a.price?L.rs(a.price):''}</div>`).join('')}${l.note?`<div class="sub note">“${esc(l.note)}”</div>`:''}</div>
     <div class="lr"><span>${L.rs(L.lineTotal(l))}</span><button class="btn small" data-qm="${i}">−</button><button class="btn small" data-qp="${i}">+</button><button class="btn small ghost" data-del="${i}">✕</button></div></li>`).join('')||'<li class="empty">Tap menu items to add</li>'}</ul>
   <textarea id="onote" data-t="onote" placeholder="Order note">${esc(d.note)}</textarea>
   <div class="tot"><div><span>Subtotal</span><span data-t="subtotal">${L.rs(t.subtotal)}</span></div>${t.discount?`<div><span>Discount (${d.discount.kind}${d.discount.type==='pct'?' '+d.discount.value+'%':''})</span><span data-t="disc-amt">−${L.rs(t.discount)}</span></div>`:''}
    ${t.delivery?`<div><span>Delivery ${d.delivery.zone}</span><span data-t="deliv">${L.rs(t.delivery)}</span></div>`:''}${t.gst?`<div><span>GST</span><span>${L.rs(t.gst)}</span></div>`:''}
    <div class="grand"><span>Total${d.channel==='foodpanda'&&d.fp?.total!=null?' (FP)':''}</span><span data-t="total">${L.rs(t.total)}</span></div></div>
   <div class="cbtns"><button class="btn ghost" id="disc" data-t="discount">Discount / staff / comp</button><button class="btn ghost" id="clear" data-t="clear">Clear</button><button class="btn primary big" id="checkout" data-t="checkout" ${d.lines.length?'':'disabled'}>Charge ${L.rs(t.total)}</button></div></aside></div>`;
  $$('[data-ch]').forEach(b=>b.onclick=async()=>{ const k=b.dataset.ch; const prev=menuKey(d);
    if(k==='dine_in'||k==='takeaway'){ d.channel='instore'; d.type=k; d.delivery=null; d.fp=null; d.customer=null; } else { d.channel=k; d.type='delivery'; if(k!=='whatsapp'){d.delivery=null;d.customer=null;} if(k!=='foodpanda') d.fp=null; }
    if(menuKey(d)!==prev && d.lines.length){ d.lines=[]; toast('Cart cleared: different price list'); }
    await saveDraft(); renderPOS(); });
  $$('[data-item]').forEach(b=>b.onclick=()=>safe(()=>addItem(b.dataset.item,heats)));
  $$('[data-qp]').forEach(b=>b.onclick=async()=>{ const l=d.lines[b.dataset.qp]; if(l.qty<99) l.qty++; await saveDraft(); renderPOS(); });
  $$('[data-qm]').forEach(b=>b.onclick=async()=>{ const l=d.lines[b.dataset.qm]; if(l.qty>1) l.qty--; await saveDraft(); renderPOS(); });
  $$('[data-del]').forEach(b=>b.onclick=async()=>{ d.lines.splice(b.dataset.del,1); await saveDraft(); renderPOS(); });
  $('#onote').onchange=async e=>{ d.note=e.target.value.slice(0,500); await saveDraft(); };
  if($('#cphone')){ $('#cphone').onchange=async e=>{ const ph=normPhone(e.target.value); const c=(await db.all('customers')).find(c=>c.phone===ph);
      d.customer={...(d.customer||{}),phone:ph}; if(c){ d.customer={name:c.name,phone:c.phone,address:c.address}; if(c.zone) setZone(c.zone); toast('Returning customer: '+c.name); } await saveDraft(); renderPOS(); };
    $('#cname').onchange=async e=>{ d.customer={...(d.customer||{}),name:e.target.value.trim().slice(0,80)}; await saveDraft(); };
    $('#caddr').onchange=async e=>{ d.customer={...(d.customer||{}),address:e.target.value.trim().slice(0,300)}; await saveDraft(); };
    $('#zone').onchange=async e=>{ setZone(e.target.value); await saveDraft(); renderPOS(); }; }
  if($('#fpid')){ $('#fpid').onchange=async e=>{ d.fp={...(d.fp||{}),orderId:e.target.value.trim()}; await saveDraft(); };
    $('#fptotal').onchange=async e=>{ try{ d.fp={...(d.fp||{}),total:e.target.value===''?null:toInt(e.target.value,{min:0,max:1e6})}; }catch(x){ toast('FP total: '+x.message,'err'); } await saveDraft(); renderPOS(); }; }
  $('#clear').onclick=async()=>{ App.draft=newDraft(kindOf(d)); await saveDraft(); renderPOS(); };
  $('#disc').onclick=()=>safe(discountFlow); $('#checkout').onclick=()=>safe(checkout);
}
function setZone(id){ const z=App.zones.find(z=>z.id===id); App.draft.delivery=z?{zone:z.id,charge:z.customerCharge,riderFare:z.riderFare}:null; }
const normPhone=p=>{ p=String(p||'').replace(/[^\d+]/g,''); if(p.startsWith('+92')) p='0'+p.slice(3); else if(p.startsWith('92')&&p.length===12) p='0'+p.slice(2); return p; };
async function addItem(id,heats){ const d=App.draft; const mk=menuKey(d); const it=App.menus[mk].items.find(i=>i.id===id);
  if(!it) return; if(!it.on){ toast(it.name+' is SOLD OUT','err'); return; }
  const addons=App.menus[mk].addons||[];
  const wantsMods=it.heat || (addons.length && !['Extras','Drinks','Beverages','Dessert'].includes(it.cat) && !it.sample);
  if(wantsMods){
    const r=await form(it.name,`${it.heat?`<fieldset class="heats"><legend>Heat level</legend>${heats.map((h,i)=>`<label class="radio"><input type="radio" name="heat" value="${h}" ${i===1?'checked':''} data-t="heat-${h.replace(/ /g,'')}"> ${h}</label>`).join('')}</fieldset>`:''}
      ${addons.length?`<fieldset><legend>Add-ons</legend>${addons.map(a=>`<label class="radio"><input type="checkbox" name="ad_${a.id}" data-t="addon-${a.id}"> ${esc(a.name)} ${L.rs(a.price)}</label>`).join('')}</fieldset>`:''}
      <label>Qty<input name="qty" value="1" inputmode="numeric" data-t="qty"></label><label>Note for kitchen<input name="note" maxlength="200" data-t="lnote"></label>`,
      r=>{ toInt(r.qty,{min:1,max:99}); if(it.heat && !heats.includes(r.heat)) throw new Error('Pick a heat level'); return true; },{ok:'Add'});
    if(!r) return;
    d.lines.push({itemId:it.id,name:it.name,qty:toInt(r.qty,{min:1,max:99}),unitPrice:it.price,heat:it.heat?r.heat:null,note:(r.note||'').trim(),sample:!!it.sample,
      addons:addons.filter(a=>r['ad_'+a.id]).map(a=>({id:a.id,name:a.name,price:a.price}))});
  } else {
    const ex=d.lines.find(l=>l.itemId===it.id&&!l.heat&&!(l.addons||[]).length&&!l.note); if(ex) ex.qty++; else d.lines.push({itemId:it.id,name:it.name,qty:1,unitPrice:it.price,heat:null,note:'',addons:[],sample:!!it.sample});
  }
  await saveDraft(); renderPOS();
}
async function discountFlow(){ const d=App.draft;
  const r=await form('Discount',`<label>Kind<select name="kind" data-t="dkind"><option value="customer">Customer discount</option><option value="staff">Staff meal (${App.policy.staffMealPct}%)</option><option value="comp">Comp (free, owner)</option><option value="none">Remove discount</option></select></label>
   <label>Type<select name="type" data-t="dtype"><option value="pct">%</option><option value="amt">Rs amount</option></select></label><label>Value (blank = default)<input name="value" inputmode="numeric" data-t="dvalue"></label><label>Reason (required)<input name="reason" data-t="dreason" maxlength="200"></label>`,
   r=>{ if(r.kind==='none') return true; if(r.kind==='customer') toInt(r.value,{min:1,max:r.type==='pct'?100:1e7}); else if(r.value!=='') toInt(r.value,{min:1,max:r.type==='pct'?100:1e7}); if(!r.reason.trim()) throw new Error('Reason is required'); return true; });
  if(!r) return; if(r.kind==='none'){ d.discount=null; await saveDraft(); return renderPOS(); }
  const disc={kind:r.kind,type:r.type,value:r.value===''?0:toInt(r.value),reason:r.reason.trim()};
  if(r.kind==='staff' && r.value===''){ disc.type='pct'; disc.value=App.policy.staffMealPct; }
  if(r.kind==='comp'){ disc.type='pct'; disc.value=100; }
  if(L.discountNeedsOwner(App.user.role,disc,App.policy)){ const o=await ownerApprove(`${App.user.name}: ${disc.type==='pct'?disc.value+'%':L.rs(disc.value)} ${disc.kind} discount. Cashier limit is ${App.policy.cashierMaxDiscountPct}% (staff meal ${App.policy.staffMealPct}%).`);
    if(!o){ toast('Discount NOT applied (owner approval needed)','err'); return renderPOS(); } disc.approvedBy=o.name; }
  else disc.approvedBy=App.user.name;
  d.discount=disc; await saveDraft(); await logAct('discount',{draft:d.id,...disc}); renderPOS();
}
async function checkout(){ const d=App.draft; if(!d.lines.length) return;
  if(d.channel==='whatsapp'){ if(!d.customer?.name||!d.customer?.phone) throw new Error('WhatsApp order needs customer name and phone'); if(!/^0\d{9,10}$/.test(d.customer.phone)) throw new Error('Phone must look like 03XXXXXXXXX'); if(!d.delivery) throw new Error('Pick a delivery zone'); }
  if(d.channel==='foodpanda'){ if(!d.fp?.orderId||!/^[a-z0-9-]{4,30}$/i.test(d.fp.orderId)) throw new Error('Enter the Foodpanda order ID'); if(d.fp.total==null) throw new Error('Enter the Foodpanda total');
    if((await db.all('orders')).some(o=>o.fp?.orderId===d.fp.orderId && o.id!==d.id && o.status!=='void')) throw new Error('This Foodpanda order ID is already entered'); }
  const t=L.computeTotals(d,App.policy);
  const methods=d.channel==='foodpanda'?[S.PAY_METHODS[4],...S.PAY_METHODS.slice(0,4)]:S.PAY_METHODS.filter(m=>m.id!=='fp_online');
  const pre=d.channel==='foodpanda'?{fp_online:t.total}:{cash:t.total};
  const r=await form('Payment – '+L.rs(t.total),`<p class="muted">Split payment: enter amounts in more than one method. Cash tendered is only for change.</p>${methods.map(m=>`<label class="payrow">${esc(m.name)}<input name="p_${m.id}" inputmode="numeric" value="${pre[m.id]??''}" data-t="pay-${m.id}"></label>`).join('')}
    <label>Cash tendered (optional)<input name="tendered" inputmode="numeric" data-t="tendered"></label><label>Payment ref / note<input name="pref" data-t="pref" maxlength="100"></label>
    ${d.channel==='whatsapp'?'<label class="radio"><input type="checkbox" name="unpaid" data-t="unpaid"> COD – collect on delivery (record payment later)</label>':''}`,
    r=>{ let sum=0; for(const m of methods){ if(r['p_'+m.id]!=='') sum+=toInt(r['p_'+m.id]); } if(r.tendered) toInt(r.tendered);
      if(!r.unpaid && sum!==t.total) throw new Error(`Payments add up to ${L.rs(sum)}; total is ${L.rs(t.total)}`); if(r.unpaid && sum>t.total) throw new Error('Overpaid');
      if(r.tendered && r.p_cash && toInt(r.tendered)<toInt(r.p_cash)) throw new Error('Tendered is less than the cash amount'); return true; },{ok:'Complete sale',wide:true});
  if(!r) return;
  const payments=methods.filter(m=>r['p_'+m.id]!==''&&toInt(r['p_'+m.id])>0).map(m=>({method:m.id,amount:toInt(r['p_'+m.id]),at:now(),by:App.user.id,ref:(r.pref||'').trim()}));
  const order={...d,payments,refunds:[],status:'open',createdAt:now(),businessDate:L.businessDate(now()),staffId:App.user.id,staffName:App.user.name,
    device:await db.kvGet('deviceId'),totals:t,change:r.tendered&&r.p_cash?toInt(r.tendered)-toInt(r.p_cash):0,unpaid:!!r.unpaid};
  const saved=await commitOrder(order);
  App.draft=newDraft(kindOf(d)); await saveDraft();
  toast(`Order #${saved.orderNo} saved${order.change?` · change ${L.rs(order.change)}`:''}`); App.lastOrder=saved; renderPOS();
  // printing is fire-and-forget: never blocks the sale
  P.queue('kitchen',saved,App.settings).then(()=>P.queue('receipt',saved,App.settings)).catch(()=>{}).finally(renderStatus);
}
// Transactional commit: order + stock deductions + customer + order-number counter + log in ONE IndexedDB transaction. Idempotent on order.id.
const inflight=new Map();
export function commitOrder(order){ if(inflight.has(order.id)) return inflight.get(order.id); const p=commitOrder1(order).finally(()=>inflight.delete(order.id)); inflight.set(order.id,p); return p; }
async function commitOrder1(order){
  const existing=await db.get('orders',order.id); if(existing) return existing;
  const ded=L.deductionsFor(order,App.usage,App.bom); const loc=order.location==='mashion'?'mashion':'main';
  const moves=Object.entries(ded).map(([itemId,q])=>({store:'stockMoves',obj:{id:order.id+':'+itemId,itemId,location:loc,qty:-q,type:'sale',ref:order.id,at:order.createdAt,by:order.staffId}}));
  const ops=[{store:'orders',obj:order},...moves,{store:'log',obj:{id:db.uid(),at:now(),staffId:App.user?.id,staffName:App.user?.name,action:'order',detail:{id:order.id,channel:order.channel,total:order.totals?.total}}}];
  if(order.channel==='whatsapp'&&order.customer?.phone){ const c=(await db.all('customers')).find(c=>c.phone===order.customer.phone)||{id:'c-'+order.customer.phone,phone:order.customer.phone,orders:[]};
    ops.push({store:'customers',obj:{...c,name:order.customer.name||c.name,address:order.customer.address||c.address,zone:order.delivery?.zone||c.zone,orders:[...new Set([...(c.orders||[]),order.id])],lastOrderAt:order.createdAt}}); }
  const start=App.settings.startNo||1606, prefix=App.settings.devicePrefix||'';
  await db.atomic(ops,'nextOrderNo',n=>{ const no=Math.max(n??start,start); order.orderNo=prefix?prefix+no:no; order.orderSeq=no; return {next:no+1}; });
  return order;
}

// ---------- Orders list ----------
async function ordersFor(bd,loc){ return (await db.all('orders')).filter(o=>o.businessDate===bd&&(loc==null||(o.location||'main')===loc)).sort((a,b)=>a.createdAt-b.createdAt); }
async function renderOrders(bd){ bd=bd||App.ordersDate||L.businessDate(now()); App.ordersDate=bd; const os=await ordersFor(bd,App.loc);
  const canPrint=await P.printingEnabled();
  $('#main').innerHTML=`<div class="pad1"><div class="row"><h2>Orders – business date</h2><input type="date" id="obd" value="${bd}" data-t="obd"><span class="muted">${os.length} orders</span></div>
   <table class="tbl" data-t="orders"><tr><th>#</th><th>Time</th><th>Channel</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr>
   ${os.map(o=>{const t=L.computeTotals(o,App.policy); return `<tr data-o="${o.id}" data-no="${esc(o.orderNo??o.fp?.orderId)}" class="st-${o.status}"><td>${esc(o.orderNo??'')}${o.fp?.orderId?`<br><small>FP ${esc(o.fp.orderId)}</small>`:''}</td><td>${L.fmtTime(o.createdAt)}</td><td>${esc(chLabel(o))}</td>
   <td>${o.lines.map(l=>`${l.qty}× ${esc(l.name)}${l.heat?' ('+l.heat+')':''}`).join('<br>')||(o.fp?.itemsPending?'<i>items pending</i>':'')}</td><td>${L.rs(t.total)}</td><td>${o.payments.map(p=>esc(p.method)+' '+p.amount).join('<br>')}${L.refunded(o)?`<br><b>refunded ${L.refunded(o)}</b>`:''}${L.paid(o)<t.total&&o.status!=='void'?'<br><b class="warn">DUE</b>':''}</td><td>${o.status}</td>
   <td class="acts">${o.status!=='void'?`<button class="btn small" data-act="pay">+Pay</button><button class="btn small" data-act="refund" data-t="refund">Refund</button><button class="btn small danger" data-act="void" data-t="void">Void</button>`:''}${canPrint?`<button class="btn small print-only" data-act="reprint" data-t="reprint">Reprint</button><button class="btn small print-only" data-act="kreprint">Kitchen</button>`:''}</td></tr>`}).join('')}</table></div>`;
  $('#obd').onchange=e=>renderOrders(e.target.value);
  $$('[data-act]').forEach(b=>b.onclick=()=>safe(()=>orderAction(b.closest('tr').dataset.o,b.dataset.act)));
}
const chLabel=o=>o.channel==='instore'?(o.type==='dine_in'?'Dine-in':'Takeaway'):o.channel==='whatsapp'?`WhatsApp ${o.delivery?.zone||''}`:o.channel==='foodpanda'?'Foodpanda':o.channel==='mashion'?'Mashion':o.channel;
async function orderAction(id,act){ const o=await db.get('orders',id); const t=L.computeTotals(o,App.policy);
  if(act==='reprint'||act==='kreprint'){ await P.queue(act==='reprint'?'receipt':'kitchen',o,App.settings); renderStatus(); toast('Sent to printer queue'); return; }
  if(act==='void'){ let by=App.user; if(App.user.role!=='owner'){ by=await ownerApprove('Void order #'+o.orderNo); if(!by) return; }
    const r=await form('Void order #'+o.orderNo,`<label>Reason (required)<input name="reason" data-t="vreason" maxlength="200"></label>`,r=>{ if(!r.reason.trim()) throw new Error('Reason is required'); return true; }); if(!r) return;
    o.status='void'; o.voidReason=r.reason.trim(); o.voidBy=by.name; o.voidAt=now();
    const back=Object.entries(L.deductionsFor(o,App.usage,App.bom)).map(([itemId,q])=>({store:'stockMoves',obj:{id:o.id+':void:'+itemId,itemId,location:o.location==='mashion'?'mashion':'main',qty:q,type:'void-return',ref:o.id,at:now(),by:App.user.id}}));
    await db.atomic([{store:'orders',obj:o},...back]); await logAct('void',{order:o.orderNo,reason:o.voidReason,approvedBy:by.name}); }
  if(act==='refund'){ let by=App.user; if(!L.canRefund(App.user.role,App.policy)){ by=await ownerApprove('Refund'); if(!by) return; }
    const max=t.total-L.refunded(o); if(max<=0) throw new Error('Already fully refunded');
    const r=await form('Refund order #'+o.orderNo,`<label>Amount (max ${max})<input name="amount" value="${max}" inputmode="numeric" data-t="ramount"></label><label>Method<select name="method" data-t="rmethod">${S.PAY_METHODS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></label><label>Reason (required)<input name="reason" data-t="rreason" maxlength="200"></label>`,
      r=>{ toInt(r.amount,{min:1,max}); if(!r.reason.trim()) throw new Error('Reason is required'); return true; }); if(!r) return;
    o.refunds=[...(o.refunds||[]),{id:db.uid(),amount:toInt(r.amount,{min:1,max}),method:r.method,reason:r.reason.trim(),by:by.name,at:now()}];
    await db.put('orders',o); await logAct('refund',{order:o.orderNo,amount:r.amount,reason:r.reason}); }
  if(act==='pay'){ const due=t.total-L.paid(o); const r=await form('Add payment #'+o.orderNo,`<p>Due: ${L.rs(due)}</p><label>Amount<input name="amount" value="${Math.max(due,0)}" inputmode="numeric" data-t="addpay-amount"></label><label>Method<select name="method" data-t="addpay-method">${S.PAY_METHODS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></label><label>Ref<input name="ref"></label>`,
      r=>{ toInt(r.amount,{min:1,max:Math.max(due,1)}); return true; }); if(!r) return;
    o.payments.push({method:r.method,amount:toInt(r.amount,{min:1}),at:now(),by:App.user.id,ref:r.ref}); if(L.paid(o)>=t.total) o.unpaid=false; await db.put('orders',o); await logAct('payment',{order:o.orderNo,amount:r.amount}); }
  return renderOrders();
}

// ---------- Kitchen display (never shows recipes or prices) ----------
async function renderKDS(){ if(!$('#main')||App.view!=='kds') return; const os=(await db.all('orders')).filter(o=>o.status==='open'&&(o.location||'main')===App.loc).sort((a,b)=>a.createdAt-b.createdAt);
  const late=App.policy.lateMinutes||15;
  $('#main').innerHTML=`<div class="kds" data-t="kds">${os.map(o=>{ const mins=Math.floor((now()-o.createdAt)/60000); return `<div class="ticket ${mins>=late?'late':''}" data-k="${o.id}" data-no="${esc(o.orderNo)}" data-t="ticket">
    <div class="th"><b>#${esc(o.orderNo)}</b><span>${esc(chLabel(o))}</span><span class="timer" data-t="timer">${mins}m</span></div>
    ${o.lines.map(l=>`<div class="kl"><b>${l.qty}× ${esc(l.name)}</b>${l.heat?` <span class="heat h-${l.heat.replace(/ /g,'')}">${l.heat}</span>`:''}${(l.addons||[]).map(a=>`<div class="sub">+ ${esc(a.name)}</div>`).join('')}${l.note?`<div class="sub note">${esc(l.note)}</div>`:''}</div>`).join('')}
    ${o.note?`<div class="note">${esc(o.note)}</div>`:''}<button class="btn primary bump" data-bump="${o.id}" data-t="bump">BUMP ✓</button></div>`;}).join('')||'<p class="muted big">No open orders</p>'}</div>`;
  $$('[data-bump]').forEach(b=>b.onclick=()=>safe(async()=>{ const o=await db.get('orders',b.dataset.bump); o.status='done'; o.bumpedAt=now(); o.bumpedBy=App.user.name; await db.put('orders',o); await logAct('bump',{order:o.orderNo}); renderKDS(); }));
}
// ---------- Inventory ----------
async function onHand(){ const moves=await db.all('stockMoves'); const m={}; for(const x of moves){ const k=x.itemId+'|'+x.location; m[k]=(m[k]||0)+x.qty; } return m; }
async function renderInventory(){ App.inv=await db.all('inventory'); const oh=await onHand(); const locs=S.LOCATIONS;
  const low=App.inv.filter(i=>(i.reorderLevel>0&&(oh[i.id+'|main']||0)<=i.reorderLevel) || i.reorderFlag);
  const owner=App.user.role==='owner', kitchen=App.user.role==='kitchen';
  $('#main').innerHTML=`<div class="pad1"><div class="row"><h2>Inventory</h2>
   ${kitchen?'':'<button class="btn" data-inv="delivery" data-t="inv-delivery">Delivery received</button><button class="btn" data-inv="transfer" data-t="inv-transfer">Transfer Home → Main</button>'}<button class="btn" data-inv="wastage" data-t="inv-wastage">Wastage</button>${kitchen?'':'<button class="btn" data-inv="count" data-t="inv-count">Stock count</button>'}${owner?'<button class="btn ghost" data-inv="additem">+ Item</button>':''}</div>
   ${low.length?`<details class="alert" data-t="lowstock"><summary><b>${low.length} item(s) at or below reorder level</b> · tap to view</summary><div class="chips">${low.map(i=>`<span class="chip" data-low="${i.id}">${esc(i.name)} <small>Main ${fmtQ(oh[i.id+'|main']||0)} ${i.unit} / reorder ${i.reorderLevel}</small></span>`).join('')}</div></details>`:''}
   <table class="tbl" data-t="invtable"><tr><th>Item</th><th>Unit / pack</th>${locs.map(l=>`<th>${l.name}</th>`).join('')}<th>Reorder lvl</th>${owner?'<th>Cost/unit</th><th></th>':''}</tr>
   ${App.inv.map(i=>`<tr data-i="${i.id}" class="${low.includes(i)?'lowrow':''}"><td>${esc(i.name)}<br><small>${esc(i.supplier)}</small></td><td>${esc(i.unit)} · ${i.packSize}/${esc(i.packLabel)}</td>${locs.map(l=>`<td data-t="oh-${i.id}-${l.id}">${fmtQ(oh[i.id+'|'+l.id]||0)}</td>`).join('')}<td>${i.reorderLevel}</td>${owner?`<td>${i.costPerUnit||0}</td><td><button class="btn small" data-edit="${i.id}">Edit</button></td>`:''}</tr>`).join('')}</table>
   <h3>Recent movements</h3><table class="tbl" data-t="moves">${(await db.all('stockMoves')).sort((a,b)=>b.at-a.at).slice(0,40).map(m=>`<tr><td>${L.fmtDT(m.at)}</td><td>${esc(m.type)}</td><td>${esc((App.inv.find(i=>i.id===m.itemId)||{}).name||m.itemId)}</td><td>${esc(m.location)}</td><td>${fmtQ(m.qty)}</td><td>${esc(m.note||'')}</td></tr>`).join('')}</table></div>`;
  $$('[data-inv]').forEach(b=>b.onclick=()=>safe(()=>invAction(b.dataset.inv)));
  $$('[data-edit]').forEach(b=>b.onclick=()=>safe(()=>editInvItem(b.dataset.edit)));
}
const fmtQ=n=>Math.round(n*100)/100;
const itemSel=()=>`<select name="item" data-t="inv-item">${App.inv.map(i=>`<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('')}</select>`;
const locSel=(n='location',def='main')=>`<select name="${n}" data-t="inv-loc">${S.LOCATIONS.map(l=>`<option value="${l.id}" ${l.id===def?'selected':''}>${l.name}</option>`).join('')}</select>`;
async function invAction(kind){
  if(kind==='additem') return editInvItem(null);
  const titles={delivery:'Delivery received',transfer:'Transfer Home → Main Branch',wastage:'Wastage',count:'Stock count (set on-hand)'};
  const r=await form(titles[kind],`<label>Item${itemSel()}</label>${kind==='transfer'?'':`<label>Location${locSel('location',kind==='delivery'?'home':'main')}</label>`}
    <label>Quantity (units)<input name="qty" inputmode="decimal" data-t="inv-qty"></label>${kind==='delivery'?'<label>…or number of packs<input name="packs" inputmode="numeric" data-t="inv-packs"></label><label>Supplier / cost note<input name="note"></label>':''}
    ${kind==='wastage'?'<label>Reason (required)<input name="note" data-t="inv-reason"></label>':''}${kind==='transfer'?'<label>Note<input name="note"></label>':''}`,
    r=>{ if(r.packs) toInt(r.packs,{min:1,max:10000}); else toNum(r.qty,{min:kind==='count'?0:0.001,max:1e7}); if(kind==='wastage'&&!r.note?.trim()) throw new Error('Reason is required'); return true; });
  if(!r) return; const it=App.inv.find(i=>i.id===r.item); const qty=r.packs?toInt(r.packs)*it.packSize:toNum(r.qty);
  const base={itemId:r.item,at:now(),by:App.user.id,note:(r.note||'').trim()};
  if(kind==='delivery') await db.put('stockMoves',{id:db.uid(),...base,location:r.location,qty,type:'delivery'});
  if(kind==='wastage') await db.put('stockMoves',{id:db.uid(),...base,location:r.location,qty:-qty,type:'wastage'});
  if(kind==='transfer'){ const id=db.uid(); await db.atomic([{store:'stockMoves',obj:{id:id+'-out',...base,location:'home',qty:-qty,type:'transfer-out'}},{store:'stockMoves',obj:{id:id+'-in',...base,location:'main',qty,type:'transfer-in'}}]); }
  if(kind==='count'){ const oh=await onHand(); const cur=oh[r.item+'|'+r.location]||0; await db.put('stockMoves',{id:db.uid(),...base,location:r.location,qty:qty-cur,type:'count-adjust'}); }
  await logAct('stock-'+kind,{item:r.item,qty}); renderInventory();
}
async function editInvItem(id){ const i=id?App.inv.find(x=>x.id===id):{id:'',name:'',unit:'pc',packSize:1,packLabel:'',reorderLevel:0,supplier:'',costPerUnit:0,reorderFlag:false};
  const r=await form(id?'Edit item':'New item',`${id?'':'<label>ID (short, no spaces)<input name="id"></label>'}<label>Name<input name="name" value="${esc(i.name)}"></label><label>Unit<input name="unit" value="${esc(i.unit)}"></label><label>Pack size<input name="packSize" value="${i.packSize}"></label><label>Pack label<input name="packLabel" value="${esc(i.packLabel)}"></label><label>Reorder level<input name="reorderLevel" value="${i.reorderLevel}" data-t="reorder"></label><label>Cost per unit (Rs)<input name="costPerUnit" value="${i.costPerUnit}"></label><label>Supplier<input name="supplier" value="${esc(i.supplier)}"></label><label class="radio"><input type="checkbox" name="reorderFlag" ${i.reorderFlag?'checked':''}> Reorder flag</label>`,
   r=>{ if(!id&&!/^[a-z0-9_]{2,30}$/.test(r.id)) throw new Error('ID: lowercase letters/numbers/_'); if(!r.name.trim()) throw new Error('Name required'); toNum(r.packSize,{min:0.001}); toNum(r.reorderLevel); toNum(r.costPerUnit); return true; });
  if(!r) return; Object.assign(i,{id:id||r.id,name:r.name.trim(),unit:r.unit,packSize:toNum(r.packSize),packLabel:r.packLabel,reorderLevel:toNum(r.reorderLevel),costPerUnit:toNum(r.costPerUnit),supplier:r.supplier,reorderFlag:!!r.reorderFlag});
  await db.put('inventory',i); renderInventory(); }

// ---------- Till ----------
async function currentShift(bd,loc){ return (await db.all('shifts')).filter(s=>s.businessDate===bd&&s.location===loc).sort((a,b)=>a.openedAt-b.openedAt)[0]; }
async function renderTill(){ const bd=L.businessDate(now()); const sh=await currentShift(bd,App.loc); const ex=(await db.all('expenses')).filter(e=>e.businessDate===bd&&e.location===App.loc);
  const orders=await ordersFor(bd,App.loc); const rep=L.shiftReport({orders,expenses:ex,shift:sh,zones:App.zones,policy:App.policy});
  $('#main').innerHTML=`<div class="pad1"><h2>Till – ${bd} · ${App.loc==='mashion'?'Mashion stall':'Main Branch'}</h2>
   ${!sh?`<button class="btn primary big" id="open" data-t="open-till">Open till (opening float)</button>`:`<p>Opened by ${esc(sh.openedBy)} with float <b>${L.rs(sh.openingFloat)}</b>${sh.closedAt?` · <b>CLOSED</b> by ${esc(sh.closedBy)}`:''}</p>`}
   <div class="row"><button class="btn" id="exp" data-t="add-expense">+ Cash expense / drawing</button>${sh&&!sh.closedAt?'<button class="btn primary" id="close" data-t="close-till">Close out</button>':''}</div>
   <table class="tbl" data-t="expenses"><tr><th>Time</th><th>Code</th><th>Amount</th><th>Paid from</th><th>Note</th><th>By</th></tr>${ex.map(e=>`<tr><td>${L.fmtTime(e.at)}</td><td>${e.code} ${esc(e.codeName)}</td><td>${L.rs(e.amount)}</td><td>${e.paidFrom}</td><td>${esc(e.note)}</td><td>${esc(e.by)}</td></tr>`).join('')}</table>
   <div class="cards"><div class="card">Opening<b>${L.rs(rep.till.opening)}</b></div><div class="card">Cash sales<b data-t="cashsales">${L.rs(rep.till.cashSales)}</b></div><div class="card">Cash refunds<b>${L.rs(rep.till.cashRefunds)}</b></div><div class="card">Cash expenses<b>${L.rs(rep.till.cashExpenses)}</b></div><div class="card">Drawings/loan<b>${L.rs(rep.till.nonExpenseCashOut)}</b></div><div class="card hl">Expected cash<b data-t="expected">${L.rs(rep.till.expected)}</b></div>
   ${sh?.closedAt?`<div class="card">Counted<b>${L.rs(sh.countedCash)}</b></div><div class="card ${rep.till.overShort<0?'bad':'good'}">Over/short<b data-t="overshort">${rep.till.overShort>0?'+':''}${L.rs(rep.till.overShort)}</b></div><div class="card">Left with cashier<b>${L.rs(sh.leftWithCashier)}</b></div>`:''}</div></div>`;
  $('#open')&&($('#open').onclick=()=>safe(async()=>{ const r=await form('Open till',`<label>Opening float (Rs)<input name="f" inputmode="numeric" data-t="float"></label>`,r=>{toInt(r.f);return true;}); if(!r) return;
    await db.put('shifts',{id:bd+'|'+App.loc+'|'+(await db.kvGet('deviceId')).slice(0,8),businessDate:bd,location:App.loc,openingFloat:toInt(r.f),openedBy:App.user.name,openedAt:now()}); await logAct('till-open',{float:r.f}); renderTill(); }));
  $('#exp').onclick=()=>safe(async()=>{ const r=await form('Cash out',`<label>Code<select name="code" data-t="exp-code">${S.EXPENSE_CODES.map(c=>`<option value="${c.code}">${c.code} ${esc(c.name)}</option>`).join('')}</select></label><label>Amount<input name="amount" inputmode="numeric" data-t="exp-amount"></label><label>Paid from<select name="paidFrom" data-t="exp-from"><option value="till">Till cash</option><option value="bank">Bank (not from till)</option></select></label><label>Note (required)<input name="note" data-t="exp-note" maxlength="200"></label>`,
     r=>{ toInt(r.amount,{min:1}); if(!r.note.trim()) throw new Error('Note is required'); return true; }); if(!r) return;
    const c=S.EXPENSE_CODES.find(c=>c.code===r.code); await db.put('expenses',{id:db.uid(),businessDate:bd,location:App.loc,code:r.code,codeName:c.name,amount:toInt(r.amount,{min:1}),paidFrom:r.paidFrom,note:r.note.trim(),by:App.user.name,at:now()}); await logAct('expense',{code:r.code,amount:r.amount}); renderTill(); });
  $('#close')&&($('#close').onclick=()=>safe(async()=>{ const r=await form('Close out',`<p>Expected cash: <b>${L.rs(rep.till.expected)}</b></p><label>Counted cash<input name="counted" inputmode="numeric" data-t="counted"></label><label>Left with cashier (float for tomorrow)<input name="left" inputmode="numeric" value="0" data-t="left"></label><label>Foodpanda payout (if known)<input name="fpp" inputmode="numeric"></label><label>Note<input name="note"></label>`,
     r=>{ toInt(r.counted); toInt(r.left); if(r.fpp) toInt(r.fpp); return true; }); if(!r) return;
    Object.assign(sh,{countedCash:toInt(r.counted),leftWithCashier:toInt(r.left),fpPayout:r.fpp?toInt(r.fpp):null,closeNote:r.note,closedAt:now(),closedBy:App.user.name}); await db.put('shifts',sh);
    await logAct('till-close',{counted:sh.countedCash}); await makeBackup('shift-close'); toast('Till closed · backup saved'); renderTill(); }));
}
// ---------- Reports ----------
async function renderReports(bd,loc){ bd=bd||App.repDate||L.businessDate(now()); App.repDate=bd; loc=loc||App.loc;
  const orders=await ordersFor(bd,loc); const ex=(await db.all('expenses')).filter(e=>e.businessDate===bd&&e.location===loc); const sh=await currentShift(bd,loc);
  const r=L.shiftReport({orders,expenses:ex,shift:sh,zones:App.zones,policy:App.policy}); App.lastReport={r,bd,loc};
  const tr=a=>`<tr>${a.map(x=>`<td>${x}</td>`).join('')}</tr>`;
  const ds=r.itemList.filter(i=>i.itemId==='donut_slider');
  $('#main').innerHTML=`<div class="pad1 report" data-t="report"><div class="row"><h2>${loc==='mashion'?'Mashion stall daily report':'Nightly report'}</h2><input type="date" id="rbd" value="${bd}" data-t="rbd"><select id="rloc" data-t="rloc"><option value="main" ${loc==='main'?'selected':''}>Main Branch</option><option value="mashion" ${loc==='mashion'?'selected':''}>Mashion stall (separate)</option></select><button class="btn" id="csv" data-t="csv">Export CSV</button><button class="btn ghost" id="allcsv" data-t="allcsv">Export all orders CSV</button></div>
   <div class="cards"><div class="card">Orders<b data-t="r-orders">${r.totals.orders}</b></div><div class="card">Gross<b data-t="r-gross">${L.rs(r.totals.gross)}</b></div><div class="card">Refunds<b data-t="r-refunds">${L.rs(r.totals.refunds)}</b></div><div class="card hl">Net<b data-t="r-net">${L.rs(r.totals.net)}</b></div></div>
   ${loc==='mashion'?`<h3>Donut Slider</h3><table class="tbl" data-t="r-donut">${tr(['Donut Slider (Elles collab)',ds.reduce((a,i)=>a+i.units,0)+' units',L.rs(ds.reduce((a,i)=>a+i.amount,0))])}</table>`:''}
   <h3>By channel</h3><table class="tbl" data-t="r-channel">${Object.entries(r.byChannel).map(([k,v])=>tr([k,v.orders,L.rs(v.gross)])).join('')}</table>
   <h3>By payment method</h3><table class="tbl" data-t="r-pay">${Object.entries(r.byPay).map(([k,v])=>`<tr data-pay="${k}"><td>${esc((S.PAY_METHODS.find(m=>m.id===k)||{}).name||k)}</td><td>${v.count}</td><td>${L.rs(v.amount)}</td></tr>`).join('')}</table>
   <h3>Items (incl. add-ons)</h3><table class="tbl" data-t="r-items"><tr><th>Item</th><th>Units</th><th>Amount</th></tr>${r.itemList.map(i=>tr([esc(i.name),i.units,L.rs(i.amount)])).join('')}</table>
   ${Object.keys(r.samples).length?`<h3>Samples (Rs 0)</h3><table class="tbl" data-t="r-samples">${Object.entries(r.samples).map(([k,v])=>tr([esc(k),v])).join('')}</table>`:''}
   <h3>Discounts / voids / refunds / comps</h3><table class="tbl" data-t="r-adj">${r.adjustments.map(a=>tr([a.type,'#'+esc(a.orderNo),L.rs(a.amount),esc(a.reason),esc(a.by)])).join('')}</table>
   <h3>Delivery by zone</h3><table class="tbl" data-t="r-zones"><tr><th>Zone</th><th>Orders</th><th>Charged</th><th>Rider fare</th><th>Difference</th></tr>${Object.entries(r.deliveryByZone).map(([k,v])=>tr([k,v.orders,L.rs(v.charged),L.rs(v.riderFare),L.rs(v.diff)])).join('')}</table>
   <h3>Till</h3><table class="tbl" data-t="r-till">${Object.entries(r.till).map(([k,v])=>tr([k,v==null?'—':L.rs(v)])).join('')}</table>
   <h3>Till cash-outs</h3><table class="tbl">${r.expenses.map(e=>tr([e.code,esc(e.codeName),L.rs(e.amount),e.paidFrom,esc(e.note)])).join('')}</table>
   ${loc==='main'?`<h3>Foodpanda</h3><table class="tbl" data-t="r-fp">${tr(['Orders',r.fp.orders])}${tr(['Gross (FP totals)',L.rs(r.fp.gross)])}${tr([`Commission est. ${r.fp.commissionPct}%`,L.rs(r.fp.commissionEst)])}${tr(['Payout est.',L.rs(r.fp.payoutEst)])}${tr(['Actual payout',r.fp.actualPayout==null?'—':L.rs(r.fp.actualPayout)])}</table>`:''}</div>`;
  $('#rbd').onchange=e=>renderReports(e.target.value,loc); $('#rloc').onchange=e=>renderReports(bd,e.target.value);
  $('#csv').onclick=()=>download(`moes-report-${loc}-${bd}.csv`,L.reportCSV(r,{businessDate:bd,location:loc==='mashion'?'Mashion stall':'Main Branch'}),'text/csv');
  $('#allcsv').onclick=async()=>{ const os=await db.all('orders'); const rows=[['orderNo','fpOrderId','businessDate','placed','location','channel','type','status','items','subtotal','discount','delivery','zone','riderFare','total','payments','refunds','staff']];
    for(const o of os.sort((a,b)=>a.createdAt-b.createdAt)){ const t=L.computeTotals(o,App.policy); rows.push([o.orderNo,o.fp?.orderId,o.businessDate,L.fmtDT(o.createdAt),o.location,o.channel,o.type,o.status,o.lines.map(l=>`${l.qty}x ${l.name}${l.heat?' ('+l.heat+')':''}${(l.addons||[]).map(a=>' +'+a.name).join('')}`).join('; '),t.subtotal,t.discount,t.delivery,o.delivery?.zone,o.delivery?.riderFare,t.total,o.payments.map(p=>p.method+':'+p.amount).join(' '),L.refunded(o),o.staffName]); }
    download('moes-orders-all.csv',L.toCSV(rows),'text/csv'); };
}
function download(name,text,type='application/json'){ App.lastDownload={name,text}; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.append(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); }

// ---------- Customers ----------
async function renderCustomers(){ const cs=await db.all('customers'); const os=await db.all('orders');
  $('#main').innerHTML=`<div class="pad1"><h2>Customers (WhatsApp)</h2><table class="tbl" data-t="customers"><tr><th>Name</th><th>Phone</th><th>Zone</th><th>Address</th><th>Orders</th><th>Spent</th><th>Last</th></tr>
  ${cs.map(c=>{const mine=os.filter(o=>(c.orders||[]).includes(o.id)&&L.isCounted(o)); return `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.zone)}</td><td>${esc(c.address)}</td><td>${mine.length}</td><td>${L.rs(mine.reduce((a,o)=>a+L.computeTotals(o,App.policy).total,0))}</td><td>${c.lastOrderAt?L.fmtDT(c.lastOrderAt):''}</td></tr>`}).join('')}</table></div>`; }

// ---------- Recipes (owner only, encrypted at rest, never printed/synced) ----------
async function renderRecipes(){ if(App.user?.role!=='owner'){ $('#main').innerHTML='<p>Owner only.</p>'; return; }
  const blob=await db.get('secure','recipes');
  if(!App.recipes){ $('#main').innerHTML=`<div class="pad1"><h2>Recipes (owner only)</h2><p class="muted">Recipes are stored encrypted on this device and unlocked with the owner's recipe PIN. They are never printed, synced, exported in reports/backups, or shown on staff/kitchen screens.</p>
     <div class="row">${blob?'<button class="btn primary" id="unlock" data-t="unlock-recipes">Unlock recipes</button>':'<p>No recipes on this device yet.</p>'}<label class="btn">Import recipes file (.json)<input type="file" id="rfile" accept=".json" hidden data-t="recipes-file"></label></div></div>`;
    $('#unlock')&&($('#unlock').onclick=()=>safe(async()=>{ const r=await form('Unlock recipes','<label>Recipe PIN<input name="pin" type="password" inputmode="numeric" data-t="recipe-pin"></label>',async r=>{ try{ App.recipes=await decryptJSON(blob.data,r.pin); App.recipePin=r.pin; return true; }catch{ throw new Error('Wrong recipe PIN'); } }); if(r){ await logAct('recipes-unlock'); renderRecipes(); } }));
    $('#rfile').onchange=e=>safe(async()=>{ const data=JSON.parse(await e.target.files[0].text()); e.target.value=''; if(data.kind!=='moes-recipes') throw new Error('Not a recipes file');
      const r=await form('Set recipe PIN','<p>Choose the PIN that unlocks recipes on this device (e.g. your owner PIN).</p><label>Recipe PIN (4-12 digits)<input name="pin" type="password" inputmode="numeric" data-t="recipe-pin"></label>',r=>{ if(!/^\d{4,12}$/.test(r.pin)) throw new Error('4-12 digits'); return true; }); if(!r) return;
      await saveRecipes(data,r.pin); toast('Recipes imported and encrypted'); renderRecipes(); });
    return; }
  const R=App.recipes; const costByName={}; for(const i of App.inv) costByName[i.name.toLowerCase()]=i.costPerUnit||0; for(const [k,v] of Object.entries(R.ingredientCosts||{})) costByName[k.toLowerCase()]=v;
  $('#main').innerHTML=`<div class="pad1 recipes" data-t="recipes"><div class="row"><h2>Recipes 🔒</h2><button class="btn" id="lock" data-t="lock-recipes">Lock</button><button class="btn" id="costs">Ingredient costs</button><button class="btn" id="bomb">Plate usage (stock deduction)</button></div>
   ${R.recipes.map(rc=>{const c=L.recipeCost(rc,costByName); return `<details><summary><b>${esc(rc.name)}</b> – yield ${rc.yieldQty} ${esc(rc.yieldUnit)} · cost/batch ${L.rs(c.batch)} · per ${esc(rc.yieldUnit)} ${L.rs(c.perUnit)}${c.missing.length?` <small>(${c.missing.length} costs missing)</small>`:''}</summary>
     <table class="tbl">${rc.ingredients.map(i=>`<tr><td>${esc(i.name)}</td><td>${i.qty} ${esc(i.unit)}</td><td>${costByName[i.name.toLowerCase()]!=null?L.rs(costByName[i.name.toLowerCase()]*i.qty):'—'}</td></tr>`).join('')}</table>${rc.note?`<p class="muted">${esc(rc.note)}</p>`:''}</details>`;}).join('')}
   <h3>Cost per plate (plate usage × stock cost/unit)</h3><table class="tbl">${(R.bom||[]).map(b=>{ const c=b.lines.reduce((a,l)=>{const it=App.inv.find(i=>i.id===l.stockId); return a+(it?.costPerUnit||0)*l.qty;},0); return `<tr><td>${esc(b.menuItemId)}</td><td>${b.lines.map(l=>`${l.qty} ${esc(l.unit||'')} ${esc(l.stockItem||l.stockId)}`).join(', ')}</td><td>${L.rs(c)}</td></tr>`;}).join('')}</table>
   <p class="muted">${esc(R.assumptions||'')}</p></div>`;
  $('#lock').onclick=()=>{ App.recipes=null; renderRecipes(); };
  $('#costs').onclick=()=>safe(async()=>{ const names=[...new Set(R.recipes.flatMap(r=>r.ingredients.map(i=>i.name)))].sort(); R.ingredientCosts ??= {};
    const r=await form('Ingredient cost per unit (Rs per g/ml/pc as listed)',names.map((n,i)=>`<label>${esc(n)}<input name="c${i}" value="${R.ingredientCosts[n]??''}" inputmode="decimal"></label>`).join(''),r=>{ names.forEach((n,i)=>{ if(r['c'+i]!=='') toNum(r['c'+i]); }); return true; },{wide:true}); if(!r) return;
    names.forEach((n,i)=>{ if(r['c'+i]!=='') R.ingredientCosts[n]=toNum(r['c'+i]); }); await saveRecipes(R,App.recipePin); renderRecipes(); });
  $('#bomb').onclick=()=>safe(async()=>{ const r=await form('Plate usage (menu item → stock deduction)',`<textarea name="j" rows="14" style="width:100%">${esc(JSON.stringify(R.bom,null,1))}</textarea>`,r=>{ if(!Array.isArray(JSON.parse(r.j))) throw new Error('Must be a list'); return true; },{wide:true}); if(!r) return; R.bom=JSON.parse(r.j); await saveRecipes(R,App.recipePin); renderRecipes(); });
}
// Only plate-usage quantities (stock id + qty, no recipe text) are stored in plain form so sales can deduct stock without unlocking.
async function saveRecipes(data,pin){ for(const b of data.bom||[]) for(const l of b.lines){ if(!l.stockId){ const it=App.inv.find(i=>i.name.toLowerCase()===String(l.stockItem).toLowerCase()); if(it) l.stockId=it.id; } }
  await db.put('secure',{id:'recipes',data:await encryptJSON(data,pin)},true);
  App.bom=(data.bom||[]).map(b=>({menuItemId:b.menuItemId,lines:b.lines.filter(l=>l.stockId).map(l=>({stockId:l.stockId,qty:l.qty}))})); await db.kvSet('bomPublic',App.bom);
  App.recipes=data; App.recipePin=pin; await logAct('recipes-import'); }

// ---------- Backup / restore ----------
async function snapshot(){ const out={kind:'moes-backup',version:1,at:now(),device:await db.kvGet('deviceId'),data:{}};
  for(const s of [...db.SYNCED,'kv']) out.data[s]=await db.all(s);
  out.data.kv=out.data.kv.filter(k=>!['draft','deviceId','syncSeq','lastSync','nextOrderNo'].includes(k.id)); return out; } // recipes ('secure') never included
async function makeBackup(reason){ try{ const snap=await snapshot(); const id='bk-'+new Date(now()).toISOString()+'-'+reason; const txt=JSON.stringify(snap);
    await db.put('backups',{id,at:now(),reason,size:txt.length,snap},true);
    const all=(await db.all('backups')).sort((a,b)=>b.at-a.at); for(const b of all.slice(14)) await db.del('backups',b.id); await db.kvSet('lastBackupDate',L.businessDate(now()));
    if(await db.kvGet('autoDownloadBackup',false)) download(`moes-backup-${L.businessDate(now())}-${reason}.json`,txt); return id; }
  catch(e){ toast(db.isQuotaError(e)?'Storage full: backup failed – export manually and delete old backups':'Backup failed: '+e.message,'err'); } }
async function dailyBackupCheck(){ if((await db.kvGet('lastBackupDate'))!==L.businessDate(now())) await makeBackup('daily'); }
async function restore(snap){ if(snap?.kind!=='moes-backup'||!snap.data) throw new Error("Not a Moe's backup file");
  for(const [s,rows] of Object.entries(snap.data)){ if(!db.STORES.includes(s)||s==='secure'||!Array.isArray(rows)) continue; await db.putMany(s,rows,true); } await loadCfg(); }
// ---------- Settings (owner) ----------
async function renderSettings(){ if(App.user?.role!=='owner'){ $('#main').innerHTML='<p>Owner only.</p>'; return; }
  const sc=await Sync.config(); const pcfg=await db.kvGet('print',{mode:'auto'}); const pm=pcfg.mode||'auto'; const tab=App.setTab||'menu'; const tabs={menu:'Menu & prices',addons:'Add-ons',zones:'Delivery zones',staff:'Staff & PINs',policy:'Policy & device',print:'Printing',sync:'Sync',data:'Backup & data',log:'Activity log'};
  let body='';
  if(tab==='menu') body=Object.entries(App.menus).map(([mid,m])=>`<h3>${esc(m.name||mid)}</h3><table class="tbl" data-menu="${mid}"><tr><th>On</th><th>Item</th><th>Price</th><th>Cost</th></tr>${m.items.map(i=>`<tr><td><input type="checkbox" data-on="${mid}|${i.id}" ${i.on?'checked':''} data-t="avail-${mid}-${i.id}"></td><td>${esc(i.name)}${i.pending?' <small class="warn">price pending</small>':''}</td><td><input class="num" data-price="${mid}|${i.id}" value="${i.price}" data-t="price-${mid}-${i.id}"></td><td><input class="num" data-cost="${mid}|${i.id}" value="${i.cost||0}"></td></tr>`).join('')}</table>`).join('')+'<button class="btn primary" id="savemenu" data-t="save-menu">Save menu</button>';
  if(tab==='addons') body=Object.entries(App.menus).filter(([,m])=>(m.addons||[]).length).map(([mid,m])=>`<h3>${esc(m.name||mid)}</h3><table class="tbl">${m.addons.map((a,ix)=>`<tr><td>${esc(a.name)}</td><td><input class="num" data-ap="${mid}|${ix}" value="${a.price}"></td></tr>`).join('')}</table>`).join('')+'<button class="btn primary" id="saveadd">Save add-ons</button>';
  if(tab==='zones') body=`<p class="muted">Customer charge and Speedway rider fare are separate. Reports show both and the difference.</p><table class="tbl" data-t="zones"><tr><th>Zone</th><th>Customer charge</th><th>Rider fare</th><th>Areas</th></tr>${App.zones.map((z,ix)=>`<tr><td>${z.id}</td><td><input class="num" data-zc="${ix}" value="${z.customerCharge}" data-t="zc-${z.id}"></td><td><input class="num" data-zf="${ix}" value="${z.riderFare}" data-t="zf-${z.id}"></td><td><textarea data-za="${ix}" rows="2">${esc(z.areas)}</textarea></td></tr>`).join('')}</table><button class="btn primary" id="savezones" data-t="save-zones">Save zones</button>`;
  if(tab==='staff') body=`<table class="tbl">${App.staff.map(s=>`<tr><td>${esc(s.name)}</td><td>${s.role}</td><td>${s.mustChangePin?'<span class="warn">placeholder PIN</span>':'set'}</td><td><button class="btn small" data-pin="${s.id}">Change PIN</button><button class="btn small" data-act2="${s.id}">${s.active===false?'Enable':'Disable'}</button></td></tr>`).join('')}</table><button class="btn" id="addstaff">+ Staff</button>`;
  if(tab==='policy') body=`<form id="pol" class="grid2"><label>Cashier max discount %<input name="cashierMaxDiscountPct" value="${App.policy.cashierMaxDiscountPct}"></label><label>Staff meal %<input name="staffMealPct" value="${App.policy.staffMealPct}"></label><label>Late after (minutes)<input name="lateMinutes" value="${App.policy.lateMinutes}"></label><label>FP commission % (estimate)<input name="fpCommissionPct" value="${App.policy.fpCommissionPct}"></label><label class="radio"><input type="checkbox" name="gstOn" ${App.policy.gstOn?'checked':''} data-t="gst-on"> Charge GST</label><label>GST %<input name="gstPct" value="${App.policy.gstPct}"></label><label class="radio"><input type="checkbox" name="cashierCanRefund" ${App.policy.cashierCanRefund?'checked':''}> Cashier can refund</label>
     <label>Next order number (this device)<input name="startNo" value="${App.settings.startNo}" data-t="startno"></label><label>Order number prefix (this device, e.g. I-)<input name="devicePrefix" value="${esc(App.settings.devicePrefix||'')}" data-t="prefix"></label><label>Device name<input name="deviceName" value="${esc(App.settings.deviceName||'')}"></label><button class="btn primary" data-t="save-policy">Save</button></form>`;
  if(tab==='print') body=`${P.isIPad()?'<p class="warn">This looks like an iPad: printing is off in Auto mode.</p>':''}<form id="prf" class="grid2"><label>Printing<select name="mode" data-t="print-mode"><option value="auto" ${pm==='auto'?'selected':''}>Auto (off on iPad)</option><option value="on" ${pm==='on'?'selected':''}>On</option><option value="off" ${pm==='off'?'selected':''}>Off</option></select></label><label>Print helper URL<input name="url" value="${esc(pcfg.helper||'http://127.0.0.1:9123')}"></label><label>Kitchen copies<input name="kc" value="${pcfg.kitchenCopies??1}"></label><label class="radio"><input type="checkbox" name="fallback" ${pcfg.fallback?'checked':''}> Open browser 80mm print once if the helper is down</label><button class="btn primary">Save</button></form><button class="btn" id="testprint" data-t="testprint">Test print</button><p>Pending print jobs: ${(await P.pending()).length}</p>`;
  if(tab==='sync') body=`<p class="muted">Optional. The app works fully without sync. Data syncs to your free Supabase table <code>moes_records</code>. Recipes are never synced.</p><form id="syf" class="grid2"><label class="radio"><input type="checkbox" name="enabled" ${sc.enabled?'checked':''} data-t="sync-on"> Enable sync</label><label>Supabase URL<input name="url" value="${esc(sc.url||'')}" data-t="sync-url"></label><label>Anon key<input name="key" value="${esc(sc.anonKey||'')}" data-t="sync-key"></label><label>Shop key (shared secret)<input name="shopKey" value="${esc(sc.shopKey||'')}" data-t="sync-shop"></label><button class="btn primary" data-t="save-sync">Save</button></form><button class="btn" id="syncnow" data-t="sync-now">Sync now</button>${await (async()=>{const ls=await db.kvGet('lastSync');return `<p data-t="lastsync">Last sync: ${ls?L.fmtDT(ls.at)+(ls.ok?' ✓':' <span class="warn">'+esc(ls.error)+'</span>'):'never'}</p>`;})()}`;
  if(tab==='data') body=`<div class="row"><button class="btn" id="bknow" data-t="backup-now">Backup now</button><button class="btn" id="export" data-t="export">Export backup file</button><label class="btn">Restore from file<input type="file" id="restore" accept=".json" hidden data-t="restore-file"></label><label class="btn">Import backlog file<input type="file" id="backlog" accept=".json" hidden data-t="backlog-file"></label><label class="radio"><input type="checkbox" id="autodl" ${await db.kvGet('autoDownloadBackup',false)?'checked':''}> Also download the backup file at each shift close</label></div>
     <table class="tbl" data-t="backups">${(await db.all('backups')).sort((a,b)=>b.at-a.at).map(b=>`<tr><td>${L.fmtDT(b.at)}</td><td>${esc(b.reason)}</td><td>${Math.round(b.size/1024)} KB</td><td><button class="btn small" data-dl="${esc(b.id)}">Download</button><button class="btn small" data-rs="${esc(b.id)}">Restore</button></td></tr>`).join('')}</table>`;
  if(tab==='log') body=`<table class="tbl" data-t="log">${(await db.all('log')).sort((a,b)=>b.at-a.at).slice(0,300).map(l=>`<tr><td>${L.fmtDT(l.at)}</td><td>${esc(l.staffName||'')}</td><td>${esc(l.action)}</td><td><small>${esc(JSON.stringify(l.detail||''))}</small></td></tr>`).join('')}</table>`;
  $('#main').innerHTML=`<div class="pad1"><div class="tabs">${Object.entries(tabs).map(([k,v])=>`<button class="tab ${k===tab?'on':''}" data-tab="${k}" data-t="tab-${k}">${v}</button>`).join('')}</div>${body}</div>`;
  $$('[data-tab]').forEach(b=>b.onclick=()=>{ App.setTab=b.dataset.tab; renderSettings(); });
  const on=(sel,fn)=>{ const el=$(sel); if(el) el.onclick=()=>safe(fn); };
  on('#savemenu',async()=>{ for(const [mid,m] of Object.entries(App.menus)) for(const i of m.items){ const k=mid+'|'+i.id; i.on=$(`[data-on="${k}"]`).checked; i.price=toInt($(`[data-price="${k}"]`).value,{min:0,max:100000}); i.cost=toInt($(`[data-cost="${k}"]`).value||0,{min:0}); if(mid==='mashion'&&i.price>0) i.pending=false; } for(const m of Object.values(App.menus)) await db.put('menus',m); await logAct('menu-save'); await loadCfg(); toast('Menu saved'); renderSettings(); });
  on('#saveadd',async()=>{ for(const [mid,m] of Object.entries(App.menus)){ (m.addons||[]).forEach((a,ix)=>{ a.price=toInt($(`[data-ap="${mid}|${ix}"]`).value,{max:100000}); }); await db.put('menus',m); } await logAct('addons-save'); toast('Saved'); });
  on('#savezones',async()=>{ for(const [ix,z] of App.zones.entries()){ z.customerCharge=toInt($(`[data-zc="${ix}"]`).value,{max:10000}); z.riderFare=toInt($(`[data-zf="${ix}"]`).value,{max:10000}); z.areas=$(`[data-za="${ix}"]`).value.trim(); await db.put('zones',z); } await logAct('zones-save'); toast('Zones saved'); });
  $$('[data-pin]').forEach(b=>b.onclick=()=>safe(async()=>{ const s=App.staff.find(x=>x.id===b.dataset.pin); const r=await form('New PIN for '+s.name,'<label>New PIN (4-8 digits)<input name="p" type="password" inputmode="numeric"></label>',r=>{ if(!/^\d{4,8}$/.test(r.p)) throw new Error('4-8 digits'); return true; }); if(!r) return; s.pinHash=await hashPin(r.p,'moes:'+s.id); s.mustChangePin=false; await db.put('staff',s); await logAct('pin-change',{staff:s.name}); renderSettings(); }));
  $$('[data-act2]').forEach(b=>b.onclick=()=>safe(async()=>{ const s=App.staff.find(x=>x.id===b.dataset.act2); s.active=s.active===false; await db.put('staff',s); renderSettings(); }));
  on('#addstaff',async()=>{ const r=await form('Add staff','<label>Name<input name="n"></label><label>Role<select name="r"><option>cashier</option><option>kitchen</option><option>owner</option></select></label><label>PIN<input name="p" type="password" inputmode="numeric"></label>',r=>{ if(!r.n.trim()||!/^\d{4,8}$/.test(r.p)) throw new Error('Name and a 4-8 digit PIN'); return true; }); if(!r) return; const id=r.n.trim().toLowerCase().replace(/\W+/g,''); await db.put('staff',{id,name:r.n.trim(),role:r.r,pinHash:await hashPin(r.p,'moes:'+id),active:true}); await loadCfg(); renderSettings(); });
  $('#pol')&&($('#pol').onsubmit=e=>{ e.preventDefault(); safe(async()=>{ const f=Object.fromEntries(new FormData(e.target)); Object.assign(App.policy,{cashierMaxDiscountPct:toNum(f.cashierMaxDiscountPct,{max:100}),staffMealPct:toNum(f.staffMealPct,{max:100}),lateMinutes:toInt(f.lateMinutes,{min:1}),fpCommissionPct:toNum(f.fpCommissionPct,{max:100}),gstOn:!!f.gstOn,gstPct:toNum(f.gstPct,{max:50}),cashierCanRefund:!!f.cashierCanRefund});
     Object.assign(App.settings,{startNo:toInt(f.startNo,{min:1}),devicePrefix:f.devicePrefix.trim().slice(0,6),deviceName:f.deviceName.trim()}); await db.kvSet('policy',App.policy); await db.kvSet('settings',App.settings);
     const cur=await db.kvGet('nextOrderNo'); if(cur==null||App.settings.startNo>cur) await db.kvSet('nextOrderNo',App.settings.startNo); await logAct('policy-save'); toast('Saved'); }); });
  $('#prf')&&($('#prf').onsubmit=e=>{ e.preventDefault(); safe(async()=>{ const f=Object.fromEntries(new FormData(e.target)); if(!/^https?:\/\/[\w.:-]+$/.test(f.url.trim())) throw new Error('Helper URL like http://127.0.0.1:9123'); await db.kvSet('print',{mode:f.mode,helper:f.url.trim(),kitchenCopies:toInt(f.kc,{min:0,max:5}),fallback:!!f.fallback}); await applyPrintClass(); toast('Saved'); renderSettings(); }); });
  on('#testprint',async()=>{ await P.queue('receipt',{orderNo:'TEST',channel:'instore',type:'takeaway',lines:[{qty:1,name:'Test print',price:0,heat:'Mild'}],payments:[],createdAt:now(),totals:{subtotal:0,discount:0,delivery:0,gst:0,total:0}},App.settings); renderStatus(); });
  $('#syf')&&($('#syf').onsubmit=e=>{ e.preventDefault(); safe(async()=>{ const f=Object.fromEntries(new FormData(e.target)); if(f.enabled&&!/^https:\/\/.+/.test(f.url.trim())&&!/^http:\/\/(127\.0\.0\.1|localhost)/.test(f.url.trim())) throw new Error('Supabase URL must start with https://'); await db.kvSet('sync',{enabled:!!f.enabled,url:f.url.trim().replace(/\/$/,''),anonKey:f.key.trim(),shopKey:f.shopKey.trim()}); toast('Sync settings saved'); renderSettings(); }); });
  on('#syncnow',async()=>{ const r=await Sync.syncNow(); toast(r.error?'Sync failed: '+r.error:r.skipped?'Sync is off or offline':`Synced ↑${r.pushed} ↓${r.pulled}`,r.error?'err':''); await loadCfg(); renderSettings(); });
  on('#bknow',async()=>{ await makeBackup('manual'); toast('Backup saved'); renderSettings(); });
  on('#export',async()=>download(`moes-backup-${L.businessDate(now())}.json`,JSON.stringify(await snapshot())));
  $('#autodl')&&($('#autodl').onchange=e=>db.kvSet('autoDownloadBackup',e.target.checked));
  $('#restore')&&($('#restore').onchange=e=>safe(async()=>{ const snap=JSON.parse(await e.target.files[0].text()); e.target.value=''; let by=await ownerApprove('Restore backup (merges into this device)'); if(!by) return; await makeBackup('pre-restore'); await restore(snap); await logAct('restore'); toast('Backup restored'); renderSettings(); }));
  $('#backlog')&&($('#backlog').onchange=e=>safe(async()=>{ const d=JSON.parse(await e.target.files[0].text()); e.target.value=''; const n=await importBacklog(d); toast(`Imported ${n} backlog orders`); renderSettings(); }));
  $$('[data-dl]').forEach(b=>b.onclick=()=>safe(async()=>{ const bk=await db.get('backups',b.dataset.dl); download(bk.id.replace(/[:]/g,'-')+'.json',JSON.stringify(bk.snap)); }));
  $$('[data-rs]').forEach(b=>b.onclick=()=>safe(async()=>{ const bk=await db.get('backups',b.dataset.rs); if(!await ownerApprove('Restore this backup')) return; await restore(bk.snap); toast('Restored'); }));
}
export async function importBacklog(d){ if(d?.kind!=='moes-backlog'||!Array.isArray(d.orders)) throw new Error('Not a backlog file');
  let n=0; for(const raw of d.orders){ const o=L.backlogToOrder(raw,{store:App.menus.store.items,fp:App.menus.fp.items},App.zones); if(await db.get('orders',o.id)) continue; await commitBacklog(o); n++; }
  const maxNo=Math.max(0,...(await db.all('orders')).map(o=>o.orderSeq||0)); const cur=await db.kvGet('nextOrderNo'); if(maxNo&&(cur==null||cur<=maxNo)) await db.kvSet('nextOrderNo',maxNo+1);
  await logAct('backlog-import',{count:n}); return n; }
async function commitBacklog(o){ const ded=L.deductionsFor(o,App.usage,App.bom); const loc=o.location==='mashion'?'mashion':'main';
  await db.atomic([{store:'orders',obj:o},...Object.entries(ded).map(([itemId,q])=>({store:'stockMoves',obj:{id:o.id+':'+itemId,itemId,location:loc,qty:-q,type:'sale',ref:o.id,at:o.createdAt,by:'backlog'}}))]); }

window.__pos={App,db,L,S,P,Sync,commitOrder,importBacklog,makeBackup,restore,snapshot,onHand,go,renderStatus};
boot();
