// A small ONE BUILDER line for the layout audit (npm run audit:sim): two belts in a row, a side feeder merging into the
// second (totes and cartons), a 6-axis robot picking at the first belt, two workbenches at the second (one before, one after the merge point).
const conv = (id, name, x, z, rot, len, extra = {}) => ({ id, type: 'conveyor', name, x, z, rot, params: Object.assign({ shape: 'straight', length: len, width: 0.6, height: 0.8, speed: 0.3, kind: 'roller', dir: 1, source: false, interval: 6, item: 0.4, sink: false }, extra) });
const merge = {
  version: 2, factory: { width: 20, depth: 14, height: 6 },
  objects: [
    conv('c1', '투입 컨베이어', -4, 0, 0, 6, { source: true, interval: 5, itemLook: 'tote', item: 0.4, itemW: 0.3, itemH: 0.15 }),
    conv('c2', '배출 컨베이어', 2, 0, 0, 6, { sink: true }),
    conv('c3', '보조 투입', 3, 1.85, Math.PI / 2, 3, { source: true, interval: 15 }),
    { id: 'r1', type: 'ufmodel', name: '이재 로봇', x: -4, z: -0.6, rot: 0, params: { model: 'e3_fr10', scale: 1, simCt: 8 } },
    { id: 'w1', type: 'bench', name: '조립 작업대', x: 0.6, z: -0.8, rot: Math.PI, params: { kind: 'assembly', length: 1.2, depth: 0.8, height: 0.9, worker: true, cycle: 20 } },
    { id: 'w2', type: 'bench', name: '검사 작업대', x: 4.3, z: -0.8, rot: Math.PI, params: { kind: 'pack', length: 1.2, depth: 0.8, height: 0.9, worker: true, cycle: 9 } },
  ],
};
// a bend and machines close together: belt → 90° curve → belt; a robot with NG and failures; two workbenches 0.6 m apart
// (no waiting place between them: a direct link); an inspection bench near the end of the line
const bench = (id, name, x, z, cycle) => ({ id, type: 'bench', name, x, z, rot: Math.PI / 2, params: { kind: 'assembly', length: 0.5, depth: 0.8, height: 0.9, worker: true, cycle } });
const bend = {
  version: 2, factory: { width: 20, depth: 14, height: 6 },
  objects: [
    conv('a', '투입', -3, 0, 0, 4, { source: true, interval: 7, itemLook: 'product', item: 0.32 }),
    conv('k', '곡선', -0.375, 0.275, 0, 0, { shape: 'curve', radius: 0.9, turn: 'right' }),
    conv('b', '배출', -0.1, 2.9, -Math.PI / 2, 4, { sink: true }),
    { id: 'r', type: 'ufmodel', name: '용접 로봇', x: -3, z: -0.6, rot: 0, params: { model: 'e3_fr10', scale: 1, simCt: 8, simOk: 92, simMtbf: 15, simMttr: 1.5, simRobot: 'weld' } },
    Object.assign(bench('m1', '체결 1', 0.65, 1.9, 6), { params: { kind: 'assembly', length: 0.5, depth: 0.8, height: 0.9, worker: true, cycle: 6, simLook: 'box' } }), bench('m2', '체결 2', 0.65, 2.5, 6), bench('m3', '검사', 0.65, 4.7, 5),
  ],
};
// a robot moving parts between two belts that are not joined: the end of A and the start of B (parallel, 1.2 m apart);
// a welding robot on B, then a check whose part turns into a carton (packing) as the work goes on
const transfer = {
  version: 2, factory: { width: 20, depth: 14, height: 6 },
  objects: [
    conv('a', '투입', -2.5, 0, 0, 3, { source: true, interval: 9, itemLook: 'tote', item: 0.4, itemW: 0.3, itemH: 0.15 }),
    conv('b', '배출', -2.5, 1.2, Math.PI, 3, { sink: true }),
    { id: 't1', type: 'ufmodel', name: '이송 로봇', x: -0.81, z: 0.9, rot: Math.PI / 2, params: { model: 'e3_fr10', scale: 1, simCt: 7 } },
    { id: 'w1', type: 'ufmodel', name: '용접 로봇', x: -2.0, z: 1.75, rot: Math.PI, params: { model: 'e3_fr10', scale: 1, simCt: 10, simRobot: 'weld' } },
    Object.assign(bench('q1', '포장', -3.6, 2.0, 8), { params: { kind: 'pack', length: 0.5, depth: 0.8, height: 0.9, worker: true, cycle: 8, simLook: 'box' } }),
  ],
};
module.exports = { merge, bend, transfer };
