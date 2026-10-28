// แผง TOOLS: จับเวลา/นับถอยหลัง/Pomodoro · โน้ต/สิ่งที่ต้องทำ · เครื่องคิดเลข · แปลงหน่วย (มีหน่วยไทย ไร่-งาน-ตารางวา)
// ทุกอย่างเก็บในเครื่อง · iPhone หยุดการทำงานของเว็บเมื่อสลับแอป → เวลาจับจากนาฬิกาจริง กลับมาแล้วยังตรง
let ctx;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (ms, cs = false) => {
  const t = Math.max(0, ms), h = Math.floor(t / 3600e3), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60;
  return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}${cs ? `<small>.${pad(Math.floor(t / 10) % 100)}</small>` : ''}`;
};

// ---------- จับเวลา ----------
// T = { mode:'timer'|'watch'|'pomo', end, dur, start, acc, running, laps[], pomo:{phase, round} }
let T;
const POMO = { work: 25, short: 5, long: 15, rounds: 4 };
function saveT() { ctx.store.set('timer', T); }
function loadT() { T = ctx.store.get('timer', null) || { mode: 'timer', dur: 5 * 60000, running: false, acc: 0, laps: [], pomo: { phase: 'work', round: 1 } }; }
function remaining() {
  if (T.mode === 'watch') return T.running ? T.acc + (Date.now() - T.start) : T.acc;
  return T.running ? T.end - Date.now() : T.left ?? T.dur;
}
function startTimer() {
  if (T.running) return;
  if (T.mode === 'watch') T.start = Date.now();
  else T.end = Date.now() + (T.left ?? T.dur);
  T.running = true; saveT(); ctx.fx.play('ok');
}
function pauseTimer() {
  if (!T.running) return;
  if (T.mode === 'watch') T.acc += Date.now() - T.start; else T.left = Math.max(0, T.end - Date.now());
  T.running = false; saveT();
}
function resetTimer() { T.running = false; T.left = null; T.acc = 0; T.laps = []; if (T.mode === 'pomo') { T.pomo = { phase: 'work', round: 1 }; T.dur = POMO.work * 60000; } saveT(); }
function setMode(m) { pauseTimer(); T.mode = m; T.left = null; T.acc = 0; T.laps = []; if (m === 'pomo') { T.pomo = { phase: 'work', round: 1 }; T.dur = POMO.work * 60000; } saveT(); renderTimer(); }
function setDur(min) { T.mode = T.mode === 'watch' ? 'timer' : T.mode; T.dur = min * 60000; T.left = null; T.running = false; saveT(); startTimer(); renderTimer(); }
function done() {
  T.running = false; T.left = null;
  ctx.fx.play('alarm');
  navigator.vibrate?.([400, 200, 400]);
  let msg = 'หมดเวลาแล้วค่ะ';
  if (T.mode === 'pomo') { // วน Pomodoro: ทำงาน → พัก → ทำงาน … ครบ 4 รอบพักยาว
    const p = T.pomo;
    if (p.phase === 'work') { const long = p.round % POMO.rounds === 0; p.phase = long ? 'long' : 'short'; T.dur = (long ? POMO.long : POMO.short) * 60000; msg = long ? 'ครบ 4 รอบแล้ว พักยาว 15 นาทีค่ะ' : 'ได้เวลาพัก 5 นาทีค่ะ'; }
    else { p.phase = 'work'; p.round++; T.dur = POMO.work * 60000; msg = `เริ่มโฟกัสรอบที่ ${p.round} ค่ะ`; }
    saveT(); startTimer();
  } else saveT();
  ctx.toast(`⏰ ${msg}`);
  ctx.speak(msg);
}
function renderTimer() {
  const box = document.getElementById('tl-timer');
  if (!box) return;
  const r = remaining();
  if (T.mode !== 'watch' && T.running && r <= 0) { done(); }
  const total = T.mode === 'watch' ? 60000 : T.dur;
  const frac = T.mode === 'watch' ? (r % 60000) / 60000 : Math.max(0, Math.min(1, r / total));
  const C = 2 * Math.PI * 88;
  box.querySelector('.tm-arc').style.strokeDashoffset = C * (1 - frac);
  box.querySelector('.tm-time').innerHTML = fmt(T.mode === 'watch' ? r : Math.max(0, r), T.mode === 'watch');
  const ph = { work: '🎯 โฟกัส', short: '☕ พักสั้น', long: '🛋 พักยาว' };
  box.querySelector('.tm-sub').textContent = T.mode === 'pomo' ? `${ph[T.pomo.phase]} · รอบ ${T.pomo.round}/${POMO.rounds}` : T.mode === 'watch' ? 'จับเวลา' : 'นับถอยหลัง';
  box.querySelector('[data-t=go]').textContent = T.running ? '⏸ หยุด' : '▶ เริ่ม';
  box.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === T.mode));
  box.querySelector('.tm-presets').hidden = T.mode !== 'timer';
  box.querySelector('[data-t=lap]').hidden = T.mode !== 'watch';
  box.querySelector('.tm-laps').innerHTML = T.mode === 'watch' ? T.laps.map((l, i) => `<span>รอบ ${i + 1}<b>${fmt(l, true)}</b></span>`).reverse().join('') : '';
}

// ---------- โน้ต / To-do ----------
let notes;
function addNote(text) { if (!text.trim()) return; notes.unshift({ id: Date.now(), text: text.trim().slice(0, 300), done: false, at: Date.now() }); ctx.store.set('notes', notes); renderNotes(); }
function renderNotes() {
  const ul = document.getElementById('tl-notes');
  if (!ul) return;
  const open = notes.filter((n) => !n.done).length;
  document.getElementById('tl-notes-count').textContent = `${open} รายการค้าง`;
  ul.innerHTML = notes.map((n) => `<li class="${n.done ? 'done' : ''}" data-id="${n.id}"><label><input type="checkbox"${n.done ? ' checked' : ''}><span>${ctx.esc(n.text)}</span></label><button type="button" aria-label="ลบ">×</button></li>`).join('') || '<li class="empty">ยังไม่มีโน้ต · พิมพ์ด้านบน หรือบอก EDIT ว่า "จดว่า …"</li>';
}

// ---------- เครื่องคิดเลข (ไม่ใช้ eval: แปลงเป็น RPN แล้วคำนวณ) ----------
function evaluate(src) {
  const s = src.replace(/×|x/gi, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
  const tok = s.match(/\d*\.?\d+(?:e[+-]?\d+)?|[+\-*/^%()]/gi);
  if (!tok || tok.join('') !== s) throw new Error('สูตรไม่ถูกต้อง');
  const out = [], ops = [], prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3, 'u': 4 };
  let prev = null;
  for (const t of tok) {
    if (/\d/.test(t)) out.push(parseFloat(t));
    else if (t === '(') ops.push(t);
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); if (!ops.length) throw new Error('วงเล็บไม่ครบ'); ops.pop(); }
    else {
      const op = t === '-' && (prev === null || /[+\-*/^%(]/.test(prev)) ? 'u' : t;
      while (ops.length && ops[ops.length - 1] !== '(' && (prec[ops[ops.length - 1]] > prec[op] || (prec[ops[ops.length - 1]] === prec[op] && op !== '^' && op !== 'u'))) out.push(ops.pop());
      ops.push(op);
    }
    prev = t;
  }
  while (ops.length) { const o = ops.pop(); if (o === '(') throw new Error('วงเล็บไม่ครบ'); out.push(o); }
  const st = [];
  for (const t of out) {
    if (typeof t === 'number') { st.push(t); continue; }
    if (t === 'u') { st.push(-st.pop()); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) throw new Error('สูตรไม่ถูกต้อง');
    st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : t === '/' ? a / b : t === '%' ? a % b : a ** b);
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) throw new Error('คำนวณไม่ได้');
  return +st[0].toPrecision(12);
}
// "เจ็ด คูณ แปด" / "7 คูณ 8" → "7*8"
const THNUM = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
function thaiWordsToNumber(w) { // รองรับถึงหลักล้านแบบง่าย เช่น "สามร้อยยี่สิบห้า"
  let total = 0, cur = 0, ok = false;
  const re = /(ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน)/g;
  for (const [t] of w.matchAll(re)) {
    ok = true;
    if (t in THNUM) cur = THNUM[t];
    else { const mul = { สิบ: 10, ร้อย: 100, พัน: 1e3, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6 }[t]; if (t === 'ล้าน') { total = (total + (cur || 1)) * mul; cur = 0; } else { total += (cur || 1) * mul; cur = 0; } }
  }
  return ok ? total + cur : null;
}
function speechToExpr(q) {
  let s = q.replace(/คำนวณ|เท่ากับเท่าไหร่|เท่าไหร่|เท่าไร|ได้เท่าไหร่|ได้|ค่ะ|ครับ|=/g, ' ')
    .replace(/บวก/g, '+').replace(/ลบ/g, '-').replace(/คูณ/g, '*').replace(/หาร/g, '/').replace(/ยกกำลัง/g, '^').replace(/เปอร์เซ็นต์ของ/g, '/100*');
  s = s.replace(/[ก-๙]+/g, (w) => { const n = thaiWordsToNumber(w); return n == null ? ' ' : String(n); });
  return s.replace(/\s+/g, '');
}

// ---------- แปลงหน่วย ----------
const UNITS = {
  'ความยาว': { 'มิลลิเมตร': 0.001, 'เซนติเมตร': 0.01, 'เมตร': 1, 'กิโลเมตร': 1000, 'นิ้ว': 0.0254, 'ฟุต': 0.3048, 'หลา': 0.9144, 'ไมล์': 1609.344, 'วา': 2, 'ศอก': 0.5, 'คืบ': 0.25 },
  'พื้นที่': { 'ตารางเมตร': 1, 'ตารางวา': 4, 'งาน': 400, 'ไร่': 1600, 'ตารางกิโลเมตร': 1e6, 'ตารางฟุต': 0.09290304, 'เอเคอร์': 4046.8564, 'เฮกตาร์': 10000 },
  'น้ำหนัก': { 'กรัม': 1, 'ขีด': 100, 'กิโลกรัม': 1000, 'ตัน': 1e6, 'ออนซ์': 28.349523, 'ปอนด์': 453.59237, 'บาท (ทอง)': 15.244 },
  'ปริมาตร': { 'มิลลิลิตร': 0.001, 'ลิตร': 1, 'ลูกบาศก์เมตร': 1000, 'แกลลอน (US)': 3.785411784, 'ช้อนชา': 0.005, 'ช้อนโต๊ะ': 0.015, 'ถ้วยตวง': 0.24 },
  'อุณหภูมิ': { '°C': 'c', '°F': 'f', 'K': 'k' },
  'ความเร็ว': { 'กม./ชม.': 1 / 3.6, 'เมตร/วินาที': 1, 'ไมล์/ชม.': 0.44704, 'น็อต': 0.514444 },
};
function convUnit(v, cat, a, b) {
  const u = UNITS[cat];
  if (cat === 'อุณหภูมิ') {
    const c = u[a] === 'c' ? v : u[a] === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
    return u[b] === 'c' ? c : u[b] === 'f' ? c * 9 / 5 + 32 : c + 273.15;
  }
  return v * u[a] / u[b];
}
function fillUnits() {
  const cat = document.getElementById('uc-cat').value, names = Object.keys(UNITS[cat]);
  ['uc-a', 'uc-b'].forEach((id, i) => { document.getElementById(id).innerHTML = names.map((n) => `<option>${n}</option>`).join(''); document.getElementById(id).value = names[Math.min(i ? 1 : 0, names.length - 1)]; });
  if (cat === 'พื้นที่') { document.getElementById('uc-a').value = 'ไร่'; document.getElementById('uc-b').value = 'ตารางเมตร'; }
  calcUnit();
}
function calcUnit() {
  const v = parseFloat(document.getElementById('uc-v').value) || 0, cat = document.getElementById('uc-cat').value, a = document.getElementById('uc-a').value, b = document.getElementById('uc-b').value;
  const r = convUnit(v, cat, a, b);
  let extra = '';
  if (cat === 'พื้นที่' && b === 'ตารางเมตร') { // แสดงแบบไทย ไร่-งาน-ตารางวา
    let w = convUnit(v, cat, a, 'ตารางวา'); const rai = Math.floor(w / 400); w -= rai * 400; const ngan = Math.floor(w / 100); w -= ngan * 100;
    extra = `<small>= ${rai} ไร่ ${ngan} งาน ${+w.toFixed(1)} ตารางวา</small>`;
  }
  document.getElementById('uc-r').innerHTML = `<b>${+r.toPrecision(8)}</b> ${b}${extra}`;
}

let raf = 0;
function loop() { renderTimer(); raf = requestAnimationFrame(loop); }

export default {
  id: 'p-tools', en: 'TOOLS', th: 'เครื่องมือ', sub: 'จับเวลา · โน้ต · คิดเลข · แปลงหน่วย',
  html: `<div class="box" id="tl-timer"><div class="chips"><button type="button" data-mode="timer">⏳ นับถอยหลัง</button><button type="button" data-mode="watch">⏱ จับเวลา</button><button type="button" data-mode="pomo">🍅 Pomodoro</button></div>
      <div class="tm-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" class="tm-bg"/><circle cx="100" cy="100" r="88" class="tm-arc" stroke-dasharray="${(2 * Math.PI * 88).toFixed(1)}"/></svg>
        <div class="tm-core"><div class="tm-time">00:00</div><div class="tm-sub"></div></div></div>
      <div class="chips tm-presets">${[1, 3, 5, 10, 15, 30, 60].map((m) => `<button type="button" data-min="${m}">${m} นาที</button>`).join('')}<button type="button" data-min="custom">กำหนดเอง</button></div>
      <div class="chips tm-ctl"><button type="button" data-t="go" class="on">▶ เริ่ม</button><button type="button" data-t="lap">◎ รอบ</button><button type="button" data-t="reset">↺ รีเซ็ต</button></div>
      <div class="tm-laps"></div><p class="hint left">เวลาเดินต่อแม้สลับแอป · แต่ iPhone ไม่ส่งเสียงเตือนถ้าแอปไม่ได้เปิดอยู่</p></div>
    <div class="box"><div class="p-lbl">NOTES · โน้ต / สิ่งที่ต้องทำ <span id="tl-notes-count" class="radar-time"></span></div>
      <form id="tl-note-form" class="tl-add"><input id="tl-note-in" placeholder="เพิ่มรายการ…" autocomplete="off" maxlength="300"><button type="submit">เพิ่ม</button></form>
      <ul class="tl-notes" id="tl-notes"></ul><button type="button" class="link" id="tl-clear">ลบรายการที่เสร็จแล้ว</button></div>
    <div class="box"><div class="p-lbl">CALCULATOR · เครื่องคิดเลข</div>
      <form id="tl-calc-form" class="tl-add"><input id="tl-calc" inputmode="decimal" placeholder="เช่น (1500+250)*7%" autocomplete="off"><button type="submit">=</button></form>
      <div class="calc-out" id="tl-calc-out"></div>
      <div class="calc-keys">${['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '(', '+', ')', '%', '^', 'C'].map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div></div>
    <div class="box"><div class="p-lbl">UNITS · แปลงหน่วย</div>
      <div class="uc"><select id="uc-cat">${Object.keys(UNITS).map((k) => `<option>${k}</option>`).join('')}</select><input id="uc-v" inputmode="decimal" value="1" aria-label="ค่า"><select id="uc-a" aria-label="จาก"></select><span>→</span><select id="uc-b" aria-label="เป็น"></select></div>
      <div class="mn-res" id="uc-r"></div></div>`,
  init(c) {
    ctx = c;
    loadT();
    notes = ctx.store.get('notes', []);
    const panel = document.getElementById('p-tools');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) setMode(b.dataset.mode);
      if (b.dataset.min) { if (b.dataset.min === 'custom') { const v = parseFloat(prompt('ตั้งเวลากี่นาที?', '20')); if (v > 0) setDur(v); } else setDur(+b.dataset.min); }
      if (b.dataset.t === 'go') { if (T.running) pauseTimer(); else startTimer(); }
      if (b.dataset.t === 'reset') resetTimer();
      if (b.dataset.t === 'lap' && T.running) { T.laps.push(remaining()); saveT(); }
      if (b.dataset.k) {
        const i = document.getElementById('tl-calc');
        if (b.dataset.k === 'C') i.value = ''; else i.value += b.dataset.k;
      }
      if (b.id === 'tl-clear') { notes = notes.filter((n) => !n.done); ctx.store.set('notes', notes); renderNotes(); }
      const li = b.closest('#tl-notes li');
      if (li && li.dataset.id) { notes = notes.filter((n) => String(n.id) !== li.dataset.id); ctx.store.set('notes', notes); renderNotes(); }
    });
    document.getElementById('tl-notes').addEventListener('change', (e) => {
      const li = e.target.closest('li'); const n = notes.find((x) => String(x.id) === li?.dataset.id);
      if (n) { n.done = e.target.checked; ctx.store.set('notes', notes); renderNotes(); }
    });
    document.getElementById('tl-note-form').addEventListener('submit', (e) => { e.preventDefault(); const i = document.getElementById('tl-note-in'); addNote(i.value); i.value = ''; });
    document.getElementById('tl-calc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const i = document.getElementById('tl-calc'), out = document.getElementById('tl-calc-out');
      try { const r = evaluate(i.value.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')); out.innerHTML = `${ctx.esc(i.value)} = <b>${r.toLocaleString('th-TH', { maximumFractionDigits: 10 })}</b>`; i.value = String(r); }
      catch (err) { out.textContent = err.message; ctx.fx.play('error'); }
    });
    document.getElementById('uc-cat').addEventListener('change', fillUnits);
    ['uc-v', 'uc-a', 'uc-b'].forEach((id) => document.getElementById(id).addEventListener('input', calcUnit));
    fillUnits(); renderNotes();
    // เวลาเดินแม้ไม่ได้เปิดแผงนี้ → ตรวจหมดเวลาทุกวินาที
    setInterval(() => { if (T.running && T.mode !== 'watch' && remaining() <= 0) { done(); renderTimer(); } }, 1000);
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-tools');
    ctx.addIntent(/ตั้งเวลา|จับเวลา|นับถอยหลัง|เตือนอีก|timer/, (q) => {
      const n = q.match(/(\d+(?:\.\d+)?)/)?.[1] ?? thaiWordsToNumber(q);
      if (/จับเวลา/.test(q) && !n) { setMode('watch'); startTimer(); return { text: 'เริ่มจับเวลาแล้วค่ะ', go: go() }; }
      if (!n) return { text: 'ตั้งกี่นาทีดีคะ ลองพูดว่า ตั้งเวลา 5 นาที', go: go() };
      const min = /ชั่วโมง/.test(q) ? n * 60 : /วินาที/.test(q) ? n / 60 : n;
      if (T.mode === 'watch') setMode('timer');
      setDur(min);
      return { text: `ตั้งเวลา ${n} ${/ชั่วโมง/.test(q) ? 'ชั่วโมง' : /วินาที/.test(q) ? 'วินาที' : 'นาที'} เริ่มนับแล้วค่ะ`, go: go() };
    }, 'ตั้งเวลา 5 นาที');
    ctx.addIntent(/pomodoro|โพโม|โฟกัส/, () => { setMode('pomo'); startTimer(); return { text: 'เริ่มโฟกัส 25 นาทีค่ะ', go: go() }; });
    ctx.addIntent(/^(จด|โน้ต|บันทึก|เตือนความจำ)/, (q, raw) => {
      const text = raw.replace(/^\s*(จดว่า|จดไว้ว่า|จด|โน้ตว่า|บันทึกว่า|เตือนความจำว่า)\s*/, '');
      if (!text || text === raw.trim()) return { text: 'จะให้จดว่าอะไรคะ ลองพูดว่า จดว่า ซื้อนม', go: go() };
      addNote(text);
      return { text: `จดแล้วค่ะ: ${text}`, go: go() };
    }, 'จดว่า ซื้อนม');
    ctx.addIntent(/มีอะไรต้องทำ|สิ่งที่ต้องทำ|โน้ตของฉัน|todo/, () => {
      const open = notes.filter((n) => !n.done);
      return { text: open.length ? `มีงานค้าง ${open.length} รายการค่ะ ${open.slice(0, 3).map((n) => n.text).join(' , ')}` : 'ไม่มีงานค้างค่ะ', go: go() };
    });
    ctx.addIntent(/บวก|ลบ|คูณ|หาร|ยกกำลัง|คำนวณ|\d+[+\-*/x×÷]\d+/, (q, raw) => {
      if (/ดอลลาร์|บาท|ยูโร|เยน/.test(q)) return null; // ให้แผงการเงินตอบ
      try { const r = evaluate(speechToExpr(raw)); return { text: `ได้ ${r.toLocaleString('th-TH', { maximumFractionDigits: 6 })} ค่ะ` }; } catch { return null; }
    }, 'เจ็ดคูณแปด');
    ctx.addIntent(/ไร่|ตารางวา|งาน.*เมตร|แปลงหน่วย|กี่เมตร|กี่กิโล|ฟุต|นิ้ว|ไมล์/, () => ({ text: 'เปิดตัวแปลงหน่วยให้แล้วค่ะ มีหน่วยไทย ไร่ งาน ตารางวาด้วยนะคะ', go: go() }));
    ctx.addReporter(() => {
      const open = notes.filter((n) => !n.done);
      return open.length ? `มีสิ่งที่ต้องทำค้างอยู่ ${open.length} รายการ เช่น ${open[0].text}` : null;
    });
  },
  show() { if (!raf) raf = requestAnimationFrame(loop); renderNotes(); },
  hide() { cancelAnimationFrame(raf); raf = 0; },
};
