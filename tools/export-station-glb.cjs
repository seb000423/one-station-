// Exports the ONE STATION scene that console.html builds (default settings: tube product, 6 slots)
// to realvirtual-models/station.glb, so console2.html can open it in realvirtual WEB.
//
// The exported model moves like console 1: console 1's cycle is stepped at a fixed timestep,
// every axis is sampled at console 1's default 4x sim speed (so 1x playback in realvirtual looks like
// console 1 on SIM 4x), and the samples are embedded as a realvirtual drive recording
// (extras.realvirtual DrivesRecorder + DrivesRecording_compact) that plays on load and loops.
// Robots become real joint chains (DH frames of the FR5 below), the rail, positioner axes,
// clamps, door leaves and gripper fingers become drives, and each product gets a 6-axis
// (XYZ + YXZ rotation) rig so it follows the gripper and the positioner.
//
// The same run also writes station-timeline.json next to the GLB: what console 1's HUD and
// result table show at every recorded frame, plus the static panel content, so console2.html
// can show console 1's panels in sync with the realvirtual playback. Math.random is seeded,
// so the DMC codes, weights and simulated faults are the same on every export.
//
// Usage (needs Node and Playwright; Microsoft Edge is used as the browser):
//   node tools/export-station-glb.cjs [path/to/playwright] [out.glb]
// The playwright path defaults to ../realvirtual-WEB/node_modules/playwright.
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PW = process.argv[2] || path.resolve(ROOT, '../realvirtual-WEB/node_modules/playwright');
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'realvirtual-models/station.glb'));
const TIMELINE = OUT.replace(/.glb$/i, '') + '-timeline.json';
const SEED = 20261024;
const EXPORTER = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/GLTFExporter.js';
const { chromium } = require(PW);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

