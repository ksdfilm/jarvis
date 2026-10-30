// สรุปเหตุการณ์จากกล้องแบบเรียลไทม์ (รันบนมือถือล้วนๆ ไม่ส่งภาพออกไปไหน)
// รับกรอบวัตถุจาก MediaPipe Object Detector ทุกรอบ → ติดตามวัตถุข้ามเฟรม → สร้างประโยคสรุป + บันทึกเหตุการณ์
// เป็นการเดาจากตำแหน่งกรอบเท่านั้น (เช่น โทรศัพท์อยู่ในกรอบตัวคน = "ใช้โทรศัพท์") ไม่ได้เข้าใจภาพแบบ AI ภาษา

// ชื่อไทย + ลักษณนาม ของวัตถุ 80 ชนิด (ชุด COCO ที่โมเดลรู้จัก)
const TH = {
  person: ['คน', 'คน'], bicycle: ['จักรยาน', 'คัน'], car: ['รถยนต์', 'คัน'], motorcycle: ['มอเตอร์ไซค์', 'คัน'], airplane: ['เครื่องบิน', 'ลำ'],
  bus: ['รถบัส', 'คัน'], train: ['รถไฟ', 'ขบวน'], truck: ['รถบรรทุก', 'คัน'], boat: ['เรือ', 'ลำ'], 'traffic light': ['ไฟจราจร', 'ชุด'],
  'fire hydrant': ['หัวดับเพลิง', 'หัว'], 'stop sign': ['ป้ายหยุด', 'ป้าย'], 'parking meter': ['มิเตอร์จอดรถ', 'เครื่อง'], bench: ['ม้านั่ง', 'ตัว'],
  bird: ['นก', 'ตัว'], cat: ['แมว', 'ตัว'], dog: ['สุนัข', 'ตัว'], horse: ['ม้า', 'ตัว'], sheep: ['แกะ', 'ตัว'], cow: ['วัว', 'ตัว'],
  elephant: ['ช้าง', 'ตัว'], bear: ['หมี', 'ตัว'], zebra: ['ม้าลาย', 'ตัว'], giraffe: ['ยีราฟ', 'ตัว'], backpack: ['กระเป๋าเป้', 'ใบ'],
  umbrella: ['ร่ม', 'คัน'], handbag: ['กระเป๋าถือ', 'ใบ'], tie: ['เนคไท', 'เส้น'], suitcase: ['กระเป๋าเดินทาง', 'ใบ'], frisbee: ['จานร่อน', 'อัน'],
  skis: ['สกี', 'คู่'], snowboard: ['สโนว์บอร์ด', 'อัน'], 'sports ball': ['ลูกบอล', 'ลูก'], kite: ['ว่าว', 'ตัว'], 'baseball bat': ['ไม้เบสบอล', 'อัน'],
  'baseball glove': ['ถุงมือเบสบอล', 'อัน'], skateboard: ['สเก็ตบอร์ด', 'อัน'], surfboard: ['กระดานโต้คลื่น', 'อัน'], 'tennis racket': ['ไม้เทนนิส', 'อัน'],
  bottle: ['ขวด', 'ขวด'], 'wine glass': ['แก้วไวน์', 'ใบ'], cup: ['แก้ว', 'ใบ'], fork: ['ส้อม', 'คัน'], knife: ['มีด', 'เล่ม'], spoon: ['ช้อน', 'คัน'],
  bowl: ['ชาม', 'ใบ'], banana: ['กล้วย', 'ลูก'], apple: ['แอปเปิล', 'ลูก'], sandwich: ['แซนด์วิช', 'ชิ้น'], orange: ['ส้ม', 'ลูก'],
  broccoli: ['บรอกโคลี', 'ต้น'], carrot: ['แครอท', 'หัว'], 'hot dog': ['ฮอตดอก', 'ชิ้น'], pizza: ['พิซซ่า', 'ชิ้น'], donut: ['โดนัท', 'ชิ้น'],
  cake: ['เค้ก', 'ชิ้น'], chair: ['เก้าอี้', 'ตัว'], couch: ['โซฟา', 'ตัว'], 'potted plant': ['กระถางต้นไม้', 'กระถาง'], bed: ['เตียง', 'เตียง'],
  'dining table': ['โต๊ะ', 'ตัว'], toilet: ['โถส้วม', 'โถ'], tv: ['จอทีวี', 'จอ'], laptop: ['โน้ตบุ๊ก', 'เครื่อง'], mouse: ['เมาส์', 'ตัว'],
  remote: ['รีโมต', 'อัน'], keyboard: ['คีย์บอร์ด', 'อัน'], 'cell phone': ['โทรศัพท์', 'เครื่อง'], microwave: ['ไมโครเวฟ', 'เครื่อง'],
  oven: ['เตาอบ', 'เครื่อง'], toaster: ['เครื่องปิ้งขนมปัง', 'เครื่อง'], sink: ['อ่างล้างมือ', 'อ่าง'], refrigerator: ['ตู้เย็น', 'ตู้'],
  book: ['หนังสือ', 'เล่ม'], clock: ['นาฬิกา', 'เรือน'], vase: ['แจกัน', 'ใบ'], scissors: ['กรรไกร', 'เล่ม'], 'teddy bear': ['ตุ๊กตาหมี', 'ตัว'],
  'hair drier': ['ไดร์เป่าผม', 'เครื่อง'], toothbrush: ['แปรงสีฟัน', 'อัน'],
};
export const thName = (l) => TH[l]?.[0] ?? l;
const unit = (l) => TH[l]?.[1] ?? 'ชิ้น';
// วัตถุที่เคลื่อนที่เองได้ → รายงานการเคลื่อนที่/เข้า-ออก (ของวางนิ่งรายงานแค่ตอนปรากฏ/หายไป)
const MOVERS = new Set(['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck', 'bird', 'cat', 'dog', 'horse', 'cow', 'train', 'boat']);
// ของที่อยู่ในกรอบตัวคน → เดาว่าคนกำลังทำอะไร
const WITH = {
  'cell phone': 'ใช้โทรศัพท์', laptop: 'ใช้โน้ตบุ๊ก', keyboard: 'ใช้คอมพิวเตอร์', book: 'อ่านหนังสือ', cup: 'ถือแก้ว/ดื่มน้ำ', bottle: 'ถือขวดน้ำ',
  umbrella: 'กางร่ม', backpack: 'สะพายเป้', handbag: 'ถือกระเป๋า', suitcase: 'ลากกระเป๋าเดินทาง', bicycle: 'ขี่จักรยาน', motorcycle: 'ขี่มอเตอร์ไซค์',
  chair: 'นั่งเก้าอี้', couch: 'นั่งโซฟา', bed: 'อยู่บนเตียง', 'dining table': 'อยู่ที่โต๊ะ', 'sports ball': 'เล่นบอล', toothbrush: 'แปรงฟัน', scissors: 'ใช้กรรไกร', knife: 'ใช้มีด',
};

