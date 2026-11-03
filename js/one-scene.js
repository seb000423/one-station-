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
    /* ---- machine ports (입구 · 출구): where parts come in and leave. Stored in card.inlet / card.outlet as
       "<nodeId>/in", "<nodeId>/out" (a conveyor end) or "<nodeId>/top" (top centre of any other block); null = automatic:
       the infeed end of the first conveyor of the chain → the outfeed end of its last one, else the bounding box sides
       along X (X = 투입 → 배출). Positions are mm in the machine's frame, dir is the travel direction (unit, XY). */
    const blockP = n => Object.assign({}, L.BLOCKS[n.blockType]?.params, n.params);
    function portCandidates(doc) { const out = [];
      for (const n of doc.nodes) { const d = L.BLOCKS[n.blockType]; if (!d) continue; const code = n.params.tag || '';
        if (d.conveyor || d.curve) { out.push({ key: `${n.id}/in`, label: `${code} 투입 끝`, kind: 'in' }, { key: `${n.id}/out`, label: `${code} 배출 끝`, kind: 'out' }); }
        else if (d.work || d.sensor || d.stops) continue;
        else if (d.top(blockP(n)) > 0.05 || d.cat === 'process' || d.cat === 'transport') out.push({ key: `${n.id}/top`, label: `${code} ${d.name.replace(/\s*\(.*\)$/, '')} 윗면`, kind: 'any' }); }
      return out; }
    function portAt(doc, key) { if (!key) return null; const [id, end] = key.split('/'), n = doc.nodes.find(x => x.id === id); if (!n) return null; const d = L.BLOCKS[n.blockType]; if (!d) return null;
      const p = blockP(n), q = n.transform.position, r = n.transform.rotation[2] * Math.PI / 180, a = [Math.cos(r), Math.sin(r)], top = q[2] + d.top(p) * 1000;
      if (d.curve && (end === 'in' || end === 'out')) { const g = L.curveGeom(n), u = end === 'in' ? 0 : 1, pt = g.point(u); return { key, pos: [pt[0], pt[1], g.top], dir: g.heading(u) }; }
      if (end === 'in' || end === 'out') { const s = end === 'in' ? -1 : 1, L2 = (+p.length || 1000) / 2; return { key, pos: [q[0] + a[0] * s * L2, q[1] + a[1] * s * L2, top], dir: a }; }
      return { key, pos: [q[0], q[1], top], dir: a }; }
    function autoPorts(doc) { const convs = doc.nodes.filter(n => (L.BLOCKS[n.blockType]?.conveyor || L.BLOCKS[n.blockType]?.curve) && !n.parent);
      if (convs.length) { const ends = convs.map(c => ({ c, i: portAt(doc, `${c.id}/in`), o: portAt(doc, `${c.id}/out`) })), near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 600;
        const first = ends.find(e => !ends.some(f => f !== e && near(f.o.pos, e.i.pos))) || ends[0], last = ends.slice().reverse().find(e => !ends.some(f => f !== e && near(e.o.pos, f.i.pos))) || ends[ends.length - 1];
        return { inlet: first.i, outlet: last.o }; }
      const [W, , H] = doc.meta.bbox; return { inlet: { key: null, pos: [-W / 2, 0, Math.min(900, H)], dir: [1, 0] }, outlet: { key: null, pos: [W / 2, 0, Math.min(900, H)], dir: [1, 0] } }; }
    function portsOf(doc) { const a = autoPorts(doc); return { inlet: portAt(doc, doc.card?.inlet) || a.inlet, outlet: portAt(doc, doc.card?.outlet) || a.outlet, auto: { inlet: !portAt(doc, doc.card?.inlet), outlet: !portAt(doc, doc.card?.outlet) } }; }
    // a library (black box) machine of size [W, D, H]: in on the −X side, out on the +X side, at working height
    const boxPorts = size => ({ inlet: { pos: [-size[0] / 2, 0, 900], dir: [1, 0] }, outlet: { pos: [size[0] / 2, 0, 900], dir: [1, 0] } });
    // instance placement: machine-frame mm → factory mm
    const toFactory = (pos, inst) => { const t = inst.transform, r = t.rotation[2] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [t.position[0] + pos[0] * c - pos[1] * s, t.position[1] + pos[0] * s + pos[1] * c, (t.position[2] || 0) + pos[2]]; };
    /** Ports of a placed machine in factory mm (null if unknown). */
    function instancePorts(it) { let P = null;
      if (it.local) { const m = opt.lib()[it.local.id], doc = m && (m.versions[it.local.v] || m.versions[Object.keys(m.versions).pop()]); if (doc) P = portsOf(doc); }
      else if (it.def && L.FACTORY[it.def]?.size) P = boxPorts(L.FACTORY[it.def].size);
      else if (it.path === 'storage') P = boxPorts([2400, 1200, 0]);
      if (!P) return null; const r = (it.item.transform.rotation[2] || 0) * Math.PI / 180; return { inlet: toFactory(P.inlet.pos, it.item), outlet: toFactory(P.outlet.pos, it.item), dir: [Math.cos(r), Math.sin(r)] }; }
    /** The route a part takes through a machine, inlet → outlet (machine frame mm): along its conveyor chain when it has one
       (each conveyor's outfeed end, then the point where the part lands on the next conveyor), else straight across. */
    function machinePath(doc) { const P = portsOf(doc), convs = doc.nodes.filter(n => (L.BLOCKS[n.blockType]?.conveyor || L.BLOCKS[n.blockType]?.curve) && !n.parent);
      const pts = [P.inlet.pos]; if (!convs.length) { pts.push(P.outlet.pos); return pts; }
      const axis = c => { const i = portAt(doc, `${c.id}/in`).pos, o = portAt(doc, `${c.id}/out`).pos; return { c, i, o, w: (+blockP(c).w || 500) }; }, A = convs.map(axis);
      const onto = (p, a) => { const dx = a.o[0] - a.i[0], dy = a.o[1] - a.i[1], L2 = dx * dx + dy * dy || 1, t = ((p[0] - a.i[0]) * dx + (p[1] - a.i[1]) * dy) / L2, q = [a.i[0] + dx * t, a.i[1] + dy * t, a.i[2]];
        return { t, q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) }; };
      const owner = k => k && A.find(a => k.startsWith(a.c.id + '/'));
      let cur = owner(P.inlet.key) || A.map(a => ({ a, d: Math.hypot(a.i[0] - P.inlet.pos[0], a.i[1] - P.inlet.pos[1]) })).sort((x, y) => x.d - y.d)[0].a;
      const last = owner(P.outlet.key), seen = new Set();
      for (let k = 0; cur && k < 30; k++) { seen.add(cur); const e = onto(pts[pts.length - 1], cur); if (e.d > 1) pts.push(e.q);
        if (L.BLOCKS[cur.c.blockType].curve) { const g = L.curveGeom(cur.c); for (const u of [0.25, 0.5, 0.75]) { const q = g.point(u); pts.push([q[0], q[1], g.top]); } }
        if (cur === last) break; pts.push(cur.o);
        let nx = null; for (const a of A) { if (seen.has(a)) continue; const h = onto(cur.o, a); if (h.t > -0.25 && h.t < 1.0 && h.d < a.w / 2 + 300) { nx = a; break; } } cur = nx; }
      pts.push(P.outlet.pos); return pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 1); }
    const localDoc = l => { const m = l && opt.lib()[l.id]; return m && (m.versions[l.v] || m.versions[Object.keys(m.versions).pop()]); };
    /** The machine route in factory mm (inlet → outlet), or null. */
    function instancePath(it) { const doc = it.local && localDoc(it.local); if (doc) return machinePath(doc).map(p => toFactory(p, it.item));
      const P = instancePorts(it); return P ? [P.inlet, P.outlet] : null; }
    return { factoryItems, slabRect, placeObj, buildFactoryObj, buildLocalMachine, toS, portCandidates, portAt, portsOf, instancePorts, machinePath, instancePath, localDoc };
  }
  window.OneScene = { create };
})();
