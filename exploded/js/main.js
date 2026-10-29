import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const $ = (s) => document.querySelector(s);

// หัวข้อมาจาก ?topic=... เพิ่มหัวข้อใหม่ได้โดยสร้างไฟล์ใน models/ ที่มีโครงสร้างเดียวกับ pc.js
const TOPICS = ['pc', 'human', 'printer', 'car', 'ironman', 'planets'];
const topic = TOPICS.find((t) => t === new URLSearchParams(location.search).get('topic')) ?? 'pc';
const model = (await import(`./models/${topic}.js`)).default;
document.querySelectorAll('.tab[data-topic]').forEach((a) => a.classList.toggle('active', a.dataset.topic === topic));

// ฝังในแอป EDIT HUD (?embed=1): ซ่อนชื่อเว็บ, ลิงก์แท็บคงโหมดฝังไว้ และหยุดวาดเมื่อแอปแม่ซ่อนแผงนี้ (ประหยัดแบต)
const EMBED = new URLSearchParams(location.search).has('embed');
let hiddenByHost = false;
if (EMBED) {
  document.body.classList.add('embed');
  document.querySelectorAll('.tab[data-topic]').forEach((a) => { a.href = `?topic=${a.dataset.topic}&embed=1`; });
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || typeof e.data?.hudVisible !== 'boolean') return;
    const wasHidden = hiddenByHost;
    hiddenByHost = !e.data.hudVisible;
    if (wasHidden && !hiddenByHost) {
      try { clock.getDelta(); } catch { return; } // ยังโหลดไม่เสร็จ: ลูปจะเริ่มเองตอนโหลดเสร็จ
      requestAnimationFrame(frame);
    }
  });
}
document.title = `${model.title} — Exploded View`;
if (model.prepare) {
  const msg = $('#loader p');
  await model.prepare((f) => (msg.textContent = `กำลังโหลดโมเดล… ${Math.round(f * 100)}%`));
}
// แถบเลือกย่อยในหัวข้อ (เช่น เลือกดาวแต่ละดวง)
if (model.picker) {
  const nav = document.createElement('nav');
  nav.className = 'picker';
  nav.setAttribute('aria-label', 'เลือก');
  for (const item of model.picker) {
    const a = document.createElement('a');
    a.className = 'pick' + (item.active ? ' active' : '');
    a.href = item.href;
    a.textContent = item.label;
    nav.appendChild(a);
  }
  document.body.appendChild(nav);
  document.body.classList.add('has-picker');
  nav.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
if (model.credit) {
  $('#credit').innerHTML = model.credit;
  $('#credit').hidden = false;
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAST = model.stages.length - 1;

// ---------- ฉาก ----------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100); // near เล็กเพื่อซูมชิ้นเล็กๆ ได้ใกล้
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(-3, 5, 4);
const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.2);
rimLight.position.set(4, 2, -4);
scene.add(keyLight, rimLight, new THREE.AmbientLight(0xffffff, 0.15));

const root = new THREE.Group();
scene.add(root);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(56,189,248,0.32)');
  grd.addColorStop(1, 'rgba(56,189,248,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = model.floorY ?? -1.08;
root.add(floor);

// ---------- ชิ้นส่วน ----------
const stageCount = {};
const parts = model.parts.map((def, index) => {
  const group = def.build();
  const materials = new Set();
  group.traverse((o) => {
    o.userData.partIndex = index;
    if (o.isMesh) materials.add(o.material);
  });
  materials.forEach((m) => {
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseOpacity = m.opacity;
    m.userData.baseTransparent = m.transparent;
    m.userData.baseDepthWrite = m.depthWrite;
  });
  const anchor = new THREE.Object3D();
  new THREE.Box3().setFromObject(group).getCenter(anchor.position);
  group.add(anchor);
  root.add(group);
  // moves: เคลื่อนที่หลายขั้นต่อกันได้ เช่น [{ stage: 3, offset }, { stage: 4, offset }]
  // ถ้าไม่กำหนด ใช้ stage + offset ปกติ ส่วน p.stage คือขั้นสุดท้ายที่ชิ้นนี้ถูกแยกออก
  const moves = (def.moves ?? [{ stage: def.stage, offset: def.offset }]).map((m) => ({ stage: m.stage, offset: new THREE.Vector3(...m.offset) }));
  const stage = def.stage ?? moves[moves.length - 1].stage;
  const order = (stageCount[stage] = (stageCount[stage] ?? -1) + 1);
  return {
    ...def,
    stage,
    index,
    group,
    anchor,
    materials: [...materials],
    moves,
    order,
    amount: 0,
  };
});
// ชิ้นในขั้นเดียวกันออกตัวไม่พร้อมกันเล็กน้อย (รวมไม่เกิน 0.25 ของช่วงเลื่อน)
for (const p of parts) p.delay = (p.order / Math.max(1, stageCount[p.stage])) * 0.25;

const spinners = [];
root.traverse((o) => o.userData.spin && spinners.push(o));

// ---------- กล้องและการหมุน ----------
const controls = new OrbitControls(camera, canvas);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = 1.85;
canvas.style.touchAction = 'pan-y'; // ปัดขึ้นลงเพื่อเลื่อนหน้า ปัดซ้ายขวาเพื่อหมุน

const cam = model.camera;
const camDir = new THREE.Vector3(...cam.dir).normalize();
const targetA = new THREE.Vector3(...cam.target);
const targetB = new THREE.Vector3(...cam.targetEnd);
let fitScale = 1;
let viewShiftX = 0;
let viewShiftY = 0;
controls.target.copy(targetA);
camera.position.copy(targetA).addScaledVector(camDir, cam.radius[0]);

// radius: [เริ่ม, จบ] หรือกำหนดทีละขั้น (จำนวนเท่ากับ stages)
function radiusAt(t) {
  const r = cam.radius;
  if (r.length !== model.stages.length) return lerp(r[0], r[r.length - 1], t);
  const i = Math.min(Math.floor(prog), r.length - 2);
  return lerp(r[i], r[i + 1], ease(clamp(prog - i)));
}

// targets: จุดที่กล้องมองทีละขั้น (พิกัดของโมเดล) ถ้าไม่กำหนดใช้ target → targetEnd
const stageTargets = cam.targets?.map((v) => new THREE.Vector3(...v));
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function targetAt(t, out) {
  if (!stageTargets) return out.lerpVectors(targetA, targetB, t);
  const i = Math.min(Math.floor(prog), stageTargets.length - 2);
  out.lerpVectors(stageTargets[i], stageTargets[i + 1], ease(clamp(prog - i)));
  return out.applyAxisAngle(Y_AXIS, -0.25 * t); // ตามการหมุนของโมเดล (root.rotation.y)
}

// ซูมชิ้นส่วน: เมื่อเลือกชิ้นไหน กล้องจะบินไปหาชิ้นนั้น (focusDist = ระยะที่เห็นทั้งชิ้นพอดี)
let focusDist = 1;
let zoomFactor = 1;
let curRadius = null;
let appliedRadius = null;
const curTarget = targetA.clone();
const tmpTarget = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();
function frameCamera(dt) {
  const t = ease(clamp(prog / (LAST - 0.5)));
  // ผู้ใช้หมุนลูกกลิ้ง/ถ่างนิ้ว (OrbitControls เปลี่ยนระยะกล้อง) ระหว่างซูมชิ้นส่วน
  const actual = camera.position.distanceTo(controls.target);
  if (selected && appliedRadius && Math.abs(actual - appliedRadius) > 1e-5) {
    zoomFactor = clamp(zoomFactor * (actual / appliedRadius), 0.2, 4);
    curRadius = actual;
  }
  let wantRadius;
  if (selected) {
    selected.anchor.getWorldPosition(tmpTarget);
    wantRadius = focusDist * zoomFactor;
  } else {
    targetAt(t, tmpTarget);
    wantRadius = radiusAt(t) * fitScale;
  }
  const k = reduceMotion ? 1 : 1 - Math.pow(0.004, dt);
  curRadius = curRadius === null ? wantRadius : lerp(curRadius, wantRadius, k);
  curTarget.lerp(tmpTarget, k);

  tmpDelta.subVectors(curTarget, controls.target);
  camera.position.add(tmpDelta);
  controls.target.copy(curTarget);
  tmpDelta.subVectors(camera.position, controls.target).setLength(curRadius);
  camera.position.copy(controls.target).add(tmpDelta);
  appliedRadius = curRadius;
  root.rotation.y = -0.25 * t;
}

const sphere = new THREE.Sphere();
function focusOn(p) {
  controls.enableZoom = !!p; // ลูกกลิ้งซูมได้เฉพาะตอนเลือกชิ้นส่วน (ปกติใช้เลื่อนหน้า)
  canvas.style.touchAction = p ? 'none' : 'pan-y'; // มือถือ: ถ่างนิ้วซูมได้ตอนเลือกชิ้นส่วน
  if (!p) return;
  new THREE.Box3().setFromObject(p.group).getBoundingSphere(sphere);
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  focusDist = Math.max((sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.35, 0.15);
  zoomFactor = 1;
}
function zoomBy(f) {
  if (selected) zoomFactor = clamp(zoomFactor * f, 0.2, 4);
}

function resetView() {
  const r = camera.position.distanceTo(controls.target);
  camera.position.copy(controls.target).addScaledVector(camDir, r);
}

// ---------- การ์ดแต่ละขั้น ----------
const steps = $('#steps');
const dots = $('#dots');
const stageTitle = (s) => (s === 0 ? 'โครงสร้าง' : model.stages[s].title);

model.stages.forEach((s, i) => {
  const sec = document.createElement('section');
  sec.className = 'step';
  const card = document.createElement('div');
  card.className = 'card';
  const eyebrow = i === 0 ? 'เริ่มต้น' : i === LAST ? 'สรุป' : `ขั้นที่ ${i} / ${LAST - 1}`;
  card.innerHTML = `<div class="eyebrow">${eyebrow}</div><h2>${s.title}</h2><div class="en">${s.en}</div><p>${s.text}</p>`;

  if (i === 0) {
    card.insertAdjacentHTML(
      'beforeend',
      `<ul class="howto">
        <li><kbd>เลื่อน</kbd> แยกชิ้นส่วนทีละชั้น</li>
        <li><kbd>ลาก</kbd> หมุนดูรอบๆ</li>
        <li><kbd>คลิก</kbd> ซูมเข้าไปดูชิ้นส่วนและอ่านข้อมูล</li>
      </ul>
      <div class="scroll-cue"><span></span>เลื่อนลง</div>`,
    );
  } else {
    const chips = document.createElement('div');
    chips.className = 'chips';
    const labelled = parts.filter((p) => !p.noLabel);
    const list = i === LAST ? labelled : labelled.filter((p) => p.stage === i);
    if (i === LAST && list.length > 30) {
      // ชิ้นส่วนเยอะเกินไป: แสดงเป็นทางลัดไปแต่ละขั้นแทน
      model.stages.slice(1, LAST).forEach((st, k) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.type = 'button';
        b.textContent = `${st.title} · ${labelled.filter((p) => p.stage === k + 1).length}`;
        b.addEventListener('click', () => scrollTo({ top: steps.children[k + 1].offsetTop, behavior: 'smooth' }));
        chips.appendChild(b);
      });
    } else {
      for (const p of list) {
        const b = document.createElement('button');
        b.className = 'chip';
        b.type = 'button';
        b.textContent = p.short ?? p.name;
        b.addEventListener('click', () => select(p));
        chips.appendChild(b);
      }
    }
    card.appendChild(chips);
  }
  if (i === LAST) {
    const back = document.createElement('button');
    back.className = 'btn back';
    back.type = 'button';
    back.textContent = 'ประกอบกลับ ↑';
    back.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    card.appendChild(back);
  }
  sec.appendChild(card);
  steps.appendChild(sec);

  const dot = document.createElement('button');
  dot.type = 'button';
  dot.dataset.label = s.title;
  dot.setAttribute('aria-label', s.title);
  dot.addEventListener('click', () => scrollTo({ top: sec.offsetTop, behavior: 'smooth' }));
  dots.appendChild(dot);
});

// ---------- ป้ายชื่อ ----------
const labelLayer = $('#labels');
const svg = $('#lines');
const NS = 'http://www.w3.org/2000/svg';
for (const p of parts) {
  const tag = document.createElement('button');
  tag.className = 'tag';
  tag.type = 'button';
  tag.innerHTML = `<b>${p.short ?? p.name}</b><span>${p.short ? p.en.replace(/ \((Right|Left)\)$/, '') : p.en}</span>`;
  tag.addEventListener('click', () => select(p));
  tag.addEventListener('pointerenter', () => setHover(p));
  tag.addEventListener('pointerleave', () => setHover(null));
  labelLayer.appendChild(tag);
  const line = document.createElementNS(NS, 'line');
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '3');
  svg.append(line, dot);
  p.ui = { tag, line, dot, show: false };
}

const LABEL_MODES = ['auto', 'all', 'off'];
const LABEL_TEXT = { auto: 'อัตโนมัติ', all: 'ทั้งหมด', off: 'ปิด' };
let labelMode = 'auto';
const labelBtn = $('#label-mode');
labelBtn.addEventListener('click', () => {
  labelMode = LABEL_MODES[(LABEL_MODES.indexOf(labelMode) + 1) % LABEL_MODES.length];
  labelBtn.innerHTML = `<span>ป้ายชื่อ: </span>${LABEL_TEXT[labelMode]}`; // มือถือซ่อนคำนำหน้า
});
$('#reset-view').addEventListener('click', resetView);

const proj = new THREE.Vector3();
let safeLeft = 0; // ขอบขวาของการ์ดขั้นตอน (ป้ายด้านซ้ายห้ามเข้าไปใต้การ์ด)
const fewParts = parts.filter((p) => !p.noLabel).length <= 30; // ภาพรวมแสดงป้ายทั้งหมดได้โดยไม่รก
function updateLabels(stage) {
  const w = innerWidth;
  const h = innerHeight;
  const narrow = w < 760;
  const reach = narrow ? 28 : 56;
  proj.copy(controls.target).project(camera);
  const cx = (proj.x * 0.5 + 0.5) * w;
  const cy = (-proj.y * 0.5 + 0.5) * h;
  const sides = { left: [], right: [] };
  const shown = [];

  for (const p of parts) {
    let show;
    if (selected) show = p === selected;
    else if (labelMode === 'off' || p.noLabel) show = false;
    else if (labelMode === 'all' || (stage === LAST && fewParts)) show = true;
    else show = p.stage === stage && p.amount > 0.35;

    p.anchor.getWorldPosition(proj).project(camera);
    if (proj.z > 1) show = false;
    p.ui.show = show;
    if (!show) continue;

    shown.push({ p, x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h });
  }

  // ป้ายเยอะ: ย่อเหลือบรรทัดเดียว แล้วเรียงเป็นสองคอลัมน์ซ้าย-ขวาของกลุ่มชิ้นส่วน
  const dense = shown.length > 10;
  if (dense !== labelLayer.classList.contains('compact')) {
    labelLayer.classList.toggle('compact', dense);
    parts.forEach((p) => (p.ui.width = 0));
  }
  const lists = [];
  if (dense) {
    // สองคอลัมน์ตรงซ้าย-ขวาของกลุ่มชิ้นส่วน คอลัมน์ซ้ายห้ามเข้าไปใต้การ์ด
    const mid = shown.reduce((s, it) => s + it.x, 0) / shown.length;
    const left = shown.filter((it) => it.x < mid);
    const right = shown.filter((it) => it.x >= mid);
    const visibleX = left.map((it) => it.x).filter((x) => x > safeLeft);
    const leftEdge = Math.max((visibleX.length ? Math.min(...visibleX) : mid) - reach, safeLeft + 150);
    const rightEdge = Math.max(...shown.map((it) => it.x)) + reach;
    for (const [items, side, edge] of [[left, -1, leftEdge], [right, 1, rightEdge]]) {
      for (const it of items) {
        it.side = side;
        it.lx = edge;
        it.ly = it.y;
      }
      lists.push(items);
    }
  } else {
    for (const it of shown) {
      let dx = it.x - cx;
      let dy = it.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      it.side = dx < 0 ? -1 : 1;
      it.lx = it.x + dx * reach + it.side * 10;
      it.ly = it.y + dy * reach;
      sides[it.side < 0 ? 'left' : 'right'].push(it);
    }
    lists.push(sides.left, sides.right);
  }

  const gap = dense ? (narrow ? 20 : 27) : narrow ? 22 : 44;
  for (const list of lists) {
    if (!list.length) continue;
    // ดันป้ายที่ซ้อนกันให้ห่างกันในแนวตั้ง ถ้าล้นขอบล่างให้ขยับทั้งชุดขึ้น
    list.sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < list.length; i++) {
      if (list[i].ly < list[i - 1].ly + gap) list[i].ly = list[i - 1].ly + gap;
    }
    const overflow = list[list.length - 1].ly - (h - 24);
    if (overflow > 0) list.forEach((it) => (it.ly -= overflow));
    for (const it of list) {
      const u = it.p.ui;
      u.width ||= u.tag.offsetWidth;
      // กันป้ายล้นขอบจอ
      it.lx = it.side < 0 ? Math.max(it.lx, u.width + 8, safeLeft + u.width) : Math.min(it.lx, w - u.width - 8);
      it.ly = Math.max(it.ly, 64);
      u.tag.style.transform = `translate(${it.lx}px, ${it.ly}px) translate(${it.side < 0 ? '-100%' : '0'}, -50%)`;
      u.line.setAttribute('x1', it.x);
      u.line.setAttribute('y1', it.y);
      u.line.setAttribute('x2', it.lx);
      u.line.setAttribute('y2', it.ly);
      u.dot.setAttribute('cx', it.x);
      u.dot.setAttribute('cy', it.y);
      u.tag.classList.toggle('active', it.p === selected || it.p === hovered);
    }
  }
  for (const p of parts) {
    const u = p.ui;
    u.tag.classList.toggle('show', u.show);
    u.line.style.opacity = u.dot.style.opacity = u.show ? 1 : 0;
  }
}

