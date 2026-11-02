// Robot work at a conveyor stop (ONE SIM, sim-layout.js): a 6-axis robot handles or welds the part standing there.
//
// The robot model must have joints Joint_1 … Joint_6 (each turning about one local axis, glTF extras anim.axis;
// the FAIRINO models in assets/models/egr-line-v3 do). A tool is mounted on the flange (Joint_6, +Z).
//
// 'pick' (gripper): from over the place where it last put a part down → over the stop → down → close the jaws → lift →
//   the work position (held there for the rest of the process) → over the put-down place → down. The jaws open only
//   when the line takes the part on (the station hands it over), so while the next stretch is full the robot keeps
//   holding it. The put-down place is the same stop, or the start of another belt (a transfer between belts).
//   After letting go it lifts straight up (retreat).
// 'weld' (torch): the part stays on the stop; the torch runs along the two top edges along the belt, a weld bead
//   growing behind it (the caller draws it on the part, see pose().weld), then lifts away.
//
// Paths are straight tool lines sampled every 2 cm and solved once with numeric inverse kinematics (damped least
// squares on the six joints; tool pointing straight down, gripper jaws across the belt). Moves run at a fixed tool
// speed (eased); the process time takes what is left of the cycle (all moves shrink in proportion when it is shorter).
(() => {
  'use strict';
  const DEG = Math.PI / 180, AXES = ['y', 'z', 'z', 'z', 'y', 'z'], FLANGE = 0.101, BAR = 0.07, SPEED = 0.6, DWELL = 0.3, STEP = 0.02, TORCH = 0.17;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);

  function solve(A, b) { // Gaussian elimination with partial pivoting
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
      let pv = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[pv][i])) pv = k;
      [M[i], M[pv]] = [M[pv], M[i]];
      for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  const flat = v => v.clone().setY(0).normalize();
  // a unit vector turned part of the way from a to b about the vertical (both horizontal)
  const turn = (a, b, f) => { const ang = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) * f; return a.clone().applyAxisAngle(UP, -ang); };

  /**
   * rig(group, o) → { why: 'joints' | 'reach' } or a rig.
   *   o.mode 'pick' | 'weld'; o.pick: world point of the part's centre at the stop; o.along: belt travel there (world unit);
   *   o.place / o.alongPlace: where to put it down (default: the stop); o.width / o.height / o.length: the part
   * rig.pose(τ, ct) for time τ into a cycle of ct s → { carry, weld: { seam, u } | null }; rig.hold(): keep the part at
   * the put-down place (the line has no room yet); rig.idle(s): s seconds after the last cycle (lifting away, then waiting);
   * rig.tip(): the held part's centre (world); rig.seams: the weld seams in the part's own frame ([[x0,y,z],[x1,y,z]] each)
   */
  function rig(root, o) {
    const J = [1, 2, 3, 4, 5, 6].map(i => root.getObjectByName('Joint_' + i));
    if (J.some(j => !j)) return { why: 'joints' };
    const mode = o.mode === 'weld' ? 'weld' : 'pick';
    const AX = J.map((j, i) => (j.userData.anim && j.userData.anim.axis) || AXES[i]);
    const rest = J.map((j, i) => j.rotation[AX[i]]);
    for (const n of ['Sim_Gripper', 'Sim_Torch']) { const old = J[5].getObjectByName(n); if (old) J[5].remove(old); }
    const tool = new THREE.Group(); tool.position.set(0, 0, FLANGE); J[5].add(tool);
    const m = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.4, roughness: 0.5 }), add = (geo, mat, x, y, z) => { const b = new THREE.Mesh(geo, mat); b.position.set(x, y, z); b.castShadow = true; tool.add(b); return b; };
    let TIP;
    if (mode === 'pick') {
      tool.name = 'Sim_Gripper';
      // body, the cross bar (stays 2 cm above the part) and two jaws reaching down the part's sides from its top edge
      add(new THREE.BoxGeometry(0.07, 0.07, 0.05), m, 0, 0, 0.025);
      add(new THREE.BoxGeometry(0.05, Math.max(0.1, o.width + 0.06), 0.02), m, 0, 0, BAR - 0.01);
      const jl = Math.max(0.02, Math.min(0.08, o.height * 0.8));
      tool.userData.jaws = [-1, 1].map(s => add(new THREE.BoxGeometry(0.04, 0.012, jl), m, 0, s * (o.width / 2 + 0.03), BAR + 0.02 + jl / 2));
      TIP = V(0, 0, FLANGE + BAR + 0.02 + o.height / 2); // the held part's centre, in the flange frame (its top at the jaws' top)
    } else {
      tool.name = 'Sim_Torch';
      const cu = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.35 });
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16).rotateX(Math.PI / 2), m, 0, 0, 0.03);
      add(new THREE.CylinderGeometry(0.014, 0.018, 0.08, 16).rotateX(Math.PI / 2), m, 0, 0, 0.1);
      add(new THREE.CylinderGeometry(0.006, 0.011, 0.03, 12).rotateX(Math.PI / 2), cu, 0, 0, 0.155);
      TIP = V(0, 0, FLANGE + TORCH); // the wire tip
    }
    const setQ = q => { q.forEach((v, i) => { J[i].rotation.set(0, 0, 0); J[i].rotation[AX[i]] = v; }); root.updateMatrixWorld(true); };
    const err = (tg, X) => {
      const mw = J[5].matrixWorld, tip = TIP.clone().applyMatrix4(mw), z = V(0, 0, 1).transformDirection(mw), x = V(1, 0, 0).transformDirection(mw);
      const dz = V(0, -1, 0).sub(z), c = new THREE.Vector3().crossVectors(x, X);
      return [...tg.clone().sub(tip).toArray(), dz.x * 0.5, dz.y * 0.5, dz.z * 0.5, c.y * 0.5 + (x.dot(X) < 0 ? 0.5 : 0)]; // tool down, tool X along X
    };
    const ik = (tg, X, seed) => {
      let v = seed.slice();
      for (let it = 0; it < 200; it++) {
        setQ(v); const e = err(tg, X); if (Math.hypot(...e) < 1e-5) break;
        const Jm = [];
        for (let k = 0; k < 6; k++) { const w = v.slice(); w[k] += 1e-4; setQ(w); const e2 = err(tg, X); Jm.push(e.map((x, i) => (x - e2[i]) / 1e-4)); }
        const n = e.length, A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Jm.reduce((s, c) => s + c[i] * c[j], 0) + (i === j ? 1e-4 : 0)));
        const y = solve(A, e); v = v.map((q, k) => q + Jm[k].reduce((s, c, i) => s + c * y[i], 0) * 0.8);
      }
      setQ(v); const e = err(tg, X); return { v, e: Math.max(Math.hypot(...e.slice(0, 3)), Math.hypot(...e.slice(3)) * 0.1) }; // 1 cm ↔ ~6° off
    };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const base = J[0].getWorldPosition(new THREE.Vector3());
    const XA = flat(o.along), XB = flat(o.alongPlace || o.along);
    const P = o.pick.clone(), PB = (o.place || o.pick).clone(), moves = !o.place || PB.distanceTo(P) < 1e-3 ? false : true;
    // the weld seams: the two top edges along the belt, in the part's frame (x along, y up, z across), and in the world
    const L = o.length || o.width, seamsLocal = [-1, 1].map(sz => [[-0.4 * L, o.height / 2, sz * o.width / 2], [0.4 * L, o.height / 2, sz * o.width / 2]]);
    const ZA = V(-XA.z, 0, XA.x), toWorld = ([x, y, z], out = 0) => P.clone().addScaledVector(XA, x).addScaledVector(UP, y + 0.006).addScaledVector(ZA, z + Math.sign(z) * out);

    // the first pose for a point: shoulder turns every 45° with the elbow up and down; keep the closest, joints folded into ±180°
    const first = (tg, X) => {
      let best = null;
      for (const el of [[-90, 90, -90], [-60, 120, -150], [-120, 60, -30]]) {
        for (let t1 = 0; t1 < 360; t1 += 45) { const r = ik(tg, X, [t1, el[0], el[1], el[2], -90, 0].map(d => d * DEG)); if (!best || r.e < best.e) best = r; }
        if (best.e <= 0.002) break;
      }
      return best.e > 0.005 ? null : best.v.map(wrap);
    };
    // plan the cycle; null when a point is out of reach
    const plan = (hover, rise) => {
      let seed = null, worst = 0;
      const line = (a, b, Xa, Xb = Xa) => { const n = Math.max(1, Math.ceil(a.distanceTo(b) / STEP)), wp = [];
        for (let k = 0; k <= n; k++) { const r = ik(a.clone().lerp(b, k / n), turn(Xa, Xb, k / n), seed); seed = r.v; worst = Math.max(worst, r.e); wp.push(r.v.slice()); }
        return { wp, T: Math.max(0.15, a.distanceTo(b) / SPEED) }; };
      const seg = [], mv = (a, b, Xa, Xb, ev) => { if (a.distanceTo(b) > 1e-3) seg.push({ kind: 'move', ...line(a, b, Xa, Xb), ev }); };
      if (mode === 'pick') {
        const HA = P.clone().add(V(0, hover, 0)), HB = PB.clone().add(V(0, hover, 0));
        const mid = moves ? HA.clone().lerp(HB, 0.5) : HA.clone();
        const Q = mid.lerp(V(base.x, mid.y, base.z), 0.35).add(V(0, rise, 0)), XQ = turn(XA, XB, 0.5);
        if (!(seed = first(HB, XB))) return null;
        mv(HB, HA, XB, XA);
        mv(HA, P, XA, XA); seg.push({ kind: 'dwell', T: DWELL, ev: 'grip' });
        mv(P, HA, XA, XA); mv(HA, Q, XA, XQ); seg.push({ kind: 'hold', share: 1 });
        mv(Q, HB, XQ, XB); mv(HB, PB, XB, XB); seg.push({ kind: 'dwell', T: DWELL * 0.5, ev: 'place' });
        const retreat = line(PB, HB, XB, XB);
        return worst > 0.005 ? null : { seg, retreat, start: seg[0].wp[0] };
      }
      // weld: both seams, or only the one nearer the robot when the far one is out of reach
      const near = seamsLocal.map((s, i) => ({ i, d: toWorld(s[0]).distanceTo(base) })).sort((a, b) => a.d - b.d).map(x => x.i);
      for (const set of [[near[0], near[1]], [near[0]]]) {
        seg.length = 0; worst = 0;
        const pts = set.map(i => [toWorld(seamsLocal[i][0], 0.004), toWorld(seamsLocal[i][1], 0.004), i]);
        const lift = p => p.clone().add(V(0, hover, 0)), REST = lift(pts[0][0]);
        if (!(seed = first(REST, XA))) continue;
        let cur = REST; const go = p => { mv(cur, p, XA, XA); cur = p; };
        for (const [a, b, i] of pts) { go(lift(a)); go(a); seg.push({ kind: 'hold', share: 1 / pts.length, seam: i, ...line(a, b, XA, XA) }); cur = b; go(lift(b)); }
        go(REST);
        if (worst <= 0.005 && seg.length) return { seg, retreat: null, start: seg[0].wp[0], seams: set };
      }
      return null;
    };
    // a stop near the edge of the reach: lift the part less (never under 5 cm off the belt)
    let C = null;
    for (const [hv, rs] of mode === 'pick' ? [[0.12, 0.2], [0.08, 0.12], [0.05, 0.06]] : [[0.1, 0], [0.06, 0]]) if ((C = plan(hv, rs))) break;
    setQ(rest);
    if (!C) return { why: 'reach' };
    const seg = C.seg, fixed = seg.reduce((s, x) => s + (x.kind === 'hold' ? 0 : x.T), 0);
    const times = ct => { const k = ct >= fixed ? 1 : ct / fixed, hold = Math.max(0, ct - fixed); return seg.map(x => (x.kind === 'hold' ? hold * x.share : x.T * k)); };
    const eventAt = (ct, name) => { const T = times(ct); let t = 0; for (let i = 0; i < seg.length; i++) { if (seg[i].ev === name) return t; t += T[i]; } return Infinity; };
    const ease = u => u * u * (3 - 2 * u);
    const at = (wp, f) => { f = Math.max(0, Math.min(1, f)) * (wp.length - 1); const k = Math.min(wp.length - 2, Math.floor(f)), a = wp[k], b = wp[k + 1] || a, w = f - k; return a.map((v, j) => v + (b[j] - v) * w); };
    const endPose = C.retreat ? C.retreat.wp[0] : seg[seg.length - 1].wp ? seg[seg.length - 1].wp[seg[seg.length - 1].wp.length - 1] : C.start;
    const idlePose = C.retreat ? C.retreat.wp[C.retreat.wp.length - 1] : C.start;
    const jaws = c => { if (tool.userData.jaws) for (const [i, j] of tool.userData.jaws.entries()) j.position.y = (i ? 1 : -1) * (o.width / 2 + (c ? 0.006 : 0.03)); };
    setQ(idlePose); jaws(false);
    return {
      mode, fixed, seams: C.seams ? C.seams.map(i => seamsLocal[i]) : [],
      /** the grip happens at this time into the cycle (pick) */ grip: ct => eventAt(ct, 'grip') + DWELL * 0.5 * Math.min(1, ct / fixed),
      pose(tau, ct) {
        const T = times(ct), g = eventAt(ct, 'grip') + DWELL * 0.5 * Math.min(1, ct / fixed);
        let t = 0, q = C.start, weld = null, done = [];
        for (let i = 0; i < seg.length; i++) {
          const d = T[i], x = seg[i];
          if (tau <= t + d || i === seg.length - 1) {
            const u = d > 0 ? Math.max(0, Math.min(1, (tau - t) / d)) : 1;
            if (x.kind === 'move') q = at(x.wp, ease(u));
            else if (x.wp) { q = at(x.wp, u); if (x.seam !== undefined) weld = { seam: C.seams.indexOf(x.seam), u }; }
            else { q = C.start; for (let j = i - 1; j >= 0; j--) if (seg[j].wp) { q = seg[j].wp[seg[j].wp.length - 1]; break; } }
            break;
          }
          if (x.seam !== undefined) done.push(C.seams.indexOf(x.seam));
          t += d;
        }
        setQ(q);
        const carry = mode === 'pick' && tau >= g; jaws(carry || tau >= g - DWELL * 0.5);
        return { carry, weld, done };
      },
      hold() { setQ(endPose); jaws(true); return { carry: mode === 'pick' }; },
      idle(s) { if (C.retreat && s < C.retreat.T) { setQ(at(C.retreat.wp, ease(s / C.retreat.T))); } else setQ(idlePose); jaws(false); },
      /** heading of the tool's X (the held part's length) about the vertical */ yaw() { const x = V(1, 0, 0).transformDirection(J[5].matrixWorld); return Math.atan2(-x.z, x.x); },
      tip(out = new THREE.Vector3()) { return out.copy(TIP).applyMatrix4(J[5].matrixWorld); },
      /** world point of the torch tip (sparks) */ torch(out = new THREE.Vector3()) { return out.copy(TIP).applyMatrix4(J[5].matrixWorld); },
    };
  }
  window.SimRobot = { rig };
})();
