/**
 * Service Worker · 漫剧工坊 PWA
 * 策略：静态资源缓存优先，API 网络优先，离线降级
 */
const CACHE = 'mju-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/editor.js',
  '/js/ai.js',
  '/js/uploader.js',
  '/js/exporter.js',
  '/js/collab.js',
  '/js/views.js',
  '/js/app.js',
  '/manifest.json',
  '/assets/app-icon.jpg',
  '/assets/hero-illustration.jpg'
];

// 安装：预缓存静态资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// 请求拦截
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // API 与 WebSocket 升级：网络优先，不缓存
  if (url.pathname.startsWith('/api/') || url.protocol === 'ws:') {
    e.respondWith(fetch(req).catch(() => new Response('{"error":"离线"}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // 静态资源：缓存优先，网络回填
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
