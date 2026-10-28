// Service worker: จำหน้าแอปไว้ในเครื่อง เปิดได้แม้ไม่มีเน็ต (ทำงานเฉพาะบน https)
// ไฟล์ของแอปใช้แบบ "เปิดจากที่จำไว้ก่อน แล้วแอบโหลดของใหม่มาเก็บ" → แก้เว็บแล้ว เปิดครั้งถัดไปจะได้เวอร์ชันใหม่
// ข้อมูลอากาศไม่ผ่านตรงนี้ (แอปจำค่าล่าสุดไว้เองใน localStorage)
const CACHE = 'jarvis-v1';
const SHELL = ['./', 'index.html', 'css/hud.css', 'js/hud.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

  // โหลดของใหม่เบื้องหลัง (waitUntil กันไม่ให้ iOS ตัดการทำงานก่อนบันทึกเสร็จ)
  const fresh = fetch(e.request).then(async (res) => {
    if (res && (res.ok || res.type === 'opaque')) await (await caches.open(CACHE)).put(e.request, res.clone());
    return res;
  }).catch(() => null);
  e.waitUntil(fresh);
  e.respondWith(caches.match(e.request, { ignoreSearch: own }).then(async (cached) =>
    cached || (await fresh) || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
