// แผง MONEY: อัตราแลกเปลี่ยน (ExchangeRate-API ฟรี วันละครั้ง) · คริปโต (CoinGecko ฟรี) · ตัวแปลงสกุลเงิน
// หมายเหตุ: ราคาทองคำไทยยังไม่มีแหล่งฟรีที่เปิดให้หน้าเว็บดึงได้ จึงยังไม่ใส่
import { getJSON } from '../lib/load.js';

let ctx, fx = null, coins = null, timer = 0;
const SHOW = [['USD', 'ดอลลาร์สหรัฐ', 1], ['EUR', 'ยูโร', 1], ['JPY', 'เยนญี่ปุ่น', 100], ['CNY', 'หยวนจีน', 1], ['GBP', 'ปอนด์', 1], ['KRW', 'วอนเกาหลี', 1000], ['SGD', 'ดอลลาร์สิงคโปร์', 1], ['MYR', 'ริงกิต', 1], ['LAK', 'กีบลาว', 10000], ['MMK', 'จ๊าดพม่า', 1000]];
const COINS = [['bitcoin', 'BTC', 'บิทคอยน์'], ['ethereum', 'ETH', 'อีเธอเรียม'], ['binancecoin', 'BNB', 'บีเอ็นบี'], ['solana', 'SOL', 'โซลานา'], ['ripple', 'XRP', 'ริปเปิล'], ['dogecoin', 'DOGE', 'โดจคอยน์']];
const NAMES_TH = { USD: ['ดอลลาร์', 'usd', 'ดอล'], EUR: ['ยูโร', 'eur'], JPY: ['เยน', 'jpy'], CNY: ['หยวน', 'cny'], GBP: ['ปอนด์', 'gbp'], KRW: ['วอน', 'krw'], SGD: ['สิงคโปร์', 'sgd'], MYR: ['ริงกิต', 'myr'], LAK: ['กีบ', 'lak'], THB: ['บาท', 'thb'] };
const num = (v, d = 2) => Number(v).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: v < 10 ? Math.min(d, 2) : 0 });

/** อัตรา: 1 หน่วยสกุล X = กี่บาท */
const thbPer = (code) => (code === 'THB' ? 1 : fx?.rates[code] ? 1 / fx.rates[code] : null);
function convert(amount, from, to) { const a = thbPer(from), b = thbPer(to); return a && b ? amount * a / b : null; }

