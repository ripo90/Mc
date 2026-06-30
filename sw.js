const CACHE_NAME = 'master-control-v5';
const ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@300;400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600&display=swap',
];

// =====================
// INSTALL
// =====================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// =====================
// ACTIVATE
// =====================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  // Schedule notifications on activation
  scheduleAllAlarms();
});

// =====================
// FETCH
// =====================
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() =>
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      })
    )
  );
});

// =====================
// MESSAGE FROM APP
// =====================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    const { times, enabled, msgs } = event.data;
    // Save to IndexedDB so we can reschedule after SW restart
    saveSchedule({ times, enabled, msgs }).then(() => scheduleAllAlarms());
  }
  if (event.data && event.data.type === 'CANCEL_NOTIFICATIONS') {
    cancelAllAlarms();
  }
});

// =====================
// NOTIFICATION CLICK
// =====================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// =====================
// ALARM ENGINE
// =====================
let _alarmTimers = [];

function cancelAllAlarms() {
  _alarmTimers.forEach(id => clearTimeout(id));
  _alarmTimers = [];
}

async function scheduleAllAlarms() {
  cancelAllAlarms();
  const schedule = await loadSchedule();
  if (!schedule) return;

  const { times, enabled, msgs } = schedule;

  times.forEach((time, i) => {
    if (!enabled[i]) return;

    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const delay = target - now;

    const id = setTimeout(async () => {
      await self.registration.showNotification('মাস্টার কন্ট্রোল 💪', {
        body: msgs[i],
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'mc-reminder-' + i,
        renotify: true,
        requireInteraction: false,
        data: { url: './' }
      });
      // Reschedule for next day
      scheduleAllAlarms();
    }, delay);

    _alarmTimers.push(id);
  });
}

// =====================
// IndexedDB HELPERS
// =====================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mc-sw-db', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('schedule', { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSchedule(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('schedule', 'readwrite');
    tx.objectStore('schedule').put({ id: 'main', ...data });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSchedule() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('schedule', 'readonly');
      const req = tx.objectStore('schedule').get('main');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}
