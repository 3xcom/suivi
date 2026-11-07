// Service worker : « réseau d'abord » pour toujours servir la dernière version,
// avec repli sur le cache hors connexion. Les données Supabase ne sont jamais mises en cache.
const VERSION_CACHE = 'suivi-3xcom-v4';
const FICHIERS_BASE = ['./', 'index.html', 'app.js', 'config.js', 'style.css', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', evenement => {
  evenement.waitUntil(caches.open(VERSION_CACHE).then(cache => cache.addAll(FICHIERS_BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', evenement => {
  evenement.waitUntil(caches.keys().then(noms => Promise.all(noms.filter(nom => nom !== VERSION_CACHE).map(nom => caches.delete(nom)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', evenement => {
  const requete = evenement.request, url = new URL(requete.url);
  if (requete.method !== 'GET' || !url.protocol.startsWith('http') || url.hostname.endsWith('supabase.co')) return;
  evenement.respondWith(
    // cache: 'no-cache' = revalidation systématique (GitHub Pages garde les fichiers 10 min en cache HTTP)
    fetch(requete, { cache: 'no-cache' })
      .then(reponse => {
        if (reponse.ok) { const copie = reponse.clone(); caches.open(VERSION_CACHE).then(cache => cache.put(requete, copie)); }
        return reponse;
      })
      .catch(async () => (await caches.match(requete)) || (requete.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
