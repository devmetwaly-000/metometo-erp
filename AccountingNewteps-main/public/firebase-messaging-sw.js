// Service Worker for Offline Caching
// Previously used for FCM, now reserved for future background tasks or caching logic if needed.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
