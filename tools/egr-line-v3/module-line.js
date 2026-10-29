// The EGR cooler automatic welding module line rebuilt from generic equipment (the CAD cells are in assets/models/egr-weld-module/):
// the same five cells, stations and order, at the CAD positions, as one baked model with the product flowing through it.
// Line frame: x along the flow (cell A inlet at x 0, leak test outlet at x 26.7), z across; the main axis is z 1.3 and cell A's two
// lanes sit at z 0.8 / 1.8. Operators stand on the −Z side (the aisle). Metres, Y up, floor at y 0.
//
//   A. core-assy loading (two lanes: roller infeed, centring + direction check, fin vision + barcode) → handling robot → laser
//      profiler → fixed dispensing nozzle (the robot traces the paste lines) → nozzle vision → weight check → exit block / NG conveyor
//   B. pusher → core shuttle (turns the core across the line) → tank feeders drop an end tank on both ends → transfer gantry: tank
//      press 1, tank press 2, press vision, buffer stand → handling robot holds the core under the scan laser head → outfeed (NG beside)
//   C. infeed pitch conveyor → jig transfer loop (11 jigs, 7 work positions) with two flange feeders, four MIG robots (power source +
//      wire drum each) and a manual MIG position → outfeed pitch conveyor
//   D. 2nd C/F check chamber → external paste dispenser (four paste tanks) → manual check table → unload conveyor
//   E. operator carries the cooler over → pitch conveyor → barcode + turntable → visual camera → robot loads the leak jig → laser
//      marking → gasket & bolt station → OK / NG jig with NG storage conveyor → exit lift, operator packs the tote
// Cycle: MODULE_T 400 s, a part every MODULE_P 50 s (8 in flight); part 6 fails the dispensing check, part 3 the leak test.
import * as THREE from 'three';
import { G, box, cyl, prof, foot, plane, bin, xf, std, materials, finalize, cycleClip, opWorker, ikRig } from './models.js';

const TOP = 0.85, Z0 = 1.3, LANES = [Z0 - 0.5, Z0 + 0.5], YC = 0.045;
export const MODULE_T = 400, MODULE_P = 50;
const NJIG = 11, JPOS = 7, DJ = MODULE_T / 33;   // jig loop: 11 jigs, 7 work positions on the front rail, one index every 12.12 s (33 per cycle = 3 laps)
const JX = q => (q < JPOS ? 7.55 + 0.45 * q : 10.0 - 0.75 * (q - JPOS)), JZ = q => (q < JPOS ? Z0 : Z0 + 0.6);
// station coordinates shared by the geometry and the cycle
const S = { inEnd: 1.08, prof: [1.75, 1.05], noz: [1.9, 1.15], cam: [2.0, 1.05], scale: [1.35, 0.9], exit: [2.12, TOP], ng: [1.75, TOP], shut0: 2.8, shut1: 3.5, press: [4.0, 4.6], vis: 5.1, buf: 5.5,
  laser: [6.55, 1.2, Z0 + 0.95], bout: 6.25, bng: [5.75, Z0 + 1.3], cin: 7.28, cout: 10.6, cstop: 11.78, cf: 13.0, dstop1: 14.38, paste: 14.8, dstop2: 16.08, check: 16.6, dstop3: 18.38,
  ein: 19.4, estop1: 20.28, turn: 20.7, estop2: 21.68, jig: [22.55, 0.91, Z0 + 0.45], eout: 22.8, mark: 23.4, estop3: 23.68, gasket: 24.5, okng: 25.7, lift: 26.45 };
const RBASE = { A: [1.5, Z0 + 0.1], B: [6.0, Z0 + 0.55], E: [22.25, Z0 - 0.1] }, RH = 0.9;   // A's base sits 0.1 m towards lane 1, the arm's weaker side
const HOME = { A: li => [1.5, RH + 0.35, Z0 + 0.1 + (li ? 0.15 : -0.15)], B: [6.0, RH + 0.35, Z0 + 0.4], E: [22.25, RH + 0.35, Z0 + 0.05] };   // rest poses just above the base, offset to the side the robot works on (the wrist must not cross the base axis mid-path)

