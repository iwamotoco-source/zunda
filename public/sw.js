const CACHE='zunda-switch-shell-v2';
const SHELL=['/','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(p=>c.add(p)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const r=event.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 event.respondWith(fetch(r).then(response=>{
   if(response.ok&&(u.pathname==='/'||u.pathname.startsWith('/assets/')||SHELL.includes(u.pathname))){
      const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(r,copy)));
   }return response;
 }).catch(()=>caches.match(r)));
});
