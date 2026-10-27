// Exports console 1 for realvirtual WEB. recordCell() records the station console.html is simulating
// (the active cell, its current settings); buildFactoryGlb() merges recorded cells of a factory built in
// js/factory-builder.js with its building elements into one model. Per cell:
//   - glb: the station with real joint hierarchies, realvirtual Drives and console 1's full cycle
//     embedded as a drive recording (extras.realvirtual DrivesRecorder + DrivesRecording_compact)
//   - timeline: what console 1's HUD and result table show at every recorded frame, plus the
//     static panel content, so console2.html can show console 1's panels in sync with the replay.
//
// Console 1's cycle is stepped at a fixed timestep (synchronously, so the page's own loop never
// interleaves) and every axis is sampled at console 1's default SIM 4x: 1x playback in realvirtual
// looks like console 1 on 4x. Robots become FR5 DH joint chains, the rail, positioner axes, clamps,
// door leaves and gripper fingers become drives, and each product gets a 6-axis (XYZ + YXZ) rig so it
// follows the gripper and the positioner. The export is built on a clone of the idle station, so
// console 1 keeps running untouched; afterwards the page is back at an idle, reset station.
//
// Used by console.html (저장) and by tools/export-station-glb.cjs. Needs console.html's
// window.__station and three r147 (THREE global); GLTFExporter is loaded on demand.
(function () {
  const EXPORTER_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/GLTFExporter.js';
  // FAIRINO FR5 DH table, same as console.html KIN
  const DH = { d: [0.152, 0, 0, 0.102, 0.102, 0.100], a: [0, -0.425, -0.395, 0, 0, 0], al: [Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0] };
  // same strings as console.html STEPS (its HUD shows them outside the running phase)
  const STEPS = ['지그 로딩·센서 확인', 'START·도어 닫힘', '파트 픽업', 'DMC 판독', '계량 (도포 전)', '포지셔너 회전 · Ni 페이스트 도포', '계량 (도포 후)', '지그 복귀', '판정·도어 열림'];
  const LINKS = ['base', 'j2h', 'upper', 'j3h', 'fore', 'j4h', 'j5h', 'j6h', 'baseRing', 'j1cap', 'j2cap', 'j3cap', 'j4cap', 'j5cap', 'j6cap', 'flange'];
  const TOOL_G = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.155, 0, 0, 0, 1];
  const DEG = 180 / Math.PI;
  const H = 0.02, SPEED = 4, DT = 0.04, SUB = Math.round(DT * SPEED / H); // simulate at 20 ms, one 40 ms frame per 160 ms of sim time

  const linkM = i => new THREE.Matrix4().makeTranslation(DH.a[i], 0, DH.d[i]).multiply(new THREE.Matrix4().makeRotationX(DH.al[i]));
  const frames = q => { const F = [new THREE.Matrix4()]; let T = new THREE.Matrix4(); for (let i = 0; i < 6; i++) { T = T.clone().multiply(new THREE.Matrix4().makeRotationZ(q[i])).multiply(linkM(i)); F.push(T); } return F; };
  const rowMajor = A => new THREE.Matrix4().set(...A);
  const mulRM = (A, B) => { const C = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) C[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c] + A[r * 4 + 3] * B[12 + c]; return C; };

  function loadExporter() {
    if (THREE.GLTFExporter) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = EXPORTER_URL; s.onload = ok; s.onerror = () => fail(new Error('GLTFExporter could not be loaded')); document.head.appendChild(s); });
  }
  // deep clone plus original -> clone lookup (both trees traverse in the same order)
  function cloneWithMap(obj, map) {
    const c = obj.clone(true), a = [], b = [];
    obj.traverse(o => a.push(o)); c.traverse(o => b.push(o));
    a.forEach((o, i) => map.set(o, b[i]));
    return c;
  }

  const FACTORY_DEFAULT = { width: 12, depth: 10, height: 5 };
  const layoutOf = S => ({ factory: window.FactoryBuilder ? window.FactoryBuilder.factory() : { ...FACTORY_DEFAULT }, ...(S.layoutParams ? S.layoutParams() : {}) });

  // steps console 1's cycle from START at fixed H; onFrame() runs every SUB steps; returns whether it finished
  function runCycle(S, onFrame) {
    let t = 0, tail = 0;
    S.startCycle();
    while (tail < 1 / DT && t < 3600) {
      for (let k = 0; k < SUB; k++) { t += H; S.sim.t += H; if (S.sim.dir) S.sim.dir.step(H); if (S.sim.phase === 'running') S.sim.execs.forEach(e => e.step(H)); }
      onFrame();
      if (S.sim.phase === 'done') tail++;
    }
    return S.sim.phase === 'done';
  }
  const holdParts = S => S.ST.parts.forEach(p => { if (p.held) p.setPose(mulRM(p.held.robot.tcpW(TOOL_G), p.held.off)); else if (p.mount === 'pos') p.setPose(S.posePart(S.ST.pos.A, S.ST.pos.C)); });

  // "도달 검사": one full cycle on the current layout without exporting; console 1 is reset afterwards
  function checkCycle() {
    const S = window.__station;
    if (!(S.sim.phase === 'idle' || S.sim.phase === 'done')) throw new Error('사이클 중에는 검사할 수 없습니다');
    const simSpeed = S.cfg.sim;
    S.resetAll(); S.cfg.sim = 0;
    let completed;
    try { completed = runCycle(S, () => { S.ST.robots.forEach(r => r.update()); S.ST.pos.update(); holdParts(S); }); }
    finally { S.cfg.sim = simSpeed; }
    const res = { completed, cycleTotal: S.sim.cycleTotal || S.sim.t, parts: S.ST.parts.length, ikFail: S.ST.robots.reduce((a, r) => a + r.ikFail, 0), reason: completed ? '' : `${(S.sim.t / 60).toFixed(0)}분 시뮬레이션 후에도 진행 중` };
    S.resetAll();
    return res;
  }

  // Records the active cell: its cycle (values per frame + console 1 HUD timeline) and an export-ready
  // clone of the idle station with joint hierarchies. Drives come back as node references, so several
  // cells can be merged before names and paths are fixed.
  function recordCell() {
    const S = window.__station;
    if (!S || !S.ST) throw new Error('console 1 station not ready');
    if (!(S.sim.phase === 'idle' || S.sim.phase === 'done')) throw new Error('사이클 중에는 저장할 수 없습니다');
    const $ = q => document.querySelector(q);
    const simSpeed = S.cfg.sim;
    S.resetAll();

    // ---------- 0. static panel content, as console 1 renders it ----------
    const panel = {
      cellDesc: $('#cellDesc').textContent, beadV: $('#beadV').textContent, speedV: $('#speedV').textContent,
      tolV: $('#tolV').textContent, faultV: $('#faultV').textContent, kTgt: $('#kTgt').textContent,
      jointList: $('#jointList').innerHTML, variant: S.cfg.variant, slots: S.cfg.slots, beadW: S.cfg.beadW, speed: S.cfg.speed, tol: S.cfg.tol, fault: S.cfg.fault,
      joints: [...S.cfg.joints], layout: layoutOf(S)
    };
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
      holdParts(S);
      ST.parts.forEach((p, i) => {
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        rowMajor(p.pose).decompose(pos, q, sc);
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        Object.assign(v, { [`Part${i + 1}_TX`]: pos.x, [`Part${i + 1}_TY`]: pos.y, [`Part${i + 1}_TZ`]: pos.z, [`Part${i + 1}_RY`]: e.y, [`Part${i + 1}_RX`]: e.x, [`Part${i + 1}_RZ`]: e.z });
        if (!p.obj.visible) v.__hidden = (v.__hidden || 0) + 1;
      });
      hudRec.push(hudState());
      return v;
    };
    S.cfg.sim = 0; // console 1's own loop keeps rendering but does not step while we record
    let rec, cycleSec, completed;
    try {
      rec = [sample()];
      completed = runCycle(S, () => rec.push(sample()));
      cycleSec = S.sim.cycleTotal;
    } finally {
      S.cfg.sim = simSpeed;
    }
    if (!completed) { S.resetAll(); throw new Error('사이클이 끝나지 않는 배치입니다. 레이아웃 편집의 "도달 검사"로 확인하세요'); }
    const hiddenFrames = rec.filter(v => v.__hidden).length;
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
    // change points only, except the joint readout (every 2nd frame, as console 1 prints it)
    const seg = key => { const out = []; hudRec.forEach((h, f) => { if (!out.length || out[out.length - 1][1] !== h[key]) out.push([f, h[key]]); }); return out; };
    const timeline = {
      version: 1, frames: hudRec.length, fixedDeltaTime: DT, simPerFrame: H * SUB, parts: S.ST.parts.length, cycleTotal: cycleSec, steps: STEPS, panel,
      phase: seg('phase'), r1: seg('r1'), r2: seg('r2'), step: seg('step'), ik: seg('ik'),
      results: seg('results').map(([f, r]) => [f, JSON.parse(r)]),
      jreadEvery: 2, jread: hudRec.filter((h, f) => f % 2 === 0).map(h => h.jr.map(v => v.toFixed(0)).join(','))
    };

    // ---------- 2. idle station again; build the export on a clone ----------
    S.resetAll();
    const ST = S.ST, map = new Map(), C = o => o && map.get(o);
    // which DH frame each robot link mesh is rigid with: compare frame-local poses over random joint sets (on the live robots, restored after)
    const frameOf = ST.robots.map(r => {
      const q0 = r.q.slice(), links = r.root.children.slice(0, 16);
      const trials = [0, 1, 2].map(() => q0.map(v => v + (Math.random() - 0.5) * 1.5));
      const loc = trials.map(q => { r.q = q; r.update(); const F = frames(q); return links.map(m => { m.updateMatrix(); return F.map(f => f.clone().invert().multiply(m.matrix)); }); });
      r.q = q0; r.update();
      return links.map((m, j) => {
        let best = 0, bestE = Infinity;
        for (let k = 0; k <= 6; k++) { let e = 0; for (let t = 1; t < trials.length; t++) loc[t][j][k].elements.forEach((x, n) => e += Math.abs(x - loc[0][j][k].elements[n])); if (e < bestE) { bestE = e; best = k; } }
        return best;
      });
    });
    ST.group.updateMatrixWorld(true);
    const lay = panel.layout;
    // the cell carries the station's placement in the factory; everything recorded is in cell coordinates
    const cellG = new THREE.Group(); cellG.name = 'Cell';
    if (lay.cell) { cellG.position.set(lay.cell.x, 0, lay.cell.z); cellG.rotation.y = lay.cell.rot || 0; }
    const group = cloneWithMap(ST.group, map); cellG.add(group);
    const parts = ST.parts.map(p => cloneWithMap(p.obj, map));
    const name = (o, n) => { if (o) o.name = n; };
    const meshesWith = mat => { const out = []; group.traverse(o => { if (o.isMesh && o.material === mat) out.push(o); }); return out; };
    name(group, 'Station'); name(C(ST.enc), 'Enclosure'); name(C(ST.door), 'Door');
    ST.leaves.forEach((l, i) => name(C(l), i ? 'Door_Leaf_R' : 'Door_Leaf_L'));
    name(C(ST.pos.tilt), 'Positioner_A_Tilt'); name(C(ST.pos.rot), 'Positioner_C_Rotary');
    ST.pos.clamps.forEach((c, i) => name(C(c), `Positioner_Clamp_${i + 1}`));
    ST.sensors.forEach((m, i) => meshesWith(m).forEach(o => name(o, `Jig_Sensor_${i + 1}`)));
    Object.entries(ST.lamps).forEach(([k, m]) => (m.isMaterial ? meshesWith(m) : [C(m)]).forEach(o => name(o, `TowerLamp_${k}`)));
    meshesWith(ST.startMat).forEach(o => name(o, 'StartButton'));
    group.traverse(o => { if (o.isMesh && o.material.map === ST.hmi.tex) name(o, 'HMI_Screen'); });

    // robots: links hang off DH joint frames instead of being placed every frame
    let maxErr = 0;
    ST.robots.forEach((r, ri) => {
      const rootG = C(r.root), q0 = r.q.slice(), links = r.root.children.slice(0, 16).map(C), tool = C(r.tool);
      if (r.reach) C(r.reach).removeFromParent();
      name(rootG, r.name + (r.kind === 'handler' ? '_Handler' : '_Dispenser'));
      links.forEach((m, i) => name(m, `${r.name}_${LINKS[i]}`));
      name(tool, `${r.name}_Tool`);
      (r.fingers || []).forEach((f, i) => name(C(f), `${r.name}_Finger_${i ? 'R' : 'L'}`));
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
        const k = frameOf[ri][j]; m.updateMatrix();
        F0[k].clone().invert().multiply(m.matrix).decompose(m.position, m.quaternion, m.scale);
        fNode[k].add(m);
      });
      tool.matrixAutoUpdate = true; tool.position.set(0, 0, 0); tool.quaternion.identity(); tool.scale.set(1, 1, 1); fNode[6].add(tool);
      if (r.carriage) { const car = C(r.carriage); name(car, `${r.name}_RailCarriage`); rootG.attach(car); }
      rootG.updateMatrixWorld(true);
      links.forEach((m, j) => m.matrixWorld.elements.forEach((x, n) => maxErr = Math.max(maxErr, Math.abs(x - before[j].elements[n]))));
    });

    // paste beads grow through drawRange, which a drive recording cannot express: leave them out
    ST.parts.forEach(p => p.joints.forEach(j => { if (j.mesh) C(j.mesh).visible = false; if (j.line) C(j.line).visible = false; }));
    // products: TX > TY > TZ > RY > RX > RZ rig per part, authored at the idle pose
    ST.parts.forEach((p, i) => {
      const obj = parts[i], pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      rowMajor(p.pose).decompose(pos, q, sc);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      let parent = cellG;
      const chain = [['TX', n => n.position.x = pos.x], ['TY', n => n.position.y = pos.y], ['TZ', n => n.position.z = pos.z], ['RY', n => n.rotation.y = e.y], ['RX', n => n.rotation.x = e.x], ['RZ', n => n.rotation.z = e.z]];
      chain.forEach(([k, set]) => { const n = new THREE.Group(); n.name = `Part${i + 1}_${k}`; set(n); parent.add(n); parent = n; });
      name(obj, `Part${i + 1}_${p.code}`);
      obj.matrixAutoUpdate = true; obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.copy(sc);
      parent.add(obj);
    });

    // ---------- 3. drives + recording ----------
    // [recorded key, node name, Direction, ReverseDirection, unit] — Reverse makes every axis positive along +X/+Y/+Z
    const lin = 'mm', rot = 'deg', D = [];
    ST.robots.forEach(r => {
      if (r.cfg.rail) D.push([`${r.name}_Rail`, C(r.root).name, 'LinearX', true, lin]);
      for (let i = 1; i <= 6; i++) D.push([`${r.name}_J${i}`, `${r.name}_J${i}`, 'RotationZ', true, rot]);
      (r.fingers || []).forEach(f => D.push([C(f).name, C(f).name, 'LinearX', true, lin]));
    });
    D.push(['Positioner_A_Tilt', 'Positioner_A_Tilt', 'RotationX', false, rot], ['Positioner_C_Rotary', 'Positioner_C_Rotary', 'RotationY', true, rot]);
    ST.pos.clamps.forEach(c => D.push([C(c).name, C(c).name, 'RotationX', false, rot]));
    ST.leaves.forEach(l => D.push([C(l).name, C(l).name, 'LinearX', true, lin]));
    ST.parts.forEach((p, i) => [['TX', 'LinearX', true, lin], ['TY', 'LinearY', false, lin], ['TZ', 'LinearZ', false, lin], ['RY', 'RotationY', true, rot], ['RX', 'RotationX', false, rot], ['RZ', 'RotationZ', true, rot]]
      .forEach(([k, dir, rev, u]) => D.push([`Part${i + 1}_${k}`, `Part${i + 1}_${k}`, dir, rev, u])));

    // drive extras replace whatever userData the clones carried over
    cellG.traverse(o => { o.userData = {}; });
    const nodeOf = n => { let hit = null; cellG.traverse(o => { if (!hit && o.name === n) hit = o; }); return hit; };
    // per drive: node, Direction, ReverseDirection and the delta series (mm / deg) from the idle pose
    const drives = D.map(([key, n, dir, rev, u]) => {
      const series = new Array(rec.length);
      for (let f = 0; f < rec.length; f++) {
        let d = rec[f][key] - rec[0][key];
        if (u === rot) d = Math.atan2(Math.sin(d), Math.cos(d));
        series[f] = u === lin ? Math.round(d * 10000) / 10 : Math.round(d * DEG * 100) / 100;
      }
      // keep rotary channels continuous across ±180°
      if (u === rot) for (let f = 1; f < rec.length; f++) { let v = series[f]; while (v - series[f - 1] > 180) v -= 360; while (v - series[f - 1] < -180) v += 360; series[f] = Math.round(v * 100) / 100; }
      return { node: nodeOf(n), dir, rev, series };
    });
    return { group: cellG, drives, timeline, info: { nanFramesFixed: nanFrames, frames: rec.length, playbackSec: +(rec.length * DT).toFixed(1), cycleSec, drives: D.length, hiddenFrames, linkPoseError: maxErr } };
  }

  // Merges recorded cells and static building elements into one GLB with one looping drive recording.
  // cells: [{ id, rec: recordCell() result }]; building: [THREE.Object3D]; extra: recorded drives of building
  // equipment ({ node, dir, rev, series }); factory: { width, depth, height }.
  // Shorter cell cycles hold their last (idle) frame until the longest one ends; then everything loops.
  async function buildFactoryGlb(factory, cells, building, extra = [], minFrames = 1) {
    await loadExporter();
    const root = new THREE.Group(); root.name = 'ONE_STATION';
    root.add(window.FactoryElements ? window.FactoryElements.buildShell(factory, { walls: false }) : buildFactory(factory));
    const bg = new THREE.Group(); bg.name = 'Building'; building.forEach(o => bg.add(o)); root.add(bg);
    cells.forEach(c => { c.rec.group.name = 'Cell_' + c.id; root.add(c.rec.group); });
    // unique, path-safe names everywhere: the glTF loader renames duplicates, which would break drive paths
    const seen = new Set();
    root.traverse(o => {
      let n = (o.name || (o.isMesh ? 'mesh' : 'node')).replace(/[\/.:\[\]\s]+/g, '_'), k = 1;
      if (seen.has(n)) { while (seen.has(n + '_' + k)) k++; n = n + '_' + k; }
      o.name = n; seen.add(n);
    });
    const pathOf = o => { const p = []; for (let c = o; c; c = c.parent) p.unshift(c.name); return p.join('/'); };
    // building elements may carry their own jog drives (conveyor rollers): keep those, record the rest
    const all = cells.flatMap(c => c.rec.drives).concat(extra), frames = Math.max(minFrames, ...cells.map(c => c.rec.info.frames));
    all.forEach(d => { d.node.userData = { realvirtual: { Drive: { Direction: d.dir, ReverseDirection: d.rev, TargetSpeed: 1000, UseLimits: false } } }; });
    const positions = new Array(frames * all.length);
    all.forEach((d, j) => { const s = d.series, n = s.length; for (let f = 0; f < frames; f++) positions[f * all.length + j] = s[f < n ? f : n - 1]; });
    if (all.length) root.userData = { realvirtual: {
      _formatVersion: '1.0',
      DrivesRecorder: { PlayOnStart: true, Loop: true },
      DrivesRecording_compact: { fixedDeltaTime: DT, numberFrames: frames, driveCount: all.length, drives: all.map((d, id) => ({ id, path: pathOf(d.node) })), sequences: [{ name: 'Cycle', startFrame: 0, endFrame: frames - 1 }], positions }
    } };
    root.updateMatrixWorld(true);
    const glb = await new Promise((ok, fail) => new THREE.GLTFExporter().parse(root, ok, fail, { binary: true, onlyVisible: true, maxTextureSize: 512 }));
    return { glb, frames, drives: all.length };
  }

  // timeline v2: one console-1 timeline per cell, all aligned to frame 0
  const factoryTimeline = (factory, objects, cells, frames) => ({
    version: 2, frames, fixedDeltaTime: DT, simPerFrame: H * SUB, factory, objects,
    cells: cells.map(c => ({ id: c.id, name: c.name, x: c.x, z: c.z, rot: c.rot, timeline: c.rec.timeline }))
  });

  // The station console 1 is showing, as a one-cell factory (tools/export-station-glb.cjs).
  async function exportStation() {
    const rec = recordCell(), lay = rec.timeline.panel.layout;
    const cell = { id: '1', name: '원스테이션 셀 1', x: lay.cell.x, z: lay.cell.z, rot: lay.cell.rot, rec };
    const { glb, frames } = await buildFactoryGlb(lay.factory, [cell], []);
    const objects = [{ id: '1', type: 'station', name: cell.name, x: cell.x, z: cell.z, rot: cell.rot }];
    return { glb, timeline: factoryTimeline(lay.factory, objects, [cell], frames), info: rec.info };
  }

  // factory shell for the export: floor, edge marking, corner columns and ceiling outline
  function buildFactory(f) {
    const { width: W, depth: D, height: Hh } = f || FACTORY_DEFAULT, g = new THREE.Group(); g.name = 'Factory';
    const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.2 }, o));
    const floorM = mat(0x2a2f36, { roughness: 0.9, metalness: 0 }), beam = mat(0x59636e), curb = mat(0xd6b21a);
    const box = (n, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.name = n; b.position.set(x, y, z); g.add(b); };
    box('Factory_Floor', W, 0.004, D, floorM, 0, 0.002, 0);
    [[W, 0.06, 0, -D / 2], [W, 0.06, 0, D / 2], [0.06, D, -W / 2, 0], [0.06, D, W / 2, 0]].forEach(([w, d, x, z], i) => {
      box('Factory_Edge_' + i, w, 0.02, d, curb, x, 0.01, z);
      box('Factory_Ceiling_' + i, Math.max(w, 0.08), 0.08, Math.max(d, 0.08), beam, x, Hh, z);
    });
    [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([x, z], i) => box('Factory_Column_' + i, 0.16, Hh, 0.16, beam, x, Hh / 2, z));
    return g;
  }

  window.StationExport = { recordCell, buildFactoryGlb, factoryTimeline, exportStation, checkCycle, DT, SIM_PER_FRAME: H * SUB };
})();
