const CACHE_NAME = 'lego-manager-v1.2'; // ⬅️ Changez la version !
const BASE_PATH = '/lego-manager'; // ⬅️ Remplacez par votre repo

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
  `${BASE_PATH}/analysis-worker.js`
  `${BASE_PATH}/gz-decompressor.js`
];

// Ne PAS cacher les fichiers .gz de Rebrickable
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Ne pas intercepter les requêtes vers Rebrickable
  if (url.includes('rebrickable.com') || url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();
        
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Installation du Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installation v1.1');
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
  console.log('Service Worker: Activation v1.1');
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

// Fetch avec chemins corrigés
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();
        
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});