// Custom equipment for the EGR cooler line v3 (Ni paste dispensing → belt → stacking → AMR), modelled in three.js
// and exported as GLB by tools/egr-line-v3/build.mjs. Look: the VEXPLOR reference video (../one_station_ref/, outside the repo) —
// grey-blue anodised 45 mm aluminium profile, silver rollers, black mesh, glass, orange-red accents — with ONE STATION's
// yellow (#EEC539) for safety details. Metres, Y up, origin at the base centre (floor level) of each model.
// Static geometry is merged per material per node; movable parts are their own named nodes (Crane_Carriage,
// Needle_Head, Door_L, …) and carry userData.anim = { type, axis, min, max } (exported as glTF extras).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { egrModuleLine } from './module-line.js';

// ---------------------------------------------------------------- materials
const std = (name, color, metalness, roughness, extra = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra }); m.name = name; return m;
};
function meshTexture() { // one 50 mm cell of welded wire mesh, white wires on transparent (tinted by the material colour)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.name = 'wire_mesh'; return t;
}
function labelTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 84px sans-serif'; const w = g.measureText(text).width, px = w > 236 ? Math.floor(84 * 236 / w) : 84;   // long names shrink to fit (never cut)
  g.font = `bold ${px}px sans-serif`; g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = 'label_' + text; return t;
}
function hazardTexture() { // yellow / black diagonal stripes
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#EEC539'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#111';
  for (let k = -64; k < 128; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 0); g.lineTo(k + 16 - 64, 64); g.lineTo(k - 64, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.name = 'hazard'; return t;
}
function concreteTexture() { // light grey polished concrete, soft trowel blotches
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#c6cacd'; g.fillRect(0, 0, 512, 512);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { const x = rnd() * 512, y = rnd() * 512, r = 20 + rnd() * 90, v = 186 + rnd() * 26 | 0;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v + 3},${v + 6},0.12)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = 'concrete'; return t;
}
let M = null;
function materials() {
  if (M) return M;
  M = {
    alu: std('alu_anodised', 0x9aa7b5, 0.8, 0.36),
    aluDark: std('alu_dark', 0x66727f, 0.75, 0.42),
    plate: std('tooling_plate', 0xb3bac2, 0.9, 0.28),
    steel: std('steel_bright', 0xd4d8dc, 1.0, 0.2),
    stainless: std('stainless', 0xc2c7cc, 1.0, 0.3),
    black: std('black_paint', 0x1c1e21, 0.25, 0.55),
    rubber: std('rubber', 0x111214, 0.0, 0.85),
    sheet: std('sheet_grey', 0xa6acb2, 0.15, 0.55),
    orange: std('orange_red', 0xe0461d, 0.25, 0.42),
    yellow: std('safety_yellow', 0xeec539, 0.2, 0.45),
    red: std('signal_red', 0xc8242b, 0.2, 0.45),
    glass: std('polycarbonate', 0xd3e4ee, 0.0, 0.06, { transparent: true, opacity: 0.18, depthWrite: false }),
    syringe: std('syringe', 0xf2f2ee, 0.0, 0.3, { transparent: true, opacity: 0.55, depthWrite: false }),
    paste: std('ni_paste', 0x8d9196, 0.6, 0.5),
    light: std('ring_light', 0xffffff, 0.0, 0.3, { emissive: 0xffffff, emissiveIntensity: 2.5 }),
    screen: std('hmi_screen', 0x0f1726, 0.1, 0.25, { emissive: 0x1a2a46, emissiveIntensity: 1.0 }),
    display: std('scale_display', 0x161616, 0.1, 0.3, { emissive: 0xeec539, emissiveIntensity: 0.9 }),
    lampG: std('lamp_green', 0x2bbd5a, 0.0, 0.3, { emissive: 0x2bbd5a, emissiveIntensity: 1.2 }),
    lampA: std('lamp_amber', 0xf0a81e, 0.0, 0.3, { emissive: 0xf0a81e, emissiveIntensity: 0.25 }),
    lampR: std('lamp_red', 0xd8262b, 0.0, 0.3, { emissive: 0xd8262b, emissiveIntensity: 0.25 }),
    tote: std('tote_sage', 0x8fa39c, 0.0, 0.55),
    mesh: std('wire_mesh_black', 0x1a1c1f, 0.4, 0.55, { map: meshTexture(), alphaTest: 0.5, side: THREE.DoubleSide }),
    hazard: std('hazard_stripes', 0xffffff, 0.2, 0.5, { map: hazardTexture() }),
    belt: std('belt_pvc', 0x2b2e33, 0.0, 0.7),
    rackWhite: std('rack_white', 0xe2e5e8, 0.3, 0.45),
    concrete: std('concrete_plinth', 0xa9adb1, 0.0, 0.85),
    wall: std('wall_panel', 0xd5d9dd, 0.35, 0.5),
    frameDark: std('frame_dark', 0x3b4148, 0.5, 0.45),
    window: std('window_glass', 0xcfe2f0, 0.1, 0.05, { emissive: 0xdde9f4, emissiveIntensity: 0.6 }),
    steelCol: std('steel_column', 0x8a949e, 0.6, 0.45),
    steelLight: std('steel_purlin', 0xa8b0b8, 0.6, 0.45),
    roof: std('roof_sheet', 0xb9bfc5, 0.4, 0.5, { side: THREE.DoubleSide }),
    skylight: std('skylight', 0xe8f1f8, 0.0, 0.2, { emissive: 0xe8f1f8, emissiveIntensity: 0.8, side: THREE.DoubleSide }),
    floor: std('floor_concrete', 0xffffff, 0.0, 0.32, { map: concreteTexture() }),
    hazardBox: std('hazard_wrap', 0xffffff, 0.2, 0.5, { map: hazardTexture() }),
    ngLabel: std('label_ng', 0xffffff, 0.1, 0.5, { map: labelTexture('NG', '#c8242b', '#ffffff') })
  };
  return M;
}

// ---------------------------------------------------------------- geometry helpers
const G = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); if (parent) parent.add(g); return g; };
const xf = (geo, x, y, z, r) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
};
function bin(node, mat, geo) {
  const b = node.userData._bins || (node.userData._bins = new Map());
  if (!b.has(mat)) b.set(mat, []);
  const g = geo.index ? geo.toNonIndexed() : geo; g.clearGroups(); b.get(mat).push(g);
}
const box = (n, mat, w, h, d, x, y, z, r) => bin(n, mat, xf(new THREE.BoxGeometry(w, h, d), x, y, z, r));
const AX = { x: [0, 0, -Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };
const cyl = (n, mat, rad, h, x, y, z, axis = 'y', seg = 20, radTop) => bin(n, mat, xf(new THREE.CylinderGeometry(radTop ?? rad, rad, h, seg), x, y, z, AX[axis]));
const tor = (n, mat, rad, tube, x, y, z, axis = 'y', seg = 32) => bin(n, mat, xf(new THREE.TorusGeometry(rad, tube, 8, seg), x, y, z, axis === 'y' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]));
function plane(n, mat, w, h, x, y, z, r, cell) { // cell: UV repeat size in metres (wire mesh)
  const g = new THREE.PlaneGeometry(w, h);
  if (cell) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / cell, uv.getY(i) * h / cell); }
  bin(n, mat, xf(g, x, y, z, r));
}
const PROF = new Map();
function profileGeo(s) { // T-slot aluminium profile cross-section (s × s, one slot per face), extruded 1 m along Z, centred
  if (PROF.has(s)) return PROF.get(s);
  const h = s / 2, w = s * 0.11, d = s * 0.18, pts = [];
  const side = (ax, ay, bx, by, nx, ny) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2, tx = (bx - ax) / s, ty = (by - ay) / s;
    pts.push([ax, ay], [mx - tx * w, my - ty * w], [mx - tx * w + nx * d, my - ty * w + ny * d], [mx + tx * w + nx * d, my + ty * w + ny * d], [mx + tx * w, my + ty * w]);
  };
  side(-h, -h, h, -h, 0, 1); side(h, -h, h, h, -1, 0); side(h, h, -h, h, 0, -1); side(-h, h, -h, -h, 1, 0);
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 }); g.translate(0, 0, -0.5);
  PROF.set(s, g); return g;
}
function prof(n, a, b, s = 0.045, mat) { // profile from point a to point b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
  const g = profileGeo(s).clone(); g.scale(1, 1, len);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  bin(n, mat || materials().alu, g);
}
const foot = (n, x, z, y0 = 0) => { cyl(n, materials().rubber, 0.04, 0.012, x, y0 + 0.006, z, 'y', 16); cyl(n, materials().steel, 0.009, 0.05, x, y0 + 0.035, z, 'y', 8); cyl(n, materials().steel, 0.014, 0.012, x, y0 + 0.02, z, 'y', 6); };
const anim = (node, type, axis, min, max) => { node.userData.anim = { type, axis, min, max }; return node; };

function finalize(root) {
  const nodes = []; root.traverse(n => { if (n.userData._bins) nodes.push(n); });
  for (const n of nodes) {
    for (const [mat, list] of n.userData._bins) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.name = n.name + '_' + mat.name; mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; n.add(mesh);
    }
    delete n.userData._bins;
  }
  return root;
}

// ---------------------------------------------------------------- 1. AS/RS stacker crane (travels along X, forks reach ±Z)
function asrsCrane() {
  const m = materials(), root = G('ASRS_Crane'), base = G('Crane_Base', root);
  for (const sx of [-1, 1]) { // wheel blocks on the floor rail (rail top at y 0.10)
    const x = sx * 1.32;
    for (const sz of [-1, 1]) box(base, m.black, 0.42, 0.29, 0.04, x, 0.305, sz * 0.07);
    box(base, m.black, 0.42, 0.03, 0.18, x, 0.435, 0);
    cyl(base, m.steel, 0.11, 0.08, x, 0.21, 0, 'z', 28); cyl(base, m.aluDark, 0.035, 0.18, x, 0.21, 0, 'z', 12);
    for (const dx of [-0.24, 0.24]) for (const sz of [-1, 1]) cyl(base, m.black, 0.035, 0.05, x + dx, 0.075, sz * 0.065, 'y', 14); // side guide rollers
    cyl(base, m.yellow, 0.09, 0.2, sx * 1.6, 0.625, 0, 'x', 20); cyl(base, m.rubber, 0.095, 0.06, sx * 1.73, 0.625, 0, 'x', 20); // buffers
  }
  box(base, m.orange, 3.0, 0.35, 0.42, 0, 0.625, 0);           // bottom beam
  box(base, m.aluDark, 3.02, 0.03, 0.44, 0, 0.815, 0);
  for (const sz of [-1, 1]) plane(base, m.hazard, 0.5, 0.12, 1.2, 0.56, sz * 0.2105, [0, sz > 0 ? 0 : Math.PI, 0]);
  box(base, m.black, 0.22, 0.22, 0.22, 1.32, 0.94, 0.11); cyl(base, m.black, 0.085, 0.3, 1.32, 0.94, -0.13, 'z', 20); // travel drive
  cyl(base, m.aluDark, 0.07, 0.04, 1.32, 0.94, -0.3, 'z', 20);
  box(base, m.black, 0.3, 0.3, 0.34, -0.55, 0.98, 0); cyl(base, m.steel, 0.12, 0.3, -0.55, 1.3, 0, 'z', 28); // hoist gear + drum
  cyl(base, m.black, 0.08, 0.28, -0.55, 0.98, 0.31, 'z', 20);
  box(base, m.sheet, 0.55, 1.7, 0.42, -1.05, 1.66, 0);         // control cabinet
  box(base, m.aluDark, 0.004, 1.6, 0.005, -1.05, 1.66, 0.2125); box(base, m.black, 0.03, 0.18, 0.03, -0.86, 1.7, 0.225);
  plane(base, m.yellow, 0.1, 0.1, -1.2, 2.2, 0.2115); cyl(base, m.lampG, 0.03, 0.06, -1.2, 2.54, 0, 'y', 14); cyl(base, m.black, 0.035, 0.04, -1.2, 2.49, 0, 'y', 14);

  const H0 = 0.8, H1 = 7.25;                                     // mast (7.5 m crane: fits under an 8 m eave)
  box(base, m.orange, 0.5, H1 - H0, 0.36, 0, (H0 + H1) / 2, 0);
  for (const sz of [-1, 1]) box(base, m.steel, 0.03, H1 - H0, 0.05, 0.265, (H0 + H1) / 2, sz * 0.13); // carriage guide rails
  box(base, m.black, 0.08, H1 - H0, 0.04, 0.12, (H0 + H1) / 2, -0.2);                                  // cable duct
  for (const sz of [-1, 1]) box(base, m.black, 0.03, H1 - H0 - 0.15, 0.03, -0.33, (H0 + H1) / 2 + 0.05, sz * 0.17);  // ladder
  for (let y = 1.2; y < H1 - 0.05; y += 0.3) cyl(base, m.black, 0.012, 0.34, -0.33, y, 0, 'z', 8);
  for (let y = 1.2; y < H1 - 0.05; y += 1.6) for (const sz of [-1, 1]) box(base, m.black, 0.1, 0.03, 0.03, -0.28, y, sz * 0.17);
  box(base, m.orange, 1.0, 0.25, 0.36, 0, H1 + 0.125, 0);      // head beam + top guide rollers
  for (const dx of [-0.35, 0.35]) for (const sz of [-1, 1]) cyl(base, m.black, 0.04, 0.06, dx, H1 + 0.28, sz * 0.07, 'y', 16);
  box(base, m.aluDark, 0.06, 0.25, 0.2, 0.3, H1 - 0.13, 0); cyl(base, m.steel, 0.16, 0.05, 0.38, H1 - 0.2, 0, 'z', 28);    // top pulley

  const car = anim(G('Crane_Carriage', root, 0, 1.0, 0), 'translate', 'y', 0.9, 6.3);
  box(car, m.aluDark, 0.06, 1.0, 0.42, 0.31, 0.5, 0);
  for (const y of [0.1, 0.9]) for (const sz of [-1, 1]) box(car, m.black, 0.08, 0.12, 0.08, 0.3, y, sz * 0.13);
  box(car, m.alu, 0.96, 0.03, 0.74, 0.82, 0.135, 0);           // platform
  for (const sz of [-1, 1]) {
    box(car, m.aluDark, 0.96, 0.08, 0.05, 0.82, 0.08, sz * 0.36);
    box(car, m.orange, 0.06, 0.85, 0.06, 1.27, 0.5, sz * 0.36);  // cage posts
    box(car, m.aluDark, 0.93, 0.05, 0.05, 0.8, 0.9, sz * 0.36);
    box(car, m.black, 0.04, 0.06, 0.04, 1.27, 0.32, sz * 0.4);   // tote presence sensors
  }
  box(car, m.orange, 0.06, 0.06, 0.78, 1.27, 0.9, 0);
  box(car, m.orange, 0.04, 0.5, 0.66, 1.3, 0.45, 0);
  for (const x of [0.72, 0.92]) box(car, m.rubber, 0.04, 0.012, 0.7, x, 0.156, 0);
  for (const x of [0.5, 1.14]) box(car, m.aluDark, 0.05, 0.12, 0.72, x, 0.21, 0);   // fixed fork guides
  const fork = anim(G('Crane_Fork', car, 0, 0, 0), 'translate', 'z', -0.45, 0.45);
  for (const x of [0.5425, 1.0975]) box(fork, m.alu, 0.035, 0.1, 0.7, x, 0.21, 0);
  const fork2 = anim(G('Crane_Fork2', fork, 0, 0, 0), 'translate', 'z', -0.45, 0.45);
  for (const [i, x, s] of [[0, 0.5725, 1], [1, 1.0675, -1]]) {
    box(fork2, m.steel, 0.025, 0.08, 0.68, x, 0.21, 0);
    for (const [j, z] of [[0, -0.33], [1, 0.33]]) {
      const f = anim(G('Fork_Finger_' + (i * 2 + j + 1), fork2, x + s * 0.02, 0.24, z), 'rotate', 'z', 0, s * Math.PI / 2);
      box(f, m.black, 0.022, 0.07, 0.022, 0, 0.035, 0);
    }
  }
  return finalize(root);
}
function asrsRail(len = 4) { // one floor-rail segment and the matching top guide rail (at crane height), along X
  const m = materials(), root = G('ASRS_Rail'), fl = G('Rail_Floor', root), top = G('Rail_Top', root);
  box(fl, m.black, len, 0.015, 0.24, 0, 0.0075, 0); box(fl, m.steel, len, 0.085, 0.06, 0, 0.0575, 0);
  for (let x = -len / 2 + 0.25; x < len / 2; x += 0.5) box(fl, m.aluDark, 0.06, 0.03, 0.22, x, 0.03, 0);
  box(top, m.steel, len, 0.12, 0.06, 0, 7.56, 0); box(top, m.black, len, 0.02, 0.22, 0, 7.63, 0);
  for (let x = -len / 2 + 0.5; x < len / 2; x += 1) box(top, m.aluDark, 0.06, 0.3, 0.06, x, 7.79, 0);
  return finalize(root);
}

// ---------------------------------------------------------------- the EGR cooler (workpiece) and a 600 × 400 tote
function egrCoolerGeo(n) { // EGR cooler: stainless core 180 × 70 × 90 mm, gas flanges at both ends, coolant pipes, bracket; overall 280 × 130 × 150
  const m = materials();
  box(n, m.stainless, 0.18, 0.07, 0.09, 0, 0.045, 0);                  // core case
  for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, m.steel, 0.004, 0.074, 0.094, x, 0.045, 0); // case beads
  for (const sx of [-1, 1]) {
    box(n, m.stainless, 0.02, 0.06, 0.07, sx * 0.1, 0.045, 0);          // gas tank (cone)
    box(n, m.stainless, 0.01, 0.09, 0.15, sx * 0.135, 0.045, 0);        // gas flange
    for (const sy of [-1, 1]) cyl(n, m.aluDark, 0.006, 0.012, sx * 0.135, 0.045 + sy * 0.035, sy * 0.06, 'x', 8); // flange bolt holes
    cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 14);   // coolant pipes up
    cyl(n, m.stainless, 0.011, 0.04, sx * 0.05, 0.128, 0.05, 'z', 14);
  }
  box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055);                // mounting bracket
}
function egrCooler() { const root = G('EGR_Cooler'); egrCoolerGeo(root); return finalize(root); }
function tote() { // 600 (X) × 400 (Z) × 280 mm stacking tote
  const m = materials(), root = G('Tote_600x400'), L = 0.6, W = 0.4, H = 0.28, t = 0.008;
  box(root, m.tote, L - 0.02, t, W - 0.02, 0, 0.012, 0);
  for (const s of [-1, 1]) { box(root, m.tote, L, H - 0.02, t, 0, H / 2 + 0.01, s * (W / 2 - t / 2)); box(root, m.tote, t, H - 0.02, W, s * (L / 2 - t / 2), H / 2 + 0.01, 0); }
  for (const s of [-1, 1]) { box(root, m.tote, L + 0.012, 0.025, 0.014, 0, H - 0.012, s * W / 2); box(root, m.tote, 0.014, 0.025, W + 0.012, s * L / 2, H - 0.012, 0); }
  for (const x of [-0.2, 0, 0.2]) for (const s of [-1, 1]) box(root, m.tote, 0.012, H - 0.06, 0.012, x, H / 2, s * (W / 2 + 0.004));
  for (const s of [-1, 1]) box(root, m.black, 0.012, 0.03, 0.12, s * (L / 2 + 0.001), H - 0.06, 0); // handle slots
  return finalize(root);
}

// ---------------------------------------------------------------- 2. Ni paste dispensing cell (2.0 × 1.6 × 2.2 m, door on +Z)
function dispenseCell() {
  const m = materials(), root = G('Dispense_Cell'), fr = G('Cell_Frame', root);
  const W = 2.0, D = 1.6, H = 2.2, s = 0.045, X = W / 2 - s / 2, Z = D / 2 - s / 2, T = 0.85, TT = T + 0.025;
  for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z]]) { prof(fr, [x, 0.06, z], [x, H, z]); foot(fr, x, z); }
  for (const y of [0.0825, T - s / 2, H - s / 2]) {
    prof(fr, [-X + s / 2, y, -Z], [X - s / 2, y, -Z]); prof(fr, [-X + s / 2, y, Z], [X - s / 2, y, Z]);
    prof(fr, [-X, y, -Z + s / 2], [-X, y, Z - s / 2]); prof(fr, [X, y, -Z + s / 2], [X, y, Z - s / 2]);
  }
  prof(fr, [0, 0.105, Z], [0, T - s, Z]);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) box(fr, m.sheet, W / 2 - s * 1.5, T - 0.15, 0.004, sx * W / 4, T / 2 + 0.03, sz * Z);
  for (const sx of [-1, 1]) {
    box(fr, m.sheet, 0.004, T - 0.15, D - s * 2, sx * X, T / 2 + 0.03, 0);
    for (let k = 0; k < 8; k++) box(fr, m.black, 0.006, 0.012, 0.3, sx * (X + 0.002), 0.5 + k * 0.025, -0.3); // vent slots
    box(fr, m.black, 0.03, 0.16, 0.03, sx * 0.08, 0.55, Z + 0.025);  // lower cabinet door handles
  }
  box(fr, m.plate, W - 0.04, 0.025, D - 0.04, 0, T + 0.0125, 0);   // tooling plate
  for (let z = -0.6; z <= 0.61; z += 0.2) box(fr, m.aluDark, W - 0.1, 0.002, 0.012, 0, TT + 0.001, z);
  for (const sx of [-1, 1]) box(fr, m.glass, 0.006, H - TT - s, D - s * 2, sx * X, (TT + H - s) / 2, 0);
  box(fr, m.glass, W - s * 2, H - TT - s, 0.006, 0, (TT + H - s) / 2, -Z);
  box(fr, m.sheet, W - 0.02, 0.006, D - 0.02, 0, H + 0.003, 0);   // roof + fan filter unit
  box(fr, m.sheet, 0.42, 0.12, 0.42, -0.5, H + 0.066, -0.2);
  for (let k = 0; k < 6; k++) box(fr, m.black, 0.34, 0.004, 0.012, -0.5, H + 0.127, -0.35 + k * 0.06);
  box(fr, m.light, 1.4, 0.012, 0.03, 0, H - s - 0.01, 0.55);         // interior LED bar
  cyl(fr, m.black, 0.04, 0.05, 0.85, H + 0.03, -0.65, 'y', 16); cyl(fr, m.aluDark, 0.012, 0.12, 0.85, H + 0.11, -0.65, 'y', 8); // signal tower
  [[m.lampG, 0.2], [m.lampA, 0.25], [m.lampR, 0.3]].forEach(([mt, y]) => cyl(fr, mt, 0.032, 0.048, 0.85, H + y - 0.02, -0.65, 'y', 18));
  cyl(fr, m.black, 0.033, 0.01, 0.85, H + 0.31, -0.65, 'y', 18);
  // door tracks (two leaves slide past each other on the front)
  box(fr, m.aluDark, W, 0.05, 0.07, 0, H - 0.07, Z + 0.06); box(fr, m.aluDark, W, 0.02, 0.07, 0, TT + 0.01, Z + 0.06);
  // HMI on a swivel arm, right side
  cyl(fr, m.black, 0.02, 0.35, X + 0.2, 1.42, 0.45, 'x', 10); box(fr, m.black, 0.06, 0.06, 0.06, X + 0.02, 1.42, 0.45);
  box(fr, m.black, 0.06, 0.28, 0.38, X + 0.4, 1.5, 0.45); box(fr, m.screen, 0.005, 0.22, 0.31, X + 0.432, 1.5, 0.45);
  plane(fr, m.yellow, 0.3, 0.012, X + 0.4325, 1.385, 0.45, [0, Math.PI / 2, 0]);

  for (const [name, x0, zOff] of [['Door_L', -W / 4, Z + 0.045], ['Door_R', W / 4, Z + 0.075]]) {
    const d = anim(G(name, root, x0, TT + 0.02, zOff), 'translate', 'x', name === 'Door_L' ? 0 : -W / 2 + 0.05, name === 'Door_L' ? W / 2 - 0.05 : 0);
    const dw = W / 2 - 0.01, dh = H - 0.12 - TT - 0.02, p = 0.03;
    prof(d, [-dw / 2 + p / 2, 0, 0], [-dw / 2 + p / 2, dh, 0], p); prof(d, [dw / 2 - p / 2, 0, 0], [dw / 2 - p / 2, dh, 0], p);
    prof(d, [-dw / 2 + p, p / 2, 0], [dw / 2 - p, p / 2, 0], p); prof(d, [-dw / 2 + p, dh - p / 2, 0], [dw / 2 - p, dh - p / 2, 0], p);
    box(d, m.glass, dw - p * 2, dh - p * 2, 0.006, 0, dh / 2, 0);
    const hx = name === 'Door_L' ? dw / 2 - 0.08 : -dw / 2 + 0.08;
    box(d, m.black, 0.025, 0.3, 0.025, hx, dh / 2, 0.04); for (const dy of [-0.14, 0.14]) box(d, m.black, 0.02, 0.02, 0.03, hx, dh / 2 + dy, 0.022);
    box(d, m.yellow, 0.12, 0.03, 0.004, hx, dh / 2 + 0.25, 0.017);
  }

  // weighing station at the inlet (front left)
  const sc = G('Scale', root, -0.6, TT, 0.35);
  box(sc, m.sheet, 0.3, 0.06, 0.3, 0, 0.03, 0);
  const sp = G('Scale_Plate', sc, 0, 0.06, 0); box(sp, m.stainless, 0.26, 0.01, 0.26, 0, 0.012, 0); cyl(sp, m.black, 0.02, 0.008, 0, 0.004, 0, 'y', 10);
  box(sc, m.black, 0.13, 0.08, 0.03, 0, 0.06, 0.18, [-0.5, 0, 0]); box(sc, m.display, 0.1, 0.03, 0.002, 0, 0.068, 0.197, [-0.5, 0, 0]);

  // tilt-rotary positioner: tilt about X at y 1.15, table rotates about its own Y
  const PX = 0.25, PZ = -0.05, PY = 1.15, pos = G('Positioner', root, PX, TT, PZ);
  box(pos, m.black, 0.62, 0.06, 0.4, 0, 0.03, 0);
  for (const sx of [-1, 1]) { box(pos, m.orange, 0.06, PY - TT - 0.02, 0.26, sx * 0.29, (PY - TT) / 2 + 0.02, 0); cyl(pos, m.black, 0.07, 0.08, sx * 0.29, PY - TT, 0, 'x', 24); }
  cyl(pos, m.black, 0.06, 0.18, 0.43, PY - TT, 0, 'x', 20); box(pos, m.aluDark, 0.08, 0.1, 0.12, 0.37, PY - TT, 0);
  const tilt = anim(G('Positioner_Tilt', pos, 0, PY - TT, 0), 'rotate', 'x', -Math.PI / 2, Math.PI / 2);
  box(tilt, m.aluDark, 0.5, 0.04, 0.24, 0, -0.04, 0); box(tilt, m.black, 0.14, 0.09, 0.14, 0, -0.1, 0); cyl(tilt, m.black, 0.06, 0.06, 0, 0.0, 0, 'y', 24);
  const tbl = anim(G('Positioner_Table', tilt, 0, 0.03, 0), 'rotate', 'y', -Math.PI, Math.PI);
  cyl(tbl, m.steel, 0.2, 0.03, 0, 0.015, 0, 'y', 40); cyl(tbl, m.aluDark, 0.21, 0.008, 0, 0.004, 0, 'y', 40);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(tbl, m.black, 0.035, 0.04, 0.035, sx * 0.13, 0.05, sz * 0.085); box(tbl, m.orange, 0.06, 0.012, 0.014, sx * 0.13, 0.076, sz * 0.085); }
  const wp = G('Workpiece', tbl, 0, 0.03, 0); egrCoolerGeo(wp);

  // Z-axis dispensing head on a bridge behind the positioner
  const BZ = -0.6;
  const BY = 1.85;  // bridge beam (centre height), clear of the roof
  for (const x of [PX - 0.38, PX + 0.38]) prof(fr, [x, TT, BZ], [x, BY - s / 2, BZ]);
  prof(fr, [PX - 0.42, BY, BZ], [PX + 0.42, BY, BZ]);
  prof(fr, [PX, BY, BZ + s / 2], [PX, BY, PZ + 0.04]);
  box(fr, m.alu, 0.1, 0.62, 0.075, PX, BY - 0.25, PZ); box(fr, m.black, 0.03, 0.6, 0.004, PX, BY - 0.25, PZ + 0.039);  // Z module + cover strip
  box(fr, m.black, 0.09, 0.12, 0.09, PX, BY + 0.12, PZ); cyl(fr, m.black, 0.035, 0.08, PX, BY + 0.22, PZ, 'y', 16);  // servo
  box(fr, m.black, 0.06, 0.4, 0.03, PX + 0.08, BY - 0.22, PZ - 0.02);                                                  // cable chain
  const head = anim(G('Needle_Head', root, PX, 1.66, PZ + 0.05), 'translate', 'y', -0.2, 0.1);
  box(head, m.aluDark, 0.11, 0.16, 0.012, 0, 0, -0.006);
  box(head, m.black, 0.06, 0.1, 0.05, 0, -0.03, 0.03); box(head, m.orange, 0.062, 0.02, 0.052, 0, 0.03, 0.03);
  cyl(head, m.syringe, 0.022, 0.16, 0, 0.1, 0.03, 'y', 20); cyl(head, m.paste, 0.019, 0.1, 0, 0.07, 0.03, 'y', 16); cyl(head, m.black, 0.024, 0.015, 0, 0.185, 0.03, 'y', 20);
  cyl(head, m.steel, 0.006, 0.03, 0, -0.095, 0.03, 'y', 12, 0.004);          // luer hub
  cyl(head, m.steel, 0.0008, 0.09, 0, -0.155, 0.03, 'y', 6);                 // needle (tip at local y −0.2)
  tor(head, m.black, 0.042, 0.009, 0, -0.165, 0.03, 'y', 36); tor(head, m.light, 0.042, 0.005, 0, -0.172, 0.03, 'y', 36);
  for (const sx of [-1, 1]) box(head, m.black, 0.008, 0.06, 0.008, sx * 0.042, -0.135, 0.03);
  G('Needle_Tip', head, 0, -0.2, 0.03);  // empty marker at the needle tip (dispense path reference)
  return finalize(root);
}

