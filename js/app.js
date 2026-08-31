import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ASSETS, CURVES, buildAsset, buildCurve, assetDef, curveDef, applyTint, preloadModels } from './assets.js?v=2';
import { Terrain, PAINTS } from './terrain.js?v=2';
import * as Photo from './photo.js?v=2';
import { saveLocal, loadLocal, hasLocal, downloadText, downloadDataUrl } from './storage.js?v=2';
import { UNIT_COSTS, CURVE_RATES, PAINT_RATES, EXCLUDED_CATS, EXCLUDED_TYPES } from './costs.js';

/* ================= renderer ================= */
const canvas = document.getElementById('c');
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

let nextId = 1;
let seedCounter = (Math.random() * 1e9) | 0;
const newSeed = () => (seedCounter = (seedCounter * 1664525 + 1013904223) >>> 0);

/* ================= worlds ================= */
function baseWorld(name) {
  const w = { name, items: [], selected: null, ring: null };
  w.scene = new THREE.Scene();
  w.camera = new THREE.PerspectiveCamera(Photo.FOV, 1, 0.1, 500);
  w.itemsRoot = new THREE.Group();
  w.scene.add(w.itemsRoot);
  return w;
}

// --- design world ---
const design = baseWorld('design');
design.camera.position.set(13, 11, 13);
design.terrain = new Terrain();
design.scene.add(design.terrain.mesh);
design.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a7a4a, 0.9);
design.scene.add(design.hemi);
design.sun = new THREE.DirectionalLight(0xffffff, 2.2);
design.sun.castShadow = true;
const sc = design.sun.shadow.camera;
sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 140;
design.sun.shadow.mapSize.set(2048, 2048);
design.sun.shadow.bias = -0.0005;
design.scene.add(design.sun, design.sun.target);
design.grid = new THREE.GridHelper(40, 40, 0x99aabb, 0x445566);
design.grid.position.y = 0.02;
design.grid.visible = false;
design.scene.add(design.grid);
design.scene.fog = new THREE.Fog(0xaee2ff, 70, 180);
design.controls = new OrbitControls(design.camera, canvas);
design.controls.enableDamping = true;
design.controls.maxPolarAngle = Math.PI / 2 - 0.03;
design.controls.maxDistance = 90;

// --- photo world ---
const photo = baseWorld('photo');
photo.ready = false;
photo.mode = null;
photo.scene.background = new THREE.Color(0x14171c);
photo.photoRoot = new THREE.Group();
photo.scene.add(photo.photoRoot);
photo.hemi = new THREE.HemisphereLight(0xffffff, 0x888877, 1.2);
photo.scene.add(photo.hemi);
photo.sun = new THREE.DirectionalLight(0xffffff, 1.4);
photo.sun.castShadow = true;
const pc = photo.sun.shadow.camera;
pc.left = -14; pc.right = 14; pc.top = 14; pc.bottom = -14; pc.near = 0.5; pc.far = 80;
photo.sun.shadow.mapSize.set(2048, 2048);
photo.sun.shadow.bias = -0.0004;
photo.scene.add(photo.sun, photo.sun.target);
photo.controls = new OrbitControls(photo.camera, canvas);
photo.controls.enableDamping = true;
photo.controls.enabled = false;

let active = design;

/* ================= DOM refs ================= */
const $ = id => document.getElementById(id);
const hintEl = $('hint'), statusEl = $('photo-status');
const brushSlider = $('brush');
const selPanel = $('sel-panel'), selName = $('sel-name'), selRot = $('sel-rot'), selScale = $('sel-scale');


function setStatus(t) { if (statusEl) statusEl.textContent = t; }
function setHint(t) { hintEl.textContent = t; }

/* ================= sun / sky ================= */
function updateSun() {
  const t = 0.5; // fixed midday sun — brightest, clearest client renders
  const a = t * Math.PI;
  const el = Math.sin(a), az = Math.cos(a);
  design.sun.position.set(az * 35, 5 + el * 32, 10);
  design.sun.intensity = 0.4 + el * 2.0;
  const warm = new THREE.Color(0xffc884), day = new THREE.Color(0xffffff);
  design.sun.color.copy(warm).lerp(day, Math.min(1, el * 1.6));
  design.hemi.intensity = 0.35 + el * 0.75;
  const sky = new THREE.Color(0xf0b87e).lerp(new THREE.Color(0xa5d8f2), Math.min(1, el * 1.5));
  design.scene.background = sky;
  design.scene.fog.color.copy(sky);
  // photo: swing shadow direction around the scene
  const c = photo.center || new THREE.Vector3(0, 0, -8);
  photo.sun.position.set(c.x + Math.cos(a * 2) * 10, c.y + 8, c.z + Math.sin(a * 2) * 10);
  photo.sun.target.position.copy(c);
}

/* ================= items ================= */
function spawnObject(world, item) {
  let obj;
  if (item.pts) {
    obj = buildCurve(item.type, resolveCurvePts(world, item), item.seed, item.colors);
    obj.position.set(item.x, 0, item.z);
  } else {
    obj = buildAsset(item.type, item.seed);
    applyTint(obj, item.colors);
    obj.position.set(item.x, item.y, item.z);
    obj.rotation.y = item.rot;
    obj.scale.setScalar(item.scale);
  }
  obj.userData.itemId = item.id;
  world.itemsRoot.add(obj);
  if (world === active) updateEstimate();
  return obj;
}

function objectFor(world, id) {
  return world.itemsRoot.children.find(o => o.userData.itemId === id);
}

function itemFor(world, id) { return world.items.find(i => i.id === id); }

function assetDefAny(t) { return assetDef(t) || curveDef(t); }

