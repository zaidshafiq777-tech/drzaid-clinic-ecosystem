const CACHE_NAME = "drzaid-clinic-v3";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.url.includes("supabase.co") || req.url.includes("n8n.cloud") || req.url.includes("generativelanguage")) return;

  // NETWORK-FIRST for the app itself (navigations + index.html): updates hamesha turant milein
  const isAppShell = req.mode === "navigate" || req.url.endsWith("/index.html") || req.url.endsWith("/drzaid-clinic-ecosystem/");
  if (isAppShell) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Baaki assets: cache-first with background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