// ---------------------------------------------------------------- 3. vision camera gantry (portal over a conveyor, 1.6 × 2.0 m)
function visionGantry() {
  const m = materials(), root = G('Vision_Gantry'), fr = G('Gantry_Frame', root), s = 0.045, X = 0.8 - s / 2, H = 2.0;
  for (const sx of [-1, 1]) {
    const x = sx * X;
    prof(fr, [x, 0.03 + s / 2, -0.3], [x, 0.03 + s / 2, 0.3]); foot(fr, x, -0.27); foot(fr, x, 0.27);
    prof(fr, [x, 0.03 + s, 0], [x, H - s, 0]);
    for (const sz of [-1, 1]) prof(fr, [x, 0.075 + 0.015, sz * 0.27], [x, 0.36, sz * 0.035], 0.03);
    for (const sz of [-1, 1]) box(fr, m.aluDark, 0.05, 0.07, 0.07, x, 0.11, sz * 0.06);
    box(fr, m.aluDark, 0.07, 0.07, 0.05, x - sx * 0.05, H - s - 0.04, 0);
  }
  prof(fr, [-0.8, H - s / 2, 0], [0.8, H - s / 2, 0]);
  for (const sx of [-1, 1]) cyl(fr, m.black, 0.024, 0.004, sx * 0.802, H - s / 2, 0, 'x', 4);
  box(fr, m.black, 0.12, 0.16, 0.08, X, 1.2, 0.065); box(fr, m.yellow, 0.1, 0.02, 0.002, X, 1.26, 0.106); // IO box
  cyl(fr, m.black, 0.008, H - 1.28, X - 0.03, (H + 1.28) / 2, 0.03, 'y', 6);
  const cam = anim(G('Camera_Mount', root, 0, H - s, 0), 'translate', 'x', -0.7, 0.7);
  box(cam, m.aluDark, 0.12, 0.012, 0.09, 0, -0.006, 0);
  prof(cam, [0, -0.012, 0], [0, -0.27, 0], 0.03);
  box(cam, m.aluDark, 0.05, 0.05, 0.05, 0, -0.29, 0); cyl(cam, m.steel, 0.012, 0.03, 0, -0.32, 0, 'y', 10);
  box(cam, m.black, 0.06, 0.1, 0.06, 0, -0.385, 0);
  cyl(cam, m.black, 0.022, 0.05, 0, -0.46, 0, 'y', 20); cyl(cam, m.steel, 0.018, 0.004, 0, -0.487, 0, 'y', 20);
  cyl(cam, m.black, 0.08, 0.025, 0, -0.5, 0, 'y', 36, 0.07); tor(cam, m.light, 0.058, 0.01, 0, -0.513, 0, 'y', 40);
  for (const sx of [-1, 1]) box(cam, m.black, 0.012, 0.08, 0.012, sx * 0.05, -0.47, 0);
  cyl(cam, m.black, 0.006, 0.3, 0.03, -0.2, 0.025, 'y', 6);
  return finalize(root);
}

// ---------------------------------------------------------------- 4. small parts
function ngChute() { // inclined roller chute, inlet 0.85 m (−X) → outlet 0.55 m (+X), 0.5 m wide, with an NG bin
  const m = materials(), root = G('NG_Chute'), L = 1.0, Wd = 0.5, y0 = 0.85, y1 = 0.55, a = Math.atan2(y0 - y1, L), cL = L / Math.cos(a);
  const at = t => [(-L / 2) + t * L, y0 + t * (y1 - y0)];
  for (const sz of [-1, 1]) {
    const [x, y] = at(0.5); box(root, m.aluDark, cL, 0.1, 0.035, x, y - 0.02, sz * (Wd / 2), [0, 0, -a]);
    box(root, m.alu, cL, 0.02, 0.02, x, y + 0.11, sz * (Wd / 2 - 0.005), [0, 0, -a]);           // side guard rail
    for (const t of [0.15, 0.85]) { const [px, py] = at(t); box(root, m.alu, 0.02, 0.14, 0.02, px, py + 0.05, sz * (Wd / 2 - 0.005)); }
  }
  for (let t = 0.04; t < 0.99; t += 0.075) { const [x, y] = at(t); cyl(root, m.steel, 0.025, Wd - 0.04, x, y, 0, 'z', 16); cyl(root, m.aluDark, 0.008, Wd - 0.01, x, y, 0, 'z', 6); }
  for (const t of [0.06, 0.94]) for (const sz of [-1, 1]) { const [x, y] = at(t); prof(root, [x, 0.06, sz * (Wd / 2 - 0.02)], [x, y - 0.07, sz * (Wd / 2 - 0.02)], 0.04); foot(root, x, sz * (Wd / 2 - 0.02)); }
  for (const t of [0.06, 0.94]) { const [x] = at(t); prof(root, [x, 0.2, -Wd / 2 + 0.04], [x, 0.2, Wd / 2 - 0.04], 0.03); }
  { const [x, y] = at(1); box(root, m.orange, 0.03, 0.12, Wd, x + 0.02, y + 0.03, 0); box(root, m.rubber, 0.012, 0.08, Wd - 0.04, x - 0.0, y + 0.03, 0); }
  { const [x, y] = at(0.45); box(root, m.black, 0.18, 0.09, 0.004, x, y - 0.02, Wd / 2 + 0.02, [0, 0, -a]); plane(root, m.ngLabel, 0.17, 0.085, x, y - 0.02, Wd / 2 + 0.0225, [0, 0, -a]); }
  return finalize(root);
}
function amrRollerDeck() { // conveyor top module for an Omron LD-250 (963 × 718 mm); conveys along Z (sideways)
  const m = materials(), root = G('AMR_Roller_Deck'), L = 0.96, W = 0.7, Hd = 0.24;
  box(root, m.black, L, 0.08, W, 0, 0.04, 0);
  box(root, m.black, 0.6, 0.06, 0.18, 0, 0.11, 0.0);                                   // drive under the rollers
  for (const sx of [-1, 1]) {
    box(root, m.aluDark, 0.04, 0.12, W, sx * (L / 2 - 0.02), 0.14, 0);
    box(root, m.alu, 0.03, 0.05, W, sx * (L / 2 - 0.02), 0.225, 0);
    plane(root, m.hazard, 0.12, 0.06, sx * (L / 2 + 0.0005), 0.05, W / 2 - 0.08, [0, sx * Math.PI / 2, 0]);
    plane(root, m.hazard, 0.12, 0.06, sx * (L / 2 + 0.0005), 0.05, -W / 2 + 0.08, [0, sx * Math.PI / 2, 0]);
  }
  const rl = G('Deck_Rollers', root);
  for (let k = 0; k < 8; k++) cyl(rl, m.steel, 0.03, L - 0.1, 0, Hd - 0.045, -W / 2 + 0.05 + k * ((W - 0.1) / 7), 'x', 18);
  for (const [name, z, sg] of [['Deck_Stop_F', W / 2 - 0.015, 1], ['Deck_Stop_B', -W / 2 + 0.015, -1]]) {
    const st = anim(G(name, root, 0, Hd - 0.02, z), 'rotate', 'x', 0, sg * Math.PI / 2);
    box(st, m.orange, L - 0.16, 0.08, 0.015, 0, 0.04, 0);
  }
  box(root, m.yellow, L - 0.2, 0.012, 0.005, 0, 0.06, W / 2 + 0.0025);
  box(root, m.yellow, L - 0.2, 0.012, 0.005, 0, 0.06, -W / 2 - 0.0025);
  return finalize(root);
}
function conveyorStopper() { // pneumatic tote stopper, mounted between rollers; blade raised (top at 0.2 m), retracts 0.05 m
  const m = materials(), root = G('Conveyor_Stopper');
  box(root, m.aluDark, 0.16, 0.008, 0.08, 0, 0.004, 0); box(root, m.aluDark, 0.008, 0.08, 0.08, -0.076, 0.044, 0);
  box(root, m.orange, 0.08, 0.12, 0.06, 0, 0.068, 0); cyl(root, m.black, 0.006, 0.02, 0.045, 0.1, 0, 'x', 8); cyl(root, m.black, 0.006, 0.02, 0.045, 0.05, 0, 'x', 8);
  const bl = anim(G('Stopper_Blade', root, 0, 0.128, 0), 'translate', 'y', -0.05, 0);
  cyl(bl, m.steel, 0.008, 0.03, 0, 0.015, 0, 'y', 10);
  box(bl, m.orange, 0.1, 0.045, 0.02, 0, 0.05, 0); box(bl, m.rubber, 0.1, 0.035, 0.008, 0, 0.05, 0.014);
  return finalize(root);
}
function fencePanel(w = 1.0) { // black mesh guard panel with one post at its −X end (tile along X), 2.0 m tall
  const m = materials(), root = G('Fence_Panel'), H = 2.0, x0 = -w / 2;
  box(root, m.black, 0.06, H, 0.06, x0, H / 2, 0); box(root, m.black, 0.14, 0.008, 0.14, x0, 0.004, 0);
  const fx0 = x0 + 0.04, fx1 = w / 2 - 0.01, fy0 = 0.1, fy1 = H - 0.02, t = 0.02;
  box(root, m.black, fx1 - fx0, t, t, (fx0 + fx1) / 2, fy0, 0); box(root, m.black, fx1 - fx0, t, t, (fx0 + fx1) / 2, fy1, 0);
  box(root, m.black, t, fy1 - fy0, t, fx0, (fy0 + fy1) / 2, 0); box(root, m.black, t, fy1 - fy0, t, fx1, (fy0 + fy1) / 2, 0);
  plane(root, m.mesh, fx1 - fx0 - t, fy1 - fy0 - t, (fx0 + fx1) / 2, (fy0 + fy1) / 2, 0, null, 0.05);
  for (const y of [0.6, 1.6]) box(root, m.black, 0.05, 0.04, 0.03, x0 + 0.045, y, 0);
  return finalize(root);
}

// ---------------------------------------------------------------- 5. roller / belt conveyors (top of conveying surface 0.85 m, flow along +X)
// userData.ports: [x, y, z, heading°] of the in/out ends (heading 0 = +X), for snapping modules together
const TOP = 0.85, CW = 0.6, BF = 0.5;  // overall width, between-frame width (600 × 400 totes cross-wise)
function convLegs(n, xs, w, top) {
  const m = materials();
  for (const x of xs) {
    for (const sz of [-1, 1]) { prof(n, [x, 0.06, sz * (w / 2 - 0.02)], [x, top - 0.13, sz * (w / 2 - 0.02)], 0.04); foot(n, x, sz * (w / 2 - 0.02)); }
    prof(n, [x, 0.25, -w / 2 + 0.04], [x, 0.25, w / 2 - 0.04], 0.04);
    for (const sz of [-1, 1]) box(n, m.aluDark, 0.06, 0.05, 0.008, x, top - 0.16, sz * (w / 2 - 0.0)); // height adjusters
  }
}
function rollerConveyor(L) {
  const m = materials(), root = G('Roller_Conveyor_' + L + 'm'), fr = G('Conveyor_Frame', root), ry = TOP - 0.025;
  for (const sz of [-1, 1]) {
    box(fr, m.alu, L, 0.12, 0.035, 0, TOP - 0.05, sz * (CW / 2 - 0.0175));          // side channels
    box(fr, m.aluDark, L, 0.008, 0.045, 0, TOP + 0.014, sz * (CW / 2 - 0.0175));   // top lip
    for (let x = -L / 2 + 0.15; x < L / 2; x += 0.3) box(fr, m.black, 0.012, 0.03, 0.002, x, TOP - 0.06, sz * CW / 2); // slot covers
  }
  convLegs(fr, L > 1.5 ? [-L / 2 + 0.12, 0, L / 2 - 0.12] : [-L / 2 + 0.12, L / 2 - 0.12], CW, TOP);
  const sm = G('Stopper_Mount', root, L / 2 - 0.15, TOP - 0.1, 0);                  // orange mount plates for conveyor_stopper
  for (const sz of [-1, 1]) box(sm, m.orange, 0.08, 0.06, 0.006, 0, 0, sz * (CW / 2 + 0.004));
  box(sm, m.aluDark, 0.08, 0.01, BF, 0, -0.035, 0);
  const pitch = 0.075, n = Math.round(L / pitch);
  for (let k = 0; k < n; k++) {
    const r = anim(G('Roller_' + String(k + 1).padStart(2, '0'), root, -L / 2 + pitch / 2 + k * pitch, ry, 0), 'rotate', 'z', -Infinity, Infinity);
    cyl(r, m.steel, 0.025, BF - 0.01, 0, 0, 0, 'z', 16); cyl(r, m.aluDark, 0.006, BF + 0.02, 0, 0, 0, 'z', 6);
  }
  if (L > 1.5) { box(fr, m.black, 0.3, 0.12, 0.16, 0.3, TOP - 0.2, 0); cyl(fr, m.black, 0.05, 0.22, 0.3, TOP - 0.2, CW / 2 - 0.02, 'z', 16); } // drive
  root.userData.ports = { in: [-L / 2, TOP, 0, 0], out: [L / 2, TOP, 0, 0] };
  return finalize(root);
}
function rollerCurve() { // 90° curve, inner radius 0.8 m, tapered rollers; enters heading +X, leaves heading +Z
  const m = materials(), root = G('Roller_Curve_90'), fr = G('Conveyor_Frame', root);
  const Ri = 0.8, Ro = Ri + CW, N = 18;
  // arc centre at (ox, oz) so the footprint centre is the origin: arc spans x ∈ [ox, ox+Ro], z ∈ [oz−Ro, oz]
  const ox = -Ro / 2, oz = Ro / 2, P = (r, a) => [ox + r * Math.sin(a), oz - r * Math.cos(a)];
  for (const r of [Ri + 0.0175, Ro - 0.0175]) for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI / 2, a1 = (i + 1) / N * Math.PI / 2, am = (a0 + a1) / 2, [x, z] = P(r, am), len = r * (a1 - a0) + 0.002;
    box(fr, m.alu, len, 0.12, 0.035, x, TOP - 0.05, z, [0, -am, 0]); box(fr, m.aluDark, len, 0.008, 0.045, x, TOP + 0.014, z, [0, -am, 0]);
  }
  for (const a of [0.12, Math.PI / 4, Math.PI / 2 - 0.12]) {
    for (const r of [Ri + 0.02, Ro - 0.02]) { const [x, z] = P(r, a); prof(fr, [x, 0.06, z], [x, TOP - 0.13, z], 0.04); foot(fr, x, z); }
    const [x0, z0] = P(Ri + 0.04, a), [x1, z1] = P(Ro - 0.04, a); prof(fr, [x0, 0.25, z0], [x1, 0.25, z1], 0.04);
  }
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * Math.PI / 2, [x, z] = P((Ri + Ro) / 2, a);
    const r = anim(G('Roller_' + String(k + 1).padStart(2, '0'), root, x, TOP - 0.025, z), 'rotate', 'z', -Infinity, Infinity);
    r.rotation.y = Math.PI - a; // local Z (roller axis) points radially outward
    const g = new THREE.CylinderGeometry(0.025 * Ro / ((Ri + Ro) / 2), 0.025 * Ri / ((Ri + Ro) / 2), BF - 0.01, 16); g.rotateX(Math.PI / 2); bin(r, m.steel, g);
  }
  root.userData.ports = { in: [ox, TOP, oz - (Ri + CW / 2), 0], out: [ox + Ri + CW / 2, TOP, oz, 90] };
  return finalize(root);
}
function beltConveyor(L = 2) {
  const m = materials(), root = G('Belt_Conveyor_' + L + 'm'), fr = G('Conveyor_Frame', root), R = 0.045;
  for (const sz of [-1, 1]) { box(fr, m.alu, L, 0.12, 0.03, 0, TOP - 0.06, sz * (CW / 2 - 0.015)); box(fr, m.aluDark, L - 0.1, 0.03, 0.006, 0, TOP + 0.01, sz * (BF / 2 + 0.012)); }
  for (const sx of [-1, 1]) cyl(fr, m.steel, R, BF, sx * (L / 2 - R), TOP - R, 0, 'z', 24);   // end drums
  box(fr, m.aluDark, L - 2 * R, 0.01, BF - 0.02, 0, TOP - 0.012, 0);                         // slider bed
  const belt = anim(G('Belt', root), 'uvscroll', 'x', 0, 1);
  box(belt, m.belt, L - 2 * R, 0.004, BF - 0.01, 0, TOP + 0.002, 0); box(belt, m.belt, L - 2 * R, 0.004, BF - 0.01, 0, TOP - 2 * R - 0.002, 0);
  for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(R + 0.004, R + 0.004, BF - 0.01, 24, 1, true, sx > 0 ? 0 : Math.PI, Math.PI); g.rotateX(Math.PI / 2); g.rotateZ(sx > 0 ? -Math.PI / 2 : -Math.PI / 2); bin(belt, m.belt, xf(g, sx * (L / 2 - R), TOP - R, 0)); }
  convLegs(fr, [-L / 2 + 0.15, L / 2 - 0.15], CW, TOP);
  const dv = G('Drive_Motor', root, L / 2 - R, TOP - R, -CW / 2);                        // gear motor on the head drum
  box(dv, m.black, 0.14, 0.14, 0.1, 0, 0, -0.06); cyl(dv, m.black, 0.06, 0.2, 0, -0.02, -0.21, 'z', 20); cyl(dv, m.aluDark, 0.065, 0.02, 0, -0.02, -0.11, 'z', 20);
  box(dv, m.yellow, 0.06, 0.02, 0.002, 0, 0.04, -0.111);
  root.userData.ports = { in: [-L / 2, TOP, 0, 0], out: [L / 2, TOP, 0, 0] };
  return finalize(root);
}

// ---------------------------------------------------------------- 6. selective pallet rack bay for the AS/RS (7.5 m, bay 2.7 m along X, 1.1 m deep)
function rackBay(num = '01') {
  const m = materials(), root = G('Rack_Bay'), fr = G('Rack_Frame', root), H = 7.5, W = 2.7, D = 1.1, u = 0.09;
  for (const sx of [-1, 1]) {                                           // upright frames at both ends (front + back post, bracing)
    const x = sx * W / 2;
    for (const sz of [-1, 1]) {
      box(fr, m.rackWhite, u, H, 0.07, x, H / 2, sz * (D / 2 - 0.035));
      for (let y = 0.1; y < H; y += 0.05) box(fr, m.black, 0.012, 0.022, 0.002, x, y, sz * (D / 2 + 0.0005)); // punched slots (front face)
      box(fr, m.aluDark, 0.16, 0.008, 0.12, x, 0.004, sz * (D / 2 - 0.035));
    }
    for (let y = 0.3, k = 0; y < H - 0.5; y += 0.9, k++) {
      box(fr, m.rackWhite, 0.03, 0.03, D - 0.14, x, y, 0);
      const z0 = (k % 2 ? -1 : 1) * (D / 2 - 0.07), z1 = -z0, len = Math.hypot(0.9, z1 - z0);
      box(fr, m.rackWhite, 0.025, len, 0.025, x, y + 0.45, 0, [Math.atan2(z1 - z0, 0.9), 0, 0]);
    }
  }
  const levels = [1.5, 3.0, 4.5, 6.0, 7.35];
  for (const y of levels) {
    for (const sz of [-1, 1]) box(fr, m.orange, W - u, 0.12, 0.05, 0, y, sz * (D / 2 - 0.04));
    plane(fr, m.mesh, W - u - 0.02, D - 0.1, 0, y + 0.061, 0, [-Math.PI / 2, 0, 0], 0.05); // wire deck
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.45) box(fr, m.aluDark, 0.03, 0.03, D - 0.1, x, y + 0.045, 0);
  }
  const sign = G('Bay_Sign', root, 0, 2.6, D / 2 + 0.01);              // bay number plate on the aisle (+Z) side
  box(sign, m.black, 0.5, 0.5, 0.01, 0, 0, -0.006); plane(sign, signMat(num), 0.46, 0.46, 0, 0, 0.0001);
  root.userData.ports = { aisle: [0, 0, D / 2, 90] };
  return finalize(root);
}
const SIGNS = new Map();
function signMat(num) {
  if (SIGNS.has(num)) return SIGNS.get(num);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#16181b'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffffff'; g.font = 'bold 76px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = 'bay_' + num;
  const mt = std('bay_sign_' + num, 0xffffff, 0.1, 0.6, { map: t }); SIGNS.set(num, mt); return mt;
}
function baySign(num) { const root = G('Bay_Sign_' + num); box(root, materials().black, 0.5, 0.5, 0.01, 0, 0.25, -0.006); plane(root, signMat(num), 0.46, 0.46, 0, 0.25, 0.0001); return finalize(root); }

// ---------------------------------------------------------------- 7. factory hall kit (6 m bays, 8 m eaves)
function corrugation(name) { // normal map of trapezoid sheet-metal ribs: one rib period per UV unit along U
  const W = 128, c = document.createElement('canvas'); c.width = W; c.height = 4; const g = c.getContext('2d'), img = g.createImageData(W, 4);
  const h = u => { const x = u % 1; return x < 0.15 ? 0 : x < 0.25 ? (x - 0.15) / 0.1 : x < 0.45 ? 1 : x < 0.55 ? 1 - (x - 0.45) / 0.1 : 0; };
  for (let i = 0; i < W; i++) { const d = (h((i + 1) / W) - h((i - 1 + W) / W)) * W / 2 * 0.06; const n = new THREE.Vector3(-d, 0, 1).normalize();
    for (let r = 0; r < 4; r++) { const k = (r * W + i) * 4; img.data[k] = (n.x * 0.5 + 0.5) * 255; img.data[k + 1] = 128; img.data[k + 2] = (n.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255; } }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.name = name; return t;
}
let HM = null;
function hallMats() { // corrugated cladding / roof sheet (normal mapped), sectional door panels
  if (HM) return HM;
  HM = {
    clad: std('wall_cladding', 0xd9dde1, 0.35, 0.42, { normalMap: corrugation('cladding_ribs') }),
    cladDark: std('wall_cladding_dark', 0x9aa1a8, 0.35, 0.45, { normalMap: corrugation('cladding_ribs_dark') }),
    roofIn: std('roof_liner', 0xc9ced3, 0.3, 0.5, { normalMap: corrugation('roof_ribs'), side: THREE.DoubleSide }),
    door: std('sectional_door', 0xc4c9ce, 0.4, 0.4, { normalMap: corrugation('door_ribs') }),
    lamp: std('highbay_led', 0xffffff, 0.0, 0.3, { emissive: 0xffffff, emissiveIntensity: 2.0 })
  };
  return HM;
}
function cladding(root, mat, w, h, x, y, z, cell = 0.25) { // inner + outer ribbed faces of a wall band (inside face +Z)
  plane(root, mat, w, h, x, y, z + 0.041, null, cell); plane(root, mat, w, h, x, y, z - 0.041, [0, Math.PI, 0], cell);
  box(root, materials().wall, w, h, 0.08, x, y, z);
}
function wallPanel() { // 6 m (X) × 9.2 m wall module, inside face +Z: concrete plinth, corrugated light grey cladding, window band 4.4–5.8 m
  const m = materials(), hm = hallMats(), root = G('Hall_Wall_6m'), W = 6, H = 9.2;   // up to the roof sheet at the eave (8 m eave + truss depth)
  box(root, m.concrete, W, 1.2, 0.2, 0, 0.6, -0.06);                                       // plinth
  cladding(root, hm.clad, W, 3.2, 0, 2.8, 0); cladding(root, hm.clad, W, H - 5.8, 0, (5.8 + H) / 2, 0);
  box(root, m.frameDark, W, 0.08, 0.14, 0, 4.4, 0); box(root, m.frameDark, W, 0.08, 0.14, 0, 5.8, 0); box(root, m.frameDark, W, 0.1, 0.16, 0, H - 0.05, 0);
  for (let x = -W / 2; x <= W / 2 + 1e-6; x += 1.0) box(root, m.frameDark, 0.06, 1.4, 0.1, x, 5.1, 0);
  box(root, m.window, W, 1.32, 0.012, 0, 5.1, 0);
  box(root, m.yellow, W, 0.06, 0.01, 0, 1.25, 0.05);                                       // brand stripe (inside)
  for (const sx of [-1, 1]) box(root, m.frameDark, 0.05, H - 1.2, 0.1, sx * (W / 2 - 0.025), (H + 1.2) / 2, 0); // panel joints
  return finalize(root);
}
function doorPanel() { // 6 m wall module with a 4 × 4.5 m sectional door (with window row) and a personnel door, hazard-striped jambs
  const m = materials(), hm = hallMats(), root = G('Hall_Door_6m'), W = 6, H = 9.2, dw = 4, dh = 4.5, dx = -0.6;
  box(root, m.concrete, W - dw - 0.2, 1.2, 0.2, (dx + dw / 2 + W / 2) / 2 + 0.05, 0.6, -0.06);
  cladding(root, hm.clad, W, H - dh - 0.2, 0, (dh + 0.2 + H) / 2, 0);
  const rx0 = dx + dw / 2 + 0.1, rw = W / 2 - rx0; cladding(root, hm.clad, rw, dh + 0.2 - 1.2, rx0 + rw / 2, (dh + 0.2 + 1.2) / 2, 0);
  const lx1 = dx - dw / 2 - 0.1, lw = lx1 + W / 2; if (lw > 0.05) { cladding(root, hm.clad, lw, dh + 0.2, -W / 2 + lw / 2, (dh + 0.2) / 2, 0); }
  const door = anim(G('Sectional_Door', root, dx, 0, 0), 'translate', 'y', 0, dh - 0.4);
  for (let k = 0; k < 9; k++) { const y = 0.25 + k * 0.5; plane(door, k === 6 ? m.window : hm.door, dw, 0.48, 0, y, 0.035, null, 0.25); box(door, m.frameDark, dw, 0.02, 0.05, 0, y - 0.25, 0.02); }
  box(door, m.wall, dw, dh, 0.04, 0, dh / 2, 0);
  for (const sx of [-1, 1]) { box(root, m.hazardBox, 0.2, dh + 0.2, 0.22, dx + sx * (dw / 2 + 0.1), (dh + 0.2) / 2, 0.02); }
  box(root, m.black, dw + 0.4, 0.4, 0.4, dx, dh + 0.4, 0.25);                              // door roll housing
  const px = rx0 + 0.9; box(root, m.frameDark, 1.06, 2.16, 0.12, px, 1.08, 0.01); box(root, hm.cladDark, 0.96, 2.06, 0.13, px, 1.03, 0.01); // personnel door
  box(root, m.black, 0.03, 0.18, 0.03, px + 0.35, 1.05, 0.09); box(root, m.lampG, 0.3, 0.12, 0.02, px, 2.4, 0.08); // handle, exit sign
  return finalize(root);
}
function gableWall() { // triangular infill above the 9.2 m wall top on a 24 m end wall (span along X), up to the ridge sheet
  const m = materials(), hm = hallMats(), root = G('Hall_Gable_24m'), S = 24, Y = 9.1, R = 1.3;
  const sh = new THREE.Shape([new THREE.Vector2(-S / 2, 0), new THREE.Vector2(S / 2, 0), new THREE.Vector2(0, R)]);
  for (const [z, ry] of [[0.041, 0], [-0.041, Math.PI]]) { const g = new THREE.ShapeGeometry(sh); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.25, uv.getY(i) / 0.25); bin(root, hm.clad, xf(g, 0, Y, z, [0, ry, 0])); }
  const e = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }); e.translate(0, 0, -0.04); bin(root, m.wall, xf(e, 0, Y, 0));
  for (const s of [-1, 1]) { const a = Math.atan2(R, S / 2); box(root, m.frameDark, Math.hypot(S / 2, R), 0.12, 0.16, s * S / 4, Y + R / 2, 0, [0, 0, -s * a]); }
  return finalize(root);
}
function hallColumn() { // HEA 400-like steel column, 8 m (eave height), with base plate, haunch and an impact-guard skirt
  const m = materials(), root = G('Hall_Column'), H = 8, b = 0.3, d = 0.39, tf = 0.019, tw = 0.011;
  for (const s of [-1, 1]) box(root, m.steelCol, b, H, tf, 0, H / 2 + 0.03, s * (d / 2 - tf / 2));
  box(root, m.steelCol, tw, H, d - 2 * tf, 0, H / 2 + 0.03, 0);
  for (let y = 1.5; y < H; y += 1.5) for (const s of [-1, 1]) box(root, m.steelCol, 0.012, 0.25, d - 2 * tf, s * 0.07, y, 0); // stiffeners
  box(root, m.steelCol, 0.5, 0.03, 0.6, 0, 0.015, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(root, m.steel, 0.015, 0.06, sx * 0.19, 0.06, sz * 0.24, 'y', 8); cyl(root, m.steel, 0.025, 0.012, sx * 0.19, 0.036, sz * 0.24, 'y', 6); }
  box(root, m.steelCol, tw, 0.5, 0.6, 0, H - 0.25, 0.3);
  box(root, m.yellow, b + 0.004, 1.2, d + 0.004, 0, 0.66, 0);                               // impact guard paint
  box(root, m.hazardBox, b + 0.006, 0.2, d + 0.006, 0, 1.36, 0);
  return finalize(root);
}
function roofTruss() { // one 6 m bay (X) of roof over a 24 m span (Z): pitched truss at x 0 with gussets, purlins, sag rods, liner sheet with a skylight strip, two high-bay LED lamps. Sits at y 8 (eave height).
  const m = materials(), hm = hallMats(), root = G('Hall_Roof_6m'), S = 24, Y = 8, rise = 1.2, W = 6;
  const top = z => Y + 0.9 + rise * (1 - Math.abs(z) / (S / 2)), bot = Y;
  const member = (a, b, s, mt = m.steelCol, h = s) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    const g = new THREE.BoxGeometry(s, h, len); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); bin(root, mt, g); };
  member([0, bot, -S / 2], [0, bot, S / 2], 0.14, m.steelCol, 0.16);
  member([0, top(-S / 2), -S / 2], [0, top(0), 0], 0.16, m.steelCol, 0.2); member([0, top(0), 0], [0, top(S / 2), S / 2], 0.16, m.steelCol, 0.2);
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const z = -S / 2 + i * S / n; member([0, bot, z], [0, top(z), z], 0.07);
    box(root, m.steelCol, 0.02, 0.22, 0.3, 0, bot + 0.05, z); box(root, m.steelCol, 0.02, 0.22, 0.3, 0, top(z) - 0.05, z); // gusset plates
    if (i < n) { const z2 = z + S / n; member([0, i < n / 2 ? bot : top(z), z], [0, i < n / 2 ? top(z2) : bot, z2], 0.06); }
  }
  for (let i = 0; i <= 8; i++) { const z = -S / 2 + i * S / 8; member([-W / 2, top(z) + 0.12, z], [W / 2, top(z) + 0.12, z], 0.08, m.steelLight, 0.16); } // Z purlins
  for (let i = 0; i < 8; i += 2) { const z0 = -S / 2 + i * S / 8, z1 = z0 + S / 8; member([-W / 2, top(z0) + 0.12, z0], [W / 2, top(z1) + 0.12, z1], 0.02, m.steelLight); } // bracing rods
  for (const s of [-1, 1]) {                                                                // liner sheets with a skylight strip each side
    const a = Math.atan2(rise, S / 2), len = Math.hypot(rise, S / 2);
    for (const [f0, f1, mt] of [[0, 0.45, hm.roofIn], [0.45, 0.6, m.skylight], [0.6, 1, hm.roofIn]]) {   // u: 0 at the ridge → 1 at the eave
      const u = (f0 + f1) / 2, l = (f1 - f0) * len + 0.005, y = top(0) - u * rise + 0.21, z = s * u * S / 2;
      if (mt === m.skylight) box(root, mt, W, 0.02, l, 0, y, z, [s * a, 0, 0]);
      else { const g = new THREE.PlaneGeometry(W, l); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * W / 0.3, uv.getY(k)); g.rotateX(-Math.PI / 2); bin(root, mt, xf(g, 0, y, z, [s * a, 0, 0])); }
    }
  }
  for (const z of [-6, 6]) { cyl(root, m.black, 0.006, top(z) - Y - 0.3, 1.5, (top(z) + Y) / 2 - 0.15, z, 'y', 4); cyl(root, m.frameDark, 0.25, 0.12, 1.5, Y - 0.4, z, 'y', 24, 0.18); cyl(root, hm.lamp, 0.22, 0.01, 1.5, Y - 0.465, z, 'y', 24); }
  return finalize(root);
}
function floorTile(aisle) { // 6 × 6 m polished concrete tile; the aisle variant has a 0.1 m yellow line 1.5 m in from each Z edge
  const m = materials(), root = G(aisle ? 'Floor_6m_Aisle' : 'Floor_6m');
  plane(root, m.floor, 6, 6, 0, 0.001, 0, [-Math.PI / 2, 0, 0]);
  box(root, m.frameDark, 6, 0.002, 0.006, 0, 0.0015, -3); box(root, m.frameDark, 0.006, 0.002, 6, -3, 0.0015, 0);  // saw-cut joints
  if (aisle) for (const z of [-1.5, 1.5]) box(root, m.yellow, 6, 0.002, 0.1, 0, 0.002, z);
  return finalize(root);
}

