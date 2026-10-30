// AIR//MOUSE — index fingertip drives a virtual cursor inside this page; pinch = click, pinch-hold = drag/scroll
import { bar, gate, toast, permMsg, clamp, $, $$, store } from '../common/lab.js';
import { handTracker, pip, PIP_CSS, OneEuro } from './hand.js';

bar('AIR//MOUSE', 'เมาส์กลางอากาศ · ใช้นิ้วคุมหน้าเว็บ');
document.head.insertAdjacentHTML('beforeend', `<style>${PIP_CSS}</style>`);

// ================= demo surface (works with real mouse/touch AND the air cursor) =================
// big buttons
$$('.bigs button').forEach(b => b.addEventListener('click', () => {
  const n = +b.dataset.n + 1; b.dataset.n = n;
  b.querySelector('b').textContent = n;
  b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 180);
  $('#lastBtn').textContent = `กด ${b.firstChild.textContent} แล้ว`;
}));

// scrollable list — air/mouse drag scrolls it; touch uses native scrolling
const ITEMS = ['ดาวพุธ', 'ดาวศุกร์', 'โลก', 'ดาวอังคาร', 'ดาวพฤหัสบดี', 'ดาวเสาร์', 'ดาวยูเรนัส', 'ดาวเนปจูน', 'ดาวพลูโต', 'ดวงจันทร์', 'ไอโอ', 'ยูโรปา', 'แกนีมีด', 'คัลลิสโต', 'ไททัน', 'เอนเซลาดัส', 'ไทรทัน', 'แครอน', 'ซีรีส', 'เวสตา', 'ดาวหางฮัลเลย์', 'ISS', 'ฮับเบิล', 'เจมส์ เว็บบ์', 'โวเอเจอร์ 1', 'นิวฮอไรซันส์', 'จูโน', 'แคสสินี', 'เพอร์เซเวียแรนซ์', 'ไทยโชต'];
const list = $('#list');
list.innerHTML = ITEMS.map((t, i) => `<li data-i="${i}">${t}<i>#${String(i + 1).padStart(2, '0')}</i></li>`).join('');
let ls = null;
list.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') ls = { y: e.clientY, top: list.scrollTop }; });
list.addEventListener('pointermove', e => { if (ls) list.scrollTop = ls.top - (e.clientY - ls.y); });
addEventListener('pointerup', () => (ls = null));
list.addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li) return;
  $$('#list li.sel').forEach(x => x.classList.remove('sel'));
  li.classList.add('sel');
  $('#pick').textContent = 'เลือก: ' + li.firstChild.textContent;
});

// custom slider (native <input type=range> can't receive synthetic drags)
const sl = $('#slider');
let slVal = store.get('airmouse.sl', 0.5), slDrag = false;
function setSl(v) {
  slVal = clamp(v, 0, 1);
  sl.querySelector('.fill').style.width = slVal * 100 + '%';
  sl.querySelector('.knob').style.left = slVal * 100 + '%';
  $('#slVal').textContent = Math.round(slVal * 100) + '%';
  const l = Math.round(slVal * 100);
  $('#bulb').style.background = `linear-gradient(90deg, hsl(${190 + l * 1.4} 100% ${10 + l * 0.45}%), hsl(${190 + l * 1.4} 100% ${8 + l * 0.3}%))`;
  $('#bulb').style.boxShadow = `0 0 ${l / 2}px hsl(${190 + l * 1.4} 100% 60%)`;
}
const slFrom = e => { const r = sl.getBoundingClientRect(); setSl((e.clientX - r.left) / r.width); };
sl.addEventListener('pointerdown', e => { slDrag = true; if (e.isTrusted) sl.setPointerCapture(e.pointerId); slFrom(e); });
sl.addEventListener('pointermove', e => slDrag && slFrom(e));
sl.addEventListener('pointerup', () => { slDrag = false; store.set('airmouse.sl', slVal); });
setSl(slVal);