// Curve items bake rotation/scale into their geometry (so walls can follow the
// terrain); this resolves an item's stored local points into build-space.
function resolveCurvePts(world, item) {
  const c = Math.cos(item.rot), s = Math.sin(item.rot);
  return item.pts.map(([dx, dy, dz]) => {
    const x = (dx * c + dz * s) * item.scale;
    const z = (-dx * s + dz * c) * item.scale;
    const y = world === design ? design.terrain.heightAt(item.x + x, item.z + z) : dy;
    return [x, y, z];
  });
}

function curveRadius(item) {
  let r = 1;
  for (const [dx, , dz] of item.pts) r = Math.max(r, Math.hypot(dx, dz));
  return (r + (curveDef(item.type).width || 1) / 2 + 0.3) * item.scale;
}

/* ================= cost estimate ================= */
let priceOverrides = {};
let qtyOverrides = {};
let customLines = []; // landscaper-entered services: {id, label, amount}

function curveLenFt(world, it) {
  const pts = resolveCurvePts(world, it).map(pt => new THREE.Vector3(...pt));
  return new THREE.CatmullRomCurve3(pts).getLength() * 3.28084;
}

// Returns the estimated cost for one item, or null if it isn't estimated
// (buildings and driveways are context, not part of the landscaping bid).
function estimateCost(world, it) {
  if (it.pts) {
    if (EXCLUDED_TYPES.has(it.type)) return null;
    if (it.cost != null) return it.cost;
    const rate = CURVE_RATES[it.type];
    return rate == null ? null : Math.round(curveLenFt(world, it) * rate);
  }
  const def = assetDef(it.type);
  if (!def || EXCLUDED_CATS.has(def.cat)) return null;
  return priceOverrides[it.type] ?? UNIT_COSTS[it.type] ?? 0;
}

function estimateData() {
  const world = active;
  const rows = [];
  let total = 0, excluded = 0;
  const groups = new Map();
  const curves = [];
  for (const it of world.items) {
    if (it.pts) {
      if (EXCLUDED_TYPES.has(it.type)) { excluded++; continue; }
      curves.push(it);
    } else {
      const def = assetDef(it.type);
      if (!def || EXCLUDED_CATS.has(def.cat)) { excluded++; continue; }
      groups.set(it.type, (groups.get(it.type) || 0) + 1);
    }
  }
  for (const [type, placed] of groups) {
    const def = assetDef(type);
    const qty = qtyOverrides[type] ?? placed;
    const unit = priceOverrides[type] ?? UNIT_COSTS[type] ?? 0;
    const line = qty * unit;
    total += line;
    rows.push({ kind: 'group', type, def, placed, qty, unit, line });
  }
  for (const it of curves) {
    const def = curveDef(it.type);
    const ft = Math.round(curveLenFt(world, it));
    const cost = estimateCost(world, it) || 0;
    total += cost;
    rows.push({ kind: 'curve', it, def, ft, cost, manual: it.cost != null });
  }
  if (world === design) {
    const cellSqFt = Math.pow(40 / 96, 2) * 10.7639; // one terrain vertex cell, in sq ft
    PAINTS.forEach((paint, idx) => {
      const baseRate = PAINT_RATES[paint.name];
      if (baseRate == null) return;
      let n = 0;
      for (const v of design.terrain.paint) if (v === idx) n++;
      if (!n) return;
      const sqft = Math.round(n * cellSqFt);
      const rate = priceOverrides['paint:' + paint.name] ?? baseRate;
      const line = Math.round(sqft * rate);
      total += line;
      rows.push({ kind: 'paint', name: paint.name, color: paint.c, sqft, rate, line });
    });
  }
  for (const cl of customLines) {
    total += cl.amount || 0;
    rows.push({ kind: 'custom', cl });
  }
  return { rows, total, excluded };
}

