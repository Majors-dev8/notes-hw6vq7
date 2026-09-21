/* Service worker — mise en cache de l'application et réception des captures partagées */

var CACHE = 'suivi-paris-v7';
var SHARE_CACHE = 'sp-share';

var ASSETS = [
  './',
  './index.html',
  './app.css',
  './model.js',
  './store.js',
  './stats.js',
  './ai.js',
  './ui.js',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && k !== SHARE_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  /* capture partagée depuis la galerie du téléphone */
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async function () {
      try {
        var form = await e.request.formData();
        var file = form.get('image');
        if (file) {
          var c = await caches.open(SHARE_CACHE);
          await c.put('shared-image', new Response(file, {
            headers: { 'Content-Type': file.type || 'image/jpeg' }
          }));
        }
      } catch (err) {}
      return Response.redirect('./?share=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;   /* API et polices : réseau direct */

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) {
        /* rafraîchissement silencieux en arrière-plan */
        fetch(e.request).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(e.request, res.clone()); });
        }).catch(function () {});
        return hit;
      }
      return fetch(e.request).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
