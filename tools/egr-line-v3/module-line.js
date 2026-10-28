// The EGR cooler automatic welding module line rebuilt from generic equipment (the CAD cells are in assets/models/egr-weld-module/):
// the same five cells, stations and order, at the CAD positions, as one baked model with the product flowing through it.
// Line frame: x along the flow (cell A inlet at x 0, leak test outlet at x 26), z across; the main axis is z 1.3 and cell A's two
// lanes sit at z 0.5 / 2.1. Operators stand on the −Z side (the aisle). Metres, Y up, floor at y 0.
//
//   A. core-assy loading (two lanes: roller infeed, centring + direction check, fin vision + barcode) → handling robot → laser
//      profiler → fixed dispensing nozzle (the robot traces the paste lines) → nozzle vision + weight check → exit block / NG conveyor
//   B. core shuttle → tank feeders put an end tank on both ends → two tank presses → press vision → transfer + buffer stands →
//      handling robot holds the core under the scan laser head → outfeed (NG conveyor beside it)
//   C. infeed pitch conveyor → jig transfer loop (11 jigs) with two flange feeders, four MIG robots (power source + wire drum each)
//      and a manual MIG booth → outfeed pitch conveyor
//   D. 2nd C/F check chamber → external paste dispenser (four paste tanks) → manual check table → unload conveyor
//   E. leak test: pitch conveyor → barcode + turntable → visual camera → robot loads the leak jig → laser marking → gasket & bolt
//      station → OK / NG jig with NG storage conveyor → exit lift conveyor
import * as THREE from 'three';
import { G, box, cyl, prof, foot, plane, bin, xf, std, anim, materials, finalize, cycleClip, opWorker, ikRig } from './models.js';

const TOP = 0.85, Z0 = 1.3, LANES = [0.5, 2.1];
export const MODULE_T = 320, MODULE_P = 40;   // one part every 40 s, eight parts in the loop