// ---------------------------------------------------------------- 8. machine cycles baked as animation clips (played from the sim clock in console 1,
// sampled into drives for console 2 by js/factory-unity.js). keys: [node, 'x'|'y'|'z' translate offset or 'rx'|'ry'|'rz' rotation (rad),
// [[t, value], …]] relative to the node's rest pose; linear in between; the clip loops.
function cycleClip(root, name, T, keys, fps = 10) {
  // one track per node and property: channels x / y / z of a node form ONE position track and rx / ry / rz ONE rotation track (two tracks on the
  // same property would be blended by the mixer: a node keyed on x and z moved only half as far)
  const tracks = [], ease = u => u * u * (3 - 2 * u), groups = new Map();
  const curve = pts => t => { let k = 0; while (k < pts.length - 2 && pts[k + 1][0] <= t) k++; const [t0, v0] = pts[k], [t1, v1] = pts[Math.min(k + 1, pts.length - 1)]; const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1; return v0 + (v1 - v0) * ease(u); };
  for (const [nodeName, ch, pts] of keys) {
    const node = root.getObjectByName(nodeName); if (!node) throw new Error('no node ' + nodeName);
    if (ch === 'vis') { const ts = pts.map(q => q[0]), v = pts.flatMap(q => { const k = q[1] ? 1 : 1e-4; return [k, k, k]; }); tracks.push(new THREE.VectorKeyframeTrack(nodeName + '.scale', ts, v, THREE.InterpolateDiscrete)); continue; }
    const prop = /^[xyz]$/.test(ch) ? 'position' : 'quaternion', gk = nodeName + '.' + prop; if (!groups.has(gk)) groups.set(gk, { node, nodeName, prop, chans: [] }); groups.get(gk).chans.push([ch, curve(pts)]);
  }
  for (const { node, nodeName, prop, chans } of groups.values()) {
    const F = typeof fps === 'function' ? fps(nodeName) : fps, n = Math.round(T * F) + 1, times = Float32Array.from({ length: n }, (_, i) => i / F);   // fps may be per node
    if (prop === 'position') { const v = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const q = node.position.clone(); for (const [c, f] of chans) q[c] += f(times[i]); q.toArray(v, i * 3); } tracks.push(new THREE.VectorKeyframeTrack(nodeName + '.position', times, v)); }
    else { const v = new Float32Array(n * 4), e = new THREE.Euler(); for (let i = 0; i < n; i++) { e.copy(node.rotation); for (const [c, f] of chans) e[c[1]] += f(times[i]); new THREE.Quaternion().setFromEuler(e).toArray(v, i * 4); } tracks.push(new THREE.QuaternionKeyframeTrack(nodeName + '.quaternion', times, v)); }
  }
  (root.userData.clips || (root.userData.clips = [])).push(new THREE.AnimationClip(name, T, tracks));
  return root;
}
const DISPENSE_T = 24, CRANE_T = 32;
function dispenseCellAnimated() { // doors open → (part loaded) → doors close → tilt → needle down → table turns once while dispensing → needle up → tilt back → open
  const r = dispenseCell();
  return cycleClip(r, 'Dispense_Cycle', DISPENSE_T, [
    ['Door_L', 'x', [[0, 0.9], [1.5, 0.9], [3, 0], [21, 0], [22.5, 0.9], [24, 0.9]]], ['Door_R', 'x', [[0, -0.9], [1.5, -0.9], [3, 0], [21, 0], [22.5, -0.9], [24, -0.9]]],
    ['Positioner_Tilt', 'rx', [[0, 0], [3.5, 0], [4.5, -0.45], [19, -0.45], [20, 0], [24, 0]]], ['Positioner_Table', 'ry', [[0, 0], [6.5, 0], [17.5, Math.PI * 2], [24, Math.PI * 2]]],
    ['Needle_Head', 'y', [[0, 0.08], [4.5, 0.08], [6, -0.06], [17.5, -0.06], [18.5, 0.08], [24, 0.08]]]]);
}
function asrsCraneAnimated() { // store a tote at x +4 m / level 4.6 m, retrieve one from x −4 m / 2.2 m and hand it to the I/O station at x 0 (forks to −Z)
  const r = asrsCrane();
  return cycleClip(r, 'Crane_Cycle', CRANE_T, [
    ['ASRS_Crane', 'x', [[0, 0], [1.5, 0], [6, 4], [10, 4], [14.5, 0], [17, 0], [22, -4], [26, -4], [30.5, 0], [32, 0]]],
    ['Crane_Carriage', 'y', [[0, 0], [1.5, 0], [6, 3.6], [8, 3.6], [8.5, 3.45], [10, 3.45], [14.5, 0], [17, 0], [22, 1.2], [23.3, 1.2], [23.8, 1.35], [26, 1.35], [30.5, 0], [32, 0]]],
    ['Crane_Fork', 'z', [[0, 0], [6, 0], [7, 0.45], [9, 0.45], [10, 0], [22, 0], [22.6, 0.45], [24.5, 0.45], [25.2, 0], [30.6, 0], [31, -0.45], [31.6, -0.45], [32, 0]]],
    ['Crane_Fork2', 'z', [[0, 0], [6, 0], [7, 0.4], [9, 0.4], [10, 0], [22, 0], [22.6, 0.4], [24.5, 0.4], [25.2, 0], [30.6, 0], [31, -0.4], [31.6, -0.4], [32, 0]]]]);
}
function stopperAnimated() { const r = conveyorStopper(); return cycleClip(r, 'Stopper_Cycle', 8, [['Stopper_Blade', 'y', [[0, 0], [5, 0], [5.4, -0.05], [6.6, -0.05], [7, 0], [8, 0]]]]); }
function amrDeckBot() { // low AMR (Omron LD class, 0.96 × 0.72 m) in the VEXPLOR orange-red with a roller-deck top; front +X; deck top 0.62 m
  const m = materials(), root = G('AMR_Deck_Bot'), L = 0.963, W = 0.718, Hb = 0.38;
  box(root, m.orange, L - 0.04, Hb - 0.1, W - 0.04, 0, 0.05 + (Hb - 0.1) / 2, 0);
  box(root, m.black, L, 0.06, W, 0, 0.07, 0); box(root, m.black, L - 0.02, 0.04, W - 0.02, 0, Hb - 0.02, 0);
  for (const sx of [-1, 1]) { box(root, m.black, 0.03, 0.12, W - 0.1, sx * (L / 2 - 0.0), 0.16, 0); box(root, m.yellow, 0.004, 0.02, W - 0.16, sx * (L / 2 + 0.016), 0.24, 0); }
  cyl(root, m.black, 0.04, 0.05, L / 2 - 0.08, Hb + 0.025, 0, 'y', 16); // lidar
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(root, m.rubber, 0.05, 0.04, sx * 0.3, 0.05, sz * (W / 2 - 0.08), 'z', 16);
  plane(root, m.lampG, 0.06, 0.02, L / 2 + 0.001, 0.3, 0.2, [0, Math.PI / 2, 0]); plane(root, m.lampG, 0.06, 0.02, L / 2 + 0.001, 0.3, -0.2, [0, Math.PI / 2, 0]);
  const deck = amrRollerDeck(); deck.position.y = Hb; deck.rotation.y = Math.PI / 2 * 0; root.add(deck);
  return finalize(root);
}

// ---------------------------------------------------------------- 9. two-level pallet conveyor with an integrated servo press (8 m, along X)
// upper level (1.1 m) carries blanks on pallets through the press; lift B lowers the pallet, the lower level (0.45 m) returns it
// empty, lift A raises it again. Three pallets, 12 s apart, one 36 s loop; the press strokes on every pallet.
function pressLine() {
  const m = materials(), root = G('Press_Line_2Level'), L = 8, X1 = L / 2 - 0.4, YU = 1.1, YL = 0.45, W = 0.55, PX = 1.0, T = 36;
  const level = (y, x0, x1, name) => {
    for (const sz of [-1, 1]) { box(root, m.alu, x1 - x0, 0.1, 0.035, (x0 + x1) / 2, y - 0.04, sz * (W / 2 + 0.02)); }
    for (let x = x0 + 0.05; x < x1; x += 0.1) cyl(root, m.steel, 0.025, W - 0.01, x, y - 0.025, 0, 'z', 12);
    void name;
  };
  level(YU, -X1 + 0.4, X1 - 0.4, 'upper'); level(YL, -X1 + 0.4, X1 - 0.4, 'lower');
  for (let x = -X1 + 0.45; x <= X1 - 0.4; x += 1.4) for (const sz of [-1, 1]) { prof(root, [x, 0.06, sz * (W / 2 + 0.05)], [x, YU - 0.1, sz * (W / 2 + 0.05)], 0.045); foot(root, x, sz * (W / 2 + 0.05)); }
  // lifts at both ends: a profile tower and an orange carriage with a short roller deck
  const lift = (name, x) => {
    for (const sz of [-1, 1]) for (const dx of [-0.38, 0.38]) prof(root, [x + dx, 0.06, sz * (W / 2 + 0.12)], [x + dx, YU + 0.55, sz * (W / 2 + 0.12)], 0.045);
    for (const sz of [-1, 1]) prof(root, [x - 0.4, YU + 0.55, sz * (W / 2 + 0.12)], [x + 0.4, YU + 0.55, sz * (W / 2 + 0.12)], 0.045);
    box(root, m.black, 0.25, 0.25, 0.2, x, YU + 0.7, W / 2 + 0.12); // lift drive
    const c = G(name, root, x, YL, 0);
    box(c, m.orange, 0.8, 0.06, W + 0.12, 0, -0.08, 0); for (let k = -3; k <= 3; k++) cyl(c, m.steel, 0.025, W - 0.01, k * 0.1, -0.025, 0, 'z', 12);
    for (const sz of [-1, 1]) box(c, m.aluDark, 0.8, 0.08, 0.03, 0, -0.03, sz * (W / 2 + 0.03));
  };
  lift('Lift_A_Carriage', -X1); lift('Lift_B_Carriage', X1);
  // servo press over the upper level at PX: two columns, orange crown, ram with die, bolster under the rollers, light curtains
  for (const sz of [-1, 1]) box(root, m.black, 0.3, 2.6, 0.22, PX, 1.3, sz * (W / 2 + 0.28));
  box(root, m.orange, 0.5, 0.45, W + 0.9, PX, 2.75, 0); box(root, m.black, 0.36, 0.3, 0.36, PX, 3.12, 0); // crown + servo motor
  box(root, m.aluDark, 0.46, 0.2, W + 0.5, PX, YU - 0.22, 0);                                                   // bolster
  const ram = G('Press_Ram', root, PX, 2.25, 0); box(ram, m.aluDark, 0.42, 0.5, W + 0.3, 0, 0, 0); box(ram, m.steel, 0.3, 0.1, 0.32, 0, -0.3, 0);
  box(root, m.steel, 0.3, 0.05, 0.32, PX, YU + 0.05, 0);                                                         // lower die
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(root, m.yellow, 0.04, 1.4, 0.04, PX + sx * 0.42, YU + 0.7, sz * (W / 2 + 0.2)); box(root, m.black, 0.02, 1.3, 0.02, PX + sx * 0.42, YU + 0.7, sz * (W / 2 + 0.17)); }
  box(root, m.screen, 0.02, 0.3, 0.4, PX - 0.1, 2.2, W / 2 + 0.42); box(root, m.black, 0.06, 0.36, 0.46, PX - 0.07, 2.2, W / 2 + 0.42);
  // pallets: X wrapper > Y wrapper > pallet + blank + formed part
  const phases = [[0, -X1, YU], [2, -X1, YU], [10, PX, YU], [14, PX, YU], [18, X1, YU], [21, X1, YL], [33, -X1, YL], [36, -X1, YU]];
  const at = (t, i) => { t = ((t % T) + T) % T; let k = 0; while (k < phases.length - 2 && phases[k + 1][0] <= t) k++; const a = phases[k], b = phases[k + 1], u = (t - a[0]) / (b[0] - a[0]); const e = u * u * (3 - 2 * u); return a[i] + (b[i] - a[i]) * e; };
  const keys = [];
  for (let p = 0; p < 3; p++) {
    const off = -12 * p, px = G(`Pallet_${p + 1}_X`, root, 0, 0, 0), py = G(`Pallet_${p + 1}_Y`, px, 0, 0, 0);
    box(py, m.aluDark, 0.5, 0.03, 0.42, 0, 0.015, 0); box(py, m.black, 0.06, 0.03, 0.06, -0.15, 0.045, 0); box(py, m.black, 0.06, 0.03, 0.06, 0.15, 0.045, 0);
    const blank = G(`Blank_${p + 1}`, py, 0, 0.06, 0); box(blank, m.stainless, 0.36, 0.012, 0.3, 0, 0.006, 0);
    const formed = G(`Formed_${p + 1}`, py, 0, 0.06, 0); box(formed, m.stainless, 0.36, 0.012, 0.3, 0, 0.006, 0); box(formed, m.stainless, 0.24, 0.05, 0.18, 0, 0.035, 0);
    const xs = [], ys = []; for (let t = 0; t <= T + 1e-6; t += 0.5) { xs.push([t, at(t + 12 * p, 1)]); ys.push([t, at(t + 12 * p, 2)]); }
    keys.push([`Pallet_${p + 1}_X`, 'x', xs], [`Pallet_${p + 1}_Y`, 'y', ys]);
    const g = t => ((t - 12 * p) % T + T) % T; // global time of this pallet's phase t
    const evs = [[g(0), 'blank'], [g(12), 'formed'], [g(18), 'none']].sort((a, b) => a[0] - b[0]), state = t => { const ph = ((t + 12 * p) % T + T) % T; return ph < 12 ? 'blank' : ph < 18 ? 'formed' : 'none'; };
    keys.push([`Blank_${p + 1}`, 'vis', [[0, state(0) === 'blank'], ...evs.map(([t]) => [t, state(t + 1e-3) === 'blank'])]], [`Formed_${p + 1}`, 'vis', [[0, state(0) === 'formed'], ...evs.map(([t]) => [t, state(t + 1e-3) === 'formed'])]]);
    void off;
  }
  // lifts and ram (12 s pattern, three times): A up 9→12, top until 3, down 3→6; B down 6→9, up 10→12; ram strokes 11→11.6, up 12.4→13
  const rep = f => { const out = []; for (let k = 0; k < 3; k++) for (const [t, v] of f) out.push([t + 12 * k, v]); return out.filter(([t]) => t >= 0 && t <= T).sort((a, b) => a[0] - b[0]); };
  keys.push(['Lift_A_Carriage', 'y', [[0, YU - YL], ...rep([[3, YU - YL], [6, 0], [9, 0], [12, YU - YL]])]], ['Lift_B_Carriage', 'y', [[0, YU - YL], ...rep([[6, YU - YL], [9, 0], [10, 0], [12, YU - YL]])]]);
  keys.push(['Press_Ram', 'y', [[0, -0.27], [0.4, -0.27], [1.0, 0], ...rep([[11, 0], [11.6, -0.27], [12.4, -0.27], [13, 0]]).filter(([t]) => t < T), [T, -0.27]]]);
  return cycleClip(finalize(root), 'Press_Cycle', T, keys);
}

// ---------------------------------------------------------------- 10. integrated AS/RS cell (15.8 × 3.0 × 7.8 m): two 4-bay rack rows on an aisle, the stacker crane
// on its rail, a U-shaped I/O loop at the −X end (outfeed → pick station → infeed, 1.25 m). Two totes circulate: every 32 s the crane
// drops the tote it retrieved onto the outfeed, takes the one coming back off the infeed, stores it in the slot emptied last time and
// fetches the next. Four slots rotate, so every rack slot visibly empties and fills; nothing appears or vanishes anywhere else.
function asrsCell(o = {}) {
  const m = materials(), root = G('ASRS_Cell'), body = G('ASRS_Cell_Body', root, -4.2, 0, 0);
  const P = o.pitch || 32, KITS = o.kits || 8, C = KITS * P, T = 2 * C, RZ = 0.95, LV = [1.5, 3.0, 4.5, 6.0], TIO = 1.25, R = 0.45, XC = -3.3;
  const slotX = (b, p) => 2.35 + 2.7 * b + [-0.99, -0.33, 0.33, 0.99][p];
  const bay0 = rackBay('01'); // one bay, cloned: the clones share geometry, so the GLB carries it once; only the number plate differs
  for (const side of [-1, 1]) for (let b = 0; b < 4; b++) { const num = String(b + 1 + (side > 0 ? 0 : 4)).padStart(2, '0'), r = bay0.clone(); r.traverse(o => { if (o.isMesh && o.material.name === 'bay_sign_01') o.material = signMat(num); }); r.position.set(2.35 + 2.7 * b, 0, side * RZ); r.rotation.y = side > 0 ? Math.PI : 0; body.add(r); }
  // floor rail (−2.9 … 12.1) and the top guide rail carried by the rack tops
  const rail = G('ASRS_Rail', body), L = 15, rx = (12.1 - 2.9) / 2;
  box(rail, m.black, L, 0.015, 0.24, rx, 0.0075, 0); box(rail, m.steel, L, 0.085, 0.06, rx, 0.0575, 0);
  for (let x = -2.9 + 0.25; x < 12.1; x += 0.5) box(rail, m.aluDark, 0.06, 0.03, 0.22, x, 0.03, 0);
  box(rail, m.steel, 12.1 - 1.0, 0.12, 0.06, 6.55, 7.56, 0); box(rail, m.black, 11.1, 0.02, 0.22, 6.55, 7.63, 0);
  for (let x = 1.5; x < 12.1; x += 2.7) box(rail, m.aluDark, 0.06, 0.06, 2 * RZ + 1.1, x - 0.15, 7.72, 0);
  const crane = asrsCrane(); crane.position.x = -0.82; body.add(crane);
  // I/O loop: outfeed (−Z) and infeed (+Z) along X, cross transfer with the pick station at XC
  const io = G('IO_Loop', body);
  const rollers = (name, x0, x1, z0, z1) => { const along = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.round(len / 0.15);
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      const r = anim(G(name + '_Roller_' + String(k + 1).padStart(2, '0'), io, x, TIO - 0.025, z), 'rotate', along ? 'z' : 'x', -Infinity, Infinity); cyl(r, m.steel, 0.025, 0.5, 0, 0, 0, along ? 'z' : 'x', 12); }
    for (const s of [-1, 1]) { const w = 0.29; if (along) box(io, m.alu, len, 0.1, 0.035, (x0 + x1) / 2, TIO - 0.04, z0 + s * w); else box(io, m.alu, 0.035, 0.1, len, x0 + s * w, TIO - 0.04, (z0 + z1) / 2); }
    for (let k = 0; k <= Math.ceil(len / 1.4); k++) { const u = k / Math.ceil(len / 1.4), x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      for (const s of [-1, 1]) { const px = along ? x : x + s * 0.29, pz = along ? z + s * 0.29 : z; prof(io, [px, 0.06, pz], [px, TIO - 0.09, pz], 0.045); foot(io, px, pz); } }
  };
  rollers('Outfeed', 0.3, XC + 0.3, -RZ, -RZ); rollers('Infeed', XC + 0.3, 0.3, RZ, RZ); rollers('Transfer', XC, XC, -RZ - 0.3, RZ + 0.3);
  for (const z of [-RZ, RZ]) { box(io, m.yellow, 0.06, 0.18, 0.62, 0.36, TIO + 0.06, z); box(io, m.black, 0.04, 0.05, 0.04, 0.2, TIO + 0.08, z + 0.32); } // end stops, tote sensors
  // pick station on the transfer: frame, light curtain posts, stack light and an HMI
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(io, [XC + sx * 0.45, 0.06, sz * 0.45], [XC + sx * 0.45, 2.3, sz * 0.45], 0.045);
  for (const sx of [-1, 1]) prof(io, [XC + sx * 0.45, 2.3, -0.45], [XC + sx * 0.45, 2.3, 0.45], 0.045);
  for (const sz of [-1, 1]) prof(io, [XC - 0.45, 2.3, sz * 0.45], [XC + 0.45, 2.3, sz * 0.45], 0.045);
  box(io, m.yellow, 0.92, 0.04, 0.04, XC, 2.33, 0); cyl(io, m.lampG, 0.03, 0.08, XC + 0.45, 2.45, 0.45, 'y', 12); cyl(io, m.yellow, 0.03, 0.08, XC + 0.45, 2.53, 0.45, 'y', 12);
  prof(io, [XC - 0.5, 0.06, 0.62], [XC - 0.5, 1.4, 0.62], 0.045); const hm = G('Pick_HMI', io, XC - 0.5, 1.55, 0.62); hm.rotation.y = Math.PI / 2; box(hm, m.black, 0.46, 0.34, 0.05, 0, 0, 0); box(hm, m.screen, 0.4, 0.28, 0.004, 0, 0, 0.027); // HMI on a post, facing the pick station

  // stored totes (merged) in every slot except the four that rotate and a few gaps
  const SL = [[1, 1, 1, 1], [-1, 3, 0, 2], [1, 3, 3, 0], [-1, 0, 2, 3]]; // side, bay, position, level
  const st = G('Stored_Totes', body);
  for (const side of [-1, 1]) for (let b = 0; b < 4; b++) for (let p = 0; p < 4; p++) for (let l = 0; l < 4; l++) {
    if (SL.some(s => s[0] === side && s[1] === b && s[2] === p && s[3] === l) || (b * 7 + p * 5 + l * 3 + (side > 0 ? 1 : 0)) % 9 === 0) continue;
    const x = slotX(b, p), y = LV[l] + 0.065, z = side * (RZ - 0.05);
    box(st, m.tote, 0.58, 0.012, 0.38, x, y + 0.012, z); for (const s of [-1, 1]) { box(st, m.tote, 0.6, 0.27, 0.008, x, y + 0.145, z + s * 0.196); box(st, m.tote, 0.008, 0.27, 0.4, x + s * 0.296, y + 0.145, z); }
  }
  const slots = SL.map(([side, b, p, l], j) => { const n = G('Slot_Tote_' + (j + 1), body, slotX(b, p), LV[l] + 0.065, side * (RZ - 0.05)); n.add(tote()); return { n, side, x: slotX(b, p), y: LV[l] + 0.065 }; });
  const carried = G('Carried_Tote', crane.getObjectByName('Crane_Fork2'), 0.82, 0.26, 0); carried.add(tote());
  // One tote at a time at the pick station, flowing one way: the crane takes a full tote (8 plate-blank kits) out of the rack and sets it on
  // the outfeed, it waits in the queue (x −2.5) until the tote before it leaves the pick station, rolls in (transfer, pick position at XC),
  // stays for its 8 picks (the line's picker takes the top kit every P s), then rolls on to the infeed as an empty tote; the crane takes
  // it back into the rack. Tote c serves the line's picks 8c … 8c + 7 (at P j + 16). Two tote nodes alternate; clip 2 × 8 P.
  const EX = o.exchange !== false, LIFT_Z = RZ + 0.65, LOW = 0.62 - TIO; // tote exchange through the two lifts beside the infeed (see below)
  const totes = ['A', 'B'].map(k => { const x = G('Tote_' + k + '_X', body, 0, TIO, -RZ), z = G('Tote_' + k + '_Z', x), y = G('Tote_' + k + '_Y', z); const v = G('Tote_' + k, y); v.add(tote());
    for (let i = 0; i < KITS; i++) { const sb = G('Tote_' + k + '_Kit_' + (i + 1), v); box(sb, m.stainless, 0.18, 0.03, 0.09, 0, 0.031 + i * 0.032, 0); for (let q = 1; q < 6; q++) box(sb, m.steel, 0.182, 0.001, 0.092, 0, 0.016 + i * 0.032 + q * 0.005, 0); } return k; });
  const car = s => s + 0.03 - 0.26 - 1.0, dn = s => s - 0.03 - 0.26 - 1.0, ch = {}, add = (n, c, l) => { (ch[n + '|' + c] || (ch[n + '|' + c] = [])).push(...l); };
  if (EX) { const lift = (name, x) => { const fr = G(name, body); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(fr, [x + sx * 0.36, 0.06, LIFT_Z + sz * 0.26], [x + sx * 0.36, TIO + 0.35, LIFT_Z + sz * 0.26], 0.045);
      box(fr, m.yellow, 0.78, 0.06, 0.06, x, TIO + 0.38, LIFT_Z); box(fr, m.black, 0.2, 0.2, 0.2, x, TIO + 0.5, LIFT_Z); const car = G(name + '_Car', fr);
      box(car, m.aluDark, 0.66, 0.04, 0.46, x, TIO - 0.05, LIFT_Z); for (let r = -2; r <= 2; r++) cyl(car, m.steel, 0.02, 0.44, x + r * 0.12, TIO - 0.015, LIFT_Z, 'z', 10); };
    lift('Lift_In', -2.2); lift('Lift_Out', -0.9);   // inbound (full totes up) and outbound (empty totes down) lifts, AGV deck 0.62 ↔ conveyor 1.25
    const ix = G('In_Tote_X', body, -2.2, TIO, RZ), iy = G('In_Tote_Y', ix), iz = G('In_Tote_Z', iy), it = G('In_Tote', iz); it.add(tote());
    for (let i = 0; i < KITS; i++) box(G('In_Tote_Kit_' + (i + 1), it), m.stainless, 0.18, 0.03, 0.09, 0, 0.031 + i * 0.032, 0); }
  const SLT = [slots[0], slots[1]], R_ = R;
  for (let c = -2; c < 4; c++) {
    const q = P * (KITS * c + KITS - 1) + 16, R = SLT[((c + 1) % 2 + 2) % 2], S = SLT[(c % 2 + 2) % 2]; // q: tote c's last pick; R: where tote c + 1 waits; S: where tote c goes back
    // crane: fetch tote c + 1 and set it on the outfeed; later take the empty tote c off the infeed and store it
    const D2 = EX ? 2.5 : 0;
    add('ASRS_Crane', 'x', [[q - 37, 0], [q - 31, R.x], [q - 28.6, R.x], [q - 22.6, 0], [q + 14.1 + D2, 0], [q + 20 + D2, S.x], [q + 22.6 + D2, S.x], [q + 28.6 + D2, 0]]);
    add('Crane_Carriage', 'y', [[q - 37, car(TIO)], [q - 31, dn(R.y)], [q - 30, dn(R.y)], [q - 29.6, car(R.y)], [q - 28.6, car(R.y)], [q - 22.6, car(TIO)], [q - 21.8, car(TIO)], [q - 21.4, dn(TIO)], [q - 20, dn(TIO)],
      [q + 11.5 + D2, dn(TIO)], [q + 12.7 + D2, dn(TIO)], [q + 13.1 + D2, car(TIO)], [q + 14.1 + D2, car(TIO)], [q + 20 + D2, car(S.y)], [q + 21.2 + D2, car(S.y)], [q + 21.6 + D2, dn(S.y)], [q + 22.6 + D2, dn(S.y)], [q + 28.6 + D2, car(TIO)]]);
    const fz = [[q - 31, 0], [q - 30, R.side * R_], [q - 29.6, R.side * R_], [q - 28.6, 0], [q - 22.6, 0], [q - 21.8, -R_], [q - 21.4, -R_], [q - 20.6, 0], [q + 11.5 + D2, 0], [q + 12.7 + D2, R_], [q + 13.1 + D2, R_], [q + 14.1 + D2, 0], [q + 20 + D2, 0], [q + 21.2 + D2, S.side * R_], [q + 21.6 + D2, S.side * R_], [q + 22.6 + D2, 0]];
    add('Crane_Fork', 'z', fz); add('Crane_Fork2', 'z', fz);
    add('Carried_Tote', 'vis', [[q - 29.6, true], [q - 21.4, false], [q + 13.0 + D2, true], [q + 21.4 + D2, false]]);
    add('Slot_Tote_' + (SLT.indexOf(R) + 1), 'vis', [[q - 29.6, false]]); add('Slot_Tote_' + (SLT.indexOf(S) + 1), 'vis', [[q + 21.4 + D2, true]]);
    // tote c + 1: outfeed → queue → pick position (rolls in when tote c has left) → 8 picks → infeed → crane
    const tk = 'Tote_' + (((c + 1) % 2 + 2) % 2 === 0 ? 'A' : 'B'), s0 = q - 21.4, e = q + 3, q2 = q + KITS * P;
    if (!EX) { add(tk, 'vis', [[s0, true], [q2 + 13.0, false]]);
      add(tk + '_X', 'x', [[s0, 0], [s0 + 8, -2.5], [e, -2.5], [e + 2, XC], [q2 + 5, XC], [q2 + 11, 0], [q2 + 13.2, 0]]);
      add(tk + '_Z', 'z', [[s0, 0], [e + 2, 0], [e + 5, RZ], [q2 + 3, RZ], [q2 + 5, 2 * RZ], [q2 + 13.1, 2 * RZ], [q2 + 13.3, 0]]); add(tk + '_Y', 'y', [[s0, 0]]); }
    else { // the empty tote leaves the infeed sideways at x −0.9 onto the outbound lift and goes down to AGV deck height
      add(tk, 'vis', [[s0, true], [q2 + 13.0, false]]);
      add(tk + '_X', 'x', [[s0, 0], [s0 + 8, -2.5], [e, -2.5], [e + 2, XC], [q2 + 5, XC], [q2 + 9, -0.9], [q2 + 13.1, -0.9], [q2 + 13.3, 0]]);
      add(tk + '_Z', 'z', [[s0, 0], [e + 2, 0], [e + 5, RZ], [q2 + 3, RZ], [q2 + 5, 2 * RZ], [q2 + 9, 2 * RZ], [q2 + 10, 2 * RZ + 0.65], [q2 + 13.1, 2 * RZ + 0.65], [q2 + 13.3, 0]]);
      add(tk + '_Y', 'y', [[s0, 0], [q2 + 10.2, 0], [q2 + 12.6, LOW], [q2 + 13.1, LOW], [q2 + 13.3, 0]]); }
    if (EX) { // at this exchange (tote c leaving at q): the AGV's full tote rises on the inbound lift, rolls onto the infeed, the crane takes it
      add('In_Tote', 'vis', [[q + 6, true], [q + 15.5, false]]); add('In_Tote_Y', 'y', [[q + 5.9, LOW], [q + 6, LOW], [q + 8.5, 0], [q + 15.6, 0], [q + 16, LOW]]);
      add('In_Tote_Z', 'z', [[q + 9.8, 0.65], [q + 10.6, 0], [q + 15.6, 0], [q + 16, 0.65]]); add('In_Tote_X', 'x', [[q + 10.6, 0], [q + 13.5, 2.2], [q + 15.6, 2.2], [q + 16, 0]]);
      add('Lift_In_Car', 'y', [[q + 6, LOW], [q + 8.5, 0], [q + 10.8, 0], [q + 13.3, LOW]]);
      add('Lift_Out_Car', 'y', [[q + 10.2, 0], [q + 12.6, LOW], [q + 60, LOW], [q + 63, 0]]); }
    for (let i = 1; i <= KITS; i++) add(tk + '_Kit_' + i, 'vis', [[s0 - 0.1, true], [q + P * (KITS - i + 1), false]]); // pick k (at q + P (k + 1)) takes the top kit, KITS − k
  }
  const ser = (a, rest) => { a = a.slice().sort((p, q) => p[0] - q[0]); const f = t => { let k = -1; while (k + 1 < a.length && a[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === a.length - 1) return a[k][1]; const [t0, v0] = a[k], [t1, v1] = a[k + 1], u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return v0 + (v1 - v0) * u * u * (3 - 2 * u); };
    return [[0, f(0)], ...a.filter(([t]) => t > 0 && t < T), [T, f(T)]]; };
  const vis = (a, v0) => { a = a.slice().sort((p, q) => p[0] - q[0]); let v = v0; for (const [t, vv] of a) if (t <= 0) v = vv; return [[0, v], ...a.filter(([t]) => t > 0 && t < T)]; };
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) { const [n, c] = key.split('|'); keys.push(c === 'vis' ? [n, 'vis', vis(evs, /^Slot/.test(n))] : [n, c, ser(evs, c === 'y' && n === 'Crane_Carriage' ? car(TIO) : /^(In_Tote_Y|Lift_In_Car)$/.test(n) ? LOW : n === 'In_Tote_Z' ? 0.65 : 0)]); }
  if (o.mirror) { body.scale.z = -1; body.traverse(n => { if (n.isMesh && /^bay_sign/.test(n.material.name || '')) n.scale.x = -1; }); } // mirrored: the lifts on the other side
  return cycleClip(finalize(root), 'ASRS_Cycle', T, keys, 5 * 32 / P);
}

