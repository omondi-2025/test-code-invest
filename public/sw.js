const CACHE_NAME = "villa-cash-v9";
// Only cache static assets — never HTML/JS (those must always be fresh)
const OFFLINE_ASSETS = [
  "/styles.css",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never intercept API calls
  if (url.pathname.startsWith("/api/")) return;

  // HTML and JS must always come from the network
  if (url.pathname.endsWith(".html") || url.pathname.endsWith(".js")) return;

  // Network-first for everything else; cache only for offline fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("/index.html"))
      )
  );
});
