// firebase-messaging-sw.js — FCM background message handler
// Must be at /firebase-messaging-sw.js (root scope) for FCM to find it
// Firebase version must match the version imported in firebase.js

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDmJjhP7Al4Hn54rf2X6LkINtIuLINld8A",
  authDomain: "rausgucken-notification.firebaseapp.com",
  projectId: "rausgucken-notification",
  storageBucket: "rausgucken-notification.firebasestorage.app",
  messagingSenderId: "204790417960",
  appId: "1:204790417960:web:06547f098c630e9e4fc31d"
});

const messaging = firebase.messaging();

// Handle background push messages (app not in foreground)
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  const link = payload.fcmOptions?.link || 'https://www.rausgucken.de/meine-events/';

  self.registration.showNotification(title || 'rausgucken.de', {
    body:    body || 'Eine gespeicherte Veranstaltung findet morgen statt.',
    icon:    '/android-chrome-192x192.png',
    badge:   '/favicon-96x96.png',
    tag:     'rg-event-reminder',
    data:    { url: link },
  });
});

// Notification click → open the event URL
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://www.rausgucken.de/meine-events/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
