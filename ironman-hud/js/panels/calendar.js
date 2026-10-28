// แผง CALENDAR: ปฏิทินไทย (วันหยุดราชการจริงจาก data/holidays.json + วันพระโดยประมาณ) · นับถอยหลังวันหยุด/หยุดยาว/เงินเดือนออก · นาฬิกาโลก
import { loadScript, getJSON } from '../lib/load.js';
import { ASTRO_JS } from '../lib/iss.js';

let ctx, A = null;
let holidays = []; // [{date:'YYYY-MM-DD', name, off}]
let view = new Date(); view.setDate(1);
let picked = null;
const DAY = 864e5;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atMid = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmtD = (d) => d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtS = (d) => d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
const daysTo = (d) => Math.round((atMid(d) - atMid(new Date())) / DAY);

// ---------- วันพระ (โดยประมาณจากข้างขึ้นข้างแรมทางดาราศาสตร์ อาจคลาดจากปฏิทินหลวง ±1 วัน) ----------
const phraCache = new Map();
function wanPhra(year) {
  if (!A) return new Map();
  if (phraCache.has(year)) return phraCache.get(year);
  const m = new Map(), names = ['แรม 14/15 ค่ำ', 'ขึ้น 8 ค่ำ', 'ขึ้น 15 ค่ำ', 'แรม 8 ค่ำ'];
  let q = A.SearchMoonQuarter(new Date(year, 0, 1));
  while (q.time.date.getFullYear() <= year) {
    const d = new Date(q.time.date.getTime() + 7 * 3600e3); // เวลาไทย
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (q.quarter === 0) local.setDate(local.getDate() - 1); // วันพระแรม = วันก่อนเดือนดับ
    if (local.getFullYear() === year) m.set(iso(local), names[q.quarter]);
    q = A.NextMoonQuarter(q);
  }
  phraCache.set(year, m);
  return m;
}

// ---------- วันหยุด ----------
const hol = (key) => holidays.find((h) => h.date === key);
const isOff = (d) => d.getDay() === 0 || d.getDay() === 6 || !!hol(iso(d))?.off;
function nextHoliday() {
  const t = iso(new Date());
  return holidays.find((h) => h.off && h.date >= t);
}
/** หยุดยาวถัดไป: ช่วงวันหยุดติดกัน ≥ 3 วัน ที่มีวันหยุดราชการอย่างน้อย 1 วัน */
function nextLongWeekend() {
  const d = atMid(new Date());
  for (let i = 0; i < 400; i++) {
    const s = new Date(d.getTime() + i * DAY);
    if (!isOff(s)) continue;
    const prev = new Date(s.getTime() - DAY);
    if (i > 0 && isOff(prev)) continue; // เริ่มนับตั้งแต่วันแรกของช่วงหยุด
    let n = 0, has = false;
    while (isOff(new Date(s.getTime() + n * DAY))) { if (hol(iso(new Date(s.getTime() + n * DAY)))?.off) has = true; n++; }
    if (n >= 3 && has) return { start: s, end: new Date(s.getTime() + (n - 1) * DAY), days: n };
  }
  return null;
}
/** วันเงินเดือนออก: วันที่ตั้งไว้ (ค่าเริ่มต้นสิ้นเดือน) ถ้าตรงวันหยุดเลื่อนมาวันทำงานก่อนหน้า */
function nextPayday() {
  const set = ctx.store.get('payday', 'last');
  const now = atMid(new Date());
  for (let k = 0; k < 3; k++) {
    const y = now.getFullYear(), m = now.getMonth() + k;
    let d = set === 'last' ? new Date(y, m + 1, 0) : new Date(y, m, Math.min(+set, new Date(y, m + 1, 0).getDate()));
    while (isOff(d)) d = new Date(d.getTime() - DAY);
    if (d >= now) return d;
  }
  return null;
}
function nextPhra() {
  if (!A) return null;
  const now = atMid(new Date());
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const [k, n] of wanPhra(y)) { const d = new Date(`${k}T00:00`); if (d >= now) return { date: d, name: n }; }
  }
  return null;
}

