// แผง LAB: สารบัญของทุกระบบ (แผง 20+ ใน apps.js) — แตะแล้วกระโดดไปแผงนั้น
const APPS = [
  ['ควบคุมด้วยร่างกาย', [['holo', '🖐', 'โฮโลแกรมมือ'], ['airmouse', '👆', 'Air Mouse'], ['airdraw', '✍️', 'วาดกลางอากาศ'], ['avatar', '🤖', 'Avatar']]],
  ['ข้อมูลโลก', [['godview', '🌍', 'บัญชาการโลก'], ['overhead', '✈️', 'เครื่องบินเหนือหัว'], ['earth', '🛰', 'Live Earth']]],
  ['AR / เซนเซอร์', [['sky', '🔭', 'ส่องท้องฟ้า'], ['measure', '📏', 'วัดระยะ'], ['seismo', '📈', 'วัดแรงสั่น']]],
  ['เสียง', [['sonar', '🦇', 'โซนาร์'], ['soundlink', '📡', 'ส่งข้อมูลผ่านเสียง'], ['spectro', '🌈', 'AI ฟังเสียง']]],
  ['AI ในเครื่อง', [['jarvis', '🧠', 'JARVIS AI'], ['imagelab', '🎨', 'Image AI'], ['lens', '🔍', 'กล้องอ่าน+แปล']]],
  ['ที่ทำงาน', [['twin', '🏭', 'Digital Twin'], ['safety', '🦺', 'ตรวจ PPE'], ['attendance', '🪪', 'ลงเวลา'], ['net-radar', '📶', 'NET//RADAR']]],
];
const ALL = APPS.flatMap(([, a]) => a);

let ctx;
const idx = (slug) => ctx.panels.findIndex((p) => p.id === `p-x-${slug}`);

export default {
  id: 'p-lab', en: 'LAB', th: 'แล็บ', sub: 'สารบัญทุกระบบ · แตะเพื่อไปที่แผง', span: 2,
  html: `<div class="lab-grid">${APPS.map(([cat, apps]) => `<div class="lab-cat">${cat}</div>${apps.map(([s, ic, name]) => `<button type="button" class="g go lab-tile" data-lab="${s}"><span class="lab-ic">${ic}</span><span>${name}</span><small data-no="${s}"></small></button>`).join('')}`).join('')}</div>
    <a class="g go lab-hub" href="../lab/" target="_blank" rel="noopener">เปิดหน้ารวม KSD//LAB ↗</a>`,
  init(c) {
    ctx = c;
    // ใส่เลขแผงบนปุ่ม (แผงถูกสร้างครบแล้วตอน init)
    for (const el of document.querySelectorAll('#p-lab [data-no]')) { const i = idx(el.dataset.no); if (i >= 0) el.textContent = String(i + 1).padStart(2, '0'); }
    document.getElementById('p-lab').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lab]');
      const i = b && idx(b.dataset.lab);
      if (i >= 0) ctx.go(i);
    });
    // สั่งด้วยเสียง: "เปิดโซนาร์" "เปิดแล็บ"
    const WORDS = { sonar: /โซนาร์|sonar/, godview: /บัญชาการโลก|เครื่องบินทั่วโลก|ดาวเทียม/, overhead: /เครื่องบิน/, spectro: /ฟังเสียง|สเปกโตร/, jarvis: /เอไอในเครื่อง|แชท ?เอไอ/, soundlink: /ส่งข้อความผ่านเสียง/, twin: /ดิจิทัลทวิน|digital twin|โรงงาน/, holo: /โฮโลแกรม/, avatar: /อวตาร|avatar/, sky: /ส่องฟ้า|ดูดาว/, lens: /แปลป้าย|อ่านป้าย/, attendance: /ลงเวลา/, safety: /หมวกนิรภัย|ppe/, 'net-radar': /เรดาร์เครือข่าย|สแกนเน็ต|สแกนเครือข่าย/ };
    ctx.addIntent(/แล็บ|lab|โซนาร์|sonar|บัญชาการโลก|เครื่องบิน|ดาวเทียม|ฟังเสียง|เอไอในเครื่อง|ส่งข้อความผ่านเสียง|ดิจิทัลทวิน|โรงงาน|โฮโลแกรม|อวตาร|ส่องฟ้า|ดูดาว|แปลป้าย|อ่านป้าย|ลงเวลา|หมวกนิรภัย|เรดาร์เครือข่าย|สแกนเน็ต|สแกนเครือข่าย/, (q) => {
      const s = Object.keys(WORDS).find((k) => WORDS[k].test(q));
      if (s) return { text: `เปิด${ALL.find((a) => a[0] === s)[2]}ให้แล้วค่ะ`, go: idx(s) };
      return { text: 'นี่คือแล็บ รวมทุกระบบไว้ แตะเลือกได้เลยค่ะ', go: ctx.panels.findIndex((p) => p.id === 'p-lab') };
    }, 'เปิดโซนาร์');
  },
};
