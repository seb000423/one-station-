// Partner plant stations as built-in machines of the library (내 설비): every part of a station is its own 모델 객체 block
// (js/one-library.js 'model-part'), so it can be moved, resized and timed one by one in Machine Builder. The machines are
// built from js/plant-data.js on demand; a version the user saves goes next to the built-in v1 in localStorage.
(() => {
  'use strict';
  const D = window.ONE_PLANT_DATA, L = window.OneLibrary;
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
    d.parts.forEach(([node, label, kind, size, pos], i) => {
      const k = kind === 'robot' || kind === 'rotary' ? kind : 'static', code = CODE[k], tag = code + (n[code] = (n[code] || 0) + 1);
      const params = { tag, src: st.src, node, kind: k, w0: size[0], d0: size[1], h0: size[2], w: size[0], d: size[1], h: size[2], ...(k === 'static' ? {} : { cycle: k === 'robot' ? 6 : 4 }) };
      nodes.push({ id: `${st.src}-${String(i + 1).padStart(3, '0')}`, type: 'block', blockType: 'model-part', name: label, params, transform: { position: pos, rotation: [0, 0, 0] }, parent: null });
      io.push(...L.BLOCKS['model-part'].io(tag, params));
    });
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
     64 × 28 m floor, 검사 at the left, 조립 in the middle, 도포 desks at the right, the furnace row below them. Built with the
     edit API like any user edit. */
  function defaultFactory() {
    const { schema: S, core: C } = window.OneTwin;
    const e = new C.Editor('factory', S.Factory.parse({ schema: S.FACTORY_SCHEMA, meta: { id: S.uuidv7(), name: '감마 라인 (협력사 설비)', levels: [{ id: 'L1', name: '1F', height: 7000 }] },
      building: { slabs: [{ id: S.uuidv7(), polygon: [[0, 0], [64000, 0], [64000, 28000], [0, 28000]] }] } }));
    e.exec('draw_wall', { from: [0, 28000], to: [64000, 28000], thickness: 200 }); e.exec('draw_wall', { from: [0, 0], to: [0, 28000], thickness: 200 });
    e.exec('add_column_grid', { origin: [0, 0], nx: 9, ny: 2, dx: 8000, dy: 28000 });
    e.exec('add_opening', { kind: 'shutter', position: [21000, 28000], params: { w: 3500, h: 4000 } }); e.exec('add_opening', { kind: 'door', position: [41000, 28000], params: { w: 1000, h: 2100 } });
    e.exec('add_marking', { kind: 'aisle', polyline: [[1000, 14000], [63000, 14000]], params: { variant: 'aisle', length: 62000, width: 3000 } });
    const at = { 'plant-inspection': [11000, 20500], 'plant-assembly': [31000, 20500], 'plant-paste': [52000, 20500], 'plant-brazing': [44000, 6500] };
    const order = STATIONS.map(st => e.exec('place_machine', { ref: `local:${st.id}@1`, name: st.name, position: at[st.id] }));
    for (let i = 0; i + 1 < order.length; i++) e.exec('connect_flow', { from: `${order[i]}.outlet`, to: `${order[i + 1]}.inlet` });
    e.exec('add_mover', { kind: 'forklift', position: [10000, 6000] }); e.exec('add_mover', { kind: 'worker', position: [24000, 14000] });
    e.exec('add_storage', { kind: 'rack', position: [6000, 6000], params: { variant: 'pallet', bays: 2, levels: 3 } });
    return e.doc;
  }
  window.OnePlant = { STATIONS, withPlant, builtins, defaultFactory, size: src => D[src].size };
})();
