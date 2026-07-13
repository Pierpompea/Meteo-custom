const CACHE_NAME = "meteo-su-misura-v10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./app.js",
  "./manifest.json",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./android-chrome-192x192.png",
  "./android-chrome-512x512.png",
];

function handleInstall(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { 
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
}

function handleActivate(event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      const cacheDeletionPromises = keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        });
      return Promise.all(cacheDeletionPromises);
    })
  );
  self.clients.claim();
}

function handleFetch(event) {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(function (networkResponse) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      });
    })
  );
}

self.addEventListener("install", handleInstall);
self.addEventListener("activate", handleActivate);
self.addEventListener("fetch", handleFetch);
