// Reads the baked module-line model (assets/models/egr-line-v3/egr_module_line.glb, clip Module_Cycle: 8 jig pallets, a part
// every 50 s) and writes assets/one-twin/module-line-map.json: what the DES needs (station and conveyor times measured from the
// real motion) and what the run view needs to replay that motion from DES events (each moving node's active intervals and the
// part that drives them). Run with `npm run gen:map`; the DES and the 3D view then share one source of timing.
//
// Clip time c ∈ [0, 400). Part k (1–8) is "lap time" τ = c − 50 (k − 1); every good part follows the same τ timeline.
import fs from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer';

const SRC = 'assets/models/egr-line-v3/egr_module_line.glb', OUT = 'assets/one-twin/module-line-map.json';
const T = 400, P = 50, N = 8, PITCH = 0.32;
await MeshoptDecoder.ready;

/* ---------------- glTF reading ---------------- */
const buf = fs.readFileSync(SRC), jl = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jl).toString());
const bin = buf.subarray(20 + jl + 8), views = {};
const view = i => { if (views[i]) return views[i]; const bv = J.bufferViews[i], e = bv.extensions?.EXT_meshopt_compression; let out;
  if (e) { out = new Uint8Array(e.count * e.byteStride); MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride, bin.subarray(e.byteOffset ?? 0, (e.byteOffset ?? 0) + e.byteLength), e.mode, e.filter); }
  else out = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  return (views[i] = out); };
const acc = i => { const a = J.accessors[i], v = view(a.bufferView), n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], sz = { 5126: 4, 5122: 2, 5120: 1, 5123: 2, 5121: 1 }[a.componentType];
  const stride = J.bufferViews[a.bufferView].byteStride ?? n * sz, dv = new DataView(v.buffer, v.byteOffset + (a.byteOffset ?? 0)), out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const o = k * stride + c * sz; let x;
    switch (a.componentType) { case 5126: x = dv.getFloat32(o, true); break; case 5122: x = dv.getInt16(o, true); if (a.normalized) x = Math.max(x / 32767, -1); break;
      case 5120: x = dv.getInt8(o); if (a.normalized) x = Math.max(x / 127, -1); break; case 5123: x = dv.getUint16(o, true); if (a.normalized) x /= 65535; break; default: x = dv.getUint8(o); if (a.normalized) x /= 255; }
    out[k * n + c] = x; }
  return { n, d: out, count: a.count }; };
const nodes = J.nodes, byName = new Map(nodes.map((n, i) => [n.name, i])), parent = [];
nodes.forEach((n, i) => (n.children ?? []).forEach(c => (parent[c] = i)));
const tracks = new Map(); // "Node.path" → { t, v, n, step }
for (const ch of J.animations[0].channels) { const s = J.animations[0].samplers[ch.sampler], t = acc(s.input), v = acc(s.output);
  tracks.set(nodes[ch.target.node].name + '.' + ch.target.path, { t: t.d, v: v.d, n: v.n, step: s.interpolation === 'STEP' }); }
const sample = (key, c) => { const tr = tracks.get(key); if (!tr) return null; const { t, v, n } = tr; c = ((c % T) + T) % T;
  let lo = 0, hi = t.length - 1; if (c <= t[0]) return Array.from(v.subarray(0, n)); if (c >= t[hi]) return Array.from(v.subarray(hi * n, hi * n + n));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= c) lo = m; else hi = m; }
  if (tr.step) return Array.from(v.subarray(lo * n, lo * n + n));
  const u = (c - t[lo]) / (t[hi] - t[lo]); return Array.from({ length: n }, (_, k) => v[lo * n + k] + (v[hi * n + k] - v[lo * n + k]) * u); };
const base = name => nodes[byName.get(name)].translation ?? [0, 0, 0];
const trans = (name, c) => sample(name + '.translation', c) ?? base(name);

/* world bounding-box centre of a node at rest (for which part drives it) */
const mat = n => { const [x, y, z] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [(1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0, 2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
    2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0, x, y, z, 1]; };
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const world = []; const W = i => { if (world[i]) return world[i]; const m = mat(nodes[i]); return (world[i] = parent[i] === undefined ? m : mul(W(parent[i]), m)); };
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const centre = i => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const walk = j => { const nd = nodes[j]; if (nd.mesh !== undefined) for (const p of J.meshes[nd.mesh].primitives) { const a = J.accessors[p.attributes.POSITION];
      for (const corner of [0, 1, 2, 3, 4, 5, 6, 7]) { const q = apply(W(j), [corner & 1 ? a.max[0] : a.min[0], corner & 2 ? a.max[1] : a.min[1], corner & 4 ? a.max[2] : a.min[2]]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } } }
    (nd.children ?? []).forEach(walk); };
  walk(i); return lo[0] === Infinity ? apply(W(i), [0, 0, 0]) : lo.map((v, k) => (v + hi[k]) / 2); };