// Runs in the page. Returns { glb (base64), info }.
async function exportInPage() {
  const S = window.__station;
  // stop console 1's render loop: it rewrites robot link transforms every frame
  window.requestAnimationFrame = () => 0;
  await new Promise(r => setTimeout(r, 200));

  // FAIRINO FR5 DH table, same as console.html KIN
  const DH = { d: [0.152, 0, 0, 0.102, 0.102, 0.100], a: [0, -0.425, -0.395, 0, 0, 0], al: [Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0] };
  const linkM = i => new THREE.Matrix4().makeTranslation(DH.a[i], 0, DH.d[i]).multiply(new THREE.Matrix4().makeRotationX(DH.al[i]));
  const frames = q => { const F = [new THREE.Matrix4()]; let T = new THREE.Matrix4(); for (let i = 0; i < 6; i++) { T = T.clone().multiply(new THREE.Matrix4().makeRotationZ(q[i])).multiply(linkM(i)); F.push(T); } return F; };
  const rowMajor = A => new THREE.Matrix4().set(...A);
  const TOOL_G = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.155, 0, 0, 0, 1];
  const mulRM = (A, B) => { const C = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) C[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c] + A[r * 4 + 3] * B[12 + c]; return C; };
  const DEG = 180 / Math.PI;

  // ---------- 0. static panel content, as console 1 renders it ----------
  const $ = q => document.querySelector(q);
  const panel = {
    cellDesc: $('#cellDesc').textContent, beadV: $('#beadV').textContent, speedV: $('#speedV').textContent,
    tolV: $('#tolV').textContent, faultV: $('#faultV').textContent, kTgt: $('#kTgt').textContent,
    jointList: $('#jointList').innerHTML, variant: S.cfg.variant, slots: S.cfg.slots, beadW: S.cfg.beadW, speed: S.cfg.speed, tol: S.cfg.tol, fault: S.cfg.fault
  };
  // same strings as console.html STEPS (used by its HUD outside the running phase)
  const STEPS = ['지그 로딩·센서 확인', 'START·도어 닫힘', '파트 픽업', 'DMC 판독', '계량 (도포 전)', '포지셔너 회전 · Ni 페이스트 도포', '계량 (도포 후)', '지그 복귀', '판정·도어 열림'];
  // HUD state exactly as console.html hud() derives it
  const hudState = () => {
    const sim = S.sim, ST = S.ST; let curStep = 0;
    const labels = ST.robots.map((r, i) => {
      const ex = sim.execs[i], c = ex && ex.cur; let lbl = '대기';
      if (sim.phase === 'running') lbl = c ? c.label || '' : (ex && ex.doneAll ? '완료' : '');
      else if (sim.dir && sim.dir.cur && sim.dir.cur.step) lbl = STEPS[sim.dir.cur.step - 1];
      if (i === 0) curStep = sim.phase === 'running' ? (c && c.step) || 0 : (sim.dir && sim.dir.cur ? sim.dir.cur.step || 0 : 0);
      return lbl;
    });
    const results = JSON.stringify(sim.results.map(r => ({ code: r.code, seen: !!r.seen, w0: r.w0 ?? null, d: r.d ?? null, dev: r.dev ?? null, ok: r.ok ?? null, fault: r.fault ? { joint: r.fault.joint, kind: r.fault.kind } : null })));
    const R = ST.robots, jr = R.map(r => r.q.map(v => v * DEG)).flat().concat([R[0].s * 1000, ST.pos.A * DEG, ST.pos.C * DEG]);
    return { phase: sim.phase, t: sim.t, r1: labels[0], r2: labels[1], step: curStep, results, ik: R.reduce((a, b) => a + b.ikFail, 0), jr };
  };
  const hudRec = [];

  // ---------- 1. record console 1's cycle (values only) ----------
  const H = 0.02, SPEED = 4, DT = 0.04, SUB = Math.round(DT * SPEED / H); // simulate at 20 ms, one 40 ms frame per 160 ms of sim time
  const sample = () => {
    const ST = S.ST, v = {};
    ST.robots.forEach(r => {
      r.update(); if (r.carriage) r.carriage.position.x = r.s;
      r.q.forEach((q, i) => v[`${r.name}_J${i + 1}`] = q);
      if (r.cfg.rail) v[`${r.name}_Rail`] = r.s;
      (r.fingers || []).forEach((f, i) => v[`${r.name}_Finger_${i ? 'R' : 'L'}`] = f.position.x);
    });
    ST.pos.update();
    v.Positioner_A_Tilt = ST.pos.tilt.rotation.x; v.Positioner_C_Rotary = ST.pos.rot.rotation.y;
    ST.pos.clamps.forEach((c, i) => v[`Positioner_Clamp_${i + 1}`] = c.rotation.x);
    ST.leaves.forEach((l, i) => v[i ? 'Door_Leaf_R' : 'Door_Leaf_L'] = l.position.x);
    ST.parts.forEach((p, i) => {
      if (p.held) p.setPose(mulRM(p.held.robot.tcpW(TOOL_G), p.held.off)); else if (p.mount === 'pos') p.setPose(S.posePart(ST.pos.A, ST.pos.C));
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      rowMajor(p.pose).decompose(pos, q, sc);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      Object.assign(v, { [`Part${i + 1}_TX`]: pos.x, [`Part${i + 1}_TY`]: pos.y, [`Part${i + 1}_TZ`]: pos.z, [`Part${i + 1}_RY`]: e.y, [`Part${i + 1}_RX`]: e.x, [`Part${i + 1}_RZ`]: e.z });
      if (!p.obj.visible) v.__hidden = (v.__hidden || 0) + 1;
    });
    hudRec.push(hudState());
    return v;
  };
  S.cfg.sim = 0;
  const rec = [sample()];
  S.startCycle();
  let t = 0, tail = 0;
  while (tail < 1 / DT && t < 3600) {
    for (let k = 0; k < SUB; k++) { t += H; S.sim.t += H; if (S.sim.dir) S.sim.dir.step(H); if (S.sim.phase === 'running') S.sim.execs.forEach(e => e.step(H)); }
    rec.push(sample());
    if (S.sim.phase === 'done') tail++;
  }
  const cycleSec = S.sim.cycleTotal, hiddenFrames = rec.filter(v => v.__hidden).length;
  // console.html's '홈 복귀' segment overrides begin() without setting dq, so R1's joints turn NaN
  // from there to the end of the cycle. Replay what it intends: ease back to the home pose over
  // that segment's frames, then hold it.
  let nanFrames = 0;
  Object.keys(rec[0]).forEach(key => {
    for (let a = 0; a < rec.length; a++) {
      if (!Number.isNaN(rec[a][key])) continue;
      let b = a; while (b + 1 < rec.length && Number.isNaN(rec[b + 1][key])) b++;
      let k = 0; while (a + k <= b && hudRec[a + k].r1 === '홈 복귀') k++;
      const from = a ? rec[a - 1][key] : rec[0][key], to = rec[0][key];
      for (let i = a; i <= b; i++) { const t = k ? Math.min(1, (i - a + 1) / k) : 1, e = t * t * (3 - 2 * t); rec[i][key] = from + (to - from) * e; nanFrames++; }
      a = b;
    }
  });
  hudRec.forEach((h, f) => S.ST.robots.forEach((r, ri) => { for (let i = 0; i < 6; i++) h.jr[ri * 6 + i] = rec[f][`${r.name}_J${i + 1}`] * DEG; }));
  // change points only, except the joint readout (every 2nd frame)
  const seg = key => { const out = []; hudRec.forEach((h, f) => { if (!out.length || out[out.length - 1][1] !== h[key]) out.push([f, h[key]]); }); return out; };
  const timeline = {
    version: 1, frames: hudRec.length, fixedDeltaTime: DT, simPerFrame: H * SUB, parts: S.ST.parts.length, cycleTotal: cycleSec, steps: STEPS, panel,
    phase: seg('phase'), r1: seg('r1'), r2: seg('r2'), step: seg('step'), ik: seg('ik'),
    results: seg('results').map(([f, r]) => [f, JSON.parse(r)]),
    jreadEvery: 2, jread: hudRec.filter((h, f) => f % 2 === 0).map(h => h.jr.map(v => v.toFixed(0)).join(','))
  };

  // ---------- 2. rebuild the idle station and give it real hierarchies ----------
  S.resetAll();
  const ST = S.ST, scene = ST.group.parent;
  const root = new THREE.Group(); root.name = 'ONE_STATION';
  const name = (o, n) => { if (o) o.name = n; };
  const meshesWith = mat => { const out = []; ST.group.traverse(o => { if (o.isMesh && o.material === mat) out.push(o); }); return out; };
  name(ST.group, 'Station'); name(ST.enc, 'Enclosure'); name(ST.door, 'Door');
  ST.leaves.forEach((l, i) => name(l, i ? 'Door_Leaf_R' : 'Door_Leaf_L'));
  name(ST.pos.tilt, 'Positioner_A_Tilt'); name(ST.pos.rot, 'Positioner_C_Rotary');
  ST.pos.clamps.forEach((c, i) => name(c, `Positioner_Clamp_${i + 1}`));
  ST.sensors.forEach((m, i) => meshesWith(m).forEach(o => name(o, `Jig_Sensor_${i + 1}`)));
  Object.entries(ST.lamps).forEach(([k, m]) => (m.isMaterial ? meshesWith(m) : [m]).forEach(o => name(o, `TowerLamp_${k}`)));
  meshesWith(ST.startMat).forEach(o => name(o, 'StartButton'));
  ST.group.traverse(o => { if (o.isMesh && o.material.map === ST.hmi.tex) name(o, 'HMI_Screen'); });
  root.add(ST.group); scene.add(root);

  // robots: links hang off DH joint frames instead of being placed every frame
  const LINKS = ['base', 'j2h', 'upper', 'j3h', 'fore', 'j4h', 'j5h', 'j6h', 'baseRing', 'j1cap', 'j2cap', 'j3cap', 'j4cap', 'j5cap', 'j6cap', 'flange'];
  let maxErr = 0;
  ST.robots.forEach(r => {
    const rootG = r.root, q0 = r.q.slice(), links = rootG.children.slice(0, 16);
    if (r.reach) r.reach.removeFromParent();
    name(rootG, r.name + (r.kind === 'handler' ? '_Handler' : '_Dispenser'));
    links.forEach((m, i) => name(m, `${r.name}_${LINKS[i]}`));
    name(r.tool, `${r.name}_Tool`);
    (r.fingers || []).forEach((f, i) => name(f, `${r.name}_Finger_${i ? 'R' : 'L'}`));
    // which DH frame each link mesh is rigid with: compare frame-local poses over random joint sets
    const trials = [0, 1, 2].map(() => q0.map(v => v + (Math.random() - 0.5) * 1.5));
    const loc = trials.map(q => { r.q = q; r.update(); const F = frames(q); return links.map(m => { m.updateMatrix(); return F.map(f => f.clone().invert().multiply(m.matrix)); }); });
    const frameOf = links.map((m, j) => {
      let best = 0, bestE = Infinity;
      for (let k = 0; k <= 6; k++) { let e = 0; for (let t = 1; t < trials.length; t++) loc[t][j][k].elements.forEach((x, n) => e += Math.abs(x - loc[0][j][k].elements[n])); if (e < bestE) { bestE = e; best = k; } }
      return best;
    });
    r.q = q0; r.update();
    rootG.updateMatrixWorld(true);
    const before = links.map(m => m.matrixWorld.clone());
    const F0 = frames(q0), fNode = [rootG];
    let parent = rootG;
    for (let i = 0; i < 6; i++) {
      const J = new THREE.Group(); J.name = `${r.name}_J${i + 1}`; J.rotation.z = q0[i]; parent.add(J);
      const F = new THREE.Group(); F.name = `${r.name}_F${i + 1}`; linkM(i).decompose(F.position, F.quaternion, F.scale); J.add(F);
      fNode.push(F); parent = F;
    }
    links.forEach((m, j) => {
      const k = frameOf[j]; m.updateMatrix();
      F0[k].clone().invert().multiply(m.matrix).decompose(m.position, m.quaternion, m.scale);
      fNode[k].add(m);
    });
    r.tool.matrixAutoUpdate = true; r.tool.position.set(0, 0, 0); r.tool.quaternion.identity(); r.tool.scale.set(1, 1, 1); fNode[6].add(r.tool);
    if (r.carriage) { name(r.carriage, `${r.name}_RailCarriage`); rootG.attach(r.carriage); }
    rootG.updateMatrixWorld(true);
    links.forEach((m, j) => m.matrixWorld.elements.forEach((x, n) => maxErr = Math.max(maxErr, Math.abs(x - before[j].elements[n]))));
  });

  // paste beads grow through drawRange, which a drive recording cannot express: leave them out
  ST.parts.forEach(p => p.joints.forEach(j => { if (j.mesh) j.mesh.visible = false; if (j.line) j.line.visible = false; }));
  // products: TX > TY > TZ > RY > RX > RZ rig per part, authored at the idle pose
  ST.parts.forEach((p, i) => {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    rowMajor(p.pose).decompose(pos, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    let parent = root;
    const chain = [['TX', n => n.position.x = pos.x], ['TY', n => n.position.y = pos.y], ['TZ', n => n.position.z = pos.z], ['RY', n => n.rotation.y = e.y], ['RX', n => n.rotation.x = e.x], ['RZ', n => n.rotation.z = e.z]];
    chain.forEach(([k, set]) => { const n = new THREE.Group(); n.name = `Part${i + 1}_${k}`; set(n); parent.add(n); parent = n; });
    name(p.obj, `Part${i + 1}_${p.code}`);
    p.obj.matrixAutoUpdate = true; p.obj.position.set(0, 0, 0); p.obj.quaternion.identity(); p.obj.scale.copy(sc);
    parent.add(p.obj);
  });

  // ---------- 3. drives + recording ----------
  // [recorded key, node name, Direction, ReverseDirection, unit] — Reverse makes every axis positive along +X/+Y/+Z
  const lin = 'mm', rot = 'deg', D = [];
  ST.robots.forEach(r => {
    if (r.cfg.rail) D.push([`${r.name}_Rail`, r.root.name, 'LinearX', true, lin]);
    for (let i = 1; i <= 6; i++) D.push([`${r.name}_J${i}`, `${r.name}_J${i}`, 'RotationZ', true, rot]);
    (r.fingers || []).forEach((f, i) => D.push([f.name, f.name, 'LinearX', true, lin]));
  });
  D.push(['Positioner_A_Tilt', 'Positioner_A_Tilt', 'RotationX', false, rot], ['Positioner_C_Rotary', 'Positioner_C_Rotary', 'RotationY', true, rot]);
  ST.pos.clamps.forEach((c, i) => D.push([c.name, c.name, 'RotationX', false, rot]));
  ST.leaves.forEach(l => D.push([l.name, l.name, 'LinearX', true, lin]));
  ST.parts.forEach((p, i) => [['TX', 'LinearX', true, lin], ['TY', 'LinearY', false, lin], ['TZ', 'LinearZ', false, lin], ['RY', 'RotationY', true, rot], ['RX', 'RotationX', false, rot], ['RZ', 'RotationZ', true, rot]]
    .forEach(([k, dir, rev, u]) => D.push([`Part${i + 1}_${k}`, `Part${i + 1}_${k}`, dir, rev, u])));

  // unique names everywhere: the glTF loader renames duplicates, which would break drive paths
  const seen = new Set();
  root.traverse(o => { let n = o.name || (o.isMesh ? 'mesh' : 'node'), k = 1; if (seen.has(n)) { while (seen.has(`${n}_${k}`)) k++; n = `${n}_${k}`; } o.name = n; seen.add(n); });
  const byName = n => root.getObjectByName(n);
  const pathOf = o => { const p = []; for (let c = o; c && c !== scene; c = c.parent) p.unshift(c.name); return p.join('/'); };

  const drives = D.map(([key, n, dir, rev], id) => {
    const node = byName(n);
    node.userData = { realvirtual: { Drive: { Direction: dir, ReverseDirection: rev, TargetSpeed: 1000, UseLimits: false } } };
    return { id, path: pathOf(node), key };
  });
  // wrap angles to the nearest turn of the idle value so the rotary deltas stay continuous
  const positions = [];
  rec.forEach(v => D.forEach(([key, , , , u]) => {
    let d = v[key] - rec[0][key];
    if (u === rot) { d = Math.atan2(Math.sin(d), Math.cos(d)); }
    positions.push(u === lin ? Math.round(d * 10000) / 10 : Math.round(d * DEG * 100) / 100);
  }));
  // keep rotary channels continuous across ±180°
  for (let j = 0; j < D.length; j++) if (D[j][4] === rot) for (let f = 1; f < rec.length; f++) {
    const a = positions[(f - 1) * D.length + j]; let b = positions[f * D.length + j];
    while (b - a > 180) b -= 360; while (b - a < -180) b += 360; positions[f * D.length + j] = Math.round(b * 100) / 100;
  }
  root.userData = { realvirtual: {
    _formatVersion: '1.0',
    DrivesRecorder: { PlayOnStart: true, Loop: true },
    DrivesRecording_compact: { fixedDeltaTime: DT, numberFrames: rec.length, driveCount: D.length, drives: drives.map(({ id, path }) => ({ id, path })), sequences: [{ name: 'Cycle', startFrame: 0, endFrame: rec.length - 1 }], positions }
  } };
  root.updateMatrixWorld(true);

  const glb = await new Promise((ok, fail) => new THREE.GLTFExporter().parse(root, ok, fail, { binary: true, onlyVisible: true }));
  const bytes = new Uint8Array(glb); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { glb: btoa(s), timeline: JSON.stringify(timeline), info: { nanFramesFixed: nanFrames, frames: rec.length, playbackSec: +(rec.length * DT).toFixed(1), cycleSec, drives: D.length, hiddenFrames, linkPoseError: maxErr } };
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    // deterministic console 1 run (DMC codes, weights, simulated faults)
    await page.addInitScript(seed => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, SEED);
    await page.goto(`http://localhost:${srv.address().port}/console.html`);
    await page.waitForFunction(() => window.__station && window.__station.ST, null, { timeout: 30000 });
    await page.addScriptTag({ url: EXPORTER });
    const { glb, timeline, info } = await page.evaluate(exportInPage);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(glb, 'base64'));
    fs.writeFileSync(TIMELINE, timeline);
    console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), ${TIMELINE} (${(fs.statSync(TIMELINE).size / 1024).toFixed(0)} KB)`, JSON.stringify(info));
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