// ---------------------------------------------------------------- 11. insert injection moulding cell (machine 4.1 × 1.2 × 2.0 m; with feeder, robot and outfeed 4.5 × 2.9 × 2.5 m)
// A top-entry traverse robot on the fixed platen takes the moulded bracket off the moving half, puts the next metal insert in, drops the
// part on the outfeed belt (it slides into the bin at the end) and fetches a new insert from the bowl feeder nest. Clamp closes, the
// injection unit moves in, injects, holds and cools, pulls back, the clamp opens and the ejector pushes the part out. Resin comes from
// the material box behind the machine (refilled by an AMR) through the vacuum loader on the hopper. INJECT_T s per shot.
const INJECT_T = 24;
// machine geometry shared with the EGR auto line; o.part / o.insert draw the moulded part and the insert (default: bracket + bush),
// o.inline drops the bowl feeder, the bin and the belt part (the line brings its own), o.wristed adds a wrist (rz) under the gripper
function injectionGeo(root, o = {}) {
  const m = materials(), Y = 1.4, OPEN = 0.45, XG = 0.105, ZN = 1.25, ZC = 1.85;
  // base (with a yellow stripe), control cabinet + HMI at the front of the injection end
  box(root, m.sheet, 4.05, 0.8, 1.15, -0.2, 0.45, 0); box(root, m.black, 4.1, 0.06, 1.2, -0.2, 0.03, 0); box(root, m.black, 4.07, 0.04, 1.17, -0.2, 0.87, 0);
  for (const sz of [-1, 1]) box(root, m.yellow, 4.06, 0.05, 0.004, -0.2, 0.75, sz * 0.577);
  box(root, m.sheet, 0.5, 1.1, 0.35, -1.9, 1.4, 0.45); box(root, m.black, 0.42, 0.3, 0.02, -1.9, 1.65, 0.63); box(root, m.screen, 0.36, 0.24, 0.005, -1.9, 1.65, 0.641);
  cyl(root, m.lampG, 0.025, 0.06, -1.75, 2.0, 0.55, 'y', 12); cyl(root, m.yellow, 0.025, 0.06, -1.75, 2.06, 0.55, 'y', 12); cyl(root, m.red, 0.025, 0.06, -1.75, 2.12, 0.55, 'y', 12);
  // clamp: fixed platen, moving platen on four tie bars, rear platen and the clamp cylinder; mould halves
  box(root, m.black, 0.16, 1.1, 1.1, -0.35, Y, 0); box(root, m.steel, 0.15, 0.5, 0.5, -0.195, Y, 0);           // fixed platen + fixed half
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) cyl(root, m.stainless, 0.045, 2.15, 0.65, Y + sy * 0.42, sz * 0.42, 'x', 16);
  box(root, m.black, 0.2, 1.1, 1.1, 1.65, Y, 0); cyl(root, m.steel, 0.16, 0.7, 1.2, Y, 0, 'x', 28); box(root, m.yellow, 0.18, 0.18, 0.22, 1.65, Y + 0.65, 0);
  const mp = G('Moving_Platen', root, 0.11 + OPEN, Y, 0);
  box(mp, m.black, 0.16, 1.1, 1.1, 0, 0, 0); box(mp, m.steel, 0.15, 0.5, 0.5, -0.155, 0, 0); cyl(mp, m.steel, 0.1, 0.6, 0.38, 0, 0, 'x', 24);
  const ej = G('Ejector', mp, 0, 0, 0); for (const z of [-0.05, 0.05]) cyl(ej, m.stainless, 0.008, 0.06, -0.24, 0, z, 'x', 8);
  const part = o.part || ((n, x) => { box(n, m.black, 0.02, 0.09, 0.13, x, 0, 0); box(n, m.black, 0.03, 0.03, 0.03, x + 0.02, 0.025, 0); cyl(n, m.stainless, 0.012, 0.025, x, 0, 0.04, 'x', 12); });
  const insert = o.insert || ((n, x) => cyl(n, m.stainless, 0.012, 0.025, x, 0, 0, 'x', 12));
  const mpart = G('Mould_Part', mp, o.inline ? -0.226 : -0.24, 0, 0); part(mpart, 0); if (o.inline) mpart.rotation.z = Math.PI / 2;
  const mins = G('Mould_Insert', root, o.inline ? -0.114 : -0.11, Y, o.inline ? 0 : 0.04); insert(mins, 0); if (o.inline) mins.rotation.z = -Math.PI / 2;
  // injection unit on its carriage: nozzle, barrel with heater bands, hopper + vacuum loader, screw drive
  const iu = G('Injection_Unit', root, 0, 0, 0);
  cyl(iu, m.steel, 0.03, 0.12, -0.49, Y, 0, 'x', 16); cyl(iu, m.stainless, 0.075, 1.15, -1.1, Y, 0, 'x', 24);
  for (let x = -0.62; x > -1.6; x -= 0.16) cyl(iu, m.aluDark, 0.09, 0.1, x, Y, 0, 'x', 24);
  box(iu, m.sheet, 0.7, 0.55, 0.6, -2.0, Y, 0); box(iu, m.yellow, 0.7, 0.05, 0.004, -2.0, Y + 0.2, 0.302);
  cyl(iu, m.steel, 0.12, 0.15, -1.55, Y + 0.17, 0, 'y', 20); cyl(iu, m.glass, 0.17, 0.35, -1.55, Y + 0.42, 0, 'y', 24, 0.2); cyl(iu, m.sheet, 0.2, 0.12, -1.55, Y + 0.66, 0, 'y', 24);
  cyl(iu, m.black, 0.03, 0.4, -1.55, Y + 0.9, 0, 'y', 10);
  const drv = G('Screw_Drive', iu, -2.38, Y, 0); cyl(drv, m.black, 0.14, 0.06, 0, 0, 0, 'x', 6); box(drv, m.yellow, 0.065, 0.04, 0.24, 0, 0, 0);
  // guard: frame and polycarbonate doors on both sides of the clamp, open roof for the robot
  for (const sz of [-1, 1]) { for (const x of [-0.45, 0.6, 1.75]) prof(root, [x, 0.87, sz * 0.62], [x, 2.05, sz * 0.62], 0.04, m.frameDark);
    prof(root, [-0.45, 2.05, sz * 0.62], [1.75, 2.05, sz * 0.62], 0.04, m.frameDark); box(root, m.glass, 2.18, 1.14, 0.01, 0.65, 1.46, sz * 0.62); box(root, m.black, 0.03, 0.2, 0.04, 0.55, 1.4, sz * 0.65); }
  // top-entry traverse robot: post on the fixed platen, beam along Z out over the front, vertical arm, gripper with a kick axis
  const rb = G('Robot_Base', root);
  box(rb, m.yellow, 0.14, 0.4, 0.14, XG, 2.15, -0.3); box(rb, m.yellow, 0.16, 0.16, 2.7, XG, 2.43, 0.85); box(rb, m.black, 0.18, 0.04, 2.7, XG, 2.53, 0.85);
  box(rb, m.black, 0.2, 0.2, 0.2, XG, 2.43, -0.55); box(rb, m.black, 0.16, 0.1, 2.4, XG, 2.34, 0.85);
  const tr = G('Robot_Traverse', rb, XG, 0, 0); box(tr, m.aluDark, 0.3, 0.26, 0.3, 0.2, 2.43, 0); box(tr, m.black, 0.12, 0.12, 0.12, 0.2, 2.62, 0);
  const arm = G('Robot_Arm', tr, 0, 0, 0); box(arm, m.alu, 0.08, 0.95, 0.1, 0, 2.3 + 0.475, 0); box(arm, m.yellow, 0.084, 0.04, 0.104, 0, 3.2, 0);
  const grip = G('Gripper', arm, 0, 2.3, 0); box(grip, m.aluDark, 0.16, 0.06, 0.2, 0, 0, 0);
  for (const sx of [-1, 1]) { box(grip, m.black, 0.012, 0.11, 0.16, sx * 0.07, -0.08, 0); cyl(grip, m.rubber, 0.02, 0.02, sx * 0.06, -0.14, 0.05, 'x', 10); }
  const wr = o.wristed ? G('Gripper_Wrist', grip) : grip; if (o.wristed) { box(wr, m.black, 0.05, 0.05, 0.05, 0, -0.04, 0); cyl(wr, m.rubber, 0.03, 0.02, 0, -0.08, 0, 'y', 12); }
  const gp = G('Grip_Part', wr, o.inline ? 0 : 0.1, o.inline ? 0.1 : -0.1, 0); part(gp, 0); if (o.inline) gp.rotation.z = Math.PI; // inline: dual gripper, the moulded part on the far side of the wrist
  const gi = G('Grip_Insert', wr, o.inline ? 0 : -0.09, -0.1, o.inline ? 0 : 0.04); insert(gi, 0);
  if (!o.inline) {
  // insert feeder: vibratory bowl, linear track, nest; outfeed belt into a parts bin
  const fd = G('Insert_Feeder', root);
  box(fd, m.sheet, 0.5, 0.75, 0.5, -0.8, 0.375, ZN); cyl(fd, m.stainless, 0.22, 0.12, -0.8, 0.86, ZN, 'y', 32); cyl(fd, m.black, 0.12, 0.06, -0.8, 0.79, ZN, 'y', 20);
  box(fd, m.alu, 0.75, 0.03, 0.06, -0.24, 0.96, ZN); box(fd, m.aluDark, 0.3, 0.9, 0.3, XG, 0.45, ZN); box(fd, m.yellow, 0.12, 0.04, 0.12, XG, 0.92, ZN);
  for (const x of [-0.08, 0.0, 0.05]) for (const z of [-0.06, 0.06]) cyl(fd, m.stainless, 0.012, 0.025, -0.8 + x * 2, 0.93, ZN + z * 1.5, 'y', 10);
  const nx = G('Nest_Insert_X', fd, XG - 0.09, 1.0, ZN), ni = G('Nest_Insert', nx); cyl(ni, m.stainless, 0.012, 0.025, 0, 0, 0, 'y', 12);
  }
  const cv = G('Outfeed_Belt', root); box(cv, m.alu, 1.9, 0.1, 0.42, 0.7, 0.8, ZC); box(cv, m.belt, 1.9, 0.01, 0.36, 0.7, 0.855, ZC);
  for (const x of [-0.15, 1.55]) for (const sz of [-1, 1]) { prof(cv, [x, 0.06, ZC + sz * 0.18], [x, 0.75, ZC + sz * 0.18], 0.04); foot(cv, x, ZC + sz * 0.18); }
  box(cv, m.black, 0.14, 0.14, 0.12, 1.55, 0.78, ZC - 0.27);
  if (!o.inline) {
  const pb = G('Parts_Bin', root, 1.95, 0, ZC); box(pb, m.tote, 0.6, 0.02, 0.4, 0, 0.32, 0);
  for (const s of [-1, 1]) { box(pb, m.tote, 0.6, 0.3, 0.012, 0, 0.47, s * 0.2); box(pb, m.tote, 0.012, 0.3, 0.4, s * 0.3, 0.47, 0); }
  for (const [x, z, r] of [[-0.15, -0.08, 0.3], [0.05, 0.06, 1.2], [0.18, -0.05, 2.1], [-0.05, 0.1, 2.8], [0.1, -0.1, 0.9]]) { const p = G('Bin_Pile', pb, x, 0.36, z); p.rotation.set(0, r, Math.PI / 2); part(p, 0); }
  for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) prof(pb, [x, 0.0, z], [x, 0.31, z], 0.03, m.frameDark);
  const bx = G('Belt_Part_X', root, XG + 0.1, 0.86 + 0.065, ZC), by = G('Belt_Part_Y', bx), bp = G('Belt_Part', by); bp.rotation.z = Math.PI / 2; part(bp, 0);
  }
  // material box behind the machine (the AMR swaps it) with the loader hose up to the hopper
  const mb = G('Material_Box', root, -1.55, 0, -1.0); box(mb, m.black, 0.8, 0.12, 0.8, 0, 0.06, 0); box(mb, m.yellow, 0.76, 0.7, 0.76, 0, 0.47, 0); box(mb, m.black, 0.6, 0.01, 0.6, 0, 0.825, 0);
  bin(root, m.black, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-1.55, 0.6, -1.0], [-1.55, 1.2, -1.05], [-1.55, 2.3, -0.75], [-1.55, 2.5, -0.25], [-1.55, Y + 1.1, 0]].map(v => new THREE.Vector3(...v))), 32, 0.03, 8));
  return root;
}
function injectionCell() {
  const root = injectionGeo(G('Injection_Cell')), OPEN = 0.45, ZN = 1.25, ZC = 1.85;

  const D = 0.8, DN = 1.2, DC = 1.275;   // arm strokes into the mould gap / to the nest / to the belt
  return cycleClip(finalize(root), 'Inject_Cycle', INJECT_T, [
    ['Moving_Platen', 'x', [[0, -OPEN], [0.1, -OPEN], [1.5, 0], [5.6, 0], [7.0, -OPEN], [24, -OPEN]]],
    ['Ejector', 'x', [[0, 0], [1.5, 0], [2.0, -0.04], [3.5, -0.04], [4.0, 0], [24, 0]]],
    ['Injection_Unit', 'x', [[0, 0], [7.0, 0], [8.0, 0.06], [20, 0.06], [21, 0], [24, 0]]],
    ['Screw_Drive', 'rx', [[0, 0], [10, 0], [16, Math.PI * 8], [24, Math.PI * 8]]],
    ['Robot_Traverse', 'z', [[0, ZN], [0.5, ZN], [2.0, 0], [5.6, 0], [7.0, ZC], [8.2, ZC], [9.2, ZN], [24, ZN]]],
    ['Robot_Arm', 'y', [[0, 0], [2.0, 0], [3.0, -D], [4.6, -D], [5.6, 0], [7.0, 0], [7.6, -DC], [8.0, -DC], [8.4, 0], [9.2, 0], [9.8, -DN], [10.0, -DN], [10.6, 0], [24, 0]]],
    ['Gripper', 'x', [[0, 0], [3.0, 0], [3.5, 0.1], [3.6, 0.1], [4.0, -0.1], [4.2, -0.1], [4.6, 0], [24, 0]]],
    ['Mould_Part', 'vis', [[0, true], [3.5, false], [9, true]]], ['Mould_Insert', 'vis', [[0, false], [4.0, true], [9, false]]],
    ['Grip_Part', 'vis', [[0, false], [3.5, true], [7.8, false]]], ['Grip_Insert', 'vis', [[0, true], [4.0, false], [9.9, true]]],
    ['Nest_Insert', 'vis', [[0, true], [9.9, false], [12, true]]], ['Nest_Insert_X', 'x', [[0, 0], [11.9, 0], [11.95, -0.55], [12, -0.55], [14, 0], [24, 0]]],
    ['Belt_Part', 'vis', [[0, false], [7.8, true], [15.2, false]]], ['Belt_Part_X', 'x', [[0, 0], [8.2, 0], [14.2, 1.45], [15.0, 1.75], [24, 0]]], ['Belt_Part_Y', 'y', [[0, 0], [14.2, 0], [15.0, -0.5], [15.5, -0.5], [16, 0], [24, 0]]]]);
}

