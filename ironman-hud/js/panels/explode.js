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
  // ไม่มีกรอบ ไม่มีปุ่มหัวข้อ/คำอธิบาย: โมเดลลอยบนพื้นหลังของแอปเลย · เปลี่ยนหัวข้อจากเมนู ☰ ในโมเดล หรือสั่งด้วยเสียง
  html: `<div class="ex-frame no-swipe"><iframe id="ex-frame" title="แยกชิ้นส่วน 3 มิติ" allow="fullscreen" allowtransparency="true"></iframe>
      <a class="ex-full" id="ex-full" href="#" target="_blank" rel="noopener" aria-label="เปิดเต็มจอ" title="เต็มจอ">⤢</a></div>`,
  init(c) {
    ctx = c;
    frame = document.getElementById('ex-frame');
    frame.addEventListener('load', () => {
      sync();
      const t = new URL(frame.src).searchParams.get('topic') || 'pc';
      document.getElementById('ex-full').href = `${base()}?topic=${t}`;
    });
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
