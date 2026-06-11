// PS Lounge Service Worker v5.0 - Scheduled Background Notifications
const CACHE_NAME = 'ps-lounge-v6';

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

// Fetch Event - Network First, Cache Fallback (unchanged)
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

// ===== SCHEDULED NOTIFICATIONS (Background mode) =====
// Store scheduled notification IDs to allow cancellation
let scheduledNotificationTags = new Set();

// Helper to check if TimestampTrigger is supported
function isTriggerSupported() {
  return 'showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined';
}

// Schedule a notification at exact timestamp
async function scheduleNotification(timestamp, title, options) {
  if (!isTriggerSupported()) {
    console.log('⚠️ TimestampTrigger not supported, using fallback');
    // Fallback: immediate notification? But we'll just rely on main thread
    return null;
  }
  
  try {
    const trigger = new TimestampTrigger(timestamp);
    const notificationOptions = {
      ...options,
      showTrigger: trigger
    };
    // Use a unique tag to avoid duplicate display
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

// Cancel a scheduled notification by tag (workaround: cannot directly cancel, but we can avoid showing duplicates)
// We'll just remove from set, but notification might still fire; we'll handle by checking session status in click handler.
function cancelScheduledNotification(tag) {
  scheduledNotificationTags.delete(tag);
  console.log(`🗑️ Cancelled scheduled notification: ${tag}`);
}

// ===== MESSAGE HANDLER =====
self.addEventListener('message', async event => {
  const { data } = event;
  
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  
  // Handle immediate notification request (e.g., test)
  if (data && data.type === 'SHOW_NOTIFICATION') {
    showBackgroundNotification(data.payload);
  }
  
  // Handle sound notification (forward to clients)
  if (data && data.type === 'PLAY_SOUND') {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'PLAY_SOUND', sound: data.sound });
    });
  }
  
  // ✅ NEW: Schedule a notification for future time
  if (data && data.type === 'SCHEDULE_NOTIFICATION') {
    const { timestamp, title, body, tag, icon, badge, sessionId, deviceNumber, customerName, type } = data.payload;
    // Build options
    const options = {
      body: body,
      icon: icon || 'icon-192.png',
      badge: badge || 'icon-192.png',
      tag: tag,
      dir: 'rtl',
      lang: 'ar',
      requireInteraction: type === 'critical',
      silent: false,
      vibrate: type === 'critical' ? [200, 100, 200] : [100],
      data: { sessionId, deviceNumber, customerName, url: './index.html' }
    };
    
    await scheduleNotification(timestamp, title, options);
  }
  
  // ✅ NEW: Cancel scheduled notifications for a session
  if (data && data.type === 'CANCEL_SESSION_NOTIFICATIONS') {
    const { sessionId } = data;
    // Cancel all tags related to this session
    scheduledNotificationTags.forEach(tag => {
      if (tag.includes(`ps-session-${sessionId}`)) {
        cancelScheduledNotification(tag);
      }
    });
  }
});

// Professional immediate background notification (for testing or instant alerts)
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
  
  let body = message;
  if (deviceNumber && customerName) {
    body = `🖥 الشاشة: ${deviceNumber}\n👤 العميل: ${customerName}\n\n${message}`;
    if (remainingMinutes !== null && remainingMinutes > 0) {
      body += `\n⏰ متبقي: ${remainingMinutes} دقيقة`;
    }
  }
  
  const options = {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: `ps-session-${sessionId || Date.now()}`,
    dir: 'rtl',
    lang: 'ar',
    vibrate: type === 'critical' ? [200, 100, 200, 100, 200] : [100, 50, 100],
    silent: false,
    renotify: true,
    requireInteraction: type === 'critical',
    actions: type === 'critical' ? [
      { action: 'open', title: '🎮 فتح التطبيق' },
      { action: 'dismiss', title: 'إغلاق' }
    ] : [],
    data: { sessionId, url: './index.html' }
  };
  
  try {
    await self.registration.showNotification(title, options);
    console.log('✅ Background notification shown:', title);
  } catch (error) {
    console.log('❌ Failed to show notification:', error);
  }
}

// Handle notification clicks (when user taps on notification)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const { action, notification } = event;
  const data = notification.data || {};
  const urlToOpen = data.url || './index.html';
  
  if (action === 'open' || !action) {
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
          if (data.sessionId && windowClient) {
            setTimeout(() => {
              windowClient.postMessage({ 
                type: 'FOCUS_SESSION', 
                sessionId: data.sessionId 
              });
            }, 500);
          }
        })
    );
  }
});

console.log('🎮 PS Lounge Service Worker v5.0 Loaded - Scheduled Notifications Active');
