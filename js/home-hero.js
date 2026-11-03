// Home hero (index.html): one small single-colour model (assets/hero/hero-line.glb, built by
// tools/hero-scene/build_hero_glb.py) seen through an orthographic isometric camera. Mood comes from light only:
// one ivory key light (shadows) + a weak rim light, a faint floor mirror, a very light bloom on the lamps and the
// interlock rings. No outlines.
//
// Click a robot: 권한 판정 → 가상 검증 (a point-cloud copy of the robot runs the move first) → 실물 실행
// (the real robot repeats it and carries the part). The part is one object the whole time: the robot carries it
// between two fixtures (A → B, next time B → A); nothing appears, vanishes or jumps.
// The step card and the interlock label are HTML placed at projected 3D points.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

const hero = document.querySelector('.hero');
const canvas = document.getElementById('hero3d');
const elSteps = document.getElementById('heroSteps');
const elRobot = document.getElementById('heroRobot');
const elLock = document.getElementById('heroLock');
const btnPause = document.getElementById('heroPause');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = () => innerWidth < 860;
const SPEED = Math.min(20, Math.max(0.1, +new URLSearchParams(location.search).get('speed') || 1));   // ?speed= for checking

const BG = new THREE.Color('#0f1012');
const AMBER = new THREE.Color('#ffae42');
const DIR = new THREE.Vector3(1, 1, 1).normalize();          // camera looks along -DIR
const TILT = THREE.MathUtils.degToRad(3);                     // mouse parallax, ± 3°

/* ------------------------------------------------------------------ renderer, scene, lights */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(BG, 1);

const scene = new THREE.Scene();
scene.background = BG;
const world = new THREE.Group();          // everything that is mirrored in the floor
scene.add(world);

const hemi = new THREE.HemisphereLight(0xfff4e2, 0x0b0b0c, 0.35);
const key = new THREE.DirectionalLight(0xfff5e8, 1.55);   // ivory key light, the only shadow caster
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
const rim = new THREE.DirectionalLight(0xc9d3e0, 0.45);   // weak rim from behind
scene.add(hemi, key, key.target, rim, rim.target);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

/* ------------------------------------------------------------------ floor: faint mirror, shadow catcher, shader grid */
const floor = new THREE.Group();
scene.add(floor);
const floorU = { uCenter: { value: new THREE.Vector2() }, uR0: { value: 4 }, uR1: { value: 9 }, uBg: { value: BG.clone() } };
const fadeGLSL = /* glsl */`
  uniform vec2 uCenter; uniform float uR0; uniform float uR1;
  float edgeFade(vec2 p){ return smoothstep(uR0, uR1, length(p - uCenter)); }`;
const floorMat = new THREE.ShaderMaterial({   // over the mirrored copy: mostly opaque, fully opaque at the edge
  uniforms: { ...floorU, uFloor: { value: new THREE.Color('#1b1c1f') } },
  transparent: true, depthWrite: true,
  vertexShader: /* glsl */`varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`${fadeGLSL}
    uniform vec3 uFloor; uniform vec3 uBg; varying vec2 vP;
    void main(){ float f = edgeFade(vP); gl_FragColor = vec4(mix(uFloor, uBg, f), mix(0.84, 1.0, f)); }`,
});
const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), floorMat);
floorMesh.renderOrder = -2;
const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5, depthWrite: false }));
shadowMesh.position.y = 0.001;
shadowMesh.receiveShadow = true;
shadowMesh.renderOrder = -1;
const gridMat = new THREE.ShaderMaterial({   // two line sets: 0.5 m and 2 m; no depth write
  uniforms: { ...floorU, uLine: { value: new THREE.Color('#e9e3d5') } },
  transparent: true, depthWrite: false,
  vertexShader: /* glsl */`varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`${fadeGLSL}
    uniform vec3 uLine; varying vec2 vP;
    float grid(vec2 p, float step, float width){
      vec2 g = abs(fract(p / step - 0.5) - 0.5) / (fwidth(p / step) * width);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main(){
      float a = grid(vP, 0.5, 1.0) * 0.022 + grid(vP, 2.0, 1.2) * 0.05;
      a *= 1.0 - edgeFade(vP);
      if (a < 0.002) discard;
      gl_FragColor = vec4(uLine, a);
    }`,
});
const gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), gridMat);
gridMesh.position.y = 0.002;
gridMesh.renderOrder = 0;
floor.add(floorMesh, shadowMesh, gridMesh);

