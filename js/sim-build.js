// ONE SIMULATION, ?src=build: opens the factory laid out in ONE BUILDER (Factory Builder) with the machines saved in
// Machine Builder, on the same stage as the demo line, and runs it.
// Each machine works from its card (cycle time, yield). Parts follow the process flows drawn in Factory Builder:
// they ride through a machine along its own route (its conveyors), leave at its outlet and are carried to the next
// inlet by what the flow names (conveyor, AMR, forklift, worker). Nothing teleports: every part is one object from
// the raw-material pallet to the finished-goods pallet. A browser demo run, not the server DES (R1 §2 principle 7).
(() => {
  'use strict';
  const $ = id => document.getElementById(id), T = window.THREE, L = window.OneLibrary;
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // no factory saved in ONE BUILDER yet: the default partner plant line (js/plant-machines.js)
  // a stored factory that is still an older copy of the example (before .plant4) is replaced by the current example
  const P = window.OnePlant, saved = read('one.build.factory'), oldEx = saved && P && ['예시 공정 · 감마 라인', '감마 라인 (협력사 설비)'].includes(saved.meta?.name) && !read('one.build.factory.plant4');
  const fdoc = (!oldEx && saved) || (P ? P.defaultFactory() : null), lib = P ? P.withPlant(read('one.build.machines') || {}) : read('one.build.machines') || {};

  // header: this page now shows the builder's factory
  const back = document.querySelector('.back'); back.href = '/build'; back.textContent = '← ONE BUILDER';
  document.querySelector('.crumb').textContent = fdoc ? `Factory Builder · ${fdoc.meta.name || '공장'}` : 'Factory Builder';
  $('modes').hidden = true; const legend = document.querySelector('.legend'), footer = document.querySelector('footer');
  legend.hidden = true; footer.style.display = 'none';

  const stage = window.OneStage.create($('c')), { camera } = stage;
  if (!fdoc) { $('loading').innerHTML = 'ONE BUILDER에 저장된 공장이 없습니다.<br><br><a class="btn pri" href="/build" style="text-decoration:none">ONE BUILDER로 가기</a>'; return; }

  const SC = window.OneScene.create({ lib: () => lib }), root = new T.Group(); stage.world.add(root);
  const items = SC.factoryItems(fdoc), objs = new Map();
  for (const it of items) { let o; try { o = SC.buildFactoryObj(it, fdoc); } catch (e) { continue; } root.add(o); objs.set(it.id, { o, it }); }

  // floor: the slab as a faint tint with an ivory edge, the stage grid underneath
  const r = SC.slabRect(fdoc), w = (r.x1 - r.x0) / 1000, d = (r.y1 - r.y0) / 1000, c = SC.toS([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0]);
  const slab = new T.Group(); slab.add(new T.Mesh(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x2a2b31, transparent: true, opacity: 0.3, depthWrite: false })));
  slab.add(new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, 0.001, d)), new T.LineBasicMaterial({ color: 0xe9e3d5, transparent: true, opacity: 0.55 })));
  slab.position.set(c.x, 0.001, c.z); stage.overlay.add(slab); stage.mirrorPass.mirror = false;
  const m = Math.max(w, d) * 0.35 + 6; stage.setBounds(new T.Box3(new T.Vector3(c.x - w / 2 - m, 0, c.z - d / 2 - m), new T.Vector3(c.x + w / 2 + m, 6, c.z + d / 2 + m))); stage.setGrid(0.5, 5);
  const fitAll = () => stage.fit(new T.Box3().setFromPoints([SC.toS([r.x0, r.y0, 0]), SC.toS([r.x1, r.y1, 4000])]), 1.05);
  fitAll();

  // machine cards: instance override → saved machine card → library card
  const machines = items.filter(it => it.path === 'machines').map(it => {
    const x = it.item, def = it.def && L.FACTORY[it.def], ov = x.cardOverride || {};
    let card = {}, name = x.name;
    if (it.local) { const doc = SC.localDoc(it.local); card = doc?.card || {}; name = name || lib[it.local.id]?.name; }
    else if (def) { card = { cycle_time: x.params?.cycle_time ?? def.params.cycle_time, ok_rate: x.params?.ok_rate ?? def.params.ok_rate }; name = name || def.name; }
    const ct = ov.cycle_time ?? card.cycle_time ?? null, ok = ov.ok_rate ?? card.ok_rate ?? 1;
    return { it, code: x.tagPrefix.split('.').pop(), name: name || '설비', ct, ok, uph: ct ? 3600 / ct * ok : null };
  });
  const rated = machines.filter(x => x.uph), bn = rated.length ? rated.reduce((a, b) => (b.uph < a.uph ? b : a)) : null;
  // the bottleneck: its cell outline on the floor in glowing amber (a thick frame just outside the cell's footprint)
  const ringAt = o => { const b = new T.Box3().setFromObject(o), s = b.getSize(new T.Vector3()), ctr = b.getCenter(new T.Vector3()), w = s.x + 0.6, d = s.z + 0.6, t = 0.12;
    const mat = new T.MeshStandardMaterial({ color: 0, emissive: new T.Color(stage.PAL.amber), emissiveIntensity: 3, roughness: 1, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false }), g = new T.Group();
    for (const [x, z, a, c] of [[0, -d / 2, w + t, t], [0, d / 2, w + t, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]]) { const m = new T.Mesh(new T.PlaneGeometry(a, c).rotateX(-Math.PI / 2), mat); m.position.set(x, 0, z); g.add(m); }
    g.position.set(ctr.x, 0.014, ctr.z); g.renderOrder = 1; g.traverse(m => m.layers.enableAll()); stage.world.add(g); return g; };
  const bn0 = bn ? ringAt(objs.get(bn.it.id).o) : null;

  const flows = (fdoc.flows || []).filter(f => objs.has(f.from.split('.')[0]) && objs.has(f.to.split('.')[0]));
  const DEF_CT = 30; // a machine without a cycle time on its card runs at 30 s (shown as 가정)

  /* ------------------------------------------------------------------ run model */
  const rng = (s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(20261103);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));
  const polyLen = pts => pts.reduce((s, p, i) => s + (i ? dist(pts[i - 1], p) : 0), 0);
  function along(pts, u) { const total = polyLen(pts); let s = Math.max(0, Math.min(1, u)) * total;
    for (let i = 1; i < pts.length; i++) { const l = dist(pts[i - 1], pts[i]); if (s <= l || i === pts.length - 1) { const k = l ? Math.min(1, s / l) : 1, a = pts[i - 1], b = pts[i]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * k]; } s -= l; }
    return pts[pts.length - 1].slice(); }
  const PART = [240, 180, 120]; // mm, a generic work piece
  const okMat = L.mat('work'), ngMat = new T.MeshStandardMaterial({ color: 0xd2453c, roughness: 0.6 });
  const parts = [];
  function newPart(p) { const g = L.workShape('box', PART[0] / 1000, PART[1] / 1000, PART[2] / 1000); g.traverse(o => { if (o.isMesh) o.material = okMat; }); root.add(g); const pt = { o: g, p: p.slice(), ng: false, anim: null }; setPos(pt, p); parts.push(pt); return pt; }
  function setPos(pt, p) { pt.p = p; SC.placeObj(pt.o, p, pt.yaw || 0); }
  function markNg(pt) { pt.ng = true; pt.ngAt = performance.now(); pt.o.traverse(o => { if (o.isMesh) o.material = ngMat; }); }
  // move a part along a polyline over d seconds, then call done
  const animate = (pt, pts, d, done) => { pt.anim = { pts, d: Math.max(0.05, d), t: 0, done }; };

  // pallets: raw material in, finished goods out. A pallet is a grid of slots, layered.
  function pallet(at, yaw, full) { const g = new T.Group(); g.add(new T.Mesh(new T.BoxGeometry(1.2, 0.14, 1.0).translate(0, 0.07, 0), L.mat('frame'))); root.add(g); SC.placeObj(g, at, yaw);
    const slots = []; for (let l = 0; l < 3; l++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const lx = -390 + i * 260, ly = -300 + j * 200, r = yaw * Math.PI / 180;
      slots.push([at[0] + lx * Math.cos(r) - ly * Math.sin(r), at[1] + lx * Math.sin(r) + ly * Math.cos(r), 140 + l * PART[2]]); }
    const P = { at, slots, parts: [] }; if (full) for (const s of slots) P.parts.push(newPart(s)); return P; }

  // stations: every machine or storage that a flow touches
  const st = new Map();
  function station(id) { if (st.has(id)) return st.get(id); const { it, o } = objs.get(id), P = SC.instancePorts(it); if (!P) return null;
    const mc = machines.find(x => x.it.id === id), path = SC.instancePath(it) || [P.inlet, P.outlet];
    const s = { id, it, o, P, path, kind: it.path === 'storage' ? 'store' : 'mach', name: mc ? `${mc.code} ${mc.name}` : (it.item.name || (it.item.kind === 'rack' ? '랙' : '보관 구역')), code: mc?.code || (it.item.kind === 'rack' ? 'RK' : 'ST'),
      ct: mc?.ct || DEF_CT, assumed: !mc?.ct && it.path !== 'storage', ok: mc ? mc.ok : 1, ins: [], outs: [], inQ: null, inRes: false, cur: null, t: 0, outQ: null, feeding: false,
      busy: 0, blocked: 0, idle: 0, made: 0, ng: 0, buf: [], belts: [] };
    // conveyors inside a Machine Builder machine run while it works
    // robots and index tables of the cell (its own objects when it is split, else its 모델 객체 blocks) move while it works
    s.rigs = []; s.mt = 0;
    if (it.local && it.item.params?.exploded) { for (const [, v] of objs) if (v.it.path === 'blocks' && v.it.item.params?.cell === id) s.rigs.push(v.o); }
    else if (it.local) o.traverse(x => { if (x.name === 'model-part') s.rigs.push(x); });
    if (it.local) { const doc = SC.localDoc(it.local); if (doc) doc.nodes.forEach((n, i) => { const bd = L.BLOCKS[n.blockType]; if (bd?.conveyor && o.children[i]) s.belts.push({ g: o.children[i], bd, p: n.params, v: 0 }); }); }
    st.set(id, s); return s; }

  // links: one per flow, with what carries the part
  const links = [];
  const VIA = { conveyor: '컨베이어', amr: 'AMR', forklift: '지게차', worker: '작업자' };
  const movers = items.filter(it => it.path === 'movers'), usedMover = new Set();
  for (const f of flows) {
    const a = station(f.from.split('.')[0]), b = station(f.to.split('.')[0]); if (!a || !b || a === b) continue;
    const gap = dist(a.P.outlet, b.P.inlet); let via = f.via || 'auto'; if (via === 'auto') via = gap <= 3000 ? 'conveyor' : 'amr';
    const k = { f, from: a, to: b, via, ratio: f.ratio ?? 1, credit: 0 }; a.outs.push(k); b.ins.push(k); links.push(k);
    if (gap < 150) { k.kind = 'direct'; continue; }
    if (via === 'conveyor') buildConveyor(k); else buildCarrier(k);
  }
  for (const s of st.values()) { s.src = !s.ins.length; s.sink = !s.outs.length;
    if (s.src) { const P = s.P, at = s.kind === 'store' ? [P.outlet[0] + P.dir[0] * 900, P.outlet[1] + P.dir[1] * 900, 0] : [P.inlet[0] - P.dir[0] * 1100, P.inlet[1] - P.dir[1] * 1100, 0]; s.raw = pallet(at, s.it.item.transform.rotation[2] || 0, true); }
    if (s.sink) { const P = s.P, at = s.kind === 'store' ? [P.inlet[0] - P.dir[0] * 900, P.inlet[1] - P.dir[1] * 900, 0] : [P.outlet[0] + P.dir[0] * 1100, P.outlet[1] + P.dir[1] * 1100, 0]; s.fin = pallet(at, s.it.item.transform.rotation[2] || 0, false); }
    if (s.kind === 'mach') { const P = s.P, sd = [-P.dir[1], P.dir[0]]; s.ngBin = { at: [P.outlet[0] - P.dir[0] * 300 + sd[0] * 900, P.outlet[1] - P.dir[1] * 300 + sd[1] * 900, 0], n: 0 };
      const bin = new T.Mesh(new T.BoxGeometry(0.6, 0.4, 0.45).translate(0, 0.2, 0), ngMat); bin.material = new T.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.8 }); root.add(bin); SC.placeObj(bin, s.ngBin.at, s.it.item.transform.rotation[2] || 0); } }

  // a conveyor drawn between two machines: straight when they line up, else out → across → in (all square to the line)
  function buildConveyor(k) {
    const o = k.from.P.outlet, i = k.to.P.inlet, dir = k.from.P.dir, h = Math.max(300, Math.min(o[2], i[2]));
    const along_ = (i[0] - o[0]) * dir[0] + (i[1] - o[1]) * dir[1], side = -(i[0] - o[0]) * dir[1] + (i[1] - o[1]) * dir[0];
    let pts; if (Math.abs(side) < 150 || along_ < 900) pts = [o, i];
    else { const a = [o[0] + dir[0] * along_ / 2, o[1] + dir[1] * along_ / 2, o[2]], b = [i[0] - dir[0] * along_ / 2, i[1] - dir[1] * along_ / 2, i[2]]; pts = [o, a, b, i]; }
    k.kind = 'conv'; k.pts = pts.map(p => [p[0], p[1], p[2] + 0]); k.len = polyLen(k.pts); k.v = 300; k.pitch = 420; k.on = []; k.belts = [];
    const bd = L.BLOCKS['belt-conveyor'];
    for (let n = 1; n < pts.length; n++) { const p = pts[n - 1], q = pts[n], len = Math.hypot(q[0] - p[0], q[1] - p[1]) + (n < pts.length - 1 ? 250 : 0); if (len < 200) continue;
      const g = L.conveyorShape('belt', len / 1000, 0.5, h / 1000), yaw = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI; root.add(g);
      SC.placeObj(g, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0], yaw); k.belts.push({ g, bd }); }
  }
  // a carrier (AMR, forklift or worker) that shuttles between the two ends; a placed mover of that kind is used first
  function buildCarrier(k) {
    const kind = k.via === 'worker' ? 'worker' : k.via === 'forklift' ? 'forklift' : 'amr';
    const o = k.from.P.outlet, i = k.to.P.inlet, od = k.from.P.dir, id = k.to.P.dir, off = kind === 'forklift' ? 2100 : 900;
    k.kind = 'car'; k.pick = [o[0] + od[0] * off, o[1] + od[1] * off]; k.drop = [i[0] - id[0] * off, i[1] - id[1] * off];
    const mv = movers.find(x => x.item.kind === kind && !usedMover.has(x.id));
    let g, p; if (mv) { usedMover.add(mv.id); g = objs.get(mv.id).o; p = [mv.item.transform.position[0], mv.item.transform.position[1]]; }
    else { g = L.special.mover(kind, { variant: 'amr' }); root.add(g); p = k.pick.slice(); }
    k.car = { kind, g, p, yaw: Math.atan2(od[1], od[0]) * 180 / Math.PI, state: mv ? 'back' : 'idle', part: null, speed: kind === 'worker' ? 1000 : kind === 'forklift' ? 1500 : 1200, lift: kind === 'worker' ? 1000 : kind === 'forklift' ? 150 : 400, reach: kind === 'forklift' ? 1200 : kind === 'worker' ? 350 : 0 };
    placeCar(k.car);
  }
  function placeCar(c) { SC.placeObj(c.g, [c.p[0], c.p[1], 0], c.yaw); }
  const carryPoint = c => { const r = c.yaw * Math.PI / 180; return [c.p[0] + Math.cos(r) * c.reach, c.p[1] + Math.sin(r) * c.reach, c.lift]; };
  function driveTo(c, to, dt) { const dx = to[0] - c.p[0], dy = to[1] - c.p[1], dd = Math.hypot(dx, dy); if (dd < 1) return true;
    let want = Math.atan2(dy, dx) * 180 / Math.PI; if (c.kind === 'forklift' && c.state === 'back') want += 180; // a forklift backs out
    let dy_ = ((want - c.yaw + 540) % 360) - 180; const turn = 180 * dt; if (Math.abs(dy_) > 2) { c.yaw += Math.sign(dy_) * Math.min(Math.abs(dy_), turn); if (Math.abs(dy_) > 30) { placeCar(c); return false; } }
    const st_ = Math.min(dd, c.speed * dt); c.p[0] += dx / dd * st_; c.p[1] += dy / dd * st_; placeCar(c); return dd - st_ < 1; }

  // routing: split by ratio (smooth weighted round robin)
  function route(s) { if (s.outs.length < 2) return s.outs[0]; let best = null, tot = 0; for (const k of s.outs) { k.credit += k.ratio; tot += k.ratio; if (!best || k.credit > best.credit) best = k; } best.credit -= tot; return best; }
  const free = s => !s.inQ && !s.inRes && !(s.kind === 'store' && s.buf.length >= 40);

  /* ------------------------------------------------------------------ one step (dt s of factory time) */
  let simT = 0;
  function step(dt) {
    simT += dt;
    for (const pt of parts) if (pt.anim) { const a = pt.anim; a.t += dt; setPos(pt, along(a.pts, a.t / a.d)); if (a.t >= a.d) { pt.anim = null; a.done && a.done(); } }
    for (const s of st.values()) {
      // sources pull the next part off the raw-material pallet
      if (s.src && !s.feeding && (s.kind === 'store' ? !s.outQ : !s.inQ)) { if (!s.raw.parts.length) for (const q of s.raw.slots) s.raw.parts.push(newPart(q)); // a fresh pallet
        const pt = s.raw.parts.pop(); s.feeding = true; const to = s.kind === 'store' ? s.P.outlet : s.P.inlet, lift = [pt.p[0], pt.p[1], Math.max(pt.p[2], to[2]) + 150];
        animate(pt, [pt.p, lift, [to[0], to[1], to[2] + 150], to], 2.5, () => { s.feeding = false; if (s.kind === 'store') { s.outQ = pt; pt.link = route(s); } else s.inQ = pt; }); }
      if (s.kind === 'store') {
        if (s.inQ && !s.inQ.anim && !s.stowing) { const pt = s.inQ; s.stowing = true;
          if (s.sink) { const P = s.fin; if (P.parts.length >= P.slots.length) { for (const q of P.parts) { root.remove(q.o); parts.splice(parts.indexOf(q), 1); } P.parts = []; }
            const q = P.slots[P.parts.length]; P.parts.push(pt); animate(pt, [pt.p, [pt.p[0], pt.p[1], Math.max(pt.p[2], q[2]) + 200], [q[0], q[1], q[2] + 200], q], 2.5, () => { s.inQ = null; s.stowing = false; s.made++; }); }
          else { s.buf.push(pt); s.inQ = null; s.stowing = false; } }
        if (!s.src && !s.sink && !s.outQ && s.buf.length && !s.feeding) { const pt = s.buf.shift(); s.feeding = true; animate(pt, [pt.p, s.P.outlet], 3, () => { s.feeding = false; s.outQ = pt; pt.link = route(s); }); }
        continue; }
      // a machine: take the waiting part, work it along its route for one cycle, hand it to its outlet
      if (!s.cur && s.inQ && !s.inQ.anim) { s.cur = s.inQ; s.inQ = null; s.t = 0; }
      let state = 'idle';
      if (s.cur) { if (s.t < s.ct) { s.t = Math.min(s.ct, s.t + dt); setPos(s.cur, along(s.path, s.t / s.ct)); state = 'busy'; }
        else { const pt = s.cur; if (pt.judged !== s.id) { pt.judged = s.id; if (rng() > s.ok) { markNg(pt); s.alarmAt = performance.now(); } }
          if (pt.ng) { const b = s.ngBin, q = [b.at[0], b.at[1], 420 + Math.min(b.n, 4) * 30]; b.n++; s.ng++; s.cur = null; animate(pt, [pt.p, [pt.p[0], pt.p[1], pt.p[2] + 200], [q[0], q[1], Math.max(pt.p[2], q[2]) + 200], q], 2.5); }
          else if (s.sink) { const P = s.fin; if (P.parts.length >= P.slots.length) { for (const q of P.parts) { root.remove(q.o); parts.splice(parts.indexOf(q), 1); } P.parts = []; }
            const q = P.slots[P.parts.length]; P.parts.push(pt); s.cur = null; s.made++; animate(pt, [pt.p, [pt.p[0], pt.p[1], Math.max(pt.p[2], q[2]) + 200], [q[0], q[1], q[2] + 200], q], 2.5); }
          else if (!s.outQ) { s.outQ = pt; pt.link = route(s); s.cur = null; s.made++; }
          else state = 'blocked'; } }
      s[state] += dt; s.state = state;
      if (state === 'busy') { s.mt += dt; for (const g of s.rigs) if (g.userData.rig) { const c = g.userData.cycle || 6; L.poseModel(g, (s.mt % c) / c); } }
      for (const b of s.belts) { if (state === 'busy') b.v += b.p.speed * dt || 300 * dt; b.bd.pose(b.g, b.p, { BELT: b.v }); }
    }
    for (const k of links) {
      if (k.kind === 'direct') { const pt = k.from.outQ; if (pt && pt.link === k && free(k.to)) { k.from.outQ = null; k.to.inRes = true; animate(pt, [pt.p, k.to.P.inlet], 1, () => { k.to.inRes = false; k.to.inQ = pt; }); } continue; }
      if (k.kind === 'conv') {
        const pt = k.from.outQ; if (pt && pt.link === k && (!k.on.length || k.on[k.on.length - 1].s >= k.pitch)) { k.from.outQ = null; k.on.push({ pt, s: 0 }); }
        let moving = false;
        k.on.forEach((e, i) => { const max = i ? k.on[i - 1].s - k.pitch : k.len, ns = Math.min(max, e.s + k.v * dt); if (ns > e.s + 0.01) moving = true; e.s = Math.max(e.s, ns); setPos(e.pt, along(k.pts, e.s / k.len)); });
        if (k.on.length && k.on[0].s >= k.len - 0.5 && free(k.to)) { const e = k.on.shift(); k.to.inQ = e.pt; }
        if (moving) { k.belt = (k.belt || 0) + k.v * dt; for (const b of k.belts) b.bd.pose(b.g, {}, { BELT: k.belt }); }
        continue; }
      const c = k.car;
      if (c.state === 'idle') { const pt = k.from.outQ; if (!driveTo(c, k.pick, dt)) continue; if (pt && pt.link === k && free(k.to)) { k.from.outQ = null; k.to.inRes = true; c.part = pt; c.state = 'load'; c.t = 0;
          const cp = carryPoint(c); animate(pt, [pt.p, [cp[0], cp[1], Math.max(pt.p[2], cp[2]) + 150], cp], 2, () => { c.state = 'go'; }); } }
      else if (c.state === 'go') { if (driveTo(c, k.drop, dt)) { c.state = 'unload'; const pt = c.part, to = k.to.P.inlet; animate(pt, [pt.p, [pt.p[0], pt.p[1], Math.max(pt.p[2], to[2]) + 150], to], 2, () => { k.to.inRes = false; k.to.inQ = pt; c.part = null; c.state = 'back'; }); } }
      else if (c.state === 'back') { if (driveTo(c, k.pick, dt)) c.state = 'idle'; }
      if (c.part && c.state === 'go') setPos(c.part, carryPoint(c));
    }
  }

  /* ------------------------------------------------------------------ panel */
  const stations = [...st.values()], mstations = stations.filter(s => s.kind === 'mach');
  const fmt = t => [t / 3600, t / 60 % 60, t % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');
  document.querySelector('aside').innerHTML = `
    <section><h2>결과 <span id="kNote">${esc(fdoc.meta.name || '공장')}</span></h2>
      <div class="kpis"><div class="kpi"><b id="kOk">0</b><span>완성 (양품)</span></div><div class="kpi"><b id="kUph">–</b><span>시간당 생산 (실측)</span></div>
      <div class="kpi"><b id="kWip">0</b><span>재공 (라인 위 부품)</span></div><div class="kpi"><b id="kNg">0</b><span>불량</span></div></div></section>
    <section><h2>병목 <span>가동률 기준</span></h2><div class="bn-box"><b id="bnNow">–</b><span id="bnWhy">돌려 보면 가장 바쁜 설비가 나옵니다. 카드로 계산한 병목은 ${bn ? esc(`${bn.code} (${bn.uph.toFixed(1)}/h)`) : '없음'}입니다.</span></div></section>
    <section><h2>설비 <span>가동 · 막힘</span></h2><div id="rows"></div></section>
    <section><h2>흐름</h2><div id="links" style="display:grid;gap:4px;font-size:12px"></div>
      <p class="note">${flows.length ? '부품은 원자재 파렛트에서 나와 각 설비의 경로를 따라 가공되고, 흐름에 정한 수단으로 다음 설비 입구까지 옮겨집니다. 불량은 설비 옆 빨간 통으로 갑니다. 원자재 파렛트가 비거나 완성품 파렛트가 차면 새 파렛트로 바뀝니다.' : '아직 설비끼리 공정 흐름이 연결되지 않았습니다. Factory Builder에서 설비의 주황 출구 화살표를 끌어 다음 설비에 놓으면 여기서 부품이 흐릅니다.'}</p>
      <div style="display:flex;gap:8px;margin-top:10px"><a class="btn" href="/build" style="text-decoration:none">ONE BUILDER에서 고치기</a></div></section>`;
  $('rows').innerHTML = mstations.map(s => `<div class="row" data-id="${s.id}"><span class="id"><i></i>${esc(s.code)}</span><span><span class="nm">${esc(s.name)}${s.assumed ? ' (사이클 가정 30 s)' : ''}</span><span class="util"><u style="background:var(--busy)"></u><u style="background:var(--blocked)"></u></span></span><span class="pc"></span></div>`).join('') || '<p class="note">흐름에 연결된 설비가 없습니다</p>';
  $('links').innerHTML = links.map(k => `<div><b style="font-family:var(--mono)">${esc(k.from.code)} → ${esc(k.to.code)}</b> <span style="color:var(--mute)">${k.kind === 'direct' ? '바로 넘김' : VIA[k.via]}${k.ratio < 1 ? ` · ${Math.round(k.ratio * 100)}%` : ''}</span></div>`).join('') || '';
  const rowEls = mstations.map(s => ({ s, el: $('rows').querySelector(`[data-id="${s.id}"]`) }));
  $('rows').addEventListener('click', e => { const r_ = e.target.closest('[data-id]'); if (!r_) return; const s = st.get(r_.dataset.id); stage.fit(new T.Box3().setFromObject(s.o).expandByScalar(1.5), 1.2); });
  let bnRing = bn0, bnId = bn ? bn.it.id : null;
  function drawPanel() { const made = stations.filter(s => s.sink).reduce((a, s) => a + s.made, 0), ng = mstations.reduce((a, s) => a + s.ng, 0), wip = parts.filter(p => !p.ng && !stations.some(s => (s.fin && s.fin.parts.includes(p)) || (s.raw && s.raw.parts.includes(p)))).length;
    $('kOk').textContent = made; $('kNg').textContent = ng; $('kWip').textContent = wip; $('kUph').textContent = simT > 600 ? (made / simT * 3600).toFixed(1) : '–'; $('clock').textContent = fmt(simT);
    let top = null; for (const { s, el } of rowEls) { const T_ = s.busy + s.blocked + s.idle || 1, b = s.busy / T_, k = s.blocked / T_; const u = el.querySelectorAll('u'); u[0].style.width = b * 100 + '%'; u[1].style.width = k * 100 + '%';
      el.querySelector('.pc').textContent = Math.round(b * 100) + '%'; el.querySelector('i').style.background = `var(--${s.state === 'busy' ? 'busy' : s.state === 'blocked' ? 'blocked' : 'idle'})`; if (!top || b > top.b) top = { s, b }; }
    if (top && simT > 120) { $('bnNow').textContent = `${top.s.name} · 가동 ${Math.round(top.b * 100)}%`; $('bnWhy').textContent = `흐르는 동안 가장 오래 일한 설비입니다. 이 설비 앞에 부품이 쌓이고, 뒤 설비는 기다립니다.${bn ? ` 카드 기준 병목은 ${bn.code}입니다.` : ''}`;
      if (bnId !== top.s.id) { if (bnRing) bnRing.parent.remove(bnRing); bnRing = ringAt(top.s.o); bnId = top.s.id; } } }

  // view chips: 전체 · X-RAY (see parts inside closed machines)
  let xray = false;
  const chip = (txt, fn) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = txt; b.onclick = () => fn(b); $('views').appendChild(b); return b; };
  chip('전체', fitAll);
  // 단색: charcoal · grey · ivory with one amber accent (stage.studio), on by default; status lamps and screens keep their colour
  let mono = true;
  { const b = chip('단색', () => { mono = !mono; b.classList.toggle('on', mono); stage.studio(stage.world, mono); }); b.classList.add('on'); b.title = '단색 (차콜 · 회색 · 아이보리) / 원래 색'; }
  stage.studio(stage.world, mono);
  const xrayHot = o => machines.some(x => objs.get(x.it.id)?.o === o);
  chip('X-RAY', b => { xray = !xray; if (xray) stage.addTwin(root, xrayHot); stage.ghost(xray); b.classList.toggle('on', xray); });
  // a model that arrives while X-RAY is on gets its outline too (otherwise it would vanish in the ghost view)
  L.onModel(g => { if (xray) stage.addTwin(g, xrayHot); if (mono) stage.studio(g, true); });

  // machine labels (projected HTML) with a state dot
  const tags = $('tags'), v3 = new T.Vector3(), box = new T.Box3();
  const els = machines.map(x => { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<i style="width:7px;height:7px;border-radius:50%;display:block;background:var(--idle)"></i><b>${esc(x.code)}</b>${esc(x.name)}`; tags.appendChild(el); return { x, el, s: st.get(x.it.id) }; });
  const updateTags = () => { const rc = $('c').getBoundingClientRect(); for (const { x, el, s } of els) { const o = objs.get(x.it.id)?.o; if (!o) continue; box.setFromObject(o); box.getCenter(v3); v3.y = box.max.y + 0.1; v3.project(camera);
    el.style.display = Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05 ? '' : 'none'; el.style.left = ((v3.x + 1) / 2 * rc.width) + 'px'; el.style.top = ((1 - v3.y) / 2 * rc.height) + 'px';
    el.firstChild.style.background = !s ? 'var(--dim)' : `var(--${s.state === 'busy' ? 'busy' : s.state === 'blocked' ? 'blocked' : 'idle'})`; } };

  // clock: play / pause, speed
  let playing = links.length > 0, speed = 10;
  if (links.length) { footer.style.display = ''; legend.hidden = false; legend.innerHTML = '<span><i class="st-busy"></i>가동</span><span><i class="st-idle"></i>대기</span><span><i class="st-blocked"></i>막힘 (출구가 비지 않음)</span>';
    $('seek').hidden = true; $('horizonL').textContent = '공장 시간'; $('play').textContent = '❚❚';
    $('speeds').innerHTML = [1, 10, 30, 60].map(v => `<button data-v="${v}" class="${v === speed ? 'on' : ''}">×${v}</button>`).join('');
    $('speeds').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; speed = +b.dataset.v; $('speeds').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    $('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '❚❚' : '▶'; };
    addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('play').click(); } }); }
  setTimeout(stage.resize, 0);

  // status effects of the cells' own objects (tower lamps, sensors, operator screens), once a frame
  const wp = new T.Vector3();
  function updateFx() { const now = performance.now();
    for (const s of mstations) { const there = [s.cur, s.inQ].filter(Boolean).map(pt => pt.o.position);
      const f = { state: s.state || 'idle', alarm: s.alarmAt && now - s.alarmAt < 1500, title: s.name, made: s.made, ng: s.ng, k: s.cur ? s.t / s.ct : 0 };
      for (const g of s.rigs) { const fx = g.userData.fx; if (!fx) continue;
        if (fx.kind === 'sensor') { if (!g.userData.at) g.userData.at = g.getWorldPosition(new T.Vector3()); wp.copy(g.userData.at); f.hit = there.some(q => Math.hypot(q.x - wp.x, q.z - wp.z) < 0.9); }
        L.setFx(g, f); } } }

  $('loading').hidden = true;
  let last = performance.now(), fr = 0;
  const loop = now => { const real = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) { let left = real * speed; while (left > 1e-6) { const h = Math.min(0.1, left); step(h); left -= h; } }
    updateFx(); stage.render(); updateTags(); if (links.length && (fr++ % 10 === 0)) drawPanel(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.ONE_SIMB = { st, links, parts, step: n => { for (let i = 0; i < n; i++) step(0.1); drawPanel(); }, get t() { return simT; } };
})();
