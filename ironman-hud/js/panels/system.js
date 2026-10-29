// แผง SYSTEM: หน้าจอตรวจสอบระบบ — ข้อมูลเครื่อง/จอ/ชิปกราฟิก · แบต (ถ้าเครื่องยอมให้อ่าน) · สถานะเน็ต
// + ทดสอบความเร็วเน็ตจริง (ping / ดาวน์โหลด / อัปโหลด) กับเซิร์ฟเวอร์ Cloudflare (ฟรี ใช้เน็ตประมาณ 20–40 MB ต่อครั้ง)
let ctx, fpsVal = 0, testing = false, lastTest = null;
const CF = 'https://speed.cloudflare.com';
const $ = (id) => document.getElementById(id);
const row = (k, v, ok) => `<div class="sy-row"><span>${k}</span><b${ok === false ? ' class="no"' : ok ? ' class="yes"' : ''}>${v}</b></div>`;

// ---------- ข้อมูลเครื่อง ----------
function deviceInfo() {
  const ua = navigator.userAgent;
  const ios = ua.match(/OS (\d+)[._](\d+)/), android = ua.match(/Android ([\d.]+)/);
  const model = /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh.*Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : android ? 'Android' : /Windows/.test(ua) ? 'Windows PC' : /Macintosh/.test(ua) ? 'Mac' : 'อื่นๆ';
  const os = ios ? `iOS ${ios[1]}.${ios[2]}` : android ? `Android ${android[1]}` : (ua.match(/Windows NT [\d.]+/) || ua.match(/Mac OS X [\d_]+/) || [''])[0].replace(/_/g, '.');
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'อื่นๆ';
  let gpu = '—';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : 'ไม่รองรับ WebGL';
  } catch { /* ไม่เป็นไร */ }
  const dpr = devicePixelRatio || 1;
  return {
    model, os, br, gpu,
    screen: `${screen.width} × ${screen.height} pt`,
    phys: `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)} px (×${dpr})`,
    view: `${innerWidth} × ${innerHeight}`,
    orient: (screen.orientation?.type || (innerWidth > innerHeight ? 'landscape' : 'portrait')).startsWith('landscape') ? 'แนวนอน' : 'แนวตั้ง',
    cores: navigator.hardwareConcurrency || '—',
    mem: navigator.deviceMemory ? `${navigator.deviceMemory} GB ขึ้นไป` : 'เครื่องไม่บอก',
    touch: navigator.maxTouchPoints || 0,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
// วัดอัตราเฟรมจริงของจอ (60Hz / 120Hz ProMotion)
function measureFps() {
  let n = 0; const t0 = performance.now();
  const step = (t) => { n++; if (t - t0 < 1000) requestAnimationFrame(step); else { fpsVal = Math.round(n * 1000 / (t - t0)); render(); } };
  requestAnimationFrame(step);
}

async function renderDevice() {
  const d = deviceInfo();
  $('sy-dev').innerHTML = row('อุปกรณ์', d.model) + row('ระบบปฏิบัติการ', d.os || '—') + row('เบราว์เซอร์', d.br) + row('ชิปกราฟิก', ctx.esc(d.gpu))
    + row('จอ (หน่วยเว็บ)', d.screen) + row('ความละเอียดจริง', d.phys) + row('พื้นที่แสดงผล', `${d.view} · ${d.orient}`) + row('อัตรารีเฟรช', fpsVal ? `${fpsVal} Hz${fpsVal > 90 ? ' (ProMotion)' : ''}` : 'กำลังวัด…')
    + row('แกนประมวลผล', d.cores) + row('หน่วยความจำ', d.mem) + row('จุดสัมผัสพร้อมกัน', d.touch) + row('ภาษา / เขตเวลา', `${d.lang} · ${d.tz}`);
  // แบตเตอรี่: iPhone (Safari) ไม่ให้เว็บอ่าน
  let bat = row('แบตเตอรี่', 'iPhone ไม่อนุญาตให้เว็บอ่านค่าแบต', false);
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      bat = row('แบตเตอรี่', `${Math.round(b.level * 100)}% ${b.charging ? '⚡ กำลังชาร์จ' : ''}`, true);
      $('sy-batbar').hidden = false;
      $('sy-batbar').firstElementChild.style.width = `${b.level * 100}%`;
    }
  } catch { /* ไม่เป็นไร */ }
  $('sy-bat').innerHTML = bat;
  // พื้นที่เก็บข้อมูลของแอป
  let store = '—';
  try { const e = await navigator.storage?.estimate(); if (e) store = `${(e.usage / 1048576).toFixed(1)} MB ใช้ไป (จากโควตา ${(e.quota / 1073741824).toFixed(1)} GB)`; } catch { /* ไม่เป็นไร */ }
  $('sy-app').innerHTML = row('ติดตั้งบนหน้าจอโฮม', d.standalone ? 'ใช่ (เปิดแบบแอป)' : 'ไม่ (เปิดในเบราว์เซอร์)', d.standalone)
    + row('ทำงานออฟไลน์', navigator.serviceWorker?.controller ? 'พร้อม' : window.isSecureContext ? 'กำลังเตรียม' : 'ใช้ไม่ได้ (ต้อง https)', !!navigator.serviceWorker?.controller)
    + row('การเชื่อมต่อปลอดภัย (https)', window.isSecureContext ? 'ใช่' : 'ไม่ (http ในวง LAN)', window.isSecureContext)
    + row('ข้อมูลในเครื่อง', store) + row('ธีมระบบ', d.dark ? 'โหมดมืด' : 'โหมดสว่าง');
  // ความสามารถของเครื่อง
  const cap = [
    ['GPS', 'geolocation' in navigator && window.isSecureContext], ['กล้อง/ไมค์', !!navigator.mediaDevices?.getUserMedia], ['เซนเซอร์ทิศทาง', 'DeviceOrientationEvent' in window],
    ['เซนเซอร์การเคลื่อนไหว', 'DeviceMotionEvent' in window], ['ฟังเสียงพูด', !!(window.SpeechRecognition || window.webkitSpeechRecognition)], ['อ่านออกเสียง', 'speechSynthesis' in window],
    ['กันจอดับ', 'wakeLock' in navigator], ['สั่น', 'vibrate' in navigator], ['แชร์ไฟล์', !!navigator.canShare], ['3D (WebGL)', d.gpu !== 'ไม่รองรับ WebGL'],
  ];
  $('sy-cap').innerHTML = cap.map(([n, ok]) => `<span class="${ok ? 'yes' : 'no'}">${ok ? '✓' : '✕'} ${n}</span>`).join('');
}

