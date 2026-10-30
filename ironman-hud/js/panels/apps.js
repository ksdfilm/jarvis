// แผง 20+: ทุกระบบใน LAB (+ NET//RADAR) ฝังเป็นแผงของ EDIT แบบไร้กรอบ
// โหลดเว็บในกรอบเมื่อเปิดแผง และ "ปิดทิ้ง" เมื่อออกจากแผง → ปล่อยกล้อง/ไมค์/ลำโพงโซนาร์ และไม่กินแรมเครื่อง
// มือถือ: เข้าแผงระบบแล้วขยายเต็มจอ (ซ่อนแถบบน/หน้าปัด) มีแถบนำทาง ‹ › ▦ ✕ ด้านบน — ในกรอบปัดเปลี่ยนแผงไม่ได้ จึงต้องมีปุ่ม
// sky/measure/seismo ใช้เข็มทิศ/เซนเซอร์ ซึ่ง iPhone ไม่ยอมให้ขอสิทธิ์จากในกรอบ → แสดงปุ่มเปิดเต็มหน้าแทน
import { ALLOW } from '../lib/overlay.js';

export const APPS = [
  // slug, หัวข้อ EN, ชื่อบนหน้าปัด, คำอธิบาย, ต้องเปิดเต็มหน้า, path
  ['holo', 'HOLO', 'โฮโลแกรม', 'คุมโมเดล 3D ด้วยมือกลางอากาศ'],
  ['airmouse', 'AIR MOUSE', 'แอร์เมาส์', 'ใช้ปลายนิ้วแทนเมาส์'],
  ['airdraw', 'AIR DRAW', 'วาดอากาศ', 'วาดเส้นแสง 3D ด้วยนิ้ว'],
  ['avatar', 'AVATAR', 'อวตาร', 'หุ่นยนต์ 3D ขยับตามเรา'],
  ['godview', 'GOD VIEW', 'บัญชาการโลก', 'เครื่องบิน ดาวเทียม แผ่นดินไหว ไฟป่า'],
  ['overhead', 'AIR TRAFFIC', 'เครื่องบิน', 'เครื่องบินเหนือหัวตอนนี้'],
  ['earth', 'LIVE EARTH', 'โลกจากอวกาศ', 'ภาพดาวเทียม NASA รายวัน'],
  ['sky', 'SKY AR', 'ส่องฟ้า', 'ยกมือถือส่องดาว ดาวเคราะห์ ISS', 1],
  ['measure', 'MEASURE', 'วัดระยะ', 'วัดระยะ/ความสูงด้วยมุมเอียง', 1],
  ['seismo', 'SEISMO', 'แรงสั่น', 'เครื่องวัดแผ่นดินไหว/แรงสั่นเครื่องจักร', 1],
  ['sonar', 'SONAR', 'โซนาร์', 'จับการเคลื่อนไหวด้วยคลื่นเสียง'],
  ['soundlink', 'SOUND LINK', 'ส่งผ่านเสียง', 'ส่งข้อความระหว่างเครื่องด้วยเสียง'],
  ['spectro', 'SPECTRO', 'ฟังเสียง', 'มองเห็นเสียง + AI บอกว่าเสียงอะไร'],
  ['jarvis', 'LOCAL AI', 'AI ในเครื่อง', 'แชทกับ AI ที่รันบนเครื่องเรา'],
  ['imagelab', 'IMAGE AI', 'แต่งภาพ AI', 'ลบพื้นหลัง ขยายภาพ การ์ตูน'],
  ['lens', 'LENS', 'อ่าน+แปล', 'ส่องป้าย/เอกสาร แปลเป็นไทย'],
  ['twin', 'TWIN', 'ดิจิทัลทวิน', 'โรงงาน 3D + ข้อมูลสด'],
  ['safety', 'SAFETY', 'ตรวจ PPE', 'หมวก เสื้อสะท้อนแสง คนล้ม'],
  ['attendance', 'ATTEND', 'ลงเวลา', 'สแกนหน้าลงเวลาเข้า-ออก'],
  ['net-radar', 'NET RADAR', 'เรดาร์เครือข่าย', 'อุปกรณ์ในวง LAN บริษัท', 0, '../net-radar/'],
];
const urlOf = ([slug, , , , , path]) => path || `../lab/${slug}/`;
// เปิดเต็มหน้า: ?from=edit → หน้านั้นมีปุ่ม "◂ EDIT" กลับมาแผงเดิม (สำคัญตอนเปิดจากไอคอนบนหน้าจอโฮม ที่ไม่มีปุ่มย้อนกลับ)
const fullOf = (a) => `${urlOf(a)}?from=edit`;
const github = () => /github\.io$/.test(location.hostname);

