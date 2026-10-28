// หน้าตั้งค่า (ปุ่ม ⚙): ธีม · เสียง · พื้นหลัง · ฉากบูต · รหัสล็อก · โหมดตั้งโต๊ะ · ชื่อ · ล้างข้อมูล
import { THEMES, applyTheme } from './themes.js';
import { setParticles, enableTilt } from './fx.js';

let ctx, sheet;
const BOOT_MODES = [['off', 'ปิด'], ['daily', 'วันละครั้ง'], ['always', 'ทุกครั้งที่เปิด']];

function render() {
  const s = ctx.store;
  const theme = document.body.dataset.theme;
  const bootMode = s.get('bootMode', 'daily');
  const hasLock = !!s.get('lockHash', null);
  sheet.querySelector('.set-body').innerHTML = `
    <div class="set-row"><div class="set-lbl">THEME · ธีมสี</div>
      <div class="swatches">${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="sw${k === theme ? ' on' : ''}" data-theme="${k}" style="--c1:${t.hud};--c2:${t.acc}" aria-label="ธีม ${t.th}"><i></i><span>${t.name}</span><small>${t.th}</small></button>`).join('')}</div></div>
    <div class="set-row"><div class="set-lbl">SOUND · เสียงเอฟเฟกต์</div>${toggle('sfx', s.get('sfx', true), 'เสียงตอนกดปุ่ม / หมุนหน้าปัด')}</div>
    <div class="set-row"><div class="set-lbl">PARTICLES · พื้นหลังอนุภาค</div>${toggle('particles', s.get('particles', true), 'จุดแสงลอยเชื่อมกันด้านหลัง')}
      <button type="button" class="set-btn" data-act="tilt">📱 ให้พื้นหลังขยับตามการเอียงมือถือ</button></div>
    <div class="set-row"><div class="set-lbl">BOOT · ฉากบูตระบบตอนเปิดแอป</div>
      <div class="seg">${BOOT_MODES.map(([k, l]) => `<button type="button" data-boot="${k}" class="${k === bootMode ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${toggle('bootVoice', s.get('bootVoice', false), 'EDIT ทักทายด้วยเสียงหลังบูต (ต้องแตะ 1 ครั้งเพื่อเข้าระบบ)')}
      <button type="button" class="set-btn" data-act="boot">▶ ดูฉากบูตตอนนี้</button></div>
    <div class="set-row"><div class="set-lbl">LOCK · รหัสลากเส้น</div>
      <p class="set-note">หน้าล็อกแบบในหนัง (ลูกเล่น ไม่ใช่ระบบความปลอดภัยจริง)</p>
      <button type="button" class="set-btn" data-act="lock-set">${hasLock ? '🔁 เปลี่ยนรหัส' : '🔒 ตั้งรหัสลากเส้น'}</button>
      ${hasLock ? '<button type="button" class="set-btn" data-act="lock-clear">🗑 ยกเลิกรหัส</button>' : ''}</div>
    <div class="set-row"><div class="set-lbl">STANDBY · โหมดตั้งโต๊ะ</div>
      <p class="set-note">นาฬิกาใหญ่เต็มจอ เหมาะตอนวางชาร์จแนวนอน · กลางคืนหรี่เป็นสีแดงอัตโนมัติ</p>
      <button type="button" class="set-btn" data-act="standby">🕰 เข้าโหมดตั้งโต๊ะ</button></div>
    <div class="set-row"><div class="set-lbl">PROFILE · ชื่อที่ให้ EDIT เรียก</div>
      <button type="button" class="set-btn" data-act="name">✎ ${ctx.esc(ctx.userName())}</button></div>
    <div class="set-row"><div class="set-lbl">DATA · ข้อมูลในเครื่อง</div>
      <p class="set-note">ทุกอย่างเก็บใน iPhone เครื่องนี้เท่านั้น ไม่ได้ส่งขึ้นเว็บ</p>
      <button type="button" class="set-btn danger" data-act="reset">ล้างค่าทั้งหมด (โน้ต ทางลัด รหัส ฯลฯ)</button></div>
    <p class="set-note center">EDIT HUD · ข้อมูลฟรีจาก Open-Meteo, OpenFreeMap, USGS, CelesTrak, RainViewer, NASA, Wikimedia ฯลฯ</p>`;
}
const toggle = (key, on, label) => `<label class="tg"><input type="checkbox" data-key="${key}"${on ? ' checked' : ''}><span class="tg-ui"></span>${label}</label>`;

async function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.classList.contains('sheet-x')) return close();
  if (b.dataset.theme) { ctx.setTheme(b.dataset.theme); render(); return; }
  if (b.dataset.boot) { ctx.store.set('bootMode', b.dataset.boot); render(); return; }
  switch (b.dataset.act) {
    case 'tilt': ctx.toast((await enableTilt()) ? 'เปิดแล้ว ลองเอียงมือถือดู' : 'อุปกรณ์นี้ไม่รองรับ หรือยังไม่อนุญาต'); break;
    case 'boot': close(); ctx.sys.boot.run(true); break;
    case 'lock-set': close(); ctx.sys.lock.setup(); break;
    case 'lock-clear': if (confirm('ยกเลิกรหัสลากเส้น?')) { ctx.store.set('lockHash', null); render(); ctx.toast('ยกเลิกรหัสแล้ว'); } break;
    case 'standby': close(); ctx.sys.standby.open(); break;
    case 'name': ctx.editName(); render(); break;
    case 'reset':
      if (confirm('ล้างค่าทั้งหมดในเครื่องนี้? (โน้ต ทางลัด รหัสล็อก ธีม ฯลฯ)')) {
        try { Object.keys(localStorage).filter((k) => k.startsWith('hud:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ไม่เป็นไร */ }
        location.reload();
      }
      break;
  }
}
function onChange(e) {
  const k = e.target.dataset.key;
  if (!k) return;
  ctx.store.set(k, e.target.checked);
  if (k === 'particles') setParticles(e.target.checked);
  if (k === 'sfx' && e.target.checked) ctx.fx.play('ok');
}
function open() { render(); sheet.hidden = false; ctx.fx.play('open'); }
function close() { sheet.hidden = true; }

export default {
  init(c) {
    ctx = c;
    applyTheme(ctx.store.get('theme', 'jarvis'));
    sheet = document.createElement('section');
    sheet.className = 'sheet set-sheet';
    sheet.hidden = true;
    sheet.setAttribute('aria-label', 'ตั้งค่า');
    sheet.innerHTML = '<div class="sheet-head"><h2>SETTINGS <small>ตั้งค่า</small></h2><button type="button" class="sheet-x" aria-label="ปิด">×</button></div><div class="set-body"></div>';
    document.body.append(sheet);
    sheet.addEventListener('click', onClick);
    sheet.addEventListener('change', onChange);
    ctx.$('#set-btn').addEventListener('click', open);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
    ctx.addIntent(/ตั้งค่า|setting/, () => { open(); return { text: 'เปิดหน้าตั้งค่าให้แล้วค่ะ' }; });
  },
  open,
};
