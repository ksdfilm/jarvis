// สไตล์แผนที่ธีมมืดแบบไซไฟ: ถนนเรืองแสง ตึก 3 มิติตามความสูงจริง (ข้อมูล OpenStreetMap ผ่าน OpenFreeMap ฟรี ไม่ต้องใช้คีย์)
const SRC = 'omt';

const road = (id, classes, color, width, blur, opacity, minzoom = 0) => ({
  id, type: 'line', source: SRC, 'source-layer': 'transportation', minzoom,
  filter: ['all', ['in', ['get', 'class'], ['literal', classes]], ['!=', ['get', 'brunnel'], 'tunnel']],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': color,
    'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, width * 0.25, 13, width, 16, width * 3.2],
    'line-blur': blur,
    'line-opacity': opacity,
  },
});

export const mapStyle = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    [SRC]: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  sky: {
    'sky-color': '#02060f',
    'horizon-color': '#0b3552',
    'fog-color': '#02060f',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.75,
  },
  light: { anchor: 'map', color: '#a9e4ff', intensity: 0.4, position: [1.2, 210, 40] },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#03080f' } },
    { id: 'landuse', type: 'fill', source: SRC, 'source-layer': 'landuse',
      paint: { 'fill-color': '#061321', 'fill-opacity': 0.8 } },
    { id: 'park', type: 'fill', source: SRC, 'source-layer': 'park',
      paint: { 'fill-color': '#06261f', 'fill-opacity': 0.55 } },
    { id: 'landcover', type: 'fill', source: SRC, 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland', 'wetland']]],
      paint: { 'fill-color': '#05201b', 'fill-opacity': 0.45 } },
    { id: 'water', type: 'fill', source: SRC, 'source-layer': 'water',
      paint: { 'fill-color': '#06213a' } },
    { id: 'water-edge', type: 'line', source: SRC, 'source-layer': 'water',
      paint: { 'line-color': '#1aa3ff', 'line-width': 1.4, 'line-blur': 1.5, 'line-opacity': 0.55 } },
    { id: 'waterway', type: 'line', source: SRC, 'source-layer': 'waterway',
      paint: { 'line-color': '#1580c4', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 2.5], 'line-opacity': 0.7 } },

    // ถนนรอง (จาง) → ถนนหลัก (ฟ้า) → ทางด่วน/ทางหลวง (ส้มแดง) แต่ละระดับมีชั้นเรืองแสง + เส้นแกน
    road('road-minor', ['minor', 'service', 'tertiary'], '#1b5a80', 0.9, 0, 0.55, 12),
    road('road-main-glow', ['primary', 'secondary'], '#2fd0ff', 3.2, 3, 0.35),
    road('road-main', ['primary', 'secondary'], '#7fe6ff', 1.1, 0, 0.9),
    road('road-major-glow', ['motorway', 'trunk'], '#ff5a2e', 4.5, 4, 0.45),
    road('road-major', ['motorway', 'trunk'], '#ffb27a', 1.5, 0, 0.95),
    { id: 'rail', type: 'line', source: SRC, 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
      paint: { 'line-color': '#b47cff', 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 } },

    { id: 'buildings', type: 'fill-extrusion', source: SRC, 'source-layer': 'building', minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
          0, '#0a2236', 20, '#0f3d5e', 60, '#1a76a8', 150, '#4cc9f5', 280, '#d4f6ff'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.6, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.88,
        'fill-extrusion-vertical-gradient': true,
      } },

    { id: 'place-label', type: 'symbol', source: SRC, 'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb']]],
      layout: {
        'text-field': ['upcase', ['coalesce', ['get', 'name_en'], ['get', 'name_int']]],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13],
        'text-letter-spacing': 0.25,
      },
      paint: { 'text-color': '#5fb8dd', 'text-halo-color': '#02060f', 'text-halo-width': 1.4, 'text-opacity': 0.75 } },
  ],
};
