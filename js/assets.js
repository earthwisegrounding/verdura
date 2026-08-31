// Landscape assets: photoscanned GLB models (Poly Haven, CC0) where available,
// procedural low-poly builders as instant fallbacks and for everything else.
// Each asset is a THREE.Group sized in meters with its base at y=0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Real-model overrides: id -> file + target height (models are normalized to
// this height with their base at y=0 when loaded).
export const MODELS = {
  oak:       { url: 'assets/models/tree_deciduous.glb', height: 5.5, fp: 2.4 },
  jacaranda: { url: 'assets/models/tree_jacaranda.glb', height: 8.0, fp: 3.4 },
  pine:      { url: 'assets/models/tree_pine.glb',      height: 8.0, fp: 1.9 },
  shrub:     { url: 'assets/models/shrub_bush.glb',     height: 1.4, fp: 1.0 },
  boulder:   { url: 'assets/models/boulder.glb',        height: 0.85, fp: 0.9 },
};

const modelCache = {};

export function hasModel(id) { return !!modelCache[id]; }

// Loads the GLB set; calls onOne(id) as each finishes. Any failure (offline,
// artifact sandbox, missing file) simply leaves the procedural builder active.
export async function preloadModels(onOne) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.entries(MODELS).map(async ([id, def]) => {
    try {
      const embedded = typeof window !== 'undefined' && window.__VERDURA_MODELS;
      const gltf = await loader.loadAsync((embedded && embedded[id]) || def.url);
      const src = gltf.scene;
      const box = new THREE.Box3().setFromObject(src);
      const s = def.height / (box.max.y - box.min.y);
      src.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(src);
      src.position.set(-(box2.min.x + box2.max.x) / 2, -box2.min.y, -(box2.min.z + box2.max.z) / 2);
      const wrap = new THREE.Group();
      wrap.add(src);
      wrap.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        if (m.material) {
          const mat = m.material;
          if (mat.transparent || mat.alphaTest > 0) {
            // foliage cards: cutout alpha renders cleaner than blended
            mat.transparent = false;
            mat.alphaTest = 0.45;
            mat.depthWrite = true;
            mat.side = THREE.DoubleSide;
          }
        }
      });
      modelCache[id] = wrap;
      const adef = ASSETS.find(x => x.id === id);
      if (adef && def.fp) adef.fp = def.fp;
      if (onOne) onOne(id);
    } catch (e) {
      console.warn('model unavailable, keeping procedural ' + id, e.message || e);
    }
  }));
}

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function mat(c, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: c,
    roughness: o.r ?? 0.85,
    metalness: o.m ?? 0,
    flatShading: o.flat ?? false,
  });
  if (o.e) { m.emissive = new THREE.Color(o.e); m.emissiveIntensity = o.ei ?? 0.8; }
  if (o.op != null) { m.transparent = true; m.opacity = o.op; }
  return m;
}

function add(g, geo, material, p = [0, 0, 0], rot = [0, 0, 0], s = 1) {
  const me = new THREE.Mesh(geo, material);
  me.position.set(...p);
  me.rotation.set(...rot);
  if (Array.isArray(s)) me.scale.set(...s); else me.scale.setScalar(s);
  me.castShadow = true;
  me.receiveShadow = true;
  g.add(me);
  return me;
}

const GREENS = [0x4e7a3a, 0x5c8b44, 0x446e33, 0x6a9a50];
const REDS = [0xa04338, 0xb5543f, 0x8f3a30];
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const TRUNK = 0x6f4a2f, WOOD = 0x8a6642, STONE = 0x8f8f88, SOIL = 0x4a3527;
const WATER = () => mat(0x3f85b0, { r: 0.12, op: 0.92 });

/* ---------------- trees ---------------- */
function oak(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.13, 0.24, 1.6, 7), mat(TRUNK, { r: 1 }), [0, 0.8, 0]);
  const n = 3 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.8 + R() * 0.7;
    add(g, new THREE.IcosahedronGeometry(1, 1), mat(pick(R, GREENS), { flat: true }),
      [(R() - 0.5) * 1.5, 2.0 + R() * 0.9, (R() - 0.5) * 1.5], [R() * 3, R() * 3, R() * 3], s);
  }
  return g;
}
function pine(R) {
  const g = new THREE.Group();
  const h = 2.8 + R() * 1.4;
  add(g, new THREE.CylinderGeometry(0.09, 0.17, h * 0.4, 6), mat(0x5d3f26, { r: 1 }), [0, h * 0.2, 0]);
  const c = mat(0x2f5d3a, { flat: true });
  for (let i = 0; i < 3; i++) {
    const f = 1 - i * 0.27;
    add(g, new THREE.ConeGeometry(0.95 * f, h * 0.44, 8), c, [0, h * (0.32 + i * 0.24), 0]);
  }
  return g;
}
function cypress(R) {
  const g = new THREE.Group();
  const h = 2.6 + R() * 1.0;
  add(g, new THREE.CylinderGeometry(0.06, 0.11, 0.5, 6), mat(TRUNK), [0, 0.25, 0]);
  add(g, new THREE.SphereGeometry(1, 9, 12), mat(0x39603d, { flat: true }),
    [0, 0.3 + h / 2, 0], [0, R() * 3, 0], [0.52, h / 2, 0.52]);
  return g;
}
function palm(R) {
  const g = new THREE.Group();
  const h = 2.4 + R() * 1.2;
  const lean = (R() - 0.5) * 0.8;
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    add(g, new THREE.CylinderGeometry(0.1 - 0.008 * i, 0.12 - 0.008 * i, h / segs + 0.06, 6),
      mat(0x7d5f43, { r: 1 }), [lean * (i / segs), (i + 0.5) * h / segs, 0], [0, 0, -lean * 0.22]);
  }
  const topX = lean, topY = h + 0.05;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + R() * 0.4;
    const fr = new THREE.Group();
    fr.position.set(topX, topY, 0);
    fr.rotation.y = a;
    add(fr, new THREE.ConeGeometry(0.17, 1.6, 4), mat(0x3f7d44, { flat: true }),
      [0.72, -0.18, 0], [0, 0, -1.95], [1, 1, 0.25]);
    g.add(fr);
  }
  return g;
}
function maple(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.1, 0.18, 1.2, 7), mat(0x5a4030, { r: 1 }), [0, 0.6, 0]);
  const n = 3 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) {
    const s = 0.7 + R() * 0.5;
    add(g, new THREE.IcosahedronGeometry(1, 1), mat(pick(R, REDS), { flat: true }),
      [(R() - 0.5) * 1.2, 1.5 + R() * 0.7, (R() - 0.5) * 1.2], [R() * 3, R() * 3, R() * 3], s);
  }
  return g;
}
function birch(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.08, 0.13, 2.2, 7), mat(0xd8d3c8, { r: 0.9 }), [0, 1.1, 0]);
  for (let i = 0; i < 4; i++) {
    add(g, new THREE.CylinderGeometry(0.085, 0.085, 0.06, 7), mat(0x3b3b38),
      [0, 0.4 + R() * 1.6, 0]);
  }
  add(g, new THREE.SphereGeometry(1, 10, 8), mat(0x7fae5a, { flat: true }),
    [0, 2.6, 0], [0, 0, 0], [0.9, 1.15, 0.9]);
  return g;
}

