// ONE SIM for a line drawn in ONE BUILDER (sim.html?src=builder): the BUILDER layout (localStorage, same site) is shown with
// the builder's own models, turned into a DES model (OneTwinSim.buildLayoutLine) and replayed on it.
//
// What becomes what: the conveyor network (js/factory-flow.js: belt → belt, side merges, 투입 / 배출 ends) is the flow;
// equipment standing at a belt (its footprint within 35 cm of the belt's centre line) is a station at the closest point
// of that belt, with its cycle time (설비 cycle / 내 설비 ct / params.sim.ct) and optional OK rate and failures (params.sim).
// How the replay stays honest: every item is drawn at the belt position the DES state gives (travelling at belt speed,
// waiting one item apart in front of a busy station, standing at the station while it works); an item never moves faster
// than its belt, never backwards, and never closer than one item to the one in front. Machines move only while their
// station works on an item. Items are put on at the 투입 end and taken off at the 배출 end, as the layout says.
(() => {
  'use strict';
  const E = window.OneTwinSim, FE = window.FactoryElements, FF = window.FactoryFlow, FU = window.FactoryUnity;
  const $ = id => document.getElementById(id);
  const STORE = 'one-station-factory-v3', GAP = 0.05;
  const STATE_KO = { busy: '가동', idle: '대기', blocked: '막힘', down: '고장', setup: '교체' };
  const MACHINE_CATS = ['공정 설비', '검사 · 비전', '로봇', 'EGR 라인'];

  /* ---------------------------------------------------------------- the BUILDER document */
  let doc = null;
  try { doc = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { doc = null; }
  const fail = msg => { $('loading').innerHTML = `<div style="max-width:440px;text-align:center;line-height:1.7;font-family:var(--sans);letter-spacing:0">${msg}<br><br><a class="btn pri" href="console.html?resume=1" style="text-decoration:none;display:inline-block">ONE BUILDER로 가기</a></div>`; };
  if (!doc || !Array.isArray(doc.objects)) { fail('ONE BUILDER에서 꾸민 라인이 이 브라우저에 없습니다.'); return; }
  doc.factory = Object.assign({ width: 20, depth: 14, height: 6 }, doc.factory || {});

  /* ---------------------------------------------------------------- layout → DES input */
  const net = FF.network(doc), B = net.belts;
  // a machine's ONE SIM settings (ONE BUILDER properties: 라인 시뮬레이션 / 시뮬 사이클 / 양품률 / 고장 간격 / 수리 시간)
  const simOf = o => { const p = o.params || {}, s = p.sim || {};
    return { on: p.simOn === 'on' || s.on === true ? true : p.simOn === 'off' || s.on === false ? false : null,
      ct: +(p.simCt || s.ct || 0), ok: +(p.simOk ?? s.ok ?? 100), mtbf: +(p.simMtbf || s.mtbf || 0), mttr: +(p.simMttr || s.mttr || 0), cv: +(s.cv || 0), look: p.simLook || s.look || '' }; };
  const isStation = o => {
    const sim = simOf(o);
    if (sim.on === false) return false;
    if (sim.on === true) return true;
    if (o.type === 'mine') return (o.params && o.params.kind) !== 'storage';
    if (o.type === 'bench' || o.type === 'robot') return true;
    if (o.type === 'ufmodel') { const p = o.params || {}; if (p.items || p.model === 'e3_egr_module_line') return false; return MACHINE_CATS.includes(FU ? FU.catOf(p.model) : ''); }
    return false;
  };
  const ctOf = o => { const p = o.params || {}, s = simOf(o);
    if (s.ct > 0) return s.ct;
    if (o.type === 'mine' && p.ct > 0) return +p.ct;
    const c = FE.cycleSeconds(o); return c > 0 ? c : 12; };
  // distance from a world point to an object's footprint rectangle (0 inside)
  function rectDist(o, x, z) {
    let fp; try { fp = FE.footprint(o, doc.factory); } catch (e) { fp = [1, 1]; }
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), dx = x - o.x, dz = z - o.z;
    const lx = c * dx - s * dz, lz = s * dx + c * dz; // into the object's frame (three.js yaw)
    return Math.hypot(Math.max(0, Math.abs(lx) - fp[0] / 2), Math.max(0, Math.abs(lz) - fp[1] / 2));
  }
  const stationsIn = [], objOf = new Map(), warnIn = [], farOff = [], ROBOT = new Set(), LOOK_AFTER = new Map();
  for (const o of doc.objects) {
    if (!isStation(o)) continue;
    let best = null;
    for (const b of B) {
      const n = Math.max(8, Math.ceil(b.len / 0.05));
      for (let i = 0; i <= n; i++) { const sb = b.len * i / n, q = b.at(sb), d = rectDist(o, q[0], q[1]); if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && Math.hypot(q[0] - o.x, q[1] - o.z) < best.c)) best = { b, s: sb, d, c: Math.hypot(q[0] - o.x, q[1] - o.z) }; }
    }
    // a machine must stand at the belt (35 cm); a robot only needs to reach it
    const isRobot = o.type === 'robot' || (o.type === 'ufmodel' && FU && FU.catOf((o.params || {}).model) === '로봇');
    const cat = o.type === 'ufmodel' && FU && FU.CATALOG ? FU.CATALOG[(FU.ALIAS || {})[(o.params || {}).model] || (o.params || {}).model] : null;
    const reach = isRobot ? Math.max(0.35, (o.type === 'robot' ? +((o.params || {}).reach ?? 1.3) : cat && cat.spec && cat.spec.reach ? cat.spec.reach / 1000 : 1.0) - 0.15) : 0.35;
    if (!best || best.d > reach + (best.b.w || 0.6) / 2) { farOff.push(o.name || '설비'); continue; }
    // the station point: the belt point closest to the machine's centre within the stretch it covers
    let s0 = best.s, cbest = Infinity; const n = Math.max(8, Math.ceil(best.b.len / 0.05));
    for (let i = 0; i <= n; i++) { const sb = best.b.len * i / n, q = best.b.at(sb); if (rectDist(o, q[0], q[1]) <= best.d + 0.35) { const c = Math.hypot(q[0] - o.x, q[1] - o.z); if (c < cbest) { cbest = c; s0 = sb; } } }
    const sim = simOf(o);
    const st = { id: o.id, name: o.name || '설비', belt: best.b.id, s: +s0.toFixed(3), ct: ctOf(o), equip: o.id };
    if (isRobot) ROBOT.add(o.id);
    if (sim.look) LOOK_AFTER.set(o.id, sim.look === 'box' ? '' : sim.look); // the part looks different after this process
    if (sim.ok > 0 && sim.ok < 100) st.okRate = sim.ok / 100;
    if (sim.mtbf > 0 && sim.mttr > 0) { st.mtbf = sim.mtbf * 60; st.mttr = sim.mttr * 60; }
    st.cv = sim.cv > 0 ? sim.cv : o.type === 'bench' ? 0.12 : 0.04; // hand work varies more than a machine (off with 변동·고장·NG 없이)
    stationsIn.push(st); objOf.set(o.id, o);
  }
  if (farOff.length) warnIn.push(`설비 ${farOff.length}개는 컨베이어에서 떨어져 있어 공정에 넣지 않았습니다 (${farOff.slice(0, 4).join(', ')}${farOff.length > 4 ? ' …' : ''})`);
  if (B.length && !B.some(b => b.p.source)) warnIn.push('"투입"이 켜진 컨베이어가 없어 부품이 들어오지 않습니다');
  const srcBelts = B.filter(b => b.p.source);
  // a belt joining another from the side ends at its edge: the item crosses to the main belt's centre line (transfer)
  const BYID = new Map(B.map(b => [b.id, b]));
  const sideGap = b => { const nb = BYID.get(b.next.id), q = nb.at(b.next.s), e = b.at(b.len); return Math.hypot(q[0] - e[0], q[1] - e[1]); };
  // what each source puts on (js/factory-flow.js itemSpec: carton / tote / part model, length × width × height)
  const SPEC = new Map(srcBelts.map(b => [b.id, FF.itemSpec(b.p, b)]));
  const pitch = Math.max(0.15, ...[...SPEC.values()].map(x => x.size + GAP), 0.45);
  const INPUT = {
    pitch,
    belts: B.map(b => ({ id: b.id, name: b.name || '컨베이어', len: b.len, speed: b.speed, next: b.next ? { id: b.next.id, s: b.next.s, gap: b.next.s > 1e-6 ? sideGap(b) : 0 } : null, source: b.p.source ? { interval: b.p.interval } : null, sink: !!b.p.sink })),
    stations: stationsIn,
  };
  const BELT = new Map(B.map(b => [b.id, b]));
  if (!B.length) { fail('라인에 컨베이어가 없습니다. ONE BUILDER에서 컨베이어를 놓고 한쪽 끝에 "투입", 다른 끝에 "배출"을 켜 주세요.'); return; }

  /* ---------------------------------------------------------------- scene */
  const canvas = $('c'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c0e);
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x202024, 0.55));
  const F = doc.factory, sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(F.width * 0.3, 18, F.depth * 0.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -F.width / 2 - 2, right: F.width / 2 + 2, top: F.depth / 2 + 2, bottom: -F.depth / 2 - 2, near: 1, far: 80 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
  const controls = new THREE.OrbitControls(camera, canvas); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;
  // frame the conveyors (the line), not the whole hall
  const box = new THREE.Box3(); for (const b of B) for (let i = 0; i <= 8; i++) { const q = b.at(b.len * i / 8); box.expandByPoint(new THREE.Vector3(q[0], b.top, q[1])); }
  for (const s of stationsIn) { const o = objOf.get(s.id); box.expandByPoint(new THREE.Vector3(o.x, 0, o.z)); }
  const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), span = Math.max(4, size.x, size.z);
  const VIEWS = { '전체': [[ctr.x, span * 0.75, ctr.z + span * 0.9], [ctr.x, 0.6, ctr.z]] };
  const setView = k => { const [p, t] = VIEWS[k]; camera.position.set(...p); controls.target.set(...t); controls.update(); document.querySelectorAll('#views .chip').forEach(b => b.classList.toggle('on', b.dataset.v === k)); };
  { const b = document.createElement('button'); b.className = 'chip on'; b.dataset.v = '전체'; b.textContent = '전체'; b.onclick = () => setView('전체'); $('views').appendChild(b); }
  setView('전체');
  const resize = () => { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();

  // the layout itself, built by the builder's own element code
  const SKIP = new Set(['route', 'walkroute', 'kpi', 'station']);
  const built = new Map();
  scene.add(FE.buildShell(F));
  const buildObj = o => { if (SKIP.has(o.type) || !FE.TYPES[o.type]) return; const old = built.get(o.id); if (old) scene.remove(old);
    try { const g = FE.build(o, F); g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(g); built.set(o.id, g); } catch (e) { console.warn('build', o.type, e); } };
  for (const o of doc.objects) buildObj(o);
  window.addEventListener('factory-assets-ready', ev => { for (const o of doc.objects) if (built.has(o.id) && JSON.stringify(o.params || {}).includes(ev.detail && ev.detail.id)) buildObj(o); });

  /* ---------------------------------------------------------------- the simulation */
  const cfg = { seed: 1, horizon: 8 * 3600, deterministic: false, stations: undefined };
  let L = null, sim = null, simT = 0, playing = false, speed = 5, lastResult = null, exitsT = [], views = new Map();
  const LABEL = {}; // station id → S1, S2 … in flow order
  const ITEM0 = SPEC.values().next().value || { size: 0.4, w: 0.4, h: 0.24, look: '' };
  const specOfPart = p => { const pt = L.points[p.src]; return Object.assign({}, (pt && SPEC.get(pt.belt)) || ITEM0); };
  // a process that changes the look: same length; a box look keeps the size it had
  const BW = Math.max(...B.map(b => b.w || 0.6));
  const changeLook = (spec, look) => FF.itemSpec({ item: spec.size, itemLook: look, itemW: spec.w, itemH: spec.h, width: BW }, null);
  const ROBOTS = new Map(); // station id → robot rig (js/sim-robot.js), or { why } when it cannot pick here

  const newSim = () => {
    L = E.buildLayoutLine(INPUT, { stations: cfg.stations, deterministic: cfg.deterministic });
    sim = new E.LineSim(L.model, { seed: cfg.seed, log: true });
    simT = 0; exitsT = []; for (const v of views.values()) scene.remove(v.mesh); views = new Map();
    L.stations.forEach((s, i) => { LABEL[s.id] = 'S' + (i + 1); });
    $('log').innerHTML = ''; buildRows(); showWarnings();
    $('seek').max = cfg.horizon; $('horizonL').textContent = (cfg.horizon / 3600) + ' h';
  };
  const advance = t => { t = Math.min(t, cfg.horizon); sim.run(t); simT = t; consumeLog(); };

  /* ---- where an item is: (path key, distance along it) ---- */
  const pathOf = key => L.paths[key];
  // a point of the network: on a belt, or (s past a side-joining belt's end) on the transfer onto the main belt
  function posOn(beltId, s) {
    const b = BELT.get(beltId);
    if (s > b.len + 1e-6 && b.next && b.next.s > 1e-6) {
      const nb = BELT.get(b.next.id), e = b.at(b.len), q = nb.at(b.next.s), g = Math.max(1e-6, sideGap(b)), f = Math.min(1, (s - b.len) / g);
      return [e[0] + (q[0] - e[0]) * f, e[1] + (q[1] - e[1]) * f, e[2], b.top + (nb.top - b.top) * f];
    }
    const q = b.at(s); return [q[0], q[1], q[2], b.top];
  }
  const nextOf = id => L.model.routes.find(r => r.from === id)?.to;
  const stationOf = id => L.stations.find(s => s.id === id) || L.gates.find(g => g.id === id);
  // distance travelled along a path in time dt (pieces may be on belts of different speed)
  function distAt(path, dt) { let d = 0; for (const p of path.pieces) { const len = p.s1 - p.s0, v = BELT.get(p.belt).speed, tt = len / v; if (dt <= tt) return d + dt * v; d += len; dt -= tt; } return path.len; }
  function speedAt(path, d) { let acc = 0; for (const p of path.pieces) { const len = p.s1 - p.s0; if (d <= acc + len + 1e-9) return BELT.get(p.belt).speed; acc += len; } return path.speedEnd; }
  function beltPoint(path, d) { let acc = 0; for (const p of path.pieces) { const len = p.s1 - p.s0; if (d <= acc + len + 1e-9) return { belt: p.belt, s: p.s0 + Math.max(0, d - acc) }; acc += len; } const p = path.pieces[path.pieces.length - 1]; return { belt: p.belt, s: p.s1 }; }
  function target(p, s, t, v) {
    const at = p.at, st = s.stations[at];
    if (st) { // at a station (or merge gate): arriving along the stretch it came by, then standing at its point
      const gate = L.gates.find(g => g.id === at);
      const key = gate && gate.into.includes(p.prev) ? p.prev : L.into[at], path = pathOf(key), sp = path.speedEnd;
      return { key, d: t < st.arriveAt - 1e-6 ? Math.max(0, path.len - (st.arriveAt - t) * sp) : path.len, at };
    }
    const path = pathOf(at); if (!path) return null; // a part still in the source queue: not on the line yet
    const list = s.buffers[at] || [], i = Math.max(0, list.indexOf(p.id)), nx = nextOf(at), ns = s.stations[nx];
    const free = distAt(path, t - p.enteredAt);
    let cap = path.len;
    if (ns) { // a station ahead: wait one item apart in front of it; a free stop takes the next item only after its turnover
      const occupied = i > 0 || ns.part !== null || ns.state !== 'idle';
      const turn = (stationOf(nx)?.turnover) || 0;
      cap = occupied ? path.len - pitch * (i + (ns.part !== null || ns.state !== 'idle' ? 1 : 0)) : path.len - Math.max(0, ns.since + turn - t) * path.speedEnd;
      if (occupied && i === 0 && ns.part === null && ns.state === 'idle') cap = path.len - pitch; // (held by the turnover)
    } else if (nx && !nx.startsWith('OUT')) cap = path.len - pitch * i; // a merge point ahead: queue back from it
    return { key: at, d: Math.max(0, Math.min(free, cap)), at };
  }

  /* ---- one frame ---- */
  function frame(dt) {
    const s = sim.snapshot(), t = s.t, seen = new Set();
    for (const p of s.parts) {
      let v = views.get(p.id);
      const tg = target(p, s, t, v); if (!tg) continue;
      if (!v) { const spec = specOfPart(p), mesh = FF.itemMesh(spec); scene.add(mesh); v = { mesh, spec, key: tg.key, d: tg.d, p, lastAt: p.at }; views.set(p.id, v); }
      // leaving a process that changes the part: from here on it looks like what the process made
      if (v.lastAt !== p.at) { const nl = LOOK_AFTER.get(v.lastAt); if (nl !== undefined && nl !== v.spec.look) { v.spec = changeLook(v.spec, nl); scene.remove(v.mesh); v.mesh = FF.itemMesh(v.spec); scene.add(v.mesh); } v.lastAt = p.at; }
      if (v.mesh.userData.pending && FF.lookReady(v.spec.look)) { scene.remove(v.mesh); v.mesh = FF.itemMesh(v.spec); scene.add(v.mesh); } // its model has loaded
      v.p = p; v.tg = tg; seen.add(p.id);
      const snap = dt > 30;
      if (snap) { v.key = tg.key; v.d = tg.d; continue; }
      // move toward the target along the network at belt speed: finish the old stretch first, never go back
      let budget = dt;
      for (let k = 0; k < 4 && budget > 1e-9; k++) {
        const path = pathOf(v.key), goal = v.key === tg.key ? tg.d : path.len;
        if (goal > v.d) { const sp = speedAt(path, v.d), step = Math.min(goal - v.d, sp * budget * 1.25); v.d += step; budget -= step / (sp * 1.25); }
        if (v.key === tg.key || v.d < path.len - 1e-6) break;
        v.key = tg.key; v.d = 0; // the next stretch starts where this one ended
      }
    }
    for (const [id, v] of views) if (!seen.has(id)) { scene.remove(v.mesh); views.delete(id); } // taken off at the 배출 end
    // keep one item apart on every belt (front first); across a belt join / merge point too
    const onBelt = new Map();
    for (const v of views.values()) { const bp = beltPoint(pathOf(v.key), v.d); v.bp = bp; (onBelt.get(bp.belt) ?? onBelt.set(bp.belt, []).get(bp.belt)).push(v); }
    for (const [bid, list] of onBelt) list.sort((a, b) => b.bp.s - a.bp.s);
    for (const [bid, list] of onBelt) {
      const b = BELT.get(bid);
      for (let i = 0; i < list.length; i++) {
        const v = list[i]; let limit = Infinity;
        if (i > 0) limit = list[i - 1].bp.s - pitch;
        else if (b.next && b.next.s <= 1e-6) { const nb = onBelt.get(b.next.id) || []; for (const w of nb) { const gap = b.len - v.bp.s + Math.abs(w.bp.s - b.next.s); if (gap < pitch && w.bp.s >= b.next.s - 1e-6) limit = Math.min(limit, b.len - (pitch - Math.abs(w.bp.s - b.next.s))); } }
        if (v.bp.s > limit + 1e-6) { const back = v.bp.s - Math.max(limit, v.prevS ?? -Infinity); if (back > 0 && v.prevS !== undefined && v.prevKey === v.key) { v.d = Math.max(v.prevD, v.d - back); v.bp = beltPoint(pathOf(v.key), v.d); } }
      }
    }
    for (const v of views.values()) {
      const q = posOn(v.bp.belt, v.bp.s);
      v.mesh.position.set(q[0], q[3] + v.spec.h / 2 + 0.005, q[1]); v.mesh.rotation.y = q[2]; v.carried = false;
      if (v.mesh.userData.ng) v.mesh.userData.ng.visible = !!v.p.ng;
      v.prevKey = v.key; v.prevD = v.d; v.prevS = v.bp.s;
    }
    // robots: pick the part off the stop, take it to the work position, hold it for the process, put it back
    for (const st of L.stations) {
      if (!ROBOT.has(st.id)) continue;
      const g = built.get(st.id); if (!g) continue;
      let R = ROBOTS.get(st.id);
      if (R && R.g !== g) R = null; // the model was rebuilt (loaded)
      if (!R) {
        const pt = L.points[st.id], q = posOn(pt.belt, pt.s), spec = ITEM0, ya = q[2];
        R = window.SimRobot ? window.SimRobot.rig(g, { pick: new THREE.Vector3(q[0], q[3] + spec.h / 2 + 0.005, q[1]), along: new THREE.Vector3(Math.cos(ya), 0, -Math.sin(ya)), width: spec.w, height: spec.h }) : { why: 'joints' };
        R.g = g; ROBOTS.set(st.id, R);
        if (R.why === 'reach') { warnIn.push(`${st.name}: 로봇 팔이 정지 위치까지 닿지 않아 집기 동작 없이 돌립니다 (컨베이어에 더 가깝게 놓거나 높이를 올리세요)`); showWarnings(); }
        if (R.home) R.home();
      }
      if (!R.pose) continue;
      const ss = s.stations[st.id];
      if (ss && ss.part !== null && (ss.state === 'busy' || ss.state === 'down') && t >= ss.arriveAt - 1e-9 && ss.mode !== 'empty') {
        const r = R.pose(ss.progress * ss.ct, ss.ct), v = views.get(ss.part);
        if (r.carry && v) { const tp = R.tip(); v.mesh.position.copy(tp); v.carried = true; }
      } else R.home();
    }
    // machines work only while their station has an item in work
    for (const st of L.stations) {
      const o = objOf.get(st.id), g = built.get(st.id); if (!o || !g) continue;
      if (ROBOTS.get(st.id)?.pose) continue; // moved above
      const ss = s.stations[st.id]; const busy = ss && ss.state === 'busy' && ss.part !== null && t >= ss.arriveAt;
      const c = Math.max(1, FE.cycleSeconds(o) || st.ct);
      if (busy) { g.userData.simT = ss.progress * c; } else if (g.userData.simT === undefined) g.userData.simT = 0;
      try { FE.animate(o, g, g.userData.simT); } catch (e) { /* static model */ }
    }
    // conveyors turn at their own speed
    for (const b of B) { const g = built.get(b.id); if (g) try { FE.animate(b.o, g, t); } catch (e) {} }
  }

  /* ---- log → event list ---- */
  const NAME = id => (L.stations.find(s => s.id === id)?.name) || id;
  const hhmmss = t => { t = Math.floor(t); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  function consumeLog() {
    const Lg = sim.log; if (!Lg.length) return;
    for (const e of Lg) {
      if (e.kind === 'exit') exitsT.push(e.t);
      if (e.kind === 'fail') addLog(e.t, 'fail', `${LABEL[e.node] || ''} ${NAME(e.node)} 고장`);
      else if (e.kind === 'repair') addLog(e.t, 'repair', `${LABEL[e.node] || ''} ${NAME(e.node)} 복구`);
      else if (e.kind === 'ng') addLog(e.t, 'reject', `NG 부품 배출 (${e.node})`);
    }
    Lg.length = 0;
  }
  function addLog(t, kind, text) {
    const d = document.createElement('div'); d.className = 'e-' + kind; d.innerHTML = `<span>${hhmmss(t)}</span><b></b>`; d.querySelector('b').textContent = text;
    const bx = $('log'); bx.prepend(d); while (bx.children.length > 60) bx.lastChild.remove();
  }
  function showWarnings() {
    let w = $('warns'); if (!w) { w = document.createElement('div'); w.id = 'warns'; w.className = 'note'; $('rows').before(w); }
    const all = [...warnIn, ...L.warnings];
    w.innerHTML = (L.stations.length ? '' : '<div style="color:var(--blocked)">컨베이어 옆에 놓인 설비가 없어 공정이 없습니다. 설비를 컨베이어 바로 옆(35 cm 이내)에 놓으세요.</div>') + all.map(x => `<div style="color:var(--blocked)">⚠ ${x.replace(/[<>&]/g, '')}</div>`).join('');
  }

  /* ---------------------------------------------------------------- panel */
  const ROWS = {};
  function buildRows() {
    const bx = $('rows'); bx.innerHTML = '';
    for (const s of L.stations) {
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = `<span class="id"><i></i>${LABEL[s.id]}</span><span><span class="nm"></span><span class="util"><u style="background:var(--busy)"></u><u style="background:var(--blocked)"></u><u style="background:var(--down)"></u><u style="background:var(--setup)"></u></span></span><span class="pc"></span>`;
      r.querySelector('.nm').textContent = `${s.name} · ${s.ct.toFixed(1)} s`; r.onclick = () => focusStation(s.id);
      bx.appendChild(r); ROWS[s.id] = r;
    }
    for (const k of Object.keys(ROWS)) if (!L.stations.some(s => s.id === k)) delete ROWS[k];
  }
  function stationXZ(id) { const pt = L.points[id], q = posOn(pt.belt, pt.s); return [q[0], q[3], q[1]]; }
  function focusStation(id) { const [x, y, z] = stationXZ(id); camera.position.set(x + 1.2, y + 2.4, z + 3.2); controls.target.set(x, y, z); controls.update(); document.querySelectorAll('#views .chip').forEach(b => b.classList.remove('on')); }
  function updatePanel() {
    const r = sim.result(); lastResult = r; const h = Math.max(1e-6, simT / 3600);
    $('kOut').textContent = r.produced; $('kRate').textContent = simT > 600 ? (r.produced / h).toFixed(1) : '–';
    const lastH = exitsT.filter(x => x > simT - 3600).length; $('kRate1').textContent = simT >= 3600 ? `최근 1시간 ${lastH}` : '최근 1시간 –';
    $('kLt').textContent = r.leadTime.n ? (r.leadTime.mean / 60).toFixed(1) + ' 분' : '–';
    $('kWip').textContent = r.wipNow; $('kNg').textContent = r.scrapped;
    const cap = E.layoutCapacity(L); $('kPal').textContent = Number.isFinite(cap.perHour) ? cap.perHour.toFixed(1) : '–';
    $('kpiNote').textContent = (simT / 3600).toFixed(1) + '시간 경과';
    const bn = simT > 300 && r.bottleneck && stationOf(r.bottleneck) ? r.bottleneck : null;
    if (bn) { const st = r.stations[bn]; $('bnName').textContent = `${LABEL[bn]} ${st.name}`; $('bnWhy').textContent = `가동 ${(st.busy * 100).toFixed(0)}% · 막힘 ${(st.blocked * 100).toFixed(0)}% · 고장 ${(st.down * 100).toFixed(0)}% — 가장 바쁜 공정`; }
    else if (simT > 300 && cap.limit === 'supply') { $('bnName').textContent = '투입 간격'; $('bnWhy').textContent = `투입이 시간당 ${cap.supply.perHour.toFixed(1)}개라 공정보다 느립니다`; }
    else { $('bnName').textContent = '–'; $('bnWhy').textContent = '5분 이상 실행하면 표시됩니다'; }
    for (const [id, row] of Object.entries(ROWS)) {
      const st = r.stations[id]; if (!st) continue; const u = row.querySelectorAll('u');
      u[0].style.width = (st.busy * 100) + '%'; u[1].style.width = (st.blocked * 100) + '%'; u[2].style.width = (st.down * 100) + '%'; u[3].style.width = (st.setup * 100) + '%';
      row.querySelector('.pc').textContent = (st.busy * 100).toFixed(0) + '%';
      row.querySelector('.id i').className = 'st-' + st.state; row.classList.toggle('bn', id === bn);
    }
  }
  const TAGS = {}, v3 = new THREE.Vector3();
  function buildTags() { const bx = $('tags'); bx.innerHTML = ''; for (const k of Object.keys(TAGS)) delete TAGS[k];
    for (const s of L.stations) { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = `<i></i>${LABEL[s.id]}`; d.title = s.name; bx.appendChild(d); TAGS[s.id] = d; } }
  function updateTags() {
    const r = canvas.getBoundingClientRect(), s = sim.snapshot(), bn = lastResult && simT > 300 ? lastResult.bottleneck : null;
    for (const [id, d] of Object.entries(TAGS)) {
      const [x, y, z] = stationXZ(id); v3.set(x, y + 1.1, z).project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05; d.style.display = vis ? '' : 'none'; if (!vis) continue;
      d.style.left = ((v3.x + 1) / 2 * r.width) + 'px'; d.style.top = ((1 - v3.y) / 2 * r.height) + 'px';
      d.querySelector('i').className = 'st-' + (s.states[id] || 'idle'); d.classList.toggle('bn', id === bn);
      d.title = `${LABEL[id]} ${NAME(id)} · ${STATE_KO[s.states[id]] || ''}`;
    }
  }

  /* ---------------------------------------------------------------- page text for a BUILDER line */
  $('pal').closest('.form').querySelectorAll('span')[0].hidden = true; $('pal').hidden = true; $('palO').hidden = true;
  $('kPal').nextElementSibling.textContent = '손계산 상한 (개/h)';
  $('kLt').nextElementSibling.textContent = '리드타임 (투입→배출)';
  { const leads = document.querySelectorAll('.lead');
    if (leads[0]) leads[0].textContent = '두 안을 같은 난수 시드로 여러 번 돌려 평균과 95% 신뢰구간을 냅니다. 같은 시드를 쓰므로 차이는 조건을 바꾼 효과만 남고, 판정은 시드별 차이로 합니다. 손계산 상한(가장 느린 공정, 투입 간격)도 함께 보여 줍니다.';
    if (leads[1]) leads[1].textContent = '느린 공정의 사이클 단축 조합을 찾습니다. 점수 = 시간당 생산 − 투자 비용(시간당 생산으로 환산)입니다. 세대마다 후보 전체를 시뮬레이션하고, 가장 좋은 안이 어떻게 좋아지는지 보여 줍니다.'; }
  document.querySelector('.crumb').textContent = `ONE BUILDER 라인 · 컨베이어 ${B.length}개 · 공정 ${stationsIn.length}개 · DES 실행`;
  { const back = document.querySelector('.back'); back.href = 'console.html?resume=1'; back.textContent = '← ONE BUILDER'; } // back to the same layout
  document.querySelector('aside .note').textContent = '컨베이어 옆에 놓인 설비가 공정이 됩니다. 사이클·양품률·고장은 ONE BUILDER의 설비 속성(라인 시뮬레이션)에서 바꿉니다. 사이클은 사람 작업 ±12%, 설비 ±4%로 흔들립니다. 같은 시드는 항상 같은 결과를 냅니다.';

  /* ---------------------------------------------------------------- transport */
  const SPEEDS = [1, 2, 5, 10, 30, 60];
  for (const x of SPEEDS) { const b = document.createElement('button'); b.textContent = x + '×'; b.onclick = () => { speed = x; document.querySelectorAll('#speeds button').forEach(q => q.classList.toggle('on', q === b)); }; if (x === speed) b.classList.add('on'); $('speeds').appendChild(b); }
  const setPlaying = on => { playing = on; $('play').textContent = on ? '❚❚' : '▶'; };
  $('play').onclick = () => setPlaying(!playing);
  window.addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); } });
  let seeking = false;
  $('seek').addEventListener('input', () => { seeking = true; $('clock').textContent = hhmmss(+$('seek').value); });
  $('seek').addEventListener('change', () => { seekTo(+$('seek').value); seeking = false; });
  function seekTo(t) { const was = playing; setPlaying(false); newSim(); advance(t); frame(31); updatePanel(); setPlaying(was); }
  const bindRange = (id, out, fmt, set) => { const el = $(id); const f = () => { $(out).textContent = fmt(+el.value); }; el.oninput = f; f(); return () => set(+el.value); };
  const getSeed = bindRange('seed', 'seedO', v => v, v => (cfg.seed = v)), getHor = bindRange('hor', 'horO', v => v + ' h', v => (cfg.horizon = v * 3600));
  $('apply').onclick = () => { $('scn').hidden = true; cfg.stations = undefined; getSeed(); getHor(); cfg.deterministic = $('det').checked; newSim(); buildTags(); frame(31); updatePanel(); setPlaying(true); };
  function load(params, label) {
    cfg.stations = params.stations && Object.keys(params.stations).length ? params.stations : undefined; cfg.deterministic = !!params.deterministic; $('det').checked = cfg.deterministic;
    $('scn').textContent = label || ''; $('scn').hidden = !label;
    newSim(); buildTags(); frame(31); updatePanel(); setPlaying(true);
  }

  // no-magic audit (same contract as the demo view): items closer than one item on a belt, and moves without the motion behind them
  function audit(t0, t1, dt = 0.1) {
    seekTo(t0); setPlaying(false);
    const out = { overlaps: [], jumps: [], frames: 0, carried: 0 }, prev = new Map();
    for (let t = t0 + dt; t <= t1 + 1e-9; t += dt) {
      advance(t); frame(dt); out.frames++; if ([...views.values()].some(v => v.carried)) out.carried++;
      const list = [...views.entries()];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i][1].mesh.position, b = list[j][1].mesh.position;
        if (a.distanceTo(b) < pitch - GAP - 0.01) out.overlaps.push({ t: +t.toFixed(2), a: list[i][0], b: list[j][0], d: +a.distanceTo(b).toFixed(3) });
      }
      for (const [id, v] of list) { const q = prev.get(id); const maxStep = (v.carried || v.wasCarried ? 2.5 : Math.max(...B.map(b => b.speed)) * 1.3) * dt + 0.006; v.wasCarried = v.carried; // in the gripper: the robot's speed
        if (q && q.distanceTo(v.mesh.position) > maxStep) out.jumps.push({ t: +t.toFixed(2), id, d: +q.distanceTo(v.mesh.position).toFixed(3) });
        prev.set(id, v.mesh.position.clone()); }
      for (const id of [...prev.keys()]) if (!views.has(id)) prev.delete(id);
    }
    return { frames: out.frames, carried: out.carried, overlaps: out.overlaps.length, firstOverlaps: out.overlaps.slice(0, 8), jumps: out.jumps.length, firstJumps: out.jumps.slice(0, 8) };
  }

  /* ---------------------------------------------------------------- the line for the compare / optimise pages */
  window.ONE_LINE = {
    kind: 'layout',
    stations: () => E.buildLayoutLine(INPUT).stations.map(s => ({ ...s, label: LABEL[s.id] || s.id })),
    build: p => E.buildLayoutLine(INPUT, p).model,
    capacity: p => E.layoutCapacity(E.buildLayoutLine(INPUT, Object.assign({}, p, { deterministic: true }))),
    label: id => LABEL[id] || id,
  };

  /* ---------------------------------------------------------------- run */
  newSim(); buildTags(); frame(31); updatePanel();
  $('loading').hidden = true; setPlaying(true);
  let last = performance.now(), panelAt = 0;
  const loop = now => {
    const dtw = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (playing && !seeking && simT < cfg.horizon) { const dt = dtw * speed; advance(simT + dt); frame(dt); if (simT >= cfg.horizon) setPlaying(false); }
    if (now - panelAt > 400) { updatePanel(); panelAt = now; if (!seeking) $('seek').value = simT; }
    if (!seeking) $('clock').textContent = hhmmss(simT);
    updateTags(); controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.ONE_SIM = { audit, load, get sim() { return sim; }, get views() { return views; }, get built() { return built; }, robots: ROBOTS, camera, controls, get line() { return L; }, get t() { return simT; }, cfg, seekTo, setPlaying, frame: dt => frame(dt), advance, input: INPUT };
})();
