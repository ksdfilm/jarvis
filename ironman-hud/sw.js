// Service worker: จำหน้าแอปไว้ในเครื่อง เปิดได้แม้ไม่มีเน็ต (ทำงานเฉพาะบน https)
// มีเน็ต → โหลดเวอร์ชันล่าสุดจากเว็บก่อนเสมอ (อัปโหลดใหม่แล้วเห็นทันที) แล้วเก็บสำรองไว้
// ไม่มีเน็ต/เน็ตช้าเกิน 4 วินาที → ใช้ตัวที่จำไว้
// ข้อมูลอากาศไม่ผ่านตรงนี้ (แอปจำค่าล่าสุดไว้เองใน localStorage)
const CACHE = 'edit-v16';
const SHELL = ['./', 'index.html', 'css/hud.css', 'js/hud.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png'];
const TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = url.origin === location.origin && url.pathname.startsWith(new URL('./', self.registration.scope).pathname);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !fonts) return; // API อากาศ / แผนที่ ปล่อยผ่านตามปกติ

  // ไฟล์ของแอป: ถามเว็บก่อน (no-cache = ข้ามแคช 10 นาทีของเบราว์เซอร์ แต่ยังใช้ ETag ไม่โหลดซ้ำถ้าไม่เปลี่ยน)
  const net = fetch(e.request, own ? { cache: 'no-cache' } : undefined).then(async (res) => {
    if (res && (res.ok || res.type === 'opaque')) await (await caches.open(CACHE)).put(e.request, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => null));

  const fallback = () => caches.match(e.request, { ignoreSearch: own })
    .then((c) => c || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()));
  // ฟอนต์ไม่ค่อยเปลี่ยน ใช้ของในเครื่องก่อนได้เลย
  if (fonts) { e.respondWith(caches.match(e.request).then((c) => c || net.catch(fallback))); return; }

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT));
  e.respondWith(Promise.race([net, timeout]).catch(fallback));
});
