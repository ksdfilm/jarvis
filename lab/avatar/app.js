// AVATAR//MIRROR — code-built robot driven by FaceLandmarker blendshapes (+ optional PoseLandmarker arms)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { embedded, bar, gate, toast, permMsg, camera, vision, MODELS, clamp, lerp, $ } from '../common/lab.js';

bar('AVATAR//MIRROR', 'หุ่นยนต์สะท้อนท่าทาง · หน้า ตา ปาก แขน');
const view = $('#view'), hud = $('#hud');

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: embedded }); // in the EDIT HUD: transparent, floats on the HUD background
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x01070c, embedded ? 0 : 1);
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0x9fefff, 0x050a10, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 5); scene.add(key);
const rim = new THREE.PointLight(0x3ce7ff, 30, 12); rim.position.set(-3, 2, -2); scene.add(rim);
const rim2 = new THREE.PointLight(0xff7ad9, 18, 12); rim2.position.set(3, 1, -2); scene.add(rim2);

// backdrop: rings + floor grid (so the recorded clip has a scene)
const backdrop = new THREE.Group(); scene.add(backdrop);
for (const [r, o] of [[2.6, 0.5], [2.9, 0.25], [3.4, 0.15]]) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.02, 96), new THREE.MeshBasicMaterial({ color: 0x3ce7ff, transparent: true, opacity: o }));
  m.position.set(0, 0.7, -2.5); backdrop.add(m);
}
const grid = new THREE.GridHelper(20, 40, 0x3ce7ff, 0x0b3442); grid.position.y = -2.2;
grid.material.transparent = true; grid.material.opacity = 0.4; scene.add(grid);

// ---------- robot ----------
const metal = new THREE.MeshStandardMaterial({ color: 0x24303a, metalness: 0.8, roughness: 0.32 });
const metal2 = new THREE.MeshStandardMaterial({ color: 0x3a4a56, metalness: 0.85, roughness: 0.25 });
const screenM = new THREE.MeshStandardMaterial({ color: 0x02080c, metalness: 0.3, roughness: 0.15 });
const glow = c => new THREE.MeshBasicMaterial({ color: c });
const CY = 0x3ce7ff;

const robot = new THREE.Group(); scene.add(robot);
const torso = new THREE.Group(); robot.add(torso);
torso.add(new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.5, 0.9, 4, 0.18), metal));
torso.children[0].position.y = -0.95;
const chest = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), glow(CY)); chest.position.set(0, -0.8, 0.46); torso.add(chest);
const chestRing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.29, 40), glow(CY)); chestRing.position.copy(chest.position); torso.add(chestRing);
for (const x of [-0.5, 0.5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), glow(CY)); s.position.set(x, -1.4, 0.46); torso.add(s); }
const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 20), metal2); neck.position.y = -0.1; torso.add(neck);

// head (pivot at the neck)
const head = new THREE.Group(); head.position.y = 0.05; robot.add(head);
const skull = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.15, 1.1, 5, 0.25), metal); skull.position.y = 0.62; head.add(skull);
const face = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.86, 0.1, 3, 0.08), screenM); face.position.set(0, 0.6, 0.52); head.add(face);
const FZ = 0.58;   // front of the face screen
const eyes = [], brows = [];
for (const s of [-1, 1]) {       // s = screen side (-1 = left of screen)
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), glow(CY)); eye.scale.set(1.15, 1, 1);
  eye.position.set(s * 0.27, 0.72, FZ); head.add(eye); eyes.push(eye);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.02), glow(CY));
  brow.position.set(s * 0.27, 0.9, FZ); head.add(brow); brows.push(brow);
  const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 24), metal2); ear.rotation.z = Math.PI / 2; ear.position.set(s * 0.76, 0.6, 0); head.add(ear);
  const earGlow = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 32), glow(CY)); earGlow.rotation.y = Math.PI / 2; earGlow.position.set(s * 0.84, 0.6, 0); head.add(earGlow);
}
const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), metal2); antenna.position.set(0, 1.35, 0); head.add(antenna);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), glow(0xff7ad9)); bulb.position.set(0, 1.55, 0); head.add(bulb);

