/* EGR cooler Ni-paste station console — One Automation × Korens */
(() => {
const K = KIN, D2R = Math.PI / 180, Y = new THREE.Vector3(0, 1, 0);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const HERO = !!window.HERO_MODE;
const TABLE_Y = 0.85, BASE_Y = 0.95, JIG_Z = 0.45, NEST_TOP = 0.91;
const ST_Z = { dmc: -0.58, scale: -0.62 };
const TOOL_G = K.trans(0, 0, 0.155);
const TOOL_N = K.trans(0, 0, 0.237);            // syringe needle tip (dispensing FR5)
const POS = { x: 0.30, z: -0.66, hA: TABLE_Y + 0.38 }; // 2-axis tilt/rotate positioner
const R2_AT = { x: 0.90, z: -0.66, rise: 0.2 };            // dispensing FR5 pedestal
const LAYOUT_X = { dmc: -0.66, scale: -0.24 };
const TUNE = { side: 0.7, up: 0.7, ready: 0.34 };
const PASTE_RHO = 0.0046; // g/mm^3 (Ni brazing paste, approx.)

const STEPS = ['지그 로딩·센서 확인', 'START·도어 닫힘', '파트 픽업', 'DMC 판독', '계량 (도포 전)', '포지셔너 회전 · Ni 페이스트 도포', '계량 (도포 후)', '지그 복귀', '판정·도어 열림'];

const cfg = {
  variant: 'tube', cell: 'rail', slots: 6, beadW: 2.0, speed: 30, tol: 8, fault: 5,
  fence: true, paths: false, reach: false, sim: 4, follow: false, joints: null
};

/* ---------- renderer / scene ---------- */
const canvas = HERO ? $('#heroCanvas') : $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = HERO ? 0.7 : 0.82;
const scene = new THREE.Scene();
scene.background = new THREE.Color(HERO ? 0x050607 : 0x0b0d10);
scene.fog = HERO ? new THREE.Fog(0x050607, 2.2, 7) : new THREE.Fog(0x0b0d10, 9, 24);
const pmrem = new THREE.PMREMGenerator(renderer);
if (THREE.RoomEnvironment) scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 80);
camera.position.set(3.3, 2.7, 3.7);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 0.4; controls.maxDistance = 9;

scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x16191e, 0.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.25);
sun.position.set(3, 6, 4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 1, far: 15 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45); fill.position.set(-4, 3, -3); scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.9, envMapIntensity: 0.1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(40, 80, 0x2c323b, 0x1b1f25); grid.position.y = 0.002; scene.add(grid);
// floor safety marking
{
  const m = new THREE.MeshBasicMaterial({ color: 0xd6b21a });
  window.__floorMat = m;
}

/* ---------- materials ---------- */
const std = (color, metalness, roughness, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra || {}));
const M = {
  steel: std(0xd3d7dc, 0.9, 0.28),
  steelDark: std(0x9aa1a8, 0.85, 0.38),
  alu: std(0xb9bfc6, 0.75, 0.42),
  cabinet: std(0x23272e, 0.3, 0.62),
  top: std(0x50565e, 0.7, 0.5),
  brand: std(0x006282, 0.35, 0.45),
  pc: new THREE.MeshPhysicalMaterial({ color: 0xcfe0ee, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
  white: std(0xeceef0, 0.05, 0.38),
  cap: std(0x2f343b, 0.3, 0.5),
  black: std(0x16181c, 0.2, 0.6),
  pom: std(0x24272c, 0.05, 0.75),
  jig: std(0x41607f, 0.6, 0.4),
  paste: std(0x1f2226, 0.0, 1.0, { envMapIntensity: 0.12 }),
  pasteHi: std(0x50656a, 0.1, 0.9, { emissive: 0x00806f, emissiveIntensity: 0.8 }),
  rubber: std(0x0f1012, 0, 0.9),
  gold: std(0xc9a64a, 0.9, 0.35),
  yellow: std(0xe0b21c, 0.2, 0.55),
  path: new THREE.LineDashedMaterial({ color: 0x00e8d0, dashSize: 0.006, gapSize: 0.004, transparent: true, opacity: 0.9 })
};
[M.cabinet, M.pom, M.black, M.white, M.cap, M.brand, M.yellow, M.rubber].forEach(m => m.envMapIntensity = 0.45);
M.top.envMapIntensity = 0.6;
const lamp = (c) => std(c, 0, 0.4, { emissive: c, emissiveIntensity: 0 });

/* ---------- geometry helpers ---------- */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 40),
  cylZ: new THREE.CylinderGeometry(1, 1, 1, 40).rotateX(Math.PI / 2),
  cylX: new THREE.CylinderGeometry(1, 1, 1, 32).rotateZ(Math.PI / 2)
};
function mesh(geo, mat, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
function box(w, h, d, mat, x, y, z, parent) { const m = mesh(G.box, mat, parent); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
function cyl(r, h, mat, x, y, z, parent, geo = G.cyl) { const m = mesh(geo, mat, parent); m.scale.set(r, h, r); if (geo === G.cylZ) m.scale.set(r, r, h); if (geo === G.cylX) m.scale.set(h, r, r); m.position.set(x, y, z); return m; }
function stadium(w, h, holes) {
  const r = h / 2, s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -r); s.lineTo(w / 2 - r, -r); s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, r); s.absarc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  for (const [x, y, rr] of holes || []) { const p = new THREE.Path(); p.absarc(x, y, rr, 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
const m4 = a => new THREE.Matrix4().set(...a);
const fromM4 = m => { const e = m.elements; return [e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14], 0, 0, 0, 1]; };
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const neg = a => [-a[0], -a[1], -a[2]];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rnd = rng(20261022);
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
  const api = { c, ctx, tex, draw: (...a) => { draw(ctx, w, h, ...a); tex.needsUpdate = true; } };
  api.draw(); return api;
}
function dmcTexture(code) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c9cdd1'; ctx.fillRect(0, 0, w, h);
    const n = 16, cell = (w - 16) / n; const r = rng([...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    ctx.fillStyle = '#1b1d20';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const border = i === 0 || j === n - 1 || (i === n - 1 && j % 2 === 0) || (j === 0 && i % 2 === 1);
      if (border || r() > 0.52) ctx.fillRect(8 + j * cell, 8 + i * cell, cell + 0.4, cell + 0.4);
    }
  });
}

/* =========================================================
   ROBOT  (FAIRINO FR5, UR-type DH)
   ========================================================= */
function buildRobot(parent, x, z, kind) {
  const by = kind === 'dispenser' ? BASE_Y + R2_AT.rise : BASE_Y;
  const root = new THREE.Group(); root.position.set(x, by, z); root.rotation.x = -Math.PI / 2; parent.add(root);
  const L = {};
  const mk = (name, mat) => (L[name] = mesh(G.cyl, mat, root));
  ['base', 'j2h', 'upper', 'j3h', 'fore', 'j4h', 'j5h', 'j6h'].forEach(n => mk(n, M.white));
  ['baseRing', 'j1cap', 'j2cap', 'j3cap', 'j4cap', 'j5cap', 'j6cap', 'flange'].forEach(n => mk(n, M.cap));
  const tool = new THREE.Group(); tool.matrixAutoUpdate = false; root.add(tool);
  cyl(0.032, 0.02, M.cap, 0, 0, 0.01, tool, G.cylZ);
  let fingers = null, glow = null, pasteFill = null;
  if (kind === 'handler') {
    // parallel gripper: flange adapter -> actuator body -> linear guide; each finger hangs from a jaw carrier on the guide
    box(0.07, 0.06, 0.008, M.brand, 0, 0, 0.024, tool);
    box(0.07, 0.06, 0.04, M.alu, 0, 0, 0.048, tool);
    box(0.24, 0.05, 0.016, M.alu, 0, 0, 0.076, tool);          // guide rail
    box(0.236, 0.012, 0.004, M.steel, 0, 0.026, 0.076, tool);
    fingers = [1, -1].map(sg => {
      const f = new THREE.Group(); tool.add(f);
      box(0.034, 0.054, 0.016, M.cap, 0, 0, 0.092, f);         // jaw carrier riding on the guide
      box(0.012, 0.04, 0.062, M.steelDark, 0, 0, 0.128, f);     // finger
      box(0.004, 0.034, 0.03, M.rubber, -sg * 0.008, 0, 0.142, f); // grip pad facing the part
      return f;
    });
  } else {
    // pneumatic syringe dispenser: 30cc barrel, air adapter + hose, luer needle
    cyl(0.03, 0.012, M.alu, 0, 0, 0.026, tool, G.cylZ);
    box(0.05, 0.05, 0.03, M.alu, 0, 0, 0.047, tool);
    box(0.052, 0.052, 0.006, M.brand, 0, 0, 0.034, tool);
    cyl(0.017, 0.016, std(0x2bb673, 0.1, 0.5), 0, 0, 0.068, tool, G.cylZ);           // green air adapter
    const barrelMat = new THREE.MeshPhysicalMaterial({ color: 0x8f86d8, transparent: true, opacity: 0.5, roughness: 0.15, depthWrite: false });
    cyl(0.0095, 0.11, barrelMat, 0, 0, 0.131, tool, G.cylZ);                            // 10cc barrel
    pasteFill = cyl(0.0075, 0.07, M.paste, 0, 0, 0.15, tool, G.cylZ);
    cyl(0.014, 0.004, barrelMat, 0, 0, 0.078, tool, G.cylZ);                            // finger flange
    box(0.01, 0.03, 0.05, M.alu, 0.016, 0, 0.1, tool);                                   // barrel clamp
    mesh(new THREE.CylinderGeometry(0.004, 0.0075, 0.014, 20).rotateX(-Math.PI / 2), barrelMat, tool).position.z = 0.193;
    mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 16).rotateX(-Math.PI / 2), std(0x2bb673, 0, 0.5), tool).position.z = 0.203; // luer hub
    mesh(new THREE.CylinderGeometry(0.0007, 0.0009, 0.031, 10).rotateX(-Math.PI / 2), M.steel, tool).position.z = 0.2215;  // 1" needle
    const hose = new THREE.CatmullRomCurve3([[0, 0.012, 0.062], [0, 0.05, 0.05], [0, 0.07, 0.0], [0, 0.06, -0.06], [0, 0.04, -0.1]].map(p => new THREE.Vector3(...p)));
    mesh(new THREE.TubeGeometry(hose, 24, 0.0035, 8), std(0xd8dde2, 0, 0.6), tool);
    glow = new THREE.Mesh(new THREE.SphereGeometry(0.004, 16, 12), new THREE.MeshBasicMaterial({ color: 0x00e8d0, transparent: true, opacity: 0.0 }));
    glow.position.z = 0.238; tool.add(glow);
  }
  // reach envelope (shown on demand): filled shell + wire + equator ring
  const reach = new THREE.Group(); reach.position.z = 0.152; root.add(reach); reach.visible = cfg.reach;
  const rc = kind === 'handler' ? 0x2fa7d6 : 0x00e8d0;
  reach.add(new THREE.Mesh(new THREE.SphereGeometry(0.922, 48, 24), new THREE.MeshBasicMaterial({ color: rc, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })));
  reach.add(new THREE.Mesh(new THREE.SphereGeometry(0.924, 24, 12), new THREE.MeshBasicMaterial({ color: rc, wireframe: true, transparent: true, opacity: 0.32 })));
  reach.add(new THREE.Mesh(new THREE.TorusGeometry(0.922, 0.004, 6, 96), new THREE.MeshBasicMaterial({ color: rc })));

  const v = (a, i) => new THREE.Vector3(a[i * 4 + 3] !== undefined ? 0 : 0, 0, 0);
  const P = T => new THREE.Vector3(T[3], T[7], T[11]);
  const Z = T => new THREE.Vector3(T[2], T[6], T[10]);
  function between(m, a, b, r) {
    const d = b.clone().sub(a), len = d.length(); m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(Y, d.normalize()); m.scale.set(r, len, r);
  }
  function along(m, c, dir, r, len) { m.position.copy(c); m.quaternion.setFromUnitVectors(Y, dir.clone().normalize()); m.scale.set(r, len, r); }

  const robot = {
    root, x, z, tool, fingers, glow, reach, pasteFill, kind,
    q: [90, -90, 90, -90, -90, 0].map(d => d * D2R),
    s: x, grip: 1, gripW: 0.10, ext: 0, ikFail: 0,
    W(s) { return K.mul(K.trans(s, by, z), K.rotX(-Math.PI / 2)); },
    flangeW() { return K.mul(this.W(this.s), K.fk(this.q)[6]); },
    tcpW(tool) { return K.mul(this.flangeW(), tool); },
    update() {
      root.position.x = this.s;
      const fr = K.fk(this.q);
      const o = fr.map(P), z_ = fr.map(Z);
      const s1 = 0.128, s2 = 0.012;
      between(L.base, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.12), 0.066);
      between(L.baseRing, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.018), 0.075);
      along(L.j1cap, new THREE.Vector3(0, 0, 0.122), new THREE.Vector3(0, 0, 1), 0.067, 0.012);
      // shoulder (J2) housing
      along(L.j2h, o[1].clone().addScaledVector(z_[1], 0.05), z_[1], 0.064, 0.17);
      along(L.j2cap, o[1].clone().addScaledVector(z_[1], -0.04), z_[1], 0.0645, 0.012);
      between(L.upper, o[1].clone().addScaledVector(z_[1], s1), o[2].clone().addScaledVector(z_[1], s1), 0.047);
      // elbow J3
      along(L.j3h, o[2].clone().addScaledVector(z_[2], (s1 + s2) / 2), z_[2], 0.052, s1 - s2 + 0.1);
      along(L.j3cap, o[2].clone().addScaledVector(z_[2], s1 + 0.05), z_[2], 0.0525, 0.012);
      between(L.fore, o[2].clone().addScaledVector(z_[2], s2), o[3].clone().addScaledVector(z_[2], s2), 0.037);
      // wrist
      along(L.j4h, o[3].clone().addScaledVector(z_[3], 0.055), z_[3], 0.041, 0.12);
      along(L.j4cap, o[3].clone().addScaledVector(z_[3], -0.009), z_[3], 0.0415, 0.01);
      along(L.j5h, o[4].clone().addScaledVector(z_[4], 0.045), z_[4], 0.041, 0.115);
      along(L.j5cap, o[4].clone().addScaledVector(z_[4], -0.016), z_[4], 0.0415, 0.01);
      along(L.j6h, o[5].clone().addScaledVector(z_[5], 0.04), z_[5], 0.04, 0.11);
      along(L.j6cap, o[5].clone().addScaledVector(z_[5], -0.018), z_[5], 0.0405, 0.01);
      along(L.flange, o[6].clone().addScaledVector(z_[6], -0.004), z_[6], 0.032, 0.008);
      tool.matrix.copy(m4(fr[6]));
      if (fingers) { const half = this.gripW / 2 + 0.007 + this.grip * 0.022; fingers[0].position.x = half; fingers[1].position.x = -half; }
    }
  };
  robot.update();
  return robot;
}