/* ---------------- part / pallet paths ---------------- */
const lapOf = k => P * (k - 1);
const palPos = (k, c) => { const x = trans('Pal_' + k + '_X', c), y = trans('Pal_' + k + '_Y', c); return [x[0] + y[0], x[1] + y[1], x[2] + y[2]]; };
const partPos = (k, c) => { const a = trans('Part_' + k + '_X', c), b = trans('Part_' + k + '_Y', c), d = trans('Part_' + k + '_Z', c); return [a[0] + b[0] + d[0], a[1] + b[1] + d[1], a[2] + b[2] + d[2]]; };
const partVisible = (k, c) => (sample('Part_' + k + '.scale', c) ?? [1])[0] > 0.5;
const DT = 1 / 32;
// pallet stops along k's lap (τ from −30 to 390): runs where the pallet stands still on the line or on the NG lane
const palRuns = k => { const runs = []; let cur = null;
  for (let tau = -30; tau <= 390; tau += DT) { const p = palPos(k, lapOf(k) + tau), key = p[0].toFixed(3) + ',' + p[2].toFixed(2);
    if (cur && cur.key === key) cur.t1 = tau; else { if (cur && cur.t1 - cur.t0 > 0.25) runs.push(cur); cur = { key, x: +p[0].toFixed(3), z: +p[2].toFixed(2), y: p[1], t0: tau, t1: tau }; } }
  if (cur) runs.push(cur); return runs; };

const STOP = { merge: 2.1, prof: 2.8, disp: 3.6, cam: 4.25, scale: 4.9, ngA: 5.5, turn: 6.4, tank: 7.3, press0: 8.15, press1: 8.9, vis: 9.6, bstop: 10.3, bback: 10.8, bng: 11.5,
  flange: 12.7, mig0: 13.5, mig1: 14.5, cturn: 15.0, mig2: 15.5, mig3: 16.5, manual: 18.1, cf: 19.3, paste: 20.4, check: 21.5, eturn: 22.9, evis: 23.6, estop: 24.3, eback: 24.8,
  mark: 26.15, nut: 27.1, okng: 27.85, pack: 28.6 };
const hasPins = s => byName.has('Stop_' + s + '_Pins');
// DES stations: id, name, first stop, last stop (the laser and leak stations take the part off at one stop and give it back at the next)
const STATIONS = [
  ['A2', '프로파일 검사', 'prof'], ['A3', '페이스트 도포', 'disp'], ['A4', '노즐 비전', 'cam'], ['A5', '계량 판정', 'scale'], ['A6', 'NG 분기 A', 'ngA'],
  ['B1', '팔레트 90° 회전', 'turn'], ['B2', '엔드 탱크 공급', 'tank'], ['B3', '1차 압입', 'press0'], ['B4', '2차 압입', 'press1'], ['B5', '압입 비전', 'vis'],
  ['B6', '레이저 용접 (로봇 이재)', 'bstop', 'bback'], ['B7', 'NG 분기 B (통과)', 'bng'],
  ['C1', '플랜지 공급', 'flange'], ['C2', 'MIG 용접 로봇 1', 'mig0'], ['C3', 'MIG 용접 로봇 2', 'mig1'], ['C4', '팔레트 180° 회전', 'cturn'], ['C5', 'MIG 용접 로봇 3', 'mig2'], ['C6', 'MIG 용접 로봇 4', 'mig3'], ['C7', '수동 MIG 보완 용접', 'manual'],
  ['D1', 'C/F 검사', 'cf'], ['D2', '외부 도포', 'paste'], ['D3', '육안 검사 (작업자)', 'check'],
  ['E1', '팔레트 90° 회전', 'eturn'], ['E2', '바코드·외관 비전', 'evis'], ['E3', '리크 테스트 (로봇 이재)', 'estop', 'eback'], ['E4', '마킹', 'mark'], ['E5', '가스켓·볼트 체결', 'nut'], ['E6', 'OK/NG 분기', 'okng'], ['E7', '포장 (적재 로더)', 'pack'],
];
const near = (a, b) => Math.abs(a - b) < 0.004;
const windowsOf = k => { const runs = palRuns(k).filter(r => near(r.z, 1.3)), out = {};
  const find = (x, after) => runs.find(r => near(r.x, x) && r.t0 >= after);
  // the merge stop: the pallet arrives from the lift, waits, is loaded by robot A, leaves
  let t = -30; const mergeRun = runs.find(r => near(r.x, STOP.merge) && r.t1 > 0); // the run that spans τ 0 (loaded at the merge stop)
  const conv0 = mergeRun.t1 + DT - (hasPins('merge') ? 0.9 : 0.3); out.A1 = { a: null, b: +conv0.toFixed(3), x: STOP.merge }; t = mergeRun.t1;
  let prevEnd = conv0;
  for (const [id, , s0, s1] of STATIONS) { const r0 = find(STOP[s0], t), r1 = s1 ? find(STOP[s1], r0.t1) : r0;
    const a = r0.t0, b = r1.t1 + DT - (hasPins(s1 ?? s0) ? 0.9 : 0.3);
    out['CV_' + id] = { a: +prevEnd.toFixed(3), b: +a.toFixed(3), x0: null, x1: STOP[s0] }; out[id] = { a: +a.toFixed(3), b: +b.toFixed(3), x: STOP[s0] };
    prevEnd = b; t = r1.t1; }
  out.RETURN = { a: +prevEnd.toFixed(3) };
  return out; };

