// মাস্টার কন্ট্রোল — Service Worker
// Network-first strategy: অনলাইনে নতুন ভার্সন, অফলাইনে cache থেকে

const CACHE_NAME = 'mastercontrol-v6';

// এই ফাইলগুলো অফলাইনে কাজ করবে
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './images/logo-0ab19f16.png',
  './images/logo-6477d386.jpg',
  './images/mastercontrol-01.jpg',
  './images/recovery-01.jpg',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@300;400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600&display=swap'
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(() => {
            console.warn('SW: cache miss (ok):', url);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE — পুরানো cache সাফ করো =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== FETCH — Network first, Cache fallback =====
self.addEventListener('fetch', event => {
  // শুধু GET request handle করো
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Chrome extension / non-http বাদ দাও
  if (!url.protocol.startsWith('http')) return;

  // WhatsApp, external links — SW bypass
  if (url.hostname !== self.location.hostname &&
      !url.hostname.includes('fonts.gstatic.com') &&
      !url.hostname.includes('fonts.googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Network থেকে পেলে cache-এ সেভ করো
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline — cache থেকে দাও
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Cache-এও নেই — index.html দাও (SPA fallback)
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('অফলাইন — ফাইল পাওয়া যাচ্ছে না', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});

// ===== MESSAGE — force update =====
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
