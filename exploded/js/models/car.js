// Nissan Skyline GT-R (R34) — ตัวถัง ห้องโดยสาร ล้อ เบรก และช่วงล่างจากโมเดลจริง (Sketchfab, CC BY)
// ชิ้นภายในที่โมเดลไม่มี (ชิ้นในเครื่อง RB26 เกียร์ ระบบขับสี่ ท่อไอเสีย ถังน้ำมัน) สร้างจากโค้ดตามสเปกจริง
// ไฟล์โมเดลแปลงด้วย tools/build-r34.mjs  พิกัดเมตร: หน้ารถ = +x, ขึ้น = +y, ขวา (ฝั่งคนขับ) = +z
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { M, std, box, rbox, cyl, group } from './kit.js';

const MODEL_URL = new URL('../../models/car/r34.glb', import.meta.url).href;

// ---------- วัสดุชิ้นที่สร้างเอง ----------
const alu = (c = 0x9aa0a8) => std({ color: c, metalness: 0.75, roughness: 0.38 });
const castIron = () => std({ color: 0x55595f, metalness: 0.6, roughness: 0.6 });
const blackTrim = () => std({ color: 0x0c0d0f, metalness: 0.1, roughness: 0.55 });
const camRed = () => std({ color: 0x8e1b1b, metalness: 0.3, roughness: 0.75 }); // ฝาครอบแคมลายย่น
const heat = () => std({ color: 0x8a7f72, metalness: 0.7, roughness: 0.45 });
const tube = (pts, r, mat, seg = 48) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 10), mat);

// ---------- ชิ้นส่วนคู่ ซ้าย-ขวา ----------
const SIDE = { r: ['ขวา', 'Right', 1], l: ['ซ้าย', 'Left', -1] };
function pair(base, def) {
  return ['r', 'l'].map((k) => {
    const [th, en, s] = SIDE[k];
    return {
      ...def,
      id: `${base}_${k}`,
      name: `${def.name} (${th})`,
      short: def.name,
      en: `${def.en} (${en})`,
      noLabel: k === 'l',
      offset: typeof def.offset === 'function' ? def.offset(s) : def.offset,
      moves: def.moves ? def.moves(s) : undefined,
      build: def.build ? () => def.build(s) : undefined,
    };
  });
}

// ---------- เครื่องยนต์ RB26DETT (วางตามยาว 6 สูบเรียง) ----------
const ENG = { x: 1.42, y: 0.5 };
const CYL_X = [0, 1, 2, 3, 4, 5].map((i) => ENG.x + 0.225 - i * 0.09); // สูบ 1 อยู่หน้าสุด
const LIFT = [2.7, 1.05, 0]; // ขั้น 3: ยกเครื่องออกมาด้านหน้ารถ
const engine = (def) => ({ ...def, moves: [{ stage: 3, offset: LIFT }, { stage: 4, offset: def.explode }] });

const stages = [
  {
    title: 'Nissan Skyline GT-R R34',
    en: "Brian's R34 · 2 Fast 2 Furious",
    text: 'สปอร์ตคูเป้ในตำนานจากญี่ปุ่น เครื่อง RB26DETT 6 สูบทวินเทอร์โบ ขับเคลื่อน 4 ล้อ คันนี้คือรถของ Brian จากหนัง 2 Fast 2 Furious สีเงินลายน้ำเงิน',
  },
  {
    title: 'ตัวถังภายนอก',
    en: 'Body Panels',
    text: 'แผงตัวถังคูเป้ 2 ประตู ฝากระโปรงหน้า สปอยเลอร์หลังทรงปีก กันชน ไฟหน้า-ไฟท้ายกลมคู่อันเป็นเอกลักษณ์ของ Skyline',
  },
  {
    title: 'ห้องโดยสาร',
    en: 'Interior',
    text: 'ห้องโดยสาร 4 ที่นั่งแบบสปอร์ต พวงมาลัยขวาแบบรถญี่ปุ่น เบาะคู่หน้าทรงบักเก็ต และแผงหน้าปัดที่มีจอแสดงข้อมูลเครื่องยนต์ (MFD)',
  },
  {
    title: 'ห้องเครื่องและระบบส่งกำลัง',
    en: 'Engine Bay & Drivetrain',
    text: 'ยกเครื่องยนต์ออกจากห้องเครื่อง พร้อมหม้อน้ำ อินเตอร์คูลเลอร์ เกียร์ธรรมดา 6 สปีด ระบบขับสี่ ATTESA E-TS ท่อไอเสีย และถังน้ำมัน',
  },
  {
    title: 'เครื่องยนต์ RB26DETT',
    en: 'Engine Internals',
    text: 'เครื่องเบนซิน 6 สูบเรียง 2,568 ซีซี DOHC 24 วาล์ว ทวินเทอร์โบ แยกชิ้นตั้งแต่ฝาครอบแคมด้านบนจนถึงอ่างน้ำมันเครื่องด้านล่าง',
  },
  {
    title: 'ช่วงล่าง ล้อ และเบรก',
    en: 'Chassis, Wheels & Brakes',
    text: 'ช่วงล่างมัลติลิงก์ทั้งหน้าและหลัง เบรก Brembo และล้อขนาด 18 นิ้ว',
  },
  {
    title: 'ภาพรวมทุกชิ้นส่วน',
    en: 'All Parts',
    text: 'แยกครบทุกระบบแล้ว คลิกชิ้นไหนก็ได้เพื่อซูมดูและอ่านรายละเอียด หรือเลื่อนกลับขึ้นไปเพื่อประกอบรถคืน',
  },
];

