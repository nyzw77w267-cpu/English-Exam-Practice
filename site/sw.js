/* Generated release cache. Rebuild with scripts/build_site.py; do not edit sw.js. */
'use strict';
const BUILD = '29f81fe4e2d1f4e2';
const FILES = [{"path":"index.html","sha256":"b367a02ec62f3df190baaea74e00ed0010d9515e33da8070f967cb35f49802fb"},{"path":"styles.css","sha256":"2c1d8326d516b917951ccea0310ec9c7bb85898eeed3810f66ca73e381052f5a"},{"path":"core.js","sha256":"8ec97b93222291ecd0df9ca474cc892b5dd16d4cb4692511295ba8204f157476"},{"path":"app.js","sha256":"f44c68bda82b9dc4821dffab97f21e14726c567fd944446453be1f80b3f0562c"},{"path":"pwa.js","sha256":"4d456ae3469c58a2e7f018887b1c72fbfe4464bcb6459abd3bdbe2656e02fcf4"},{"path":"manifest.webmanifest","sha256":"56e2e2d0aee9b12a912fef7cb5b55d0b0346aac78d4eb4c35f1dc568040a5253"},{"path":"data/bank.js","sha256":"439acfb77b98913f5daedee7bdb751d8c91c2d3f6b834ea8bd6beb2f5a0e73bc"},{"path":"assets/icon.svg","sha256":"641c44de8bc0b2e4149b3b27ad0cd19baf0836be2823cd67534931b092d24e1f"},{"path":"assets/icon-192.png","sha256":"0f4ebdc515f0b80a8f8165c3c78b090ade04a5295e398b869d6c704587414177"},{"path":"assets/icon-512.png","sha256":"564a6520c69b9e4f2ee69093132a0e38e52134f112a963938103a77e14d0186a"},{"path":"assets/icon-maskable.png","sha256":"564a6520c69b9e4f2ee69093132a0e38e52134f112a963938103a77e14d0186a"},{"path":"assets/apple-touch-icon.png","sha256":"4a9b9fbd0ae776d6c5f5f24ff271c86bef327bde0a915fc7a325fc7bef54ab9a"}];
const PREFIX = 'eep-pwa:' + self.registration.scope + ':';
const CACHE = PREFIX + BUILD;
const absolute = path => new URL(path, self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      for (const file of FILES) {
        const response = await fetch(new Request(absolute(file.path), {cache:'no-store', credentials:'same-origin'}));
        if (!response.ok || response.type === 'opaque' || response.redirected) throw Error('Incomplete release: '+file.path);
        const bytes = await response.clone().arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
        if (hash !== file.sha256) throw Error('Release mismatch: '+file.path);
        await cache.put(absolute(file.path), response);
      }
    } catch(error) { await caches.delete(CACHE); throw error; }
    // New releases wait for an explicit update action. First installation activates normally.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if(key.startsWith(PREFIX) && key!==CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='ACTIVATE_UPDATE') { event.waitUntil(self.skipWaiting()); }
  if(event.data?.type==='OFFLINE_STATUS') event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const matches=await Promise.all(FILES.map(file=>cache.match(absolute(file.path))));
    event.ports[0]?.postMessage({build:BUILD,ready:matches.every(Boolean),files:matches.filter(Boolean).length,total:FILES.length});
  })());
});
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const isShell=request.mode==='navigate' && (url.pathname===scope.pathname || url.pathname===new URL('index.html',scope).pathname);
  const file=FILES.find(f=>new URL(f.path,scope).pathname===url.pathname);
  if(!isShell&&!file)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(absolute(isShell?'index.html':file.path));
    // Never mix network files into a pinned release if its cache has been evicted.
    return cached || new Response('离线文件不完整，请联网后在设置中检查更新。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