// ---------- เลือก / ไฮไลต์ ----------
let selected = null;
let hovered = null;

function applyHighlight() {
  for (const p of parts) {
    const isSel = p === selected;
    const isHov = p === hovered;
    const dim = selected && !isSel;
    for (const m of p.materials) {
      if (!m.userData.glow) {
        m.emissive.copy(m.userData.baseEmissive);
        if (isSel) m.emissive.setHex(0x0b3550);
        else if (isHov) m.emissive.setHex(0x082436);
      }
      const transparent = dim || m.userData.baseTransparent;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = dim ? m.userData.baseOpacity * 0.15 : m.userData.baseOpacity;
      m.depthWrite = dim ? false : m.userData.baseDepthWrite;
    }
  }
}

function setHover(p) {
  if (hovered === p) return;
  hovered = p;
  canvas.style.cursor = p ? 'pointer' : '';
  applyHighlight();
}

const info = $('#info');
function select(p) {
  selected = p;
  applyHighlight();
  focusOn(p);
  if (!p) {
    document.body.classList.remove('has-info');
    return;
  }
  $('#info-cat').textContent = p.category ?? stageTitle(p.stage);
  $('#info-name').textContent = p.name;
  $('#info-en').textContent = p.en;
  $('#info-desc').textContent = p.desc;
  const ul = $('#info-facts');
  ul.replaceChildren(
    ...p.facts.map((f) => {
      const li = document.createElement('li');
      li.textContent = f;
      return li;
    }),
  );
  $('#info-count').textContent = `${p.index + 1} / ${parts.length}`;
  document.body.classList.add('has-info');
  info.scrollTop = 0;
}
$('#info-close').addEventListener('click', () => select(null));
$('#zoom-in').addEventListener('click', () => zoomBy(0.7));
$('#zoom-out').addEventListener('click', () => zoomBy(1.4));
$('#info-prev').addEventListener('click', () => select(parts[(selected.index - 1 + parts.length) % parts.length]));
$('#info-next').addEventListener('click', () => select(parts[(selected.index + 1) % parts.length]));
addEventListener('keydown', (e) => e.key === 'Escape' && select(null));

