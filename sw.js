// PS Lounge Service Worker v4.0 - Enhanced Notifications for Background Mode
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
            cache.add(url).catch(err => {
              console.log(`⚠️ Failed to cache: ${url}`, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Old Caches
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

// Fetch Event - Network First, Cache Fallback
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
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            return caches.match('./index.html');
          });
        })
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
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
            return networkResponse;
          })
          .catch(() => {
            return new Response('', { status: 404, statusText: 'Not found' });
          });
      })
  );
});

// ===== ENHANCED NOTIFICATION HANDLER =====
self.addEventListener('message', event => {
  const { data } = event;
  
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  
  // Handle notification requests from main thread
  if (data && data.type === 'SHOW_NOTIFICATION') {
    showBackgroundNotification(data.payload);
  }
  
  // Handle sound notification
  if (data && data.type === 'PLAY_SOUND') {
    // Note: Service workers cannot play sounds directly,
    // but we can forward to all clients to play
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'PLAY_SOUND', sound: data.sound });
      });
    });
  }
});

// Professional background notification function
async function showBackgroundNotification(notificationData) {
  const { 
    title, 
    message, 
    type = 'warning', 
    sessionId = null,
    deviceNumber = null,
    customerName = null,
    remainingMinutes = null
  } = notificationData;
  
  // Build rich notification body
  let body = message;
  if (deviceNumber && customerName) {
    body = `🖥 الشاشة: ${deviceNumber}\n👤 العميل: ${customerName}\n\n${message}`;
    if (remainingMinutes !== null) {
      body += `\n⏰ متبقي: ${remainingMinutes} دقيقة`;
    }
  }
  
  const icon = 'icon-192.png';
  const badge = 'icon-192.png';
  const tag = `ps-session-${sessionId || Date.now()}`;
  
  // Configure notification options
  const options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    dir: 'rtl',
    lang: 'ar',
    vibrate: type === 'critical' ? [200, 100, 200, 100, 200] : [100, 50, 100],
    silent: false,
    renotify: true,
    requireInteraction: type === 'critical', // Stay visible until user interacts
    actions: []
  };
  
  // Add actions for critical notifications
  if (type === 'critical') {
    options.actions = [
      { action: 'open', title: '🎮 فتح التطبيق' },
      { action: 'dismiss', title: 'إغلاق' }
    ];
    options.data = { sessionId, url: './index.html' };
  }
  
  // Show the notification
  try {
    await self.registration.showNotification(title, options);
    console.log('✅ Background notification shown:', title);
  } catch (error) {
    console.log('❌ Failed to show notification:', error);
  }
}

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const { action, data } = event;
  const urlToOpen = data?.url || './index.html';
  
  if (action === 'open' || !action) {
    // Focus or open the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // Check if there's already a focused window/tab
          for (const client of clientList) {
            if (client.url.includes('index.html') && 'focus' in client) {
              return client.focus();
            }
          }
          // Open new window
          return self.clients.openWindow(urlToOpen);
        })
    );
  }
  
  // Send session ID to the app if available
  if (data?.sessionId) {
    setTimeout(() => {
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
          clients.forEach(client => {
            client.postMessage({ 
              type: 'FOCUS_SESSION', 
              sessionId: data.sessionId 
            });
          });
        });
    }, 500);
  }
});

console.log('🎮 PS Lounge Service Worker v4.0 Loaded - Enhanced Notifications');
