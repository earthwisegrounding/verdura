// Sculptable, paintable ground plane for from-scratch designs.
import * as THREE from 'three';

export const SIZE = 40;
export const SEGS = 240;
export const BASE = -3; // bottom of the earth slab (m)

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
    this._cols = PAINTS.map(p => new THREE.Color(p.c));
    this.refresh();
  }

  heightAt(x, z) {
    const N = this.N;
    const gx = Math.min(SEGS - 1e-6, Math.max(0, (x / SIZE + 0.5) * SEGS));
    const gz = Math.min(SEGS - 1e-6, Math.max(0, (z / SIZE + 0.5) * SEGS));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const h = this.eff;
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

  // Trenches: [{pts: [[x,z],...] world polyline, width, depth}]. Cut into the
  // effective surface only, so deleting a trench restores the ground.
  setCuts(cuts) {
    const key = JSON.stringify(cuts);
    if (key === this._cutKey) return false;
    this._cutKey = key;
    this.cuts = cuts;
    this.refresh();
    return true;
  }

  _applyCuts() {
    const N = this.N, eff = this.eff, h = this.heights;
    eff.set(h);
    this.disturbed = this.disturbed || new Uint8Array(N * N);
    this.disturbed.fill(0);
    const cell = SIZE / SEGS;
    for (const cut of this.cuts) {
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
          if (dist <= half + cell * 1.1) this.disturbed[i] = 1; // spoil/lip around the cut
          if (dist > half) continue;
          eff[i] = Math.min(eff[i], h[i] - cut.depth);
        }
      }
    }
  }

  refresh() {
    this._applyCuts();
    const pos = this.geo.attributes.position;
    const col = this.geo.attributes.color;
    const N = this.N, eff = this.eff;
    const tmp = new THREE.Color();
    for (let i = 0; i < N * N; i++) {
      pos.setY(i, eff[i]);
      const n = this.noise[i];
      // dug below grade (trench, or lowered unpainted ground): show the soil
      const dug = Math.max(this.heights[i] - eff[i], this.paint[i] === 0 ? -eff[i] : 0);
      const c = dug > 0.04 ? soilAt(dug, tmp) : this.disturbed[i] ? soilAt(0, tmp) : this._cols[this.paint[i]];
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