/* =========================================================
   PARTS
   ========================================================= */
function ringPts(c, axis, r, a0, a1, tilt) {
  // axis 'z' | 'x' | 'y'; normal sweep on the side facing +Y (for x,z) or around (for y)
  const pts = []; const n = Math.max(12, Math.round(Math.abs(a1 - a0) / 6));
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n) * D2R; let nn, rad, xr;
    if (axis === 'z') { rad = [Math.sin(a), Math.cos(a), 0]; nn = rad; xr = [0, 0, 1]; }
    else if (axis === 'x') { rad = [0, Math.cos(a), Math.sin(a)]; nn = rad; xr = [1, 0, 0]; }
    else { rad = [Math.cos(a), 0, Math.sin(a)]; const s = Math.SQRT1_2; nn = [rad[0] * s, s, rad[2] * s]; xr = [1, 0, 0]; }
    pts.push({ p: add3(c, rad, r), n: nn, x: xr });
  }
  return pts;
}
function linePts(a, b, n, xr) { const pts = []; const k = 10; for (let i = 0; i <= k; i++) { const t = i / k; pts.push({ p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], n, x: xr }); } return pts; }
const pathLen = pts => pts.reduce((s, q, i) => i ? s + Math.hypot(q.p[0] - pts[i - 1].p[0], q.p[1] - pts[i - 1].p[1], q.p[2] - pts[i - 1].p[2]) : 0, 0);

const VARIANTS = {
  tube: {
    name: '튜브형 EGR 쿨러', sub: 'Gamma 1.6 T-GDi 계열 · 쉘&튜브', baseMass: 1186.4, gripW: 0.10,
    grip: [0, 0.045, -0.005], codePrefix: 'KR-GT',
    joints: () => {
      const H = 0.065;
      return [
        { id: 'T1', name: '입구 파이프–탱크', pts: ringPts([0, H / 2, 0.137], 'z', 0.0185, -90, 270), axis: [0, 0, 1] },
        { id: 'T2', name: '입구 플랜지–파이프', pts: ringPts([0, H / 2, 0.176], 'z', 0.0185, -90, 270), axis: [0, 0, 1], np: 10 },
        { id: 'T3', name: '출구 파이프–탱크', pts: ringPts([0, H / 2, -0.137], 'z', 0.0165, -90, 270), axis: [0, 0, 1] },
        { id: 'T4', name: '냉각수 포트 A', pts: ringPts([0.064, 0.035, 0.06], 'x', 0.0095, -90, 270), axis: [1, 0, 0] },
        { id: 'T5', name: '냉각수 포트 B', pts: ringPts([-0.064, 0.03, -0.06], 'x', 0.0095, -90, 270), axis: [1, 0, 0] },
        { id: 'T6', name: '쉘–탱크 심 (입구측)', pts: linePts([-0.046, H, 0.1], [0.046, H, 0.1], [0, 1, 0], [1, 0, 0]) },
        { id: 'T7', name: '쉘–탱크 심 (출구측)', pts: linePts([0.046, H, -0.1], [-0.046, H, -0.1], [0, 1, 0], [1, 0, 0]) }
      ];
    }
  },
  plate: {
    name: '플레이트형 쿨러 커버', sub: '프레스 커버 · 플랜지 2구', baseMass: 412.8, gripW: 0.15,
    grip: [0, 0.012, 0], codePrefix: 'KR-PC',
    joints: () => [
      { id: 'P1', name: '플랜지 스텁–커버 (상단)', pts: ringPts([0, 0.021, 0.165], 'y', 0.0175, -170, 170), axis: [0, 1, 0] },
      { id: 'P2', name: '플랜지 스텁–커버 (하단)', pts: ringPts([0, 0.021, -0.165], 'y', 0.0175, -170, 170), axis: [0, 1, 0] },
      { id: 'P3', name: '림 심 (좌)', pts: linePts([-0.058, 0.02, -0.13], [-0.058, 0.02, 0.13], [-0.5, 0.866, 0], [0, 0, 1]) },
      { id: 'P4', name: '림 심 (우)', pts: linePts([0.058, 0.02, 0.13], [0.058, 0.02, -0.13], [0.5, 0.866, 0], [0, 0, 1]) }
    ]
  }
};

function buildPartMesh(variant, code) {
  const g = new THREE.Group();
  if (variant === 'tube') {
    const H = 0.065, W = 0.10, Ls = 0.20;
    box(W, H, Ls, M.steel, 0, H / 2, 0, g);
    box(W + 0.004, H + 0.001, 0.006, M.steelDark, 0, H / 2, 0.097, g);
    box(W + 0.004, H + 0.001, 0.006, M.steelDark, 0, H / 2, -0.097, g);
    const dim = new THREE.TorusGeometry(0.011, 0.0018, 8, 32).rotateX(Math.PI / 2);
    const dimC = new THREE.CircleGeometry(0.0095, 28).rotateX(-Math.PI / 2);
    for (const xx of [-0.025, 0.025]) for (const zz of [-0.075, -0.025, 0.025, 0.075]) {
      const t = mesh(dim, M.steel, g, false); t.position.set(xx, H + 0.0004, zz);
      const c = mesh(dimC, M.steelDark, g, false); c.position.set(xx, H + 0.0006, zz);
    }
    const tank = (dir) => {
      const geo = new THREE.CylinderGeometry(0.028, 0.0707, 0.035, 4, 1).rotateY(Math.PI / 4).rotateX(dir * Math.PI / 2).scale(1, 0.65, 1);
      const m = mesh(geo, M.steel, g); m.position.set(0, H / 2, dir * 0.1175);
    };
    tank(1); tank(-1);
    cyl(0.018, 0.045, M.steel, 0, H / 2, 0.1575, g, G.cylZ);
    const fl = mesh(new THREE.ExtrudeGeometry(stadium(0.088, 0.044, [[0, 0, 0.017], [-0.032, 0, 0.0045], [0.032, 0, 0.0045]]), { depth: 0.012, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, curveSegments: 24 }), M.steelDark, g);
    fl.position.set(0, H / 2, 0.18); fl.rotation.z = 25 * D2R;
    cyl(0.016, 0.028, M.steel, 0, H / 2, -0.149, g, G.cylZ);
    const fl2 = mesh(new THREE.ExtrudeGeometry(stadium(0.07, 0.04, [[0, 0, 0.015], [-0.024, 0, 0.004], [0.024, 0, 0.004]]), { depth: 0.01, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, curveSegments: 24 }), M.steelDark, g);
    fl2.position.set(0, H / 2, -0.173); fl2.rotation.z = -35 * D2R;
    const pipe = pts => { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'); mesh(new THREE.TubeGeometry(c, 80, 0.009, 16), M.steel, g); };
    pipe([[0.05, 0.035, 0.06], [0.07, 0.035, 0.06], [0.083, 0.035, 0.05], [0.088, 0.035, 0.03], [0.088, 0.035, -0.2], [0.088, 0.035, -0.235]]);
    pipe([[-0.05, 0.03, -0.06], [-0.07, 0.03, -0.06], [-0.083, 0.03, -0.05], [-0.088, 0.03, -0.03], [-0.088, 0.03, 0.2], [-0.088, 0.03, 0.235]]);
    cyl(0.0125, 0.012, M.steelDark, 0.056, 0.035, 0.06, g, G.cylX);
    cyl(0.0125, 0.012, M.steelDark, -0.056, 0.03, -0.06, g, G.cylX);
    const barb = new THREE.TorusGeometry(0.0095, 0.0016, 8, 24);
    for (const [xx, yy, zz] of [[0.088, 0.035, -0.222], [-0.088, 0.03, 0.222]]) { const b = mesh(barb, M.steel, g); b.position.set(xx, yy, zz); }
    box(0.004, 0.03, 0.035, M.steelDark, -0.052, 0.035, 0.035, g);
    const dmc = dmcTexture(code);
    const d = mesh(new THREE.PlaneGeometry(0.022, 0.022).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dmc.tex, roughness: 0.6, metalness: 0.3 }), g, false);
    d.position.set(0, H + 0.0007, 0);
  } else {
    const base = mesh(new THREE.ExtrudeGeometry(roundRect(0.15, 0.40, 0.03), { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, curveSegments: 12 }).rotateX(-Math.PI / 2), M.steel, g);
    base.position.y = 0.002;
    const raised = mesh(new THREE.ExtrudeGeometry(roundRect(0.11, 0.35, 0.02), { depth: 0.01, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, curveSegments: 12 }).rotateX(-Math.PI / 2), M.steel, g);
    raised.position.y = 0.006;
    for (const zz of [-0.1, 0.1]) box(0.06, 0.002, 0.05, M.steelDark, 0, 0.0205, zz, g);
    const cap = new THREE.CapsuleGeometry(0.011, 0.045, 6, 16).rotateZ(Math.PI / 2).scale(1, 0.35, 1);
    for (const zz of [-0.032, 0, 0.032]) { const c = mesh(cap, M.steel, g); c.position.set(0, 0.02, zz); }
    const hole = new THREE.CylinderGeometry(0.0045, 0.0045, 0.0125, 16);
    for (const zz of [-0.17, -0.085, 0, 0.085, 0.17]) for (const xx of [-0.064, 0.064]) { const h = mesh(hole, M.black, g, false); h.position.set(xx, 0.006, zz); }
    for (const zz of [0.165, -0.165]) {
      cyl(0.016, 0.03, M.steel, 0, 0.034, zz, g);
      const fl = mesh(new THREE.ExtrudeGeometry(stadium(0.076, 0.04, [[0, 0, 0.0145], [-0.026, 0, 0.004], [0.026, 0, 0.004]]), { depth: 0.01, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, curveSegments: 24 }).rotateX(-Math.PI / 2), M.steelDark, g);
      fl.position.set(0, 0.048, zz); fl.rotation.y = (zz > 0 ? 20 : -20) * D2R;
    }
    const dmc = dmcTexture(code);
    const d = mesh(new THREE.PlaneGeometry(0.02, 0.02).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dmc.tex, roughness: 0.6, metalness: 0.3 }), g, false);
    d.position.set(0.03, 0.0215, -0.06);
  }
  return g;
}

function makePart(variant, slotIdx, code) {
  const V = VARIANTS[variant];
  const obj = buildPartMesh(variant, code);
  obj.matrixAutoUpdate = false; scene.add(obj);
  const joints = V.joints().filter(j => cfg.joints.has(j.id));
  const r = cfg.beadW / 2000 * 1.5; // visual radius (exaggerated for legibility)
  let target = 0;
  for (const j of joints) {
    // a full ring is laid in two half passes; the positioner turns the part between them (like the operator's left hand)
    const n = j.pts.length;
    const NP = n > 40 ? (j.np || 6) : 1, cuts = [...Array(NP + 1)].map((_, k) => Math.round(k * (n - 1) / NP));
    j.passes = cuts.slice(0, -1).map((c, k) => [c, cuts[k + 1]]);
    j.len = pathLen(j.pts) * 1000; // mm
    const area = Math.PI / 4 * cfg.beadW * (cfg.beadW * 0.6);
    j.target = j.len * area * PASTE_RHO; // g
    target += j.target;
    j.factor = 1 + gauss() * 0.022;
    // bead mesh
    const c = new THREE.CatmullRomCurve3(j.pts.map(q => new THREE.Vector3(...add3(q.p, q.n, r * 0.6))));
    const segs = j.pts.length * 3;
    j.geo = new THREE.TubeGeometry(c, segs, r, 8, false);
    j.idxTotal = j.geo.index.count; j.geo.setDrawRange(0, 0);
    j.mesh = mesh(j.geo, M.paste, obj, false);
    // path line
    const lg = new THREE.BufferGeometry().setFromPoints(j.pts.map(q => new THREE.Vector3(...add3(q.p, q.n, 0.0015))));
    j.line = new THREE.Line(lg, M.path); j.line.computeLineDistances(); j.line.visible = cfg.paths; obj.add(j.line);
    j.done = 0;
  }
  // fault injection (simulated)
  let fault = null;
  if (joints.length && rnd() * 100 < cfg.fault) {
    const j = joints[Math.floor(rnd() * joints.length)];
    const over = rnd() < 0.4;
    j.factor = over ? 1.32 + rnd() * 0.15 : 0.45 + rnd() * 0.2;
    fault = { joint: j.id, kind: over ? '과토출' : '토출 부족 (노즐 막힘)' };
  }
  for (const j of joints) j.mesh.scale.setScalar(1); // visual factor applied by radius below
  return {
    obj, variant, slotIdx, code, joints, target, fault, gripLocal: K.pose(V.grip, [0, -1, 0], [1, 0, 0]),
    baseMass: V.baseMass + gauss() * 1.6, dispensed: 0, mount: null, ready: false, pasted: false, w0: null, w1: null, state: 'loaded', held: null, pose: null,
    setPose(T) { this.pose = T; obj.matrix.copy(m4(T)); obj.matrixWorldNeedsUpdate = true; }
  };
}

/* =========================================================
   STATION
   ========================================================= */
