const CACHE = "orien-shell-v3";
const APP_SHELL = [
  "/",
  "/dashboard",
  "/pos",
  "/sales",
  "/reports",
  "/operations",
  "/products",
  "/customers",
  "/stock",
  "/financial",
  "/settings",
  "/icon.svg",
  "/manifest.webmanifest",
];

// Install event - cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API requests
  if (url.pathname.startsWith("/api/")) return;

  // Skip external requests
  if (url.origin !== self.location.origin) return;

  // For navigation requests, try network first, then cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
        .then((cached) => cached || caches.match("/"))
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) return cached;

        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => {
            // Return offline page for failed requests
            return caches.match("/");
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-sales") {
    event.waitUntil(syncSales());
  }
});

async function syncSales() {
  // Implement offline sales sync logic here
  console.log("Syncing offline sales...");
}

// Push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "Nova notificação do Orien",
    icon: "/icon.svg",
    badge: "/icon.svg",
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Orien", options)
  );
});

// Notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.openWindow(url)
  );
});
