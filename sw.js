// PS Lounge Service Worker v4.0 - Professional Notifications & Background Alarms
const CACHE_NAME = 'ps-lounge-v5';

// ✅ Use relative paths for GitHub Pages compatibility
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Install Event - Cache Assets
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

// Activate Event - Clean Old Caches & Register Background Alarm
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
  // Register periodic sync for checking expired sessions (if supported)
  registerPeriodicSync();
});

// Register periodic background sync (supported on Android Chrome)
async function registerPeriodicSync() {
  if ('periodicSync' in self.registration) {
    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await self.registration.periodicSync.register('check-sessions', {
          minInterval: 15 * 60 * 1000 // check every 15 minutes
        });
        console.log('✅ Periodic sync registered');
      }
    } catch (error) {
      console.log('Periodic sync not supported:', error);
    }
  }
}

// Handle periodic sync event
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-sessions') {
    event.waitUntil(checkExpiredSessionsAndNotify());
  }
});

// Function to check expired sessions from localStorage (access via clients)
async function checkExpiredSessionsAndNotify() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.length === 0) return; // no open window, can't access localStorage directly
  
  // Send message to client to check and return expired sessions
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const { expiredSessions } = event.data;
      for (const session of expiredSessions) {
        showExpiredNotification(session);
      }
      resolve();
    };
    clients[0].postMessage({ type: 'GET_EXPIRED_SESSIONS' }, [channel.port2]);
  });
}

// Show professional notification for expired session
function showExpiredNotification(session) {
  const title = '🚨 انتهاء وقت الجلسة!';
  const options = {
    body: `الشاشة: ${session.deviceNumber || '?'}\nالعميل: ${session.customerName}\nانتهى الوقت المحدد`,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: `expired-${session.id}`,
    renotify: true,
    requireInteraction: true,
    data: { sessionId: session.id, url: './index.html' },
    actions: [
      { action: 'open', title: 'فتح التطبيق' },
      { action: 'dismiss', title: 'تجاهل' }
    ]
  };
  self.registration.showNotification(title, options);
}

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || './index.html';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// Listen for messages from main thread to show notifications
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
  if (event.data && event.data.type === 'GET_EXPIRED_SESSIONS') {
    // Client will respond via the port
    event.ports[0].postMessage({ expiredSessions: [] }); // placeholder, real response from client
  }
});

// Fetch Event - Network First, Cache Fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
        }
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
        }
        return networkResponse;
      }).catch(() => new Response('', { status: 404 }));
    })
  );
});

console.log('🎮 PS Lounge Service Worker v4.0 Loaded - Professional Notifications');