// pop-the-bubbles mini game
const game = $('#game');
let bubbles = [], score = 0, best = store.get('airmouse.best', 0), endAt = 0, lastSpawn = 0;
function spawn() {
  const r = game.getBoundingClientRect();
  const size = 38 + Math.random() * 34;
  const el = document.createElement('div');
  el.className = 'bub';
  el.style.width = el.style.height = size + 'px';
  const b = { el, x: Math.random() * (r.width - size), y: r.height + 4, vy: 30 + Math.random() * 45, wob: Math.random() * 6, size };
  el.addEventListener('pointerdown', () => popB(b));
  game.appendChild(el);
  bubbles.push(b);
}
function popB(b) {
  if (!bubbles.includes(b)) return;
  bubbles = bubbles.filter(x => x !== b);
  b.el.remove();
  score += b.size < 50 ? 3 : 1;
  $('#score').textContent = `${score} แต้ม`;
  const p = Object.assign(document.createElement('div'), { className: 'pop', textContent: b.size < 50 ? '+3' : '+1' });
  p.style.left = b.x + b.size / 2 - 10 + 'px'; p.style.top = b.y + 'px';
  game.appendChild(p); setTimeout(() => p.remove(), 600);
}
$('#btnGame').addEventListener('click', () => {
  bubbles.forEach(b => b.el.remove()); bubbles = [];
  score = 0; $('#score').textContent = '0 แต้ม';
  endAt = performance.now() + 30000;
  $('#gameMsg').hidden = true;
});
let gPrev = 0;
function gameStep(now) {
  const dt = Math.min(0.05, (now - (gPrev || now)) / 1000); gPrev = now;
  if (!endAt) return;
  const left = endAt - now;
  if (left <= 0) {
    endAt = 0;
    bubbles.forEach(b => b.el.remove()); bubbles = [];
    if (score > best) { best = score; store.set('airmouse.best', best); }
    $('#gameMsg').hidden = false;
    $('#gameMsg').firstElementChild.innerHTML = `หมดเวลา! ได้ <b>${score}</b> แต้ม · สถิติ ${best}<br><br><button class="btn primary" id="btnGame2">▶ เล่นอีกครั้ง</button>`;
    $('#btnGame2').addEventListener('click', () => $('#btnGame').click());
    return;
  }
  $('#score').textContent = `${score} แต้ม · ${Math.ceil(left / 1000)} วิ`;
  if (now - lastSpawn > 650 && bubbles.length < 9) { spawn(); lastSpawn = now; }
  for (const b of [...bubbles]) {
    b.y -= b.vy * dt;
    const x = b.x + Math.sin(now / 500 + b.wob) * 8;
    b.el.style.transform = `translate(${x}px, ${b.y}px)`;
    if (b.y < -b.size) { b.el.remove(); bubbles = bubbles.filter(q => q !== b); }
  }
}

// ================= air cursor =================
const cursor = $('#cursor'), gest = $('#gest');
const fx = new OneEuro(1.0, 0.008), fy = new OneEuro(1.0, 0.008);
let tracker = null, pipView = null;
const P = {
  x: innerWidth / 2, y: innerHeight / 2, down: false, target: null, downAt: 0, downX: 0, downY: 0, moved: 0,
  hist: [], off: { x: 0, y: 0 }, freezeUntil: 0, hover: null,
};
let reach = +$('#reach').value;
$('#reach').oninput = e => (reach = +e.target.value);

function airEvent(type, el) {
  el?.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: P.x, clientY: P.y,
    pointerId: 77, pointerType: 'air', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
  }));
}
const under = () => document.elementFromPoint(P.x, P.y);
const clickable = el => el?.closest('button, a, li, .bub, .sl, #list');

function setState(text, cls = '') { gest.textContent = text; gest.className = cls; }

