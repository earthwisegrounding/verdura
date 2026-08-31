// Sculptable, paintable ground plane for from-scratch designs.
import * as THREE from 'three';

export const SIZE = 40;
export const SEGS = 96;

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
    this._cols = PAINTS.map(p => new THREE.Color(p.c));
    this.refresh();
  }

  heightAt(x, z) {
    const N = this.N;
    const gx = Math.min(SEGS - 1e-6, Math.max(0, (x / SIZE + 0.5) * SEGS));
    const gz = Math.min(SEGS - 1e-6, Math.max(0, (z / SIZE + 0.5) * SEGS));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const h = this.heights;
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

  refresh() {
    const pos = this.geo.attributes.position;
    const col = this.geo.attributes.color;
    const N = this.N;
    for (let i = 0; i < N * N; i++) {
      pos.setY(i, this.heights[i]);
      const c = this._cols[this.paint[i]], n = this.noise[i];
      col.setXYZ(i, Math.min(1, c.r * n), Math.min(1, c.g * n), Math.min(1, c.b * n));
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  serialize() {
    return {
      h: Array.from(this.heights, v => Math.round(v * 1000) / 1000),
      p: Array.from(this.paint),
    };
  }

  load(d) {
    if (!d) return this.reset();
    this.heights.set(d.h);
    this.paint.set(d.p);
    this.refresh();
  }

  reset() {
    this.heights.fill(0);
    this.paint.fill(0);
    this.refresh();
  }
}
