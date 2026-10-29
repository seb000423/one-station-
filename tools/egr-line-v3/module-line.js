// The EGR cooler automatic welding module line rebuilt from generic equipment (the CAD cells are in assets/models/egr-weld-module/):
// the same five cells, stations and order as the CAD, as one baked model with the product flowing through it.
// Line frame: x along the flow, z across; one continuous roller spine at z 1.3 (top 0.85 m) carries the part from cell A's merge
// point (x 2.1) to the leak test exit (x 27.2); the only gap is D → E, where an operator carries the cooler (as on the real line).
// Every station is a stop on the spine with a lift-and-locate plate; heads (profiler, dispensing needle, cameras, press rams, tank
// feeders, paste needle, marking head, nutrunner) come down to the located part. Robots only pick and place: A merges the two infeed
// lanes onto the spine, B loads the scan laser cabin's fixture, E loads the leak tester's fixture. The tack welding cell is a pallet
// loop (11 jigs on a chain track) that the spine runs through. Operators (−Z aisle): loading, manual MIG, manual check, D→E carry,
// packing. Every machine has a nameplate; machine footprints are checked for overlap when the model is built.
// Cycle: MODULE_T 400 s, a part every MODULE_P 50 s (8 in flight); part 6 fails the dispensing check, part 3 the leak test.
import * as THREE from 'three';
import { G, box, cyl, prof, foot, plane, bin, xf, std, materials, finalize, cycleClip, opWorker, ikRig, labelTexture } from './models.js';

const TOP = 0.85, Z0 = 1.3, YC = 0.045, LIFT = 0.08, FIXY = 0.862;   // FIXY: top of the side cabins' fixtures
const LANES = [Z0 - 0.65, Z0 + 0.65];   // cell A's two infeed lanes
export const MODULE_T = 400, MODULE_P = 50;
const NJIG = 11, JPOS = 7, DJ = MODULE_T / 33;   // jig loop: 11 jigs, 7 work positions on the spine, one index every 12.12 s (33 per cycle = 3 laps)
// stations along the spine (x); the spine runs at z = Z0
const S = { lane: 1.1, merge: 2.1, prof: 2.7, disp: 3.5, cam: 4.1, scale: 4.7, ngA: 5.2, aEnd: 5.5,
  turn: 6.0, tank: 6.8, press: [7.6, 8.3], vis: 8.9, bstop: 9.6, bcab: [10.4, Z0 - 0.78], bback: 10.1, bng: 10.7, bEnd: 11.25,
  cin: 11.45, jig0: 11.75, cEnd: 16.4, cout: 15.85,
  cf: 17.05, paste: 18.15, check: 19.3, dstop: 20.45, dEnd: 20.7,
  ein: 21.45, eturn: 22.05, evis: 22.65, estop: 23.3, ecab: [24.1, Z0 - 0.78], eback: 23.8, mark: 25.05, nut: 25.85, okng: 26.55, lift: 27.2, eEnd: 27.5 };
const JP = 0.6, JX = q => (q < JPOS ? S.jig0 + JP * q : S.jig0 + JP * (JPOS - 1) - (JP * (JPOS - 1) / (NJIG - JPOS + 1)) * (q - JPOS + 1)), JZ = q => (q < JPOS ? Z0 : Z0 + 0.7);   // jig pitch 0.6 m; the return lane spreads its 4 jigs over the same span
const RBASE = { A: [1.55, Z0], B: [9.85, Z0 - 0.6], E: [23.55, Z0 - 0.6] }, RH = 0.9;   // B / E pedestals 0.14 m clear of the spine frame
const HOME = { A: li => [RBASE.A[0], RH + 0.35, Z0 + (li ? 0.15 : -0.15)], B: [RBASE.B[0] - 0.4, RH + 0.45, RBASE.B[1] - 0.25], E: [RBASE.E[0] - 0.4, RH + 0.45, RBASE.E[1] - 0.25] };   // B / E rest beside the base, on the spine side