function updateEstimate() {
  const rowsEl = $('est-rows');
  if (!rowsEl) return;
  const { rows, total, excluded } = estimateData();
  let html = '';
  for (const r of rows) {
    if (r.kind === 'group') {
      html += `<div class="est-row"><span class="est-name" title="${r.placed} placed in the design">${r.def.icon} ${r.def.name}</span>` +
        `<span class="est-unit"><input type="number" min="0" step="1" class="qtyin" data-qty="${r.type}" value="${r.qty}" title="Quantity — ${r.placed} placed in the design">×</span>` +
        `<span class="est-unit">$<input type="number" min="0" step="1" data-type="${r.type}" value="${r.unit}"></span>` +
        `<span class="est-line">$${r.line.toLocaleString()}</span></div>`;
    } else if (r.kind === 'curve') {
      html += `<div class="est-row"><span class="est-name">${r.def.icon} ${r.def.name.replace(' (draw)', '')} · ${r.ft} ft${r.manual ? ' ✎' : ''}</span>` +
        `<span class="est-unit">$<input type="number" min="0" step="1" data-item="${r.it.id}" value="${r.cost}" title="Edit to set this item's cost"></span></div>`;
    } else if (r.kind === 'paint') {
      html += `<div class="est-row"><span class="est-name"><span class="paintchip" style="background:${r.color}"></span>${r.name} · ~${r.sqft.toLocaleString()} sq ft</span>` +
        `<span class="est-unit">$<input type="number" min="0" step="0.05" data-paint="${r.name}" value="${r.rate}" title="$ per sq ft"></span>` +
        `<span class="est-line">$${r.line.toLocaleString()}</span></div>`;
    } else {
      const esc = (r.cl.label || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      html += `<div class="est-row"><input type="text" class="clabel" placeholder="Service (pruning, debris removal…)" data-clabel="${r.cl.id}" value="${esc}">` +
        `<span class="est-unit">$<input type="number" min="0" step="1" data-camount="${r.cl.id}" value="${r.cl.amount || 0}"></span>` +
        `<button class="cdel" data-cdel="${r.cl.id}" title="Remove line">×</button></div>`;
    }
  }
  rowsEl.innerHTML = html || '<div class="est-empty">Nothing estimated yet — add elements to the design.</div>';
  $('est-total').textContent = '$' + total.toLocaleString();
  $('est-note').textContent = (excluded ? `${excluded} item${excluded > 1 ? 's' : ''} not estimated (buildings & driveways). ` : '') +
    'Prices and quantities are editable.';
}

function estimateLinesText() {
  const { rows, total, excluded } = estimateData();
  const lines = rows.map(r => {
    if (r.kind === 'group') return `${r.qty} x ${r.def.name} @ $${r.unit.toLocaleString()} = $${r.line.toLocaleString()}`;
    if (r.kind === 'curve') return `${r.def.name.replace(' (draw)', '')} (${r.ft} linear ft) = $${r.cost.toLocaleString()}`;
    if (r.kind === 'custom') return `${r.cl.label || 'Additional service'} = $${(r.cl.amount || 0).toLocaleString()}`;
    return `${r.name} (~${r.sqft.toLocaleString()} sq ft @ $${r.rate}/sq ft) = $${r.line.toLocaleString()}`;
  });
  lines.push('', `TOTAL ESTIMATE: $${total.toLocaleString()}`);
  if (excluded) lines.push('(Buildings and driveways shown in the design are not included.)');
  return lines.join('\n');
}

function printEstimate() {
  renderer.render(active.scene, active.camera);
  const shot = renderer.domElement.toDataURL('image/jpeg', 0.85);
  const { rows, total, excluded } = estimateData();
  const tr = rows.map(r => {
    if (r.kind === 'group') return `<tr><td>${r.def.name}</td><td>${r.qty}</td><td>$${r.unit.toLocaleString()}</td><td>$${r.line.toLocaleString()}</td></tr>`;
    if (r.kind === 'curve') return `<tr><td>${r.def.name.replace(' (draw)', '')} — ${r.ft} linear ft</td><td>1</td><td>—</td><td>$${r.cost.toLocaleString()}</td></tr>`;
    if (r.kind === 'custom') { const esc = (r.cl.label || 'Additional service').replace(/&/g, '&amp;').replace(/</g, '&lt;'); return `<tr><td>${esc}</td><td>—</td><td>—</td><td>$${(r.cl.amount || 0).toLocaleString()}</td></tr>`; }
    return `<tr><td>${r.name} — ~${r.sqft.toLocaleString()} sq ft</td><td>—</td><td>$${r.rate}/sq ft</td><td>$${r.line.toLocaleString()}</td></tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><title>Landscape Estimate</title><style>
    body{font:14px/1.5 -apple-system,'Segoe UI',sans-serif;color:#222;background:#fff;max-width:760px;margin:24px auto;padding:0 16px}
    h1{font-size:22px;margin-bottom:2px} .sub{color:#777;margin-bottom:16px}
    img{width:100%;border-radius:8px;margin:12px 0}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}
    th:nth-child(n+2),td:nth-child(n+2){text-align:right;white-space:nowrap}
    tfoot td{font-weight:700;font-size:16px;border-top:2px solid #222;border-bottom:0}
    .note{color:#777;font-size:12px;margin-top:14px}
    [contenteditable]{border-bottom:1px dashed #bbb;min-width:120px;display:inline-block}
    @media print{[contenteditable]{border-bottom:0}}
  </style></head><body>
    <h1>Landscape Estimate</h1>
    <div class="sub">Prepared for <span contenteditable>Client name</span> by <span contenteditable>Your company</span> · ${new Date().toLocaleDateString()}</div>
    <img src="${shot}" alt="Design rendering">
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
    <tbody>${tr}</tbody>
    <tfoot><tr><td colspan="3">Total estimate</td><td>$${total.toLocaleString()}</td></tr></tfoot></table>
    <div class="note">${excluded ? 'Buildings and driveways shown in the rendering are existing or reference structures and are not included in this estimate. ' : ''}Figures are preliminary estimates and subject to a site survey.</div>
  </body></html>`;
  let ov = document.getElementById('print-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'print-overlay';
    ov.innerHTML = '<div class="po-bar"><button id="po-print">🖨 Print / Save as PDF</button>' +
      '<span>Click the dashed fields to fill in client &amp; company names first.</span>' +
      '<button id="po-close">✕ Close</button></div><iframe id="po-frame"></iframe>';
    document.body.appendChild(ov);
    ov.querySelector('#po-close').addEventListener('click', () => ov.classList.add('hidden'));
    ov.querySelector('#po-print').addEventListener('click', () => {
      const f = document.getElementById('po-frame');
      f.contentWindow.focus();
      f.contentWindow.print();
    });
  }
  ov.classList.remove('hidden');
  document.getElementById('po-frame').srcdoc = html;
}

function emailEstimate() {
  const body = `Hello,\n\nHere is your landscape design estimate (${new Date().toLocaleDateString()}):\n\n${estimateLinesText()}\n\nWe would love to walk you through the design — reply any time to schedule a visit.\n`;
  const url = 'mailto:?subject=' + encodeURIComponent('Your landscape design estimate') + '&body=' + encodeURIComponent(body);
  if (url.length > 7500) { setHint('Estimate is too long for an email link — use Print / PDF and attach it instead'); return; }
  window.location.href = url;
  setHint('Opening your email app… attach a 📷 snapshot or the printed PDF for the visual.');
}

function rebuildItems(world) {
  for (const o of [...world.itemsRoot.children]) {
    o.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    world.itemsRoot.remove(o);
  }
  world.items = world.items.filter(i => i.pts ? curveDef(i.type) : assetDef(i.type));
  for (const it of world.items) spawnObject(world, it);
  select(world, world.items.some(i => i.id === world.selected) ? world.selected : null);
  if (world === active) updateEstimate();
}

function removeItem(world, id) {
  const obj = objectFor(world, id);
  if (obj) { obj.traverse(m => { if (m.geometry) m.geometry.dispose(); }); world.itemsRoot.remove(obj); }
  world.items = world.items.filter(i => i.id !== id);
  if (world.selected === id) select(world, null);
  if (world === active) updateEstimate();
}

/* ================= selection ================= */
function ensureRing(world) {
  if (!world.ring) {
    const geo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });
    world.ring = new THREE.Mesh(geo, m);
    world.ring.renderOrder = 999;
    world.scene.add(world.ring);
  }
  return world.ring;
}

function select(world, id) {
  world.selected = id;
  const ring = ensureRing(world);
  const it = id != null ? itemFor(world, id) : null;
  if (!it) {
    ring.visible = false;
    if (world === active) selPanel.classList.add('hidden');
    return;
  }
  const def = assetDefAny(it.type);
  ring.visible = true;
  ring.position.set(it.x, it.y + 0.03, it.z);
  ring.scale.setScalar(it.pts ? curveRadius(it) : def.fp * it.scale);
  if (world === active) {
    selPanel.classList.remove('hidden');
    selName.textContent = `${def.icon} ${def.name.replace(' (draw)', '')}`;
    selRot.value = ((it.rot * 180 / Math.PI) % 360 + 360) % 360;
    selScale.value = it.scale;
    updateColorRows(it, def);
  }
}

function respawnItem(world, it) {
  const obj = objectFor(world, it.id);
  if (obj) {
    obj.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    world.itemsRoot.remove(obj);
  }
  return spawnObject(world, it);
}

function refreshSelected(world, light = false) {
  const it = itemFor(world, world.selected);
  if (!it) return;
  const obj = objectFor(world, it.id);
  if (it.pts) {
    if (light) obj.position.set(it.x, 0, it.z);
    else respawnItem(world, it);
  } else {
    obj.position.set(it.x, it.y, it.z);
    obj.rotation.y = it.rot;
    obj.scale.setScalar(it.scale);
  }
  const ring = ensureRing(world);
  ring.position.set(it.x, it.y + 0.03, it.z);
  ring.scale.setScalar(it.pts ? curveRadius(it) : assetDefAny(it.type).fp * it.scale);
  if (!light && it.pts) updateEstimate();
}

/* ================= undo ================= */
const undoStack = [];
function currentStateStr() {
  return JSON.stringify({
    design: { items: design.items, terrain: design.terrain.serialize() },
    photo: { items: photo.items },
    custom: customLines,
  });
}
function pushUndo(str = currentStateStr()) {
  undoStack.push(str);
  if (undoStack.length > 40) undoStack.shift();
}
function undo() {
  const s = undoStack.pop();
  if (!s) { setHint('Nothing to undo'); return; }
  const st = JSON.parse(s);
  design.items = st.design.items;
  design.terrain.load(st.design.terrain);
  photo.items = st.photo.items;
  customLines = st.custom || [];
  rebuildItems(design);
  rebuildItems(photo);
}

/* ================= raycasting ================= */
function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, active.camera);
}