/* ---------------- shrubs & flowers ---------------- */
function shrub(R) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.3 + R() * 0.32;
    add(g, new THREE.IcosahedronGeometry(1, 1), mat(pick(R, GREENS), { flat: true }),
      [(R() - 0.5) * 0.7, s * 0.85, (R() - 0.5) * 0.7], [R() * 3, R() * 3, R() * 3], s);
  }
  return g;
}
function hedge(R) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(1.3, 0.75, 0.55), mat(0x44702f, { flat: true }), [0, 0.38, 0],
    [0, 0, 0], [1, 1 + R() * 0.1, 1]);
  return g;
}
function flowers(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.92, 1.02, 0.12, 14), mat(SOIL, { r: 1 }), [0, 0.06, 0]);
  const cols = [0xe45f74, 0xf2c14e, 0xf5f2ea, 0xb372d7, 0xe97733];
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.18 + R() * 0.22;
    add(g, new THREE.CylinderGeometry(0.012, 0.012, h, 4), mat(0x4e7a3a), [x, 0.12 + h / 2, z]);
    add(g, new THREE.SphereGeometry(0.05, 6, 5), mat(pick(R, cols), { r: 0.6 }), [x, 0.12 + h, z]);
  }
  return g;
}
function grasstuft(R) {
  const g = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = R() * Math.PI * 2, h = 0.5 + R() * 0.55;
    add(g, new THREE.ConeGeometry(0.035, h, 4), mat(0xa8b565, { flat: true }),
      [Math.cos(a) * 0.13, h / 2, Math.sin(a) * 0.13], [(R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5]);
  }
  return g;
}
function dougfir(R) {
  const g = new THREE.Group();
  const h = 4.5 + R() * 1.5;
  add(g, new THREE.CylinderGeometry(0.1, 0.2, h * 0.35, 6), mat(0x4a3626, { r: 1 }), [0, h * 0.17, 0]);
  const c = mat(0x2c4a34, { flat: true });
  for (let i = 0; i < 5; i++) {
    const f = 1 - i * 0.17;
    add(g, new THREE.ConeGeometry(1.0 * f, h * 0.3, 8), c, [0, h * (0.24 + i * 0.16), 0]);
  }
  return g;
}
function rhodie(R) {
  const g = shrub(R);
  for (let i = 0; i < 10; i++) {
    const ang = R() * Math.PI * 2, r = 0.25 + R() * 0.35;
    add(g, new THREE.IcosahedronGeometry(0.09, 1), mat(0xe268a8, { r: 0.6, flat: true }),
      [Math.cos(ang) * r, 0.5 + R() * 0.4, Math.sin(ang) * r]);
  }
  return g;
}
function fern(R) {
  const g = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + R() * 0.4;
    const fr = new THREE.Group();
    fr.rotation.y = ang;
    add(fr, new THREE.ConeGeometry(0.09, 1.1, 4), mat(0x3f6b35, { flat: true }), [0.42, 0.3, 0], [0, 0, -1.95], [1, 1, 0.3]);
    g.add(fr);
  }
  return g;
}
function flowersRect(R) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(2.2, 0.14, 1.1), mat(SOIL, { r: 1 }), [0, 0.07, 0]);
  const cols = [0xe45f74, 0xf2c14e, 0xf5f2ea, 0xb372d7, 0xe97733];
  for (let i = 0; i < 26; i++) {
    const x = (R() - 0.5) * 2.0, z = (R() - 0.5) * 0.9, hh = 0.18 + R() * 0.22;
    add(g, new THREE.CylinderGeometry(0.012, 0.012, hh, 4), mat(0x4e7a3a), [x, 0.14 + hh / 2, z]);
    add(g, new THREE.SphereGeometry(0.05, 6, 5), mat(pick(R, cols), { r: 0.6 }), [x, 0.14 + hh, z]);
  }
  return g;
}
function rose(R) {
  const g = shrub(R);
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, r = 0.25 + R() * 0.3;
    add(g, new THREE.SphereGeometry(0.06, 6, 5), mat(0xc23148, { r: 0.55 }),
      [Math.cos(a) * r, 0.45 + R() * 0.35, Math.sin(a) * r]);
  }
  return g;
}
function lavender(R) {
  const g = new THREE.Group();
  add(g, new THREE.IcosahedronGeometry(0.32, 1), mat(0x5e7d4e, { flat: true }), [0, 0.22, 0]);
  for (let i = 0; i < 15; i++) {
    const a = R() * Math.PI * 2, r = R() * 0.28, h = 0.4 + R() * 0.25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    add(g, new THREE.CylinderGeometry(0.01, 0.01, h, 4), mat(0x6a8a58), [x, h / 2, z]);
    add(g, new THREE.SphereGeometry(0.045, 5, 5), mat(0x8b6fc4, { r: 0.7 }),
      [x, h + 0.03, z], [0, 0, 0], [1, 2.1, 1]);
  }
  return g;
}

