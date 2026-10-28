// PIN hashing + recipe encryption (AES-GCM, key from PBKDF2(PIN)). Recipes are never in the shipped bundle.
const enc=new TextEncoder(), dec=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))); const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function hashPin(pin,salt){ const h=await crypto.subtle.digest('SHA-256',enc.encode(salt+':'+pin)); return b64(h); }
async function key(pin,salt){ const base=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
export async function encryptJSON(obj,pin){ const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(pin,salt),enc.encode(JSON.stringify(obj))); return {salt:b64(salt),iv:b64(iv),ct:b64(ct)}; }
export async function decryptJSON(blob,pin){ const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},await key(pin,unb64(blob.salt)),unb64(blob.ct)); return JSON.parse(dec.decode(pt)); }
