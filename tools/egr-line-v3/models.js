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
function egrCoolerGeo(n) {
  const m = materials();
  box(n, m.stainless, 0.34, 0.09, 0.11, 0, 0.065, 0);                 // core shell
  for (const sx of [-1, 1]) {
    box(n, m.stainless, 0.012, 0.13, 0.15, sx * 0.176, 0.065, 0);     // flanges
    cyl(n, m.stainless, 0.03, 0.05, sx * 0.13, 0.13, 0.03, 'y', 16);  // coolant ports
    cyl(n, m.aluDark, 0.022, 0.03, sx * 0.205, 0.065, 0, 'x', 16);
  }
  for (let x = -0.12; x <= 0.121; x += 0.06) box(n, m.steel, 0.006, 0.094, 0.114, x, 0.065, 0); // ribs
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

export const MODELS = {
  asrs_crane: asrsCrane, asrs_rail_4m: () => asrsRail(4), dispense_cell: dispenseCell, vision_gantry: visionGantry,
  ng_chute: ngChute, amr_roller_deck: amrRollerDeck, conveyor_stopper: conveyorStopper,
  fence_panel_1m: () => fencePanel(1.0), fence_panel_2m: () => fencePanel(2.0), tote_600x400: tote, egr_cooler: egrCooler,
  roller_conveyor_1m: () => rollerConveyor(1), roller_conveyor_2m: () => rollerConveyor(2), roller_curve_90: rollerCurve, belt_conveyor_2m: () => beltConveyor(2),
  rack_bay: () => rackBay('01'), ...Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08'].map(n => ['bay_sign_' + n, () => baySign(n)])),
  hall_wall_6m: wallPanel, hall_door_6m: doorPanel, hall_gable_24m: gableWall, hall_column: hallColumn, hall_roof_6m: roofTruss, floor_6m: () => floorTile(false), floor_6m_aisle: () => floorTile(true)
};