// LED mouth matrix
const MC = 13, MR = 7, LED = 0.052;
const mouth = new THREE.InstancedMesh(new THREE.PlaneGeometry(LED * 0.82, LED * 0.82), new THREE.MeshBasicMaterial(), MC * MR);
{ const m = new THREE.Matrix4(); let i = 0;
  for (let r = 0; r < MR; r++) for (let c = 0; c < MC; c++) { m.makeTranslation((c - (MC - 1) / 2) * LED, 0.42 - (r - (MR - 1) / 2) * LED, FZ); mouth.setMatrixAt(i++, m); } }
head.add(mouth);
const cOff = new THREE.Color(0x06222b), cOn = new THREE.Color(CY), cIn = new THREE.Color(0x0f5a6a), cSmile = new THREE.Color(0xff7ad9), tmpC = new THREE.Color();

// arms: shoulder → upper (pivot) → elbow → fore (pivot) → hand
const arms = [];
for (const s of [-1, 1]) {
  const shoulder = new THREE.Group(); shoulder.position.set(s * 1.0, -0.4, 0); robot.add(shoulder);
  shoulder.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), metal2));
  const upper = new THREE.Group(); shoulder.add(upper);
  const u = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.75, 16), metal); u.position.y = -0.4; upper.add(u);
  const elbow = new THREE.Group(); elbow.position.y = -0.8; upper.add(elbow);
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), metal2));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.015, 6, 24), glow(CY)); ring.rotation.x = Math.PI / 2; elbow.add(ring);
  const fore = new THREE.Group(); elbow.add(fore);
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 16), metal); f.position.y = -0.38; fore.add(f);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), metal2); hand.position.y = -0.8; hand.scale.set(1, 1.2, 0.7); fore.add(hand);
  const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.12));
  upper.quaternion.copy(rest);
  arms.push({ s, upper, fore, rest, restF: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0)), tU: rest.clone(), tF: new THREE.Quaternion() });
}

// ---------- tracking ----------
const video = document.createElement('video');
video.setAttribute('playsinline', ''); video.muted = true;
let faceModel = null, poseModel = null, poseOn = false, mirror = true, lastVT = -1, frameN = 0;
const BS = {};                                  // blendshape name → smoothed score
const headT = { x: 0, y: 0, z: 0 };            // target head rotation
let faceSeen = 0, lastFace = null, lastPose = null;
const mat4 = new THREE.Matrix4(), eul = new THREE.Euler();

// PiP
const pipBox = document.createElement('div'); pipBox.className = 'pip'; pipBox.hidden = true;
const pipCv = document.createElement('canvas'); pipBox.append(video, pipCv); view.appendChild(pipBox);
const pg = pipCv.getContext('2d');
function fitPip() {
  pipBox.style.aspectRatio = `${video.videoWidth || 4} / ${video.videoHeight || 3}`;
  const r = pipBox.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  pipCv.width = r.width * d; pipCv.height = r.height * d; pg.setTransform(d, 0, 0, d, 0, 0);
  return r;
}

