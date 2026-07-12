// Dr. Zaid Healthcare OS — Service Worker (Milestone 12 - cache-bug fix)
const CACHE_NAME = "drzaid-os-v9-ai-parse-fix";
const APP_SHELL = [
  "shared/login.html",
  "shared/theme.css",
  "manifest.json",
  "assets/icon-192.png",
  "assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(()=>{}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ROOT CAUSE FIX: the previous version served .js/.html as cache-first, which
// meant a shared file cached once (e.g. queue-service.js) would NEVER be
// re-fetched from the network again, even after new deploys and even after
// this file's own CACHE_NAME was bumped - because the browser only checks
// for a new service worker lazily, and old SW instances can keep running
// (and keep serving their own stale Cache Storage entries) until every tab
// using them is fully closed. This is why registering a patient kept not
// showing up in Doctor Workspace even after the code was already fixed.
//
// Fix: JS/HTML/JSON are always network-first now (falling back to cache only
// if truly offline). Only binary assets (icons/images) stay cache-first,
// since those rarely change and cache-busting them isn't necessary.
function dzIsCodeFile(url) {
  return /\.(js|html|json)(\?|$)/.test(url) || url.endsWith("/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isCode = req.mode === "navigate" || dzIsCodeFile(req.url);

  if (isCode) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("shared/login.html")))
    );
    return;
  }

  // Static binary assets - cache-first is fine, they rarely change.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => cached))
  );
});

