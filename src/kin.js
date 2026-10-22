/* FAIRINO FR5 kinematics (UR-type DH) + damped-least-squares IK. Row-major 4x4 arrays. */
const KIN = (() => {
  const DH = {
    d: [0.152, 0, 0, 0.102, 0.102, 0.100],
    a: [0, -0.425, -0.395, 0, 0, 0],
    al: [Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0]
  };
  const D2R = Math.PI / 180;
  // FAIRINO FR5 joint ranges (deg): J1 ±175, J2 -265~85, J3 ±160, J4 -265~85, J5 ±175, J6 ±175
  const LMIN = [-175, -265, -160, -265, -175, -175].map(v => v * D2R);
  const LMAX = [175, 85, 160, 85, 175, 175].map(v => v * D2R);
  const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  function mul(A, B) {
    const C = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      C[r*4+c] = A[r*4]*B[c] + A[r*4+1]*B[4+c] + A[r*4+2]*B[8+c] + A[r*4+3]*B[12+c];
    return C;
  }
  function dh(th, d, a, al) {
    const ct = Math.cos(th), st = Math.sin(th), ca = Math.cos(al), sa = Math.sin(al);
    return [ct, -st*ca, st*sa, a*ct, st, ct*ca, -ct*sa, a*st, 0, sa, ca, d, 0,0,0,1];
  }
  function fk(q) {
    const fr = [I()]; let T = fr[0];
    for (let i = 0; i < 6; i++) { T = mul(T, dh(q[i], DH.d[i], DH.a[i], DH.al[i])); fr.push(T); }
    return fr;
  }
  function inv(T) {
    const r = [T[0],T[4],T[8], T[1],T[5],T[9], T[2],T[6],T[10]], p = [T[3],T[7],T[11]];
    return [r[0],r[1],r[2],-(r[0]*p[0]+r[1]*p[1]+r[2]*p[2]),
            r[3],r[4],r[5],-(r[3]*p[0]+r[4]*p[1]+r[5]*p[2]),
            r[6],r[7],r[8],-(r[6]*p[0]+r[7]*p[1]+r[8]*p[2]), 0,0,0,1];
  }
  const trans = (x, y, z) => [1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1];
  const rotX = a => { const c=Math.cos(a), s=Math.sin(a); return [1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]; };
  const rotY = a => { const c=Math.cos(a), s=Math.sin(a); return [c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]; };
  const rotZ = a => { const c=Math.cos(a), s=Math.sin(a); return [c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]; };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const nrm = a => { const n = norm(a) || 1; return [a[0]/n, a[1]/n, a[2]/n]; };
  /* pose from position, tool z direction and reference for x */
  function pose(p, z, xref) {
    z = nrm(z);
    let x = [xref[0]-dot(xref,z)*z[0], xref[1]-dot(xref,z)*z[1], xref[2]-dot(xref,z)*z[2]];
    if (norm(x) < 1e-4) { const r = Math.abs(z[0]) < 0.9 ? [1,0,0] : [0,0,1]; x = [r[0]-dot(r,z)*z[0], r[1]-dot(r,z)*z[1], r[2]-dot(r,z)*z[2]]; }
    x = nrm(x); const y = cross(z, x);
    return [x[0],y[0],z[0],p[0], x[1],y[1],z[1],p[1], x[2],y[2],z[2],p[2], 0,0,0,1];
  }
  const xf = (T, p) => [T[0]*p[0]+T[1]*p[1]+T[2]*p[2]+T[3], T[4]*p[0]+T[5]*p[1]+T[6]*p[2]+T[7], T[8]*p[0]+T[9]*p[1]+T[10]*p[2]+T[11]];
  const xv = (T, v) => [T[0]*v[0]+T[1]*v[1]+T[2]*v[2], T[4]*v[0]+T[5]*v[1]+T[6]*v[2], T[8]*v[0]+T[9]*v[1]+T[10]*v[2]];

  function solveN(A, b) {
    const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c+1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c] || 1e-12;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((row, i) => row[n] / (M[i][i] || 1e-12));
  }
  /* Td: desired TCP pose in robot base frame; tool: TCP offset in flange frame (rotation identity).
     freeSpin: orientation about the tool z axis is left free (axisymmetric nozzle) -> 5-DOF task. */
  function ikTool(Td, tool, q0, iters = 150, freeSpin = false) {
    const q = q0.slice(); const w = 0.45; let ep = 1, eo = 1;
    const pt = [tool[3], tool[7], tool[11]], pd = [Td[3], Td[7], Td[11]], zd = [Td[2], Td[6], Td[10]];
    for (let it = 0; it < iters; it++) {
      const fr = fk(q), F = fr[6], p = xf(F, pt);
      const xc = [F[0],F[4],F[8]], yc = [F[1],F[5],F[9]], zc = [F[2],F[6],F[10]];
      const e_p = [pd[0]-p[0], pd[1]-p[1], pd[2]-p[2]];
      let e_o;
      if (freeSpin) {
        e_o = cross(zc, zd);
        if (dot(zc, zd) < 0) { const s = norm(e_o) < 1e-6 ? xc : nrm(e_o); e_o = [s[0]*1.5, s[1]*1.5, s[2]*1.5]; }
      } else {
        e_o = [0,0,0];
        for (let c = 0; c < 3; c++) { const cx = cross([F[c],F[4+c],F[8+c]], [Td[c],Td[4+c],Td[8+c]]); e_o[0] += 0.5*cx[0]; e_o[1] += 0.5*cx[1]; e_o[2] += 0.5*cx[2]; }
        if (dot(zc, zd) < -0.5) e_o = e_o.map((v, i) => v + 0.6 * xc[i]);
      }
      ep = norm(e_p); eo = freeSpin ? Math.acos(Math.max(-1, Math.min(1, dot(zc, zd)))) : norm(e_o);
      if (ep < 2e-5 && eo < 2e-4) break;
      const rows = []; // each row: 6 entries over joints
      const Jv = [], Jw = [];
      for (let i = 0; i < 6; i++) {
        const Fi = fr[i], z = [Fi[2],Fi[6],Fi[10]], o = [Fi[3],Fi[7],Fi[11]];
        Jv.push(cross(z, [p[0]-o[0], p[1]-o[1], p[2]-o[2]])); Jw.push(z);
      }
      for (let k = 0; k < 3; k++) rows.push(Jv.map(v => v[k]));
      let e = e_p.slice();
      if (freeSpin) {
        for (const ax of [xc, yc]) { rows.push(Jw.map(z => w * dot(z, ax))); e.push(w * dot(e_o, ax)); }
      } else {
        for (let k = 0; k < 3; k++) rows.push(Jw.map(z => w * z[k]));
        e.push(w*e_o[0], w*e_o[1], w*e_o[2]);
      }
      const m = rows.length, lam2 = 0.0004 + 0.02 * Math.min(1, ep);
      const A = [];
      for (let r = 0; r < m; r++) { A.push([]); for (let c = 0; c < m; c++) {
        let s = 0; for (let k = 0; k < 6; k++) s += rows[r][k] * rows[c][k];
        A[r].push(s + (r === c ? lam2 : 0)); } }
      const y = solveN(A, e);
      let maxd = 0; const dq = [];
      for (let k = 0; k < 6; k++) { let s = 0; for (let r = 0; r < m; r++) s += rows[r][k] * y[r]; dq.push(s); maxd = Math.max(maxd, Math.abs(s)); }
      const sc = maxd > 0.25 ? 0.25 / maxd : 1;
      for (let k = 0; k < 6; k++) q[k] = Math.max(LMIN[k], Math.min(LMAX[k], q[k] + dq[k] * sc));
    }
    return { q, ep, eo, ok: ep < 1.5e-3 && eo < 2e-2 };
  }
  const ikFlange = (Td, q0, iters) => ikTool(Td, I(), q0, iters, false);
  return { DH, LMIN, LMAX, D2R, I, mul, dh, fk, inv, trans, rotX, rotY, rotZ, pose, xf, xv, cross, dot, norm, nrm, ikFlange, ikTool };
})();
if (typeof module !== 'undefined') module.exports = KIN;