// ---------------------------------------------------------------- 12. EGR automatic line (14.9 × 3.6 × 3.3 m, along +X): picker at the AS/RS pick station → automatic
// dispensing cell (vision alignment, XYZ needle gantry) → drying / sintering tunnel oven → vision gate + NG pusher → insert moulding
// machine (top-entry robot) → outfeed belt into the tote on the AMR waiting at x 14.75. One substrate every 32 s, taken from the
// tote the AS/RS cell presents at x −1.3 (same 128 s clock): every part is one object from the tote to the AMR, and its look follows
// the process: ceramic substrate → Ni paste pattern (three passes) → sintered metal pattern → over-moulded body. Part 3 of 4 fails
// the vision check and is pushed into the NG bin.
const LINE_T = 128, LINE_P = 32, LINE_PICK = 16;
function egrAutoLine() {
  const m = materials(), root = G('EGR_Auto_Line'), BT = 0.855, BW = 0.5;
  const ceramic = std('ceramic_substrate', 0xece8de, 0.0, 0.55), sinter = std('sintered_nickel', 0xc8ccd0, 1.0, 0.28), glow = std('oven_glow', 0xff7a1a, 0.0, 0.6, { emissive: 0xff5a00, emissiveIntensity: 2.2 });
  // part looks: a 200 × 140 × 12 mm substrate centred on its node; three paste / sintered stripes; the moulded body around it
  const plate = n => box(n, ceramic, 0.2, 0.012, 0.14, 0, 0, 0);
  const stripes = (n, mt, y) => { for (const x of [-0.06, 0, 0.06]) box(n, mt, 0.012, 0.003, 0.1, x, y, 0); };
  const body = n => { box(n, m.black, 0.24, 0.02, 0.18, 0, -0.012, 0); for (const s of [-1, 1]) box(n, m.black, 0.24, 0.026, 0.02, 0, 0.004, s * 0.08); box(n, m.black, 0.04, 0.04, 0.05, 0.1, 0.02, 0); };
  const look = (n, pre, stage) => { plate(n); if (stage !== 'sub') stripes(n, sinter, 0.0075); if (stage === 'body') body(n); };
  const belt = (x0, x1, z = 0, legs = true) => { const L = x1 - x0, c = (x0 + x1) / 2;
    for (const sz of [-1, 1]) box(root, m.alu, L, 0.1, 0.035, c, BT - 0.055, z + sz * (BW / 2 + 0.03));
    box(root, m.belt, L - 0.02, 0.01, BW, c, BT - 0.005, z);
    if (legs) for (let k = 0, n = Math.max(1, Math.ceil(L / 1.4)); k <= n; k++) { const x = x0 + 0.08 + (L - 0.16) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (BW / 2 + 0.03)], [x, BT - 0.11, z + sz * (BW / 2 + 0.03)], 0.04); foot(root, x, z + sz * (BW / 2 + 0.03)); } }
  };
  // 1. picker over the AS/RS pick station (x −1.3) and the line start (x 0)
  for (const sz of [-1, 1]) prof(root, [0.55, 0.06, sz * 0.32], [0.55, 2.15, sz * 0.32], 0.06, m.frameDark);
  box(root, m.yellow, 0.1, 0.1, 0.74, 0.55, 2.2, 0); box(root, m.yellow, 2.3, 0.12, 0.12, -0.55, 2.2, 0); box(root, m.black, 2.2, 0.03, 0.13, -0.55, 2.27, 0);
  const px = G('Picker_X', root), py = G('Picker_Y', px); box(px, m.aluDark, 0.22, 0.2, 0.2, 0, 2.2, 0.0); box(px, m.black, 0.1, 0.1, 0.1, 0, 2.36, 0);
  box(py, m.alu, 0.05, 0.6, 0.05, 0, 1.95 + 0.3 - 0.2, 0); box(py, m.aluDark, 0.16, 0.02, 0.12, 0, 1.76, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(py, m.rubber, 0.012, 0.02, sx * 0.06, 1.745, sz * 0.04, 'y', 10);
  const pps = G('Picker_Sub', py, 0, 1.729, 0); look(pps, 'Picker_Sub', 'sub');
  // 2. belt into the dispensing cell, the cell (x 2 … 4), belt to the oven
  belt(-0.15, 2.0); belt(2.0, 4.0, 0, false); belt(4.0, 5.0);
  const dc = G('Auto_Dispense', root);
  box(dc, m.sheet, 2.0, 0.7, 1.3, 3.0, 0.4, 0); box(dc, m.black, 2.02, 0.05, 1.32, 3.0, 0.03, 0); box(dc, m.yellow, 2.01, 0.05, 0.004, 3.0, 0.68, 0.652);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(dc, [3.0 + sx * 0.98, 0.75, sz * 0.63], [3.0 + sx * 0.98, 2.1, sz * 0.63], 0.045, m.frameDark);
  for (const sz of [-1, 1]) prof(dc, [2.02, 2.1, sz * 0.63], [3.98, 2.1, sz * 0.63], 0.045, m.frameDark); for (const sx of [-1, 1]) prof(dc, [3.0 + sx * 0.98, 2.1, -0.63], [3.0 + sx * 0.98, 2.1, 0.63], 0.045, m.frameDark);
  for (const sz of [-1, 1]) box(dc, m.glass, 1.9, 1.3, 0.008, 3.0, 1.43, sz * 0.63); for (const sx of [-1, 1]) { box(dc, m.glass, 0.008, 1.0, 1.2, 3.0 + sx * 0.98, 1.6, 0); box(dc, m.black, 0.012, 0.25, 0.62, 3.0 + sx * 0.98, 0.98, 0); }
  box(dc, m.sheet, 1.96, 0.02, 1.26, 3.0, 2.12, 0);
  for (const sz of [-1, 1]) box(dc, m.aluDark, 1.8, 0.08, 0.08, 3.0, 1.85, sz * 0.5);                          // gantry X rails
  const dx = G('Disp_X', dc, 0, 0, 0); box(dx, m.aluDark, 0.12, 0.1, 1.08, 3.0, 1.79, 0);
  const dz = G('Disp_Z', dx, 0, 0, 0); box(dz, m.yellow, 0.16, 0.22, 0.12, 3.0, 1.7, 0);
  const dn = G('Disp_Needle', dz, 0, 0, 0); box(dn, m.aluDark, 0.06, 0.4, 0.06, 3.0, 1.4, 0); cyl(dn, m.syringe, 0.022, 0.16, 3.06, 1.42, 0, 'y', 16); cyl(dn, m.paste, 0.016, 0.06, 3.06, 1.53, 0, 'y', 12);
  cyl(dn, m.steel, 0.006, 0.12, 3.0, 1.14, 0, 'y', 8); cyl(dn, m.stainless, 0.0015, 0.03, 3.0, 1.065, 0, 'y', 6);
  box(dc, m.black, 0.1, 0.12, 0.1, 3.0, 1.98, -0.35); cyl(dc, m.black, 0.03, 0.08, 3.0, 1.9, -0.35, 'y', 16); const ring = G('Align_Light', dc); cyl(ring, m.light, 0.06, 0.01, 3.0, 1.85, -0.35, 'y', 24); // alignment camera + ring light
  box(dc, m.syringe, 0.18, 0.3, 0.18, 2.2, 2.28, 0.4); box(dc, m.paste, 0.14, 0.1, 0.14, 2.2, 2.2, 0.4);             // paste reservoir (pressure tank)
  cyl(dc, m.black, 0.012, 0.25, 3.85, 2.25, 0.5, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.yellow], [2, m.red]]) cyl(dc, mt, 0.03, 0.06, 3.85, 2.4 + k * 0.065, 0.5, 'y', 14);
  box(dc, m.black, 0.06, 0.32, 0.42, 3.95, 1.5, 0.75); box(dc, m.screen, 0.004, 0.26, 0.36, 3.98, 1.5, 0.75);
  // 3. drying / sintering tunnel oven (x 5 … 10): mesh belt, drying zone (2 m), sintering zone (3 m) with glow windows, two exhaust hoods
  belt(4.8, 10.2, 0, false);
  const ov = G('Oven', root);
  box(ov, m.sheet, 5.0, 1.15, 1.2, 7.5, 1.2, 0); box(ov, m.black, 5.02, 0.06, 1.22, 7.5, 0.6, 0); box(ov, m.black, 5.02, 0.06, 1.22, 7.5, 1.78, 0);
  box(ov, m.aluDark, 5.0, 0.6, 1.0, 7.5, 0.3, 0); for (const x of [5.2, 6.6, 8.2, 9.8]) for (const sz of [-1, 1]) box(ov, m.black, 0.08, 0.6, 0.08, x, 0.3, sz * 0.46);
  for (const sx of [-1, 1]) { box(ov, m.black, 0.02, 0.16, 0.6, 7.5 + sx * 2.51, 0.93, 0); for (let k = -2; k <= 2; k++) box(ov, m.rubber, 0.01, 0.15, 0.1, 7.5 + sx * 2.52, 0.93, k * 0.11); } // entry / exit with curtains
  box(ov, m.yellow, 2.0, 0.05, 0.004, 6.0, 1.66, 0.602); box(ov, m.red, 3.0, 0.05, 0.004, 8.5, 1.66, 0.602);    // zone stripes: drying (yellow), sintering (red)
  for (const x of [7.6, 8.5, 9.4]) { box(ov, m.black, 0.5, 0.26, 0.02, x, 1.2, 0.605); box(ov, glow, 0.42, 0.18, 0.004, x, 1.2, 0.616); } // sinter zone windows
  box(ov, m.black, 0.5, 0.26, 0.02, 6.0, 1.2, 0.605); box(ov, m.window, 0.42, 0.18, 0.004, 6.0, 1.2, 0.616);
  for (const [x, w] of [[5.8, 1.2], [8.5, 1.8]]) { box(ov, m.steel, w, 0.3, 0.9, x, 1.95, 0); box(ov, m.steel, w * 0.6, 0.12, 0.5, x, 2.16, 0); cyl(ov, m.steel, 0.14, 0.9, x, 2.65, 0, 'y', 20); }
  box(ov, m.sheet, 0.6, 1.6, 0.35, 10.0, 0.8, 0.85); box(ov, m.screen, 0.4, 0.26, 0.005, 10.0, 1.3, 1.026); for (const [k, mt] of [[0, m.lampR], [1, m.lampA], [2, m.lampG]]) cyl(ov, mt, 0.02, 0.01, 9.85 + k * 0.08, 1.05, 1.03, 'z', 12);
  // 4. vision gate (x 10.9) + NG pusher (x 11.2) and bin, belt to the moulding robot pick point (x 12.8, end stop)
  belt(10.2, 12.95);
  for (const sz of [-1, 1]) prof(root, [10.9, 0.06, sz * 0.42], [10.9, 1.75, sz * 0.42], 0.05, m.frameDark);
  box(root, m.frameDark, 0.08, 0.08, 0.92, 10.9, 1.75, 0); box(root, m.black, 0.1, 0.14, 0.1, 10.9, 1.62, 0); cyl(root, m.light, 0.07, 0.012, 10.9, 1.53, 0, 'y', 24);
  const flash = G('Vision_Flash', root); cyl(flash, m.light, 0.12, 0.004, 10.9, 0.9, 0, 'y', 24);
  const ngp = G('NG_Pusher', root, 0, 0, 0); box(ngp, m.aluDark, 0.16, 0.06, 0.02, 11.2, BT + 0.035, BW / 2 - 0.02); cyl(ngp, m.steel, 0.01, 0.35, 11.2, BT + 0.035, BW / 2 + 0.16, 'z', 8);
  cyl(root, m.alu, 0.03, 0.3, 11.2, BT + 0.035, BW / 2 + 0.47, 'z', 16); box(root, m.black, 0.06, 0.06, 0.06, 11.2, BT + 0.035, BW / 2 + 0.64);
  const ngb = G('NG_Bin', root, 11.2, 0, -0.62); box(ngb, m.red, 0.5, 0.02, 0.4, 0, 0.32, 0); for (const s of [-1, 1]) { box(ngb, m.red, 0.5, 0.3, 0.012, 0, 0.47, s * 0.2); box(ngb, m.red, 0.012, 0.3, 0.4, s * 0.25, 0.47, 0); }
  for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) prof(ngb, [x, 0, z], [x, 0.31, z], 0.03, m.frameDark);
  box(ngb, m.ngLabel, 0.3, 0.12, 0.004, 0, 0.52, -0.207); box(root, m.steel, 0.3, 0.012, 0.36, 11.2, 0.75, -0.42, [-0.5, 0, 0]);   // chute lip
  box(root, m.yellow, 0.03, 0.06, BW, 12.94, BT + 0.03, 0);                                                                          // end stop
  // manual infeed (x 4.4): side guide, stand for the tote the AMR brings from the manual dispensing benches (z 1.6), standing operator
  for (const sz of [-1, 1]) box(root, m.yellow, 0.6, 0.04, 0.01, 4.7, BT + 0.03, sz * (sz > 0 ? 0.24 : 0.24) - 0.0, [0, sz * 0.15, 0]);
  const st = G('Infeed_Stand', root, 4.4, 0, 1.6); box(st, m.aluDark, 0.66, 0.03, 0.46, 0, 0.6, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { prof(st, [sx * 0.3, 0.06, sz * 0.2], [sx * 0.3, 0.585, sz * 0.2], 0.04); foot(st, sx * 0.3, sz * 0.2); }
  for (let k = -2; k <= 2; k++) cyl(st, m.steel, 0.02, 0.44, k * 0.12, 0.635, 0, 'z', 10);
  box(st, m.yellow, 0.05, 0.08, 0.46, -0.33, 0.66, 0);                                                            // end stop on the far side
  const op = G('Op2', root, 4.4, 0, 0.78); op.rotation.y = Math.PI; const turn = G('Op2_Turn', op);              // faces the belt (−Z)
  for (const sx of [-0.1, 0.1]) { box(turn, m.frameDark, 0.13, 0.82, 0.15, sx, 0.41, 0); box(turn, m.black, 0.12, 0.07, 0.26, sx, 0.035, 0.05); }
  box(turn, m.frameDark, 0.36, 0.56, 0.22, 0, 1.12, 0); box(turn, m.yellow, 0.372, 0.3, 0.232, 0, 1.2, 0);       // torso + hi-vis vest
  cyl(turn, m.light, 0.095, 0.22, 0, 1.55, 0, 'y', 16); cyl(turn, m.sheet, 0.115, 0.08, 0, 1.67, 0, 'y', 16);     // head + helmet
  for (const [n, sx] of [['Op2_Arm_L', -0.22], ['Op2_Arm_R', 0.22]]) { const a = G(n, turn, sx, 1.36, 0); a.rotation.x = -0.15; box(a, m.frameDark, 0.09, 0.36, 0.09, 0, -0.18, 0); box(a, m.light, 0.075, 0.36, 0.075, 0, -0.54, 0);
    if (n === 'Op2_Arm_R') { const hp = G('Op2_Hand_Part', a, -0.1, -0.76, 0.04); plate(hp); [-0.06, 0, 0.06].forEach(px => box(hp, m.paste, 0.014, 0.004, 0.1, px, 0.008, 0)); } }
  // 5. insert moulding machine, robot pick point = line end (machine x 0.105 at line x 12.8, its nest z 1.25 on the line axis)
  const mc = injectionGeo(G('Insert_Moulding', root, 12.8 - 0.105, 0, -1.25), { inline: true, wristed: true, part: (n) => look(n, 'MP', 'body'), insert: (n) => look(n, 'MI', 'sinter') });
  void mc;
  // ---- keys
  const ease = u => u * u * (3 - 2 * u);
  const ser = (evs, rest) => { // periodic position series from absolute events (already replicated around the clip): value at 0 and T added
    evs = evs.slice().sort((a, b) => a[0] - b[0]);
    const f = t => { let k = -1; while (k + 1 < evs.length && evs[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === evs.length - 1) return evs[k][1]; const [t0, v0] = evs[k], [t1, v1] = evs[k + 1]; return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1); };
    return [[0, f(0)], ...evs.filter(e => e[0] > 0 && e[0] < LINE_T), [LINE_T, f(LINE_T)]];
  };
  const vis = (evs, v0) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); let s = v0; for (const [t, v] of evs) if (t <= 0) s = v; return [[0, s], ...evs.filter(e => e[0] > 0 && e[0] < LINE_T)]; };
  // auto part j: picked from the AS/RS tote at b = 32 j + 16. Manual part j: dispensed at the benches, brought by AMR in a tote to the infeed
  // stand; the infeed operator puts it on the belt at x 4.4 at c + 29.2 (c = b + 16), 16 s after the auto part, so the oven, vision and
  // moulding see one part every 16 s. NG: auto part 3 and manual part 2 of every four.
  const NGA = 2, NGM = 1, occ = []; for (let j = -4; j < 8; j++) occ.push({ j, k: ((j % 4) + 4) % 4, b: LINE_P * j + LINE_PICK });
  const ch = {}, add = (node, c, list) => { const key = node + '|' + c; (ch[key] || (ch[key] = [])).push(...list); };
  const XG = 0.105, ZN = 1.25, ZC = 1.85, OPEN = 0.45, D = 0.9, DN = 1.339, DC = 1.339, KI = -0.119, KP = 0.129;
  const tail = (P, b, ng, r) => { // shared path from the oven entry (b = the part's own time base, oven entry at b + 33.7)
    const xs = [[b + 33.7, 5.0], [b + 83.7, 10.0], [b + 87.7, 11.2]], ys = [], zs = [];
    if (ng) { xs.push([b + 88.8, 11.2]); zs.push([b + 88, 0], [b + 88.8, -0.55]); ys.push([b + 88.8, 0], [b + 89.4, -0.47]); add('NG_Pusher', 'z', [[b + 87.9, 0], [b + 88.8, -0.48], [b + 89.6, 0]]); }
    else { xs.push([b + 91.7, 12.8], [r + 23.09, 12.8], [r + 23.6, 12.8], [r + 29.1, 14.35], [r + 29.7, 14.7]); zs.push([r + 23.09, 0], [r + 23.1, 0.6]); ys.push([r + 29.1, 0], [r + 29.7, -0.2]); }
    add('Vision_Flash', 'vis', [[b + 86.4, true], [b + 86.7, false]]);
    return { xs, ys, zs, end: ng ? b + 89.6 : r + 29.9 };
  };
  for (const { k, b } of occ) {
    // ---- auto part
    {
      const P = 'Part_' + (k + 1), ng = k === NGA, r = b + 95;
      add('Picker_X', 'x', [[b - 2, 0], [b - 1, -1.3], [b + 0.8, -1.3], [b + 2.8, 0]]);
      add('Picker_Y', 'y', [[b - 1, 0], [b - 0.2, -(1.729 - 1.318)], [b, -(1.729 - 1.318)], [b + 0.8, 0], [b + 2.8, 0], [b + 3.6, -(1.729 - (BT + 0.006))], [b + 3.8, -(1.729 - (BT + 0.006))], [b + 4.6, 0]]);
      add('Picker_Sub', 'vis', [[b, true], [b + 3.8, false]]);
      const t = tail(P, b, ng, r);
      add(P + '_X', 'x', [[b + 3.8, 0], [b + 4, 0], [b + 14, 3.0], [b + 27, 3.0], ...t.xs]); add(P + '_Y', 'y', [[b + 3.8, 0], ...t.ys]); add(P + '_Z', 'z', [[b + 3.8, 0], ...t.zs]);
      add(P, 'vis', ng ? [[b + 3.8, true], [t.end, false]] : [[b + 3.8, true], [r, false], [r + 23.1, true], [t.end, false]]);
      add(P + '_Paste', 'vis', [[b + 3.8, false], [b + 19, true], [b + 63.7, false]]); [1, 2, 3].forEach(s => add(P + '_Paste_' + s, 'vis', [[b + 3.8, false], [b + 16 + 3 * s, true]]));
      add(P + '_Sinter', 'vis', [[b + 3.8, false], [b + 63.7, true], [r + 23.1, false]]); add(P + '_Body', 'vis', [[b + 3.8, false], [r + 23.1, true]]);
      add('Align_Light', 'vis', [[b + 15, true], [b + 15.4, false]]);
      add('Disp_X', 'x', [[b + 15, 0], [b + 16, -0.06], [b + 19, -0.06], [b + 19.5, 0], [b + 22, 0], [b + 22.5, 0.06], [b + 25, 0.06], [b + 26.5, 0]]);
      add('Disp_Z', 'z', [[b + 15, 0], [b + 16, -0.05], [b + 16.5, -0.05], [b + 19, 0.05], [b + 19.5, 0.05], [b + 22, -0.05], [b + 22.5, -0.05], [b + 25, 0.05], [b + 26.5, 0]]);
      add('Disp_Needle', 'y', [[b + 16, 0], [b + 16.5, -0.185], [b + 25, -0.185], [b + 25.5, 0]]);
    }
    // ---- manual part (already pasted): the infeed operator turns to the tote on the stand, takes one, turns back and lays it on the belt
    {
      const c = b + 16, P = 'MPart_' + (k + 1), ng = k === NGM, r = c + 95;
      add('Op2_Turn', 'ry', [[c + 24.6, 0], [c + 25.8, Math.PI], [c + 27.5, Math.PI], [c + 28.7, 0]]);
      add('Op2_Arm_R', 'rx', [[c + 25.6, -0.15], [c + 26.4, -0.75], [c + 27.1, -0.75], [c + 27.5, -0.3], [c + 28.7, -0.3], [c + 29.2, -0.9], [c + 29.5, -0.9], [c + 30, -0.15]]);
      add('Op2_Arm_L', 'rx', [[c + 25.6, -0.15], [c + 26.4, -0.6], [c + 27.1, -0.6], [c + 27.6, -0.15]]);
      add('Op2_Hand_Part', 'vis', [[c + 27, true], [c + 29.2, false]]);
      const t = tail(P, c, ng, r);
      add(P + '_X', 'x', [[c + 29.2, 4.4], [c + 29.6, 4.4], ...t.xs]); add(P + '_Y', 'y', [[c + 29.2, 0], ...t.ys]); add(P + '_Z', 'z', [[c + 29.2, 0.12], [c + 31.5, 0], ...t.zs]); // the side guide centres it
      add(P, 'vis', ng ? [[c + 29.2, true], [t.end, false]] : [[c + 29.2, true], [r, false], [r + 23.1, true], [t.end, false]]);
      add(P + '_Sinter', 'vis', [[c + 29.2, false], [c + 63.7, true], [r + 23.1, false]]); add(P + '_Paste', 'vis', [[c + 29.2, true], [c + 63.7, false]]); add(P + '_Body', 'vis', [[c + 29.2, false], [r + 23.1, true]]);
    }
  }
  // insert moulding, one slot every 16 s (r = 111 + 16 i; even i = auto part i / 2, odd i = manual part): the dual gripper takes the next
  // substrate at the line end, swaps it in the open mould against the part moulded in the slot before (kick +x: grab, kick −x: place),
  // the clamp closes and the shot is moulded while the robot lays the previous part on the outfeed belt and comes back.
  const good = i => { const j = Math.floor(i / 2), k = ((j % 4) + 4) % 4; return i % 2 === 0 ? k !== NGA : k !== NGM; };
  for (let i = -10; i < 18; i++) {
    const r = 111 + 16 * i, gi = good(i), gp = good(i - 1); if (!gi && !gp) continue;
    add('Robot_Arm', 'y', [...(gi ? [[r - 0.6, 0], [r - 0.2, -DN], [r, -DN], [r + 0.6, 0]] : []), [r + 2, 0], [r + 3, -D], [r + 4.2, -D], [r + 5.2, 0], ...(gp ? [[r + 6.6, 0], [r + 7.0, -DC], [r + 7.2, -DC], [r + 7.6, 0]] : [])]);
    add('Robot_Traverse', 'z', [[r + 0.6, ZN], [r + 2, 0], [r + 5.2, 0], [r + 6.6, ZC], [r + 7.6, ZC], [r + 8.8, ZN]]);
    add('Gripper_Wrist', 'rz', [[r + 0.6, 0], [r + 2, -Math.PI / 2], [r + 5.2, -Math.PI / 2], [r + 6.6, -Math.PI], [r + 7.6, -Math.PI], [r + 8.8, 0]]);
    add('Gripper', 'x', [[r + 3, 0], ...(gp ? [[r + 3.3, KP], [r + 3.5, KP]] : []), ...(gi ? [[r + 3.8, KI], [r + 3.95, KI]] : []), [r + 4.2, 0]]);
    if (gi) { add('Grip_Insert', 'vis', [[r, true], [r + 3.9, false]]); add('Mould_Insert', 'vis', [[r + 3.9, true], [r + 8.4, false]]); add('Mould_Part', 'vis', [[r + 8.4, true], [r + 16 + 3.4, false]]);
      add('Moving_Platen', 'x', [[r + 5.2, 0], [r + 6.4, -OPEN], [r + 13.4, -OPEN], [r + 14.6, 0]]);
      add('Injection_Unit', 'x', [[r + 6.4, 0], [r + 7.0, 0.06], [r + 12.6, 0.06], [r + 13.4, 0]]);
      add('Ejector', 'x', [[r + 14.6, 0], [r + 15.2, -0.04], [r + 16 + 3.6, -0.04], [r + 16 + 4.0, 0]]); }
    if (gp) add('Grip_Part', 'vis', [[r + 3.4, true], [r + 7.1, false]]);
  }
  // part nodes: X > Y > Z > look; paste stripes under P_Paste so the stage group can hide them after sintering
  for (const pre of ['Part_', 'MPart_']) for (let k = 0; k < 4; k++) {
    const P = pre + (k + 1), x = G(P + '_X', root, 0, BT + 0.006, 0), y = G(P + '_Y', x), z = G(P + '_Z', y), n = G(P, z);
    plate(n); const pg = G(P + '_Paste', n); [-0.06, 0, 0.06].forEach((px, i) => box(pre === 'Part_' ? G(P + '_Paste_' + (i + 1), pg) : pg, m.paste, 0.014, 0.004, 0.1, px, 0.008, 0));
    stripes(G(P + '_Sinter', n), sinter, 0.0075); body(G(P + '_Body', n));
  }
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) {
    const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /^(Grip_|Mould_|Picker_Sub|Vision_Flash|Align_Light|Op2_Hand)/.test(node) ? false : /^M?Part_\d$/.test(node) ? false : /_Paste_\d$/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs.map(([t, v]) => [t, v]), c === 'z' && node === 'Robot_Traverse' ? ZN : c === 'rx' && /^Op2_Arm/.test(node) ? -0.15 : 0)]);
  }
  // the screw turns forward while it doses the next shot: unwrap its rotation per moulded shot
  { let acc = 0; const pts = []; for (let i = -10; i < 18; i++) { if (!good(i)) continue; const r = 111 + 16 * i; pts.push([r + 8.4, acc], [r + 12.4, acc + Math.PI * 6]); acc += Math.PI * 6; } keys.push(['Screw_Drive', 'rx', ser(pts, 0)]); }
  return cycleClip(finalize(root), 'Line_Cycle', LINE_T, keys);
}

// ---------------------------------------------------------------- 13. the over-moulded insert part (the EGR auto line's product): ceramic substrate with a sintered Ni pattern in a black body
function insertPart() {
  const m = materials(), root = G('Insert_Part'), ceramic = std('ceramic_substrate', 0xece8de, 0.0, 0.55), sinter = std('sintered_nickel', 0xc8ccd0, 1.0, 0.28);
  box(root, m.black, 0.24, 0.02, 0.18, 0, 0.01, 0); for (const s of [-1, 1]) box(root, m.black, 0.24, 0.026, 0.02, 0, 0.026, s * 0.08); box(root, m.black, 0.04, 0.04, 0.05, 0.1, 0.042, 0);
  box(root, ceramic, 0.2, 0.012, 0.14, 0, 0.026, 0); for (const x of [-0.06, 0, 0.06]) box(root, sinter, 0.012, 0.003, 0.1, x, 0.0335, 0);
  return finalize(root);
}
function dispensedSub() { // ceramic substrate with three Ni paste stripes (after dispensing, before sintering)
  const m = materials(), root = G('Dispensed_Substrate'), ceramic = std('ceramic_substrate', 0xece8de, 0.0, 0.55);
  box(root, ceramic, 0.2, 0.012, 0.14, 0, 0.006, 0); for (const x of [-0.06, 0, 0.06]) box(root, m.paste, 0.014, 0.004, 0.1, x, 0.014, 0);
  return finalize(root);
}
function toteWith(name, item, n, cols, h) { // a 600 × 400 tote holding n parts in rows of cols (layers h apart)
  const root = G(name); root.add(tote());
  for (let k = 0; k < n; k++) { const p = item(); p.position.set((k % cols - (cols - 1) / 2) * (0.56 / cols), 0.025 + Math.floor(k / cols) * h, 0); if (cols === 2) p.rotation.y = Math.PI / 2; root.add(p); }
  return finalize(root);
}

function packBox() { // 600 × 400 × 300 mm packing carton for 8 coolers (dividers inside), taped, labelled
  const m = materials(), root = G('Pack_Box_600x400'), c = std('carton_brown', 0xc49a63, 0, 0.9), tape = std('carton_tape', 0xd9c39a, 0, 0.6);
  box(root, c, 0.6, 0.3, 0.4, 0, 0.15, 0); box(root, tape, 0.6, 0.004, 0.06, 0, 0.301, 0); box(root, m.sheet, 0.12, 0.08, 0.002, 0.18, 0.18, 0.201);
  return finalize(root);
}