function groundHit() {
  const targets = active === design ? [design.terrain.mesh] : (photo.pickMeshes || []);
  return raycaster.intersectObjects(targets, false)[0] || null;
}

function cloneHit() {
  return raycaster.intersectObjects(photo.cloneMeshes || [], false)[0] || null;
}

function pickItem() {
  const hits = raycaster.intersectObjects(active.itemsRoot.children, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o.parent && o.parent !== active.itemsRoot) o = o.parent;
  return itemFor(active, o.userData.itemId) || null;
}

/* ================= tools ================= */
let tool = { kind: 'select' };
let ghost = null, ghostSeed = newSeed();
let paintIdx = -1; // >=0 means paint tool

function clearGhost() {
  if (ghost) {
    ghost.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    ghost.parent?.remove(ghost);
    ghost = null;
  }
}

function makeGhost() {
  clearGhost();
  if (tool.kind !== 'place') return;
  ghost = buildAsset(tool.asset, ghostSeed);
  ghost.traverse(m => {
    if (m.material) {
      m.material = m.material.clone();
      m.material.transparent = true;
      m.material.opacity *= 0.55;
      m.material.depthWrite = false;
    }
    m.castShadow = false;
  });
  ghost.visible = false;
  active.scene.add(ghost);
}

function setTool(t) {
  tool = t;
  paintIdx = t.kind === 'paint' ? t.idx : -1;
  document.querySelectorAll('.tool, .palette-grid button, #paints button').forEach(b => b.classList.remove('active'));
  if (t.el) t.el.classList.add('active');
  else if (t.kind === 'select') document.querySelector('[data-tool="select"]').classList.add('active');
  makeGhost();
  clearDrawPreview();
  draw = t.kind === 'draw' ? { asset: t.asset, pts: [], preview: null, lastHover: null } : null;
  updateDrawActions();
  if (t.kind !== 'select' && window.innerWidth <= 760) document.body.classList.remove('sidebar-open');
  if (t.kind !== 'clone' && photo.srcMarker) photo.srcMarker.visible = false;
  updateHint();
}

