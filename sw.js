// Mode hors ligne : la carte, les données et les miniatures sont gardées dès la première visite ;
// les grandes photos le sont au fur et à mesure qu'on les ouvre.
// Pages, scripts et données : réseau d'abord (toujours la dernière version en ligne), cache sinon.
// Images : cache d'abord. Polices Google : cache, mises à jour en arrière-plan.
// Changer VERSION seulement pour forcer le nettoyage complet des caches.
const VERSION = 'pl-2';
const COEUR = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/compact.js', 'js/i18n.js', 'js/lang/en.js', 'js/lang/es.js', 'js/lang/it.js', 'js/lang/de.js',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css',
  'data/zone.json', 'data/batiments.json', 'data/sol.json', 'data/arbres.json',
  'data/monuments.json', 'data/photos.json', 'data/promenades.json',
  'img/icone-192.png', 'img/icone-512.png',
];

// les adresses sont rangées sans « ?v=… », pour ne garder qu'une version de chaque fichier
const cle = (url) => { const u = new URL(url); u.search = ''; return u.href; };

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' : copie fraîche du serveur, pas une ancienne gardée par le navigateur
    const frais = (u) => new Request(u, { cache: 'reload' });
    await cache.addAll(COEUR.map(frais));
    // miniatures de toutes les photos (vignettes et aperçus), pour une galerie utilisable hors ligne
    try {
      const photos = await (await fetch(frais('data/photos.json'))).json();
      const minis = Object.values(photos).flat().map((p) => p.mini);
      await Promise.allSettled(minis.map((m) => cache.add(frais(m))));
    } catch { /* pas grave : elles seront gardées à la consultation */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const memeSite = url.origin === self.location.origin;
  const polices = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!memeSite && !polices) return;

  if (polices) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const enCache = await cache.match(req);
      const reseau = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }).catch(() => enCache);
      return enCache || reseau;
    })());
    return;
  }

  if (/\.(webp|jpe?g|png|svg)$/i.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const enCache = await cache.match(cle(req.url));
      if (enCache) return enCache;
      const r = await fetch(req);
      if (r.ok) cache.put(cle(req.url), r.clone());
      return r;
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const r = await fetch(req);
      if (r.ok) cache.put(cle(req.url), r.clone());
      return r;
    } catch {
      return (await cache.match(cle(req.url))) || (req.mode === 'navigate' && (await cache.match(cle(new URL('index.html', self.location).href)))) || Response.error();
    }
  })());
});
