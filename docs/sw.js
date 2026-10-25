/* オフラインで動かすための保存（アプリ本体のみ。記録データは端末内の保存領域にあり、ここでは扱わない） */
const CACHE = 'diveops-shell-0.5.0-c546f5bd';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './exceljs.min.js'];
// 新しい版を入れるときは、ブラウザのキャッシュを通さずに取り直す
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 先に保存分を返し、つながる時は裏で新しい版に入れ替える
  const net = caches.open(CACHE).then(c => fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })).catch(() => null);
  e.waitUntil(net.then(() => {}));
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    return hit || (await net) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
