// แผง WORK: ต่อกับระบบในบริษัท (อยู่บนคอมเซิร์ฟเวอร์ในวง LAN)
//  • ห้องประชุม: การจองวันนี้ ห้องไหนว่าง/กำลังประชุม (ระบบ penparkapp)
//  • ห้องพยาบาล: ตัวเลขสรุปวันนี้ + ยาใกล้หมด/ใกล้หมดอายุ (ไม่มีข้อมูลส่วนบุคคล)
// ใช้ได้เมื่อเปิดแอปผ่านลิงก์ LAN (http://IP-เครื่อง/ksd/ironman-hud/) เพราะเว็บ https (GitHub) ดึงข้อมูลจาก http ในบริษัทไม่ได้
import { getJSON } from '../lib/load.js';

let ctx, timer = 0, last = { rooms: null, bookings: null, clinic: null, err: '' };
const pad = (n) => String(n).padStart(2, '0');
const DEFAULT_BASE = 'http://192.168.103.46/ksd';
const onLan = () => location.protocol === 'http:' || location.hostname === 'localhost';
const base = () => (onLan() ? location.pathname.replace(/\/ironman-hud\/.*$/, '') : ctx.store.get('lanBase', DEFAULT_BASE));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function load() {
  if (!onLan()) return render();
  const b = base();
  const [rooms, bookings, clinic] = await Promise.all([
    getJSON(`${b}/penparkapp/room/api.php?action=getRooms`).catch(() => null),
    getJSON(`${b}/penparkapp/room/api.php?action=getBookings`).catch(() => null),
    getJSON(`${b}/clinic/api/summary.php`).catch(() => null),
  ]);
  last = { rooms, bookings, clinic, at: Date.now() };
  render();
}

function meetingsToday() {
  if (!Array.isArray(last.bookings)) return null;
  const t = todayIso();
  return last.bookings.filter((x) => x.date === t && x.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime));
}
function renderRooms() {
  const box = document.getElementById('wk-rooms');
  const list = meetingsToday();
  if (!list) { box.innerHTML = '<div class="p-lbl">MEETING ROOMS · ห้องประชุมวันนี้</div><p class="hint left">เชื่อมต่อระบบจองห้องไม่ได้</p>'; return; }
  const now = nowHm(), roomName = (id) => last.rooms?.find((r) => r.id === id)?.name || id;
  const busy = new Set(list.filter((x) => x.startTime <= now && now < x.endTime).map((x) => x.roomId));
  const free = (last.rooms || []).filter((r) => !busy.has(r.id));
  box.innerHTML = `<div class="p-lbl">MEETING ROOMS · ห้องประชุมวันนี้ (${list.length} รายการ)</div>
    <div class="wk-free">${(last.rooms || []).map((r) => `<span class="${busy.has(r.id) ? 'busy' : ''}">${ctx.esc(r.id)}<small>${busy.has(r.id) ? 'กำลังประชุม' : 'ว่าง'}</small></span>`).join('')}</div>
    ${list.length ? list.map((x) => {
      const st = now >= x.endTime ? 'done' : now >= x.startTime ? 'live' : 'next';
      return `<div class="e-row wk-${st}" style="--c:${st === 'live' ? 'var(--acc)' : st === 'next' ? 'var(--hud)' : 'var(--muted)'}"><b>${x.startTime}</b>
        <span>${ctx.esc(x.title)}<small>${ctx.esc(roomName(x.roomId))} · ${x.startTime}–${x.endTime} · โดย ${ctx.esc(x.bookedBy)}${st === 'live' ? ' · <em class="ok">กำลังประชุม</em>' : st === 'done' ? ' · เสร็จแล้ว' : ''}</small></span></div>`;
    }).join('') : '<p class="hint left">วันนี้ไม่มีการจองห้องประชุม</p>'}
    <p class="hint left">ห้องว่างตอนนี้ ${free.length}/${(last.rooms || []).length} ห้อง · <a href="${base()}/penparkapp/room/calendar.html" target="_blank" rel="noopener">เปิดระบบจองห้อง →</a></p>`;
}
function renderClinic() {
  const box = document.getElementById('wk-clinic'), c = last.clinic;
  if (!c || c.error) { box.innerHTML = `<div class="p-lbl">NURSE ROOM · ห้องพยาบาล</div><p class="hint left">${ctx.esc(c?.error || 'เชื่อมต่อระบบห้องพยาบาลไม่ได้')}</p>`; return; }
  box.innerHTML = `<div class="p-lbl">NURSE ROOM · ${ctx.esc(c.clinic)}</div>
    <div class="hu-grid"><div style="--c:var(--hud)"><small>มาวันนี้</small><b>${c.visits_today}</b><span>ครั้ง</span></div>
      <div style="--c:${c.in_room ? 'var(--acc)' : 'var(--hud)'}"><small>อยู่ในห้องตอนนี้</small><b>${c.in_room}</b><span>คน</span></div>
      <div style="--c:${c.injury_today ? '#ff3b5c' : '#2ee6a6'}"><small>บาดเจ็บจากงาน</small><b>${c.injury_today}</b><span>วันนี้</span></div>
      <div style="--c:var(--hud)"><small>เดือนนี้</small><b>${c.visits_month}</b><span>ครั้ง</span></div></div>
    ${c.pending_notify ? `<p class="hu-adv">🔔 มีเรื่องรอแจ้งหัวหน้า <b>${c.pending_notify}</b> รายการ</p>` : ''}
    <div class="e-sub">ยาที่ต้องดูแล (${c.drug_alerts.length})</div>
    ${c.drug_alerts.length ? c.drug_alerts.slice(0, 8).map((d) => `<div class="e-row" style="--c:${d.flags.includes('ยาหมด') ? '#ff3b5c' : '#ff8a3d'}"><b>${d.available}</b><span>${ctx.esc(d.name)}<small>${ctx.esc(d.unit)} · ${d.flags.map(ctx.esc).join(' · ')}</small></span></div>`).join('') : '<p class="hint left">สต็อกยาปกติทุกรายการ ✓</p>'}
    <p class="hint left">ตัวเลขสรุปเท่านั้น ไม่มีข้อมูลส่วนบุคคล · <a href="${base()}/clinic/" target="_blank" rel="noopener">เปิดระบบห้องพยาบาล →</a></p>`;
}
function render() {
  const off = document.getElementById('wk-off');
  if (!onLan()) {
    off.hidden = false;
    off.innerHTML = `<p>แผงนี้ดึงข้อมูลจากคอมเซิร์ฟเวอร์ในบริษัท จึง<b>ใช้ได้เฉพาะตอนต่อ Wi-Fi บริษัท และเปิดแอปผ่านลิงก์ LAN</b></p>
      <a class="set-btn" href="${ctx.esc(ctx.store.get('lanBase', DEFAULT_BASE))}/ironman-hud/" rel="noopener">เปิดแอปแบบ LAN →</a>
      <button type="button" class="link" data-base>ตั้งที่อยู่เครื่องเซิร์ฟเวอร์</button>
      <p class="hint left">เหตุผล: แอปบน GitHub เป็น https ส่วนระบบในบริษัทเป็น http เบราว์เซอร์ไม่ยอมให้ดึงข้ามกัน (เพื่อความปลอดภัย)</p>`;
    document.getElementById('wk-rooms').hidden = document.getElementById('wk-clinic').hidden = true;
    return;
  }
  off.hidden = true;
  renderRooms(); renderClinic();
}

