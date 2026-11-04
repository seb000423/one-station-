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
  /** The products a station holds beyond its converted parts: [node, label, kind, size, pos, src] with the product GLB. */
  function products(src) { const put = (x, y, z) => [PRODUCT[0], '제품', 'static', PRODUCT[3], [x, y, z], 'product'], out = [];
    if (src === 'inspection') for (const [dx, dy] of TRAY_GRID) out.push(put(-7739 + dx, 1275 + dy, 969)); // the finished goods on OP140 배출 트레이, as they were
    if (src === 'assembly') { for (const [dx, dy] of TRAY_GRID) out.push(put(7491 + dx, 1017 + dy, 2164)); // a full tray on top of the C6 tray stack
      for (const [x, z] of [[3175, 2658], [1572, 2658], [2522, 2663], [918, 2663], [-518, 2663], [-2039, 2663], [-1257, 2663], [-2778, 2663]]) out.push(put(x, 1627, z)); } // one on each blue tray
    return out; }
  const SKIP = new Set(['P_OP140_products']); // the merged finished-goods mesh, replaced by the 21 products
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
    d.parts.filter(p => !SKIP.has(p[0])).concat(products(st.src)).forEach(([node, label, kind, size, pos, src], i) => {
      const k = kind === 'robot' || kind === 'rotary' ? kind : 'static', code = CODE[k], tag = code + (n[code] = (n[code] || 0) + 1);
      const params = { tag, src: src || st.src, node, kind: k, cls: window.OneTwin.core.classify(label, k, pos[2]).cls, w0: size[0], d0: size[1], h0: size[2], w: size[0], d: size[1], h: size[2], ...(k === 'static' ? {} : { cycle: k === 'robot' ? 6 : 4 }) };
      nodes.push({ id: `${st.src}-${String(i + 1).padStart(3, '0')}`, type: 'block', blockType: 'model-part', name: label, params, transform: { position: pos, rotation: [0, 0, 0] }, parent: null });
      io.push(...L.BLOCKS['model-part'].io(tag, params));
    });
    // 결합 (설계 구조 규칙 R3): what sits on or hangs on a part is joined to it, so it moves and rises with it
    const C = window.OneTwin.core, mounts = C.findMounts(nodes.map(x => ({ id: x.id, name: x.name, kind: x.params.kind, cls: x.params.cls, size: [x.params.w, x.params.d, x.params.h], pos: x.transform.position })));
    for (const x of nodes) { const m = mounts.get(x.id); if (m && m.host) x.parent = m.host; }
    return S.Machine.parse({ schema: S.MACHINE_SCHEMA, meta: { id: st.id, name: st.name, bbox: d.size, cellFixed: false, fidelity: 'L2', version: 1 },
      card: { cycle_time: st.cycle, ok_rate: st.ok, operators: st.ops, footprint: [d.size[0], d.size[1]] }, nodes, io });
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
      out.push(e.exec('add_block', { type: 'model-part', name: n.name, position: [t.position[0] + q[0] * c - q[1] * sn, t.position[1] + q[0] * sn + q[1] * c, (t.position[2] || 0) + q[2]], yaw: yaw + (n.transform.rotation[2] || 0), params })); }
    e.exec('set_param', { id: machineId, key: 'exploded', value: true });
    return out;
  }
  /** 기준 설비 부품: one entry per distinct object label of each station (a representative node), for the Machine Builder palette. */
  function partsCatalog() { const out = []; for (const st of STATIONS) { const seen = new Set();
    D[st.src].parts.forEach(([node, label, kind, size, pos], i) => { const key = label.replace(/^OP\d+ /, ''); if (seen.has(key)) return; seen.add(key);
      const k = kind === 'robot' || kind === 'rotary' ? kind : 'static'; out.push({ key: `${st.src}:${i}`, src: st.src, node, kind: k, name: key, station: st.name, size, cls: window.OneTwin.core.classify(label, k, pos[2]).cls }); }); }
    out.unshift({ key: 'product:0', src: 'product', node: PRODUCT[0], kind: 'static', name: '제품 (낱개)', station: '작업 대상', size: PRODUCT[3], cls: 'work' });
    return out; }
  const splittable = doc => !!doc && doc.nodes.length > 0 && doc.nodes.every(n => n.blockType === 'model-part');
  window.OnePlant = { STATIONS, withPlant, builtins, defaultFactory, explode, splittable, partsCatalog, size: src => D[src].size };
})();
