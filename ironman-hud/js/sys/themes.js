// ธีมสี: hud = สีหลัก, acc = สีเน้น (แตะวงกลางหน้าหลักเพื่อสลับวน หรือเลือกในตั้งค่า)
export const THEMES = {
  jarvis:     { name: 'JARVIS',      th: 'ฟ้า (ค่าเริ่มต้น)', hud: '#3fd8ff', acc: '#ff3b5c' },
  mark:       { name: 'MARK',        th: 'แดงทอง',           hud: '#ff5a3c', acc: '#ffc94a' },
  hulk:       { name: 'HULKBUSTER',  th: 'ส้ม',              hud: '#ff8a1f', acc: '#ffe14a' },
  stealth:    { name: 'STEALTH',     th: 'ขาว',              hud: '#e6f0f5', acc: '#8fa3ae' },
  warmachine: { name: 'WAR MACHINE', th: 'เงิน',             hud: '#b9c6cf', acc: '#ff6b3d' },
  spider:     { name: 'SPIDER',      th: 'แดงน้ำเงิน',        hud: '#ff2e4d', acc: '#3d8bff' },
  matrix:     { name: 'MATRIX',      th: 'เขียว',            hud: '#2bff88', acc: '#d4ffe6' },
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

/** ตั้งธีม: เขียนตัวแปรสีลง <body> (CSS ใช้ var(--hud) / var(--hud-rgb) / var(--acc)) */
export function applyTheme(key) {
  const t = THEMES[key] || THEMES.jarvis;
  const b = document.body;
  b.dataset.theme = THEMES[key] ? key : 'jarvis';
  b.style.setProperty('--hud', t.hud);
  b.style.setProperty('--hud-rgb', rgb(t.hud));
  b.style.setProperty('--acc', t.acc);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#02070d');
  dispatchEvent(new CustomEvent('hud:theme', { detail: b.dataset.theme }));
  return b.dataset.theme;
}
export function nextTheme(key) {
  const keys = Object.keys(THEMES);
  return keys[(keys.indexOf(key) + 1) % keys.length];
}