function airFrame(hands, now) {
  pipView?.draw(hands);
  const h = hands[0];
  if (!h) {
    cursor.classList.add('lost');
    if (P.down) release(now);
    setState('ไม่เห็นมือ');
    return;
  }
  cursor.style.display = 'block'; cursor.classList.remove('lost');
  // fingertip → screen with an "active box" so you don't have to reach the camera edges
  const mx = reach, my = reach * 0.85;
  const rx = clamp((h.tip.x - mx) / (1 - 2 * mx), 0, 1) * innerWidth;
  const ry = clamp((h.tip.y - my) / (1 - 2 * my), 0, 1) * innerHeight;
  const t = now / 1000;
  const sx = fx.filter(rx, t), sy = fy.filter(ry, t);
  P.hist.push({ t: now, x: sx, y: sy }); while (P.hist.length > 12) P.hist.shift();

  const pinch = h.pinch;
  if (pinch && !P.down) {
    // the fingertip dips toward the thumb while pinching — roll the click point back ~120 ms
    const back = P.hist.find(q => now - q.t < 140) || P.hist[0];
    P.off = { x: back.x - sx, y: back.y - sy };
  }
  if (now >= P.freezeUntil) {
    P.x = clamp(sx + P.off.x, 0, innerWidth - 1);
    P.y = clamp(sy + P.off.y, 0, innerHeight - 1);
    if (!pinch && !P.down) { P.off.x *= 0.85; P.off.y *= 0.85; }  // ease the offset away after release
  }
  cursor.style.transform = `translate(${P.x}px, ${P.y}px)`;

  // hover highlight
  const hov = clickable(under());
  if (hov !== P.hover) { P.hover?.classList.remove('air-hover'); hov?.classList.add('air-hover'); P.hover = hov; }

  if (pinch && !P.down) {                                   // press
    P.down = true; P.downAt = now; P.downX = P.x; P.downY = P.y; P.moved = 0;
    P.target = under();
    P.freezeUntil = now + 120;
    airEvent('pointerdown', P.target);
    cursor.classList.add('pinch');
  } else if (pinch && P.down) {                             // drag
    P.moved = Math.max(P.moved, Math.hypot(P.x - P.downX, P.y - P.downY));
    airEvent('pointermove', P.target);
  } else if (!pinch && P.down) release(now);
  else airEvent('pointermove', under());

  if (P.down) setState(P.moved > 25 ? '✊ ลาก / เลื่อน' : '🤏 จีบ (กด)', P.moved > 25 ? 'drag' : 'click');
  else setState(h.gesture === 'point' ? '☝ ชี้' : '✋ เลื่อนเคอร์เซอร์');
}
function release(now) {
  airEvent('pointerup', P.target);
  // a short pinch without much movement = click
  if (P.moved < 30 && now - P.downAt < 900) {
    const el = clickable(P.target);
    if (el && el.matches('button, a, li')) el.click();
    setState('👆 คลิก!', 'click');
  }
  P.down = false; P.target = null;
  P.freezeUntil = now + 150;
  cursor.classList.remove('pinch');
}

let frames = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  gameStep(now);
  if (!tracker) return;
  const hands = tracker.detect(now);
  if (!hands) return;
  airFrame(hands, now);
  frames++;
  if (now - fpsT > 1000) { $('#fps').textContent = `${frames} FPS`; frames = 0; fpsT = now; }
}
requestAnimationFrame(loop);

async function startCamera() {
  const t = handTracker({ numHands: 1 });
  try { await t.start(); } catch (e) { t.stop(); throw e; }
  tracker = t;
  pipView = pip(document.body, t);
  toast('ยกมือขึ้น ชี้นิ้วชี้ไปที่จอ · จีบนิ้วโป้ง+นิ้วชี้ = คลิก', 4000);
}

gate({
  title: 'AIR//MOUSE',
  lines: [
    'ใช้ <b>ปลายนิ้วชี้</b> บังคับเคอร์เซอร์บนหน้านี้ ผ่านกล้อง',
    '<b>จีบนิ้วโป้ง+นิ้วชี้</b> สั้นๆ = คลิก · <b>จีบค้างแล้วขยับ</b> = ลาก/เลื่อน',
    'ข้อจำกัด: เว็บควบคุมได้เฉพาะในหน้านี้ ไม่สามารถขยับเมาส์จริงของเครื่องได้',
    'ภาพจากกล้องประมวลผลในเครื่องนี้ ไม่มีการอัปโหลด',
    '<a href="#" class="alt" id="noCam">ลองหน้าเดโมด้วยเมาส์/นิ้วแตะก่อน ▸</a>',
  ],
  needs: ['camera'],
  button: '▶ เปิดกล้องและเริ่ม',
  onStart: startCamera,
}).catch(() => {});
$('#noCam').onclick = e => { e.preventDefault(); $('.lab-gate')?.remove(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && P.down) release(performance.now()); });

window.__lab = { P, feed: (h, now = performance.now()) => airFrame(h ? [h] : [], now), get hands() { return tracker?.hands.map(h => ({ g: h.gesture, pinchR: +h.pinchR.toFixed(2), tip: h.tip })) ?? null; } };