// ---------- วาด ----------
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
function renderMonth() {
  const y = view.getFullYear(), m = view.getMonth();
  document.getElementById('cal-title').textContent = view.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), today = iso(new Date()), phra = wanPhra(y);
  let cells = TH_DOW.map((d, i) => `<div class="cal-dow${i === 0 || i === 6 ? ' we' : ''}">${d}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m, d), k = iso(dt), h = hol(k), p = phra.get(k);
    const cls = ['cal-day', k === today && 'today', (dt.getDay() === 0 || dt.getDay() === 6) && 'we', h?.off && 'off', h && !h.off && 'obs', k === picked && 'picked'].filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" data-k="${k}"><b>${d}</b>${p ? '<i class="phra" title="วันพระ">☸</i>' : ''}${h ? '<i class="dot"></i>' : ''}</button>`;
  }
  document.getElementById('cal-grid').innerHTML = cells;
  // รายการวันสำคัญของเดือนนี้
  const list = holidays.filter((h) => h.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`));
  const ph = [...phra].filter(([k]) => k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`));
  document.getElementById('cal-list').innerHTML = [...list.map((h) => ({ k: h.date, t: h.name, c: h.off ? '#ff3b5c' : 'var(--hud)', s: h.off ? 'วันหยุด' : 'วันสำคัญ' })), ...ph.map(([k, n]) => ({ k, t: `วันพระ (${n})`, c: '#ffd23f', s: 'โดยประมาณ' }))]
    .sort((a, b) => a.k.localeCompare(b.k))
    .map((x) => `<div class="e-row" style="--c:${x.c}"><b>${+x.k.slice(8)}</b><span>${ctx.esc(x.t)}<small>${fmtS(new Date(`${x.k}T00:00`))} · ${x.s}</small></span></div>`).join('') || '<p class="hint left">เดือนนี้ไม่มีวันหยุด</p>';
}
function renderPicked() {
  const box = document.getElementById('cal-pick');
  if (!picked) { box.hidden = true; return; }
  const d = new Date(`${picked}T00:00`), h = hol(picked), p = wanPhra(d.getFullYear()).get(picked), n = daysTo(d);
  box.hidden = false;
  box.innerHTML = `<b>${fmtD(d)}</b><span>${n === 0 ? 'วันนี้' : n > 0 ? `อีก ${n} วัน` : `${-n} วันที่แล้ว`}</span>
    ${h ? `<span style="color:${h.off ? '#ff8a9b' : 'var(--hud)'}">${ctx.esc(h.name)}${h.off ? ' (วันหยุด)' : ''}</span>` : ''}${p ? `<span style="color:#ffd23f">☸ วันพระ ${p} (โดยประมาณ)</span>` : ''}`;
}
function renderCountdowns() {
  const nh = nextHoliday(), lw = nextLongWeekend(), pd = nextPayday(), np = nextPhra();
  const card = (icon, title, d, sub) => `<div class="cd"><small>${icon} ${title}</small><b>${d === null ? '—' : d === 0 ? 'วันนี้' : `${d} วัน`}</b><span>${sub}</span></div>`;
  document.getElementById('cal-cd').innerHTML =
    card('🎉', 'วันหยุดถัดไป', nh ? daysTo(new Date(`${nh.date}T00:00`)) : null, nh ? `${fmtS(new Date(`${nh.date}T00:00`))} · ${ctx.esc(nh.name.split(' / ')[0].slice(0, 40))}` : 'ยังไม่มีข้อมูล') +
    card('🏖', 'หยุดยาวถัดไป', lw ? daysTo(lw.start) : null, lw ? `${fmtS(lw.start)} – ${fmtS(lw.end)} · หยุด ${lw.days} วัน` : '—') +
    card('💰', 'เงินเดือนออก', pd ? daysTo(pd) : null, pd ? `${fmtS(pd)} <button type="button" class="link" data-pay>ตั้งวัน</button>` : '—') +
    card('☸', 'วันพระถัดไป', np ? daysTo(np.date) : null, np ? `${fmtS(np.date)} · ${np.name}` : 'กำลังคำนวณ…');
}

