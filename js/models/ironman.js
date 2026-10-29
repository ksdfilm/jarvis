// Iron Man Mark V (ชุดกระเป๋าเดินทางจาก Iron Man 2) — เกราะจากโมเดลจริง (Sketchfab, CC BY)
// ระบบภายใน (Arc Reactor, รีพัลเซอร์, HUD, โครงเสริมกำลัง) สร้างจากโค้ดตามที่เห็นในภาพยนตร์
// ไฟล์โมเดลแปลงด้วย tools/build-mk5.mjs  พิกัดเมตร: สูง 1.85 ม., หันหน้าไป +z, ขวาของผู้สวม = -x
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { M, std, cyl, group } from './kit.js';

const MODEL_URL = new URL('../../models/ironman/mark5.glb', import.meta.url).href;

// ขวาของผู้สวมอยู่ทาง -x (คนดูมองจากด้านหน้าจะเห็นอยู่ทางซ้าย)
const SIDE = { r: ['ขวา', 'Right', -1], l: ['ซ้าย', 'Left', 1] };
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
      offset: def.offset(s),
      build: def.build ? () => def.build(s) : undefined,
    };
  });
}

const glow = (c, i = 3) => M.glow(c, i);
const REACTOR = 0xbfe9ff;
const servo = () => std({ color: 0x8d949d, metalness: 0.85, roughness: 0.3 });
const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8), mat);
// จุดข้อต่อในชุด (ใช้วางโครงเสริมกำลัง รีพัลเซอร์ และไอพ่น) กึ่งกลางลำตัวอยู่ที่ z ≈ 0.08 ตามเกราะ
const Z = 0.08;
const J = {
  shoulder: (s) => [s * 0.19, 1.43, Z],
  elbow: (s) => [s * 0.3, 1.17, Z],
  hand: (s) => [s * 0.36, 0.93, Z + 0.05],
  hip: (s) => [s * 0.1, 0.94, Z],
  knee: (s) => [s * 0.12, 0.5, Z],
  ankle: (s) => [s * 0.14, 0.09, Z],
};

const stages = [
  {
    title: 'Iron Man Mark V',
    en: 'Iron Man 2 (2010) · Suitcase Armor',
    text: 'ชุดเกราะ Mark V ของโทนี่ สตาร์ค พับเก็บเป็นกระเป๋าเดินทางได้ ปรากฏในฉากสนามแข่งรถโมนาโกในภาพยนตร์ Iron Man 2 เลื่อนลงเพื่อถอดเกราะทีละส่วน',
  },
  {
    title: 'หมวกและหน้ากาก',
    en: 'Helmet & Faceplate',
    text: 'หมวกเกราะปกป้องศีรษะ หน้ากากด้านหน้าเปิด-ปิดได้ ภายในมีจอแสดงผล HUD ที่ผู้สวมใช้สั่งงานชุด',
  },
  {
    title: 'เกราะลำตัว',
    en: 'Torso Armor',
    text: 'เกราะอก หลัง ท้อง เอว และไหล่ ปกป้องอวัยวะสำคัญ ตรงกลางอกมีช่องเปิดให้แสงของ Arc Reactor ส่องออกมา',
  },
  {
    title: 'เกราะแขน',
    en: 'Arm Armor',
    text: 'เกราะแขนท่อนบน ท่อนล่าง และถุงมือ ข้อต่อแยกเป็นหลายชิ้นเพื่อให้ขยับได้คล่อง ฝ่ามือมีรีพัลเซอร์',
  },
  {
    title: 'เกราะขา',
    en: 'Leg Armor',
    text: 'เกราะต้นขา หน้าแข้ง และรองเท้าเกราะ รับน้ำหนักทั้งชุดและแรงกระแทกเวลาลงพื้น',
  },
  {
    title: 'ระบบภายใน',
    en: 'Internal Systems',
    text: 'ใต้เกราะคือระบบที่ทำให้ชุดทำงาน (ตามเรื่องในภาพยนตร์): แหล่งพลังงาน Arc Reactor รีพัลเซอร์ จอ HUD และโครงเสริมกำลัง',
  },
  {
    title: 'ภาพรวมทุกชิ้น',
    en: 'All Parts',
    text: 'ถอดครบทุกชิ้นแล้ว คลิกชิ้นไหนก็ได้เพื่อซูมดูและอ่านรายละเอียด หรือเลื่อนกลับขึ้นไปเพื่อสวมชุดคืน',
  },
];

