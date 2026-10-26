// Conveyor network for the factory builder (console 1) and the factory export: items (cartons) ride the
// conveyors in world metres.
//   - A conveyor runs from its entry to its exit (js/factory-elements.js conveyorPath: straight, 90° curve,
//     180° U-turn; dir −1 reverses it). Its exit joins another conveyor's entry when the two ends meet
//     (within 12 cm, same heading) — or the side of another conveyor (merge) when it meets it head on.
//     Moving a conveyor near a free end snaps it there (magnetic). Ends that meet the wrong way round
//     (exit to exit, entry to entry, crossing headings) and near misses are reported.
//   - A source conveyor puts an item on at its entry every interval (when there is room); a sink conveyor
//     takes items off at its exit; elsewhere an unconnected exit is a dead end where items queue up.
//     Items move at the conveyor's speed and keep a gap; they pass to the next conveyor when there is room.
//   - sim(doc) steps the whole network (0.04 s); record() samples it for the export: one pool of item
//     slots per source, each slot a TX > TZ > TY > RY rig, hidden under the floor while unused.
(function () {
  const LINK = 0.12, SNAP = 0.4, NEAR = 0.45, GAP = 0.05, DT = 0.04, SLOTS = 40;
  const FE = () => window.FactoryElements;
  const P = o => Object.assign(FE().defaults('conveyor'), o.params || {});
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const dir = yaw => [Math.cos(yaw), -Math.sin(yaw)]; // yaw → unit travel vector in (x, z)

  // a conveyor in world metres: at(s) along the travel direction → [x, z, yaw]
  function belt(o) {
    const p = P(o), path = FE().conveyorPath(p), rot = o.rot || 0, c = Math.cos(rot), sn = Math.sin(rot);
    const at = s => { const [x, z, y] = path.at(s); return [o.x + c * x + sn * z, o.z - sn * x + c * z, y + rot]; };
    const a = at(0), b = at(path.len);
    return { o, id: o.id, name: o.name, p, len: path.len, at, top: path.top, w: p.width, speed: Math.max(0.01, p.speed),
      entry: { x: a[0], z: a[1], yaw: a[2] }, exit: { x: b[0], z: b[1], yaw: b[2] } };
  }
  const belts = doc => doc.objects.filter(o => o.type === 'conveyor').map(belt);
  // closest point of b's centre line to (x, z)
  function nearest(b, x, z) {
    let best = { s: 0, d: Infinity, yaw: 0 }; const n = Math.max(8, Math.ceil(b.len / 0.04));
    for (let i = 0; i <= n; i++) { const s = b.len * i / n, q = b.at(s), d = Math.hypot(q[0] - x, q[1] - z); if (d < best.d) best = { s, d, yaw: q[2], x: q[0], z: q[1] }; }
    return best;
  }
  // a's exit meeting b's side head on: where (s on b) and from which side (+1 left of b's travel)
  function sideHit(a, b, tol) {
    const q = nearest(b, a.exit.x, a.exit.z); if (q.s < 0.1 || q.s > b.len - 0.1) return null;
    const off = b.w / 2 + 0.05, [ux, uz] = dir(a.exit.yaw), [bx, bz] = dir(q.yaw), nx = bz, nz = -bx; // n: left of b's travel
    const side = (a.exit.x - q.x) * nx + (a.exit.z - q.z) * nz > 0 ? 1 : -1;
    if (Math.abs(q.d - off) > tol) return null;
    if (ux * -side * nx + uz * -side * nz < 0.85) return null; // must point into b
    return { s: q.s, side, x: q.x + side * nx * off, z: q.z + side * nz * off, yaw: q.yaw - side * Math.PI / 2 }; // heading into b
  }

  // links (a.next = { id, s, merge }) and problems at the ends
  function network(doc) {
    const B = belts(doc), warn = [];
    for (const a of B) {
      a.next = null; a.prev = [];
      for (const b of B) if (b !== a && dist(a.exit, b.entry) < LINK && Math.abs(wrap(a.exit.yaw - b.entry.yaw)) < 0.35) { a.next = { id: b.id, s: 0, merge: false }; break; }
      if (!a.next) for (const b of B) { if (b === a) continue; const h = sideHit(a, b, LINK); if (h) { a.next = { id: b.id, s: h.s, merge: true }; break; } }
    }
    const by = new Map(B.map(b => [b.id, b]));
    for (const a of B) if (a.next) by.get(a.next.id).prev.push(a.id);
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (dist(a.exit, b.exit) < NEAR) warn.push({ ids: [a.id, b.id], text: `${a.name}과(와) ${b.name}의 출구끼리 맞닿아 있습니다 — 한쪽의 방향을 바꾸세요` });
      if (dist(a.entry, b.entry) < NEAR) warn.push({ ids: [a.id, b.id], text: `${a.name}과(와) ${b.name}의 입구끼리 맞닿아 있습니다 — 한쪽의 방향을 바꾸세요` });
      for (const [x, y] of [[a, b], [b, a]]) {
        if (x.next && x.next.id === y.id) { if (Math.abs(x.top - y.top) > 0.03) warn.push({ ids: [x.id, y.id], text: `${x.name} → ${y.name}: 높이가 다릅니다 (${x.p.height} m / ${y.p.height} m)` }); continue; }
        const d = dist(x.exit, y.entry);
        if (d < NEAR) warn.push({ ids: [x.id, y.id], text: Math.abs(wrap(x.exit.yaw - y.entry.yaw)) >= 0.35 ? `${x.name} → ${y.name}: 진행 방향이 맞지 않습니다` : `${x.name} → ${y.name}: ${Math.round(d * 100)} cm 떨어져 연결되지 않았습니다 — 끌어서 붙이세요` });
      }
    }
    return { belts: B, by, warn };
  }

  // magnetic snap: o (a conveyor being moved) near another conveyor's free end gets the pose that joins them
  function snap(doc, o) {
    const others = belts(doc).filter(b => b.id !== o.id), me = belt(o), path = FE().conveyorPath(me.p);
    const taken = new Set(); // entries already fed by a third conveyor
    for (const b of others) for (const c of others) if (b !== c && dist(b.exit, c.entry) < LINK) taken.add(c.id);
    let best = null, bd = SNAP;
    // move o so that its local port (s on its path) lands on (x, z) heading yaw
    const pose = (s, x, z, yaw) => { const [lx, lz, ly] = path.at(s), rot = wrap(yaw - ly), c = Math.cos(rot), sn = Math.sin(rot); return { x: x - (c * lx + sn * lz), z: z - (-sn * lx + c * lz), rot }; };
    const consider = (d, turn, mk) => { if (d < bd && Math.abs(turn) < Math.PI / 3) { bd = d; best = mk(); } };
    for (const b of others) {
      const fedB = taken.has(b.id), bFeeds = others.some(c => c !== b && dist(b.exit, c.entry) < LINK);
      if (!fedB) consider(dist(me.exit, b.entry), wrap(b.entry.yaw - me.exit.yaw), () => Object.assign(pose(path.len, b.entry.x, b.entry.z, b.entry.yaw), { text: `${b.name} 입구에 붙습니다` }));
      if (!bFeeds) consider(dist(me.entry, b.exit), wrap(b.exit.yaw - me.entry.yaw), () => Object.assign(pose(0, b.exit.x, b.exit.z, b.exit.yaw), { text: `${b.name} 출구에 붙습니다` }));
      const h = sideHit(me, b, SNAP);
      if (h) consider(Math.hypot(me.exit.x - h.x, me.exit.z - h.z), wrap(h.yaw - me.exit.yaw), () => Object.assign(pose(path.len, h.x, h.z, h.yaw), { text: `${b.name} 옆으로 합류합니다` }));
    }
    if (best) { best.x = Math.round(best.x * 1000) / 1000; best.z = Math.round(best.z * 1000) / 1000; best.rot = Math.round(best.rot * 1e4) / 1e4; }
    return best;
  }

  /* ---------- items ---------- */
  function sim(doc) {
    const { belts: B, by } = network(doc);
    B.forEach(b => { b.items = []; b.held = false; b.made = 0; b.done = 0; b.nextSpawn = 0; });
    let t = 0, seq = 0;
    const space = (x, y) => (x.size + y.size) / 2 + GAP;
    const insert = (b, x) => { let i = 0; while (i < b.items.length && b.items[i].s > x.s) i++; b.items.splice(i, 0, x); };
    function step(dt) {
      t += dt;
      for (const b of B) {
        const it = b.items; b.held = false; // front first (largest s)
        for (let i = 0; i < it.length; i++) {
          const x = it[i]; let lim;
          if (i > 0) lim = it[i - 1].s - space(it[i - 1], x);
          else if (b.next) { lim = b.len; const n = by.get(b.next.id), rear = n.items[n.items.length - 1]; if (!b.next.merge && rear) lim = Math.min(lim, b.len + rear.s - space(rear, x)); }
          else lim = b.p.sink ? Infinity : b.len - x.size / 2;
          const want = x.s + b.speed * dt;
          if (want > lim) { x.s = Math.max(x.s, Math.min(want, lim)); if (i === 0) b.held = true; } else x.s = want;
        }
        const f = it[0]; if (!f || f.s < b.len) continue;
        if (b.next) {
          const n = by.get(b.next.id), s0 = b.next.s + (f.s - b.len);
          if (n.items.every(y => Math.abs(y.s - s0) >= space(y, f))) { it.shift(); f.s = s0; f.conv = n.id; insert(n, f); }
          else { f.s = b.len; b.held = true; }
        } else if (b.p.sink) { it.shift(); b.done++; }
      }
      for (const b of B) if (b.p.source && t >= b.nextSpawn) {
        const size = Math.max(0.1, Math.min(b.p.item, b.len, 2)), x = { size, s: size / 2 }, rear = b.items[b.items.length - 1];
        if (rear && rear.s - x.s < space(rear, x)) continue; // no room yet: try again next step
        Object.assign(x, { id: ++seq, src: b.id, conv: b.id, w: Math.max(0.1, Math.min(size, b.w - 0.08)), h: Math.min(0.4, Math.max(0.12, size * 0.6)) });
        b.items.push(x); b.made++;
        b.nextSpawn = (t - b.nextSpawn > dt ? t : b.nextSpawn) + Math.max(0.5, b.p.interval);
      }
    }
    const pose = x => { const b = by.get(x.conv), [px, pz, yaw] = b.at(x.s); return { id: x.id, src: x.src, size: x.size, w: x.w, h: x.h, x: px, z: pz, y: b.top + x.h / 2, yaw }; };
    const state = b => b.held ? `정체 · ${b.items.length}개 대기` : b.items.length ? `이송 중 · ${b.items.length}개` : '비어 있음';
    return {
      belts: B, by, t: () => t, step,
      advanceTo(T) { let n = 0; while (t + DT / 2 < T && n++ < 200000) step(DT); },
      items: () => B.flatMap(b => b.items.map(pose)),
      stats: () => Object.fromEntries(B.map(b => [b.id, { name: b.name, n: b.items.length, held: b.held, made: b.made, done: b.done, state: state(b) }]))
    };
  }

  // the network sampled every SPF seconds for the export: item slots per source (x, y, z, yaw per frame;
  // null = hidden) and each conveyor's state as change points
  function record(doc, frames, SPF) {
    const S = sim(doc), pools = new Map(), conv = {};
    if (!S.belts.some(b => b.p.source)) return { pools: [], conveyors: {} };
    const seg = (k, v, f) => { const a = conv[k.id] || (conv[k.id] = { name: k.name, state: [], made: [], done: [] }); for (const [key, val] of Object.entries(v)) { const s = a[key]; if (!s.length || s[s.length - 1][1] !== val) s.push([f, val]); } };
    for (let f = 0; f < frames; f++) {
      S.advanceTo(f * SPF);
      const live = new Set();
      for (const x of S.items()) {
        let pool = pools.get(x.src); if (!pool) pools.set(x.src, pool = { src: x.src, size: x.size, w: x.w, h: x.h, slots: [] });
        let sl = pool.slots.find(q => q.item === x.id);
        if (!sl) { // a slot hidden for at least two frames (it sinks, then moves under the floor)
          sl = pool.slots.find(q => q.item === null && f - q.last >= 3);
          if (!sl) { if (pool.slots.length >= SLOTS) continue; sl = { item: null, last: -9, pos: new Array(frames).fill(null) }; pool.slots.push(sl); }
          sl.item = x.id;
        }
        sl.pos[f] = [x.x, x.y, x.z, x.yaw]; sl.last = f; live.add(x.id);
      }
      for (const pool of pools.values()) for (const sl of pool.slots) if (sl.item !== null && !live.has(sl.item)) sl.item = null;
      const st = S.stats(); for (const b of S.belts) seg(b, { state: st[b.id].state, made: st[b.id].made, done: st[b.id].done }, f);
    }
    // hidden frames: the first one stays where the item was (sinking), the rest wait under the next spawn point
    for (const pool of pools.values()) for (const sl of pool.slots) {
      const P = sl.pos; let next = null;
      for (let f = frames - 1; f >= 0; f--) { if (P[f]) next = P[f]; else P[f] = { next }; }
      let prev = null, wasVisible = false;
      for (let f = 0; f < frames; f++) {
        const v = P[f];
        if (Array.isArray(v)) { prev = v; wasVisible = true; continue; }
        const from = wasVisible ? prev : (v.next || prev);
        P[f] = [from[0], -1.5, from[2], from[3]]; wasVisible = false;
      }
    }
    return { pools: [...pools.values()].map(p => ({ src: p.src, size: p.size, w: p.w, h: p.h, slots: p.slots.map(s => s.pos) })), conveyors: conv };
  }

  window.FactoryFlow = { belt, belts, network, snap, sim, record, DT, LINK };
})();