async function startCamera() {
  const c = await camera(video, { w: 960, h: 540 });
  mirror = c.mirror;
  video.classList.toggle('mirror', mirror);
  pipBox.hidden = false; fitPip();
  hud.innerHTML = '<div class="st">กำลังโหลด AI ใบหน้า (~4 MB)…</div>';
  faceModel = await vision('FaceLandmarker', {
    baseOptions: { modelAssetPath: MODELS.face }, runningMode: 'VIDEO', numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  });
  $('#btnCam').classList.add('on'); $('#btnCam').textContent = '📷 ปิดกล้อง';
}
function stopCamera() {
  video.srcObject?.getTracks().forEach(t => t.stop()); video.srcObject = null;
  faceModel = null; pipBox.hidden = true; lastFace = lastPose = null;
  $('#btnCam').classList.remove('on'); $('#btnCam').textContent = '📷 กล้อง';
}
$('#btnCam').onclick = async () => {
  if (faceModel) return stopCamera();
  try { await startCamera(); } catch (e) { console.error(e); toast(permMsg(e)); stopCamera(); }
};
$('#btnPose').onclick = async () => {
  poseOn = !poseOn;
  $('#btnPose').classList.toggle('on', poseOn);
  if (!poseOn) { lastPose = null; return; }
  if (!faceModel) toast('เปิดกล้องก่อน แล้วถอยให้เห็นไหล่-ข้อศอก-ข้อมือ');
  if (!poseModel) {
    toast('กำลังโหลด AI โครงร่างกาย (lite ~5 MB)…');
    try { poseModel = await vision('PoseLandmarker', { baseOptions: { modelAssetPath: MODELS.poseLite }, runningMode: 'VIDEO', numPoses: 1 }); toast('พร้อมแล้ว — ยกแขนได้เลย'); }
    catch (e) { console.error(e); toast('โหลด AI แขนไม่สำเร็จ'); poseOn = false; $('#btnPose').classList.remove('on'); }
  }
};

function track(now) {
  if (!faceModel || video.readyState < 2 || video.currentTime === lastVT) return;
  lastVT = video.currentTime; frameN++;
  // with both models on, run pose on every other frame to stay smooth on phones
  if (poseOn && poseModel && frameN % 2 === 0) {
    try { const r = poseModel.detectForVideo(video, now); lastPose = r.worldLandmarks?.[0] ? { w: r.worldLandmarks[0], n: r.landmarks[0] } : null; } catch (e) { console.warn(e); }
    return;
  }
  let r;
  try { r = faceModel.detectForVideo(video, now); } catch (e) { console.warn(e); return; }
  lastFace = r.faceLandmarks?.[0] || null;
  if (!lastFace) return;
  faceSeen = now;
  for (const c of r.faceBlendshapes?.[0]?.categories || []) BS[c.categoryName] = lerp(BS[c.categoryName] ?? c.score, c.score, 0.6);
  const m = r.facialTransformationMatrixes?.[0]?.data;
  if (m) {
    eul.setFromRotationMatrix(mat4.fromArray(m), 'YXZ');
    // mirror: yaw and roll flip, pitch stays
    const k = mirror ? -1 : 1;
    headT.x = clamp(eul.x, -0.7, 0.7); headT.y = clamp(eul.y * k, -0.9, 0.9); headT.z = clamp(eul.z * k, -0.6, 0.6);
  }
}