/* ---------------- hardscape ---------------- */
function boulder(R) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.8, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.82 + R() * 0.35), pos.getY(i) * (0.6 + R() * 0.3), pos.getZ(i) * (0.82 + R() * 0.35));
  }
  geo.computeVertexNormals();
  add(g, geo, mat(STONE, { flat: true, r: 1 }), [0, 0.42, 0], [0, R() * 3, 0]);
  return g;
}
function stepstones(R) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.06, 7), mat(0x9d978c, { flat: true, r: 1 }),
      [(R() - 0.5) * 0.25, 0.03, -0.95 + i * 0.63], [0, R() * 3, 0], [1 + R() * 0.25, 1, 0.85 + R() * 0.2]);
  }
  return g;
}
function gravel(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(1.05, 1.15, 0.06, 16), mat(0xa8a49c, { r: 1 }), [0, 0.03, 0]);
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.95;
    add(g, new THREE.IcosahedronGeometry(0.05 + R() * 0.04, 0), mat(0x8f8b83, { flat: true, r: 1 }),
      [Math.cos(a) * r, 0.07, Math.sin(a) * r], [R() * 3, R() * 3, 0]);
  }
  return g;
}
function patio(R) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    const shade = 0.9 + R() * 0.2;
    add(g, new THREE.BoxGeometry(0.56, 0.06, 0.56),
      mat(new THREE.Color(0xb9a487).multiplyScalar(shade).getHex(), { r: 1 }),
      [-1.2 + i * 0.6, 0.03, -0.9 + j * 0.6]);
  }
  return g;
}
function wall(R) {
  const g = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    const off = row % 2 ? 0.26 : 0;
    for (let i = 0; i < 4; i++) {
      const shade = 0.88 + R() * 0.24;
      add(g, new THREE.BoxGeometry(0.5, 0.21, 0.28),
        mat(new THREE.Color(0x9a8f7f).multiplyScalar(shade).getHex(), { flat: true, r: 1 }),
        [-0.78 + i * 0.52 + off, 0.11 + row * 0.22, 0], [0, (R() - 0.5) * 0.06, 0]);
    }
  }
  tintAll(g);
  return g;
}
function path(R) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const shade = 0.88 + R() * 0.24;
    add(g, new THREE.CylinderGeometry(0.4, 0.42, 0.05, 7),
      mat(new THREE.Color(0xa79b84).multiplyScalar(shade).getHex(), { flat: true, r: 1 }),
      [(R() - 0.5) * 0.3, 0.025, -1.1 + i * 0.55], [0, R() * 3, 0], [1.25, 1, 0.9]);
  }
  return g;
}

/* ---------------- structures ---------------- */
function fence(R) {
  const g = new THREE.Group();
  const m = mat(0xe8e4da, { r: 0.9 });
  add(g, new THREE.BoxGeometry(0.09, 1.0, 0.09), m, [-0.9, 0.5, 0]);
  add(g, new THREE.BoxGeometry(0.09, 1.0, 0.09), m, [0.9, 0.5, 0]);
  add(g, new THREE.BoxGeometry(1.9, 0.08, 0.05), m, [0, 0.35, 0]);
  add(g, new THREE.BoxGeometry(1.9, 0.08, 0.05), m, [0, 0.78, 0]);
  for (let i = 0; i < 5; i++) {
    add(g, new THREE.BoxGeometry(0.11, 0.95, 0.04), m, [-0.72 + i * 0.36, 0.5, 0.05]);
  }
  tintAll(g);
  return g;
}
function pergola(R) {
  const g = new THREE.Group();
  const m = mat(WOOD, { r: 0.95 });
  const px = 1.3, pz = 1.05, h = 2.35;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.12, h, 0.12), m, [sx * px, h / 2, sz * pz]);
  }
  add(g, new THREE.BoxGeometry(2.9, 0.12, 0.16), m, [0, h + 0.06, -pz]);
  add(g, new THREE.BoxGeometry(2.9, 0.12, 0.16), m, [0, h + 0.06, pz]);
  for (let i = 0; i < 6; i++) {
    add(g, new THREE.BoxGeometry(0.09, 0.09, 2.5), m, [-1.25 + i * 0.5, h + 0.18, 0]);
  }
  tintAll(g);
  return g;
}
function raisedbed(R) {
  const g = new THREE.Group();
  const m = mat(WOOD, { r: 0.95 });
  add(g, new THREE.BoxGeometry(1.7, 0.36, 0.08), m, [0, 0.18, 0.46]);
  add(g, new THREE.BoxGeometry(1.7, 0.36, 0.08), m, [0, 0.18, -0.46]);
  add(g, new THREE.BoxGeometry(0.08, 0.36, 1.0), m, [0.85, 0.18, 0]);
  add(g, new THREE.BoxGeometry(0.08, 0.36, 1.0), m, [-0.85, 0.18, 0]);
  add(g, new THREE.BoxGeometry(1.6, 0.3, 0.86), mat(SOIL, { r: 1 }), [0, 0.17, 0]);
  for (let i = 0; i < 8; i++) {
    add(g, new THREE.IcosahedronGeometry(0.09 + R() * 0.07, 1), mat(pick(R, GREENS), { flat: true }),
      [-0.65 + R() * 1.3, 0.38, -0.3 + R() * 0.6]);
  }
  return g;
}
function arch(R) {
  const g = new THREE.Group();
  const m = mat(0xdcd8ce, { r: 0.85 });
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), m, [-0.72, 1.05, 0]);
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), m, [0.72, 1.05, 0]);
  add(g, new THREE.TorusGeometry(0.72, 0.05, 8, 18, Math.PI), m, [0, 2.1, 0]);
  for (let i = 0; i < 10; i++) {
    const a = R() * Math.PI;
    add(g, new THREE.IcosahedronGeometry(0.09 + R() * 0.06, 1), mat(pick(R, GREENS), { flat: true }),
      [Math.cos(a) * 0.72, 2.1 + Math.sin(a) * 0.72 * 0.9, (R() - 0.5) * 0.1]);
  }
  return g;
}
function bench(R) {
  const g = new THREE.Group();
  const m = mat(WOOD, { r: 0.95 });
  add(g, new THREE.BoxGeometry(1.4, 0.07, 0.45), m, [0, 0.45, 0]);
  add(g, new THREE.BoxGeometry(1.4, 0.5, 0.06), m, [0, 0.78, -0.21], [-0.15, 0, 0]);
  const leg = mat(0x4b4b4b, { r: 0.6, m: 0.5 });
  add(g, new THREE.BoxGeometry(0.06, 0.45, 0.4), leg, [-0.6, 0.22, 0]);
  add(g, new THREE.BoxGeometry(0.06, 0.45, 0.4), leg, [0.6, 0.22, 0]);
  tintAll(g);
  return g;
}
function firepit(R) {
  const g = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(g, new THREE.BoxGeometry(0.34, 0.24, 0.2), mat(0x87817a, { flat: true, r: 1 }),
      [Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55], [0, -a, 0]);
  }
  add(g, new THREE.CylinderGeometry(0.48, 0.5, 0.1, 12), mat(0x2a2724, { r: 1 }), [0, 0.06, 0]);
  add(g, new THREE.ConeGeometry(0.22, 0.5, 6), mat(0xff7b24, { e: 0xff5d10, ei: 1.6, flat: true }), [0, 0.4, 0]);
  add(g, new THREE.ConeGeometry(0.12, 0.32, 5), mat(0xffc148, { e: 0xffab24, ei: 2, flat: true }), [0.08, 0.32, 0.05]);
  return g;
}