/* Render pass: the world upside down under the floor first (the mirror), then the floor over it, then the world. */
class MirrorRenderPass extends Pass {
  constructor() { super(); this.mirror = true; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.renderToScreen ? null : readBuffer);
    r.clear();
    if (this.mirror) {
      world.scale.y = -1; world.updateMatrixWorld(true);
      floor.visible = false; tags.visible = false;
      const ky = key.position.y, ry = rim.position.y;
      key.position.y = -ky; rim.position.y = -ry;
      r.shadowMap.autoUpdate = false;
      r.render(scene, camera);
      r.shadowMap.autoUpdate = true;
      key.position.y = ky; rim.position.y = ry;
      world.scale.y = 1; world.updateMatrixWorld(true);
      floor.visible = true; tags.visible = true;
      r.clearDepth();
    }
    r.render(scene, camera);
    r.autoClear = auto;
  }
}

const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
const mirrorPass = new MirrorRenderPass();
const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.32, 0.45, 1.6);   // very light, only lamps/rings pass the threshold
composer.addPass(mirrorPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const tags = new THREE.Group();   // invisible helpers (click targets); never mirrored
scene.add(tags);

/* ------------------------------------------------------------------ model */
const robots = [];
let box3 = new THREE.Box3(), center = new THREE.Vector3();
const glows = [];

new GLTFLoader().load('assets/hero/hero-line.glb', (gltf) => {
  const root = gltf.scene;
  world.add(root);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { m.envMapIntensity = 0; if (m.name !== 'amber') { m.metalness = Math.min(m.metalness, 0.2); } });
    if (o.name.startsWith('glow_')) {
      o.castShadow = false;
      o.material = o.material.clone();
      o.material.emissive = AMBER.clone();
      o.material.emissiveIntensity = 3.2;
      glows.push(o);
    }
  });
  root.updateMatrixWorld(true);
  box3 = new THREE.Box3().setFromObject(root);
  box3.getCenter(center);
  const size = box3.getSize(new THREE.Vector3());
  floorU.uCenter.value.set(center.x, center.z);
  const rad = Math.hypot(size.x, size.z) / 2;
  floorU.uR0.value = rad * 0.55;
  floorU.uR1.value = rad * 1.05;
  const sc = key.shadow.camera;
  sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad; sc.near = 0.5; sc.far = 60;
  sc.updateProjectionMatrix();
  key.position.copy(center).add(new THREE.Vector3(-0.35, 1, 0.55).normalize().multiplyScalar(25));
  key.target.position.copy(center);
  rim.position.copy(center).add(new THREE.Vector3(-0.6, 0.55, -1).normalize().multiplyScalar(25));
  rim.target.position.copy(center);

  for (const R of ['R1', 'R2']) { const r = makeRobot(root, R); if (r) robots.push(r); }
  resize();
  hero.classList.add('ready');
  if (!reduce) scheduleDemo(2600);
  kick();
}, undefined, (e) => {
  const p = document.createElement('p'); p.className = 'err'; p.textContent = '3D 장면을 불러오지 못했습니다';
  hero.appendChild(p); console.warn(e);
});

