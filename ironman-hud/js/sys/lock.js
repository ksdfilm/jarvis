// หน้าล็อกลากเส้น (ENTER PATTERN) แบบในคลิป — เป็นลูกเล่น ไม่ใช่ระบบความปลอดภัยจริง
// เก็บแค่ค่าแฮชของลายเส้นในเครื่อง (SHA-256 เมื่อเป็น https, ไม่งั้นใช้แฮชง่ายๆ)
let ctx;
const N = 3; // ตาราง 3×3

async function hash(seq) {
  const s = 'edit-lock:' + seq.join('-');
  if (window.crypto?.subtle && window.isSecureContext) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(16);
}

/** แสดงหน้าลากเส้น คืน Promise<ลำดับจุด[]> ทุกครั้งที่ปล่อยนิ้ว (เรียก onDone) */
function padUI(title, sub) {
  const el = document.createElement('section');
  el.className = 'lock';
  el.innerHTML = `<div class="l-head"><div class="l-title">${title}</div><div class="l-sub">${sub}</div></div>
    <div class="l-pad"><svg class="l-svg" viewBox="0 0 300 300" aria-hidden="true"><polyline class="l-line" points=""/><line class="l-live" x1="0" y1="0" x2="0" y2="0"/></svg>
      ${Array.from({ length: N * N }, (_, i) => `<i class="l-dot" data-i="${i}" style="left:${((i % N) * 125 + 25) / 3}%;top:${(Math.floor(i / N) * 125 + 25) / 3}%"></i>`).join('')}</div>
    <div class="l-msg" aria-live="polite"></div>`;
  document.body.append(el);
  const pad = el.querySelector('.l-pad'), line = el.querySelector('.l-line'), live = el.querySelector('.l-live');
  const dots = [...el.querySelectorAll('.l-dot')];
  const center = (i) => [(i % N) * 125 + 25, Math.floor(i / N) * 125 + 25]; // พิกัดใน viewBox 300
  let seq = [], drawing = false, onDone = () => {};
  const toVB = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 300]; };
  const hit = ([x, y]) => dots.findIndex((_, i) => { const [cx, cy] = center(i); return Math.hypot(x - cx, y - cy) < 34; });
  const redraw = () => { line.setAttribute('points', seq.map((i) => center(i).join(',')).join(' ')); dots.forEach((d, i) => d.classList.toggle('on', seq.includes(i))); };
  const add = (i) => { if (i >= 0 && !seq.includes(i)) { seq.push(i); redraw(); ctx.fx.play('tick'); } };
  el.addEventListener('dragstart', (e) => e.preventDefault()); // กันเบราว์เซอร์คิดว่ากำลังลากรูป/ข้อความ
  el.addEventListener('selectstart', (e) => e.preventDefault());
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); drawing = true; seq = []; el.classList.remove('bad', 'good'); try { pad.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ } add(hit(toVB(e))); });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = toVB(e); add(hit(p));
    if (seq.length) { const [x, y] = center(seq[seq.length - 1]); live.setAttribute('x1', x); live.setAttribute('y1', y); live.setAttribute('x2', p[0]); live.setAttribute('y2', p[1]); }
  });
  const end = () => { if (!drawing) return; drawing = false; live.setAttribute('x2', live.getAttribute('x1')); live.setAttribute('y2', live.getAttribute('y1')); const s = seq.slice(); onDone(s); };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  return {
    el,
    msg: (t) => { el.querySelector('.l-msg').textContent = t; },
    sub: (t) => { el.querySelector('.l-sub').textContent = t; },
    reset: () => { seq = []; redraw(); },
    bad: () => { el.classList.add('bad'); ctx.fx.play('error'); setTimeout(() => { el.classList.remove('bad'); seq = []; redraw(); }, 650); },
    good: () => { el.classList.add('good'); ctx.fx.play('ok'); },
    onDone: (f) => { onDone = f; },
    close: () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); },
  };
}

/** ถ้าตั้งรหัสไว้: ล็อกหน้าจอจนกว่าจะลากถูก */
function check() {
  const want = ctx.store.get('lockHash', null);
  if (!want) return Promise.resolve();
  return new Promise((resolve) => {
    const ui = padUI('ENTER PATTERN', 'ลากเส้นเพื่อปลดล็อก');
    let tries = 0;
    ui.onDone(async (seq) => {
      if (seq.length < 2) return ui.reset();
      if ((await hash(seq)) === want) { ui.good(); ui.msg('ACCESS GRANTED'); setTimeout(() => { ui.close(); resolve(); }, 420); return; }
      tries++;
      ui.bad();
      ui.msg(tries >= 5 ? 'ลืมรหัส? ล้างได้ที่ ตั้งค่า → ล้างค่าทั้งหมด (ต้องปลดล็อกก่อน) หรือลบข้อมูลเว็บไซต์ใน Safari' : 'ACCESS DENIED · ลองใหม่');
    });
  });
}

/** ตั้งรหัสใหม่: ลาก 2 ครั้งให้ตรงกัน อย่างน้อย 4 จุด */
function setup() {
  const ui = padUI('SET PATTERN', 'ลากเส้นผ่านอย่างน้อย 4 จุด');
  let first = null;
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'l-cancel'; x.textContent = 'ยกเลิก';
  x.addEventListener('click', () => ui.close());
  ui.el.append(x);
  ui.onDone(async (seq) => {
    if (seq.length < 4) { ui.bad(); ui.msg('สั้นไป ต้องอย่างน้อย 4 จุด'); return; }
    if (!first) { first = seq; ui.reset(); ui.sub('ลากซ้ำอีกครั้งเพื่อยืนยัน'); ui.msg(''); ctx.fx.play('ok'); return; }
    if (first.join() !== seq.join()) { first = null; ui.bad(); ui.sub('ลากเส้นผ่านอย่างน้อย 4 จุด'); ui.msg('ไม่ตรงกัน เริ่มใหม่'); return; }
    ctx.store.set('lockHash', await hash(seq));
    ui.good(); ui.msg('บันทึกรหัสแล้ว · ครั้งหน้าที่เปิดแอปจะถามรหัส');
    setTimeout(() => ui.close(), 1100);
  });
}

export default {
  init(c) { ctx = c; },
  check,
  setup,
};