// ---------- เน็ต ----------
function renderNet() {
  const c = navigator.connection;
  $('sy-net').innerHTML = row('สถานะ', navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์', navigator.onLine)
    + (c ? row('ประเภท (เครื่องประเมิน)', `${(c.effectiveType || '—').toUpperCase()}${c.downlink ? ` · ~${c.downlink} Mbps` : ''}${c.rtt ? ` · ${c.rtt} ms` : ''}`) : row('ประเภทเครือข่าย', 'iPhone ไม่บอก (ทดสอบความเร็วด้านล่างแทน)'))
    + (lastTest?.ip ? row('IP สาธารณะ', `${lastTest.ip} · ${lastTest.loc} (ศูนย์ ${lastTest.colo})`) : '');
}
async function trace() {
  try {
    const t = await (await fetch(`${CF}/cdn-cgi/trace`, { cache: 'no-store' })).text();
    const g = (k) => (t.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '';
    return { ip: g('ip'), loc: g('loc'), colo: g('colo') };
  } catch { return {}; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ping(n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fetch(`${CF}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' });
    out.push(performance.now() - t0);
  }
  out.sort((a, b) => a - b);
  const med = out[Math.floor(out.length / 2)];
  const jitter = out.slice(1).reduce((s, v, i) => s + Math.abs(v - out[i]), 0) / (out.length - 1);
  return { med, jitter };
}
/** ดาวน์โหลดเรื่อยๆ ไม่เกิน ms มิลลิวินาที แล้วคิดความเร็วจากจำนวนไบต์ที่ได้จริง */
async function download(ms, onRate) {
  const ac = new AbortController(), t0 = performance.now();
  let bytes = 0;
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    while (performance.now() - t0 < ms) {
      const r = await fetch(`${CF}/__down?bytes=25000000&r=${Math.random()}`, { cache: 'no-store', signal: ac.signal });
      const rd = r.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        bytes += value.length;
        onRate(bytes * 8 / ((performance.now() - t0) / 1000) / 1e6);
      }
    }
  } catch { /* หมดเวลา = จบการทดสอบ */ } finally { clearTimeout(timer); }
  return bytes * 8 / ((performance.now() - t0) / 1000) / 1e6;
}
async function upload(ms, onRate) {
  const chunk = new Uint8Array(2 * 1048576);
  crypto.getRandomValues?.(chunk.subarray(0, 65536)); // ข้อมูลสุ่มบางส่วน กันการบีบอัด
  const t0 = performance.now();
  let bytes = 0;
  while (performance.now() - t0 < ms) {
    try { await fetch(`${CF}/__up?r=${Math.random()}`, { method: 'POST', body: chunk, cache: 'no-store' }); bytes += chunk.length; } catch { break; }
    onRate(bytes * 8 / ((performance.now() - t0) / 1000) / 1e6);
  }
  return bytes * 8 / ((performance.now() - t0) / 1000) / 1e6;
}
const rate = (mbps) => (mbps >= 100 ? ['ดีมาก', '#2ee6a6', 'วิดีโอ 4K หลายจอ, โหลดไฟล์ใหญ่สบาย'] : mbps >= 25 ? ['ดี', '#2ee6a6', 'วิดีโอ 4K, วิดีโอคอล HD ได้สบาย'] : mbps >= 8 ? ['พอใช้', '#ffd23f', 'วิดีโอ HD, ประชุมออนไลน์ได้'] : mbps >= 2 ? ['ช้า', '#ff8a3d', 'แชต/เว็บได้ วิดีโออาจกระตุก'] : ['ช้ามาก', '#ff3b5c', 'ใช้งานได้จำกัด']);
function gauge(id, v, max = 200) {
  const el = $(id);
  el.querySelector('b').textContent = v >= 100 ? Math.round(v) : v.toFixed(1);
  el.querySelector('.sg-arc').style.strokeDashoffset = 220 * (1 - Math.min(1, Math.log10(1 + v) / Math.log10(1 + max)));
}
async function speedTest() {
  if (testing) return;
  if (!navigator.onLine) { ctx.toast('ไม่ได้ต่ออินเทอร์เน็ต'); return; }
  testing = true;
  const btn = $('sy-run'), st = $('sy-stage');
  btn.disabled = true; btn.textContent = 'กำลังทดสอบ…';
  ['sy-g-down', 'sy-g-up'].forEach((g) => gauge(g, 0));
  $('sy-ping').textContent = '—'; $('sy-verdict').innerHTML = '';
  try {
    st.textContent = 'หาเซิร์ฟเวอร์ที่ใกล้ที่สุด…';
    const tr = await trace();
    st.textContent = 'วัดความหน่วง (ping)…';
    await fetch(`${CF}/__down?bytes=0`, { cache: 'no-store' }); // อุ่นเครื่อง
    const p = await ping();
    $('sy-ping').innerHTML = `${Math.round(p.med)}<small> ms · กระตุก ${Math.round(p.jitter)} ms</small>`;
    st.textContent = 'ทดสอบดาวน์โหลด…';
    const down = await download(8000, (v) => gauge('sy-g-down', v));
    gauge('sy-g-down', down);
    st.textContent = 'ทดสอบอัปโหลด…';
    const up = await upload(6000, (v) => gauge('sy-g-up', v));
    gauge('sy-g-up', up);
    lastTest = { ...tr, down, up, ping: p.med, at: Date.now() };
    ctx.store.set('speedTest', lastTest);
    const [lv, col, use] = rate(down);
    $('sy-verdict').innerHTML = `<b style="color:${col}">${lv}</b> · ${use}`;
    st.textContent = `ทดสอบเสร็จ ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · เซิร์ฟเวอร์ Cloudflare ${tr.colo || ''}`;
    ctx.fx.play('ok');
    renderNet();
  } catch {
    st.textContent = 'ทดสอบไม่สำเร็จ ลองใหม่อีกครั้ง';
    ctx.fx.play('error');
  }
  testing = false;
  btn.disabled = false; btn.textContent = '▶ ทดสอบอีกครั้ง';
}

function render() { renderDevice(); renderNet(); }
const G = (id, label) => `<div class="sg" id="${id}"><svg viewBox="0 0 100 70" aria-hidden="true"><path d="M12 62 A40 40 0 1 1 88 62" class="sg-bg"/><path d="M12 62 A40 40 0 1 1 88 62" class="sg-arc" stroke-dasharray="220" stroke-dashoffset="220"/></svg><b>0</b><small>Mbps · ${label}</small></div>`;

export default {
  id: 'p-system', en: 'SYSTEM', th: 'ระบบ', sub: 'ตรวจสอบเครื่อง · ทดสอบความเร็วเน็ต',
  html: `<div class="box sy-speed"><div class="p-lbl">NETWORK SPEED · ทดสอบความเร็วเน็ต</div>
      <div class="sg-row">${G('sy-g-down', 'ดาวน์โหลด')}${G('sy-g-up', 'อัปโหลด')}</div>
      <div class="sy-ping"><span>PING</span><b id="sy-ping">—</b></div>
      <div class="sy-verdict" id="sy-verdict"></div>
      <button type="button" class="set-btn wide-btn" id="sy-run">▶ เริ่มทดสอบ</button>
      <p class="hint left" id="sy-stage">ใช้เน็ตประมาณ 20–40 MB ต่อครั้ง (ถ้าใช้เน็ตมือถือจะเสียโควตา)</p></div>
    <div class="box"><div class="p-lbl">CAPABILITIES · ความสามารถของเครื่อง</div><div class="sy-cap" id="sy-cap"></div></div>
    <div class="box"><div class="p-lbl">DEVICE · ข้อมูลเครื่อง</div><div id="sy-dev"></div></div>
    <div class="box"><div class="p-lbl">POWER · แบตเตอรี่</div><div id="sy-bat"></div><div class="meter" id="sy-batbar" hidden><span></span></div></div>
    <div class="box"><div class="p-lbl">NETWORK · เครือข่าย</div><div id="sy-net"></div></div>
    <div class="box"><div class="p-lbl">APP · สถานะแอป</div><div id="sy-app"></div></div>`,
  init(c) {
    ctx = c;
    lastTest = ctx.store.get('speedTest', null);
    $('sy-run').addEventListener('click', speedTest);
    addEventListener('online', renderNet); addEventListener('offline', renderNet);
    addEventListener('resize', () => { if (document.getElementById('p-system').classList.contains('on')) renderDevice(); });
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-system');
    ctx.addIntent(/ความเร็วเน็ต|เน็ตเร็ว|เน็ตช้า|speed ?test|สปีดเทส|ทดสอบเน็ต/, () => {
      setTimeout(speedTest, 1500);
      return { text: lastTest ? `ครั้งก่อนวัดได้ดาวน์โหลด ${Math.round(lastTest.down)} อัปโหลด ${Math.round(lastTest.up)} เมกะบิตค่ะ กำลังทดสอบใหม่` : 'กำลังทดสอบความเร็วเน็ตค่ะ', go: go() };
    }, 'ทดสอบความเร็วเน็ต');
    ctx.addIntent(/ข้อมูลเครื่อง|ตรวจสอบระบบ|สเปค|system/, () => ({ text: 'เปิดหน้าตรวจสอบระบบให้แล้วค่ะ', go: go() }));
  },
  show() { render(); measureFps(); if (lastTest && !testing) { gauge('sy-g-down', lastTest.down); gauge('sy-g-up', lastTest.up); $('sy-ping').textContent = `${Math.round(lastTest.ping)} ms`; $('sy-stage').textContent = `ผลครั้งก่อน ${new Date(lastTest.at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`; } },
};