const W1 = windowsOf(1), W2 = windowsOf(2);
for (const [key, w] of Object.entries(W1)) for (const f of ['a', 'b']) if (w[f] != null && W2[key][f] != null && Math.abs(w[f] - W2[key][f]) > 0.07) throw new Error(`part 2 differs from part 1 at ${key}.${f}: ${w[f]} vs ${W2[key][f]}`);
const WIN = W1;

// cell A before the merge stop: loader (tote → lane), lane rollers + centring, robot A (lane → pallet). Measured from part 1's own keys.
const firstMove = (key, from, to) => { for (let tau = from; tau <= to; tau += DT) { const a = sample(key, tau), b = sample(key, tau + DT); if (a && b && a.some((v, i) => Math.abs(v - b[i]) > 1e-5)) return tau; } return null; };
const lastMove = (key, from, to) => { let last = null; for (let tau = from; tau <= to; tau += DT) { const a = sample(key, tau), b = sample(key, tau + DT); if (a && b && a.some((v, i) => Math.abs(v - b[i]) > 1e-5)) last = tau + DT; } return last; };
const loaderA = firstMove('A_Loader_X.translation', -20 + T, T) - T, loaderB = lastMove('A_Loader_Y.translation', -20 + T, T) - T; // part 1 lap starts at −9.5 (clip 390.5)
const robotA = firstMove('A_Robot_Joint_1.rotation', 0, 20);
WIN.A0 = { a: +loaderA.toFixed(3), b: +loaderB.toFixed(3), x: -0.6 };
WIN.LANE = { a: +loaderB.toFixed(3), b: +(robotA - 0.3).toFixed(3) };
WIN.A1.a = +(robotA - 0.3).toFixed(3);

// the empty pallet's way back: exit stop → exit lift → lower return conveyor → start lift → merge stop
const retRuns = palRuns(1); const back = retRuns.find(r => near(r.x, STOP.merge) && r.t0 > 300);
let topAt = null; for (let tau = back.t0; tau < back.t0 + 10; tau += DT) if (palPos(1, tau)[1] > 0.849) { topAt = tau; break; }
WIN.RETURN.lower = +back.t0.toFixed(3); WIN.RETURN.top = +topAt.toFixed(3);
const liftDown = lastMove('Lift_In.translation', back.t0 - 3, back.t0 + 12);
WIN.RETURN.liftFree = +liftDown.toFixed(3);
// waiting places on the lower return conveyor in front of the start lift: τ where the pallet passes x = merge + j·pitch
const tauAtX = (k, x, from, to, dir) => { for (let tau = from; tau <= to; tau += DT) { const p = palPos(k, lapOf(k) + tau)[0]; if (dir > 0 ? p >= x : p <= x) return tau; } return to; };
WIN.RETURN.queue = [1, 2, 3, 4, 5, 6, 7, 8].map(j => +tauAtX(1, STOP.merge + j * PITCH, WIN.RETURN.a + 5, back.t0, -1).toFixed(3));
// accumulation: τ where a pallet waiting behind the one at a stop stands (one pitch per place), per conveyor
for (const [key, w] of Object.entries(WIN)) if (key.startsWith('CV_')) { w.queue = []; for (let j = 1; j <= 8; j++) { const x = w.x1 - j * PITCH, tau = tauAtX(1, x, w.a, w.b, 1); if (tau <= w.a + 0.95) break; w.queue.push(+tau.toFixed(3)); } }