function updateHint() {
  if (active === photo && !photo.ready) { setHint('Upload a photo to start — or switch to Design mode'); return; }
  switch (tool.kind) {
    case 'select': setHint('Click an item to select · drag to move · R rotate · Del delete · drag empty space to orbit'); break;
    case 'place': setHint(`Click to place ${assetDef(tool.asset).name} · Esc to finish · right-drag to orbit`); break;
    case 'draw': setHint(`Click points to draw ${curveDef(tool.asset).name.replace(' (draw)', '')} · double-click or Enter to finish · Esc to cancel`); break;
    case 'sculpt-up': setHint('Drag to raise the ground · right-drag to orbit'); break;
    case 'sculpt-down': setHint('Drag to lower the ground · right-drag to orbit'); break;
    case 'paint': setHint(`Painting ${PAINTS[tool.idx].name} · drag on the ground · right-drag to orbit`); break;
    case 'clone': setHint('Erase: Alt-click (or first click) sets the source patch, then drag over what you want to remove'); break;
  }
}

/* ================= pointer interaction ================= */
let dragging = null;       // {id}
let stroking = false;      // sculpt/paint
let cloning = null;        // {startUv}
let pendingUndo = null;
let cloneSrc = null;       // THREE.Vector2 uv
let draw = null;           // {asset, pts: Vector3[], preview, lastHover}

function updateDrawActions() {
  $('draw-actions').classList.toggle('hidden', !(draw && draw.pts.length));
}

function clearDrawPreview() {
  if (draw && draw.preview) {
    draw.preview.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    draw.preview.parent?.remove(draw.preview);
    draw.preview = null;
  }
}

function rebuildDrawPreview(hoverPt) {
  clearDrawPreview();
  if (!draw || !draw.pts.length) return;
  const pts = hoverPt ? [...draw.pts, hoverPt] : [...draw.pts];
  const g = new THREE.Group();
  for (const pt of pts) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x4cc2ff, depthTest: false, transparent: true, opacity: 0.9 }));
    dot.renderOrder = 998;
    dot.position.copy(pt);
    g.add(dot);
  }
  if (pts.length >= 2) g.add(buildCurve(draw.asset, pts.map(pt => [pt.x, pt.y, pt.z]), 1, null));
  draw.preview = g;
  active.scene.add(g);
}

function finishDraw() {
  if (!draw) return;
  const pts = draw.pts.filter((pt, i, a) => !i || pt.distanceTo(a[i - 1]) > 0.2);
  clearDrawPreview();
  draw.pts = [];
  draw.lastHover = null;
  updateDrawActions();
  if (pts.length < 2) return;
  pushUndo();
  let cx = 0, cz = 0;
  for (const pt of pts) { cx += pt.x; cz += pt.z; }
  cx /= pts.length; cz /= pts.length;
  const item = {
    id: nextId++, type: draw.asset, seed: newSeed(),
    x: cx, y: 0, z: cz, rot: 0, scale: 1,
    pts: pts.map(pt => [pt.x - cx, pt.y, pt.z - cz]),
  };
  active.items.push(item);
  spawnObject(active, item);
  select(active, item.id);
}

function ensureSrcMarker() {
  if (!photo.srcMarker) {
    photo.srcMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.55, depthTest: false }));
    photo.srcMarker.renderOrder = 999;
    photo.scene.add(photo.srcMarker);
  }
  return photo.srcMarker;
}

function applyStroke(hit) {
  const r = +brushSlider.value;
  if (tool.kind === 'sculpt-up') design.terrain.sculpt(hit.point.x, hit.point.z, r, 0.06);
  else if (tool.kind === 'sculpt-down') design.terrain.sculpt(hit.point.x, hit.point.z, r, -0.06);
  else if (tool.kind === 'paint') design.terrain.setPaint(hit.point.x, hit.point.z, r, tool.idx);
}

function placeItem(hit) {
  pushUndo();
  const item = {
    id: nextId++, type: tool.asset, seed: ghostSeed,
    x: hit.point.x, y: hit.point.y, z: hit.point.z,
    rot: 0,
    scale: 1,
  };
  if (active === design) item.y = design.terrain.heightAt(item.x, item.z);
  active.items.push(item);
  spawnObject(active, item);
  select(active, item.id);
  ghostSeed = newSeed();
  makeGhost();
}

viewport.addEventListener('pointerdown', e => {
  if (e.target !== canvas || e.button !== 0) return;
  if (active === photo && !photo.ready && tool.kind !== 'select') return;
  setRay(e);
  if (tool.kind === 'place') {
    const hit = groundHit();
    if (hit) { active.controls.enabled = false; placeItem(hit); }
  } else if (tool.kind === 'draw') {
    const hit = groundHit();
    if (hit) {
      active.controls.enabled = false;
      draw.pts.push(hit.point.clone());
      rebuildDrawPreview();
      updateDrawActions();
    }
  } else if (tool.kind === 'select') {
    const it = pickItem();
    if (it) {
      active.controls.enabled = false;
      select(active, it.id);
      dragging = { id: it.id, moved: false };
      pendingUndo = currentStateStr();
    } else {
      select(active, null);
    }
  } else if (tool.kind === 'sculpt-up' || tool.kind === 'sculpt-down' || tool.kind === 'paint') {
    if (active !== design) return;
    const hit = groundHit();
    if (hit) { active.controls.enabled = false; pushUndo(); stroking = true; applyStroke(hit); }
  } else if (tool.kind === 'clone') {
    if (active !== photo || !photo.ready) return;
    const hit = cloneHit();
    if (!hit || !hit.uv) return;
    active.controls.enabled = false;
    if (e.altKey || !cloneSrc) {
      cloneSrc = hit.uv.clone();
      ensureSrcMarker().position.copy(hit.point);
      photo.srcMarker.visible = true;
      setHint('Source set — now drag over what you want to remove (Alt-click to move the source)');
    } else {
      Photo.beginCloneStroke(photo);
      cloning = { start: hit.uv.clone() };
      cloneDabAt(hit.uv);
    }
  }
}, true);