// ---------------------------------------------------------------- 14. EGR cooler core line (real process; along +X, 17.5 × 4.4 m): picker at the AS/RS pick station (x −1.3)
// → servo press (plate forming, x 1.2) → core stacking by an operator into a clamping jig (x 2.8) → Ni paste dispensing (x 4.6: the
// automatic cell, or an operator with a handheld dispenser when o.manual) → loader gantry onto the brazing tray (x 7.4) → vacuum brazing
// furnace (batch of 4 cores, two trays alternating, x 8.6 … 11.6) → unloader (x 12.6) → post-braze vision + NG (x 14.4 / 14.9) → outfeed
// into the tote on the AMR waiting at x 16.95. One kit every 32 s on the AS/RS clock; one furnace batch every 128 s; clip 256 s
// (the two trays). Every core is one object from the AS/RS tote to the AMR: blank stack → formed plates → stacked core in its jig →
// paste on the seams → brazed core (jig off at the unloader). Core 6 of 8 fails the post-braze check.
const CORE_T = 256, CORE_FIRST = 126; // furnace loads at 126 + 128 n
function egrCoreLine(o = {}) {
  // P: seconds between kits (32 on the AS/RS clock; 64 = every other tote visit); DT: dispensing time at the stop (auto 12 s, manual 40 s)
  const P = o.pitch || 32, DT = o.manual ? 40 : 22, TT = 8 * P, A0 = 60 + (DT - 12), F0 = A0 + 2 + 2 * P;
  const m = materials(), root = G(o.manual ? 'EGR_Core_Line_Manual' : 'EGR_Core_Line_Auto'), BT = 0.855, BW = 0.5; let robotRef = null;
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45), glow = std('furnace_glow', 0xff7a1a, 0.0, 0.6, { emissive: 0xff5a00, emissiveIntensity: 2.4 });
  // part looks (origin at the part's bottom centre)
  const blank = n => { box(n, m.stainless, 0.18, 0.03, 0.09, 0, 0.015, 0); for (let k = 1; k < 6; k++) box(n, m.steel, 0.182, 0.001, 0.092, 0, k * 0.005, 0); };
  const formed = n => { box(n, m.stainless, 0.18, 0.05, 0.09, 0, 0.025, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, m.steel, 0.004, 0.052, 0.092, x, 0.025, 0); };
  const core = (n, mt) => { box(n, mt, 0.18, 0.07, 0.09, 0, 0.035, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, mt === brazed ? brazed : m.steel, 0.004, 0.074, 0.094, x, 0.035, 0); for (const sx of [-1, 1]) box(n, mt, 0.02, 0.06, 0.07, sx * 0.1, 0.035, 0); };
  const clamps = n => { for (const sx of [-1, 1]) { box(n, clampM, 0.02, 0.09, 0.11, sx * 0.06, 0.04, 0); box(n, m.yellow, 0.022, 0.012, 0.112, sx * 0.06, 0.08, 0); } box(n, clampM, 0.24, 0.012, 0.12, 0, 0.004, 0); };
  const LINES6 = [-0.08, -0.065, -0.05, 0.05, 0.065, 0.08]; // paste lines: 2 rows (tube-end joints at both headers) × 3, across the core (Z)
  const pasteLines = (n, pre) => LINES6.forEach((x, i) => box(pre ? G(pre + (i + 1), n) : n, m.paste, 0.005, 0.004, 0.08, x, 0.072, 0));
  const belt = (x0, x1, z = 0, legs = true) => { const L = x1 - x0, c = (x0 + x1) / 2;
    for (const sz of [-1, 1]) box(root, m.alu, L, 0.1, 0.035, c, BT - 0.055, z + sz * (BW / 2 + 0.03));
    box(root, m.belt, L - 0.02, 0.01, BW, c, BT - 0.005, z);
    if (legs) for (let k = 0, n = Math.max(1, Math.ceil(L / 1.4)); k <= n; k++) { const x = x0 + 0.08 + (L - 0.16) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (BW / 2 + 0.03)], [x, BT - 0.11, z + sz * (BW / 2 + 0.03)], 0.04); foot(root, x, z + sz * (BW / 2 + 0.03)); } }
  };
  const rollers = (x0, x1, z, along = true) => { const L = along ? x1 - x0 : 0; const n = Math.round((along ? L : Math.abs(x1 - x0)) / 0.15);
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; if (along) cyl(root, m.steel, 0.025, 0.56, x0 + L * u, BT - 0.025, z, 'z', 10); else cyl(root, m.steel, 0.025, 0.56, z, BT - 0.025, x0 + (x1 - x0) * u, 'x', 10); }
  };
  const worker = (name, x, z, faceY) => { // standing operator, 1.75 m: node name + '_Turn' (ry), + '_Arm_L/R' (rx); returns the right arm
    const op = G(name, root, x, 0, z); op.rotation.y = faceY; const turn = G(name + '_Turn', op);
    for (const sx of [-0.1, 0.1]) { box(turn, m.frameDark, 0.13, 0.82, 0.15, sx, 0.41, 0); box(turn, m.black, 0.12, 0.07, 0.26, sx, 0.035, 0.05); }
    box(turn, m.frameDark, 0.36, 0.56, 0.22, 0, 1.12, 0); box(turn, m.yellow, 0.372, 0.3, 0.232, 0, 1.2, 0);
    cyl(turn, m.light, 0.095, 0.22, 0, 1.55, 0, 'y', 16); cyl(turn, m.sheet, 0.115, 0.08, 0, 1.67, 0, 'y', 16);
    const arms = {}; for (const [n, sx] of [['_Arm_L', -0.22], ['_Arm_R', 0.22]]) { const a = G(name + n, turn, sx, 1.36, 0); a.rotation.x = -0.15; box(a, m.frameDark, 0.09, 0.36, 0.09, 0, -0.18, 0); box(a, m.light, 0.075, 0.36, 0.075, 0, -0.54, 0); arms[n] = a; }
    return arms;
  };
  // 1. picker over the AS/RS pick station (x −1.3) and the line start (x 0)
  for (const sz of [-1, 1]) prof(root, [0.55, 0.06, sz * 0.32], [0.55, 2.15, sz * 0.32], 0.06, m.frameDark);
  box(root, m.yellow, 0.1, 0.1, 0.74, 0.55, 2.2, 0); box(root, m.yellow, 2.3, 0.12, 0.12, -0.55, 2.2, 0); box(root, m.black, 2.2, 0.03, 0.13, -0.55, 2.27, 0);
  const px = G('Picker_X', root), py = G('Picker_Y', px); box(px, m.aluDark, 0.22, 0.2, 0.2, 0, 2.2, 0); box(px, m.black, 0.1, 0.1, 0.1, 0, 2.36, 0);
  box(py, m.alu, 0.05, 0.6, 0.05, 0, 2.05, 0); box(py, m.aluDark, 0.16, 0.02, 0.12, 0, 1.755, 0);
  blank(G('Picker_Part', py, 0, 1.744 - 0.03, 0));
  belt(-0.15, 3.3);
  // 2. process inspection (x 1.2): the operator checks the incoming plate kit at the stop under a lamp, a gauge and the reject bin at hand
  for (const sz of [-1, 1]) prof(root, [1.2 + 0.0, BT + 0.05, sz * 0.32], [1.2, BT + 0.75, sz * 0.32], 0.035); box(root, m.aluDark, 0.08, 0.04, 0.7, 1.2, BT + 0.77, 0); box(root, m.light, 0.06, 0.012, 0.5, 1.2, BT + 0.745, 0); // inspection lamp
  box(root, m.aluDark, 0.5, 0.03, 0.4, 0.55, 0.9, 1.0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [0.55 + sx * 0.22, 0.06, 1.0 + sz * 0.17], [0.55 + sx * 0.22, 0.885, 1.0 + sz * 0.17], 0.04);
  box(root, m.steel, 0.16, 0.03, 0.08, 0.5, 0.93, 1.0); box(root, m.red, 0.3, 0.2, 0.2, 0.55, 0.1, 1.0); // gauge, reject bin
  worker('Op_Insp', 1.2, 0.75, Math.PI);
  // 3. core stacking table + operator (x 2.8, south side): plate bins and the clamping jigs at hand
  // table beside the operator (x 1.95): plate bins and the clamping jigs at hand; the operator stands at the belt (x 2.85, z 0.75)
  box(root, m.aluDark, 0.9, 0.03, 0.5, 1.95, 0.9, 1.0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [1.95 + sx * 0.42, 0.06, 1.0 + sz * 0.22], [1.95 + sx * 0.42, 0.885, 1.0 + sz * 0.22], 0.04);
  for (let k = 0; k < 3; k++) { box(root, m.orange, 0.2, 0.1, 0.16, 1.7 + k * 0.25, 0.965, 1.12); box(root, m.stainless, 0.18, 0.03, 0.12, 1.7 + k * 0.25, 1.0, 1.12); } // formed-plate bins
  for (let k = 0; k < 3; k++) box(root, clampM, 0.24, 0.02, 0.12, 2.2, 0.925 + k * 0.022, 0.86);                                        // clamping jigs
  const st = worker('Op_Stack', 2.85, 0.75, Math.PI);
  prof(root, [1.55, 0.92, 1.2], [1.55, 1.62, 1.2], 0.04); const wi = G('Stack_Monitor', root, 1.75, 1.62, 1.2); wi.rotation.y = -0.6; box(wi, m.black, 0.42, 0.28, 0.04, 0, 0, 0); box(wi, m.screen, 0.37, 0.23, 0.004, 0, 0, 0.022); // work instructions, turned to the operator
  // 4. Ni paste dispensing (x 4.6, the belt stops there)
  if (!o.manual) { belt(3.3, 4.1); belt(5.1, 6.55); } else { belt(3.3, 5.9, 0, false); belt(5.9, 6.55); }
  if (!o.manual) {
    // ONE STATION automatic dispensing cell (x 3.9 … 5.4): a 6-axis robot on a pedestal clamps the core off the entry block, carries it under
    // the fixed single-nozzle dispenser (progressive cavity pump) and traces the six lines, holds it under the vision camera, then sets it
    // on the exit block (OK) or in the NG storage box. Paste drum with agitator on a scale, low-level alarm lamp, rework inlet, HMI.
    const dc = G('Auto_Dispense', root), RB = [4.6, 0.95, -0.2], NOZ = [4.6, 1.125, 0.32], CAM = [5.0, 1.62, 0.25], NGB = [4.1, 0.62, 0.55];
    box(dc, m.black, 0.36, RB[1] - 0.02, 0.36, RB[0], (RB[1] - 0.02) / 2 + 0.02, RB[2]); box(dc, m.yellow, 0.37, 0.04, 0.37, RB[0], RB[1] - 0.04, RB[2]); box(dc, m.aluDark, 0.42, 0.02, 0.42, RB[0], 0.01, RB[2]);
    // fixed dispenser: column, arm, valve body, syringe-style barrel, nozzle pointing down
    prof(dc, [NOZ[0] + 0.45, 0.06, NOZ[2]], [NOZ[0] + 0.45, NOZ[1] + 0.45, NOZ[2]], 0.06, m.frameDark); box(dc, m.aluDark, 0.5, 0.08, 0.08, NOZ[0] + 0.22, NOZ[1] + 0.42, NOZ[2]);
    box(dc, m.yellow, 0.12, 0.2, 0.12, NOZ[0], NOZ[1] + 0.32, NOZ[2]); cyl(dc, m.black, 0.035, 0.12, NOZ[0], NOZ[1] + 0.16, NOZ[2], 'y', 16); cyl(dc, m.steel, 0.005, 0.08, NOZ[0], NOZ[1] + 0.06, NOZ[2], 'y', 8); cyl(dc, m.stainless, 0.0015, 0.02, NOZ[0], NOZ[1] + 0.012, NOZ[2], 'y', 6);
    cyl(dc, m.black, 0.012, 0.9, NOZ[0] + 0.45, NOZ[1] + 0.2, NOZ[2] + 0.35, 'z', 8); // paste hose from the pump
    // vision camera with ring light on a bracket
    prof(dc, [CAM[0] + 0.4, 0.06, CAM[2]], [CAM[0] + 0.4, CAM[1] + 0.12, CAM[2]], 0.045, m.frameDark); box(dc, m.aluDark, 0.44, 0.05, 0.05, CAM[0] + 0.2, CAM[1] + 0.12, CAM[2]);
    box(dc, m.black, 0.08, 0.12, 0.08, CAM[0], CAM[1] + 0.04, CAM[2]); const vf = G('Disp_Vision_Flash', dc); cyl(vf, m.light, 0.07, 0.01, CAM[0], CAM[1] - 0.03, CAM[2], 'y', 24);
    // NG storage box and rework inlet (the operator puts a rejected core back here to be dispensed again)
    const ngb = G('Disp_NG_Box', dc, NGB[0], 0.26, NGB[2]);   // on a stand: its floor at 0.79 m box(ngb, m.red, 0.5, 0.02, 0.4, 0, 0.52, 0); for (const s of [-1, 1]) { box(ngb, m.red, 0.5, 0.2, 0.012, 0, 0.62, s * 0.2); box(ngb, m.red, 0.012, 0.2, 0.4, s * 0.25, 0.62, 0); }
    for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) prof(ngb, [x, -0.26, z], [x, 0.51, z], 0.03, m.frameDark); box(ngb, m.ngLabel, 0.3, 0.1, 0.004, 0, 0.66, 0.207);
    box(dc, m.aluDark, 0.4, 0.03, 0.35, 3.45, 0.88, 0.75); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(dc, [3.45 + sx * 0.17, 0.06, 0.75 + sz * 0.14], [3.45 + sx * 0.17, 0.865, 0.75 + sz * 0.14], 0.035); box(dc, m.yellow, 0.4, 0.04, 0.02, 3.45, 0.92, 0.58); // rework inlet
    // paste drum with agitator on a scale, low-level alarm lamp
    box(dc, m.black, 0.6, 0.06, 0.6, 5.55, 0.03, 0.95); box(dc, m.screen, 0.16, 0.06, 0.004, 5.55, 0.04, 1.252); cyl(dc, m.sheet, 0.22, 0.5, 5.55, 0.31, 0.95, 'y', 28); cyl(dc, m.paste, 0.2, 0.02, 5.55, 0.56, 0.95, 'y', 28);
    box(dc, m.aluDark, 0.08, 0.5, 0.08, 5.82, 0.8, 0.95); box(dc, m.aluDark, 0.34, 0.06, 0.06, 5.68, 1.02, 0.95); cyl(dc, m.black, 0.07, 0.2, 5.55, 1.0, 0.95, 'y', 16); const ag = G('Agitator', dc, 5.55, 0, 0.95); cyl(ag, m.steel, 0.012, 0.45, 0, 0.7, 0, 'y', 8); box(ag, m.steel, 0.2, 0.02, 0.03, 0, 0.5, 0);
    prof(dc, [5.9, 0.06, 1.2], [5.9, 1.6, 1.2], 0.04); cyl(dc, m.black, 0.04, 0.05, 5.9, 1.63, 1.2, 'y', 14); const al = G('Paste_Alarm', dc); cyl(al, m.red, 0.04, 0.1, 5.9, 1.71, 1.2, 'y', 14);
    // guard: fence panels on the north side and the ends, light curtains at the entry and exit blocks
    for (const [x0, z0, x1, z1] of [[3.85, -1.45, 5.45, -1.45], [3.85, -1.45, 3.85, -0.35], [5.45, -1.45, 5.45, -0.35]]) { const L = Math.hypot(x1 - x0, z1 - z0); box(dc, m.black, Math.abs(x1 - x0) || 0.04, 1.8, Math.abs(z1 - z0) || 0.04, (x0 + x1) / 2, 0.95, (z0 + z1) / 2); void L; }
    for (const x of [4.12, 5.08]) for (const sz of [-1, 1]) { box(dc, m.yellow, 0.04, 1.4, 0.04, x, 0.75, sz * 0.36); box(dc, m.black, 0.02, 1.3, 0.02, x, 0.75, sz * 0.33); }
    cyl(dc, m.black, 0.012, 0.25, 5.4, 1.95, -1.4, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.yellow], [2, m.red]]) cyl(dc, mt, 0.03, 0.06, 5.4, 2.1 + k * 0.065, -1.4, 'y', 14);
    prof(dc, [3.85, 0.06, 0.62], [3.85, 1.4, 0.62], 0.045); const hm = G('Disp_HMI', dc, 3.85, 1.55, 0.62); hm.rotation.y = Math.PI / 4; box(hm, m.black, 0.42, 0.32, 0.05, 0, 0, 0); box(hm, m.screen, 0.36, 0.26, 0.004, 0, 0, 0.027);
    box(hm, m.yellow, 0.1, 0.04, 0.02, 0.12, -0.21, 0.02); // REWORK mode key on the HMI
    worker('Op_Cell', 3.95, 1.3, Math.PI);   // one operator: loads / collects, takes NG cores to the rework inlet
    // the robot (FR5 class, coloured as delivered; no brand marks), clamp tool with two jaws across the core
    const fr = globalThis.FR5 ? globalThis.FR5.clone(true) : null;
    if (fr) { fr.name = 'Disp_Robot'; fr.position.set(...RB); dc.add(fr);
      const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = 'Disp_' + j.name; });
      const tool = G('Disp_Clamp', J[5], 0, 0, 0.101); { const mt = m.aluDark; const bx = new THREE.BoxGeometry(0.08, 0.1, 0.06); bx.translate(0, 0, 0.03); bin(tool, mt, bx); const br = new THREE.BoxGeometry(0.06, 0.13, 0.02); br.translate(0, 0, 0.07); bin(tool, m.yellow, br);
        for (const s of [-1, 1]) { const jw = new THREE.BoxGeometry(0.03, 0.012, 0.09); jw.translate(0, s * 0.052, 0.12); bin(tool, m.black, jw); } }
      const gp = G('Disp_Grip_Part', tool, 0, 0, 0.13 + 0.035); gp.rotation.x = -Math.PI / 2; // hangs under the jaws (tool +Z is world down), its X along world X
      { const c = G('Disp_Grip_Core', gp, 0, -0.035, 0); core(c, m.stainless); clamps(c); pasteLines(c, 'Disp_Grip_Paste_'); }
      robotRef = { fr, J, tool };   // kept out of userData (it would be written into the glTF extras)
      const ngc = G('Disp_NG_Core', dc, NGB[0], 0.79, NGB[2]); core(ngc, m.stainless); clamps(ngc); pasteLines(ngc);
    }
  } else { // operator at a stop with a handheld dispenser: controller + paste syringe on a side table, foot switch
    box(root, m.aluDark, 0.6, 0.03, 0.45, 4.0, 0.9, 0.95); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [4.0 + sx * 0.27, 0.06, 0.95 + sz * 0.19], [4.0 + sx * 0.27, 0.885, 0.95 + sz * 0.19], 0.04);
    box(root, m.sheet, 0.26, 0.12, 0.24, 4.0, 0.975, 0.95); box(root, m.screen, 0.12, 0.05, 0.002, 4.0, 1.0, 1.071); box(root, m.black, 0.22, 0.05, 0.28, 4.6, 0.025, 0.95);
    const dw = worker('Op_Disp', 4.6, 0.72, Math.PI); const syr = G('Op_Disp_Syringe', dw._Arm_R, 0, -0.74, 0.02); cyl(syr, m.syringe, 0.012, 0.14, 0, 0, 0, 'y', 10); cyl(syr, m.steel, 0.002, 0.04, 0, -0.08, 0, 'y', 6);
    cyl(root, m.black, 0.006, 1.2, 4.3, 0.5, 0.95, 'x', 6);
  }
  box(root, m.yellow, 0.03, 0.06, BW, 6.56, BT + 0.03, 0);                                      // end stop at the loader pick point
  // 5. loader gantry (x 6.4 → tray slots), brazing trays (two), vacuum brazing furnace (x 8.6 … 11.6), unloader (x 12.6 → 13.6)
  const gantry = (name, x0, x1) => { for (const sx of [x0 - 0.2, x1 + 0.2]) for (const sz of [-1, 1]) prof(root, [sx, 0.06, sz * 0.42], [sx, 2.15, sz * 0.42], 0.06, m.frameDark);
    for (const sz of [-1, 1]) box(root, m.yellow, x1 - x0 + 0.5, 0.1, 0.1, (x0 + x1) / 2, 2.2, sz * 0.42); box(root, m.yellow, 0.1, 0.1, 0.94, x0 - 0.2, 2.2, 0); box(root, m.yellow, 0.1, 0.1, 0.94, x1 + 0.2, 2.2, 0);
    const gx = G(name + '_X', root, x0, 0, 0), gy = G(name + '_Y', gx); box(gx, m.aluDark, 0.2, 0.18, 0.94, 0, 2.2, 0); box(gy, m.alu, 0.05, 0.6, 0.05, 0, 2.0, 0); box(gy, m.aluDark, 0.22, 0.03, 0.14, 0, 1.72, 0);
    for (const sx of [-1, 1]) box(gy, m.black, 0.012, 0.09, 0.12, sx * 0.105, 1.66, 0); return gy; };
  const ly = gantry('Loader', 6.4, 8.0), ul = gantry('Unloader', 12.6 - 0.525, 13.6);
  { const lp = G('Loader_Part', ly, 0, 1.6, 0); core(lp, m.stainless); clamps(lp); pasteLines(lp); const up = G('Unloader_Part', ul, 0, 1.6, 0); core(up, brazed); clamps(up); }
  // roller sections, end to end: loader table (belt end 6.55 → front door 8.45), unload table (rear door 11.75 → inspection belt 13.4),
  // return line (z 1.25) and the cross transfers between them, each in its frame on legs
  rollers(6.56, 8.45, 0); rollers(11.75, 13.39, 0); rollers(7.0, 13.0, 1.25); rollers(0.3, 0.95, 7.375, false); rollers(0.3, 0.95, 12.6, false);
  for (const [x0, x1, z] of [[6.56, 8.45, 0], [11.75, 13.39, 0], [7.0, 13.0, 1.25]]) for (const sz of [-1, 1]) box(root, m.alu, x1 - x0, 0.1, 0.035, (x0 + x1) / 2, BT - 0.06, z + sz * 0.3);
  for (const x of [7.375, 12.6]) for (const sx of [-1, 1]) box(root, m.alu, 0.035, 0.1, 0.65, x + sx * 0.3, BT - 0.06, 0.625);
  for (const [x, z] of [[6.7, 0], [8.3, 0], [11.9, 0], [13.25, 0], [7.1, 1.25], [9.0, 1.25], [11.0, 1.25], [12.9, 1.25]]) for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * 0.3], [x, BT - 0.11, z + sz * 0.3], 0.04); foot(root, x, z + sz * 0.3); }
  const trays = [0, 1].map(i => { const tx = G('Tray_' + i + '_X', root, 7.375, BT, 0), tz = G('Tray_' + i + '_Z', tx), t = G('Tray_' + i, tz);
    box(t, m.steel, 1.4, 0.03, 0.5, 0, 0.015, 0); for (const sx of [-0.7, 0.7]) box(t, m.steel, 0.03, 0.06, 0.5, sx, 0.03, 0); for (let s = 0; s < 4; s++) box(t, clampM, 0.26, 0.012, 0.14, -0.525 + 0.35 * s, 0.036, 0); return t; });
  void trays;
  const fu = G('Vacuum_Furnace', root), FX = 10.1, FY = 1.15, FR = 0.85;
  { const shell = std('furnace_shell', 0xd0d4d8, 0.4, 0.45, { side: THREE.DoubleSide }), g = new THREE.CylinderGeometry(FR, FR, 3.0, 48, 1, true); g.rotateZ(Math.PI / 2); bin(fu, shell, xf(g, FX, FY, 0)); }
  for (const x of [8.75, 9.5, 10.1, 10.7, 11.45]) { const g = new THREE.TorusGeometry(FR + 0.02, 0.035, 8, 48); g.rotateY(Math.PI / 2); bin(fu, m.steel, xf(g, x, FY, 0)); }
  for (const x of [9.0, 11.2]) { box(fu, m.black, 0.25, 0.32, 1.4, x, 0.16, 0); box(fu, m.black, 0.25, 0.08, 1.6, x, 0.36, 0); }
  box(fu, m.steel, 1.3, 0.04, 0.4, FX, BT - 0.03, 0); for (const x of [8.9, 11.3]) box(fu, m.steel, 0.25, 0.04, 0.5, x, BT - 0.03, 0); // inner hearth rails
  for (const sx of [8.5, 11.7]) { box(fu, m.aluDark, 0.2, 0.15, 3.75, sx, 2.15, -1.025); for (const sz of [-2.9, 0.85]) box(fu, m.aluDark, 0.12, 2.1, 0.12, sx, 1.05, sz); } // door rails + posts (doors slide to −Z)
  const door = (name, x) => { const d = G(name, fu); const g = new THREE.CylinderGeometry(FR + 0.08, FR + 0.08, 0.14, 48); g.rotateZ(Math.PI / 2); bin(d, m.sheet, xf(g, x, FY, 0)); const r = new THREE.TorusGeometry(FR - 0.15, 0.04, 8, 40); r.rotateY(Math.PI / 2); bin(d, m.steel, xf(r, x + (x < FX ? -0.08 : 0.08), FY, 0)); box(d, m.black, 0.2, 0.25, 0.2, x, FY + FR + 0.12, 0); };
  door('Door_F', 8.52); door('Door_R', 11.68);
  for (const x of [9.4, 10.1, 10.8]) { const g = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20); g.rotateX(Math.PI / 2); bin(fu, m.black, xf(g, x, FY + 0.3, FR - 0.02)); const gl = G('Furnace_Glow_' + x.toFixed(1).replace('.', '_'), fu); const h = new THREE.CircleGeometry(0.07, 20); bin(gl, glow, xf(h, x, FY + 0.3, FR + 0.015)); }
  box(fu, m.sheet, 1.6, 1.1, 0.8, 9.6, 0.55, -1.75); box(fu, m.black, 1.62, 0.06, 0.82, 9.6, 1.12, -1.75); cyl(fu, m.steel, 0.12, 1.1, 9.3, 1.55, -1.3, 'z', 16); cyl(fu, m.steel, 0.2, 0.5, 10.3, 1.4, -1.75, 'y', 20); // vacuum pump skid + manifold
  box(fu, m.sheet, 0.7, 2.0, 0.5, 12.7, 1.0, -1.6); box(fu, m.screen, 0.4, 0.3, 0.005, 12.7, 1.5, -1.347); for (const [k, mt] of [[0, m.lampR], [1, m.lampA], [2, m.lampG]]) cyl(fu, mt, 0.03, 0.06, 12.95, 2.1 + k * 0.065, -1.6, 'y', 14);
  // 6. post-braze inspection belt: vision gate (x 14.4), NG pusher + bin (x 14.9), outfeed end (x 16.55) over the AMR tote
  belt(13.4, 16.6);
  for (const sz of [-1, 1]) prof(root, [14.4, 0.06, sz * 0.42], [14.4, 1.75, sz * 0.42], 0.05, m.frameDark);
  box(root, m.frameDark, 0.08, 0.08, 0.92, 14.4, 1.75, 0); box(root, m.black, 0.1, 0.14, 0.1, 14.4, 1.62, 0); cyl(root, m.light, 0.07, 0.012, 14.4, 1.53, 0, 'y', 24);
  const flash = G('Vision_Flash', root); cyl(flash, m.light, 0.12, 0.004, 14.4, 0.9, 0, 'y', 24);
  const ngp = G('NG_Pusher', root); box(ngp, m.aluDark, 0.2, 0.08, 0.02, 14.9, BT + 0.045, BW / 2 - 0.02); cyl(ngp, m.steel, 0.01, 0.35, 14.9, BT + 0.045, BW / 2 + 0.16, 'z', 8);
  cyl(root, m.alu, 0.03, 0.3, 14.9, BT + 0.045, BW / 2 + 0.47, 'z', 16);
  const ngb = G('NG_Bin', root, 14.9, 0, -0.62); box(ngb, m.red, 0.5, 0.02, 0.4, 0, 0.32, 0); for (const s of [-1, 1]) { box(ngb, m.red, 0.5, 0.3, 0.012, 0, 0.47, s * 0.2); box(ngb, m.red, 0.012, 0.3, 0.4, s * 0.25, 0.47, 0); }
  for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) prof(ngb, [x, 0, z], [x, 0.31, z], 0.03, m.frameDark);
  box(ngb, m.ngLabel, 0.3, 0.12, 0.004, 0, 0.52, -0.207);

  const oo = worker('Op_Out', 16.3, 0.78, Math.PI); { const hp = G('Op_Out_Part', oo._Arm_R, -0.06, -0.78, 0.05); core(hp, brazed); } // outfeed operator: belt end → AMR tote
  // ---- the dispensing robot's cycle (numeric IK, damped least squares on six joints; tool axis down, tool X along world X), solved once
  // for an OK core and once for an NG core, as joint keys relative to the core's arrival at the entry block
  const robotCycle = (() => {
    if (!robotRef) return null; const R = { robot: robotRef };
    const { J } = R.robot, AXS = J.map(j => j.userData.anim.axis), rest = J.map((j, i) => j.rotation[AXS[i]]), TIPL = new THREE.Vector3(0, 0, 0.101 + 0.165), X = new THREE.Vector3(1, 0, 0);
    const setQ = v => { v.forEach((q, i) => { J[i].rotation.set(0, 0, 0); J[i].rotation[AXS[i]] = q; }); root.updateMatrixWorld(true); };
    const err = tg => { const mw = J[5].matrixWorld, tip = TIPL.clone().applyMatrix4(mw), z = new THREE.Vector3(0, 0, 1).transformDirection(mw), x = new THREE.Vector3(1, 0, 0).transformDirection(mw);
      const dz = new THREE.Vector3(0, -1, 0).sub(z), cx = new THREE.Vector3().crossVectors(x, X); return [...tg.clone().sub(tip).toArray(), dz.x * 0.5, dz.y * 0.5, dz.z * 0.5, cx.y * 0.3]; };
    const solve = (A, bb) => { const n = bb.length, M = A.map((r, i) => [...r, bb[i]]); for (let i = 0; i < n; i++) { let pv = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[pv][i])) pv = k; [M[i], M[pv]] = [M[pv], M[i]];
        for (let k = i + 1; k < n; k++) { const fc = M[k][i] / M[i][i]; for (let jj = i; jj <= n; jj++) M[k][jj] -= fc * M[i][jj]; } } const xx = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let sm = M[i][n]; for (let jj = i + 1; jj < n; jj++) sm -= M[i][jj] * xx[jj]; xx[i] = sm / M[i][i]; } return xx; };
    const ik = (tg, seed) => { let v = seed.slice(); for (let it = 0; it < 300; it++) { setQ(v); const e = err(tg); if (Math.hypot(...e) < 1e-5) break; const Jm = []; for (let k = 0; k < 6; k++) { const w = v.slice(); w[k] += 1e-4; setQ(w); const e2 = err(tg); Jm.push(e.map((x, i) => (x - e2[i]) / 1e-4)); }
        const mm = e.length, A = Array.from({ length: mm }, (_, i) => Array.from({ length: mm }, (_, jj) => Jm.reduce((sm, c) => sm + c[i] * c[jj], 0) + (i === jj ? 1e-4 : 0))); const y = solve(A, e); v = v.map((q, k) => q + Jm[k].reduce((sm, c, i) => sm + c * y[i], 0) * 0.8); }
      setQ(v); return { v, e: Math.hypot(...err(tg).slice(0, 3)) }; };
    const RBp = R.robot.fr.position, NOZ = [4.6, 1.125, 0.32], CAM = [5.0, 1.62, 0.25], NGB = [4.1, 0.62, 0.55], V = (x, y, z) => new THREE.Vector3(x, y, z);
    const run = ng => { let seed = [0, -90, 90, -90, -90, 0].map(d => d * Math.PI / 180), t = 0, last = null, worst = 0, where = ''; const wp = [], ev = {};
      const go = (pos, dt, name) => { const steps = last ? Math.max(1, Math.ceil(last.distanceTo(pos) / 0.02)) : 1;
        for (let k = 1; k <= steps; k++) { const pp = last ? last.clone().lerp(pos, k / steps) : pos.clone(); const r = ik(pp, seed); seed = r.v; worst = Math.max(worst, r.e); t += dt / steps; wp.push([t, r.v.slice()]); }
        if (name) ev[name] = t; last = pos.clone(); };
      const CY = 0.035, TY = NOZ[1] - 0.002 - 2 * CY + CY; // tip (core centre) height when the core top is 2 mm under the nozzle
      go(V(4.6, 1.25, -0.05), 0); go(V(3.95, BT + CY + 0.12, 0), 1.4); go(V(3.95, BT + CY, 0), 0.6); go(V(3.95, BT + CY, 0), 0.3, 'grip'); go(V(3.95, BT + CY + 0.12, 0), 0.5);
      LINES6.forEach((lx, i) => { const x = NOZ[0] - lx; go(V(x, TY - 0.03, NOZ[2] + 0.04), i ? 0.35 : 1.6); go(V(x, TY, NOZ[2] + 0.04), 0.25); go(V(x, TY, NOZ[2] - 0.04), 1.0, 'line' + (i + 1)); go(V(x, TY - 0.03, NOZ[2] - 0.04), 0.2); });
      go(V(CAM[0], TY, CAM[2]), 1.0); go(V(CAM[0], TY, CAM[2]), 1.0, 'vision');
      if (!ng) { go(V(5.25, BT + CY + 0.12, 0), 1.3); go(V(5.25, BT + CY + 0.003, 0), 0.5); go(V(5.25, BT + CY + 0.003, 0), 0.3, 'release'); go(V(5.25, BT + CY + 0.12, 0), 0.4); }
      else { go(V(NGB[0], 0.79 + CY + 0.15, NGB[2]), 1.6); go(V(NGB[0], 0.79 + CY + 0.003, NGB[2]), 0.5); go(V(NGB[0], 0.79 + CY + 0.003, NGB[2]), 0.3, 'release'); go(V(NGB[0], 0.79 + CY + 0.15, NGB[2]), 0.4); }
      go(V(4.6, 1.25, -0.05), 1.1);
      if (worst > 0.005) { setQ([0, -90, 90, -90, -90, 0].map(d => d * Math.PI / 180)); const tp = TIPL.clone().applyMatrix4(J[5].matrixWorld); throw new Error('dispensing robot IK: ' + (worst * 1000).toFixed(1) + ' mm off (' + (ng ? 'NG' : 'OK') + ') home tip ' + tp.toArray().map(v => v.toFixed(2)) + ' base ' + J[0].getWorldPosition(new THREE.Vector3()).toArray().map(v => v.toFixed(2)) + ' first ' + JSON.stringify(wp.slice(0, 2).map(w => w[1].map(v => v.toFixed(2))))); }
      return { wp, ev, T: t, rest }; };
    const r = { ok: run(false), ng: run(true) }; setQ(rest); void RBp; return r; })();
  // ---- keys
  const ease = u => u * u * (3 - 2 * u), ch = {}, add = (node, c, list) => { const key = node + '|' + c; (ch[key] || (ch[key] = [])).push(...list); };
  const ser = (evs, rest) => { evs = evs.slice().sort((a, b) => a[0] - b[0]);
    const f = t => { let k = -1; while (k + 1 < evs.length && evs[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === evs.length - 1) return evs[k][1]; const [t0, v0] = evs[k], [t1, v1] = evs[k + 1]; return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1); };
    return [[0, f(0)], ...evs.filter(e => e[0] > 0 && e[0] < TT), [TT, f(TT)]]; };
  const vis = (evs, v0) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); let s = v0; for (const [t, v] of evs) if (t <= 0) s = v; return [[0, s], ...evs.filter(e => e[0] > 0 && e[0] < TT)]; };
  // trays: furnace cycle n starts at F = 126 + 128 n with tray n mod 2; the tray waits at the loader from F − 116, in the furnace F … F + 102,
  // at the unload table F + 106 … F + 125, back on the return line, at the loader again at F + 140 (= the cycle after next − 116)
  const trayKeys = F => ({ x: [[F - (4 * P - 12), 7.375], [F, 7.375], [F + 4, FX], [F + 102, FX], [F + 106, 12.6], [F + 125, 12.6], [F + 127, 12.6], [F + 136, 7.375]], z: [[F + 125, 0], [F + 127, 1.25], [F + 136, 1.25], [F + 139, 0]] });
  for (let n = -3; n < 4; n++) {
    const F = F0 + 4 * P * n, tk = trayKeys(F), i = ((n % 2) + 2) % 2;
    add('Tray_' + i + '_X', 'x', tk.x.map(([t, v]) => [t, v - 7.375])); add('Tray_' + i + '_Z', 'z', tk.z);
    add('Door_F', 'z', [[F - 1.5, 0], [F - 0.3, -1.9], [F + 4.4, -1.9], [F + 6, 0]]); add('Door_R', 'z', [[F + 100, 0], [F + 101.6, -1.9], [F + 106.4, -1.9], [F + 108, 0]]);
    for (const x of ['9_4', '10_1', '10_8']) add('Furnace_Glow_' + x, 'vis', [[F + 8, true], [F + 96, false]]);
  }
  const NG = 5, slotOff = s => -0.525 + 0.35 * s, DISP = {};
  for (let j = -9; j < 9; j++) {
    const k = ((j % 8) + 8) % 8, PN = 'Core_' + (k + 1), b = P * j + 16, ng = k === NG;
    // picker: top blank stack in the AS/RS tote → belt
    add('Picker_X', 'x', [[b - 2, 0], [b - 1, -1.3], [b + 0.8, -1.3], [b + 2.8, 0]]);
    const KT = P === 64 ? 4 : 8, yb = 1.266 + (KT - 1 - (((j % KT) + KT) % KT)) * 0.032; // the AS/RS tote at the pick station holds 8 kits; pick j takes the top one (see asrsCell)
    add('Picker_Y', 'y', [[b - 1, 0], [b - 0.2, -(1.714 - yb)], [b, -(1.714 - yb)], [b + 0.8, 0], [b + 2.8, 0], [b + 3.6, -(1.714 - BT)], [b + 3.8, -(1.714 - BT)], [b + 4.6, 0]]);
    add('Picker_Part', 'vis', [[b, true], [b + 3.8, false]]);
    add('Op_Insp_Arm_R', 'rx', [[b + 8.0, -0.15], [b + 8.6, -0.85], [b + 9.8, -0.85], [b + 10.4, -0.15]]); add('Op_Insp_Arm_L', 'rx', [[b + 8.2, -0.15], [b + 8.8, -0.7], [b + 9.6, -0.7], [b + 10.2, -0.15]]);
    add('Op_Stack_Arm_L', 'rx', [[b + 12.6, -0.15], [b + 13.4, -0.9], [b + 14.2, -0.5], [b + 15.0, -0.9], [b + 16.2, -0.5], [b + 17.0, -0.9], [b + 18.5, -0.4], [b + 19.4, -0.9], [b + 21.6, -0.9], [b + 22.4, -0.15]]);
    add('Op_Stack_Arm_R', 'rx', [[b + 12.6, -0.15], [b + 13.6, -0.6], [b + 14.4, -0.95], [b + 15.6, -0.6], [b + 16.6, -0.95], [b + 18.0, -0.5], [b + 19.0, -0.95], [b + 21.6, -0.95], [b + 22.4, -0.15]]);
    add('Op_Stack_Turn', 'ry', [[b + 13, 0], [b + 13.8, -0.5], [b + 14.6, 0], [b + 15.6, -0.5], [b + 16.4, 0], [b + 18.6, 0.5], [b + 19.4, 0]]);
    // the core: belt → press → stacking → dispensing → loader pick point
    const xs = [[b + 3.8, 0], [b + 4, 0], [b + 8, 1.2], [b + 10.6, 1.2], [b + 13, 2.8], [b + 22.6, 2.8], [b + 28, 4.6], [b + 29 + DT, 4.6], [b + 30.4 + DT, 6.4]];
    add(PN + '_Blank', 'vis', [[b + 3.8, true], [b + 17, false]]); add(PN + '_Formed', 'vis', [[b + 3.8, false]]);   // the plate kit until the operator has stacked the core
    add(PN + '_Core', 'vis', [[b + 3.8, false], [b + 17, true]]); add(PN + '_Clamp', 'vis', [[b + 3.8, false], [b + 21, true]]);
    const D = b + 29, q = DT / 12; if (o.manual) [1, 2, 3, 4, 5, 6].forEach(s => add(PN + '_Paste_' + s, 'vis', [[b + 3.8, false], [D + 1.85 * s * q, true]]));
    if (!o.manual && robotCycle) {   // the robot takes the core at the entry block (b + 28) and sets it down on the exit block / in the NG box
      const rc = ng ? robotCycle.ng : robotCycle.ok, t0 = b + 28, JN = [1, 2, 3, 4, 5, 6].map(i => 'Disp_Joint_' + i), AX = ['ry', 'rz', 'rz', 'rz', 'ry', 'rz'];
      JN.forEach((n, i) => add(n, AX[i], [[t0 - 0.01, 0], ...rc.wp.map(([t, v]) => [t0 + t, v[i] - rc.rest[i]]), [t0 + rc.T + 0.01, 0]]));
      add('Disp_Grip_Part', 'vis', [[t0 + rc.ev.grip, true], [t0 + rc.ev.release, false]]);
      LINES6.forEach((_, i) => add('Disp_Grip_Paste_' + (i + 1), 'vis', [[t0 + rc.ev.grip - 0.01, false], [t0 + rc.ev['line' + (i + 1)], true]]));
      add('Disp_Vision_Flash', 'vis', [[t0 + rc.ev.vision - 0.6, true], [t0 + rc.ev.vision - 0.3, false]]);
      add('Op_Cell_Turn', 'ry', [[t0 + 2, 0], [t0 + 4, 0.35], [t0 + 9, 0.35], [t0 + 11, 0]]);
      if (ng) { add('Disp_NG_Core', 'vis', [[t0 + rc.ev.release, true], [t0 + rc.ev.release + 60, false]]);   // the operator takes it to the rework inlet a minute later
        add('Op_Cell_Arm_R', 'rx', [[t0 + rc.ev.release + 55, -0.15], [t0 + rc.ev.release + 58, -0.9], [t0 + rc.ev.release + 62, -0.9], [t0 + rc.ev.release + 64, -0.15]]); }
      DISP[k] = { grip: t0 + rc.ev.grip, release: t0 + rc.ev.release };
    } else {
      add('Op_Disp_Arm_R', 'rx', [[D, -0.15], [D + q, -0.95], [D + 3.7 * q, -1.05], [D + 4.5 * q, -0.9], [D + 7.4 * q, -1.05], [D + 8.2 * q, -0.9], [D + 11.1 * q, -1.05], [D + 12 * q, -0.15]]);
      add('Op_Disp_Arm_L', 'rx', [[D, -0.15], [D + q, -0.8], [D + 11.1 * q, -0.8], [D + 12 * q, -0.15]]);
      add('Op_Disp_Turn', 'ry', [[D + q, 0], [D + 3.7 * q, 0.12], [D + 4.5 * q, -0.05], [D + 7.4 * q, 0.08], [D + 8.2 * q, -0.08], [D + 11.1 * q, 0.05], [D + 12 * q, 0]]);
    }
    const AUTO = !o.manual && DISP[k];
    if (AUTO) { xs.splice(xs.findIndex(([t]) => t === b + 28), 3, [b + 27, 3.95], [DISP[k].release, 5.25], [DISP[k].release + 0.3, 5.25], [b + 30.4 + DT, 6.4]);
      LINES6.forEach((_, i) => add(PN + '_Paste_' + (i + 1), 'vis', [[b + 3.8, false], [DISP[k].release, true]])); }
    if (AUTO && ng) { add(PN, 'vis', [[b + 3.8, true], [DISP[k].grip, false]]); add(PN + '_X', 'x', xs.filter(([t]) => t <= DISP[k].grip + 0.01)); add(PN + '_Y', 'y', [[b + 3.8, 0]]); add(PN + '_Z', 'z', [[b + 3.8, 0]]);
      add(PN + '_Clamp2', 'vis', [[b + 3.8, true]]); add(PN + '_Paste', 'vis', [[b + 3.8, true]]); add(PN + '_CoreS', 'vis', [[b + 3.8, true]]); add(PN + '_Brazed', 'vis', [[b + 3.8, false]]); continue; }   // vision NG: it stays in the NG box for rework
    // loader → tray slot; the furnace batch; unloader → inspection belt
    const a = b + 32 + DT, F = F0 + 4 * P * Math.ceil((a - F0 + 1e-6) / (4 * P)), slot = 3 - Math.round((F - 2 - a) / P), tk = trayKeys(F), u = F + 106 + 6 * slot, sx = slotOff(slot);
    add('Loader_X', 'x', [[a - 2.2, 0], [a - 1.4, 0], [a + 0.2, 7.375 + sx - 6.4], [a + 1.2, 7.375 + sx - 6.4], [a + 2.6, 0]]);
    add('Loader_Y', 'y', [[a - 2.2, 0], [a - 1.8, -(1.6 - BT)], [a - 1.6, -(1.6 - BT)], [a - 1.3, 0], [a + 0.2, 0], [a + 0.6, -(1.6 - BT - 0.04)], [a + 0.8, -(1.6 - BT - 0.04)], [a + 1.2, 0]]);
    add('Loader_Part', 'vis', [[a - 1.6, true], [a + 0.8, false]]);
    add('Unloader_X', 'x', [[u - 2.2, 0], [u - 0.8, sx + 0.525], [u, sx + 0.525], [u + 1.2, 13.6 - 12.075], [u + 2, 13.6 - 12.075], [u + 3.2, 0]]);
    add('Unloader_Y', 'y', [[u - 0.6, 0], [u - 0.3, -(1.6 - BT - 0.04)], [u, -(1.6 - BT - 0.04)], [u + 0.4, 0], [u + 1.2, 0], [u + 1.6, -(1.6 - BT)], [u + 1.9, -(1.6 - BT)], [u + 2.4, 0]]);
    add('Unloader_Part', 'vis', [[u, true], [u + 1.9, false]]);
    for (const [t, v] of tk.x) if (t > a + 0.8 && t < u) xs.push([t, v + sx]); xs.push([a - 1.6, 6.4], [a + 0.8, 7.375 + sx], [u, 12.6 + sx], [u + 1.9, 13.6]);
    const ys = [[b + 3.8, 0], [a - 1.6, 0], [a + 0.8, 0.04], [u, 0.04], [u + 1.9, 0]], zs = [[b + 3.8, 0]];
    add(PN + '_Paste', 'vis', [[b + 3.8, true], [F + 50, false]]); add(PN + '_CoreS', 'vis', [[b + 3.8, true], [F + 50, false]]); add(PN + '_Brazed', 'vis', [[b + 3.8, false], [F + 50, true]]);
    add(PN + '_Clamp2', 'vis', [[b + 3.8, true], [u + 1.9, false]]);
    let end;
    add('Vision_Flash', 'vis', [[u + 5.4, true], [u + 5.7, false]]);
    if (ng && o.manual) { xs.push([u + 7.3, 14.9]); zs.push([u + 7.6, 0], [u + 8.4, -0.55]); ys.push([u + 8.4, 0], [u + 9, -0.47]); add('NG_Pusher', 'z', [[u + 7.5, 0], [u + 8.4, -0.48], [u + 9.2, 0]]); end = u + 9.2; }
    else { xs.push([u + 12.8, 16.45]); end = u + 13.2;   // at the belt end the operator lifts it, turns and lays it into the AMR tote (u + 14.6)
      add('Op_Out_Turn', 'ry', [[u + 12.6, 0], [u + 13.4, 0], [u + 14.2, -0.75], [u + 14.8, -0.75], [u + 15.6, 0]]);
      add('Op_Out_Arm_R', 'rx', [[u + 12.4, -0.15], [u + 13.0, -0.9], [u + 13.3, -0.9], [u + 13.8, -0.55], [u + 14.3, -0.9], [u + 14.7, -0.9], [u + 15.4, -0.15]]);
      add('Op_Out_Arm_L', 'rx', [[u + 12.4, -0.15], [u + 13.0, -0.8], [u + 14.7, -0.8], [u + 15.4, -0.15]]);
      add('Op_Out_Part', 'vis', [[u + 13.2, true], [u + 14.6, false]]); }
    add(PN, 'vis', [[b + 3.8, true], ...(AUTO ? [[DISP[k].grip, false], [DISP[k].release, true]] : []), [a - 1.6, false], [a + 0.8, true], [u, false], [u + 1.9, true], [end, false]]);
    add(PN + '_X', 'x', xs); add(PN + '_Y', 'y', ys); add(PN + '_Z', 'z', zs);
  }
  for (let k = 0; k < 8; k++) { // core nodes: X > Y > Z > looks
    const PN = 'Core_' + (k + 1), x = G(PN + '_X', root, 0, BT, 0), y = G(PN + '_Y', x), z = G(PN + '_Z', y), n = G(PN, z);
    blank(G(PN + '_Blank', n)); formed(G(PN + '_Formed', n)); const c = G(PN + '_Core', n); core(G(PN + '_CoreS', c), m.stainless); core(G(PN + '_Brazed', c), brazed);
    const cl = G(PN + '_Clamp', n); clamps(G(PN + '_Clamp2', cl)); pasteLines(G(PN + '_Paste', n), PN + '_Paste_');
  }
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) {
    const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /^(Loader_Part|Unloader_Part|Picker_Part|Op_Out_Part|Vision_Flash|Align_Light|Furnace_Glow|Disp_Grip_Part|Disp_Vision_Flash|Disp_NG_Core|Paste_Alarm)/.test(node) || /^Core_\d$/.test(node) || /_(Formed|Core|Clamp|Paste_\d|Brazed)$/.test(node) || /^Disp_Grip_Paste_/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs, /_Arm_/.test(node) ? -0.15 : 0)]);
  }
  return cycleClip(finalize(root), 'Core_Cycle', TT, keys, 5 * 32 / P); // the slower line samples less often (same file size)
}