let ctx, nav;
// ---------- แถบนำทางโหมดเต็มจอ (มือถือ) ----------
function buildNav() {
  nav = document.createElement('nav');
  nav.id = 'app-nav';
  nav.hidden = true;
  nav.innerHTML = `<button type="button" data-n="home" aria-label="หน้าหลัก">✕</button>
    <button type="button" data-n="prev" class="an-step"><b>‹</b><small></small></button>
    <div class="an-t"><b></b><small></small></div>
    <button type="button" data-n="next" class="an-step"><small></small><b>›</b></button>
    <button type="button" data-n="lab" aria-label="สารบัญ">▦</button>
    <a data-n="full" target="_blank" rel="noopener" aria-label="เปิดเต็มหน้า">⤢</a>`;
  document.body.append(nav);
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b || b.tagName === 'A') return;
    const i = ctx.current();
    const to = { home: 0, prev: i - 1, next: i + 1, lab: ctx.panels.findIndex((p) => p.id === 'p-lab') }[b.dataset.n];
    ctx.go(to);
  });
}
function enter(a) {
  if (ctx.DESKTOP.matches) return;
  nav ??= (buildNav(), nav);
  const i = ctx.panels.findIndex((p) => p.id === `p-x-${a[0]}`), P = ctx.panels;
  const q = (s) => nav.querySelector(s);
  q('.an-t b').textContent = `${String(i + 1).padStart(2, '0')} ${a[2]}`;
  q('.an-t small').textContent = a[3];
  q('[data-n=prev] small').textContent = P[i - 1]?.th || '';
  q('[data-n=next] small').textContent = P[i + 1]?.th || '';
  q('[data-n=next]').disabled = !P[i + 1];
  q('[data-n=full]').href = fullOf(a);
  nav.hidden = false;
  document.body.classList.add('app-mode');
}
function leave() {
  if (nav) nav.hidden = true;
  document.body.classList.remove('app-mode');
}

function panel(a) {
  const [slug, en, th, sub, top] = a, id = `p-x-${slug}`, url = urlOf(a);
  let frame, loaded = false;
  // NET//RADAR ใช้ PHP สแกนวงแลน → มีแค่บน XAMPP ในบริษัท
  const lanOnly = slug === 'net-radar';
  const card = (msg, btn) => `<div class="g app-card"><p>${msg}</p>${btn ? `<a class="g go app-open" href="${fullOf(a)}">${btn}</a>` : ''}</div>`;
  return {
    id, en, th, sub, span: 3, // คอม: เต็มแถว
    html: lanOnly && github()
      ? card('ใช้ได้เฉพาะตอนเปิด EDIT ผ่าน XAMPP ในวงแลนบริษัท (เช่น http://192.168.103.46/ksd/ironman-hud/) เพราะต้องสแกนเครือข่ายจากคอมในบริษัท')
      : top
        ? card(`${sub} — ใช้เข็มทิศ/เซนเซอร์ของมือถือ ต้องเปิดเป็นหน้าเต็ม (มีปุ่ม ◂ EDIT กลับมาที่นี่)`, `เปิด ${th} ↗`)
        : `<div class="ex-frame app-frame no-swipe"><iframe title="${th}" allow="${ALLOW}" allowfullscreen allowtransparency="true"></iframe>
            <a class="ex-full" href="${fullOf(a)}" target="_blank" rel="noopener" aria-label="เปิดเต็มจอ" title="เต็มจอ">⤢</a></div>`,
    init(c) {
      ctx = c;
      document.getElementById(id).classList.add('appx');
      frame = document.querySelector(`#${id} iframe`);
    },
    show() {
      enter(a);
      if (frame && !loaded) { frame.src = url; loaded = true; }
    },
    hide() {
      leave();
      if (frame && loaded) { frame.src = 'about:blank'; loaded = false; }
    },
  };
}

export default APPS.map(panel);
