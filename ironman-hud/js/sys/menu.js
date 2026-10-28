// เมนูรวมแผง: แตะปุ่ม ▦ ที่หัวจอ → เห็นทุกแผงเป็นตาราง แตะเพื่อกระโดดไปได้เลย (ไม่ต้องหมุนหน้าปัดทีละช่อง)
let ctx, sheet;

function open() {
  const items = ctx.panels.map((p, i) => `<button type="button" class="m-tile${i === ctx.current() ? ' on' : ''}" data-i="${i}">
      <b>${ctx.pad(i + 1)}</b><span>${ctx.esc(p.en)}</span><small>${ctx.esc(p.th)}</small></button>`).join('');
  sheet.querySelector('.m-grid').innerHTML = items;
  sheet.hidden = false;
  ctx.fx.play('open');
}
function close() { sheet.hidden = true; }

export default {
  init(c) {
    ctx = c;
    sheet = document.createElement('section');
    sheet.className = 'sheet menu-sheet';
    sheet.hidden = true;
    sheet.setAttribute('aria-label', 'เมนูแผงทั้งหมด');
    sheet.innerHTML = `<div class="sheet-head"><h2>PANELS <small>เลือกแผง</small></h2><button type="button" class="sheet-x" aria-label="ปิด">×</button></div><div class="m-grid"></div>`;
    document.body.append(sheet);
    sheet.querySelector('.sheet-x').addEventListener('click', close);
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('.m-tile');
      if (b) { close(); ctx.go(+b.dataset.i); }
    });
    ctx.$('#menu-btn').addEventListener('click', open);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
    ctx.addIntent(/เมนู|ทั้งหมด|มีอะไรบ้าง|menu/, () => { open(); return { text: `มีทั้งหมด ${ctx.panels.length} แผงค่ะ แตะเลือกได้เลย` }; });
  },
};
