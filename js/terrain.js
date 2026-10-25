// Sculptable, paintable ground plane for from-scratch designs.
import * as THREE from 'three';

export const SIZE = 40;
export const SEGS = 240;
export const BASE = -3; // bottom of the earth slab (m)
export const WATER_LEVEL = -0.6; // waterfront lots: water surface, below lawn grade (m)
const BEACH = 5;                 // a beach eases the lawn down to the water over this run (m)
const SNAP = 0.25;               // > one grid-cell diagonal (see Terrain._snap)
const SAND = new THREE.Color('#d6c59b'), WET_SAND = new THREE.Color('#b8a47c');
const SAND_UW = [new THREE.Color('#a8976f'), new THREE.Color('#8a7c5d'), new THREE.Color('#6d6450')];
const SILT = new THREE.Color('#5a5446');

// Signed distance from (x,z) to a polyline [[x,z],...] whose end segments run on
// as rays, so a shoreline drawn part-way across the lot still splits it in two.
// Positive is to the left of the drawing direction (along (-dz, dx)).
export function shoreDist(pts, x, z) { return nearestOnLine(pts, x, z, false).sd; }

// Nearest point on a polyline (open with end rays, or a closed outline):
// {sd, qx, qz, nx, nz} — signed distance (+ = left of the drawing direction;
// for an outline, + = inside), the nearest point, and the left normal there.
function nearestOnLine(pts, x, z, closed) {
  let best = Infinity, bs = 0, bt = 0, qx = 0, qz = 0;
  const n = closed ? pts.length : pts.length - 1;
  const nrm = (s) => {
    const [ax, az] = pts[s], [bx, bz] = pts[(s + 1) % pts.length];
    const l = Math.hypot(bx - ax, bz - az) || 1e-9;
    return [-(bz - az) / l, (bx - ax) / l];
  };
  for (let s = 0; s < n; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[(s + 1) % pts.length];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    if (closed || s > 0) t = Math.max(0, t);
    if (closed || s < n - 1) t = Math.min(1, t);
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bs = s; bt = t; qx = px; qz = pz; }
  }
  let [nx, nz] = nrm(bs);
  let inside;
  if (closed) {
    // even-odd ray test: a side test against the nearest edge is ambiguous
    // for points lined up with an edge's extension
    inside = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, za] = pts[a], [xb, zb] = pts[b];
      if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) inside = !inside;
    }
  } else {
    // nearest point on a joint: side by the two segments' averaged normal
    const j = bt <= 0 && bs > 0 ? bs - 1 : bt >= 1 && bs < n - 1 ? bs + 1 : -1;
    if (j >= 0) { const [mx, mz] = nrm(j); nx += mx; nz += mz; }
    inside = (x - qx) * nx + (z - qz) * nz >= 0;
  }
  return { sd: inside ? best : -best, qx, qz, nx, nz };
}

// Which side of a drawn shoreline is water: +1 = left of the drawing direction.
// By default the water lies away from the middle of the lot; flip swaps it.
export function waterSide(pts, flip) {
  const c = shoreDist(pts, 0, 0);
  const side = Math.abs(c) < 1 ? 1 : c > 0 ? -1 : 1;
  return flip ? -side : side;
}

