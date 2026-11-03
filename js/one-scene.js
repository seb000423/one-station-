// ONE scene: turns a factory.json (and the machines saved in Machine Builder) into three.js objects.
// Shared by ONE BUILDER (build.html) and ONE SIMULATION (sim.html?src=build) so both show the same thing.
// Needs window.THREE, window.OneTwin (schema) and window.OneLibrary.
(() => {
  'use strict';
  function create(opt) {
    const T = window.THREE, S = window.OneTwin.schema, L = window.OneLibrary;
    const toS = p => new T.Vector3(...S.storedToScene([p[0], p[1], p[2] ?? 0]));
  const OPEN = { door: 'door', shutter: 'shutter', dock: 'dock', exit: 'emergency-exit' };
  const STOR = { rack: 'rack', floor: 'floor-storage', buffer: 'floor-storage' };
  const MOV = { worker: 'worker', amr: 'amr', forklift: 'forklift' };
  function factoryItems(doc) {
    const out = [], push = (item, path, def, extra = {}) => out.push(Object.assign({ id: item.id, item, path, def }, extra));
    for (const w of doc.building.walls) push(w, 'building.walls', 'outer-wall');
    for (const c of doc.building.columns) push(c, 'building.columns', 'column');
    for (const r of doc.building.roofs) push(r, 'building.roofs', 'roof');
    for (const o of doc.building.openings) push(o, 'building.openings', OPEN[o.kind] || 'door');
    for (const m of doc.markings) push(m, 'markings', 'floor-marking');
    for (const m of doc.machines) { const lr = /^lib:([a-z0-9-]+)@/.exec(m.ref), loc = /^local:([^@]+)@(\d+)/.exec(m.ref); push(m, 'machines', lr ? lr[1] : null, { local: loc ? { id: loc[1], v: +loc[2] } : null }); }
    for (const s of doc.storage) push(s, 'storage', STOR[s.kind]);
    for (const m of doc.movers) push(m, 'movers', MOV[m.kind]);
    for (const d of doc.utilities.drops) push(d, 'utilities.drops', d.kind === 'air' ? 'air-drop' : 'power-drop');
    for (const b of doc.blocks) push(b, 'blocks', b.type);
    return out;
  }
  const slabRect = doc => { const p = doc.building.slabs[0]?.polygon || [[0, 0], [30000, 0], [30000, 20000], [0, 20000]]; const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  function placeObj(obj, pos, yawDeg = 0) { obj.position.copy(toS(pos)); obj.rotation.y = S.storedYawToScene(yawDeg); }
  function buildFactoryObj(it, doc) {
    const x = it.item, lvH = (doc.meta.levels[0]?.height || 7000) / 1000;
    if (it.path === 'building.walls') {
      const dx = x.to[0] - x.from[0], dy = x.to[1] - x.from[1], len = Math.hypot(dx, dy) / 1000, H = x.height ? x.height / 1000 : lvH;
      const o = L.special.wall(len, H, x.thickness / 1000); placeObj(o, [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2, 0]); o.rotation.y = Math.atan2(dy, dx); return o;
    }
    if (it.path === 'building.roofs') { const r = slabRect(doc), w = (x.params.w || r.x1 - r.x0) / 1000, d = (x.params.d || r.y1 - r.y0) / 1000; const o = L.special.roof(x.params, w, d, (x.params.eave || lvH * 1000) / 1000); placeObj(o, x.transform.position, x.transform.rotation[2]); o.userData.roof = true; return o; }
    if (it.path === 'building.columns') { const o = L.special.column({ size: x.size[0], h: x.height ? x.height / 1000 : lvH }); placeObj(o, x.transform.position); return o; }
    if (it.path === 'markings') { const o = L.special.marking(x.kind, x.params); placeObj(o, x.transform.position, x.transform.rotation[2]); return o; }
    if (it.local) { const o = buildLocalMachine(it.local); placeObj(o, x.transform.position, x.transform.rotation[2]); return o; }
    const params = Object.assign({}, x.params, it.path === 'storage' || it.path === 'movers' ? {} : {});
    const o = L.buildFactory(it.def, params); placeObj(o, x.transform.position, x.transform.rotation[2]); return o;
  }
  function buildLocalMachine({ id, v }) {
    const m = opt.lib()[id], doc = m && (m.versions[v] || m.versions[Object.keys(m.versions).pop()]), g = new T.Group();
    if (!doc) { const b = L.buildFactory('control-cabinet'); g.add(b); return g; }
    for (const n of doc.nodes) { const o = L.buildBlock(n.blockType, n.params); placeObj(o, n.transform.position, n.transform.rotation[2]); g.add(o); }
    return g;
  }
    return { factoryItems, slabRect, placeObj, buildFactoryObj, buildLocalMachine, toS };
  }
  window.OneScene = { create };
})();