let ST = null; // current station
function layout() {
  const n = cfg.slots, sp = 0.22;
  const slotsX = [...Array(n)].map((_, i) => +((i - (n - 1) / 2) * sp).toFixed(3));
  const xs = slotsX.concat([LAYOUT_X.dmc, LAYOUT_X.scale, POS.x]);
  const robots = [
    { name: 'R1', kind: 'handler', x: 0, z: -0.12, rail: true, railRange: [Math.min(...xs), Math.max(...xs)], dmcX: LAYOUT_X.dmc, scaleX: LAYOUT_X.scale, slots: slotsX.map((_, i) => i) },
    { name: 'R2', kind: 'dispenser', x: R2_AT.x, z: R2_AT.z, rail: false }
  ];
  // enclosure sized so both arms' swept volume (measured over full cycles) stays inside the glass
  const ext = Math.max(1.3, robots[0].railRange[1] + 0.72, -robots[0].railRange[0] + 0.72, R2_AT.x + 0.62, Math.max(...slotsX.map(Math.abs)) + 0.2);
  const W = Math.ceil(ext * 2 * 10) / 10;
  const zBack = -1.35, zFront = 0.8;
  return { slotsX, robots, W, D: zFront - zBack, zc: (zFront + zBack) / 2 };
}
function posePart(A, C) {
  // tilt axis runs along world Z so the part can be tipped toward the dispensing robot on the +X side
  return K.mul(K.trans(POS.x, POS.hA, POS.z), K.mul(K.rotY(-Math.PI / 2), K.mul(K.rotX(A), K.mul(K.rotY(C), K.mul(K.trans(0, 0.025, 0), K.rotY(Math.PI / 2))))));
}

function disposeGroup(g) {
  g.traverse(o => { if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); });
  g.parent && g.parent.remove(g);
}

function buildStation() {
  if (ST) { disposeGroup(ST.group); ST.parts.forEach(p => disposeGroup(p.obj)); }
  const LY = layout();
  const g = new THREE.Group(); scene.add(g);
  const { W, D, zc } = LY, x0 = -W / 2, x1 = W / 2, z0 = zc - D / 2, z1 = zc + D / 2;
  { const fw = W + 1.6, fd = D + 1.6;
    for (const [w, d, x, z] of [[fw, 0.05, 0, zc + fd / 2], [fw, 0.05, 0, zc - fd / 2], [0.05, fd, -fw / 2, zc], [0.05, fd, fw / 2, zc]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), window.__floorMat); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.003, z); g.add(s); } }
  // --- base cabinet & table
  box(W, TABLE_Y - 0.1, D, M.cabinet, 0, (TABLE_Y - 0.1) / 2 + 0.07, zc, g);
  box(W + 0.02, 0.03, D + 0.02, M.top, 0, TABLE_Y - 0.015, zc, g);
  box(W + 0.004, 0.035, 0.004, M.brand, 0, TABLE_Y - 0.12, z1 + 0.001, g);
  for (const xx of [x0 + 0.08, x1 - 0.08]) for (const zz of [z0 + 0.08, z1 - 0.08]) { cyl(0.03, 0.02, M.black, xx, 0.01, zz, g); cyl(0.01, 0.06, M.steelDark, xx, 0.05, zz, g); }
  // cabinet doors lines + nameplate
  for (let i = 1; i < 3; i++) box(0.004, TABLE_Y - 0.3, 0.004, M.black, x0 + (W / 3) * i, 0.42, z1 + 0.002, g);
  const plate = canvasTex(512, 96, (ctx, w, h) => {
    ctx.textAlign = 'center'; ctx.fillStyle = '#1a1d21'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c3137'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.fillStyle = '#f4f5f6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) { const lw = 380, lh = lw * 120 / 800; ctx.globalAlpha = 0.72; ctx.drawImage(LOGO_IMG, (w - lw) / 2, (h - lh) / 2, lw, lh); ctx.globalAlpha = 1; }
    else { ctx.font = '600 40px "Bodoni Moda", "Didot", Georgia, serif'; ctx.fillText('ONE AUTOMATION', w / 2, 36); }

  });
  const pl = mesh(new THREE.PlaneGeometry(0.5, 0.094), new THREE.MeshStandardMaterial({ map: plate.tex, roughness: 0.85, metalness: 0.2, envMapIntensity: 0.35 }), g, false);
  pl.position.set(0, TABLE_Y - 0.24, z1 + 0.004);
  ST_plate = plate;
  // --- enclosure frame (40x40 profiles)
  const Htop = 2.32, pr = 0.04;
  const enc = new THREE.Group(); g.add(enc);
  const post = (x, z) => box(pr, Htop - TABLE_Y, pr, M.alu, x, (Htop + TABLE_Y) / 2, z, enc);
  for (const xx of [x0 + pr / 2, x1 - pr / 2]) for (const zz of [z0 + pr / 2, z1 - pr / 2]) post(xx, zz);
  const doorW = Math.min(1.2, W * 0.5);
  post(-doorW / 2 - pr / 2, z1 - pr / 2); post(doorW / 2 + pr / 2, z1 - pr / 2);
  for (const yy of [Htop - pr / 2, TABLE_Y + 0.02]) {
    box(W, pr, pr, M.alu, 0, yy, z0 + pr / 2, enc); box(W, pr, pr, M.alu, 0, yy, z1 - pr / 2, enc);
    box(pr, pr, D, M.alu, x0 + pr / 2, yy, zc, enc); box(pr, pr, D, M.alu, x1 - pr / 2, yy, zc, enc);
  }
  box(W, pr, pr, M.alu, 0, 1.78, z1 - pr / 2, enc);
  // panels
  const ph = Htop - TABLE_Y - 0.08, py = (Htop + TABLE_Y) / 2;
  const panel = (w, h, x, y, z, ry) => { const m = mesh(new THREE.PlaneGeometry(w, h), M.pc, enc, false); m.position.set(x, y, z); m.rotation.y = ry || 0; m.renderOrder = 2; return m; };
  panel(W - 0.08, ph, 0, py, z0 + 0.02);
  panel(D - 0.08, ph, x0 + 0.02, py, zc, Math.PI / 2);
  panel(D - 0.08, ph, x1 - 0.02, py, zc, Math.PI / 2);
  const sideW = (W - doorW) / 2 - pr;
  panel(sideW - 0.04, ph, x0 + pr + sideW / 2, py, z1 - 0.02);
  panel(sideW - 0.04, ph, x1 - pr - sideW / 2, py, z1 - 0.02);
  panel(doorW, Htop - 1.8 - 0.04, 0, (Htop + 1.8) / 2, z1 - 0.02);
  // bi-parting sliding door (Temex: front door closes during the cycle)
  const door = new THREE.Group(); door.position.set(0, 0, z1 + 0.03); g.add(door);
  const dh = 1.76 - TABLE_Y - 0.02, dy = (1.76 + TABLE_Y) / 2, hw = doorW / 2;
  const leaf = (sgn) => {
    const l = new THREE.Group(); door.add(l); l.userData.sgn = sgn;
    const cx = sgn * hw / 2, zz = sgn > 0 ? 0.0 : 0.035;
    box(hw, 0.03, 0.03, M.alu, cx, dy + dh / 2, zz, l); box(hw, 0.03, 0.03, M.alu, cx, dy - dh / 2, zz, l);
    box(0.03, dh, 0.03, M.alu, cx - hw / 2, dy, zz, l); box(0.03, dh, 0.03, M.alu, cx + hw / 2, dy, zz, l);
    const dp = mesh(new THREE.PlaneGeometry(hw - 0.03, dh - 0.03), M.pc, l, false); dp.position.set(cx, dy, zz); dp.renderOrder = 2;
    box(0.022, 0.22, 0.03, M.black, sgn * 0.05, dy, zz + 0.03, l);
    return l;
  };
  const leaves = [leaf(-1), leaf(1)];
  box(doorW * 2 + 0.1, 0.04, 0.08, M.alu, 0, 1.79, z1 + 0.045, g); // door rail
  enc.visible = cfg.fence; door.visible = cfg.fence;
  // tower light
  const tw = new THREE.Group(); tw.position.set(x1 - 0.1, Htop, z1 - 0.1); g.add(tw);
  cyl(0.012, 0.12, M.alu, 0, 0.06, 0, tw);
  const lamps = {};
  [['red', 0xff3b30, 0.15], ['amber', 0xffb020, 0.215], ['green', 0x3ddc84, 0.28]].forEach(([k, c, yy]) => {
    const m = lamp(c); lamps[k] = m; cyl(0.03, 0.06, m, 0, yy, 0, tw); cyl(0.031, 0.006, M.black, 0, yy + 0.033, 0, tw);
  });
  cyl(0.031, 0.02, M.black, 0, 0.32, 0, tw);
  // operator panel: start button + HMI
  const opx = x1 - 0.32;
  box(0.32, 0.12, 0.14, M.cabinet, opx, TABLE_Y + 0.0, z1 + 0.09, g);
  const startMat = lamp(0xffffff); cyl(0.022, 0.02, startMat, opx + 0.06, TABLE_Y + 0.065, z1 + 0.09, g);
  cyl(0.026, 0.012, M.black, opx + 0.06, TABLE_Y + 0.058, z1 + 0.09, g);
  const estop = std(0xd0121b, 0.1, 0.4); cyl(0.024, 0.03, estop, opx - 0.06, TABLE_Y + 0.075, z1 + 0.09, g);
  box(0.06, 0.012, 0.06, M.yellow, opx - 0.06, TABLE_Y + 0.062, z1 + 0.09, g);
  const hmi = canvasTex(512, 320, (ctx, w, h, st) => {
    st = st || { ok: 0, ng: 0, phase: '대기', n: 0, N: 0 };
    ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#00e8d0'; ctx.fillRect(0, 0, w, 6);
    ctx.fillStyle = '#e6e8eb'; ctx.font = '600 30px "IBM Plex Sans KR", sans-serif'; ctx.fillText('ONE AUTOMATION', 24, 52);
    ctx.fillStyle = '#8a929c'; ctx.font = '500 22px "IBM Plex Mono", monospace'; ctx.fillText('STATE  ' + st.phase, 24, 96);
    ctx.fillText('PART   ' + st.n + ' / ' + st.N, 24, 130);
    ctx.font = '700 64px "IBM Plex Mono", monospace'; ctx.fillStyle = '#3ddc84'; ctx.fillText('OK ' + st.ok, 24, 230);
    ctx.fillStyle = st.ng ? '#ff4d4f' : '#5a626c'; ctx.fillText('NG ' + st.ng, 280, 230);
    ctx.fillStyle = '#8a929c'; ctx.font = '500 18px "IBM Plex Mono", monospace'; ctx.fillText('ONE AUTOMATION · KORENS EGR LINE', 24, 292);
  });
  const arm = new THREE.Group(); arm.position.set(x0 + 0.22, TABLE_Y, z1 + 0.12); g.add(arm);
  cyl(0.02, 0.55, M.alu, 0, 0.275, 0, arm);
  const hb = box(0.34, 0.23, 0.04, M.black, 0, 0.62, 0.02, arm); hb.rotation.x = -0.25;
  const hs = mesh(new THREE.PlaneGeometry(0.31, 0.194), new THREE.MeshBasicMaterial({ map: hmi.tex }), arm, false);
  hs.position.set(0, 0.625, 0.045); hs.rotation.x = -0.25;

  // --- jig
  const jig = new THREE.Group(); g.add(jig);
  const span = (LY.slotsX.length - 1) * 0.22 + 0.24;
  box(span, 0.02, 0.46, M.jig, 0, TABLE_Y + 0.01, JIG_Z, jig);
  const sensors = [];
  const nestW = cfg.variant === 'tube' ? 0.13 : 0.17;
  LY.slotsX.forEach((sx, i) => {
    box(nestW, 0.04, 0.34, M.pom, sx, TABLE_Y + 0.04, JIG_Z, jig);
    box(nestW * 0.6, 0.004, 0.24, M.black, sx, NEST_TOP - 0.001, JIG_Z, jig);
    for (const dz of [-0.15, 0.15]) cyl(0.005, 0.02, M.steel, sx + nestW / 2 - 0.012, NEST_TOP + 0.008, JIG_Z + dz, jig);
    const sm = lamp(0x00e8d0);
    box(0.02, 0.02, 0.02, M.black, sx, TABLE_Y + 0.03, JIG_Z + 0.2, jig);
    cyl(0.006, 0.004, sm, sx, TABLE_Y + 0.03, JIG_Z + 0.211, jig, G.cylZ);
    sensors.push(sm);
    // slot number plate
    const t = canvasTex(64, 64, (ctx, w, h) => { ctx.fillStyle = '#1a1d22'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e6e8eb'; ctx.font = '700 38px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), 32, 46); });
    const np = mesh(new THREE.PlaneGeometry(0.03, 0.03).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t.tex }), jig, false);
    np.position.set(sx - nestW / 2 + 0.022, TABLE_Y + 0.0205, JIG_Z + 0.205);
  });

  // --- robots, rail, stations
  const robots = LY.robots.map((R, ri) => {
    const robot = buildRobot(g, R.x, R.z, R.kind);
    Object.assign(robot, { cfg: R, idx: ri, name: R.name });
    robot.gripW = VARIANTS[cfg.variant].gripW;
    if (R.rail) {
      const [a, b] = R.railRange, len = b - a + 0.42, cx = (a + b) / 2;
      box(len, 0.03, 0.24, M.cabinet, cx, TABLE_Y + 0.015, R.z, g);
      for (const dz of [-0.07, 0.07]) box(len, 0.02, 0.03, M.steel, cx, TABLE_Y + 0.04, R.z + dz, g);
      box(len - 0.1, 0.012, 0.012, M.brand, cx, TABLE_Y + 0.036, R.z, g);
      box(len * 0.55, 0.05, 0.05, M.black, cx - len * 0.2, TABLE_Y + 0.055, R.z - 0.15, g);
      robot.carriage = box(0.26, 0.05, 0.24, M.alu, R.x, TABLE_Y + 0.075, R.z, g);
      robot.s = R.x;
    } else {
      const ph = 0.1 + (R.kind === 'dispenser' ? R2_AT.rise : 0);
      cyl(0.11, ph, M.cabinet, R.x, TABLE_Y + ph / 2, R.z, g);
      cyl(0.112, 0.01, M.brand, R.x, TABLE_Y + ph - 0.01, R.z, g);
      robot.s = R.x;
    }
    robot.update();
    return robot;
  });
  const R1 = robots[0], R2 = robots[1], C1 = R1.cfg;
  // DMC reader (camera + ring light)
  const dm = new THREE.Group(); dm.position.set(C1.dmcX, TABLE_Y, ST_Z.dmc - 0.18); g.add(dm);
  box(0.05, 0.62, 0.05, M.alu, 0, 0.31, 0, dm);
  box(0.05, 0.05, 0.22, M.alu, 0, 0.6, 0.11, dm);
  box(0.06, 0.06, 0.09, M.black, 0, 0.6, 0.18, dm);
  cyl(0.018, 0.04, M.steelDark, 0, 0.555, 0.18, dm);
  const ring = lamp(0xffffff); const rg = mesh(new THREE.TorusGeometry(0.03, 0.006, 10, 32).rotateX(Math.PI / 2), ring, dm); rg.position.set(0, 0.53, 0.18);
  const dmcPose = K.trans(C1.dmcX, TABLE_Y + 0.40, ST_Z.dmc);
  // scale with nest + LCD
  const sc = new THREE.Group(); sc.position.set(C1.scaleX, TABLE_Y, ST_Z.scale); g.add(sc);
  box(0.32, 0.075, 0.26, M.cabinet, 0, 0.0375, 0, sc);
  box(0.34, 0.008, 0.24, M.steel, 0, 0.083, 0, sc);
  box(0.26, 0.018, 0.09, M.pom, 0, 0.096, 0, sc);
  const lcd = canvasTex(256, 64, (ctx, w, h, val, stable) => {
    ctx.fillStyle = '#0b1a0e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = stable ? '#8dff6a' : '#4fa63a'; ctx.font = '700 40px "IBM Plex Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText((val == null ? 0 : val).toFixed(2), w - 46, 46); ctx.font = '500 24px "IBM Plex Mono", monospace'; ctx.fillText('g', w - 16, 46);
    ctx.textAlign = 'left'; ctx.font = '500 14px "IBM Plex Mono", monospace'; ctx.fillStyle = '#4fa63a'; ctx.fillText(stable ? 'STABLE' : '', 10, 18);
  });
  box(0.14, 0.05, 0.03, M.black, 0, 0.04, 0.14, sc);
  const lp = mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshBasicMaterial({ map: lcd.tex }), sc, false); lp.position.set(0, 0.04, 0.1555);
  const scalePose = K.mul(K.trans(C1.scaleX, TABLE_Y + 0.105, ST_Z.scale), K.rotY(Math.PI / 2));
  R1.st = { dmcPose, scalePose, lcd, ring, scaleVal: 0, stable: true, partOn: null };

  // --- 2-axis positioner: tilt (A, about X) + rotary table (C) + swing clamps
  const pgp = new THREE.Group(); pgp.position.set(POS.x, TABLE_Y, POS.z); pgp.rotation.y = -Math.PI / 2; g.add(pgp);
  const hA = POS.hA - TABLE_Y;
  box(0.86, 0.05, 0.3, M.cabinet, 0, 0.025, 0, pgp);
  box(0.86, 0.006, 0.302, M.brand, 0, 0.05, 0, pgp);
  for (const sx of [-0.39, 0.39]) { box(0.07, hA + 0.02, 0.14, M.cabinet, sx, (hA + 0.02) / 2 + 0.04, 0, pgp); cyl(0.055, 0.08, M.steelDark, sx, hA, 0, pgp, G.cylX); }
  box(0.11, 0.11, 0.11, M.black, -0.48, hA, 0, pgp); cyl(0.04, 0.03, M.brand, -0.54, hA, 0, pgp, G.cylX);
  const tilt = new THREE.Group(); tilt.position.set(0, hA, 0); pgp.add(tilt);
  // deep drop cradle: the rotary unit stands on a slim column so the underside of the part stays open for the needle
  // L-type tilt arm driven from one side: nothing sits under the part except the slim rotary column
  // two-sided trunnion (U) with a deep drop: bottom plate far below the part, rotary unit on a slim column
  for (const sx of [-0.35, 0.35]) box(0.03, 0.25, 0.12, M.alu, sx, -0.095, 0, tilt);
  box(0.73, 0.03, 0.06, M.alu, 0, -0.205, 0, tilt);
  cyl(0.04, 0.19, M.black, 0, -0.11, 0, tilt);
  cyl(0.07, 0.02, M.black, 0, -0.012, 0, tilt);
  const rot = new THREE.Group(); tilt.add(rot);
  cyl(0.08, 0.012, M.steelDark, 0, 0.006, 0, rot);
  box(0.16, 0.013, 0.06, M.pom, 0, 0.0185, 0, rot);
  const topY = 0.025 + (cfg.variant === 'tube' ? 0.065 : 0.022);
  const clamps = [], pushers = [];
  if (cfg.variant === 'tube') {
    // swing clamps press the shell top; pipes and flanges stay free for the needle
    // posts sit diagonally (away from both coolant ports)
    for (const [cx, sz] of [[0.03, 1], [-0.03, -1]]) {
      const postH = topY + 0.03;
      box(0.02, postH, 0.02, M.alu, cx, postH / 2, sz * 0.115, rot);
      const piv = new THREE.Group(); piv.position.set(cx, postH, sz * 0.115); piv.userData.sz = sz; rot.add(piv);
      box(0.018, 0.012, 0.125, M.black, 0, 0, -sz * 0.0625, piv);
      box(0.016, 0.022, 0.014, M.pom, 0, -0.016, -sz * 0.115, piv);
      clamps.push(piv);
    }
  } else {
    // low side pushers grip the cover edge so both rim seams and both stubs stay open
    for (const sx of [-1, 1]) for (const lz of [-0.06, 0.06]) {
      const pg_ = new THREE.Group(); rot.add(pg_);
      box(0.03, 0.014, 0.02, M.black, 0, 0, 0, pg_);
      pg_.userData = { sx, lz }; pushers.push(pg_);
    }
  }
  const pos = { A: 0, C: 0, clamp: 0, tilt, rot, clamps, pushers,
    update() {
      tilt.rotation.x = this.A; rot.rotation.y = this.C;
      clamps.forEach(c => c.rotation.x = c.userData.sz * lerp(1.35, 0, this.clamp));
      // part-local (x, y, z) -> faceplate (z, y + 0.025, -x)
      pushers.forEach(p => { const lx = p.userData.sx * (0.077 + 0.011 + (1 - this.clamp) * 0.018); p.position.set(p.userData.lz, 0.025 + 0.007, -lx); });
    } };
  pos.update();
  // dispensing robot parks above the positioner
  R2.park = chainIK(R2, [readyPose()], TOOL_N, R2.x, [180 * D2R, -90 * D2R, 90 * D2R, -90 * D2R, -90 * D2R, 0], { quiet: true, check: q => envHit(R2, q, 0) })[0];
  PASS_CACHE = new Map();
  R2.q = R2.park.slice(); R2.update();

  // paste pressure pot (supply) feeding the syringe line
  const pot = new THREE.Group(); pot.position.set(x1 - 0.22, TABLE_Y, z0 + 0.22); g.add(pot);
  cyl(0.085, 0.3, M.steel, 0, 0.15, 0, pot); cyl(0.09, 0.02, M.steelDark, 0, 0.31, 0, pot);
  cyl(0.02, 0.05, M.black, 0.03, 0.34, 0, pot); cyl(0.025, 0.012, M.gold, -0.03, 0.335, 0, pot);

  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const anchors = [
    { title: '지그 6구 · 착좌 센서', sub: '작업자가 쿨러를 올리면 센서가 확인', at: () => V3(0, TABLE_Y + 0.1, JIG_Z) },
    { title: '핸들링 FR5 + 리니어 레일', sub: '지그 → DMC → 저울 → 포지셔너 이송', at: () => V3(R1.s, BASE_Y + 0.25, R1.z) },
    { title: 'DMC 리더', sub: '파트 코드 판독 → MES 등록', at: () => V3(C1.dmcX, TABLE_Y + 0.6, ST_Z.dmc) },
    { title: '정밀 저울', sub: '도포 전·후 계량 0.01 g', at: () => V3(C1.scaleX, TABLE_Y + 0.12, ST_Z.scale) },
    { title: '2축 포지셔너', sub: '쿨러를 잡고 틸트·회전 (왼손 역할)', at: () => V3(POS.x, POS.hA - 0.12, POS.z + 0.18) },
    { title: '도포 FR5 + 시린지 디스펜서', sub: '접합부를 따라 Ni 페이스트 비드 (오른손 역할)', at: () => { const T = R2.tcpW(TOOL_N); return V3(T[3], T[7] + 0.08, T[11]); } },
    { title: 'Ni 페이스트 가압 탱크', sub: '시린지까지 정량 공급', at: () => V3(x1 - 0.22, TABLE_Y + 0.36, z0 + 0.22) },
    { title: '3색 타워램프', sub: 'OK / NOK 표시', at: () => V3(x1 - 0.1, Htop + 0.25, z1 - 0.1) },
    { title: 'HMI · START · 비상정지', sub: '작업자 조작부', at: () => V3(x0 + 0.22, TABLE_Y + 0.62, z1 + 0.14) },
    { title: '양개 슬라이딩 도어', sub: '사이클 중 닫힘 · 인터록', at: () => V3(0, 1.45, z1 + 0.04) }
  ];
  ST = { group: g, LY, robots, pos, door, leaves, doorW, lamps, startMat, sensors, hmi, parts: [], enc, anchors };
  setDoor(0);
  resetParts();
  return ST;
}
let ST_plate;
const LOGO_IMG = new Image(); LOGO_IMG.onload = () => ST_plate && ST_plate.draw(); if (window.ONE_LOGO) LOGO_IMG.src = window.ONE_LOGO;
function setDoor(close) { if (!ST) return; ST.doorOpen = 1 - close; ST.leaves.forEach(l => l.position.x = l.userData.sgn * (1 - close) * (ST.doorW / 2 - 0.02)); }

