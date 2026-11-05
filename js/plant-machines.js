// Partner plant stations as built-in machines of the library (내 설비): every part of a station is its own 모델 객체 block
// (js/one-library.js 'model-part'), so it can be moved, resized and timed one by one in Machine Builder. The machines are
// built from js/plant-data.js on demand; a version the user saves goes next to the built-in v1 in localStorage.
(() => {
  'use strict';
  const D = window.ONE_PLANT_DATA, L = window.OneLibrary;
  // the work piece (작업 대상): one product taken out of the inspection cell's finished-goods tray (tools/plant-assets, 21 on a tray),
  // its own GLB so it can be set on trays and jigs one by one, picked by robots and carried by conveyors
  D.product = { size: [404, 240, 163], parts: [['P_product', '제품', 'static', [404, 240, 163], [0, 0, 0]]] };
  const PRODUCT = D.product.parts[0], TRAY_GRID = (() => { const out = []; for (const dx of [-505, 0, 505]) for (const dy of [813, 543, 270, -3, -274, -550, -814]) out.push([dx, dy]); return out; })();
  /** No products are set out in advance (user 2026-11-04): products enter the line and travel through the process. The
      조립 셀 is fed from its tray P34 (P_C6_Tray_3): one product on each of its three rows (params.feed). */
  function products(src) { return src === 'assembly' ? [863, 1111, 1359].map(y => [PRODUCT[0], '제품', 'static', PRODUCT[3], [7491, y, 1501], 'product', { feed: true }]) : []; }
  /** what some parts of the 조립 셀 do in 동작 시험: P25 dispenser (도포: the pump and needle come down), P26 conveyor rail
      (carries a work to its front end), P27 / P23 inspection and P24 laser marking (timed jobs started by the switch),
      jigs P19–P22 (클램프 · 작업 끝 signals for the weld robots) */
  const PART_RUN = { assembly: { P_Moho_dis_Solo: { proc: 'dispense', cycle: 5 }, P_Rail_blk: { convey: { speed: 300, dir: 1 } }, P_t04_FCT01: { proc: 'check', cycle: 5 }, P_EX: { proc: 'check', cycle: 5 },
    P_Object192: { proc: 'mark', cycle: 6 }, P_JIG01: { jig: true }, P_JIG01_2: { jig: true }, P_JIG02: { jig: true }, P_JIG02_2: { jig: true } } };
  /* The 조립 셀 process as the user described it (2026-11-04), on the cell as built (points = targets in mm, cell frame; the
     run solves the robot joints):
     RB3 takes a product from the P34 tray rows → P25 dispenser rest under the needle → 도포 → re-grips → P26 rail, which
     carries it to the front. 작업자 1: rail end → P27 inspection (switch on) → P22 jig (RB1 welds); the next product from
     the rail → P27 → P20 (RB1 welds it next); P22 done first → green bin on the cell base between P22 and P21, then P20's.
     작업자 2: bin → P21 (RB2 welds) and the next → P19; each done → P23 final inspection → P24 laser marking → finished
     parts on the front-left table. Walks keep to the floor: the aisle in front of the side tables is y 3800, the way to
     P24 runs down x −5400. */
  /* where the product sits in each jig: the products that came built into the partner's jig model (taken out of the mesh),
     their box centre / bottom in the cell frame — a work let go near it settles exactly there */
  const NEST = { assembly: { P_JIG01: [-2439, 1619, 1616], P_JIG01_2: [1196, 1619, 1616], P_JIG02: [-935, 1619, 1616], P_JIG02_2: [2695, 1619, 1616] } };
  function assemblyRun(ids) { const pt = (id, name, tcp) => ({ id, name, j: [], tcp }), J = (point, speed = 50) => ({ op: 'MOVJ', point, speed }), Lm = (point, speed = 300) => ({ op: 'MOVL', point, speed });
    const G = on => ({ op: 'GRIP', on }), SET = (tag, value) => ({ op: 'SET', tag, value }), WAIT = (tag, value) => ({ op: 'WAIT', tag, value }), H = { id: 'H', name: '홈', j: [0, 0, 0, 0, 0, 0] };
    const rb3 = { node: ids.rb3, name: '트레이 → 도포 → 레일', points: [H, pt('TA1', '트레이 1줄 위', [7491, 863, 1850]), pt('TA2', '트레이 2줄 위', [7491, 1111, 1850]), pt('T1', '트레이 1줄 (손가락 사이)', [7491, 863, 1580]), pt('T2', '트레이 2줄 (손가락 사이)', [7491, 1111, 1580]),
        pt('DA', '받침대 위', [5490, -1713, 1800]), pt('D', '니들 밑 받침대', [5490, -1713, 1578]), pt('RA', '레일 위', [6237, 500, 1550]), pt('R', '레일', [6237, 500, 1321])],
      lines: [] };
    for (const T of ['T1', 'T2']) rb3.lines.push(J('TA' + T[1]), Lm(T, 250), G(true), Lm('TA' + T[1], 250), J('DA'), Lm('D', 200), G(false), Lm('DA', 200), J('H'), SET('P25_START', true), WAIT('P25_DONE', true), SET('P25_START', false), // 도포 중에는 홈 자세로 비켜 있음
      J('DA'), Lm('D', 200), G(true), Lm('DA', 200), J('RA'), Lm('R', 200), G(false), Lm('RA', 200));
    rb3.lines.push(J('H'));
    const weld = (node, name, jigs) => { const points = [H], lines = [];
      for (const [P, xr] of jigs) { points.push(pt(`${P}A`, `${P} 접근`, [xr - 150, 1505, 1850]), pt(`${P}S`, `${P} 용접 시작`, [xr - 150, 1505, 1785]), pt(`${P}E`, `${P} 용접 끝`, [xr + 150, 1505, 1785]), pt(`${P}B`, `${P} 빠짐`, [xr + 150, 1505, 1850]));
        lines.push(WAIT(`${P}_CLAMP`, true), J(`${P}A`, 40), Lm(`${P}S`, 200), { op: 'ARC', on: true }, Lm(`${P}E`, 40), { op: 'ARC', on: false }, Lm(`${P}B`, 200), SET(`${P}_FIN`, true), J('H', 40)); }
      return { node, name, points, lines }; };
    const rb1 = weld(ids.rb1, 'P22 → P20 용접', [['P22', 2695], ['P20', 1196]]), rb2 = weld(ids.rb2, 'P21 → P19 용접', [['P21', -935], ['P19', -2439]]);
    const jig = (P, x) => [pt(`${P}S`, `${P} 앞`, [x, 2350, 0]), pt(P, `${P} 지그`, [x, 1619, 1795]), pt(`${P}B`, `${P} 라이트 커튼 밖`, [x, 2750, 0])];
    const wk1 = { node: ids.wk1, name: '레일 → P27 검사 → P22 / P20 → 적재함', points: [pt('RS', '레일 끝 앞', [6237, 2350, 0]), pt('RE', '레일 끝', [6237, 1712, 1435]), pt('FS', 'P27 앞', [5023, 2350, 0]), pt('F', 'P27 검사 지그', [5023, 1502, 1809]),
        pt('C1', '통로 (P27)', [5023, 3800, 0]), pt('C2', '통로 (P22)', [2696, 3800, 0]), pt('C3', '통로 (레일)', [6237, 3800, 0]), pt('C4', '통로 (P20)', [1197, 3800, 0]), ...jig('P22', 2695), ...jig('P20', 1196),
        pt('BS', '적재함 옆', [750, 2800, 0]), pt('B1', '초록 적재함 1', [250, 2600, 1495]), pt('B2', '초록 적재함 2', [250, 3000, 1495])],
      lines: [] };
    const check = () => [J('FS'), Lm('F'), G(false), SET('P27_START', true), WAIT('P27_DONE', true), SET('P27_START', false), Lm('F'), G(true)];
    const fromRail = () => [J('RS'), WAIT('P26_PRESENT', true), Lm('RE'), G(true)];
    wk1.lines.push(...fromRail(), ...check(), J('C1'), J('C2'), J('P22S'), Lm('P22'), G(false), J('P22B'), SET('P22_CLAMP', true),
      J('C2'), J('C3'), ...fromRail(), ...check(), J('C1'), J('C4'), J('P20S'), Lm('P20'), G(false), J('P20B'), SET('P20_CLAMP', true),
      WAIT('P22_FIN', true), J('P22S'), Lm('P22'), G(true), SET('P22_CLAMP', false), J('BS'), Lm('B1'), G(false), SET('WK1_PASS', true),
      WAIT('P20_FIN', true), J('P20S'), Lm('P20'), G(true), SET('P20_CLAMP', false), J('BS'), WAIT('WK1_PASS', false), Lm('B2'), G(false), SET('WK1_PASS', true), J('P20B'));
    const wk2 = { node: ids.wk2, name: '적재함 → P21 / P19 → P23 검사 → P24 각인', points: [pt('W0', '적재함 옆', [-400, 2800, 0]), pt('B1', '초록 적재함 1', [250, 2600, 1495]), pt('B2', '초록 적재함 2', [250, 3000, 1495]), ...jig('P21', -935), ...jig('P19', -2439),
        pt('ES', 'P23 앞', [-4290, 2300, 0]), pt('E', 'P23 최종 검사', [-4290, 1539, 1680]), pt('K1', '왼쪽 통로', [-5400, 2300, 0]), pt('K2', '왼쪽 통로 안', [-5400, 300, 0]), pt('MS', 'P24 앞', [-6150, 300, 0]), pt('M', 'P24 레이저 각인', [-7050, 300, 1650]),
        pt('OS', '완성품대 앞', [-5400, 1450, 0]), pt('O1', '완성품 1', [-5000, 1450, 1340]), pt('O2', '완성품 2', [-5000, 1750, 1340])],
      lines: [] };
    const finish = (P, O) => [WAIT(`${P}_FIN`, true), J('K1'), J(`${P}S`), Lm(P), G(true), SET(`${P}_CLAMP`, false), J('ES'), Lm('E'), G(false), SET('P23_START', true), WAIT('P23_DONE', true), SET('P23_START', false), Lm('E'), G(true),
      J('K1'), J('K2'), J('MS'), Lm('M'), G(false), SET('P24_START', true), WAIT('P24_DONE', true), SET('P24_START', false), Lm('M'), G(true), J('K2'), J('OS'), Lm(O), G(false)];
    wk2.lines.push(WAIT('WK1_PASS', true), Lm('B1'), G(true), SET('WK1_PASS', false), J('P21S'), Lm('P21'), G(false), J('P21B'), SET('P21_CLAMP', true),
      J('W0'), WAIT('WK1_PASS', true), Lm('B2'), G(true), SET('WK1_PASS', false), J('P19S'), Lm('P19'), G(false), J('P19B'), SET('P19_CLAMP', true),
      ...finish('P21', 'O1'), ...finish('P19', 'O2'), J('K1'));
    const all = ['RB1', 'RB2', 'RB3', 'WK1', 'WK2'];
    const seq = [{ id: 's1', name: '공정 시작 · RB3 트레이 투입, 작업자 1·2, 용접 로봇 대기', wait: [], set: all.map(t => ({ tag: `${t}_START`, value: true })) },
      { id: 's2', name: '제품 2개 각인 끝 · 완성품대', wait: [{ tag: 'WK2_DONE', op: '==', value: true }], set: all.map(t => ({ tag: `${t}_START`, value: false })), delay: 0.5 },
      { id: 's3', name: '한 바퀴 끝 · ↺ 워크 다시 투입 후 다시 자동 운전', wait: [{ tag: 'WK2_START', op: '==', value: true }], set: [] }];
    return { programs: [rb3, rb1, rb2, wk1, wk2], steps: seq }; }
  const SKIP = new Set(['P_OP140_products']); // the merged finished-goods mesh (products are not set out in advance)
  // in the order the work goes through them
  const STATIONS = [
    { id: 'plant-assembly', src: 'assembly', name: '1. 감마 조립 셀', cycle: 55, ok: 0.995, ops: 1 },
    { id: 'plant-paste', src: 'paste', name: '2. 수동 페이스트 도포', cycle: 120, ok: 0.99, ops: 5 },
    { id: 'plant-brazing', src: 'brazing', name: '3. 브레이징 투입 (진공로)', cycle: 5400, ok: 0.99, ops: 1 },
    { id: 'plant-inspection', src: 'inspection', name: '4. 감마 검사 셀', cycle: 40, ok: 0.98, ops: 1 },
  ];
  const CODE = { robot: 'RB', rotary: 'RT', mech: 'P', static: 'P' };
  let built = null;
  function machineDoc(S, st) {
    const d = D[st.src], n = {}, nodes = [], io = [];
    d.parts.filter(p => !SKIP.has(p[0])).concat(products(st.src)).forEach(([node, label, kind, size, pos, src, extra], i) => {
      const k = kind === 'robot' || kind === 'rotary' ? kind : 'static', code = CODE[k], tag = code + (n[code] = (n[code] || 0) + 1);
      const params = { tag, src: src || st.src, node, kind: k, cls: window.OneTwin.core.classify(label, k, pos[2]).cls, w0: size[0], d0: size[1], h0: size[2], w: size[0], d: size[1], h: size[2], ...(k === 'static' ? {} : { cycle: k === 'robot' ? 6 : 4 }), ...(PART_RUN[st.src]?.[node] || {}), ...(extra || {}) };
      const nest = NEST[st.src]?.[node]; if (nest) params.nest = nest.map((v, k) => Math.round(v - pos[k])); // the product's seat, from the part
      nodes.push({ id: `${st.src}-${String(i + 1).padStart(3, '0')}`, type: 'block', blockType: 'model-part', name: label, params, transform: { position: pos, rotation: [0, 0, 0] }, parent: null });
      io.push(...L.BLOCKS['model-part'].io(tag, params));
    });
    // 결합 (설계 구조 규칙 R3): what sits on or hangs on a part is joined to it, so it moves and rises with it
    const C = window.OneTwin.core, mounts = C.findMounts(nodes.map(x => ({ id: x.id, name: x.name, kind: x.params.kind, cls: x.params.cls, size: [x.params.w, x.params.d, x.params.h], pos: x.transform.position })));
    for (const x of nodes) { const m = mounts.get(x.id); if (m && m.host) x.parent = m.host; }
    let run = null;
    if (st.src === 'assembly') { const byNode = nm => nodes.find(x => x.params.node === nm)?.id;
      for (const [tag, pos, yaw] of [['WK1', [6237, 2500, 0], -90], ['WK2', [-400, 2800, 0], 0]]) { nodes.push({ id: `assembly-${tag.toLowerCase()}`, type: 'block', blockType: 'operator', name: tag === 'WK1' ? '작업자 1' : '작업자 2', params: { tag, h: 1750 }, transform: { position: pos, rotation: [0, 0, yaw] }, parent: null }); io.push(...L.BLOCKS.operator.io(tag, { h: 1750 })); }
      run = assemblyRun({ wk1: 'assembly-wk1', wk2: 'assembly-wk2', rb1: byNode('P_OTC_fd_v8'), rb2: byNode('P_OTC_fd_v8_2'), rb3: byNode('P_Fanuc_M_20IA') }); }
    return S.Machine.parse({ schema: S.MACHINE_SCHEMA, meta: { id: st.id, name: st.name, bbox: d.size, cellFixed: false, fidelity: 'L2', version: 1 },
      card: { cycle_time: st.cycle, ok_rate: st.ok, operators: st.ops, footprint: [d.size[0], d.size[1]] }, nodes, io, ...(run ? { programs: run.programs, sequence: { steps: run.steps } } : {}) });
  }
  function builtins() {
    if (built) return built; const S = window.OneTwin.schema; built = {};
    for (const st of STATIONS) built[st.id] = { name: st.name, builtin: true, versions: { 1: machineDoc(S, st) } };
    return built;
  }
  /** The library with the built-in stations in it: a saved entry keeps its own name and versions, v1 stays the original. */
  function withPlant(lib) {
    const out = {}, B = builtins();
    for (const [id, m] of Object.entries(B)) out[id] = lib[id] ? { name: lib[id].name, builtin: true, versions: Object.assign({}, m.versions, lib[id].versions) } : m;
    for (const [id, m] of Object.entries(lib)) if (!out[id]) out[id] = m;
    return out;
  }
  /* The default factory: the four stations in the order the work goes (1 조립 → 2 페이스트 도포 → 3 브레이징 → 4 검사) on a
     64 × 28 m floor in a U, nothing but the process equipment (no walls, aisles,
     movers or racks); cells hand parts on by conveyor. Built with the edit API like any user edit. */
  function defaultFactory() {
    const { schema: S, core: C } = window.OneTwin;
    const e = new C.Editor('factory', S.Factory.parse({ schema: S.FACTORY_SCHEMA, meta: { id: S.uuidv7(), name: '예시 공정 · 감마 라인', levels: [{ id: 'L1', name: '1F', height: 7000 }] },
      building: { slabs: [{ id: S.uuidv7(), polygon: [[0, 0], [64000, 0], [64000, 28000], [0, 28000]] }] } }));
    // a U along the process order: 1 조립 → 2 도포 along the back (left → right), then 3 브레이징 → 4 검사 along the front
    // (right → left, turned 180° so each inlet faces the cell before it)
    const at = { 'plant-assembly': [11500, 20500, 0], 'plant-paste': [36000, 20500, 0], 'plant-brazing': [44000, 6500, 180], 'plant-inspection': [11500, 6500, 180] };
    const order = STATIONS.map(st => e.exec('place_machine', { ref: `local:${st.id}@1`, name: st.name, position: at[st.id].slice(0, 2), yaw: at[st.id][2] }));
    for (const id of order) explode(e, id);
    for (let i = 0; i + 1 < order.length; i++) e.exec('connect_flow', { from: `${order[i]}.outlet`, to: `${order[i + 1]}.inlet`, via: 'conveyor' });
    return e.doc;
  }
  /** A placed cell → its objects as factory blocks of their own (모델 객체, params.cell = the cell), the cell keeps its card,
      ports and flows (params.exploded). Works on any placed machine made of 모델 객체 blocks; returns the new block ids. */
  function explode(e, machineId, lib = withPlant(JSON.parse(localStorage.getItem('one.build.machines') || '{}'))) {
    const m = e.doc.machines.find(x => x.id === machineId), r = m && /^local:([^@]+)@(\d+)/.exec(m.ref); if (!r) return [];
    const ent = lib[r[1]], doc = ent && (ent.versions[r[2]] || ent.versions[Object.keys(ent.versions).pop()]); if (!doc) return [];
    const t = m.transform, yaw = t.rotation[2] || 0, a = yaw * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), out = [];
    for (const n of doc.nodes) { if (n.blockType !== 'model-part') continue; const q = n.transform.position;
      const params = Object.assign({}, n.params, { cell: machineId }); delete params.tag;
      out.push(e.exec('add_block', { type: 'model-part', name: n.name, parent: machineId, position: [t.position[0] + q[0] * c - q[1] * sn, t.position[1] + q[0] * sn + q[1] * c, (t.position[2] || 0) + q[2]], yaw: yaw + (n.transform.rotation[2] || 0), params })); }
    e.exec('set_param', { id: machineId, key: 'exploded', value: true });
    return out;
  }
  /** 기준 설비 부품: one entry per distinct object label of each station (a representative node), for the Machine Builder palette. */
  function partsCatalog() { const out = []; for (const st of STATIONS) { const seen = new Set();
    D[st.src].parts.forEach(([node, label, kind, size, pos], i) => { const key = label.replace(/^OP\d+ /, ''); if (seen.has(key)) return; seen.add(key);
      const k = kind === 'robot' || kind === 'rotary' ? kind : 'static'; out.push({ key: `${st.src}:${i}`, src: st.src, node, kind: k, name: key, station: st.name, size, cls: window.OneTwin.core.classify(label, k, pos[2]).cls }); }); }
    out.unshift({ key: 'product:0', src: 'product', node: PRODUCT[0], kind: 'static', name: '제품 (낱개)', station: '작업 대상', size: PRODUCT[3], cls: 'work' });
    return out; }
  const splittable = doc => !!doc && doc.nodes.length > 0 && doc.nodes.every(n => n.blockType === 'model-part' || n.blockType === 'operator'); // a 작업자 stays with the machine (not a factory block)
  window.OnePlant = { STATIONS, withPlant, builtins, defaultFactory, explode, splittable, partsCatalog, size: src => D[src].size };
})();
