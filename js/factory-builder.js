// Console 1 factory builder. The factory document is { factory: {width, depth, height}, objects: [...] }:
// building elements (js/factory-elements.js: column, wall, door, stairs, walkway, zone) and 원스테이션 셀
// equipment, each { id, type, name, x, z, rot, params }. Objects are placed from the palette (click, then
// click the floor, or drag onto the floor), selected by clicking or from the object list, moved/rotated
// with a gizmo (grid snap), duplicated, deleted, and undone. The right column shows the selected object's
// own settings; for a station cell that is console 1's product / parameter / dispense-point panel plus its
// internal equipment layout. console.html simulates one cell at a time (the selected one, "active"); the
// other cells show a still copy built with their own settings. js/console-save.js records every cell
// (js/station-export.js) and saves the document with the factory.
(function () {
  const TC_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/TransformControls.js';
  const STORE = 'one-station-factory-v2', OLD_STORE = 'one-station-layout-v1';
  const FACTORY_DEFAULT = { width: 20, depth: 14, height: 6 };
  const TABLE_Y = 0.85, BASE_Y = 0.95, CELL_FOOT = [2.8, 2.4];
  const ZMIN = -1.25, ZMAX = 0.7, XMIN = -2.4, XMAX = 2.4; // equipment limits inside a cell (enclosure z span)
  const INNER = {
    positioner: { label: '2축 포지셔너', axes: 'xz', at: L => [L.positioner.x, TABLE_Y + 0.4, L.positioner.z] },
    r2: { label: '도포 로봇 R2', axes: 'xz', at: L => [L.r2.x, BASE_Y + 0.35, L.r2.z] },
    dmc: { label: 'DMC 리더', axes: 'xz', at: L => [L.dmc.x, TABLE_Y + 0.4, L.dmc.z] },
    scale: { label: '정밀 저울', axes: 'xz', at: L => [L.scale.x, TABLE_Y + 0.12, L.scale.z] },
    jig: { label: '지그 열', axes: 'z', at: L => [0, TABLE_Y + 0.06, L.jig.z] },
    rail: { label: 'R1 레일', axes: 'z', at: L => [0, TABLE_Y + 0.06, L.rail.z] }
  };
  const PALETTE = [
    ['건물', [['column', '기둥'], ['wall', '벽'], ['door', '출입문'], ['stairs', '계단']]],
    ['동선 · 구역', [['walkway', '보행로'], ['zone', '구역']]],
    ['AMR 경로 · 작업자', [['route', 'AMR 경로'], ['worker', '작업자']]],
    ['설비', [['station', '원스테이션 셀'], ['conveyor', '컨베이어'], ['robot', '로봇'], ['rack', '랙 · 버퍼'], ['amr', 'AMR'], ['charger', '충전소']]]
  ];
  const TYPE_LABEL = { station: '원스테이션 셀', column: '기둥', wall: '벽', door: '출입문', stairs: '계단', walkway: '보행로', zone: '구역', conveyor: '컨베이어', robot: '로봇', rack: '랙 · 버퍼', amr: 'AMR', charger: '충전소', route: '경로', worker: '작업자' };
  const EQUIPMENT = ['station', 'conveyor', 'robot', 'rack', 'amr', 'charger'];
  // automatic names: walkways and zones get letters (보행로 A, B, …), everything else numbers (컨베이어 1, 2, …);
  // numbering continues after the highest existing name of that type, so a deleted number is not reused
  const LETTERED = ['walkway', 'zone', 'route'];
  const FM = () => window.FactoryMotion;
  const toLetters = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const fromLetters = s => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  function nextName(type) {
    const base = TYPE_LABEL[type], re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (LETTERED.includes(type) ? ' ([A-Z]+)$' : ' (\\d+)$'));
    let hi = -1;
    for (const o of doc.objects) { if (o.type !== type) continue; const m = re.exec(o.name); if (m) hi = Math.max(hi, LETTERED.includes(type) ? fromLetters(m[1]) : +m[1] - 1); }
    return `${base} ${LETTERED.includes(type) ? toLetters(hi + 1) : hi + 2}`;
  }
  // walkways and zones show their name on the floor
  const syncLabel = o => { if (LETTERED.includes(o.type)) { o.params = Object.assign(window.FactoryElements.defaults(o.type, doc.factory), o.params || {}); o.params.label = o.name; } };
  const FIELDS = { // building element settings: key, label, step, min, max
    column: [['w', '가로 (m)', 0.1, 0.1, 3], ['d', '세로 (m)', 0.1, 0.1, 3], ['h', '높이 (m, 0 = 천장)', 0.5, 0, 30]],
    wall: [['length', '길이 (m)', 0.5, 0.2, 200], ['thickness', '두께 (m)', 0.05, 0.05, 1], ['h', '높이 (m, 0 = 천장)', 0.5, 0, 30]],
    door: [['width', '폭 (m)', 0.1, 0.6, 8], ['height', '높이 (m)', 0.1, 1.8, 8], ['thickness', '벽 두께 (m)', 0.05, 0.05, 1]],
    stairs: [['width', '폭 (m)', 0.1, 0.6, 5], ['run', '길이 (m)', 0.1, 0.5, 20], ['height', '높이 (m)', 0.1, 0.3, 15]],
    walkway: [['length', '길이 (m)', 0.5, 0.5, 200], ['width', '폭 (m)', 0.1, 0.6, 6]],
    zone: [['kind', '구역 종류', 'select', [['pickup', '적재 (픽업)'], ['dropoff', '하역'], ['storage', '보관'], ['keepout', '금지 (작업 구역)'], ['none', '일반']]], ['w', '가로 (m)', 0.5, 0.5, 100], ['d', '세로 (m)', 0.5, 0.5, 100], ['color', '색 (비우면 종류 색)', 'color']],
    conveyor: [['kind', '종류', 'select', [['roller', '롤러'], ['belt', '벨트']]], ['dir', '방향', 'select', [['1', '정방향 ▶'], ['-1', '역방향 ◀']]], ['length', '길이 (m)', 0.5, 0.5, 60], ['width', '폭 (m)', 0.05, 0.3, 2], ['height', '높이 (m)', 0.05, 0.3, 1.5], ['speed', '속도 (m/s)', 0.05, 0.05, 3]],
    robot: [['reach', '도달 거리 (m)', 0.1, 0.6, 3], ['pick', '픽 각도 (°)', 15, -180, 180], ['place', '플레이스 각도 (°)', 15, -180, 180], ['cycle', '사이클 (s)', 0.5, 2, 120]],
    rack: [['bays', '베이 수', 1, 1, 30], ['levels', '단 수', 1, 1, 12], ['bayWidth', '베이 폭 (m)', 0.1, 0.6, 4], ['depth', '깊이 (m)', 0.1, 0.4, 2], ['levelHeight', '단 높이 (m)', 0.1, 0.4, 3], ['perSlot', '칸당 적재 수', 1, 1, 6], ['fill', '적재율 (%)', 5, 0, 100]],
    amr: [['from', '출발 지점', 'place'], ['to', '도착 지점', 'place'], ['dwell', '적재 · 하역 시간 (s)', 1, 0, 600], ['speed', '속도 (m/s)', 0.1, 0.2, 3], ['payload', '적재 하중 (kg)', 10, 10, 2000], ['battery', '배터리 (%)', 5, 0, 100], ['length', '길이 (m)', 0.05, 0.4, 2.5], ['width', '폭 (m)', 0.05, 0.3, 2]],
    charger: [['width', '폭 (m)', 0.05, 0.4, 2]],
    worker: [['walkway', '보행로 (왕복)', 'walkway'], ['speed', '보행 속도 (m/s)', 0.1, 0.3, 2.5], ['dwell', '끝에서 작업 시간 (s)', 1, 0, 600]],
    route: []
  };

  const $ = q => document.querySelector(q), $$ = q => [...document.querySelectorAll(q)];
  const S = () => window.__station;
  const busy = () => { const s = S(); return !(s.sim.phase === 'idle' || s.sim.phase === 'done'); };
  const r2 = v => Math.round(v * 100) / 100;
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = t => String(t).replace(/[<>&"]/g, '');
  let seq = 1;
  const newId = () => Date.now().toString(36).slice(-5) + (seq++).toString(36);

  let doc = null, activeId = null, selectedId = null, innerSel = null, snap = true;
  let world = null, shell = null, tc = null, proxy = null, helper = null, ghost = null, placing = null;
  const views = new Map(), snapshots = new Map(), undoStack = [];

  /* ---------- document ---------- */
  const byId = id => doc.objects.find(o => o.id === id);
  const stations = () => doc.objects.filter(o => o.type === 'station');
  function engineCellParams() {
    const s = S(), c = s.cfg, L = s.layoutParams(); delete L.cell;
    return { variant: c.variant, slots: c.slots, beadW: c.beadW, speed: c.speed, tol: c.tol, fault: c.fault, joints: [...c.joints], inner: L };
  }
  function defaultCellParams() { const s = S(); const d = clone(s.LAYOUT_DEFAULT); delete d.cell; return { variant: 'tube', slots: 6, beadW: 2.0, speed: 30, tol: 8, fault: 5, joints: null, inner: d }; }
  function syncActive() { const a = activeId && byId(activeId); if (a && !busy()) a.params = engineCellParams(); }
  // AMR / worker plans and the route graph; recomputed when the document changes
  let motionCache = null, motionKey = '';
  function motion() {
    const key = JSON.stringify(doc.objects.map(o => [o.id, o.type, o.x, o.z, o.rot, o.type === 'station' ? (o.params && o.params.inner) : o.params]));
    if (!motionCache || key !== motionKey) { motionCache = FM().plans(doc); motionKey = key; buildSafetyLayer(); }
    return motionCache;
  }
  function store() { syncActive(); try { localStorage.setItem(STORE, JSON.stringify(doc)); } catch (e) {} }
  function initialDoc() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); if (v && v.objects) return v; } catch (e) {}
    const d = { version: 2, factory: { ...FACTORY_DEFAULT }, objects: [] }, p = defaultCellParams();
    try { // layout editor (phase A) settings become the first cell
      const old = JSON.parse(localStorage.getItem(OLD_STORE) || 'null');
      if (old) { d.factory = { ...FACTORY_DEFAULT, ...old.factory }; for (const k of Object.keys(INNER)) if (old[k]) p.inner[k] = old[k]; d.objects.push({ id: 'c1', type: 'station', name: '원스테이션 셀 1', x: old.cell.x, z: old.cell.z, rot: old.cell.rot || 0, params: p }); }
    } catch (e) {}
    if (!d.objects.length) d.objects.push({ id: 'c1', type: 'station', name: '원스테이션 셀 1', x: 0, z: 0, rot: 0, params: p });
    return d;
  }
  function pushUndo() { syncActive(); undoStack.push(JSON.stringify({ doc, activeId })); if (undoStack.length > 60) undoStack.shift(); }
  function undo() {
    if (busy() || !undoStack.length) return note('되돌릴 작업이 없습니다');
    const st = JSON.parse(undoStack.pop());
    doc = st.doc; rebuildAll(st.activeId); select(null); store(); note('되돌렸습니다');
  }

  /* ---------- engine: the active cell ---------- */
  function applyCellToEngine(o) {
    const s = S(), p = Object.assign(defaultCellParams(), o.params || {}), c = s.cfg;
    c.variant = p.variant; c.slots = p.slots; c.beadW = p.beadW; c.speed = p.speed; c.tol = p.tol; c.fault = p.fault;
    c.joints = new Set(p.joints && p.joints.length ? p.joints : s.VARIANTS[p.variant].joints().map(j => j.id));
    for (const [id, k] of [['#bead', 'beadW'], ['#speed', 'speed'], ['#tol', 'tol'], ['#fault', 'fault']]) { const el = $(id); if (el) el.value = c[k]; }
    s.applyLayout(Object.assign({ cell: { x: o.x, z: o.z, rot: o.rot || 0 } }, p.inner));
    s.CELL.visible = true;
  }
  function snapshotEngine(id) {
    const s = S();
    if (proxy && proxy.parent) proxy.parent.remove(proxy);
    const g = s.CELL.clone(true); g.name = 'snapshot'; g.userData = { objId: id };
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }
  // make o the simulated cell; the previously active cell is frozen into a still copy
  function activate(o) {
    if (!o || o.id === activeId) return true;
    if (busy()) { note('사이클 중에는 다른 셀로 바꿀 수 없습니다', true); return false; }
    const prev = activeId && byId(activeId);
    if (prev) { prev.params = engineCellParams(); const snapG = snapshotEngine(prev.id); setSnapshot(prev.id, snapG); }
    const old = snapshots.get(o.id); if (old) { world.remove(old); snapshots.delete(o.id); }
    activeId = o.id; applyCellToEngine(o);
    return true;
  }
  function setSnapshot(id, g) { const old = snapshots.get(id); if (old) world.remove(old); snapshots.set(id, g); world.add(g); }
  // rebuild everything from the document (load, undo)
  function rebuildAll(preferActive) {
    for (const g of views.values()) world.remove(g); views.clear();
    for (const g of snapshots.values()) world.remove(g); snapshots.clear();
    activeId = null; buildShell();
    doc.objects.filter(o => o.type !== 'station').forEach(buildView);
    const cells = stations();
    if (!cells.length) { S().CELL.visible = false; return; }
    // build each cell once in the engine for its still copy, finish on the preferred active cell
    const last = cells.find(c => c.id === preferActive) || cells[0];
    for (const c of cells) if (c !== last) { activeId = c.id; applyCellToEngine(c); setSnapshot(c.id, snapshotEngine(c.id)); }
    activeId = last.id; applyCellToEngine(last);
  }

  /* ---------- scene: factory shell + building elements ---------- */
  function buildShell() {
    const s = S(), f = doc.factory;
    if (shell) s.scene.remove(shell);
    shell = window.FactoryElements.buildShell(f, { walls: true }); shell.name = 'factory-shell';
    shell.traverse(o => { o.raycast = () => {}; }); // the shell is not pickable
    const floor = shell.getObjectByName('Factory_Floor'); if (floor) floor.visible = false; // console 1 keeps its own floor
    s.scene.add(shell);
    s.floor.geometry.dispose(); s.floor.geometry = new THREE.PlaneGeometry(f.width, f.depth);
    const size = Math.max(f.width, f.depth), gh = new THREE.GridHelper(size, Math.max(1, Math.round(size / 0.5)), 0x2c323b, 0x1b1f25);
    s.grid.geometry.dispose(); s.grid.geometry = gh.geometry;
    s.scene.fog.far = Math.max(24, Math.hypot(f.width, f.depth) * 1.6);
    s.controls.maxDistance = Math.max(9, Math.hypot(f.width, f.depth) * 1.1);
  }
  function buildView(o) {
    const old = views.get(o.id); if (old) world.remove(old);
    const g = window.FactoryElements.build(o, doc.factory); g.userData = { objId: o.id };
    views.set(o.id, g); world.add(g);
    return g;
  }
  const groupOf = id => { const o = byId(id); if (!o) return null; if (o.type === 'station') return id === activeId ? S().CELL : snapshots.get(id); return views.get(id); };
  function clampToFactory(o) {
    const f = doc.factory, hw = f.width / 2 - 0.3, hd = f.depth / 2 - 0.3;
    o.x = r2(Math.min(hw, Math.max(-hw, o.x))); o.z = r2(Math.min(hd, Math.max(-hd, o.z)));
  }
  function placeObjectGroup(o) { const g = groupOf(o.id); if (!g) return; g.position.set(o.x, 0, o.z); g.rotation.set(0, o.rot || 0, 0); g.updateMatrixWorld(true); }

  /* ---------- selection + gizmo ---------- */
  function ensureGizmo() {
    if (tc) return Promise.resolve();
    return new Promise((ok, fail) => {
      if (THREE.TransformControls) return ok();
      const sc = document.createElement('script'); sc.src = TC_URL; sc.onload = ok; sc.onerror = () => fail(new Error('TransformControls could not be loaded')); document.head.appendChild(sc);
    }).then(() => {
      const s = S();
      tc = new THREE.TransformControls(s.camera, s.renderer.domElement);
      tc.setSize(0.8); setSnap(snap);
      tc.addEventListener('dragging-changed', e => { s.controls.enabled = !e.value; if (e.value) pushUndo(); else commitDrag(); });
      tc.addEventListener('objectChange', () => { if (helper) helper.update(); refreshTransformFields(); });
      s.scene.add(tc);
      proxy = new THREE.Object3D(); proxy.name = 'inner-proxy';
      const mk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 32), new THREE.MeshBasicMaterial({ color: 0x00e8d0, transparent: true, opacity: 0.35, depthTest: false }));
      mk.renderOrder = 10; proxy.add(mk);
    });
  }
  function setSnap(on) { snap = on; if (!tc) return; tc.setTranslationSnap(on ? 0.1 : null); tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null); }
  function setMode(m) { if (!tc) return; tc.setMode(m); const rotate = m === 'rotate'; tc.showX = tc.showZ = !rotate; tc.showY = rotate; if (innerSel) { tc.setMode('translate'); tc.showY = false; const a = INNER[innerSel].axes; tc.showX = a.includes('x'); tc.showZ = a.includes('z'); } }
  function select(id, inner) {
    const s = S(); selectedId = id || null; innerSel = null;
    if (helper) { s.scene.remove(helper); helper = null; }
    if (tc) tc.detach();
    if (proxy && proxy.parent) proxy.parent.remove(proxy);
    const o = id && byId(id);
    if (o && o.type === 'station' && !activate(o)) { selectedId = activeId; }
    const g = selectedId && groupOf(selectedId);
    if (g && tc) {
      if (inner && selectedId === activeId && INNER[inner]) {
        innerSel = inner; const L = s.layoutParams(); s.CELL.add(proxy); proxy.position.set(...INNER[inner].at(L)); tc.attach(proxy);
      } else tc.attach(g);
      setMode(tc.mode === 'rotate' && !innerSel ? 'rotate' : 'translate');
      helper = new THREE.BoxHelper(g, 0x00e8d0); s.scene.add(helper);
    }
    renderTree(); renderProps();
  }
  function commitDrag() {
    const s = S(), o = selectedId && byId(selectedId); if (!o) return;
    if (innerSel) {
      const L = s.layoutParams(), p = proxy.position, v = (a, lo, hi) => r2(Math.min(hi, Math.max(lo, a)));
      if (innerSel === 'jig' || innerSel === 'rail') L[innerSel].z = v(p.z, ZMIN, ZMAX); else L[innerSel] = { x: v(p.x, XMIN, XMAX), z: v(p.z, ZMIN, ZMAX) };
      s.applyLayout(L); o.params = engineCellParams(); store(); select(o.id, innerSel); return;
    }
    const g = groupOf(o.id); o.x = g.position.x; o.z = g.position.z; o.rot = r2(g.rotation.y * 1e4) / 1e4; clampToFactory(o); placeObjectGroup(o);
    store(); if (helper) helper.update(); renderProps(); renderTree();
  }
  function onPick(e) {
    if (placing || (tc && tc.dragging)) return;
    const s = S(), el = s.renderer.domElement, r = el.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, s.camera);
    const hits = ray.intersectObjects([world, s.CELL], true).filter(h => h.object.visible && !(proxy && h.object.parent === proxy));
    if (!hits.length) return select(null);
    let n = hits[0].object; while (n && !(n.userData && n.userData.objId) && n !== s.CELL) n = n.parent;
    const id = n === s.CELL ? activeId : n && n.userData.objId;
    if (!id) return select(null);
    // inside the selected active cell: pick its equipment
    if (id === activeId && selectedId === activeId) {
      const p = s.CELL.worldToLocal(hits[0].point.clone()), L = s.layoutParams(); let best = null, bd = 0.35;
      for (const [k, d] of Object.entries(INNER)) { const a = d.at(L), dd = d.axes === 'z' ? Math.abs(p.z - a[2]) + (Math.abs(p.x) > 1.4 ? 1 : 0) : Math.hypot(p.x - a[0], p.z - a[2]); if (dd < bd) { bd = dd; best = k; } }
      if (best) return select(id, best);
    }
    select(id);
  }

  /* ---------- palette: place, duplicate, delete ---------- */
  const floorPoint = e => {
    const s = S(), r = s.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s.camera);
    const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    const st = snap ? 0.1 : 0.01; p.x = Math.round(p.x / st) * st; p.z = Math.round(p.z / st) * st; return p;
  };
  /* ---------- AMR route drawing: click points, double-click / Enter / right-click to finish ---------- */
  let drawing = null; // { obj (when extending), pts: [[x, z]], preview }
  function setRoutePoints(o, pts) {
    o.x = pts[0][0]; o.z = pts[0][1]; o.rot = 0;
    o.params = Object.assign(window.FactoryElements.defaults('route'), o.params || {}, { points: pts.map(([x, z]) => [r2(x - o.x), r2(z - o.z)]) });
    buildView(o);
  }
  function startDrawing(obj) {
    if (busy()) return note('사이클 중에는 그릴 수 없습니다', true);
    cancelPlacing(); placing = 'route';
    drawing = { obj: obj || null, pts: obj ? FM().routePoints(obj) : [], preview: null };
    redrawPreview();
    note('AMR 경로: 바닥을 클릭해 점을 찍습니다. 더블클릭·Enter·오른쪽 클릭으로 완료, Esc로 취소. 작업 구역을 지나는 구간은 놓이지 않습니다.');
  }
  function redrawPreview(cursor) {
    const s = S(); if (drawing.preview) s.scene.remove(drawing.preview);
    const pts = drawing.pts.concat(cursor ? [cursor] : []);
    if (pts.length < 1) { drawing.preview = null; return; }
    const o = { type: 'route', x: pts[0][0], z: pts[0][1], rot: 0, params: { points: pts.map(([x, z]) => [x - pts[0][0], z - pts[0][1]]) } };
    drawing.preview = window.FactoryElements.build(o, doc.factory);
    drawing.preview.traverse(m => { if (m.isMesh) m.raycast = () => {}; });
    s.scene.add(drawing.preview);
  }
  // snap to an existing route point so routes join into one network
  function snapToNode(p) {
    let best = null, bd = 0.3;
    for (const n of motion().G.nodes) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } }
    return best ? [best.x, best.z] : [r2(p.x), r2(p.z)];
  }
  function addDrawPoint(p) {
    const q = snapToNode(p), pts = drawing.pts;
    if (pts.length) {
      const a = pts[pts.length - 1]; if (Math.hypot(q[0] - a[0], q[1] - a[1]) < 0.05) return;
      const bad = FM().keepouts(doc).filter(s => FM().hits(a, q, s));
      if (bad.length) return note(`이 구간은 작업 구역(${bad.map(s => s.name).join(', ')})을 지나서 놓을 수 없습니다`, true);
    }
    pts.push(q); redrawPreview();
  }
  function finishDrawing() {
    const d = drawing; if (!d) return;
    if (d.preview) S().scene.remove(d.preview);
    drawing = null; placing = null;
    if (d.pts.length < 2) { if (!d.obj) note('점이 2개 이상이어야 경로가 됩니다'); return; }
    pushUndo();
    const o = d.obj || { id: newId(), type: 'route', name: nextName('route'), x: 0, z: 0, rot: 0, params: {} };
    if (!d.obj) doc.objects.push(o);
    setRoutePoints(o, d.pts); store(); select(o.id); note(`${o.name}: 점 ${d.pts.length}개`);
  }
  function cancelDrawing() { if (!drawing) return; if (drawing.preview) S().scene.remove(drawing.preview); drawing = null; placing = null; }

  function startPlacing(type) {
    if (type === 'route') return startDrawing(null);
    if (busy()) return note('사이클 중에는 배치할 수 없습니다', true);
    cancelPlacing(); placing = type;
    ghost = type === 'station'
      ? new THREE.Mesh(new THREE.BoxGeometry(CELL_FOOT[0], 2, CELL_FOOT[1]), new THREE.MeshBasicMaterial({ color: 0x00e8d0, transparent: true, opacity: 0.18, depthWrite: false }))
      : window.FactoryElements.build({ type, x: 0, z: 0 }, doc.factory);
    if (type === 'station') ghost.position.y = 1;
    ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = Math.min(0.5, o.material.opacity); o.material.depthWrite = false; o.raycast = () => {}; } });
    ghost.visible = false; S().scene.add(ghost);
    note(`${TYPE_LABEL[type]}: 바닥을 클릭해 놓습니다 (Esc 취소)`);
  }
  function cancelPlacing() { cancelDrawing(); if (ghost) S().scene.remove(ghost); ghost = null; placing = null; }
  function moveGhost(e) { if (drawing) { const p = floorPoint(e); if (p) redrawPreview(snapToNode(p)); return; } if (!ghost) return; const p = floorPoint(e); if (!p) return; ghost.visible = true; ghost.position.x = p.x; ghost.position.z = p.z; }
  function placeAt(type, p) {
    pushUndo();
    const o = { id: newId(), type, name: nextName(type), x: p.x, z: p.z, rot: 0, params: type === 'station' ? defaultCellParams() : window.FactoryElements.defaults(type, doc.factory) };
    syncLabel(o); clampToFactory(o); doc.objects.push(o);
    if (type !== 'station') buildView(o);
    select(o.id); if (type === 'station') placeObjectGroup(o);
    store(); note(`${o.name}을(를) 놓았습니다`);
  }
  function duplicate() {
    const o = selectedId && byId(selectedId); if (!o) return;
    if (busy()) return note('사이클 중에는 복제할 수 없습니다', true);
    syncActive(); pushUndo();
    const c = clone(o); c.id = newId(); c.name = nextName(o.type);
    c.x = o.x + 1; c.z = o.z + 1; syncLabel(c); clampToFactory(c); doc.objects.push(c);
    if (c.type !== 'station') buildView(c);
    select(c.id); if (c.type === 'station') placeObjectGroup(c);
    store(); note(`${c.name}을(를) 만들었습니다`);
  }
  function remove() {
    const o = selectedId && byId(selectedId); if (!o) return;
    if (busy()) return note('사이클 중에는 삭제할 수 없습니다', true);
    pushUndo();
    doc.objects = doc.objects.filter(x => x !== o);
    if (o.type !== 'station') { world.remove(views.get(o.id)); views.delete(o.id); }
    else if (o.id === activeId) {
      activeId = null; const next = stations()[0];
      if (next) { const sg = snapshots.get(next.id); if (sg) { world.remove(sg); snapshots.delete(next.id); } activeId = next.id; applyCellToEngine(next); } else S().CELL.visible = false;
    } else { world.remove(snapshots.get(o.id)); snapshots.delete(o.id); }
    select(null); store(); note(`${o.name}을(를) 삭제했습니다 (Ctrl+Z로 되돌리기)`);
  }

  /* ---------- UI ---------- */
  const css = `
  #fbPanel{position:absolute;left:14px;top:14px;bottom:62px;width:252px;display:flex;flex-direction:column;gap:10px;padding:12px;z-index:5;font-size:12px;overflow:hidden}
  #fbPanel.min{bottom:auto}
  #fbPanel.min .fbBody{display:none}
  #fbPanel .fbHead{display:flex;align-items:center;gap:6px}
  #fbPanel .fbHead b{font-family:var(--mono);letter-spacing:.16em;font-size:11.5px;color:var(--accent);font-weight:600;flex:1}
  #fbPanel .fbBody{display:flex;flex-direction:column;gap:10px;min-height:0;flex:1}
  #fbPanel h4{margin:0;font-size:10.5px;letter-spacing:.14em;font-family:var(--mono);color:var(--mute);font-weight:500}
  #fbPanel .pal{display:flex;flex-wrap:wrap;gap:4px}
  #fbPanel button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:5px 8px;border-radius:3px;cursor:pointer;font:inherit;font-size:11.5px}
  #fbPanel button:hover{border-color:var(--mute)}
  #fbPanel button.on{border-color:var(--accent);color:var(--accent)}
  #fbPanel .pal button[draggable]{cursor:grab}
  #fbPanel .tools{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
  #fbPanel .tools label{display:flex;align-items:center;gap:4px;color:var(--mute);font-size:11px;margin-left:auto}
  #fbTree{flex:1;min-height:60px;overflow:auto;display:grid;align-content:start;gap:2px}
  #fbTree .grp{font-size:10.5px;color:var(--dim);margin:6px 0 2px;font-family:var(--mono);letter-spacing:.1em}
  #fbTree button{display:flex;gap:6px;align-items:center;text-align:left;background:transparent;border:1px solid transparent;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #fbTree button.on{border-color:var(--accent);background:rgba(0,232,208,.06)}
  #fbTree i{font-style:normal;color:var(--dim);font-size:10.5px}
  #fbTree em{font-style:normal;color:var(--accent);font-size:10px;margin-left:auto}
  #fbNote{color:var(--mute);line-height:1.5;min-height:1.5em}
  #fbNote.err{color:var(--warn)}
  .fb-on .view .hud.tl{left:280px}
  .fb-on .view .hud.bl,.fb-on .view .hud.bc{left:280px}
  #fbProps{display:grid;gap:10px}
  #fbProps .row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  #fbProps label{display:grid;gap:3px;color:var(--mute);font-size:11px;min-width:0}
  #fbProps select{width:100%;min-width:0;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:6px 7px;border-radius:3px;font:inherit;font-size:12px}
  #fbProps input{width:100%;min-width:0;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:6px 7px;border-radius:3px;font:inherit;font-family:var(--mono);font-size:12px}
  #fbProps input[type=color]{padding:2px;height:30px}
  #fbProps input:focus{outline:none;border-color:var(--accent)}
  #fbProps input:disabled{opacity:.35}
  #fbProps .acts{display:flex;flex-wrap:wrap;gap:4px}
  #fbProps .acts button,#fbProps .inner button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:5px 8px;border-radius:3px;cursor:pointer;font:inherit;font-size:11.5px}
  #fbProps .inner{display:flex;flex-wrap:wrap;gap:4px}
  #fbProps .inner button.on{border-color:var(--accent);color:var(--accent)}
  #fbProps .kind{font-family:var(--mono);font-size:10.5px;color:var(--accent);letter-spacing:.12em}
  #fbProps .hint{color:var(--dim);font-size:11px;line-height:1.5;margin:0}
  #fbProps .pts{display:grid;gap:3px;max-height:180px;overflow:auto}
  #fbProps .pt{display:grid;grid-template-columns:18px 1fr 1fr 26px;gap:4px;align-items:center;font-family:var(--mono);font-size:11px;color:var(--mute)}
  #fbProps .pt button{background:var(--panel2);border:1px solid var(--line);color:var(--mute);border-radius:3px;cursor:pointer;padding:3px 0}
  #fbSafety{display:grid;gap:3px;font-size:11.5px;line-height:1.45;max-height:110px;overflow:auto}
  #fbSafety .ok{color:var(--ok)}
  #fbSafety .ng{color:var(--ng)}
  #fbPanel button[data-t=play].on{border-color:var(--accent);color:var(--accent)}
  .fb-hide{display:none!important}`;
  let panel, propSec, stationSecs = [], noteT;
  function note(t, warn) { const n = $('#fbNote'); if (!n) return; n.textContent = t; n.classList.toggle('err', !!warn); clearTimeout(noteT); if (!warn) noteT = setTimeout(() => { if (n.textContent === t) n.textContent = ''; }, 6000); }

  function buildPanel() {
    panel = document.createElement('div'); panel.id = 'fbPanel'; panel.className = 'card';
    panel.innerHTML = `
      <div class="fbHead"><b>FACTORY BUILDER</b><button type="button" data-t="min" title="패널 접기">–</button></div>
      <div class="fbBody">
        ${PALETTE.map(([g, items]) => `<h4>${g}</h4><div class="pal">${items.map(([t, l]) => `<button type="button" draggable="true" data-place="${t}">${l}</button>`).join('')}</div>`).join('')}
        <div class="tools">
          <button type="button" data-t="translate" title="이동 (T)">이동</button><button type="button" data-t="rotate" title="회전 (R)">회전</button>
          <button type="button" data-t="dup" title="복제 (Ctrl+D)">복제</button><button type="button" data-t="del" title="삭제 (Del)">삭제</button><button type="button" data-t="undo" title="되돌리기 (Ctrl+Z)">되돌리기</button>
          <label><input type="checkbox" data-t="snap" checked> 스냅</label>
          <button type="button" data-t="play" class="on" title="AMR · 작업자 · 로봇 · 컨베이어 움직임">⏸ 일시정지</button>
        </div>
        <h4>객체 목록</h4>
        <div id="fbTree"></div>
        <h4>안전 경고</h4>
        <div id="fbSafety"><span class="ok">위험 없음</span></div>
        <div id="fbNote"></div>
      </div>`;
    $('.view').appendChild(panel);
    panel.querySelectorAll('[data-place]').forEach(b => {
      b.addEventListener('click', () => startPlacing(b.dataset.place));
      b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', b.dataset.place); startPlacing(b.dataset.place); });
    });
    panel.querySelector('[data-t=min]').onclick = () => { panel.classList.toggle('min'); document.querySelector('.app').classList.toggle('fb-on', !panel.classList.contains('min')); };
    panel.querySelector('[data-t=translate]').onclick = () => setMode('translate');
    panel.querySelector('[data-t=rotate]').onclick = () => setMode('rotate');
    panel.querySelector('[data-t=dup]').onclick = duplicate;
    panel.querySelector('[data-t=del]').onclick = remove;
    panel.querySelector('[data-t=undo]').onclick = undo;
    panel.querySelector('[data-t=snap]').onchange = e => setSnap(e.target.checked);
    panel.querySelector('[data-t=play]').onclick = e => { playing = !playing; e.target.classList.toggle('on', playing); e.target.textContent = playing ? '⏸ 일시정지' : '▶ 재생'; };

    // properties: the selected object's own settings, at the top of the right column
    const scroll = $('.side .scroll');
    stationSecs = [...scroll.querySelectorAll(':scope > .sec')];
    propSec = document.createElement('div'); propSec.className = 'sec'; propSec.id = 'fbProps';
    scroll.prepend(propSec);
  }

  function renderTree() {
    const t = $('#fbTree'); if (!t) return;
    const groups = [['건물', ['column', 'wall', 'door', 'stairs']], ['동선 · 구역', ['walkway', 'zone']], ['AMR 경로 · 작업자', ['route', 'worker']], ['설비', EQUIPMENT]];
    t.innerHTML = `<button type="button" data-id="" class="${selectedId ? '' : 'on'}"><i>공장</i>${doc.factory.width}×${doc.factory.depth}×${doc.factory.height} m</button>` + groups.map(([g, types]) => {
      const list = doc.objects.filter(o => types.includes(o.type));
      return list.length ? `<div class="grp">${g}</div>` + list.map(o => `<button type="button" data-id="${o.id}" class="${o.id === selectedId ? 'on' : ''}"><i>${TYPE_LABEL[o.type]}</i>${esc(o.name)}${o.id === activeId ? '<em>시뮬레이션</em>' : ''}</button>`).join('') : '';
    }).join('');
    t.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => select(b.dataset.id || null)));
  }

  function field(k, label, v, step, min, max) {
    if (step === 'place') step = 'select', min = [['', '— 선택 —']].concat(FM().places(doc, motion().G).map(p => [p.ref, p.label]));
    if (step === 'walkway') step = 'select', min = [['', '정지 (제자리)']].concat(doc.objects.filter(o => o.type === 'walkway').map(o => [o.id, o.name]));
    if (step === 'select') return `<label>${label}<select data-k="${k}">${min.map(([val, l]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    if (step === 'text') return `<label>${label}<input type="text" data-k="${k}" value="${esc(v)}" maxlength="30"></label>`;
    if (step === 'color') return `<label>${label}<input type="color" data-k="${k}" value="${esc(v)}"></label>`;
    return `<label>${label}<input type="number" data-k="${k}" step="${step}" min="${min}" max="${max}" value="${v}"></label>`;
  }
  function renderProps() {
    if (!propSec) return;
    const o = selectedId && byId(selectedId), isCell = o && o.type === 'station';
    stationSecs.forEach(s => s.classList.toggle('fb-hide', !isCell));
    if (!o) {
      const f = doc.factory, n = t => doc.objects.filter(x => x.type === t).length;
      propSec.innerHTML = `<div class="kind">FACTORY</div><h3>공장</h3>
        <div class="row">${field('width', '가로 (m)', f.width, 0.5, 6, 300)}${field('depth', '세로 (m)', f.depth, 0.5, 6, 300)}${field('height', '높이 (m)', f.height, 0.5, 2.5, 40)}</div>
        <p class="hint">셀 ${n('station')} · 컨베이어 ${n('conveyor')} · 로봇 ${n('robot')} · 랙 ${n('rack')} · AMR ${n('amr')} · 충전소 ${n('charger')} · 기둥 ${n('column')} · 벽 ${n('wall')} · 출입문 ${n('door')} · 계단 ${n('stairs')} · 보행로 ${n('walkway')} · 구역 ${n('zone')}<br>왼쪽 팔레트에서 요소를 골라 바닥에 놓고, 객체를 클릭하면 여기에 그 객체의 설정이 나옵니다.</p>`;
      propSec.querySelectorAll('[data-k]').forEach(i => i.addEventListener('change', () => {
        const v = parseFloat(i.value); if (!(v > 0)) return renderProps();
        pushUndo(); doc.factory[i.dataset.k] = Math.min(+i.max, Math.max(+i.min, v));
        buildShell(); doc.objects.forEach(x => { clampToFactory(x); if (x.type !== 'station') buildView(x); placeObjectGroup(x); });
        store(); renderTree(); renderProps();
      }));
      return;
    }
    const deg = Math.round(THREE.MathUtils.radToDeg(o.rot || 0));
    let html = `<div class="kind">${TYPE_LABEL[o.type]}</div>
      <label>이름<input type="text" data-n value="${esc(o.name)}" maxlength="40"></label>
      <div class="row">${field('x', 'X (m)', r2(o.x), 0.1, -999, 999)}${field('z', 'Z (m)', r2(o.z), 0.1, -999, 999)}${field('rot', '회전 (°)', deg, 15, -360, 360)}</div>`;
    if (!isCell) {
      const p = Object.assign(window.FactoryElements.defaults(o.type, doc.factory), o.params || {});
      html += `<div class="row">${FIELDS[o.type].map(([k, l, st, mn, mx]) => field('p.' + k, l, p[k], st, mn, mx)).join('')}</div>`;
      if (o.type === 'rack') html += `<p class="hint">수용량 ${p.bays * p.levels * p.perSlot}개 · 현재 ${Math.round(p.bays * p.levels * p.perSlot * p.fill / 100)}개</p>`;
      if (o.type === 'amr') {
        const pl = motion().amr[o.id];
        html += pl && pl.ok
          ? `<p class="hint">경로 길이 ${pl.length.toFixed(1)} m · 편도 ${pl.oneWay.toFixed(1)} s · 왕복 주기 ${pl.period.toFixed(1)} s (적재·하역 포함). 작업 구역을 지나는 구간은 사용하지 않고 가장 짧은 경로로 다닙니다.</p>`
          : `<p class="hint" style="color:var(--warn)">${pl ? pl.error : '출발 지점과 도착 지점을 고르세요'}</p>`;
      }
      if (o.type === 'worker') html += `<p class="hint" id="fbWorkerSafety">보행로를 고르면 그 보행로 끝에서 끝까지 왕복합니다.</p>`;
      if (o.type === 'route') {
        const pts = FM().routePoints(o), G = motion().G, mine = G.edges.filter(e => e.route === o.id);
        const blocked = mine.filter(e => e.blockedBy.length), cross = mine.filter(e => e.crosses.length);
        html += `<h4 style="margin:4px 0 0">경로 점 (X, Z m)</h4><div class="pts">${pts.map(([x, z], i) => `<div class="pt"><span>${i + 1}</span><input type="number" step="0.1" data-pt="${i}" data-c="0" value="${r2(x)}"><input type="number" step="0.1" data-pt="${i}" data-c="1" value="${r2(z)}"><button type="button" data-ptdel="${i}" title="점 삭제">×</button></div>`).join('')}</div>
          <div class="acts"><button type="button" data-a="extend">점 이어 그리기</button></div>
          <p class="hint" style="${blocked.length ? 'color:var(--warn)' : ''}">${blocked.length ? `막힌 구간 ${blocked.length}개: ${[...new Set(blocked.flatMap(e => e.blockedBy))].join(', ')} — AMR은 이 구간을 쓰지 않습니다 (빨간 표시)` : '작업 구역을 지나는 구간 없음'}${cross.length ? ` · 보행로 교차 ${cross.length}곳 (노란 표시)` : ''}</p>`;
      }
      if (o.type === 'robot') html += '<p class="hint">픽 위치(파랑)에서 집어 플레이스 위치(주황)에 놓는 동작을 반복합니다. 사이클 시간은 시뮬레이션 기준 (콘솔 2의 1x = SIM 4x).</p>';
    } else {
      html += `<h4 style="margin:4px 0 0">셀 내부 배치</h4><div class="inner">${Object.entries(INNER).map(([k, d]) => `<button type="button" data-inner="${k}" class="${innerSel === k ? 'on' : ''}">${d.label}</button>`).join('')}</div>
        <p class="hint">장비를 고른 뒤 3D 화살표를 끌면 이 셀 안에서 옮겨집니다. 아래 제품·파라미터·도포 포인트가 이 셀의 설정이며, 사이클 시작은 이 셀을 시뮬레이션합니다.</p>
        <div class="acts"><button type="button" data-a="check">도달 검사</button><button type="button" data-a="innerReset">셀 내부 기본 배치</button></div>`;
    }
    html += `<div class="acts"><button type="button" data-a="dup">복제</button><button type="button" data-a="del">삭제</button></div>`;
    propSec.innerHTML = html;
    propSec.querySelector('[data-n]').addEventListener('change', e => { pushUndo(); o.name = e.target.value.trim() || o.name; syncLabel(o); if (o.type !== 'station') { buildView(o); select(o.id); } store(); renderTree(); });
    propSec.querySelectorAll('[data-k]').forEach(i => i.addEventListener('change', () => {
      const k = i.dataset.k, raw = i.type === 'number' || (k === 'p.dir') ? parseFloat(i.value) : i.value;
      if (i.type === 'number' && Number.isNaN(raw)) return renderProps();
      pushUndo();
      if (k === 'rot') o.rot = THREE.MathUtils.degToRad(raw);
      else if (k === 'x' || k === 'z') o[k] = raw;
      else { o.params = Object.assign(window.FactoryElements.defaults(o.type, doc.factory), o.params || {}); o.params[k.slice(2)] = i.type === 'number' ? Math.min(+i.max, Math.max(+i.min, raw)) : raw; }
      clampToFactory(o);
      if (o.type !== 'station' && k.startsWith('p.')) buildView(o);
      placeObjectGroup(o); store(); select(o.id, innerSel);
    }));
    propSec.querySelectorAll('[data-inner]').forEach(b => b.addEventListener('click', () => select(o.id, b.dataset.inner)));
    propSec.querySelectorAll('[data-pt]').forEach(i => i.addEventListener('change', () => {
      const v = parseFloat(i.value); if (Number.isNaN(v)) return renderProps();
      const pts = FM().routePoints(o); pts[+i.dataset.pt][+i.dataset.c] = v;
      pushUndo(); setRoutePoints(o, pts); store(); select(o.id);
    }));
    propSec.querySelectorAll('[data-ptdel]').forEach(b => b.addEventListener('click', () => {
      const pts = FM().routePoints(o); if (pts.length <= 2) return note('경로에는 점이 2개 이상 필요합니다', true);
      pts.splice(+b.dataset.ptdel, 1); pushUndo(); setRoutePoints(o, pts); store(); select(o.id);
    }));
    const act = (a, fn) => { const b = propSec.querySelector(`[data-a=${a}]`); if (b) b.onclick = fn; };
    act('dup', duplicate); act('del', remove);
    act('extend', () => startDrawing(o));
    act('check', checkCycle);
    act('innerReset', () => { if (busy()) return; pushUndo(); const L = clone(S().LAYOUT_DEFAULT); L.cell = { x: o.x, z: o.z, rot: o.rot || 0 }; S().applyLayout(L); o.params = engineCellParams(); store(); select(o.id); });
  }
  function refreshTransformFields() {
    if (!propSec || innerSel) return; const g = selectedId && groupOf(selectedId); if (!g) return;
    const set = (k, v) => { const i = propSec.querySelector(`[data-k=${k}]`); if (i && document.activeElement !== i) i.value = v; };
    set('x', r2(g.position.x)); set('z', r2(g.position.z)); set('rot', Math.round(THREE.MathUtils.radToDeg(g.rotation.y)));
  }
  async function checkCycle() {
    if (busy()) return note('사이클 중에는 검사할 수 없습니다', true);
    note('사이클 검사 중… (몇 초 걸립니다)'); await new Promise(r => setTimeout(r, 60));
    try {
      const r = window.StationExport.checkCycle(), tight = r.ikFail > 20;
      note(r.completed ? `사이클 완료 · ${r.cycleTotal.toFixed(1)} s (개당 ${(r.cycleTotal / r.parts).toFixed(1)} s) · 도달 한계 근접 ${r.ikFail}건 (기본 배치 약 4건)${tight ? ' — 로봇이 무리한 자세를 많이 씁니다' : ''}` : `사이클이 끝나지 않습니다 (${r.reason}). 로봇이 닿지 않는 배치일 수 있습니다.`, !r.completed || tight);
    } catch (e) { note('검사 실패: ' + e.message, true); }
  }

  /* ---------- export for 저장: every cell recorded, building elements as geometry ---------- */
  async function exportAll(progress = () => {}) {
    if (busy()) throw new Error('사이클 중에는 저장할 수 없습니다');
    syncActive();
    const cells = [], keep = activeId && byId(activeId), list = stations();
    try {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        progress(`셀 녹화 중 ${i + 1} / ${list.length}: ${c.name}`); await new Promise(r => setTimeout(r, 40));
        applyCellToEngine(c);
        const rec = window.StationExport.recordCell();
        if (!rec) throw new Error(c.name + ' 녹화 실패');
        cells.push({ id: c.id, name: c.name, x: c.x, z: c.z, rot: c.rot || 0, rec });
      }
    } catch (e) { throw new Error((e && e.message) || String(e)); }
    finally { if (keep) applyCellToEngine(keep); else S().CELL.visible = false; }
    progress('모델 만드는 중…'); await new Promise(r => setTimeout(r, 40));
    const SPF = window.StationExport.SIM_PER_FRAME, FE = window.FactoryElements;
    const others = doc.objects.filter(o => o.type !== 'station');
    // the recording spans the longest cell cycle (or one robot cycle when there are no cells)
    const M = FM().plans(doc), loops = Object.values(M.amr).concat(Object.values(M.worker)).filter(p => p.ok && !p.still).map(p => p.period);
    const frames = Math.min(Math.ceil(3600 / SPF), cells.length ? Math.max(...cells.map(c => c.rec.info.frames)) : Math.max(1, ...others.map(o => Math.ceil(FE.cycleSeconds(o) / SPF)), ...loops.map(p => Math.ceil(p / SPF))));
    const building = [], extra = [];
    for (const o of others) {
      const g = FE.build(o, doc.factory); building.push(g); extra.push(...FE.drives(o, g, frames, SPF));
      const pl = o.type === 'amr' ? M.amr[o.id] : o.type === 'worker' ? M.worker[o.id] : null;
      if (pl && pl.ok && !pl.still) extra.push(...rigMotion(g, pl, frames, SPF));
    }
    // station cells' R1 / R2 range circles
    const rings = new THREE.Group(); rings.name = 'Range_Circles';
    for (const c of FM().rangeCircles(doc, M, 0)) if (c.id.includes(':')) { const m = new THREE.Mesh(new THREE.RingGeometry(c.r - 0.04, c.r, 72), new THREE.MeshBasicMaterial({ color: 0xe8a019, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })); m.name = 'Range_' + c.name; m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.016, c.z); rings.add(m); }
    building.push(rings);
    const { glb } = await window.StationExport.buildFactoryGlb(doc.factory, cells, building, extra, frames);
    const objects = doc.objects.map(o => ({ id: o.id, type: o.type, name: o.name, x: o.x, z: o.z, rot: o.rot || 0, params: o.type === 'station' ? undefined : o.params }));
    const timeline = window.StationExport.factoryTimeline(doc.factory, objects, cells, frames);
    Object.assign(timeline, motionTimeline(M, frames, SPF));
    return { glb, timeline, doc: clone(doc) };
  }

  // AMR / worker motion for console 2: the element moves on a TX > TZ > RY rig recorded from its plan
  function rigMotion(g, pl, frames, SPF) {
    const q0 = pl.pose(0), mk = n => { const x = new THREE.Group(); x.name = g.name + '_' + n; return x; };
    const tx = mk('TX'), tz = mk('TZ'), ry = mk('RY');
    [...g.children].forEach(c => ry.add(c));
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
    tx.position.x = q0.x; tz.position.z = q0.z; ry.rotation.y = q0.yaw;
    g.add(tx); tx.add(tz); tz.add(ry);
    const sx = new Array(frames), sz = new Array(frames), sy = new Array(frames);
    for (let f = 0; f < frames; f++) { const q = pl.pose(f * SPF); sx[f] = Math.round((q.x - q0.x) * 10000) / 10; sz[f] = Math.round((q.z - q0.z) * 10000) / 10; sy[f] = Math.round((q.yaw - q0.yaw) * 180 / Math.PI * 100) / 100; }
    return [{ node: tx, dir: 'LinearX', rev: true, series: sx }, { node: tz, dir: 'LinearZ', rev: false, series: sz }, { node: ry, dir: 'RotationY', rev: true, series: sy }];
  }
  // per-frame states of AMRs / workers and safety warnings, as change points (console 2 panels)
  function motionTimeline(M, frames, SPF) {
    const seg = fn => { const out = []; for (let f = 0; f < frames; f++) { const v = fn(f * SPF); if (!out.length || out[out.length - 1][1] !== v) out.push([f, v]); } return out; };
    const amr = {}, worker = {};
    for (const o of doc.objects) {
      if (o.type === 'amr') { const pl = M.amr[o.id]; amr[o.id] = { name: o.name, ok: !!(pl && pl.ok), error: pl && !pl.ok ? pl.error : '', from: pl && pl.fromLabel, to: pl && pl.toLabel, period: pl && pl.period, state: pl && pl.ok ? seg(t => pl.state(t)) : [[0, '대기']], trips: pl && pl.ok ? seg(t => pl.trips(t)) : [[0, 0]] }; }
      if (o.type === 'worker') { const pl = M.worker[o.id]; worker[o.id] = { name: o.name, state: seg(t => pl.state(t)) }; }
    }
    const safety = seg(t => FM().safety(doc, M, t).map(w => w.text).join('|'));
    return { motion: { amr, worker }, safety };
  }

  // a saved factory document, or a legacy one-station save (meta.summary) converted to one
  function loadDoc(d) {
    if (busy()) throw new Error('사이클 중에는 불러올 수 없습니다');
    pushUndo();
    doc = { version: 2, factory: { ...FACTORY_DEFAULT, ...(d.factory || {}) }, objects: clone(d.objects || []) };
    rebuildAll(); select(null); store();
  }
  function docFromLegacy(meta) {
    const m = meta.summary || {}, L = m.layout || {}, p = defaultCellParams();
    Object.assign(p, { variant: m.variant || 'tube', slots: m.slots || 6, beadW: m.beadW ?? 2, speed: m.speed ?? 30, tol: m.tol ?? 8, fault: m.fault ?? 5, joints: m.joints || null });
    for (const k of Object.keys(INNER)) if (L[k]) p.inner[k] = L[k];
    const c = L.cell || { x: 0, z: 0, rot: 0 };
    return { factory: L.factory || FACTORY_DEFAULT, objects: [{ id: 'c1', type: 'station', name: meta.name || '원스테이션 셀 1', x: c.x, z: c.z, rot: c.rot || 0, params: p }] };
  }

  function init() {
    const s = S(); if (!s || !s.applyLayout || !window.FactoryElements) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    world = new THREE.Group(); world.name = 'factory-objects'; s.scene.add(world);
    buildPanel(); document.querySelector('.app').classList.add('fb-on');
    doc = initialDoc();
    const pref = (doc.objects.find(o => o.type === 'station') || {}).id;
    rebuildAll(pref);
    ensureGizmo().then(() => select(null)).catch(e => note(e.message, true));
    renderTree(); renderProps();
    const el = s.renderer.domElement;
    el.addEventListener('pointerdown', e => { onPick.down = [e.clientX, e.clientY, e.button]; });
    el.addEventListener('pointermove', moveGhost);
    el.addEventListener('pointerup', e => {
      const d = onPick.down; if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) >= 4) return;
      if (drawing) { if (d[2] === 2) return finishDrawing(); const p = floorPoint(e); if (p) addDrawPoint(p); return; }
      if (placing) { if (d[2] === 2) return cancelPlacing(); const p = floorPoint(e), t = placing; cancelPlacing(); if (p) placeAt(t, p); return; }
      if (d[2] === 0) onPick(e);
    });
    el.addEventListener('dblclick', () => { if (drawing) finishDrawing(); });
    el.addEventListener('contextmenu', e => { if (drawing) e.preventDefault(); });
    el.addEventListener('dragover', e => { if (placing) { e.preventDefault(); moveGhost(e); } });
    el.addEventListener('drop', e => { e.preventDefault(); if (!placing) return; const p = floorPoint(e), t = placing; cancelPlacing(); if (p) placeAt(t, p); });
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (drawing && e.key === 'Enter') { finishDrawing(); return; }
      if (e.key === 'Escape') { cancelPlacing(); select(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') remove();
      else if (e.key === 'r' || e.key === 'R') setMode('rotate');
      else if (e.key === 't' || e.key === 'T') setMode('translate');
    });
    // console 1's own panel edits (product, slots, parameters) belong to the active cell
    $('.side').addEventListener('change', () => setTimeout(store, 50));
    $('.side').addEventListener('click', () => setTimeout(store, 300));
    setInterval(() => { if (helper) helper.update(); }, 250);
    // conveyors spin, robots pick & place, AMRs drive their trips and workers walk, at console 1's SIM speed
    let last = performance.now(), lastPanel = 0;
    const tick = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing) clock += dt * (S().cfg.sim || 1);
      const M = motion(), t = clock;
      for (const o of doc.objects) {
        const g = views.get(o.id); if (!g) continue;
        if (o.type === 'conveyor' || o.type === 'robot') window.FactoryElements.animate(o, g, t);
        else if ((o.type === 'amr' || o.type === 'worker') && !(tc && tc.dragging && tc.object === g)) {
          const pl = (o.type === 'amr' ? M.amr : M.worker)[o.id];
          if (pl && pl.ok && !pl.still) { const q = pl.pose(t); g.position.set(q.x, 0, q.z); g.rotation.set(0, q.yaw, 0); }
        }
      }
      updateSafety(M, t, now - lastPanel > 250) && (lastPanel = now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    addEventListener('beforeunload', store);
  }

  /* ---------- range circles + safety ---------- */
  let playing = true, clock = 0, safetyLayer = null;
  const cellRings = new Map();
  // station cells' R1 / R2 circles and the route edges that are blocked (red) or cross a walkway (yellow)
  function buildSafetyLayer() {
    const s = S(); if (!s || !motionCache) return;
    if (safetyLayer) s.scene.remove(safetyLayer);
    safetyLayer = new THREE.Group(); safetyLayer.name = 'safety-layer'; cellRings.clear();
    for (const c of FM().rangeCircles(doc, motionCache, 0)) if (c.id.includes(':')) {
      const m = new THREE.Mesh(new THREE.RingGeometry(c.r - 0.04, c.r, 72), new THREE.MeshBasicMaterial({ color: 0xe8a019, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.016, c.z); m.raycast = () => {}; safetyLayer.add(m); cellRings.set(c.id, m);
    }
    for (const e of motionCache.G.edges) if (e.blockedBy.length || e.crosses.length) {
      const a = motionCache.G.nodes[e.a], b = motionCache.G.nodes[e.b], len = Math.hypot(b.x - a.x, b.z - a.z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.16), new THREE.MeshBasicMaterial({ color: e.blockedBy.length ? 0xff3b30 : 0xffd400, transparent: true, opacity: 0.85 }));
      m.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2); m.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x); m.raycast = () => {}; safetyLayer.add(m);
    }
    s.scene.add(safetyLayer);
  }
  const ringOf = id => {
    if (cellRings.has(id)) return cellRings.get(id);
    const g = views.get(id); return g && (g.getObjectByName('Robot_Range') || g.getObjectByName('AMR_Safety'));
  };
  function updateSafety(M, t, panelToo) {
    const list = FM().safety(doc, M, t), hot = new Set(list.map(w => w.circle.id)), bad = new Set(list.map(w => w.worker.id));
    for (const c of FM().rangeCircles(doc, M, t)) { const r = ringOf(c.id); if (r) { r.material.color.set(hot.has(c.id) ? 0xff3b30 : (c.moving ? 0x00e8d0 : 0xe8a019)); r.material.opacity = hot.has(c.id) ? 0.9 : 0.45; } }
    for (const o of doc.objects) if (o.type === 'worker') {
      const g = views.get(o.id); if (!g) continue;
      const w = g.getObjectByName('Worker_Warning'), r = g.getObjectByName('Worker_Ring');
      if (w) { w.visible = bad.has(o.id); w.quaternion.copy(S().camera.quaternion); }
      if (r) r.material.color.set(bad.has(o.id) ? 0xff3b30 : 0x2bb673);
    }
    if (!panelToo) return false;
    const box = $('#fbSafety'); if (box) box.innerHTML = list.length ? list.map(w => `<span class="ng">⚠ ${esc(w.text)}</span>`).join('') : '<span class="ok">위험 없음</span>';
    const ws = $('#fbWorkerSafety'), sel = selectedId && byId(selectedId);
    if (ws && sel && sel.type === 'worker') { const mine = list.filter(w => w.worker.id === sel.id); ws.innerHTML = mine.length ? mine.map(w => `<span style="color:var(--ng)">⚠ ${esc(w.circle.name)} 가동범위 안</span>`).join('<br>') : '<span style="color:var(--ok)">안전 — 가동범위 밖</span>'; }
    return true;
  }

  window.FactoryBuilder = { factory: () => ({ ...doc.factory }), doc: () => (syncActive(), clone(doc)), exportAll, loadDoc, docFromLegacy, busy };
  if (window.__station) init(); else addEventListener('load', init);
})();