/* ---------------- water ---------------- */
function pond(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(1.35, 1.45, 0.09, 20), WATER(), [0, 0.045, 0], [0, 0, 0], [1.2, 1, 0.85]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + R() * 0.3;
    add(g, new THREE.IcosahedronGeometry(0.12 + R() * 0.1, 0), mat(0x8f8b83, { flat: true, r: 1 }),
      [Math.cos(a) * 1.62 * 1.2 * 0.92, 0.08, Math.sin(a) * 1.5 * 0.85 * 0.95], [R() * 3, R() * 3, 0]);
  }
  add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 8), mat(0x4e7a3a), [0.4, 0.1, -0.2]);
  add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.02, 8), mat(0x5c8b44), [-0.5, 0.1, 0.3]);
  return g;
}
function fountain(R) {
  const g = new THREE.Group();
  const stone = mat(0xb5b0a6, { r: 0.9 });
  add(g, new THREE.CylinderGeometry(0.95, 1.0, 0.32, 14), stone, [0, 0.16, 0]);
  add(g, new THREE.CylinderGeometry(0.82, 0.82, 0.06, 14), WATER(), [0, 0.3, 0]);
  add(g, new THREE.CylinderGeometry(0.1, 0.14, 0.75, 10), stone, [0, 0.7, 0]);
  add(g, new THREE.CylinderGeometry(0.45, 0.32, 0.16, 12), stone, [0, 1.1, 0]);
  add(g, new THREE.CylinderGeometry(0.38, 0.38, 0.05, 12), WATER(), [0, 1.16, 0]);
  add(g, new THREE.SphereGeometry(0.09, 8, 6), stone, [0, 1.28, 0]);
  return g;
}
function birdbath(R) {
  const g = new THREE.Group();
  const stone = mat(0xc6c1b6, { r: 0.9 });
  add(g, new THREE.CylinderGeometry(0.22, 0.28, 0.06, 10), stone, [0, 0.03, 0]);
  add(g, new THREE.CylinderGeometry(0.07, 0.1, 0.7, 8), stone, [0, 0.4, 0]);
  add(g, new THREE.CylinderGeometry(0.36, 0.24, 0.14, 12), stone, [0, 0.82, 0]);
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12), WATER(), [0, 0.87, 0]);
  return g;
}

/* ---------------- decor ---------------- */
function lamp(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.035, 0.05, 2.1, 8), mat(0x33373d, { r: 0.5, m: 0.6 }), [0, 1.05, 0]);
  add(g, new THREE.BoxGeometry(0.26, 0.3, 0.26), mat(0x33373d, { r: 0.5, m: 0.6 }), [0, 2.2, 0]);
  add(g, new THREE.SphereGeometry(0.09, 8, 6), mat(0xffe6b0, { e: 0xffd080, ei: 2.2 }), [0, 2.18, 0]);
  add(g, new THREE.ConeGeometry(0.2, 0.14, 4), mat(0x33373d, { r: 0.5, m: 0.6 }), [0, 2.42, 0], [0, Math.PI / 4, 0]);
  return g;
}
function pot(R) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.3, 0.21, 0.42, 12), mat(0xb2603f, { r: 0.95 }), [0, 0.21, 0]);
  add(g, new THREE.CylinderGeometry(0.26, 0.26, 0.04, 12), mat(SOIL, { r: 1 }), [0, 0.41, 0]);
  const n = 2 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) {
    add(g, new THREE.IcosahedronGeometry(0.16 + R() * 0.08, 1), mat(pick(R, GREENS), { flat: true }),
      [(R() - 0.5) * 0.2, 0.55 + R() * 0.12, (R() - 0.5) * 0.2]);
  }
  return g;
}

export const ASSETS = [
  { id: 'oak',       name: 'Garry oak',       icon: '🌳', cat: 'Trees',            fp: 1.7, build: oak },
  { id: 'pine',      name: 'Shore pine',      icon: '🌲', cat: 'Trees',            fp: 1.1, build: pine },
  { id: 'cypress',   name: 'Arborvitae',      icon: '🌲', cat: 'Trees',            fp: 0.7, build: cypress },
  { id: 'dougfir',   name: 'Douglas fir',     icon: '🌲', cat: 'Trees',            fp: 1.5, build: dougfir },
  { id: 'maple',     name: 'Japanese maple',  icon: '🍁', cat: 'Trees',            fp: 1.4, build: maple },
  { id: 'birch',     name: 'Paper birch',     icon: '🪵', cat: 'Trees',            fp: 1.1, build: birch },
  { id: 'jacaranda', name: 'Bigleaf maple',   icon: '🍁', cat: 'Trees',            fp: 3.4, build: oak },
  { id: 'shrub',     name: 'Evergreen huckleberry', icon: '🫐', cat: 'Shrubs & flowers', fp: 0.7, build: shrub },
  { id: 'hedge',     name: 'Hedge',           icon: '🟩', cat: 'Shrubs & flowers', fp: 0.8, build: hedge },
  { id: 'flowers',   name: 'Flower bed',      icon: '🌸', cat: 'Shrubs & flowers', fp: 1.1, build: flowers },
  { id: 'grasstuft', name: 'Ornamental grass',icon: '🌾', cat: 'Shrubs & flowers', fp: 0.5, build: grasstuft },
  { id: 'rose',      name: 'Rose bush',       icon: '🌹', cat: 'Shrubs & flowers', fp: 0.7, build: rose },
  { id: 'lavender',  name: 'Lavender',        icon: '💜', cat: 'Shrubs & flowers', fp: 0.5, build: lavender },
  { id: 'rhodie',    name: 'Rhododendron',    icon: '🌺', cat: 'Shrubs & flowers', fp: 0.8, build: rhodie },
  { id: 'fern',      name: 'Sword fern',      icon: '🌿', cat: 'Shrubs & flowers', fp: 0.7, build: fern },
  { id: 'flowersrect', name: 'Flower bed (rect)', icon: '🌷', cat: 'Shrubs & flowers', fp: 1.3, build: flowersRect },
  { id: 'boulder',   name: 'Boulder',         icon: '🪨', cat: 'Hardscape',        fp: 0.9, build: boulder },
  { id: 'stepstones',name: 'Stepping stones', icon: '⬜', cat: 'Hardscape',        fp: 1.2, build: stepstones },
  { id: 'gravel',    name: 'Gravel bed',      icon: '▫️', cat: 'Hardscape',        fp: 1.2, build: gravel },
  { id: 'patio',     name: 'Paver patio',     icon: '🟫', cat: 'Hardscape',        fp: 1.8, build: patio },
  { id: 'wall',      name: 'Stone wall',      icon: '🧱', cat: 'Hardscape',        fp: 1.1, build: wall, tint: ['body'], colors: { body: '#9a8f7f' } },
  { id: 'path',      name: 'Flagstone path',  icon: '🛤️', cat: 'Hardscape',        fp: 1.3, build: path },
  { id: 'fence',     name: 'Fence section',   icon: '🚧', cat: 'Structures',       fp: 1.0, build: fence, tint: ['body'], colors: { body: '#e8e4da' } },
  { id: 'pergola',   name: 'Pergola',         icon: '⛩️', cat: 'Structures',       fp: 1.8, build: pergola, tint: ['body'], colors: { body: '#8a6642' } },
  { id: 'raisedbed', name: 'Raised bed',      icon: '🪴', cat: 'Structures',       fp: 1.1, build: raisedbed },
  { id: 'arch',      name: 'Garden arch',     icon: '🎪', cat: 'Structures',       fp: 0.9, build: arch },
  { id: 'bench',     name: 'Bench',           icon: '🪑', cat: 'Structures',       fp: 0.9, build: bench, tint: ['body'], colors: { body: '#8a6642' } },
  { id: 'firepit',   name: 'Fire pit',        icon: '🔥', cat: 'Structures',       fp: 0.9, build: firepit },
  { id: 'pond',      name: 'Pond',            icon: '💧', cat: 'Water',            fp: 1.9, build: pond },
  { id: 'fountain',  name: 'Fountain',        icon: '⛲', cat: 'Water',            fp: 1.1, build: fountain },
  { id: 'birdbath',  name: 'Bird bath',       icon: '🕊️', cat: 'Water',            fp: 0.5, build: birdbath },
  { id: 'lamp',      name: 'Garden lamp',     icon: '💡', cat: 'Decor',            fp: 0.4, build: lamp },
  { id: 'pot',       name: 'Planter pot',     icon: '🏺', cat: 'Decor',            fp: 0.4, build: pot },
];

