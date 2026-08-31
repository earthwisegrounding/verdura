// Photo mode: turn a yard photo into a 3D relief using in-browser monocular
// depth estimation (Depth Anything V2 via transformers.js), with a flat
// backdrop fallback when the model can't be loaded. Also provides a
// clone-stamp brush for erasing elements from the photo texture.
import * as THREE from 'three';

export const FOV = 55;

export function makePhotoCanvas(img, maxW = 1600) {
  const sc = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc);
  c.height = Math.round(img.height * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/* ---------------- depth estimation ---------------- */
let _pipePromise = null;

async function getPipe(onProgress) {
  if (!_pipePromise) {
    _pipePromise = (async () => {
      const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
      T.env.allowLocalModels = false;
      const model = 'onnx-community/depth-anything-v2-small';
      try {
        return await T.pipeline('depth-estimation', model, { device: 'webgpu', progress_callback: onProgress });
      } catch (e) {
        console.warn('WebGPU unavailable, falling back to WASM', e);
        return await T.pipeline('depth-estimation', model, { progress_callback: onProgress });
      }
    })();
    _pipePromise.catch(() => { _pipePromise = null; });
  }
  return _pipePromise;
}

// Returns a grayscale canvas (255 = near) or throws.
export async function estimateDepth(dataUrl, onProgress) {
  const pipe = await getPipe(onProgress);
  const out = await pipe(dataUrl);
  const d = out.depth; // RawImage, 1 channel
  const c = document.createElement('canvas');
  c.width = d.width; c.height = d.height;
  const ctx = c.getContext('2d');
  const im = ctx.createImageData(d.width, d.height);
  for (let i = 0; i < d.width * d.height; i++) {
    const v = d.data[i];
    im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

/* ---------------- world building ---------------- */
function disposeRoot(root) {
  for (const o of [...root.children]) {
    o.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => {
        if (mm.map) mm.map.dispose();
        mm.dispose();
      });
    });
    root.remove(o);
  }
}

