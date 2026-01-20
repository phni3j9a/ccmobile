const CACHE_VERSION = 'v2';
const CACHE_NAME = `claude-terminal-${CACHE_VERSION}`;

// 静的アセット
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/terminal.js',
  '/manifest.json',
  '/icons/icon.svg'
];

// CDNリソース（オフライン対応のためキャッシュ）
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js',
  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js',
  'https://cdn.jsdelivr.net/npm/xterm-addon-unicode11@0.6.0/lib/xterm-addon-unicode11.js',
  'https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js'
];

// インストール時にアセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 静的アセットを追加
      await cache.addAll(STATIC_ASSETS);

      // CDNアセットを個別に追加（失敗しても続行）
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('CDNキャッシュ失敗:', url, e);
        }
      }
    })
  );
  self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('claude-terminal-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// フェッチ戦略
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Socket.ioとAPIリクエストはキャッシュしない
  if (url.pathname.includes('/socket.io/') || url.pathname.startsWith('/api/')) {
    return;
  }

  // CDNリクエストはCache First戦略
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // キャッシュがあれば返しつつ、バックグラウンドで更新
          fetch(event.request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {});
          return cached;
        }
        // キャッシュがなければネットワークから取得
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // その他のリクエストはNetwork First戦略
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功したらキャッシュを更新
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗時はキャッシュから返す
        return caches.match(event.request);
      })
  );
});

// アプリ更新通知
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