export function egrModuleLine() {
  const m = materials(), root = G('EGR_Module_Line');
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45), tankM = std('end_tank', 0xc9ccd0, 0.95, 0.3);
  const bead = std('weld_bead', 0x6f675d, 0.85, 0.5), arcM = std('weld_arc', 0xd8f0ff, 0.0, 0.3, { emissive: 0xa8dcff, emissiveIntensity: 4.0 });
  const curtain = std('weld_curtain', 0xc8461e, 0.0, 0.55, { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const laserM = std('laser_beam', 0xff3030, 0.0, 0.3, { emissive: 0xff2020, emissiveIntensity: 3.5 });
  const magenta = std('paste_tank', 0xc24a9c, 0.3, 0.5), glass = std('polycarbonate', 0xd3e4ee, 0.0, 0.06, { transparent: true, opacity: 0.22, depthWrite: false });
  const robots = {};

  // ---------------------------------------------------------------- generic pieces
  const table = (x, z, w, d, h, mat) => { box(root, mat || m.aluDark, w, 0.03, d, x, h - 0.015, z); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { prof(root, [x + sx * (w / 2 - 0.03), 0.06, z + sz * (d / 2 - 0.03)], [x + sx * (w / 2 - 0.03), h - 0.03, z + sz * (d / 2 - 0.03)], 0.04); foot(root, x + sx * (w / 2 - 0.03), z + sz * (d / 2 - 0.03)); } };
  const rollers = (x0, x1, z, w = 0.5) => { // roller section on legs, flow along +X, top at TOP
    const L = x1 - x0, c = (x0 + x1) / 2; for (const sz of [-1, 1]) box(root, m.alu, L, 0.1, 0.035, c, TOP - 0.06, z + sz * (w / 2 + 0.03));
    for (let k = 0, n = Math.round(L / 0.1); k < n; k++) cyl(root, m.steel, 0.022, w, x0 + (k + 0.5) * L / n, TOP - 0.025, z, 'z', 10);
    for (let k = 0, n = Math.max(1, Math.ceil(L / 1.2)); k <= n; k++) { const x = x0 + 0.08 + (L - 0.16) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (w / 2 + 0.03)], [x, TOP - 0.11, z + sz * (w / 2 + 0.03)], 0.04); foot(root, x, z + sz * (w / 2 + 0.03)); } } };
  const stop = (x, z) => box(root, m.yellow, 0.03, 0.06, 0.5, x, TOP + 0.03, z);
  const gantry = (x, z, w, h) => { for (const sz of [-1, 1]) prof(root, [x, 0.06, z + sz * w / 2], [x, h, z + sz * w / 2], 0.045, m.frameDark); box(root, m.frameDark, 0.07, 0.07, w + 0.07, x, h, z); };
  const camera = (x, y, z, name, fy = TOP + 0.04) => { box(root, m.black, 0.08, 0.12, 0.08, x, y + 0.06, z); cyl(root, m.light, 0.06, 0.01, x, y - 0.005, z, 'y', 20); const f = G(name, root); cyl(f, m.light, 0.11, 0.004, x, fy, z, 'y', 20); return f; };
  const monitor = (name, x, z, ry, y = 1.55) => { prof(root, [x, 0.06, z], [x, y - 0.1, z], 0.04); const w = G(name, root, x, y, z); w.rotation.y = ry; box(w, m.black, 0.42, 0.28, 0.04, 0, 0, 0); box(w, m.screen, 0.37, 0.23, 0.004, 0, 0, 0.022); return w; };
  const tower = (x, z, y0 = 2.0) => { cyl(root, m.black, 0.012, 0.25, x, y0, z, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.lampA], [2, m.lampR]]) cyl(root, mt, 0.03, 0.06, x, y0 + 0.16 + k * 0.065, z, 'y', 14); };
  const cabinet = (x, z, w = 0.8, d = 0.45, h = 1.9) => { box(root, m.sheet, w, h, d, x, h / 2, z); box(root, m.black, w - 0.1, 0.02, d + 0.01, x, h - 0.06, z); box(root, m.screen, 0.3, 0.2, 0.004, x, h - 0.5, z - d / 2 - 0.002); for (const sx of [-1, 1]) box(root, m.black, 0.02, 0.1, 0.02, x + sx * 0.12, 1.0, z - d / 2 - 0.012); };
  const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / 1.0)); for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; box(root, m.black, 0.05, 2.0, 0.05, x, 1.0, z); } plane(root, m.mesh, L, 1.85, (x0 + x1) / 2, 1.075, (z0 + z1) / 2, [0, a, 0], 0.05); box(root, m.black, L, 0.02, 0.02, (x0 + x1) / 2, 0.15, (z0 + z1) / 2, [0, a, 0]); box(root, m.black, L, 0.02, 0.02, (x0 + x1) / 2, 1.98, (z0 + z1) / 2, [0, a, 0]); };
  const curtainRun = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0); plane(root, curtain, L, 1.8, (x0 + x1) / 2, 1.05, (z0 + z1) / 2, [0, a, 0]); box(root, m.aluDark, L, 0.03, 0.03, (x0 + x1) / 2, 1.97, (z0 + z1) / 2, [0, a, 0]); for (const [x, z] of [[x0, z0], [x1, z1]]) { prof(root, [x, 0.06, z], [x, 2.0, z], 0.04, m.frameDark); foot(root, x, z); } };
  const totes = (x, z, n) => { for (let k = 0; k < n; k++) { const y = k * 0.3; box(root, m.yellow, 0.6, 0.28, 0.4, x, y + 0.14, z); box(root, m.black, 0.56, 0.02, 0.36, x, y + 0.29, z); } };
  const pusher = (name, x, z, y, dir = 'x') => { const p = G(name, root); if (dir === 'x') { box(p, m.aluDark, 0.02, 0.1, 0.3, x, y, z); cyl(p, m.steel, 0.01, 0.35, x - 0.18, y, z, 'x', 8); cyl(root, m.alu, 0.03, 0.3, x - 0.5, y, z, 'x', 16); } else { box(p, m.aluDark, 0.3, 0.1, 0.02, x, y, z); cyl(p, m.steel, 0.01, 0.35, x, y, z - 0.18, 'z', 8); cyl(root, m.alu, 0.03, 0.3, x, y, z - 0.5, 'z', 16); } return p; };
  const robot = (key, x, z, ry = 0) => { // FR5-class robot on a pedestal; joints renamed <key>_Robot_Joint_i, tool frame at the flange (+Z out)
    const name = key + '_Robot', fr = globalThis.FR5 ? globalThis.FR5.clone(true) : null;
    box(root, m.black, 0.36, RH - 0.02, 0.36, x, (RH - 0.02) / 2 + 0.02, z); box(root, m.yellow, 0.37, 0.04, 0.37, x, RH - 0.04, z); box(root, m.aluDark, 0.42, 0.02, 0.42, x, 0.01, z);
    if (!fr) return null;
    fr.name = name; fr.position.set(x, RH, z); fr.rotation.y = ry; root.add(fr);
    const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = name + '_' + j.name; });
    const tool = G(name + '_Tool', J[5], 0, 0, 0.101); robots[key] = { J, tool, fr }; return robots[key];
  };
  const gripper = (tool, name, ry = 0) => { const bx = new THREE.BoxGeometry(0.08, 0.1, 0.06); bx.translate(0, 0, 0.03); bin(tool, m.aluDark, bx); const br = new THREE.BoxGeometry(0.06, 0.13, 0.02); br.translate(0, 0, 0.07); bin(tool, m.yellow, br);
    for (const s of [-1, 1]) { const jw = new THREE.BoxGeometry(0.03, 0.012, 0.09); jw.translate(0, s * 0.052, 0.12); bin(tool, m.black, jw); }
    const gp = G(name, tool, 0, 0, 0.165); gp.rotation.x = -Math.PI / 2; const in_ = G(name + '_In', gp); in_.rotation.y = ry; return in_; };  // part hangs under the jaws
  const torch = tool => { cyl(tool, m.black, 0.02, 0.16, 0, 0, 0.08, 'z', 10); cyl(tool, m.orange, 0.012, 0.05, 0, 0, 0.18, 'z', 10); cyl(tool, m.steel, 0.002, 0.03, 0, 0, 0.22, 'z', 6); };
  // part looks (origin at the bottom centre, body centre at YC; long axis X): brazed core → paste → end tanks → laser seams → flanges → pipes → mark
  const lookCore = n => { box(n, brazed, 0.18, 0.07, 0.09, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, brazed, 0.004, 0.074, 0.094, x, YC, 0); };
  const lookPaste = n => { for (const sx of [-1, 1]) for (const dz of [-0.03, 0, 0.03]) box(n, m.paste, 0.004, 0.072, 0.012, sx * 0.093, YC, dz); };
  const lookTanks = n => { for (const sx of [-1, 1]) box(n, tankM, 0.05, 0.08, 0.1, sx * 0.115, YC, 0); };
  const lookSeam = n => { for (const sx of [-1, 1]) box(n, bead, 0.006, 0.084, 0.104, sx * 0.09, YC, 0); };
  const lookFlange = (n, sx) => { box(n, m.stainless, 0.012, 0.1, 0.15, sx * 0.146, YC, 0); box(n, bead, 0.008, 0.07, 0.08, sx * 0.136, YC, 0); };
  const lookPipes = n => { for (const sx of [-1, 1]) cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 8); box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055); };
  const lookMark = n => plane(n, m.display, 0.03, 0.02, 0.04, YC + 0.0355, 0.02, [-Math.PI / 2, 0, 0]);
  const tank = (n, x = 0, y = 0, z = 0) => box(n, tankM, 0.05, 0.08, 0.1, x, y, z);

  // ================================================================ A. core-assy loading & paste apply (x −1 … 2.7), two lanes, one handling robot between them
  box(root, m.sheet, 3.0, 0.08, 4.6, 1.2, 0.04, Z0);
  for (const [li, z] of LANES.entries()) {
    const sz = li ? 1 : -1, oz = Z0 + sz * 0.3, ozP = Z0 + sz * 0.5, ny = S.noz[1];                 // the lane's nozzle / camera row (±0.3) and profiler (±0.55) sit between the lane and the axis, inside the robot's reach
    totes(-0.75, z, 4);                                                                   // yellow material containers (two stacks of four)
    rollers(0.0, 1.1, z); stop(S.inEnd, z);
    gantry(0.55, z, 0.9, 1.75);
    for (const s2 of [-1, 1]) { const p = G('A_Center_' + li + (s2 < 0 ? '_L' : '_R'), root); box(p, m.yellow, 0.14, 0.05, 0.04, 0.55, TOP + 0.04, z + s2 * 0.28); cyl(root, m.alu, 0.015, 0.12, 0.55, TOP + 0.04, z + s2 * 0.36, 'z', 8); }
    box(root, m.black, 0.04, 0.04, 0.06, 0.55, TOP + 0.26, z); cyl(root, m.steel, 0.006, 0.4, 0.55, TOP + 0.46, z, 'y', 6);   // direction sensor
    camera(0.85, 1.55, z, 'A_FinCam_' + li); box(root, m.black, 0.06, 0.06, 0.1, 0.95, TOP + 0.15, z + sz * 0.3); box(root, m.red, 0.004, 0.02, 0.06, 0.92, TOP + 0.15, z + sz * 0.3); // fin vision camera, barcode reader
    box(root, m.aluDark, S.noz[0] + 0.35 - S.prof[0], 0.05, 0.05, (S.noz[0] + 0.35 + S.prof[0]) / 2, S.prof[1] + 0.55, ozP); box(root, m.aluDark, 0.05, 0.05, Math.abs(ozP - (oz + sz * 0.3)) + 0.1, S.noz[0] + 0.35, S.prof[1] + 0.55, (ozP + oz + sz * 0.3) / 2); box(root, m.black, 0.1, 0.08, 0.08, S.prof[0], S.prof[1] + 0.49, ozP); // laser profiler head on a bracket from the nozzle column
    { const pl = G('A_Profile_' + li, root); plane(pl, laserM, 0.1, 0.4, S.prof[0], S.prof[1] + 0.25, ozP, [0, Math.PI / 2, 0]); }
    { const [nx] = S.noz, cz = oz + sz * 0.3; prof(root, [nx + 0.35, 0.06, cz], [nx + 0.35, ny + 0.55, cz], 0.06, m.frameDark); box(root, m.aluDark, 0.4, 0.08, 0.08, nx + 0.17, ny + 0.52, cz); box(root, m.aluDark, 0.08, 0.08, 0.36, nx, ny + 0.52, (oz + cz) / 2);   // fixed dispensing nozzle on a column (the column stands on the lane axis, clear of the exit block)
      box(root, m.yellow, 0.12, 0.2, 0.12, nx, ny + 0.3, oz); cyl(root, m.black, 0.035, 0.12, nx, ny + 0.14, oz, 'y', 16); cyl(root, m.steel, 0.005, 0.08, nx, ny + 0.04, oz, 'y', 8); cyl(root, m.black, 0.012, 0.9, nx + 0.35, ny + 0.25, cz + sz * 0.4, 'z', 8); }
    camera(S.cam[0], S.cam[1] + 0.4, oz, 'A_NozCam_' + li, S.cam[1] + 0.1);                                   // nozzle height vision (flash at the part's height)
    table(S.scale[0], Z0 + sz * 0.6, 0.3, 0.3, S.scale[1] - 0.02); box(root, m.black, 0.26, 0.04, 0.26, S.scale[0], S.scale[1] - 0.02, Z0 + sz * 0.6); box(root, m.display, 0.12, 0.03, 0.004, S.scale[0], 0.96, Z0 + sz * 0.6 - sz * 0.13); // weight check scale
    rollers(S.ng[0] - 0.05, 2.7, Z0 + sz * 0.7, 0.36); box(root, m.ngLabel, 0.3, 0.1, 0.004, 2.3, TOP + 0.2, Z0 + sz * 0.93);   // NG conveyor
  }
  { const R = robot('A', ...RBASE.A); if (R) { const g = gripper(R.tool, 'A_Grip_Part'); lookCore(G('A_Grip_Core', g)); lookPaste(G('A_Grip_Paste', g)); } }
  rollers(2.1, 2.65, Z0, 0.5); stop(2.64, Z0); pusher('A_Exit_Pusher', 2.04, Z0, TOP + 0.06);  // exit block; the pusher shoves the core onto the shuttle
  cabinet(0.4, -1.2); cabinet(1.3, -1.2); monitor('A_HMI', 2.4, -0.9, 0.5); tower(2.7, -1.1);
  fence(-0.3, -0.9, 2.7, -0.9); fence(-0.3, 3.5, 2.7, 3.5); fence(-0.3, -0.9, -0.3, 3.5);
  opWorker(root, 'Op_Load', -0.2, Z0 - 1.5, 0);                                           // loading operator: totes → infeed conveyors

  // ================================================================ B. end tank assembly & scan laser welding (x 2.7 … 6.8)
  box(root, m.sheet, 4.0, 0.08, 4.6, 4.7, 0.04, Z0);
  { box(root, m.aluDark, 1.0, 0.12, 0.2, (S.shut0 + S.shut1) / 2, 0.7, Z0); for (const x of [S.shut0 - 0.1, S.shut1 + 0.1]) prof(root, [x, 0.06, Z0], [x, 0.64, Z0], 0.06, m.frameDark);   // core shuttle: linear axis, carriage with a jig that turns the core across the line
    const sh = G('B_Shuttle', root, S.shut0, 0.76, Z0), tn = G('B_Shuttle_Turn', sh); box(tn, m.alu, 0.3, 0.03, 0.3, 0, 0.015, 0); for (const sx of [-1, 1]) box(tn, clampM, 0.02, 0.07, 0.12, sx * 0.095, 0.065, 0); }
  for (const sz of [-1, 1]) { // tank feeders: magazine tower with a stack of tanks and a pick-and-place arm that lowers a tank onto the core end
    const fz = Z0 + sz * 1.2, fx = S.shut1; table(fx, fz, 0.5, 0.5, 0.9); for (let k = 0; k < 8; k++) tank(root, fx, 0.95 + k * 0.1, fz);
    for (const s2 of [-1, 1]) prof(root, [fx + s2 * 0.15, 0.9, fz], [fx + s2 * 0.15, 1.95, fz], 0.03);
    prof(root, [fx, 1.95, fz], [fx, 1.95, Z0 + sz * 0.1], 0.05, m.frameDark);
    const arm = G('B_TankArm' + (sz < 0 ? '_L' : '_R'), root, fx, 1.95, Z0 + sz * 0.6); box(arm, m.aluDark, 0.08, 0.08, 0.3, 0, 0, sz * 0.15); box(arm, m.alu, 0.04, 0.5, 0.04, 0, -0.25, 0); const t = G('B_TankArm' + (sz < 0 ? '_L' : '_R') + '_Tank', arm, 0, -0.55, 0); box(t, tankM, 0.1, 0.08, 0.05, 0, 0, 0); }
  for (const [k, px] of S.press.entries()) { // two tank presses: C-frame with a horizontal ram from the side, the core on a block
    table(px, Z0, 0.5, 0.5, 0.88); box(root, m.black, 0.2, 0.04, 0.26, px, 0.9, Z0);
    const sz = k ? 1 : -1; box(root, m.frameDark, 0.3, 1.3, 0.3, px, 0.65, Z0 + sz * 0.6); box(root, m.frameDark, 0.3, 0.2, 0.7, px, 1.2, Z0 + sz * 0.5);
    const ram = G('B_Press_' + k, root, px, 0.965, Z0 + sz * 0.45); cyl(ram, m.steel, 0.03, 0.3, 0, 0, 0, 'z', 12); box(ram, m.aluDark, 0.12, 0.12, 0.06, 0, 0, -sz * 0.17); }
  gantry(S.vis, Z0, 0.9, 1.7); camera(S.vis, 1.55, Z0, 'B_PressCam', 0.92); table(S.vis, Z0, 0.4, 0.4, 0.88);   // press vision check
  { for (const x of [S.shut1 - 0.15, S.buf + 0.25]) for (const sz of [-1, 1]) prof(root, [x, 0.06, Z0 + sz * 0.45], [x, 2.1, Z0 + sz * 0.45], 0.05, m.frameDark);   // transfer gantry: shuttle → presses → vision → buffer
    for (const sz of [-1, 1]) box(root, m.yellow, S.buf - S.shut1 + 0.6, 0.08, 0.08, (S.shut1 + S.buf) / 2 + 0.05, 2.1, Z0 + sz * 0.45);
    const gx = G('B_Transfer_X', root, S.shut1, 0, Z0), gy = G('B_Transfer_Y', gx); box(gx, m.aluDark, 0.2, 0.16, 1.0, 0, 2.1, 0); box(gy, m.alu, 0.05, 0.6, 0.05, 0, 1.9, 0); box(gy, m.aluDark, 0.14, 0.03, 0.2, 0, 1.6, 0); for (const sz of [-1, 1]) box(gy, m.black, 0.12, 0.09, 0.012, 0, 1.55, sz * 0.1);
    const tp = G('B_Transfer_Part', gy, 0, 1.5, 0); tp.rotation.y = Math.PI / 2; lookCore(tp); lookPaste(tp); lookTanks(tp);
    table(S.buf, Z0, 0.35, 0.35, 0.88); box(root, clampM, 0.12, 0.012, 0.24, S.buf, 0.886, Z0); }
  { const R = robot('B', ...RBASE.B); if (R) { const g = gripper(R.tool, 'B_Grip_Part', Math.PI / 2); lookCore(G('B_Grip_Core', g)); lookPaste(G('B_Grip_Paste', g)); lookTanks(G('B_Grip_Tanks', g)); lookSeam(G('B_Grip_Seam', g)); }
    const [hx, , hz] = S.laser; prof(root, [hx + 0.4, 0.06, hz], [hx + 0.4, 2.0, hz], 0.06, m.frameDark); box(root, m.aluDark, 0.5, 0.08, 0.08, hx + 0.17, 1.95, hz);   // scan laser head
    box(root, m.black, 0.22, 0.26, 0.22, hx, 1.75, hz); cyl(root, m.steel, 0.05, 0.08, hx, 1.58, hz, 'y', 16); const bm = G('B_Laser_Beam', root); cyl(bm, laserM, 0.004, 0.36, hx, 1.4, hz, 'y', 6);
    for (const [x0, z0, x1, z1] of [[6.2, Z0 + 0.55, 6.9, Z0 + 0.55], [6.9, Z0 + 0.55, 6.9, Z0 + 1.35]]) plane(root, glass, Math.hypot(x1 - x0, z1 - z0), 1.9, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, [0, Math.atan2(-(z1 - z0), x1 - x0), 0]);
    rollers(6.15, 6.75, Z0, 0.5); stop(6.73, Z0); rollers(5.5, 6.2, S.bng[1], 0.4); box(root, m.ngLabel, 0.3, 0.1, 0.004, 5.85, TOP + 0.2, S.bng[1] + 0.25); }   // outfeed + NG conveyor
  cabinet(3.2, -1.2); cabinet(4.9, -1.2); monitor('B_HMI', 6.3, -0.9, 0.5); tower(6.6, -1.1);
  fence(2.7, -0.9, 6.8, -0.9); fence(2.7, 3.5, 6.8, 3.5);

  // ================================================================ C. tack welding (x 6.8 … 11.8): jig loop, flange feeders, four MIG robots, manual MIG position
  box(root, m.sheet, 5.0, 0.08, 5.2, 9.3, 0.04, Z0);
  rollers(6.7, 7.3, Z0, 0.5); stop(S.cin, Z0); pusher('C_Load_Pusher', 7.24, Z0 - 0.35, TOP + 0.06, 'z');   // infeed pitch conveyor; the pusher puts the core into the jig at position 0
  { for (const z of [Z0, Z0 + 0.6]) { box(root, m.aluDark, 3.3, 0.08, 0.1, 8.9, TOP - 0.1, z - 0.19); box(root, m.aluDark, 3.3, 0.08, 0.1, 8.9, TOP - 0.1, z + 0.19); }
    for (const x of [7.25, 10.55]) box(root, m.aluDark, 0.2, 0.08, 1.0, x, TOP - 0.1, Z0 + 0.3);
    for (const x of [7.4, 8.3, 9.2, 10.1, 10.4]) for (const sz of [-1, 1]) { prof(root, [x, 0.06, Z0 + 0.3 + sz * 0.5], [x, TOP - 0.15, Z0 + 0.3 + sz * 0.5], 0.04); foot(root, x, Z0 + 0.3 + sz * 0.5); }
    for (let j = 0; j < NJIG; j++) { const jg = G('C_Jig_' + j, root, JX(j), 0, JZ(j)); box(jg, m.alu, 0.3, 0.03, 0.3, 0, TOP, 0); for (const sz of [-1, 1]) box(jg, clampM, 0.12, 0.08, 0.02, 0, TOP + 0.055, sz * 0.095); box(jg, m.yellow, 0.02, 0.012, 0.3, -0.14, TOP + 0.02, 0); } }
  for (const [k, fx, sz] of [[0, JX(1), -1], [1, JX(2), 1]]) { // flange feeders: vibratory bowl on a stand + a pick arm that brings a flange to the core end
    const fz = Z0 + sz * 1.0; cyl(root, m.sheet, 0.3, 0.5, fx, 0.25, fz, 'y', 20); cyl(root, m.stainless, 0.32, 0.18, fx, 0.6, fz, 'y', 24); for (let r = 0.1; r < 0.3; r += 0.07) cyl(root, m.stainless, r, 0.17, fx, 0.6 + r / 3, fz, 'y', 20);
    box(root, m.aluDark, 0.08, 0.2, 0.9, fx, 1.25, Z0 + sz * 0.55); const pa = G('C_FlangeArm_' + k, root, fx, 1.35, fz - sz * 0.3); box(pa, m.alu, 0.04, 0.5, 0.04, 0, -0.25, 0); const f = G('C_FlangeArm_' + k + '_Flange', pa, 0, -0.52, 0); box(f, m.stainless, 0.15, 0.1, 0.012, 0, 0, 0); }
  { const MIG = [[JX(3), Z0 - 1.1, 0], [JX(4), Z0 - 1.1, 0], [JX(3), Z0 + 1.7, Math.PI], [JX(4), Z0 + 1.7, Math.PI]];   // four MIG robots with power sources and wire drums
    MIG.forEach(([x, z, ry], i) => { const R = robot('C' + i, x, z, ry); if (R) { torch(R.tool); const ar = G('C' + i + '_Arc', R.tool); bin(ar, arcM, xf(new THREE.SphereGeometry(0.016, 10, 8), 0, 0, 0.235)); }
      const bz = z + (z < Z0 ? -0.9 : 0.9); box(root, m.red, 0.5, 0.9, 0.4, x, 0.45, bz); box(root, m.black, 0.46, 0.08, 0.36, x, 0.94, bz); box(root, m.display, 0.12, 0.05, 0.004, x, 0.7, bz + (z < Z0 ? -0.202 : 0.202));
      cyl(root, m.lampG, 0.16, 0.35, x + 0.45, 0.175, bz, 'y', 20); cyl(root, m.black, 0.17, 0.02, x + 0.45, 0.36, bz, 'y', 20); cyl(root, m.black, 0.01, 1.2, x + 0.2, 1.0, bz + (z < Z0 ? 0.5 : -0.5), 'z', 6); });
    for (const [x0, z0, x1, z1] of [[8.5, Z0 - 1.6, 10.2, Z0 - 1.6], [8.5, Z0 + 2.2, 10.2, Z0 + 2.2]]) curtainRun(x0, z0, x1, z1);
    cyl(root, m.sheet, 0.13, 1.4, 9.1, 2.5, Z0 + 0.3, 'y', 20); box(root, m.sheet, 1.4, 0.08, 1.2, 9.1, 2.0, Z0 + 0.3);                  // fume hood over the loop
    // manual MIG position (jig position 5, −Z side): torch on a balancer, wire feeder, curtains, operator
    const mx = JX(5); const mt = G('C_Manual_Torch', root, mx - 0.1, 1.5, Z0 - 0.7); cyl(mt, m.black, 0.015, 0.25, 0, 0, 0, 'y', 8); cyl(mt, m.orange, 0.01, 0.05, 0, -0.14, 0, 'y', 8); cyl(root, m.black, 0.008, 0.6, mx - 0.1, 1.9, Z0 - 0.7, 'y', 6);
    box(root, m.red, 0.4, 0.7, 0.35, mx + 0.5, 0.35, Z0 - 1.5); curtainRun(mx - 0.5, Z0 - 1.6, mx + 0.6, Z0 - 1.6);
    opWorker(root, 'Op_Mig', mx, Z0 - 0.75, 0); const ma = G('Op_Mig_Arc', root); bin(ma, arcM, xf(new THREE.SphereGeometry(0.014, 10, 8), mx, TOP + 0.09, Z0 - 0.12)); }
  pusher('C_Unload_Pusher', JX(6), Z0 + 0.38, TOP + 0.06, 'z'); rollers(S.cout, 11.8, Z0, 0.5); stop(S.cstop, Z0);   // outfeed pitch conveyor (the pusher pulls the part off the jig at position 6)
  cabinet(7.2, -1.3); cabinet(8.1, -1.3); monitor('C_HMI', 11.5, -0.7, 0.5); tower(11.7, -1.1);
  fence(6.8, -1.9, 10.4, -1.9); fence(6.8, 3.9, 11.8, 3.9); fence(11.8, -1.9, 11.8, 3.9);

  // ================================================================ D. C/F check, external paste, manual check, unloading (x 11.8 … 18.5)
  box(root, m.sheet, 6.6, 0.08, 4.2, 15.1, 0.04, Z0);
  rollers(11.8, 12.6, Z0, 0.5); stop(12.58, Z0); pusher('D_CF_Pusher', 12.52, Z0, TOP + 0.06);
  { table(S.cf, Z0, 0.7, 0.55, 0.88); box(root, m.aluDark, 0.46, 0.03, 0.36, S.cf, 0.895, Z0); for (const s of [-1, 1]) { box(root, m.sheet, 0.02, 0.25, 0.36, S.cf + s * 0.23, 1.02, Z0); }   // 2nd C/F check: chamber with a lifting lid, gauge, OK lamp
    box(root, clampM, 0.12, 0.02, 0.24, S.cf, 0.92, Z0); const ld = G('D_CF_Lid', root); box(ld, m.yellow, 0.5, 0.03, 0.4, S.cf, 1.3, Z0); for (const s of [-1, 1]) { box(ld, m.sheet, 0.46, 0.25, 0.02, S.cf, 1.16, Z0 + s * 0.18); cyl(root, m.steel, 0.012, 0.6, S.cf + s * 0.27, 1.2, Z0, 'y', 8); }
    box(root, m.sheet, 0.3, 0.32, 0.12, S.cf + 0.3, 1.35, Z0 + 0.35); cyl(root, m.sheet, 0.06, 0.012, S.cf + 0.3, 1.38, Z0 + 0.412, 'z', 20); const ok = G('D_CF_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.cf - 0.35, 1.35, Z0 + 0.3, 'y', 14); prof(root, [S.cf - 0.35, 0.9, Z0 + 0.3], [S.cf - 0.35, 1.3, Z0 + 0.3], 0.03, m.frameDark); }
  rollers(13.4, 14.4, Z0, 0.5); stop(S.dstop1, Z0); pusher('D_Paste_Pusher', 14.32, Z0, TOP + 0.06);
  { for (const x of [S.paste - 0.5, S.paste + 0.5]) for (const sz of [-1, 1]) prof(root, [x, 0.06, Z0 + sz * 0.45], [x, 1.9, Z0 + sz * 0.45], 0.05, m.frameDark); for (const sz of [-1, 1]) box(root, m.yellow, 1.2, 0.08, 0.08, S.paste, 1.9, Z0 + sz * 0.45);   // external paste dispenser: XYZ gantry with a needle
    const gx = G('D_Disp_X', root, S.paste, 0, Z0), gz = G('D_Disp_Z', gx), gy = G('D_Disp_Y', gz); box(gx, m.aluDark, 0.16, 0.14, 1.0, 0, 1.9, 0); box(gz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.9, 0); box(gy, m.alu, 0.04, 0.6, 0.04, 0, 1.55, 0); cyl(gy, m.black, 0.03, 0.1, 0, 1.22, 0, 'y', 12); cyl(gy, m.steel, 0.004, 0.06, 0, 1.14, 0, 'y', 6);
    table(S.paste, Z0, 0.4, 0.4, 0.88); box(root, clampM, 0.12, 0.012, 0.24, S.paste, 0.886, Z0);
    box(root, m.aluDark, 1.4, 0.03, 0.4, S.paste, 0.9, Z0 + 1.5); for (let k = 0; k < 4; k++) cyl(root, magenta, 0.12, 0.5, S.paste - 0.5 + k * 0.34, 1.16, Z0 + 1.5, 'y', 20); for (const sx of [-1, 1]) prof(root, [S.paste + sx * 0.65, 0.06, Z0 + 1.5], [S.paste + sx * 0.65, 0.88, Z0 + 1.5], 0.04); }
  rollers(15.3, 16.1, Z0, 0.5); stop(S.dstop2, Z0);
  { table(S.check, Z0, 0.9, 0.6, 0.9); for (const sz of [-1, 1]) prof(root, [S.check, 0.9, Z0 + sz * 0.3], [S.check, 1.6, Z0 + sz * 0.3], 0.03); box(root, m.aluDark, 0.08, 0.04, 0.66, S.check, 1.62, Z0); box(root, m.light, 0.06, 0.012, 0.5, S.check, 1.595, Z0);   // manual check table
    box(root, m.red, 0.3, 0.1, 0.25, S.check + 0.35, 0.95, Z0 + 0.6); box(root, m.ngLabel, 0.2, 0.08, 0.004, S.check + 0.35, 1.04, Z0 + 0.48); monitor('D_Monitor', S.check - 0.6, Z0 - 0.75, -0.7); }
  rollers(17.1, 18.4, Z0, 0.5); stop(S.dstop3, Z0);                                          // unload conveyor
  cabinet(12.3, -1.0); cabinet(14.0, -1.0); tower(18.2, -0.8);
  fence(11.8, 3.9, 18.5, 3.9);

  // ================================================================ E. leak test (x 19.3 … 26.9)
  box(root, m.sheet, 7.6, 0.08, 3.8, 23.1, 0.04, Z0 - 0.2);
  rollers(19.3, 20.3, Z0, 0.5); stop(S.estop1, Z0); pusher('E_Turn_Pusher', 20.22, Z0, TOP + 0.06);
  { const tt = G('E_Turntable', root, S.turn, 0, Z0); cyl(root, m.frameDark, 0.2, 0.8, S.turn, 0.4, Z0, 'y', 16); cyl(tt, m.alu, 0.25, 0.04, 0, 0.84, 0, 'y', 24); box(tt, clampM, 0.12, 0.012, 0.24, 0, 0.866, 0);   // barcode reader + turntable
    box(root, m.black, 0.06, 0.06, 0.1, S.turn, TOP + 0.3, Z0 - 0.45); box(root, m.red, 0.004, 0.02, 0.06, S.turn + 0.03, TOP + 0.3, Z0 - 0.45); prof(root, [S.turn, 0.06, Z0 - 0.5], [S.turn, TOP + 0.35, Z0 - 0.5], 0.03); pusher('E_Vis_Pusher', S.turn - 0.3, Z0, TOP + 0.06); }
  rollers(21.0, 21.7, Z0, 0.5); stop(S.estop2, Z0); gantry(21.3, Z0, 0.9, 1.7); camera(21.3, 1.55, Z0, 'E_VisCam');  // visual inspection
  { const [jx, jy, jz] = S.jig; table(jx, jz, 0.7, 0.6, jy - 0.02); box(root, clampM, 0.14, 0.02, 0.26, jx, jy - 0.01, jz); for (const s of [-1, 1]) cyl(root, m.steel, 0.012, 0.6, jx + s * 0.3, 1.2, jz, 'y', 8);   // leak test jig with a lifting hood
    const hood = G('E_Hood', root); box(hood, glass, 0.5, 0.3, 0.4, jx, 1.15, jz); box(hood, m.yellow, 0.52, 0.03, 0.42, jx, 1.315, jz);
    box(root, m.sheet, 0.5, 1.4, 0.3, jx + 0.65, 0.7, jz + 0.45); box(root, m.screen, 0.3, 0.2, 0.004, jx + 0.65, 1.1, jz + 0.298); for (const k of [0, 1]) cyl(root, m.sheet, 0.05, 0.012, jx + 0.5 + k * 0.3, 1.3, jz + 0.302, 'z', 16);
    const R = robot('E', ...RBASE.E); if (R) { const g = gripper(R.tool, 'E_Grip_Part', Math.PI / 2); lookCore(G('E_Grip_Core', g)); lookPaste(G('E_Grip_Paste', g)); lookTanks(G('E_Grip_Tanks', g)); lookSeam(G('E_Grip_Seam', g)); for (const sx of [-1, 1]) lookFlange(G('E_Grip_Flange' + (sx < 0 ? 'L' : 'R'), g), sx); lookPipes(G('E_Grip_Pipes', g)); }
    const ok = G('E_Leak_OK', root); cyl(ok, m.lampG, 0.032, 0.06, jx - 0.4, 1.35, jz + 0.3, 'y', 14); const ng = G('E_Leak_NG', root); cyl(ng, m.lampR, 0.032, 0.06, jx - 0.4, 1.28, jz + 0.3, 'y', 14); prof(root, [jx - 0.4, 0.9, jz + 0.3], [jx - 0.4, 1.25, jz + 0.3], 0.03, m.frameDark); }
  rollers(22.75, 23.7, Z0, 0.5); stop(S.estop3, Z0);
  { gantry(S.mark, Z0, 0.9, 1.7); box(root, m.black, 0.18, 0.22, 0.18, S.mark, 1.5, Z0); cyl(root, m.steel, 0.04, 0.05, S.mark, 1.37, Z0, 'y', 12); const bm = G('E_Mark_Beam', root); cyl(bm, laserM, 0.003, 0.4, S.mark, 1.15, Z0, 'y', 6);   // laser marking
    for (const sz of [-1, 1]) plane(root, glass, 0.6, 0.7, S.mark, TOP + 0.4, Z0 + sz * 0.4, [0, 0, 0]); pusher('E_Gasket_Pusher', S.estop3 - 0.06, Z0, TOP + 0.06); }
  { table(S.gasket, Z0, 0.8, 0.6, 0.9); box(root, clampM, 0.14, 0.012, 0.26, S.gasket, 0.906, Z0); box(root, m.black, 0.25, 0.04, 0.2, S.gasket, 0.92, Z0 + 0.35); for (let k = 0; k < 3; k++) cyl(root, m.rubber, 0.04, 0.004, S.gasket - 0.08 + k * 0.08, 0.942, Z0 + 0.35, 'y', 16);   // gasket & bolt station
    prof(root, [S.gasket + 0.4, 0.06, Z0 + 0.4], [S.gasket + 0.4, 2.0, Z0 + 0.4], 0.05, m.frameDark); box(root, m.aluDark, 0.6, 0.06, 0.06, S.gasket + 0.1, 2.0, Z0 + 0.4); const nr = G('E_Nutrunner', root, S.gasket, 1.5, Z0); cyl(nr, m.black, 0.02, 0.4, 0, 0, 0, 'y', 10); cyl(nr, m.yellow, 0.03, 0.08, 0, 0.1, 0, 'y', 10); cyl(nr, m.steel, 0.006, 0.08, 0, -0.24, 0, 'y', 6); cyl(root, m.black, 0.008, 0.5, S.gasket, 1.95, Z0 + 0.2, 'y', 6);
    cyl(root, m.sheet, 0.14, 0.3, S.gasket - 0.4, 1.05, Z0 - 0.4, 'y', 16); prof(root, [S.gasket - 0.4, 0.06, Z0 - 0.4], [S.gasket - 0.4, 0.9, Z0 - 0.4], 0.04); pusher('E_Out_Pusher', S.gasket - 0.3, Z0, TOP + 0.06); }
  rollers(25.0, 26.2, Z0, 0.5);
  { gantry(S.okng, Z0, 0.9, 1.6); const ok = G('E_OKNG_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.okng, 1.65, Z0 - 0.4, 'y', 14); const ng = G('E_OKNG_NG', root); cyl(ng, m.lampR, 0.032, 0.06, S.okng, 1.65, Z0 + 0.4, 'y', 14);   // OK / NG jig: a pusher diverts NG parts to the storage conveyor (+Z)
    pusher('E_NG_Pusher', S.okng, Z0 - 0.3, TOP + 0.06, 'z');
    rollers(25.5, 25.9, Z0 + 0.9, 0.4); box(root, m.ngLabel, 0.3, 0.1, 0.004, S.okng, TOP + 0.2, Z0 + 1.15); }
  { const lf = G('E_Lift', root); box(lf, m.alu, 0.5, 0.1, 0.56, S.lift, TOP - 0.06, Z0); for (let k = 0; k < 5; k++) cyl(lf, m.steel, 0.022, 0.5, S.lift - 0.2 + k * 0.1, TOP - 0.025, Z0, 'z', 10);   // exit lift conveyor + output tote
    for (const sz of [-1, 1]) prof(root, [S.lift + 0.15, 0.06, Z0 + sz * 0.3], [S.lift + 0.15, 1.3, Z0 + sz * 0.3], 0.05, m.frameDark); box(root, m.yellow, 0.1, 0.06, 0.7, S.lift + 0.15, 1.3, Z0); totes(S.lift, Z0 - 1.0, 1); }
  cabinet(20.0, -0.6); cabinet(23.0, -0.6); monitor('E_HMI', 21.0, Z0 - 1.1, 0.5); tower(26.0, Z0 - 1.0);
  fence(19.3, 3.1, 26.9, 3.1); fence(26.9, -0.7, 26.9, 3.1);
  const ol = opWorker(root, 'Op_Leak', (S.dstop3 + S.ein) / 2, Z0 - 0.75, 0); { const hp = G('Op_Leak_Part', ol._Arm_R, -0.06, -0.78, 0.05); hp.rotation.y = Math.PI / 2; lookCore(hp); lookTanks(hp); for (const sx of [-1, 1]) lookFlange(G('Op_Leak_Part_F' + (sx < 0 ? 'L' : 'R'), hp), sx); lookPipes(hp); }
  const oo = opWorker(root, 'Op_Out', S.lift - 0.1, Z0 - 0.75, 0); { const hp = G('Op_Out_Part', oo._Arm_R, -0.06, -0.78, 0.05); hp.rotation.y = Math.PI / 2; lookCore(hp); lookTanks(hp); for (const sx of [-1, 1]) lookFlange(G('Op_Out_Part_F' + (sx < 0 ? 'L' : 'R'), hp), sx); lookPipes(hp); lookMark(hp); }
  opWorker(root, 'Op_Check', S.check, Z0 - 0.75, 0);

  // ================================================================ parts in flight: X > Y > Z > Part (ry: turned across the line from the shuttle on) > looks
  const N = MODULE_T / MODULE_P;
  for (let i = 0; i < N; i++) {
    const PN = 'Part_' + (i + 1), x = G(PN + '_X', root, 0, TOP, Z0), y = G(PN + '_Y', x), z = G(PN + '_Z', y), p = G(PN, z), lk = G(PN + '_Look', p);
    lookCore(G(PN + '_Core', lk)); lookPaste(G(PN + '_Paste', lk)); lookTanks(G(PN + '_Tanks', lk)); lookSeam(G(PN + '_Seam', lk)); for (const sx of [-1, 1]) lookFlange(G(PN + '_Flange' + (sx < 0 ? 'L' : 'R'), lk), sx); lookPipes(G(PN + '_Pipes', lk)); lookMark(G(PN + '_Mark', lk));
  }
  return animate(finalize(root), robots);
}

// ---------------------------------------------------------------- the cycle: every part's path through the stations, the robots' IK paths and every
// machine / operator that touches it, as keys relative to the part's start s = j · MODULE_P (cell times below are offsets from s)
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
  const AXN = ['ry', 'rz', 'rz', 'rz', 'ry', 'rz'], TIPL = V(0, 0, 0.101 + 0.165);
  const rig = key => robots[key] ? ikRig(root, robots[key].J, TIPL) : null;
  const playRobot = (key, rp, t0) => { if (!robots[key]) return; robots[key].J.forEach((j, q) => add(j.name, AXN[q], [[t0 - 0.01, 0], ...rp.wp.map(([t, v]) => [t0 + t, v[q] - rp.rest[q]]), [t0 + rp.T + 0.01, 0]])); };
  // robot paths, traced once (joint waypoints relative to the start); the part rides the gripper between 'grip' and 'release'
  const rigA = rig('A'), rigB = rig('B'), rigE = rig('E');
  const pathA = (li, ng) => { const sz = li ? 1 : -1, lz = LANES[li], oz = Z0 + sz * 0.3, ozP = Z0 + sz * 0.5, TY = S.noz[1] - 0.002 - YC, H = 0.12;
    const p = [[HOME.A(li), 0], [[1.45, RH + 0.4, Z0 + 0.1 + sz * 0.5], 0.8], [[S.inEnd - 0.04, TOP + YC + H, lz], 1.2], [[S.inEnd - 0.04, TOP + YC, lz], 0.6], [[S.inEnd - 0.04, TOP + YC, lz], 0.3, 'grip'], [[S.inEnd - 0.04, TOP + YC + H, lz], 0.5],
      [[S.prof[0], S.prof[1] + 0.12, ozP], 1.4], [[S.prof[0] - 0.08, S.prof[1], ozP], 1.0, 'prof0'], [[S.prof[0] + 0.08, S.prof[1], ozP], 1.2, 'prof1'], [[S.prof[0] + 0.08, S.prof[1] + 0.12, ozP], 0.6]];
    [-0.093, 0.093].forEach((lx, i) => { const x = S.noz[0] - lx; if (!i) p.push([[x, TY + 0.1, oz + 0.04], 0.8]); p.push([[x, TY - 0.03, oz + 0.04], i ? 0.5 : 0.8], [[x, TY, oz + 0.04], 0.25], [[x, TY, oz - 0.04], 1.2, 'line' + i], [[x, TY - 0.03, oz - 0.04], 0.2]); });
    p.push([[S.cam[0], S.cam[1], oz], 1.0], [[S.cam[0], S.cam[1], oz], 1.0, 'cam'], [[S.scale[0], S.scale[1] + YC + H, Z0 + sz * 0.6], 1.6], [[S.scale[0], S.scale[1] + YC + 0.003, Z0 + sz * 0.6], 0.5], [[S.scale[0], S.scale[1] + YC + 0.003, Z0 + sz * 0.6], 0.3, 'weigh0'],
      [[S.scale[0], S.scale[1] + YC + H, Z0 + sz * 0.6], 0.4], [[S.scale[0], S.scale[1] + YC + H, Z0 + sz * 0.6], 1.6], [[S.scale[0], S.scale[1] + YC + 0.003, Z0 + sz * 0.6], 0.5], [[S.scale[0], S.scale[1] + YC + 0.003, Z0 + sz * 0.6], 0.3, 'weigh1'], [[S.scale[0], S.scale[1] + YC + H, Z0 + sz * 0.6], 0.5]);
    if (!ng) p.push([[S.exit[0], TOP + YC + H, Z0], 1.6], [[S.exit[0], TOP + YC + 0.003, Z0], 0.5], [[S.exit[0], TOP + YC + 0.003, Z0], 0.3, 'release'], [[S.exit[0], TOP + YC + H, Z0], 0.4]);
    else p.push([[S.ng[0], TOP + YC + H, Z0 + sz * 0.7], 1.6], [[S.ng[0], TOP + YC + 0.003, Z0 + sz * 0.7], 0.5], [[S.ng[0], TOP + YC + 0.003, Z0 + sz * 0.7], 0.3, 'release'], [[S.ng[0], TOP + YC + H, Z0 + sz * 0.7], 0.4]);
    p.push([[1.45, RH + 0.4, Z0 + 0.1 + sz * 0.5], 0.8], [HOME.A(li), 0.6]); return rigA && rigA.trace(p, 'A robot lane ' + li + (ng ? ' NG' : '')); };
  const RA = rigA ? [[pathA(0, false), pathA(0, true)], [pathA(1, false), pathA(1, true)]] : null;
  const pathB = ng => { const H = 0.12, [hx, hy, hz] = S.laser;
    const p = [[HOME.B, 0], [[S.buf, 0.9 + YC + H, Z0], 1.6], [[S.buf, 0.9 + YC, Z0], 0.6], [[S.buf, 0.9 + YC, Z0], 0.3, 'grip'], [[S.buf, 0.9 + YC + H, Z0], 0.5],
      [[5.45, 1.35, Z0 + 0.65], 1.0], [[5.75, 1.35, Z0 + 1.2], 1.0], [[hx, hy, hz], 1.2], [[hx - 0.03, hy, hz], 0.3, 'laser0'], [[hx - 0.03, hy, hz - 0.05], 1.0], [[hx + 0.03, hy, hz - 0.05], 0.6], [[hx + 0.03, hy, hz + 0.05], 1.0], [[hx - 0.03, hy, hz + 0.05], 0.6], [[hx - 0.03, hy, hz], 0.8, 'laser1']];
    if (!ng) p.push([[S.bout, TOP + YC + H, Z0], 1.6], [[S.bout, TOP + YC + 0.003, Z0], 0.5], [[S.bout, TOP + YC + 0.003, Z0], 0.3, 'release'], [[S.bout, TOP + YC + H, Z0], 0.4]);
    else p.push([[S.bng[0], TOP + YC + H, S.bng[1]], 1.6], [[S.bng[0], TOP + YC + 0.003, S.bng[1]], 0.5], [[S.bng[0], TOP + YC + 0.003, S.bng[1]], 0.3, 'release'], [[S.bng[0], TOP + YC + H, S.bng[1]], 0.4]);
    p.push([HOME.B, 1.2]); return rigB && rigB.trace(p, 'B robot' + (ng ? ' NG' : '')); };
  const RB = rigB ? pathB(false) : null;
  const pathE = () => { const H = 0.12, [jx, jy, jz] = S.jig;
    const p = [[HOME.E, 0], [[S.estop2 - 0.04, TOP + YC + H, Z0], 1.6], [[S.estop2 - 0.04, TOP + YC, Z0], 0.6], [[S.estop2 - 0.04, TOP + YC, Z0], 0.3, 'grip'], [[S.estop2 - 0.04, TOP + YC + H, Z0], 0.5],
      [[jx, jy + YC + H, jz], 1.8], [[jx, jy + YC + 0.003, jz], 0.6], [[jx, jy + YC + 0.003, jz], 0.3, 'put'], [[jx, jy + YC + H, jz], 0.5], [HOME.E, 1.2], [HOME.E, 12.0, 'wait'],
      [[jx, jy + YC + H, jz], 1.4], [[jx, jy + YC + 0.003, jz], 0.6], [[jx, jy + YC + 0.003, jz], 0.3, 'take'], [[jx, jy + YC + H, jz], 0.5], [[S.eout + 0.05, TOP + YC + H, Z0], 1.8], [[S.eout + 0.05, TOP + YC + 0.003, Z0], 0.5], [[S.eout + 0.05, TOP + YC + 0.003, Z0], 0.3, 'release'], [[S.eout + 0.05, TOP + YC + H, Z0], 0.4],
      [HOME.E, 1.2]]; return rigE && rigE.trace(p, 'E robot'); };
  const RE = rigE ? pathE() : null;

  // jig loop: index n at I(n) = n · DJ, the move takes 1.5 s; jig j sits at position (j + n) mod 11 after index n
  const I = n => n * DJ, JI = t => Math.ceil(t / DJ);
  for (let j = 0; j < NJIG; j++) { const xs = [], zs = [];
    for (let n = 0; n <= 33; n++) { const q0 = (j + n) % NJIG, q1 = (j + n + 1) % NJIG; xs.push([I(n), JX(q0) - JX(j)], [I(n) + 1.5, JX(q1) - JX(j)]); zs.push([I(n), JZ(q0) - JZ(j)], [I(n) + 1.5, JZ(q1) - JZ(j)]); }
    add('C_Jig_' + j, 'x', xs); add('C_Jig_' + j, 'z', zs); }

  const PRT = {};
  for (let jj = -2; jj < N + 2; jj++) {
    const k = ((jj % N) + N) % N, PN = 'Part_' + (k + 1), s = jj * P, li = k % 2, lz = LANES[li], sz = li ? 1 : -1, dNG = k === 5, lNG = k === 2;
    const PK = []; const at = (t, pos) => PK.push([s + t, pos]);   // part position keys (absolute line coords, part bottom centre)
    const VIS = [], show = (t, v) => VIS.push([s + t, v]), RY = [], ry = (t, v) => RY.push([s + t, v]);
    const finish = () => { PK.sort((a, b) => a[0] - b[0]); for (const [cc, q] of [['x', 0], ['y', 1], ['z', 2]]) add(PN + '_' + cc.toUpperCase(), cc, PK.map(([t, p]) => [t, p[q] - [0, TOP, Z0][q]])); add(PN, 'vis', VIS); add(PN, 'ry', RY); };
    // ---- A: the operator sets the core on the lane's infeed; it conveys to the stop; centring, direction, fin vision, barcode; robot cycle
    reach('Op_Load', s - 1.5, s + 1.5); turn('Op_Load', [[s - 3, 0], [s - 2.2, li ? 0.9 : 0.35], [s + 1.8, li ? 0.9 : 0.35], [s + 2.6, 0]]);
    show(0, true); ry(0, 0); at(0, [0.1, TOP, lz]); at(5, [S.inEnd - 0.04, TOP, lz]);
    for (const sd of ['_L', '_R']) add('A_Center_' + li + sd, 'z', [[s + 5.5, 0], [s + 6.2, sd === '_L' ? 0.07 : -0.07], [s + 7.2, sd === '_L' ? 0.07 : -0.07], [s + 7.8, 0]]);
    flash('A_FinCam_' + li, s + 8.2, s + 8.6);
    const ra = s + 9.5, rA = RA ? RA[li][dNG ? 1 : 0] : null; let tA;
    if (rA) { playRobot('A', rA, ra); const e = rA.ev;
      show(ra + e.grip - s, false); flash('A_Grip_Part', ra + e.grip, ra + e.release); flash('A_Profile_' + li, ra + e.prof0, ra + e.prof1); flash('A_Grip_Paste', ra + e.line1, ra + e.release); flash('A_NozCam_' + li, ra + e.cam - 0.6, ra + e.cam - 0.3);
      add(PN + '_Paste', 'vis', [[s, false], [ra + e.release, true]]);
      if (dNG) { at(ra + e.release - s, [S.ng[0], TOP, Z0 + sz * 0.7]); show(ra + e.release - s, true); at(ra + e.release - s + 8, [2.6, TOP, Z0 + sz * 0.7]); show(ra + e.release - s + 8, false); finish(); continue; }
      at(ra + e.release - s, [S.exit[0], TOP, Z0]); show(ra + e.release - s, true); at(ra + e.release - s + 3, [2.6, TOP, Z0]); tA = ra + e.release + 3 - s;
    } else { tA = 36; at(36, [2.6, TOP, Z0]); }
    // ---- B: pusher → shuttle (turns the core across the line) → tank arms → gantry: press 1, press 2, vision, buffer → robot → laser → outfeed
    const tB = tA + 1; add('A_Exit_Pusher', 'x', [[s + tB, 0], [s + tB + 1.2, 0.55], [s + tB + 2.2, 0]]);
    at(tB, [2.6, TOP, Z0]); at(tB + 1.2, [S.shut0, 0.79, Z0]);
    add('B_Shuttle', 'x', [[s + tB + 1.6, 0], [s + tB + 4.6, S.shut1 - S.shut0], [s + tB + 26, S.shut1 - S.shut0], [s + tB + 28, 0]]); add('B_Shuttle_Turn', 'ry', [[s + tB + 1.8, 0], [s + tB + 4.4, Math.PI / 2], [s + tB + 26.2, Math.PI / 2], [s + tB + 27.8, 0]]);
    at(tB + 1.6, [S.shut0, 0.79, Z0]); at(tB + 4.6, [S.shut1, 0.79, Z0]); ry(tB + 1.8, 0); ry(tB + 4.4, Math.PI / 2);
    for (const sd of ['_L', '_R']) { const sg = sd === '_L' ? -1 : 1; add('B_TankArm' + sd, 'y', [[s + tB + 5, 0], [s + tB + 6.5, -(1.4 - (0.79 + YC))], [s + tB + 7.5, -(1.4 - (0.79 + YC))], [s + tB + 9, 0]]); add('B_TankArm' + sd, 'z', [[s + tB + 4.6, 0], [s + tB + 5, -sg * 0.46], [s + tB + 7.5, -sg * 0.46], [s + tB + 8, 0]]);
      add('B_TankArm' + sd + '_Tank', 'vis', [[s + tB + 7.5, false], [s + tB + 12, true]]); }
    add(PN + '_Tanks', 'vis', [[s, false], [s + tB + 7.5, true]]);
    const gT = tB + 9;   // transfer gantry: pick at the shuttle, then 8 s per station
    const stations = [[S.shut1, 0.79], [S.press[0], 0.94], [S.press[1], 0.94], [S.vis, 0.88], [S.buf, 0.898]], GX = [], GY = [];
    for (let q = 0; q < stations.length - 1; q++) { const t0 = gT + q * 8, [x0, y0] = stations[q], [x1, y1] = stations[q + 1];
      GX.push([s + t0, x0 - S.shut1], [s + t0 + 2.2, x0 - S.shut1], [s + t0 + 4, x1 - S.shut1], [s + t0 + 6.2, x1 - S.shut1]);
      GY.push([s + t0, 0], [s + t0 + 1, -(1.5 - y0)], [s + t0 + 1.4, -(1.5 - y0)], [s + t0 + 2.2, 0], [s + t0 + 4, 0], [s + t0 + 5, -(1.5 - y1)], [s + t0 + 5.4, -(1.5 - y1)], [s + t0 + 6.2, 0]);
      show(t0 + 1.4, false); flash('B_Transfer_Part', s + t0 + 1.4, s + t0 + 5.4); at(t0 + 1.4, [x0, y0, Z0]); at(t0 + 5.4, [x1, y1, Z0]); show(t0 + 5.4, true);
      if (q === 0 || q === 1) { const pk = q, sg = pk ? 1 : -1; add('B_Press_' + pk, 'z', [[s + t0 + 6.4, 0], [s + t0 + 7.2, -sg * 0.3], [s + t0 + 8.0, -sg * 0.3], [s + t0 + 8.8, 0]]); }
      if (q === 2) flash('B_PressCam', s + t0 + 6.8, s + t0 + 7.2); }
    add('B_Transfer_X', 'x', GX); add('B_Transfer_Y', 'y', GY);
    const rb = s + gT + 4 * 8 + 1; let tC;
    if (RB) { playRobot('B', RB, rb); const e = RB.ev; show(rb + e.grip - s, false); flash('B_Grip_Part', rb + e.grip, rb + e.release); flash('B_Laser_Beam', rb + e.laser0, rb + e.laser1); flash('B_Grip_Seam', rb + e.laser1 - 1.5, rb + e.release);
      add(PN + '_Seam', 'vis', [[s, false], [rb + e.release, true]]); at(rb + e.release - s, [S.bout, TOP, Z0]); show(rb + e.release - s, true); tC = rb + e.release - s + 4; at(tC, [6.66, TOP, Z0]); }
    else { tC = gT + 40; at(tC, [6.66, TOP, Z0]); }
    // ---- C: pitch conveyor to the loop; pusher into the jig at position 0 right after an index; the part rides the jig to position 6; unload pusher → outfeed
    at(tC + 4, [S.cin - 0.04, TOP, Z0]);
    const n0 = JI(s + tC + 4 + 2), tL = I(n0) + 1.7 - s;   // first index after arrival: the jig at position 0 is in place at I(n0) + 1.5
    add('C_Load_Pusher', 'z', [[s + tL, 0], [s + tL + 1.0, 0.68], [s + tL + 2.0, 0]]); at(tL, [S.cin - 0.04, TOP, Z0]); at(tL + 1.0, [JX(0), TOP + 0.015, Z0]);
    for (let q = 1; q < JPOS; q++) { const ti = I(n0 + q) - s; at(ti, [JX(q - 1), TOP + 0.015, Z0]); at(ti + 1.5, [JX(q), TOP + 0.015, Z0]);
      const a = ti + 2.5;   // work at the new position
      if (q === 1 || q === 2) { const fk = q - 1, sg = fk ? 1 : -1; add('C_FlangeArm_' + fk, 'z', [[s + a, 0], [s + a + 1.2, sg * 0.72], [s + a + 3.4, sg * 0.72], [s + a + 4.6, 0]]); add('C_FlangeArm_' + fk, 'y', [[s + a + 1.2, 0], [s + a + 2.0, -(0.83 - (TOP + 0.015 + YC))], [s + a + 2.8, -(0.83 - (TOP + 0.015 + YC))], [s + a + 3.4, 0]]);
        add('C_FlangeArm_' + fk + '_Flange', 'vis', [[s + a + 2.8, false], [s + a + 6, true]]); add(PN + (fk ? '_FlangeR' : '_FlangeL'), 'vis', [[s, false], [s + a + 2.8, true]]); }
      if (q === 3 || q === 4) for (const side of [0, 1]) { const ri = (q - 3) + side * 2, rn = 'C' + ri + '_Robot', sg = side ? -1 : 1;   // the two robots at this position weld both flange joints
        add(rn + '_Joint_1', 'ry', [[s + a, 0], [s + a + 2.4, 0], [s + a + 5.6, sg * 0.18], [s + a + 7, 0]]); add(rn + '_Joint_2', 'rz', [[s + a, 0], [s + a + 1.2, -0.55], [s + a + 2.4, -0.7], [s + a + 5.6, -0.6], [s + a + 7, 0]]); add(rn + '_Joint_3', 'rz', [[s + a, 0], [s + a + 1.2, 0.9], [s + a + 5.6, 1.0], [s + a + 7, 0]]);
        add(rn + '_Joint_5', 'ry', [[s + a, 0], [s + a + 1.2, 0.5], [s + a + 5.6, 0.5], [s + a + 7, 0]]); flash('C' + ri + '_Arc', s + a + 2.4, s + a + 5.6); }
      if (q === 5) { reach('Op_Mig', s + a - 0.5, s + a + 8, -0.85); flash('Op_Mig_Arc', s + a + 1, s + a + 7.2); add(PN + '_Pipes', 'vis', [[s, false], [s + a + 7.2, true]]); } }
    const tU = I(n0 + JPOS) - s - 2.5;   // just before the next index the unload pusher pulls the part onto the outfeed conveyor
    add('C_Unload_Pusher', 'z', [[s + tU, 0], [s + tU + 1.0, -0.6], [s + tU + 2.0, 0]]); at(tU, [JX(JPOS - 1), TOP + 0.015, Z0]); at(tU + 1.0, [S.cout + 0.05, TOP, Z0]); at(tU + 6, [S.cstop - 0.04, TOP, Z0]);
    // ---- D: C/F chamber (lid down, 10 s), external paste (gantry 8 s), manual check (operator 10 s), unload conveyor
    const tD = tU + 7; add('D_CF_Pusher', 'x', [[s + tD, 0], [s + tD + 1.2, 0.5], [s + tD + 2.2, 0]]); at(tD, [12.54, TOP, Z0]); at(tD + 1.2, [S.cf, 0.93, Z0]);
    add('D_CF_Lid', 'y', [[s + tD + 2, 0], [s + tD + 3, -0.3], [s + tD + 13, -0.3], [s + tD + 14, 0]]); flash('D_CF_OK', s + tD + 12.5, s + tD + 15.5);
    at(tD + 14.5, [S.cf, 0.93, Z0]); at(tD + 15.5, [13.45, TOP, Z0]); at(tD + 19, [S.dstop1 - 0.04, TOP, Z0]);
    const tP = tD + 20; add('D_Paste_Pusher', 'x', [[s + tP, 0], [s + tP + 1.2, 0.5], [s + tP + 2.2, 0]]); at(tP, [S.dstop1 - 0.04, TOP, Z0]); at(tP + 1.2, [S.paste, 0.9, Z0]);
    add('D_Disp_Y', 'y', [[s + tP + 2, 0], [s + tP + 3, -(1.14 - (0.9 + 2 * YC + 0.01))], [s + tP + 9, -(1.14 - (0.9 + 2 * YC + 0.01))], [s + tP + 10, 0]]); add('D_Disp_Z', 'z', [[s + tP + 3, -0.05], [s + tP + 5, 0.05], [s + tP + 7, -0.05], [s + tP + 9, 0.05], [s + tP + 10, 0]]); add('D_Disp_X', 'x', [[s + tP + 3, -0.09], [s + tP + 6, -0.09], [s + tP + 6.5, 0.09], [s + tP + 9, 0.09], [s + tP + 10, 0]]);
    at(tP + 10.5, [S.paste, 0.9, Z0]); at(tP + 11.5, [15.35, TOP, Z0]); at(tP + 15, [S.dstop2 - 0.04, TOP, Z0]);
    const tM = tP + 16; turn('Op_Check', [[s + tM - 0.5, 0], [s + tM + 0.5, 0.9], [s + tM + 2.5, 0.9], [s + tM + 3.5, 0], [s + tM + 12.5, 0], [s + tM + 13.5, -0.9], [s + tM + 15.5, -0.9], [s + tM + 16.5, 0]]);
    reach('Op_Check', s + tM, s + tM + 3.5); reach('Op_Check', s + tM + 5, s + tM + 12, -0.7); reach('Op_Check', s + tM + 13, s + tM + 16.5);
    at(tM + 0.8, [S.dstop2 - 0.04, TOP, Z0]); at(tM + 1.6, [S.dstop2 + 0.2, 1.1, Z0 - 0.3]); at(tM + 3, [S.check, 0.9, Z0]); at(tM + 13.5, [S.check, 0.9, Z0]); at(tM + 14.5, [S.check + 0.3, 1.1, Z0 - 0.3]); at(tM + 16, [17.15, TOP, Z0]); at(tM + 20, [S.dstop3 - 0.04, TOP, Z0]);
    // ---- E: the operator carries the cooler to the leak cell's infeed; turntable; visual; robot + leak jig; marking; gasket & bolts; OK / NG; lift; packed by the operator
    const tE = tM + 21; turn('Op_Leak', [[s + tE - 0.5, 0], [s + tE + 0.5, 1.1], [s + tE + 2.5, 1.1], [s + tE + 4, -1.1], [s + tE + 6, -1.1], [s + tE + 7, 0]]); reach('Op_Leak', s + tE, s + tE + 6.5);
    at(tE + 1.5, [S.dstop3 - 0.04, TOP, Z0]); show(tE + 1.5, false); flash('Op_Leak_Part', s + tE + 1.5, s + tE + 5.5); at(tE + 5.5, [S.ein, TOP, Z0]); show(tE + 5.5, true); at(tE + 9.5, [S.estop1 - 0.04, TOP, Z0]);
    const tT = tE + 10.5; add('E_Turn_Pusher', 'x', [[s + tT, 0], [s + tT + 1.2, 0.5], [s + tT + 2.2, 0]]); at(tT, [S.estop1 - 0.04, TOP, Z0]); at(tT + 1.2, [S.turn, 0.872, Z0]);
    add('E_Turntable', 'ry', [[s + tT + 2, 0], [s + tT + 4.5, Math.PI], [s + tT + 5, Math.PI], [s + tT + 5.01, 0]]); ry(tT + 2, Math.PI / 2); ry(tT + 4.5, Math.PI * 1.5); ry(tT + 5.01, Math.PI / 2);
    add('E_Vis_Pusher', 'x', [[s + tT + 5.5, 0], [s + tT + 6.7, 0.5], [s + tT + 7.7, 0]]); at(tT + 5.5, [S.turn, 0.872, Z0]); at(tT + 6.7, [21.05, TOP, Z0]); at(tT + 9.5, [21.3, TOP, Z0]); flash('E_VisCam', s + tT + 10, s + tT + 10.4); at(tT + 10.5, [21.3, TOP, Z0]); at(tT + 12.5, [S.estop2 - 0.04, TOP, Z0]);
    const re = s + tT + 13.5; let tG;
    if (RE) { playRobot('E', RE, re); const e = RE.ev; show(re + e.grip - s, false); flash('E_Grip_Part', re + e.grip, re + e.put); flash('E_Grip_Part', re + e.take, re + e.release);
      at(re + e.put - s, [S.jig[0], S.jig[1], S.jig[2]]); show(re + e.put - s, true); show(re + e.take - s, false); add('E_Hood', 'y', [[re + e.put + 0.8, 0], [re + e.put + 1.8, -0.22], [re + e.take - 2.5, -0.22], [re + e.take - 1.3, 0]]);
      flash(lNG ? 'E_Leak_NG' : 'E_Leak_OK', re + e.take - 3.5, re + e.take + 2); at(re + e.release - s, [S.eout + 0.05, TOP, Z0]); show(re + e.release - s, true); tG = re + e.release - s + 2; }
    else { tG = tT + 40; at(tG, [S.eout + 0.05, TOP, Z0]); }
    at(tG + 2.5, [S.mark, TOP, Z0]); flash('E_Mark_Beam', s + tG + 3, s + tG + 6); add(PN + '_Mark', 'vis', [[s, false], [s + tG + 6, true]]); at(tG + 6.5, [S.mark, TOP, Z0]); at(tG + 8, [S.estop3 - 0.04, TOP, Z0]);
    const tK = tG + 9; add('E_Gasket_Pusher', 'x', [[s + tK, 0], [s + tK + 1.2, 0.5], [s + tK + 2.2, 0]]); at(tK, [S.estop3 - 0.04, TOP, Z0]); at(tK + 1.2, [S.gasket, 0.912, Z0]);
    add('E_Nutrunner', 'y', [[s + tK + 2, 0], [s + tK + 3, -0.4], [s + tK + 5.5, -0.4], [s + tK + 6.2, 0], [s + tK + 7, -0.4], [s + tK + 9.5, -0.4], [s + tK + 10.2, 0]]); add('E_Nutrunner', 'z', [[s + tK + 1.5, 0], [s + tK + 2, -0.12], [s + tK + 6.2, -0.12], [s + tK + 7, 0.12], [s + tK + 10.2, 0.12], [s + tK + 10.6, 0]]); add('E_Nutrunner', 'ry', [[s + tK + 3, 0], [s + tK + 5.5, 6 * TAU], [s + tK + 7, 6 * TAU], [s + tK + 9.5, 12 * TAU], [s + tK + 10.6, 12 * TAU], [s + tK + 10.61, 0]]);
    add('E_Out_Pusher', 'x', [[s + tK + 11, 0], [s + tK + 12.2, 0.5], [s + tK + 13.2, 0]]); at(tK + 11, [S.gasket, 0.912, Z0]); at(tK + 12.2, [25.05, TOP, Z0]); at(tK + 15, [S.okng, TOP, Z0]);
    flash(lNG ? 'E_OKNG_NG' : 'E_OKNG_OK', s + tK + 15.5, s + tK + 18.5);
    if (lNG) { add('E_NG_Pusher', 'z', [[s + tK + 16, 0], [s + tK + 17, 0.6], [s + tK + 18, 0]]); at(tK + 16, [S.okng, TOP, Z0]); at(tK + 17, [S.okng, TOP, Z0 + 0.9]); at(tK + 20, [25.85, TOP, Z0 + 0.9]); show(tK + 20, false); finish(); continue; }
    at(tK + 16, [S.okng, TOP, Z0]); at(tK + 18.5, [S.lift, TOP, Z0]); add('E_Lift', 'y', [[s + tK + 19, 0], [s + tK + 21, -0.2], [s + tK + 25, -0.2], [s + tK + 27, 0]]); at(tK + 19, [S.lift, TOP, Z0]); at(tK + 21, [S.lift, TOP - 0.2, Z0]);
    turn('Op_Out', [[s + tK + 21, 0], [s + tK + 22, 0.9], [s + tK + 24, 0.9], [s + tK + 25.5, -0.9], [s + tK + 27, -0.9], [s + tK + 28, 0]]); reach('Op_Out', s + tK + 21.5, s + tK + 27.5);
    at(tK + 22.5, [S.lift, TOP - 0.2, Z0]); show(tK + 22.5, false); flash('Op_Out_Part', s + tK + 22.5, s + tK + 26.5); PRT[k] = s + tK + 26.5;
    finish();
  }
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) {
    const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /_(Cam|Beam|Arc|OK|NG|Part|Paste|Seam|Tanks|Pipes|Mark|FlangeL|FlangeR)$|^A_Profile_|^A_FinCam_|^A_NozCam_|^Part_\d$|^Op_(Leak|Out)_Part$|_Grip_/.test(node) && !/_Tank$|_Flange$/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs, /_Arm_/.test(node) ? R : 0)]);
  }
  root.userData.module = { ends: Object.fromEntries(Object.entries(PRT).map(([k, v]) => [k, +(((v % T) + T) % T).toFixed(1)])) };
  return cycleClip(root, 'Module_Cycle', T, keys, 4);
}