// ---------- คลิกบนโมเดล ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pickables = parts.map((p) => p.group);

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  let fallback = null;
  for (const hit of raycaster.intersectObjects(pickables, true)) {
    const p = parts[hit.object.userData.partIndex];
    if (!p) continue;
    if (p.pickThrough) {
      fallback ??= p; // กระจกใส: คลิกทะลุไปโดนชิ้นด้านในก่อน
      continue;
    }
    return p;
  }
  return fallback;
}

let lastMove = null;
let lastPickAt = 0;
let downAt = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !downAt) lastMove = e;
});
canvas.addEventListener('pointerleave', () => setHover(null));
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  hideHint();
});
canvas.addEventListener('pointercancel', () => (downAt = null));
canvas.addEventListener('pointerup', (e) => {
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) select(pick(e));
  downAt = null;
});

// ---------- การเลื่อน ----------
let sectionH = innerHeight;
let target = 0;
let prog = 0;
function readScroll() {
  target = clamp(scrollY / sectionH, 0, LAST);
  if (target > 0.25) hideHint();
}
addEventListener('scroll', readScroll, { passive: true });

const hint = $('#hint');
function hideHint() {
  hint.classList.add('hide');
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  fitScale = clamp(1.55 / camera.aspect, 1, 2.2);
  parts.forEach((p) => (p.ui.width = 0)); // วัดความกว้างป้ายใหม่ (ขนาดฟอนต์เปลี่ยนตามจอ)
  safeLeft = w < 760 ? 0 : steps.querySelector('.card').getBoundingClientRect().right + 8;
  sectionH = steps.children[1] ? steps.children[1].offsetTop - steps.children[0].offsetTop : h;
  readScroll();
}
addEventListener('resize', resize);
resize();