// ---------- ชิ้นจากโมเดลจริง (ชื่อตรงกับ node ในไฟล์ r34.glb) ----------
const MODEL_PARTS = [
  {
    id: 'bodyShell',
    stage: 0,
    offset: [0, 0, 0],
    name: 'โครงตัวถังและพื้นรถ',
    en: 'Body Shell & Floor',
    desc: 'โครงตัวถังโมโนค็อกที่เชื่อมเสาหลังคา พื้นรถ และผนังห้องเครื่องเป็นชิ้นเดียว ทุกชิ้นส่วนยึดอยู่กับโครงนี้',
    facts: ['R34 มีตัวถังแข็งแรงกว่ารุ่น R33 อย่างชัดเจน', 'ฐานล้อสั้นกว่า R33 ทำให้คล่องตัวขึ้น'],
  },
  {
    id: 'hood',
    stage: 1,
    offset: [0.7, 1.6, 0],
    name: 'ฝากระโปรงหน้า',
    en: 'Hood',
    desc: 'ฝาปิดห้องเครื่อง ของ GT-R ทำจากอะลูมิเนียมเพื่อลดน้ำหนักด้านหน้า มีช่องระบายความร้อนจากห้องเครื่อง',
    facts: ['รุ่น V-Spec II มีฝากระโปรงคาร์บอนไฟเบอร์พร้อมช่องดักลม'],
  },
  {
    id: 'roof',
    stage: 1,
    offset: [0, 2.0, 0],
    name: 'หลังคา',
    en: 'Roof',
    desc: 'แผงหลังคาเหล็กของตัวถังคูเป้ เชื่อมระหว่างเสา A และเสา C',
    facts: ['ตัวถังคูเป้ 2 ประตูช่วยให้ตัวรถแข็งกว่ารุ่น 4 ประตู'],
  },
  {
    id: 'trunkLid',
    stage: 1,
    offset: [-0.7, 1.5, 0],
    name: 'ฝากระโปรงท้าย',
    en: 'Trunk Lid',
    desc: 'ฝาปิดห้องเก็บสัมภาระด้านท้าย เป็นที่ยึดของสปอยเลอร์หลัง',
    facts: ['ห้องเก็บสัมภาระเล็กพอสมควร เพราะใต้พื้นมีเฟืองท้ายและถังน้ำมัน'],
  },
  {
    id: 'wing',
    stage: 1,
    offset: [-1.1, 2.2, 0],
    name: 'สปอยเลอร์หลัง',
    en: 'Rear Wing',
    desc: 'ปีกหลังสร้างแรงกดให้ล้อหลังเกาะถนนที่ความเร็วสูง มุมปีกปรับได้',
    facts: ['GT-R V-Spec ยังมีแผ่นดิฟฟิวเซอร์ใต้ท้องรถช่วยสร้างแรงกดอีกทาง'],
  },
  {
    id: 'frontBumper',
    stage: 1,
    offset: [1.6, 0, 0],
    name: 'กันชนหน้า',
    en: 'Front Bumper',
    desc: 'กันชนหน้าพร้อมช่องดักลมขนาดใหญ่ นำอากาศเข้าอินเตอร์คูลเลอร์และหม้อน้ำ ด้านล่างมีลิ้นหน้า',
    facts: ['ช่องลมขนาดใหญ่จำเป็นมาก เพราะเครื่องเทอร์โบสร้างความร้อนสูง'],
  },
  {
    id: 'rearBumper',
    stage: 1,
    offset: [-1.6, 0, 0],
    name: 'กันชนหลัง',
    en: 'Rear Bumper',
    desc: 'กันชนด้านท้าย ล้อมรอบปลายท่อไอเสียและไฟตัดหมอกหลัง',
    facts: ['ด้านล่างมีครีบช่วยจัดการอากาศใต้ท้องรถ'],
  },
  ...pair('fender', {
    stage: 1,
    offset: (s) => [0.6, 0.1, s * 1.15],
    name: 'บังโคลนหน้า',
    en: 'Front Fender',
    desc: 'แผงตัวถังเหนือซุ้มล้อหน้า ของ GT-R โป่งออกเพื่อรองรับล้อและยางที่กว้างกว่า Skyline รุ่นธรรมดา',
    facts: ['มีช่องระบายลมร้อนจากซุ้มล้อด้านหลังบังโคลน'],
  }),
  ...pair('door', {
    stage: 1,
    offset: (s) => [0.2, 0, s * 1.7],
    name: 'ประตู',
    en: 'Door',
    desc: 'ประตูบานยาวของรถคูเป้ 2 ประตู กระจกไม่มีกรอบ (Frameless) รวมแผงประตูด้านใน มือจับ และกระจกมองข้าง',
    facts: ['ประตูฝั่งขวาคือฝั่งคนขับของรถพวงมาลัยขวาแบบญี่ปุ่น'],
  }),
  ...pair('quarter', {
    stage: 1,
    offset: (s) => [-0.6, 0.1, s * 1.15],
    name: 'แผงข้างท้าย',
    en: 'Rear Quarter Panel',
    desc: 'แผงตัวถังรอบซุ้มล้อหลังพร้อมกระจกบานเล็กด้านหลังประตู เชื่อมติดกับตัวถังถาวร',
    facts: ['ซุ้มล้อหลังโป่งออกรับล้อหลังที่กว้าง'],
  }),
  {
    id: 'windshield',
    stage: 1,
    offset: [1.0, 1.35, 0],
    name: 'กระจกบังลมหน้า',
    en: 'Windshield',
    desc: 'กระจกนิรภัยลามิเนต 2 ชั้น มีฟิล์มกันแตกตรงกลาง',
    facts: ['เมื่อแตกจะร้าวเป็นใยแมงมุมแต่ไม่หลุดเป็นเศษ'],
  },
  {
    id: 'rearWindow',
    stage: 1,
    offset: [-1.0, 1.45, 0],
    name: 'กระจกหลัง',
    en: 'Rear Window',
    desc: 'กระจกหลังแบบเทมเปอร์ มีเส้นลวดไล่ฝ้าในเนื้อกระจก',
    facts: ['เมื่อแตกจะเป็นเม็ดเล็กๆ ไม่แหลมคม'],
  },
  ...pair('headlight', {
    stage: 1,
    offset: (s) => [2.1, 0.25, s * 0.6],
    name: 'ไฟหน้า',
    en: 'Headlight',
    desc: 'ไฟหน้าโปรเจกเตอร์ซีนอน (HID) ทรงเฉียงดุดัน พร้อมไฟเลี้ยว',
    facts: ['หลอด HID สว่างกว่าฮาโลเจนราว 2–3 เท่า'],
  }),
  ...pair('taillight', {
    stage: 1,
    offset: (s) => [-2.1, 0.25, s * 0.6],
    name: 'ไฟท้าย',
    en: 'Taillight',
    desc: 'ไฟท้ายกลมคู่ ข้างละ 2 ดวง เอกลักษณ์ของ Skyline ที่สืบทอดมาตั้งแต่ยุค 1970',
    facts: ['ไฟท้ายกลมถูกเรียกเล่นๆ ว่า "Skyline signature"'],
  }),

  // ห้องโดยสาร
  {
    id: 'dashboard',
    stage: 2,
    offset: [0.6, 2.2, 0],
    name: 'แผงหน้าปัด',
    en: 'Dashboard & MFD',
    desc: 'แผงหน้ารถพร้อมมาตรวัด และจอแสดงข้อมูลหลายแบบ (Multi-Function Display) ที่โชว์แรงดันบูสต์ อุณหภูมิน้ำมัน และแรง G',
    facts: ['MFD ของ R34 ถือว่าล้ำมากในยุคปี 1999'],
  },
  {
    id: 'steering',
    stage: 2,
    offset: [1.0, 2.6, 0.5],
    name: 'พวงมาลัยและมาตรวัด',
    en: 'Steering Wheel & Gauges',
    desc: 'พวงมาลัยขวาแบบรถญี่ปุ่น หลังพวงมาลัยคือมาตรวัดรอบและความเร็ว',
    facts: ['มาตรวัดความเร็วรถญี่ปุ่นยุคนั้นจำกัดไว้ที่ 180 กม./ชม. ตามข้อตกลงผู้ผลิต'],
  },
  ...pair('seatF', {
    stage: 2,
    offset: (s) => [0, 1.9, s * 0.8],
    name: 'เบาะคู่หน้า',
    en: 'Front Seat',
    desc: 'เบาะทรงบักเก็ตปีกข้างสูง ล็อกลำตัวไว้ไม่ให้ไถลตอนเข้าโค้งแรงๆ',
    facts: ['ปีกข้างเบาะช่วยรองรับแรง G ด้านข้าง'],
  }),
  {
    id: 'rearSeat',
    stage: 2,
    offset: [-0.6, 1.8, 0],
    name: 'เบาะหลัง',
    en: 'Rear Seat',
    desc: 'เบาะหลัง 2 ที่นั่ง พื้นที่ค่อนข้างจำกัดตามแบบรถคูเป้สปอร์ต',
    facts: ['R34 GT-R จดทะเบียนเป็นรถ 4 ที่นั่ง'],
  },
  {
    id: 'console',
    stage: 2,
    offset: [0, 2.5, 0],
    name: 'คอนโซลกลางและคันเกียร์',
    en: 'Center Console & Shifter',
    desc: 'คอนโซลระหว่างเบาะ มีคันเกียร์ธรรมดา 6 สปีดและเบรกมือ',
    facts: ['เกียร์ 6 สปีดผลิตโดย Getrag จากเยอรมนี'],
  },

  // ห้องเครื่อง
  {
    id: 'radiator',
    stage: 3,
    offset: [1.9, 0.4, 0],
    name: 'หม้อน้ำและพัดลม',
    en: 'Radiator & Fans',
    desc: 'ระบายความร้อนของน้ำหล่อเย็นเครื่องยนต์ อยู่ด้านหลังอินเตอร์คูลเลอร์',
    facts: ['เครื่องเทอร์โบต้องการระบบระบายความร้อนที่ใหญ่กว่าเครื่องธรรมดา'],
  },
  {
    id: 'engine',
    stage: 3,
    moves: [{ stage: 3, offset: LIFT }, { stage: 4, offset: [0, 0, -1.5] }],
    name: 'เครื่องยนต์ RB26DETT (ทั้งลูก)',
    en: 'RB26DETT Engine Assembly',
    desc: 'เครื่องยนต์ 6 สูบเรียงทวินเทอร์โบที่ประกอบครบทั้งลูก รวมท่อร่วมไอดี ท่อทางเดินอากาศ และอุปกรณ์รอบเครื่อง',
    facts: ['แรงม้าทางการ 280 PS ตาม "ข้อตกลงสุภาพบุรุษ" ของผู้ผลิตญี่ปุ่น แต่ของจริงมากกว่านั้น', 'ขั้นถัดไปจะแยกชิ้นข้างในให้ดู'],
  },

  // ช่วงล่าง ล้อ เบรก
  ...pair('wheelF', {
    stage: 5,
    offset: (s) => [0.3, 0, s * 1.8],
    name: 'ล้อและยางหน้า',
    en: 'Front Wheel & Tire',
    desc: 'ล้ออัลลอยขนาด 18 นิ้วพร้อมยางสมรรถนะสูง ล้อหน้าทั้งเลี้ยวและรับแรงขับจากระบบขับสี่',
    facts: ['ยางเดิมขนาด 245/40R18'],
  }),
  ...pair('wheelR', {
    stage: 5,
    offset: (s) => [-0.3, 0, s * 1.8],
    name: 'ล้อและยางหลัง',
    en: 'Rear Wheel & Tire',
    desc: 'ล้อหลังรับแรงขับเป็นหลัก ระบบ ATTESA ส่งแรงไปล้อหลังเกือบทั้งหมดในการขับปกติ',
    facts: ['ล้อหลังมีระบบลิมิเต็ดสลิปช่วยไม่ให้ล้อฟรีตอนออกโค้ง'],
  }),
  ...pair('brakeF', {
    stage: 5,
    offset: (s) => [0.2, 0, s * 1.1],
    name: 'เบรก Brembo หน้า',
    en: 'Front Brembo Brake',
    desc: 'คาลิปเปอร์ Brembo 4 พอต (4 ลูกสูบ) สีแดงบีบจานเบรกขนาดใหญ่แบบมีครีบระบายความร้อน',
    facts: ['ลูกสูบหลายตัวช่วยกระจายแรงบีบผ้าเบรกให้สม่ำเสมอ'],
  }),
  ...pair('brakeR', {
    stage: 5,
    offset: (s) => [-0.2, 0, s * 1.1],
    name: 'เบรก Brembo หลัง',
    en: 'Rear Brembo Brake',
    desc: 'คาลิปเปอร์ Brembo 2 พอตสำหรับล้อหลัง พร้อมกลไกเบรกมือ',
    facts: ['GT-R ใช้ดิสก์เบรกทั้ง 4 ล้อ'],
  }),
  ...pair('strutF', {
    stage: 5,
    offset: (s) => [0, 0.6, s * 0.6],
    name: 'ช่วงล่างหน้ามัลติลิงก์',
    en: 'Front Multi-link Suspension',
    desc: 'ช่วงล่างหน้าแบบมัลติลิงก์ ใช้แขนหลายชิ้นคุมมุมล้อให้แนบถนนตลอดเวลาแม้ตอนเข้าโค้งแรง',
    facts: ['Skyline GT-R ใช้มัลติลิงก์ทั้งหน้าและหลังมาตั้งแต่ R32'],
  }),
  ...pair('suspR', {
    stage: 5,
    offset: (s) => [0, 0.6, s * 0.6],
    name: 'ช่วงล่างหลังมัลติลิงก์',
    en: 'Rear Multi-link Suspension',
    desc: 'ช่วงล่างหลังมัลติลิงก์พร้อมโช้คอัพและสปริง รับแรงบิดมหาศาลจากเครื่องเทอร์โบ',
    facts: ['ระบบ HICAS เลี้ยวล้อหลังได้เล็กน้อยช่วยให้เข้าโค้งคมขึ้น'],
  }),
];