export function egrModuleLine() {
  const m = materials(), root = G('EGR_Module_Line');
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45), tankM = std('end_tank', 0xc9ccd0, 0.95, 0.3);
  const bead = std('weld_bead', 0x6f675d, 0.85, 0.5), arcM = std('weld_arc', 0xd8f0ff, 0.0, 0.3, { emissive: 0xa8dcff, emissiveIntensity: 4.0 });
  const curtain = std('weld_curtain', 0xc8461e, 0.0, 0.55, { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const laserM = std('laser_beam', 0xff3030, 0.0, 0.3, { emissive: 0xff2020, emissiveIntensity: 3.5 });
  const magenta = std('paste_tank', 0xc24a9c, 0.3, 0.5), glass = std('polycarbonate', 0xd3e4ee, 0.0, 0.06, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const blue = std('machine_blue', 0x2f5f9e, 0.3, 0.5), chainM = std('chain', 0x3a3d42, 0.7, 0.45);
  const robots = {}, FOOT = [];   // machine footprints [name, x0, x1, z0, z1] checked for overlap at the end
  const fp = (name, x0, x1, z0, z1) => FOOT.push([name, x0, x1, z0, z1]);
  const plates = {};   // nameplate materials by text
  const plateMat = text => plates[text] || (plates[text] = std('plate_' + text, 0xffffff, 0.1, 0.5, { map: labelTexture(text, '#1f2a36', '#ffffff') }));

  // ---------------------------------------------------------------- generic pieces
  const nameplate = (text, x, y, z, ry = 0, w = 0.5) => { box(root, m.black, w + 0.02, w / 2 + 0.02, 0.012, x, y, z, [0, ry, 0]); plane(root, plateMat(text), w, w / 2, x + Math.sin(ry) * 0.008, y, z + Math.cos(ry) * 0.008, [0, ry, 0]); };
  const rollers = (x0, x1, z = Z0, w = 0.5) => { // roller section on legs, flow along +X, top at TOP
    fp('컨베이어 ' + x0.toFixed(1), x0, x1, z - w / 2 - 0.05, z + w / 2 + 0.05); const L = x1 - x0, c = (x0 + x1) / 2; for (const sz of [-1, 1]) { box(root, m.alu, L, 0.1, 0.035, c, TOP - 0.06, z + sz * (w / 2 + 0.03)); box(root, m.aluDark, L, 0.008, 0.045, c, TOP + 0.014, z + sz * (w / 2 + 0.03)); }
    for (let k = 0, n = Math.round(L / 0.1); k < n; k++) cyl(root, m.steel, 0.022, w, x0 + (k + 0.5) * L / n, TOP - 0.025, z, 'z', 10);
    for (let k = 0, n = Math.max(1, Math.ceil(L / 1.4)); k <= n; k++) { const x = x0 + 0.1 + (L - 0.2) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (w / 2 + 0.03)], [x, TOP - 0.11, z + sz * (w / 2 + 0.03)], 0.04); foot(root, x, z + sz * (w / 2 + 0.03)); } prof(root, [x, 0.3, z - w / 2 - 0.03], [x, 0.3, z + w / 2 + 0.03], 0.04); } };
  const stopLift = (name, x, z = Z0) => { // pneumatic stop blade past the station and a lift-and-locate plate (node) between the rollers
    box(root, m.yellow, 0.025, 0.05, 0.3, x + 0.16, TOP + 0.03, z); box(root, m.black, 0.06, 0.08, 0.06, x + 0.16, TOP - 0.1, z);
    const lf = G(name, root, x, TOP - 0.04, z); box(lf, m.aluDark, 0.22, 0.012, 0.14, 0, 0.006, 0); for (const sx of [-1, 1]) box(lf, clampM, 0.012, 0.03, 0.12, sx * 0.1, 0.027, 0); box(lf, m.black, 0.12, 0.06, 0.12, 0, -0.04, 0); return lf; };
  const gate = (x, z, w, h, mat) => { for (const sz of [-1, 1]) prof(root, [x, 0.06, z + sz * w / 2], [x, h, z + sz * w / 2], 0.045, mat || m.frameDark); box(root, mat || m.frameDark, 0.07, 0.07, w + 0.07, x, h, z); };
  const slide = (name, x, z, top, travel = 0.3) => { box(root, m.aluDark, 0.08, travel + 0.3, 0.1, x, top - (travel + 0.3) / 2, z); const h = G(name, root, x, top - 0.1, z); box(h, m.alu, 0.1, 0.08, 0.12, 0, 0, 0.0); return h; };   // vertical slide unit hanging from a beam; node moves in −y
  const camera = (x, y, z, name, fy = TOP + LIFT + 0.02) => { box(root, m.black, 0.08, 0.12, 0.08, x, y + 0.06, z); cyl(root, m.light, 0.06, 0.01, x, y - 0.005, z, 'y', 20); const f = G(name, root); cyl(f, m.light, 0.11, 0.004, x, fy, z, 'y', 20); return f; };
  const monitor = (name, x, z, ry, y = 1.55) => { prof(root, [x, 0.06, z], [x, y - 0.1, z], 0.04); box(root, m.aluDark, 0.3, 0.012, 0.3, x, 0.006, z); const w = G(name, root, x, y, z); w.rotation.y = ry; box(w, m.black, 0.42, 0.28, 0.04, 0, 0, 0); box(w, m.screen, 0.37, 0.23, 0.004, 0, 0, 0.022); return w; };
  const tower = (x, z, y0 = 2.0) => { cyl(root, m.black, 0.012, 0.25, x, y0, z, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.lampA], [2, m.lampR]]) cyl(root, mt, 0.03, 0.06, x, y0 + 0.16 + k * 0.065, z, 'y', 14); };
  const cabinetBox = (text, x, z, w = 0.8, d = 0.45, h = 1.9, ry = 0) => { const c = G('Cabinet_' + text, root, x, 0, z); c.rotation.y = ry; box(c, m.sheet, w, h, d, 0, h / 2, 0); box(c, m.black, w - 0.1, 0.02, d + 0.01, 0, h - 0.06, 0); box(c, m.screen, 0.3, 0.2, 0.004, 0, h - 0.5, -d / 2 - 0.002); for (const sx of [-1, 1]) box(c, m.black, 0.02, 0.1, 0.02, sx * 0.12, 1.0, -d / 2 - 0.012); box(c, m.black, w + 0.02, 0.03, d + 0.02, 0, 0.015, 0);
    plane(c, plateMat(text), 0.44, 0.22, 0, h - 0.25, -d / 2 - 0.003, [0, Math.PI, 0]); fp('제어반 ' + text, x - w / 2, x + w / 2, z - d / 2, z + d / 2); };
  const fenceRun = (x0, z0, x1, z1, door) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; box(root, m.black, 0.05, 2.0, 0.05, x, 1.0, z); box(root, m.black, 0.12, 0.008, 0.12, x, 0.004, z); }
    for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n, cx = x0 + (x1 - x0) * (u0 + u1) / 2, cz = z0 + (z1 - z0) * (u0 + u1) / 2, seg = L / n;
      if (door && Math.abs(cx - door[0]) < seg / 2 && Math.abs(cz - door[1]) < seg / 2) { plane(root, m.yellow, seg - 0.1, 0.06, cx, 2.0, cz, [0, a, 0]); continue; }   // an opening for the operator
      plane(root, m.mesh, seg - 0.06, 1.8, cx, 1.05, cz, [0, a, 0], 0.05); box(root, m.black, seg - 0.06, 0.02, 0.02, cx, 0.16, cz, [0, a, 0]); box(root, m.black, seg - 0.06, 0.02, 0.02, cx, 1.96, cz, [0, a, 0]); } };
  const totes = (x, z, n) => { for (let k = 0; k < n; k++) { const y = k * 0.3; box(root, m.yellow, 0.6, 0.28, 0.4, x, y + 0.14, z); box(root, m.black, 0.56, 0.02, 0.36, x, y + 0.29, z); } };
  const pusher = (name, x, z, y, dir = 'x', len = 0.35) => { const p = G(name, root); if (dir === 'x') { box(p, m.aluDark, 0.02, 0.1, 0.3, x, y, z); cyl(p, m.steel, 0.01, len, x - len / 2, y, z, 'x', 8); cyl(root, m.alu, 0.03, 0.3, x - len - 0.15, y, z, 'x', 16); box(root, m.aluDark, 0.08, 0.3, 0.1, x - len - 0.15, y - 0.2, z); } else { box(p, m.aluDark, 0.3, 0.1, 0.02, x, y, z); cyl(p, m.steel, 0.01, len, x, y, z - len / 2, 'z', 8); cyl(root, m.alu, 0.03, 0.3, x, y, z - len - 0.15, 'z', 16); box(root, m.aluDark, 0.1, 0.3, 0.08, x, y - 0.2, z - len - 0.15); } return p; };
  const balancer = (name, x, z, y, ry) => { // tool balancer: floor post, horizontal arm, spring reel, cable down to the tool node
    prof(root, [x, 0.06, z], [x, 2.2, z], 0.06, m.frameDark); box(root, m.aluDark, 0.36, 0.012, 0.36, x, 0.006, z); const ax = x + Math.cos(ry) * 0.5, az = z - Math.sin(ry) * 0.5;
    box(root, m.aluDark, 1.0, 0.06, 0.06, (x + ax) / 2, 2.2, (z + az) / 2, [0, ry, 0]); cyl(root, m.black, 0.07, 0.1, ax, 2.1, az, 'y', 16); cyl(root, m.black, 0.006, 2.1 - y - 0.2, ax, (2.05 + y + 0.2) / 2, az, 'y', 6); return G(name, root, ax, y, az); };
  const robot = (key, x, z, ry = 0) => { // FR5-class robot on a pedestal; joints renamed <key>_Robot_Joint_i, tool frame at the flange (+Z out)
    const name = key + '_Robot', fr = globalThis.FR5 ? globalThis.FR5.clone(true) : null;
    box(root, m.black, 0.36, RH - 0.02, 0.36, x, (RH - 0.02) / 2 + 0.02, z); box(root, m.yellow, 0.37, 0.04, 0.37, x, RH - 0.04, z); box(root, m.aluDark, 0.5, 0.02, 0.5, x, 0.01, z);
    plane(root, plateMat('핸들링 로봇'), 0.3, 0.15, x, 0.55, z - 0.181, [0, Math.PI, 0]);
    if (!fr) return null;
    fr.name = name; fr.position.set(x, RH, z); fr.rotation.y = ry; root.add(fr);
    const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = name + '_' + j.name; });
    const tool = G(name + '_Tool', J[5], 0, 0, 0.101); robots[key] = { J, tool, fr }; return robots[key];
  };
  const gripper = (tool, name, ry = 0) => { const bx = new THREE.BoxGeometry(0.08, 0.1, 0.06); bx.translate(0, 0, 0.03); bin(tool, m.aluDark, bx); const br = new THREE.BoxGeometry(0.06, 0.13, 0.02); br.translate(0, 0, 0.07); bin(tool, m.yellow, br);
    for (const s of [-1, 1]) { const jw = new THREE.BoxGeometry(0.03, 0.012, 0.09); jw.translate(0, s * 0.052, 0.12); bin(tool, m.black, jw); }
    const gp = G(name, tool, 0, 0, 0.165); gp.rotation.x = -Math.PI / 2; const in_ = G(name + '_In', gp); in_.rotation.y = ry; return in_; };
  const torch = tool => { cyl(tool, m.black, 0.02, 0.16, 0, 0, 0.08, 'z', 10); cyl(tool, m.orange, 0.012, 0.05, 0, 0, 0.18, 'z', 10); cyl(tool, m.steel, 0.002, 0.03, 0, 0, 0.22, 'z', 6); };
  const cabin = (text, x0, x1, z0, z1, h = 2.0, openSide = null) => { // glazed machine cabin: pillars, glass panels, top band, nameplate on the −Z face
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) prof(root, [x, 0.06, z], [x, h, z], 0.06, m.frameDark);
    box(root, blue, w + 0.06, 0.12, d + 0.06, cx, h - 0.06, cz); box(root, m.sheet, w + 0.06, 0.4, d + 0.06, cx, 0.2, cz);
    for (const [side, px, pz, r, L] of [['S', cx, z0, 0, w], ['N', cx, z1, 0, w], ['W', x0, cz, Math.PI / 2, d], ['E', x1, cz, Math.PI / 2, d]]) if (side !== openSide) plane(root, glass, L - 0.08, h - 0.55, px, (h + 0.4) / 2 - 0.05, pz, [0, r, 0]);
    nameplate(text, cx, h + 0.1, cz, 0, 0.44); fp(text, x0, x1, z0, z1); };
  // part looks (origin at the bottom centre, body centre at YC; long axis X): brazed core → paste → end tanks → laser seams → flanges → pipes → mark
  const lookCore = n => { box(n, brazed, 0.18, 0.07, 0.09, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, brazed, 0.004, 0.074, 0.094, x, YC, 0); };
  const lookPaste = n => { for (const sx of [-1, 1]) for (const dz of [-0.03, 0, 0.03]) box(n, m.paste, 0.004, 0.072, 0.012, sx * 0.093, YC, dz); };
  const lookTanks = n => { for (const sx of [-1, 1]) box(n, tankM, 0.05, 0.08, 0.1, sx * 0.115, YC, 0); };
  const lookSeam = n => { for (const sx of [-1, 1]) box(n, bead, 0.006, 0.084, 0.104, sx * 0.09, YC, 0); };
  const lookFlange = (n, sx) => { box(n, m.stainless, 0.012, 0.1, 0.15, sx * 0.146, YC, 0); box(n, bead, 0.008, 0.07, 0.08, sx * 0.136, YC, 0); };
  const lookPipes = n => { for (const sx of [-1, 1]) cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 8); box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055); };
  const lookMark = n => plane(n, m.display, 0.03, 0.02, 0.04, YC + 0.0355, 0.02, [-Math.PI / 2, 0, 0]);
  const tank = (n, x = 0, y = 0, z = 0) => box(n, tankM, 0.05, 0.08, 0.1, x, y, z);

  // ================================================================ the spine: one roller line, cell by cell (gap only at D → E)
  rollers(S.merge - 0.3, S.aEnd); rollers(S.aEnd, S.bEnd); rollers(S.bEnd, S.cin + 0.2); rollers(S.cout - 0.2, S.cEnd); rollers(S.cEnd, S.dEnd); rollers(S.ein - 0.3, S.lift - 0.3);
  // ================================================================ A. core-assy loading & paste apply (x −1 … 5.5)
  fp('A 베이스', -0.4, S.aEnd, Z0 - 1.6, Z0 + 1.6);
  for (const [li, z] of LANES.entries()) {
    const sz = li ? 1 : -1;
    totes(-0.75, z, 4); rollers(0.0, S.lane + 0.25, z); stopLift('A_LaneLift_' + li, S.lane - 0.05, z);
    gate(0.55, z, 0.72, 1.6); for (const s2 of [-1, 1]) { const p = G('A_Center_' + li + (s2 < 0 ? '_L' : '_R'), root); box(p, m.yellow, 0.14, 0.05, 0.03, 0.55, TOP + 0.04, z + s2 * 0.2); cyl(root, m.alu, 0.012, 0.1, 0.55, TOP + 0.04, z + s2 * 0.27, 'z', 8); }   // centring pushers
    box(root, m.black, 0.06, 0.1, 0.06, 0.55, 1.52, z); plane(root, m.red, 0.03, 0.03, 0.55, 1.469, z, [Math.PI / 2, 0, 0]);   // direction sensor head under the gate beam, looking down
    camera(0.85, 1.5, z, 'A_FinCam_' + li, TOP + 0.02); box(root, m.black, 0.06, 0.06, 0.1, 0.95, TOP + 0.15, z + sz * 0.3); box(root, m.red, 0.004, 0.02, 0.06, 0.92, TOP + 0.15, z + sz * 0.3);   // fin vision camera, barcode reader
    nameplate(li ? '투입 레인 2' : '투입 레인 1', 0.3, 1.62, z + sz * 0.36, sz > 0 ? 0 : Math.PI, 0.4);
  }
  { const R = robot('A', ...RBASE.A); if (R) { const g = gripper(R.tool, 'A_Grip_Part'); lookCore(G('A_Grip_Core', g)); } fp('핸들링 로봇 A', RBASE.A[0] - 0.25, RBASE.A[0] + 0.25, Z0 - 0.25, Z0 + 0.25); }
  // profiler gate: laser line head on a slide over the lift
  stopLift('A_ProfLift', S.prof); gate(S.prof, Z0, 0.8, 1.75); { const h = slide('A_ProfHead', S.prof, Z0, 1.75); box(h, m.black, 0.12, 0.08, 0.1, 0, -0.06, 0); const pl = G('A_Profile', h); plane(pl, laserM, 0.16, 0.7, 0, -0.45, 0, [0, Math.PI / 2, 0]); } nameplate('프로파일 검사', S.prof, 1.89, Z0 - 0.05, 0, 0.4); fp('프로파일 검사', S.prof - 0.15, S.prof + 0.15, Z0 - 0.45, Z0 + 0.45);
  // dispensing station: portal with an XZ-moving needle head, paste pump on a stand behind, HMI beside
  stopLift('A_DispLift', S.disp); gate(S.disp, Z0, 0.9, 1.85); { const dx = G('A_Disp_X', root, S.disp, 0, Z0), dz = G('A_Disp_Z', dx), dy = G('A_Disp_Y', dz); box(dx, m.aluDark, 0.14, 0.1, 0.9, 0, 1.85, 0); box(dz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.79, 0); box(dy, m.alu, 0.05, 0.5, 0.05, 0, 1.5, 0); box(dy, m.yellow, 0.1, 0.16, 0.1, 0, 1.32, 0); cyl(dy, m.black, 0.03, 0.1, 0, 1.19, 0, 'y', 12); cyl(dy, m.steel, 0.004, 0.06, 0, 1.11, 0, 'y', 6);
    box(root, m.sheet, 0.5, 0.8, 0.5, S.disp, 0.4, Z0 + 1.05); cyl(root, m.stainless, 0.17, 0.5, S.disp, 1.05, Z0 + 1.05, 'y', 24); box(root, m.black, 0.12, 0.08, 0.12, S.disp, 1.34, Z0 + 1.05); cyl(root, m.black, 0.012, 0.7, S.disp, 1.7, Z0 + 0.72, 'z', 8); nameplate('페이스트 공급', S.disp, 0.55, Z0 + 0.79, 0, 0.4); fp('페이스트 공급', S.disp - 0.25, S.disp + 0.25, Z0 + 0.8, Z0 + 1.3); }
  nameplate('페이스트 도포', S.disp, 1.99, Z0 - 0.05, 0, 0.4); fp('페이스트 도포', S.disp - 0.15, S.disp + 0.15, Z0 - 0.5, Z0 + 0.5);
  stopLift('A_CamLift', S.cam); gate(S.cam, Z0, 0.8, 1.7); camera(S.cam, 1.5, Z0, 'A_NozCam'); nameplate('노즐 비전', S.cam, 1.84, Z0 - 0.05, 0, 0.36); fp('노즐 비전', S.cam - 0.15, S.cam + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopLift('A_ScaleLift', S.scale); box(root, m.black, 0.36, 0.1, 0.5, S.scale, TOP - 0.2, Z0); box(root, m.display, 0.14, 0.04, 0.004, S.scale, TOP - 0.18, Z0 - 0.252); nameplate('도포 중량 검사', S.scale, TOP - 0.3, Z0 - 0.26, 0, 0.32); }   // scale under the lift plate
  { pusher('A_NG_Pusher', S.ngA, Z0 - 0.3, TOP + 0.06, 'z', 0.4); rollers(S.ngA - 0.2, S.ngA + 1.0, Z0 + 0.85, 0.4); box(root, m.yellow, 0.025, 0.05, 0.3, S.ngA + 0.78, TOP + 0.03, Z0 + 0.85); nameplate('NG 배출', S.ngA + 0.4, TOP + 0.25, Z0 + 1.1, 0, 0.36); }
  cabinetBox('A 제어반', 0.6, Z0 - 1.95); cabinetBox('도포 제어', 1.6, Z0 - 1.95); monitor('A_HMI', 3.0, Z0 - 1.4, 0.4); tower(S.aEnd - 0.2, Z0 - 1.5);
  opWorker(root, 'Op_Load', -0.3, Z0 - 1.3, 0);

  // ================================================================ B. end tank assembly & scan laser welding (x 5.5 … 11.25)
  fp('B 베이스', S.aEnd, S.bEnd, Z0 - 1.6, Z0 + 1.6);
  { stopLift('B_Turn', S.turn); cyl(root, m.frameDark, 0.16, 0.4, S.turn, 0.2, Z0, 'y', 16); nameplate('턴 유닛', S.turn, 0.42, Z0 - 0.17, 0, 0.3); }   // lift-turn unit (the lift plate node also turns)
  for (const sz of [-1, 1]) { // tank feeders: magazine tower with a stack of tanks and a servo pick-and-place that lowers a tank onto the core end
    const fz = Z0 + sz * 1.05, fx = S.tank; box(root, m.sheet, 0.5, 0.86, 0.5, fx, 0.43, fz); for (let k = 0; k < 8; k++) tank(root, fx, 0.95 + k * 0.1, fz); for (const s2 of [-1, 1]) prof(root, [fx + s2 * 0.12, 0.86, fz], [fx + s2 * 0.12, 1.9, fz], 0.03);
    box(root, blue, 0.14, 0.14, 1.2, fx, 1.95, Z0 + sz * 0.6); prof(root, [fx, 0.06, Z0 + sz * 1.3], [fx, 1.95, Z0 + sz * 1.3], 0.06, m.frameDark);
    const arm = G('B_TankArm' + (sz < 0 ? '_L' : '_R'), root, fx, 1.88, fz - sz * 0.3); box(arm, m.aluDark, 0.1, 0.1, 0.16, 0, 0, 0); box(arm, m.alu, 0.04, 0.55, 0.04, 0, -0.3, 0); const t = G('B_TankArm' + (sz < 0 ? '_L' : '_R') + '_Tank', arm, 0, -0.6, 0); box(t, tankM, 0.1, 0.08, 0.05, 0, 0, 0);
    nameplate(sz < 0 ? '탱크 공급기 1' : '탱크 공급기 2', fx, 0.7, fz - sz * 0.26, sz < 0 ? 0 : Math.PI, 0.4); fp('탱크 공급기 ' + (sz < 0 ? 1 : 2), fx - 0.26, fx + 0.26, fz - 0.26, fz + 0.26); }
  stopLift('B_TankLift', S.tank); gate(S.tank, Z0, 0.9, 1.95);
  for (const [k, px] of S.press.entries()) { // tank presses: C-frame beside the spine, horizontal ram, hydraulic unit behind
    stopLift('B_PressLift_' + k, px); const sz = k ? 1 : -1, pz = Z0 + sz * 0.75; box(root, blue, 0.4, 1.3, 0.3, px, 0.65, pz + sz * 0.15); box(root, blue, 0.4, 0.22, 0.75, px, 1.17, pz - sz * 0.15); box(root, m.sheet, 0.42, 0.3, 0.3, px, 1.45, pz + sz * 0.15);
    const ram = G('B_Press_' + k, root, px, TOP + LIFT + YC, pz - sz * 0.42); cyl(ram, m.steel, 0.03, 0.3, 0, 0, 0, 'z', 12); box(ram, m.aluDark, 0.12, 0.12, 0.06, 0, 0, -sz * 0.17);
    nameplate('탱크 프레스 ' + (k + 1), px, 1.35, pz - sz * 0.53 + (sz < 0 ? 0.02 : -0.02), sz < 0 ? 0 : Math.PI, 0.4); fp('탱크 프레스 ' + (k + 1), px - 0.22, px + 0.22, Math.min(pz, pz + sz * 0.3), Math.max(pz, pz + sz * 0.3)); }   // the floor column; the arm and ram reach over the spine
  stopLift('B_VisLift', S.vis); gate(S.vis, Z0, 0.8, 1.7); camera(S.vis, 1.5, Z0, 'B_PressCam'); nameplate('프레스 비전', S.vis, 1.84, Z0 - 0.05, 0, 0.36); fp('프레스 비전', S.vis - 0.15, S.vis + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopLift('B_RobotLift', S.bstop); const R = robot('B', ...RBASE.B); if (R) { const g = gripper(R.tool, 'B_Grip_Part', Math.PI / 2); lookCore(G('B_Grip_Core', g)); lookPaste(G('B_Grip_Paste', g)); lookTanks(G('B_Grip_Tanks', g)); lookSeam(G('B_Grip_Seam', g)); } fp('핸들링 로봇 B', RBASE.B[0] - 0.25, RBASE.B[0] + 0.25, RBASE.B[1] - 0.25, RBASE.B[1] + 0.25);
    const [cx, cz] = S.bcab; cabin('스캔 레이저 용접', cx - 0.3, cx + 0.3, cz - 0.45, cz + 0.35, 2.1, 'N');   // laser cabin, open towards the robot
    box(root, m.aluDark, 0.3, 0.03, 0.3, cx, 0.835, cz); for (const sx of [-1, 1]) prof(root, [cx + sx * 0.12, 0.4, cz], [cx + sx * 0.12, 0.82, cz], 0.04); box(root, clampM, 0.12, 0.012, 0.24, cx, 0.856, cz);   // fixture (top 0.862)
    const sh = slide('B_LaserHead', cx, cz, 2.0, 0.4); box(sh, m.black, 0.2, 0.22, 0.2, 0, -0.12, 0); cyl(sh, m.steel, 0.04, 0.06, 0, -0.26, 0, 'y', 14); const bm = G('B_Laser_Beam', sh); cyl(bm, laserM, 0.004, 0.6, 0, -0.6, 0, 'y', 6);
    box(root, m.sheet, 0.5, 1.2, 0.5, cx + 0.7, 0.6, cz); box(root, m.black, 0.46, 0.06, 0.46, cx + 0.7, 1.23, cz); nameplate('레이저 소스', cx + 0.7, 0.9, cz - 0.253, 0, 0.36); fp('레이저 소스', cx + 0.45, cx + 0.95, cz - 0.25, cz + 0.25);
    stopLift('B_BackLift', S.bback); }
  { pusher('B_NG_Pusher', S.bng, Z0 - 0.3, TOP + 0.06, 'z', 0.4); rollers(S.bng - 0.2, S.bng + 0.6, Z0 + 0.85, 0.4); box(root, m.yellow, 0.025, 0.05, 0.3, S.bng + 0.38, TOP + 0.03, Z0 + 0.85); nameplate('NG 배출', S.bng + 0.2, TOP + 0.25, Z0 + 1.1, 0, 0.36); }
  cabinetBox('B 제어반', 6.4, Z0 - 1.95); cabinetBox('프레스 제어', 7.6, Z0 - 1.95); monitor('B_HMI', 8.8, Z0 - 1.4, 0.4); tower(S.bEnd - 0.2, Z0 - 1.5);

  // ================================================================ C. tack welding (x 11.25 … 16.3): chain-driven jig loop on the spine, flange feeders, four MIG robots, manual MIG
  fp('C 베이스', S.bEnd, S.cEnd, Z0 - 2.2, Z0 + 2.2);
  { const x0 = S.jig0 - 0.3, x1 = JX(JPOS - 1) + 0.3; // track: two rails per lane, chain strips, return lane at Z0 + 0.7, end sprockets
    for (const z of [Z0, Z0 + 0.7]) { for (const sz of [-1, 1]) { box(root, m.aluDark, x1 - x0, 0.1, 0.05, (x0 + x1) / 2, TOP - 0.08, z + sz * 0.19); box(root, chainM, x1 - x0, 0.02, 0.03, (x0 + x1) / 2, TOP - 0.02, z + sz * 0.13); } }
    for (const x of [x0, x1]) { box(root, m.aluDark, 0.3, 0.1, 1.1, x, TOP - 0.08, Z0 + 0.35); cyl(root, chainM, 0.17, 0.3, x, TOP - 0.03, Z0 + 0.35, 'y', 24); }   // end turns
    for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) for (const sz of [-1, 1]) { prof(root, [x, 0.06, Z0 + 0.35 + sz * 0.55], [x, TOP - 0.13, Z0 + 0.35 + sz * 0.55], 0.04); foot(root, x, Z0 + 0.35 + sz * 0.55); prof(root, [x, 0.3, Z0 - 0.2], [x, 0.3, Z0 + 0.9], 0.04); }
    for (let j = 0; j < NJIG; j++) { const jg = G('C_Jig_' + j, root, JX(j), 0, JZ(j)); box(jg, m.alu, 0.34, 0.03, 0.3, 0, TOP + 0.005, 0); for (const sz of [-1, 1]) box(jg, clampM, 0.12, 0.07, 0.02, 0, TOP + 0.055, sz * 0.095); box(jg, m.yellow, 0.02, 0.012, 0.3, -0.16, TOP + 0.025, 0); box(jg, m.black, 0.3, 0.04, 0.26, 0, TOP - 0.02, 0); }
    nameplate('지그 트랜스퍼', (x0 + x1) / 2, TOP - 0.1, Z0 - 0.27, 0, 0.5); fp('지그 트랜스퍼', x0, x1, Z0 - 0.3, Z0 + 1.0); }
  for (const [k, fx, sz] of [[0, JX(1), -1], [1, JX(1), 1]]) { // flange feeders (both ends at jig position 1): bowl feeder + linear track + servo pick arm on a column
    const fz = Z0 + sz * 1.35; cyl(root, m.sheet, 0.28, 0.5, fx, 0.25, fz, 'y', 20); cyl(root, m.stainless, 0.3, 0.2, fx, 0.6, fz, 'y', 24); for (let r = 0.1; r < 0.28; r += 0.07) cyl(root, m.stainless, r, 0.18, fx, 0.6 + r / 3, fz, 'y', 20);
    box(root, m.aluDark, 0.08, 0.08, 0.6, fx, 0.72, fz - sz * 0.42); for (let i = 0; i < 4; i++) box(root, m.stainless, 0.012, 0.1, 0.15, fx, 0.82, fz - sz * (0.2 + i * 0.12));   // linear track with flanges queued
    prof(root, [fx + 0.3, 0.06, fz], [fx + 0.3, 1.7, fz], 0.06, m.frameDark); box(root, blue, 0.14, 0.12, 0.8, fx + 0.3, 1.7, fz - sz * 0.4); const pa = G('C_FlangeArm_' + k, root, fx, 1.6, fz - sz * 0.7); box(pa, m.aluDark, 0.3, 0.1, 0.1, 0.15, 0, 0); box(pa, m.alu, 0.04, 0.6, 0.04, 0, -0.3, 0); const f = G('C_FlangeArm_' + k + '_Flange', pa, 0, -0.62, 0); box(f, m.stainless, 0.15, 0.1, 0.012, 0, 0, 0);
    nameplate('플랜지 공급기 ' + (k + 1), fx, 0.95, fz - sz * 0.31, sz < 0 ? 0 : Math.PI, 0.4); fp('플랜지 공급기 ' + (k + 1), fx - 0.3, fx + 0.36, fz - 0.3, fz + 0.3); }
  { const MZ = Z0 - 0.85;   // four MIG robots on the aisle side at jig positions 2 … 5 (the rotary jig turns the part between robots 2 and 3), each with power source and wire drum behind
    [0, 1, 2, 3].forEach(i => { const x = JX(2 + i), R = robot('C' + i, x, MZ, 0); if (R) { torch(R.tool); const ar = G('C' + i + '_Arc', R.tool); bin(ar, arcM, xf(new THREE.SphereGeometry(0.016, 10, 8), 0, 0, 0.235)); }
      const bz = MZ - 0.75; box(root, m.red, 0.46, 0.9, 0.4, x, 0.45, bz); box(root, m.black, 0.42, 0.08, 0.36, x, 0.94, bz); box(root, m.display, 0.12, 0.05, 0.004, x, 0.7, bz - 0.202); nameplate('MIG 용접기 ' + (i + 1), x, 0.35, bz - 0.203, Math.PI, 0.3);
      cyl(root, m.lampG, 0.14, 0.35, x, 0.175, bz - 0.45, 'y', 20); cyl(root, m.black, 0.15, 0.02, x, 0.36, bz - 0.45, 'y', 20); box(root, m.aluDark, 0.06, 0.06, 0.45, x + 0.15, 0.95, MZ - 0.42); cyl(root, m.black, 0.012, 0.4, x + 0.15, 0.98, MZ - 0.42, 'z', 8);   // wire drum, cable tray + hose to the robot
      fp('MIG 로봇 ' + (i + 1), x - 0.25, x + 0.25, bz - 0.6, MZ + 0.2); });
    for (const [x, z] of [[JX(1) + 0.3, Z0 - 0.5], [JX(6) - 0.3, Z0 - 0.5], [JX(1) + 0.3, Z0 + 1.3], [JX(6) - 0.3, Z0 + 1.3]]) prof(root, [x, 0.06, z], [x, 2.6, z], 0.06, m.frameDark);   // fume hood on four posts
    box(root, m.sheet, JX(6) - JX(1) - 0.6, 0.08, 1.9, JX(3.5), 2.6, Z0 + 0.4); box(root, m.sheet, 0.6, 0.3, 0.6, JX(3.5), 2.8, Z0 + 0.4); cyl(root, m.sheet, 0.13, 0.8, JX(3.5), 3.3, Z0 + 0.4, 'y', 20);
    // manual MIG at jig position 5 (−Z side): balancer with the torch, wire feeder, welding screen, operator
    const mx = JX(6); const mt = balancer('C_Manual_Torch', mx + 0.6, Z0 - 1.4, 1.45, Math.PI * 0.75); cyl(mt, m.black, 0.015, 0.25, 0, 0, 0, 'y', 8); cyl(mt, m.orange, 0.01, 0.05, 0, -0.14, 0, 'y', 8);
    box(root, m.red, 0.4, 0.6, 0.35, mx + 0.6, 0.3, Z0 - 1.95); nameplate('수동 MIG', mx + 0.6, 0.45, Z0 - 2.13, Math.PI, 0.3); fp('수동 MIG', mx + 0.35, mx + 0.85, Z0 - 2.15, Z0 - 1.3);
    opWorker(root, 'Op_Mig', mx, Z0 - 0.75, 0); const ma = G('Op_Mig_Arc', root); bin(ma, arcM, xf(new THREE.SphereGeometry(0.014, 10, 8), mx, TOP + 0.09, Z0 - 0.12)); }
  cabinetBox('C 제어반', S.bEnd + 0.5, Z0 - 2.1); cabinetBox('로봇 제어', S.cEnd - 0.6, Z0 + 2.4, 0.8, 0.45, 1.9, Math.PI); monitor('C_HMI', S.cEnd - 0.6, Z0 - 1.4, 0.4); tower(S.cEnd - 0.2, Z0 - 1.5);

  // ================================================================ D. C/F check, external paste, manual check, unloading (x 16.3 … 20.6)
  fp('D 베이스', S.cEnd, S.dEnd, Z0 - 1.6, Z0 + 1.6);
  { stopLift('D_CFLift', S.cf); cabin('C/F 검사기', S.cf - 0.45, S.cf + 0.45, Z0 - 0.5, Z0 + 0.5, 1.9, null);   // the spine runs through the cabin; a hood seals the located part
    const hd = G('D_CF_Hood', root, S.cf, 1.45, Z0); box(hd, m.yellow, 0.4, 0.26, 0.34, 0, 0, 0); box(hd, glass, 0.3, 0.1, 0.28, 0, 0.0, 0); box(root, m.sheet, 0.3, 0.3, 0.14, S.cf + 0.2, 1.35, Z0 + 0.6); cyl(root, m.sheet, 0.06, 0.012, S.cf + 0.2, 1.38, Z0 + 0.672, 'z', 20);
    const ok = G('D_CF_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.cf - 0.2, 1.4, Z0 + 0.6, 'y', 14); prof(root, [S.cf - 0.2, 0.9, Z0 + 0.6], [S.cf - 0.2, 1.36, Z0 + 0.6], 0.03, m.frameDark); }
  { stopLift('D_PasteLift', S.paste); gate(S.paste, Z0, 0.9, 1.85); const gx = G('D_Disp_X', root, S.paste, 0, Z0), gz = G('D_Disp_Z', gx), gy = G('D_Disp_Y', gz); box(gx, m.aluDark, 0.14, 0.1, 0.9, 0, 1.85, 0); box(gz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.79, 0); box(gy, m.alu, 0.05, 0.5, 0.05, 0, 1.5, 0); box(gy, m.yellow, 0.1, 0.16, 0.1, 0, 1.32, 0); cyl(gy, m.black, 0.03, 0.1, 0, 1.19, 0, 'y', 12); cyl(gy, m.steel, 0.004, 0.06, 0, 1.11, 0, 'y', 6);
    box(root, m.sheet, 1.4, 0.8, 0.5, S.paste, 0.4, Z0 + 1.15); for (let k = 0; k < 4; k++) cyl(root, magenta, 0.12, 0.5, S.paste - 0.5 + k * 0.34, 1.06, Z0 + 1.15, 'y', 20); cyl(root, m.black, 0.012, 0.7, S.paste, 1.75, Z0 + 0.8, 'z', 8);
    nameplate('외부 페이스트 도포', S.paste, 1.99, Z0 - 0.05, 0, 0.44); nameplate('페이스트 탱크 ×4', S.paste, 0.55, Z0 + 0.89, 0, 0.4); fp('페이스트 탱크', S.paste - 0.7, S.paste + 0.7, Z0 + 0.9, Z0 + 1.4); fp('외부 도포', S.paste - 0.15, S.paste + 0.15, Z0 - 0.5, Z0 + 0.5); }
  { stopLift('D_CheckLift', S.check); for (const sz of [-1, 1]) prof(root, [S.check, 0.06, Z0 + sz * 0.42], [S.check, 1.7, Z0 + sz * 0.42], 0.04); box(root, m.aluDark, 0.08, 0.04, 0.9, S.check, 1.72, Z0); box(root, m.light, 0.06, 0.012, 0.7, S.check, 1.695, Z0);   // inspection lamp over the stop
    cyl(root, m.frameDark, 0.015, 0.5, S.check + 0.3, 1.3, Z0 - 0.42, 'y', 8); cyl(root, glass, 0.09, 0.012, S.check + 0.3, 1.42, Z0 - 0.3, 'z', 20); cyl(root, m.black, 0.1, 0.01, S.check + 0.3, 1.42, Z0 - 0.31, 'z', 20);   // magnifier
    box(root, m.aluDark, 0.5, 0.03, 0.35, S.check, 0.9, Z0 - 0.95); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [S.check + sx * 0.22, 0.06, Z0 - 0.95 + sz * 0.14], [S.check + sx * 0.22, 0.885, Z0 - 0.95 + sz * 0.14], 0.04); box(root, m.red, 0.3, 0.1, 0.25, S.check, 0.95, Z0 - 0.95); box(root, m.ngLabel, 0.2, 0.08, 0.004, S.check, 1.04, Z0 - 1.07);   // NG tray
    nameplate('수동 검사', S.check, 1.86, Z0 - 0.05, 0, 0.36); monitor('D_Monitor', S.check - 0.7, Z0 - 0.95, -0.6); fp('수동 검사', S.check - 0.3, S.check + 0.35, Z0 - 1.15, Z0 + 0.45); }
  stopLift('D_UnloadLift', S.dstop); box(root, m.yellow, 0.025, 0.05, 0.4, S.dEnd - 0.03, TOP + 0.03, Z0);
  cabinetBox('D 제어반', S.cEnd + 0.6, Z0 - 1.95); tower(S.dEnd - 0.2, Z0 - 1.5);

  // ================================================================ E. leak test (x 21.45 … 27.5)
  fp('E 베이스', S.ein - 0.3, S.eEnd + 0.4, Z0 - 1.6, Z0 + 1.6);
  { stopLift('E_Turntable', S.eturn); cyl(root, m.frameDark, 0.16, 0.4, S.eturn, 0.2, Z0, 'y', 16); box(root, m.black, 0.06, 0.06, 0.1, S.eturn - 0.35, TOP + 0.3, Z0 - 0.4); box(root, m.red, 0.004, 0.02, 0.06, S.eturn - 0.32, TOP + 0.3, Z0 - 0.4); prof(root, [S.eturn - 0.35, 0.06, Z0 - 0.42], [S.eturn - 0.35, TOP + 0.35, Z0 - 0.42], 0.03); nameplate('바코드 · 턴테이블', S.eturn, 0.42, Z0 - 0.17, 0, 0.3); }
  stopLift('E_VisLift', S.evis); gate(S.evis, Z0, 0.8, 1.7); camera(S.evis, 1.5, Z0, 'E_VisCam'); nameplate('외관 검사', S.evis, 1.84, Z0 - 0.05, 0, 0.36); fp('외관 검사', S.evis - 0.15, S.evis + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopLift('E_RobotLift', S.estop); const R = robot('E', ...RBASE.E); if (R) { const g = gripper(R.tool, 'E_Grip_Part', Math.PI / 2); lookCore(G('E_Grip_Core', g)); lookPaste(G('E_Grip_Paste', g)); lookTanks(G('E_Grip_Tanks', g)); lookSeam(G('E_Grip_Seam', g)); for (const sx of [-1, 1]) lookFlange(G('E_Grip_Flange' + (sx < 0 ? 'L' : 'R'), g), sx); lookPipes(G('E_Grip_Pipes', g)); } fp('핸들링 로봇 E', RBASE.E[0] - 0.25, RBASE.E[0] + 0.25, RBASE.E[1] - 0.25, RBASE.E[1] + 0.25);
    const [cx, cz] = S.ecab; cabin('리크 테스터', cx - 0.3, cx + 0.3, cz - 0.45, cz + 0.35, 2.0, 'N');
    box(root, m.aluDark, 0.3, 0.03, 0.3, cx, 0.835, cz); for (const sx of [-1, 1]) prof(root, [cx + sx * 0.12, 0.4, cz], [cx + sx * 0.12, 0.82, cz], 0.04); box(root, clampM, 0.12, 0.012, 0.24, cx, 0.856, cz);
    const hood = G('E_Hood', root, cx, 1.5, cz); box(hood, glass, 0.4, 0.3, 0.34, 0, 0, 0); box(hood, m.yellow, 0.42, 0.03, 0.36, 0, 0.165, 0); box(root, m.aluDark, 0.08, 0.5, 0.08, cx, 1.85, cz);
    box(root, m.sheet, 0.5, 1.4, 0.4, cx + 0.7, 0.7, cz); box(root, m.screen, 0.3, 0.2, 0.004, cx + 0.7, 1.1, cz - 0.203); for (const k of [0, 1]) cyl(root, m.sheet, 0.05, 0.012, cx + 0.55 + k * 0.3, 1.3, cz - 0.206, 'z', 16); nameplate('리크 측정기', cx + 0.7, 0.8, cz - 0.203, 0, 0.36); fp('리크 측정기', cx + 0.45, cx + 0.95, cz - 0.2, cz + 0.2);
    const ok = G('E_Leak_OK', root); cyl(ok, m.lampG, 0.032, 0.06, cx + 0.7, 1.5, cz - 0.1, 'y', 14); const ng = G('E_Leak_NG', root); cyl(ng, m.lampR, 0.032, 0.06, cx + 0.7, 1.5, cz + 0.1, 'y', 14);
    stopLift('E_BackLift', S.eback); }
  { stopLift('E_MarkLift', S.mark); cabin('레이저 마킹', S.mark - 0.4, S.mark + 0.4, Z0 - 0.5, Z0 + 0.5, 1.9, null); const h = slide('E_MarkHead', S.mark, Z0, 1.85, 0.3); box(h, m.black, 0.18, 0.2, 0.18, 0, -0.1, 0); cyl(h, m.steel, 0.04, 0.05, 0, -0.22, 0, 'y', 12); const bm = G('E_Mark_Beam', h); cyl(bm, laserM, 0.003, 0.55, 0, -0.5, 0, 'y', 6); }
  { stopLift('E_NutLift', S.nut); const nr = balancer('E_Nutrunner', S.nut + 0.5, Z0 + 0.75, 1.5, Math.PI * 1.25); cyl(nr, m.black, 0.02, 0.4, 0, 0, 0, 'y', 10); cyl(nr, m.yellow, 0.03, 0.08, 0, 0.1, 0, 'y', 10); cyl(nr, m.steel, 0.006, 0.08, 0, -0.24, 0, 'y', 6);
    box(root, m.aluDark, 0.4, 0.03, 0.3, S.nut, 0.9, Z0 - 0.7); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [S.nut + sx * 0.17, 0.06, Z0 - 0.7 + sz * 0.12], [S.nut + sx * 0.17, 0.885, Z0 - 0.7 + sz * 0.12], 0.04); for (let k = 0; k < 3; k++) cyl(root, m.rubber, 0.04, 0.004, S.nut - 0.1 + k * 0.1, 0.918, Z0 - 0.7, 'y', 16); cyl(root, m.sheet, 0.12, 0.3, S.nut + 0.25, 1.05, Z0 - 0.7, 'y', 16);   // gasket tray, bolt feeder
    nameplate('가스켓 · 볼트 체결', S.nut, 0.9, Z0 - 0.86, 0, 0.4); fp('가스켓 · 볼트', S.nut - 0.22, S.nut + 0.4, Z0 - 0.9, Z0 - 0.5); }
  { stopLift('E_OKNGLift', S.okng); gate(S.okng, Z0, 0.8, 1.6); const ok = G('E_OKNG_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.okng, 1.65, Z0 - 0.4, 'y', 14); const ng = G('E_OKNG_NG', root); cyl(ng, m.lampR, 0.032, 0.06, S.okng, 1.65, Z0 + 0.4, 'y', 14); nameplate('OK / NG 분기', S.okng, 1.74, Z0 - 0.05, 0, 0.36);
    pusher('E_NG_Pusher', S.okng, Z0 - 0.3, TOP + 0.06, 'z', 0.4); rollers(S.okng - 0.2, S.okng + 1.0, Z0 + 0.85, 0.4); box(root, m.yellow, 0.025, 0.05, 0.3, S.okng + 0.78, TOP + 0.03, Z0 + 0.85); nameplate('NG 보관', S.okng + 0.4, TOP + 0.25, Z0 + 1.1, 0, 0.36); }
  { const lf = G('E_Lift', root); box(lf, m.alu, 0.5, 0.1, 0.56, S.lift, TOP - 0.06, Z0); for (let k = 0; k < 5; k++) cyl(lf, m.steel, 0.022, 0.5, S.lift - 0.2 + k * 0.1, TOP - 0.025, Z0, 'z', 10); box(lf, m.yellow, 0.025, 0.05, 0.4, S.lift + 0.24, TOP + 0.03, Z0);
    for (const sz of [-1, 1]) { prof(root, [S.lift, 0.06, Z0 + sz * 0.34], [S.lift, 1.4, Z0 + sz * 0.34], 0.05, m.frameDark); box(root, m.aluDark, 0.1, 0.05, 0.05, S.lift, 0.3, Z0 + sz * 0.3); } box(root, m.yellow, 0.1, 0.06, 0.78, S.lift, 1.4, Z0); nameplate('배출 리프트', S.lift, 1.47, Z0 - 0.42, 0, 0.4); totes(S.lift, Z0 - 1.0, 1); fp('배출 리프트', S.lift - 0.3, S.lift + 0.3, Z0 - 1.25, Z0 + 0.4); }
  cabinetBox('E 제어반', S.ein + 0.3, Z0 - 1.95); cabinetBox('리크 제어', S.ein + 1.3, Z0 - 1.95); monitor('E_HMI', S.eturn + 0.8, Z0 - 1.4, 0.4); tower(S.eEnd - 0.2, Z0 - 1.5);
  const ol = opWorker(root, 'Op_Leak', (S.dstop + S.ein) / 2, Z0 - 0.8, 0); { const hp = G('Op_Leak_Part', ol._Arm_R, -0.06, -0.78, 0.05); hp.rotation.y = Math.PI / 2; lookCore(hp); lookTanks(hp); for (const sx of [-1, 1]) lookFlange(G('Op_Leak_Part_F' + (sx < 0 ? 'L' : 'R'), hp), sx); lookPipes(hp); }
  const oo = opWorker(root, 'Op_Out', S.lift - 0.1, Z0 - 0.8, 0); { const hp = G('Op_Out_Part', oo._Arm_R, -0.06, -0.78, 0.05); hp.rotation.y = Math.PI / 2; lookCore(hp); lookTanks(hp); for (const sx of [-1, 1]) lookFlange(G('Op_Out_Part_F' + (sx < 0 ? 'L' : 'R'), hp), sx); lookPipes(hp); lookMark(hp); }
  opWorker(root, 'Op_Check', S.check, Z0 - 0.75, 0);

  // ================================================================ perimeter guard: fences round the automatic cells with openings where operators work
  fenceRun(-0.9, Z0 - 2.4, S.cEnd, Z0 - 2.4, [(S.bEnd + S.cEnd) / 2 - 1.8, Z0 - 2.4]); fenceRun(-0.9, Z0 + 2.9, S.eEnd + 0.4, Z0 + 2.9);
  fenceRun(-0.9, Z0 - 2.4, -0.9, Z0 + 2.9, [-0.9, Z0 - 0.5]); fenceRun(S.eEnd + 0.4, Z0 - 2.4, S.eEnd + 0.4, Z0 + 2.9, [S.eEnd + 0.4, Z0 - 0.5]);
  fenceRun(S.ein - 0.5, Z0 - 2.4, S.eEnd + 0.4, Z0 - 2.4, [S.estop, Z0 - 2.4]);

  // ================================================================ parts in flight: X > Y > Z > Part (ry: turned across the line from the turn unit on) > looks
  const N = MODULE_T / MODULE_P;
  for (let i = 0; i < N; i++) {
    const PN = 'Part_' + (i + 1), x = G(PN + '_X', root, 0, TOP, Z0), y = G(PN + '_Y', x), z = G(PN + '_Z', y), p = G(PN, z), lk = G(PN + '_Look', p);
    lookCore(G(PN + '_Core', lk)); lookPaste(G(PN + '_Paste', lk)); lookTanks(G(PN + '_Tanks', lk)); lookSeam(G(PN + '_Seam', lk)); for (const sx of [-1, 1]) lookFlange(G(PN + '_Flange' + (sx < 0 ? 'L' : 'R'), lk), sx); lookPipes(G(PN + '_Pipes', lk)); lookMark(G(PN + '_Mark', lk));
  }
  // ---------------------------------------------------------------- footprint check: machines must not overlap each other (cell base plates excepted)
  const bad = [];
  for (let a = 0; a < FOOT.length; a++) for (let b = a + 1; b < FOOT.length; b++) { const A = FOOT[a], B = FOOT[b]; const conv = F => /^컨베이어/.test(F[0]), straddles = F => F[3] < Z0 && F[4] > Z0 && !conv(F);   // inline stations sit across the spine by design
    if (/베이스$/.test(A[0]) || /베이스$/.test(B[0]) || (conv(A) && (conv(B) || straddles(B) || /지그 트랜스퍼/.test(B[0]))) || (conv(B) && (straddles(A) || /지그 트랜스퍼/.test(A[0])))) continue;
    if (A[1] < B[2] - 0.02 && B[1] < A[2] - 0.02 && A[3] < B[4] - 0.02 && B[3] < A[4] - 0.02) bad.push(A[0] + ' × ' + B[0]); }
  if (bad.length) throw new Error('machine footprints overlap: ' + bad.join(', '));
  return animate(finalize(root), robots);
}

