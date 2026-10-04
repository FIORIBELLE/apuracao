const CACHE="apuracao-2026-shell-v2";
const CACHE_PREFIX="apuracao-2026-shell-";
const SHELL=["./index.html","./apuracao-2026.webmanifest","./apuracao-icon.svg","./apuracao-icon-180.png","./apuracao-icon-192.png","./apuracao-icon-512.png"];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET") return;

  const url=new URL(request.url);
  const scopeURL=new URL(self.registration.scope);
  if(url.origin!==scopeURL.origin) return;

  const appRoot=scopeURL.pathname.endsWith("/") ? scopeURL.pathname : scopeURL.pathname+"/";
  const indexPath=appRoot+"index.html";

  if(request.mode==="navigate"){
    if(url.pathname!==appRoot && url.pathname!==indexPath) return;
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put("./index.html",copy));
          }
          return response;
        })
        .catch(()=>caches.match("./index.html"))
    );
    return;
  }

  const shellPaths=new Set(SHELL.map(path=>new URL(path,scopeURL).pathname));
  if(shellPaths.has(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
  }
});
