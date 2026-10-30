// แผง BODY SCAN: เข้า 4 โหมดของ ../body-scan/ (เปิดซ้อนบน HUD) + ผลล่าสุดจากประวัติในเครื่อง
import { openApp } from '../lib/overlay.js';

const MODES = [
  ['posture', '🧍', 'ท่าทาง', 'ไหล่/สะโพกเอียง คอยื่น แนวเข่า'],
  ['rom', '💪', 'ข้อต่อ', 'องศาไหล่ ศอก เข่า คอ ซ้าย-ขวา'],
  ['face', '🙂', 'ใบหน้า', 'สมมาตรใบหน้า (FAST) กะพริบตา ง่วง'],
  ['vitals', '❤', 'ชีพจร', 'ชีพจร + การหายใจจากกล้อง 30 วิ'],
];
let ctx;
const open = (m) => openApp(`../body-scan/#${m}`, '🧍 BODY//SCAN');

// body-scan เก็บประวัติใน localStorage ของโดเมนเดียวกัน → อ่านมาโชว์ผลล่าสุดได้
function latest() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem('bodyscan.history')) || []; } catch { /* ไม่มีประวัติ */ }
  const el = document.getElementById('bs-last');
  if (!el) return;
  el.innerHTML = MODES.map(([m, ic, name]) => {
    const r = h.find((x) => x.mode === m);
    return `<div><span>${ic} ${name}</span><b>${r ? r.title : '—'}</b><small>${r ? new Date(r.t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'ยังไม่เคยวัด'}</small></div>`;
  }).join('');
}

export default {
  id: 'p-bodyscan', en: 'BODY SCAN', th: 'สแกนร่างกาย', sub: 'คัดกรองสุขภาพด้วยกล้อง · ไม่ใช่การวินิจฉัย',
  html: `<div class="bs-grid">${MODES.map(([m, ic, name, d]) => `<button type="button" class="g go bs-tile" data-bs="${m}"><span class="lab-ic">${ic}</span><b>${name}</b><small>${d}</small></button>`).join('')}</div>
    <div class="g bs-last" id="bs-last"></div>`,
  init(c) {
    ctx = c;
    document.getElementById('p-bodyscan').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bs]');
      if (b) open(b.dataset.bs); // เสียงแตะเล่นจาก fx.js อยู่แล้ว
    });
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-bodyscan');
    const WORDS = { vitals: /ชีพจร|หัวใจ|หายใจ/, posture: /ท่าทาง|หลังค่อม|คอยื่น|กระดูกสันหลัง/, rom: /ข้อต่อ|องศา|ยกแขน/, face: /หน้าเบี้ยว|ใบหน้า|กะพริบตา/ };
    ctx.addIntent(/สแกนร่างกาย|วัดชีพจร|ชีพจร|ท่าทาง|หลังค่อม|คอยื่น|ข้อต่อ|หน้าเบี้ยว/, (q) => {
      const m = Object.keys(WORDS).find((k) => WORDS[k].test(q));
      if (m) open(m);
      return { text: m ? `เปิดสแกน${MODES.find((x) => x[0] === m)[2]}ให้แล้วค่ะ` : 'เลือกโหมดสแกนร่างกายได้เลยค่ะ', go: go() };
    }, 'วัดชีพจร');
    latest();
  },
  show() { latest(); },
};