/* ------------------------------------------------------------------ robots: analytic IK (yaw + planar 2-link, tool down) */
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function makeRobot(root, R) {
  const n = (s) => root.getObjectByName(`${R}_${s}`);
  const base = n('base'), j1 = n('j1'), j2 = n('j2'), j3 = n('j3'), j4 = n('j4'), tip = n('tip');
  const A = n('pickA'), B = n('pickB'), part = n('part');
  if (!base || !j1 || !j2 || !j3 || !j4 || !tip || !A || !B || !part) return null;
  const P = (o) => o.getWorldPosition(new THREE.Vector3());
  const pj1 = P(j1), pj2 = P(j2), pj3 = P(j3), pj4 = P(j4), ptip = P(tip);
  const L1 = pj2.distanceTo(pj3), L2 = pj3.distanceTo(pj4), LT = pj4.distanceTo(ptip);
  const r = {
    name: R, base, j1, j2, j3, j4, tip, part, L1, L2, LT,
    axis: new THREE.Vector2(pj1.x, pj1.z), shoulderY: pj2.y,
    home: ptip.clone(), fix: [P(A), P(B)], at: 0,       // the part sits at fixture `at`
    reach: L1 + L2 + 0.06, lamp: glows.find((g) => g.name === `glow_${R}`),
  };
  // interlock ring (emissive; blooms only while the robot is in a sequence)
  const ring = new THREE.Mesh(new THREE.RingGeometry(r.reach - 0.035, r.reach, 128).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: AMBER, emissiveIntensity: 0.4, roughness: 1, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false }));
  ring.position.set(pj1.x, 0.012, pj1.z);
  ring.renderOrder = 1;
  world.add(ring);
  r.ring = ring;
  // click target
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 12), new THREE.MeshStandardMaterial({ visible: false }));
  hit.position.set(pj1.x, 1.1, pj1.z);
  hit.userData.robot = r;
  tags.add(hit);
  r.hit = hit;
  // point-cloud twin (same joint tree, every mesh sampled into points)
  r.ghost = makeGhost(base);
  r.ghostPart = pointsOf(part, 260);
  r.ghostPart.visible = false;
  world.add(r.ghostPart);
  const g = (s) => r.ghost.getObjectByName(`${R}_${s}`);
  r.gj = { j1: g('j1'), j2: g('j2'), j3: g('j3'), j4: g('j4'), tip: g('tip') };
  pose(r, r.j1, r.j2, r.j3, r.j4, r.home);
  return r;
}