async function load() {
  fx = ctx.store.get('fx', null);
  if (!fx || Date.now() - fx.at > 6 * 3600e3) {
    try { const d = await getJSON('https://open.er-api.com/v6/latest/THB'); if (d.result === 'success') { fx = { rates: d.rates, upd: d.time_last_update_unix * 1000, at: Date.now() }; ctx.store.set('fx', fx); } } catch { /* ใช้ค่าเดิม */ }
  }
  try {
    const d = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${COINS.map((c) => c[0]).join(',')}&vs_currencies=thb,usd&include_24hr_change=true`);
    coins = { d, at: Date.now() };
  } catch { /* ใช้ค่าเดิม */ }
  render();
}
function render() {
  if (fx) {
    document.getElementById('mn-fx').innerHTML = SHOW.filter(([c]) => fx.rates[c]).map(([c, n, u]) => `<div class="fx-row"><span><b>${u.toLocaleString()} ${c}</b><small>${n}</small></span><em>${num(thbPer(c) * u, 4)} ฿</em></div>`).join('');
    document.getElementById('mn-fx-at').textContent = `อัปเดต ${new Date(fx.upd).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (ค่ากลาง ไม่ใช่เรตซื้อขายของธนาคาร)`;
    const sel = Object.keys(fx.rates).filter((c) => c.length === 3).sort();
    ['mn-from', 'mn-to'].forEach((id, i) => {
      const s = document.getElementById(id);
      if (s.options.length) return;
      const pri = ['THB', 'USD', 'EUR', 'JPY', 'CNY', 'GBP', 'KRW', 'SGD', 'MYR', 'LAK'];
      s.innerHTML = [...pri, ...sel.filter((c) => !pri.includes(c))].map((c) => `<option>${c}</option>`).join('');
      s.value = i ? 'THB' : 'USD';
    });
    calc();
  }
  if (coins) {
    document.getElementById('mn-coins').innerHTML = COINS.filter(([id]) => coins.d[id]).map(([id, sym, th]) => {
      const x = coins.d[id], ch = x.thb_24h_change ?? 0;
      return `<div class="fx-row"><span><b>${sym}</b><small>${th} · $${num(x.usd, x.usd < 1 ? 4 : 0)}</small></span><em>${num(x.thb, x.thb < 10 ? 4 : 0)} ฿<small class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%</small></em></div>`;
    }).join('');
    document.getElementById('mn-coins-at').textContent = `CoinGecko · อัปเดต ${new Date(coins.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · ราคาผันผวนสูง ไม่ใช่คำแนะนำการลงทุน`;
  }
}
function calc() {
  const a = parseFloat(document.getElementById('mn-amt').value.replace(/,/g, '')) || 0;
  const f = document.getElementById('mn-from').value, t = document.getElementById('mn-to').value;
  const r = convert(a, f, t);
  document.getElementById('mn-res').innerHTML = r == null ? '—' : `${num(a)} ${f} = <b>${num(r, r < 1 ? 6 : 2)}</b> ${t}`;
}

// "100 ดอลลาร์เป็นบาท" / "ดอลลาร์เท่าไหร่"
function parseMoney(q) {
  const code = (w) => Object.entries(NAMES_TH).find(([, ws]) => ws.some((x) => w.includes(x)))?.[0];
  const m = q.match(/([\d.,]+)\s*([^\d\s]+?)(?:เป็น|เท่ากับ|กี่|=|to)([^\d\s]+)/);
  if (m) { const f = code(m[2]), t = code(m[3]) || 'THB'; if (f) return { amt: parseFloat(m[1].replace(/,/g, '')), f, t }; }
  const only = code(q);
  if (only && only !== 'THB') return { amt: 1, f: only, t: 'THB' };
  return null;
}

export default {
  id: 'p-money', en: 'MONEY', th: 'การเงิน', sub: 'อัตราแลกเปลี่ยน · คริปโต · แปลงเงิน',
  html: `<div class="box"><div class="p-lbl">CONVERTER · แปลงสกุลเงิน</div>
      <div class="mn-conv"><input id="mn-amt" inputmode="decimal" value="100" aria-label="จำนวนเงิน"><select id="mn-from" aria-label="จาก"></select><button type="button" id="mn-swap" aria-label="สลับ">⇄</button><select id="mn-to" aria-label="เป็น"></select></div>
      <div class="mn-res" id="mn-res">—</div></div>
    <div class="box"><div class="p-lbl">EXCHANGE RATES · อัตราแลกเปลี่ยน (เทียบบาท)</div><div id="mn-fx"><p class="hint left">กำลังโหลด…</p></div><p class="hint left" id="mn-fx-at"></p></div>
    <div class="box"><div class="p-lbl">CRYPTO · คริปโต</div><div id="mn-coins"><p class="hint left">กำลังโหลด…</p></div><p class="hint left" id="mn-coins-at"></p></div>`,
  init(c) {
    ctx = c;
    ['mn-amt', 'mn-from', 'mn-to'].forEach((id) => document.getElementById(id).addEventListener('input', calc));
    document.getElementById('mn-swap').addEventListener('click', () => { const f = document.getElementById('mn-from'), t = document.getElementById('mn-to'); [f.value, t.value] = [t.value, f.value]; calc(); });
    setTimeout(load, 9000); // โหลดค่าเงินล่วงหน้า (เก็บไว้ 6 ชม.) ให้คำสั่งเสียงตอบได้ทันที
    const go = () => ctx.panels.findIndex((p) => p.id === 'p-money');
    ctx.addIntent(/บิท|bitcoin|btc|คริปโต|อีเธอ|coins/, () => {
      if (!coins) { load(); return { text: 'กำลังโหลดราคาคริปโตค่ะ', go: go() }; }
      const b = coins.d.bitcoin;
      return { text: `บิทคอยน์ตอนนี้ ${Math.round(b.thb).toLocaleString()} บาท ${b.thb_24h_change >= 0 ? 'ขึ้น' : 'ลง'} ${Math.abs(b.thb_24h_change).toFixed(1)} เปอร์เซ็นต์ใน 24 ชั่วโมงค่ะ`, go: go() };
    });
    ctx.addIntent(/ดอลลาร์|ยูโร|เยน|หยวน|ปอนด์|วอน|ริงกิต|กีบ|แลกเงิน|อัตราแลกเปลี่ยน|ค่าเงิน/, (q) => {
      if (!fx) { load(); return { text: 'กำลังโหลดอัตราแลกเปลี่ยนค่ะ', go: go() }; }
      const p = parseMoney(q);
      if (!p) return { text: `หนึ่งดอลลาร์เท่ากับ ${num(thbPer('USD'))} บาทค่ะ`, go: go() };
      const r = convert(p.amt, p.f, p.t);
      return { text: `${num(p.amt)} ${NAMES_TH[p.f][0]} เท่ากับ ${num(r)} ${NAMES_TH[p.t][0]}ค่ะ (ค่ากลาง)`, go: go() };
    }, 'ดอลลาร์เท่าไหร่');
  },
  show() { load(); clearInterval(timer); timer = setInterval(load, 5 * 60000); },
  hide() { clearInterval(timer); },
};