// NG trip at the NG stop of cell A (part 6 fails the dispensing check): measured on part 6, replayed for every NG stop
const r6 = palRuns(6), ngIn = r6.find(r => near(r.x, STOP.ngA) && near(r.z, 1.3)), ngOut = r6.find(r => near(r.x, STOP.ngA) && near(r.z, 1.3) && r.t0 > ngIn.t1 + 1);
const NG = { ref: 6, a: +ngIn.t0.toFixed(3), b: +(ngOut.t1 + DT - 0.9).toFixed(3), hide: null };
for (let tau = ngIn.t0; tau < ngOut.t1; tau += DT) if (!partVisible(6, lapOf(6) + tau)) { NG.hide = +tau.toFixed(3); break; }
// an empty pallet passing the laser / leak stations (nothing to take off): part 6's pass through cell B
const e6a = r6.find(r => near(r.x, STOP.bstop) && r.t0 > ngOut.t1), e6b = r6.find(r => near(r.x, STOP.bback) && r.t0 > e6a.t0);
const EMPTY_PASS = { ref: 6, a: +e6a.t0.toFixed(3), b: +(e6b.t1 + DT - 0.9).toFixed(3), x: STOP.bstop };

/* ---------------- moving nodes: active intervals and the part that drives each ---------------- */
const SPECIAL = /^(W_1|W_4|A_Tote|E_Pack_|E_Carton_Item_)/, PARTS = /^(Part_|Pal_)\d/;
const nodeOf = key => key.slice(0, key.lastIndexOf('.'));
const moving = [...new Set([...tracks.keys()].map(nodeOf))].filter(n => !PARTS.test(n) && !SPECIAL.test(n));
const intervals = {};
for (const name of moving) {
  const keys = [...tracks.keys()].filter(k => nodeOf(k) === name), segs = [];
  for (const key of keys) { const { t, v, n } = tracks.get(key); for (let i = 1; i < t.length; i++) { let ch = false; for (let c = 0; c < n; c++) if (Math.abs(v[i * n + c] - v[(i - 1) * n + c]) > 6e-4) ch = true; if (ch) segs.push([t[i - 1], t[i]]); } }
  segs.sort((a, b) => a[0] - b[0]); const merged = [];
  for (const s of segs) { const m = merged[merged.length - 1]; if (m && s[0] - m[1] < 1.2) m[1] = Math.max(m[1], s[1]); else merged.push([...s]); }
  const where = centre(byName.get(name)), list = [];
  for (const [a, b] of merged) { const mid = (a + b) / 2; let best = 0, bd = Infinity;
    for (let k = 1; k <= N; k++) { const pp = palPos(k, mid), qp = partPos(k, mid); const d = Math.min(Math.hypot(pp[0] - where[0], pp[2] - where[2]) + 0.3 * Math.abs(pp[1] - where[1]), partVisible(k, mid) ? Math.hypot(qp[0] - where[0], qp[2] - where[2]) : Infinity); if (d < bd) { bd = d; best = k; } }
    list.push([+a.toFixed(3), +b.toFixed(3), best]); }
  intervals[name] = list; }