export function egrModuleLine() {
  const m = materials(), root = G('EGR_Module_Line');
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45), tankM = std('end_tank', 0xc9ccd0, 0.95, 0.3);
  const bead = std('weld_bead', 0x6f675d, 0.85, 0.5), arcM = std('weld_arc', 0xd8f0ff, 0.0, 0.3, { emissive: 0xa8dcff, emissiveIntensity: 4.0 });
  const curtain = std('weld_curtain', 0xc8461e, 0.0, 0.55, { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const laserM = std('laser_beam', 0xff3030, 0.0, 0.3, { emissive: 0xff2020, emissiveIntensity: 3.5 });
  const magenta = std('paste_tank', 0xc24a9c, 0.3, 0.5), glass = std('polycarbonate', 0xd3e4ee, 0.0, 0.06, { transparent: true, opacity: 0.22, depthWrite: false });
  const robots = [];

  // ---------------------------------------------------------------- generic pieces
  const table = (x, z, w, d, h, mat) => { box(root, mat || m.aluDark, w, 0.03, d, x, h - 0.015, z); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { prof(root, [x + sx * (w / 2 - 0.03), 0.06, z + sz * (d / 2 - 0.03)], [x + sx * (w / 2 - 0.03), h - 0.03, z + sz * (d / 2 - 0.03)], 0.04); foot(root, x + sx * (w / 2 - 0.03), z + sz * (d / 2 - 0.03)); } };
  const rollers = (x0, x1, z, w = 0.5) => { // roller section on legs, flow along +X, top at TOP
    const L = x1 - x0, c = (x0 + x1) / 2; for (const sz of [-1, 1]) box(root, m.alu, L, 0.1, 0.035, c, TOP - 0.06, z + sz * (w / 2 + 0.03));
    for (let k = 0, n = Math.round(L / 0.1); k < n; k++) cyl(root, m.steel, 0.022, w, x0 + (k + 0.5) * L / n, TOP - 0.025, z, 'z', 10);
    for (let k = 0, n = Math.max(1, Math.ceil(L / 1.2)); k <= n; k++) { const x = x0 + 0.08 + (L - 0.16) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (w / 2 + 0.03)], [x, TOP - 0.11, z + sz * (w / 2 + 0.03)], 0.04); foot(root, x, z + sz * (w / 2 + 0.03)); } } };
  const stop = (x, z) => box(root, m.yellow, 0.03, 0.06, 0.5, x, TOP + 0.03, z);
  const gantry = (x, z, w, h, name) => { for (const sz of [-1, 1]) prof(root, [x, 0.06, z + sz * w / 2], [x, h, z + sz * w / 2], 0.045, m.frameDark); box(root, m.frameDark, 0.07, 0.07, w + 0.07, x, h, z); const g = name ? G(name, root) : root; return g; };
  const camera = (x, y, z, name) => { box(root, m.black, 0.08, 0.12, 0.08, x, y + 0.06, z); cyl(root, m.light, 0.06, 0.01, x, y - 0.005, z, 'y', 20); if (name) { const f = G(name, root); cyl(f, m.light, 0.11, 0.004, x, TOP + 0.04, z, 'y', 20); return f; } };
  const monitor = (name, x, z, ry, y = 1.55) => { prof(root, [x, 0.06, z], [x, y - 0.1, z], 0.04); const w = G(name, root, x, y, z); w.rotation.y = ry; box(w, m.black, 0.42, 0.28, 0.04, 0, 0, 0); box(w, m.screen, 0.37, 0.23, 0.004, 0, 0, 0.022); return w; };
  const tower = (x, z, y0 = 2.0) => { cyl(root, m.black, 0.012, 0.25, x, y0, z, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.lampA], [2, m.lampR]]) cyl(root, mt, 0.03, 0.06, x, y0 + 0.16 + k * 0.065, z, 'y', 14); };
  const cabinet = (x, z, w = 0.8, d = 0.45, h = 1.9) => { box(root, m.sheet, w, h, d, x, h / 2, z); box(root, m.black, w - 0.1, 0.02, d + 0.01, x, h - 0.06, z); box(root, m.screen, 0.3, 0.2, 0.004, x, h - 0.5, z - d / 2 - 0.002); for (const sx of [-1, 1]) box(root, m.black, 0.02, 0.1, 0.02, x + sx * 0.12, 1.0, z - d / 2 - 0.012); };
  const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / 1.0)); for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; box(root, m.black, 0.05, 2.0, 0.05, x, 1.0, z); } plane(root, m.mesh, L, 1.85, (x0 + x1) / 2, 1.075, (z0 + z1) / 2, [0, a, 0], 0.05); box(root, m.black, L, 0.02, 0.02, (x0 + x1) / 2, 0.15, (z0 + z1) / 2, [0, a, 0]); box(root, m.black, L, 0.02, 0.02, (x0 + x1) / 2, 1.98, (z0 + z1) / 2, [0, a, 0]); };
  const curtainRun = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0); plane(root, curtain, L, 1.8, (x0 + x1) / 2, 1.05, (z0 + z1) / 2, [0, a, 0]); box(root, m.aluDark, L, 0.03, 0.03, (x0 + x1) / 2, 1.97, (z0 + z1) / 2, [0, a, 0]); for (const [x, z] of [[x0, z0], [x1, z1]]) { prof(root, [x, 0.06, z], [x, 2.0, z], 0.04, m.frameDark); foot(root, x, z); } };
  const totes = (x, z, n) => { for (let k = 0; k < n; k++) { const y = k * 0.3; box(root, m.yellow, 0.6, 0.28, 0.4, x, y + 0.14, z); box(root, m.black, 0.56, 0.02, 0.36, x, y + 0.29, z); } };
  // FR5-class robot on a pedestal; returns { J, tool, base } (tool frame at the flange, +Z out of the flange)
  const robot = (name, x, z, h = 0.6, ry = 0) => {
    const fr = globalThis.FR5 ? globalThis.FR5.clone(true) : null;
    box(root, m.black, 0.36, h - 0.02, 0.36, x, (h - 0.02) / 2 + 0.02, z); box(root, m.yellow, 0.37, 0.04, 0.37, x, h - 0.04, z); box(root, m.aluDark, 0.42, 0.02, 0.42, x, 0.01, z);
    if (!fr) return null;
    fr.name = name; fr.position.set(x, h, z); fr.rotation.y = ry; root.add(fr);
    const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = name + '_' + j.name; });
    const tool = G(name + '_Tool', J[5], 0, 0, 0.101); robots.push({ name, J, tool, fr }); return { J, tool, fr };
  };
  const gripper = (tool, name) => { const bx = new THREE.BoxGeometry(0.08, 0.1, 0.06); bx.translate(0, 0, 0.03); bin(tool, m.aluDark, bx); const br = new THREE.BoxGeometry(0.06, 0.13, 0.02); br.translate(0, 0, 0.07); bin(tool, m.yellow, br);
    for (const s of [-1, 1]) { const jw = new THREE.BoxGeometry(0.03, 0.012, 0.09); jw.translate(0, s * 0.052, 0.12); bin(tool, m.black, jw); }
    const gp = G(name, tool, 0, 0, 0.165); gp.rotation.x = -Math.PI / 2; return gp; };  // part hangs under the jaws, its X along world X
  const torch = tool => { cyl(tool, m.black, 0.02, 0.16, 0, 0, 0.08, 'z', 10); cyl(tool, m.orange, 0.012, 0.05, 0, 0, 0.18, 'z', 10); cyl(tool, m.steel, 0.002, 0.03, 0, 0, 0.22, 'z', 6); };
  // part looks (origin at the bottom centre, body centre at YC): brazed core → + end tanks (pressed) → + laser seams → + flanges (MIG beads) → marked
  const YC = 0.045;
  const lookCore = n => { box(n, brazed, 0.18, 0.07, 0.09, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, brazed, 0.004, 0.074, 0.094, x, YC, 0); };
  const lookTanks = n => { for (const sx of [-1, 1]) box(n, tankM, 0.05, 0.08, 0.1, sx * 0.115, YC, 0); };
  const lookSeam = n => { for (const sx of [-1, 1]) box(n, bead, 0.006, 0.084, 0.104, sx * 0.09, YC, 0); };
  const lookFlange = n => { for (const sx of [-1, 1]) { box(n, m.stainless, 0.012, 0.1, 0.15, sx * 0.146, YC, 0); box(n, bead, 0.008, 0.07, 0.08, sx * 0.136, YC, 0); } };
  const lookPipes = n => { for (const sx of [-1, 1]) { cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 8); } box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055); };
  const lookMark = n => plane(n, m.display, 0.03, 0.02, 0.04, YC + 0.0355, 0.02, [-Math.PI / 2, 0, 0]);
  const paste = n => { for (const sx of [-1, 1]) for (const dz of [-0.03, 0, 0.03]) box(n, m.paste, 0.004, 0.072, 0.012, sx * 0.093, YC, dz); };

  // ================================================================ A. core-assy loading & paste apply (x 0 … 2.0), two lanes
  box(root, m.sheet, 2.3, 0.08, 4.6, 1.0, 0.04, 1.3);                                    // cell base plate
  for (const [li, z] of LANES.entries()) {
    totes(-0.75, z, 4);                                                                   // yellow material containers (two stacks of four)
    rollers(0.0, 1.1, z); stop(1.08, z);
    const gt = gantry(0.55, z, 0.9, 1.75); void gt;                                        // centring + direction check: two side pushers and a sensor over the gate
    for (const sz of [-1, 1]) { const p = G('A_Center_' + li + '_' + (sz < 0 ? 'L' : 'R'), root); box(p, m.yellow, 0.14, 0.05, 0.04, 0.55, TOP + 0.04, z + sz * 0.28); cyl(root, m.alu, 0.015, 0.12, 0.55, TOP + 0.04, z + sz * 0.36, 'z', 8); }
    box(root, m.black, 0.04, 0.04, 0.06, 0.55, TOP + 0.26, z); cyl(root, m.steel, 0.006, 0.4, 0.55, TOP + 0.46, z, 'y', 6);   // direction sensor
    camera(0.85, 1.55, z, 'A_FinCam_' + li); box(root, m.black, 0.06, 0.06, 0.1, 0.95, TOP + 0.15, z + 0.3); box(root, m.red, 0.004, 0.02, 0.06, 0.92, TOP + 0.15, z + 0.3); // fin vision camera, barcode reader
    table(1.45, z - 0.0 + (li ? 0.55 : -0.55), 0.3, 0.3, 0.9); box(root, m.aluDark, 0.06, 0.6, 0.06, 1.45, 1.2, z + (li ? 0.55 : -0.55) + 0.1); box(root, m.black, 0.1, 0.06, 0.08, 1.45, 1.52, z + (li ? 0.55 : -0.55) + 0.1); // laser profiler block
    { const lz = z + (li ? 0.55 : -0.55); const pl = G('A_Profile_' + li, root); plane(pl, laserM, 0.1, 0.56, 1.45, 1.21, lz, [0, Math.PI / 2, 0]); }
    // fixed dispensing nozzle on a column
    { const nx = 1.75, nz = z + (li ? 0.55 : -0.55); prof(root, [nx + 0.35, 0.06, nz], [nx + 0.35, 1.7, nz], 0.06, m.frameDark); box(root, m.aluDark, 0.4, 0.08, 0.08, nx + 0.17, 1.67, nz);
      box(root, m.yellow, 0.12, 0.2, 0.12, nx, 1.55, nz); cyl(root, m.black, 0.035, 0.12, nx, 1.39, nz, 'y', 16); cyl(root, m.steel, 0.005, 0.08, nx, 1.29, nz, 'y', 8); cyl(root, m.black, 0.012, 0.9, nx + 0.35, 1.45, nz + 0.4, 'z', 8); }
    camera(1.95, 1.55, z + (li ? 0.55 : -0.55), 'A_NozCam_' + li);                       // nozzle height vision
    table(1.95, z, 0.3, 0.3, 0.88); box(root, m.black, 0.26, 0.04, 0.26, 1.95, 0.9, z); box(root, m.display, 0.12, 0.03, 0.004, 1.95, 0.96, z - 0.13); // weight check scale
    rollers(2.1, 2.9, z + (li ? 0.7 : -0.7), 0.4); box(root, m.ngLabel, 0.3, 0.1, 0.004, 2.5, TOP + 0.2, z + (li ? 0.95 : -0.95)); // NG conveyor
  }
  const RA = robot('A_Robot', 1.45, Z0, 0.55); const gripA = RA ? gripper(RA.tool, 'A_Grip_Part') : null; if (gripA) { const c = G('A_Grip_Core', gripA, 0, -YC, 0); lookCore(c); paste(G('A_Grip_Paste', c)); }
  rollers(2.0, 2.6, Z0, 0.5); stop(2.58, Z0);                                            // exit block towards the shuttle
  cabinet(0.4, -1.5); cabinet(1.3, -1.5); monitor('A_HMI', 2.2, -1.0, 0.5); tower(2.5, -1.3);
  fence(-0.2, -1.1, 2.6, -1.1); fence(-0.2, 3.7, 2.6, 3.7); fence(-0.2, -1.1, -0.2, 3.7);
  opWorker(root, 'Op_Load', -0.3, -0.2, 0);                                               // loading operator: totes → infeed conveyors

  // ================================================================ B. end tank assembly & scan laser welding (x 2.6 … 6.0)
  box(root, m.sheet, 3.4, 0.08, 4.4, 4.3, 0.04, 1.3);
  { // core shuttle: linear axis x 2.6 → 3.3 at Z0, carriage with a jig
    box(root, m.aluDark, 0.9, 0.12, 0.2, 3.0, 0.7, Z0); for (const x of [2.65, 3.35]) prof(root, [x, 0.06, Z0], [x, 0.64, Z0], 0.06, m.frameDark);
    const sh = G('B_Shuttle', root, 2.7, 0.76, Z0); box(sh, m.alu, 0.3, 0.03, 0.3, 0, 0.015, 0); for (const sx of [-1, 1]) box(sh, clampM, 0.02, 0.07, 0.12, sx * 0.095, 0.065, 0); }
  for (const sz of [-1, 1]) { // tank feeders: magazine tower with a stack of tanks and a pick-and-place arm that lowers a tank onto the core end
    const fz = Z0 + sz * 1.2, fx = 3.3; table(fx, fz, 0.5, 0.5, 0.9); for (let k = 0; k < 8; k++) box(root, tankM, 0.05, 0.08, 0.1, fx, 0.95 + k * 0.1, fz);
    for (const s2 of [-1, 1]) prof(root, [fx + s2 * 0.15, 0.9, fz], [fx + s2 * 0.15, 1.85, fz], 0.03);
    prof(root, [fx, 1.85, fz], [fx, 1.85, Z0 + sz * 0.2], 0.05, m.frameDark);
    const arm = G('B_TankArm_' + (sz < 0 ? 'L' : 'R'), root, fx, 1.85, Z0 + sz * 0.35); box(arm, m.aluDark, 0.08, 0.08, 0.3, 0, 0, -sz * 0.15); box(arm, m.alu, 0.04, 0.9, 0.04, 0, -0.45, 0); const t = G('B_TankArm_' + (sz < 0 ? 'L' : 'R') + '_Tank', arm, 0, -0.95, 0); box(t, tankM, 0.05, 0.08, 0.1, 0, 0, 0); }
  for (const [k, px] of [[0, 3.9], [1, 4.5]]) { // two tank presses: C-frame with a horizontal ram from the side, the core on a block
    table(px, Z0, 0.5, 0.5, 0.88); box(root, m.black, 0.26, 0.04, 0.2, px, 0.9, Z0);
    const sz = k ? 1 : -1; box(root, m.frameDark, 0.3, 1.3, 0.3, px, 0.65, Z0 + sz * 0.75); box(root, m.frameDark, 0.3, 0.2, 0.7, px, 1.2, Z0 + sz * 0.5);
    const ram = G('B_Press_' + k, root, px, 0.945, Z0 + sz * 0.45); cyl(ram, m.steel, 0.03, 0.3, 0, 0, 0, 'z', 12); box(ram, m.aluDark, 0.12, 0.12, 0.06, 0, 0, -sz * 0.17); }
  gantry(5.0, Z0, 0.9, 1.7); camera(5.0, 1.55, Z0, 'B_PressCam');                          // press vision check
  table(5.0, Z0, 0.4, 0.4, 0.88);
  { // transfer gantry x 4.2 → 5.8 with a gripper, three buffer stands at z 2.4
    for (const x of [4.1, 5.9]) for (const sz of [-1, 1]) prof(root, [x, 0.06, Z0 + sz * 0.45], [x, 2.1, Z0 + sz * 0.45], 0.05, m.frameDark);
    for (const sz of [-1, 1]) box(root, m.yellow, 2.0, 0.08, 0.08, 5.0, 2.1, Z0 + sz * 0.45);
    const gx = G('B_Transfer_X', root, 4.5, 0, Z0), gy = G('B_Transfer_Y', gx); box(gx, m.aluDark, 0.2, 0.16, 1.0, 0, 2.1, 0); box(gy, m.alu, 0.05, 0.6, 0.05, 0, 1.9, 0); box(gy, m.aluDark, 0.2, 0.03, 0.14, 0, 1.6, 0); for (const sx of [-1, 1]) box(gy, m.black, 0.012, 0.09, 0.12, sx * 0.1, 1.55, 0);
    const tp = G('B_Transfer_Part', gy, 0, 1.5, 0); lookCore(tp); lookTanks(tp);
    for (let k = 0; k < 3; k++) { table(4.6 + k * 0.45, Z0 + 1.1, 0.35, 0.35, 0.88); box(root, clampM, 0.24, 0.012, 0.12, 4.6 + k * 0.45, 0.886, Z0 + 1.1); } }
  { // scan laser welding: handling robot takes the core off the buffer and holds it under the scanner head; glass enclosure
    const RB = robot('B_Robot', 5.4, Z0 - 0.0, 0.55); const g = RB ? gripper(RB.tool, 'B_Grip_Part') : null; if (g) { const c = G('B_Grip_Core', g, 0, -YC, 0); lookCore(c); lookTanks(c); }
    const hx = 5.6, hz = Z0 - 0.75; prof(root, [hx + 0.35, 0.06, hz], [hx + 0.35, 2.0, hz], 0.06, m.frameDark); box(root, m.aluDark, 0.45, 0.08, 0.08, hx + 0.15, 1.95, hz);
    box(root, m.black, 0.22, 0.26, 0.22, hx, 1.75, hz); cyl(root, m.steel, 0.05, 0.08, hx, 1.58, hz, 'y', 16); const bm = G('B_Laser_Beam', root); cyl(bm, laserM, 0.004, 0.5, hx, 1.3, hz, 'y', 6);
    for (const [x0, z0, x1, z1] of [[5.0, -0.3, 6.0, -0.3], [5.0, -0.3, 5.0, 0.6], [6.0, -0.3, 6.0, 0.6]]) plane(root, glass, Math.hypot(x1 - x0, z1 - z0), 1.9, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, [0, Math.atan2(-(z1 - z0), x1 - x0), 0]);
    rollers(5.9, 6.6, Z0, 0.5); stop(6.58, Z0); rollers(5.6, 6.3, Z0 + 1.6, 0.4); box(root, m.ngLabel, 0.3, 0.1, 0.004, 6.0, TOP + 0.2, Z0 + 1.85); }   // outfeed + NG conveyor
  cabinet(3.0, -1.5); cabinet(4.8, -1.5); monitor('B_HMI', 5.9, -1.0, 0.5); tower(6.2, -1.3);
  fence(2.6, -1.1, 6.2, -1.1); fence(2.6, 3.7, 6.2, 3.7);

  // ================================================================ C. tack welding (x 6.6 … 11.8): jig loop, flange feeders, four MIG robots, manual MIG booth
  box(root, m.sheet, 5.4, 0.08, 4.8, 9.2, 0.04, 1.3);
  rollers(6.6, 7.2, Z0, 0.5);                                                             // infeed pitch conveyor
  { // jig transfer loop: 11 jig pallets on a rectangular track x 7.3 … 10.5, upper rail at Z0 (work side), return rail at Z0 + 0.6
    for (const z of [Z0, Z0 + 0.6]) { box(root, m.aluDark, 3.4, 0.08, 0.12, 8.9, TOP - 0.1, z - 0.2); box(root, m.aluDark, 3.4, 0.08, 0.12, 8.9, TOP - 0.1, z + 0.2); }
    for (const x of [7.2, 10.6]) box(root, m.aluDark, 0.2, 0.08, 1.0, x, TOP - 0.1, Z0 + 0.3);
    for (const x of [7.4, 8.3, 9.2, 10.1, 10.4]) for (const sz of [-1, 1]) { prof(root, [x, 0.06, Z0 + 0.3 + sz * 0.5], [x, TOP - 0.15, Z0 + 0.3 + sz * 0.5], 0.04); foot(root, x, Z0 + 0.3 + sz * 0.5); }
    for (let j = 0; j < 11; j++) { const jg = G('C_Jig_' + j, root); box(jg, m.alu, 0.3, 0.03, 0.3, 0, TOP, 0); for (const sx of [-1, 1]) box(jg, clampM, 0.02, 0.08, 0.12, sx * 0.095, TOP + 0.055, 0); box(jg, m.yellow, 0.3, 0.012, 0.02, 0, TOP + 0.02, -0.14); } }
  for (const [k, fx] of [[0, 7.6], [1, 8.3]]) { // flange feeders: vibratory bowl on a stand + a small pick arm placing a flange onto the core end
    const fz = Z0 - 0.9; cyl(root, m.sheet, 0.3, 0.5, fx, 0.25, fz, 'y', 20); cyl(root, m.stainless, 0.32, 0.18, fx, 0.6, fz, 'y', 24); for (let r = 0.1; r < 0.3; r += 0.07) cyl(root, m.stainless, r, 0.17, fx, 0.6 + r / 3, fz, 'y', 20);
    box(root, m.aluDark, 0.08, 0.2, 0.9, fx, 1.1, fz + 0.45); const pa = G('C_FlangeArm_' + k, root, fx, 1.2, Z0); box(pa, m.alu, 0.04, 0.5, 0.04, 0, -0.25, 0); const f = G('C_FlangeArm_' + k + '_Flange', pa, 0, -0.52, 0); box(f, m.stainless, 0.012, 0.1, 0.15, 0, 0, 0); }
  { // four MIG robots with power sources and wire drums, welding screens around the loop, manual MIG booth at the loop end
    const MIG = [[8.9, Z0 - 1.1, 0], [9.7, Z0 - 1.1, 0], [8.9, Z0 + 1.7, Math.PI], [9.7, Z0 + 1.7, Math.PI]];
    MIG.forEach(([x, z, ry], i) => { const R = robot('C_Mig_' + i, x, z, 0.5, ry); if (R) { torch(R.tool); const ar = G('C_Mig_' + i + '_Arc', R.tool); bin(ar, arcM, xf(new THREE.SphereGeometry(0.016, 10, 8), 0, 0, 0.235)); }
      const bz = z + (z < Z0 ? -0.9 : 0.9); box(root, m.red, 0.5, 0.9, 0.4, x, 0.45, bz); box(root, m.black, 0.46, 0.08, 0.36, x, 0.94, bz); box(root, m.display, 0.12, 0.05, 0.004, x, 0.7, bz + (z < Z0 ? -0.202 : 0.202)); // welding power source
      cyl(root, m.lampG, 0.16, 0.35, x + 0.45, 0.175, bz, 'y', 20); cyl(root, m.black, 0.17, 0.02, x + 0.45, 0.36, bz, 'y', 20); cyl(root, m.black, 0.01, 1.2, x + 0.2, 1.0, bz + (z < Z0 ? 0.5 : -0.5), 'z', 6); }); // wire drum + hose
    for (const [x0, z0, x1, z1] of [[8.3, Z0 - 1.6, 10.3, Z0 - 1.6], [8.3, Z0 + 2.2, 10.3, Z0 + 2.2]]) curtainRun(x0, z0, x1, z1);
    cyl(root, m.sheet, 0.13, 1.4, 9.3, 2.5, Z0 + 0.3, 'y', 20); box(root, m.sheet, 1.4, 0.08, 1.2, 9.3, 2.0, Z0 + 0.3);                  // fume hood over the loop
    // manual MIG booth (x 10.9, −Z side): bench, torch on a balancer, curtains, operator
    table(10.9, Z0 - 1.3, 0.8, 0.6, 0.9); box(root, clampM, 0.24, 0.012, 0.12, 10.9, 0.906, Z0 - 1.3); const mt = G('C_Manual_Torch', root, 10.6, 1.5, Z0 - 1.3); cyl(mt, m.black, 0.015, 0.25, 0, 0, 0, 'y', 8); cyl(root, m.black, 0.008, 0.6, 10.6, 1.9, Z0 - 1.3, 'y', 6);
    box(root, m.red, 0.4, 0.7, 0.35, 11.4, 0.35, Z0 - 1.9); curtainRun(10.4, Z0 - 2.0, 11.5, Z0 - 2.0); curtainRun(10.4, Z0 - 2.0, 10.4, Z0 - 0.9);
    const mw = opWorker(root, 'Op_Mig', 10.9, Z0 - 1.9, 0); void mw; const ma = G('Op_Mig_Arc', root); bin(ma, arcM, xf(new THREE.SphereGeometry(0.014, 10, 8), 10.95, 1.0, Z0 - 1.25)); }
  rollers(10.6, 11.8, Z0, 0.5); stop(11.78, Z0);                                          // outfeed pitch conveyor
  cabinet(7.0, -1.6); cabinet(7.9, -1.6); monitor('C_HMI', 11.6, -0.8, 0.5); tower(11.7, -1.3);
  fence(6.6, -2.2, 10.2, -2.2); fence(6.6, 3.9, 11.8, 3.9); fence(11.8, -2.2, 11.8, 3.9);

  // ================================================================ D. C/F check, external paste, manual check, unloading (x 11.8 … 18.5)
  box(root, m.sheet, 6.0, 0.08, 4.2, 15.0, 0.04, 1.3);
  rollers(11.8, 12.6, Z0, 0.5);
  { // 2nd C/F check: chamber with a lifting lid, gauge, OK lamp
    table(13.0, Z0, 0.7, 0.55, 0.88); box(root, m.aluDark, 0.46, 0.03, 0.36, 13.0, 0.895, Z0); for (const s of [-1, 1]) { box(root, m.sheet, 0.46, 0.25, 0.02, 13.0, 1.02, Z0 + s * 0.18); box(root, m.sheet, 0.02, 0.25, 0.36, 13.0 + s * 0.23, 1.02, Z0); }
    box(root, clampM, 0.24, 0.02, 0.12, 13.0, 0.92, Z0); const ld = G('D_CF_Lid', root); box(ld, m.yellow, 0.5, 0.03, 0.4, 13.0, 1.16, Z0); for (const s of [-1, 1]) cyl(root, m.steel, 0.012, 0.55, 13.0 + s * 0.27, 1.2, Z0, 'y', 8);
    box(root, m.sheet, 0.3, 0.32, 0.12, 13.3, 1.35, Z0 + 0.25); cyl(root, m.sheet, 0.06, 0.012, 13.3, 1.38, Z0 + 0.312, 'z', 20); const ok = G('D_CF_OK', root); cyl(ok, m.lampG, 0.032, 0.06, 12.65, 1.35, Z0 + 0.25, 'y', 14); prof(root, [12.65, 0.9, Z0 + 0.25], [12.65, 1.3, Z0 + 0.25], 0.03, m.frameDark); }
  rollers(13.4, 14.4, Z0, 0.5); stop(14.38, Z0);
  { // external paste dispenser: XY gantry with a needle over a stop, four paste tanks (magenta) on a rack behind
    for (const x of [14.3, 15.3]) for (const sz of [-1, 1]) prof(root, [x, 0.06, Z0 + sz * 0.45], [x, 1.9, Z0 + sz * 0.45], 0.05, m.frameDark); for (const sz of [-1, 1]) box(root, m.yellow, 1.2, 0.08, 0.08, 14.8, 1.9, Z0 + sz * 0.45);
    const gx = G('D_Disp_X', root, 14.8, 0, Z0), gz = G('D_Disp_Z', gx), gy = G('D_Disp_Y', gz); box(gx, m.aluDark, 0.16, 0.14, 1.0, 0, 1.9, 0); box(gz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.9, 0); box(gy, m.alu, 0.04, 0.6, 0.04, 0, 1.55, 0); cyl(gy, m.black, 0.03, 0.1, 0, 1.22, 0, 'y', 12); cyl(gy, m.steel, 0.004, 0.06, 0, 1.14, 0, 'y', 6);
    table(14.8, Z0, 0.4, 0.4, 0.88); box(root, clampM, 0.24, 0.012, 0.12, 14.8, 0.886, Z0);
    box(root, m.aluDark, 1.4, 0.03, 0.4, 14.8, 0.9, Z0 + 1.5); for (let k = 0; k < 4; k++) cyl(root, magenta, 0.12, 0.5, 14.3 + k * 0.34, 1.16, Z0 + 1.5, 'y', 20); for (const sx of [-1, 1]) prof(root, [14.8 + sx * 0.65, 0.06, Z0 + 1.5], [14.8 + sx * 0.65, 0.88, Z0 + 1.5], 0.04); }
  rollers(15.3, 16.1, Z0, 0.5); stop(16.08, Z0);
  { // manual check table: operator, inspection lamp, monitor with the check list, OK / NG trays
    table(16.6, Z0, 0.9, 0.6, 0.9); for (const sz of [-1, 1]) prof(root, [16.6, 0.9, Z0 + sz * 0.3], [16.6, 1.6, Z0 + sz * 0.3], 0.03); box(root, m.aluDark, 0.08, 0.04, 0.66, 16.6, 1.62, Z0); box(root, m.light, 0.06, 0.012, 0.5, 16.6, 1.595, Z0);
    box(root, m.red, 0.3, 0.1, 0.25, 16.95, 0.95, Z0 + 0.6); box(root, m.ngLabel, 0.2, 0.08, 0.004, 16.95, 1.04, Z0 + 0.48); monitor('D_Monitor', 16.1, Z0 - 0.75, -0.7); opWorker(root, 'Op_Check', 16.6, Z0 - 0.75, 0); }
  rollers(17.1, 18.4, Z0, 0.5); stop(18.38, Z0);                                          // unload conveyor
  cabinet(12.3, -1.2); cabinet(14.0, -1.2); tower(18.2, -0.9);
  fence(11.8, 3.9, 18.5, 3.9);

  // ================================================================ E. leak test (x 19.3 … 26.2)
  box(root, m.sheet, 7.0, 0.08, 3.6, 22.75, 0.04, 1.1);
  rollers(19.3, 20.3, Z0, 0.5); stop(20.28, Z0);                                          // infeed pitch conveyor (the operator carries parts over from D)
  { // barcode reader + turntable
    const tt = G('E_Turntable', root, 20.7, 0, Z0); cyl(root, m.frameDark, 0.2, 0.8, 20.7, 0.4, Z0, 'y', 16); cyl(tt, m.alu, 0.25, 0.04, 0, 0.84, 0, 'y', 24); box(tt, clampM, 0.24, 0.012, 0.12, 0, 0.866, 0);
    box(root, m.black, 0.06, 0.06, 0.1, 20.7, TOP + 0.3, Z0 - 0.4); box(root, m.red, 0.004, 0.02, 0.06, 20.73, TOP + 0.3, Z0 - 0.4); prof(root, [20.7, 0.06, Z0 - 0.45], [20.7, TOP + 0.35, Z0 - 0.45], 0.03); }
  rollers(21.0, 21.6, Z0, 0.5); gantry(21.3, Z0, 0.9, 1.7); camera(21.3, 1.55, Z0, 'E_VisCam');  // visual inspection
  { // leak test jig: a chamber with a lifting hood; the robot sets the part inside; gauge panel; NG lamp
    const jx = 22.5, jz = Z0 + 0.9; table(jx, jz, 0.7, 0.6, 0.88); box(root, clampM, 0.26, 0.02, 0.14, jx, 0.9, jz); for (const s of [-1, 1]) cyl(root, m.steel, 0.012, 0.6, jx + s * 0.3, 1.2, jz, 'y', 8);
    const hood = G('E_Hood', root); box(hood, glass, 0.5, 0.3, 0.4, jx, 1.1, jz); box(hood, m.yellow, 0.52, 0.03, 0.42, jx, 1.265, jz);
    box(root, m.sheet, 0.5, 1.4, 0.3, jx + 0.6, 0.7, jz + 0.5); box(root, m.screen, 0.3, 0.2, 0.004, jx + 0.6, 1.1, jz + 0.348); for (const k of [0, 1]) cyl(root, m.sheet, 0.05, 0.012, jx + 0.45 + k * 0.3, 1.3, jz + 0.352, 'z', 16);
    const RE = robot('E_Robot', 22.3, Z0 - 0.1, 0.55); const g = RE ? gripper(RE.tool, 'E_Grip_Part') : null; if (g) { const c = G('E_Grip_Core', g, 0, -YC, 0); lookCore(c); lookTanks(c); lookFlange(c); lookPipes(c); }
    const ok = G('E_Leak_OK', root); cyl(ok, m.lampG, 0.032, 0.06, jx - 0.4, 1.35, jz + 0.3, 'y', 14); prof(root, [jx - 0.4, 0.9, jz + 0.3], [jx - 0.4, 1.3, jz + 0.3], 0.03, m.frameDark); }
  rollers(22.9, 23.7, Z0, 0.5); stop(23.68, Z0);
  { // laser marking: enclosed head over the stop
    gantry(23.4, Z0, 0.9, 1.7); box(root, m.black, 0.18, 0.22, 0.18, 23.4, 1.5, Z0); cyl(root, m.steel, 0.04, 0.05, 23.4, 1.37, Z0, 'y', 12); const bm = G('E_Mark_Beam', root); cyl(bm, laserM, 0.003, 0.4, 23.4, 1.15, Z0, 'y', 6);
    for (const [x0, z0, x1, z1] of [[23.1, Z0 - 0.4, 23.7, Z0 - 0.4], [23.1, Z0 + 0.4, 23.7, Z0 + 0.4]]) plane(root, glass, Math.hypot(x1 - x0, z1 - z0), 0.7, (x0 + x1) / 2, TOP + 0.4, (z0 + z1) / 2, [0, 0, 0]); }
  { // gasket & bolt station: nutrunner on a balancer arm, gasket tray, bolt feeder
    table(24.5, Z0, 0.8, 0.6, 0.9); box(root, clampM, 0.26, 0.012, 0.14, 24.5, 0.906, Z0); box(root, m.black, 0.25, 0.04, 0.2, 24.5, 0.92, Z0 + 0.35); for (let k = 0; k < 3; k++) cyl(root, m.rubber, 0.04, 0.004, 24.42 + k * 0.08, 0.942, Z0 + 0.35, 'y', 16);
    prof(root, [24.9, 0.06, Z0 + 0.4], [24.9, 2.0, Z0 + 0.4], 0.05, m.frameDark); box(root, m.aluDark, 0.6, 0.06, 0.06, 24.6, 2.0, Z0 + 0.4); const nr = G('E_Nutrunner', root, 24.5, 1.5, Z0); cyl(nr, m.black, 0.02, 0.4, 0, 0, 0, 'y', 10); cyl(nr, m.yellow, 0.03, 0.08, 0, 0.1, 0, 'y', 10); cyl(nr, m.steel, 0.006, 0.08, 0, -0.24, 0, 'y', 6); cyl(root, m.black, 0.008, 0.5, 24.5, 1.95, Z0 + 0.2, 'y', 6);
    cyl(root, m.sheet, 0.14, 0.3, 24.1, 1.05, Z0 - 0.4, 'y', 16); prof(root, [24.1, 0.06, Z0 - 0.4], [24.1, 0.9, Z0 - 0.4], 0.04); }
  rollers(25.0, 25.5, Z0, 0.5);
  { // OK / NG jig: a pusher diverts NG parts onto the storage conveyor (+Z); OK parts go on to the exit lift
    gantry(25.7, Z0, 0.9, 1.6); const ok = G('E_OKNG_OK', root); cyl(ok, m.lampG, 0.032, 0.06, 25.7, 1.65, Z0 - 0.4, 'y', 14); const ng = G('E_OKNG_NG', root); cyl(ng, m.lampR, 0.032, 0.06, 25.7, 1.65, Z0 + 0.4, 'y', 14);
    const ps = G('E_NG_Pusher', root); box(ps, m.aluDark, 0.2, 0.08, 0.02, 25.7, TOP + 0.045, Z0 - 0.27); cyl(ps, m.steel, 0.01, 0.35, 25.7, TOP + 0.045, Z0 - 0.45, 'z', 8); cyl(root, m.alu, 0.03, 0.3, 25.7, TOP + 0.045, Z0 - 0.75, 'z', 16);
    rollers(25.4, 26.2, Z0, 0.5); rollers(25.5, 25.9, Z0 + 0.9, 0.4); box(root, m.ngLabel, 0.3, 0.1, 0.004, 25.7, TOP + 0.2, Z0 + 1.15); for (let k = 0; k < 2; k++) { const p = G('E_NG_Part_' + k, root, 25.6 + k * 0.25, TOP, Z0 + 0.9); lookCore(p); lookTanks(p); lookFlange(p); lookPipes(p); } }
  { // exit lift conveyor: a short section that drops to a hand-off height; the output tote beside it
    const lf = G('E_Lift', root); box(lf, m.alu, 0.5, 0.1, 0.56, 26.45, TOP - 0.06, Z0); for (let k = 0; k < 5; k++) cyl(lf, m.steel, 0.022, 0.5, 26.25 + k * 0.1, TOP - 0.025, Z0, 'z', 10);
    for (const sz of [-1, 1]) prof(root, [26.6, 0.06, Z0 + sz * 0.3], [26.6, 1.3, Z0 + sz * 0.3], 0.05, m.frameDark); box(root, m.yellow, 0.1, 0.06, 0.7, 26.6, 1.3, Z0); totes(26.5, Z0 - 0.9, 1); }
  cabinet(20.0, -0.6); cabinet(23.0, -0.6); monitor('E_HMI', 21.0, Z0 - 1.0, 0.5); tower(26.0, Z0 - 1.0);
  fence(19.3, 3.1, 26.7, 3.1); fence(26.7, -0.7, 26.7, 3.1);
  opWorker(root, 'Op_Leak', 19.2, Z0 - 0.75, 0);                                          // carries parts from D's unload conveyor to E's infeed
  opWorker(root, 'Op_Out', 26.3, Z0 - 0.75, 0);                                           // takes finished coolers off the lift into the tote

  // ================================================================ parts in flight: X > Y > Z > Part > looks (shown stage by stage)
  const N = MODULE_T / MODULE_P;
  for (let i = 0; i < N; i++) {
    const PN = 'Part_' + (i + 1), x = G(PN + '_X', root, 0, TOP, Z0), y = G(PN + '_Y', x), z = G(PN + '_Z', y), p = G(PN, z), r = G(PN + '_R', p, 0, YC, 0), lk = G(PN + '_Look', r, 0, -YC, 0);
    lookCore(G(PN + '_Core', lk)); paste(G(PN + '_Paste', lk)); lookTanks(G(PN + '_Tanks', lk)); lookSeam(G(PN + '_Seam', lk)); lookFlange(G(PN + '_Flange', lk)); lookPipes(G(PN + '_Pipes', lk)); lookMark(G(PN + '_Mark', lk));
  }
  const model = finalize(root);
  return animate(model, robots, { lookCore, lookTanks, N });
}

// ---------------------------------------------------------------- the cycle (stage 2: geometry only for now; the clip is added by animate())
function animate(root, robots) { void robots; return root; }