// ---------- เกราะจากโมเดลจริง ----------
const ARMOR = [
  { id: 'helmet', stage: 1, offset: [0, 0.6, -0.1], name: 'หมวกเกราะ', en: 'Helmet', desc: 'หมวกเกราะโลหะครอบศีรษะทั้งหมด ภายในมีจอ HUD ระบบสื่อสาร และเชื่อมต่อกับ JARVIS ผู้ช่วยปัญญาประดิษฐ์ของโทนี่', facts: ['ในภาพยนตร์ หน้ากากเปิดขึ้นได้โดยไม่ต้องถอดหมวก', 'ช่องตาเรืองแสงสีฟ้าขาวเป็นเอกลักษณ์ของชุด Iron Man'] },
  { id: 'faceplate', stage: 1, offset: [0, 0.45, 0.5], name: 'หน้ากาก', en: 'Faceplate', desc: 'แผ่นหน้ากากสีเงินที่มีช่องตาเรืองแสง ยกขึ้นเพื่อเผยใบหน้าผู้สวมได้', facts: ['Mark V เป็นชุดเดียวในยุคแรกที่หน้ากากเป็นสีเงินทั้งแผ่น'] },
  { id: 'collar', stage: 1, offset: [0, 0.3, 0.25], name: 'เกราะคอ', en: 'Neck Collar', desc: 'แผ่นเกราะซ้อนกันรอบคอ ให้ก้มเงยและหันศีรษะได้ในขณะที่ยังปกป้องลำคอ', facts: ['แผ่นซ้อนแบบเกล็ดช่วยให้ข้อต่อขยับได้โดยไม่เปิดช่องโหว่'] },
  { id: 'chestPlate', stage: 2, offset: [0, 0.1, 0.65], name: 'เกราะอก', en: 'Chest Plate', desc: 'เกราะอกด้านหน้าที่มีช่องวงกลมตรงกลางให้ Arc Reactor ส่องผ่าน เป็นจุดที่แข็งแรงที่สุดของชุด', facts: ['Mark V เป็นชุดน้ำหนักเบา เกราะจึงบางกว่าชุดรบรุ่นอื่น'] },
  { id: 'backPlate', stage: 2, offset: [0, 0.1, -0.65], name: 'เกราะหลัง', en: 'Back Plate', desc: 'เกราะด้านหลังปกป้องกระดูกสันหลัง และเป็นจุดยึดของโครงเสริมกำลัง', facts: ['เวลาพับเป็นกระเป๋า เกราะหลังจะเป็นส่วนหนึ่งของตัวกระเป๋า'] },
  { id: 'abdomen', stage: 2, offset: [0, 0, 0.55], name: 'เกราะท้อง', en: 'Abdominal Plates', desc: 'แผ่นเกราะซ้อนกันเป็นปล้องที่หน้าท้อง ให้ผู้สวมก้มและบิดตัวได้', facts: ['ออกแบบคล้ายเกราะของกุ้งหรือแมลง ที่ซ้อนกันเป็นปล้อง'] },
  { id: 'pelvis', stage: 2, offset: [0, -0.1, 0.5], name: 'เกราะเอวและสะโพก', en: 'Waist & Hip Armor', desc: 'เกราะรอบเอวและสะโพก เชื่อมเกราะลำตัวเข้ากับเกราะขา', facts: ['ข้อต่อสะโพกต้องขยับได้หลายทิศทางทั้งเดิน วิ่ง และนั่ง'] },
  ...pair('shoulder', { stage: 2, offset: (s) => [s * 0.45, 0.28, 0], name: 'เกราะไหล่', en: 'Shoulder Pauldron', desc: 'เกราะไหล่ทรงโค้งสีแดง ซ้อนเป็นชั้นเพื่อให้ยกแขนได้สูง', facts: ['ไหล่เป็นข้อต่อที่ขยับได้กว้างที่สุด จึงออกแบบเกราะยากที่สุด'] }),
  ...pair('upperArm', { stage: 3, offset: (s) => [s * 0.55, 0.15, 0], name: 'เกราะแขนท่อนบน', en: 'Upper Arm Armor', desc: 'เกราะหุ้มต้นแขนระหว่างไหล่กับข้อศอก', facts: ['แยกเป็นชิ้นหน้า-หลังเพื่อให้สวมเข้าได้ง่าย'] }),
  ...pair('forearm', { stage: 3, offset: (s) => [s * 0.65, 0, 0.12], name: 'เกราะแขนท่อนล่าง', en: 'Forearm Armor', desc: 'เกราะหุ้มแขนท่อนล่าง ภายในมีสายพลังงานส่งไปยังรีพัลเซอร์ที่ฝ่ามือ', facts: ['ในหนังหลายภาค เกราะแขนท่อนล่างซ่อนอาวุธเพิ่มเติมไว้ด้วย'] }),
  ...pair('gauntlet', { stage: 3, offset: (s) => [s * 0.75, -0.1, 0.3], name: 'ถุงมือเกราะ', en: 'Gauntlet', desc: 'ถุงมือเกราะที่นิ้วแยกเป็นข้อเล็กๆ ขยับได้เหมือนมือจริง กลางฝ่ามือมีรีพัลเซอร์', facts: ['ฉากเด่นในหนังคือตอนสวมถุงมือแล้วยกมือยิงรีพัลเซอร์'] }),
  ...pair('thigh', { stage: 4, offset: (s) => [s * 0.38, 0, 0.35], name: 'เกราะต้นขา', en: 'Thigh Armor', desc: 'เกราะหุ้มต้นขา ปกป้องกล้ามเนื้อขาและเส้นเลือดใหญ่', facts: ['ต้องรับน้ำหนักลำตัวและเกราะส่วนบนทั้งหมด'] }),
  ...pair('shin', { stage: 4, offset: (s) => [s * 0.42, -0.05, 0.45], name: 'เกราะหน้าแข้งและเข่า', en: 'Knee & Shin Armor', desc: 'เกราะหัวเข่าและหน้าแข้ง สนับเข่าเป็นชิ้นแยกให้งอเข่าได้เต็มที่', facts: ['เข่าเป็นจุดที่รับแรงกระแทกมากที่สุดเวลากระโดดลงพื้น'] }),
  ...pair('boot', { stage: 4, offset: (s) => [s * 0.45, 0, 0.6], name: 'รองเท้าเกราะ', en: 'Armored Boot', desc: 'รองเท้าเกราะที่ส้นและฝ่าเท้าเป็นที่ตั้งของไอพ่นขับดัน (Boot thruster)', facts: ['รองเท้ามีรายละเอียดมากที่สุดในโมเดลนี้ (ราว 40,000 เหลี่ยมต่อข้าง)'] }),
];