/* ---------------- worker tasks (tote refill, carton change) ---------------- */
const activity = re => { let a = Infinity, b = -Infinity; for (const key of tracks.keys()) if (re.test(nodeOf(key))) { const { t, v, n } = tracks.get(key); for (let i = 1; i < t.length; i++) for (let c = 0; c < n; c++) if (Math.abs(v[i * n + c] - v[(i - 1) * n + c]) > 6e-4) { a = Math.min(a, t[i - 1]); b = Math.max(b, t[i]); } } return [a, b]; };
const refill = activity(/^(W_1|A_Tote$)/); const toteBack = (() => { const { t, v } = tracks.get('A_Tote.scale'); for (let i = 1; i < t.length; i++) if (v[i * 3] > 0.5 && v[(i - 1) * 3] < 0.5) return t[i]; })();
const TOTE = { a: +(refill[0] - 0.3).toFixed(3), b: +(refill[1] + 0.3).toFixed(3), back: +toteBack.toFixed(3), lastPart: 8, lastPartA0: +(lapOf(8) + WIN.A0.a).toFixed(3), pick: null };
for (let tau = WIN.A0.a; tau < WIN.A0.b; tau += DT) if (partVisible(1, tau + T)) { TOTE.pick = +tau.toFixed(3); break; } // the core leaves the tote (τ of part 1, previous lap)
// carton: each good part's slot, and the change after the third
const carton = { slots: {}, swaps: [] };
for (const k of [1, 2, 4, 5, 7, 8]) { const tp = lapOf(k) + WIN.E7.a; for (let j = 0; j < 4; j++) { const { t, v } = tracks.get('E_Carton_Item_' + j + '.scale'); for (let i = 1; i < t.length; i++) if (v[i * 3] > 0.5 && v[(i - 1) * 3] < 0.5) { const d = ((t[i] - tp) % T + T) % T; if (d < WIN.E7.b - WIN.E7.a) carton.slots[k] = { slot: j, place: +(d + WIN.E7.a).toFixed(3) }; } } }
{ const { t, v } = tracks.get('E_Pack_Carton.scale'); let up = null; for (let i = 1; i < t.length; i++) { if (v[i * 3] < 0.5 && v[(i - 1) * 3] > 0.5) up = t[i]; if (v[i * 3] > 0.5 && v[(i - 1) * 3] < 0.5 && up !== null) { carton.swaps.push({ up: +up.toFixed(3), down: +t[i].toFixed(3) }); up = null; } } }
const sw = carton.swaps[0], swAct = (() => { let a = Infinity, b = -Infinity; for (const key of tracks.keys()) if (/^(W_4|E_Pack_)/.test(nodeOf(key))) { const { t, v, n } = tracks.get(key); for (let i = 1; i < t.length; i++) if (t[i] > sw.up - 15 && t[i] < sw.down + 15) for (let c = 0; c < n; c++) if (Math.abs(v[i * n + c] - v[(i - 1) * n + c]) > 1e-4) { a = Math.min(a, t[i - 1]); b = Math.max(b, t[i]); } } return [a, b]; })();
const lastPack = Object.entries(carton.slots).map(([k, s]) => ({ k: +k, c: lapOf(+k) + s.place })).map(s => ({ ...s, d: ((swAct[0] - s.c) % T + T) % T })).sort((a, b) => a.d - b.d)[0];
const CARTON = { slots: carton.slots, a: +(swAct[0] - 0.3).toFixed(3), b: +(swAct[1] + 0.3).toFixed(3), up: sw.up, down: sw.down, afterPlace: +lastPack.d.toFixed(3) };

/* ---------------- DES figures ---------------- */
const r = x => +x.toFixed(2);
const des = {
  loader: r(WIN.A0.b - WIN.A0.a), lane: r(WIN.LANE.b - WIN.LANE.a), robotA: r(WIN.A1.b - WIN.A1.a),
  stations: Object.fromEntries(STATIONS.map(([id]) => [id, r(WIN[id].b - WIN[id].a)])),
  turnover: Object.fromEntries(STATIONS.map(([id, , s0]) => { const w = WIN[id], last = lastMove('Stop_' + s0 + '.translation', w.a, w.b + 6), cv = WIN['CV_' + id];
    const index = cv.queue.length ? cv.b - cv.queue[0] : 0; return [id, r(Math.max(index, last == null ? 0 : last - w.b))]; })),
  conveyors: Object.fromEntries(STATIONS.map(([id]) => { const w = WIN['CV_' + id]; return [id, { transit: r(w.b - w.a), places: Math.max(1, w.queue.length), index: w.queue.length ? r(w.b - w.queue[0]) : r(w.b - w.a) }]; })),
  ngTrip: r(NG.b - NG.a), emptyPass: r(EMPTY_PASS.b - EMPTY_PASS.a),
  returnTrip: r(WIN.RETURN.lower - WIN.RETURN.a), liftUp: r(WIN.RETURN.top - WIN.RETURN.lower), liftCycle: r(WIN.RETURN.liftFree - WIN.RETURN.lower), liftIndex: r(WIN.RETURN.lower - WIN.RETURN.queue[0]),
  tote: { lot: 8, gap: r(TOTE.back - TOTE.lastPartA0 - (TOTE.pick - WIN.A0.a)) },
  carton: { every: 3, swap: r(CARTON.down - (CARTON.a + 0.3) + CARTON.afterPlace) },
};
const stationNames = Object.fromEntries(STATIONS.map(([id, nm]) => [id, nm]));
const out = { source: SRC, clip: 'Module_Cycle', T, P, N, pitch: PITCH, stations: STATIONS.map(s => s[0]), names: stationNames, windows: WIN, ng: NG, emptyPass: EMPTY_PASS, tote: TOTE, carton: CARTON, des, intervals };
fs.mkdirSync('assets/one-twin', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
console.log(JSON.stringify(des, null, 1));