// ---------- apply to robot ----------
const v3 = l => new THREE.Vector3(-l.x * (mirror ? 1 : -1), -l.y, -l.z * 0.5);  // MediaPipe world → three (mirrored)
const DOWN = new THREE.Vector3(0, -1, 0), qInv = new THREE.Quaternion();
function applyPose() {
  for (const a of arms) {
    let ok = false;
    if (lastPose) {
      // screen-right avatar arm follows the user's right arm (mirror)
      const [S, E, W] = (a.s > 0) === mirror ? [12, 14, 16] : [11, 13, 15];
      const n = lastPose.n;
      if (n[S].visibility > 0.5 && n[E].visibility > 0.5) {
        const w = lastPose.w;
        const dU = v3(w[E]).sub(v3(w[S])).normalize();
        a.tU.setFromUnitVectors(DOWN, dU);
        if (n[W].visibility > 0.4) {
          const dF = v3(w[W]).sub(v3(w[E])).normalize();
          dF.applyQuaternion(qInv.copy(a.tU).invert());
          a.tF.setFromUnitVectors(DOWN, dF);
        }
        ok = true;
      }
    }
    if (!ok) { a.tU.copy(a.rest); a.tF.copy(a.restF); }
    a.upper.quaternion.slerp(a.tU, 0.3);
    a.fore.quaternion.slerp(a.tF, 0.3);
  }
}
// brow scores have a strong per-face bias (resting brows often read as "down") — subtract a slowly adapting neutral baseline
const base = {};
const b = n => BS[n] ?? 0;
const bb = n => { const v = b(n), z = (base[n] ??= v); base[n] = z + (v - z) * (v < z ? 0.2 : 0.008); return clamp((v - base[n]) / (1 - base[n] + 1e-3), 0, 1); };
function applyFace(t) {
  const live = faceModel && t - faceSeen < 600;
  if (!live) {   // idle: look around and blink by itself
    for (const k in base) delete base[k];
    headT.x = Math.sin(t / 2100) * 0.08; headT.y = Math.sin(t / 1700) * 0.35; headT.z = Math.sin(t / 2900) * 0.06;
    const bl = (t % 3800) < 140 ? 1 : 0;
    for (const n of ['eyeBlinkLeft', 'eyeBlinkRight']) BS[n] = bl;
    BS.jawOpen = 0; BS.mouthSmileLeft = BS.mouthSmileRight = 0.35 + 0.1 * Math.sin(t / 900);
  }
  head.rotation.x = lerp(head.rotation.x, headT.x, 0.35);
  head.rotation.y = lerp(head.rotation.y, headT.y, 0.35);
  head.rotation.z = lerp(head.rotation.z, headT.z, 0.35);
  torso.rotation.y = head.rotation.y * 0.25;
  // eyes (screen-left eye ← the user's left eye, as in a mirror)
  const names = mirror ? ['Left', 'Right'] : ['Right', 'Left'];
  eyes.forEach((e, i) => {
    const bl = clamp((b('eyeBlink' + names[i]) - 0.2) / 0.45, 0, 1);
    e.scale.y = lerp(e.scale.y, Math.max(0.08, 1 - bl), 0.6);
    // gaze: look in/out/up/down
    const out = b('eyeLookOut' + names[i]) - b('eyeLookIn' + names[i]);
    const gx = (i === 0 ? -1 : 1) * out, gy = b('eyeLookUp' + names[i]) - b('eyeLookDown' + names[i]);
    e.position.x = (i === 0 ? -0.27 : 0.27) + gx * 0.05; e.position.y = 0.72 + gy * 0.04;
  });
  brows.forEach((br, i) => {
    const inner = bb('browInnerUp'), down = bb('browDown' + names[i]);
    const up = inner * 0.6 + bb('browOuterUp' + names[i]) * 0.5 - down * 0.8;
    br.position.y = lerp(br.position.y, 0.9 + up * 0.12, 0.4);
    br.rotation.z = lerp(br.rotation.z, (i === 0 ? -1 : 1) * (down * 0.45 - inner * 0.25), 0.4);
  });
  // LED mouth
  const jaw = clamp(b('jawOpen') * 1.4, 0, 1);
  const smile = (b('mouthSmileLeft') + b('mouthSmileRight')) / 2, frown = (b('mouthFrownLeft') + b('mouthFrownRight')) / 2;
  const pucker = b('mouthPucker');
  const curve = clamp(smile * 1.6 - frown * 2, -1, 1);
  const half = (MC - 1) / 2 * (1 - pucker * 0.55) * (1 + smile * 0.15);
  const mid = (MR - 1) / 2, open = jaw * (MR - 1.2);
  let i = 0;
  for (let r = 0; r < MR; r++) for (let c = 0; c < MC; c++, i++) {
    const x = (c - (MC - 1) / 2);
    let col = cOff;
    if (Math.abs(x) <= half + 0.01) {
      const u = x / Math.max(half, 1), bend = -curve * 2.8 * (u * u - 0.35);
      // closed mouth = a single curved line; open = top + bottom lip with a dim inside
      const o = open < 1 ? 0 : open;
      const top = mid - o / 2 + bend, bot = mid + o / 2 + bend * (o ? 0.5 : 1);
      if (Math.abs(r - top) < 0.55 || Math.abs(r - bot) < 0.55) col = tmpC.copy(cOn).lerp(cSmile, clamp(smile * 1.2, 0, 1));
      else if (r > top && r < bot) col = cIn;
    }
    mouth.setColorAt(i, col);
  }
  mouth.instanceColor.needsUpdate = true;
  bulb.material.color.setHSL(0.88 - jaw * 0.35, 1, 0.55 + jaw * 0.2);
  bulb.scale.setScalar(1 + jaw * 0.6);
  const pulse = 0.6 + 0.4 * Math.sin(t / 300);
  chest.material.color.setRGB(0.24 * pulse, 0.9 * pulse, 1 * pulse);
  return live;
}