const ptsMat = new THREE.PointsMaterial({ color: new THREE.Color(0.62, 0.6, 0.56), size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
function pointsOf(obj, count) {   // sample the surfaces of a mesh (or of all meshes under a node) into one Points
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert(), list = [];
  obj.traverse((o) => { if (o.isMesh) list.push(o); });
  const areas = list.map((m) => { m.geometry.computeBoundingBox(); const z = m.geometry.boundingBox.getSize(new THREE.Vector3()); return 2 * (z.x * z.y + z.y * z.z + z.x * z.z) + 1e-6; });
  const sum = areas.reduce((a, b) => a + b, 0), pos = [];
  list.forEach((m, i) => {
    const s = new MeshSurfaceSampler(new THREE.Mesh(m.geometry)).build();
    const toObj = inv.clone().multiply(m.matrixWorld);
    const n = Math.max(8, Math.round(count * areas[i] / sum));
    for (let k = 0; k < n; k++) { s.sample(_v); _v.applyMatrix4(toObj); pos.push(_v.x, _v.y, _v.z); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = new THREE.Points(g, ptsMat);
  p.position.copy(obj.position); p.quaternion.copy(obj.quaternion); p.scale.copy(obj.scale);
  p.name = obj.name + '_pts';
  return p;
}
function makeGhost(base) {   // same joint tree; every mesh replaced by sampled points
  base.updateMatrixWorld(true);
  const ghost = base.clone(true);
  ghost.updateMatrixWorld(true);
  const meshes = [];
  ghost.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const parent = m.parent;
    if (!m.name.startsWith('glow_')) {
      m.geometry.computeBoundingBox();
      const z = m.geometry.boundingBox.getSize(new THREE.Vector3());
      const area = 2 * (z.x * z.y + z.y * z.z + z.x * z.z);
      parent.add(pointsOf(m, Math.max(60, Math.min(900, Math.round(area * 700)))));
    }
    parent.remove(m);
  }
  ghost.visible = false;
  base.parent.add(ghost);
  return ghost;
}

// Tool-centre target (world) → joint angles. Rest pose: upper arm up, forearm along +X, tool down.
function pose(r, j1, j2, j3, j4, t) {
  const dx = t.x - r.axis.x, dz = t.z - r.axis.y;
  j1.rotation.y = Math.atan2(-dz, dx);
  const rad = Math.hypot(dx, dz), h = t.y + r.LT - r.shoulderY;
  let d = Math.hypot(rad, h);
  d = Math.min(d, r.L1 + r.L2 - 1e-4);
  const phi = Math.atan2(h, rad);
  const alpha = Math.acos(THREE.MathUtils.clamp((r.L1 * r.L1 + d * d - r.L2 * r.L2) / (2 * r.L1 * d), -1, 1));
  const a = phi + alpha;                                 // upper arm angle (elbow up)
  const ex = r.L1 * Math.cos(a), ey = r.L1 * Math.sin(a);
  const b = Math.atan2(h - ey, rad - ex);                // forearm angle
  j2.rotation.z = a - Math.PI / 2;
  j3.rotation.z = b - a + Math.PI / 2;
  j4.rotation.z = -b;
}

/* ------------------------------------------------------------------ the move: home → above A → down → grip → up → above B → down → release → up → home */
const ease = (x) => x * x * (3 - 2 * x);
function path(r) {
  const from = r.fix[r.at], to = r.fix[1 - r.at];
  const up = (p, h) => p.clone().setY(p.y + h);
  const K = [
    { p: r.home, t: 0 },
    { p: up(from, 0.32), t: 0.75 },
    { p: from, t: 0.4 },
    { p: from, t: 0.25, grip: true },
    { p: up(from, 0.32), t: 0.4 },
    { p: up(to, 0.32), t: 0.95 },
    { p: to, t: 0.4 },
    { p: to, t: 0.25, release: true },
    { p: up(to, 0.32), t: 0.4 },
    { p: r.home, t: 0.7 },
  ];
  let acc = 0;
  for (const k of K) { acc += k.t; k.end = acc; }
  return { K, total: acc, from, to };
}
function sample(K, t, out) {
  for (let i = 1; i < K.length; i++) {
    if (t <= K[i].end || i === K.length - 1) {
      const a = K[i - 1], b = K[i], u = b.t ? ease(THREE.MathUtils.clamp((t - a.end) / b.t, 0, 1)) : 1;
      return { p: out.lerpVectors(a.p, b.p, u), seg: i };
    }
  }
  return { p: out.copy(K[K.length - 1].p), seg: K.length - 1 };
}

/* ------------------------------------------------------------------ sequence state machine */
// idle → auth (권한 판정) → verify (가상 검증, point cloud moves) → run (실물 실행, real robot moves) → done → idle
const T_AUTH = 1.1, T_DONE = 1.4;
let seq = null;
function start(r) {
  if (seq || !r) return;
  const pth = path(r);
  seq = { r, pth, phase: 'auth', t: 0, carried: false, gCarried: false };
  elRobot.textContent = `로봇 ${r.name === 'R1' ? '1' : '2'}`;
  setStep(0);
  r.ghostPart.position.copy(r.part.getWorldPosition(_v));
  world.worldToLocal(r.ghostPart.position);
  r.ghostPart.quaternion.copy(r.part.quaternion);
}
function setStep(i) {
  elSteps.classList.toggle('on', i >= 0);
  elSteps.querySelectorAll('span').forEach((s) => {
    const k = +s.dataset.s;
    s.classList.toggle('now', k === i);
    s.classList.toggle('done', k < i || i === 3);
  });
}
function attach(part, parent) { parent.attach(part); }

function stepSeq(dt) {
  if (!seq) return;
  const { r, pth } = seq;
  seq.t += dt;
  const ringOn = (k) => { r.ring.material.emissiveIntensity = THREE.MathUtils.lerp(0.4, 5.5, k); r.ring.material.opacity = THREE.MathUtils.lerp(0.3, 0.95, k); };
  if (seq.phase === 'auth') {
    const k = Math.min(1, seq.t / T_AUTH);
    ringOn(ease(k));
    if (r.lamp) r.lamp.material.emissiveIntensity = 3.2 + 4 * (0.5 + 0.5 * Math.sin(seq.t * 14));
    if (seq.t >= T_AUTH) {
      seq.phase = 'verify'; seq.t = 0; setStep(1);
      r.ghost.visible = true; r.ghostPart.visible = true;
      if (r.lamp) r.lamp.material.emissiveIntensity = 6;
    }
  } else if (seq.phase === 'verify') {
    ptsMat.opacity = Math.min(1, seq.t / 0.3);
    const { p, seg } = sample(pth.K, seq.t, _w);
    pose(r, r.gj.j1, r.gj.j2, r.gj.j3, r.gj.j4, p);
    if (seg >= 4 && seg <= 7 && !seq.gCarried) { r.ghost.updateMatrixWorld(true); attach(r.ghostPart, r.gj.tip); seq.gCarried = true; }
    if (seg >= 8 && seq.gCarried) { r.ghost.updateMatrixWorld(true); attach(r.ghostPart, world); seq.gCarried = false; }
    if (seq.t >= pth.total) {
      seq.phase = 'run'; seq.t = 0; setStep(2);
    }
  } else if (seq.phase === 'run') {
    ptsMat.opacity = Math.max(0, 1 - seq.t / 0.45);
    if (ptsMat.opacity === 0) { r.ghost.visible = false; r.ghostPart.visible = false; }
    const { p, seg } = sample(pth.K, seq.t, _w);
    pose(r, r.j1, r.j2, r.j3, r.j4, p);
    r.base.updateMatrixWorld(true);
    if (seg >= 4 && seg <= 7 && !seq.carried) { attach(r.part, r.tip); seq.carried = true; }
    if (seg >= 8 && seq.carried) { attach(r.part, world.children[0]); seq.carried = false; }
    if (seq.t >= pth.total) {
      r.at = 1 - r.at;
      seq.phase = 'done'; seq.t = 0; setStep(3);
    }
  } else if (seq.phase === 'done') {
    ringOn(1 - ease(Math.min(1, seq.t / T_DONE)));
    if (r.lamp) r.lamp.material.emissiveIntensity = 3.2;
    if (seq.t >= T_DONE) {
      setStep(-1);
      seq = null;
      if (!reduce) scheduleDemo(7000);
    }
  }
}

// nobody clicks: the robots take turns on their own
let demoTimer = 0, demoNext = 1, userTouched = false;
function scheduleDemo(ms) {
  clearTimeout(demoTimer);
  demoTimer = setTimeout(() => { if (!paused && !seq && robots.length) { start(robots[demoNext % robots.length]); demoNext++; kick(); } }, userTouched ? ms + 6000 : ms);
}

/* ------------------------------------------------------------------ overlays: project 3D points into the hero */
function place(el, p, dx = 0, dy = 0) {
  _v.copy(p).project(camera);
  const w = hero.clientWidth, h = hero.clientHeight;
  el.style.transform = `translate(${Math.round((_v.x * 0.5 + 0.5) * w + dx)}px, ${Math.round((-_v.y * 0.5 + 0.5) * h + dy)}px)`;
}
function updateTags() {
  if (!seq) { elLock.classList.remove('on'); return; }
  const r = seq.r;
  place(elSteps, _w.set(r.axis.x, box3.max.y + 0.4, r.axis.y), -elSteps.offsetWidth * 0.5, -elSteps.offsetHeight);
  const a = Math.PI * 0.25;   // ring point towards the viewer
  place(elLock, _w.set(r.axis.x + Math.cos(a) * r.reach, 0, r.axis.y + Math.sin(a) * r.reach), 8, 6);
  elLock.classList.toggle('on', seq.phase !== 'done');
}

/* ------------------------------------------------------------------ camera: fit the line into the right half */
const look = new THREE.Vector3();
let tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
function placeCamera() {
  const d = DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), tiltX);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
  d.applyAxisAngle(right, -tiltY);
  camera.position.copy(look).addScaledVector(d, 40);
  camera.up.set(0, 1, 0);
  camera.lookAt(look);
  camera.updateMatrixWorld();
}
function resize() {
  const w = hero.clientWidth, h = hero.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  mirrorPass.mirror = !small();
  if (box3.isEmpty()) return;
  look.copy(center); tiltX = tiltY = 0; placeCamera();
  // content extent in view space
  const inv = camera.matrixWorldInverse, b = new THREE.Box3();
  for (let i = 0; i < 8; i++) b.expandByPoint(_v.set(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z).applyMatrix4(inv));
  const cw = b.max.x - b.min.x, ch = b.max.y - b.min.y, cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
  const A = w / h;
  let L, R, T, B;
  if (!small()) {          // right half; copy sits on the left
    const vw = Math.max(cw * 1.58, ch * 1.0 * A), vh = vw / A;
    L = cx - vw * 0.7; R = L + vw; B = cy - vh * 0.5; T = B + vh;
  } else {                 // narrow: copy on top, line in the lower part
    const vw = Math.max(cw * 1.06, (ch * 1.08 / 0.5) * A), vh = vw / A;
    L = cx - vw / 2; R = L + vw; B = cy - vh * 0.27; T = B + vh;
  }
  Object.assign(camera, { left: L, right: R, top: T, bottom: B });
  camera.updateProjectionMatrix();
  kick();
}
new ResizeObserver(resize).observe(hero);

hero.addEventListener('pointermove', (e) => {
  if (reduce || e.pointerType !== 'mouse') return;
  const r = hero.getBoundingClientRect();
  aimX = ((e.clientX - r.left) / r.width - 0.5) * 2 * TILT;
  aimY = ((e.clientY - r.top) / r.height - 0.5) * 2 * TILT;
  hover(e);
  kick();
});
hero.addEventListener('pointerleave', () => { aimX = aimY = 0; kick(); });

/* ------------------------------------------------------------------ picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(robots.map((x) => x.hit), false)[0];
  return hit ? hit.object.userData.robot : null;
}
function hover(e) { hero.style.cursor = !seq && pick(e) ? 'pointer' : ''; }
hero.addEventListener('click', (e) => {
  if (e.target.closest('a,button')) return;
  const r = pick(e);
  if (!r) return;
  userTouched = true;
  clearTimeout(demoTimer);
  if (paused) setPaused(false);
  start(r);
  kick();
});

/* ------------------------------------------------------------------ pause, visibility, loop */
let paused = reduce, visible = true, running = false, last = 0;
function setPaused(p) {
  paused = p;
  btnPause.setAttribute('aria-pressed', String(p));
  btnPause.querySelector('span').textContent = p ? '다시 재생' : '움직임 멈춤';
  btnPause.querySelector('svg').innerHTML = p
    ? '<path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/>'
    : '<rect x="2" y="1.5" width="2.6" height="9" fill="currentColor"/><rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor"/>';
  if (!p && !seq && !reduce) scheduleDemo(1500);
  if (p) clearTimeout(demoTimer);
  kick();
}
setPaused(paused);
btnPause.addEventListener('click', () => setPaused(!paused));
new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(hero);
document.addEventListener('visibilitychange', kick);

function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) stepSeq(dt * SPEED);
  tiltX += (aimX - tiltX) * Math.min(1, dt * 4);
  tiltY += (aimY - tiltY) * Math.min(1, dt * 4);
  placeCamera();
  composer.render(dt);
  updateTags();
  const settling = Math.abs(aimX - tiltX) + Math.abs(aimY - tiltY) > 1e-4;
  if (visible && !document.hidden && ((seq && !paused) || settling)) requestAnimationFrame(frame);
  else running = false;
}
