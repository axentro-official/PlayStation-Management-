// PS Lounge Service Worker v5.1 - FCM + Scheduled Notifications
const CACHE_NAME = 'ps-lounge-v6';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  console.log('🔧 SW: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 SW: Caching assets');
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => 
            cache.add(url).catch(err => console.log(`⚠️ Failed to cache: ${url}`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('✅ SW: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cachedResponse => cachedResponse || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') return networkResponse;
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
            return networkResponse;
          })
          .catch(() => new Response('', { status: 404, statusText: 'Not found' }));
      })
  );
});

// ========== FCM PUSH HANDLER ==========
self.addEventListener('push', function(event) {
  console.log('[sw.js] Push received:', event);
  let data = { title: 'تذكير', body: 'هناك إشعار جديد', icon: '/icon-192.png', badge: '/icon-192.png' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [{ action: 'open', title: 'فتح التطبيق' }]
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const urlToOpen = notificationData.url || './index.html';
  const sessionId = notificationData.sessionId || null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(urlToOpen);
      })
      .then(windowClient => {
        if (sessionId && windowClient) {
          setTimeout(() => {
            windowClient.postMessage({ type: 'FOCUS_SESSION', sessionId: sessionId });
          }, 500);
        }
      })
  );
});

// ===== Scheduled Notifications (fallback) =====
let scheduledNotificationTags = new Set();
function isTriggerSupported() {
  return 'showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined';
}
async function scheduleNotification(timestamp, title, options) {
  if (!isTriggerSupported()) {
    console.log('⚠️ TimestampTrigger not supported');
    return null;
  }
  try {
    const trigger = new TimestampTrigger(timestamp);
    const notificationOptions = { ...options, showTrigger: trigger };
    const tag = options.tag || `ps-${timestamp}`;
    notificationOptions.tag = tag;
    await self.registration.showNotification(title, notificationOptions);
    scheduledNotificationTags.add(tag);
    console.log(`✅ Scheduled notification for ${new Date(timestamp)}`);
    return tag;
  } catch (error) {
    console.error('❌ Failed to schedule notification:', error);
    return null;
  }
}
function cancelScheduledNotification(tag) {
  scheduledNotificationTags.delete(tag);
  console.log(`🗑️ Cancelled scheduled notification: ${tag}`);
}

self.addEventListener('message', async event => {
  const { data } = event;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data && data.type === 'SHOW_NOTIFICATION') {
    showBackgroundNotification(data.payload);
  }
  if (data && data.type === 'PLAY_SOUND') {
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'PLAY_SOUND', sound: data.sound }));
  }
  if (data && data.type === 'SCHEDULE_NOTIFICATION') {
    const { timestamp, title, body, tag, icon, badge, sessionId, deviceNumber, customerName, type } = data.payload;
    const options = {
      body, icon: icon || 'icon-192.png', badge: badge || 'icon-192.png', tag, dir: 'rtl', lang: 'ar',
      requireInteraction: type === 'critical', silent: false, vibrate: type === 'critical' ? [200,100,200] : [100],
      data: { sessionId, deviceNumber, customerName, url: './index.html' }
    };
    await scheduleNotification(timestamp, title, options);
  }
  if (data && data.type === 'CANCEL_SESSION_NOTIFICATIONS') {
    const { sessionId } = data;
    scheduledNotificationTags.forEach(tag => {
      if (tag.includes(`ps-session-${sessionId}`)) cancelScheduledNotification(tag);
    });
  }
});

async function showBackgroundNotification(notificationData) {
  const { title, message, type = 'warning', sessionId = null, deviceNumber = null, customerName = null, remainingMinutes = null } = notificationData;
  let body = message;
  if (deviceNumber && customerName) {
    body = `🖥 الشاشة: ${deviceNumber}\n👤 العميل: ${customerName}\n\n${message}`;
    if (remainingMinutes !== null && remainingMinutes > 0) body += `\n⏰ متبقي: ${remainingMinutes} دقيقة`;
  }
  const options = {
    body, icon: 'icon-192.png', badge: 'icon-192.png', tag: `ps-session-${sessionId || Date.now()}`,
    dir: 'rtl', lang: 'ar', vibrate: type === 'critical' ? [200,100,200,100,200] : [100,50,100],
    silent: false, renotify: true, requireInteraction: type === 'critical',
    actions: type === 'critical' ? [{ action: 'open', title: '🎮 فتح التطبيق' }, { action: 'dismiss', title: 'إغلاق' }] : [],
    data: { sessionId, url: './index.html' }
  };
  try {
    await self.registration.showNotification(title, options);
    console.log('✅ Background notification shown:', title);
  } catch (error) { console.log('❌ Failed to show notification:', error); }
}

console.log('🎮 PS Lounge Service Worker v5.1 Loaded - FCM + Scheduled');
