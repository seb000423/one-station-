// ONE SIM run view: the demo line's DES (window.OneTwinSim) drives the baked 3D module line (assets/models/egr-line-v3/egr_module_line.glb).
//
// How the replay stays honest: the DES times come from the 3D motion itself (assets/one-twin/module-line-map.json). The clip shows part k
// (1–8) going through the line on "lap time" τ (clip time c = τ + 50 (k − 1)). Every DES part and pallet gets a τ from its DES state
// (station progress, conveyor travel, waiting place, lift, return trip) and is drawn with the clip's own part / pallet keys at that τ;
// every moving machine node (robots, stops, presses, lifts, workers) is drawn at the τ of the part that is using it, so grippers close
// on the part, stops drop for the pallet and nothing moves without a reason. A part only ever moves at the clip's own speed (τ advances
// at most 1 s per simulated second), so nothing jumps; when the DES says a pallet waits, it stands at a real waiting place.
(() => {
  'use strict';
  const E = window.OneTwinSim, MAP = E.LINE_MAP, W = MAP.windows, T = MAP.T, P = MAP.P;
  const GLB = 'assets/models/egr-line-v3/egr_module_line.glb';
  const $ = id => document.getElementById(id);
  const CELL_NAME = { A: 'A 코어 투입·도포', B: 'B 엔드 탱크·레이저', C: 'C 플랜지·MIG', D: 'D 검사·외부 도포', E: 'E 리크·마킹·포장' };
  const STATE_KO = { busy: '가동', idle: '대기', blocked: '막힘', down: '고장', setup: '교체' };
  const STATION_X = { A0: -0.6, A1: 2.1 }; for (const id of MAP.stations) STATION_X[id] = W[id].x;
  const SLOT_REF = {}; for (const [k, s] of Object.entries(MAP.carton.slots)) if ([1, 7, 8].includes(+k)) SLOT_REF[s.slot] = +k; // carton slot → a reference part with a full lap in the clip
  const lap = k => P * (k - 1);
  const clipT = (k, tau) => (((tau + lap(k)) % T) + T) % T;

  /* ---------------------------------------------------------------- three.js scene */
  const canvas = $('c'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c0e);
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x202024, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(10, 18, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 10, bottom: -10, near: 1, far: 60 }); sun.target.position.set(14, 0, 1.3);
  scene.add(sun, sun.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(38, 12), new THREE.MeshStandardMaterial({ color: 0x1e1e24, roughness: 0.62, metalness: 0.0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(14.2, 0, 1.55); floor.receiveShadow = true; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  const controls = new THREE.OrbitControls(camera, canvas); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;
  const VIEWS = {
    '전체': [[14.2, 11, 17.5], [14.2, 0.6, 1.3]],
    A: [[2.4, 3.4, 5.4], [2.6, 0.9, 1.3]], B: [[9.2, 3.4, 5.6], [9.2, 0.9, 1.3]], C: [[15.3, 3.6, 6.0], [15.3, 0.9, 1.3]],
    D: [[20.4, 3.2, 5.2], [20.4, 0.9, 1.3]], E: [[25.8, 3.6, 6.0], [25.8, 0.9, 1.3]],
  };
  const setView = k => { const [p, t] = VIEWS[k]; camera.position.set(...p); controls.target.set(...t); controls.update(); document.querySelectorAll('#views .chip').forEach(b => b.classList.toggle('on', b.dataset.v === k)); };
  for (const k of Object.keys(VIEWS)) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.v = k; b.textContent = k === '전체' ? '전체' : k + ' 셀'; b.onclick = () => setView(k); $('views').appendChild(b); }
  setView('전체');
  const resize = () => { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();

  /* ---------------------------------------------------------------- the line model and its clip */
  let root = null, TR = null; // TR: node name → { position, quaternion, scale } interpolants
  const evalInto = (obj, src, c, off) => { const tr = TR[src]; if (!tr || !obj) return;
    if (tr.position) { const v = tr.position.evaluate(c); obj.position.set(v[0] + (off ? off[0] : 0), v[1] + (off ? off[1] : 0), v[2] + (off ? off[2] : 0)); }
    if (tr.quaternion) { const v = tr.quaternion.evaluate(c); obj.quaternion.set(v[0], v[1], v[2], v[3]); }
    if (tr.scale) { const v = tr.scale.evaluate(c); obj.scale.set(v[0], v[1], v[2]); } };

  // part and pallet clones: driven by the keys of a reference part k
  const FEATS = ['Paste', 'Tanks', 'Seam', 'FlangeL', 'FlangeR', 'Pipes', 'Mark'];
  let partTpl = null, palTpl = null;
  const makePart = () => { const x = partTpl.clone(true); x.visible = true; root.add(x);
    return { x, y: x.getObjectByName('Part_1_Y'), z: x.getObjectByName('Part_1_Z'), body: x.getObjectByName('Part_1'), feats: FEATS.map(f => x.getObjectByName('Part_1_' + f)) }; };
  const makePal = () => { const x = palTpl.clone(true); x.visible = true; root.add(x);
    return { x, y: x.getObjectByName('Pal_1_Y'), body: x.getObjectByName('Pal_1'), cl: x.getObjectByName('Pal_1_ClampL'), cr: x.getObjectByName('Pal_1_ClampR') }; };
  const posePart = (v, pose) => { const { k, c, off, featK, featC, visK, visC } = pose, n = 'Part_' + k;
    evalInto(v.x, n + '_X', c, off); evalInto(v.y, n + '_Y', c); evalInto(v.z, n + '_Z', c); evalInto(v.body, n, c);
    if (visK) { const s = TR['Part_' + visK]?.scale?.evaluate(visC); if (s) v.body.scale.set(s[0], s[1], s[2]); }
    FEATS.forEach((f, i) => evalInto(v.feats[i], 'Part_' + (featK || k) + '_' + f, featK ? featC : c)); };
  const posePal = (v, pose) => { const { k, c, off } = pose, n = 'Pal_' + k;
    evalInto(v.x, n + '_X', c, off); evalInto(v.y, n + '_Y', c); evalInto(v.body, n, c); evalInto(v.cl, n + '_ClampL', c); evalInto(v.cr, n + '_ClampR', c); };

  // moving machine nodes: each has active intervals [a, b, owner k] in clip time (from the map); remapped nodes replay another node's keys
  const EMPTY_OK = /^(Stop_|[BCE]_Turn$|Lift_)/;
  let EQUIP = []; // { obj, entries: [{ src, off, site, iv: [[a,b,k]], stop }], last: { src, off, c } }
  const buildEquip = () => {
    const rest = n => root.getObjectByName(n)?.position.clone() ?? new THREE.Vector3();
    const byObj = new Map(), add = (name, entry) => { const obj = root.getObjectByName(name); if (!obj) return; if (!byObj.has(obj)) byObj.set(obj, { obj, name, entries: [], last: null }); byObj.get(obj).entries.push(entry); };
    for (const [name, iv] of Object.entries(MAP.intervals)) add(name, { src: name, off: null, site: null, iv, stop: /^Stop_/.test(name) });
    const remap = (to, from, site) => { const d = rest(to).sub(rest(from)); add(to, { src: from, off: [d.x, d.y, d.z], site, iv: (MAP.intervals[from] || []).filter(v => v[2] === 6), stop: /^Stop_/.test(to) }); };
    // NG trip at E6 replays the one measured at A6; an empty pallet passing the leak station replays the pass through the laser station
    remap('E_NG_Pusher', 'A_NG_Pusher', 'E'); remap('E_NG_Return', 'A_NG_Return', 'E'); remap('Stop_okng', 'Stop_ngA', 'E'); remap('Stop_okng_Pins', 'Stop_ngA_Pins', 'E');
    remap('Stop_estop', 'Stop_bstop', 'E'); remap('Stop_estop_Pins', 'Stop_bstop_Pins', 'E'); remap('Stop_eback', 'Stop_bback', 'E'); remap('Stop_eback_Pins', 'Stop_bback_Pins', 'E');
    EQUIP = [...byObj.values()];
    // rest pose: just before the first interval part 1 owns (the state after the previous lap)
    for (const q of EQUIP) { const e = q.entries[0], first = e.iv.find(v => v[2] === 1) || e.iv[0]; if (first) q.last = { src: e.src, off: e.off, c: Math.max(0, first[0] - 0.02) }; }
  };
  const TASK_TOTE = /^(W_1(_.*)?|A_Tote)$/, TASK_CARTON = /^(W_4(_.*)?|E_Pack_Carton|E_Pack_Lid)$/;
  let TASKS = { tote: [], carton: [] }, toteCores = [], cartonItems = [], lampNG = null, lampOK = null;

  /* ---------------------------------------------------------------- the simulation */
  const cfg = { pallets: 8, seed: 1, horizon: 8 * 3600, deterministic: false, stations: undefined };
  let line = null, sim = null, simT = 0, playing = false, speed = 5;
  let views = new Map(), palViews = new Map(), ghosts = [], logView = [], exitsT = [], partSeq = new Map();
  let tote = { t0: null, shown: 0, swapped: false }, carton = { count: 0, placed: new Set(), t3: null, gone: false }, lastResult = null;

  const newSim = () => {
    line = E.buildDemoLine({ pallets: cfg.pallets, deterministic: cfg.deterministic, stations: cfg.stations });
    sim = new E.LineSim(line.model, { seed: cfg.seed, log: true });
    simT = 0; exitsT = []; logView = []; ghosts = []; partSeq = new Map(); tote = { t0: null, shown: 0, swapped: false }; carton = { count: 0, placed: new Set(), t3: null, gone: false }; toteTaken = new Set();
    for (const v of views.values()) root.remove(v.x); for (const v of palViews.values()) root.remove(v.x);
    views = new Map(); palViews = new Map();
    for (let i = 0; i < cfg.pallets; i++) palViews.set(i, Object.assign(makePal(), { tau: null, dom: null }));
    $('log').innerHTML = ''; buildRows();
    $('seek').max = cfg.horizon; $('horizonL').textContent = (cfg.horizon / 3600) + ' h';
  };
  const advance = t => { t = Math.min(t, cfg.horizon); sim.run(t); simT = t; consumeLog(); };

  /* ---- where a part is on its lap (reference part, lap time, site) ---- */
  const kTote = p => (p.seq % 8) + 1;
  function partPose(p, s, t) {
    const at = p.at, st = s.stations[at];
    if (at === 'A0' || at === 'A1') { const w = W[at]; return { dom: 'n', k: kTote(p), tau: w.a + st.progress * (w.b - w.a) }; }
    if (at === 'LANE') return { dom: 'n', k: kTote(p), tau: Math.min(W.LANE.a + (t - p.enteredAt), W.LANE.b) };
    if (at.startsWith('CV_')) {
      const X = at.slice(3), w = W[at], i = (s.buffers[at] || []).indexOf(p.id), ns = s.stations[X];
      const held = i > 0 || ns.part !== null || ns.state !== 'idle';
      const free = w.a + (t - p.enteredAt), cap = held ? (w.queue[i] ?? w.a + 0.05) : w.b;
      const pose = { dom: 'n', k: 1, tau: Math.min(free, cap), eq: Math.max(Math.min(free, w.a + 3), 0), empty: p.empty, start: w.a };
      if (X === 'A2') { pose.kPrev = kTote(p); pose.kAt = w.a + 0.05; } // robot A's lane: the reference part stays the tote one until the pallet moves
      return pose;
    }
    if (st) {
      if (t < st.arriveAt - 1e-6) return { dom: 'n', k: 1, tau: Math.max(W['CV_' + at].a, W['CV_' + at].b - (st.arriveAt - t)), empty: p.empty };
      const w = W[at], f = st.progress, tail = st.state === 'blocked' ? Math.min(w.b + (t - st.since), w.b + 3) : null;
      if (st.mode === 'reject') { const site = at === 'A6' ? 'A' : 'E', tau = MAP.ng.a + f * (MAP.ng.b - MAP.ng.a);
        return { dom: 'ng:' + at, k: 6, tau, site, off: [w.x - 5.5, 0, 0], featK: 1, featC: clipT(1, w.a), from: w.a, start: MAP.ng.a, end: MAP.ng.b }; }
      if (st.mode === 'empty') {
        if (at === 'B6' || at === 'E3') { const ep = MAP.emptyPass; return { dom: 'ep:' + at, k: 6, tau: ep.a + f * (ep.b - ep.a), site: at === 'B6' ? 'B' : 'E', off: [w.x - ep.x, 0, 0], empty: true, from: w.a, start: ep.a, end: ep.b }; }
        return { dom: 'n', k: 1, tau: w.a + f * (w.b - w.a), empty: true, eq: tail };
      }
      let k = 1;
      if (at === 'E3' && st.willFail) k = 3;
      if (at === 'E7') { if (!partSeq.has(p.id)) partSeq.set(p.id, st.good % 3); k = SLOT_REF[partSeq.get(p.id)] ?? 1; }
      return { dom: 'n', k, tau: w.a + f * (w.b - w.a), eq: tail, kPrev: 1, kAt: w.a, kUntil: w.b };
    }
    return null;
  }

  /* ---- the free pallets: on the way back, waiting in front of the start lift, on the lift, at the merge stop ---- */
  function freePallets(s, t) {
    const pl = s.pools.PAL, R = W.RETURN, out = new Map(), queueTau = j => (j === 0 ? R.lower : R.queue[Math.min(j, R.queue.length) - 1]);
    const o = t < pl.liftFreeAt ? 1 : 0; // while the lift is up (or on its way down) the first pallet waits one place back
    pl.lower.forEach((l, j) => out.set(l.id, { k: 1, tau: queueTau(j + o), cap: true }));
    pl.returning.slice().sort((a, b) => a.since - b.since).forEach((r, i) => out.set(r.id, { k: 1, tau: Math.min(R.a + (t - r.since), queueTau(pl.lower.length + i + o)) }));
    if (pl.top && pl.top.part === null) out.set(pl.top.id, { k: 1, lift: true, tau: pl.top.at > t ? R.top - (pl.top.at - t) : Math.min(R.top + (t - pl.top.at), R.liftFree + 1) });
    return out;
  }

  /* ---------------------------------------------------------------- one frame */
  // pallet x along a window of part 1's lap (to keep a gap between pallets that wait or move up one after another)
  const XT = {};
  function xTable(key, a, b) { if (XT[key]) return XT[key]; const tr = TR.Pal_1_X.position, ts = [], xs = [];
    for (let tau = a; tau <= b + 1e-9; tau += 0.02) { ts.push(tau); xs.push(tr.evaluate(clipT(1, tau))[0]); }
    const dir = xs[xs.length - 1] >= xs[0] ? 1 : -1;
    return (XT[key] = { a, b, dir, x: tau => xs[Math.max(0, Math.min(xs.length - 1, Math.round((tau - a) / 0.02)))],
      tau: x => { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if ((xs[m] - x) * dir < 0) lo = m; else hi = m; } return ts[lo]; } }); }
  const GAP = 0.305; // pallet 300 mm + clearance

  function frame(dt) {
    const s = sim.snapshot(), t = s.t, drivers = [], seen = new Set(), carried = new Map(), byPart = new Map();
    const step = (v, target, dom) => { if (v.tau === null || v.dom !== dom || dt > 30) { v.tau = target; v.dom = dom; } else if (target > v.tau) v.tau = Math.min(target, v.tau + dt); return v.tau; };
    // a part changes reference (NG trip, empty pass) only once it has reached the point where the two match: no jumps
    const stepPose = (v, pose) => {
      if (v.tau === null || dt > 30) { v.dom = pose.dom; v.tau = pose.tau; v.endTau = pose.end; v.pose = pose; return; }
      // a part whose drawing still lags inside a station with its own reference (E3 NG, E7 slot) keeps it to that station's end
      if (v.pose && v.pose.kUntil != null && v.pose.k !== pose.k && v.tau < v.pose.kUntil - 1e-6 && !(v.kHold && v.kHold.until === v.pose.kUntil)) v.kHold = { k: v.pose.k, until: v.pose.kUntil };
      if (v.dom !== pose.dom) {
        const end = v.dom === 'n' ? (pose.from ?? v.tau) : (v.endTau ?? v.tau);
        if (v.tau < end - 1e-6) { v.tau = Math.min(end, v.tau + dt); return; } // finish the old way first (v.pose stays)
        v.dom = pose.dom; v.tau = pose.start ?? pose.tau; v.endTau = pose.end;
      }
      if (pose.tau > v.tau) v.tau = Math.min(pose.tau, v.tau + dt);
      v.pose = pose;
    };
    // 1. every part's place on its lap
    for (const p of s.parts) {
      const pose = partPose(p, s, t); if (!pose) continue;
      let v = views.get(p.id); if (!v) { v = Object.assign(makePart(), { tau: null, dom: null }); views.set(p.id, v); }
      seen.add(p.id); stepPose(v, pose); v.p = p; byPart.set(p.id, v);
    }
    for (const [id, v] of views) if (!seen.has(id)) { root.remove(v.x); views.delete(id); } // packed into the carton (its copy shows there) or the pallet left empty
    // 2. pallets on the line keep their gap: a pallet moving up stops behind the one in front (which may still be leaving its stop)
    { const line = [];
      for (const v of byPart.values()) { const at = v.p.at; if (v.pose.dom !== 'n' || at === 'A0' || at === 'LANE') continue;
        const key = at.startsWith('CV_') ? at : at === 'A1' ? null : at; if (key === null) { line.push({ v, x: STATION_X.A1, cv: false }); continue; }
        const w = W[key], inCv = key.startsWith('CV_') || v.tau < w.a, wk = inCv && !key.startsWith('CV_') ? 'CV_' + key : key, ww = W[wk], tb = xTable(wk, ww.a, ww.b);
        line.push({ v, x: tb.x(v.tau), cv: inCv, tb, a: ww.a }); }
      line.sort((p, q) => q.x - p.x);
      let front = Infinity;
      for (const o of line) { if (o.cv && o.x > front - GAP) { o.v.tau = Math.min(o.v.tau, Math.max(Math.min(o.v.tau, o.a), o.tb.tau(front - GAP))); o.x = o.tb.x(o.v.tau); } front = Math.min(front, o.x); } }
    // 3. draw parts, collect the machines' drivers
    for (const v of byPart.values()) {
      const pose = v.pose, p = v.p, tau = v.tau;
      if (v.kHold && tau >= v.kHold.until - 1e-6) v.kHold = null;
      const k = v.kHold ? v.kHold.k : pose.kAt != null && tau < pose.kAt - 1e-6 ? pose.kPrev : pose.k; v.k = k;
      const c = clipT(k, tau), off = pose.off || null, eqTau = pose.eq != null ? Math.max(tau, pose.eq) : tau, cEq = clipT(k, eqTau);
      v.x.visible = !p.empty;
      if (!p.empty) posePart(v, pose.dom.startsWith('ng:') ? { k: 6, c, off, featK: 1, featC: pose.featC, visK: 6, visC: c } : { k, c, off });
      if (p.carrier !== null) carried.set(p.carrier, { k, c, off });
      drivers.push({ k, c, cEq, site: pose.site || null, empty: !!pose.empty, tau });
      if (p.at === 'A0' || p.at === 'LANE' || p.at === 'A1') { if (tau >= MAP.tote.pick) toteTaken.add(p.seq); } // the core is out of the tote
      if (p.at === 'E7' && !p.empty && !carton.placed.has(p.id) && MAP.carton.slots[k] && tau >= MAP.carton.slots[k].place) { carton.placed.add(p.id); carton.count++; if (carton.count === 3) carton.t3 = t; } // in the carton
    }
    // 4. pallets: carried ones follow their part; free ones run the return conveyor, wait in front of the lift, ride it up
    const free = freePallets(s, t), R = W.RETURN, rt = xTable('RET', R.lowRun, R.lower), lowRun = [];
    for (const [id, v] of palViews) {
      const c = carried.get(id);
      if (c) { if (v.dom === 'free' && v.tau !== null && v.tau < R.liftFree + 1) ghosts.push({ tau: v.tau }); v.dom = 'carried'; v.carrier = c; continue; }
      const f = free.get(id); if (!f) continue;
      v.carrier = null;
      step(v, f.tau, 'free'); if (!f.lift && v.tau >= R.lowRun && v.tau <= R.lower) lowRun.push(v);
    }
    lowRun.sort((a, b) => b.tau - a.tau); // nearest the lift first
    { let front = -Infinity; const lift = s.pools.PAL; if (t < lift.liftFreeAt) front = W.RETURN.liftX; // the lift is up: nobody on its platform
      for (const v of lowRun) { const x = rt.x(v.tau); if (x < front + GAP) v.tau = Math.min(v.tau, Math.max(Math.min(v.tau, R.lowRun), rt.tau(front + GAP))); front = rt.x(v.tau); } }
    for (const [id, v] of palViews) {
      if (v.dom === 'carried') { if (v.carrier) posePal(v, v.carrier); continue; }
      if (v.tau === null) continue;
      posePal(v, { k: 1, c: clipT(1, v.tau) }); drivers.push({ k: 1, c: v.tau, cEq: v.tau, site: null, empty: true, tau: v.tau });
    }
    // the start lift finishes its stroke after its pallet was taken
    ghosts = ghosts.filter(g => (g.tau = Math.min(g.tau + dt, R.liftFree + 1)) < R.liftFree + 0.99);
    for (const g of ghosts) drivers.push({ k: 1, c: g.tau, cEq: g.tau, site: null, empty: true });
    driveEquip(drivers);
    driveTasks(s, t);
  }

  function driveEquip(drivers) {
    for (const q of EQUIP) {
      let best = null;
      for (const e of q.entries) for (const d of drivers) {
        if ((d.site || null) !== e.site || (d.empty && !EMPTY_OK.test(q.name))) continue;
        const c = e.stop ? d.c : d.cEq;
        for (const iv of e.iv) if (iv[2] === d.k && c >= iv[0] - 1e-3 && c <= iv[1] + 1e-3 && (!best || c > best.c)) best = { src: e.src, off: e.off, c };
      }
      if (best) q.last = best;
      if (q.last) evalInto(q.obj, q.last.src, q.last.c, q.last.off);
    }
  }

  let toteTaken = new Set(), toteUp = null;
  function driveTasks(s, t) {
    // tote change: after the 8th core of a tote the loader operator takes the empty tote out and brings a full one
    let cTote = MAP.tote.b + 0.5, away = false;
    if (tote.t0 !== null) {
      const c = MAP.tote.lastPartA0 + (t - tote.t0);
      if (c <= MAP.tote.b) { cTote = Math.max(c, MAP.tote.a); away = c >= toteUp && c < MAP.tote.back; if (c >= MAP.tote.back && !tote.swapped) { tote.swapped = true; tote.shown++; } }
      else { if (!tote.swapped) tote.shown++; tote.t0 = null; }
    }
    for (const o of TASKS.tote) evalInto(o, o.name, cTote);
    toteCores.forEach((o, j) => { if (o) o.visible = !away && !toteTaken.has(tote.shown * 8 + j); });
    // carton change after the third cooler: the lid closes, the operator carries the full carton out and brings an empty one
    let cCar = MAP.carton.b + 0.5;
    if (carton.t3 !== null) {
      const c = MAP.carton.a + 0.3 + (t - carton.t3 - MAP.carton.afterPlace);
      if (c <= MAP.carton.b) { cCar = Math.max(c, MAP.carton.a); if (c >= MAP.carton.up && !carton.gone) { carton.gone = true; carton.count = Math.max(0, carton.count - 3); } }
      else { if (!carton.gone) carton.count = Math.max(0, carton.count - 3); carton.t3 = null; carton.gone = false; }
    }
    for (const o of TASKS.carton) evalInto(o, o.name, cCar);
    cartonItems.forEach((o, j) => { if (o) o.visible = j < Math.min(3, carton.count); });
    // the sorting stop's NG lamp while a rejected part is taken off
    const e6 = s.stations.E6; if (lampNG) lampNG.scale.setScalar(e6.mode === 'reject' && e6.part !== null && e6.progress * (MAP.ng.b - MAP.ng.a) < 3 ? 1 : 1e-4);
  }

  /* ---- log → event list ---- */
  const NAME = id => (line.stations.find(s => s.id === id)?.name) || id;
  const hhmmss = t => { t = Math.floor(t); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  function consumeLog() {
    const L = sim.log; if (!L.length) return;
    for (const e of L) {
      if (e.kind === 'exit') exitsT.push(e.t);
      if (e.kind === 'create') {
        const p = sim.parts.get(e.part); const seq = p ? p.seq : null;
        if (seq !== null && seq % 8 === 7) { tote.t0 = e.t; tote.swapped = false; }
        if (seq !== null && seq % 8 === 7) addLog(e.t, 'setup', '토트 교체 (8개 소진, 작업자 보충)');
      }
      if (e.kind === 'fail') addLog(e.t, 'fail', `${e.node} ${NAME(e.node)} 고장`);
      else if (e.kind === 'repair') addLog(e.t, 'repair', `${e.node} 복구`);
      else if (e.kind === 'reject') addLog(e.t, 'reject', `${e.node} NG 배출 → NG 보관함 (${e.node === 'A6' ? '계량 불량' : '리크 불량'})`);
      else if (e.kind === 'setup') addLog(e.t, 'setup', `${e.node} 카톤 교체 (3개 적재)`);
    }
    L.length = 0;
  }
  function addLog(t, kind, text) {
    logView.push({ t, kind, text }); if (logView.length > 80) logView.shift();
    const d = document.createElement('div'); d.className = 'e-' + kind; d.innerHTML = `<span>${hhmmss(t)}</span><b></b>`; d.querySelector('b').textContent = text;
    const box = $('log'); box.prepend(d); while (box.children.length > 60) box.lastChild.remove();
  }

  /* ---------------------------------------------------------------- panel */
  const ROWS = {};
  function buildRows() {
    const box = $('rows'); box.innerHTML = ''; let cell = '';
    for (const s of line.stations) {
      if (s.cell !== cell) { cell = s.cell; const h = document.createElement('div'); h.className = 'cell'; h.textContent = CELL_NAME[cell]; box.appendChild(h); }
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = `<span class="id"><i></i>${s.id}</span><span><span class="nm"></span><span class="util"><u style="background:var(--busy)"></u><u style="background:var(--blocked)"></u><u style="background:var(--down)"></u><u style="background:var(--setup)"></u></span></span><span class="pc"></span>`;
      r.querySelector('.nm').textContent = `${s.name} · ${s.ct.toFixed(1)} s`; r.onclick = () => focusStation(s.id);
      box.appendChild(r); ROWS[s.id] = r;
    }
  }
  function focusStation(id) { const x = STATION_X[id]; camera.position.set(x + 0.4, 2.6, 4.2); controls.target.set(x, 0.95, 1.3); controls.update(); document.querySelectorAll('#views .chip').forEach(b => b.classList.remove('on')); }
  function updatePanel() {
    const r = sim.result(); lastResult = r; const h = Math.max(1e-6, simT / 3600);
    $('kOut').textContent = r.produced; $('kRate').textContent = simT > 600 ? (r.produced / h).toFixed(1) : '–';
    const lastH = exitsT.filter(x => x > simT - 3600).length; $('kRate1').textContent = simT >= 3600 ? `최근 1시간 ${lastH}` : '최근 1시간 –';
    $('kLt').textContent = r.leadTime.n ? (r.leadTime.mean / 60).toFixed(1) + ' 분' : '–';
    $('kWip').textContent = r.wipNow; $('kNg').textContent = r.scrapped;
    const pl = sim.snapshot().pools.PAL, inUse = cfg.pallets - pl.lower.length - pl.returning.length - (pl.top && pl.top.part === null ? 1 : 0);
    $('kPal').textContent = `${inUse} / ${cfg.pallets}`;
    $('kpiNote').textContent = (simT / 3600).toFixed(1) + '시간 경과';
    const bn = simT > 300 ? r.bottleneck : null;
    if (bn) { const st = r.stations[bn]; $('bnName').textContent = `${bn} ${st.name}`;
      $('bnWhy').textContent = `가동 ${(st.busy * 100).toFixed(0)}% · 고장 ${(st.down * 100).toFixed(0)}% — 가장 바쁜 공정. 팔레트 ${inUse}/${cfg.pallets} 사용 중${pl.lower.length + (pl.top && pl.top.part === null ? 1 : 0) === 0 ? ' (팔레트 부족: 팔레트가 병목일 수 있음)' : ''}`; }
    else { $('bnName').textContent = '–'; $('bnWhy').textContent = '5분 이상 실행하면 표시됩니다'; }
    for (const [id, row] of Object.entries(ROWS)) {
      const st = r.stations[id]; if (!st) continue; const u = row.querySelectorAll('u');
      u[0].style.width = (st.busy * 100) + '%'; u[1].style.width = (st.blocked * 100) + '%'; u[2].style.width = (st.down * 100) + '%'; u[3].style.width = (st.setup * 100) + '%';
      row.querySelector('.pc').textContent = (st.busy * 100).toFixed(0) + '%';
      row.querySelector('.id i').className = 'st-' + st.state; row.classList.toggle('bn', id === bn);
    }
  }

  /* ---- station tags over the 3D view ---- */
  const TAGS = {}, v3 = new THREE.Vector3();
  function buildTags() { const box = $('tags'); box.innerHTML = '';
    for (const s of line.stations) { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = `<i></i>${s.id}`; d.title = s.name; box.appendChild(d); TAGS[s.id] = d; } }
  function updateTags() {
    const r = canvas.getBoundingClientRect(), s = sim.snapshot(), bn = lastResult && simT > 300 ? lastResult.bottleneck : null;
    for (const [id, d] of Object.entries(TAGS)) {
      const x = STATION_X[id]; v3.set(x, 1.75, id === 'A0' ? 1.3 : 1.3).project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05; d.style.display = vis ? '' : 'none'; if (!vis) continue;
      d.style.left = ((v3.x + 1) / 2 * r.width) + 'px'; d.style.top = ((1 - v3.y) / 2 * r.height) + 'px';
      d.querySelector('i').className = 'st-' + (s.states[id] || 'idle'); d.classList.toggle('bn', id === bn);
      d.title = `${id} ${NAME(id)} · ${STATE_KO[s.states[id]] || ''}`;
    }
  }

  /* ---------------------------------------------------------------- transport */
  const SPEEDS = [1, 2, 5, 10, 30, 60];
  for (const x of SPEEDS) { const b = document.createElement('button'); b.textContent = x + '×'; b.onclick = () => { speed = x; document.querySelectorAll('#speeds button').forEach(q => q.classList.toggle('on', q === b)); }; if (x === speed) b.classList.add('on'); $('speeds').appendChild(b); }
  const setPlaying = on => { playing = on; $('play').textContent = on ? '❚❚' : '▶'; };
  $('play').onclick = () => setPlaying(!playing);
  window.addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); } });
  let seeking = false;
  $('seek').addEventListener('input', () => { seeking = true; $('clock').textContent = hhmmss(+$('seek').value); });
  $('seek').addEventListener('change', () => { seekTo(+$('seek').value); seeking = false; });
  function seekTo(t) { // the DES is deterministic: run again from the start to t, then draw (positions snap)
    const was = playing; setPlaying(false); newSim();
    // replay in steps so the tote / carton counters see each part pass
    for (let x = 0; x < t; x = Math.min(t, x + 2)) { advance(Math.min(t, x + 2)); frame(31); }
    advance(t); frame(31); updatePanel(); setPlaying(was);
  }
  const bindRange = (id, out, fmt, set) => { const el = $(id); const f = () => { $(out).textContent = fmt(+el.value); }; el.oninput = f; f(); return () => set(+el.value); };
  const getPal = bindRange('pal', 'palO', v => v, v => (cfg.pallets = v)), getSeed = bindRange('seed', 'seedO', v => v, v => (cfg.seed = v)), getHor = bindRange('hor', 'horO', v => v + ' h', v => (cfg.horizon = v * 3600));
  $('apply').onclick = () => { getPal(); getSeed(); getHor(); cfg.deterministic = $('det').checked; newSim(); buildTags(); frame(31); updatePanel(); setPlaying(true); };

  /* ---------------------------------------------------------------- load and run */
  const loader = new THREE.GLTFLoader(); loader.setMeshoptDecoder(window.MeshoptDecoder);
  loader.load(GLB, gltf => {
    const sceneRoot = gltf.scene; root = sceneRoot.getObjectByName('EGR_Module_Line') || sceneRoot;
    sceneRoot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(sceneRoot);
    TR = {};
    for (const tr of gltf.animations[0].tracks) { const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(tr.name); (TR[nodeName] || (TR[nodeName] = {}))[propertyName] = tr.createInterpolant(); }
    partTpl = root.getObjectByName('Part_1_X').clone(true); palTpl = root.getObjectByName('Pal_1_X').clone(true);
    for (let k = 1; k <= 8; k++) { root.getObjectByName('Part_' + k + '_X').visible = false; root.getObjectByName('Pal_' + k + '_X').visible = false; }
    buildEquip();
    TASKS.tote = []; TASKS.carton = [];
    root.traverse(o => { if (!TR[o.name]) return; if (TASK_TOTE.test(o.name)) TASKS.tote.push(o); else if (TASK_CARTON.test(o.name)) TASKS.carton.push(o); });
    toteCores = Array.from({ length: 8 }, (_, j) => root.getObjectByName('A_Tote_Core_' + j));
    cartonItems = Array.from({ length: 4 }, (_, j) => root.getObjectByName('E_Carton_Item_' + j));
    for (const o of [...toteCores, ...cartonItems]) if (o) o.scale.setScalar(1);
    cartonItems[3] && (cartonItems[3].visible = false);
    lampNG = root.getObjectByName('E_OKNG_NG');
    { const tr = TR.A_Tote?.scale; if (tr) for (let c = MAP.tote.a; c < MAP.tote.back; c += 0.05) if (tr.evaluate(c)[0] < 0.5) { toteUp = c; break; } }
    newSim(); buildTags(); frame(31); updatePanel();
    $('loading').hidden = true; setPlaying(true);
    let last = performance.now(), panelAt = 0;
    const loop = now => {
      const dtw = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing && !seeking && simT < cfg.horizon) { const dt = dtw * speed; advance(simT + dt); frame(dt); if (simT >= cfg.horizon) setPlaying(false); }
      if (now - panelAt > 400) { updatePanel(); panelAt = now; if (!seeking) $('seek').value = simT; }
      if (!seeking) $('clock').textContent = hhmmss(simT);
      controls.update(); renderer.render(scene, camera); updateTags();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, undefined, err => { $('loading').textContent = '3D 모델을 불러오지 못했습니다: ' + (err && err.message || err); });

  // "no magic" audit: run the replay in small steps and report pallets that overlap and parts / pallets that jump (move without the
  // clip moving them: a change of reference part or of lap time that is not continuous)
  function audit(t0, t1, dt = 0.1) {
    seekTo(t0); setPlaying(false);
    const out = { overlaps: [], jumps: [], fast: 0, frames: 0 }, prev = new Map(), wp = new THREE.Vector3();
    const stateOf = v => v.dom === 'carried' ? (v.carrier ? 'c' + v.carrier.k + ':' + v.carrier.c.toFixed(2) : 'c') : v.dom + ':' + (v.k || 1);
    for (let t = t0 + dt; t <= t1 + 1e-9; t += dt) {
      advance(t); frame(dt); out.frames++;
      const objs = [];
      for (const [id, v] of palViews) { v.body.getWorldPosition(wp); objs.push({ key: 'pal' + id, p: wp.clone(), v, pal: true }); }
      for (const [id, v] of views) if (v.x.visible && v.body.scale.x > 0.5) { v.body.getWorldPosition(wp); objs.push({ key: 'part' + id, p: wp.clone(), v }); }
      const pals = objs.filter(o => o.pal);
      for (let i = 0; i < pals.length; i++) for (let j = i + 1; j < pals.length; j++) {
        const a = pals[i].p, b = pals[j].p;
        if (Math.abs(a.y - b.y) < 0.2 && Math.abs(a.z - b.z) < 0.25 && Math.abs(a.x - b.x) < 0.29) out.overlaps.push({ t: +t.toFixed(2), a: pals[i].key, b: pals[j].key, x: +a.x.toFixed(3), y: +a.y.toFixed(2), d: +Math.abs(a.x - b.x).toFixed(3) });
      }
      for (const o of objs) {
        const q = prev.get(o.key), st = { dom: o.v.dom, k: o.v.k, tau: o.v.tau, s: stateOf(o.v) };
        if (q) { const d = q.p.distanceTo(o.p), dtau = st.tau - q.tau, switched = q.dom !== st.dom || q.k !== st.k;
          if (d > 0.03 && (switched || dtau > dt + 1e-6 || dtau < -1e-6)) out.jumps.push({ t: +t.toFixed(2), key: o.key, d: +d.toFixed(3), from: q.s + '@' + (q.tau ?? 0).toFixed(2), to: st.s + '@' + (st.tau ?? 0).toFixed(2), at: o.p.toArray().map(x => +x.toFixed(2)) });
          else if (d / dt > 3) out.fast++; }
        prev.set(o.key, { p: o.p, ...st });
      }
    }
    return { frames: out.frames, overlaps: out.overlaps.length, firstOverlaps: out.overlaps.slice(0, 10), jumps: out.jumps.length, firstJumps: out.jumps.slice(0, 16), clipFastMoves: out.fast };
  }

  function debug() { const s = sim.snapshot(), out = { t: s.t, parts: [] };
    for (const [id, v] of views) out.parts.push({ id, at: v.p.at, empty: v.p.empty, carrier: v.p.carrier, dom: v.dom, k: v.k, tau: +(v.tau ?? 0).toFixed(2), target: +(v.pose?.tau ?? 0).toFixed(2), st: s.stations[v.p.at] ? { state: s.stations[v.p.at].state, arr: +s.stations[v.p.at].arriveAt.toFixed(2), f: +s.stations[v.p.at].progress.toFixed(2) } : (s.buffers[v.p.at] || null) });
    out.pals = [...palViews].map(([id, v]) => { const wp = new THREE.Vector3(); v.body.getWorldPosition(wp); return { id, dom: v.dom, x: +wp.x.toFixed(3), y: +wp.y.toFixed(2), tau: v.tau && +v.tau.toFixed(2) }; });
    return out; }
  window.ONE_SIM = { audit, debug, get TR() { return TR; }, clipT, get sim() { return sim; }, get t() { return simT; }, cfg, seekTo, setPlaying, frame: dt => frame(dt), advance };
})();