/* ---------- parts on jig ---------- */
let serial = 1;
function code() {
  const p = VARIANTS[cfg.variant].codePrefix; const s = String(serial++).padStart(4, '0');
  return `${p}-261022-${s}`;
}
function jigPose(i) { return K.trans(ST.LY.slotsX[i], NEST_TOP, JIG_Z); }
function resetParts(dropIn) {
  ST.parts.forEach(p => disposeGroup(p.obj));
  ST.parts = ST.LY.slotsX.map((_, i) => { const p = makePart(cfg.variant, i, code()); p.setPose(jigPose(i)); return p; });
  ST.parts.forEach((p, i) => { ST.sensors[i].emissiveIntensity = dropIn ? 0 : 1.2; if (dropIn) p.obj.visible = false; });
  ST.robots.forEach(r => { if (r.st) { r.st.scaleVal = 0; r.st.partOn = null; r.st.lcd.draw(0, true); } });
  if (ST.pos) { ST.pos.A = 0; ST.pos.C = 0; ST.pos.clamp = 0; ST.pos.update(); }
  sim.results = ST.parts.map(p => ({ code: p.code, w0: null, w1: null, d: null, dev: null, ok: null, fault: p.fault, seen: false }));
  renderTable();
}

/* =========================================================
   MOTION EXECUTOR
   ========================================================= */
function elbowDown(q) { const fr = K.fk(q); return fr[2][11] < fr[1][11] - 0.02; }
function unwrap(q, ref) {
  for (const k of [0, 3, 5]) {
    let best = q[k];
    for (const c of [q[k] - 2 * Math.PI, q[k] + 2 * Math.PI]) if (c >= K.LMIN[k] && c <= K.LMAX[k] && Math.abs(c - ref[k]) < Math.abs(best - ref[k])) best = c;
    q[k] = best;
  }
  return q;
}
function solve(robot, Tw, tool, s, seed) {
  const free = tool === TOOL_N;
  const Td = K.mul(K.inv(robot.W(s)), Tw);
  let r = K.ikTool(Td, tool, seed, 150, free);
  if (!r.ok || elbowDown(r.q)) {
    const az = Math.atan2(-Td[7], -Td[3]) - 0.17;
    const r2 = K.ikTool(Td, tool, [az, -90 * D2R, 90 * D2R, -90 * D2R, -90 * D2R, seed[5]], 200, free);
    if (r2.ok && (!r.ok || !elbowDown(r2.q) || r2.ep < r.ep)) r = r2;
  }
  unwrap(r.q, seed);
  if (!r.ok) { const q = chainIK(robot, [Tw], tool, s, seed)[0]; const r3 = K.ikTool(Td, tool, q, 50, free); if (r3.ok) { unwrap(r3.q, seed); return r3; } }
  if (!r.ok) { robot.ikFail++; (window.__fails = window.__fails || []).push([CUR_LABEL, +r.ep.toFixed(4), +r.eo.toFixed(3)]); }
  return r;
}
let CUR_LABEL = '';
const OMEGA = 150 * D2R, VLIN = 0.22;
/* FR5: max joint speed 180°/s. Moves use 80% of it with a trapezoidal velocity profile (accel 300°/s²). */
const JMAX = 180 * D2R, JV = 0.8 * JMAX, JA = 300 * D2R;
function trapDur(d) { return d < JV * JV / JA ? 2 * Math.sqrt(d / JA) : d / JV + JV / JA; }
function trapS(t, T, d) { // normalized position 0..1 at time t for a move of size d lasting T
  if (d < 1e-6) return t / T;
  const ta = Math.min(JV / JA, T / 2), v = JA * ta;
  let x; if (t < ta) x = 0.5 * JA * t * t; else if (t < T - ta) x = 0.5 * JA * ta * ta + v * (t - ta); else { const u = T - t; x = d - 0.5 * JA * u * u; }
  return Math.max(0, Math.min(1, x / d));
}

