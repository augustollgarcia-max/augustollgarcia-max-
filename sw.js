/* Service Worker — HAIR Financeiro (PWA)
   Cache do app shell para instalação e uso offline da interface.
   Dados/comprovantes do Supabase NÃO são cacheados (sempre rede). */
const CACHE = "hair-fin-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/store.js",
  "./js/voice.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Nunca cachear chamadas ao Supabase (auth, dados, storage)
  if (url.hostname.endsWith("supabase.co") || url.hostname.includes("supabase")) return;

  // App shell: cache-first; demais: network-first com fallback ao cache
  if (SHELL.some((p) => url.pathname.endsWith(p.replace("./", "/")) || url.pathname.endsWith(p.replace("./", "")))) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