// Tileable ripple normal map for the water surface: a few octaves of
// wrapping value noise, so the ripples don't read as a repeating grid.
function rippleNormals() {
  const S = 256, h = new Float32Array(S * S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const [G, amp] of [[8, 1], [16, 0.55], [32, 0.3], [64, 0.15]]) {
    const g = Array.from({ length: G * G }, rnd);
    const at = (x, y) => g[((y + G) % G) * G + ((x + G) % G)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x / S * G, fy = y / S * G, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      h[y * S + x] += (top * (1 - sy) + bot * sy) * amp;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), n = new THREE.Vector3();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S];
    const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
    n.set(-dx * 6, -dy * 6, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function skyGradient() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#7fa9d6'); gr.addColorStop(0.47, '#d7e5ee'); gr.addColorStop(0.53, '#7d8a72'); gr.addColorStop(1, '#3d4a38');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soil profile shown in the slab walls and anywhere the ground is dug below grade
const STRATA = [[0, '#5e422a'], [0.3, '#6b4a2e'], [0.34, '#9a7550'], [1.1, '#a27e57'], [1.2, '#8f8778'], [9, '#7d766a']];
const _strat = STRATA.map(([d, c]) => [d, new THREE.Color(c)]);
function soilAt(depth, out) {
  for (let i = 1; i < _strat.length; i++) {
    if (depth <= _strat[i][0]) {
      const [d0, c0] = _strat[i - 1], [d1, c1] = _strat[i];
      return out.copy(c0).lerp(c1, (depth - d0) / (d1 - d0 || 1));
    }
  }
  return out.copy(_strat[_strat.length - 1][1]);
}

export const PAINTS = [
  { name: 'Grass', c: '#5d9e4c' },
  { name: 'Soil',  c: '#7a5230' },
  { name: 'Mulch', c: '#5b4232' },
  { name: 'Stone', c: '#93938c' },
  { name: 'Sand',  c: '#d3bd8a' },
  { name: 'Beauty bark', c: '#7a4530' },
];

export class Terrain {
  constructor() {
    const N = this.N = SEGS + 1;
    this.heights = new Float32Array(N * N);
    this.paint = new Uint8Array(N * N);
    this.noise = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) this.noise[i] = 0.92 + Math.random() * 0.16;

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.cuts = [];
    this._cutKey = '';
    this.eff = new Float32Array(N * N); // surface after trenches are cut
    // earth slab: four walls from the surface down to BASE, plus a floor
    const ROWS = STRATA.length;
    this._skirtRows = STRATA.map(([d]) => d);
    const nv = 4 * N * ROWS;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const idx = [];
    for (let side = 0; side < 4; side++) {
      const o = side * N * ROWS;
      for (let k = 0; k < N - 1; k++) for (let r = 0; r < ROWS - 1; r++) {
        const a = o + k * ROWS + r, b = o + (k + 1) * ROWS + r;
        if (side === 1 || side === 2) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    sg.setIndex(idx);
    this.skirtGeo = sg;
    this.skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    this.skirt.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(Math.PI / 2).translate(0, BASE, 0),
      new THREE.MeshStandardMaterial({ color: '#5f5950', roughness: 1 }));
    this.skirt.add(floor);
    this.mesh.add(this.skirt);
    // waterfront: one water sheet at WATER_LEVEL (land above it hides it), and
    // translucent walls where the slab edge cuts through open water
    const ripple = rippleNormals();
    ripple.repeat.set(6, 6);
    const wm = new THREE.MeshStandardMaterial({
      color: '#285663', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.8,
      envMap: skyGradient(), envMapIntensity: 0.8, normalMap: ripple, normalScale: new THREE.Vector2(0.45, 0.45),
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2).translate(0, WATER_LEVEL, 0), wm);
    this.water.receiveShadow = true;
    this.water.visible = false;
    this.water.onBeforeRender = () => {
      const t = performance.now() / 1000;
      ripple.offset.set(t * 0.012, t * 0.007);
    };
    this.mesh.add(this.water);
    const wv = 4 * N * 2;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wv * 3), 3));
    const widx = [];
    for (let side = 0; side < 4; side++) for (let k = 0; k < N - 1; k++) {
      const a = (side * N + k) * 2, b = a + 2;
      widx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    wg.setIndex(widx);
    this.waterSideGeo = wg;
    this.waterSides = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      color: '#24505c', roughness: 0.2, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.waterSides.visible = false;
    this.mesh.add(this.waterSides);
    this._cols = PAINTS.map(p => new THREE.Color(p.c));
    this.refresh();
  }

  // surface height, after trenches, terraces and shorelines
  heightAt(x, z) { return this._sample(this.eff, x, z); }
  // the sculpted ground before any of those are applied
  gradeAt(x, z) { return this._sample(this.heights, x, z); }

  _sample(h, x, z) {
    const N = this.N;
    const gx = Math.min(SEGS - 1e-6, Math.max(0, (x / SIZE + 0.5) * SEGS));
    const gz = Math.min(SEGS - 1e-6, Math.max(0, (z / SIZE + 0.5) * SEGS));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const h00 = h[z0 * N + x0], h10 = h[z0 * N + x0 + 1];
    const h01 = h[(z0 + 1) * N + x0], h11 = h[(z0 + 1) * N + x0 + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  _brush(px, pz, radius, fn) {
    const N = this.N;
    const gx = (px / SIZE + 0.5) * SEGS;
    const gz = (pz / SIZE + 0.5) * SEGS;
    const gr = (radius / SIZE) * SEGS;
    const x0 = Math.max(0, Math.floor(gx - gr)), x1 = Math.min(SEGS, Math.ceil(gx + gr));
    const z0 = Math.max(0, Math.floor(gz - gr)), z1 = Math.min(SEGS, Math.ceil(gz + gr));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const d = Math.hypot(ix - gx, iz - gz);
        if (d <= gr) fn(iz * N + ix, 1 - d / gr);
      }
    }
    this.refresh();
  }

  sculpt(px, pz, radius, amount) {
    this._brush(px, pz, radius, (i, f) => {
      const s = f * f * (3 - 2 * f); // smoothstep falloff
      this.heights[i] = Math.max(-2.5, Math.min(4, this.heights[i] + amount * s));
    });
  }

  setPaint(px, pz, radius, idx) {
    this._brush(px, pz, radius, (i, f) => { if (f > 0.12) this.paint[i] = idx; });
  }

  // Ground shaping from drawn items, applied to the effective surface only so
  // deleting the item restores the ground:
  //   trench/creek {pts: [[x,z],...] world polyline, width, depth, flat, lip, tint}
  //   {kind: 'shore', pts, style: 'beach'|'bulkhead', side}
  //   {kind: 'terrace', poly: [[x,z],...] outline, height, inset}
  setCuts(cuts) {
    const key = JSON.stringify(cuts);
    if (key === this._cutKey) return false;
    this._cutKey = key;
    this.cuts = cuts;
    this.refresh();
    return true;
  }

  _applyCuts() {
    const N = this.N, eff = this.eff;
    eff.set(this.heights);
    this.disturbed = this.disturbed || new Uint8Array(N * N);
    this.disturbed.fill(0);
    this.cutTint = this.cutTint || new Array(N * N);
    this.cutTint.fill(null);
    this.hasWater = false;
    this.shift = this.shift || new Float32Array(N * N * 2);
    this.shift.fill(0);
    for (const cut of this.cuts) if (cut.kind === 'shore') this._applyShore(cut);
    for (const cut of this.cuts) if (cut.kind === 'terrace') this._applyTerrace(cut);
    // trenches cut down from whatever the shoreline/terraces left
    const h = this._pre || (this._pre = new Float32Array(N * N));
    h.set(eff);
    const cell = SIZE / SEGS;
    for (const cut of this.cuts) {
      if (cut.kind) continue;
      const tint = cut.tint ? new THREE.Color(cut.tint) : null;
      const half = cut.width / 2;
      for (let s = 0; s < cut.pts.length - 1; s++) {
        const [ax, az] = cut.pts[s], [bx, bz] = cut.pts[s + 1];
        const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9;
        const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - 2 * cell) / cell + SEGS / 2));
        const x1 = Math.min(SEGS, Math.ceil((Math.max(ax, bx) + half + 2 * cell) / cell + SEGS / 2));
        const z0 = Math.max(0, Math.floor((Math.min(az, bz) - half - 2 * cell) / cell + SEGS / 2));
        const z1 = Math.min(SEGS, Math.ceil((Math.max(az, bz) + half + 2 * cell) / cell + SEGS / 2));
        for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
          const x = (ix / SEGS - 0.5) * SIZE, z = (iz / SEGS - 0.5) * SIZE;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
          const px = ax + dx * t, pz = az + dz * t;
          const dist = Math.hypot(x - px, z - pz);
          const i = iz * N + ix;
          if (cut.lip !== false && dist <= half + cell * 1.1) this.disturbed[i] = 1; // spoil/lip around the cut
          if (tint && dist <= half + cell) this.cutTint[i] = tint;
          if (dist > half) continue;
          // flat bottom across cut.flat of the width, then a straight bank up to grade
          let dd = cut.depth;
          if (cut.flat != null && dist > half * cut.flat) dd *= 1 - (dist - half * cut.flat) / (half * (1 - cut.flat));
          eff[i] = Math.min(eff[i], h[i] - dd);
        }
      }
    }
  }

  // Signed distance field over the grid, cached on the cut (it only depends on
  // the drawn line): sd = distance from the line, positive on the water side or
  // inside the outline, and (gx, gz) = the direction sd grows in.
  _field(cut, pts, closed, sign) {
    if (cut._field) return cut._field;
    const N = this.N, sd = new Float32Array(N * N), gx = new Float32Array(N * N), gz = new Float32Array(N * N);
    // on the line itself, step along the left normal, or inward for an outline
    let wind = sign;
    if (closed) {
      let area = 0;
      pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; });
      wind = area >= 0 ? 1 : -1;
    }
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x = (ix / SEGS - 0.5) * SIZE, z = (iz / SEGS - 0.5) * SIZE, i = iz * N + ix;
      const q = nearestOnLine(pts, x, z, closed);
      const d = sign * q.sd, len = Math.hypot(x - q.qx, z - q.qz);
      sd[i] = d;
      if (len > 1e-4) { const k = (d >= 0 ? 1 : -1) / len; gx[i] = (x - q.qx) * k; gz[i] = (z - q.qz) * k; }
      else { gx[i] = q.nx * wind; gz[i] = q.nz * wind; }
    }
    const f = { sd, gx, gz };
    Object.defineProperty(cut, '_field', { value: f, enumerable: false });
    return f;
  }

  // Walls stand on a hard step in the ground, but grid triangles would smear
  // it across a cell. Grid points near the line are slid sideways onto it:
  // the high side to `inner` (inside the wall body), the low side to just
  // behind the wall face, so the step is vertical and hidden in the wall.
  _snap(f, i, inner) {
    const sd = f.sd[i];
    if (Math.abs(sd) >= SNAP) return;
    const to = sd >= 0 ? inner : -0.005;
    this.shift[i * 2] = f.gx[i] * (to - sd);
    this.shift[i * 2 + 1] = f.gz[i] * (to - sd);
  }

  // Waterfront: the water side drops below WATER_LEVEL. A beach eases the lawn
  // down to the waterline as sand and keeps shelving out underwater; a bulkhead
  // holds grade right up to its wall, with deep water straight off it.
  _applyShore(cut) {
    const N = this.N, eff = this.eff, h = this.heights, WL = WATER_LEVEL;
    this.hasWater = true;
    const f = this._field(cut, cut.pts, false, cut.side);
    for (let i = 0; i < N * N; i++) {
      const s = f.sd[i];
      if (cut.style === 'beach') {
        if (s < -BEACH) continue;
        if (s < 0) {
          const k = 1 + s / BEACH, e = k * k * (3 - 2 * k);
          eff[i] = Math.min(eff[i], h[i] + (Math.min(h[i], WL) - h[i]) * e);
          this.cutTint[i] = k > 0.9 ? WET_SAND : SAND;
        } else {
          const d = Math.min(1.6, 0.03 + s * 0.14);
          eff[i] = Math.min(eff[i], WL - d);
          this.cutTint[i] = SAND_UW[Math.min(2, Math.floor(d / 0.55))];
        }
      } else {
        this._snap(f, i, 0.15);
        if (s < 0) continue;
        eff[i] = Math.min(eff[i], WL - 1.35 - Math.min(0.25, s * 0.015));
        this.cutTint[i] = SILT;
      }
    }
  }

  // Raised terrace: fill the outline up to one level top (its highest corner +
  // height); the retaining wall built along the outline hides the step.
  _applyTerrace(cut) {
    const N = this.N, eff = this.eff, poly = cut.poly;
    if (poly.length < 3) return;
    const top = Math.max(...poly.map(([x, z]) => this.gradeAt(x, z))) + cut.height;
    const f = this._field(cut, poly, true, 1);
    for (let i = 0; i < N * N; i++) {
      this._snap(f, i, cut.inset);
      if (f.sd[i] >= 0) eff[i] = Math.max(eff[i], top);
    }
  }

  refresh() {
    this._applyCuts();
    const pos = this.geo.attributes.position;
    const col = this.geo.attributes.color;
    const N = this.N, eff = this.eff;
    const tmp = new THREE.Color();
    const sh = this.shift;
    for (let i = 0; i < N * N; i++) {
      pos.setXYZ(i, (i % N / SEGS - 0.5) * SIZE + sh[i * 2], eff[i], (Math.floor(i / N) / SEGS - 0.5) * SIZE + sh[i * 2 + 1]);
      const n = this.noise[i];
      // dug below grade (trench, or lowered unpainted ground): show the soil
      const dug = Math.max(this.heights[i] - eff[i], this.paint[i] === 0 ? -eff[i] : 0);
      const c = this.cutTint[i] ? tmp.set(this.cutTint[i]) : dug > 0.04 ? soilAt(dug, tmp) : this.disturbed[i] ? soilAt(0, tmp) : this._cols[this.paint[i]];
      col.setXYZ(i, Math.min(1, c.r * n), Math.min(1, c.g * n), Math.min(1, c.b * n));
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geo.computeVertexNormals();
    // slab walls follow the surface edge; strata bands hang from it
    const sp = this.skirtGeo.attributes.position, sc = this.skirtGeo.attributes.color;
    const rows = this._skirtRows, R = rows.length;
    const edge = (side, k) => side === 0 ? k : side === 1 ? (N - 1) * N + k : side === 2 ? k * N : k * N + N - 1;
    let v = 0;
    for (let side = 0; side < 4; side++) for (let k = 0; k < N; k++) {
      const i = edge(side, k);
      const x = (i % N / SEGS - 0.5) * SIZE, z = (Math.floor(i / N) / SEGS - 0.5) * SIZE;
      for (let r = 0; r < R; r++, v++) {
        const y = r === R - 1 ? BASE : Math.max(BASE, eff[i] - rows[r]);
        sp.setXYZ(v, x, y, z);
        const c = soilAt(r === R - 1 ? 9 : rows[r], tmp);
        const n = this.noise[(i + r * 7) % (N * N)];
        sc.setXYZ(v, c.r * n, c.g * n, c.b * n);
      }
    }
    sp.needsUpdate = true;
    sc.needsUpdate = true;
    this.skirtGeo.computeVertexNormals();
    this.skirtGeo.computeBoundingSphere();
    this.water.visible = this.waterSides.visible = !!this.hasWater;
    if (this.hasWater) {
      const wp = this.waterSideGeo.attributes.position;
      let w = 0;
      for (let side = 0; side < 4; side++) for (let k = 0; k < N; k++) {
        const i = edge(side, k);
        const x = (i % N / SEGS - 0.5) * SIZE, z = (Math.floor(i / N) / SEGS - 0.5) * SIZE;
        wp.setXYZ(w++, x, WATER_LEVEL, z);
        wp.setXYZ(w++, x, Math.min(WATER_LEVEL, eff[i]), z);
      }
      wp.needsUpdate = true;
      this.waterSideGeo.computeVertexNormals();
      this.waterSideGeo.computeBoundingSphere();
    }
  }

  serialize() {
    return {
      h: Array.from(this.heights, v => Math.round(v * 1000) / 1000),
      p: Array.from(this.paint),
    };
  }

  load(d) {
    if (!d) return this.reset();
    const N = this.N;
    if (d.h.length === N * N) {
      this.heights.set(d.h);
      this.paint.set(d.p);
    } else {
      // saved at an older grid resolution: resample
      const M = Math.round(Math.sqrt(d.h.length));
      for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
        const gx = ix / (N - 1) * (M - 1), gz = iz / (N - 1) * (M - 1);
        const x0 = Math.min(M - 2, Math.floor(gx)), z0 = Math.min(M - 2, Math.floor(gz));
        const fx = gx - x0, fz = gz - z0, at = (x, z) => d.h[z * M + x];
        this.heights[iz * N + ix] = (at(x0, z0) * (1 - fx) + at(x0 + 1, z0) * fx) * (1 - fz) + (at(x0, z0 + 1) * (1 - fx) + at(x0 + 1, z0 + 1) * fx) * fz;
        this.paint[iz * N + ix] = d.p[Math.round(gz) * M + Math.round(gx)];
      }
    }
    this.refresh();
  }

  reset() {
    this.heights.fill(0);
    this.paint.fill(0);
    this.refresh();
  }
}
