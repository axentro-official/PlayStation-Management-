importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyC2bamJrV1-XOygRcK2NDnDH4rsqQpQt3Q",
  authDomain: "ps-lounge-push.firebaseapp.com",
  projectId: "ps-lounge-push",
  storageBucket: "ps-lounge-push.firebasestorage.app",
  messagingSenderId: "749927682693",
  appId: "1:749927682693:web:5169ed36b2f6b9d1f0cfec",
  measurementId: "G-TD4D8JVT7H"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
