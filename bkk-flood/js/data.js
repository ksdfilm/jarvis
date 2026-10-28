// จุดเฝ้าระวังน้ำท่วม (ตำแหน่งโดยประมาณ ย่านที่น้ำท่วมขังบ่อย) — ข้อมูลระดับน้ำเป็นการจำลองทั้งหมด
// sens  = พื้นที่ต่ำ/ระบายช้า น้ำขึ้นไวกว่า (1 = ปกติ)
// drain = ความสามารถระบายน้ำ (ซม./นาที)
export const CENTER = [100.545, 13.752];

export const STATIONS = [
  { id: 'dindaeng',   name: 'ดินแดง',            en: 'DIN DAENG',        lng: 100.5521, lat: 13.7652, sens: 1.5, drain: 0.35 },
  { id: 'asok',       name: 'สุขุมวิท–อโศก',       en: 'SUKHUMVIT-ASOK',   lng: 100.5603, lat: 13.7370, sens: 1.4, drain: 0.40 },
  { id: 'silom',      name: 'สีลม–ศาลาแดง',       en: 'SILOM',            lng: 100.5340, lat: 13.7286, sens: 1.1, drain: 0.45 },
  { id: 'pratunam',   name: 'ประตูน้ำ',           en: 'PRATUNAM',         lng: 100.5410, lat: 13.7510, sens: 1.3, drain: 0.40 },
  { id: 'ladprao',    name: 'ห้าแยกลาดพร้าว',     en: 'LAT PHRAO',        lng: 100.5610, lat: 13.8160, sens: 1.4, drain: 0.38 },
  { id: 'chatuchak',  name: 'จตุจักร',            en: 'CHATUCHAK',        lng: 100.5530, lat: 13.8000, sens: 1.2, drain: 0.42 },
  { id: 'bangsue',    name: 'บางซื่อ',            en: 'BANG SUE',         lng: 100.5370, lat: 13.8050, sens: 1.1, drain: 0.45 },
  { id: 'laksi',      name: 'หลักสี่',             en: 'LAK SI',           lng: 100.5800, lat: 13.8870, sens: 1.2, drain: 0.40 },
  { id: 'donmueang',  name: 'ดอนเมือง',           en: 'DON MUEANG',       lng: 100.6068, lat: 13.9126, sens: 1.3, drain: 0.38 },
  { id: 'bangkapi',   name: 'บางกะปิ',            en: 'BANG KAPI',        lng: 100.6470, lat: 13.7660, sens: 1.4, drain: 0.36 },
  { id: 'ramkhamhaeng', name: 'รามคำแหง',         en: 'RAMKHAMHAENG',     lng: 100.6180, lat: 13.7560, sens: 1.3, drain: 0.40 },
  { id: 'minburi',    name: 'มีนบุรี',             en: 'MIN BURI',         lng: 100.7250, lat: 13.8130, sens: 1.5, drain: 0.32 },
  { id: 'latkrabang', name: 'ลาดกระบัง',          en: 'LAT KRABANG',      lng: 100.7480, lat: 13.7270, sens: 1.6, drain: 0.30 },
  { id: 'bangna',     name: 'บางนา',              en: 'BANG NA',          lng: 100.6050, lat: 13.6680, sens: 1.4, drain: 0.36 },
  { id: 'khlongtoei', name: 'คลองเตย',            en: 'KHLONG TOEI',      lng: 100.5560, lat: 13.7122, sens: 1.2, drain: 0.42 },
  { id: 'yaowarat',   name: 'เยาวราช',            en: 'YAOWARAT',         lng: 100.5090, lat: 13.7400, sens: 1.1, drain: 0.45 },
  { id: 'wongwian',   name: 'วงเวียนใหญ่',         en: 'WONGWIAN YAI',     lng: 100.4930, lat: 13.7250, sens: 1.2, drain: 0.42 },
  { id: 'bangkhae',   name: 'บางแค',              en: 'BANG KHAE',        lng: 100.4040, lat: 13.7210, sens: 1.4, drain: 0.36 },
];

// ระดับเตือนภัยตามความสูงน้ำ (ซม.)
export const LEVELS = [
  { key: 'normal',   name: 'ปกติ',      en: 'NORMAL',   min: 0,  color: '#2ee6a6', advice: 'สัญจรได้ตามปกติ' },
  { key: 'watch',    name: 'เฝ้าระวัง',   en: 'WATCH',    min: 5,  color: '#ffd23f', advice: 'มีน้ำขังบางจุด ขับขี่ด้วยความระมัดระวัง' },
  { key: 'warning',  name: 'เตือนภัย',    en: 'WARNING',  min: 15, color: '#ff8a3d', advice: 'น้ำท่วมขังผิวจราจร รถเล็กควรเลี่ยงเส้นทาง' },
  { key: 'critical', name: 'วิกฤต',      en: 'CRITICAL', min: 30, color: '#ff3b5c', advice: 'น้ำท่วมสูง ห้ามรถเล็กผ่าน เตรียมยกของขึ้นที่สูง' },
];

export function levelOf(cm) {
  let i = 0;
  LEVELS.forEach((l, k) => { if (cm >= l.min) i = k; });
  return i;
}