// ---------------------------------------------------------------- 12. welding line (south): brazed core → Body TIG (rotating jig, two fixed torches, lifting screen,
// fume hood) → 1st pressure test (chamber with lid, OK / NG lamp) → robot MIG (6-axis robot + positioner, fence; welds both gas flanges)
// → three manual MIG booths (pipes, bracket; curtains) → C/F final inspection → DMC marking → carton on the shipping pallet. One belt
// at z 0 links the robot cell, the booths and the C/F station; everything else is handed on by the operators, who stand on the −Z side.
// 21 coolers per 512 s (the good output of both core lines): part i starts at i · 512 / 21 s, taken out of the tote on the input stand.
const WELD_T = 512;
function opWorker(root, name, x, z, faceY) { // standing operator, 1.75 m: node name + '_Turn' (ry), + '_Arm_L/R' (rx, −0.15 at rest, negative = forward)
  const m = materials(), op = G(name, root, x, 0, z); op.rotation.y = faceY; const turn = G(name + '_Turn', op);
  for (const sx of [-0.1, 0.1]) { box(turn, m.frameDark, 0.13, 0.82, 0.15, sx, 0.41, 0); box(turn, m.black, 0.12, 0.07, 0.26, sx, 0.035, 0.05); }
  box(turn, m.frameDark, 0.36, 0.56, 0.22, 0, 1.12, 0); box(turn, m.yellow, 0.372, 0.3, 0.232, 0, 1.2, 0);
  cyl(turn, m.light, 0.095, 0.22, 0, 1.55, 0, 'y', 16); cyl(turn, m.sheet, 0.115, 0.08, 0, 1.67, 0, 'y', 16);
  const arms = {}; for (const [n, sx] of [['_Arm_L', -0.22], ['_Arm_R', 0.22]]) { const a = G(name + n, turn, sx, 1.36, 0); a.rotation.x = -0.15; box(a, m.frameDark, 0.09, 0.36, 0.09, 0, -0.18, 0); box(a, m.light, 0.075, 0.36, 0.075, 0, -0.54, 0); arms[n] = a; }
  return arms;
}
function ikRig(root, J, TIPL) { // numeric IK (damped least squares, six joints): tool +Z straight down, tool X along world X; trace() walks a Cartesian path
  const AXS = J.map(j => j.userData.anim.axis), rest = J.map((j, i) => j.rotation[AXS[i]]), X = new THREE.Vector3(1, 0, 0);
  const setQ = v => { v.forEach((q, i) => { J[i].rotation.set(0, 0, 0); J[i].rotation[AXS[i]] = q; }); root.updateMatrixWorld(true); };
  const err = tg => { const mw = J[5].matrixWorld, tip = TIPL.clone().applyMatrix4(mw), z = new THREE.Vector3(0, 0, 1).transformDirection(mw), x = new THREE.Vector3(1, 0, 0).transformDirection(mw);
    const dz = new THREE.Vector3(0, -1, 0).sub(z), cx = new THREE.Vector3().crossVectors(x, X); return [...tg.clone().sub(tip).toArray(), dz.x * 0.5, dz.y * 0.5, dz.z * 0.5, cx.y * 0.3]; };
  const solve = (A, bb) => { const n = bb.length, M = A.map((r, i) => [...r, bb[i]]); for (let i = 0; i < n; i++) { let pv = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[pv][i])) pv = k; [M[i], M[pv]] = [M[pv], M[i]];
      for (let k = i + 1; k < n; k++) { const fc = M[k][i] / M[i][i]; for (let jj = i; jj <= n; jj++) M[k][jj] -= fc * M[i][jj]; } } const xx = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let sm = M[i][n]; for (let jj = i + 1; jj < n; jj++) sm -= M[i][jj] * xx[jj]; xx[i] = sm / M[i][i]; } return xx; };
  const ik = (tg, seed) => { let v = seed.slice(); for (let it = 0; it < 300; it++) { setQ(v); const e = err(tg); if (Math.hypot(...e) < 1e-5) break; const Jm = []; for (let k = 0; k < 6; k++) { const w = v.slice(); w[k] += 1e-4; setQ(w); const e2 = err(tg); Jm.push(e.map((x, i) => (x - e2[i]) / 1e-4)); }
      const mm = e.length, A = Array.from({ length: mm }, (_, i) => Array.from({ length: mm }, (_, jj) => Jm.reduce((sm, c) => sm + c[i] * c[jj], 0) + (i === jj ? 1e-4 : 0))); const y = solve(A, e); v = v.map((q, k) => q + Jm[k].reduce((sm, c, i) => sm + c * y[i], 0) * 0.8); }
    setQ(v); return { v, e: Math.hypot(...err(tg).slice(0, 3)) }; };
  const trace = (path, label) => { // path: [[x, y, z], seconds, eventName?]; returns joint waypoints relative to the start and the event times
    let seed = [0, -90, 90, -90, -90, 0].map(d => d * Math.PI / 180), t = 0, last = null, worst = 0, where = ''; const wp = [], ev = {};
    for (const [p, dt, name] of path) { const pos = new THREE.Vector3(...p), steps = last ? Math.max(1, Math.ceil(last.distanceTo(pos) / 0.02)) : 1;
      for (let k = 1; k <= steps; k++) { const pp = last ? last.clone().lerp(pos, k / steps) : pos.clone(); const r = ik(pp, seed); seed = r.v; if (r.e > worst) { worst = r.e; where = pp.toArray().map(v => v.toFixed(3)).join(','); } t += dt / steps; wp.push([t, r.v.slice()]); }
      if (name) ev[name] = t; last = pos; }
    setQ(rest); if (worst > 0.005) throw new Error(label + ' IK: ' + (worst * 1000).toFixed(1) + ' mm off at ' + where);
    return { wp, ev, T: t, rest }; };
  return { trace, rest };
}
function egrWeldLine() {
  const T = WELD_T, N = 21, PW = T / N, m = materials(), root = G('EGR_Weld_Line'), BT = 0.855, BW = 0.4, YC = 0.045;
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), bead = std('weld_bead', 0x6f675d, 0.85, 0.5), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45);
  const curtain = std('weld_curtain', 0xc8461e, 0.0, 0.55, { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const arcM = std('weld_arc', 0xd8f0ff, 0.0, 0.3, { emissive: 0xa8dcff, emissiveIntensity: 4.0 });
  const leg4 = (n, x, z, w, d, top) => { box(n, m.aluDark, w, 0.03, d, x, top - 0.015, z); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { prof(n, [x + sx * (w / 2 - 0.03), 0.06, z + sz * (d / 2 - 0.03)], [x + sx * (w / 2 - 0.03), top - 0.03, z + sz * (d / 2 - 0.03)], 0.04); foot(n, x + sx * (w / 2 - 0.03), z + sz * (d / 2 - 0.03)); } };
  const belt = (x0, x1) => { const L = x1 - x0, c = (x0 + x1) / 2;
    for (const sz of [-1, 1]) box(root, m.alu, L, 0.1, 0.035, c, BT - 0.055, sz * (BW / 2 + 0.03)); box(root, m.belt, L - 0.02, 0.01, BW, c, BT - 0.005, 0);
    for (let k = 0, n = Math.max(1, Math.ceil(L / 1.4)); k <= n; k++) { const x = x0 + 0.08 + (L - 0.16) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, sz * (BW / 2 + 0.03)], [x, BT - 0.11, sz * (BW / 2 + 0.03)], 0.04); foot(root, x, sz * (BW / 2 + 0.03)); } }
    box(root, m.yellow, 0.03, 0.06, BW, x1 - 0.01, BT + 0.03, 0); };
  const hang = (n, x0, z0, x1, z1, y0 = 0.15, y1 = 1.95) => { // welding curtain on a rail, hung from posts at both ends
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    plane(n, curtain, L, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, [0, -a, 0]); box(n, m.aluDark, L, 0.03, 0.03, (x0 + x1) / 2, y1 + 0.02, (z0 + z1) / 2, [0, -a, 0]);
    for (const [x, z] of [[x0, z0], [x1, z1]]) { prof(n, [x, 0.06, z], [x, y1 + 0.04, z], 0.04, m.frameDark); foot(n, x, z); } };
  const lamp = (n, x, z, y0, name) => { prof(n, [x, y0, z], [x, y0 + 0.35, z], 0.03, m.frameDark); cyl(n, m.lampR, 0.03, 0.06, x, y0 + 0.39, z, 'y', 14); const g = G(name, n); cyl(g, m.lampG, 0.032, 0.06, x, y0 + 0.455, z, 'y', 14); cyl(n, m.lampA, 0.03, 0.002, x, y0 + 0.455, z, 'y', 14); };
  // part looks (origin at the bottom centre, body centre at YC): brazed core → body (shell, TIG seams) → + gas flanges (MIG beads) → + coolant pipes, bracket
  const lookCore = n => { box(n, brazed, 0.18, 0.07, 0.09, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, brazed, 0.004, 0.074, 0.094, x, YC, 0); for (const sx of [-1, 1]) box(n, brazed, 0.02, 0.06, 0.07, sx * 0.1, YC, 0); };
  const lookBody = n => { box(n, m.stainless, 0.184, 0.076, 0.096, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, m.steel, 0.004, 0.08, 0.1, x, YC, 0); for (const sx of [-1, 1]) box(n, m.stainless, 0.024, 0.064, 0.074, sx * 0.102, YC, 0); };
  const lookTBead = n => { for (const sx of [-1, 1]) box(n, bead, 0.006, 0.082, 0.102, sx * 0.091, YC, 0); };
  const lookFlange = n => { for (const sx of [-1, 1]) { box(n, m.stainless, 0.01, 0.09, 0.15, sx * 0.135, YC, 0); for (const sy of [-1, 1]) cyl(n, m.aluDark, 0.006, 0.012, sx * 0.135, YC + sy * 0.035, sy * 0.06, 'x', 6); } };
  const lookFBead = (n, sx) => box(n, bead, 0.008, 0.07, 0.08, sx * 0.127, YC, 0);
  const lookPipes = n => { for (const sx of [-1, 1]) { cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 8); cyl(n, m.stainless, 0.011, 0.04, sx * 0.05, 0.128, 0.05, 'z', 8); } box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055); };
  const lookPBead = n => { for (const sx of [-1, 1]) cyl(n, bead, 0.014, 0.006, sx * 0.05, 0.08, 0.03, 'y', 8); for (const sx of [-1, 1]) box(n, bead, 0.006, 0.004, 0.03, sx * 0.06, 0.008, -0.055); };

  // 1. Body TIG cell (x 0): the operator (x 0, z −0.72) takes a brazed core out of the tote on the input stand (x −0.8, z −1.3; a zone of the layout),
  // sets it between the chucks, slides the body shell over it from the shell rack (x −0.75), pulls the screen down; two fixed torches weld both
  // shell seams while the jig turns the part once; the screen goes up and the operator puts the part on the hand-off table (x 0.85)
  const TA = 1.05;   // jig axis height
  leg4(root, 0, 0, 0.9, 0.5, 0.8);
  for (const [x, nm] of [[-0.32, 'Tig_Chuck_L'], [0.32, 'Tig_Chuck_R']]) { box(root, m.black, 0.16, TA - 0.8 + 0.12, 0.26, x + Math.sign(x) * 0.06, 0.8 + (TA - 0.8 + 0.12) / 2, 0); const c = G(nm, root, x, TA, 0); cyl(c, m.steel, 0.06, 0.05, 0, 0, 0, 'x', 20); for (let k = 0; k < 3; k++) { const a = k * 2.094; box(c, clampM, 0.04, 0.02, 0.02, -Math.sign(x) * 0.03, Math.cos(a) * 0.045, Math.sin(a) * 0.045); } }
  prof(root, [0.5, 0.06, 0.35], [0.5, 1.75, 0.35], 0.06, m.frameDark); box(root, m.aluDark, 0.9, 0.08, 0.08, 0.08, 1.75, 0.35); box(root, m.aluDark, 0.06, 0.06, 0.4, 0, 1.73, 0.17);
  for (const [sx, nm] of [[-1, 'Tig_Torch_L'], [1, 'Tig_Torch_R']]) { const tt = G(nm, root, sx * 0.091, 0, 0); box(tt, m.aluDark, 0.05, 0.3, 0.05, 0, 1.55, 0); cyl(tt, m.black, 0.012, 0.18, 0, 1.31, 0, 'y', 10); cyl(tt, m.orange, 0.009, 0.03, 0, 1.205, 0, 'y', 10); cyl(tt, m.steel, 0.0015, 0.02, 0, 1.18, 0, 'y', 6);
    const ar = G(nm.replace('Torch', 'Arc'), tt); bin(ar, arcM, xf(new THREE.SphereGeometry(0.014, 10, 8), 0, 1.165, 0)); }
  box(root, m.sheet, 0.5, 0.6, 0.35, 0.0, 0.3, 0.42); box(root, m.screen, 0.2, 0.12, 0.004, 0.0, 0.5, 0.248); cyl(root, m.black, 0.008, 0.9, 0.2, 0.65, 0.42, 'y', 6); // TIG power source + gas
  cyl(root, m.steel, 0.09, 1.2, -0.38, 0.6, 0.5, 'y', 16);  // argon bottle
  const hood = G('Tig_Hood', root); box(hood, m.sheet, 1.1, 0.06, 0.95, 0, 2.3, 0.05); for (const s of [-1, 1]) { box(hood, m.sheet, 1.1, 0.25, 0.02, 0, 2.18, 0.05 + s * 0.47); box(hood, m.sheet, 0.02, 0.25, 0.95, s * 0.55, 2.18, 0.05); } cyl(hood, m.sheet, 0.13, 1.6, 0, 3.1, 0.05, 'y', 20); // fume hood + duct
  hang(root, -0.55, -0.42, -0.55, 0.62); hang(root, 0.55, -0.42, 0.55, 0.62); hang(root, -0.55, 0.62, 0.55, 0.62);
  { const sc = G('Tig_Screen', root); plane(sc, curtain, 1.06, 0.85, 0, 1.4, -0.44); box(sc, m.aluDark, 1.06, 0.03, 0.03, 0, 1.84, -0.44); box(sc, m.aluDark, 1.06, 0.03, 0.03, 0, 0.97, -0.44); box(sc, m.black, 0.12, 0.03, 0.04, 0, 0.95, -0.46); }  // lifting front screen (rest: down)
  leg4(root, -0.75, -0.15, 0.35, 0.3, 0.88); for (let k = 0; k < 4; k++) { box(root, m.stainless, 0.184, 0.076, 0.096, -0.75, 0.92 + k * 0.08, -0.15); }  // shell rack: body shells
  leg4(root, 0.85, -0.25, 0.4, 0.35, 0.9);  // hand-off table TIG → pressure test
  opWorker(root, 'Op_Tig', 0, -0.72, 0);
  // 2. 1st pressure test (x 1.75): chamber with a lifting lid on a bench, pressure gauge, OK / NG lamp; the operator turns the part into the next belt
  leg4(root, 1.75, 0, 0.7, 0.55, 0.88); box(root, m.aluDark, 0.46, 0.03, 0.36, 1.75, 0.895, 0);
  for (const s of [-1, 1]) { box(root, m.sheet, 0.46, 0.25, 0.02, 1.75, 1.02, s * 0.18); box(root, m.sheet, 0.02, 0.25, 0.36, 1.75 + s * 0.23, 1.02, 0); }
  box(root, clampM, 0.24, 0.02, 0.12, 1.75, 0.92, 0);
  { const ld = G('Test_Lid', root); box(ld, m.yellow, 0.5, 0.03, 0.4, 1.75, 1.16, 0); box(ld, m.black, 0.3, 0.04, 0.06, 1.75, 1.19, 0); } for (const s of [-1, 1]) cyl(root, m.steel, 0.012, 0.55, 1.75 + s * 0.27, 1.2, 0, 'y', 8);
  box(root, m.sheet, 0.3, 0.32, 0.12, 2.05, 1.35, 0.25); cyl(root, m.sheet, 0.06, 0.012, 2.05, 1.38, 0.312, 'z', 20); box(root, m.black, 0.004, 0.05, 0.002, 2.05, 1.395, 0.32);   // regulator + gauge
  lamp(root, 1.4, 0.25, 0.9, 'Test_OK');
  opWorker(root, 'Op_Test', 1.75, -0.72, 0);
  // 3. robot MIG cell (x 4.3): belt 1 brings the part in (x 2.45 → 3.55); the operator loads it into the positioner with both gas flanges from the
  // flange bin; the 6-axis robot (south of it, behind the fence) welds each flange seam while the positioner turns the part; out onto belt 2 at x 5.05
  belt(2.35, 3.7); belt(4.95, 13.0);
  const PX = 4.3, RB = [4.3, 0.9, 0.5];
  leg4(root, PX, 0, 0.9, 0.4, 0.75);
  box(root, m.orange, 0.2, 0.42, 0.3, PX - 0.38, 0.96, 0); box(root, m.orange, 0.12, 0.35, 0.22, PX + 0.36, 0.92, 0);
  const pc = G('Pos_Chuck', root, PX - 0.25, TA, 0); cyl(pc, m.steel, 0.07, 0.04, 0, 0, 0, 'x', 20); box(pc, clampM, 0.03, 0.16, 0.03, 0.03, 0, 0); box(pc, clampM, 0.03, 0.03, 0.16, 0.03, 0, 0);
  cyl(root, m.steel, 0.02, 0.1, PX + 0.27, TA, 0, 'x', 10);
  box(root, m.black, 0.36, RB[1] - 0.02, 0.36, RB[0], (RB[1] - 0.02) / 2 + 0.02, RB[2]); box(root, m.yellow, 0.37, 0.04, 0.37, RB[0], RB[1] - 0.04, RB[2]); box(root, m.aluDark, 0.42, 0.02, 0.42, RB[0], 0.01, RB[2]);
  box(root, m.sheet, 0.5, 0.75, 0.4, PX + 0.5, 0.375, 0.75); box(root, m.screen, 0.18, 0.1, 0.004, PX + 0.5, 0.6, 0.548); cyl(root, m.black, 0.25, 0.1, PX - 0.5, 0.05, 0.75, 'y', 20); // MIG power source, wire drum
  for (const [x0, z0, x1, z1] of [[3.75, 1.05, 4.85, 1.05], [3.75, -0.32, 3.75, 1.05], [4.85, -0.32, 4.85, 1.05]]) { box(root, m.mesh, Math.abs(x1 - x0) || 0.02, 1.8, Math.abs(z1 - z0) || 0.02, (x0 + x1) / 2, 1.0, (z0 + z1) / 2); prof(root, [x0, 0.06, z0], [x0, 1.95, z0], 0.045, m.frameDark); prof(root, [x1, 0.06, z1], [x1, 1.95, z1], 0.045, m.frameDark); }
  for (const x of [3.8, 4.8]) { box(root, m.yellow, 0.04, 1.4, 0.04, x, 0.75, -0.34); box(root, m.black, 0.02, 1.3, 0.02, x, 0.75, -0.31); }   // light curtain at the loading side
  plane(root, curtain, 0.98, 0.5, PX, 1.7, -0.33);   // weld-light screen above the loading opening
  cyl(root, m.black, 0.012, 0.25, 4.85, 1.95, 1.05, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.yellow], [2, m.red]]) cyl(root, mt, 0.03, 0.06, 4.85, 2.1 + k * 0.065, 1.05, 'y', 14);
  leg4(root, 5.0, -0.42, 0.3, 0.25, 0.88); for (let k = 0; k < 3; k++) for (const s of [-1, 1]) box(root, m.stainless, 0.01, 0.09, 0.15, 5.0 + s * 0.05, 0.93 + k * 0.012, -0.42, [0, 0, Math.PI / 2]); // flange bin
  opWorker(root, 'Op_Rob', PX, -0.72, 0);
  const fr = globalThis.FR5 ? globalThis.FR5.clone(true) : null; let rig = null;
  if (fr) { fr.name = 'Mig_Robot'; fr.position.set(...RB); fr.rotation.y = Math.PI; root.add(fr);
    const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = 'Mig_' + j.name; });
    const tool = G('Mig_Torch', J[5], 0, 0, 0.101); { const g1 = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 14); g1.rotateX(Math.PI / 2); g1.translate(0, 0, 0.04); bin(tool, m.black, g1);
      const g2 = new THREE.CylinderGeometry(0.012, 0.016, 0.17, 12); g2.rotateX(Math.PI / 2); g2.translate(0, 0, 0.165); bin(tool, m.steel, g2); const g3 = new THREE.CylinderGeometry(0.004, 0.009, 0.02, 10); g3.rotateX(Math.PI / 2); g3.translate(0, 0, 0.26); bin(tool, m.orange, g3);
      const ar = G('Mig_Robot_Arc', tool); bin(ar, arcM, xf(new THREE.SphereGeometry(0.016, 10, 8), 0, 0, 0.275)); }
    root.updateMatrixWorld(true); rig = ikRig(root, J, new THREE.Vector3(0, 0, 0.101 + 0.275)); rig.J = J; }
  const robotPath = rig && (() => { const H = [PX, 1.3, 0.25], TY = TA + 0.052, A = [PX - 0.12, TY, 0], B = [PX + 0.12, TY, 0], up = p => [p[0], p[1] + 0.07, p[2]];
    return rig.trace([[H, 0], [up(A), 1.5], [A, 0.6, 'arcA'], [A, 4.0, 'arcAend'], [up(A), 0.5], [up(B), 0.8], [B, 0.6, 'arcB'], [B, 4.0, 'arcBend'], [up(B), 0.5], [H, 1.4]], 'MIG robot'); })();
  // 4. three manual MIG booths (x 6.6 / 8.6 / 10.6): the operator lifts the part off the belt, turns to the welding table, fits the coolant pipes
  // and the bracket and welds them (four seams), then puts it back on the belt; curtains on three sides, open to the belt; fume arm over the table
  const BX = [6.6, 8.6, 10.6];
  BX.forEach((x, k) => { const nm = 'Op_Mig_' + (k + 1);
    hang(root, x - 0.5, -1.65, x - 0.5, -0.3); hang(root, x + 1.25, -1.65, x + 1.25, -0.3); hang(root, x - 0.5, -1.65, x + 1.25, -1.65);
    leg4(root, x + 0.75, -0.72, 0.6, 0.6, 0.9); box(root, clampM, 0.3, 0.02, 0.16, x + 0.75, 0.91, -0.72); box(root, m.orange, 0.2, 0.08, 0.15, x + 0.92, 0.94, -0.95); for (let q = 0; q < 4; q++) cyl(root, m.stainless, 0.011, 0.14, x + 0.86 + q * 0.03, 0.99, -0.95, 'x', 10); // fixture, pipe tray
    box(root, m.sheet, 0.35, 0.6, 0.4, x + 0.95, 0.3, -1.3); box(root, m.screen, 0.14, 0.08, 0.004, x + 0.95, 0.5, -1.098); cyl(root, m.black, 0.006, 1.0, x + 0.6, 0.6, -1.0, 'y', 6);  // welder
    prof(root, [x + 1.15, 0.06, -1.5], [x + 1.15, 2.2, -1.5], 0.06, m.frameDark); cyl(root, m.yellow, 0.05, 0.9, x + 0.95, 2.1, -1.15, 'z', 12); cyl(root, m.sheet, 0.1, 0.12, x + 0.8, 1.75, -0.72, 'y', 16);  // fume arm
    const arms = opWorker(root, nm, x, -0.72, 0); const tc = G(nm + '_Torch', arms._Arm_R, 0, -0.72, 0.03); cyl(tc, m.black, 0.016, 0.16, 0, 0, 0, 'y', 10); cyl(tc, m.steel, 0.009, 0.08, 0, -0.1, 0.02, 'y', 8);
    const ar = G(nm + '_Arc', tc); bin(ar, arcM, xf(new THREE.SphereGeometry(0.018, 10, 8), 0, -0.15, 0.03)); });
  // 5. C/F final inspection (x 12.75 → check fixture at x 13.45) and DMC marking / packing (x 14.15; the shipping pallet stands behind this operator)
  leg4(root, 13.45, -0.3, 0.5, 0.45, 0.9); box(root, clampM, 0.3, 0.02, 0.18, 13.45, 0.91, -0.3);
  for (const s of [-1, 1]) prof(root, [13.45 + s * 0.2, 0.9, -0.12], [13.45 + s * 0.2, 1.4, -0.12], 0.03); box(root, m.aluDark, 0.46, 0.04, 0.06, 13.45, 1.42, -0.12);
  { const cc = G('CF_Clamp', root); box(cc, m.yellow, 0.3, 0.03, 0.2, 13.45, 1.12, -0.3); cyl(cc, m.steel, 0.012, 0.28, 13.45, 1.27, -0.2, 'y', 8); for (const s of [-1, 1]) cyl(cc, m.steel, 0.006, 0.1, 13.45 + s * 0.1, 1.06, -0.3, 'y', 8); }
  lamp(root, 13.72, -0.5, 0.9, 'CF_OK'); box(root, m.black, 0.25, 0.18, 0.04, 13.15, 1.25, -0.5); box(root, m.screen, 0.22, 0.14, 0.004, 13.15, 1.25, -0.478);
  leg4(root, 14.15, 0.05, 0.6, 0.45, 0.9); box(root, m.black, 0.32, 0.3, 0.3, 14.15, 1.33, 0.12); box(root, m.black, 0.06, 0.4, 0.06, 14.15, 1.1, 0.25); box(root, m.glass, 0.3, 0.2, 0.002, 14.15, 1.08, -0.1);   // DMC laser marker
  { const lz = G('DMC_Laser', root); cyl(lz, std('laser_red', 0xff3020, 0, 0.3, { emissive: 0xff2010, emissiveIntensity: 3 }), 0.003, 0.2, 14.15, 1.08, 0.05, 'y', 6); }
  box(root, m.black, 0.25, 0.4, 0.2, 14.55, 1.1, 0.25); box(root, m.screen, 0.2, 0.3, 0.004, 14.55, 1.15, 0.148);
  opWorker(root, 'Op_CF', 12.75, -0.72, 0); opWorker(root, 'Op_Pack', 14.15, -0.72, 0);

  // ---- keys
  const ease = u => u * u * (3 - 2 * u), ch = {}, add = (node, c, list) => { const key = node + '|' + c; (ch[key] || (ch[key] = [])).push(...list); };
  const ser = (evs, rest) => { evs = evs.slice().sort((a, b) => a[0] - b[0]);
    const f = t => { let k = -1; while (k + 1 < evs.length && evs[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === evs.length - 1) return evs[k][1]; const [t0, v0] = evs[k], [t1, v1] = evs[k + 1]; return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1); };
    return [[0, f(0)], ...evs.filter(e => e[0] > 0 && e[0] < T), [T, f(T)]]; };
  const vis = (evs, v0) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); let s = v0; for (const [t, v] of evs) if (t <= 0) s = v; return [[0, s], ...evs.filter(e => e[0] > 0 && e[0] < T)]; };
  const R = -0.15, F = -0.9, TAU = Math.PI * 2;
  const reach = (op, t0, t1, a = F) => { add(op + '_Arm_R', 'rx', [[t0, R], [t0 + 0.5, a], [t1 - 0.5, a], [t1, R]]); add(op + '_Arm_L', 'rx', [[t0, R], [t0 + 0.5, a + 0.1], [t1 - 0.5, a + 0.1], [t1, R]]); };
  const turn = (op, list) => add(op + '_Turn', 'ry', list);
  const PT = [-0.8, 0.68, -1.3], ST = [0.85, 0.9, -0.25], CH = [1.75, 0.93, 0], PJ = [PX, TA - YC, 0], CFP = [13.45, 0.92, -0.3], DM = [14.15, 0.92, 0.05], PAL = [14.15, 0.9, -1.35];
  const drops = [], picks = [];
  for (let n = -1; n <= 1; n++) for (let i = 0; i < N; i++) {
    const s = i * PW + n * T, PN = 'Part_' + (i + 1), P = [], at = (t, p) => P.push([s + t, p]);
    // 1. TIG
    turn('Op_Tig', [[s + 1.0, 0], [s + 1.6, -2.2], [s + 1.9, -2.2], [s + 3.2, 0], [s + 4.2, 0], [s + 4.9, -0.95], [s + 5.3, -0.95], [s + 6.0, 0], [s + 18.4, 0], [s + 19.4, 0.9], [s + 20.0, 0.9], [s + 21.0, 0]]);
    reach('Op_Tig', s + 1.0, s + 4.0, -0.75); reach('Op_Tig', s + 4.4, s + 6.5); reach('Op_Tig', s + 17.6, s + 20.6);
    at(1.6, PT); at(2.6, [-0.35, 1.2, -0.4]); at(3.4, [0, 1.2, 0]); at(3.9, PJ.map((v, k) => k === 0 ? 0 : v));
    add(PN + '_Core', 'vis', [[s + 0.5, true], [s + 6.2, false]]); add(PN + '_Body', 'vis', [[s + 0.5, false], [s + 6.2, true]]);
    add('Tig_Screen', 'y', [[s + 6.6, 0.9], [s + 7.4, 0], [s + 16.8, 0], [s + 17.6, 0.9]]);
    for (const sd of ['L', 'R']) { add('Tig_Torch_' + sd, 'y', [[s + 7.6, 0], [s + 8.2, -0.06], [s + 16.3, -0.06], [s + 16.9, 0]]); add('Tig_Arc_' + sd, 'vis', [[s + 8.3, true], [s + 16.3, false]]);
      add('Tig_Chuck_' + sd, 'rx', [[s + 8.3, 0], [s + 16.3, TAU], [s + 16.31, 0]]); }
    add(PN + '_R', 'rx', [[s + 8.3, 0], [s + 16.3, TAU], [s + 16.31, 0]]); add(PN + '_TBead', 'vis', [[s + 0.5, false], [s + 16.3, true]]);
    at(18.2, [0, PJ[1], 0]); at(18.8, [0.3, 1.15, -0.1]); at(19.8, [ST[0], 1.0, ST[2]]); at(20.3, ST);
    // 2. pressure test
    turn('Op_Test', [[s + 21.4, 0], [s + 22.2, -1.06], [s + 22.5, -1.06], [s + 23.8, 0], [s + 37.9, 0], [s + 38.8, 0.75], [s + 39.3, 0.75], [s + 40.2, 0]]);
    reach('Op_Test', s + 21.8, s + 25.0); reach('Op_Test', s + 36.9, s + 40.0);
    at(22.4, ST); at(23.0, [1.2, 1.15, -0.3]); at(24.0, [1.75, 1.25, 0]); at(24.6, CH);
    add('Test_Lid', 'y', [[s + 24.8, 0.3], [s + 25.6, 0], [s + 35.8, 0], [s + 36.6, 0.3]]); add('Test_OK', 'vis', [[s + 35.4, true], [s + 38.4, false]]);
    at(37.4, CH); at(38.0, [1.75, 1.25, 0]); at(39.0, [2.45, 1.0, 0]); at(39.5, [2.45, BT, 0]);
    // 3. robot MIG
    at(43.0, [3.55, BT, 0]);
    turn('Op_Rob', [[s + 42.6, 0], [s + 43.4, -0.81], [s + 43.7, -0.81], [s + 45.0, 0], [s + 46.0, 0], [s + 46.8, 0.95], [s + 47.1, 0.95], [s + 47.8, 0], [s + 63.9, 0], [s + 64.7, 0.81], [s + 65.1, 0.81], [s + 66.0, 0]]);
    reach('Op_Rob', s + 43.0, s + 46.0); reach('Op_Rob', s + 46.4, s + 48.4); reach('Op_Rob', s + 63.0, s + 65.8);
    at(43.6, [3.55, BT, 0]); at(44.2, [3.75, 1.2, -0.2]); at(45.2, [PX, 1.2, 0]); at(45.7, PJ);
    add(PN + '_Flange', 'vis', [[s + 0.5, false], [s + 48.0, true]]);
    const t0 = s + 48.8;
    if (robotPath) { const AXN = ['ry', 'rz', 'rz', 'rz', 'ry', 'rz'], rp = robotPath;
      rig.J.forEach((j, q) => add(j.name, AXN[q], [[t0 - 0.01, 0], ...rp.wp.map(([t, v]) => [t0 + t, v[q] - rp.rest[q]]), [t0 + rp.T + 0.01, 0]]));
      for (const [a, b, sd] of [['arcA', 'arcAend', 'A'], ['arcB', 'arcBend', 'B']]) { add('Mig_Robot_Arc', 'vis', [[t0 + rp.ev[a], true], [t0 + rp.ev[b], false]]);
        add('Pos_Chuck', 'rx', [[t0 + rp.ev[a], 0], [t0 + rp.ev[b], TAU], [t0 + rp.ev[b] + 0.01, 0]]); add(PN + '_R', 'rx', [[t0 + rp.ev[a], 0], [t0 + rp.ev[b], TAU], [t0 + rp.ev[b] + 0.01, 0]]);
        add(PN + '_FBead' + sd, 'vis', [[s + 0.5, false], [t0 + rp.ev[b], true]]); } }
    at(63.6, PJ); at(64.2, [PX, 1.2, 0]); at(65.0, [5.0, 1.05, 0]); at(65.4, [5.05, BT, 0]);
    // 4. manual MIG booth k (round robin)
    const bx = BX[i % 3], op = 'Op_Mig_' + (i % 3 + 1), a = 65.4 + (bx - 5.05) / 0.3;
    at(a, [bx, BT, 0]);
    turn(op, [[s + a + 0.3, 0], [s + a + 1.6, Math.PI / 2], [s + a + 57.4, Math.PI / 2], [s + a + 58.8, 0]]);
    reach(op, s + a - 0.4, s + a + 2.6); reach(op, s + a + 3.0, s + a + 5.2, -0.8); reach(op, s + a + 56.6, s + a + 60.0);
    const W4 = [[6, 16], [19, 29], [32, 42], [45, 55]];
    for (const [w0, w1] of W4) { add(op + '_Arm_R', 'rx', [[s + a + w0 - 0.8, R], [s + a + w0, -0.85], [s + a + (w0 + w1) / 2, -0.7], [s + a + w1, -0.85], [s + a + w1 + 0.8, R]]); add(op + '_Arm_L', 'rx', [[s + a + w0 - 0.8, R], [s + a + w0, -0.6], [s + a + w1, -0.6], [s + a + w1 + 0.8, R]]); add(op + '_Arc', 'vis', [[s + a + w0, true], [s + a + w1, false]]); }
    at(a + 0.2, [bx, BT, 0]); at(a + 0.8, [bx, 1.2, -0.3]); at(a + 1.6, [bx + 0.5, 1.15, -0.72]); at(a + 2.0, [bx + 0.75, 0.92, -0.72]);
    add(PN + '_Pipes', 'vis', [[s + 0.5, false], [s + a + 4.6, true]]); add(PN + '_PBead', 'vis', [[s + 0.5, false], [s + a + 55, true]]);
    at(a + 57.0, [bx + 0.75, 0.92, -0.72]); at(a + 57.8, [bx + 0.5, 1.2, -0.72]); at(a + 58.8, [bx, 1.2, -0.3]); at(a + 59.4, [bx, BT, 0]);
    const c = a + 59.4 + (12.75 - bx) / 0.3; at(c, [12.75, BT, 0]);
    // 5. C/F → DMC → carton on the pallet
    turn('Op_CF', [[s + c + 0.4, 0], [s + c + 1.4, 1.03], [s + c + 1.9, 1.03], [s + c + 2.8, 0]]); reach('Op_CF', s + c - 0.4, s + c + 2.6);
    at(c + 0.2, [12.75, BT, 0]); at(c + 0.8, [12.9, 1.2, -0.2]); at(c + 1.5, [13.45, 1.1, -0.3]); at(c + 1.9, CFP);
    add('CF_Clamp', 'y', [[s + c + 2.2, 0], [s + c + 2.8, -0.08], [s + c + 9.5, -0.08], [s + c + 10.1, 0]]); add('CF_OK', 'vis', [[s + c + 9.6, true], [s + c + 12.6, false]]);
    turn('Op_Pack', [[s + c + 10.2, 0], [s + c + 11.0, -1.03], [s + c + 11.3, -1.03], [s + c + 12.2, 0], [s + c + 17.8, 0], [s + c + 19.4, Math.PI], [s + c + 20.6, Math.PI], [s + c + 22.0, 0]]);
    reach('Op_Pack', s + c + 10.4, s + c + 13.2); reach('Op_Pack', s + c + 16.6, s + c + 21.0, -0.75);
    at(c + 11.0, CFP); at(c + 11.6, [13.8, 1.2, -0.35]); at(c + 12.4, [14.15, 1.2, 0]); at(c + 12.8, DM);
    add('DMC_Laser', 'vis', [[s + c + 13.4, true], [s + c + 16.4, false]]);
    at(c + 17.2, DM); at(c + 17.8, [14.15, 1.25, -0.2]); at(c + 19.4, [14.15, 1.2, -1.2]); at(c + 20.2, PAL);
    const d = c + 20.4; if (n === 0) { drops.push(((s + d) % T + T) % T); picks.push(((s + 1.6) % T + T) % T); }
    add(PN, 'vis', [[s + 1.6, true], [s + d, false]]);
    at(d + 0.05, PT);
    for (const [cc, k] of [['x', 0], ['y', 1], ['z', 2]]) add(PN + '_' + cc.toUpperCase(), cc, P.map(([t, p]) => [t, p[k]]));
  }
  for (let i = 0; i < N; i++) { // part nodes: X > Y > Z > Part (shown while in the line) > R (turns about the body axis) > looks
    const PN = 'Part_' + (i + 1), x = G(PN + '_X', root), y = G(PN + '_Y', x), z = G(PN + '_Z', y), p = G(PN, z), r = G(PN + '_R', p, 0, YC, 0), lk = G(PN + '_Look', r, 0, -YC, 0);
    lookCore(G(PN + '_Core', lk)); lookBody(G(PN + '_Body', lk)); lookTBead(G(PN + '_TBead', lk)); lookFlange(G(PN + '_Flange', lk));
    lookFBead(G(PN + '_FBeadA', lk), -1); lookFBead(G(PN + '_FBeadB', lk), 1); lookPipes(G(PN + '_Pipes', lk)); lookPBead(G(PN + '_PBead', lk));
  }
  root.userData.weld = { drops: drops.sort((a, b) => a - b).map(v => +v.toFixed(2)), picks: picks.sort((a, b) => a - b).map(v => +v.toFixed(2)) };
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) {
    const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /_(Arc|Arc_[LR])$|^Mig_Robot_Arc$|^(Test_OK|CF_OK|DMC_Laser)$|^Part_\d+$|_(Body|TBead|Flange|FBead[AB]|Pipes|PBead)$/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs, /_Arm_/.test(node) ? R : 0)]);
  }
  return cycleClip(finalize(root), 'Weld_Cycle', T, keys, 4);
}

