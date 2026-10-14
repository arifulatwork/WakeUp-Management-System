// Service worker for the WakeUp Projects PWA.
//
// Strategy, deliberately simple:
//  - Navigation requests (opening a page): network-first, falling back
//    to cache. This means you always get the latest version when
//    online, but a page you've opened before still loads with no
//    signal at all — exactly the "cleaner is inside a house with no
//    bars" case this needs to handle.
//  - GET /api/* requests: network-first, cached as a fallback, so a
//    worker's task list still shows (possibly stale) data offline
//    instead of a blank error screen.
//  - Mutating requests (POST/PATCH/DELETE) are NEVER intercepted here —
//    those go through the IndexedDB queue in lib/offlineQueue.ts
//    instead, which is more reliable across browsers (notably iOS
//    Safari, which doesn't support the Background Sync API this
//    service worker would otherwise need for queued writes).

const CACHE_NAME = "wakeup-shell-v4";
const APP_SHELL = [
  "/",
  "/login",
  "/cleaner",
  "/maintenance",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Some shell routes may 404 on first deploy before data exists —
      // don't let one failed addAll block install entirely.
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch mutations — let them hit the network directly (and
  // fail normally if offline, so lib/offlineQueue.ts can catch it).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The live-update stream never ends: caching it would hang the page. Let it through untouched.
  if (url.pathname === "/api/events") return;

  // Network-first for pages and GET API calls, cache as fallback.
  if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Static assets (icons, etc.): cache-first.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// ---- Phone notifications (Web Push) ----
// The server sends { title, body, url, tag }. Tapping the notification opens (or focuses) the app.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200], // buzz on phones that allow it; the sound itself is the phone's notification sound
    silent: false,
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || "WakeUp", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