function drawPip() {
  if (pipBox.hidden) return;
  const r = pipBox.getBoundingClientRect(), W = r.width, H = r.height;
  if (Math.abs(pipCv.width - W * Math.min(devicePixelRatio || 1, 2)) > 2) fitPip();
  pg.clearRect(0, 0, W, H);
  const X = l => (mirror ? 1 - l.x : l.x) * W;
  if (lastFace) { pg.fillStyle = 'rgba(60,231,255,.8)'; for (let i = 0; i < lastFace.length; i += 4) pg.fillRect(X(lastFace[i]) - 0.7, lastFace[i].y * H - 0.7, 1.4, 1.4); }
  if (lastPose) {
    pg.strokeStyle = '#ff7ad9'; pg.lineWidth = 2; pg.beginPath();
    for (const [a, c] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]]) { const p = lastPose.n[a], q = lastPose.n[c]; pg.moveTo(X(p), p.y * H); pg.lineTo(X(q), q.y * H); }
    pg.stroke();
  }
}
function drawHud(live) {
  const bars = [['กะพริบ', (b('eyeBlinkLeft') + b('eyeBlinkRight')) / 2], ['อ้าปาก', b('jawOpen')], ['ยิ้ม', (b('mouthSmileLeft') + b('mouthSmileRight')) / 2], ['คิ้ว', bb('browInnerUp')]];
  const st = !faceModel ? 'โหมดสาธิต (ไม่ใช้กล้อง)' : live ? 'จับใบหน้าได้ ✓' : 'มองตรงมาที่กล้อง…';
  hud.innerHTML = `<div class="st">${st}${poseOn ? (lastPose ? ' · แขน ✓' : ' · หาแขน…') : ''}</div>` +
    bars.map(([n, v]) => `<div class="row"><span>${n}</span><i><b style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></b></i></div>`).join('');
}