// ---------- ระบบภายใน (สร้างจากโค้ด) ----------
const INTERNAL = [
  {
    id: 'arcReactor',
    stage: 5,
    offset: [0, 0.05, 0.85],
    name: 'เตาปฏิกรณ์ Arc Reactor',
    en: 'Arc Reactor',
    desc: 'แหล่งพลังงานของชุด (ในภาพยนตร์) ฝังอยู่กลางอกโทนี่ ส่องแสงสีฟ้าขาว จ่ายพลังงานให้ทุกระบบในเกราะ',
    facts: ['ใน Iron Man 2 แกนพาลาเดียมของ Arc Reactor ทำให้โทนี่ป่วยจากพิษโลหะ', 'เป็นเทคโนโลยีในจินตนาการ ไม่มีอยู่จริง'],
    build() {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.012, 12, 40), servo());
      const core = cyl(0.03, 0.02, glow(REACTOR, 4), 0, 0, 0, 'z', 32);
      g.add(ring, core);
      for (let i = 0; i < 10; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.012), glow(REACTOR, 2.5));
        const a = (i / 10) * Math.PI * 2;
        seg.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0.006);
        seg.rotation.z = a;
        g.add(seg);
      }
      g.position.set(0, 1.44, 0.22);
      return group(g);
    },
  },
  {
    id: 'hud',
    stage: 5,
    offset: [0, 0.3, 0.55],
    name: 'จอแสดงผล HUD',
    en: 'Heads-Up Display',
    desc: 'จอโปร่งใสโค้งรอบดวงตาภายในหมวก แสดงข้อมูลเป้าหมาย สถานะพลังงาน และให้ JARVIS สื่อสารกับผู้สวม',
    facts: ['HUD ย่อมาจาก Heads-Up Display ใช้จริงในเครื่องบินขับไล่และรถยนต์บางรุ่น', 'เวอร์ชันในหนังเป็นจินตนาการที่ล้ำกว่าของจริงมาก'],
    build() {
      const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.07, 32, 1, true, -0.9, 1.8);
      const mat = std({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      mat.userData.glow = true;
      const screen = new THREE.Mesh(geo, mat);
      screen.position.set(0, 1.68, 0);
      return group(screen);
    },
  },
  ...pair('repulsor', {
    stage: 5,
    offset: (s) => [s * 0.35, 0, 0.45],
    name: 'รีพัลเซอร์ฝ่ามือ',
    en: 'Palm Repulsor',
    desc: 'อุปกรณ์ปล่อยลำพลังงานกลางฝ่ามือ (ในภาพยนตร์) ใช้ทั้งเป็นอาวุธและช่วยทรงตัวขณะบิน',
    facts: ['ยิงได้เมื่อผู้สวมกางฝ่ามือออก', 'เป็นเทคโนโลยีในจินตนาการ'],
    build: (s) => group(cyl(0.028, 0.012, glow(REACTOR, 3.5), J.hand(s)[0], J.hand(s)[1] - 0.02, 0.02, 'x', 24), cyl(0.036, 0.008, servo(), J.hand(s)[0] - s * 0.006, J.hand(s)[1] - 0.02, 0.02, 'x', 24)),
  }),
  ...pair('thruster', {
    stage: 5,
    offset: (s) => [s * 0.3, -0.02, 0.6],
    name: 'ไอพ่นรองเท้า',
    en: 'Boot Thruster',
    desc: 'ไอพ่นใต้ฝ่าเท้า (ในภาพยนตร์) ให้แรงยกหลักเวลาบิน ทำงานร่วมกับรีพัลเซอร์ที่มือเพื่อทรงตัว',
    facts: ['ชุด Mark V เน้นพกพาสะดวก ในหนังแทบไม่ได้ใช้บินเลย'],
    build: (s) => group(cyl(0.035, 0.025, servo(), J.ankle(s)[0], 0.02, 0.02, 'y', 24), cyl(0.024, 0.01, glow(0x93c5fd, 3), J.ankle(s)[0], 0.004, 0.02, 'y', 24)),
  }),
  {
    id: 'exoFrame',
    stage: 5,
    offset: [0, 0, -0.55],
    name: 'โครงเสริมกำลัง',
    en: 'Power Exoskeleton',
    desc: 'โครงโลหะพร้อมมอเตอร์ข้อต่อตามแนวกระดูกสันหลังและแขนขา ช่วยแบกน้ำหนักเกราะและเพิ่มกำลังให้ผู้สวม',
    facts: ['ชุดเสริมกำลัง (Exoskeleton) มีใช้จริงแล้วในโรงงานและการกายภาพบำบัด', 'แต่ไม่มีรุ่นไหนเบาและแรงเท่าในหนัง'],
    build() {
      const st = servo();
      const g = new THREE.Group();
      g.add(tube([[0, 1.5, Z - 0.08], [0, 1.25, Z - 0.09], [0, 1.0, Z - 0.08]], 0.012, st));
      for (const s of [-1, 1]) {
        const [sh, el, ha, hi, kn, an] = [J.shoulder(s), J.elbow(s), J.hand(s), J.hip(s), J.knee(s), J.ankle(s)];
        g.add(tube([[0, 1.45, Z - 0.08], [sh[0], sh[1], Z - 0.03]], 0.01, st));
        g.add(tube([sh, el, ha].map((p) => [p[0] + s * 0.02, p[1], p[2] - 0.02]), 0.008, st));
        g.add(tube([[0, 1.0, Z - 0.08], [hi[0], hi[1], Z - 0.04]], 0.01, st));
        g.add(tube([hi, kn, an].map((p) => [p[0] + s * 0.03, p[1], p[2] - 0.03]), 0.009, st));
        for (const p of [sh, el, hi, kn]) g.add(cyl(0.018, 0.02, M.alu(0x6b7280), p[0] + s * 0.03, p[1], p[2] - 0.02, 'x', 16));
      }
      return g;
    },
  },
];