class Exec {
  constructor(robot) { this.r = robot; this.queue = []; this.cur = null; this.t = 0; this.doneAll = false; }
  get q() { return this.r.q; } set q(v) { this.r.q = v; }
  get s() { return this.r.s; } set s(v) { this.r.s = v; }
  push(...segs) { this.queue.push(...segs); }
  step(dt) {
    let guard = 0;
    while (dt > 0 && guard++ < 400) {
      if (!this.cur) {
        if (!this.queue.length) { this.doneAll = true; return; }
        this.cur = this.queue.shift(); this.t = 0; CUR_LABEL = this.cur.label;
        if (this.cur.begin) this.cur.begin(this);
        if (this.cur.dur == null) this.cur.dur = 0;
      }
      const c = this.cur, use = Math.min(dt, Math.max(0, c.dur - this.t));
      this.t += use; dt -= use;
      const f = c.dur > 0 ? Math.min(1, this.t / c.dur) : 1;
      if (c.update) c.update(this, f);
      if (c.done || this.t >= c.dur - 1e-9) { if (c.end) c.end(this); this.cur = null; }
    }
  }
}
const segWait = (dur, o = {}) => Object.assign({ dur }, o);
function segJ(getT, tool, rail, o = {}) {
  return Object.assign({
    begin(ex) {
      const T = getT(); this.q0 = ex.q.slice(); this.s0 = ex.s;
      this.s1 = rail == null ? ex.s : rail;
      this.q1 = solve(ex.r, T, tool, this.s1, ex.q).q;
      this.dq = Math.max(...this.q1.map((v, i) => Math.abs(v - this.q0[i])));
      this.dur = Math.max(0.3, trapDur(this.dq), Math.abs(this.s1 - this.s0) / 0.45);
    },
    update(ex, f) { const t = trapS(f * this.dur, this.dur, this.dq); ex.q = this.q0.map((v, i) => lerp(v, this.q1[i], t)); ex.s = lerp(this.s0, this.s1, smooth(f)); }
  }, o);
}
function segC(getPoses, tool, o = {}) {
  return Object.assign({
    begin(ex) {
      const poses = getPoses(ex); this.qs = []; let seed = ex.q;
      for (const T of poses) { const r = solve(ex.r, T, tool, ex.s, seed); this.qs.push(r.q); seed = r.q; }
      let len = 0; for (let i = 1; i < poses.length; i++) len += Math.hypot(poses[i][3] - poses[i - 1][3], poses[i][7] - poses[i - 1][7], poses[i][11] - poses[i - 1][11]);
      this.dur = o.durFn ? o.durFn(len) : Math.max(0.25, len / VLIN);
      let mx = 0; for (let i = 1; i < this.qs.length; i++) for (let k = 0; k < 6; k++) mx = Math.max(mx, Math.abs(this.qs[i][k] - this.qs[i - 1][k]));
      this.dur = Math.max(this.dur, mx * (this.qs.length - 1) / JV * 1.5);
      
      if (o.onBegin) o.onBegin(ex);
    },
    update(ex, f) {
      const n = this.qs.length, x = (o.ease === false ? f : smooth(f)) * (n - 1), i = Math.min(n - 2, Math.floor(x)), t = x - i;
      ex.q = this.qs[i].map((v, k) => lerp(v, this.qs[i + 1][k], t));
      if (o.onProg) o.onProg(ex, f);
    }
  }, o);
}
function linPoses(from, to, n = 8) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), sc = new THREE.Vector3();
  m4(from).decompose(a, qa, sc); m4(to).decompose(b, qb, sc);
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t), q = qa.clone().slerp(qb, t); out.push(fromM4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)))); }
  return out;
}

/* robust chain IK: try several start configurations, keep the one that tracks the whole path */
const SEED_SETS = [[-90, 90, -90, -90], [-60, 100, -130, -90], [-120, 80, -50, -90], [-90, 90, -90, 90], [-70, 120, -140, -90], [-110, 60, -40, -90]].map(a => a.map(v => v * D2R));
function chainIK(robot, poses, tool, s, cur, opts = {}) {
  const W = robot.W(s), Wi = K.inv(W), free = tool === TOOL_N;
  const Tds = poses.map(T => K.mul(Wi, T));
  const cands = [cur.slice()];
  const az = Math.atan2(-Tds[0][7], -Tds[0][3]) - 0.17;
  for (const ss of SEED_SETS) cands.push([az, ...ss, cur[5]]);
  const R = rng(911);
  for (let k = 0; k < 24; k++) cands.push([0, 1, 2, 3, 4, 5].map(i => (R() * 2 - 1) * Math.PI * (i === 1 ? 0.8 : 1)));
  let best = null;
  for (const c of cands) {
    let seed = c, fails = 0, coll = 0; const qs = [];
    for (let i = 0; i < Tds.length; i++) {
      const r = K.ikTool(Tds[i], tool, seed, i === 0 ? 250 : 80, free);
      if (!r.ok) fails++; else if (elbowDown(r.q)) fails += 0.02;
      if (r.ok && opts.check && opts.check(r.q)) { fails += 0.5; coll++; }
      if (i === 0) unwrap(r.q, cur); else unwrap(r.q, seed);
      qs.push(r.q); seed = r.q;
      if (best && fails >= best.fails) break;
    }
    if (qs.length < Tds.length) continue;
    const travel = Math.max(...qs[0].map((v, i) => Math.abs(v - cur[i])));
    if (opts.check && travel > 0.05) for (let k = 1; k < 8; k++) { const qq = cur.map((v, i) => lerp(v, qs[0][i], k / 8)); if (opts.check(qq)) { fails += 0.5; coll++; } }
    let jump = 0; for (let i = 1; i < qs.length; i++) jump = Math.max(jump, ...qs[i].map((v, k) => Math.abs(v - qs[i - 1][k])));
    if (jump > 0.6) fails += 3;
    let path = 0; for (let i = 1; i < qs.length; i++) for (let k = 0; k < 6; k++) path += Math.abs(qs[i][k] - qs[i - 1][k]);
    const score = fails * 100 + travel * (opts.check ? 15 : 1) + path * 0.3;
    if (!best || score < best.score) best = { qs, fails, score, coll };
    if (best.fails === 0) break;
  }
  if (!opts.quiet && best.fails >= 1) { robot.ikFail += Math.floor(best.fails); (window.__fails = window.__fails || []).push([CUR_LABEL, best.fails]); }
  best.qs.fails = best.fails; best.qs.coll = best.coll;
  return best.qs;
}
function segQ(getQs, o = {}) {
  return Object.assign({
    begin(ex) {
      this.qs = getQs(ex);
      // optional joint-space move from the current pose to the first sample (trapezoidal, FR5 speed)
      this.j0 = ex.q.slice(); this.jd = o.toStart ? Math.max(...this.qs[0].map((v, k) => Math.abs(v - this.j0[k]))) : 0;
      this.tJ = this.jd > 1e-4 ? Math.max(0.25, trapDur(this.jd)) : 0;
      let mx = 0; for (let i = 1; i < this.qs.length; i++) for (let k = 0; k < 6; k++) mx = Math.max(mx, Math.abs(this.qs[i][k] - this.qs[i - 1][k]));
      this.tP = this.qs.length < 2 ? 0 : Math.max(o.durFn ? o.durFn() : Math.max(0.3, this.qs.length * 0.04), mx * (this.qs.length - 1) / JV * (o.ease === false ? 1 : 1.5));
      this.dur = this.tJ + this.tP;
      this.s0 = ex.s; this.s1 = o.rail == null ? ex.s : o.rail;
      if (o.toStart) this.dur = Math.max(this.dur, Math.abs(this.s1 - this.s0) / 0.45);
      if (o.onBegin) o.onBegin(ex);
    },
    update(ex, f) {
      const t = f * this.dur;
      ex.s = lerp(this.s0, this.s1, smooth(f));
      if (t < this.tJ) { const u = trapS(t, this.tJ, this.jd); ex.q = this.j0.map((v, k) => lerp(v, this.qs[0][k], u)); return; }
      const fp = this.tP > 0 ? Math.min(1, (t - this.tJ) / this.tP) : 1, n = this.qs.length;
      if (n < 2) { ex.q = this.qs[0].slice(); if (o.onProg) o.onProg(ex, fp); return; }
      const x = (o.ease === false ? fp : smooth(fp)) * (n - 1), i = Math.min(n - 2, Math.floor(x)), tt = x - i;
      ex.q = this.qs[i].map((v, k) => lerp(v, this.qs[i + 1][k], tt));
      if (o.onProg) o.onProg(ex, fp);
    }
  }, o);
}
const segL = (getT, tool, o = {}) => segC(ex => linPoses(ex.r.tcpW(tool), getT(), 8), tool, o);
const lift = (T, h) => { const c = T.slice(); c[7] += h; return c; };

/* ---------- collision model: part + positioner fixture as boxes (part frame), robot links as sampled capsules ---------- */
function collBoxes(variant) {
  const H = variant === 'tube' ? 0.065 : 0.022, postH = 0.025 + H + 0.03;
  const part = variant === 'tube' ? [
    [0, 0.0325, 0, 0.05, 0.0325, 0.10],
    [0, 0.0325, 0.106, 0.05, 0.0325, 0.006], [0, 0.0325, 0.118, 0.04, 0.026, 0.006], [0, 0.0325, 0.1295, 0.029, 0.019, 0.0055],
    [0, 0.0325, -0.106, 0.05, 0.0325, 0.006], [0, 0.0325, -0.118, 0.04, 0.026, 0.006], [0, 0.0325, -0.1295, 0.029, 0.019, 0.0055],
    [0, 0.0325, 0.1575, 0.018, 0.018, 0.0225, 'z'], [0, 0.0325, 0.186, 0.045, 0.023, 0.0065, 'rz', 25 * D2R],
    [0, 0.0325, -0.149, 0.016, 0.016, 0.014, 'z'], [0, 0.0325, -0.168, 0.036, 0.021, 0.0055, 'rz', -35 * D2R],
    [0.064, 0.035, 0.06, 0.014, 0.009, 0.009, 'x'], [0.088, 0.035, -0.1, 0.009, 0.009, 0.135, 'z'], [0.081, 0.035, 0.047, 0.009, 0.009, 0.012],
    [-0.064, 0.03, -0.06, 0.014, 0.009, 0.009, 'x'], [-0.088, 0.03, 0.1, 0.009, 0.009, 0.135, 'z'], [-0.081, 0.03, -0.047, 0.009, 0.009, 0.012]
  ] : [
    [0, 0.005, 0, 0.077, 0.006, 0.202], [0, 0.013, 0, 0.057, 0.009, 0.177],
    [0, 0.034, 0.165, 0.016, 0.015, 0.016, 'y'], [0, 0.034, -0.165, 0.016, 0.015, 0.016, 'y'],
    [0, 0.053, 0.165, 0.039, 0.006, 0.021, 'ry', 20 * D2R], [0, 0.053, -0.165, 0.039, 0.006, 0.021, 'ry', -20 * D2R]
  ];
  const fixture = [[0, -0.019, 0, 0.08, 0.006, 0.08, 'y'], [0, -0.006, 0, 0.03, 0.0065, 0.08]].concat(variant === 'tube' ? [
    [-0.115, postH / 2 - 0.025, 0.03, 0.01, postH / 2, 0.01], [0.115, postH / 2 - 0.025, -0.03, 0.01, postH / 2, 0.01],
    [-0.0525, H + 0.03, 0.03, 0.0625, 0.006, 0.009], [0.0525, H + 0.03, -0.03, 0.0625, 0.006, 0.009]
  ] : [[-0.088, 0.007, 0.06, 0.01, 0.007, 0.015], [-0.088, 0.007, -0.06, 0.01, 0.007, 0.015], [0.088, 0.007, 0.06, 0.01, 0.007, 0.015], [0.088, 0.007, -0.06, 0.01, 0.007, 0.015]]);
  return part.concat(fixture);
}
function robotSamples(robot, q) {
  const W = robot.W(robot.x), fr = K.fk(q), P = i => [fr[i][3], fr[i][7], fr[i][11]], Zc = i => [fr[i][2], fr[i][6], fr[i][10]];
  const segs = [
    [add3(P(1), Zc(1), 0.128), add3(P(2), Zc(1), 0.128), 0.05],
    [add3(P(2), Zc(2), 0.012), add3(P(3), Zc(2), 0.012), 0.04],
    [P(3), P(4), 0.045], [P(4), P(5), 0.045], [P(5), P(6), 0.045],
    [P(6), add3(P(6), Zc(6), 0.07), 0.03],                      // adapter + barrel clamp
    [add3(P(6), Zc(6), 0.07), add3(P(6), Zc(6), 0.1), 0.022], [add3(P(6), Zc(6), 0.1), add3(P(6), Zc(6), 0.186), 0.011], // clamp, 10cc barrel
    [add3(P(6), Zc(6), 0.186), add3(P(6), Zc(6), 0.205), 0.007] // cone + luer hub (1" needle itself excluded)
  ];
  const out = [];
  for (const [a, b, r] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.015));
    for (let i = 0; i <= n; i++) { const t = i / n; out.push([...K.xf(W, [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]), r]); }
  }
  return out;
}
function hitPrim(p, b, r) {
  let dx = p[0] - b[0], dy = p[1] - b[1], dz = p[2] - b[2];
  if (b[6] === 'rz') { const c = Math.cos(-b[7]), s_ = Math.sin(-b[7]); [dx, dy] = [c * dx - s_ * dy, s_ * dx + c * dy]; }
  if (b[6] === 'ry') { const c = Math.cos(-b[7]), s_ = Math.sin(-b[7]); [dx, dz] = [c * dx + s_ * dz, -s_ * dx + c * dz]; }
  if (b[6] === 'z') return Math.hypot(dx, dy) < b[3] + r && Math.abs(dz) < b[5] + r;
  if (b[6] === 'x') return Math.hypot(dy, dz) < b[4] + r && Math.abs(dx) < b[3] + r;
  if (b[6] === 'y') return Math.hypot(dx, dz) < b[3] + r && Math.abs(dy) < b[4] + r;
  return Math.abs(dx) < b[3] + r && Math.abs(dy) < b[4] + r && Math.abs(dz) < b[5] + r;
}
/* fast pre-check of the syringe alone, straight from the TCP pose (no IK): hub/cone, barrel, adapter */
const TOOL_SEGS = [[0.032, 0.051, 0.007], [0.051, 0.137, 0.011], [0.137, 0.167, 0.022], [0.167, 0.237, 0.03]];
function toolHits(T, Pinv, boxes, m = 0.0045) {
  const tip = [T[3], T[7], T[11]], back = [-T[2], -T[6], -T[10]];
  for (const [d0, d1, r] of TOOL_SEGS) for (let d = d0; d <= d1 + 1e-9; d += 0.008) {
    const p = K.xf(Pinv, add3(tip, back, d));
    for (const b of boxes) if (hitPrim(p, b, r + m)) return true;
  }
  return false;
}
/* static surroundings of the dispensing arm: positioner base/pillars/motor (world-fixed), tilt cradle (moves with A), table top */
const POS_M = () => K.mul(K.trans(POS.x, TABLE_Y, POS.z), K.rotY(-Math.PI / 2));
function envBoxes() {
  const hA = POS.hA - TABLE_Y;
  return {
    fixed: [[0, 0.025, 0, 0.43, 0.025, 0.15], [-0.39, (hA + 0.02) / 2 + 0.04, 0, 0.035, (hA + 0.02) / 2 + 0.01, 0.07], [0.39, (hA + 0.02) / 2 + 0.04, 0, 0.035, (hA + 0.02) / 2 + 0.01, 0.07],
            [-0.39, hA, 0, 0.04, 0.055, 0.055], [0.39, hA, 0, 0.04, 0.055, 0.055], [-0.5, hA, 0, 0.075, 0.055, 0.055]],
    cradle: [[-0.35, -0.095, 0, 0.015, 0.125, 0.06], [0.35, -0.095, 0, 0.015, 0.125, 0.06], [0, -0.205, 0, 0.365, 0.015, 0.03], [0, -0.11, 0, 0.04, 0.095, 0.04, 'y'], [0, -0.012, 0, 0.07, 0.01, 0.07, 'y']]
  };
}
function envHit(robot, q, A, m = 0.006) {
  const E = envBoxes(), Mi = K.inv(POS_M()), Ti = K.inv(K.mul(K.trans(0, POS.hA - TABLE_Y, 0), K.rotX(A)));
  for (const s of robotSamples(robot, q)) {
    const r = s[3] + m;
    if (s[1] - r < TABLE_Y + 0.005) return true;
    const p = K.xf(Mi, s);
    for (const b of E.fixed) if (hitPrim(p, b, r)) return true;
    const c = K.xf(Ti, p);
    for (const b of E.cradle) if (hitPrim(c, b, r)) return true;
  }
  return false;
}
function envInfo(robot, q, A, m = 0.006) {
  const E = envBoxes(), Mi = K.inv(POS_M()), Ti = K.inv(K.mul(K.trans(0, POS.hA - TABLE_Y, 0), K.rotX(A))), out = {};
  robotSamples(robot, q).forEach((s, si) => {
    const r = s[3] + m; if (s[1] - r < TABLE_Y + 0.005) out['table r' + s[3]] = 1;
    const p = K.xf(Mi, s); E.fixed.forEach((b, i) => { if (hitPrim(p, b, r)) out['fixed' + i + ' r' + s[3]] = 1; });
    const c = K.xf(Ti, p); E.cradle.forEach((b, i) => { if (hitPrim(c, b, r)) out['cradle' + i + ' r' + s[3]] = 1; });
  });
  return Object.keys(out);
}
function collideInfo(robot, q, Pinv, boxes, m = 0.004) {
  const hits = []; const S = robotSamples(robot, q);
  S.forEach((s, si) => { const p = K.xf(Pinv, s), r = s[3] + m; boxes.forEach((b, bi) => { if (hitPrim(p, b, r)) hits.push([si, bi, s[3]]); }); });
  return hits;
}
function collides(robot, q, Pinv, boxes, m = 0.004) {
  for (const s of robotSamples(robot, q)) {
    const p = K.xf(Pinv, s), r = s[3] + m;
    for (const b of boxes) if (hitPrim(p, b, r)) return true;
  }
  return false;
}
function wantDir() { const to = [R2_AT.x - POS.x, 0, R2_AT.z - POS.z], tl = Math.hypot(to[0], to[2]); return K.nrm([to[0] / tl * TUNE.side, TUNE.up, to[2] / tl * TUNE.side]); }
/* R2 waits here while the positioner turns the part: outside the part's swept sphere, syringe pointing at it */
function readyPose() { const w = wantDir(), c = [POS.x, POS.hA + 0.05, POS.z]; return K.pose(add3(c, w, TUNE.ready), neg(w), [0, 0, 1]); }
let PASS_CACHE = new Map();

