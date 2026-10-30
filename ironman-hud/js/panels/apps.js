// แผง 20+: ทุกระบบใน LAB (+ NET//RADAR) ฝังเป็นแผงของ EDIT
// โหลดเว็บในกรอบเมื่อเปิดแผง และ "ปิดทิ้ง" เมื่อออกจากแผง → ปล่อยกล้อง/ไมค์/ลำโพงโซนาร์ และไม่กินแรมเครื่อง
// sky/measure/seismo ใช้เข็มทิศ/เซนเซอร์ ซึ่ง iPhone ไม่ยอมให้ขอสิทธิ์จากในกรอบ → แสดงปุ่มเปิดเต็มหน้าแทน
import { ALLOW } from '../lib/overlay.js';

export const APPS = [
  // slug, หัวข้อ EN, ชื่อบนหน้าปัด, คำอธิบาย, ต้องเปิดเต็มหน้า
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
const github = () => /github\.io$/.test(location.hostname);

function panel(a) {
  const [slug, en, th, sub, top] = a, id = `p-x-${slug}`, url = urlOf(a);
  let frame, loaded = false;
  // NET//RADAR ใช้ PHP สแกนวงแลน → มีแค่บน XAMPP ในบริษัท
  const lanOnly = slug === 'net-radar';
  const card = (msg, btn) => `<div class="g app-card"><p>${msg}</p>${btn ? `<a class="g go app-open" href="${url}" target="_blank" rel="noopener">${btn}</a>` : ''}</div>`;
  return {
    id, en, th, sub, span: 3, // คอม: เต็มแถว
    html: lanOnly && github()
      ? card('ใช้ได้เฉพาะตอนเปิด EDIT ผ่าน XAMPP ในวงแลนบริษัท (เช่น http://192.168.103.46/ksd/ironman-hud/) เพราะต้องสแกนเครือข่ายจากคอมในบริษัท')
      : top
        ? card(`${sub} — ระบบนี้ใช้เข็มทิศ/เซนเซอร์ของมือถือ ซึ่งต้องเปิดเป็นหน้าเต็ม`, `เปิด ${th} ↗`)
        : `<div class="ex-frame app-frame no-swipe"><iframe title="${th}" allow="${ALLOW}" allowfullscreen allowtransparency="true"></iframe>
            <a class="ex-full" href="${url}" target="_blank" rel="noopener" aria-label="เปิดเต็มจอ" title="เต็มจอ">⤢</a></div>`,
    init() { frame = document.querySelector(`#${id} iframe`); },
    show() { if (frame && !loaded) { frame.src = url; loaded = true; } },
    hide() { if (frame && loaded) { frame.src = 'about:blank'; loaded = false; } },
  };
}

export default APPS.map(panel);
