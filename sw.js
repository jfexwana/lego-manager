const BASE_PATH = '/lego-manager'; // Pour GitHub Pages
const CACHE_NAME = `${BASE_PATH}-cache-v1.2`;

const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/menu.html`,
  `${BASE_PATH}/app.html`,
  `${BASE_PATH}/sets.html`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/styles.css`,
  `${BASE_PATH}/lego-db.js`,
  `${BASE_PATH}/unified-data-manager.js`,
  `${BASE_PATH}/debug.js`,
  `${BASE_PATH}/keywords.js`,
  `${BASE_PATH}/auth.js`,
  `${BASE_PATH}/category-images.json`,
  `${BASE_PATH}/analysis-worker.js`, // ⚠️ VIRGULE AJOUTÉE
  `${BASE_PATH}/gz-decompressor.js`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  `${BASE_PATH}/manifest.json`
];

// Installation du Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installation v1.2');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('Erreur cache:', err))
  );
  self.skipWaiting();
});

// Activation - Nettoyer les anciens caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activation v1.2');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Suppression ancien cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch - Stratégie Network First avec fallback Cache
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Ne pas intercepter les requêtes externes (Rebrickable, CDN)
  if (url.includes('rebrickable.com') || 
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Pour les ressources locales: Network First, puis Cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cloner la réponse avant de la mettre en cache
        const responseClone = response.clone();
        
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        
        return response;
      })
      .catch(() => {
        // Si le réseau échoue, utiliser le cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si pas en cache non plus, retourner une page d'erreur basique
            return new Response('Offline - Resource not available', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});