/* ---------- shared helpers for the two-robot program ---------- */
const segWaitFor = (cond, o = {}) => Object.assign({ dur: 1e9, update() { if (cond()) this.done = true; } }, o);
function segPos(Adeg, Cdeg, o = {}) {
  return Object.assign({
    begin() {
      const P = ST.pos; this.a0 = P.A; this.c0 = P.C; this.a1 = Adeg * D2R; this.c1 = Cdeg * D2R;
      this.dur = Math.max(0.35, Math.max(Math.abs(this.a1 - this.a0), Math.abs(this.c1 - this.c0)) / (150 * D2R));
    },
    update(e, f) { const t = smooth(f); ST.pos.A = lerp(this.a0, this.a1, t); ST.pos.C = lerp(this.c0, this.c1, t); }
  }, o);
}
/* positioner orientation that turns a pass's mean surface normal toward the dispensing robot (operator's left hand) */
function choosePosList(nb, k = 6) {
  const want = wantDir(), all = [];
  for (let A = -120; A <= 120; A += 10) for (let C = -180; C < 180; C += 15) {
    const Rm = K.mul(K.rotY(-Math.PI / 2), K.mul(K.rotX(A * D2R), K.mul(K.rotY(C * D2R), K.rotY(Math.PI / 2))));
    all.push({ A, C, sc: K.dot(K.xv(Rm, nb), want) - 0.0006 * (Math.abs(A) + Math.abs(C) / 2) });
  }
  all.sort((a, b) => b.sc - a.sc);
  const out = [];
  for (const c of all) { if (out.every(o => Math.abs(o.A - c.A) + Math.abs(o.C - c.C) > 30)) out.push(c); if (out.length >= k) break; }
  return out;
}
/* plan one bead pass: try positioner orientations, keep the first whose whole path is reachable and collision-free */
/* needle lean: tip the syringe off the surface normal toward ± a joint-specific axis (away from flanges, tanks, the cover face) */
const LEANS_AX = [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60], LEANS_TG = [0, 15, -15, 25, -25, 40, -40, 55, -55];
function leanN(n, v, deg) {
  if (!deg || !v) return n;
  const vp = add3(v, n, -K.dot(v, n)); if (K.norm(vp) < 1e-3) return n;
  const u = K.nrm(vp), a = deg * D2R; return K.nrm(add3(n.map(x => x * Math.cos(a)), u, Math.sin(a)));
}
const BAKED = {};
function planPass(R, variant, j, pi) {
  const key = [variant, j.id, pi, cfg.beadW].join('|');
  if (PASS_CACHE.has(key)) return PASS_CACHE.get(key);
  const [a, b] = j.passes[pi], pts = j.pts.slice(a, b + 1), n = pts.length;
  const nb = K.nrm(pts.reduce((m, q) => add3(m, q.n), [0, 0, 0]));
  const gap = 0.0012 + cfg.beadW / 2000, APP = 0.06, READY = readyPose(), boxes = collBoxes(variant);
  const lv = j.axis || (n > 1 ? K.cross(pts[0].n, K.nrm(add3(pts[n - 1].p, pts[0].p, -1))) : null);
  const bk = BAKED[variant + '|' + j.id + '|' + pi];
  const mk = (o, la, lt) => {
    const P = posePart(o.A * D2R, o.C * D2R), Pinv = K.inv(P);
    const nOf = q => { let nn = leanN(q.n, lv, la); if (lt && lv) nn = leanN(nn, K.cross(lv, q.n), lt); return nn; };
    const toW = q => { const p = K.xf(P, q.p), nn = K.xv(P, nOf(q)), sn = K.xv(P, q.n), x = K.xv(P, q.x); return K.pose(add3(p, sn, gap), neg(nn), x); };
    const appr = q => { const T = toW(q), nn = K.xv(P, nOf(q)); T[3] += nn[0] * APP; T[7] += nn[1] * APP; T[11] += nn[2] * APP; return T; };
    const path = pts.map(toW), a0 = appr(pts[0]), a1 = appr(pts[n - 1]);
    const far = (T, q) => { const c = T.slice(), nn = K.xv(P, nOf(q)); c[3] += nn[0] * 0.07; c[7] += nn[1] * 0.07; c[11] += nn[2] * 0.07; return c; };
    const a0f = far(a0, pts[0]), a1f = far(a1, pts[n - 1]);
    const near = [...linPoses(a0f, a0, 4), ...linPoses(a0, path[0], 5), ...path, ...linPoses(path[n - 1], a1, 5), ...linPoses(a1, a1f, 4)];
    return { o, la, lt, P, Pinv, path, a0, a1, a0f, a1f, toolHits: near.filter(T => toolHits(T, Pinv, boxes)).length };
  };
  // 1) geometric pre-filter on the syringe alone (fast), 2) full IK + whole-arm collision on the best few
  let cands = [];
  if (bk) cands.push(mk({ A: bk[0], C: bk[1], sc: 1 }, bk[2], bk[3] || 0));
  if (!bk || cands[0].toolHits) {
    for (const o of choosePosList(nb, 24)) for (const la of LEANS_AX) for (const lt of LEANS_TG) cands.push(mk(o, la, lt));
    cands.sort((x, y) => (x.toolHits - y.toolHits) * 10 - (x.o.sc - y.o.sc) + (Math.abs(x.la) + Math.abs(x.lt) - Math.abs(y.la) - Math.abs(y.lt)) * 0.004);
  }
  let best = null;
  // keep orientation diversity: best lean for each positioner orientation first, then the rest
  const seen = new Set(), firsts = [], rest = [];
  for (const c of cands) { const k = c.o.A + '/' + c.o.C; if (!seen.has(k)) { seen.add(k); firsts.push(c); } else rest.push(c); }
  const pool = firsts.slice(0, 24).concat(rest.slice(0, 8));
  for (const c of pool) {
    // ready -> stand-off along the needle axis -> approach -> bead -> approach -> stand-off -> ready
    const poses = [...linPoses(READY, c.a0f, 6), ...linPoses(c.a0f, c.a0, 4).slice(1), ...linPoses(c.a0, c.path[0], 5).slice(1), ...c.path.slice(1), ...linPoses(c.path[n - 1], c.a1, 5).slice(1), ...linPoses(c.a1, c.a1f, 4).slice(1), ...linPoses(c.a1f, READY, 6).slice(1)];
    const Arad = c.o.A * D2R;
    const all = chainIK(R, poses, TOOL_N, R.x, R.park, { quiet: true, check: q => collides(R, q, c.Pinv, boxes) || envHit(R, q, Arad) });
    const score = all.fails * 100 + c.toolHits * 5 - c.o.sc;
    if (!best || score < best.score) best = { o: c.o, lean: c.la, leanT: c.lt, all, score };
    if (all.fails < 0.05) break;
  }
  const q = best.all;
  const plan = { o: best.o, lean: best.lean, leanT: best.leanT, fails: best.all.fails, coll: best.all.coll,
    app: q.slice(0, 11), inn: q.slice(10, 16), path: q.slice(15, 15 + n), out: q.slice(14 + n, 20 + n), back: q.slice(19 + n, 30 + n) };
  if (plan.fails >= 0.5) { R.ikFail += Math.ceil(plan.fails); (window.__fails = window.__fails || []).push([j.id + '/' + pi, plan.fails, plan.coll]); }
  PASS_CACHE.set(key, plan);
  return plan;
}

/* ---------- R1 handling program (Temex flow: jig → DMC → scale → positioner → scale → jig) ---------- */
function planPart(ex, part) {
  const R = ex.r, st = R.st;
  const rail = x => Math.max(R.cfg.railRange[0], Math.min(R.cfg.railRange[1], x));
  const gripAt = P => K.mul(P, part.gripLocal);
  const jp = jigPose(part.slotIdx), sx = ST.LY.slotsX[part.slotIdx], PP = posePart(0, 0);
  const res = sim.results[part.slotIdx];
  const attach = () => { const T = R.tcpW(TOOL_G); part.held = { robot: R, off: K.mul(K.inv(T), part.pose) }; };
  const release = P => { part.held = null; part.setPose(P); };
  const gripAnim = (to, o = {}) => segWait(0.3, Object.assign({ begin() { this.g0 = R.grip; }, update(e, f) { R.grip = lerp(this.g0, to, f); } }, o));
  const clampAnim = (to, o = {}) => segWait(0.4, Object.assign({ begin() { this.c0 = ST.pos.clamp; }, update(e, f) { ST.pos.clamp = lerp(this.c0, to, smooth(f)); } }, o));
  const S = (step, label) => ({ step, label });
  return [
    segJ(() => lift(gripAt(jp), 0.12), TOOL_G, rail(sx), S(3, `슬롯 ${part.slotIdx + 1} 접근`)),
    gripAnim(1, S(3, '그리퍼 열림')),
    segL(() => gripAt(jp), TOOL_G, S(3, '하강')),
    gripAnim(0, Object.assign(S(3, '파지'), { end: () => { attach(); part.state = 'moving'; ST.sensors[part.slotIdx].emissiveIntensity = 0.0; } })),
    segL(() => lift(gripAt(jp), 0.12), TOOL_G, S(3, '상승')),
    segJ(() => gripAt(st.dmcPose), TOOL_G, rail(R.cfg.dmcX), S(4, 'DMC 리더 위치')),
    segWait(0.6, Object.assign(S(4, 'DMC 판독'), { begin: () => { st.ring.emissiveIntensity = 2.2; }, end: () => { st.ring.emissiveIntensity = 0; res.seen = true; renderTable(); } })),
    segJ(() => lift(gripAt(st.scalePose), 0.12), TOOL_G, rail(R.cfg.scaleX), S(5, '저울 접근')),
    segL(() => gripAt(st.scalePose), TOOL_G, S(5, '저울 안착')),
    gripAnim(1, Object.assign(S(5, '언클램프'), { end: () => { release(st.scalePose); st.partOn = part; st.stable = false; } })),
    segL(() => lift(gripAt(st.scalePose), 0.1), TOOL_G, S(5, '후퇴')),
    segWait(0.8, Object.assign(S(5, '계량 (도포 전)'), { end: () => { part.w0 = part.baseMass; res.w0 = part.w0; st.stable = true; renderTable(); } })),
    segL(() => gripAt(st.scalePose), TOOL_G, S(5, '재파지')),
    gripAnim(0, Object.assign(S(5, '파지'), { end: () => { attach(); st.partOn = null; } })),
    segL(() => lift(gripAt(st.scalePose), 0.12), TOOL_G, S(5, '상승')),
    segJ(() => lift(gripAt(PP), 0.12), TOOL_G, rail(POS.x), S(6, '포지셔너 접근')),
    segL(() => gripAt(PP), TOOL_G, S(6, '포지셔너 안착')),
    gripAnim(1, Object.assign(S(6, '언클램프'), { end: () => { release(PP); part.mount = 'pos'; } })),
    segL(() => lift(gripAt(PP), 0.09), TOOL_G, S(6, '후퇴')),
    clampAnim(1, Object.assign(S(6, '포지셔너 클램프'), { end: () => { part.ready = true; } })),
    segJ(() => lift(gripAt(st.scalePose), 0.22), TOOL_G, rail(R.cfg.scaleX), S(6, '대기 위치')),
    segWaitFor(() => part.pasted, S(6, 'R2 도포 대기')),
    clampAnim(0, S(7, '클램프 해제')),
    segJ(() => lift(gripAt(PP), 0.12), TOOL_G, rail(POS.x), S(7, '포지셔너 접근')),
    segL(() => gripAt(PP), TOOL_G, S(7, '하강')),
    gripAnim(0, Object.assign(S(7, '파지'), { end: () => { part.mount = null; attach(); } })),
    segL(() => lift(gripAt(PP), 0.12), TOOL_G, S(7, '상승')),
    segJ(() => lift(gripAt(st.scalePose), 0.12), TOOL_G, rail(R.cfg.scaleX), S(7, '저울 접근')),
    segL(() => gripAt(st.scalePose), TOOL_G, S(7, '저울 안착')),
    gripAnim(1, Object.assign(S(7, '언클램프'), { end: () => { release(st.scalePose); st.partOn = part; st.stable = false; } })),
    segL(() => lift(gripAt(st.scalePose), 0.1), TOOL_G, S(7, '후퇴')),
    segWait(0.9, Object.assign(S(7, '계량 (도포 후)'), {
      end: () => {
        part.w1 = part.baseMass + part.dispensed; st.stable = true;
        const d = part.w1 - part.w0, dev = part.target ? (d - part.target) / part.target * 100 : 0;
        Object.assign(res, { w1: part.w1, d, dev, target: part.target, ok: Math.abs(dev) <= cfg.tol });
        renderTable();
      }
    })),
    segL(() => gripAt(st.scalePose), TOOL_G, S(7, '재파지')),
    gripAnim(0, Object.assign(S(7, '파지'), { end: () => { attach(); st.partOn = null; } })),
    segL(() => lift(gripAt(st.scalePose), 0.12), TOOL_G, S(7, '상승')),
    segJ(() => lift(gripAt(jp), 0.12), TOOL_G, rail(sx), S(8, `슬롯 ${part.slotIdx + 1} 복귀`)),
    segL(() => gripAt(jp), TOOL_G, S(8, '하강')),
    gripAnim(1, Object.assign(S(8, '언클램프'), { end: () => { release(jp); part.state = res.ok ? 'ok' : 'ng'; ST.sensors[part.slotIdx].emissiveIntensity = 1.2; ST.sensors[part.slotIdx].emissive.set(res.ok ? 0x3ddc84 : 0xff4d4f); sim.doneCount++; } })),
    segL(() => lift(gripAt(jp), 0.12), TOOL_G, S(8, '상승'))
  ];
}