// ---------- recording ----------
let rec = null, recTrack = null, recT0 = 0, chunks = [], clipUrl = null;
const MIME = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  .find(t => window.MediaRecorder?.isTypeSupported?.(t));
if (!window.MediaRecorder || !renderer.domElement.captureStream) { $('#btnRec').disabled = true; $('#btnRec').title = 'เบราว์เซอร์นี้อัดวิดีโอจาก canvas ไม่ได้'; }
$('#btnRec').onclick = () => (rec ? stopRec() : startRec());
function startRec() {
  try {
    const stream = renderer.domElement.captureStream(30);
    recTrack = stream.getVideoTracks()[0];
    rec = new MediaRecorder(stream, MIME ? { mimeType: MIME, videoBitsPerSecond: 5e6 } : undefined);
  } catch (e) { console.error(e); toast('เริ่มอัดไม่สำเร็จ: ' + e.message); rec = null; return; }
  chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = showClip;
  rec.start(500);
  recT0 = performance.now();
  $('#btnRec').classList.add('on'); $('#btnRec').textContent = '⏹ หยุดอัด';
  $('#rec').classList.add('on');
}
function stopRec() {
  if (!rec) return;
  rec.state !== 'inactive' && rec.stop();
  rec.stream.getTracks().forEach(t => t.stop());
  rec = null;
  $('#btnRec').classList.remove('on'); $('#btnRec').textContent = '⏺ อัดคลิป';
  $('#rec').classList.remove('on');
}
function showClip() {
  const type = (chunks[0]?.type || MIME || 'video/webm').split(';')[0];
  const blob = new Blob(chunks, { type });
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = URL.createObjectURL(blob);
  $('#clipVid').src = clipUrl;
  const name = `avatar-${Date.now()}.${ext}`;
  Object.assign($('#clipDl'), { href: clipUrl, download: name });
  $('#clipInfo').textContent = `${ext.toUpperCase()} · ${blob.size > 1e6 ? (blob.size / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(blob.size / 1e3)) + " KB"}${ext === 'webm' ? ' · ไฟล์ WebM เปิดได้ใน Chrome/Edge/VLC' : ''}`;
  const file = new File([blob], name, { type });
  const sh = $('#clipShare');
  sh.hidden = !navigator.canShare?.({ files: [file] });
  sh.onclick = () => navigator.share({ files: [file], title: 'KSD LAB Avatar' }).catch(() => {});
  $('#clip').classList.add('show');
}
$('#clipClose').onclick = () => { $('#clip').classList.remove('show'); $('#clipVid').pause(); };

// ---------- loop ----------
function resize() {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  cam.aspect = r.width / r.height;
  // fit head+torso: about 4.2 units tall, 3.6 wide
  const half = THREE.MathUtils.degToRad(cam.fov / 2);
  const dist = Math.max(2.4 / Math.tan(half), 2.2 / (Math.tan(half) * cam.aspect));
  cam.position.set(0, 0.1, dist);
  cam.lookAt(0, -0.15, 0);
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
let hudT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  track(now);
  const live = applyFace(now);
  applyPose();
  backdrop.rotation.z = now / 9000;
  renderer.render(scene, cam);
  if (rec) recTrack?.requestFrame?.();   // push each rendered frame (some browsers skip un-composited canvases)
  drawPip();
  if (now - hudT > 100) { hudT = now; drawHud(live); }
  if (rec) {
    const s = Math.floor((now - recT0) / 1000);
    $('#rec').textContent = `● REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= 60) stopRec();
  }
}
requestAnimationFrame(loop);

gate({
  title: 'AVATAR//MIRROR',
  lines: [
    'หุ่นยนต์ 3D ขยับหัว กะพริบตา เลิกคิ้ว อ้าปาก ยิ้ม ตามใบหน้าคุณแบบกระจก',
    'กด <b>🦾 ขยับแขน</b> เพื่อให้หุ่นยกแขนตาม (ถอยให้กล้องเห็นถึงข้อมือ)',
    'กด <b>⏺ อัดคลิป</b> เพื่อบันทึกวิดีโอหุ่นยนต์ แล้วดาวน์โหลด/แชร์',
    'ภาพจากกล้องประมวลผลในเครื่องนี้ ไม่มีการอัปโหลด',
    '<a href="#" class="alt" id="noCam">ดูโหมดสาธิตโดยไม่เปิดกล้อง ▸</a>',
  ],
  needs: ['camera'],
  button: '▶ เปิดกล้องและเริ่ม',
  onStart: async () => { try { await startCamera(); } catch (e) { stopCamera(); throw e; } },
}).catch(() => {});
$('#noCam').onclick = e => { e.preventDefault(); $('.lab-gate')?.remove(); };

window.__lab = { BS, headT, base, brows: () => brows.map(b => [b.rotation.z.toFixed(2), b.position.y.toFixed(2)]), get face() { return !!lastFace; }, get pose() { return !!lastPose; }, get mime() { return MIME; }, startRec, stopRec, poseBtn: () => $('#btnPose').click() };
