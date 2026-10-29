// ตัวช่วยสร้างรูปทรงพื้นฐาน ใช้ร่วมกันระหว่างโมเดลที่สร้างจากโค้ด (pc.js, printer.js)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const std = (o) => new THREE.MeshStandardMaterial(o);
export const M = {
  steel: (c = 0x1b1f27) => std({ color: c, metalness: 0.65, roughness: 0.42 }),
  plastic: (c = 0x15181d) => std({ color: c, metalness: 0.05, roughness: 0.62 }),
  alu: (c = 0xa3abb5) => std({ color: c, metalness: 0.9, roughness: 0.3 }),
  copper: () => std({ color: 0xc8804c, metalness: 1, roughness: 0.28 }),
  gold: () => std({ color: 0xd9b24c, metalness: 1, roughness: 0.25 }),
  pcb: (c = 0x14181e) => std({ color: c, metalness: 0.25, roughness: 0.65 }),
  glow: (c = 0x38bdf8, i = 2.2) => {
    const m = std({ color: c, emissive: c, emissiveIntensity: i });
    m.userData.glow = true;
    return m;
  },
  glass: () => std({ color: 0x9cc3e6, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }),
};

export function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
export function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  return m;
}
export function cyl(r, h, mat, x, y, z, axis = 'y', seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  return m;
}
export function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

// พัดลม แกนหมุนอยู่ที่แกน z ของตัวเอง ใบพัดหมุนได้ (userData.spin)
export function fan(size = 0.38, depth = 0.07, ring = 0x38bdf8, spin = 5) {
  const g = new THREE.Group();
  const frame = M.plastic(0x1a1d23);
  const b = size * 0.07;
  g.add(
    box(size, b, depth, frame, 0, (size - b) / 2, 0),
    box(size, b, depth, frame, 0, -(size - b) / 2, 0),
    box(b, size - 2 * b, depth, frame, (size - b) / 2, 0, 0),
    box(b, size - 2 * b, depth, frame, -(size - b) / 2, 0, 0),
  );
  const rotor = new THREE.Group();
  rotor.userData.spin = spin;
  rotor.add(cyl(size * 0.15, depth * 0.7, M.plastic(0x23272f), 0, 0, 0, 'z', 28));
  const bladeMat = std({ color: 0x2a2f38, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const pivot = new THREE.Group();
    const blade = box(size * 0.29, size * 0.14, 0.006, bladeMat, size * 0.29, 0, 0);
    blade.rotation.x = 0.55;
    pivot.add(blade);
    pivot.rotation.z = (i / 7) * Math.PI * 2;
    rotor.add(pivot);
  }
  g.add(rotor);
  if (ring) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(size * 0.43, size * 0.012, 8, 48), M.glow(ring, 1.6));
    r.position.z = depth * 0.5;
    g.add(r);
  }
  return g;
}
