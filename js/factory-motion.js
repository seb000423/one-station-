// AMR routes, keep-out areas, AMR trips, worker walks and safety for the factory builder (console 1) and
// the factory export. Works on the factory document ({ factory, objects }) in world metres, Y up.
//   - Routes ("AMR 경로" objects) are polylines; all of them form one graph (points within 0.2 m join).
//   - Work areas are off limits by default: every zone, station cell, robot reach, conveyor, rack and
//     charging station (its body; the bay in front is the dock) keeps AMRs and pedestrians (walkways,
//     workers) out unless the object allows it (o.perm = { amr, walk }); columns, walls and stairs always
//     block AMRs. A route edge crossing a closed area is blocked: AMRs never use it. An AMR serving a zone
//     docks at its edge: the nearest route point within 1 m outside it (inside, when AMR entry is allowed).
//     Crossing a walkway is allowed but reported.
//   - An AMR runs 출발 → 도착 over the shortest unblocked path: load at the start, turn in place at each
//     corner, accelerate / cruise / decelerate on each straight, unload at the end, come back, loop.
//     With a job list (params.stops: [{ at, act: load | unload | charge | wait, dwell }]) it visits the stops
//     in order and loops; it carries a load from a load stop to the next unload stop.
//   - Zones with 재고 관리 (params.track) count their stock: an AMR leaves for a load stop only when an item
//     there is free (not promised to another AMR) and for an unload stop only when there is room (cap); until
//     then it waits where it is, so it never parks on a dock waiting. supply / consume add or take one item
//     every n s.
//   - AMRs share the route network (fleet simulation): each reserves the stretch ahead up to the next
//     junction or its destination (and route segments running close to it), so two AMRs never meet head
//     on in a corridor; the other one waits, and after waiting a while tries a detour. An AMR slows down
//     when a worker comes within twice its safety circle ahead and stops when the worker is inside it.
//   - A worker stands, or walks a walkway end to end and back.
//   - Moving equipment has a range circle (robot reach, a station cell's R1/R2 reach, AMR footprint +
//     margin); a worker inside one is a safety warning.
(function () {
  const JOIN = 0.2, ACCEL = 0.5, TURN = Math.PI / 2; // m, m/s², rad/s
  const CELL_FOOT = [2.8, 2.4], CELL_MARGIN = 0.3, AMR_MARGIN = 0.5, FR5_REACH = 0.922;
  const FE = () => window.FactoryElements;
  const P = o => FE().TYPES[o.type] ? Object.assign(FE().defaults(o.type, {}), o.params || {}) : (o.params || {}); // station cells are not library elements
  const isMachine = o => (FE().MACHINES || []).includes(o.type); // js/factory-machines.js equipment
  const local2world = (o, x, z) => { const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0); return [o.x + c * x + s * z, o.z - s * x + c * z]; };
  const world2local = (o, x, z) => { const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0); return [c * dx - s * dz, s * dx + c * dz]; };
  const heading = (a, b) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]); // yaw that points local +X along a→b

  /* ---------- geometry ---------- */
  const routePoints = o => (P(o).points || []).map(([x, z]) => local2world(o, x, z));
  // rect: centre, rotation, half sizes (local x = length direction)
  const rect = (o, w, d, m = 0) => ({ kind: 'rect', id: o.id, name: o.name, cx: o.x, cz: o.z, rot: o.rot || 0, hw: w / 2 + m, hd: d / 2 + m });
  const perm = (o, k) => !!(o.perm && o.perm[k]);
  function keepouts(doc) {
    const out = [];
    for (const o of doc.objects) {
      const p = P(o);
      if (perm(o, 'amr')) continue;
      if (o.type === 'station') { const [cx, cz] = local2world(o, 0, -0.275); out.push(Object.assign(rect(o, CELL_FOOT[0], CELL_FOOT[1], CELL_MARGIN), { cx, cz })); } // enclosure centre sits 0.275 m behind the cell origin
      else if (o.type === 'robot') out.push({ kind: 'circle', id: o.id, name: o.name, cx: o.x, cz: o.z, r: p.reach });
      else if (o.type === 'conveyor') { const [w, d] = FE().conveyorPath(p).size; out.push(rect(o, w, d, 0.15)); }
      else if (o.type === 'rack') out.push(rect(o, p.bays * p.bayWidth, p.depth, 0.15));
      else if (o.type === 'column') out.push(rect(o, p.w, p.d, 0.2));
      else if (o.type === 'wall') out.push(rect(o, p.length, p.thickness, 0.2));
      else if (o.type === 'stairs') out.push(rect(o, p.width, p.run, 0.2));
      else if (o.type === 'zone') out.push(rect(o, p.w, p.d));
      else if (o.type === 'charger') out.push(Object.assign(rect(o, p.width, 0.25, 0.1), { name: o.name }));
      else if (isMachine(o)) { const [w, d] = FE().footprint(o); out.push(rect(o, w, d, 0.15)); }
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
      case 'conveyor': { const [w, d] = FE().conveyorPath(p).size; return rect(o, w, d); }
      case 'rack': return rect(o, p.bays * p.bayWidth, p.depth);
      case 'column': return rect(o, p.w, p.d);
      case 'wall': return rect(o, p.length, p.thickness);
      case 'stairs': return rect(o, p.width, p.run);
      case 'door': return rect(o, p.width + 0.16, p.thickness);
      case 'charger': return rect(o, p.width, 0.25);
      case 'walkway': return rect(o, p.length, p.width);
      case 'zone': return rect(o, p.w, p.d);
      case 'worker': return { kind: 'circle', id: o.id, name: o.name, cx: o.x, cz: o.z, r: 0.3 };
      case 'amr': return rect(o, p.length, p.width);
      default: { if (isMachine(o)) { const [w, d] = FE().footprint(o); return rect(o, w, d); } return null; }
    }
  }
  // may o and q stand where their footprints overlap?
  const MOVER = { worker: 'walk', walkway: 'walk', amr: 'amr' }, WORK = ['zone', 'station', 'robot', 'conveyor', 'rack', 'charger'].concat(FE().MACHINES || []);
  // Unity building shells and model groups (js/factory-unity-groups.js) hold other equipment inside their footprint
  const backdrop = o => o.type === 'ufmodel' && !!o.params && (!!o.params.items || /building/.test(o.params.model || ''));
  function clash(o, q) {
    if (backdrop(o) || backdrop(q)) return false;
    const mo = MOVER[o.type], mq = MOVER[q.type];
    if (mo && mq) return o.type === 'walkway' && q.type === 'walkway' ? false : false; // movers share space (workers on walkways, AMRs crossing)
    if (mo || mq) {
      const m = mo ? o : q, x = mo ? q : o, k = MOVER[m.type];
      if (x.type === 'door') return false;                    // doors are passages
      if (WORK.includes(x.type)) return !perm(x, k);          // work areas: closed unless allowed
      return true;                                            // columns, walls, stairs
    }
    // two fixed objects: zones may lie under equipment (except 금지 zones)
    const z = o.type === 'zone' ? o : q.type === 'zone' ? q : null;
    if (z) return P(z).kind === 'keepout' && !(o.type === 'zone' && q.type === 'zone');
    return true;
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
  // which objects would o overlap where that is not allowed (by name)
  function collisions(doc, o) {
    const s = footprint(o); if (!s) return [];
    const out = [];
    for (const q of doc.objects) {
      if (q.id === o.id) continue;
      const t = footprint(q); if (!t || !clash(o, q)) continue;
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
        // one-way routes are travelled only in drawing order (a → b)
        const e = { a: ids[k - 1], b: ids[k], route: o.id, oneway: !!P(o).oneway, len: Math.hypot(b[0] - a[0], b[1] - a[1]), blockedBy, crosses };
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
      for (const e of G.nodes[u].adj) { if (e.blockedBy.length || (e.oneway && e.a !== u)) continue; const v = e.a === u ? e.b : e.a; if (dist[u] + e.len < dist[v]) { dist[v] = dist[u] + e.len; prev[v] = u; } }
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
    // dock: a route point within 1 m outside the zone / charging bay (inside counts only when AMR entry is allowed)
    const p = P(o), [hw, hd] = o.type === 'zone' ? [p.w / 2, p.d / 2] : [p.width / 2 + 0.2, 0.6], [cx, cz] = o.type === 'zone' ? [o.x, o.z] : local2world(o, 0, 0.8);
    let best = -1, bd = Infinity;
    G.nodes.forEach((n, i) => {
      const [lx, lz] = world2local({ x: cx, z: cz, rot: o.rot || 0 }, n.x, n.z), out = Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hd));
      const inside = Math.abs(lx) < hw - 1e-3 && Math.abs(lz) < hd - 1e-3;
      if (out > 1.0 || (inside && o.type === 'zone' && !perm(o, 'amr'))) return;
      const d = Math.hypot(n.x - cx, n.z - cz); if (d < bd) { bd = d; best = i; }
    });
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
  // a loop over several legs (AMR job list): dwell at each stop, then drive the leg to the next one
  function planMission(legs, dwells, stopLabels, moveLabels, speed) {
    const acts = [], add = a => { a.t0 = acts.length ? acts[acts.length - 1].t0 + acts[acts.length - 1].dur : 0; acts.push(a); };
    const first = legs.find(L => L.length > 1), startYaw = first ? heading(first[0], first[1]) : 0;
    let yaw = startYaw, length = 0;
    legs.forEach((P, k) => {
      add({ kind: 'dwell', dur: dwells[k], at: P[0], yaw0: yaw, yaw1: yaw, label: stopLabels[k] });
      for (let i = 1; i < P.length; i++) {
        let d = heading(P[i - 1], P[i]) - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > 1e-3) add({ kind: 'turn', dur: Math.abs(d) / TURN, at: P[i - 1], yaw0: yaw, yaw1: yaw + d, label: moveLabels[k] });
        yaw += d;
        const len = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); length += len;
        if (len > 1e-6) add({ kind: 'move', dur: moveTime(len, speed), a: P[i - 1], b: P[i], len, yaw0: yaw, yaw1: yaw, label: moveLabels[k] });
      }
    });
    const period = Math.max(1e-3, acts[acts.length - 1].t0 + acts[acts.length - 1].dur);
    const find = t => { const u = ((t % period) + period) % period; let lo = 0, hi = acts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (acts[m].t0 <= u) lo = m; else hi = m - 1; } return [acts[lo], u - acts[lo].t0]; };
    return {
      ok: true, period, length, oneWay: period, points: legs.flat(),
      pose(t) { const [a, u] = find(t); if (a.kind === 'move') { const f = moveDist(u, a.len, speed) / a.len; return { x: a.a[0] + (a.b[0] - a.a[0]) * f, z: a.a[1] + (a.b[1] - a.a[1]) * f, yaw: a.yaw0 }; } const f = a.dur ? u / a.dur : 1; return { x: a.at[0], z: a.at[1], yaw: a.yaw0 + (a.yaw1 - a.yaw0) * f }; },
      state(t) { return find(t)[0].label; },
      trips(t) { return Math.floor(t / period); }
    };
  }
  // an AMR's job: its stop list (2 or more stops), or 출발 (load) → 도착 (unload)
  const ACT = { load: '적재', unload: '하역', charge: '충전', wait: '대기' };
  function stopsOf(p) {
    const st = (p.stops || []).filter(x => x && x.at);
    return st.length >= 2 ? st.map(x => ({ at: x.at, act: ACT[x.act] ? x.act : 'wait', dwell: Number.isFinite(+x.dwell) && x.dwell !== '' ? +x.dwell : p.dwell }))
      : [{ at: p.from, act: 'load', dwell: p.dwell }, { at: p.to, act: 'unload', dwell: p.dwell }];
  }
  function amrPlan(doc, amr, G = graph(doc)) {
    const p = P(amr), mission = (p.stops || []).filter(x => x && x.at).length >= 2;
    if (mission) return missionPlan(doc, amr, G);
    const from = placeNode(doc, G, p.from), to = placeNode(doc, G, p.to);
    const name = r => { const pl = places(doc, G).find(x => x.ref === r); return pl ? pl.label : '?'; };
    if (!G.edges.length) return { ok: false, error: 'AMR 경로가 없습니다. 팔레트의 "AMR 경로"로 먼저 경로를 그리세요' };
    if (!p.from || !p.to) return { ok: false, error: '출발 지점과 도착 지점을 고르세요' };
    if (from < 0 || to < 0) return { ok: false, error: `${from < 0 ? name(p.from) : name(p.to)}: 가장자리 1 m 이내에 AMR 경로 점이 없습니다. 구역 가장자리(도킹 지점)까지 경로를 그리세요 — 구역 안으로 들어가려면 그 구역의 "AMR 진입 허용"을 켜세요` };
    if (from === to) return { ok: false, error: '출발 지점과 도착 지점이 같은 경로 점입니다' };
    const path = shortest(G, from, to), back = shortest(G, to, from);
    if (!path) return { ok: false, error: '막히지 않은 경로로 갈 수 없습니다 (작업 구역을 지나는 구간·단방향 반대쪽은 사용하지 않습니다)' };
    if (!back) return { ok: false, error: '도착 지점에서 돌아오는 경로가 없습니다 (단방향 경로라면 돌아오는 경로도 그리세요)' };
    const pts = path.map(i => [G.nodes[i].x, G.nodes[i].z]);
    const plan = planFromPoints(pts, p.speed, p.dwell, p.dwell, [`적재 중 (${name(p.from)})`, `이동 중 → ${name(p.to)}`, `하역 중 (${name(p.to)})`, `복귀 중 → ${name(p.from)}`]);
    plan.radius = Math.hypot(p.length, p.width) / 2 + AMR_MARGIN; plan.fromLabel = name(p.from); plan.toLabel = name(p.to);
    plan.stops = stopsOf(p).map((x, k) => Object.assign(x, { node: k ? to : from, name: name(x.at) })); plan.legs = [path, back];
    plan.moveLabels = [`이동 중 → ${plan.toLabel}`, `복귀 중 → ${plan.fromLabel}`];
    return plan;
  }
  function missionPlan(doc, amr, G) {
    const p = P(amr), S = stopsOf(p), name = r => { const pl = places(doc, G).find(x => x.ref === r); return pl ? pl.label : '?'; };
    if (!G.edges.length) return { ok: false, error: 'AMR 경로가 없습니다. 팔레트의 "AMR 경로"로 먼저 경로를 그리세요' };
    const nodes = S.map(x => placeNode(doc, G, x.at)), bad = nodes.findIndex(n => n < 0);
    if (bad >= 0) return { ok: false, error: `${bad + 1}번 작업 · ${name(S[bad].at)}: 가장자리 1 m 이내에 AMR 경로 점이 없습니다. 구역 가장자리(도킹 지점)까지 경로를 그리세요` };
    const legs = [];
    for (let k = 0; k < S.length; k++) {
      const a = nodes[k], b = nodes[(k + 1) % S.length], path = a === b ? [a] : shortest(G, a, b);
      if (!path) return { ok: false, error: `${k + 1}번 ${name(S[k].at)} → ${name(S[(k + 1) % S.length].at)}: 막히지 않은 경로가 없습니다 (단방향 경로라면 방향을 확인하세요)` };
      legs.push(path);
    }
    const stops = S.map((x, k) => Object.assign(x, { node: nodes[k], name: name(x.at) }));
    const moveLabels = stops.map((x, k) => `이동 중 → ${stops[(k + 1) % stops.length].name}`);
    const plan = planMission(legs.map(L => L.map(i => [G.nodes[i].x, G.nodes[i].z])), stops.map(x => x.dwell), stops.map(x => `${ACT[x.act]} 중 (${x.name})`), moveLabels, p.speed);
    return Object.assign(plan, { radius: Math.hypot(p.length, p.width) / 2 + AMR_MARGIN, fromLabel: stops[0].name, toLabel: stops[1].name, route: stops.map(x => x.name).join(' → '), stops, legs, moveLabels, mission: true });
  }
  // where pedestrians may not go: areas closed to walking (and columns, walls, stairs)
  function walkBlocks(doc) {
    const out = [];
    for (const q of doc.objects) { const s = footprint(q); if (s && q.type !== 'walkway' && clash({ type: 'worker' }, q)) out.push(Object.assign({}, s, { name: q.name })); }
    return out;
  }
  function walkBlocked(doc, o) { const pts = routePoints(o), ko = walkBlocks(doc), bad = new Set(); for (let k = 1; k < pts.length; k++) ko.filter(s => hits(pts[k - 1], pts[k], s)).forEach(s => bad.add(s.name)); return [...bad]; }
  // a worker stands, or walks a walkway (centre line) or a worker path (작업자 경로) end to end and back
  function workerPlan(doc, w) {
    const p = P(w), path = doc.objects.find(o => o.id === p.walkway && (o.type === 'walkway' || o.type === 'walkroute'));
    const still = (state, error) => ({ ok: true, still: true, error, pose: () => ({ x: w.x, z: w.z, yaw: w.rot || 0 }), state: () => state, trips: () => 0, period: 0 });
    if (!path) return still('정지');
    let pts;
    if (path.type === 'walkway') { const q = P(path); pts = [local2world(path, -q.length / 2 + 0.4, 0), local2world(path, q.length / 2 - 0.4, 0)]; }
    else {
      pts = routePoints(path); if (pts.length < 2) return still('정지');
      const bad = walkBlocked(doc, path); if (bad.length) return still('정지 (경로 막힘)', `${path.name}이(가) 보행 금지 구역(${bad.join(', ')})을 지납니다`);
    }
    return planFromPoints(pts, p.speed, p.dwell, p.dwell, ['작업 중', `보행 중 → ${path.name} 끝`, '작업 중', `보행 중 → ${path.name} 시작`]);
  }
  function plans(doc, opts = {}) {
    const G = graph(doc), out = { G, amr: {}, worker: {} };
    for (const o of doc.objects) { if (o.type === 'amr') out.amr[o.id] = amrPlan(doc, o, G); else if (o.type === 'worker') out.worker[o.id] = workerPlan(doc, o); }
    fleet(doc, G, out, opts.horizon || 900);
    return out;
  }

  /* ---------- fleet: AMRs on the shared network ---------- */
  const SIM_DT = 0.04, SAMPLE = 0.16;
  const segDist = (a, b, c, d) => { // shortest distance between segments ab and cd
    const pt = (p, q, r) => { const dx = r[0] - q[0], dz = r[1] - q[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dz) / L2)); return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dz); };
    const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
    return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
  };
  // simulates every valid AMR for 'horizon' seconds and replaces its pose / state / trips with the result
  function fleet(doc, G, out, horizon) {
    const amrs = doc.objects.filter(o => o.type === 'amr' && out.amr[o.id] && out.amr[o.id].ok);
    if (!amrs.length) return;
    const ekey = (a, b) => a < b ? a + '-' + b : b + '-' + a, NP = i => [G.nodes[i].x, G.nodes[i].z];
    const radius = Math.max(...amrs.map(o => out.amr[o.id].radius));
    // edges running within two AMR radii of each other (crossing routes without a shared point) conflict
    const near = new Map();
    for (const e of G.edges) near.set(ekey(e.a, e.b), new Set());
    for (const e of G.edges) for (const f of G.edges) { if (e === f) continue; const shared = e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b; if (!shared && segDist(NP(e.a), NP(e.b), NP(f.a), NP(f.b)) < 2 * radius) near.get(ekey(e.a, e.b)).add(ekey(f.a, f.b)); }
    const degree = i => G.nodes[i].adj.filter(e => !e.blockedBy.length).length;
    // the way back may differ from the way out (one-way loops)
    const held = new Map(); // resource -> amr id
    const free = (r, id) => !held.has(r) || held.get(r) === id;
    const workers = doc.objects.filter(o => o.type === 'worker');
    const agents = amrs.map((o, k) => {
      const p = P(o), pl = out.amr[o.id];
      return { o, p, pl, k, stops: pl.stops, legs: pl.legs, at: 0, carry: false, x: o.x, z: o.z, yaw: o.rot || 0, v: 0, trips: 0, phase: 'enter', leg: null, i: 0, s: 0, timer: 0, wait: 0, label: '대기: 출발 지점 사용 중', chain: [] };
    });
    // zone stock (재고 관리): the AMRs take from and add to it; supply / consume change it on their own
    const zones = new Map();
    for (const o of doc.objects) if (o.type === 'zone') { const p = P(o); if (p.track) zones.set('zone:' + o.id, { o, p, stock: Math.max(0, +p.stock || 0), cap: Math.max(0, +p.cap || 0), resOut: 0, resIn: 0, sup: 0, con: 0, made: 0, used: 0 }); }
    const zoneTracks = new Map([...zones.values()].map(z => [z.o.id, new Int16Array(Math.ceil(horizon / SAMPLE) + 1)]));
    const stopAt = a => a.stops[a.at];
    // can an AMR be promised an item (load) / a place (unload) at this stop? promise it
    const canServe = st => { const z = zones.get(st.at); if (!z) return true; return st.act === 'load' ? z.stock - z.resOut >= 1 : st.act === 'unload' ? !z.cap || z.stock + z.resIn < z.cap : true; };
    const promise = st => { const z = zones.get(st.at); if (z && st.act === 'load') z.resOut++; if (z && st.act === 'unload') z.resIn++; };
    const short = st => `대기: ${st.name} ${st.act === 'load' ? '재고 없음' : '가득 참'}`;
    const tryHold = (a, res) => { if (!res.every(r => free(r, a.o.id))) return false; res.forEach(r => held.set(r, a.o.id)); return true; };
    const release = (a, r) => { if (held.get(r) === a.o.id) held.delete(r); };
    const holderOf = (a, res) => { for (const r of res) if (!free(r, a.o.id)) return held.get(r); return null; };
    const nameOf = id => (amrs.find(o => o.id === id) || {}).name || '';
    // resources for the stretch ahead: on a one-way segment just the next segment (nobody comes head on,
    // so the AMR can drive up and queue); on a two-way segment the whole corridor up to the next junction
    // or the leg end, so two AMRs never meet head on in it. A one-way segment that leads into a two-way
    // corridor (a dock spur) is reserved together with the corridor, so the AMR waits before the junction
    // instead of on it, where it would block the AMR coming out
    const edgeOf = new Map(G.edges.map(e => [ekey(e.a, e.b), e]));
    function chainRes(a) {
      const res = [], L = a.leg;
      for (let j = a.i; j < L.length - 1; j++) {
        const k = ekey(L[j], L[j + 1]); res.push('e:' + k, 'n:' + L[j + 1]); near.get(k).forEach(c => res.push('e:' + c));
        const e = edgeOf.get(k), nx = j + 2 < L.length ? edgeOf.get(ekey(L[j + 1], L[j + 2])) : null;
        if (e && e.oneway) { if (!nx || nx.oneway) break; continue; }
        if (j + 1 < L.length - 1 && degree(L[j + 1]) >= 3) break;
      }
      return res;
    }
    const startLeg = (a, path, label, dest) => { a.leg = path; a.i = 0; a.s = 0; a.phase = 'turn'; a.legLabel = label; a.dest = dest; a.chain = []; };
    const samples = Math.ceil(horizon / SAMPLE) + 1, track = { x: new Float32Array(samples), z: new Float32Array(samples), yaw: new Float32Array(samples), state: new Array(samples), trips: new Uint16Array(samples) };
    const tracks = new Map(agents.map(a => [a.o.id, { x: new Float32Array(samples), z: new Float32Array(samples), yaw: new Float32Array(samples), state: new Array(samples), trips: new Uint16Array(samples), carry: new Uint8Array(samples) }]));
    const workerAt = t => workers.map(w => ({ w, q: (out.worker[w.id] || { pose: () => ({ x: w.x, z: w.z }) }).pose(t) }));
    let si = 0;
    for (let t = 0, step = 0; si < samples; t += SIM_DT, step++) {
      const W = workers.length ? workerAt(t) : [];
      for (const z of zones.values()) {
        if (z.p.supply > 0 && (!z.cap || z.stock < z.cap)) { z.sup += SIM_DT; if (z.sup >= z.p.supply) { z.sup = 0; z.stock++; z.made++; } }
        if (z.p.consume > 0 && z.stock - z.resOut > 0) { z.con += SIM_DT; if (z.con >= z.p.consume) { z.con = 0; z.stock--; z.used++; } }
      }
      for (const a of agents) {
        const L = a.leg;
        if (a.phase === 'enter') { // wait for the first stop, then move onto it; with nothing to load there yet, start at the last stop (as if just done) so the dock stays free
          const k = canServe(a.stops[0]) ? 0 : a.stops.length - 1, nk = a.stops[k].node;
          if (tryHold(a, ['n:' + nk])) { [a.x, a.z] = NP(nk); a.at = k; if (k) { a.phase = 'dwell'; a.timer = 0; a.done = true; } else a.phase = 'arrive'; }
          continue;
        }
        if (a.phase === 'arrive') { // at a stop (promised on the way here, or the first stop): work there
          const st = stopAt(a), z = zones.get(st.at);
          if (!a.promised) { if (!canServe(st)) { a.label = short(st); continue; } promise(st); }
          a.promised = false;
          if (z && st.act === 'load') { z.stock--; z.resOut--; }
          a.phase = 'dwell'; a.timer = st.dwell; a.label = `${ACT[st.act]} 중 (${st.name})`; continue;
        }
        if (a.phase === 'dwell') {
          a.timer -= SIM_DT; if (a.timer > 0) continue;
          const st = stopAt(a), z = zones.get(st.at);
          if (!a.done) {
            if (st.act === 'load') a.carry = true;
            if (st.act === 'unload') { if (a.carry || !z) a.trips++; a.carry = false; if (z) { z.stock++; z.resIn--; } }
          }
          a.done = true; // the work here is done; now wait (here) until the next stop can take this AMR
          const leg = a.legs[a.at], next = (a.at + 1) % a.stops.length, nst = a.stops[next];
          if (!canServe(nst)) { a.label = short(nst); continue; }
          promise(nst); a.promised = true; a.done = false;
          if (leg.length < 2) { a.at = next; a.phase = 'arrive'; continue; }
          startLeg(a, leg.slice(), a.pl.moveLabels[a.at], next);
          a.label = a.legLabel; continue;
        }
        const u = L[a.i], v = L[a.i + 1], A = NP(u), B = NP(v), len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (a.phase === 'turn') {
          let d = heading(A, B) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          const st = Math.sign(d) * Math.min(Math.abs(d), TURN * SIM_DT); a.yaw += st;
          if (Math.abs(d) - Math.abs(st) < 1e-3) a.phase = 'move';
          continue;
        }
        // move u -> v: needs the stretch ahead reserved
        if (!a.chain.length || !a.chain.includes('e:' + ekey(u, v))) {
          const res = chainRes(a);
          if (!tryHold(a, res)) {
            a.wait += SIM_DT; a.v = 0; const by = holderOf(a, res); a.waitingFor = by; a.label = `대기: ${nameOf(by)} 통과 대기`;
            // both waiting on each other for a while: a single-lane deadlock (no passing place)
            const other = agents.find(x => x.o.id === by);
            if (other && other.waitingFor === a.o.id && a.wait > 2 && other.wait > 2) a.label = `교착: ${nameOf(by)}와 마주침 — 경로에 교행(분기) 구간이 필요합니다`;
            // waited long: try a detour around what the other AMR holds
            if (a.wait > 6 && a.wait - SIM_DT <= 6) {
              const blockedNodes = new Set([...held].filter(([, id]) => id !== a.o.id).map(([r]) => r).filter(r => r.startsWith('n:')).map(r => +r.slice(2)));
              const G2 = { nodes: G.nodes.map((n, i) => ({ ...n, adj: n.adj.map(e => (blockedNodes.has(e.a) || blockedNodes.has(e.b)) && !(e.a === u && e.b === u) ? { ...e, blockedBy: ['x'] } : e) })) };
              const alt = shortest(G2, u, L[L.length - 1]);
              if (alt && alt.length > 1 && alt[1] !== v) { a.leg = alt; a.i = 0; a.phase = 'turn'; a.wait = 0; a.label = '우회 경로로 변경'; }
            }
            continue;
          }
          a.chain = res; a.wait = 0; a.waitingFor = null; a.label = a.legLabel;
        }
        // workers ahead: slow down within two safety radii, stop inside one
        let vmax = a.p.speed, why = '';
        for (const { w, q } of W) {
          const dx = q.x - a.x, dz = q.z - a.z, dist = Math.hypot(dx, dz), ahead = dx * Math.cos(a.yaw) - dz * Math.sin(a.yaw);
          if (ahead < -0.2) continue;
          if (dist < a.pl.radius) { vmax = 0; why = `정지: ${w.name} 접근`; break; }
          if (dist < 2 * a.pl.radius) { vmax = Math.min(vmax, a.p.speed * 0.3); why = `감속: ${w.name} 접근`; }
        }
        const rem = len - a.s, vEnd = Math.sqrt(2 * ACCEL * Math.max(0, rem)), target = Math.min(vmax, vEnd + 0.05);
        a.v = a.v < target ? Math.min(target, a.v + ACCEL * SIM_DT) : Math.max(target, a.v - 2 * ACCEL * SIM_DT);
        a.s = Math.min(len, a.s + a.v * SIM_DT);
        a.x = A[0] + (B[0] - A[0]) * (a.s / len || 0); a.z = A[1] + (B[1] - A[1]) * (a.s / len || 0);
        a.label = why || a.legLabel;
        if (a.s >= len - 1e-4) { // arrived at v: free what is behind
          release(a, 'n:' + u); release(a, 'e:' + ekey(u, v)); near.get(ekey(u, v)).forEach(c => release(a, 'e:' + c));
          a.chain = a.chain.filter(r => r !== 'n:' + u && r !== 'e:' + ekey(u, v));
          a.i++; a.s = 0; a.v = 0;
          if (a.i >= a.leg.length - 1) { a.chain.forEach(r => { if (r !== 'n:' + v) release(a, r); }); a.chain = []; a.at = a.dest; a.phase = 'arrive'; }
          else a.phase = 'turn';
        }
      }
      if (step % Math.round(SAMPLE / SIM_DT) === 0) {
        for (const a of agents) { const tr = tracks.get(a.o.id); tr.x[si] = a.x; tr.z[si] = a.z; tr.yaw[si] = a.yaw; tr.state[si] = a.label; tr.trips[si] = a.trips; tr.carry[si] = a.carry ? 1 : 0; }
        for (const z of zones.values()) zoneTracks.get(z.o.id)[si] = z.stock;
        si++;
      }
    }
    for (const a of agents) {
      const tr = tracks.get(a.o.id), at = t => { const u = (((t % horizon) + horizon) % horizon) / SAMPLE, i = Math.min(samples - 2, Math.floor(u)); return [i, u - i]; };
      Object.assign(a.pl, {
        horizon, fleet: true,
        pose(t) { const [i, f] = at(t); return { x: tr.x[i] + (tr.x[i + 1] - tr.x[i]) * f, z: tr.z[i] + (tr.z[i + 1] - tr.z[i]) * f, yaw: tr.yaw[i] + (tr.yaw[i + 1] - tr.yaw[i]) * f }; },
        state(t) { return tr.state[at(t)[0]]; },
        trips(t) { return tr.trips[at(t)[0]]; },
        carry(t) { return !!tr.carry[at(t)[0]]; }
      });
    }
    const idx = t => Math.min(samples - 1, Math.floor((((t % horizon) + horizon) % horizon) / SAMPLE));
    out.zones = {};
    for (const z of zones.values()) { const tr = zoneTracks.get(z.o.id); out.zones[z.o.id] = { name: z.o.name, cap: z.cap, stock: t => tr[idx(t)] }; }
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

  window.FactoryMotion = { walkBlocks, walkBlocked, perm, clash, footprint, overlap, collisions, outside, graph, keepouts, walkways, hits, inside, routePoints, local2world, world2local, places, placeNode, shortest, amrPlan, workerPlan, plans, rangeCircles, workerPos, safety, JOIN };
})();
