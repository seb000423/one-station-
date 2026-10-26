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
    ['설비', [['station', '원스테이션 셀'], ['conveyor', '컨베이어'], ['robot', '로봇'], ['rack', '랙 · 버퍼'], ['charger', '충전소'],
      ['conveyor2', '2층 컨베이어'], ['press', '프레스'], ['injection', '사출기'], ['machining', '가공기'], ['washer', '세척기'], ['transfer', '이재기'], ['furnace', '브레이징로'], ['welder', '용접 셀'], ['leaktest', '리크 테스터'], ['palletloop', '팔레트 순환'], ['asmstation', '조립 스테이션'], ['flowrack', '경사 선반']]],
    ['이동체', [['amr', 'AMR'], ['worker', '작업자'], ['route', 'AMR 경로'], ['walkroute', '작업자 경로']]]
  ];
  const TYPE_LABEL = { station: '원스테이션 셀', column: '기둥', wall: '벽', door: '출입문', stairs: '계단', walkway: '보행로', zone: '구역', conveyor: '컨베이어', robot: '로봇', rack: '랙 · 버퍼', amr: 'AMR', charger: '충전소', route: '경로', worker: '작업자', walkroute: '작업자 경로', conveyor2: '2층 컨베이어', press: '프레스', injection: '사출기', machining: '가공기', washer: '세척기', transfer: '이재기', furnace: '진공 브레이징로', welder: '용접 셀', leaktest: '리크 테스터', palletloop: '팔레트 순환 컨베이어', asmstation: '조립 스테이션', flowrack: '경사 부품 선반' };
  const MACHINES = ['conveyor2', 'press', 'injection', 'machining', 'washer', 'transfer', 'furnace', 'welder', 'leaktest', 'palletloop', 'asmstation', 'flowrack']; // js/factory-machines.js
  const EQUIPMENT = ['station', 'conveyor', 'robot', 'rack', 'charger'].concat(MACHINES), MOVERS = ['amr', 'worker', 'route', 'walkroute'];
  const PATHS = ['route', 'walkroute']; // drawn point by point
  // automatic names: walkways and zones get letters (보행로 A, B, …), everything else numbers (컨베이어 1, 2, …);
  // numbering continues after the highest existing name of that type, so a deleted number is not reused
  const LETTERED = ['walkway', 'zone', 'route', 'walkroute'];
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
    zone: [['kind', '구역 종류', 'select', [['pickup', '적재 (픽업)'], ['dropoff', '하역'], ['storage', '보관'], ['keepout', '금지 (작업 구역)'], ['none', '일반']]], ['w', '가로 (m)', 0.5, 0.5, 100], ['d', '세로 (m)', 0.5, 0.5, 100], ['color', '색 (비우면 종류 색)', 'color'],
      ['track', '재고 관리 (수량 세기)', 'check'], ['stock', '초기 재고 (개)', 1, 0, 999, p => p.track], ['cap', '최대 적재 (개, 0 = 무제한)', 1, 0, 999, p => p.track],
      ['supply', '자동 입고 간격 (s, 0 = 없음)', 1, 0, 3600, p => p.track], ['consume', '자동 소비 간격 (s, 0 = 없음)', 1, 0, 3600, p => p.track]],
    conveyor: [['shape', '모양', 'select', [['straight', '직선'], ['curve', '90° 곡선 (L자)'], ['uturn', '180° U턴']]], ['turn', '꺾는 방향', 'select', [['left', '왼쪽'], ['right', '오른쪽']], null, p => p.shape !== 'straight'],
      ['kind', '종류', 'select', [['roller', '롤러'], ['belt', '벨트']]], ['dir', '진행 방향', 'select', [['1', '정방향 ▶'], ['-1', '역방향 ◀']]],
      ['length', '길이 (m)', 0.5, 0.5, 60, p => p.shape === 'straight'], ['radius', '곡선 반경 (m)', 0.1, 0.4, 5, p => p.shape !== 'straight'], ['width', '폭 (m)', 0.05, 0.3, 2], ['height', '높이 (m)', 0.05, 0.3, 1.5], ['speed', '속도 (m/s)', 0.05, 0.05, 3],
      ['source', '투입 (입구에서 물건 생성)', 'check'], ['interval', '투입 간격 (s)', 0.5, 0.5, 600, p => p.source], ['item', '물건 길이 (m)', 0.05, 0.1, 2, p => p.source], ['sink', '배출 (출구에서 꺼냄)', 'check']],
    robot: [['reach', '도달 거리 (m)', 0.1, 0.6, 3], ['pick', '픽 각도 (°)', 15, -180, 180], ['place', '플레이스 각도 (°)', 15, -180, 180], ['cycle', '사이클 (s)', 0.5, 2, 120]],
    rack: [['bays', '베이 수', 1, 1, 30], ['levels', '단 수', 1, 1, 12], ['bayWidth', '베이 폭 (m)', 0.1, 0.6, 4], ['depth', '깊이 (m)', 0.1, 0.4, 2], ['levelHeight', '단 높이 (m)', 0.1, 0.4, 3], ['perSlot', '칸당 적재 수', 1, 1, 6], ['fill', '적재율 (%)', 5, 0, 100]],
    amr: [['from', '출발 지점', 'place', null, null, p => !hasJobs(p)], ['to', '도착 지점', 'place', null, null, p => !hasJobs(p)], ['dwell', '적재 · 하역 시간 (s)', 1, 0, 600], ['speed', '속도 (m/s)', 0.1, 0.2, 3], ['payload', '적재 하중 (kg)', 10, 10, 2000], ['battery', '배터리 (%)', 5, 0, 100], ['length', '길이 (m)', 0.05, 0.4, 2.5], ['width', '폭 (m)', 0.05, 0.3, 2]],
    charger: [['width', '폭 (m)', 0.05, 0.4, 2]],
    conveyor2: [['length', '길이 (m)', 0.5, 2, 40], ['width', '폭 (m)', 0.05, 0.4, 1.5], ['h1', '아래층 높이 (m)', 0.05, 0.3, 1.5], ['h2', '위층 높이 (m)', 0.05, 0.8, 3], ['speed', '속도 (m/s)', 0.05, 0.05, 2], ['lift', '리프터 이동 시간 (s)', 0.5, 1, 30], ['pallets', '팔레트 수', 1, 1, 20]],
    press: [['tonnage', '능력 (t)', 10, 10, 3000], ['spm', '분당 타수 (spm)', 1, 1, 120], ['stroke', '스트로크 (m)', 0.05, 0.05, 1], ['width', '폭 (m)', 0.1, 1, 6], ['depth', '깊이 (m)', 0.1, 1, 5], ['height', '높이 (m)', 0.1, 2.5, 8]],
    injection: [['tonnage', '형체력 (t)', 10, 30, 3000], ['cycle', '사이클 (s)', 1, 5, 600], ['length', '길이 (m)', 0.1, 3, 15], ['width', '폭 (m)', 0.1, 1, 3]],
    machining: [['cycle', '가공 사이클 (s)', 1, 10, 3600], ['width', '폭 (m)', 0.1, 1.6, 6], ['depth', '깊이 (m)', 0.1, 1.6, 6], ['height', '높이 (m)', 0.1, 2, 5]],
    washer: [['length', '길이 (m)', 0.1, 1.5, 15], ['width', '폭 (m)', 0.05, 0.5, 2], ['height', '높이 (m)', 0.1, 1.5, 4], ['speed', '컨베이어 속도 (m/s)', 0.05, 0.05, 1], ['interval', '투입 간격 (s)', 0.5, 1, 120]],
    transfer: [['cycle', '사이클 (s)', 0.5, 3, 120], ['span', '이송 거리 (m)', 0.1, 1.5, 12], ['depth', '깊이 (m)', 0.1, 0.6, 4], ['height', '높이 (m)', 0.1, 1.8, 5]],
    furnace: [['cycle', '사이클 (s, 시뮬레이션 압축)', 5, 20, 36000], ['temp', '브레이징 온도 (°C)', 10, 500, 1300], ['width', '폭 (m)', 0.1, 2, 8], ['depth', '노 길이 (m)', 0.1, 2, 10], ['height', '높이 (m)', 0.1, 2, 6]],
    welder: [['cycle', '용접 사이클 (s)', 1, 10, 3600], ['width', '폭 (m)', 0.1, 2, 8], ['depth', '깊이 (m)', 0.1, 2, 8]],
    palletloop: [['ends', '양 끝', 'select', [['square', '사각 (리프트 트랜스퍼)'], ['round', '타원 (곡선)']]], ['product', '제품', 'select', [['pedal', '브레이크 페달'], ['lego', '레고 + PCB'], ['box', '상자']]], ['length', '직선 길이 (m)', 0.5, 2, 60], ['width', '라인 간격 (m)', 0.1, 1, 6], ['pallets', '팔레트 수', 1, 1, 80], ['pitch', '정지 간격 (m)', 0.1, 0.4, 5], ['speed', '이동 속도 (m/s)', 0.05, 0.05, 2], ['dwell', '정지 시간 (s)', 0.5, 0, 300], ['height', '높이 (m)', 0.05, 0.5, 1.4]],
    asmstation: [['kind', '스테이션 종류', 'select', [['manual', '수동 투입 (작업자)'], ['press', '압입'], ['screw', '체결'], ['robot', '로봇 조립'], ['test', '기능 검사'], ['camera', '비전 검사']]], ['title', '표시 이름', 'text'], ['cycle', '사이클 (s, 팔레트 순환과 같게)', 0.5, 1, 600], ['dwell', '작업 시간 (s)', 0.5, 0, 600], ['reach', '컨베이어까지 (m)', 0.05, 0, 2], ['width', '폭 (m)', 0.1, 0.6, 4], ['depth', '깊이 (m)', 0.1, 0.6, 4]],
    flowrack: [['levels', '단 수', 1, 1, 8], ['bins', '열 수', 1, 1, 12], ['width', '폭 (m)', 0.1, 0.6, 5], ['depth', '깊이 (m)', 0.1, 0.4, 3], ['height', '높이 (m)', 0.1, 1, 3]],
    leaktest: [['cycle', '검사 사이클 (s)', 1, 10, 3600], ['ng', '불량률 (%)', 0.5, 0, 100], ['width', '폭 (m)', 0.1, 1.2, 5], ['depth', '깊이 (m)', 0.1, 1, 4], ['height', '높이 (m)', 0.1, 1.6, 4]],
    worker: [['walkway', '걷는 경로 (왕복)', 'walkway'], ['speed', '보행 속도 (m/s)', 0.1, 0.3, 2.5], ['dwell', '끝에서 작업 시간 (s)', 1, 0, 600]],
    route: [],
    walkroute: []
  };

  const hasJobs = p => (p.stops || []).filter(x => x && x.at).length >= 2; // AMR job list in use
  const ACTS = [['load', '적재'], ['unload', '하역'], ['charge', '충전'], ['wait', '대기']];
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
    if (!motionCache || key !== motionKey) { motionCache = FM().plans(doc); motionKey = key; buildSafetyLayer(); if (window.FactoryFlow) buildFlowLayer(); }
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
  function setSnapshot(id, g) {
    const old = snapshots.get(id); if (old) world.remove(old); snapshots.set(id, g); world.add(g);
    const nodes = treeNodes(g); g.userData.nodes = nodes; g.userData.init = nodes.map(n => [n.position.clone(), n.quaternion.clone(), n.visible]);
  }
  // the other cells follow the simulated one while the simulation runs: every node the active cell moves
  // (robot joints, rail, positioner, doors, parts) is copied onto each still copy with the same structure;
  // the rest keeps the copy's own layout. ⟲ 처음부터 puts the copies back.
  const treeNodes = (root, skip) => { const out = []; (function walk(o) { if (o === skip) return; out.push(o); o.children.forEach(walk); })(root); return out; };
  const mirror = { src: null, base: null };
  function mirrorStart() { const src = treeNodes(S().CELL, proxy); mirror.src = src; mirror.base = src.map(n => [n.position.clone(), n.quaternion.clone(), n.visible]); }
  function mirrorCells(restore) {
    const src = mirror.src, base = mirror.base; if (!src) return;
    for (const g of snapshots.values()) {
      const D = g.userData.nodes, I = g.userData.init; if (!D || D.length !== src.length) continue;
      for (let i = 1; i < D.length; i++) {
        const a = src[i], b = base[i], moved = !restore && (a.visible !== b[2] || !a.position.equals(b[0]) || !a.quaternion.equals(b[1]));
        const d = D[i]; if (moved) { d.position.copy(a.position); d.quaternion.copy(a.quaternion); d.visible = a.visible; } else { d.position.copy(I[i][0]); d.quaternion.copy(I[i][1]); d.visible = I[i][2]; }
      }
    }
  }
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
    const size = Math.max(f.width, f.depth), cellM = size > 20 ? 1 : 0.5, gh = new THREE.GridHelper(size, Math.max(1, Math.round(size / cellM)), 0x56606c, 0x47505a); // 1 m cells on large floors
    s.grid.material.dispose(); s.grid.material = gh.material;
    s.grid.geometry.dispose(); s.grid.geometry = gh.geometry;
    // no distance fog (it darkened the factory when zooming out); a brighter, even space sized to the factory
    s.scene.fog = null;
    s.scene.background = new THREE.Color(0x343b44);
    s.floor.material.color.set(0x3a414a); s.floor.material.needsUpdate = true;
    s.renderer.toneMappingExposure = 1.0;
    const M = Math.max(f.width, f.depth, f.height);
    s.camera.far = Math.max(80, M * 8); s.camera.updateProjectionMatrix();
    if (s.fitLights) s.fitLights(f);
    s.controls.maxDistance = Math.max(9, Math.hypot(f.width, f.depth, f.height) * 2.5);
  }
  function buildView(o) {
    const old = views.get(o.id); if (old) world.remove(old);
    const g = window.FactoryElements.build(o, doc.factory, { billboard: true }); g.userData = { objId: o.id };
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
      tc.addEventListener('objectChange', () => {
        if (helper) helper.update(); refreshTransformFields();
        const o = selectedId && byId(selectedId), g = o && !innerSel && groupOf(o.id);
        if (g && o.type === 'conveyor') { const sn = FF().snap(doc, Object.assign({}, o, { x: g.position.x, z: g.position.z, rot: g.rotation.y })); if (sn) { g.position.set(sn.x, 0, sn.z); g.rotation.set(0, sn.rot, 0); if (helper) helper.update(); } snapNote = sn ? sn.text : ''; }
        if (g && helper) { const why = blockedBy(Object.assign({}, o, { x: g.position.x, z: g.position.z, rot: g.rotation.y })); helper.material.color.set(why ? 0xff3b30 : 0x00e8d0); if (why) note(`여기에는 둘 수 없습니다: ${why}`, true); }
      });
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
    const tsel = $('#fbTarget'); if (tsel) { tsel.value = selectedId || ''; viewButtons(); }
  }
  function commitDrag() {
    const s = S(), o = selectedId && byId(selectedId); if (!o) return;
    if (innerSel) {
      const L = s.layoutParams(), p = proxy.position, v = (a, lo, hi) => r2(Math.min(hi, Math.max(lo, a)));
      if (innerSel === 'jig' || innerSel === 'rail') L[innerSel].z = v(p.z, ZMIN, ZMAX); else L[innerSel] = { x: v(p.x, XMIN, XMAX), z: v(p.z, ZMIN, ZMAX) };
      s.applyLayout(L); o.params = engineCellParams(); store(); select(o.id, innerSel); return;
    }
    const g = groupOf(o.id), exact = o.type === 'conveyor' && snapNote, next = Object.assign({}, o, { x: exact ? g.position.x : r2(g.position.x), z: exact ? g.position.z : r2(g.position.z), rot: Math.round(g.rotation.y * 1e4) / 1e4 });
    const why = blockedBy(next);
    if (why) { undoStack.pop(); placeObjectGroup(o); if (helper) { helper.material.color.set(0x00e8d0); helper.update(); } note(`원래 자리로 되돌렸습니다: ${why}`, true); renderProps(); return; }
    o.x = next.x; o.z = next.z; o.rot = next.rot; placeObjectGroup(o);
    store(); if (helper) helper.update(); renderProps(); renderTree();
    if (o.type === 'conveyor') conveyorNote(o, snapNote); snapNote = '';
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
  /* ---------- path drawing (AMR 경로 / 작업자 경로): click points, double-click / Enter / right-click to finish ---------- */
  let drawing = null; // { type, obj (when extending), pts: [[x, z]], preview }
  function setRoutePoints(o, pts) {
    o.x = pts[0][0]; o.z = pts[0][1]; o.rot = 0;
    o.params = Object.assign(window.FactoryElements.defaults(o.type), o.params || {}, { points: pts.map(([x, z]) => [r2(x - o.x), r2(z - o.z)]) });
    buildView(o);
  }
  function startDrawing(obj, type) {
    if (busy()) return note('시뮬레이션 중에는 그릴 수 없습니다 — ⟲ 처음부터를 누르면 편집할 수 있습니다', true);
    type = obj ? obj.type : type;
    cancelPlacing(); placing = type;
    drawing = { type, obj: obj || null, pts: obj ? FM().routePoints(obj) : [], preview: null };
    redrawPreview();
    note(`${TYPE_LABEL[type] === '경로' ? 'AMR 경로' : TYPE_LABEL[type]}: 바닥을 클릭해 점을 찍고 더블클릭·Enter·오른쪽 클릭으로 끝냅니다 (Esc 취소). ${type === 'route' ? 'AMR 진입이 금지된' : '보행이 금지된'} 구역을 지나는 구간은 놓이지 않습니다.`);
  }
  function redrawPreview(cursor) {
    const s = S(); if (drawing.preview) s.scene.remove(drawing.preview);
    const pts = drawing.pts.concat(cursor ? [cursor] : []);
    if (pts.length < 1) { drawing.preview = null; return; }
    const o = { type: drawing.type, x: pts[0][0], z: pts[0][1], rot: 0, params: { points: pts.map(([x, z]) => [x - pts[0][0], z - pts[0][1]]) } };
    drawing.preview = window.FactoryElements.build(o, doc.factory);
    drawing.preview.traverse(m => { if (m.isMesh) m.raycast = () => {}; });
    s.scene.add(drawing.preview);
  }
  // snap to an existing route point so routes join into one network
  function snapToNode(p) {
    let best = null, bd = 0.3;
    const nodes = drawing && drawing.type === 'walkroute' ? doc.objects.filter(o => o.type === 'walkroute').flatMap(o => FM().routePoints(o).map(([x, z]) => ({ x, z }))) : motion().G.nodes;
    for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } }
    return best ? [best.x, best.z] : [r2(p.x), r2(p.z)];
  }
  function addDrawPoint(p) {
    const q = snapToNode(p), pts = drawing.pts;
    if (pts.length) {
      const a = pts[pts.length - 1]; if (Math.hypot(q[0] - a[0], q[1] - a[1]) < 0.05) return;
      const walk = drawing.type === 'walkroute', bad = (walk ? FM().walkBlocks(doc) : FM().keepouts(doc)).filter(s => FM().hits(a, q, s));
      if (bad.length) return note(`이 구간은 ${walk ? '보행' : 'AMR 진입'}이 금지된 ${bad.map(s => s.name).join(', ')}을(를) 지나서 놓을 수 없습니다 — 그 구역의 진입 허용을 켜거나 돌아가게 그리세요`, true);
    }
    pts.push(q); redrawPreview();
  }
  function finishDrawing() {
    const d = drawing; if (!d) return;
    if (d.preview) S().scene.remove(d.preview);
    drawing = null; placing = null;
    if (d.pts.length < 2) { if (!d.obj) note('점이 2개 이상이어야 경로가 됩니다'); return; }
    pushUndo();
    const o = d.obj || { id: newId(), type: d.type, name: nextName(d.type), x: 0, z: 0, rot: 0, params: {} };
    if (!d.obj) doc.objects.push(o);
    setRoutePoints(o, d.pts); store(); select(o.id); note(`${o.name}: 점 ${d.pts.length}개`);
  }
  function cancelDrawing() { if (!drawing) return; if (drawing.preview) S().scene.remove(drawing.preview); drawing = null; placing = null; }

  function startPlacing(type) {
    if (PATHS.includes(type)) return startDrawing(null, type);
    if (busy()) return note('시뮬레이션 중에는 배치할 수 없습니다 — ⟲ 처음부터를 누르면 편집할 수 있습니다', true);
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
  function moveGhost(e) {
    if (drawing) { const p = floorPoint(e); if (p) redrawPreview(snapToNode(p)); return; }
    if (!ghost) return; const p = floorPoint(e); if (!p) return; ghost.visible = true;
    const cand = candidate(placing, p); ghost.position.set(cand.x, ghost.position.y, cand.z); ghost.rotation.y = cand.rot;
    const why = blockedBy(cand), bad = !!why;
    if (bad !== ghost.userData.bad) { ghost.userData.bad = bad; ghost.traverse(o => { if (o.isMesh) { if (!o.userData.c0) o.userData.c0 = o.material.color.clone(); o.material.color.copy(bad ? new THREE.Color(0xff3b30) : o.userData.c0); } }); }
    if (bad) note(`여기에는 놓을 수 없습니다: ${why}`, true);
  }
  const candidate = (type, p) => {
    const c = { id: '__ghost', type, name: TYPE_LABEL[type], x: r2(p.x), z: r2(p.z), rot: 0, params: type === 'station' ? defaultCellParams() : window.FactoryElements.defaults(type, doc.factory) };
    if (type === 'conveyor') { const sn = FF().snap(doc, c); if (sn) Object.assign(c, { x: sn.x, z: sn.z, rot: sn.rot, snapped: sn.text }); }
    return c;
  };
  function placeAt(type, p) {
    const cand = candidate(type, p), why = blockedBy(cand); if (why) return note(`여기에는 놓을 수 없습니다: ${why}`, true);
    pushUndo();
    const o = { id: newId(), type, name: nextName(type), x: cand.x, z: cand.z, rot: cand.rot, params: cand.params };
    syncLabel(o); if (!cand.snapped) clampToFactory(o); doc.objects.push(o);
    if (type !== 'station') buildView(o);
    select(o.id); if (type === 'station') placeObjectGroup(o);
    store(); if (type === 'conveyor') conveyorNote(o, cand.snapped, true); else note(`${o.name}을(를) 놓았습니다`);
  }
  /* ---------- conveyors: links, live items ---------- */
  const FF = () => window.FactoryFlow;
  let snapNote = '', flowSim = null, flowKey = '', flowLayer = null, itemLayer = null;
  const itemMeshes = new Map();
  // what a conveyor is joined to, and problems at its ends
  function conveyorLinks(o) {
    const N = FF().network(doc), me = N.by.get(o.id); if (!me) return { me: null, warn: [] };
    return { me, from: me.prev.map(id => N.by.get(id).name), to: me.next && N.by.get(me.next.id), warn: N.warn.filter(w => w.ids.includes(o.id)).map(w => w.text) };
  }
  function conveyorNote(o, snapped, placed) {
    const L = conveyorLinks(o);
    if (L.warn.length) return note(`${o.name}: ${L.warn[0]}`, true);
    note(`${o.name}${placed ? '을(를) 놓았습니다' : ''}${snapped ? ' — ' + snapped : ''}${L.to ? ` · → ${L.to.name}` : ''}${L.from.length ? ` · ← ${L.from.join(', ')}` : ''}`);
  }
  function conveyorInfo(o) {
    const L = conveyorLinks(o), me = L.me, p = me ? me.p : {};
    const end = !me ? '' : L.to ? `출구 → ${esc(L.to.name)}${me.next.merge ? ' (옆으로 합류)' : ''}` : p.sink ? '출구: 배출 (물건을 꺼냄)' : '출구: 막힘 — 물건이 끝에 쌓입니다';
    const start = !me ? '' : L.from.length ? `입구 ← ${L.from.map(esc).join(', ')}` : p.source ? `입구: 투입 (${p.interval} s마다 ${p.item} m 물건)` : '입구: 연결 없음';
    return `<p class="hint">${me ? `길이 ${me.len.toFixed(2)} m · 한 개 통과 ${(me.len / me.speed).toFixed(1)} s<br>${start}<br>${end}` : ''}</p>
      ${L.warn.map(w => `<p class="hint" style="color:var(--warn)">⚠ ${esc(w)}</p>`).join('')}
      <p class="hint" id="fbConvStats"></p>
      <p class="hint">다른 컨베이어의 입구·출구 근처(40 cm)로 끌어 오면 자석처럼 붙고, 출구를 다른 컨베이어 옆면에 대면 합류합니다. 시뮬레이션을 시작하면 투입 컨베이어에서 물건이 나와 연결된 컨베이어를 따라 흐릅니다.</p>`;
  }
  const flowDocKey = () => JSON.stringify(doc.objects.filter(o => o.type === 'conveyor').map(o => [o.id, o.x, o.z, o.rot, o.params]));
  // items on the conveyors at time t (restarts from 0 after ⟲ or an edit)
  function flowAt(t) {
    const key = flowDocKey();
    if (!flowSim || key !== flowKey || t < flowSim.t() - 1e-6) { flowSim = FF().sim(doc); flowKey = key; buildFlowLayer(); }
    flowSim.advanceTo(t); return flowSim;
  }
  const cartonMat = new THREE.MeshStandardMaterial({ color: 0xa8743e, roughness: 0.85 }), cartonTape = new THREE.MeshStandardMaterial({ color: 0x5e4122, roughness: 0.8 });
  function renderItems(F) {
    const s = S(); if (!itemLayer) { itemLayer = new THREE.Group(); itemLayer.name = 'conveyor-items'; s.scene.add(itemLayer); }
    const live = new Set();
    for (const x of F.items()) {
      let m = itemMeshes.get(x.id);
      if (!m) {
        m = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(x.size, x.h, x.w), cartonMat); b.castShadow = b.receiveShadow = true; m.add(b);
        const tp = new THREE.Mesh(new THREE.BoxGeometry(x.size + 0.004, 0.004, Math.min(0.06, x.w * 0.3)), cartonTape); tp.position.y = x.h / 2; m.add(tp);
        m.traverse(q => { q.raycast = () => {}; }); itemMeshes.set(x.id, m); itemLayer.add(m);
      }
      m.position.set(x.x, x.y, x.z); m.rotation.set(0, x.yaw, 0); live.add(x.id);
    }
    for (const [id, m] of itemMeshes) if (!live.has(id)) { itemLayer.remove(m); m.children.forEach(c => c.geometry.dispose()); itemMeshes.delete(id); }
  }
  // end markers: green = joined, orange = dead end (items queue), red = sink, blue = source
  function buildFlowLayer() {
    const s = S(); if (flowLayer) s.scene.remove(flowLayer);
    flowLayer = new THREE.Group(); flowLayer.name = 'conveyor-ends';
    const N = FF().network(doc), fed = new Set(N.belts.flatMap(b => b.next && !b.next.merge ? [b.next.id] : []));
    const dot = (x, y, z, color) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 20), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); m.raycast = () => {}; flowLayer.add(m); };
    for (const b of N.belts) {
      const y = b.top + 0.01;
      dot(b.exit.x, y, b.exit.z, b.next ? 0x2bb673 : b.p.sink ? 0xff6b5a : 0xffa53a);
      if (!fed.has(b.id)) dot(b.entry.x, y, b.entry.z, b.p.source ? 0x4aa8ff : 0x8894a0);
    }
    s.scene.add(flowLayer);
  }
  // 전체 지우기: placed objects only (keep the building) / everything (keep the size) / everything + default size
  const BUILDING = ['column', 'wall', 'door', 'stairs'];
  function clearAll() {
    if (busy()) return note('시뮬레이션 중에는 지울 수 없습니다 — ⟲ 처음부터를 누르면 편집할 수 있습니다', true);
    const nB = doc.objects.filter(o => BUILDING.includes(o.type)).length, nO = doc.objects.length - nB, f = doc.factory;
    if (!doc.objects.length) return note('지울 객체가 없습니다');
    const wrap = document.createElement('div'); wrap.className = 'fbModal';
    wrap.innerHTML = `<div class="card"><h3>전체 지우기</h3><p class="hint">무엇을 지울지 고르세요. 어느 쪽이든 Ctrl+Z(되돌리기)로 되돌릴 수 있습니다.</p>
      <button type="button" data-c="objects" ${nO ? '' : 'disabled'}><b>배치 객체만 지우기</b><span>셀·설비·구역·경로·이동체 ${nO}개 · 건물 요소 ${nB}개와 공장 크기(${f.width}×${f.depth}×${f.height} m)는 유지</span></button>
      <button type="button" data-c="all"><b>건물 요소 포함 전부 지우기</b><span>객체 ${nO + nB}개 모두 · 공장 크기는 유지</span></button>
      <button type="button" data-c="reset" class="danger"><b>공장 크기까지 초기화</b><span>객체 ${nO + nB}개 모두 · 공장 크기를 ${FACTORY_DEFAULT.width}×${FACTORY_DEFAULT.depth}×${FACTORY_DEFAULT.height} m로</span></button>
      <div class="acts"><button type="button" data-c="cancel">취소</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => {
      const c = e.target.closest('[data-c]'), mode = c ? c.dataset.c : (e.target === wrap ? 'cancel' : null); if (!mode) return;
      wrap.remove(); if (mode === 'cancel') return;
      pushUndo();
      const n = doc.objects.length;
      doc.objects = mode === 'objects' ? doc.objects.filter(o => BUILDING.includes(o.type)) : [];
      if (mode === 'reset') doc.factory = { ...FACTORY_DEFAULT };
      rebuildAll(); select(null); store(); if (mode === 'reset') view('all');
      note(`${n - doc.objects.length}개를 지웠습니다${mode === 'reset' ? ' · 공장 크기 초기화' : ''} (Ctrl+Z로 되돌리기)`);
    });
  }
  // where o may not stand: overlapping another object's size / work area, or outside the factory
  function blockedBy(o) {
    if (FM().outside(doc, o)) return '공장 밖으로 나갑니다';
    const hit = FM().collisions(doc, o); return hit.length ? `${hit.join(', ')}와(과) 겹칩니다` : '';
  }
  function duplicate() {
    const o = selectedId && byId(selectedId); if (!o) return;
    if (busy()) return note('사이클 중에는 복제할 수 없습니다', true);
    syncActive(); pushUndo();
    const c = clone(o); c.id = newId(); c.name = nextName(o.type);
    // the nearest free spot around the original (spiral, 0.5 m steps)
    let found = false;
    for (let ring = 1; ring <= 30 && !found; ring++) for (let k = 0; k < ring * 8 && !found; k++) {
      const a = (k / (ring * 8)) * Math.PI * 2; c.x = r2(o.x + Math.cos(a) * ring * 0.5); c.z = r2(o.z + Math.sin(a) * ring * 0.5);
      found = !blockedBy(c);
    }
    if (!found) { undoStack.pop(); return note('복제할 빈자리가 없습니다', true); }
    syncLabel(c); doc.objects.push(c);
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
  const ICON = {
    column: '<rect x="9" y="3" width="6" height="18" rx="1"/>',
    wall: '<rect x="3" y="9" width="18" height="6" rx="1"/>',
    door: '<path d="M6 21V4h12v17M10 12h.01"/>',
    stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
    walkway: '<path d="M8 3 6 21M16 3l2 18M12 5v3M12 11v3M12 17v3"/>',
    zone: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/>',
    route: '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="18" r="1.5"/>',
    worker: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M8 11h8M12 15l-3 6M12 15l3 6"/>',
    station: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 10h18M8 6V3h8v3"/>',
    conveyor: '<rect x="2" y="9" width="20" height="5" rx="2.5"/><circle cx="6" cy="11.5" r="1"/><circle cx="12" cy="11.5" r="1"/><circle cx="18" cy="11.5" r="1"/><path d="M5 14v6M19 14v6"/>',
    robot: '<path d="M5 21h8M9 21v-5l4-6 5 2M13 10l-2-4"/><circle cx="18" cy="12" r="1.5"/>',
    rack: '<path d="M4 3v18M20 3v18M4 8h16M4 14h16M4 20h16"/>',
    amr: '<rect x="3" y="8" width="18" height="9" rx="2"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/><path d="M8 8V5h8v3"/>',
    charger: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="m13 7-3 5h4l-3 5"/>',
    conveyor2: '<rect x="3" y="5" width="18" height="4" rx="2"/><rect x="3" y="13" width="18" height="4" rx="2"/><path d="M5 9v4M19 9v4M5 17v4M19 17v4"/>',
    press: '<path d="M4 21h16M6 21V4h12v17M6 7h12"/><rect x="9" y="9" width="6" height="4"/><path d="M8 17h8"/>',
    injection: '<rect x="2" y="13" width="20" height="6" rx="1"/><rect x="4" y="7" width="7" height="6"/><path d="M11 10h8M16 10V5h3"/>',
    machining: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 6v6M10 12h4M7 17h10"/>',
    washer: '<path d="M3 17h18M5 17V7h14v10"/><path d="M9 10v2M12 10v3M15 10v2"/>',
    transfer: '<path d="M4 21V5h16v16M4 5h16"/><path d="M10 5v7M8 12h4M8 12v2M12 12v2"/>',
    furnace: '<rect x="3" y="6" width="14" height="11" rx="5"/><path d="M17 11h3M7 21h9M8 17v4M15 17v4"/>',
    welder: '<path d="M4 20h7M7 20v-6l5-4 4 2M16 12l2 4"/><path d="m19 18 1 1M20 16h1"/>',
    leaktest: '<path d="M5 20h14M7 20v-6h10v6M9 14V9h6v5M12 9V4"/><circle cx="18" cy="5" r="1.5"/>',
    palletloop: '<rect x="3" y="7" width="18" height="10" rx="5"/><rect x="6" y="9" width="3" height="2"/><rect x="15" y="13" width="3" height="2"/>',
    asmstation: '<path d="M4 21V5h16v16M4 13h16M12 5v4"/><rect x="10" y="9" width="4" height="2"/>',
    flowrack: '<path d="M4 21V3M20 21V7M4 8l16 4M4 13l16 4M4 18l16 3"/>'
  };
  const icon = t => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[t] || ''}</svg>`;
  const TABS = [['building', '건물', PALETTE[0][1]], ['route', '동선·구역', PALETTE[1][1]], ['equip', '설비', PALETTE[2][1]], ['mover', '이동체', PALETTE[3][1]]];
  const css = `
  .fb-on .view .hud.tr{display:none}
  .fb-on .view .hud.tl{left:262px;top:var(--fbbar,58px)}
  .fb-on .view .hud.bl,.fb-on .view .hud.bc{left:262px}
  .fb-on .view #fbPanel.min ~ .hud.tl{left:14px}
  .fb-on:not(.fb-cell) .view .hud.bl,.fb-on:not(.fb-cell) .view .hud.bc{display:none}
  .fb-on .side .saverow{display:none}
  #fbBar{position:absolute;left:8px;right:8px;top:8px;z-index:6;display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:6px 10px;font-size:12px}
  #fbBar .grp{display:flex;align-items:center;gap:4px}
  #fbBar .grp > span{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);margin-right:2px}
  #fbBar button,#fbBar select,#fbSim button,#fbSim select{box-sizing:border-box;height:28px;background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:0 9px;border-radius:3px;cursor:pointer;font:inherit;font-size:12px;line-height:26px}
  #fbSim{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:12px;white-space:nowrap}
  #fbSim > span{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);margin-right:2px}
  #fbSim button:hover{border-color:var(--mute)}
  #fbSim button.primary{border-color:var(--accent);color:var(--accent)}
  #fbSim button.on{background:rgba(0,232,208,.1)}
  #fbSim label{display:flex;align-items:center;gap:4px;color:var(--mute);font-size:11.5px}
  #fbSim #fbClock{font-family:var(--mono);font-weight:500;color:var(--fg);min-width:44px;text-align:right}
  .fb-cell #fbSim{left:auto;right:8px;transform:none;top:var(--fbbar,58px);bottom:auto} /* clear of the cell's joint read-out and step bar */
  #fbBar button.following{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
  #fbBar #fbTarget{max-width:180px}
  #fbBar button:hover{border-color:var(--mute)}
  #fbBar button.on{border-color:var(--accent);color:var(--accent)}
  #fbBar button.primary{border-color:var(--accent);color:var(--accent)}
  #fbBar label{display:flex;align-items:center;gap:4px;color:var(--mute);font-size:11.5px;cursor:pointer}
  #fbBar select{max-width:150px}
  #fbBar .sep{width:1px;align-self:stretch;background:var(--line)}
  #fbPanel{position:absolute;left:8px;top:var(--fbbar,58px);bottom:8px;width:244px;display:flex;flex-direction:column;gap:8px;padding:10px;z-index:5;font-size:12px;overflow:hidden}
  #fbPanel.min{bottom:auto;width:auto}
  #fbPanel.min .fbBody{display:none}
  #fbPanel .fbHead{display:flex;align-items:center;gap:6px}
  #fbPanel .fbHead b{font-family:var(--mono);letter-spacing:.16em;font-size:11px;color:var(--accent);font-weight:600;flex:1;line-height:1.6}
  #fbPanel .fbBody{display:flex;flex-direction:column;gap:8px;min-height:0;flex:1}
  #fbPanel button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:5px 8px;border-radius:3px;cursor:pointer;font:inherit;font-size:11.5px;line-height:1.4}
  #fbPanel button:hover{border-color:var(--mute)}
  #fbPanel .tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:2px}
  #fbPanel .tabs button{padding:6px 2px;font-size:11px;line-height:1.35;white-space:nowrap}
  #fbPanel .tabs button.on{border-color:var(--accent);color:var(--accent);background:rgba(0,232,208,.06)}
  #fbPanel .pal{display:grid;grid-template-columns:1fr 1fr;gap:4px}
  #fbPanel .pal button{display:flex;align-items:center;gap:6px;padding:7px 8px;text-align:left;cursor:grab;line-height:1.4}
  #fbPanel .pal button svg{flex:none;color:var(--accent)}
  #fbPanel details{border-top:1px solid var(--line);padding-top:6px;min-height:0;display:flex;flex-direction:column}
  #fbPanel details[open].grow{flex:1}
  #fbPanel summary{cursor:pointer;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--mute);line-height:1.8;list-style:none;display:flex;justify-content:space-between}
  #fbPanel summary::-webkit-details-marker{display:none}
  #fbPanel summary::after{content:'▾';color:var(--dim)}
  #fbPanel details:not([open]) summary::after{content:'▸'}
  #fbPanel summary em{font-style:normal;color:var(--ng);margin-left:auto;margin-right:6px}
  #fbTree{flex:1;min-height:60px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:2px 2px 4px}
  #fbTree .grp{font-size:10.5px;color:var(--dim);margin:6px 0 2px;font-family:var(--mono);letter-spacing:.1em;line-height:1.6;flex:none}
  #fbTree button{flex:none;display:flex;gap:6px;align-items:center;text-align:left;background:transparent;border:1px solid transparent;padding:5px 8px;min-height:28px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #fbTree button svg{flex:none;color:var(--dim)}
  #fbTree button.on{border-color:var(--accent);background:rgba(0,232,208,.06)}
  #fbTree em{font-style:normal;color:var(--accent);font-size:10px;margin-left:auto}
  #fbSafety{display:grid;gap:3px;font-size:11.5px;line-height:1.6;max-height:120px;overflow:auto;padding:2px 0}
  #fbSafety .ok{color:var(--ok)}
  #fbSafety .ng{color:var(--ng)}
  #fbNote{color:var(--mute);line-height:1.55;min-height:1.55em;font-size:11.5px}
  #fbNote.err{color:var(--warn)}
  #fbProps{display:grid;gap:10px}
  #fbProps h3{margin:0}
  #fbProps h4{margin:4px 0 0;font-size:10.5px;letter-spacing:.14em;font-family:var(--mono);color:var(--mute);font-weight:500;line-height:1.6}
  #fbProps .row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  #fbProps label{display:grid;gap:3px;color:var(--mute);font-size:11px;min-width:0;line-height:1.5}
  #fbProps select{width:100%;min-width:0;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:6px 7px;border-radius:3px;font:inherit;font-size:12px}
  #fbProps input{width:100%;min-width:0;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:6px 7px;border-radius:3px;font:inherit;font-family:var(--mono);font-size:12px}
  #fbProps input[type=color]{padding:2px;height:30px}
  #fbProps input:focus,#fbProps select:focus{outline:none;border-color:var(--accent)}
  #fbProps input:disabled{opacity:.35}
  #fbProps .acts{display:flex;flex-wrap:wrap;gap:4px}
  #fbProps .acts button,#fbProps .inner button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:5px 9px;border-radius:3px;cursor:pointer;font:inherit;font-size:11.5px;line-height:1.4}
  #fbProps .inner{display:flex;flex-wrap:wrap;gap:4px}
  #fbProps .inner button.on{border-color:var(--accent);color:var(--accent)}
  #fbProps .kind{font-family:var(--mono);font-size:10.5px;color:var(--accent);letter-spacing:.12em;display:flex;align-items:center;gap:6px}
  #fbProps .hint{color:var(--dim);font-size:11px;line-height:1.55;margin:0}
  #fbProps label.chk{display:flex;align-items:center;gap:6px;color:var(--fg);font-size:12px}
  #fbProps label.chk input{width:auto}
  #fbProps .perm{display:grid;gap:4px;padding:8px 10px;border:1px solid var(--line);border-radius:3px}
  #fbProps .pts{display:grid;gap:3px;max-height:180px;overflow:auto}
  #fbProps .pt{display:grid;grid-template-columns:18px 1fr 1fr 26px;gap:4px;align-items:center;font-family:var(--mono);font-size:11px;color:var(--mute)}
  #fbProps .pt button{background:var(--panel2);border:1px solid var(--line);color:var(--mute);border-radius:3px;cursor:pointer;padding:3px 0}
  .fb-hide{display:none!important}
  .fb-on .side .foot{display:none}
  .fb-on:not(.fb-cell) .view .hud.tl{display:none}
  #fbBar .push{margin-left:auto}
  #fbBar button.danger{color:#ff8a80;border-color:rgba(255,77,79,.45)}
  #fbBar button.strong{background:var(--accent);color:var(--accent-ink);font-weight:700;border-color:var(--accent)}
  #fbBar button:disabled,#fbBar select:disabled{opacity:.4;cursor:default}
  #fbBar .vsep{width:1px;height:20px;background:var(--line);margin:0 4px}
  #fbPanel .fbBody{min-height:0;overflow:hidden}
  #fbPanel .fold{display:flex;flex-direction:column;min-height:0;border-top:1px solid var(--line);padding-top:4px}
  #fbPanel .fold.list{flex:1 1 0;min-height:90px}
  #fbPanel .fold.safety,#fbPanel .fold.logi{flex:0 0 auto}
  #fbProps .jobs{display:grid;gap:3px;max-height:220px;overflow:auto}
  #fbProps .jobs .pt{grid-template-columns:18px 1fr 62px 46px 26px}
  #fbProps .jobs select,#fbProps .jobs input{min-width:0}
  #fbPanel .fold.logi .foldBody{max-height:150px;overflow:auto;display:grid;gap:2px;font-size:11px}
  #fbLogi .lrow{display:flex;gap:6px;justify-content:space-between}#fbLogi .lrow span{color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #fbLogi h5{margin:4px 0 0;font:600 10px var(--mono);letter-spacing:.12em;color:var(--dim)}
  #fbPanel .fold.closed{flex:0 0 auto;min-height:0}
  #fbPanel .fold.closed .foldBody{display:none}
  #fbPanel .foldHead{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--mute);line-height:2}
  #fbPanel .foldHead::after{content:'▾';margin-left:auto;color:var(--dim)}
  #fbPanel .fold.closed .foldHead::after{content:'▸'}
  #fbPanel .foldHead em{font-style:normal;color:var(--dim)}
  #fbPanel .fold.safety .foldHead em{color:var(--ng)}
  #fbPanel .fold.list .foldBody{flex:1 1 auto;min-height:0;overflow:auto}
  #fbPanel .fold.safety .foldBody{max-height:120px;overflow:auto}
  #fbTree button span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  #fbTree em{flex:none;max-width:70px;overflow:hidden;text-overflow:ellipsis}
  #fbToast{position:absolute;left:50%;top:calc(var(--fbbar,58px) + 4px);transform:translate(-50%,-6px);z-index:8;max-width:min(640px,70%);padding:9px 14px;border-radius:4px;background:rgba(16,19,23,.94);border:1px solid var(--line);color:var(--fg);font-size:12.5px;line-height:1.5;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
  #fbToast.show{opacity:1;transform:translate(-50%,0)}
  #fbToast.err{border-color:var(--warn);color:#ffd59a}
  #fbCtx{position:absolute;z-index:7;display:flex;align-items:center;gap:3px;padding:4px 6px;font-size:11.5px;white-space:nowrap}
  #fbCtx b{font-weight:600;margin:0 6px 0 2px;max-width:140px;overflow:hidden;text-overflow:ellipsis}
  #fbCtx button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:3px 7px;border-radius:3px;cursor:pointer;font:inherit}
  #fbCtx button:hover{border-color:var(--accent);color:var(--accent)}
  #fbProps.flash{outline:2px solid var(--accent);outline-offset:4px;transition:outline-color .6s}
  .fbModal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px}
  .fbModal .card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:18px 20px;width:min(440px,100%);display:grid;gap:8px;font-size:13px}
  .fbModal h3{margin:0;font-size:14px}
  .fbModal .hint{color:var(--dim);font-size:11.5px;margin:0 0 4px}
  .fbModal button{display:grid;gap:3px;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:10px 12px;border-radius:3px;cursor:pointer;font:inherit}
  .fbModal button:hover{border-color:var(--accent)}
  .fbModal button span{font-size:11.5px;color:var(--mute)}
  .fbModal button.danger b{color:#ff8a80}
  .fbModal button:disabled{opacity:.4;cursor:default}
  .fbModal .acts{display:flex;justify-content:flex-end}
  .fbModal .acts button{display:inline-block;padding:7px 14px}
  @media (max-width:1400px){ #fbBar{gap:4px 10px} #fbBar .grp > span{display:none} #fbBar button,#fbBar select{padding:0 7px;font-size:11.5px} }`;
  let panel, bar, simBox, propSec, stationSecs = [], noteT, tab = 'building';
  // short messages appear as a toast in the 3D view and fade out
  function note(t, warn) {
    let n = $('#fbToast'); if (!n) { n = document.createElement('div'); n.id = 'fbToast'; $('.view').appendChild(n); }
    n.textContent = t; n.classList.toggle('err', !!warn); n.classList.add('show');
    clearTimeout(noteT); noteT = setTimeout(() => n.classList.remove('show'), warn ? 6000 : 3500);
  }

  function buildPanel() {
    // top toolbar: file · edit · simulation · view
    bar = document.createElement('div'); bar.id = 'fbBar'; bar.className = 'card';
    bar.innerHTML = `
      <div class="grp"><span>파일</span><button type="button" data-t="new">새 공장</button><button type="button" data-t="load">불러오기</button><button type="button" data-t="sample" title="AMR·작업자·랙·충전소·셀·구역이 들어간 예시 공장을 불러옵니다 (Ctrl+Z로 되돌리기)">예시 공장</button><button type="button" data-t="sample2" title="예시 공장에 구역 재고와 AMR 작업 순서(밀크런·충전·출하)를 더한 버전입니다 (Ctrl+Z로 되돌리기)">예시 공장 2</button><button type="button" data-t="pedal" title="브레이크 페달 반자동 조립·검사 라인: 사각 팔레트 순환 + 수동 투입·압입·로봇·체결·검사·비전·수동 배출 (Ctrl+Z로 되돌리기)">페달 조립 라인</button><button type="button" data-t="smart" title="SmartFactory 교육용 조립 라인: 타원 팔레트 루프 + 로봇 3대와 경사 부품 선반, 프레스, 기능 검사 (Ctrl+Z로 되돌리기)">스마트팩토리 라인</button><button type="button" data-t="clear" class="danger">전체 지우기</button></div>
      <div class="sep"></div>
      <div class="grp"><span>편집</span><button type="button" data-t="undo" title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>
        <label title="켜면 이동 0.1 m, 회전 15° 단위로 맞춰집니다. 끄면 자유롭게 움직입니다"><input type="checkbox" data-t="snap" checked> 스냅 0.1m·15°</label></div>
      <div class="sep"></div>
      <div class="grp"><span>시점</span><button type="button" data-v="all">전체</button><button type="button" data-v="front">정면</button><button type="button" data-v="top">상면</button>
        <i class="vsep"></i><select id="fbTarget" title="볼 객체 (3D나 목록에서 선택하면 따라 바뀝니다)"></select><button type="button" data-v="look" title="고른 객체로 카메라를 옮깁니다">객체 보기</button><button type="button" data-v="follow" title="고른 AMR·작업자를 따라갑니다. 다시 누르거나 Esc, 화면을 끌면 멈춥니다">추적</button></div>
      <div class="grp push"><button type="button" data-t="save" class="primary strong">저장 · 콘솔 2로 보내기</button></div>`;
    $('.view').appendChild(bar);
    // simulation controls: their own box at the bottom centre of the 3D view
    simBox = document.createElement('div'); simBox.id = 'fbSim'; simBox.className = 'card';
    simBox.innerHTML = `<span>시뮬레이션</span>
      <button type="button" data-t="play" class="primary" title="셀 사이클·로봇·컨베이어·AMR·작업자를 모두 함께 움직입니다">▶ 시작</button>
      <button type="button" data-t="restart" title="시뮬레이션을 멈추고 처음 상태로 되돌립니다 (편집하려면 이 상태여야 합니다)">⟲ 처음부터</button>
      <label title="시뮬레이션 시간 배속 (1× = 실제 시간)">배속 <select data-t="speed"><option value="1">1×</option><option value="4" selected>4×</option><option value="16">16×</option><option value="32">32×</option></select></label>
      <b id="fbClock" title="시뮬레이션 경과 시간">00:00</b>`;
    $('.view').appendChild(simBox);
    const fitBar = () => document.querySelector('.view').style.setProperty('--fbbar', (bar.offsetHeight + 16) + 'px');
    if (window.ResizeObserver) new ResizeObserver(fitBar).observe(bar); setTimeout(fitBar, 0);
    // left: palette tabs + collapsible object list / safety
    panel = document.createElement('div'); panel.id = 'fbPanel'; panel.className = 'card';
    panel.innerHTML = `
      <div class="fbHead"><b>FACTORY BUILDER</b><button type="button" data-t="min" title="패널 접기">–</button></div>
      <div class="fbBody">
        <div class="tabs">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="pal"></div>
        <section class="fold list"><button type="button" class="foldHead">객체 목록 <em id="fbCount"></em></button><div class="foldBody" id="fbTree"></div></section>
        <section class="fold safety"><button type="button" class="foldHead">안전 경고 <em id="fbSafetyCount"></em></button><div class="foldBody" id="fbSafety"><span class="ok">위험 없음</span></div></section>
        <section class="fold logi"><button type="button" class="foldHead">물류 현황 <em id="fbLogiCount"></em></button><div class="foldBody" id="fbLogi"><span class="hint">AMR이나 재고 관리 구역이 있으면 여기에 운반 횟수와 재고가 나옵니다</span></div></section>
      </div>`;
    $('.view').appendChild(panel);
    const showTab = k => {
      tab = k; panel.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
      const pal = panel.querySelector('.pal'), items = TABS.find(t => t[0] === k)[2];
      pal.innerHTML = items.map(([t, l]) => `<button type="button" draggable="true" data-place="${t}" title="${l}: 누른 뒤 바닥을 클릭하거나 바닥으로 끌어다 놓기">${icon(t)}<span>${l}</span></button>`).join('');
      pal.querySelectorAll('[data-place]').forEach(b => {
        b.addEventListener('click', () => startPlacing(b.dataset.place));
        b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', b.dataset.place); startPlacing(b.dataset.place); });
      });
    };
    panel.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
    panel.querySelectorAll('.foldHead').forEach(h => h.onclick = () => h.parentElement.classList.toggle('closed'));
    showTab(tab);
    panel.querySelector('[data-t=min]').onclick = () => { panel.classList.toggle('min'); panel.querySelector('[data-t=min]').textContent = panel.classList.contains('min') ? '+' : '–'; };
    const on = (sel, fn) => { const b = bar.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-t=new]', newFactory);
    on('[data-t=load]', () => { const b = $('#loadFactory'); if (b) b.click(); });
    on('[data-t=save]', () => { const b = $('#saveStation'); if (b) b.click(); });
    on('[data-t=sample]', () => loadSample('sample-factory.json', '예시 공장'));
    on('[data-t=sample2]', () => loadSample('sample-factory-2.json', '예시 공장 2'));
    on('[data-t=pedal]', () => loadSample('sample-pedal-line.json', '페달 조립 라인'));
    on('[data-t=smart]', () => loadSample('sample-smartfactory.json', '스마트팩토리 라인'));
    on('[data-t=clear]', clearAll);
    on('[data-t=undo]', undo);
    bar.querySelector('[data-t=snap]').onchange = e => setSnap(e.target.checked);
    simBox.querySelector('[data-t=play]').onclick = () => playing ? simPause() : simStart();
    simBox.querySelector('[data-t=restart]').onclick = simRestart;
    simBox.querySelector('[data-t=speed]').onchange = e => setSpeed(+e.target.value);
    bar.querySelectorAll('[data-v]').forEach(b => b.onclick = () => view(b.dataset.v));
    $('#fbTarget').onchange = viewButtons;
    S().controls.addEventListener('start', () => { if (followId) stopFollow(); }); // dragging the camera ends 추적

    // properties: the selected object's own settings, at the top of the right column
    const scroll = $('.side .scroll');
    stationSecs = [...scroll.querySelectorAll(':scope > .sec')];
    propSec = document.createElement('div'); propSec.className = 'sec'; propSec.id = 'fbProps';
    scroll.prepend(propSec);
  }

  /* ---------- camera: views fitted to the factory, focus / follow a chosen object ---------- */
  let camTween = null, lastView = null, followId = null;
  function camTo(pos, target, dur = 0.8) {
    const s = S(); s.cfg.follow = false;
    s.controls.maxDistance = Math.max(s.controls.maxDistance, pos.distanceTo(target) * 1.6);
    camTween = { p0: s.camera.position.clone(), t0: s.controls.target.clone(), p1: pos, t1: target, f: 0, dur };
  }
  const fovs = () => { const s = S(), el = s.renderer.domElement, aspect = el.clientWidth / Math.max(1, el.clientHeight), v = THREE.MathUtils.degToRad(s.camera.fov); return { v, h: 2 * Math.atan(Math.tan(v / 2) * aspect) }; };
  // 전체 / 정면 / 상면: the whole factory box fitted to the viewport
  function fitFactory(kind) {
    const { width: W, depth: D, height: H } = doc.factory, { v, h } = fovs(), V3 = THREE.Vector3;
    if (kind === 'top') {
      const dist = Math.max((W / 2) / Math.tan(h / 2), (D / 2) / Math.tan(v / 2)) * 1.08 + H;
      return camTo(new V3(0, dist, 0.001), new V3(0, 0, 0));
    }
    if (kind === 'front') {
      const dir = new V3(0, 0.3, 1).normalize(), dist = Math.max((W / 2) / Math.tan(h / 2), (H / 2 + D * 0.15) / Math.tan(v / 2)) * 1.1 + D / 2;
      return camTo(dir.multiplyScalar(dist).add(new V3(0, H * 0.3, 0)), new V3(0, H * 0.3, 0));
    }
    const R = Math.sqrt(W * W + D * D + H * H) / 2, dist = R / Math.sin(Math.min(v, h) / 2) * 0.92;
    camTo(new V3(0.62, 0.62, 0.82).normalize().multiplyScalar(dist).add(new V3(0, H * 0.2, 0)), new V3(0, H * 0.2, 0));
  }
  // bounding sphere of an object's scene group (station cells: the simulated cell or its still copy)
  function sphereOf(id) { const g = groupOf(id); if (!g) return null; const b = new THREE.Box3().setFromObject(g), sp = new THREE.Sphere(); b.getBoundingSphere(sp); return sp; }
  function focusObject(id) {
    const o = byId(id); if (!o) return;
    const { v, h } = fovs(), V3 = THREE.Vector3, sp = sphereOf(id); if (!sp) return;
    const c = sp.center, r = Math.max(0.6, sp.radius);
    const dist = Math.max(2.2, r / Math.sin(Math.min(v, h) / 2) * 1.15), co = Math.cos(o.rot || 0), si = Math.sin(o.rot || 0);
    const dir = new V3(-0.35 * co + 0.75 * si, 0.62, 0.35 * si + 0.75 * co).normalize(); // from the object's front-left, above
    camTo(c.clone().add(dir.multiplyScalar(dist)), c);
  }
  // where a followed object is now (robots / AMRs / workers move; a simulated cell follows its R1 tool)
  function followPoint(id) {
    const o = byId(id), s = S(); if (!o) return null;
    if (o.type === 'station' && id === activeId && s.ST && s.ST.robots[0]) { const T = s.ST.robots[0].tcpW([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.155, 0, 0, 0, 1]); return new THREE.Vector3(T[3], T[7], T[11]).applyMatrix4(s.CELL.matrixWorld); }
    const g = groupOf(id); if (!g) return null; const p = new THREE.Vector3(); g.getWorldPosition(p); p.y += o.type === 'robot' ? 1.0 : o.type === 'worker' ? 1.1 : 0.4; return p;
  }
  const FOLLOWABLE = ['amr', 'worker'];
  const viewTarget = () => { const sel = $('#fbTarget'), o = sel && sel.value && byId(sel.value); return o || null; };
  function stopFollow(quiet) { if (!followId) return; const o = byId(followId); followId = null; viewButtons(); if (!quiet && o) note(`${o.name} 추적을 멈췄습니다`); }
  function view(kind) {
    if (kind === 'follow' && followId) return stopFollow(); // 추적 is a toggle
    stopFollow(true); lastView = kind;
    bar.querySelectorAll('[data-v=all],[data-v=front],[data-v=top]').forEach(b => b.classList.toggle('on', b.dataset.v === kind));
    if (kind === 'all' || kind === 'front' || kind === 'top') return fitFactory(kind);
    const o = viewTarget(); if (!o) return note('먼저 볼 객체를 고르세요', true);
    focusObject(o.id);
    if (kind === 'follow') { followId = o.id; viewButtons(); note(`${o.name}을(를) 따라갑니다 — 추적을 다시 누르거나 Esc, 화면을 끌면 멈춥니다`); }
  }
  // 객체 보기 needs a chosen object; 추적 one that moves (AMR, 작업자)
  function viewButtons() {
    if (!bar) return; const o = viewTarget(), look = bar.querySelector('[data-v=look]'), fol = bar.querySelector('[data-v=follow]');
    look.disabled = !o; fol.disabled = !followId && !(o && FOLLOWABLE.includes(o.type));
    fol.classList.toggle('following', !!followId); fol.textContent = followId ? '■ 추적 중' : '추적';
  }
  function renderViewTargets() {
    const sel = $('#fbTarget');
    if (sel) {
      const keep = sel.value, groups = [['설비', EQUIPMENT], ['이동체', ['amr', 'worker']], ['동선 · 구역', ['walkway', 'zone', 'route', 'walkroute']], ['건물', ['column', 'wall', 'door', 'stairs']]];
      sel.innerHTML = '<option value="">객체 선택</option>' + groups.map(([g, types]) => { const l = doc.objects.filter(o => types.includes(o.type)); return l.length ? `<optgroup label="${g}">${l.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</optgroup>` : ''; }).join('');
      sel.value = byId(keep) ? keep : '';
      if (followId && !byId(followId)) followId = null;
      viewButtons();
    }
    const cnt = $('#fbCount'); if (cnt) cnt.textContent = doc.objects.length;
  }
  function cameraTick(dt) {
    const s = S();
    if (camTween) {
      camTween.f = Math.min(1, camTween.f + dt / camTween.dur); const e = camTween.f * camTween.f * (3 - 2 * camTween.f);
      s.camera.position.lerpVectors(camTween.p0, camTween.p1, e); s.controls.target.lerpVectors(camTween.t0, camTween.t1, e);
      if (camTween.f >= 1) camTween = null;
    } else if (followId) { // move target and camera together: orbiting keeps working while following
      const p = followPoint(followId); if (!p) { followId = null; return; }
      const d = p.sub(s.controls.target).multiplyScalar(Math.min(1, dt * 4)); s.controls.target.add(d); s.camera.position.add(d);
    }
  }
  function newFactory() {
    if (busy()) return note('사이클 중에는 바꿀 수 없습니다', true);
    if (!confirm('새 공장을 시작합니다. 지금 배치(객체 ' + doc.objects.length + '개)와 공장 크기가 기본값으로 바뀝니다.\nCtrl+Z(되돌리기)로 되돌릴 수 있습니다.')) return;
    pushUndo(); doc = { version: 2, factory: { ...FACTORY_DEFAULT }, objects: [{ id: newId(), type: 'station', name: '원스테이션 셀 1', x: 0, z: 0, rot: 0, params: defaultCellParams() }] };
    rebuildAll(); select(null); store(); view('all'); note('새 공장을 시작했습니다');
  }

  // floating actions for the selected object, next to it in the 3D view
  function ctxTick() {
    let c = $('#fbCtx');
    const o = selectedId && byId(selectedId), g = o && groupOf(o.id);
    if (!o || !g || placing) { if (c) c.hidden = true; return; }
    if (!c) {
      c = document.createElement('div'); c.id = 'fbCtx'; c.className = 'card';
      c.innerHTML = '<b></b><button type="button" data-x="translate" title="이동 (T)">이동</button><button type="button" data-x="rotate" title="회전 (R)">회전</button><button type="button" data-x="dup" title="복제 (Ctrl+D)">복제</button><button type="button" data-x="del" title="삭제 (Del)">삭제</button><button type="button" data-x="look">보기</button><button type="button" data-x="props">설정</button>';
      c.addEventListener('click', e => {
        const x = e.target.closest('[data-x]'); if (!x) return;
        ({ translate: () => setMode('translate'), rotate: () => setMode('rotate'), dup: duplicate, del: remove, look: () => focusObject(selectedId),
           props: () => { propSec.scrollIntoView({ behavior: 'smooth', block: 'start' }); propSec.classList.add('flash'); setTimeout(() => propSec.classList.remove('flash'), 900); } })[x.dataset.x]();
      });
      $('.view').appendChild(c);
    }
    c.querySelector('b').textContent = o.name;
    const box = new THREE.Box3().setFromObject(g), top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(S().camera);
    const view = $('.view').getBoundingClientRect(), el = S().renderer.domElement.getBoundingClientRect();
    if (top.z > 1) { c.hidden = true; return; }
    const x = el.left - view.left + (top.x + 1) / 2 * el.width, y = el.top - view.top + (1 - top.y) / 2 * el.height - 14;
    c.hidden = false; c.style.left = Math.max(270, Math.min(view.width - c.offsetWidth - 8, x - c.offsetWidth / 2)) + 'px'; c.style.top = Math.max(60, Math.min(view.height - 60, y - c.offsetHeight)) + 'px';
  }

  function renderTree() {
    const t = $('#fbTree'); if (!t) return;
    const groups = [['건물', ['column', 'wall', 'door', 'stairs']], ['동선 · 구역', ['walkway', 'zone']], ['설비', EQUIPMENT], ['이동체', MOVERS]];
    t.innerHTML = `<button type="button" data-id="" class="${selectedId ? '' : 'on'}"><span>공장 · </span>${doc.factory.width}×${doc.factory.depth}×${doc.factory.height} m</button>` + groups.map(([g, types]) => {
      const list = doc.objects.filter(o => types.includes(o.type));
      return list.length ? `<div class="grp">${g}</div>` + list.map(o => `<button type="button" data-id="${o.id}" class="${o.id === selectedId ? 'on' : ''}" title="${TYPE_LABEL[o.type]} · 더블클릭: 이 객체 보기">${icon(o.type)}<span>${esc(o.name)}</span>${o.id === activeId ? '<em>시뮬레이션</em>' : ''}</button>`).join('') : '';
    }).join('');
    t.querySelectorAll('[data-id]').forEach(b => { b.addEventListener('click', () => select(b.dataset.id || null)); b.addEventListener('dblclick', () => { if (b.dataset.id) focusObject(b.dataset.id); }); });
    renderViewTargets();
  }

  function field(k, label, v, step, min, max) {
    if (step === 'place') step = 'select', min = [['', '— 선택 —']].concat(FM().places(doc, motion().G).map(p => [p.ref, p.label]));
    if (step === 'walkway') step = 'select', min = [['', '정지 (제자리)']].concat(doc.objects.filter(o => o.type === 'walkway' || o.type === 'walkroute').map(o => [o.id, o.name]));
    if (step === 'select') return `<label>${label}<select data-k="${k}">${min.map(([val, l]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    if (step === 'check') return `<label class="chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
    if (step === 'text') return `<label>${label}<input type="text" data-k="${k}" value="${esc(v)}" maxlength="30"></label>`;
    if (step === 'color') return `<label>${label}<input type="color" data-k="${k}" value="${esc(v || (selectedId && byId(selectedId) && byId(selectedId).type === 'zone' ? (window.FactoryElements.ZONE_KIND[(byId(selectedId).params || {}).kind || 'pickup'] || ['', '#5f6b78'])[1] : '#888888'))}"></label>`;
    return `<label>${label}<input type="number" data-k="${k}" step="${step}" min="${min}" max="${max}" value="${v}"></label>`;
  }
  function renderProps() {
    if (!propSec) return;
    const o = selectedId && byId(selectedId), isCell = o && o.type === 'station';
    stationSecs.forEach(s => s.classList.toggle('fb-hide', !isCell));
    document.querySelector('.app').classList.toggle('fb-cell', !!isCell);
    if (!o) {
      const f = doc.factory, n = t => doc.objects.filter(x => x.type === t).length;
      propSec.innerHTML = `<div class="kind">FACTORY</div><h3>공장</h3>
        <div class="row">${field('width', '가로 (m)', f.width, 0.5, 6, 300)}${field('depth', '세로 (m)', f.depth, 0.5, 6, 300)}${field('height', '높이 (m)', f.height, 0.5, 2.5, 40)}</div>
        <p class="hint">셀 ${n('station')} · 컨베이어 ${n('conveyor')} · 로봇 ${n('robot')} · 랙 ${n('rack')} · AMR ${n('amr')} · 충전소 ${n('charger')} · 공정 설비 ${MACHINES.reduce((a, t) => a + n(t), 0)} · 기둥 ${n('column')} · 벽 ${n('wall')} · 출입문 ${n('door')} · 계단 ${n('stairs')} · 보행로 ${n('walkway')} · 구역 ${n('zone')}<br>왼쪽 팔레트에서 요소를 골라 바닥에 놓고, 객체를 클릭하면 여기에 그 객체의 설정이 나옵니다.</p>`;
      propSec.querySelectorAll('[data-k]').forEach(i => i.addEventListener('change', () => {
        const v = parseFloat(i.value); if (!(v > 0)) return renderProps();
        const f2 = Object.assign({}, doc.factory, { [i.dataset.k]: Math.min(+i.max, Math.max(+i.min, v)) }), out = doc.objects.filter(o => FM().outside({ factory: f2 }, o));
        if (out.length) { note(`공장을 줄일 수 없습니다: ${out.map(o => o.name).join(', ')}이(가) 밖으로 나갑니다`, true); return renderProps(); }
        pushUndo(); doc.factory[i.dataset.k] = f2[i.dataset.k];
        buildShell(); doc.objects.forEach(x => { clampToFactory(x); if (x.type !== 'station') buildView(x); placeObjectGroup(x); });
        if (['all', 'front', 'top'].includes(lastView)) fitFactory(lastView);
        store(); renderTree(); renderProps();
      }));
      return;
    }
    const deg = Math.round(THREE.MathUtils.radToDeg(o.rot || 0));
    let html = `<div class="kind">${icon(o.type)}${TYPE_LABEL[o.type]}</div>
      <label>이름<input type="text" data-n value="${esc(o.name)}" maxlength="40"></label>
      <div class="row">${field('x', 'X (m)', r2(o.x), 0.1, -999, 999)}${field('z', 'Z (m)', r2(o.z), 0.1, -999, 999)}${field('rot', '회전 (°)', deg, 15, -360, 360)}</div>`;
    if (!isCell) {
      const p = Object.assign(window.FactoryElements.defaults(o.type, doc.factory), o.params || {});
      html += `<div class="row">${FIELDS[o.type].filter(f => !f[5] || f[5](p)).map(([k, l, st, mn, mx]) => field('p.' + k, l, p[k], st, mn, mx)).join('')}</div>`;
      if (o.type === 'conveyor') html += conveyorInfo(o);
      if (o.type === 'rack') html += `<p class="hint">수용량 ${p.bays * p.levels * p.perSlot}개 · 현재 ${Math.round(p.bays * p.levels * p.perSlot * p.fill / 100)}개</p>`;
      if (o.type === 'amr') {
        const pl = motion().amr[o.id], jobs = p.stops || [], opts = [['', '— 선택 —']].concat(FM().places(doc, motion().G).filter(x => !x.ref.startsWith('node:')).map(x => [x.ref, x.label]));
        html += `<h4 style="margin:4px 0 0">작업 순서 <em style="font-weight:400">(2개 이상이면 출발·도착 대신 이 순서를 반복)</em></h4><div class="jobs">${jobs.map((j, i) => `<div class="pt"><span>${i + 1}</span><select data-job="${i}" data-jk="at">${opts.map(([v, l]) => `<option value="${v}" ${j.at === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><select data-job="${i}" data-jk="act">${ACTS.map(([v, l]) => `<option value="${v}" ${j.act === v ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="number" data-job="${i}" data-jk="dwell" step="1" min="0" max="600" value="${j.dwell ?? p.dwell}" title="머무는 시간 (s)"><button type="button" data-jobdel="${i}" title="작업 삭제">×</button></div>`).join('')}</div>
          <div class="acts"><button type="button" data-a="jobAdd">작업 추가</button></div>`;
        html += pl && pl.ok
          ? `<p class="hint">${pl.mission ? `작업 순서 ${esc(pl.route)} → (반복) · 한 바퀴 ${pl.length.toFixed(1)} m · 약 ${pl.period.toFixed(0)} s (대기 제외)` : `경로 길이 ${pl.length.toFixed(1)} m · 편도 ${pl.oneWay.toFixed(1)} s · 왕복 주기 ${pl.period.toFixed(1)} s (적재·하역 포함)`}. 작업 구역을 지나는 구간은 사용하지 않고 가장 짧은 경로로 다닙니다. 적재한 뒤 하역할 때까지 짐을 싣고 다닙니다.</p>`
          : `<p class="hint" style="color:var(--warn)">${pl ? pl.error : '출발 지점과 도착 지점을 고르세요'}</p>`;
      }
      if (o.type === 'zone' && p.track) html += '<p class="hint">AMR은 적재할 때 재고가 없으면, 하역할 때 가득 차 있으면 기다립니다. 자동 입고는 트럭·설비가 가져다 놓는 물건, 자동 소비는 라인이 쓰는 물건입니다. 시뮬레이션 중 구역 위에 재고 수가 보입니다.</p>';
      if (o.type === 'worker') { const pl = motion().worker[o.id]; html += `<p class="hint" id="fbWorkerSafety">보행로나 작업자 경로를 고르면 그 경로를 끝에서 끝까지 왕복합니다.</p>${pl && pl.error ? `<p class="hint" style="color:var(--warn)">${esc(pl.error)}</p>` : ''}`; }
      if (o.type === 'route') {
        const pts = FM().routePoints(o), G = motion().G, mine = G.edges.filter(e => e.route === o.id), P0 = Object.assign({ oneway: false }, o.params);
        const blocked = mine.filter(e => e.blockedBy.length), cross = mine.filter(e => e.crosses.length);
        html += `<h4 style="margin:4px 0 0">경로 점 (X, Z m)</h4><div class="pts">${pts.map(([x, z], i) => `<div class="pt"><span>${i + 1}</span><input type="number" step="0.1" data-pt="${i}" data-c="0" value="${r2(x)}"><input type="number" step="0.1" data-pt="${i}" data-c="1" value="${r2(z)}"><button type="button" data-ptdel="${i}" title="점 삭제">×</button></div>`).join('')}</div>
          <label class="chk"><input type="checkbox" data-k="p.oneway" ${P0.oneway ? 'checked' : ''}> 단방향 (그린 순서대로만 통행)</label>
          <p class="hint">AMR 여러 대가 왕복하면 한 줄 경로에서는 서로 마주쳐 멈춥니다. 가는 길과 오는 길을 단방향 경로 두 개로 그리거나, 중간에 갈라지는 교행 구간을 두세요.</p>
          <div class="acts"><button type="button" data-a="extend">점 이어 그리기</button></div>
          <p class="hint" style="${blocked.length ? 'color:var(--warn)' : ''}">${blocked.length ? `막힌 구간 ${blocked.length}개: ${[...new Set(blocked.flatMap(e => e.blockedBy))].join(', ')} — AMR은 이 구간을 쓰지 않습니다 (빨간 표시)` : '작업 구역을 지나는 구간 없음'}${cross.length ? ` · 보행로 교차 ${cross.length}곳 (노란 표시)` : ''}</p>`;
      }
      if (o.type === 'walkroute') {
        const pts = FM().routePoints(o), bad = FM().walkBlocked(doc, o), users = doc.objects.filter(w => w.type === 'worker' && (w.params || {}).walkway === o.id);
        html += `<h4>경로 점 (X, Z m)</h4><div class="pts">${pts.map(([x, z], i) => `<div class="pt"><span>${i + 1}</span><input type="number" step="0.1" data-pt="${i}" data-c="0" value="${r2(x)}"><input type="number" step="0.1" data-pt="${i}" data-c="1" value="${r2(z)}"><button type="button" data-ptdel="${i}" title="점 삭제">×</button></div>`).join('')}</div>
          <div class="acts"><button type="button" data-a="extend">점 이어 그리기</button></div>
          <p class="hint" style="${bad.length ? 'color:var(--warn)' : ''}">${bad.length ? `보행 금지 구역을 지납니다: ${bad.join(', ')} — 이 경로를 쓰는 작업자는 서 있습니다` : '보행 금지 구역을 지나지 않습니다'} · 이 경로를 걷는 작업자 ${users.length}명 (작업자 설정의 "걷는 경로"에서 고릅니다)</p>`;
      }
      if (o.type === 'robot') html += '<p class="hint">픽 위치(파랑)에서 집어 플레이스 위치(주황)에 놓는 동작을 반복합니다. 사이클 시간은 시뮬레이션 시간 기준입니다.</p>';
    } else {
      html += `<h4 style="margin:4px 0 0">셀 내부 배치</h4><div class="inner">${Object.entries(INNER).map(([k, d]) => `<button type="button" data-inner="${k}" class="${innerSel === k ? 'on' : ''}">${d.label}</button>`).join('')}</div>
        <p class="hint">장비를 고른 뒤 3D 화살표를 끌면 이 셀 안에서 옮겨집니다. 아래 제품·파라미터·도포 포인트가 이 셀의 설정이며, 사이클 시작은 이 셀을 시뮬레이션합니다.</p>
        <div class="acts"><button type="button" data-a="check">도달 검사</button><button type="button" data-a="innerReset">셀 내부 기본 배치</button></div>`;
    }
    if (['zone', 'station', 'robot', 'conveyor', 'rack', 'charger'].concat(MACHINES).includes(o.type)) {
      const pm = o.perm || {};
      html += `<h4>진입 허용</h4><div class="perm"><label class="chk"><input type="checkbox" data-perm="amr" ${pm.amr ? 'checked' : ''}> AMR 진입 허용</label><label class="chk"><input type="checkbox" data-perm="walk" ${pm.walk ? 'checked' : ''}> 보행 허용 (보행로 · 작업자)</label>
        <p class="hint">기본은 둘 다 금지입니다. 금지된 구역·작업 범위에는 AMR 경로, 보행로, 작업자가 들어갈 수 없습니다${o.type === 'zone' ? '. AMR은 구역 가장자리(1 m 이내 경로 점)에서 도킹합니다' : ''}.</p></div>`;
    }
    html += `<div class="acts"><button type="button" data-a="look">이 객체 보기</button><button type="button" data-a="dup">복제</button><button type="button" data-a="del">삭제</button></div>`;
    propSec.innerHTML = html;
    propSec.querySelector('[data-n]').addEventListener('change', e => { pushUndo(); o.name = e.target.value.trim() || o.name; syncLabel(o); if (o.type !== 'station') { buildView(o); select(o.id); } store(); renderTree(); });
    propSec.querySelectorAll('[data-k]').forEach(i => i.addEventListener('change', () => {
      const k = i.dataset.k, raw = i.type === 'checkbox' ? i.checked : i.type === 'number' || (k === 'p.dir') ? parseFloat(i.value) : i.value;
      if (i.type === 'number' && Number.isNaN(raw)) return renderProps();
      const next = clone(o);
      if (k === 'rot') next.rot = THREE.MathUtils.degToRad(raw);
      else if (k === 'x' || k === 'z') next[k] = raw;
      else { next.params = Object.assign(window.FactoryElements.defaults(o.type, doc.factory), o.params || {}); next.params[k.slice(2)] = i.type === 'number' ? Math.min(+i.max, Math.max(+i.min, raw)) : raw; }
      const why = blockedBy(next); if (why) { note(`바꿀 수 없습니다: ${why}`, true); return renderProps(); }
      pushUndo();
      o.x = next.x; o.z = next.z; o.rot = next.rot; if (next.params) o.params = next.params;
      if (o.type === 'station' && o.id === activeId) S().applyLayout(Object.assign({ cell: { x: o.x, z: o.z, rot: o.rot || 0 } }, engineCellParams().inner));
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
    const setJobs = fn => { pushUndo(); const p = Object.assign(window.FactoryElements.defaults(o.type, doc.factory), o.params || {}); const jobs = clone(p.stops || []); fn(jobs, p); o.params = Object.assign(p, { stops: jobs }); store(); select(o.id); };
    propSec.querySelectorAll('[data-job]').forEach(i => i.addEventListener('change', () => setJobs(jobs => { const j = jobs[+i.dataset.job]; j[i.dataset.jk] = i.dataset.jk === 'dwell' ? Math.min(600, Math.max(0, parseFloat(i.value) || 0)) : i.value; })));
    propSec.querySelectorAll('[data-jobdel]').forEach(b => b.addEventListener('click', () => setJobs(jobs => jobs.splice(+b.dataset.jobdel, 1))));
    const act = (a, fn) => { const b = propSec.querySelector(`[data-a=${a}]`); if (b) b.onclick = fn; };
    act('jobAdd', () => setJobs((jobs, p) => {
      if (!jobs.length && (p.from || p.to)) jobs.push({ at: p.from, act: 'load', dwell: p.dwell }, { at: p.to, act: 'unload', dwell: p.dwell }); // start from 출발 → 도착
      else jobs.push({ at: '', act: jobs.length % 2 ? 'unload' : 'load', dwell: p.dwell });
    }));
    act('dup', duplicate); act('del', remove); act('look', () => focusObject(o.id));
    propSec.querySelectorAll('[data-perm]').forEach(i => i.addEventListener('change', () => {
      pushUndo(); o.perm = Object.assign({}, o.perm, { [i.dataset.perm]: i.checked });
      if (o.type !== 'station') buildView(o); store(); select(o.id);
      note(`${o.name}: ${i.dataset.perm === 'amr' ? 'AMR 진입' : '보행'} ${i.checked ? '허용' : '금지'}`);
    }));
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
    const loops = Object.values(motion().amr).concat(Object.values(motion().worker)).filter(p => p.ok && !p.still).map(p => p.period);
    const flowing = doc.objects.some(o => o.type === 'conveyor' && o.params && o.params.source);
    // conveyors with a source need time to fill: at least 120 s then
    const frames = Math.min(Math.ceil(3600 / SPF), Math.max(flowing ? Math.ceil(120 / SPF) : 1, cells.length ? Math.max(...cells.map(c => c.rec.info.frames)) : Math.max(1, ...others.map(o => Math.ceil(FE.cycleSeconds(o) / SPF)), ...loops.map(p => Math.ceil(p / SPF)))));
    const M = FM().plans(doc, { horizon: frames * SPF + SPF }); // AMRs simulated together over the whole recording
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
    progress('컨베이어 물건 흐름 기록 중…'); await new Promise(r => setTimeout(r, 20));
    const flow = FF().record(doc, frames, SPF);
    if (flow.pools.length) { const items = new THREE.Group(); items.name = 'Conveyor_Items'; flow.pools.forEach((pool, k) => extra.push(...rigItems(items, pool, k, frames))); building.push(items); }
    const { glb } = await window.StationExport.buildFactoryGlb(doc.factory, cells, building, extra, frames);
    const objects = doc.objects.map(o => ({ id: o.id, type: o.type, name: o.name, x: o.x, z: o.z, rot: o.rot || 0, params: o.type === 'station' ? undefined : o.params }));
    const timeline = window.StationExport.factoryTimeline(doc.factory, objects, cells, frames);
    Object.assign(timeline, motionTimeline(M, frames, SPF));
    if (Object.keys(flow.conveyors).length) timeline.flow = { conveyors: flow.conveyors };
    return { glb, timeline, doc: clone(doc) };
  }

  // conveyor items for console 2: each slot a carton on a TX > TZ > TY > RY rig (positions from FactoryFlow.record)
  function rigItems(parent, pool, k, frames) {
    const out = [];
    pool.slots.forEach((P, i) => {
      const mk = n => { const x = new THREE.Group(); x.name = `Item_${k + 1}_${i + 1}_${n}`; return x; }, q0 = P[0];
      const tx = mk('TX'), tz = mk('TZ'), ty = mk('TY'), ry = mk('RY');
      tx.position.x = q0[0]; tz.position.z = q0[2]; ty.position.y = q0[1]; ry.rotation.y = q0[3];
      const b = new THREE.Mesh(new THREE.BoxGeometry(pool.size, pool.h, pool.w), cartonMat); b.name = `Item_${k + 1}_${i + 1}`; ry.add(b);
      parent.add(tx); tx.add(tz); tz.add(ty); ty.add(ry);
      const sx = [], sz = [], sy = [], sr = []; let yaw = q0[3];
      for (let f = 0; f < frames; f++) {
        const q = P[f]; while (q[3] - yaw > Math.PI) q[3] -= 2 * Math.PI; while (q[3] - yaw < -Math.PI) q[3] += 2 * Math.PI; yaw = q[3];
        sx.push(Math.round((q[0] - q0[0]) * 10000) / 10); sz.push(Math.round((q[2] - q0[2]) * 10000) / 10); sy.push(Math.round((q[1] - q0[1]) * 10000) / 10); sr.push(Math.round((q[3] - q0[3]) * 180 / Math.PI * 100) / 100);
      }
      out.push({ node: tx, dir: 'LinearX', rev: true, series: sx }, { node: tz, dir: 'LinearZ', rev: false, series: sz }, { node: ty, dir: 'LinearY', rev: false, series: sy }, { node: ry, dir: 'RotationY', rev: true, series: sr });
    });
    return out;
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
  // example factories (examples/): 1 = cells, conveyors, racks, zones, chargers, AMRs, workers;
  // 2 = the same plant with zone stock and AMR job lists (milk runs, charging, shipping);
  // pedal line / smart factory = pallet loop assembly lines after two TEMEX reference lines (brake pedal assembly & test,
  // SmartFactory educational line)
  async function loadSample(file, label) {
    try {
      const d = await (await fetch('examples/' + file, { cache: 'no-store' })).json();
      if (playing || clock > 0) simRestart();
      loadDoc(d); view('all'); note(`${label}을(를) 불러왔습니다 · ▶ 시작으로 시뮬레이션 (Ctrl+Z로 되돌리기)`);
    } catch (e) { note(`${label}을(를) 불러오지 못했습니다: ` + e.message, true); }
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
      if (placing) { if (d[2] === 2) return cancelPlacing(); const p = floorPoint(e), t = placing; if (p && blockedBy(candidate(t, p))) return note('여기에는 놓을 수 없습니다: ' + blockedBy(candidate(t, p)) + ' — 다른 곳을 클릭하세요 (Esc 취소)', true); cancelPlacing(); if (p) placeAt(t, p); return; }
      if (d[2] === 0) onPick(e);
    });
    el.addEventListener('dblclick', () => { if (drawing) finishDrawing(); });
    el.addEventListener('contextmenu', e => { if (drawing) e.preventDefault(); });
    el.addEventListener('dragover', e => { if (placing) { e.preventDefault(); moveGhost(e); } });
    el.addEventListener('drop', e => { e.preventDefault(); if (!placing) return; const p = floorPoint(e), t = placing; if (p && blockedBy(candidate(t, p))) return note('여기에는 놓을 수 없습니다: ' + blockedBy(candidate(t, p)) + ' — 다른 곳을 클릭하세요 (Esc 취소)', true); cancelPlacing(); if (p) placeAt(t, p); });
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (drawing && e.key === 'Enter') { finishDrawing(); return; }
      if (e.key === 'Escape') { if (followId) { stopFollow(); return; } cancelPlacing(); select(null); }
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
    let last = performance.now(), lastPanel = 0, lastClock = 0;
    const tick = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing) {
        clock += dt * speed;
        const sim = S().sim; if (activeId && sim.phase === 'done') S().startCycle(); // cells keep producing while it runs
      }
      if (now - lastClock > 200) { lastClock = now; const c = $('#fbClock'); if (c) c.textContent = fmtClock(clock); }
      ctxTick();
      if (playing || busy()) mirrorCells(false);
      const M = motion(), t = clock;
      for (const o of doc.objects) {
        const g = views.get(o.id); if (!g) continue;
        if (o.type === 'conveyor' || o.type === 'robot' || MACHINES.includes(o.type)) window.FactoryElements.animate(o, g, t);
        else if ((o.type === 'amr' || o.type === 'worker') && !(tc && tc.dragging && tc.object === g)) {
          const pl = (o.type === 'amr' ? M.amr : M.worker)[o.id];
          if (pl && pl.ok && !pl.still) { const q = pl.pose(t); g.position.set(q.x, 0, q.z); g.rotation.set(0, q.yaw, 0); }
          const load = o.type === 'amr' && g.getObjectByName('AMR_Load'); if (load) load.visible = pl && pl.ok && pl.carry ? pl.carry(t) : true;
        }
      }
      const F = flowAt(t); renderItems(F);
      if (now - lastPanel > 250) { const cs = $('#fbConvStats'), sel = selectedId && byId(selectedId); if (cs && sel && sel.type === 'conveyor') { const st = F.stats()[sel.id]; if (st) cs.innerHTML = `현재 ${st.state}${sel.params && sel.params.source ? ` · 투입 ${st.made}개` : ''}${sel.params && sel.params.sink ? ` · 배출 ${st.done}개` : ''}`; } }
      if (now - lastPanel > 250) updateLogistics(M, t);
      updateSafety(M, t, now - lastPanel > 250) && (lastPanel = now);
      cameraTick(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    addEventListener('beforeunload', store);
    addEventListener('resize', () => { if (['all', 'front', 'top'].includes(lastView)) setTimeout(() => fitFactory(lastView), 120); });
    S().cfg.follow = false;
    setTimeout(() => view('all'), 300);
  }

  /* ---------- range circles + safety ---------- */
  let playing = false, clock = 0, speed = 4, safetyLayer = null;
  const fmtClock = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  // ▶ 시작: everything runs (cells' cycles, robots, conveyors, AMRs, workers) at the chosen speed
  function simStart() {
    if (clock === 0 || !mirror.src) mirrorStart();
    playing = true; const s = S(); s.cfg.sim = speed;
    if (activeId && (s.sim.phase === 'idle' || s.sim.phase === 'done')) s.startCycle();
    simUi();
  }
  // ⏸: everything holds where it is (the cell's cycle too)
  function simPause() { playing = false; S().cfg.sim = 0; simUi(); }
  // ⟲ 처음부터: stop and return to the start state; editing is possible again
  function simRestart() { playing = false; clock = 0; const s = S(); s.cfg.sim = speed; s.resetAll(); mirrorCells(true); simUi(); note('시뮬레이션을 처음 상태로 되돌렸습니다 — 이제 편집할 수 있습니다'); }
  function setSpeed(v) { speed = v; if (playing) S().cfg.sim = v; }
  function simUi() {
    const b = simBox && simBox.querySelector('[data-t=play]'); if (!b) return;
    b.textContent = playing ? '⏸ 일시정지' : (clock > 0 ? '▶ 계속' : '▶ 시작'); b.classList.toggle('on', playing);
    document.querySelector('.app').classList.toggle('fb-running', playing || busy());
  }
  // zone stock badges above tracked zones and the 물류 현황 panel (AMR state · trips, zone stock)
  function stockBadge(g, text) {
    let b = g.getObjectByName('Zone_Stock');
    if (!b) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      b = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); b.name = 'Zone_Stock'; b.scale.set(2.4, 0.6, 1); b.position.y = 1.6; b.renderOrder = 6; b.raycast = () => {}; g.add(b);
    }
    if (b.userData.text === text) return; b.userData.text = text;
    const c = b.material.map.image, x = c.getContext('2d'); x.clearRect(0, 0, 256, 64);
    x.fillStyle = 'rgba(11,13,16,.82)'; x.beginPath(); x.roundRect ? x.roundRect(4, 6, 248, 52, 12) : x.rect(4, 6, 248, 52); x.fill();
    x.fillStyle = '#7dffb2'; x.font = 'bold 34px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
    b.material.map.needsUpdate = true;
  }
  function updateLogistics(M, t) {
    const Z = M.zones || {};
    for (const o of doc.objects) if (o.type === 'zone') {
      const g = views.get(o.id); if (!g) continue; const z = Z[o.id], old = g.getObjectByName('Zone_Stock');
      if (z) stockBadge(g, `재고 ${z.stock(t)}${z.cap ? ' / ' + z.cap : ''}`); else if (old) g.remove(old);
    }
    const box = $('#fbLogi'); if (!box) return;
    const amrs = doc.objects.filter(o => o.type === 'amr'), zs = doc.objects.filter(o => Z[o.id]);
    if (!amrs.length && !zs.length) return;
    let total = 0;
    const rows = amrs.map(o => { const pl = M.amr[o.id]; if (!pl || !pl.ok) return `<div class="lrow"><b>${esc(o.name)}</b><span class="ng">경로 없음</span></div>`; const n = pl.trips(t); total += n; return `<div class="lrow"><b>${esc(o.name)}${pl.carry && pl.carry(t) ? ' 📦' : ''}</b><span>${esc(pl.state(t))} · ${n}회</span></div>`; }).join('');
    const zr = zs.map(o => `<div class="lrow"><b>${esc(o.name)}</b><span>재고 ${Z[o.id].stock(t)}${Z[o.id].cap ? ' / ' + Z[o.id].cap : ''}</span></div>`).join('');
    const html = (rows ? '<h5>AMR</h5>' + rows : '') + (zr ? '<h5>구역 재고</h5>' + zr : '');
    if (box.innerHTML !== html) box.innerHTML = html;
    const cnt = $('#fbLogiCount'); if (cnt) cnt.textContent = amrs.length ? `운반 ${total}회` : '';
  }
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
    const cnt = $('#fbSafetyCount'); if (cnt) cnt.textContent = list.length ? '⚠ ' + list.length : '';
    const box = $('#fbSafety'); if (box) box.innerHTML = list.length ? list.map(w => `<span class="ng">⚠ ${esc(w.text)}</span>`).join('') : '<span class="ok">위험 없음</span>';
    const ws = $('#fbWorkerSafety'), sel = selectedId && byId(selectedId);
    if (ws && sel && sel.type === 'worker') { const mine = list.filter(w => w.worker.id === sel.id); ws.innerHTML = mine.length ? mine.map(w => `<span style="color:var(--ng)">⚠ ${esc(w.circle.name)} 가동범위 안</span>`).join('<br>') : '<span style="color:var(--ok)">안전 — 가동범위 밖</span>'; }
    return true;
  }

  window.FactoryBuilder = { factory: () => ({ ...doc.factory }), doc: () => (syncActive(), clone(doc)), exportAll, loadDoc, docFromLegacy, busy };
  if (window.__station) init(); else addEventListener('load', init);
})();