// ---------- นาฬิกาโลก ----------
const ZONES = [['กรุงเทพฯ', 'Asia/Bangkok'], ['โตเกียว', 'Asia/Tokyo'], ['เซี่ยงไฮ้', 'Asia/Shanghai'], ['ดูไบ', 'Asia/Dubai'], ['ลอนดอน', 'Europe/London'], ['นิวยอร์ก', 'America/New_York'], ['ซิดนีย์', 'Australia/Sydney'], ['ลอสแอนเจลิส', 'America/Los_Angeles']];
function renderClocks() {
  const now = new Date(), localDay = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  document.getElementById('cal-world').innerHTML = ZONES.map(([n, tz]) => {
    const t = now.toLocaleTimeString('th-TH', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const h = +t.slice(0, 2), day = now.toLocaleDateString('en-CA', { timeZone: tz });
    const diff = day > localDay ? 'พรุ่งนี้' : day < localDay ? 'เมื่อวาน' : 'วันนี้';
    const a = ((h % 12) + now.getMinutes() / 60) * 30;
    return `<div class="wc${h >= 6 && h < 18 ? ' day' : ''}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/><line x1="20" y1="20" x2="${20 + 9 * Math.sin(a * Math.PI / 180)}" y2="${20 - 9 * Math.cos(a * Math.PI / 180)}"/><line class="m" x1="20" y1="20" x2="${20 + 14 * Math.sin(now.getMinutes() * 6 * Math.PI / 180)}" y2="${20 - 14 * Math.cos(now.getMinutes() * 6 * Math.PI / 180)}"/></svg>
      <span><b>${t}</b><small>${n} · ${diff}${h >= 6 && h < 18 ? ' ☀' : ' ☾'}</small></span></div>`;
  }).join('');
}

let clockTimer = 0;
async function start() {
  if (!holidays.length) {
    try { holidays = (await getJSON(`data/holidays.json?d=${iso(new Date())}`)).items; } catch { /* ไม่มีไฟล์ */ }
  }
  if (!A) { await loadScript(ASTRO_JS); A = window.Astronomy; }
  renderMonth(); renderPicked(); renderCountdowns(); renderClocks();
  clearInterval(clockTimer); clockTimer = setInterval(renderClocks, 15000);
}

export default {
  id: 'p-cal', en: 'CALENDAR', th: 'ปฏิทิน', sub: 'วันหยุดไทย · วันพระ · นับถอยหลัง · นาฬิกาโลก',
  html: `<div class="cd-grid" id="cal-cd"></div>
    <div class="box"><div class="cal-head"><button type="button" data-nav="-1" aria-label="เดือนก่อน">‹</button><b id="cal-title"></b><button type="button" data-nav="1" aria-label="เดือนถัดไป">›</button><button type="button" data-nav="0" class="today-btn">วันนี้</button></div>
      <div class="cal-grid" id="cal-grid"></div>
      <div class="cal-pick" id="cal-pick" hidden></div>
      <div class="cal-legend"><span><i style="background:#ff3b5c"></i>วันหยุด</span><span><i style="background:var(--hud)"></i>วันสำคัญ</span><span>☸ วันพระ (โดยประมาณ ±1 วัน)</span></div></div>
    <div class="box"><div class="p-lbl">THIS MONTH · วันสำคัญเดือนนี้</div><div id="cal-list"></div></div>
    <div class="box"><div class="p-lbl">WORLD CLOCK · นาฬิกาโลก</div><div class="wc-grid" id="cal-world"></div></div>
    <p class="hint">วันหยุดจากปฏิทินวันหยุดไทยของ Google (อัปเดตอัตโนมัติ) · วันหยุดพิเศษที่ ครม. ประกาศเพิ่มอาจมาช้า</p>`,
  init(c) {
    ctx = c;
    const panel = document.getElementById('p-cal');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.nav !== undefined) {
        if (b.dataset.nav === '0') { view = new Date(); view.setDate(1); picked = iso(new Date()); }
        else view = new Date(view.getFullYear(), view.getMonth() + +b.dataset.nav, 1);
        renderMonth(); renderPicked();
      }
      if (b.dataset.k) { picked = b.dataset.k; renderMonth(); renderPicked(); }
      if ('pay' in b.dataset) {
        const v = prompt('เงินเดือนออกวันที่เท่าไหร่ของเดือน? (1–31) หรือพิมพ์ "สิ้นเดือน"', ctx.store.get('payday', 'last') === 'last' ? 'สิ้นเดือน' : ctx.store.get('payday'));
        if (v === null) return;
        ctx.store.set('payday', /สิ้น|last/.test(v) ? 'last' : String(Math.max(1, Math.min(31, parseInt(v, 10) || 25))));
        renderCountdowns();
      }
    });
    // ปัดซ้าย-ขวาบนปฏิทิน = เปลี่ยนเดือน (ไม่ใช่เปลี่ยนแผง)
    document.getElementById('cal-grid').classList.add('no-swipe');
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-cal');
    ctx.addReporter(async () => {
      await start().catch(() => {});
      const out = [], nh = nextHoliday(), np = nextPhra(), pd = nextPayday();
      if (nh) { const d = daysTo(new Date(`${nh.date}T00:00`)); out.push(d === 0 ? `วันนี้เป็น${nh.name.split(' / ')[0]}` : `อีก ${d} วันถึงวันหยุด ${nh.name.split(' / ')[0]}`); }
      if (np && daysTo(np.date) <= 1) out.push(daysTo(np.date) === 0 ? 'วันนี้เป็นวันพระ' : 'พรุ่งนี้เป็นวันพระ');
      if (pd && daysTo(pd) <= 3) out.push(daysTo(pd) === 0 ? 'วันนี้เงินเดือนออก' : `อีก ${daysTo(pd)} วันเงินเดือนออก`);
      return out;
    });
    ctx.addIntent(/วันหยุด|หยุดยาว|holiday/, () => {
      start();
      const nh = nextHoliday();
      if (!nh) return { text: 'กำลังโหลดข้อมูลวันหยุดค่ะ', go: go() };
      const l = nextLongWeekend();
      return { text: `วันหยุดถัดไปคือ ${nh.name.split(' / ')[0]} ${fmtS(new Date(`${nh.date}T00:00`))} อีก ${daysTo(new Date(`${nh.date}T00:00`))} วัน${l ? ` ส่วนหยุดยาวถัดไป ${fmtS(l.start)} หยุด ${l.days} วันค่ะ` : 'ค่ะ'}`, go: go() };
    }, 'วันหยุดถัดไปเมื่อไหร่');
    ctx.addIntent(/วันพระ/, () => { const p = nextPhra(); return { text: p ? `วันพระถัดไป${fmtS(p.date)} ${p.name} อีก ${daysTo(p.date)} วันค่ะ (โดยประมาณ)` : 'กำลังคำนวณค่ะ', go: go() }; });
    ctx.addIntent(/เงินเดือน|เงินออก|payday/, () => { const p = nextPayday(); return { text: p ? `เงินเดือนออก${fmtS(p)} อีก ${daysTo(p)} วันค่ะ` : 'ยังไม่ได้ตั้งวันเงินเดือนออกค่ะ', go: go() }; });
    ctx.addIntent(/ญี่ปุ่น|โตเกียว|อเมริกา|นิวยอร์ก|ลอนดอน|อังกฤษ|จีน|เวลา.*ประเทศ|นาฬิกาโลก/, (q) => {
      const z = ZONES.find(([n]) => q.includes(n)) || (/ญี่ปุ่น/.test(q) ? ZONES[1] : /จีน/.test(q) ? ZONES[2] : /อเมริกา/.test(q) ? ZONES[5] : /อังกฤษ/.test(q) ? ZONES[4] : null);
      if (!z) return { text: 'เปิดนาฬิกาโลกให้แล้วค่ะ', go: go() };
      return { text: `ตอนนี้ที่${z[0]} เวลา ${new Date().toLocaleTimeString('th-TH', { timeZone: z[1], hour: 'numeric', minute: '2-digit' })} นาฬิกาค่ะ`, go: go() };
    });
  },
  show: start,
  hide() { clearInterval(clockTimer); },
};
