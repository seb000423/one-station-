// Pick-and-place motion for a 6-axis robot standing at a conveyor station (ONE SIM, sim-layout.js).
//
// The robot model must have joints Joint_1 … Joint_6 (each turning about one local axis, glTF extras anim.axis;
// the FAIRINO models in assets/models/egr-line-v3 do). A gripper is mounted on the flange (Joint_6, +Z).
// One cycle, timed to the station's cycle time:
//   hover over the stop (12 cm, less when the stop is near the edge of the reach) → down to the part → close the jaws → lift → move to the work position → hold (the process)
//   → back over the stop → down → open the jaws → up.
// The tool path is solved once (numeric inverse kinematics, damped least squares on the six joints, tool pointing
// straight down with its jaws across the belt) along straight lines sampled every 2 cm, so the gripper moves in
// straight lines and reaches every point within a few millimetres. Moves run at a fixed tool speed; the hold takes
// what is left of the cycle (all moves are shortened in proportion when the cycle is shorter than the moves).
// While the jaws are closed the part is attached to the gripper (the caller draws it at tip()); it never jumps.
(() => {
  'use strict';
  const DEG = Math.PI / 180, AXES = ['y', 'z', 'z', 'z', 'y', 'z'], FLANGE = 0.101, BAR = 0.07, SPEED = 0.6, DWELL = 0.3, STEP = 0.02;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

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

  /**
   * rig(group, { pick, along, width, height, present? }) → null (no joints / out of reach, see .why) or a rig:
   *   pick: world point of the part's centre at the stop; along: world unit vector of the belt travel; width / height: the part's
   *   pose(τ, ct): set the joints for time τ (s) into a cycle of ct seconds; returns { carry } (jaws closed on the part)
   *   home(): the hover pose; tip(v): the part centre held by the gripper (world); grip(ct) / release(ct): event times
   */
  function rig(root, o) {
    const J = [1, 2, 3, 4, 5, 6].map(i => root.getObjectByName('Joint_' + i));
    if (J.some(j => !j)) return { why: 'joints' };
    const AX = J.map((j, i) => (j.userData.anim && j.userData.anim.axis) || AXES[i]);
    const rest = J.map((j, i) => j.rotation[AX[i]]);
    // gripper on the flange: body and two jaws closing across the belt (tool Y)
    let tool = J[5].getObjectByName('Sim_Gripper');
    if (!tool) {
      tool = new THREE.Group(); tool.name = 'Sim_Gripper'; tool.position.set(0, 0, FLANGE); J[5].add(tool);
      const m = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.4, roughness: 0.5 }), add = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; tool.add(b); return b; };
      // body, the cross bar (stays 2 cm above the part) and two jaws reaching down the part's sides from its top edge
      add(0.07, 0.07, 0.05, 0, 0, 0.025);
      add(0.05, Math.max(0.1, o.width + 0.06), 0.02, 0, 0, BAR - 0.01);
      const jl = Math.max(0.02, Math.min(0.08, o.height * 0.8));
      tool.userData.jaws = [-1, 1].map(s => add(0.04, 0.012, jl, 0, s * (o.width / 2 + 0.03), BAR + 0.02 + jl / 2));
    }
    const TIP = V(0, 0, FLANGE + BAR + 0.02 + o.height / 2); // the held part's centre, in the flange frame (its top at the jaws' top)
    const X = o.along.clone().setY(0).normalize();
    const setQ = q => { q.forEach((v, i) => { J[i].rotation.set(0, 0, 0); J[i].rotation[AX[i]] = v; }); root.updateMatrixWorld(true); };
    const err = tg => {
      const mw = J[5].matrixWorld, tip = TIP.clone().applyMatrix4(mw), z = V(0, 0, 1).transformDirection(mw), x = V(1, 0, 0).transformDirection(mw);
      const dz = V(0, -1, 0).sub(z), c = new THREE.Vector3().crossVectors(x, X);
      return [...tg.clone().sub(tip).toArray(), dz.x * 0.5, dz.y * 0.5, dz.z * 0.5, c.y * 0.5 + (x.dot(X) < 0 ? 0.5 : 0)]; // tool down, jaws across the belt
    };
    const ik = (tg, seed) => {
      let v = seed.slice();
      for (let it = 0; it < 200; it++) {
        setQ(v); const e = err(tg); if (Math.hypot(...e) < 1e-5) break;
        const Jm = [];
        for (let k = 0; k < 6; k++) { const w = v.slice(); w[k] += 1e-4; setQ(w); const e2 = err(tg); Jm.push(e.map((x, i) => (x - e2[i]) / 1e-4)); }
        const n = e.length, A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Jm.reduce((s, c) => s + c[i] * c[j], 0) + (i === j ? 1e-4 : 0)));
        const y = solve(A, e); v = v.map((q, k) => q + Jm[k].reduce((s, c, i) => s + c * y[i], 0) * 0.8);
      }
      setQ(v); const e = err(tg); return { v, e: Math.max(Math.hypot(...e.slice(0, 3)), Math.hypot(...e.slice(3)) * 0.1) }; // 1 cm ↔ ~6° off
    };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    // plan the cycle for one hover height (the part is lifted that far off the belt, then raised `rise` more toward the base)
    const plan = (hover, rise) => {
      const P = o.pick.clone(), H = P.clone().add(V(0, hover, 0));
      const Q = o.present ? o.present.clone() : P.clone().lerp(V(base.x, P.y, base.z), 0.35).add(V(0, rise, 0));
      // the first pose: shoulder turns every 45° with the elbow up and down, keep the closest (stop at the first good one),
      // then fold every joint into ±180° so the arm never winds up
      let best = null;
      for (const el of [[-90, 90, -90], [-60, 120, -150], [-120, 60, -30]]) {
        for (let t1 = 0; t1 < 360; t1 += 45) { const r = ik(H, [t1, el[0], el[1], el[2], -90, 0].map(d => d * DEG)); if (!best || r.e < best.e) best = r; }
        if (best.e <= 0.002) break;
      }
      if (best.e > 0.005) return null;
      // straight tool moves, sampled every 2 cm
      let seed = best.v.map(wrap), worst = 0;
      const line = (a, b) => { const n = Math.max(1, Math.ceil(a.distanceTo(b) / STEP)), wp = [];
        for (let k = 0; k <= n; k++) { const r = ik(a.clone().lerp(b, k / n), seed); seed = r.v; worst = Math.max(worst, r.e); wp.push(r.v.slice()); }
        return { wp, T: Math.max(0.15, a.distanceTo(b) / SPEED) }; };
      // the cycle: [kind, data] — move (joint waypoints), dwell (hold the last pose), hold (the process, takes the rest)
      const seg = [['move', line(H, P)], ['dwell', DWELL, 'grip'], ['move', line(P, H)], ['move', line(H, Q)], ['hold'], ['move', line(Q, H)], ['move', line(H, P)], ['dwell', DWELL, 'release'], ['move', line(P, H)]];
      return worst > 0.005 ? null : seg;
    };
    const base = J[0].getWorldPosition(new THREE.Vector3());
    // a high stop near the edge of the arm's reach: lift the part less (never under 5 cm off the belt)
    let seg = null;
    for (const [hv, rs] of [[o.hover ?? 0.12, o.rise ?? 0.2], [0.08, 0.12], [0.05, 0.06]]) if ((seg = plan(hv, rs))) break;
    setQ(rest);
    if (!seg) return { why: 'reach' };
    const homeQ = seg[0][1].wp[0];
    const fixed = seg.reduce((s, x) => s + (x[0] === 'move' ? x[1].T : x[0] === 'dwell' ? x[1] : 0), 0);
    const times = ct => { const k = ct >= fixed ? 1 : ct / fixed, hold = Math.max(0, ct - fixed); return seg.map(x => (x[0] === 'move' ? x[1].T * k : x[0] === 'dwell' ? x[1] * k : hold)); };
    const eventAt = (ct, name) => { const T = times(ct); let t = 0; for (let i = 0; i < seg.length; i++) { if (seg[i][2] === name) return t + T[i] * 0.5; t += T[i]; } return 0; };
    const ease = u => u * u * (3 - 2 * u);
    let last = homeQ, carry = false;
    const jaws = c => { for (const [i, j] of tool.userData.jaws.entries()) j.position.y = (i ? 1 : -1) * (o.width / 2 + (c ? 0.006 : 0.03)); };
    return {
      fixed, homeQ,
      grip: ct => eventAt(ct, 'grip'), release: ct => eventAt(ct, 'release'),
      home() { setQ(homeQ); last = homeQ; carry = false; jaws(false); },
      pose(tau, ct) {
        const T = times(ct), g = eventAt(ct, 'grip'), r = eventAt(ct, 'release');
        let t = 0, q = homeQ;
        for (let i = 0; i < seg.length; i++) {
          const d = T[i];
          if (tau <= t + d || i === seg.length - 1) {
            const u = d > 0 ? Math.max(0, Math.min(1, (tau - t) / d)) : 1;
            if (seg[i][0] === 'move') { const wp = seg[i][1].wp, f = ease(u) * (wp.length - 1), k = Math.min(wp.length - 2, Math.floor(f)), a = wp[k], b = wp[k + 1], w = f - k; q = a.map((v, j) => v + (b[j] - v) * w); }
            else { q = last; for (let j = i - 1; j >= 0; j--) if (seg[j][0] === 'move') { const wp = seg[j][1].wp; q = wp[wp.length - 1]; break; } }
            break;
          }
          t += d;
        }
        setQ(q); last = q; carry = tau >= g && tau < r; jaws(carry || (tau >= g - DWELL / 2 && tau < r + DWELL / 2));
        return { carry };
      },
      tip(out = new THREE.Vector3()) { return out.copy(TIP).applyMatrix4(J[5].matrixWorld); },
    };
  }
  window.SimRobot = { rig };
})();