function brazedCore() { // vacuum-brazed core (semi-finished): stainless core 180 × 70 × 90 with both gas tanks, brazing tint
  const m = materials(), root = G('Brazed_Core'), mt = std('brazed_stainless', 0xa49580, 0.9, 0.36);
  box(root, mt, 0.18, 0.07, 0.09, 0, 0.035, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(root, mt, 0.004, 0.074, 0.094, x, 0.035, 0); for (const sx of [-1, 1]) box(root, mt, 0.02, 0.06, 0.07, sx * 0.1, 0.035, 0);
  void m; return finalize(root);
}
function toteGrid(name, item, L, W, H) { // tote holding 8 parts in a grid (2 along X, rows along Z, layers), the way they are packed with dividers
  const root = G(name); root.add(tote()); const nx = 2, nz = Math.max(1, Math.min(4, Math.floor(0.38 / W))), per = nx * nz;
  for (let k = 0; k < 8; k++) { const p = item(), l = Math.floor(k / per), r = k % per; p.position.set(((r % nx) - 0.5) * 0.29, 0.02 + l * (H + 0.004), ((Math.floor(r / nx)) - (nz - 1) / 2) * (0.38 / nz)); root.add(p); }
  return finalize(root);
}

export const MODELS = {
  egr_module_line: egrModuleLine, /* the welding module line (5 cells) rebuilt from generic equipment, tools/egr-line-v3/module-line.js */
  tote_blanks4: () => { const r = G('Tote_Blanks_4'); r.add(tote()); for (let i = 0; i < 4; i++) box(r, materials().stainless, 0.18, 0.03, 0.09, 0, 0.031 + i * 0.032, 0); return finalize(r); }, /* 4 kits (line A) */
  tote_blanks: () => { const r = G('Tote_Blanks'); r.add(tote()); for (let i = 0; i < 8; i++) box(r, materials().stainless, 0.18, 0.03, 0.09, 0, 0.031 + i * 0.032, 0); return finalize(r); }, /* 8 kits of plate blanks */
  brazed_core: brazedCore, tote_brazed: () => toteGrid('Tote_Brazed_Cores', brazedCore, 0.22, 0.09, 0.074), tote_coolers: () => toteGrid('Tote_Coolers', egrCooler, 0.28, 0.15, 0.139), egr_core_line: () => egrCoreLine(), egr_core_line_manual: () => egrCoreLine({ manual: true, pitch: 64 }), asrs_cell_a: () => asrsCell({ pitch: 64, kits: 4, mirror: true }), /* line A: a tote of 4 kits per 256 s; lifts towards line B */ egr_weld_line: egrWeldLine, pack_box: packBox, insert_part: insertPart, dispensed_sub: dispensedSub, tote_dispensed: () => toteWith('Tote_Dispensed', dispensedSub, 8, 3, 0.03), tote_moulded: () => toteWith('Tote_Moulded', insertPart, 8, 2, 0.066), asrs_cell: asrsCell, injection_cell: injectionCell, egr_auto_line: egrAutoLine,
  asrs_crane: asrsCraneAnimated, asrs_rail_4m: () => asrsRail(4), dispense_cell: dispenseCellAnimated, vision_gantry: visionGantry, amr_deck_bot: amrDeckBot, press_line_2level: pressLine,
  ng_chute: ngChute, amr_roller_deck: amrRollerDeck, conveyor_stopper: stopperAnimated,
  fence_panel_1m: () => fencePanel(1.0), fence_panel_2m: () => fencePanel(2.0), tote_600x400: tote, egr_cooler: egrCooler,
  roller_conveyor_1m: () => rollerConveyor(1), roller_conveyor_2m: () => rollerConveyor(2), roller_curve_90: rollerCurve, belt_conveyor_2m: () => beltConveyor(2),
  rack_bay: () => rackBay('01'), ...Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08'].map(n => ['bay_sign_' + n, () => baySign(n)])),
  hall_wall_6m: wallPanel, hall_door_6m: doorPanel, hall_gable_24m: gableWall, hall_column: hallColumn, hall_roof_6m: roofTruss, floor_6m: () => floorTile(false), floor_6m_aisle: () => floorTile(true)
};

// helpers shared with tools/egr-line-v3/module-line.js (the welding module line rebuilt from these parts)
export { G, box, cyl, tor, prof, foot, plane, bin, xf, std, anim, materials, finalize, cycleClip, opWorker, ikRig, fencePanel, egrCoolerGeo, labelTexture };