/* ---------- R2 dispensing program: positioner turns the part, the syringe lays each bead pass ---------- */
function planPaste(ex, part) {
  const R = ex.r, S = (step, label) => ({ step, label });
  const segs = [segWaitFor(() => part.ready, S(6, '파트 장착 대기'))];
  for (const j of part.joints) {
    const n = j.pts.length;
    j.passes.forEach(([a, b], pi) => {
      const passLen = pathLen(j.pts.slice(a, b + 1)) * 1000;
      const tag = j.passes.length > 1 ? ` (${pi + 1}/${j.passes.length})` : '';
      let P = null;
      const plan = () => (P = P || planPass(R, part.variant, j, pi));
      segs.push(
        segPos(0, 0, Object.assign(S(6, `${j.id} 포지셔너 회전${tag}`), { begin() { const p = plan(); this.a0 = ST.pos.A; this.c0 = ST.pos.C; this.a1 = p.o.A * D2R; this.c1 = p.o.C * D2R; this.dur = Math.max(0.35, Math.max(Math.abs(this.a1 - this.a0), Math.abs(this.c1 - this.c0)) / (150 * D2R)); } })),
        segQ(() => plan().app, Object.assign(S(6, `${j.id} ${j.name} 접근`), { toStart: true })),
        segQ(() => plan().inn, S(6, `${j.id} 니들 진입`)),
        segQ(() => plan().path, Object.assign(S(6, `${j.id} ${j.name} 도포${tag}`), {
          ease: false,
          durFn: () => passLen / cfg.speed,
          onBegin: () => { R.glow.material.opacity = 1; j.mesh.material = M.pasteHi; },
          onProg: (e, f) => {
            const frac = (a + f * (b - a)) / (n - 1);
            j.geo.setDrawRange(0, Math.floor(frac * (j.idxTotal / 48)) * 48);
            const prevF = j.done; j.done = Math.max(j.done, frac); part.dispensed += (j.done - prevF) * j.target * j.factor;
            R.pasteFill.scale.z = Math.max(0.012, R.pasteFill.scale.z - (j.done - prevF) * 0.0012);
          },
          end: () => { if (pi === j.passes.length - 1) j.geo.setDrawRange(0, j.idxTotal); R.glow.material.opacity = 0; j.mesh.material = M.paste; }
        })),
        segQ(() => plan().out, S(6, `${j.id} 니들 후퇴`)),
        segQ(() => plan().back, S(6, '대기 위치 복귀'))
      );
    });
  }
  segs.push(
    segPos(0, 0, S(6, '포지셔너 원위치')),
    segWait(0, { end: () => { part.ready = false; part.pasted = true; } })
  );
  return segs;
}

/* =========================================================
   CYCLE DIRECTOR
   ========================================================= */
const sim = { phase: 'idle', t: 0, execs: [], dir: null, results: [], doneCount: 0, runT0: 0, cycleTotal: null, history: [] };
const PHASE_KO = { idle: '대기', loading: '로딩', closing: '도어 닫힘', running: '사이클 진행', opening: '도어 열림', done: '완료' };

function startCycle() {
  if (!(sim.phase === 'idle' || sim.phase === 'done')) return;
  const fresh = sim.phase === 'done';
  if (fresh) resetParts(true);
  ST.robots.forEach(r => { r.ikFail = 0; if (r.pasteFill) r.pasteFill.scale.z = 0.07; });
  sim.t = 0; sim.doneCount = 0; sim.cycleTotal = null;
  const N = ST.parts.length;
  const d = new Exec({});
  d.push(
    segWait(fresh ? N * 0.35 + 0.3 : N * 0.18 + 0.2, {
      begin: () => { sim.phase = 'loading'; }, step: 1,
      update: (e, f) => {
        ST.parts.forEach((p, i) => {
          const a = fresh ? (f * (N * 0.35 + 0.3) - i * 0.35) / 0.35 : (f * (N * 0.18 + 0.2) - i * 0.18) / 0.18;
          if (fresh) {
            const t = Math.max(0, Math.min(1, a)); p.obj.visible = a > 0;
            const T = jigPose(i).slice(); T[7] += (1 - smooth(t)) * 0.3; p.setPose(T);
          }
          if (a >= 1) ST.sensors[i].emissiveIntensity = 1.2, ST.sensors[i].emissive.set(0x00e8d0);
        });
      }
    }),
    segWait(1.2, { begin: () => { sim.phase = 'closing'; }, step: 2, update: (e, f) => setDoor(smooth(f)) }),
    segWait(1e9, {
      step: 0,
      begin: () => {
        sim.phase = 'running'; sim.runT0 = sim.t;
        const [r1, r2] = ST.robots, e1 = new Exec(r1), e2 = new Exec(r2);
        for (const i of r1.cfg.slots) { e1.push(...planPart(e1, ST.parts[i])); e2.push(...planPaste(e2, ST.parts[i])); }
        e1.push(segJ(() => r1.tcpW(TOOL_G), TOOL_G, r1.cfg.x, { step: 9, label: '홈 복귀', begin(e) { this.q0 = e.q.slice(); this.s0 = e.s; this.q1 = [90, -90, 90, -90, -90, 0].map(v => v * D2R); this.s1 = r1.cfg.x; this.dur = Math.max(0.5, Math.max(...this.q1.map((v, i) => Math.abs(v - this.q0[i]))) / OMEGA); } }));
        sim.execs = [e1, e2];
      },
      update(e) { if (sim.execs.every(x => x.doneAll)) this.done = true; }
    }),
    segWait(1.2, { begin: () => { sim.phase = 'opening'; }, step: 9, update: (e, f) => setDoor(1 - smooth(f)) }),
    segWait(0, {
      end: () => {
        sim.phase = 'done'; sim.cycleTotal = sim.t;
        const ok = sim.results.filter(r => r.ok).length;
        sim.history.push({ t: sim.t, n: N, ok });
        renderTable();
      }
    })
  );
  sim.dir = d; sim.phase = 'loading';
}

function resetAll() { sim.phase = 'idle'; sim.dir = null; sim.execs = []; sim.t = 0; sim.cycleTotal = null; buildStation(); updateUI(); }

/* =========================================================
   UI
   ========================================================= */
function jointsFor(variant) { return VARIANTS[variant].joints(); }
function renderJointList() {
  const js = jointsFor(cfg.variant);
  const area = Math.PI / 4 * cfg.beadW * (cfg.beadW * 0.6);
  $('#jointList').innerHTML = js.map(j => {
    const len = pathLen(j.pts) * 1000, mg = len * area * PASTE_RHO * 1000;
    return `<label class="jrow"><input type="checkbox" id="j_${j.id}" data-j="${j.id}" ${cfg.joints.has(j.id) ? 'checked' : ''}>
      <span class="jid">${j.id}</span><span class="jname">${j.name}</span><span class="jmeta">${len.toFixed(0)} mm · ${mg.toFixed(0)} mg</span></label>`;
  }).join('');
  $$('#jointList input').forEach(i => i.addEventListener('change', () => {
    if (busy()) { i.checked = !i.checked; return flash('사이클 중에는 변경할 수 없습니다'); }
    i.checked ? cfg.joints.add(i.dataset.j) : cfg.joints.delete(i.dataset.j); resetAll();
  }));
}
const busy = () => !(sim.phase === 'idle' || sim.phase === 'done');
const CELL_DESC = {
  rail: '핸들링 FR5(그리퍼)가 레일을 따라 지그 → DMC → 저울 → 포지셔너로 파트를 옮기고, 2축 포지셔너가 쿨러를 잡아 돌려주는 동안 도포 FR5가 시린지로 접합부를 따라 페이스트를 바른다. 작업자의 왼손·오른손 동작을 그대로 나눈 구성.'
};
const SLOT_OK = { rail: [4, 6, 8] };
function updateUI() {
  $$('[data-variant]').forEach(b => b.classList.toggle('on', b.dataset.variant === cfg.variant));
  $$('[data-cell]').forEach(b => b.classList.toggle('on', b.dataset.cell === cfg.cell));
  $$('[data-slots]').forEach(b => { const n = +b.dataset.slots; b.classList.toggle('on', n === cfg.slots); b.disabled = !SLOT_OK[cfg.cell].includes(n); });
  $('#cellDesc').textContent = CELL_DESC[cfg.cell];
  $$('[data-sim]').forEach(b => b.classList.toggle('on', +b.dataset.sim === cfg.sim));
  $('#beadV').textContent = cfg.beadW.toFixed(1) + ' mm';
  $('#speedV').textContent = cfg.speed + ' mm/s';
  $('#tolV').textContent = '±' + cfg.tol + ' %';
  $('#faultV').textContent = cfg.fault + ' %';
  renderJointList(); renderTable();
}
function flash(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(flash.h); flash.h = setTimeout(() => t.hidden = true, 2200); }

function renderTable() {
  if (!ST || HERO) return;
  const rows = sim.results.map((r, i) => {
    const st = r.ok == null ? (r.w0 != null ? '<span class="pill run">계량중</span>' : '<span class="pill idle">대기</span>') : (r.ok ? '<span class="pill ok">OK</span>' : '<span class="pill ng">NOK</span>');
    const f = v => v == null ? '<span class="dim">—</span>' : v.toFixed(2);
    return `<tr${r.ok === false ? ' class="ngrow"' : ''}><td>${i + 1}</td><td class="code">${r.seen ? r.code.slice(-9) : '<span class="dim">미판독</span>'}</td><td>${f(r.w0)}</td><td>${f(r.d)}</td><td>${r.dev == null ? '<span class="dim">—</span>' : (r.dev > 0 ? '+' : '') + r.dev.toFixed(1) + '%'}</td><td>${st}</td></tr>`;
  }).join('');
  $('#resBody').innerHTML = rows;
  const judged = sim.results.filter(r => r.ok != null), ok = judged.filter(r => r.ok).length, ng = judged.length - ok;
  $('#kOk').textContent = ok; $('#kNg').textContent = ng;
  const N = ST.parts.length;
  if (sim.cycleTotal) {
    const per = sim.cycleTotal / N;
    $('#kCt').textContent = per.toFixed(1) + ' s'; $('#kUph').textContent = Math.round(3600 / per);
    $('#kTot').textContent = '총 ' + sim.cycleTotal.toFixed(1) + ' s / ' + N + '개';
  } else if (sim.phase === 'idle') { $('#kCt').textContent = '—'; $('#kUph').textContent = '—'; $('#kTot').textContent = 'START 후 계산'; }
  const notes = sim.results.filter(r => r.ok === false).map(r => `#${sim.results.indexOf(r) + 1} ${r.fault ? r.fault.joint + ' ' + r.fault.kind : '편차 초과'}`);
  $('#ngNote').textContent = notes.length ? 'NOK 원인 (시뮬레이션): ' + notes.join(' · ') : '';
  ST.hmi.draw({ ok, ng, phase: PHASE_KO[sim.phase], n: judged.length, N });
  const tgt = ST.parts[0] ? ST.parts[0].target : 0;
  $('#kTgt').textContent = tgt ? tgt.toFixed(2) + ' g' : '—';
}

