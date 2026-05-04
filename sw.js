// 翔の手帳 Service Worker
// バージョン番号は index.html 更新のたび手動で上げてください（v9 v10 v11 ...）
const SW_VERSION = 'v16';
const CACHE_NAME = `sho-dashboard-${SW_VERSION}`;
const ASSETS = [
  '/my-dashboard/',
  '/my-dashboard/index.html',
  '/my-dashboard/manifest.json',
  '/my-dashboard/icon-192.png',
  '/my-dashboard/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Noto+Sans+JP:wght@300;400;500&display=swap'
];

// install: 新しいSWは即座にアクティベート
self.addEventListener('install', e => {
  self.skipWaiting(); // 待機状態を飛ばして即座に置き換える
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
});

// activate: 古いキャッシュを削除して、開いているタブをすぐコントロール
self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

// fetch:
// - HTML（ナビゲーション）は network-first（常に最新を取りに行き、失敗したらキャッシュ）
// - その他は stale-while-revalidate（キャッシュを即返し、裏で更新）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // クロスオリジンAPI呼び出し（Anthropic, Gemini など）はSWでキャッシュしない
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('supabase.co')) return;

  const isHTML = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // network-first
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/my-dashboard/index.html')))
    );
  } else {
    // stale-while-revalidate
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

// ページから「すぐ更新して」と言われたら新しいSWを即座に有効化する仕組み
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
