// ONE 동작 엔진: the run of one machine (Machine Builder 동작 시험): signal table, joints, conveyors and works,
// timed processes and product stages, robot programs (MOVJ / MOVL / GRIP / ARC / WAIT / SET), operators (작업자) and the
// 동작 순서 (자동 운전). Moved out of js/build-app.js so ONE SIMULATION can run a placed cell's own program the same way.
// OneRun.create(env) → the engine of one machine. env:
//   doc()            the machine document (nodes, io, joints, programs, sequence)
//   objs()           Map node id → { obj } (the 3D objects, in the machine's own frame: stored mm ↔ scene via toS / fromS)
//   nodeDef, nodeCode, placeObj, log, ov (group for the weld arc light)
//   drawPend, drawSeq, setAuto  (UI hooks, optional), rng (0..1, default Math.random), hits (false = no arm collision check)
(() => {
  'use strict';
  function create(env) {
    const T = window.THREE, L = window.OneLibrary, S = window.OneTwin.schema, noop = () => {};
    const toS = p => new T.Vector3(...S.storedToScene([p[0], p[1], p[2] ?? 0]));
    const fromS = v => S.sceneToStored([v.x, v.y, v.z]);
    const ED = { machine: { get doc() { return env.doc(); } } }, objs = { get: id => env.objs().get(id) };
    const { nodeDef, nodeCode, placeObj } = env, log = env.log || noop, ov = env.ov, rng = env.rng || Math.random;
    const drawPend = (...a) => (env.drawPend || noop)(...a), drawSeq = (...a) => (env.drawSeq || noop)(...a);
    const setAuto = on => { if (env.setAuto) return env.setAuto(on); AUTO.on = on; AUTO.i = 0; AUTO.phase = 'wait'; AUTO.t = 0; AUTO.waited = 0; };

    const RUN = { t: 0, v: {}, tags: {}, procs: {}, works: {}, last: 0 };
    function resetRun() {
      const doc = ED.machine.doc; RUN.t = 0; RUN.v = {}; RUN.tags = {}; RUN.procs = {}; RUN.works = {};
      for (const j of doc.joints) RUN.v[j.id] = j.home ?? j.min;
      for (const t of doc.io) RUN.tags[t.tag] = t.type === 'bool' ? false : 0;
      for (const n of doc.nodes) { const d = nodeDef(n); if (d && d.work) RUN.works[n.id] = { p: [n.transform.position[0], n.transform.position[1]], z: n.transform.position[2], stage: n.params.stage0 ?? 6 }; }
      RUN.rails = {}; for (const r of Object.values(ROB.run)) { r.rail = 0; r.arc = false; r.grip = null; } WK.run = {}; for (const a of Object.values(ARC)) a.visible = false;
    }
    const AUTO = { on: false, i: 0, phase: 'wait', t: 0, waited: 0 };
    const cmp = (v, op, x) => { v = typeof x === 'boolean' ? !!v : +v; return op === '!=' ? v !== x : op === '>' ? v > x : op === '<' ? v < x : op === '>=' ? v >= x : op === '<=' ? v <= x : v === x; };
    const valTxt = (tag, v) => typeof v === 'boolean' ? (v ? '켜짐' : '꺼짐') : String(v);
    function stepAuto(dt) { const steps = ED.machine.doc.sequence.steps; if (!AUTO.on || !steps.length) return;
      for (let g = 0; g < 12; g++) { const st = steps[AUTO.i]; if (!st) { AUTO.i = 0; continue; }
        if (AUTO.phase === 'wait') { if (!st.wait.every(w => cmp(RUN.tags[w.tag], w.op || '==', w.value))) { AUTO.waited += dt;
            if (/^워크 빠짐/.test(st.name || '') && AUTO.waited > 4 && !AUTO.warned) { AUTO.warned = true; log('워크가 컨베이어 끝(출구)에 섰습니다. 공장에서는 다음 설비가 가져갑니다 · ↺ 워크로 다시 투입하세요'); }
            if (AUTO.waited > 20 && !AUTO.warned) { AUTO.warned = true; log(`${st.name}: 20초째 조건을 기다립니다 (${st.wait.map(w => `${w.tag} ${valTxt(w.tag, w.value)}`).join(', ')})`); } return; }
          for (const x of st.set) RUN.tags[x.tag] = x.value; log(`▶ ${st.name}`); AUTO.phase = 'delay'; AUTO.t = 0; AUTO.waited = 0; AUTO.warned = false; }
        AUTO.t += dt; dt = 0; if (AUTO.t < (st.delay || 0)) return;
        const nx = st.next?.[0]; AUTO.i = nx ? Math.max(0, steps.findIndex(q => q.id === nx)) : (AUTO.i + 1) % steps.length; AUTO.phase = 'wait'; drawSeq(); } }
    /* ------------------------------------------------------------------ 티칭 패널 (teach pendant) and program run
       A robot node's program (doc.programs, command set_program) runs on the signal table: RB_START rising (or ▶ on the
       pendant) starts it, RB_BUSY while it runs, RB_DONE at the end. MOVJ moves in joint space, MOVL moves the TCP on a
       straight line (inverse kinematics each frame), GRIP takes the nearest work along and puts it down, WAIT / SET use
       tags, DELAY waits. No collision check: a path through an object shows in the design check later, it is not stopped. */
    const ROB = { sel: null, deg: 5, mm: 50, run: {}, step: false, ovr: 100 }; // step: stop after each line · ovr: speed override % (moves only)
    const progOf = id => ED.machine.doc.programs.find(p => p.node === id);
    const robObj = id => objs.get(id)?.obj;
    const rigFor = id => { const o = robObj(id); return o && o.userData.rig && o.userData.kind === 'robot' ? o.userData.rig : null; };
    const robotNodes = () => ED.machine.doc.nodes.filter(n => rigFor(n.id));
    const zeros = rig => rig.map(() => 0);
    const robState = id => { const rig = rigFor(id); if (!rig) return null; return ROB.run[id] || (ROB.run[id] = { line: -1, on: false, deg: robObj(id).userData.deg || zeros(rig), grip: null, prev: false, rail: 0 }); };
    /* 레일 (7th axis): a robot standing on a rail block travels along it. The rail's long side is the axis; the travel keeps the
       robot's footprint on the rail. Travel moves the robot object itself (run only: leaving 동작 시험 rebuilds the scene). */
    const RAILV = 1000; // mm/s at 100 %
    function railOf(id) { if (!RUN.rails) RUN.rails = {}; if (id in RUN.rails) return RUN.rails[id]; const doc = ED.machine.doc, n = doc.nodes.find(x => x.id === id), o = robObj(id); let out = null;
      if (n && o && n.params.rail) { const q = n.transform.position; // only a robot set to ride a rail (params.rail): a rail beside a robot is usually a conveyor
        for (const b of doc.nodes) { if (b === n || !(b.params?.cls === 'rail' || /레일|rail/i.test(b.name || ''))) continue; const c = b.transform.position, yaw = (b.transform.rotation[2] || 0) * Math.PI / 180, w = +b.params.w || 0, d = +b.params.d || 0;
          const ax = w >= d ? [Math.cos(yaw), Math.sin(yaw)] : [-Math.sin(yaw), Math.cos(yaw)], L = Math.max(w, d), W = Math.min(w, d), dx = q[0] - c[0], dy = q[1] - c[1], u = dx * ax[0] + dy * ax[1], v = -dx * ax[1] + dy * ax[0];
          if (Math.abs(u) > L / 2 || Math.abs(v) > W / 2 + 1200) continue; const m = Math.min(+n.params.w || 900, +n.params.d || 900) / 2;
          out = { ax, min: Math.round(-L / 2 + m - u), max: Math.round(L / 2 - m - u), base0: o.position.clone(), rail: b.id }; break; } }
      return (RUN.rails[id] = out); }
    function setRail(id, s) { const R = railOf(id), o = robObj(id); if (!R || !o) return 0; s = Math.max(R.min, Math.min(R.max, s)); o.position.copy(R.base0).add(new T.Vector3(R.ax[0], 0, -R.ax[1]).multiplyScalar(s / 1000)); o.updateMatrixWorld(true); return s; }
    /** joints (and rail travel) for a point: taught joint angles as they are, or (a target only point, j = []) solved for its TCP;
        on a rail the robot first travels so its base stands beside the target */
    function solvePoint(id, pt, seed) { const rig = rigFor(id), o = robObj(id), r = robState(id), R = railOf(id);
      const keep = r.rail || 0; let rail = pt.rail ?? (R && !(pt.j && pt.j.length) && pt.tcp ? null : keep);
      if (pt.j && pt.j.length) { const j = pt.j.slice(0, rig.length); while (j.length < rig.length) j.push(0); return { deg: j, rail: rail ?? keep, err: 0 }; }
      // IK from the current pose first (keeps the arm in the same elbow/wrist configuration); only if that cannot reach, try other start poses and keep the reaching one nearest the current pose
      const SEEDS = [[0, 0, 0, 0, 0, 0], [0, 45, -90, 0, 45, 0], [0, -45, -90, 0, 90, 0], [90, 0, -90, 0, 60, 0], [-90, 0, -90, 0, 60, 0], [90, 100, -90, 0, 60, 0], [-90, 100, -90, 0, 60, 0], [180, 30, -140, 0, 70, 0], [0, 120, -100, 0, 70, 0], [135, 20, -140, 0, 80, 0], [-135, 20, -140, 0, 80, 0]];
      const jd = d => d.reduce((a, v, i) => a + Math.abs(v - (r.deg[i] || 0)), 0);
      const at = s => { setRail(id, s); const s0 = seed || r.deg; let ik = ikR(rig, o, toS(pt.tcp), s0, { iters: 60 }); let best = ik ? { deg: ik.deg, err: ik.err } : null;
        if (!best || best.err > 8) for (const sd of SEEDS) { const q = ikR(rig, o, toS(pt.tcp), sd.slice(0, rig.length).concat(Array(Math.max(0, rig.length - 6)).fill(0)), { iters: 60 }); if (!q) continue;
          const ok = q.err < 8, bok = best && best.err < 8; if (!best || (ok && !bok) || (ok && bok && jd(q.deg) < jd(best.deg)) || (!ok && !bok && q.err < best.err)) best = { deg: q.deg, err: q.err }; }
        return { deg: best ? best.deg : r.deg.slice(), rail: s, err: best ? best.err : 1e9 }; };
      let best;
      if (rail !== null) best = at(rail);
      else { // on a rail: the travel nearest to where the robot is that lets the arm reach the point (too close to the base is as bad as too far)
        const c = new Set([keep]); for (let d = 250; d <= R.max - R.min; d += 250) for (const sgn of [-1, 1]) { const v = keep + sgn * d; if (v >= R.min && v <= R.max) c.add(v); } c.add(R.min); c.add(R.max);
        for (const sv of [...c].sort((x, y) => Math.abs(x - keep) - Math.abs(y - keep))) { const q = at(sv); if (!best || q.err < best.err) best = q; if (q.err < 8) break; } }
      setRail(id, keep); L.rigSet(rig, r.deg); return best; }
    /* 아크 (welding arc): a flickering blue-white spark and light at the TCP while ARC is on */
    const ARC = {};
    function arcAt(id, pos, on) { let a = ARC[id]; if (!a) { a = ARC[id] = new T.Group(); const sp = new T.Sprite(new T.SpriteMaterial({ map: arcTex(), color: 0xcfe6ff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        sp.scale.set(0.12, 0.12, 1); a.add(sp); const lt = new T.PointLight(0x9fd0ff, 2.5, 3); a.add(lt); a.userData.sp = sp; a.userData.lt = lt; ov.add(a); }
      a.visible = !!on; if (!on) return; a.position.copy(pos); const k = 0.6 + Math.random() * 0.8; a.userData.sp.scale.set(0.12 * k, 0.12 * k, 1); a.userData.lt.intensity = 1.5 + Math.random() * 2.5; }
    let arcTexC = null;
    function arcTex() { if (arcTexC) return arcTexC; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(190,225,255,0.9)'); gr.addColorStop(1, 'rgba(80,140,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (arcTexC = new T.CanvasTexture(c)); }
    function setDeg(id, deg) { const o = robObj(id), rig = rigFor(id), r = robState(id); if (!rig) return; r.deg = deg.slice(); o.userData.deg = r.deg; o.userData.prog = true; L.rigSet(rig, r.deg); }
    function tcpOf(id) { const o = robObj(id), rig = rigFor(id); if (!rig) return null; return fromS(L.rigTcp(rig, o)).map(Math.round); }
    const VJ = 150; // joint speed deg/s at 100 %
    function startProg(id, why) { const p = progOf(id), r = robState(id); if (!p || !p.lines.length || !r) return false; r.on = true; r.line = -1; r.t = 0; r.seg = null; r.pause = false; r.hits = new Set(); log(`${nodeCode(ED.machine.doc.nodes.find(n => n.id === id))} 프로그램 시작${why ? ` · ${why}` : ''}`); drawPend(true); return true; }
    function stopProg(id) { const r = robState(id); if (r) { r.on = false; r.seg = null; r.pause = false; } drawPend(true); }
    function fkStored(id, deg) { const o = robObj(id), rig = rigFor(id), r = robState(id); L.rigSet(rig, deg); const t = fromS(L.rigTcp(rig, o)); L.rigSet(rig, r.deg); return t; }
    /* 충돌 검사: the arm's centre line, joint to joint and the flange to the tool tip, against every other part of the cell
       (not the works, the operators, or what the robot stands on at its base). A hit is logged once per part and shown on the
       robot's label; the line through a link is thinner than the link, so a near pass can still go unreported. */
    const rcHit = new T.Raycaster();
    function checkHit(n, P, rig, o, r) { const doc = ED.machine.doc, meshes = []; for (const b of doc.nodes) { if (b.id === n.id) continue; const d = nodeDef(b); if (!d || d.work || d.operator) continue;
        const ob = objs.get(b.id)?.obj; if (ob) ob.traverse(m => { if (m.isMesh && m.visible && m.name !== 'placeholder') meshes.push(m); }); }
      o.updateMatrixWorld(true); const pts = rig.map(e => e.j.getWorldPosition(new T.Vector3())); if (rig.tcp) pts.push(rig.tcp.getWorldPosition(new T.Vector3()));
      for (let i = 1; i + 1 < pts.length; i++) { const a = pts[i], d = pts[i + 1].clone().sub(a), len = d.length(); if (len < 0.03) continue; d.divideScalar(len);
        rcHit.set(a, d); rcHit.near = 0.015; rcHit.far = len - 0.015; const h = rcHit.intersectObjects(meshes, false)[0]; if (!h) continue;
        let b = h.object; while (b && !(b.userData && b.userData.nodeId) && b.parent) b = b.parent; const hn = doc.nodes.find(x => objs.get(x.id)?.obj && (objs.get(x.id).obj === b || objs.get(x.id).obj.getObjectById(h.object.id)));
        const name = hn ? `${nodeCode(hn)} ${hn.name}` : '설비'; r.hit = { name, t: performance.now() };
        const key = name + i; if (!r.hits) r.hits = new Set(); if (!r.hits.has(key)) { r.hits.add(key); log(`${P} 충돌: 팔(J${i + 1}–${i + 2 > rig.length ? '툴 끝' : 'J' + (i + 2)})이 ${name}에 닿습니다${(() => { const l = progOf(n.id)?.lines[r.line]; return l?.point ? ` (${l.point} 쪽으로 가는 중)` : ''; })()}`); } return; } }
    function stepRobots(dt) {
      const doc = ED.machine.doc, tags = RUN.tags;
      for (const n of doc.nodes) { const rig = rigFor(n.id); if (!rig) continue; const P = nodeCode(n), o = robObj(n.id), p = progOf(n.id), r = robState(n.id);
        if (!p) { if (o.userData.prog && !r.on && !ROB.sel) o.userData.prog = false; if (o.userData.prog) L.rigSet(rig, r.deg); continue; }
        o.userData.prog = true; const st = !!tags[`${P}_START`];
        if (st && !r.prev) { startProg(n.id, `${P}_START`); if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; } if (!st && r.prev && `${P}_DONE` in tags && !r.on) tags[`${P}_DONE`] = false; r.prev = st;
        if (r.on) { let budget = dt; for (let g = 0; g < 8 && budget > 0 && r.on; g++) budget = progStep(n, P, r, p, rig, o, budget, tags); }
        if (env.hits !== false && r.on && (r.hitT = (r.hitT || 0) + dt) > 0.2) { r.hitT = 0; checkHit(n, P, rig, o, r); }
        if (`${P}_BUSY` in tags) tags[`${P}_BUSY`] = r.on; if (RUN.procs[P]) RUN.procs[P].busy = r.on;
        if (railOf(n.id)) setRail(n.id, r.rail || 0); L.rigSet(rig, r.deg); o.userData.deg = r.deg;
        if (r.grip && RUN.works[r.grip]) { const t = tcpOf(n.id), w = RUN.works[r.grip]; w.p = [t[0], t[1]]; w.z = t[2] + (r.gdz || 0); w.held = n.id; }
        if (r.arc && !r.on) r.arc = false; if (r.arc || ARC[n.id]) arcAt(n.id, L.rigTcp(rig, o), r.arc);
      } }
    /* one program line, or part of it, within `dt` seconds; returns the time left over (a line that ends mid-frame hands the rest to the next) */
    function progStep(n, P, r, p, rig, o, dt, tags) {
      if (!r.seg && r.pause) return 0; // 한 줄씩: waits for ▷ 다음 줄
      if (!r.seg) { L.rigSet(rig, r.deg); r.line++; const l = p.lines[r.line]; // pose first: a line that starts in the frame the last one ended reads the true TCP
        if (!l) { r.on = false; r.line = -1; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = true; log(`${P} 프로그램 끝 · DONE`); drawPend(true); return 0; }
        const pt = l.point && p.points.find(q => q.id === l.point);
        if (l.op === 'MOVJ') { const sv = solvePoint(n.id, pt), to = sv.deg; if (sv.err > 30) log(`${P} ${pt.id}: 목표에 ${Math.round(sv.err)} mm 못 미칩니다 (도달 거리 밖)`);
          const dmax = Math.max(1e-6, ...to.map((v, i) => Math.abs(v - (r.deg[i] || 0)))), dr = Math.abs((sv.rail || 0) - (r.rail || 0)); r.seg = { kind: 'J', from: r.deg.slice(), to, s0: r.rail || 0, s1: sv.rail || 0, t: 0, dur: Math.max(dmax / (VJ * (l.speed || 50) / 100), dr / (RAILV * (l.speed || 50) / 100)) }; }
        else if (l.op === 'MOVL') { const t0 = tcpOf(n.id), t1 = pt.tcp || fkStored(n.id, pt.j); const d = Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]); const sv = pt.j && pt.j.length ? { deg: pt.j.slice(0, rig.length), rail: pt.rail ?? r.rail } : solvePoint(n.id, pt), j1 = sv.deg.slice(); while (j1.length < rig.length) j1.push(0);
          r.seg = { kind: 'L', t0, t1, t: 0, dur: Math.max(0.05, Math.max(d / (l.speed || 500), Math.abs((sv.rail || 0) - (r.rail || 0)) / RAILV)), j0: r.deg.slice(), j1, s0: r.rail || 0, s1: sv.rail || 0 }; }
        else if (l.op === 'GRIP') { if (l.on) { const t = tcpOf(n.id); let best = null, bd = 400; for (const id in RUN.works) { const w = RUN.works[id]; if (w.held && w.held !== n.id) continue; const d = Math.hypot(w.p[0] - t[0], w.p[1] - t[1], w.z - t[2]); if (d < bd) { bd = d; best = id; } }
            if (best) { r.grip = best; r.gdz = RUN.works[best].z - t[2]; log(`${P} 그리퍼 닫힘 · 워크 집음`); } else log(`${P} 그리퍼 닫힘 · 400 mm 안에 워크가 없습니다`); }
          else if (r.grip) { const w = RUN.works[r.grip]; if (w) { delete w.held; w.z = landZ(w.p, w.z, r.grip, n.id); seatAt(w); } log(`${P} 그리퍼 열림 · 워크 놓음`); r.grip = null; }
          r.seg = { kind: 'D', t: 0, dur: 0.3 }; }
        else if (l.op === 'ARC') { r.arc = !!l.on; log(`${P} 아크 ${l.on ? '켬 · 용접 시작' : '끔 · 용접 끝'}`); r.seg = { kind: 'D', t: 0, dur: 0.2 }; }
        else if (l.op === 'WAIT') r.seg = { kind: 'W', tag: l.tag, value: l.value, t: 0 };
        else if (l.op === 'SET') { tags[l.tag] = l.value; r.seg = { kind: 'D', t: 0, dur: 0 }; }
        else if (l.op === 'DELAY') r.seg = { kind: 'D', t: 0, dur: l.s || 0 };
        drawPend(true); }
      const sg = r.seg, more = r.line + 1 < p.lines.length, hold = () => { if (ROB.step && more) { r.pause = true; drawPend(true); return true; } return false; };
      if (sg.kind === 'W') { if (cmp(tags[sg.tag], '==', sg.value)) { r.seg = null; return hold() ? 0 : dt; } sg.t += dt; if (sg.t > 20 && !sg.warned) { sg.warned = true; log(`${P} ${sg.tag} ${valTxt(sg.tag, sg.value)} 20초째 기다립니다`); } return 0; }
      const f = sg.kind === 'J' || sg.kind === 'L' ? ROB.ovr / 100 : 1, adv = dt * f, left = Math.max(0, sg.t + adv - sg.dur) / f; sg.t = Math.min(sg.dur, sg.t + adv); const k = sg.dur > 0 ? sg.t / sg.dur : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in/out = accelerate, cruise, decelerate
      if ((sg.kind === 'J' || sg.kind === 'L') && sg.s1 !== sg.s0) { r.rail = sg.s0 + (sg.s1 - sg.s0) * e; setRail(n.id, r.rail); }
      if (sg.kind === 'J') r.deg = sg.from.map((a, i) => a + (sg.to[i] - a) * e);
      else if (sg.kind === 'L') { const tgt = toS([sg.t0[0] + (sg.t1[0] - sg.t0[0]) * e, sg.t0[1] + (sg.t1[1] - sg.t0[1]) * e, sg.t0[2] + (sg.t1[2] - sg.t0[2]) * e]);
        // the taught tool angle travels with the line: wrist roll / flange roll and the tool pitch (J2 + J3 + J5) blend start → point
        const seed = r.deg.slice(); if (rig.hold && rig.length >= 6) { const { j0, j1 } = sg; for (const i of [3, 5]) seed[i] = j0[i] + (j1[i] - j0[i]) * e; const S0 = j0[1] + j0[2] + j0[4], S1 = j1[1] + j1[2] + j1[4]; seed[4] = S0 + (S1 - S0) * e - seed[1] - seed[2]; }
        const ik = ikR(rig, o, tgt, seed, { iters: 10 }); if (ik) { r.deg = ik.deg; if (ik.err > 30 && !sg.warned) { sg.warned = true; log(`${P} 직선 이동: 목표에 ${Math.round(ik.err)} mm 못 미칩니다 (도달 거리 밖)`); } } }
      if (sg.t >= sg.dur) { if (sg.kind === 'J' || sg.kind === 'L') { if (sg.s1 !== undefined) r.rail = sg.s1; } if (sg.kind === 'J') r.deg = sg.to.slice(); if (sg.kind === 'L' && rig.hold && Math.hypot(...tcpOf(n.id).map((v, i) => v - sg.t1[i])) < 5) r.deg = sg.j1.slice(); r.seg = null; if (hold()) return 0; }
      return left; }
    /* ------------------------------------------------------------------ 작업자 (operator) run
       A 작업자 node runs a program like a robot's (doc.programs, same points and lines): MOVJ walks to the point (x, y) on the
       floor (turns first, 1 m/s), MOVL turns to the point and reaches the hand to it, GRIP takes the nearest work at the hand
       (450 mm) or puts it down on the surface under it, then the hand comes back to the carry pose. WAIT / SET / DELAY as for
       robots; WKn_START starts, BUSY / DONE report. Walks go straight from point to point: the program's points are the path. */
    const WK = { run: {} }, WALK = 1000, REACH = 700;
    const workerNodes = () => ED.machine.doc.nodes.filter(n => nodeDef(n)?.operator);
    function wkState(n) { return WK.run[n.id] || (WK.run[n.id] = { on: false, line: -1, seg: null, prev: false, pos: [n.transform.position[0], n.transform.position[1]], yaw: n.transform.rotation[2] || 0, k: 0, tgt: null, carry: null, gdz: 0 }); }
    const fwdOf = w => { const a = w.yaw * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
    function wkHand(w, h) { const f = fwdOf(w), rest = [w.pos[0] + f[0] * 380, w.pos[1] + f[1] * 380, Math.min(1050, h * 0.6)]; if (!w.tgt || w.k <= 0) return rest; return rest.map((v, i) => v + (w.tgt[i] - v) * w.k); }
    const angTo = (a, b) => { let d = ((b - a) % 360 + 540) % 360 - 180; return d; };
    /* 반송 레일 (a model part with params.convey = { speed }): a work lying on it travels along its long side to the
       end it points to (params.convey.dir 1 / -1 along the axis), stops there or behind the work ahead; _PRESENT = a work at the end */
    function stepConveyRails(dt) { const doc = ED.machine.doc, tags = RUN.tags;
      for (const b of doc.nodes) { const cv = b.params?.convey; if (!cv || b.blockType !== 'model-part') continue; const P = nodeCode(b), c = b.transform.position, yaw = (b.transform.rotation[2] || 0) * Math.PI / 180, w = +b.params.w, d = +b.params.d, h = +b.params.h;
        const ax = w >= d ? [Math.cos(yaw), Math.sin(yaw)] : [-Math.sin(yaw), Math.cos(yaw)], Lh = Math.max(w, d) / 2, Wh = Math.min(w, d) / 2, top = c[2] + h, dir = cv.dir || 1, sp = +cv.speed || 250;
        const on = []; for (const id in RUN.works) { const q = RUN.works[id]; if (q.held) continue; const dx = q.p[0] - c[0], dy = q.p[1] - c[1], u = dx * ax[0] + dy * ax[1], v = -dx * ax[1] + dy * ax[0]; if (Math.abs(u) <= Lh && Math.abs(v) <= Wh && q.z > top - 120 && q.z < top + 40) on.push({ id, q, u, v }); }
        on.sort((a, b2) => (b2.u - a.u) * dir); let lim = dir * (Lh - 140); let present = false;
        for (const x of on) { const wn = doc.nodes.find(n => n.id === x.id), half = wn ? Math.min(+wn.params.w || 300, +wn.params.d || 300) / 2 + 10 : 150; const stop = lim; let u = x.u + dir * sp * dt; if ((u - stop) * dir > 0) u = stop; if (Math.abs(u - (dir * (Lh - 140))) < 2) present = true;
          x.q.p = [c[0] + ax[0] * u - ax[1] * x.v, c[1] + ax[1] * u + ax[0] * x.v]; lim = u - dir * (2 * half + 20); }
        if (`${P}_PRESENT` in tags) tags[`${P}_PRESENT`] = present; } }
    function stepWorkers(dt) { const tags = RUN.tags; stepConveyRails(dt);
      for (const n of workerNodes()) { const P = nodeCode(n), w = wkState(n), p = progOf(n.id), o = objs.get(n.id)?.obj; if (!o) continue;
        const st = !!tags[`${P}_START`]; if (st && !w.prev && p && p.lines.length && !w.on) { w.on = true; w.line = -1; w.seg = null; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; log(`${P} 작업 시작 · ${P}_START`); }
        if (!st && w.prev && !w.on && `${P}_DONE` in tags) tags[`${P}_DONE`] = false; w.prev = st;
        if (w.on && p) { let budget = dt; for (let g = 0; g < 8 && budget > 0 && w.on; g++) budget = wkStep(n, P, w, p, budget, tags); }
        if (`${P}_BUSY` in tags) tags[`${P}_BUSY`] = w.on;
        // pose: body on the floor, arms point at the hand
        const h = +(n.params.h || 1750), fig = o.getObjectByName('operator'), hand = wkHand(w, h);
        o.position.copy(toS([w.pos[0], w.pos[1], n.transform.position[2] || 0])); o.rotation.set(0, w.yaw * Math.PI / 180, 0);
        if (fig) { const f = fwdOf(w), dx = (hand[0] - w.pos[0]) * f[0] + (hand[1] - w.pos[1]) * f[1], dz = hand[2] - (fig.userData.shoulder * 1000), th = Math.atan2(Math.max(0, dx), -dz);
          for (const nm of ['armL', 'armR']) { const a = fig.getObjectByName(nm); if (a) a.rotation.z = w.carry || w.k > 0 ? th : 0; } }
        if (w.carry && RUN.works[w.carry]) { const wk = RUN.works[w.carry]; wk.p = [hand[0], hand[1]]; wk.z = hand[2] + w.gdz; wk.held = n.id; }
      } }
    function wkStep(n, P, w, p, dt, tags) {
      if (!w.seg) { w.line++; const l = p.lines[w.line];
        if (!l) { w.on = false; w.line = -1; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = true; log(`${P} 작업 끝 · DONE`); return 0; }
        const pt = l.point && p.points.find(q => q.id === l.point), to = pt && (pt.tcp || [0, 0, 0]);
        if (l.op === 'MOVJ') { const d = Math.hypot(to[0] - w.pos[0], to[1] - w.pos[1]), head = d > 5 ? Math.atan2(to[1] - w.pos[1], to[0] - w.pos[0]) * 180 / Math.PI : w.yaw, turn = angTo(w.yaw, head);
          w.seg = { kind: 'walk', from: w.pos.slice(), to: [to[0], to[1]], y0: w.yaw, turn, tTurn: Math.abs(turn) / 240, t: 0, dur: Math.abs(turn) / 240 + d / (WALK * (l.speed || 50) / 50) }; }
        else if (l.op === 'MOVL') { const head = Math.atan2(to[1] - w.pos[1], to[0] - w.pos[0]) * 180 / Math.PI, turn = angTo(w.yaw, head), far = Math.hypot(to[0] - w.pos[0], to[1] - w.pos[1]);
          if (far > 1000) log(`${P} ${pt.id}: 손이 ${Math.round(far)} mm 떨어진 곳까지 닿지 않습니다 · 더 가까이 걸어가는 점을 넣으세요`);
          w.seg = { kind: 'reach', y0: w.yaw, turn, tTurn: Math.abs(turn) / 240, to: to.slice(), k0: w.k, t: 0, dur: Math.abs(turn) / 240 + REACH / 1000 }; }
        else if (l.op === 'GRIP') { const h = +(n.params.h || 1750), hand = wkHand(w, h);
          if (l.on) { let best = null, bd = 450; for (const id in RUN.works) { const q = RUN.works[id]; if (q.held && q.held !== n.id) continue; const d = Math.hypot(q.p[0] - hand[0], q.p[1] - hand[1], q.z - hand[2]); if (d < bd) { bd = d; best = id; } }
            if (!best) { log(`${P} 손 닿는 곳에 워크가 없습니다 · 작업을 멈춥니다 (↺ 워크 다시 투입)`); w.on = false; w.line = -1; if (AUTO.on) setAuto(false); return 0; }
            w.carry = best; w.gdz = RUN.works[best].z - hand[2]; log(`${P} 워크 집음`); }
          else if (w.carry) { const q = RUN.works[w.carry]; if (q) { delete q.held; q.z = landZ(q.p, Math.max(q.z, hand[2]), w.carry); seatAt(q); } log(`${P} 워크 놓음`); w.carry = null; }
          w.seg = { kind: 'back', k0: w.k, t: 0, dur: 0.6, wait: 0.25 }; }
        else if (l.op === 'WAIT') w.seg = { kind: 'W', tag: l.tag, value: l.value, t: 0 };
        else if (l.op === 'SET') { tags[l.tag] = l.value; w.seg = { kind: 'D', t: 0, dur: 0 }; }
        else if (l.op === 'DELAY') w.seg = { kind: 'D', t: 0, dur: l.s || 0 };
        else w.seg = { kind: 'D', t: 0, dur: 0 }; }
      const sg = w.seg;
      if (sg.kind === 'W') { if (cmp(tags[sg.tag], '==', sg.value)) { w.seg = null; return dt; } sg.t += dt; if (sg.t > 20 && !sg.warned) { sg.warned = true; log(`${P} ${sg.tag} ${valTxt(sg.tag, sg.value)} 20초째 기다립니다`); } return 0; }
      const f = sg.kind === 'D' ? 1 : ROB.ovr / 100, left = Math.max(0, sg.t + dt * f - sg.dur) / f; sg.t = Math.min(sg.dur, sg.t + dt * f);
      const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (sg.kind === 'walk' || sg.kind === 'reach') { const kt = sg.tTurn > 0 ? Math.min(1, sg.t / sg.tTurn) : 1; w.yaw = sg.y0 + sg.turn * ease(kt);
        const rest = Math.max(0, sg.t - sg.tTurn), span = sg.dur - sg.tTurn, km = span > 0 ? Math.min(1, rest / span) : 1;
        if (sg.kind === 'walk') w.pos = [sg.from[0] + (sg.to[0] - sg.from[0]) * km, sg.from[1] + (sg.to[1] - sg.from[1]) * km];
        else { w.tgt = sg.to; w.k = sg.k0 + (1 - sg.k0) * ease(km); } }
      else if (sg.kind === 'back') { const k = Math.max(0, (sg.t - sg.wait) / (sg.dur - sg.wait)); w.k = sg.k0 * (1 - ease(Math.min(1, k))); if (sg.t >= sg.dur) { w.k = 0; w.tgt = null; } }
      if (sg.t >= sg.dur) w.seg = null;
      return left; }
    /** Where a released work lands: the first real surface under it (rays down from its middle and corners through the
        blocks' own shapes: a jig nest, a tray pocket, a table), else the floor. */
    const rcLand = new T.Raycaster();
    /* 제품 단계 (params.stage on a timed part, params.stageAt = { on: signal, stage } on a jig, params.seatStage on a seat): the work
       at that part grows to the next stage — 0 코어, 1 도포, 2 지그에 맞춤 (헤더), 3 브라켓 용접, 4 파이프 용접, 5 볼트 체결, 6 레이저 각인.
       The parts come from the product model itself (split by part), nothing is added */
    function stageUp(n, st) { const o = objs.get(n.id)?.obj; if (!o) return; o.updateMatrixWorld(true); const c = fromS(o.localToWorld(toS(n.params.nest || [0, 0, 0])));
      let best = null, bd = 700; for (const id in RUN.works) { const w = RUN.works[id]; const dd = Math.hypot(w.p[0] - c[0], w.p[1] - c[1]); if (dd < bd && Math.abs(w.z - c[2]) < 900) { bd = dd; best = w; } }
      if (best && (best.stage ?? 6) < st) { best.stage = st; log(`${nodeCode(n)} · 제품 단계: ${STAGE_NAMES[st]}`); } }
    const STAGE_NAMES = ['코어', '도포', '지그에 맞춤', '브라켓 용접', '파이프 용접', '볼트 체결', '레이저 각인'];
    // the product model is split into its real parts (node names st<N>_…: the stage from which the part is on); a work shows
    // the parts up to its stage. Works without a start stage (params.stage0) are whole products.
    function stageFx(o, st) { if (o.userData.stage === st) return; let f = 0; o.traverse(m => { const k = /^st(\d)_/.exec(m.name); if (k) { m.visible = +k[1] <= st; f++; } }); if (f) o.userData.stage = st; }
    /* a work let go over a seat (params.nest of a part: where the product sits in a jig) settles exactly in it */
    function seatAt(w) { const doc = ED.machine.doc; for (const b of doc.nodes) { const ns = b.params?.nest; if (!ns) continue; const o = objs.get(b.id)?.obj; if (!o) continue; o.updateMatrixWorld(true);
        const c = fromS(o.localToWorld(toS(ns))); if (Math.hypot(c[0] - w.p[0], c[1] - w.p[1]) < 200 && Math.abs(c[2] - w.z) < 300) { w.p = [Math.round(c[0]), Math.round(c[1])]; w.z = Math.round(c[2]); if (b.params.seatStage) w.stage = Math.max(w.stage || 0, +b.params.seatStage); return true; } } return false; }
    function landZ(p, z, wid, skip) { const doc = ED.machine.doc, meshes = []; for (const b of doc.nodes) { const d = nodeDef(b); if (!d || d.work || d.operator || b.id === skip) continue; const o = objs.get(b.id)?.obj; if (o) o.traverse(m => { if (m.isMesh && m.visible && m.name !== 'placeholder') meshes.push(m); }); }
      const wn = wid && doc.nodes.find(x => x.id === wid), hw = wn ? (+wn.params.w || 300) * 0.35 : 0, hd = wn ? (+wn.params.d || 200) * 0.35 : 0, yaw = wn ? (wn.transform.rotation[2] || 0) * Math.PI / 180 : 0, c = Math.cos(yaw), s = Math.sin(yaw);
      let best = 0; for (const [a, b] of [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) { rcLand.set(toS([p[0] + a * c - b * s, p[1] + a * s + b * c, z + 30]), new T.Vector3(0, -1, 0)); rcLand.far = (z + 30) / 1000 + 0.001;
        const h = rcLand.intersectObjects(meshes, false)[0]; if (h) best = Math.max(best, Math.round(h.point.y * 1000)); }
      return best; }
    // jogging: by joint (deg) or by TCP axis (mm, inverse kinematics)
    /* joint limits: each robot has its mechanical range (cables, end stops, its own body: there is no collision check, so the
       range is what keeps the arm out of its base). 관절 한계 해제 lifts them while trying things out. */
    const limOf = rig => ROB.free ? rig.map((r, i) => r.lin ? L.limitsOf(rig)[i] : [-360, 360]) : L.limitsOf(rig); // a straight axis (스카라 J3) keeps its stroke: there is no more quill
    const ikR = (rig, o, t, seed, opt = {}) => L.rigIk(rig, o, t, seed, { ...opt, lim: limOf(rig) });
    function panelButtons(doc, tags) { const pb = RUN.pb || (RUN.pb = {});
      for (const t of doc.io) { const m = /_(START_PB|STOP_PB|ESTOP)$/.exec(t.tag); if (!m) continue; const on = !!tags[t.tag], was = !!pb[t.tag]; pb[t.tag] = on; if (on === was) continue;
        if (m[1] === 'ESTOP') { if (on) { if (AUTO.on) setAuto(false); log(`${t.tag} 비상정지 · 모든 동작 멈춤`); } else log(`${t.tag} 비상정지 해제`); }
        else if (on && m[1] === 'STOP_PB' && AUTO.on) { setAuto(false); log(`${t.tag} 정지 버튼 · 자동 운전 정지`); }
        else if (on && m[1] === 'START_PB' && !AUTO.on && !doc.io.some(x => /_ESTOP$/.test(x.tag) && tags[x.tag])) { setAuto(true); log(`${t.tag} 시작 버튼 · 자동 운전`); } }
      return doc.io.some(x => /_ESTOP$/.test(x.tag) && tags[x.tag]); }
    function stepRun(dt) {
      const doc = ED.machine.doc, tags = RUN.tags, byNode = new Map(doc.nodes.map(n => [n.id, n]));
      if (panelButtons(doc, tags)) return;
      RUN.t += dt;
      for (const j of doc.joints) {
        const t = doc.io.find(x => x.dir === 'out' && x.binding?.kind === 'joint' && x.binding.target === j.id); let v = RUN.v[j.id] ?? j.min;
        const sv = `${j.id.replace(/_[A-Z0-9]+$/, '')}_SERVO_ON`; if (sv in tags && !tags[sv]) continue; // a servo axis holds still until its servo is on
        if (j.mode === 'continuous') { const P = j.id.replace(/_[A-Z0-9]+$/, ''); const sp = tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : j.vmax; RUN.v[j.id] = v + (t && tags[t.tag] ? (tags[`${P}_DIR`] ? -1 : 1) * sp * dt : 0); continue; }
        const target = !t ? v : j.mode === 'onoff' ? (tags[t.tag] ? j.max : j.min) : Math.min(j.max, Math.max(j.min, +tags[t.tag] || 0));
        const step = j.vmax * dt; v = Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step; RUN.v[j.id] = v; RUN.v[j.id + ':target'] = target;
      }
      // works ride on running conveyors and stop at raised stoppers
      const convs = doc.nodes.filter(n => nodeDef(n)?.conveyor), stops = doc.nodes.filter(n => nodeDef(n)?.stops), corners = doc.nodes.filter(n => nodeDef(n)?.corner);
      const curves = doc.nodes.filter(n => nodeDef(n)?.curve).map(n => ({ n, g: L.curveGeom(n) }));
      const onCurve = (p, top, tol = 1) => { for (const c of curves) { if (Math.abs(c.g.top - top) > 60) continue; const l = c.g.locate(p); if (l && Math.abs(l.off) <= c.g.W / 2 + tol) return { c, l }; } return null; };
      const cframe = c => { const q = c.transform.position, r = c.transform.rotation[2] * Math.PI / 180; return { q, a: [Math.cos(r), Math.sin(r)], nrm: [-Math.sin(r), Math.cos(r)], wh: (c.params.w || 500) / 2, top: q[2] + (c.params.h || 900) }; };
      const inCorner = (p, top) => corners.find(c => { const f = cframe(c); if (Math.abs(f.top - top) > 60) return false; const dx = p[0] - f.q[0], dy = p[1] - f.q[1]; return Math.abs(dx * f.a[0] + dy * f.a[1]) <= f.wh + 1 && Math.abs(dx * f.nrm[0] + dy * f.nrm[1]) <= f.wh + 1; });
      const loc = (f, p) => [(p[0] - f.q[0]) * f.a[0] + (p[1] - f.q[1]) * f.a[1], (p[0] - f.q[0]) * f.nrm[0] + (p[1] - f.q[1]) * f.nrm[1]];
      // works ride conveyors along each conveyor's own direction; at an end they pass onto a conveyor that continues
      // (straight or at 90°), otherwise they stop at the end; a raised stopper on the way holds them
      const frame = c => { const q = c.transform.position, r = c.transform.rotation[2] * Math.PI / 180, d = nodeDef(c), p = Object.assign({}, d.params, c.params);
        return { q, a: [Math.cos(r), Math.sin(r)], nrm: [-Math.sin(r), Math.cos(r)], Lh: (p.length || 3000) / 2, wh: (p.w || 500) / 2, top: q[2] + (p.h || 900) + (d.lift ? RUN.v[`${nodeCode(c)}_Z`] || 0 : 0) }; };
      // a lift conveyor carries the work standing on it up and down with its rollers
      for (const c of convs) { if (!nodeDef(c).lift) continue; const f = frame(c);
        for (const id in RUN.works) { const w = RUN.works[id]; const [lx, ly] = loc(f, w.p); if (Math.abs(lx) <= f.Lh && Math.abs(ly) <= f.wh && Math.abs(w.z - f.top) < 60) w.z = f.top; } }
      for (const n of doc.nodes) { const w = RUN.works[n.id]; if (!w) continue; const z = w.z, hw = (n.params.w || 300) / 2; let best = null;
        // on a curve: ride along the arc at its centre line; at the exit, onto whatever continues
        const oc = onCurve(w.p, z); if (oc) { const { c, l } = oc, P = nodeCode(c.n); if (!tags[`${P}_RUN`]) continue; const sp = (tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : c.n.params.speed || 300) * (tags[`${P}_DIR`] ? -1 : 1);
          let u = l.u + sp * dt / c.g.len; if (u > 1 || u < 0) { const e = u > 1 ? 1 : 0, ep = c.g.point(e), hd = c.g.heading(e).map(v => v * Math.sign(sp)), probe = [ep[0] + hd[0] * 5, ep[1] + hd[1] * 5];
            const next = !!inCorner(probe, c.g.top) || curves.some(o => o !== c && Math.abs(o.g.top - c.g.top) < 5 && o.g.locate(probe)) || convs.some(o => { const g = frame(o); if (Math.abs(g.top - c.g.top) > 5) return false; const [ex, ey] = loc(g, probe); return Math.abs(ey) <= g.wh + 60 && ex >= -g.Lh - g.wh - 60 && ex <= g.Lh; });
            w.p = next ? [ep[0] + hd[0] * (Math.abs(u - e) * c.g.len + 6), ep[1] + hd[1] * (Math.abs(u - e) * c.g.len + 6)] : ep; continue; }
          w.p = c.g.point(u); continue; }
        // on a turn module: ride to its centre first; from the centre the conveyor at its side takes the work
        const cn = inCorner(w.p, z); if (!cn) delete w.centred; else if (w.centred !== cn.id) { const q = cn.transform.position, dx = q[0] - w.p[0], dy = q[1] - w.p[1], dd = Math.hypot(dx, dy);
          if (dd > 2) { if (!tags[`${nodeCode(cn)}_RUN`]) continue; const st = Math.min(dd, (cn.params.speed || 300) * dt); w.p = [w.p[0] + dx / dd * st, w.p[1] + dy / dd * st]; continue; } w.centred = cn.id; }
        for (const c of convs) { const f = frame(c); if (Math.abs(z - f.top) > 60) continue; const [lx, ly] = loc(f, w.p); if (Math.abs(ly) > f.wh || lx < -f.Lh - f.wh - 1 || lx > f.Lh + 1) continue;
          const P = nodeCode(c); if (!tags[`${P}_RUN`]) continue; if (nodeDef(c).lift) { const zj = doc.joints.find(j => j.id === `${P}_Z`), zv = RUN.v[`${P}_Z`]; if (zj && Math.abs(zv - zj.min) > 0.5 && Math.abs(zv - zj.max) > 0.5) continue; } const dir = tags[`${P}_DIR`] ? -1 : 1, sp = (tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : c.params.speed || 300) * dir * dt;
          let nx = lx + sp;
          for (const s0 of stops) { if (!(RUN.v[`${nodeCode(s0)}_Z`] > 5)) continue; const [sx, sy] = loc(f, s0.transform.position); if (Math.abs(sy) > f.wh) continue;
            if (sp > 0 && lx + hw <= sx + 1 && nx + hw > sx) nx = sx - hw; if (sp < 0 && lx - hw >= sx - 1 && nx - hw < sx) nx = sx + hw; }
          const endP = [f.q[0] + f.a[0] * (Math.sign(sp) * f.Lh), f.q[1] + f.a[1] * (Math.sign(sp) * f.Lh)];
          const handover = !!inCorner(endP, f.top) || !!onCurve(endP, f.top, 60) || convs.some(o => { if (o === c) return false; const g = frame(o); if (Math.abs(g.top - f.top) > 5) return false; const [ex, ey] = loc(g, endP); return Math.abs(ey) <= g.wh + 60 && ex >= -g.Lh - g.wh - 60 && ex <= g.Lh; });
          if (!handover) nx = Math.max(-f.Lh + hw, Math.min(f.Lh - hw, nx));
          const adv = Math.abs(nx - lx); if (!best || adv > best.adv) best = { adv, p: [w.p[0] + f.a[0] * (nx - lx), w.p[1] + f.a[1] * (nx - lx)] }; }
        if (best) w.p = best.p; }
      // sensors, processes, robots
      for (const t of doc.io) {
        if (t.dir !== 'in' || !t.binding) continue; const b = t.binding;
        if (b.kind === 'sensor' && b.target === 'work') { const sn = doc.nodes.find(n => t.tag.startsWith(nodeCode(n) + '_')); if (!sn) continue; const sp = sn.transform.position, range = sn.params.range || 500;
          if (nodeDef(sn)?.lift) { const f = frame(sn); tags[t.tag] = doc.nodes.some(n => { const w = RUN.works[n.id]; if (!w) return false; const [lx, ly] = loc(f, w.p); return Math.abs(lx) < f.Lh + (n.params.w || 300) / 2 - 10 && Math.abs(ly) <= f.wh && Math.abs(w.z - f.top) < 60; }); continue; }
          tags[t.tag] = doc.nodes.some(n => { const w = RUN.works[n.id]; if (!w) return false; const hw = (n.params.w || 300) / 2; const pc = convs.find(c => c.id === sn.parent), f = pc ? frame(pc) : { q: [0, 0], a: [1, 0], nrm: [0, 1] }, [sx, sy] = loc(f, sp), [wx, wy] = loc(f, w.p);
            if (pc && Math.abs(w.z - f.top) > 60) return false;
            return Math.abs(wx - sx) <= hw + 25 && Math.abs(wy - sy) < range + (n.params.d || 200) / 2; }); }
        else if (b.kind === 'sensor') { const [jid, end] = b.target.split(':'), j = doc.joints.find(x => x.id === jid); if (!j) continue; const v = RUN.v[jid];
          tags[t.tag] = end === 'max' ? Math.abs(v - j.max) < 0.5 : end === 'min' ? Math.abs(v - j.min) < 0.5 : Math.abs(v - (RUN.v[jid + ':target'] ?? v)) < 0.5; }
      }
      for (const n of doc.nodes) { const P = nodeCode(n), d = nodeDef(n); if (!d || progOf(n.id)) continue; const start = doc.io.find(t => t.tag === `${P}_START` || t.tag === `${P}_TRIG` || t.tag === `${P}_ON` && t.dir === 'out' || (t.tag === `${P}_RUN` || t.tag === `${P}_NEXT`) && !d.conveyor && !d.corner); if (!start) continue;
        const pr = RUN.procs[P] || (RUN.procs[P] = { busy: false, t0: 0, prev: false }), on = !!tags[start.tag], cyc = Math.max(0.2, +(n.params.cycle || d.params.cycle || (start.tag.endsWith('_TRIG') ? 0.5 : 1)));
        if (on && !pr.prev) { pr.busy = true; pr.t0 = RUN.t; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; }
        if (!on) { pr.busy = false; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; }
        if (pr.busy && RUN.t - pr.t0 >= cyc) { pr.busy = false; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = true; if (n.params.stage) stageUp(n, +n.params.stage); const ok = rng() < (n.params.ok_rate ?? 1); if (`${P}_OK` in tags) tags[`${P}_OK`] = ok; if (`${P}_NG` in tags) tags[`${P}_NG`] = !ok; if (`${P}_READY` in tags) tags[`${P}_READY`] = true; }
        if (`${P}_BUSY` in tags) tags[`${P}_BUSY`] = pr.busy; if (start.tag === `${P}_ON` && `${P}_OK` in tags) tags[`${P}_OK`] = on;
        pr.run = pr.busy ? (RUN.t - pr.t0) / cyc : 0; pr.prev = on; }
      // a part whose signal marks a finished job (a jig's 작업 끝 after the weld) moves the work on it to its next stage
      RUN.stg = RUN.stg || {}; for (const n of doc.nodes) { const sa = n.params?.stageAt; if (!sa) continue; const k = `${nodeCode(n)}_${sa.on}`, v = !!tags[k]; if (v && !RUN.stg[k]) stageUp(n, +sa.stage); RUN.stg[k] = v; }
      // pose
      for (const n of doc.nodes) { const o = objs.get(n.id)?.obj, d = nodeDef(n); if (!o || !d) continue; const P = nodeCode(n), vals = {};
        for (const j of doc.joints) if (j.node === n.id) vals[j.id.slice(P.length + 1)] = RUN.v[j.id];
        vals.RUN = RUN.procs[P]?.run || 0;
        if (d.pose) d.pose(o, Object.assign({}, d.params, n.params), vals, tg => !!tags[tg], P);
        if (RUN.works[n.id]) { placeObj(o, [RUN.works[n.id].p[0], RUN.works[n.id].p[1], RUN.works[n.id].z], n.transform.rotation[2]); stageFx(o, RUN.works[n.id].stage ?? 6, n); } }
    }

    /** one step of the whole machine, as 동작 시험 runs it each frame */
    function step(dt) { stepAuto(dt); stepRun(dt); stepRobots(dt); stepWorkers(dt); }
    return { step, toS, fromS, RUN, resetRun, AUTO, cmp, valTxt, stepAuto, ROB, progOf, robObj, rigFor, robotNodes, zeros, robState, RAILV, railOf, setRail, solvePoint, ARC, arcAt, arcTex, setDeg, tcpOf, VJ, startProg, stopProg, fkStored, rcHit, checkHit, stepRobots, progStep, WK, WALK, REACH, workerNodes, wkState, fwdOf, wkHand, angTo, stepConveyRails, stepWorkers, wkStep, rcLand, stageUp, STAGE_NAMES, stageFx, seatAt, landZ, limOf, ikR, panelButtons, stepRun };
  }
  window.OneRun = { create };
})();