export function assetDef(id) { return ASSETS.find(a => a.id === id); }

export function buildAsset(id, seed) {
  if (modelCache[id]) {
    const g = modelCache[id].clone(true);
    g.userData.assetId = id;
    return g;
  }
  const def = assetDef(id);
  const g = def.build(makeRng(seed));
  g.userData.assetId = id;
  return g;
}

/* ================= tinting ================= */
function tintAs(me, role) { me.userData.tint = role; return me; }
function tintAll(g, role = 'body') {
  g.traverse(m => { if (m.isMesh) { m.userData.tint = role; m.userData.shade = 0.9 + Math.random() * 0.2; } });
  return g;
}

// Recolor the meshes of an asset that declare a tint role. Meshes may carry a
// per-mesh `shade` so stone/brick variation survives recoloring.
export function applyTint(obj, colors) {
  if (!colors) return;
  obj.traverse(m => {
    if (m.isMesh && m.userData.tint && colors[m.userData.tint]) {
      m.material = m.material.clone();
      m.material.color.set(colors[m.userData.tint]);
      if (m.userData.shade) m.material.color.multiplyScalar(m.userData.shade);
    }
  });
}

/* ================= buildings ================= */
const GLASS = 0x39434c;

function dsMat(c, o = {}) { const m = mat(c, o); m.side = THREE.DoubleSide; return m; }

// Triangular gable roof; footprint w (x) by d (z), ridge along z.
function gableGeo(w, d, h, over = 0.14) {
  const hw = w / 2 + over, hd = d / 2 + over;
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const quad = (a, b, c, dd) => { tri(a, b, c); tri(a, c, dd); };
  const A = [-hw, 0, hd], B = [hw, 0, hd], C = [0, h, hd];
  const A2 = [-hw, 0, -hd], B2 = [hw, 0, -hd], C2 = [0, h, -hd];
  tri(A, B, C); tri(B2, A2, C2);
  quad(A2, A, C, C2); quad(B, B2, C2, C); quad(A, A2, B2, B);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function gambrelGeo(w, d, h, over = 0.15) {
  const hw = w / 2 + over, hd = d / 2 + over;
  const s = new THREE.Shape();
  s.moveTo(-hw, 0); s.lineTo(-hw * 0.62, h * 0.65); s.lineTo(0, h);
  s.lineTo(hw * 0.62, h * 0.65); s.lineTo(hw, 0); s.lineTo(-hw, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: hd * 2, bevelEnabled: false });
  geo.translate(0, 0, -hd);
  return geo;
}

function addBody(g, w, h, d, c, x = 0, y = 0, z = 0) {
  return tintAs(add(g, new THREE.BoxGeometry(w, h, d), mat(c, { r: 0.9 }), [x, y + h / 2, z]), 'body');
}
// ridge along x (typical: along the long side of the house)
function addRoofX(g, w, d, h, c, y) {
  const me = new THREE.Mesh(gableGeo(d, w, h), dsMat(c, { flat: true, r: 0.95 }));
  me.rotation.y = Math.PI / 2; me.position.y = y;
  me.castShadow = me.receiveShadow = true; g.add(me);
  return tintAs(me, 'roof');
}
// ridge along z (gable end faces the viewer/street)
function addRoofZ(g, w, d, h, c, y) {
  const me = new THREE.Mesh(gableGeo(w, d, h), dsMat(c, { flat: true, r: 0.95 }));
  me.position.y = y;
  me.castShadow = me.receiveShadow = true; g.add(me);
  return tintAs(me, 'roof');
}
function addWin(g, x, y, z, ry = 0, w = 0.55, h = 0.7) {
  add(g, new THREE.BoxGeometry(w, h, 0.07), mat(GLASS, { r: 0.25 }), [x, y, z], [0, ry, 0]);
}
function addDoor(g, x, z, ry = 0, w = 0.95, h = 2.0, c = 0x5b4232) {
  add(g, new THREE.BoxGeometry(w, h, 0.09), mat(c, { r: 0.9 }), [x, h / 2, z], [0, ry, 0]);
}

