// รายงานตอนเช้า: กดปุ่มเดียว (หรือพูดว่า "รายงาน") EDIT สรุปทุกอย่างที่ควรรู้วันนี้ให้ฟัง
// แต่ละแผงส่งประโยคของตัวเองผ่าน report() — แผงไหนไม่มีข้อมูลก็ข้ามไป
let ctx;

async function build() {
  const parts = [`${ctx.greetTh()} ${ctx.nameTh()} นี่คือสรุปวันนี้ค่ะ`];
  for (const src of ctx.reporters) {
    try {
      const t = await src();
      if (Array.isArray(t)) parts.push(...t.filter(Boolean)); else if (t) parts.push(t);
    } catch { /* แผงไหนพังก็ข้าม */ }
  }
  parts.push('ขอให้เป็นวันที่ดีนะคะ');
  return parts;
}

async function run() {
  const parts = await build();
  ctx.voice.show(parts.join(' '), { title: 'DAILY BRIEFING · รายงานประจำวัน', list: parts.slice(1, -1) });
}

export default {
  init(c) {
    ctx = c;
    ctx.$('#report-btn')?.addEventListener('click', run);
    ctx.addIntent(/รายงาน|สรุป|briefing|report/, () => { setTimeout(run, 50); return { text: 'กำลังเตรียมรายงานค่ะ' }; });
  },
  run,
};