function setupTexture(world, photoCanvas) {
  const tex = new THREE.CanvasTexture(photoCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  world.texture = tex;
  world.texCanvas = photoCanvas;
  world.texCtx = photoCanvas.getContext('2d', { willReadFrequently: true });
  return tex;
}

// Unproject the photo through a virtual camera at the origin looking down -Z.
export function buildDepthWorld(world, photoCanvas, depthCanvas, opts = {}) {
  const { near = 1.5, far = 26 } = opts;
  disposeRoot(world.photoRoot);
  const aspect = photoCanvas.width / photoCanvas.height;
  const W = 144;
  const H = Math.max(64, Math.round(W / aspect));
  const dctx = depthCanvas.getContext('2d', { willReadFrequently: true });
  const dW = depthCanvas.width, dH = depthCanvas.height;
  const dd = dctx.getImageData(0, 0, dW, dH).data;
  const sample = (u, v) => {
    const x = Math.min(dW - 1, Math.round(u * (dW - 1)));
    const y = Math.min(dH - 1, Math.round(v * (dH - 1)));
    return dd[(y * dW + x) * 4] / 255;
  };
  const tanF = Math.tan((FOV * Math.PI) / 360);
  const positions = new Float32Array(W * H * 3);
  const uvs = new Float32Array(W * H * 2);
  let k = 0, ku = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1), v = j / (H - 1);
      const d = sample(u, v);
      const inv = 1 / far + (1 / near - 1 / far) * d;
      const dist = 1 / inv;
      positions[k++] = (u * 2 - 1) * tanF * aspect * dist;
      positions[k++] = (1 - v * 2) * tanF * dist;
      positions[k++] = -dist;
      uvs[ku++] = u; uvs[ku++] = 1 - v;
    }
  }
  const idx = [];
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d2 = c + 1;
      idx.push(a, c, b, b, c, d2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const tex = setupTexture(world, photoCanvas);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  mesh.name = 'photoMesh';
  const shadow = new THREE.Mesh(geo, new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadow.receiveShadow = true;
  shadow.scale.setScalar(0.997);
  world.photoRoot.add(mesh, shadow);

  world.pickMeshes = [mesh];   // for placing items
  world.cloneMeshes = [mesh];  // for the eraser brush
  world.shadowMat = shadow.material;

  const midDist = 1 / (1 / far + (1 / near - 1 / far) * sample(0.5, 0.6));
  world.center = new THREE.Vector3(0, 0, -midDist);
  world.camera.position.set(0, 0, 0);
  world.controls.target.copy(world.center);
  world.controls.maxDistance = far * 1.5;
  clampOrbit(world.controls);
  world.controls.update();
  world.sun.position.set(5, 8, 2);
  world.sun.target.position.set(0, -1, -midDist);
  return { midDist };
}

export function buildFlatWorld(world, photoCanvas, horizon) {
  disposeRoot(world.photoRoot);
  const aspect = photoCanvas.width / photoCanvas.height;
  const backZ = -18, camY = 1.5, camZ = 6;
  const span = camZ - backZ;
  const h = 2 * span * Math.tan((FOV * Math.PI) / 360) * 1.15;
  const w = h * aspect;
  const tex = setupTexture(world, photoCanvas);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  back.position.set(0, 0, backZ);
  back.name = 'backdrop';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ visible: false }));
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.35 }));
  catcher.receiveShadow = true;
  catcher.position.y = 0.001;
  world.photoRoot.add(back, ground, catcher);

  world.pickMeshes = [ground];
  world.cloneMeshes = [back];
  world.shadowMat = catcher.material;
  world.backdrop = back;
  world.backH = h;
  setHorizon(world, horizon);

  world.center = new THREE.Vector3(0, camY, -6);
  world.camera.position.set(0, camY, camZ);
  world.controls.target.set(0, camY, -4);
  world.controls.maxDistance = 40;
  clampOrbit(world.controls);
  world.controls.update();
  world.sun.position.set(5, 9, 3);
  world.sun.target.position.set(0, 0, -6);
}

// A single photo has no geometry for what it couldn't see, so big orbit
// angles show smeared gaps. Allow enough swing to feel the depth, no more.
function clampOrbit(controls) {
  controls.minAzimuthAngle = -0.5;
  controls.maxAzimuthAngle = 0.5;
  controls.minPolarAngle = Math.PI / 2 - 0.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.35;
}

export function setHorizon(world, hz) {
  if (world.backdrop) world.backdrop.position.y = 1.5 - (0.5 - hz) * world.backH;
}

/* ---------------- clone stamp ---------------- */
export function beginCloneStroke(world) {
  const c = document.createElement('canvas');
  c.width = world.texCanvas.width;
  c.height = world.texCanvas.height;
  c.getContext('2d').drawImage(world.texCanvas, 0, 0);
  world._snap = c;
}

export function cloneDab(world, srcUv, dstUv, radiusPx) {
  const W = world.texCanvas.width, H = world.texCanvas.height;
  const r = Math.max(4, Math.round(radiusPx));
  const sx = srcUv.x * W, sy = (1 - srcUv.y) * H;
  const dx = dstUv.x * W, dy = (1 - dstUv.y) * H;
  if (!world._dab || world._dab.width !== r * 2) {
    world._dab = document.createElement('canvas');
    world._dab.width = world._dab.height = r * 2;
  }
  const t = world._dab, tctx = t.getContext('2d');
  tctx.save();
  tctx.globalCompositeOperation = 'source-over';
  tctx.clearRect(0, 0, r * 2, r * 2);
  tctx.drawImage(world._snap, sx - r, sy - r, r * 2, r * 2, 0, 0, r * 2, r * 2);
  const grad = tctx.createRadialGradient(r, r, r * 0.35, r, r, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  tctx.globalCompositeOperation = 'destination-in';
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, r * 2, r * 2);
  tctx.restore();
  world.texCtx.drawImage(t, dx - r, dy - r);
  world.texture.needsUpdate = true;
}
