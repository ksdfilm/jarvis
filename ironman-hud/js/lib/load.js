// โหลดไลบรารีจาก CDN ตอนต้องใช้ครั้งแรก (ไม่โหลดตั้งแต่เปิดแอป = เปิดเร็ว ประหยัดเน็ต)
const cache = new Map();

export function loadScript(src) {
  if (!cache.has(src)) {
    cache.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => { cache.delete(src); reject(new Error('โหลดไม่สำเร็จ: ' + src)); };
      document.head.append(s);
    }));
  }
  return cache.get(src);
}

export function loadCss(href) {
  if (!cache.has(href)) {
    cache.set(href, new Promise((resolve) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = l.onerror = resolve;
      document.head.append(l);
    }));
  }
  return cache.get(href);
}

/** fetch JSON พร้อมหมดเวลา (เน็ตมือถือช้า/หลุด) */
export async function getJSON(url, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
export const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
export const THREE_JS = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/** สไตล์แผนที่มืดแบบเบา (OpenFreeMap ฟรี ไม่ต้องใช้คีย์) สำหรับเรดาร์/แผนที่เล็ก */
export function darkMapStyle() {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#04101b' } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#02060c' } },
      { id: 'border', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['<=', ['get', 'admin_level'], 4],
        paint: { 'line-color': '#3fd8ff', 'line-opacity': ['match', ['get', 'admin_level'], 2, 0.6, 0.2], 'line-width': ['match', ['get', 'admin_level'], 2, 1.2, 0.6] } },
      { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        paint: { 'line-color': '#1d6a8f', 'line-width': 0.8, 'line-opacity': 0.6 } },
      { id: 'places', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name_int']], 'text-font': ['Noto Sans Regular'], 'text-size': 10 },
        paint: { 'text-color': '#7fbfdc', 'text-halo-color': '#02060c', 'text-halo-width': 1.2 } },
    ],
  };
}