function ranch(R) {
  const g = new THREE.Group(); const w = 7, d = 4.6, h = 2.6;
  addBody(g, w, h, d, 0xd9d2c3);
  addRoofX(g, w, d, 1.5, 0x6b6560, h);
  addDoor(g, 0.6, d / 2 + 0.05);
  addWin(g, -1.5, 1.5, d / 2 + 0.05); addWin(g, -2.5, 1.5, d / 2 + 0.05);
  addWin(g, 2.3, 1.5, d / 2 + 0.05, 0, 1.0, 0.75);
  addWin(g, 0, 1.5, -d / 2 - 0.05, 0, 1.0, 0.7); addWin(g, -2, 1.5, -d / 2 - 0.05);
  addWin(g, w / 2 + 0.05, 1.5, 0, Math.PI / 2); addWin(g, -w / 2 - 0.05, 1.5, -0.8, Math.PI / 2);
  add(g, new THREE.BoxGeometry(1.5, 0.13, 0.9), mat(0xb7b0a3, { r: 1 }), [0.6, 0.065, d / 2 + 0.45]);
  return g;
}
function cottage(R) {
  const g = new THREE.Group(); const w = 5, d = 4, h = 2.4;
  addBody(g, w, h, d, 0xc9d4c5);
  addRoofX(g, w, d, 1.7, 0x7c5648, h);
  addDoor(g, 0, d / 2 + 0.05);
  addWin(g, -1.5, 1.4, d / 2 + 0.05); addWin(g, 1.5, 1.4, d / 2 + 0.05);
  addWin(g, w / 2 + 0.05, 1.4, 0, Math.PI / 2);
  add(g, new THREE.BoxGeometry(0.5, 1.6, 0.5), mat(0x8f8378, { r: 1 }), [w / 2 - 0.9, h + 0.9, -0.7]);
  return g;
}
function lranch(R) {
  const g = new THREE.Group(); const h = 2.5;
  addBody(g, 6, h, 4, 0xd6c9b2, 0.8, 0, -1);
  addRoofX(g, 6, 4, 1.3, 0x5f5b56, h);
  g.children[g.children.length - 1].position.set(0.8, h, -1);
  addBody(g, 3, h, 3.6, 0xd6c9b2, -1.7, 0, 1.6);
  addRoofZ(g, 3, 3.6, 1.2, 0x5f5b56, h);
  g.children[g.children.length - 1].position.set(-1.7, h, 1.6);
  addDoor(g, 0.9, 1.05);
  addWin(g, 2.6, 1.5, 1.05); addWin(g, -1.7, 1.4, 3.45);
  addWin(g, 3.1, 1.4, -1, 0, 0.9, 0.7);
  return g;
}
function colonial(R) {
  const g = new THREE.Group(); const w = 7, d = 4.6, H = 5.2;
  addBody(g, w, H, d, 0xe6e2d8);
  addRoofX(g, w, d, 1.6, 0x4f4a45, H);
  addDoor(g, 0, d / 2 + 0.05);
  for (const x of [-2.4, -1.2, 1.2, 2.4]) addWin(g, x, 4.0, d / 2 + 0.05);
  for (const x of [-2.4, -1.2, 1.2, 2.4]) addWin(g, x, 1.5, d / 2 + 0.05);
  addWin(g, 0, 4.0, d / 2 + 0.05);
  addWin(g, w / 2 + 0.05, 1.6, 0, Math.PI / 2); addWin(g, w / 2 + 0.05, 4.0, 0, Math.PI / 2);
  addWin(g, -w / 2 - 0.05, 1.6, 0, Math.PI / 2); addWin(g, -w / 2 - 0.05, 4.0, 0, Math.PI / 2);
  add(g, new THREE.BoxGeometry(1.7, 0.14, 1.0), mat(0xb7b0a3, { r: 1 }), [0, 0.07, d / 2 + 0.5]);
  return g;
}
function modern2(R) {
  const g = new THREE.Group();
  addBody(g, 4.2, 5.5, 5, 0xe8e6e0, -1.1);
  tintAs(add(g, new THREE.BoxGeometry(2.9, 3.1, 5.6), mat(0x44484d, { r: 0.85 }), [2.05, 1.55, 0]), 'roof');
  tintAs(add(g, new THREE.BoxGeometry(4.4, 0.25, 5.2), mat(0x3f4348, { r: 0.9 }), [-1.1, 5.62, 0]), 'roof');
  add(g, new THREE.BoxGeometry(2.2, 1.7, 0.07), mat(GLASS, { r: 0.2 }), [-1.1, 4.2, 2.55]);
  add(g, new THREE.BoxGeometry(2.4, 1.5, 0.07), mat(GLASS, { r: 0.2 }), [2.05, 1.6, 2.85]);
  add(g, new THREE.BoxGeometry(0.07, 1.7, 3.0), mat(GLASS, { r: 0.2 }), [-3.25, 4.2, 0]);
  addDoor(g, -1.1, 2.55, 0, 1.0, 2.2, 0x2e3236);
  return g;
}
function farmhouse(R) {
  const g = new THREE.Group(); const w = 6, d = 4.4, H = 5;
  addBody(g, w, H, d, 0xf0ede4);
  addRoofX(g, w, d, 1.7, 0x4f4a45, H);
  const porchZ = d / 2 + 1.1;
  tintAs(add(g, new THREE.BoxGeometry(w, 0.12, 1.5), dsMat(0x4f4a45, { r: 0.95 }), [0, 2.5, d / 2 + 0.75], [-0.18, 0, 0]), 'roof');
  for (const x of [-2.6, -0.9, 0.9, 2.6]) add(g, new THREE.BoxGeometry(0.1, 2.4, 0.1), mat(0xe8e4da), [x, 1.2, porchZ - 0.25]);
  add(g, new THREE.BoxGeometry(w, 0.14, 1.5), mat(0xb7b0a3, { r: 1 }), [0, 0.07, d / 2 + 0.75]);
  addDoor(g, 0, d / 2 + 0.05);
  addWin(g, -1.9, 1.5, d / 2 + 0.05); addWin(g, 1.9, 1.5, d / 2 + 0.05);
  for (const x of [-1.9, 0, 1.9]) addWin(g, x, 3.9, d / 2 + 0.05);
  return g;
}
function garage(R) {
  const g = new THREE.Group(); const w = 4.2, d = 5.5, h = 2.7;
  addBody(g, w, h, d, 0xd0cabb);
  addRoofZ(g, w, d, 1.2, 0x6b6560, h);
  add(g, new THREE.BoxGeometry(2.8, 2.2, 0.1), mat(0xe9e6df, { r: 0.9 }), [0, 1.1, d / 2 + 0.05]);
  for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(2.8, 0.04, 0.12), mat(0xc9c5bc), [0, 0.6 + i * 0.55, d / 2 + 0.07]);
  addWin(g, w / 2 + 0.05, 1.6, 0.8, Math.PI / 2);
  addDoor(g, -w / 2 - 0.05, -1.6, Math.PI / 2, 0.85, 1.95);
  return g;
}
function barn(R) {
  const g = new THREE.Group(); const w = 5.5, d = 7, h = 2.8;
  addBody(g, w, h, d, 0x9e3b32);
  const roof = new THREE.Mesh(gambrelGeo(w, d, 2.4), dsMat(0x7a7f85, { flat: true, r: 0.9 }));
  roof.position.y = h; roof.castShadow = roof.receiveShadow = true;
  g.add(tintAs(roof, 'roof'));
  add(g, new THREE.BoxGeometry(2.3, 2.5, 0.1), mat(0x6e2a24, { r: 0.95 }), [0, 1.25, d / 2 + 0.06]);
  add(g, new THREE.BoxGeometry(2.5, 0.14, 0.12), mat(0xe8e4da), [0, 2.55, d / 2 + 0.07]);
  add(g, new THREE.BoxGeometry(0.14, 2.5, 0.12), mat(0xe8e4da), [-1.2, 1.25, d / 2 + 0.07]);
  add(g, new THREE.BoxGeometry(0.14, 2.5, 0.12), mat(0xe8e4da), [1.2, 1.25, d / 2 + 0.07]);
  addWin(g, 0, h + 1.1, d / 2 + 0.05, 0, 0.6, 0.6);
  return g;
}
function shed(R) {
  const g = new THREE.Group(); const w = 2.6, d = 2.2, h = 2.1;
  addBody(g, w, h, d, 0x9a7d5a);
  tintAs(add(g, new THREE.BoxGeometry(w + 0.35, 0.1, d + 0.5), dsMat(0x6f6a64, { flat: true, r: 0.95 }), [0, h + 0.16, 0], [0.16, 0, 0]), 'roof');
  addDoor(g, -0.3, d / 2 + 0.05, 0, 0.8, 1.8);
  addWin(g, 0.75, 1.4, d / 2 + 0.05, 0, 0.45, 0.45);
  return g;
}
function storefront(R) {
  const g = new THREE.Group(); const w = 7, d = 5, h = 3.6;
  addBody(g, w, h, d, 0xc9b8a0);
  tintAs(add(g, new THREE.BoxGeometry(w + 0.2, 0.55, d + 0.2), mat(0xa89a86, { r: 0.95 }), [0, h + 0.27, 0]), 'body');
  add(g, new THREE.BoxGeometry(2.6, 2.1, 0.08), mat(GLASS, { r: 0.15 }), [-2.0, 1.25, d / 2 + 0.05]);
  add(g, new THREE.BoxGeometry(2.6, 2.1, 0.08), mat(GLASS, { r: 0.15 }), [2.0, 1.25, d / 2 + 0.05]);
  add(g, new THREE.BoxGeometry(1.0, 2.15, 0.08), mat(0x39434c, { r: 0.3 }), [0, 1.1, d / 2 + 0.06]);
  for (const x of [-2.0, 2.0]) {
    tintAs(add(g, new THREE.BoxGeometry(2.8, 0.09, 1.0), dsMat(0xa63d3f, { r: 0.9 }), [x, 2.6, d / 2 + 0.45], [0.35, 0, 0]), 'roof');
  }
  add(g, new THREE.BoxGeometry(4.5, 0.7, 0.1), mat(0xefe9dc, { r: 0.9 }), [0, 3.1, d / 2 + 0.06]);
  return g;
}
function office(R) {
  const g = new THREE.Group(); const w = 6, d = 6, H = 8.4;
  addBody(g, w, H, d, 0xa9adb3);
  tintAs(add(g, new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2), mat(0x7d838a, { r: 0.9 }), [0, H + 0.2, 0]), 'roof');
  for (let f = 0; f < 3; f++) {
    const y = 1.7 + f * 2.55;
    for (let cIdx = -2; cIdx <= 2; cIdx++) {
      addWin(g, cIdx * 1.05, y, d / 2 + 0.05, 0, 0.7, 1.1);
      addWin(g, cIdx * 1.05, y, -d / 2 - 0.05, 0, 0.7, 1.1);
      addWin(g, w / 2 + 0.05, y, cIdx * 1.05, Math.PI / 2, 0.7, 1.1);
    }
  }
  add(g, new THREE.BoxGeometry(1.9, 2.3, 0.1), mat(0x39434c, { r: 0.2 }), [0, 1.15, d / 2 + 0.07]);
  return g;
}
function warehouse(R) {
  const g = new THREE.Group(); const w = 9, d = 11, h = 4;
  tintAs(add(g, new THREE.BoxGeometry(w, h, d), mat(0x9aa0a6, { r: 0.55, m: 0.35 }), [0, h / 2, 0]), 'body');
  addRoofX(g, w, d, 1.1, 0x84898f, h);
  add(g, new THREE.BoxGeometry(2.6, 3.0, 0.1), mat(0xcfd3d6, { r: 0.6, m: 0.3 }), [-2.2, 1.5, d / 2 + 0.06]);
  add(g, new THREE.BoxGeometry(2.6, 3.0, 0.1), mat(0xcfd3d6, { r: 0.6, m: 0.3 }), [1.4, 1.5, d / 2 + 0.06]);
  addDoor(g, 3.6, d / 2 + 0.05, 0, 0.9, 2.0, 0x5a5f66);
  for (let i = 0; i < 5; i++) addWin(g, -w / 2 - 0.05, 3.3, -4 + i * 2, Math.PI / 2, 1.1, 0.5);
  return g;
}

