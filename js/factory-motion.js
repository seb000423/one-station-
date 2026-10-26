// AMR routes, keep-out areas, AMR trips, worker walks and safety for the factory builder (console 1) and
// the factory export. Works on the factory document ({ factory, objects }) in world metres, Y up.
//   - Routes ("AMR 경로" objects) are polylines; all of them form one graph (points within 0.2 m join).
//   - Keep-out areas come from equipment footprints (station cells, robot reach, conveyors, racks, columns,
//     walls, stairs) and "금지 구역" zones. A route edge crossing one is blocked: AMRs never use it.
//     Crossing a walkway is allowed but reported.
//   - An AMR runs 출발 → 도착 over the shortest unblocked path: load at the start, turn in place at each
//     corner, accelerate / cruise / decelerate on each straight, unload at the end, come back, loop.
//   - A worker stands, or walks a walkway end to end and back.
//   - Moving equipment has a range circle (robot reach, a station cell's R1/R2 reach, AMR footprint +
//     margin); a worker inside one is a safety warning.
(function () {
  const JOIN = 0.2, ACCEL = 0.5, TURN = Math.PI / 2; // m, m/s², rad/s
  const CELL_FOOT = [2.8, 2.4], CELL_MARGIN = 0.3, AMR_MARGIN = 0.5, FR5_REACH = 0.922;
  const FE = () => window.FactoryElements;
  const P = o => FE().TYPES[o.type] ? Object.assign(FE().defaults(o.type, {}), o.params || {}) : (o.params || {}); // station cells are not library elements
  const local2world = (o, x, z) => { const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0); return [o.x + c * x + s * z, o.z - s * x + c * z]; };
  const world2local = (o, x, z) => { const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0); return [c * dx - s * dz, s * dx + c * dz]; };
  const heading = (a, b) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]); // yaw that points local +X along a→b

  /* ---------- geometry ---------- */
  const routePoints = o => (P(o).points || []).map(([x, z]) => local2world(o, x, z));
  // rect: centre, rotation, half sizes (local x = length direction)
  const rect = (o, w, d, m = 0) => ({ kind: 'rect', id: o.id, name: o.name, cx: o.x, cz: o.z, rot: o.rot || 0, hw: w / 2 + m, hd: d / 2 + m });
  function keepouts(doc) {
    const out = [];
    for (const o of doc.objects) {
      const p = P(o);
      if (o.type === 'station') { const [cx, cz] = local2world(o, 0, -0.275); out.push(Object.assign(rect(o, CELL_FOOT[0], CELL_FOOT[1], CELL_MARGIN), { cx, cz })); } // enclosure centre sits 0.275 m behind the cell origin
      else if (o.type === 'robot') out.push({ kind: 'circle', id: o.id, name: o.name, cx: o.x, cz: o.z, r: p.reach });
      else if (o.type === 'conveyor') out.push(rect(o, p.length, p.width + 0.1, 0.15));
      else if (o.type === 'rack') out.push(rect(o, p.bays * p.bayWidth, p.depth, 0.15));
      else if (o.type === 'column') out.push(rect(o, p.w, p.d, 0.2));
      else if (o.type === 'wall') out.push(rect(o, p.length, p.thickness, 0.2));
      else if (o.type === 'stairs') out.push(rect(o, p.width, p.run, 0.2));
      else if (o.type === 'zone' && p.kind === 'keepout') out.push(rect(o, p.w, p.d));
    }
    return out;
  }
  const walkways = doc => doc.objects.filter(o => o.type === 'walkway').map(o => { const p = P(o); return rect(o, p.length, p.width); });
  // does segment a→b touch the shape?
  function hits(a, b, s) {
    if (s.kind === 'circle') {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((s.cx - a[0]) * dx + (s.cz - a[1]) * dz) / L2));
      return Math.hypot(a[0] + t * dx - s.cx, a[1] + t * dz - s.cz) < s.r;
    }
    // rect: slab test in the rect's frame
    const tf = ([x, z]) => { const dx = x - s.cx, dz = z - s.cz, c = Math.cos(s.rot), sn = Math.sin(s.rot); return [c * dx - sn * dz, sn * dx + c * dz]; };
    const p = tf(a), q = tf(b), d = [q[0] - p[0], q[1] - p[1]];
    let t0 = 0, t1 = 1;
    for (const [pi, di, h] of [[p[0], d[0], s.hw], [p[1], d[1], s.hd]]) {
      if (Math.abs(di) < 1e-9) { if (pi < -h || pi > h) return false; continue; }
      let ta = (-h - pi) / di, tb = (h - pi) / di; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
    }
    return true;
  }
  const inside = (pt, s) => hits(pt, pt, s);

  /* ---------- placement footprints: objects may not overlap each other's size or work area ---------- */
  // solid footprint of an object (rect or circle in world metres), or null when it can share space
  // (AMRs, workers, routes, ordinary zones). Robots occupy their whole reach circle (work area).
  function footprint(o) {
    const p = P(o);
    switch (o.type) {
      case 'station': { const [cx, cz] = local2world(o, 0, -0.275); return Object.assign(rect(o, CELL_FOOT[0], CELL_FOOT[1]), { cx, cz }); }
      case 'robot': return { kind: 'circle', id: o.id, name: o.name, cx: o.x, cz: o.z, r: p.reach };
      case 'conveyor': return rect(o, p.length, p.width + 0.1);
      case 'rack': return rect(o, p.bays * p.bayWidth, p.depth);
      case 'column': return rect(o, p.w, p.d);
      case 'wall': return rect(o, p.length, p.thickness);
      case 'stairs': return rect(o, p.width, p.run);
      case 'door': return rect(o, p.width + 0.16, p.thickness);
      case 'charger': return rect(o, p.width, 0.25);
      case 'walkway': return rect(o, p.length, p.width);
      case 'zone': return p.kind === 'keepout' ? rect(o, p.w, p.d) : null;
      default: return null;
    }
  }
  const corners = s => { const c = Math.cos(s.rot), sn = Math.sin(s.rot); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [s.cx + c * a * s.hw + sn * b * s.hd, s.cz - sn * a * s.hw + c * b * s.hd]); };
  function overlap(a, b, eps = 0.01) {
    if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.cx - b.cx, a.cz - b.cz) < a.r + b.r - eps;
    if (a.kind === 'circle' || b.kind === 'circle') {
      const c = a.kind === 'circle' ? a : b, r = a.kind === 'circle' ? b : a;
      const dx = c.cx - r.cx, dz = c.cz - r.cz, co = Math.cos(r.rot), sn = Math.sin(r.rot), lx = co * dx - sn * dz, lz = sn * dx + co * dz;
      const qx = Math.max(-r.hw, Math.min(r.hw, lx)), qz = Math.max(-r.hd, Math.min(r.hd, lz));
      return Math.hypot(lx - qx, lz - qz) < c.r - eps;
    }
    // separating axis test on the two rectangles' edge normals
    const A = corners(a), B = corners(b);
    for (const R of [a, b]) for (const ang of [R.rot, R.rot + Math.PI / 2]) {
      const ax = [Math.cos(ang), -Math.sin(ang)], pr = pts => pts.map(([x, z]) => x * ax[0] + z * ax[1]);
      const pa = pr(A), pb = pr(B);
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
    return true;
  }
  // which objects would o overlap (by name); walkways only clash with equipment, not with zones
  function collisions(doc, o) {
    const s = footprint(o); if (!s) return [];
    const out = [];
    for (const q of doc.objects) {
      if (q.id === o.id) continue;
      const t = footprint(q); if (!t) continue;
      if ((o.type === 'walkway' && q.type === 'zone') || (q.type === 'walkway' && o.type === 'zone')) continue;
      if (overlap(s, t)) out.push(q.name);
    }
    return out;
  }
  // the footprint must stay inside the factory floor
  function outside(doc, o) {
    const s = footprint(o) || { kind: 'circle', cx: o.x, cz: o.z, r: 0.3 }, W = doc.factory.width / 2, D = doc.factory.depth / 2;
    const pts = s.kind === 'circle' ? [[s.cx - s.r, s.cz - s.r], [s.cx + s.r, s.cz + s.r]] : corners(s);
    return pts.some(([x, z]) => x < -W - 1e-6 || x > W + 1e-6 || z < -D - 1e-6 || z > D + 1e-6);
  }

  /* ---------- route graph ---------- */
  function graph(doc) {
    const nodes = [], edges = [], ko = keepouts(doc), ww = walkways(doc);
    const nodeAt = (x, z, label) => { let i = nodes.findIndex(n => Math.hypot(n.x - x, n.z - z) < JOIN); if (i < 0) { i = nodes.length; nodes.push({ x, z, label, adj: [] }); } return i; };
    for (const o of doc.objects.filter(o => o.type === 'route')) {
      const pts = routePoints(o), ids = pts.map(([x, z], k) => nodeAt(x, z, `${o.name} 점 ${k + 1}`));
      for (let k = 1; k < ids.length; k++) {
        const a = pts[k - 1], b = pts[k], blockedBy = ko.filter(s => hits(a, b, s)).map(s => s.name), crosses = ww.filter(s => hits(a, b, s)).map(s => s.name);
        const e = { a: ids[k - 1], b: ids[k], route: o.id, len: Math.hypot(b[0] - a[0], b[1] - a[1]), blockedBy, crosses };
        edges.push(e); nodes[e.a].adj.push(e); nodes[e.b].adj.push(e);
      }
    }
    return { nodes, edges, keepouts: ko, walkways: ww };
  }
  function shortest(G, from, to) {
    const dist = G.nodes.map(() => Infinity), prev = G.nodes.map(() => -1), done = G.nodes.map(() => false);
    dist[from] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === to) break; done[u] = true;
      for (const e of G.nodes[u].adj) { if (e.blockedBy.length) continue; const v = e.a === u ? e.b : e.a; if (dist[u] + e.len < dist[v]) { dist[v] = dist[u] + e.len; prev[v] = u; } }
    }
    if (dist[to] === Infinity) return null;
    const path = []; for (let v = to; v >= 0; v = prev[v]) path.unshift(v); return path;
  }
  // 출발 / 도착 choices: zones, chargers (nearest route node) and route nodes
  function places(doc, G) {
    const out = [];
    for (const o of doc.objects) if ((o.type === 'zone' && P(o).kind !== 'keepout') || o.type === 'charger') out.push({ ref: o.type + ':' + o.id, label: o.name, x: o.x, z: o.z });
    G.nodes.forEach((n, i) => out.push({ ref: 'node:' + i, label: n.label, x: n.x, z: n.z, node: i }));
    return out;
  }
  function placeNode(doc, G, ref) {
    if (!ref || !G.nodes.length) return -1;
    if (ref.startsWith('node:')) { const i = +ref.slice(5); return i < G.nodes.length ? i : -1; }
    const o = doc.objects.find(x => x.type + ':' + x.id === ref); if (!o) return -1;
    let best = -1, bd = Infinity; G.nodes.forEach((n, i) => { const d = Math.hypot(n.x - o.x, n.z - o.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* ---------- motion plans ---------- */
  const moveTime = (d, v) => d >= v * v / ACCEL ? d / v + v / ACCEL : 2 * Math.sqrt(d / ACCEL);
  const moveDist = (t, d, v) => { // distance after t s on a trapezoid (or triangle) of length d
    const T = moveTime(d, v);
    if (d >= v * v / ACCEL) { const ta = v / ACCEL; if (t < ta) return 0.5 * ACCEL * t * t; if (t > T - ta) { const r = T - t; return d - 0.5 * ACCEL * r * r; } return 0.5 * ACCEL * ta * ta + v * (t - ta); }
    const th = T / 2; return t < th ? 0.5 * ACCEL * t * t : d - 0.5 * ACCEL * (T - t) * (T - t);
  };
  // actions: { kind: 'dwell'|'turn'|'move', dur, ... } played in a loop
  function planFromPoints(pts, speed, dwellA, dwellB, labels) {
    const acts = [], add = a => { a.t0 = acts.length ? acts[acts.length - 1].t0 + acts[acts.length - 1].dur : 0; acts.push(a); };
    const leg = (P, label) => {
      let yaw = acts.length ? acts[acts.length - 1].yaw1 : heading(P[0], P[1]);
      for (let k = 1; k < P.length; k++) {
        const h = heading(P[k - 1], P[k]); let d = h - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > 1e-3) add({ kind: 'turn', dur: Math.abs(d) / TURN, at: P[k - 1], yaw0: yaw, yaw1: yaw + d, label });
        yaw += d;
        const len = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
        if (len > 1e-6) add({ kind: 'move', dur: moveTime(len, speed), a: P[k - 1], b: P[k], len, yaw0: yaw, yaw1: yaw, label });
      }
    };
    const startYaw = heading(pts[0], pts[1]);
    add({ kind: 'dwell', dur: dwellA, at: pts[0], yaw0: startYaw, yaw1: startYaw, label: labels[0] });
    leg(pts, labels[1]);
    add({ kind: 'dwell', dur: dwellB, at: pts[pts.length - 1], yaw0: acts[acts.length - 1].yaw1, yaw1: acts[acts.length - 1].yaw1, label: labels[2], delivered: true });
    leg(pts.slice().reverse(), labels[3]);
    // turn back to the start heading before the next loop
    const last = acts[acts.length - 1]; let d = startYaw - last.yaw1; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 1e-3) add({ kind: 'turn', dur: Math.abs(d) / TURN, at: pts[0], yaw0: last.yaw1, yaw1: last.yaw1 + d, label: labels[3] });
    const period = acts[acts.length - 1].t0 + acts[acts.length - 1].dur;
    const deliverAt = acts.find(a => a.delivered); const deliverEnd = deliverAt.t0 + deliverAt.dur;
    const find = t => { const u = ((t % period) + period) % period; let lo = 0, hi = acts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (acts[m].t0 <= u) lo = m; else hi = m - 1; } return [acts[lo], u - acts[lo].t0]; };
    // yaw unwrapped across loops so the recorded rotation stays continuous
    const turnsPerLoop = acts.length ? (acts[acts.length - 1].yaw1 - acts[0].yaw0) : 0;
    return {
      ok: true, period, length: pts.reduce((s, p, k) => k ? s + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0, 0), oneWay: deliverAt.t0 - acts[0].dur, points: pts,
      pose(t) {
        const [a, u] = find(t), loops = Math.floor(t / period), extra = loops * turnsPerLoop;
        if (a.kind === 'move') { const s = moveDist(u, a.len, speed) / a.len; return { x: a.a[0] + (a.b[0] - a.a[0]) * s, z: a.a[1] + (a.b[1] - a.a[1]) * s, yaw: a.yaw0 + extra }; }
        const f = a.dur ? u / a.dur : 1; return { x: a.at[0], z: a.at[1], yaw: a.yaw0 + (a.yaw1 - a.yaw0) * f + extra };
      },
      state(t) { return find(t)[0].label; },
      trips(t) { return t < deliverEnd ? 0 : Math.floor((t - deliverEnd) / period) + 1; }
    };
  }
  function amrPlan(doc, amr, G = graph(doc)) {
    const p = P(amr), from = placeNode(doc, G, p.from), to = placeNode(doc, G, p.to);
    const name = r => { const pl = places(doc, G).find(x => x.ref === r); return pl ? pl.label : '?'; };
    if (!G.edges.length) return { ok: false, error: 'AMR 경로가 없습니다. 팔레트의 "AMR 경로"로 먼저 경로를 그리세요' };
    if (from < 0 || to < 0) return { ok: false, error: '출발 지점과 도착 지점을 고르세요' };
    if (from === to) return { ok: false, error: '출발 지점과 도착 지점이 같은 경로 점입니다' };
    const path = shortest(G, from, to);
    if (!path) return { ok: false, error: '막히지 않은 경로로 갈 수 없습니다 (작업 구역을 지나는 구간은 사용하지 않습니다)' };
    const pts = path.map(i => [G.nodes[i].x, G.nodes[i].z]);
    const plan = planFromPoints(pts, p.speed, p.dwell, p.dwell, [`적재 중 (${name(p.from)})`, `이동 중 → ${name(p.to)}`, `하역 중 (${name(p.to)})`, `복귀 중 → ${name(p.from)}`]);
    plan.radius = Math.hypot(p.length, p.width) / 2 + AMR_MARGIN; plan.fromLabel = name(p.from); plan.toLabel = name(p.to);
    return plan;
  }
  function workerPlan(doc, w) {
    const p = P(w), ww = doc.objects.find(o => o.id === p.walkway && o.type === 'walkway');
    if (!ww) return { ok: true, still: true, pose: () => ({ x: w.x, z: w.z, yaw: w.rot || 0 }), state: () => '정지', trips: () => 0, period: 0 };
    const q = P(ww), A = local2world(ww, -q.length / 2 + 0.4, 0), B = local2world(ww, q.length / 2 - 0.4, 0);
    return planFromPoints([A, B], p.speed, p.dwell, p.dwell, ['작업 중', `보행 중 → ${ww.name} 끝`, '작업 중', `보행 중 → ${ww.name} 시작`]);
  }
  function plans(doc) {
    const G = graph(doc), out = { G, amr: {}, worker: {} };
    for (const o of doc.objects) { if (o.type === 'amr') out.amr[o.id] = amrPlan(doc, o, G); else if (o.type === 'worker') out.worker[o.id] = workerPlan(doc, o); }
    return out;
  }

  /* ---------- range circles + safety ---------- */
  // static circles (robots, station cells' R1/R2) and the AMRs' moving ones at time t
  function rangeCircles(doc, P2, t) {
    const out = [];
    for (const o of doc.objects) {
      if (o.type === 'robot') out.push({ id: o.id, name: o.name, x: o.x, z: o.z, r: P(o).reach });
      else if (o.type === 'station') {
        const L = Object.assign({ r2: { x: 0.9, z: -0.66 }, rail: { z: -0.12 } }, (o.params && o.params.inner) || {});
        const [x2, z2] = local2world(o, L.r2.x, L.r2.z), [x1, z1] = local2world(o, 0, L.rail.z);
        out.push({ id: o.id + ':R1', name: `${o.name} R1`, x: x1, z: z1, r: FR5_REACH + 0.7 }); // R1 rides its rail: reach + half the rail travel
        out.push({ id: o.id + ':R2', name: `${o.name} R2`, x: x2, z: z2, r: FR5_REACH });
      } else if (o.type === 'amr') {
        const pl = P2.amr[o.id], p = P(o), r = Math.hypot(p.length, p.width) / 2 + AMR_MARGIN;
        const q = pl && pl.ok ? pl.pose(t) : { x: o.x, z: o.z };
        out.push({ id: o.id, name: o.name, x: q.x, z: q.z, r, moving: true });
      }
    }
    return out;
  }
  function workerPos(doc, P2, w, t) { const pl = P2.worker[w.id]; return pl ? pl.pose(t) : { x: w.x, z: w.z, yaw: w.rot || 0 }; }
  // [{ worker, circle }] for workers inside a range circle at time t
  function safety(doc, P2, t) {
    const circles = rangeCircles(doc, P2, t), out = [];
    for (const w of doc.objects.filter(o => o.type === 'worker')) {
      const q = workerPos(doc, P2, w, t);
      for (const c of circles) if (Math.hypot(q.x - c.x, q.z - c.z) < c.r) out.push({ worker: w, circle: c, text: `${w.name} ↔ ${c.name} 가동범위` });
    }
    return out;
  }

  window.FactoryMotion = { footprint, overlap, collisions, outside, graph, keepouts, walkways, hits, inside, routePoints, local2world, world2local, places, placeNode, shortest, amrPlan, workerPlan, plans, rangeCircles, workerPos, safety, JOIN };
})();