// ปรับวัสดุจากไฟล์ (ต้นฉบับด้านเกินไป) ให้เป็นเงินโครเมียม แดงเมทัลลิก และไฟเรืองแสง
function restyle(mat) {
  const m = mat.clone();
  if (m.name === 'Gray') {
    Object.assign(m, { metalness: 0.55, roughness: 0.28 });
    m.color.setHex(0xdfe3e9);
  } else if (m.name === 'Lights') {
    m.color.setHex(0xe0f4ff);
    m.emissive.setHex(0xbfe9ff);
    m.emissiveIntensity = 3;
    m.userData.glow = true;
  } else {
    Object.assign(m, { metalness: 0.75, roughness: 0.3 });
    m.color.setHex(0x9b1a14);
  }
  m.side = THREE.DoubleSide;
  return m;
}

export default {
  id: 'ironman',
  title: 'Iron Man Mark V',
  floorY: -0.01,
  camera: {
    dir: [-0.75, 0.2, 1], // มองเฉียงให้เห็นเกราะอก-หลังที่แยกออกในแนวหน้า-หลัง
    radius: [3.6, 3.9, 4.2, 4.6, 4.6, 4.2, 5],
    target: [0, 0.95, 0],
    targetEnd: [0, 0.95, 0.2],
  },
  credit:
    'โมเดล 3D: <a href="https://sketchfab.com/3d-models/iron-man-mark-v-rig-low-poly-ea6f480ebb0f42d58b34ea1913c457e0" target="_blank" rel="noopener">Iron Man - Mark V Rig</a> โดย WonderStark (nonamejarvis) · ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · Iron Man เป็นตัวละครของ Marvel · ระบบภายในสร้างเพิ่มเพื่อการเรียนรู้',
  stages,
  parts: [],

  async prepare(onProgress) {
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(MODEL_URL, (e) => e.total && onProgress(e.loaded / e.total));
    const scene = gltf.scene;
    const armor = ARMOR.map((def) => {
      const obj = scene.getObjectByName(def.id);
      if (!obj) console.warn('ไม่พบชิ้น', def.id);
      return {
        ...def,
        build() {
          const g = new THREE.Group();
          if (obj) {
            obj.traverse((o) => o.isMesh && (o.material = restyle(o.material)));
            g.add(obj);
          }
          return g;
        },
      };
    });
    this.parts = [...armor, ...INTERNAL];

  },
};