function cloneDabAt(uv) {
  const src = new THREE.Vector2(
    cloneSrc.x + (uv.x - cloning.start.x),
    cloneSrc.y + (uv.y - cloning.start.y));
  const px = (+brushSlider.value) * 16;
  Photo.cloneDab(photo, src, uv, px);
}

let moveQueued = false;
window.addEventListener('pointermove', e => {
  if (moveQueued) return;
  moveQueued = true;
  requestAnimationFrame(() => {
    moveQueued = false;
    if (e.target !== canvas && !dragging && !stroking && !cloning && tool.kind !== 'place') return;
    setRay(e);
    if (tool.kind === 'place' && ghost) {
      const hit = groundHit();
      if (hit) {
        ghost.visible = true;
        let y = hit.point.y;
        if (active === design) y = design.terrain.heightAt(hit.point.x, hit.point.z);
        ghost.position.set(hit.point.x, y, hit.point.z);
      } else ghost.visible = false;
    }
    if (tool.kind === 'draw' && draw && draw.pts.length) {
      const hit = groundHit();
      if (hit && (!draw.lastHover || hit.point.distanceTo(draw.lastHover) > 0.15)) {
        draw.lastHover = hit.point.clone();
        rebuildDrawPreview(hit.point);
      }
    }
    if (dragging) {
      const hit = groundHit();
      if (hit) {
        if (!dragging.moved) { dragging.moved = true; pushUndo(pendingUndo); }
        const it = itemFor(active, dragging.id);
        it.x = hit.point.x; it.z = hit.point.z;
        if (!it.pts) it.y = active === design ? design.terrain.heightAt(it.x, it.z) : hit.point.y;
        refreshSelected(active, true);
      }
    }
    if (stroking) {
      const hit = groundHit();
      if (hit) applyStroke(hit);
    }
    if (cloning) {
      const hit = cloneHit();
      if (hit && hit.uv) cloneDabAt(hit.uv);
    }
  });
});

window.addEventListener('pointerup', () => {
  if (dragging && dragging.moved) {
    const it = itemFor(active, dragging.id);
    if (it && it.pts && active === design) respawnItem(active, it);
  }
  if (stroking) {
    stroking = false;
    // re-seat items on the modified terrain
    for (const it of design.items) {
      if (it.pts) respawnItem(design, it);
      else it.y = design.terrain.heightAt(it.x, it.z);
    }
    rebuildPositions(design);
    updateEstimate();
  }
  dragging = null;
  cloning = null;
  pendingUndo = null;
  active.controls.enabled = true;
});

function rebuildPositions(world) {
  for (const it of world.items) {
    const obj = objectFor(world, it.id);
    if (obj) obj.position.y = it.y;
  }
  if (world.selected != null) refreshSelected(world);
}

/* ================= selection panel ================= */
let sliderArmed = true;
function selEdit(fn) {
  const it = itemFor(active, active.selected);
  if (!it) return;
  if (sliderArmed) { pushUndo(); sliderArmed = false; }
  fn(it);
  refreshSelected(active);
}
selRot.addEventListener('input', () => selEdit(it => { it.rot = selRot.value * Math.PI / 180; }));
selScale.addEventListener('input', () => selEdit(it => { it.scale = +selScale.value; }));
selRot.addEventListener('change', () => { sliderArmed = true; });
selScale.addEventListener('change', () => { sliderArmed = true; });

canvas.addEventListener('dblclick', () => { if (tool.kind === 'draw') finishDraw(); });

const colBody = $('col-body'), colRoof = $('col-roof');
function updateColorRows(it, def) {
  const tints = it.pts ? ['body'] : (def.tint || []);
  $('row-body').classList.toggle('hidden', !tints.includes('body'));
  $('row-roof').classList.toggle('hidden', !tints.includes('roof'));
  $('col-reset').classList.toggle('hidden', !tints.length);
  const defs = def.colors || {};
  if (tints.includes('body')) colBody.value = (it.colors && it.colors.body) || defs.body || '#aaaaaa';
  if (tints.includes('roof')) colRoof.value = (it.colors && it.colors.roof) || defs.roof || '#555555';
}
function onColor(role, value) {
  const it = itemFor(active, active.selected);
  if (!it) return;
  if (sliderArmed) { pushUndo(); sliderArmed = false; }
  it.colors = { ...(it.colors || {}), [role]: value };
  if (it.pts) respawnItem(active, it);
  else applyTint(objectFor(active, it.id), it.colors);
}
colBody.addEventListener('input', () => onColor('body', colBody.value));
colRoof.addEventListener('input', () => onColor('roof', colRoof.value));
colBody.addEventListener('change', () => { sliderArmed = true; });
colRoof.addEventListener('change', () => { sliderArmed = true; });
$('est-rows').addEventListener('change', e => {
  const inp = e.target;
  if (inp.dataset.qty) {
    const v = parseInt(inp.value, 10);
    if (isNaN(v) || v < 0) delete qtyOverrides[inp.dataset.qty];
    else qtyOverrides[inp.dataset.qty] = v;
  } else if (inp.dataset.type) {
    const v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) delete priceOverrides[inp.dataset.type];
    else priceOverrides[inp.dataset.type] = v;
  } else if (inp.dataset.paint) {
    const v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) delete priceOverrides['paint:' + inp.dataset.paint];
    else priceOverrides['paint:' + inp.dataset.paint] = v;
  } else if (inp.dataset.clabel) {
    const cl = customLines.find(x => x.id === +inp.dataset.clabel);
    if (cl) cl.label = inp.value;
  } else if (inp.dataset.camount) {
    const cl = customLines.find(x => x.id === +inp.dataset.camount);
    if (cl) cl.amount = Math.max(0, parseFloat(inp.value) || 0);
  } else if (inp.dataset.item) {
    const it = itemFor(active, +inp.dataset.item);
    if (it) {
      const v = parseFloat(inp.value);
      if (isNaN(v) || v < 0) delete it.cost;
      else it.cost = v;
    }
  }
  updateEstimate();
});
$('btn-est').addEventListener('click', () => $('est-panel').classList.toggle('hidden'));
$('est-head').addEventListener('pointerup', () => $('est-panel').classList.toggle('collapsed'));
$('est-rows').addEventListener('click', e => {
  const del = e.target.dataset && e.target.dataset.cdel;
  if (del) {
    pushUndo();
    customLines = customLines.filter(x => x.id !== +del);
    updateEstimate();
  }
});
$('est-add').addEventListener('click', () => {
  pushUndo();
  customLines.push({ id: nextId++, label: '', amount: 0 });
  updateEstimate();
  const inputs = document.querySelectorAll('#est-rows input.clabel');
  if (inputs.length) inputs[inputs.length - 1].focus();
});
$('est-print').addEventListener('click', printEstimate);
$('est-email').addEventListener('click', emailEstimate);