ASSETS.push(
  { id: 'ranch',     name: 'Ranch home',        icon: '🏠', cat: 'Homes — single story', fp: 4.3, build: ranch,     tint: ['body', 'roof'], colors: { body: '#d9d2c3', roof: '#6b6560' } },
  { id: 'cottage',   name: 'Cottage',           icon: '🏡', cat: 'Homes — single story', fp: 3.3, build: cottage,   tint: ['body', 'roof'], colors: { body: '#c9d4c5', roof: '#7c5648' } },
  { id: 'lranch',    name: 'L-shaped ranch',    icon: '🛖', cat: 'Homes — single story', fp: 4.3, build: lranch,    tint: ['body', 'roof'], colors: { body: '#d6c9b2', roof: '#5f5b56' } },
  { id: 'colonial',  name: 'Colonial',          icon: '🏛️', cat: 'Homes — two story',    fp: 4.3, build: colonial,  tint: ['body', 'roof'], colors: { body: '#e6e2d8', roof: '#4f4a45' } },
  { id: 'modern2',   name: 'Modern two-story',  icon: '🪟', cat: 'Homes — two story',    fp: 4.0, build: modern2,   tint: ['body', 'roof'], colors: { body: '#e8e6e0', roof: '#3f4348' } },
  { id: 'farmhouse', name: 'Farmhouse',         icon: '🌾', cat: 'Homes — two story',    fp: 4.0, build: farmhouse, tint: ['body', 'roof'], colors: { body: '#f0ede4', roof: '#4f4a45' } },
  { id: 'garage',    name: 'Detached garage',   icon: '🚗', cat: 'Outbuildings',         fp: 3.6, build: garage,    tint: ['body', 'roof'], colors: { body: '#d0cabb', roof: '#6b6560' } },
  { id: 'barn',      name: 'Barn',              icon: '🐮', cat: 'Outbuildings',         fp: 4.7, build: barn,      tint: ['body', 'roof'], colors: { body: '#9e3b32', roof: '#7a7f85' } },
  { id: 'shed',      name: 'Shed',              icon: '🛠️', cat: 'Outbuildings',         fp: 2.0, build: shed,      tint: ['body', 'roof'], colors: { body: '#9a7d5a', roof: '#6f6a64' } },
  { id: 'storefront',name: 'Storefront',        icon: '🏪', cat: 'Commercial',           fp: 4.5, build: storefront,tint: ['body', 'roof'], colors: { body: '#c9b8a0', roof: '#a63d3f' } },
  { id: 'office',    name: 'Office building',   icon: '🏢', cat: 'Commercial',           fp: 4.5, build: office,    tint: ['body', 'roof'], colors: { body: '#a9adb3', roof: '#7d838a' } },
  { id: 'warehouse', name: 'Warehouse',         icon: '🏭', cat: 'Commercial',           fp: 6.6, build: warehouse, tint: ['body', 'roof'], colors: { body: '#9aa0a6', roof: '#84898f' } },
);

