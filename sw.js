const C="gasto360-cloud-r8-1";
const A=["./","./styles.css?v=8.1","./app.js?v=8.1","./scanner.js","./config.js","./manifest.webmanifest"];
self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c=>c.addAll(A)));
});
self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.pathname.endsWith("/config.js") || u.pathname.endsWith("/app.js")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{
    const x=r.clone(); caches.open(C).then(c=>c.put(e.request,x)); return r;
  }).catch(()=>caches.match(e.request)));
});