function bindUI() {
  $$('[data-variant]').forEach(b => b.onclick = () => { if (busy()) return flash('사이클 중에는 변경할 수 없습니다'); cfg.variant = b.dataset.variant; cfg.joints = new Set(jointsFor(cfg.variant).map(j => j.id)); resetAll(); });
  $$('[data-cell]').forEach(b => b.onclick = () => {
    if (busy()) return flash('사이클 중에는 변경할 수 없습니다');
    cfg.cell = 'rail'; if (!SLOT_OK[cfg.cell].includes(cfg.slots)) { cfg.slots = SLOT_OK[cfg.cell][0]; flash('고정형은 도달 반경상 지그 4개로 제한됩니다'); }
    resetAll();
  });
  $$('[data-slots]').forEach(b => b.onclick = () => { if (busy()) return flash('사이클 중에는 변경할 수 없습니다'); cfg.slots = +b.dataset.slots; resetAll(); });
  $$('[data-sim]').forEach(b => b.onclick = () => { cfg.sim = +b.dataset.sim; updateUI(); });
  const rng_ = (id, key, fmt, rebuild) => { const el = $(id); el.value = cfg[key]; el.oninput = () => { cfg[key] = +el.value; updateUI(); }; el.onchange = () => { if (rebuild && !busy()) resetAll(); }; };
  rng_('#bead', 'beadW', null, true); rng_('#speed', 'speed'); rng_('#tol', 'tol'); rng_('#fault', 'fault', null, true);
  $('#tFence').onchange = e => { cfg.fence = e.target.checked; ST.enc.visible = cfg.fence; ST.door.visible = cfg.fence; };
  $('#tPath').onchange = e => { cfg.paths = e.target.checked; ST.parts.forEach(p => p.joints.forEach(j => j.line.visible = cfg.paths)); };
  $('#tReach').onchange = e => { cfg.reach = e.target.checked; ST.robots.forEach(r => r.reach.visible = cfg.reach); };
  $('#start').onclick = () => { if (busy()) return; startCycle(); };
  $('#reset').onclick = () => resetAll();
  $$('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
}

/* ---------- camera views ---------- */
let camAnim = null;
function setView(v) {
  $$('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  cfg.follow = v === 'follow';
  const r0 = ST.robots[0];
  const V = {
    all: [[3.3, 2.7, 3.7], [0, 1.0, -0.1]],
    front: [[0, 1.55, 3.3], [0, 1.0, 0]],
    top: [[0.01, 4.2, 0.4], [0, 0.9, -0.05]],
    scale: [[POS.x - 0.55, 1.65, -0.05], [POS.x + 0.1, 1.15, -0.66]],
    follow: [[camera.position.x, camera.position.y, camera.position.z], [controls.target.x, controls.target.y, controls.target.z]]
  }[v];
  camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...V[0]), t1: new THREE.Vector3(...V[1]), f: 0 };
}

/* ---------- HUD ---------- */
function hud() {
  if (HERO) return;
  $('#phase').textContent = PHASE_KO[sim.phase];
  $('#phase').dataset.p = sim.phase;
  const N = ST.parts.length, done = sim.results.filter(r => r.ok != null).length;
  $('#prog').textContent = `${done} / ${N}`;
  $('#progBar').style.width = (done / N * 100) + '%';
  $('#clock').textContent = fmtT(sim.t);
  let curStep = 0;
  const lines = ST.robots.map((r, i) => {
    const ex = sim.execs[i]; const c = ex && ex.cur;
    let lbl = '대기';
    if (sim.phase === 'running') lbl = c ? c.label || '' : (ex && ex.doneAll ? '완료' : '');
    else if (sim.dir && sim.dir.cur && sim.dir.cur.step) lbl = STEPS[sim.dir.cur.step - 1];
    if (i === 0) curStep = sim.phase === 'running' ? (c && c.step) || 0 : (sim.dir && sim.dir.cur ? sim.dir.cur.step || 0 : 0);
    return `<div class="rline"><b>${r.name}</b><span>${lbl}</span></div>`;
  });
  $('#rlines').innerHTML = lines.join('');
  $$('#steps li').forEach((li, i) => { li.classList.toggle('cur', i + 1 === curStep); });
  const r = ST.robots[0];
  const r2 = ST.robots[1], jl = rb => rb.q.map((v, i) => `<span><i>J${i + 1}</i>${(v / D2R).toFixed(0)}°</span>`).join('');
  $('#jread').innerHTML = `<b>R1</b>${jl(r)}<span><i>RAIL</i>${(r.s * 1000).toFixed(0)}</span><br><b>R2</b>${jl(r2)}<span><i>A/C</i>${(ST.pos.A / D2R).toFixed(0)}° / ${(ST.pos.C / D2R).toFixed(0)}°</span>`;
  const sb = $('#start'); sb.disabled = busy(); sb.textContent = busy() ? '사이클 진행 중' : (sim.phase === 'done' ? '다음 사이클 시작' : '사이클 시작');
  const fails = ST.robots.reduce((a, b) => a + b.ikFail, 0);
  $('#ikwarn').hidden = !fails; $('#ikwarn').textContent = `도달 한계 근접 포즈 ${fails}건`;
  const tl = ST.lamps;
  const tw = (k) => tl[k].emissiveIntensity > 0.5;
  $('#tw').innerHTML = ['red', 'amber', 'green'].map(k => `<i class="${k} ${tw(k) ? 'on' : ''}"></i>`).join('');
}
const fmtT = t => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };
const fmtTcp = r => { const T = r.tcpW(TOOL_G); return `${(T[3] * 1000).toFixed(0)}, ${(T[7] * 1000).toFixed(0)}, ${(T[11] * 1000).toFixed(0)}`; };

/* ---------- main loop ---------- */
let last = performance.now(), hudT = 0, blink = 0;
function frame(now) {
  const rawDt = Math.min(0.5, (now - last) / 1000), real = Math.min(0.05, rawDt); last = now;
  const dt = busy() ? real * cfg.sim : 0;
  blink += real;
  if (sim.dir && busy()) {
    // sub-step for accuracy at high sim speed
    const n = Math.ceil(dt / 0.02);
    for (let i = 0; i < n; i++) {
      const h = dt / n; sim.t += h;
      sim.dir.step(h);
      if (sim.phase === 'running') sim.execs.forEach(e => e.step(h));
    }
  }
  // robots & held parts
  ST.robots.forEach(r => {
    r.update(); if (r.carriage) r.carriage.position.x = r.s;
    const st = r.st; if (!st) return;
    const target = st.partOn ? st.partOn.baseMass + st.partOn.dispensed : 0;
    st.scaleVal = st.stable ? target : lerp(st.scaleVal, target + (st.partOn ? (Math.random() - 0.5) * 0.08 : 0), 0.25);
    if (now - (st._t || 0) > 90) { st.lcd.draw(st.scaleVal, st.stable); st._t = now; }
  });
  ST.pos.update();
  ST.parts.forEach(p => { if (p.held) p.setPose(K.mul(p.held.robot.tcpW(TOOL_G), p.held.off)); else if (p.mount === 'pos') p.setPose(posePart(ST.pos.A, ST.pos.C)); });
  // lamps
  const L = ST.lamps, anyNg = sim.results.some(r => r.ok === false);
  L.red.emissiveIntensity = anyNg && (sim.phase !== 'done' || Math.floor(blink * 2) % 2 === 0) ? 2.2 : 0;
  L.amber.emissiveIntensity = sim.phase === 'running' || sim.phase === 'closing' ? 2.0 : 0;
  L.green.emissiveIntensity = sim.phase === 'done' && !anyNg ? 2.2 : (sim.phase === 'idle' ? 0.9 : 0);
  ST.startMat.emissiveIntensity = (sim.phase === 'idle' || sim.phase === 'done') ? (Math.sin(blink * 5) > 0 ? 1.6 : 0.2) : (sim.phase === 'loading' ? (Math.sin(blink * 10) > 0 ? 1.6 : 0) : 1.2);
  // camera
  if (camAnim) {
    camAnim.f = Math.min(1, camAnim.f + rawDt * 1.4); const t = smooth(camAnim.f);
    if (!cfg.follow) camera.position.lerpVectors(camAnim.p0, camAnim.p1, t);
    controls.target.lerpVectors(camAnim.t0, camAnim.t1, t);
    if (camAnim.f >= 1) camAnim = null;
  }
  if (HERO) heroDirector(rawDt);
  if (cfg.follow && !camAnim) { const T = ST.robots[0].tcpW(TOOL_G); controls.target.lerp(new THREE.Vector3(T[3], T[7], T[11]), 0.08); }
  controls.update();
  if (now - hudT > 100) { hud(); hudT = now; }
  if (!HERO || (window.__heroVisible !== false && !window.__heroVideoOn)) renderer.render(scene, camera);
  if (viewer && viewer.active) renderViewer();
  requestAnimationFrame(frame);
}
/* ---------- secondary orbit viewer (index STATION panel): same live scene, fence on, numbered hotspots ---------- */
let viewer = null;
const fogs = { hero: scene.fog, view: new THREE.Fog(0x1d2126, 9, 26) };
function mountViewer(cv, hotEl, legendEl) {
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 1.75)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.85;
  const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 80); cam.position.set(4.3, 3.3, 4.4);
  const ctl = new THREE.OrbitControls(cam, cv);
  ctl.target.set(0.05, 1.05, -0.3); ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.autoRotate = true; ctl.autoRotateSpeed = 0.7;
  ctl.enableZoom = false; ctl.maxPolarAngle = Math.PI * 0.47; ctl.minPolarAngle = 0.25;
  ctl.addEventListener('start', () => { ctl.autoRotate = false; clearTimeout(viewer && viewer.resume); });
  ctl.addEventListener('end', () => { viewer.resume = setTimeout(() => ctl.autoRotate = true, 6000); });
  hotEl.innerHTML = ST.anchors.map((a, i) => `<button class="hs" data-i="${i}" aria-label="${a.title}"><b>${i + 1}</b><span>${a.title}</span></button>`).join('');
  if (legendEl) legendEl.innerHTML = ST.anchors.map((a, i) => `<li data-i="${i}"><b>${i + 1}</b><div><strong>${a.title}</strong><small>${a.sub}</small></div></li>`).join('');
  const dots = [...hotEl.querySelectorAll('.hs')], items = legendEl ? [...legendEl.querySelectorAll('li')] : [];
  const hi = (i, on) => { if (dots[i]) dots[i].classList.toggle('on', on); if (items[i]) items[i].classList.toggle('on', on); };
  dots.concat(items).forEach(el => { const i = +el.dataset.i; el.addEventListener('mouseenter', () => hi(i, true)); el.addEventListener('mouseleave', () => hi(i, false)); el.addEventListener('focus', () => hi(i, true)); el.addEventListener('blur', () => hi(i, false)); });
  viewer = { r, cam, ctl, cv, dots, active: false };
  return viewer;
}
function renderViewer() {
  const v = viewer, w = v.cv.clientWidth, h = v.cv.clientHeight;
  if (!w || !h) return;
  if (v.w !== w || v.h !== h) { v.r.setSize(w, h, false); v.cam.aspect = w / h; v.cam.updateProjectionMatrix(); v.w = w; v.h = h; }
  v.ctl.update();
  const bg = scene.background, fv = ST.enc.visible;
  scene.background = new THREE.Color(0x1d2126); scene.fog = fogs.view; ST.enc.visible = ST.door.visible = true;
  v.r.render(scene, v.cam);
  scene.background = bg; scene.fog = fogs.hero; ST.enc.visible = ST.door.visible = fv;
  const p = new THREE.Vector3();
  ST.anchors.forEach((a, i) => {
    p.copy(a.at()).project(v.cam);
    const el = v.dots[i]; if (!el) return;
    const vis = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
    el.style.opacity = vis ? '' : '0';
    el.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px, ${((1 - p.y) / 2 * h).toFixed(1)}px)`;
  });
}
/* hero mode: loop cycles and keep a slow cinematic camera on the dispensing nozzle */
const hero = { wait: 0, ang: 0.6, tgt: new THREE.Vector3(0.28, 1.0, -0.6) };
function heroDirector(dt) {
  if (sim.phase === 'idle') { hero.wait += dt; if (hero.wait > 0.6) { hero.wait = 0; startCycle(); } }
  else if (sim.phase === 'done') { hero.wait += dt; if (hero.wait > 2.5) { hero.wait = 0; startCycle(); } }
  const e2 = sim.execs[1], pasting = !!(e2 && e2.cur && e2.cur.step === 6 && !/대기/.test(e2.cur.label || ''));
  const r = pasting ? ST.robots[1] : ST.robots[0], T = r.tcpW(pasting ? TOOL_N : TOOL_G);
  const want = new THREE.Vector3(T[3], T[7] - 0.04, T[11]);
  hero.tgt.lerp(want, 1 - Math.exp(-dt * 1.2));
  hero.t = (hero.t || 0) + dt; hero.ang = Math.PI * 0.6 + Math.sin(hero.t * 0.06) * 0.45;
  const close = pasting ? 0.75 : 1.1;
  hero.rad = hero.rad == null ? close : lerp(hero.rad, close, 1 - Math.exp(-dt * 0.8));
  camera.position.set(hero.tgt.x + Math.cos(hero.ang) * hero.rad, hero.tgt.y + 0.28 + Math.sin(hero.ang * 0.7) * 0.06, hero.tgt.z + Math.sin(hero.ang) * hero.rad);
  controls.target.copy(hero.tgt);
}
function resize() {
  const v = HERO ? canvas.parentElement : $('.view'); const w = v.clientWidth, h = v.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(HERO ? canvas.parentElement : $('.view'));

/* ---------- boot ---------- */
cfg.joints = new Set(jointsFor(cfg.variant).map(j => j.id));
if (HERO) { cfg.fence = false; cfg.sim = 1.6; controls.enabled = false; }
buildStation(); if (!HERO) { bindUI(); updateUI(); } resize();
requestAnimationFrame(frame);
if (document.fonts && document.fonts.load) document.fonts.load('600 50px "Bodoni Moda"').then(() => ST_plate && ST_plate.draw()).catch(() => {});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ST_plate && ST_plate.draw(); renderTable(); ST.parts.length; });
function fastForward(sec) { const h = 0.02; for (let k = 0; k < sec / h && busy(); k++) { sim.t += h; sim.dir.step(h); if (sim.phase === 'running') sim.execs.forEach(e => e.step(h)); } }
window.__station = { envInfo, envHit, collideInfo, readyPose, planPass, get PASS_CACHE() { return PASS_CACHE; }, collides, collBoxes, robotSamples, mountViewer, get viewer() { return viewer; }, R2_AT, POS, TUNE, choosePosList, posePart, VARIANTS, chainIK, TOOL_N, camera, controls, setView, sim, cfg, get ST() { return ST; }, startCycle, fastForward, resetAll };
})();