$('col-reset').addEventListener('click', () => {
  const it = itemFor(active, active.selected);
  if (!it || !it.colors) return;
  pushUndo();
  delete it.colors;
  respawnItem(active, it);
  updateColorRows(it, assetDefAny(it.type));
});

$('sel-del').addEventListener('click', () => {
  if (active.selected == null) return;
  pushUndo();
  removeItem(active, active.selected);
});


/* ================= keyboard ================= */
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  switch (e.key) {
    case 'Escape':
      if (tool.kind === 'draw' && draw && draw.pts.length) { draw.pts = []; draw.lastHover = null; clearDrawPreview(); updateDrawActions(); }
      else setTool({ kind: 'select' });
      break;
    case 'Enter': if (tool.kind === 'draw') finishDraw(); break;
    case 'Delete': case 'Backspace':
      if (active.selected != null) { pushUndo(); removeItem(active, active.selected); }
      break;
    case 'r': case 'R':
      selEdit(it => { it.rot += (e.shiftKey ? -15 : 15) * Math.PI / 180; });
      sliderArmed = true;
      break;
    case 'g': case 'G': design.grid.visible = !design.grid.visible; break;
  }
});

/* ================= palette UI ================= */
function buildPalette() {
  const wrap = $('palette-groups');
  const cats = [...new Set(ASSETS.map(a => a.cat))];
  for (const cat of cats) {
    const h = document.createElement('h3');
    h.textContent = cat;
    wrap.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    for (const a of ASSETS.filter(x => x.cat === cat)) {
      const b = document.createElement('button');
      b.textContent = `${a.icon} ${a.name}`;
      b.title = a.name;
      b.addEventListener('click', () => {
        if (tool.kind === 'place' && tool.asset === a.id) setTool({ kind: 'select' });
        else setTool({ kind: 'place', asset: a.id, el: b });
      });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
  }
  const hh = document.createElement('h3');
  hh.textContent = 'Draw: walls & paving';
  wrap.appendChild(hh);
  const dgrid = document.createElement('div');
  dgrid.className = 'palette-grid';
  for (const cdef of CURVES) {
    const b = document.createElement('button');
    b.textContent = `${cdef.icon} ${cdef.name.replace(' (draw)', '')}`;
    b.title = 'Click points on the ground; double-click or Enter to finish';
    b.addEventListener('click', () => {
      if (tool.kind === 'draw' && tool.asset === cdef.id) setTool({ kind: 'select' });
      else setTool({ kind: 'draw', asset: cdef.id, el: b });
    });
    dgrid.appendChild(b);
  }
  wrap.appendChild(dgrid);

  const paints = $('paints');
  PAINTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.style.background = p.c;
    b.textContent = p.name;
    b.addEventListener('click', () => setTool({ kind: 'paint', idx: i, el: b }));
    paints.appendChild(b);
  });
  document.querySelectorAll('.tool').forEach(b => {
    b.addEventListener('click', () => setTool({ kind: b.dataset.tool, el: b }));
  });
}

/* ================= modes ================= */
function setMode(name) {
  active = name === 'photo' ? photo : design;
  document.body.dataset.mode = name;
  design.controls.enabled = name === 'design';
  photo.controls.enabled = name === 'photo';
  if (tool.kind === 'clone' && name === 'design') setTool({ kind: 'select' });
  if ((tool.kind === 'paint' || tool.kind.startsWith('sculpt')) && name === 'photo') setTool({ kind: 'select' });
  makeGhost();
  select(active, active.selected);
  updateEstimate();
  updateHint();
}
$('menu-btn').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
$('draw-done').addEventListener('click', finishDraw);
$('draw-cancel').addEventListener('click', () => {
  if (draw) { draw.pts = []; draw.lastHover = null; }
  clearDrawPreview();
  updateDrawActions();
});