// ---------------------------------------------------------------- the cycle: every part's path along the spine, the robots' IK paths and every machine / operator
// that touches it, as keys relative to the part's start s = j · MODULE_P (times below are offsets from s)
function animate(root, robots) {
  const T = MODULE_T, P = MODULE_P, N = T / P, V = (x, y, z) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2, R = -0.15;
  const ease = u => u * u * (3 - 2 * u), ch = {}, add = (node, c, list) => { if (!root.getObjectByName(node)) throw new Error('no node ' + node); const key = node + '|' + c; (ch[key] || (ch[key] = [])).push(...list); };
  const ser = (evs, rest) => { evs = evs.slice().sort((a, b) => a[0] - b[0]);
    const f = t => { let k = -1; while (k + 1 < evs.length && evs[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === evs.length - 1) return evs[k][1]; const [t0, v0] = evs[k], [t1, v1] = evs[k + 1]; return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1); };
    return [[0, f(0)], ...evs.filter(e => e[0] > 0 && e[0] < T), [T, f(T)]]; };
  const vis = (evs, v0) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); let s = v0; for (const [t, v] of evs) if (t <= 0) s = v; return [[0, s], ...evs.filter(e => e[0] > 0 && e[0] < T)]; };
  const reach = (op, t0, t1, a = -0.9) => { add(op + '_Arm_R', 'rx', [[t0, R], [t0 + 0.6, a], [t1 - 0.6, a], [t1, R]]); add(op + '_Arm_L', 'rx', [[t0 + 0.1, R], [t0 + 0.7, a + 0.15], [t1 - 0.7, a + 0.15], [t1 - 0.1, R]]); };
  const turn = (op, keys) => add(op + '_Turn', 'ry', keys);
  const flash = (node, t0, t1) => add(node, 'vis', [[t0, true], [t1, false]]);
  const lift = (node, t0, t1) => add(node, 'y', [[t0, 0], [t0 + 0.8, LIFT], [t1 - 0.8, LIFT], [t1, 0]]);   // lift-and-locate plate up while the station works
  const head = (node, t0, t1, d) => add(node, 'y', [[t0, 0], [t0 + 1.0, -d], [t1 - 1.0, -d], [t1, 0]]);
  const AXN = ['ry', 'rz', 'rz', 'rz', 'ry', 'rz'], TIPL = V(0, 0, 0.101 + 0.165);
  const rig = key => robots[key] ? ikRig(root, robots[key].J, TIPL) : null;
  const playRobot = (key, rp, t0) => { if (!robots[key]) return; robots[key].J.forEach((j, q) => add(j.name, AXN[q], [[t0 - 0.01, 0], ...rp.wp.map(([t, v]) => [t0 + t, v[q] - rp.rest[q]]), [t0 + rp.T + 0.01, 0]])); };
  const H = 0.12;
  // robot paths (traced once): pick at a lift plate (part raised by LIFT), place on the next one
  const rigA = rig('A'), rigB = rig('B'), rigE = rig('E');
  const pathA = li => { const sz = li ? 1 : -1, lz = LANES[li], y0 = TOP + LIFT + YC;
    return rigA && rigA.trace([[HOME.A(li), 0], [[RBASE.A[0] - 0.1, RH + 0.4, Z0 + sz * 0.5], 0.8], [[S.lane - 0.05, y0 + H, lz], 1.2], [[S.lane - 0.05, y0, lz], 0.6], [[S.lane - 0.05, y0, lz], 0.3, 'grip'], [[S.lane - 0.05, y0 + H, lz], 0.5],
      [[S.merge, y0 + H, Z0], 1.6], [[S.merge, y0 + 0.003, Z0], 0.5], [[S.merge, y0 + 0.003, Z0], 0.3, 'release'], [[S.merge, y0 + H, Z0], 0.4], [[RBASE.A[0] - 0.1, RH + 0.4, Z0 + sz * 0.5], 1.0], [HOME.A(li), 0.6]], 'A robot lane ' + li); };
  const RA = rigA ? [pathA(0), pathA(1)] : null;
  const pathSide = (rg, home, base, stopX, cab, backX, label) => { const y0 = TOP + LIFT + YC, [cx, cz] = cab, yc = FIXY + YC, out = [base[0] - 0.5, RH + 0.2, base[1]];   // spine stop → cabin fixture, wait, fixture → spine; 'out' keeps the swing clear of the base
    return rg && rg.trace([[home, 0], [out, 0.8], [[stopX, y0 + H, Z0], 1.2], [[stopX, y0, Z0], 0.6], [[stopX, y0, Z0], 0.3, 'grip'], [[stopX, y0 + H, Z0], 0.5], [[stopX + 0.3, y0 + H + 0.05, Z0 - 0.15], 0.6], [[cx, yc + H, cz], 1.4], [[cx, yc + 0.003, cz], 0.6], [[cx, yc + 0.003, cz], 0.3, 'put'], [[cx, yc + H, cz], 0.5], [[cx - 0.25, yc + H + 0.1, cz - 0.1], 0.6], [home, 1.0], [home, 10.0, 'wait'],
      [[cx, yc + H, cz], 1.4], [[cx, yc + 0.003, cz], 0.6], [[cx, yc + 0.003, cz], 0.3, 'take'], [[cx, yc + H, cz], 0.5], [[backX, y0 + H, Z0], 1.8], [[backX, y0 + 0.003, Z0], 0.5], [[backX, y0 + 0.003, Z0], 0.3, 'release'], [[backX, y0 + H, Z0], 0.4], [[base[0], y0 + H, Z0], 0.8], [out, 0.8], [home, 0.8]], label); };
  const RB = pathSide(rigB, HOME.B, RBASE.B, S.bstop, S.bcab, S.bback, 'B robot'), RE = pathSide(rigE, HOME.E, RBASE.E, S.estop, S.ecab, S.eback, 'E robot');
  // MIG torch path (traced once on robot C0, reused by all four: same geometry relative to the base): approach the near flange joint on the
  // jig, weld the upper half of the ring, retreat
  const RM = (() => { if (!robots.C0) return null; const rg = ikRig(root, robots.C0.J, V(0, 0, 0.235)), bx = JX(2), MZ = Z0 - 0.85, yj = TOP + 0.02 + YC, zj = Z0 - 0.146, r = 0.052;
    const arc = []; for (let i = 0; i <= 6; i++) { const a = 0.25 + (Math.PI - 0.5) * i / 6; arc.push([[bx + r * Math.cos(a), yj + r * Math.sin(a) + 0.004, zj - 0.012], i ? 0.55 : 0.3, i === 0 ? 'weld0' : i === 6 ? 'weld1' : undefined]); }
    return rg.trace([[[bx, RH + 0.35, MZ + 0.15], 0], [[bx + 0.2, 1.15, Z0 - 0.5], 1.0], [[bx + r + 0.03, yj + 0.1, zj - 0.012], 0.8], ...arc, [[bx - r - 0.02, yj + 0.1, zj - 0.012], 0.4], [[bx - 0.2, 1.15, Z0 - 0.5], 0.8], [[bx, RH + 0.35, MZ + 0.15], 0.8]], 'MIG robot'); })();

  // jig loop: index n at I(n) = n · DJ, the move takes 1.5 s; jig j sits at position (j + n) mod 11 after index n
  const I = n => n * DJ, JI = t => Math.ceil(t / DJ);
  for (let j = 0; j < NJIG; j++) { const xs = [], zs = [], rs = [];
    for (let n = 0; n <= 33; n++) { const q0 = (j + n) % NJIG, q1 = (j + n + 1) % NJIG; xs.push([I(n), JX(q0) - JX(j)], [I(n) + 1.5, JX(q1) - JX(j)]); zs.push([I(n), JZ(q0) - JZ(j)], [I(n) + 1.5, JZ(q1) - JZ(j)]);
      if (q1 === 4) rs.push([I(n) + 1.8, 0], [I(n) + 3.3, Math.PI]); if (q1 === 6) rs.push([I(n) + 1.8, Math.PI], [I(n) + 3.3, 0]); }   // rotary jig: turned 180° at position 4 (robots 3, 4 weld the other end), back at position 6
    add('C_Jig_' + j, 'x', xs); add('C_Jig_' + j, 'z', zs); add('C_Jig_' + j, 'ry', rs); }

  const CV = 0.35;   // spine speed m/s
  for (let jj = -2; jj < N + 2; jj++) {
    const k = ((jj % N) + N) % N, PN = 'Part_' + (k + 1), s = jj * P, li = k % 2, lz = LANES[li], dNG = k === 5, lNG = k === 2;
    const PK = [], VIS = [], RY = []; let cx = 0, ct = 0;   // position keys; cx / ct: where and when the part last stopped on the spine
    const at = (t, pos) => PK.push([s + t, pos]), show = (t, v) => VIS.push([s + t, v]), ry = (t, v) => RY.push([s + t, v]);
    const conv = (x1, y = TOP) => { const t1 = ct + Math.abs(x1 - cx) / CV; at(ct, [cx, y, Z0]); at(t1, [x1, y, Z0]); cx = x1; ct = t1; return t1; };   // ride the spine to x1
    const dwell = (name, dt, y = TOP) => { const t0 = ct; lift(name, s + t0, s + t0 + dt); at(t0 + 0.8, [cx, y + LIFT, Z0]); at(t0 + dt - 0.8, [cx, y + LIFT, Z0]); ct = t0 + dt; return t0; };   // raised on the lift plate while the station works
    const finish = () => { PK.sort((a, b) => a[0] - b[0]); for (const [cc, q] of [['x', 0], ['y', 1], ['z', 2]]) add(PN + '_' + cc.toUpperCase(), cc, PK.map(([t, p]) => [t, p[q] - [0, TOP, Z0][q]])); add(PN, 'vis', VIS); add(PN, 'ry', RY); };
    // ---- A: operator sets the core on its lane; centring + direction check, fin vision + barcode at the lane lift; robot merges it onto the spine
    reach('Op_Load', s - 1.5, s + 1.5); turn('Op_Load', [[s - 3, 0], [s - 2.2, li ? 0.8 : 0.3], [s + 1.8, li ? 0.8 : 0.3], [s + 2.6, 0]]);
    show(0, true); ry(0, 0); at(0, [0.1, TOP, lz]); at(5, [S.lane - 0.05, TOP, lz]);
    for (const sd of ['_L', '_R']) add('A_Center_' + li + sd, 'z', [[s + 1.5, 0], [s + 2.2, sd === '_L' ? 0.06 : -0.06], [s + 3.2, sd === '_L' ? 0.06 : -0.06], [s + 3.8, 0]]);   // centring while the part passes the gate
    flash('A_FinCam_' + li, s + 3.6, s + 4.0);
    const ra = s + 7.5, rA = RA ? RA[li] : null;
    lift('A_LaneLift_' + li, s + 5.5, rA ? ra + rA.ev.grip + 1.0 : s + 12.5); at(6.3, [S.lane - 0.05, TOP + LIFT, lz]);
    if (rA) { playRobot('A', rA, ra); const e = rA.ev; at(ra + e.grip - s, [S.lane - 0.05, TOP + LIFT, lz]); show(ra + e.grip - s, false); flash('A_Grip_Part', ra + e.grip, ra + e.release); at(ra + e.release - s, [S.merge, TOP + LIFT, Z0]); show(ra + e.release - s, true); cx = S.merge; ct = ra + e.release - s; at(ct + 0.8, [S.merge, TOP, Z0]); ct += 0.8; }
    else { at(14, [S.merge, TOP, Z0]); cx = S.merge; ct = 14; }
    conv(S.prof); { const t0 = dwell('A_ProfLift', 6); head('A_ProfHead', s + t0 + 0.8, s + t0 + 5.2, 0.45); flash('A_Profile', s + t0 + 1.8, s + t0 + 4.4); }
    conv(S.disp); { const t0 = dwell('A_DispLift', 10); add('A_Disp_Y', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -(1.11 - 0.06 - (TOP + LIFT + 2 * YC + 0.01))], [s + t0 + 8.5, -(1.11 - 0.06 - (TOP + LIFT + 2 * YC + 0.01))], [s + t0 + 9.5, 0]]);
      add('A_Disp_X', 'x', [[s + t0 + 2, -0.093], [s + t0 + 5, -0.093], [s + t0 + 5.4, 0.093], [s + t0 + 8.5, 0.093], [s + t0 + 9.5, 0]]); add('A_Disp_Z', 'z', [[s + t0 + 2, -0.04], [s + t0 + 5, 0.04], [s + t0 + 5.4, -0.04], [s + t0 + 8.5, 0.04], [s + t0 + 9.5, 0]]); add(PN + '_Paste', 'vis', [[s, false], [s + t0 + 8.5, true]]); }
    conv(S.cam); { const t0 = dwell('A_CamLift', 3); flash('A_NozCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.scale); dwell('A_ScaleLift', 4);
    conv(S.ngA);
    if (dNG) { add('A_NG_Pusher', 'z', [[s + ct, 0], [s + ct + 1.0, 0.85], [s + ct + 2.0, 0]]); at(ct, [S.ngA, TOP, Z0]); at(ct + 1.0, [S.ngA, TOP, Z0 + 0.85]); at(ct + 4, [S.ngA + 0.75, TOP, Z0 + 0.85]); show(ct + 4, false); finish(); continue; }
    // ---- B: turn unit (90°) → tank feeders → press 1 → press 2 → vision → robot into the laser cabin → back → outfeed
    conv(S.turn); { const t0 = dwell('B_Turn', 5); add('B_Turn', 'ry', [[s + t0 + 1, 0], [s + t0 + 3.5, Math.PI / 2], [s + t0 + 4.2, Math.PI / 2], [s + t0 + 4.21, 0]]); ry(t0 + 1, 0); ry(t0 + 3.5, Math.PI / 2); }
    conv(S.tank); { const t0 = dwell('B_TankLift', 8); for (const sd of ['_L', '_R']) { const sg = sd === '_L' ? -1 : 1; add('B_TankArm' + sd, 'z', [[s + t0 + 0.5, 0], [s + t0 + 1.8, -sg * 0.63], [s + t0 + 5.2, -sg * 0.63], [s + t0 + 6.5, 0]]); add('B_TankArm' + sd, 'y', [[s + t0 + 1.8, 0], [s + t0 + 2.8, -(1.28 - (TOP + LIFT + YC))], [s + t0 + 4.2, -(1.28 - (TOP + LIFT + YC))], [s + t0 + 5.2, 0]]); add('B_TankArm' + sd + '_Tank', 'vis', [[s + t0 + 4.2, false], [s + t0 + 8, true]]); } add(PN + '_Tanks', 'vis', [[s, false], [s + t0 + 4.2, true]]); }
    for (const [k2, px] of S.press.entries()) { conv(px); const t0 = dwell('B_PressLift_' + k2, 6), sg = k2 ? 1 : -1; add('B_Press_' + k2, 'z', [[s + t0 + 1, 0], [s + t0 + 2.2, sg * 0.29], [s + t0 + 4, sg * 0.29], [s + t0 + 5, 0]]); }
    conv(S.vis); { const t0 = dwell('B_VisLift', 3); flash('B_PressCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.bstop); { const t0 = ct, rb = s + t0 + 1.5; lift('B_RobotLift', s + t0, RB ? rb + RB.ev.grip + 1.0 : s + t0 + 4); at(t0 + 0.8, [S.bstop, TOP + LIFT, Z0]);
      if (RB) { playRobot('B', RB, rb); const e = RB.ev; at(rb + e.grip - s, [S.bstop, TOP + LIFT, Z0]); show(rb + e.grip - s, false); flash('B_Grip_Part', rb + e.grip, rb + e.put); flash('B_Grip_Part', rb + e.take, rb + e.release);
        at(rb + e.put - s, [S.bcab[0], FIXY, S.bcab[1]]); show(rb + e.put - s, true); head('B_LaserHead', rb + e.put + 1, rb + e.take - 1, 0.35); flash('B_Laser_Beam', rb + e.put + 2.2, rb + e.take - 2.2); add(PN + '_Seam', 'vis', [[s, false], [rb + e.take - 2.2, true]]); flash('B_Grip_Seam', rb + e.take, rb + e.release);
        at(rb + e.take - s, [S.bcab[0], FIXY, S.bcab[1]]); show(rb + e.take - s, false); at(rb + e.release - s, [S.bback, TOP + LIFT, Z0]); show(rb + e.release - s, true); lift('B_BackLift', rb + e.release - 2, rb + e.release + 1.5); cx = S.bback; ct = rb + e.release - s + 1.5; at(ct, [S.bback, TOP, Z0]); }
      else { ct = t0 + 30; cx = S.bback; at(ct, [S.bback, TOP, Z0]); } }
    conv(S.bEnd - 0.5); conv(S.cin);
    // ---- C: the part slides onto the jig at position 0 right after an index, rides to position 6, slides off onto the spine
    const n0 = JI(s + ct + 1), tL = I(n0) + 1.7 - s; at(tL, [S.cin, TOP, Z0]); at(tL + 1.2, [JX(0), TOP + 0.02, Z0]);
    for (let q = 1; q < JPOS; q++) { const ti = I(n0 + q) - s; at(ti, [JX(q - 1), TOP + 0.02, Z0]); at(ti + 1.5, [JX(q), TOP + 0.02, Z0]); const a = ti + 2.5;
      if (q === 1) for (const fk of [0, 1]) { const sg = fk ? 1 : -1; add('C_FlangeArm_' + fk, 'z', [[s + a, 0], [s + a + 1.4, sg * 0.5], [s + a + 3.6, sg * 0.5], [s + a + 5.0, 0]]); add('C_FlangeArm_' + fk, 'y', [[s + a + 1.4, 0], [s + a + 2.2, -(0.98 - (TOP + 0.02 + YC))], [s + a + 3.0, -(0.98 - (TOP + 0.02 + YC))], [s + a + 3.6, 0]]);
        add('C_FlangeArm_' + fk + '_Flange', 'vis', [[s + a + 3.0, false], [s + a + 6, true]]); add(PN + (fk ? '_FlangeR' : '_FlangeL'), 'vis', [[s, false], [s + a + 3.0, true]]); }
      if (q >= 2 && q <= 5 && RM) { const ri = q - 2; playRobot('C' + ri, RM, s + a); flash('C' + ri + '_Arc', s + a + RM.ev.weld0, s + a + RM.ev.weld1); }
      if (q === 4) { ry(ti + 1.8, Math.PI / 2); ry(ti + 3.3, Math.PI * 1.5); } if (q === 6) { ry(ti + 1.8, Math.PI * 1.5); ry(ti + 3.3, Math.PI / 2); }   // the rotary jig turns the part with it
      if (q === 6) { reach('Op_Mig', s + a + 1.5, s + a + 7.0, -0.85); flash('Op_Mig_Arc', s + a + 2.5, s + a + 6.2); add('C_Manual_Torch', 'y', [[s + a + 1.5, 0], [s + a + 2.5, -0.45], [s + a + 6.5, -0.45], [s + a + 7.5, 0]]); add('C_Manual_Torch', 'x', [[s + a + 1.5, 0], [s + a + 2.5, -0.5], [s + a + 6.5, -0.5], [s + a + 7.5, 0]]); add('C_Manual_Torch', 'z', [[s + a + 1.5, 0], [s + a + 2.5, 0.6], [s + a + 6.5, 0.6], [s + a + 7.5, 0]]); add(PN + '_Pipes', 'vis', [[s, false], [s + a + 6.2, true]]); } }
    const tU = I(n0 + JPOS) - s - 3.0; at(tU, [JX(JPOS - 1), TOP + 0.02, Z0]); at(tU + 1.2, [S.cout, TOP, Z0]); cx = S.cout; ct = tU + 1.2;
    conv(S.cEnd - 0.4);
    // ---- D: C/F tester (hood down) → external paste gantry → manual check at the lift → unload stop
    conv(S.cf); { const t0 = dwell('D_CFLift', 14); add('D_CF_Hood', 'y', [[s + t0 + 1, 0], [s + t0 + 2.2, -0.38], [s + t0 + 12, -0.38], [s + t0 + 13.2, 0]]); flash('D_CF_OK', s + t0 + 11, s + t0 + 14); }
    conv(S.paste); { const t0 = dwell('D_PasteLift', 10); add('D_Disp_Y', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -(1.11 - 0.06 - (TOP + LIFT + 2 * YC + 0.01))], [s + t0 + 8.5, -(1.11 - 0.06 - (TOP + LIFT + 2 * YC + 0.01))], [s + t0 + 9.5, 0]]); add('D_Disp_Z', 'z', [[s + t0 + 2, -0.13], [s + t0 + 5, -0.13], [s + t0 + 5.4, 0.13], [s + t0 + 8.5, 0.13], [s + t0 + 9.5, 0]]); add('D_Disp_X', 'x', [[s + t0 + 2, -0.05], [s + t0 + 5, 0.05], [s + t0 + 5.4, -0.05], [s + t0 + 8.5, 0.05], [s + t0 + 9.5, 0]]); }
    conv(S.check); { const t0 = dwell('D_CheckLift', 12); reach('Op_Check', s + t0 + 0.5, s + t0 + 11.5, -0.75); turn('Op_Check', [[s + t0 + 1, 0], [s + t0 + 3, 0.3], [s + t0 + 6, -0.3], [s + t0 + 9, 0.3], [s + t0 + 11.5, 0]]); }
    conv(S.dstop); dwell('D_UnloadLift', 3);
    // ---- E: the operator carries the cooler to the leak cell's infeed; turntable; visual; robot → leak tester cabin → back; marking; nutrunner; OK / NG; lift; packed
    { const t0 = ct; turn('Op_Leak', [[s + t0 - 0.5, 0], [s + t0 + 0.5, 1.1], [s + t0 + 2.5, 1.1], [s + t0 + 4, -1.1], [s + t0 + 6, -1.1], [s + t0 + 7, 0]]); reach('Op_Leak', s + t0, s + t0 + 6.5);
      at(t0 + 1.5, [S.dstop, TOP, Z0]); show(t0 + 1.5, false); flash('Op_Leak_Part', s + t0 + 1.5, s + t0 + 5.5); at(t0 + 5.5, [S.ein, TOP, Z0]); show(t0 + 5.5, true); cx = S.ein; ct = t0 + 5.5; }
    conv(S.eturn); { const t0 = dwell('E_Turntable', 5); add('E_Turntable', 'ry', [[s + t0 + 1, 0], [s + t0 + 3.5, Math.PI], [s + t0 + 4.2, Math.PI], [s + t0 + 4.21, 0]]); ry(t0 + 1, Math.PI / 2); ry(t0 + 3.5, Math.PI * 1.5); ry(t0 + 4.21, Math.PI / 2); }
    conv(S.evis); { const t0 = dwell('E_VisLift', 3); flash('E_VisCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.estop); { const t0 = ct, re = s + t0 + 1.5; lift('E_RobotLift', s + t0, RE ? re + RE.ev.grip + 1.0 : s + t0 + 4); at(t0 + 0.8, [S.estop, TOP + LIFT, Z0]);
      if (RE) { playRobot('E', RE, re); const e = RE.ev; at(re + e.grip - s, [S.estop, TOP + LIFT, Z0]); show(re + e.grip - s, false); flash('E_Grip_Part', re + e.grip, re + e.put); flash('E_Grip_Part', re + e.take, re + e.release);
        at(re + e.put - s, [S.ecab[0], FIXY, S.ecab[1]]); show(re + e.put - s, true); add('E_Hood', 'y', [[re + e.put + 0.8, 0], [re + e.put + 1.8, -0.42], [re + e.take - 2.5, -0.42], [re + e.take - 1.3, 0]]); flash(lNG ? 'E_Leak_NG' : 'E_Leak_OK', re + e.take - 3.5, re + e.take + 2);
        at(re + e.take - s, [S.ecab[0], FIXY, S.ecab[1]]); show(re + e.take - s, false); at(re + e.release - s, [S.eback, TOP + LIFT, Z0]); show(re + e.release - s, true); lift('E_BackLift', re + e.release - 2, re + e.release + 1.5); cx = S.eback; ct = re + e.release - s + 1.5; at(ct, [S.eback, TOP, Z0]); }
      else { ct = t0 + 30; cx = S.eback; at(ct, [S.eback, TOP, Z0]); } }
    conv(S.mark); { const t0 = dwell('E_MarkLift', 6); head('E_MarkHead', s + t0 + 0.8, s + t0 + 5.2, 0.25); flash('E_Mark_Beam', s + t0 + 2, s + t0 + 4.2); add(PN + '_Mark', 'vis', [[s, false], [s + t0 + 4.2, true]]); }
    conv(S.nut); { const t0 = dwell('E_NutLift', 12); add('E_Nutrunner', 'x', [[s + t0, 0], [s + t0 + 1, -0.62], [s + t0 + 5.5, -0.62], [s + t0 + 6.2, -0.38], [s + t0 + 10.5, -0.38], [s + t0 + 11.5, 0]]); add('E_Nutrunner', 'z', [[s + t0, 0], [s + t0 + 1, 0.75], [s + t0 + 10.5, 0.75], [s + t0 + 11.5, 0]]);
      add('E_Nutrunner', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -0.4], [s + t0 + 5, -0.4], [s + t0 + 5.6, -0.1], [s + t0 + 6.4, -0.1], [s + t0 + 7, -0.4], [s + t0 + 10, -0.4], [s + t0 + 10.8, 0]]); add('E_Nutrunner', 'ry', [[s + t0 + 2, 0], [s + t0 + 5, 6 * TAU], [s + t0 + 7, 6 * TAU], [s + t0 + 10, 12 * TAU], [s + t0 + 11.5, 12 * TAU], [s + t0 + 11.51, 0]]); }
    conv(S.okng); { const t0 = dwell('E_OKNGLift', 4); flash(lNG ? 'E_OKNG_NG' : 'E_OKNG_OK', s + t0 + 1, s + t0 + 4);
      if (lNG) { add('E_NG_Pusher', 'z', [[s + t0 + 4, 0], [s + t0 + 5, 0.85], [s + t0 + 6, 0]]); at(t0 + 4, [S.okng, TOP, Z0]); at(t0 + 5, [S.okng, TOP, Z0 + 0.85]); at(t0 + 8, [S.okng + 0.75, TOP, Z0 + 0.85]); show(t0 + 8, false); finish(); continue; } }
    conv(S.lift); { const t0 = ct; add('E_Lift', 'y', [[s + t0, 0], [s + t0 + 2, -0.2], [s + t0 + 6, -0.2], [s + t0 + 8, 0]]); at(t0, [S.lift, TOP, Z0]); at(t0 + 2, [S.lift, TOP - 0.2, Z0]);
      turn('Op_Out', [[s + t0 + 2, 0], [s + t0 + 3, 0.9], [s + t0 + 5, 0.9], [s + t0 + 6.5, -0.9], [s + t0 + 8, -0.9], [s + t0 + 9, 0]]); reach('Op_Out', s + t0 + 2.5, s + t0 + 8.5);
      at(t0 + 3.5, [S.lift, TOP - 0.2, Z0]); show(t0 + 3.5, false); flash('Op_Out_Part', s + t0 + 3.5, s + t0 + 7.5); }
    finish();
  }
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) {
    const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /_(Cam|Beam|Arc|OK|NG|Part|Paste|Seam|Tanks|Pipes|Mark|FlangeL|FlangeR|Profile)$|^Part_\d$|^Op_(Leak|Out)_Part$|_Grip_/.test(node) && !/_Tank$|_Flange$/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs, /_Arm_/.test(node) ? R : 0)]);
  }
  return cycleClip(root, 'Module_Cycle', T, keys, 4);
}
