// แผง 3D: ฝังเว็บ Exploded View (แยกชิ้นส่วน 3 มิติ: คอมพิวเตอร์ ร่างกายมนุษย์ เครื่องพิมพ์ รถ R34 ไอรอนแมน ดาวเคราะห์)
// บน GitHub อยู่ที่ ../exploded/ · บนเครื่องในบริษัท (XAMPP) อยู่ที่ ../New folder/
// โหลดเมื่อเปิดแผงครั้งแรก และสั่งให้หยุดวาดเมื่อออกจากแผง (ประหยัดแบต)
let ctx, frame, visible = false;
const TOPICS = { pc: 'คอมพิวเตอร์', human: 'ร่างกายมนุษย์', printer: 'เครื่องพิมพ์', car: 'รถ R34', ironman: 'ไอรอนแมน', planets: 'ดาวเคราะห์' };
const base = () => (/github\.io$/.test(location.hostname) ? '../exploded/' : '../New%20folder/');

function sync() { frame?.contentWindow?.postMessage({ hudVisible: visible }, location.origin); }
function open(topic) {
  const src = `${base()}?embed=1${topic ? `&topic=${topic}` : ''}`;
  if (!frame.src || topic) frame.src = src;
}

export default {
  id: 'p-explode', en: '3D VIEW', th: 'แยกชิ้นส่วน', sub: 'โมเดล 3 มิติ เลื่อนเพื่อแยกชิ้นส่วน', span: 2,
  html: `<div class="chips" id="ex-topics">${Object.entries(TOPICS).map(([k, v]) => `<button type="button" data-t="${k}">${v}</button>`).join('')}</div>
    <div class="flood-frame box ex-frame no-swipe"><iframe id="ex-frame" title="แยกชิ้นส่วน 3 มิติ" allow="fullscreen"></iframe>
      <a class="flood-full" id="ex-full" href="#" target="_blank" rel="noopener">⤢ เต็มจอ</a></div>
    <p class="hint">เลื่อนขึ้น-ลงในกรอบ = แยกชิ้นส่วนทีละชั้น · ลาก = หมุน · แตะชิ้นส่วน = ดูข้อมูล · ใช้หน้าปัดด้านล่างเพื่อเปลี่ยนแผง</p>`,
  init(c) {
    ctx = c;
    frame = document.getElementById('ex-frame');
    frame.addEventListener('load', () => {
      sync();
      const t = new URL(frame.src).searchParams.get('topic') || 'pc';
      document.querySelectorAll('#ex-topics button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      document.getElementById('ex-full').href = `${base()}?topic=${t}`;
    });
    document.getElementById('ex-topics').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) open(b.dataset.t); });
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-explode');
    const WORDS = { human: /ร่างกาย|กระดูก|อวัยวะ|กล้ามเนื้อ|มนุษย์/, printer: /เครื่องปริ้น|เครื่องพิมพ์|printer/, car: /r34|รถ|สกายไลน์|skyline/, ironman: /ชุดไอรอนแมน|เกราะ|mark ?5|มาร์ค/, planets: /ดาวเคราะห์|ระบบสุริยะ|ดาวอังคาร|ดาวพฤหัส|ดาวเสาร์|ดวงอาทิตย์/, pc: /คอมพิวเตอร์|ชิ้นส่วนคอม|ซีพียู|cpu/ };
    ctx.addIntent(/แยกชิ้นส่วน|โมเดล|3d|ร่างกาย|กระดูก|อวัยวะ|เครื่องปริ้น|เครื่องพิมพ์|r34|สกายไลน์|ชุดไอรอนแมน|เกราะ|ดาวเคราะห์|ระบบสุริยะ|ดาวอังคาร|ดาวพฤหัส|ดาวเสาร์|คอมพิวเตอร์/, (q) => {
      const t = Object.keys(WORDS).find((k) => WORDS[k].test(q));
      open(t);
      return { text: `เปิดโมเดลสามมิติ${t ? TOPICS[t] : ''}ให้แล้วค่ะ เลื่อนในกรอบเพื่อแยกชิ้นส่วนได้เลย`, go: go() };
    }, 'ดูโครงกระดูก');
  },
  show() { visible = true; open(); sync(); },
  hide() { visible = false; sync(); },
};