// ---------- ชิ้นที่สร้างจากโค้ด ----------
const CODE_PARTS = [
  {
    id: 'intercooler',
    stage: 3,
    offset: [2.3, 0.1, 0],
    name: 'อินเตอร์คูลเลอร์',
    en: 'Front-mount Intercooler',
    desc: 'ระบายความร้อนให้อากาศที่ถูกเทอร์โบอัดจนร้อน อากาศเย็นมีออกซิเจนมากกว่า เครื่องจึงได้กำลังมากขึ้น',
    facts: ['ติดตั้งด้านหน้าสุดหลังกันชน รับลมได้เต็มที่'],
    build: () => group(rbox(0.07, 0.2, 1.15, 0.02, alu(0x9097a0), 2.12, 0.33, 0), box(0.075, 0.16, 1.0, std({ color: 0x3b3f45, metalness: 0.5, roughness: 0.5 }), 2.12, 0.33, 0)),
  },
  {
    id: 'transmission',
    stage: 3,
    offset: [0, 1.0, -2.0],
    name: 'เกียร์ธรรมดา 6 สปีด',
    en: 'Getrag 6-speed Manual',
    desc: 'เกียร์ธรรมดา 6 สปีดต่อท้ายเครื่องยนต์ ภายในมีชุดเฟืองหลายคู่ให้อัตราทดต่างกัน มีคลัตช์ตัดต่อกำลังจากเครื่อง',
    facts: ['R34 เป็น Skyline GT-R รุ่นแรกที่ได้เกียร์ 6 สปีด', 'แข็งแรงพอรับแรงบิดหลายร้อยนิวตันเมตร'],
    build: () =>
      group(
        cyl(0.17, 0.12, alu(0x7d838b), 0.9, 0.42, 0, 'x', 32),
        rbox(0.5, 0.22, 0.22, 0.05, alu(0x8a9098), 0.6, 0.4, 0),
        cyl(0.07, 0.25, alu(0x8a9098), 0.25, 0.38, 0, 'x'),
      ),
  },
  {
    id: 'frontDrive',
    stage: 3,
    offset: [0.4, 0.15, 2.1],
    name: 'ระบบขับสี่ ATTESA (เพลาหน้า)',
    en: 'ATTESA E-TS Front Drive',
    desc: 'ชุดแบ่งแรงบิด (Transfer) ข้างเกียร์ส่งกำลังผ่านเพลากลางไปยังเฟืองท้ายหน้าและเพลาขับล้อหน้า คอมพิวเตอร์คุมคลัตช์ไฟฟ้าว่าจะส่งแรงไปล้อหน้ามากแค่ไหน',
    facts: ['ปกติส่งแรงไปล้อหลังเกือบ 100% และส่งไปล้อหน้าได้สูงสุด 50% เมื่อล้อหลังลื่น', 'ATTESA ย่อมาจาก Advanced Total Traction Engineering System for All-Terrain'],
    build: () =>
      group(
        rbox(0.2, 0.16, 0.14, 0.03, alu(0x7d838b), 0.4, 0.32, -0.14),
        tube([[0.45, 0.28, -0.16], [1.3, 0.28, -0.16]], 0.025, castIron(), 4),
        cyl(0.09, 0.12, castIron(), 1.38, 0.3, -0.08, 'z', 24),
        tube([[1.38, 0.3, 0], [1.38, 0.305, 0.66]], 0.022, castIron(), 4),
        tube([[1.38, 0.3, -0.16], [1.38, 0.305, -0.66]], 0.022, castIron(), 4),
      ),
  },
  {
    id: 'rearDrive',
    stage: 3,
    offset: [-0.4, 0.15, 2.1],
    name: 'เพลากลางและเฟืองท้าย',
    en: 'Propeller Shaft & Rear Differential',
    desc: 'เพลากลางส่งกำลังจากเกียร์ไปยังเฟืองท้าย ซึ่งแบ่งแรงไปล้อหลังซ้าย-ขวาให้หมุนต่างกันได้ตอนเลี้ยว',
    facts: ['รุ่น V-Spec มีเฟืองท้ายแบบ Active LSD คุมด้วยคอมพิวเตอร์'],
    build: () =>
      group(
        tube([[0.15, 0.36, 0], [-1.15, 0.32, 0]], 0.03, castIron(), 4),
        cyl(0.11, 0.16, castIron(), -1.26, 0.32, 0, 'z', 28),
        tube([[-1.26, 0.32, 0.08], [-1.26, 0.305, 0.66]], 0.022, castIron(), 4),
        tube([[-1.26, 0.32, -0.08], [-1.26, 0.305, -0.66]], 0.022, castIron(), 4),
      ),
  },
  {
    id: 'exhaust',
    stage: 3,
    offset: [0, 0.1, -2.6],
    name: 'ระบบท่อไอเสีย',
    en: 'Exhaust System',
    desc: 'ท่อไอเสียต่อจากเทอร์โบ 2 ลูก ผ่านแคตาไลติกคอนเวอร์เตอร์และหม้อพักลงไปท้ายรถ',
    facts: ['รถสายแต่งมักเปลี่ยนเป็นท่อขนาดใหญ่ ไอเสียออกเร็ว เทอร์โบตอบสนองไวขึ้น'],
    build() {
      const st = heat();
      return group(
        tube([[1.4, 0.4, -0.22], [1.0, 0.22, -0.2], [0.2, 0.2, -0.22], [-1.0, 0.22, -0.3], [-1.8, 0.25, -0.4], [-2.3, 0.28, -0.45]], 0.035, st, 96),
        cyl(0.07, 0.35, st, 0.6, 0.2, -0.2, 'x'),
        rbox(0.4, 0.15, 0.32, 0.05, st, -1.95, 0.28, -0.4),
      );
    },
  },
  {
    id: 'fuelTank',
    stage: 3,
    offset: [-0.5, 0.2, 2.6],
    name: 'ถังน้ำมันเชื้อเพลิง',
    en: 'Fuel Tank',
    desc: 'ถังน้ำมันอยู่หลังเบาะหลัง เหนือเฟืองท้าย ภายในมีปั๊มน้ำมันส่งเชื้อเพลิงไปยังหัวฉีด 6 ตัว',
    facts: ['ความจุราว 65 ลิตร', 'ใช้น้ำมันเบนซินออกเทนสูง (Premium)'],
    build: () => group(rbox(0.4, 0.25, 1.0, 0.06, std({ color: 0x2b2d31, roughness: 0.8 }), -0.95, 0.42, 0)),
  },

  // ---------- ขั้นที่ 4: ชิ้นใน RB26DETT ----------
  engine({
    id: 'coils',
    explode: [0, 1.25, 0],
    name: 'คอยล์จุดระเบิด',
    en: 'Ignition Coil Packs',
    desc: 'คอยล์ 6 ตัว ตัวละสูบ วางระหว่างฝาครอบแคมสองฝั่ง ส่งไฟแรงสูงให้หัวเทียน',
    facts: ['เครื่องแรงสูงต้องการประกายไฟที่แรงพอจุดไอดีที่ถูกอัดแน่น'],
    build() {
      const g = new THREE.Group();
      for (const x of CYL_X) g.add(cyl(0.018, 0.07, blackTrim(), x, 0.74, 0));
      return g;
    },
  }),
  engine({
    id: 'camCovers',
    explode: [0, 1.0, 0],
    name: 'ฝาครอบแคมคู่',
    en: 'Twin Cam Covers',
    desc: 'ฝาครอบเพลาลูกเบี้ยวสองฝั่ง (ไอดี/ไอเสีย) ลายย่นสีแดง เป็นภาพจำของเครื่อง RB26',
    facts: ['ตัวอักษรบนฝาเขียนว่า "TWIN CAM 24 VALVE"'],
    build: () => group(rbox(0.6, 0.05, 0.08, 0.015, camRed(), ENG.x, 0.71, 0.065), rbox(0.6, 0.05, 0.08, 0.015, camRed(), ENG.x, 0.71, -0.065)),
  }),
  engine({
    id: 'camshafts',
    explode: [0, 0.78, 0],
    name: 'เพลาลูกเบี้ยวคู่ (DOHC)',
    en: 'Twin Camshafts (DOHC)',
    desc: 'เพลาลูกเบี้ยว 2 เพลา เพลาหนึ่งคุมวาล์วไอดี อีกเพลาคุมวาล์วไอเสีย รวม 24 วาล์ว (สูบละ 4)',
    facts: ['ขับด้วยสายพานราวลิ้นจากเพลาข้อเหวี่ยง'],
    build() {
      const st = alu(0xb8bec6);
      const g = new THREE.Group();
      for (const z of [0.065, -0.065]) {
        g.add(cyl(0.013, 0.62, st, ENG.x, 0.685, z, 'x', 12), cyl(0.055, 0.012, castIron(), ENG.x + 0.32, 0.685, z, 'x', 32));
        for (const x of CYL_X) for (const dx of [-0.02, 0.02]) g.add(box(0.012, 0.035, 0.03, st, x + dx, 0.69, z));
      }
      return g;
    },
  }),
  engine({
    id: 'head',
    explode: [0, 0.55, 0],
    name: 'ฝาสูบ',
    en: 'Cylinder Head',
    desc: 'ฝาสูบอะลูมิเนียมที่มีห้องเผาไหม้ วาล์ว 24 ตัว และหัวเทียน 6 หัว',
    facts: ['ใช้วาล์ว 4 ตัวต่อสูบ หายใจได้ดีที่รอบสูง'],
    build: () => group(box(0.62, 0.1, 0.24, alu(0xa8aeb6), ENG.x, 0.63, 0)),
  }),
  engine({
    id: 'intake',
    explode: [0, 0.2, 0.55],
    name: 'ท่อร่วมไอดีและลิ้นเร่ง 6 ตัว',
    en: 'Intake Plenum & 6 Throttle Bodies',
    desc: 'RB26 มีลิ้นปีกผีเสื้อแยกทุกสูบ (Individual Throttle Bodies) ทำให้เครื่องตอบสนองคันเร่งไวมาก',
    facts: ['ลิ้นเร่งแยก 6 ตัวเป็นเทคนิคที่มักพบในรถแข่ง'],
    build() {
      const pl = alu(0x8f959d);
      const g = group(rbox(0.52, 0.08, 0.1, 0.03, pl, ENG.x, 0.74, 0.25));
      for (const x of CYL_X) g.add(tube([[x, 0.72, 0.21], [x, 0.7, 0.16], [x, 0.66, 0.12]], 0.022, pl, 12), cyl(0.026, 0.03, castIron(), x, 0.7, 0.17, 'z', 16));
      return g;
    },
  }),
  engine({
    id: 'turbos',
    explode: [0, 0.25, -0.6],
    name: 'เทอร์โบคู่และท่อร่วมไอเสีย',
    en: 'Twin Turbochargers & Exhaust Manifolds',
    desc: 'ท่อร่วมไอเสียแบ่งเป็น 2 ชุด (สูบ 1–3 และ 4–6) แต่ละชุดหมุนเทอร์โบของตัวเอง ใช้แรงไอเสียปั่นใบพัดอัดอากาศเข้าเครื่อง',
    facts: ['เทอร์โบลูกเล็ก 2 ลูกตอบสนองไวกว่าเทอร์โบลูกใหญ่ลูกเดียว', 'R34 ใช้เทอร์โบแบบลูกปืนเซรามิก หมุนได้ราวแสนรอบต่อนาที'],
    build() {
      const st = heat();
      const g = new THREE.Group();
      CYL_X.forEach((x, i) => {
        const tx = i < 3 ? ENG.x + 0.15 : ENG.x - 0.12;
        g.add(tube([[x, 0.62, -0.12], [x, 0.58, -0.18], [tx, 0.52, -0.24]], 0.018, st, 12));
      });
      for (const tx of [ENG.x + 0.15, ENG.x - 0.12]) {
        const snail = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.03, 12, 24), st);
        snail.position.set(tx, 0.5, -0.27);
        g.add(snail, cyl(0.05, 0.08, alu(0xb0b6be), tx, 0.5, -0.27, 'z', 24));
      }
      return g;
    },
  }),
  engine({
    id: 'block',
    explode: [0, 0, 0],
    name: 'เสื้อสูบ',
    en: 'Engine Block',
    desc: 'เสื้อสูบเหล็กหล่อ 6 สูบเรียง แข็งแรงมาก จึงเป็นที่นิยมของสายโมดิฟายที่ทำแรงม้าได้หลายร้อยตัว',
    facts: ['ความจุ 2,568 ซีซี', 'กระบอกสูบ 86 มม. × ช่วงชัก 73.7 มม.'],
    build: () => group(rbox(0.62, 0.26, 0.22, 0.02, castIron(), ENG.x, 0.45, 0)),
  }),
  engine({
    id: 'pistons',
    explode: [0, 0.32, 0],
    name: 'ลูกสูบและก้านสูบ',
    en: 'Pistons & Connecting Rods',
    desc: 'ลูกสูบ 6 ลูกถูกแรงระเบิดดันลง ก้านสูบส่งแรงไปหมุนเพลาข้อเหวี่ยง ลำดับจุดระเบิด 1-5-3-6-2-4 ทำให้เครื่องเดินนุ่ม',
    facts: ['เครื่อง 6 สูบเรียงสมดุลตามธรรมชาติ สั่นน้อยมาก', 'ช่วงชักสั้นทำให้ลากรอบสูงได้ดี'],
    build() {
      const g = new THREE.Group();
      for (const x of CYL_X) {
        g.add(cyl(0.042, 0.05, alu(0xc4c9cf), x, 0.54, 0, 'y', 24));
        g.add(box(0.018, 0.13, 0.02, castIron(), x, 0.45, 0));
      }
      return g;
    },
  }),
  engine({
    id: 'crankshaft',
    explode: [0, -0.25, 0],
    name: 'เพลาข้อเหวี่ยง',
    en: 'Crankshaft',
    desc: 'เพลาข้อเหวี่ยงเหล็กกล้าหลอมขึ้นรูป เปลี่ยนการขึ้นลงของลูกสูบ 6 ลูกเป็นการหมุน ส่งต่อไปยังคลัตช์และเกียร์',
    facts: ['แรงบิดสูงสุดราว 392 นิวตันเมตรที่ 4,400 รอบ/นาที', 'มีแบริ่งหลัก 7 ตัว แข็งแรงมาก'],
    build() {
      const st = alu(0x9ea4ab);
      const g = group(cyl(0.022, 0.66, st, ENG.x, 0.36, 0, 'x', 16), cyl(0.08, 0.03, castIron(), ENG.x + 0.35, 0.36, 0, 'x', 32));
      for (const x of CYL_X) for (const dx of [-0.025, 0.025]) g.add(box(0.02, 0.06, 0.07, castIron(), x + dx, 0.345, 0));
      return g;
    },
  }),
  engine({
    id: 'oilPan',
    explode: [0, -0.48, 0],
    name: 'อ่างน้ำมันเครื่อง',
    en: 'Oil Pan',
    desc: 'ถาดเก็บน้ำมันเครื่องใต้เครื่องยนต์ ปั๊มจะดูดน้ำมันขึ้นไปหล่อลื่นและระบายความร้อนให้ชิ้นส่วนภายใน',
    facts: ['บรรจุน้ำมันเครื่องราว 5 ลิตร'],
    build: () => group(rbox(0.56, 0.08, 0.22, 0.02, alu(0x6f757d), ENG.x - 0.02, 0.28, 0)),
  }),
  engine({
    id: 'timingCover',
    explode: [0.5, 0.05, 0],
    name: 'ฝาครอบสายพานราวลิ้น',
    en: 'Timing Belt Cover',
    desc: 'ครอบสายพานราวลิ้นด้านหน้าเครื่อง ซึ่งเชื่อมเพลาข้อเหวี่ยงกับเพลาลูกเบี้ยวทั้งสองให้หมุนตรงจังหวะ',
    facts: ['RB26 ใช้สายพานราวลิ้น ควรเปลี่ยนตามระยะราว 100,000 กม.'],
    build: () => group(box(0.03, 0.42, 0.24, blackTrim(), ENG.x + 0.33, 0.52, 0)),
  }),
];