// ลิงก์ตรงไปยังขั้นที่ต้องการ เช่น index.html#step-3
const deepLink = /^#step-(\d+)$/.exec(location.hash);
if (deepLink) {
  const n = clamp(+deepLink[1], 0, LAST);
  scrollTo(0, steps.children[n].offsetTop);
  prog = target = n;
}

// ---------- ลูปหลัก ----------
const bar = $('#bar');
const dotEls = [...dots.children];
let lastStage = -1;
const clock = new THREE.Clock();

function frame() {
  if (hiddenByHost) return; // แอปแม่ซ่อนแผงอยู่ → หยุดวาด (กลับมาแสดงแล้วเริ่มใหม่จากตัวรับ message)
  const dt = Math.min(clock.getDelta(), 0.05);
  prog += (target - prog) * (reduceMotion ? 1 : 1 - Math.pow(0.0015, dt));
  if (Math.abs(target - prog) < 0.0005) prog = target;
  const stage = Math.round(prog);

  for (const p of parts) {
    p.group.position.set(0, 0, 0);
    p.amount = 0;
    for (const m of p.moves) {
      const a = m.stage === 0 ? 0 : ease(clamp((prog - (m.stage - 1)) * 1.3 - p.delay));
      p.group.position.addScaledVector(m.offset, a);
      if (m.stage === p.stage) p.amount = a;
    }
  }
  if (!reduceMotion) for (const s of spinners) s.rotation.z += dt * s.userData.spin;

  // เลื่อนจุดกึ่งกลางภาพหลบการ์ด (ซ้าย) และแผงข้อมูล (ขวา)
  const w = innerWidth;
  const h = innerHeight;
  const narrow = w < 760;
  // เลือกชิ้นส่วน: เลื่อนภาพไปซ้ายหลบแผงข้อมูล (มือถือ: ขึ้นบนหลบแผงด้านล่าง)
  const wantX = narrow ? 0 : selected ? w * 0.12 : -w * 0.13;
  const wantY = narrow ? (selected ? h * 0.3 : h * 0.16) : 0;
  viewShiftX += (wantX - viewShiftX) * 0.08;
  viewShiftY += (wantY - viewShiftY) * 0.08;
  camera.setViewOffset(w, h, viewShiftX, viewShiftY, w, h);

  frameCamera(dt);
  controls.update();
  renderer.render(scene, camera);

  const now = performance.now();
  if (lastMove && now - lastPickAt > 80) {
    setHover(pick(lastMove));
    lastMove = null;
    lastPickAt = now;
  }
  updateLabels(stage);

  bar.style.transform = `scaleX(${prog / LAST})`;
  if (stage !== lastStage) {
    dotEls.forEach((d, i) => d.classList.toggle('active', i === stage));
    lastStage = stage;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => {
  frame();
  $('#loader').classList.add('done');
});