/* ================= photo upload ================= */
async function handlePhotoDataUrl(dataUrl) {
  const img = await Photo.loadImage(dataUrl);
  photo.canvas = Photo.makePhotoCanvas(img, 1600);
  photo.imageDataUrl = photo.canvas.toDataURL('image/jpeg', 0.88);
  photo.items = [];
  rebuildItems(photo);
  setStatus('Analyzing depth… the first run downloads an AI model (~45 MB), please wait.');
  try {
    const depthCanvas = await Photo.estimateDepth(photo.imageDataUrl, p => {
      if (p.status === 'progress' && p.file && p.file.endsWith('.onnx')) {
        setStatus(`Downloading depth model… ${Math.round(p.progress || 0)}%`);
      }
    });
    photo.depthDataUrl = depthCanvas.toDataURL('image/png');
    Photo.buildDepthWorld(photo, photo.canvas, depthCanvas);
    photo.mode = 'depth';
    setStatus('3D model built. Orbit to see the depth, add elements from the palette, or use Erase to remove things. If plants look too big or small, adjust Scene size.');
    $('horizonwrap').classList.add('hidden');
    $('scalewrap').classList.remove('hidden');
    sceneScale = 1;
    applySceneScale(+scaleSlider.value);
  } catch (err) {
    console.warn('depth estimation failed', err);
    photo.depthDataUrl = null;
    Photo.buildFlatWorld(photo, photo.canvas, +horizonSlider.value);
    photo.mode = 'flat';
    setStatus('AI depth unavailable (offline / unsupported browser) — using flat backdrop mode. Adjust the horizon so the ground lines up.');
    $('horizonwrap').classList.remove('hidden');
    $('scalewrap').classList.add('hidden');
  }
  $('shadowwrap').classList.remove('hidden');
  photo.ready = true;
  cloneSrc = null;
  updateSun();
  updateHint();
}
window.__verdura = { handlePhotoDataUrl, design, photo, renderer, Photo }; // for testing/automation

let sceneScale = 1;
function applySceneScale(v) { sceneScale = v; }

/* ================= save / load ================= */
function fullState() {
  return {
    v: 1,
    nextId,
    prices: priceOverrides,
    qtys: qtyOverrides,
    custom: customLines,
    design: { items: design.items, terrain: design.terrain.serialize() },
    photo: null,
  };
}

async function restoreState(st) {
  nextId = st.nextId || 1;
  priceOverrides = st.prices || {};
  qtyOverrides = st.qtys || {};
  customLines = st.custom || [];
  design.items = st.design.items || [];
  design.terrain.load(st.design.terrain);
  photo.items = [];
  rebuildItems(design);
  rebuildItems(photo);
  updateSun();
}

$('btn-save').addEventListener('click', () => {
  setHint(saveLocal(fullState()) ? 'Saved to this browser ✓' : 'Save failed (photo may be too large) — use Export instead');
});
$('btn-load').addEventListener('click', async () => {
  const st = loadLocal();
  if (!st) { setHint('No saved design in this browser yet'); return; }
  pushUndo();
  await restoreState(st);
  setHint('Loaded ✓');
});
$('btn-export').addEventListener('click', () => {
  downloadText('verdura-design.json', JSON.stringify(fullState()));
});
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try { pushUndo(); await restoreState(JSON.parse(r.result)); setHint('Imported ✓'); }
    catch (err) { console.error(err); setHint('Could not read that file'); }
  };
  r.readAsText(f);
  e.target.value = '';
});
$('btn-shot').addEventListener('click', () => {
  renderer.render(active.scene, active.camera);
  downloadDataUrl('verdura.png', renderer.domElement.toDataURL('image/png'));
});
$('btn-new').addEventListener('click', () => {
  if (!confirm(active === design ? 'Clear the current design?' : 'Clear placed items in photo mode?')) return;
  pushUndo();
  if (active === design) { design.items = []; design.terrain.reset(); rebuildItems(design); }
  else { photo.items = []; rebuildItems(photo); }
});
$('btn-undo').addEventListener('click', undo);
$('btn-top').addEventListener('click', () => {
  design.camera.position.set(0.01, 38, 0.01);
  design.controls.target.set(0, 0, 0);
  design.controls.update();
});
$('btn-grid').addEventListener('click', () => { design.grid.visible = !design.grid.visible; });

/* ================= starter scene ================= */
function starterScene() {
  const put = (type, x, z, rot = 0, scale = 1) => {
    const item = { id: nextId++, type, seed: newSeed(), x, y: 0, z, rot, scale };
    design.items.push(item);
    spawnObject(design, item);
  };
  put('oak', -6, -6);
  put('pine', 7, -8);
  put('maple', 8, 3, 2.1);
  put('path', 0, 4);
  put('path', 0, 1.8);
  put('flowers', -3.5, 2.5);
  put('shrub', 3, 2);
  put('shrub', -8, 1, 1.2);
  put('bench', 3.2, 5.5, Math.PI);
  put('lamp', -2, 5.5);
  put('pond', -7, 7);
  put('boulder', -4.6, 8.6, 0.7, 0.8);
  put('ranch', 2, -12);
  const drive = {
    id: nextId++, type: 'driveway-a', seed: newSeed(),
    x: 12.6, y: 0, z: -5.6, rot: 0, scale: 1,
    pts: [[-6.2, 0, -5.6], [-3.6, 0, -5.1], [1.2, 0, -2.6], [4.0, 0, 1.7], [5.0, 0, 6.2]],
  };
  design.items.push(drive);
  spawnObject(design, drive);
}

/* ================= boot ================= */
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  for (const world of [design, photo]) {
    world.camera.aspect = w / h;
    world.camera.updateProjectionMatrix();
  }
}
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);

buildPalette();
updateSun();
starterScene();
updateEstimate();
resize();

// swap in the photoscanned models as they arrive
preloadModels(() => {
  rebuildItems(design);
  rebuildItems(photo);
  makeGhost();
});
setHint(hasLocal()
  ? 'Saved design found — press Load to restore it, or start fresh'
  : 'Pick an element on the left and click the ground to place it');

renderer.setAnimationLoop(() => {
  active.controls.update();
  renderer.render(active.scene, active.camera);
});