/* ================= drawn curves (walls & paving) ================= */
export const CURVES = [
  { id: 'rockwall',   name: 'Rock wall (draw)',          icon: '🧱', kind: 'stones', width: 0.5,  height: 0.55, colors: { body: '#8f8f88' } },
  { id: 'concwall',   name: 'Concrete wall (draw)',      icon: '⬜', kind: 'sweep',  width: 0.28, height: 0.9,  colors: { body: '#b6b1a7' } },
  { id: 'walkway',    name: 'Concrete walkway (draw)',   icon: '🚶', kind: 'sweep',  width: 1.2,  height: 0.07, colors: { body: '#c0bbb0' } },
  { id: 'driveway',   name: 'Driveway — concrete (draw)',icon: '🛣️', kind: 'sweep',  width: 3.2,  height: 0.09, colors: { body: '#b3aea4' } },
  { id: 'driveway-a', name: 'Driveway — asphalt (draw)', icon: '🛣️', kind: 'sweep',  width: 3.2,  height: 0.09, colors: { body: '#3d3f43' } },
];

export function curveDef(id) { return CURVES.find(c => c.id === id); }

// Sweep a rectangular cross-section along a Catmull-Rom spline through pts
// ([x,y,z] triples). The base is sunk 0.15 so it hugs uneven terrain.
function sweepGeo(pts, width, height) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const n = Math.min(600, Math.max(12, Math.round(curve.getLength() * 3)));
  const P = curve.getSpacedPoints(n);
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const p = P[i];
    const t = (i < n ? P[i + 1].clone().sub(p) : p.clone().sub(P[i - 1]));
    t.y = 0;
    if (t.lengthSq() < 1e-8) t.set(1, 0, 0); else t.normalize();
    const nx = -t.z, nz = t.x, hw = width / 2;
    ring.push([
      [p.x + nx * hw, p.y - 0.15, p.z + nz * hw],
      [p.x - nx * hw, p.y - 0.15, p.z - nz * hw],
      [p.x - nx * hw, p.y + height, p.z - nz * hw],
      [p.x + nx * hw, p.y + height, p.z + nz * hw],
    ]);
  }
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const r0 = ring[i], r1 = ring[i + 1];
    quad(r0[0], r1[0], r1[3], r0[3]);
    quad(r1[1], r0[1], r0[2], r1[2]);
    quad(r0[3], r1[3], r1[2], r0[2]);
  }
  quad(ring[0][1], ring[0][0], ring[0][3], ring[0][2]);
  const e = ring[n];
  quad(e[0], e[1], e[2], e[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildCurve(id, pts, seed, colors) {
  const def = curveDef(id);
  const R = makeRng(seed);
  const g = new THREE.Group();
  g.userData.assetId = id;
  const bodyC = (colors && colors.body) || def.colors.body;
  if (def.kind === 'sweep') {
    const m = dsMat(new THREE.Color(bodyC).getHex(), { flat: true, r: 0.95 });
    const me = new THREE.Mesh(sweepGeo(pts, def.width, def.height), m);
    me.castShadow = def.height > 0.2;
    me.receiveShadow = true;
    me.userData.tint = 'body';
    g.add(me);
  } else {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const n = Math.min(300, Math.max(4, Math.round(curve.getLength() / 0.32)));
    const P = curve.getSpacedPoints(n);
    const base = new THREE.Color(bodyC);
    for (let i = 0; i <= n; i++) {
      const p = P[i];
      const rows = 2 + (i % 2);
      for (let r = 0; r < rows; r++) {
        const shade = 0.78 + R() * 0.45;
        const me = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.16 + R() * 0.1, 0),
          mat(base.clone().multiplyScalar(shade).getHex(), { flat: true, r: 1 }));
        me.userData.tint = 'body';
        me.userData.shade = shade;
        me.position.set(p.x + (R() - 0.5) * 0.18, p.y + 0.1 + r * 0.19, p.z + (R() - 0.5) * 0.18);
        me.rotation.set(R() * 3, R() * 3, R() * 3);
        me.scale.set(1 + R() * 0.6, 0.72, 1 + R() * 0.6);
        me.castShadow = me.receiveShadow = true;
        g.add(me);
      }
    }
  }
  return g;
}