const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = ix * iy; return i / (a.w * a.h + b.w * b.h - i);
};
const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
const inside = (o, p) => { const [cx, cy] = center(o), mx = p.w * 0.12, my = p.h * 0.08; return cx > p.x - mx && cx < p.x + p.w + mx && cy > p.y - my && cy < p.y + p.h + my; };

export function createScene() {
  let tracks = [], nextId = 1, lastT = 0, gap = 300;
  // เครื่องช้า (ตรวจแต่ละรอบนาน) → ยืดเวลาที่ยังถือว่าเห็นอยู่ตามจังหวะจริง
  const CONFIRM = 3, lostMs = () => Math.max(2000, gap * 3), seenMs = () => Math.max(600, gap * 1.6);

  /** dets: [{ label, x, y, w, h, score }] พิกัดในภาพ · fw/fh = ขนาดส่วนของภาพที่ใช้ · คืนรายการเหตุการณ์ใหม่ [{ text, level }] */
  function update(dets, t, fw, fh) {
    if (lastT) gap = gap * 0.7 + (t - lastT) * 0.3;
    lastT = t;
    const events = [], appeared = {}, left = {};
    // จับคู่กรอบเดิมกับกรอบใหม่ (ชนิดเดียวกัน ทับกันมากสุดก่อน)
    const pairs = [];
    tracks.forEach((tr, i) => dets.forEach((d, j) => {
      if (d.label !== tr.label) return;
      const o = iou(tr.box, d), [ax, ay] = center(tr.box), [bx, by] = center(d);
      const near = Math.hypot(ax - bx, ay - by) < Math.max(tr.box.w, tr.box.h) * 0.6;
      if (o > 0.15 || near) pairs.push([o + (near ? 0.1 : 0), i, j]);
    }));
    pairs.sort((a, b) => b[0] - a[0]);
    const usedT = new Set(), usedD = new Set();
    for (const [, i, j] of pairs) {
      if (usedT.has(i) || usedD.has(j)) continue;
      usedT.add(i); usedD.add(j);
      const tr = tracks[i], d = dets[j];
      tr.box = d; tr.lastT = t; tr.hits++;
      tr.hist.push({ t, cx: d.x + d.w / 2, cy: d.y + d.h / 2, a: d.w * d.h });
      while (tr.hist.length && t - tr.hist[0].t > 3000) tr.hist.shift();
      if (!tr.ok && tr.hits >= CONFIRM) { tr.ok = true; appeared[tr.label] = (appeared[tr.label] || 0) + 1; }
    }
    dets.forEach((d, j) => {
      if (usedD.has(j)) return;
      tracks.push({ id: nextId++, label: d.label, box: d, firstT: t, lastT: t, hits: 1, ok: false, hist: [{ t, cx: d.x + d.w / 2, cy: d.y + d.h / 2, a: d.w * d.h }], moveT: 0, up: 0, flat: 0, fallT: 0 });
    });
    // หายไปนานเกิน → ออกไปแล้ว
    tracks = tracks.filter((tr) => {
      if (t - tr.lastT < lostMs()) return true;
      if (tr.ok) left[tr.label] = (left[tr.label] || 0) + 1;
      return false;
    });

    const seen = visible(t);
    for (const [l, n] of Object.entries(appeared)) {
      const total = seen.filter((tr) => tr.label === l).length;
      events.push({ text: MOVERS.has(l) ? `มี${thName(l)}เข้ามา ${n} ${unit(l)} (ตอนนี้ ${total})` : `เห็น${thName(l)} ${n} ${unit(l)}`, level: l === 'person' ? 'info' : 'low' });
    }
    for (const [l, n] of Object.entries(left)) {
      const total = seen.filter((tr) => tr.label === l).length;
      events.push({ text: MOVERS.has(l) ? `${thName(l)}ออกไป ${n} ${unit(l)} (เหลือ ${total})` : `${thName(l)}หายไปจากภาพ ${n} ${unit(l)}`, level: l === 'person' ? 'info' : 'low' });
    }

    for (const tr of seen) {
      if (!MOVERS.has(tr.label)) continue;
      // การเคลื่อนที่: เทียบกับตำแหน่งเมื่อ ~1 วินาทีก่อน
      const old = tr.hist.find((h) => t - h.t <= Math.max(1300, gap * 2.5));
      const now = tr.hist[tr.hist.length - 1];
      tr.speed = old && now.t > old.t ? Math.hypot(now.cx - old.cx, now.cy - old.cy) / fw / ((now.t - old.t) / 1000) : 0;
      if (old && now.t - old.t > 700 && t - tr.moveT > 5000) {
        const dx = (now.cx - old.cx) / fw, ar = now.a / old.a;
        let what = '';
        if (ar > 1.4) what = 'กำลังเดินเข้ามาใกล้กล้อง';
        else if (ar < 0.7) what = 'กำลังเดินห่างออกไป';
        else if (Math.abs(dx) > 0.18) what = dx > 0 ? 'กำลังเคลื่อนไปทางขวา' : 'กำลังเคลื่อนไปทางซ้าย';
        if (what) { tr.moveT = t; events.push({ text: `${thName(tr.label)} #${tr.id} ${tr.label === 'person' ? what : what.replace('เดิน', 'เคลื่อนที่')}`, level: 'low' }); }
      }
      // อาจล้ม: คนที่เพิ่งยืนตรง (สูงกว่ากว้าง) กลายเป็นนอนราบ (กว้างกว่าสูง) ต่อเนื่องหลายรอบ
      if (tr.label === 'person') {
        const r = tr.box.w / tr.box.h;
        if (r < 0.8) { tr.up = t; tr.flat = 0; } else if (r > 1.15) tr.flat++;
        if (tr.flat >= 3 && t - tr.up < 4000 && t - tr.fallT > 15000) { tr.fallT = t; events.push({ text: `⚠️ คน #${tr.id} อาจล้มลง ควรไปดู`, level: 'alert' }); }
      }
    }
    return events;
  }

  const visible = (t) => tracks.filter((tr) => tr.ok && t - tr.lastT < seenMs());

  /** ประโยคสรุปสิ่งที่เห็นตอนนี้ */
  function summary(t) {
    const seen = visible(t);
    if (!seen.length) return { text: 'ยังไม่เห็นคนหรือสิ่งของที่รู้จักในภาพ', counts: {}, acts: {} };
    const counts = {};
    seen.forEach((tr) => (counts[tr.label] = (counts[tr.label] || 0) + 1));
    const people = seen.filter((tr) => tr.label === 'person'), acts = {};
    for (const p of people) {
      const did = [...new Set(seen.filter((o) => WITH[o.label] && inside(o.box, p.box)).map((o) => WITH[o.label]))];
      if (!did.length) did.push((p.speed || 0) > 0.06 ? 'กำลังเคลื่อนที่' : 'อยู่นิ่ง');
      did.forEach((a) => (acts[a] = (acts[a] || 0) + 1));
    }
    const order = Object.keys(counts).sort((a, b) => (a === 'person' ? -1 : b === 'person' ? 1 : counts[b] - counts[a]));
    const list = order.map((l) => `${thName(l)} ${counts[l]} ${unit(l)}`);
    let text = `เห็น${list.slice(0, 6).join(', ')}${list.length > 6 ? ` และอื่นๆ อีก ${list.length - 6} ชนิด` : ''}`;
    const a = Object.entries(acts).sort((x, y) => y[1] - x[1]).map(([k, n]) => (people.length > 1 ? `${k} ${n} คน` : k));
    if (a.length) text += ` · ${people.length > 1 ? 'คน' : 'คนในภาพ'}${a.join(', ')}`;
    return { text, counts, acts };
  }

  return { update, summary, visible, reset: () => { tracks = []; nextId = 1; lastT = 0; gap = 300; } };
}