export default {
  id: 'p-work', en: 'WORK', th: 'งาน', sub: 'ห้องประชุมวันนี้ · ห้องพยาบาล (วง LAN บริษัท)',
  html: '<div class="box wk-off" id="wk-off" hidden></div><div class="box" id="wk-rooms"><p class="hint left">กำลังโหลด…</p></div><div class="box" id="wk-clinic"></div>',
  init(c) {
    ctx = c;
    document.getElementById('p-work').addEventListener('click', (e) => {
      if (!e.target.closest('[data-base]')) return;
      const v = prompt('ที่อยู่เครื่องเซิร์ฟเวอร์ในบริษัท (ถึงโฟลเดอร์ ksd)', ctx.store.get('lanBase', DEFAULT_BASE));
      if (v && /^https?:\/\//.test(v.trim())) { ctx.store.set('lanBase', v.trim().replace(/\/+$/, '')); render(); }
    });
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-work');
    ctx.addReporter(async () => {
      if (!onLan()) return null;
      await load();
      const out = [], list = meetingsToday();
      if (list) {
        const next = list.find((x) => x.startTime > nowHm());
        out.push(list.length ? `วันนี้มีประชุม ${list.length} รายการ${next ? ` ถัดไป ${next.title} เวลา ${next.startTime}` : ''}` : 'วันนี้ไม่มีการจองห้องประชุม');
      }
      if (last.clinic && !last.clinic.error && last.clinic.drug_alerts.length) out.push(`ห้องพยาบาลมียาที่ต้องดูแล ${last.clinic.drug_alerts.length} รายการ`);
      return out;
    });
    ctx.addIntent(/ประชุม|ห้องว่าง|จองห้อง|meeting/, () => {
      if (!onLan()) return { text: 'ข้อมูลห้องประชุมดูได้เฉพาะตอนเปิดแอปผ่านวงแลนของบริษัทค่ะ', go: go() };
      load();
      const list = meetingsToday();
      if (!list) return { text: 'กำลังเชื่อมต่อระบบจองห้องค่ะ', go: go() };
      const next = list.find((x) => x.startTime > nowHm());
      return { text: list.length ? `วันนี้มีประชุม ${list.length} รายการค่ะ${next ? ` ถัดไปคือ ${next.title} เวลา ${next.startTime}` : ' ไม่มีประชุมที่เหลือแล้ว'}` : 'วันนี้ไม่มีการจองห้องประชุมค่ะ', go: go() };
    }, 'วันนี้มีประชุมอะไรบ้าง');
    ctx.addIntent(/ห้องพยาบาล|ยาใกล้หมด|สต็อกยา|ยาหมด/, () => {
      if (!onLan()) return { text: 'ข้อมูลห้องพยาบาลดูได้เฉพาะตอนเปิดแอปผ่านวงแลนของบริษัทค่ะ', go: go() };
      load();
      const c = last.clinic;
      if (!c || c.error) return { text: 'เชื่อมต่อระบบห้องพยาบาลไม่ได้ค่ะ', go: go() };
      return { text: `วันนี้มีคนมาห้องพยาบาล ${c.visits_today} ครั้ง ${c.drug_alerts.length ? `มียาที่ต้องดูแล ${c.drug_alerts.length} รายการค่ะ` : 'สต็อกยาปกติค่ะ'}`, go: go() };
    });
  },
  show() { load(); clearInterval(timer); timer = setInterval(load, 60000); },
  hide() { clearInterval(timer); },
};
