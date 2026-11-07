/* Guarda la app en la tablet para que abra sin internet. Al cambiar VERSION se actualiza. */
const VERSION = 'agu-1.0.0';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/db.js', 'js/lic.js', 'js/ui.js', 'js/negocio.js', 'js/inicio.js', 'js/clientes.js', 'js/reparto.js', 'js/caja.js', 'js/stock.js', 'js/config.js', 'js/legal.js', 'js/main.js',
  'img/logo.png', 'img/logo-recibo.png', 'img/favicon.png', 'img/icono-192.png', 'img/icono-512.png', 'img/icono-maskable.png', 'img/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* primero lo guardado (abre al instante y sin internet); si hay internet, se actualiza de fondo para la próxima vez */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const g = await c.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return g || (await red) || c.match('index.html');
  }));
});
