const CACHE_NAME = "villa-cash-v4";
const OFFLINE_ASSETS = [
  "/",
  "/index.html",
  "/login.html",
  "/signup.html",
  "/profile.html",
  "/deposit.html",
  "/withdrawal.html",
  "/invest.html",
  "/history.html",
  "/agent.html",
  "/package.html",
  "/styles.css",
  "/api.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
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
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never intercept API calls — live data must always come from the network.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for pages and assets so updates show up immediately;
  // fall back to cache when offline.
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
