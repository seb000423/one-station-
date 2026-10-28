// Custom equipment for the EGR cooler line v3 (Ni paste dispensing → belt → stacking → AMR), modelled in three.js
// and exported as GLB by tools/egr-line-v3/build.mjs. Look: the VEXPLOR reference video (_ref_vexplor/) —
// grey-blue anodised 45 mm aluminium profile, silver rollers, black mesh, glass, orange-red accents — with ONE STATION's
// yellow (#EEC539) for safety details. Metres, Y up, origin at the base centre (floor level) of each model.
// Static geometry is merged per material per node; movable parts are their own named nodes (Crane_Carriage,
// Needle_Head, Door_L, …) and carry userData.anim = { type, axis, min, max } (exported as glTF extras).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  g.fillStyle = fg; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 68);
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
    sheet: std('sheet_grey', 0xb4bac1, 0.15, 0.55),
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
function egrCoolerGeo(n) { // Gamma 1.6 T-GDI EGR cooler: stainless core 180 × 70 × 90 mm, gas flanges at both ends, coolant pipes, bracket; overall 280 × 130 × 150
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
  const tracks = [];
  for (const [nodeName, ch, pts] of keys) {
    const node = root.getObjectByName(nodeName); if (!node) throw new Error('no node ' + nodeName);
    const at = t => { let k = 0; while (k < pts.length - 2 && pts[k + 1][0] <= t) k++; const [t0, v0] = pts[k], [t1, v1] = pts[Math.min(k + 1, pts.length - 1)]; const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1; const e = u * u * (3 - 2 * u); return v0 + (v1 - v0) * e; };
    const n = Math.round(T * fps) + 1, times = Float32Array.from({ length: n }, (_, i) => i / fps);
    if (ch === 'vis') { const ts = pts.map(q => q[0]), v = pts.flatMap(q => { const k = q[1] ? 1 : 1e-4; return [k, k, k]; }); tracks.push(new THREE.VectorKeyframeTrack(nodeName + '.scale', ts, v, THREE.InterpolateDiscrete)); continue; }
    if (/^[xyz]$/.test(ch)) { const v = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const q = node.position.clone(); q[ch] += at(times[i]); q.toArray(v, i * 3); } tracks.push(new THREE.VectorKeyframeTrack(nodeName + '.position', times, v)); }
    else { const ax = ch[1], v = new Float32Array(n * 4), e = new THREE.Euler(); for (let i = 0; i < n; i++) { e.copy(node.rotation); e[ax] += at(times[i]); new THREE.Quaternion().setFromEuler(e).toArray(v, i * 4); } tracks.push(new THREE.QuaternionKeyframeTrack(nodeName + '.quaternion', times, v)); }
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
  const P = 32, T = 4 * P, RZ = 0.95, LV = [1.5, 3.0, 4.5, 6.0], TIO = 1.25, R = 0.45, XC = -3.3;
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
  box(io, m.black, 0.06, 0.36, 0.46, XC - 0.5, 1.55, 0.6); box(io, m.screen, 0.02, 0.3, 0.4, XC - 0.47, 1.55, 0.6);
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
  const ceramic = std('ceramic_substrate', 0xece8de, 0.0, 0.55);
  const loops = ['A', 'B'].map(k => { const x = G('Loop_' + k + '_X', body, 0, TIO, -RZ), z = G('Loop_' + k + '_Z', x); const v = G('Loop_' + k + '_Tote', z); v.add(tote());
    for (let i = 0; i < 4; i++) { const sb = G('Loop_' + k + '_Sub_' + (i + 1), v); box(sb, materials().stainless, 0.18, 0.03, 0.09, 0, 0.031 + i * 0.032, 0); for (let q = 1; q < 6; q++) box(sb, materials().steel, 0.182, 0.001, 0.092, 0, 0.016 + i * 0.032 + q * 0.005, 0); } return k; }); // 4 stacks of stainless plate blanks (one core kit each); the line's picker takes the top one
  // keys
  const car = s => s + 0.03 - 0.26 - 1.0, dn = s => s - 0.03 - 0.26 - 1.0, cx = [], cy = [], fz = [], cv = [[0, true]], sv = slots.map(() => []);
  for (let k = 0; k < 4; k++) {
    const s = P * k, A = slots[k], B = slots[(k + 1) % 4];
    cx.push([s, 0], [s + 5.2, 0], [s + 11, A.x], [s + 13.6, A.x], [s + 19, B.x], [s + 21.6, B.x], [s + 28, 0]);
    cy.push([s, car(TIO)], [s + 1.2, car(TIO)], [s + 1.6, dn(TIO)], [s + 3.8, dn(TIO)], [s + 4.2, car(TIO)], [s + 5.2, car(TIO)], [s + 11, car(A.y)], [s + 12.2, car(A.y)], [s + 12.6, dn(A.y)], [s + 13.6, dn(A.y)], [s + 19, dn(B.y)], [s + 20.2, dn(B.y)], [s + 20.6, car(B.y)], [s + 21.6, car(B.y)], [s + 28, car(TIO)]);
    fz.push([s, 0], [s + 1.2, -R], [s + 1.6, -R], [s + 2.6, 0], [s + 3.8, R], [s + 4.2, R], [s + 5.2, 0], [s + 11, 0], [s + 12.2, A.side * R], [s + 12.6, A.side * R], [s + 13.6, 0], [s + 19, 0], [s + 20.2, B.side * R], [s + 20.6, B.side * R], [s + 21.6, 0]);
    cv.push([s + 1.4, false], [s + 4.0, true], [s + 12.4, false], [s + 20.4, true]);
    sv[k].push([s + 12.4, true]); sv[(k + 1) % 4].push([s + 20.4, false]);
  }
  const close = a => [...a, [T, a[0][1]]];
  const keys = [['ASRS_Crane', 'x', close(cx)], ['Crane_Carriage', 'y', close(cy)], ['Crane_Fork', 'z', close(fz)], ['Crane_Fork2', 'z', close(fz)], ['Carried_Tote', 'vis', cv]];
  sv.forEach((v, j) => { v.sort((a, b) => a[0] - b[0]); keys.push(['Slot_Tote_' + (j + 1), 'vis', [[0, !v[0][1]], ...v]]); });
  // loop totes: tote A rides the loop after periods 0 and 2, tote B after 1 and 3; path relative to the outfeed drop point
  const PATH = [[0, 0, 0], [2.6, 0, 0], [8.5, XC, 0], [10.5, XC, RZ], [22.5, XC, RZ], [24.5, XC, 2 * RZ], [31, 0, 2 * RZ], [2 * P - 0.2, 0, 2 * RZ], [2 * P, 0, 0]]; // 12 s at the pick station (the EGR auto line picks at 32k + 16)
  loops.forEach((k, i) => {
    const xs = [], zs = [], vs = [];
    for (const s0 of [-2 * P, 0, 2 * P]) { const s = s0 + i * P + 1.4; for (const [u, x, z] of PATH) { xs.push([s + u, x]); zs.push([s + u, z]); } vs.push([s, true], [s + P + 2.6, false]); }
    const clip = a => { a = a.filter(([t]) => t >= 0 && t <= T); return a; };
    const v = clip(vs).sort((a, b) => a[0] - b[0]);
    keys.push(['Loop_' + k + '_X', 'x', clip(xs)], ['Loop_' + k + '_Z', 'z', clip(zs)], ['Loop_' + k + '_Tote', 'vis', [[0, i === 1], ...v]]);
    if (o.picks && !o.picks.includes(k)) return; // this tote's stacks are not picked (a line taking a kit every other visit)
    const sub = []; for (const s0 of [-2 * P, 0, 2 * P]) { const s = s0 + i * P; sub.push([s + 16, false], [s + 1.4 + 2 * P - 0.1, true]); } // top substrate: picked at 16, the next tote out has its own
    const sv4 = sub.filter(([t]) => t > 0 && t < T).sort((a, b) => a[0] - b[0]); keys.push(['Loop_' + k + '_Sub_4', 'vis', [[0, !sv4[0][1]], ...sv4]]);
  });
  return cycleClip(finalize(root), 'ASRS_Cycle', T, keys);
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
  const P = o.pitch || 32, DT = o.manual ? 40 : 12, TT = 8 * P, A0 = 60 + (DT - 12), F0 = A0 + 2 + 2 * P;
  const m = materials(), root = G(o.manual ? 'EGR_Core_Line_Manual' : 'EGR_Core_Line_Auto'), BT = 0.855, BW = 0.5;
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45), glow = std('furnace_glow', 0xff7a1a, 0.0, 0.6, { emissive: 0xff5a00, emissiveIntensity: 2.4 });
  // part looks (origin at the part's bottom centre)
  const blank = n => { box(n, m.stainless, 0.18, 0.03, 0.09, 0, 0.015, 0); for (let k = 1; k < 6; k++) box(n, m.steel, 0.182, 0.001, 0.092, 0, k * 0.005, 0); };
  const formed = n => { box(n, m.stainless, 0.18, 0.05, 0.09, 0, 0.025, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, m.steel, 0.004, 0.052, 0.092, x, 0.025, 0); };
  const core = (n, mt) => { box(n, mt, 0.18, 0.07, 0.09, 0, 0.035, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, mt === brazed ? brazed : m.steel, 0.004, 0.074, 0.094, x, 0.035, 0); for (const sx of [-1, 1]) box(n, mt, 0.02, 0.06, 0.07, sx * 0.1, 0.035, 0); };
  const clamps = n => { for (const sx of [-1, 1]) { box(n, clampM, 0.02, 0.09, 0.11, sx * 0.06, 0.04, 0); box(n, m.yellow, 0.022, 0.012, 0.112, sx * 0.06, 0.08, 0); } box(n, clampM, 0.24, 0.012, 0.12, 0, 0.004, 0); };
  const pasteLines = (n, pre) => [-0.0625, 0, 0.0625].forEach((x, i) => box(pre ? G(pre + (i + 1), n) : n, m.paste, 0.006, 0.004, 0.092, x, 0.072, 0));
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
  // 2. servo press (x 1.2): columns either side of the belt, crown, ram with the forming die
  for (const sz of [-1, 1]) { box(root, m.black, 0.28, 2.3, 0.2, 1.2, 1.15, sz * 0.5); box(root, m.yellow, 0.282, 0.06, 0.202, 1.2, 0.9, sz * 0.5); }
  box(root, m.orange, 0.5, 0.42, 1.22, 1.2, 2.5, 0); box(root, m.black, 0.32, 0.28, 0.32, 1.2, 2.85, 0); box(root, m.aluDark, 0.42, 0.12, 0.62, 1.2, BT - 0.17, 0);
  const ram = G('Press_Ram', root); box(ram, m.aluDark, 0.36, 0.5, 0.7, 1.2, 2.0, 0); box(ram, m.steel, 0.22, 0.08, 0.14, 1.2, 1.71, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(root, m.yellow, 0.035, 1.3, 0.035, 1.2 + sx * 0.36, BT + 0.65, sz * 0.34); }
  // 3. core stacking table + operator (x 2.8, south side): plate bins and the clamping jigs at hand
  box(root, m.esdTop || m.aluDark, 0.9, 0.03, 0.5, 2.5, 0.9, 0.95); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [2.5 + sx * 0.42, 0.06, 0.95 + sz * 0.22], [2.5 + sx * 0.42, 0.885, 0.95 + sz * 0.22], 0.04);
  for (let k = 0; k < 3; k++) { box(root, m.orange, 0.2, 0.1, 0.16, 2.2 + k * 0.25, 0.965, 1.08); box(root, m.stainless, 0.18, 0.03, 0.12, 2.2 + k * 0.25, 1.0, 1.08); }
  for (let k = 0; k < 3; k++) box(root, clampM, 0.24, 0.02, 0.12, 2.75, 0.925 + k * 0.022, 0.82);
  const st = worker('Op_Stack', 2.8, 0.72, Math.PI);
  // 4. Ni paste dispensing (x 4.6, the belt stops there)
  belt(3.3, 5.9, 0, false); belt(5.9, 6.55);
  if (!o.manual) {
    const dc = G('Auto_Dispense', root), C = 4.6;
    box(dc, m.sheet, 2.0, 0.7, 1.3, C, 0.4, 0); box(dc, m.black, 2.02, 0.05, 1.32, C, 0.03, 0); box(dc, m.yellow, 2.01, 0.05, 0.004, C, 0.68, 0.652);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(dc, [C + sx * 0.98, 0.75, sz * 0.63], [C + sx * 0.98, 2.1, sz * 0.63], 0.045, m.frameDark);
    for (const sz of [-1, 1]) prof(dc, [C - 0.98, 2.1, sz * 0.63], [C + 0.98, 2.1, sz * 0.63], 0.045, m.frameDark); for (const sx of [-1, 1]) prof(dc, [C + sx * 0.98, 2.1, -0.63], [C + sx * 0.98, 2.1, 0.63], 0.045, m.frameDark);
    for (const sz of [-1, 1]) box(dc, m.glass, 1.9, 1.3, 0.008, C, 1.43, sz * 0.63); for (const sx of [-1, 1]) { box(dc, m.glass, 0.008, 1.0, 1.2, C + sx * 0.98, 1.6, 0); box(dc, m.black, 0.012, 0.25, 0.62, C + sx * 0.98, 0.98, 0); }
    box(dc, m.sheet, 1.96, 0.02, 1.26, C, 2.12, 0); for (const sz of [-1, 1]) box(dc, m.aluDark, 1.8, 0.08, 0.08, C, 1.85, sz * 0.5);
    const dx = G('Disp_X', dc), dz = G('Disp_Z', dx); box(dx, m.aluDark, 0.12, 0.1, 1.08, C, 1.79, 0); box(dz, m.yellow, 0.16, 0.22, 0.12, C, 1.7, 0);
    const dn = G('Disp_Needle', dz); box(dn, m.aluDark, 0.06, 0.4, 0.06, C, 1.4, 0); cyl(dn, m.syringe, 0.022, 0.16, C + 0.06, 1.42, 0, 'y', 16); cyl(dn, m.paste, 0.016, 0.06, C + 0.06, 1.53, 0, 'y', 12);
    cyl(dn, m.steel, 0.006, 0.12, C, 1.14, 0, 'y', 8); cyl(dn, m.stainless, 0.0015, 0.03, C, 1.065, 0, 'y', 6);
    box(dc, m.black, 0.1, 0.12, 0.1, C, 1.98, -0.35); const ring = G('Align_Light', dc); cyl(ring, m.light, 0.06, 0.01, C, 1.85, -0.35, 'y', 24);
    box(dc, m.syringe, 0.18, 0.3, 0.18, C - 0.8, 2.28, 0.4); box(dc, m.paste, 0.14, 0.1, 0.14, C - 0.8, 2.2, 0.4);
    cyl(dc, m.black, 0.012, 0.25, C + 0.85, 2.25, 0.5, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.yellow], [2, m.red]]) cyl(dc, mt, 0.03, 0.06, C + 0.85, 2.4 + k * 0.065, 0.5, 'y', 14);
    box(dc, m.black, 0.06, 0.32, 0.42, C + 0.95, 1.5, 0.75); box(dc, m.screen, 0.004, 0.26, 0.36, C + 0.98, 1.5, 0.75);
    box(dc, m.screen, 0.5, 0.3, 0.02, C, 2.45, 0.66); box(dc, m.black, 0.54, 0.34, 0.01, C, 2.45, 0.65); // ONE STATION status display
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
  rollers(6.65, 8.1, 0); rollers(12.1, 13.15, 0); rollers(7.0, 13.0, 1.25); rollers(0.2, 1.05, 7.375, false); rollers(0.2, 1.05, 12.6, false); // loader / unload tables, return line, cross transfers
  for (const [x0, x1, z] of [[6.65, 8.1, 0], [12.1, 13.15, 0], [7.0, 13.0, 1.25]]) for (const sz of [-1, 1]) box(root, m.alu, x1 - x0, 0.1, 0.035, (x0 + x1) / 2, BT - 0.06, z + sz * 0.3);
  for (const [x, z] of [[6.75, 0], [8.0, 0], [12.2, 0], [13.05, 0], [7.1, 1.25], [9.0, 1.25], [11.0, 1.25], [12.9, 1.25]]) for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * 0.3], [x, BT - 0.11, z + sz * 0.3], 0.04); foot(root, x, z + sz * 0.3); }
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
  const NG = 5, slotOff = s => -0.525 + 0.35 * s;
  for (let j = -9; j < 9; j++) {
    const k = ((j % 8) + 8) % 8, PN = 'Core_' + (k + 1), b = P * j + 16, ng = k === NG;
    // picker: top blank stack in the AS/RS tote → belt
    add('Picker_X', 'x', [[b - 2, 0], [b - 1, -1.3], [b + 0.8, -1.3], [b + 2.8, 0]]);
    add('Picker_Y', 'y', [[b - 1, 0], [b - 0.2, -(1.714 - 1.366)], [b, -(1.714 - 1.366)], [b + 0.8, 0], [b + 2.8, 0], [b + 3.6, -(1.714 - BT)], [b + 3.8, -(1.714 - BT)], [b + 4.6, 0]]);
    add('Picker_Part', 'vis', [[b, true], [b + 3.8, false]]);
    add('Press_Ram', 'y', [[b + 8.4, 0], [b + 9.2, -0.62], [b + 9.6, -0.62], [b + 10.4, 0]]);
    add('Op_Stack_Arm_L', 'rx', [[b + 12.6, -0.15], [b + 13.4, -0.9], [b + 14.2, -0.5], [b + 15.0, -0.9], [b + 16.2, -0.5], [b + 17.0, -0.9], [b + 18.5, -0.4], [b + 19.4, -0.9], [b + 21.6, -0.9], [b + 22.4, -0.15]]);
    add('Op_Stack_Arm_R', 'rx', [[b + 12.6, -0.15], [b + 13.6, -0.6], [b + 14.4, -0.95], [b + 15.6, -0.6], [b + 16.6, -0.95], [b + 18.0, -0.5], [b + 19.0, -0.95], [b + 21.6, -0.95], [b + 22.4, -0.15]]);
    add('Op_Stack_Turn', 'ry', [[b + 13, 0], [b + 13.8, -0.5], [b + 14.6, 0], [b + 15.6, -0.5], [b + 16.4, 0], [b + 18.6, 0.5], [b + 19.4, 0]]);
    // the core: belt → press → stacking → dispensing → loader pick point
    const xs = [[b + 3.8, 0], [b + 4, 0], [b + 8, 1.2], [b + 10.6, 1.2], [b + 13, 2.8], [b + 22.6, 2.8], [b + 28, 4.6], [b + 29 + DT, 4.6], [b + 30.4 + DT, 6.4]];
    add(PN + '_Blank', 'vis', [[b + 3.8, true], [b + 9.3, false]]); add(PN + '_Formed', 'vis', [[b + 3.8, false], [b + 9.3, true], [b + 17, false]]);
    add(PN + '_Core', 'vis', [[b + 3.8, false], [b + 17, true]]); add(PN + '_Clamp', 'vis', [[b + 3.8, false], [b + 21, true]]);
    const D = b + 29, q = DT / 12; [1, 2, 3].forEach(s => add(PN + '_Paste_' + s, 'vis', [[b + 3.8, false], [D + 3.7 * s * q, true]]));
    if (!o.manual) {
      add('Align_Light', 'vis', [[D, true], [D + 0.4, false]]);
      add('Disp_X', 'x', [[D + 0.5, 0], [D + 1, -0.0625], [D + 4.2, -0.0625], [D + 4.7, 0], [D + 7.9, 0], [D + 8.4, 0.0625], [D + 11.6, 0.0625], [D + 12, 0]]);
      add('Disp_Z', 'z', [[D + 0.5, 0], [D + 1, -0.046], [D + 1.5, -0.046], [D + 3.7, 0.046], [D + 4.7, 0.046], [D + 7.4, -0.046], [D + 8.4, -0.046], [D + 11.1, 0.046], [D + 12, 0]]);
      add('Disp_Needle', 'y', [[D + 1, 0], [D + 1.5, -0.12], [D + 11.1, -0.12], [D + 11.6, 0]]);
    } else {
      add('Op_Disp_Arm_R', 'rx', [[D, -0.15], [D + q, -0.95], [D + 3.7 * q, -1.05], [D + 4.5 * q, -0.9], [D + 7.4 * q, -1.05], [D + 8.2 * q, -0.9], [D + 11.1 * q, -1.05], [D + 12 * q, -0.15]]);
      add('Op_Disp_Arm_L', 'rx', [[D, -0.15], [D + q, -0.8], [D + 11.1 * q, -0.8], [D + 12 * q, -0.15]]);
      add('Op_Disp_Turn', 'ry', [[D + q, 0], [D + 3.7 * q, 0.12], [D + 4.5 * q, -0.05], [D + 7.4 * q, 0.08], [D + 8.2 * q, -0.08], [D + 11.1 * q, 0.05], [D + 12 * q, 0]]);
    }
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
    if (ng) { xs.push([u + 7.3, 14.9]); zs.push([u + 7.6, 0], [u + 8.4, -0.55]); ys.push([u + 8.4, 0], [u + 9, -0.47]); add('NG_Pusher', 'z', [[u + 7.5, 0], [u + 8.4, -0.48], [u + 9.2, 0]]); end = u + 9.2; }
    else { xs.push([u + 12.8, 16.45], [u + 13.4, 16.85]); ys.push([u + 12.8, 0], [u + 13.4, -0.2]); end = u + 13.6; }
    add(PN, 'vis', [[b + 3.8, true], [a - 1.6, false], [a + 0.8, true], [u, false], [u + 1.9, true], [end, false]]);
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
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /^(Loader_Part|Unloader_Part|Picker_Part|Vision_Flash|Align_Light|Furnace_Glow)/.test(node) || /^Core_\d$/.test(node) || /_(Formed|Core|Clamp|Paste_\d|Brazed)$/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs, /_Arm_/.test(node) ? -0.15 : 0)]);
  }
  return cycleClip(finalize(root), 'Core_Cycle', TT, keys, 5 * 32 / P); // the slower line samples less often (same file size)
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
  brazed_core: brazedCore, tote_brazed: () => toteGrid('Tote_Brazed_Cores', brazedCore, 0.22, 0.09, 0.074), tote_coolers: () => toteGrid('Tote_Coolers', egrCooler, 0.28, 0.15, 0.139), egr_core_line: () => egrCoreLine(), egr_core_line_manual: () => egrCoreLine({ manual: true, pitch: 64 }), asrs_cell_a: () => asrsCell({ picks: ['A'] }), pack_box: packBox, insert_part: insertPart, dispensed_sub: dispensedSub, tote_dispensed: () => toteWith('Tote_Dispensed', dispensedSub, 8, 3, 0.03), tote_moulded: () => toteWith('Tote_Moulded', insertPart, 8, 2, 0.066), asrs_cell: asrsCell, injection_cell: injectionCell, egr_auto_line: egrAutoLine,
  asrs_crane: asrsCraneAnimated, asrs_rail_4m: () => asrsRail(4), dispense_cell: dispenseCellAnimated, vision_gantry: visionGantry, amr_deck_bot: amrDeckBot, press_line_2level: pressLine,
  ng_chute: ngChute, amr_roller_deck: amrRollerDeck, conveyor_stopper: stopperAnimated,
  fence_panel_1m: () => fencePanel(1.0), fence_panel_2m: () => fencePanel(2.0), tote_600x400: tote, egr_cooler: egrCooler,
  roller_conveyor_1m: () => rollerConveyor(1), roller_conveyor_2m: () => rollerConveyor(2), roller_curve_90: rollerCurve, belt_conveyor_2m: () => beltConveyor(2),
  rack_bay: () => rackBay('01'), ...Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08'].map(n => ['bay_sign_' + n, () => baySign(n)])),
  hall_wall_6m: wallPanel, hall_door_6m: doorPanel, hall_gable_24m: gableWall, hall_column: hallColumn, hall_roof_6m: roofTruss, floor_6m: () => floorTile(false), floor_6m_aisle: () => floorTile(true)
};