const model = {
  id: 'car',
  title: 'Nissan Skyline GT-R R34',
  floorY: -0.025,
  camera: {
    dir: [1.0, 0.42, 1.25],
    radius: [7.2, 12, 13, 14, 5.2, 14, 16],
    target: [0, 0.55, 0],
    targetEnd: [0.5, 0.9, 0],
    // ขั้นที่ 4 กล้องเลื่อนไปดูเครื่องยนต์ที่ถูกยกออกมาด้านหน้ารถ
    targets: [[0, 0.55, 0], [0, 0.9, 0], [0, 1.0, 0], [0.8, 0.9, 0], [4.1, 1.85, -0.3], [0, 0.6, 0], [0.6, 1.0, 0]],
  },
  credit:
    'โมเดล 3D: <a href="https://sketchfab.com/3d-models/brians-r34-from-2-fast-2-furious-c424e4f18c9742d296920f069d139b45" target="_blank" rel="noopener">Brian\'s R34 from 2 Fast 2 Furious</a> โดย DRIVER-FIRE ' +
    '(ต้นแบบโดย ddiaz-design) · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · ชิ้นในเครื่องยนต์และระบบขับเคลื่อนสร้างเพิ่ม',
  stages,
  parts: [],

  async prepare(onProgress) {
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(MODEL_URL, (e) => e.total && onProgress(e.loaded / e.total));
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const fromModel = MODEL_PARTS.map((def) => {
      const obj = scene.getObjectByName(def.id);
      if (!obj) console.warn('ไม่พบชิ้น', def.id);
      return {
        ...def,
        build() {
          const g = new THREE.Group();
          if (obj) {
            // แยกวัสดุของแต่ละชิ้น ไฮไลต์/ทำให้จางได้โดยไม่กระทบชิ้นอื่น
            obj.traverse((o) => {
              if (o.isMesh) {
                o.material = o.material.clone();
                o.material.side = THREE.DoubleSide;
              }
            });
            g.add(obj);
          }
          return g;
        },
      };
    });
    this.parts = [...fromModel, ...CODE_PARTS];
  },
};

// รถคันใหญ่: ชิ้นที่สร้างเองใช้ offset ตามสเกลเดียวกับชิ้นจากโมเดลแล้ว
export default model;
