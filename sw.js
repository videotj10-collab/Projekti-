/* Lompakko — service worker offline-käyttöä varten.
 * Sovelluskuori tallennetaan välimuistiin asennuksessa ja tarjoillaan
 * ensisijaisesti välimuistista, jotta demo toimii myös ilman verkkoa. */

var CACHE = 'lompakko-v3';
var SHELL = [
  './',
  './index.html',
  './style.css',
  './money.js',
  './auth.js',
  './cards.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        // Tallenna vain onnistuneet saman alkuperän vastaukset.
        if (response && response.ok && request.url.indexOf(self.location.origin) === 0) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        // Offline eikä välimuistissa: tarjoa sovelluskuori navigoinneille.
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
