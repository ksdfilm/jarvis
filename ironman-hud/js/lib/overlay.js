// เปิดเว็บแอปอื่น (LAB / BODY SCAN) ซ้อนเต็มจอบน HUD — มีปุ่มปิดกลับ และปุ่มเปิดเป็นหน้าเต็ม
// iframe ต้องได้สิทธิ์กล้อง/ไมค์/เซนเซอร์ผ่าน allow ไม่งั้นแอปข้างในขอสิทธิ์ไม่ได้
export const ALLOW = 'camera; microphone; geolocation; accelerometer; gyroscope; magnetometer; fullscreen; clipboard-write; screen-wake-lock; autoplay';
let el, frame, title, full;

function build() {
  el = document.createElement('div');
  el.className = 'ov';
  el.hidden = true;
  el.innerHTML = `<div class="ov-bar"><button type="button" class="ov-x" aria-label="ปิด">✕</button><b class="ov-t"></b>
    <a class="ov-full" target="_blank" rel="noopener">เปิดเต็มหน้า ↗</a></div><iframe class="ov-f" allow="${ALLOW}" allowfullscreen></iframe>`;
  document.body.append(el);
  frame = el.querySelector('iframe'); title = el.querySelector('.ov-t'); full = el.querySelector('.ov-full');
  el.querySelector('.ov-x').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
}
export function openApp(url, name) {
  if (!el) build();
  title.textContent = name;
  full.href = url;
  frame.src = url;
  el.hidden = false;
  document.body.classList.add('ov-open');
}
export function close() {
  if (!el) return;
  el.hidden = true;
  frame.src = 'about:blank'; // ปล่อยกล้อง/ไมค์ทันที
  document.body.classList.remove('ov-open');
}
