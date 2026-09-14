/* Track Workout service worker — offline-first app shell.
 * Bump CACHE whenever any precached file changes so installed apps pick up the update. */
const CACHE = "track-workout-v2.0.0";
const PRECACHE = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./workouts.js", "./plan-meta.js",
  "./js/utils.js", "./js/store.js", "./js/parser.js", "./js/plan.js", "./js/timer.js", "./js/app.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon-180.png", "./icons/favicon-32.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Google Sheet fetches go straight to the network
  // Navigations: network first (so deploys show up), cached shell offline.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return r; }).catch(() => caches.match("./index.html")));
    return;
  }
  // Everything else: cache first, refresh in the background (stale-while-revalidate).
  e.respondWith(caches.match(e.request).then(cached => {
    const network = fetch(e.request).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => cached);
    return cached || network;
  }));
});
