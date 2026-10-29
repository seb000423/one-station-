// The EGR cooler automatic welding module line rebuilt as a pallet line: the same five cells, stations and order as the CAD, as one
// baked model with the product flowing through it on jig pallets.
// Line frame: x along the flow, z across. One twin-belt pallet conveyor (belts at z 1.3 ± 0.17, belt top 0.85) carries 300 × 300 jig
// pallets (cradle + two toggle clamps sized to the 180 × 90 core) from the merge point (x 2.1) to the packer (x 26.6); empty pallets go
// down a lift at the end, return on the lower level (0.45) and come up a lift at the start. Every station is a pallet stop (blade
// between the belts); heads come down to the clamped part. Robots only pick and place: A merges the two infeed lanes onto the pallet,
// B and E take the part off the pallet into the laser / leak cabin fixture and put it back. Nothing slides across rails.
// Real catalogue assets (control panels, cabinets, workbenches, workers, boxes) are placed by tools/egr-module-asset-layout.py from the
// station table this model exports (userData.table → egr_module_line.json); only moving or line-specific equipment is modelled here.
// Cycle: MODULE_T 400 s, a part every MODULE_P 50 s (8 pallets in the loop); part 6 fails the dispensing check, part 3 the leak test.
import * as THREE from 'three';
import { G, box, cyl, prof, foot, plane, bin, xf, std, materials, finalize, cycleClip, ikRig, labelTexture } from './models.js';

const BT = 0.85, PAL = 0.03, PT = BT + PAL + 0.012, Z0 = 1.3, YC = 0.045, LOW = 0.45, FIXY = 0.862;   // belt top, pallet thickness, part base on the pallet, lower return level
const LANES = [Z0 - 0.75, Z0 + 0.75];   // cell A's two roller infeed lanes (cores lie directly on the rollers, top 0.85)
export const MODULE_T = 400, MODULE_P = 50;
// stations along the spine (x)
const S = { tote: -0.6, lane: 1.1, merge: 2.1, prof: 2.8, disp: 3.6, cam: 4.25, scale: 4.9, ngA: 5.5, aEnd: 5.9,
  turn: 6.4, tank: 7.3, press: [8.15, 8.9], vis: 9.6, bstop: 10.3, bcab: [11.1, Z0 - 0.78], bback: 10.8, bng: 11.5, bEnd: 12.0,
  // MIG robots 1.0 m apart (rule set v2.0 §4); the manual MIG station sits 1.5 m past robot 4 (outside the FR10's 1.4 m reach) behind a welding screen
  flange: 12.7, mig: [13.5, 14.5, 15.5, 16.5], cturn: 15.0, manual: 18.1, cEnd: 18.6,
  cf: 19.3, paste: 20.4, check: 21.5, dEnd: 22.2,
  eturn: 22.9, evis: 23.6, estop: 24.3, ecab: [25.1, Z0 - 0.78], eback: 24.8, mark: 26.15, nut: 27.1, okng: 27.85, pack: 28.6, eEnd: 29.3 };
const RBASE = { A: [1.55, Z0], B: [S.bstop + 0.25, Z0 - 0.6], E: [S.estop + 0.25, Z0 - 0.6] }, MZ = Z0 - 0.95, RH = 0.9, RHM = 0.75;   // handling robots (FR5) and MIG robots (FR10) pedestals
const HOME = { A: li => [RBASE.A[0], RH + 0.35, Z0 + (li ? 0.15 : -0.15)], B: [RBASE.B[0] - 0.4, RH + 0.45, RBASE.B[1] - 0.25], E: [RBASE.E[0] - 0.4, RH + 0.45, RBASE.E[1] - 0.25] };

export function egrModuleLine() {
  const m = materials(), root = G('EGR_Module_Line');
  const brazed = std('brazed_stainless', 0xa49580, 0.9, 0.36), clampM = std('jig_clamp', 0x2a2d31, 0.5, 0.45), tankM = std('end_tank', 0xc9ccd0, 0.95, 0.3);
  const bead = std('weld_bead', 0x6f675d, 0.85, 0.5), arcM = std('weld_arc', 0xd8f0ff, 0.0, 0.3, { emissive: 0xa8dcff, emissiveIntensity: 4.0 });
  const glowM = std('weld_glow', 0xbfe6ff, 0.0, 0.3, { emissive: 0x9fd8ff, emissiveIntensity: 3.0, transparent: true, opacity: 0.35, depthWrite: false }), sparkM = std('weld_spark', 0xffd27a, 0.0, 0.3, { emissive: 0xffb43a, emissiveIntensity: 4.0 });
  // MIG arc at the torch tip (tool +Z, or +Y-down for the manual torch): a white-hot core, a soft blue glow and a spray of sparks
  const arcFx = (g, tz, down = false) => { const P = (a, b, c) => down ? [a, -c, b] : [a, b, c];
    bin(g, arcM, xf(new THREE.SphereGeometry(0.014, 10, 8), ...P(0, 0, tz))); bin(g, glowM, xf(new THREE.SphereGeometry(0.045, 14, 10), ...P(0, 0, tz)));
    for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.05 + (k % 3) * 0.025, sp = new THREE.CylinderGeometry(0.0015, 0.0015, r, 4); sp.translate(0, r / 2, 0); sp.rotateZ(0.6 + (k % 4) * 0.25); sp.rotateY(a); const q = P(0, 0, tz); sp.translate(...q); bin(g, sparkM, sp); } };
  const laserM = std('laser_beam', 0xff3030, 0.0, 0.3, { emissive: 0xff2020, emissiveIntensity: 3.5 });
  const magenta = std('paste_tank', 0xc24a9c, 0.3, 0.5), glass = std('polycarbonate', 0xd3e4ee, 0.0, 0.06, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const cardboard = std('cardboard', 0xb88a55, 0.0, 0.8), blue = std('machine_blue', 0x2f5f9e, 0.3, 0.5), palM = std('pallet_alu', 0xa9b2bb, 0.85, 0.35), beltM = std('pallet_belt', 0x2a2d31, 0.0, 0.75), curtain = std('weld_curtain', 0xc8461e, 0.0, 0.55, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const robots = {}, FOOT = [], TABLE = { S, RBASE, MZ, Z0, BT, LOW, LANES };
  const fp = (name, x0, x1, z0, z1) => FOOT.push([name, x0, x1, z0, z1]);
  const plates = {}, plateMat = text => plates[text] || (plates[text] = std('plate_' + text, 0xffffff, 0.1, 0.5, { map: labelTexture(text, '#1f2a36', '#ffffff') }));

  // ---------------------------------------------------------------- generic pieces
  const nameplate = (text, x, y, z, ry = 0, w = 0.4) => { box(root, m.black, w + 0.02, w / 2 + 0.02, 0.012, x, y, z, [0, ry, 0]); plane(root, plateMat(text), w, w / 2, x + Math.sin(ry) * 0.008, y, z + Math.cos(ry) * 0.008, [0, ry, 0]); };
  const BW = 0.34;   // twin-belt conveyor: belts at z ± BW/2, 45 mm profile beams under them
  const pbelt = (x0, x1, y = BT, legs = true) => { const L = x1 - x0, c = (x0 + x1) / 2;   // pallet conveyor section, flow +X, belt top at y
    for (const sz of [-1, 1]) { const z = Z0 + sz * BW / 2; prof(root, [x0, y - 0.06, z], [x1, y - 0.06, z], 0.045); box(root, beltM, L, 0.012, 0.05, c, y - 0.006, z); box(root, m.aluDark, L, 0.02, 0.02, c, y + 0.01, z + sz * 0.035); }
    prof(root, [c, y - 0.12, Z0 - BW / 2], [c, y - 0.12, Z0 + BW / 2], 0.03);
    if (legs) for (let k = 0, n = Math.max(1, Math.ceil(L / 1.5)); k <= n; k++) { const x = x0 + 0.1 + (L - 0.2) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, Z0 + sz * 0.28], [x, y - 0.09, Z0 + sz * 0.28], 0.045); foot(root, x, Z0 + sz * 0.28); } prof(root, [x, 0.3, Z0 - 0.28], [x, 0.3, Z0 + 0.28], 0.045); } };
  const stopper = (name, x) => { const st = G(name, root, x + 0.17, BT - 0.1, Z0); box(st, m.yellow, 0.02, 0.1, 0.12, 0, 0.06, 0); box(root, m.black, 0.06, 0.06, 0.12, x + 0.17, BT - 0.13, Z0); return st; };   // pallet stop blade between the belts (drops to release)
  const gate = (x, w, h, mat) => { for (const sz of [-1, 1]) prof(root, [x, 0.06, Z0 + sz * w / 2], [x, h, Z0 + sz * w / 2], 0.045, mat || m.frameDark); box(root, mat || m.frameDark, 0.07, 0.07, w + 0.07, x, h, Z0); };
  const slide = (name, x, z, top, travel = 0.3) => { box(root, m.aluDark, 0.08, travel + 0.3, 0.1, x, top - (travel + 0.3) / 2, z); const h = G(name, root, x, top - 0.1, z); box(h, m.alu, 0.1, 0.08, 0.12, 0, 0, 0); return h; };
  const camera = (x, y, z, name, fy) => { box(root, m.black, 0.08, 0.12, 0.08, x, y + 0.06, z); cyl(root, m.light, 0.06, 0.01, x, y - 0.005, z, 'y', 20); const f = G(name, root); cyl(f, m.light, 0.11, 0.004, x, fy, z, 'y', 20); return f; };
  const monitor = (name, x, z, ry, y = 1.55) => { prof(root, [x, 0.06, z], [x, y - 0.1, z], 0.04); box(root, m.aluDark, 0.3, 0.012, 0.3, x, 0.006, z); const w = G(name, root, x, y, z); w.rotation.y = ry; box(w, m.black, 0.42, 0.28, 0.04, 0, 0, 0); box(w, m.screen, 0.37, 0.23, 0.004, 0, 0, 0.022); return w; };
  const tower = (x, z, y0 = 2.0) => { cyl(root, m.black, 0.012, 0.25, x, y0, z, 'y', 8); for (const [k, mt] of [[0, m.lampG], [1, m.lampA], [2, m.lampR]]) cyl(root, mt, 0.03, 0.06, x, y0 + 0.16 + k * 0.065, z, 'y', 14); };
  const fenceRun = (x0, z0, x1, z1, door) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; box(root, m.black, 0.05, 2.0, 0.05, x, 1.0, z); box(root, m.black, 0.12, 0.008, 0.12, x, 0.004, z); }
    for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n, cx = x0 + (x1 - x0) * (u0 + u1) / 2, cz = z0 + (z1 - z0) * (u0 + u1) / 2, seg = L / n;
      if (door && Math.abs(cx - door[0]) < seg / 2 && Math.abs(cz - door[1]) < seg / 2) { plane(root, m.yellow, seg - 0.1, 0.06, cx, 2.0, cz, [0, a, 0]); continue; }
      plane(root, m.mesh, seg - 0.06, 1.8, cx, 1.05, cz, [0, a, 0], 0.05); box(root, m.black, seg - 0.06, 0.02, 0.02, cx, 0.16, cz, [0, a, 0]); box(root, m.black, seg - 0.06, 0.02, 0.02, cx, 1.96, cz, [0, a, 0]); } };
  const pusher = (name, x, z, y, len = 0.5) => { const p = G(name, root); box(p, m.aluDark, 0.34, 0.08, 0.02, x, y, z); cyl(p, m.steel, 0.012, len, x, y, z - len / 2, 'z', 8); cyl(root, m.alu, 0.035, 0.3, x, y, z - len - 0.15, 'z', 16); box(root, m.aluDark, 0.12, 0.3, 0.1, x, y - 0.2, z - len - 0.15); return p; };   // pneumatic transfer pusher (+Z stroke)
  const balancer = (name, x, z, y, ry) => { prof(root, [x, 0.06, z], [x, 2.2, z], 0.06, m.frameDark); box(root, m.aluDark, 0.36, 0.012, 0.36, x, 0.006, z); const ax = x + Math.cos(ry) * 0.5, az = z - Math.sin(ry) * 0.5;
    box(root, m.aluDark, 1.0, 0.06, 0.06, (x + ax) / 2, 2.2, (z + az) / 2, [0, ry, 0]); cyl(root, m.black, 0.07, 0.1, ax, 2.1, az, 'y', 16); cyl(root, m.black, 0.006, 2.1 - y - 0.2, ax, (2.05 + y + 0.2) / 2, az, 'y', 6); return G(name, root, ax, y, az); };
  const robot = (key, x, z, kind = 'FR5', h = RH, ry = 0) => { const name = key + '_Robot', src = globalThis[kind] || globalThis.FR5, fr = src ? src.clone(true) : null;
    box(root, m.black, 0.36, h - 0.02, 0.36, x, (h - 0.02) / 2 + 0.02, z); box(root, m.yellow, 0.37, 0.04, 0.37, x, h - 0.04, z); box(root, m.aluDark, 0.5, 0.02, 0.5, x, 0.01, z);
    if (!fr) return null; fr.name = name; fr.position.set(x, h, z); fr.rotation.y = ry; root.add(fr);
    const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = name + '_' + j.name; }); const tool = G(name + '_Tool', J[5], 0, 0, 0.101); robots[key] = { J, tool, fr }; return robots[key]; };
  const gripper = (tool, name, ry = 0) => { const bx = new THREE.BoxGeometry(0.08, 0.1, 0.06); bx.translate(0, 0, 0.03); bin(tool, m.aluDark, bx); const br = new THREE.BoxGeometry(0.06, 0.13, 0.02); br.translate(0, 0, 0.07); bin(tool, m.yellow, br);
    for (const s of [-1, 1]) { const jw = new THREE.BoxGeometry(0.03, 0.012, 0.09); jw.translate(0, s * 0.052, 0.12); bin(tool, m.black, jw); } const gp = G(name, tool, 0, 0, 0.165); gp.rotation.x = -Math.PI / 2; const in_ = G(name + '_In', gp); in_.rotation.y = ry; return in_; };
  const torch = tool => { cyl(tool, m.black, 0.022, 0.18, 0, 0, 0.09, 'z', 10); cyl(tool, m.orange, 0.013, 0.05, 0, 0, 0.2, 'z', 10); cyl(tool, m.steel, 0.002, 0.03, 0, 0, 0.24, 'z', 6); };
  const cabin = (text, x0, x1, z0, z1, h = 2.0, openSide = null) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) prof(root, [x, 0.06, z], [x, h, z], 0.06, m.frameDark); box(root, blue, w + 0.06, 0.12, d + 0.06, cx, h - 0.06, cz); box(root, m.sheet, w + 0.06, 0.4, d + 0.06, cx, 0.2, cz);
    for (const [side, px, pz, r, L] of [['S', cx, z0, 0, w], ['N', cx, z1, 0, w], ['W', x0, cz, Math.PI / 2, d], ['E', x1, cz, Math.PI / 2, d]]) if (side !== openSide) plane(root, glass, L - 0.08, h - 0.55, px, (h + 0.4) / 2 - 0.05, pz, [0, r, 0]);
    nameplate(text, cx, h + 0.1, cz, 0, 0.44); fp(text, x0, x1, z0, z1); };
  // a CAD station sub-assembly (globalThis.PARTS, loaded by build.html): centred on (x, z), standing on y, turned ry
  const part = (key, x, z, ry = 0, y = 0) => { const src = (globalThis.PARTS || {})[key]; if (!src) return null; const o = src.clone(true), w = new THREE.Group(); w.add(o); w.rotation.y = ry; w.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(w); w.position.set(x - (b.min.x + b.max.x) / 2, y - b.min.y, z - (b.min.z + b.max.z) / 2); w.name = 'CAD_' + key.replace(/-/g, '_'); root.add(w); return w; };
  const fixture = (x, z) => { box(root, m.aluDark, 0.3, 0.03, 0.3, x, FIXY - 0.027, z); for (const sx of [-1, 1]) prof(root, [x + sx * 0.12, 0.4, z], [x + sx * 0.12, FIXY - 0.04, z], 0.04); box(root, clampM, 0.05, 0.03, 0.2, x - 0.11, FIXY + 0.015, z); box(root, clampM, 0.05, 0.03, 0.2, x + 0.11, FIXY + 0.015, z); };   // cabin fixture with end stops (the part lies across, along z)
  // the jig pallet: 300 × 300 aluminium plate, cradle for the 180 × 90 core (its long axis along X on the pallet), two toggle clamps
  const palletGeo = (pal, name) => { box(pal, palM, 0.3, PAL, 0.3, 0, PAL / 2, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(pal, m.black, 0.012, 0.01, sx * 0.12, -0.005, sz * 0.12, 'y', 8);
    box(pal, clampM, 0.2, 0.012, 0.11, 0, PAL + 0.006, 0); for (const sx of [-1, 1]) box(pal, clampM, 0.02, 0.05, 0.11, sx * 0.096, PAL + 0.025, 0);   // cradle plate + end blocks (the core sits between them)
    for (const [sz, nm] of [[-1, '_ClampL'], [1, '_ClampR']]) { box(pal, m.steel, 0.06, 0.06, 0.03, 0, PAL + 0.03, sz * 0.085); const c = G(name + nm, pal, 0, PAL + 0.062, sz * 0.085); box(c, m.red, 0.012, 0.012, 0.06, 0, 0, -sz * 0.03); box(c, clampM, 0.05, 0.008, 0.02, 0, 0.004, -sz * 0.05); } };   // clamp arms hinge at the back, swing down over the core (rx)
  // part looks (origin at the bottom centre, body centre at YC; long axis X)
  const lookCore = n => { box(n, brazed, 0.18, 0.07, 0.09, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, brazed, 0.004, 0.074, 0.094, x, YC, 0); };
  const lookPaste = n => { for (const sx of [-1, 1]) for (const dz of [-0.03, 0, 0.03]) box(n, m.paste, 0.004, 0.072, 0.012, sx * 0.093, YC, dz); };
  const lookTanks = n => { for (const sx of [-1, 1]) box(n, tankM, 0.05, 0.08, 0.1, sx * 0.115, YC, 0); };
  const lookSeam = n => { for (const sx of [-1, 1]) box(n, bead, 0.006, 0.084, 0.104, sx * 0.09, YC, 0); };
  const lookFlange = (n, sx) => { box(n, m.stainless, 0.012, 0.1, 0.15, sx * 0.146, YC, 0); box(n, bead, 0.008, 0.07, 0.08, sx * 0.136, YC, 0); };
  const lookPipes = n => { for (const sx of [-1, 1]) cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 8); box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055); };
  const lookMark = n => plane(n, m.display, 0.03, 0.02, 0.04, YC + 0.0355, 0.02, [-Math.PI / 2, 0, 0]);
  const tank = (n, x = 0, y = 0, z = 0) => box(n, tankM, 0.05, 0.08, 0.1, x, y, z);
  const rollers = (x0, x1, z, w = 0.5) => { fp('컨베이어 ' + x0.toFixed(1), x0, x1, z - w / 2 - 0.05, z + w / 2 + 0.05); const L = x1 - x0, c = (x0 + x1) / 2;
    for (const sz of [-1, 1]) { box(root, m.alu, L, 0.1, 0.035, c, BT - 0.06, z + sz * (w / 2 + 0.03)); box(root, m.aluDark, L, 0.008, 0.045, c, BT + 0.014, z + sz * (w / 2 + 0.03)); box(root, m.aluDark, L, 0.03, 0.01, c, BT + 0.06, z + sz * (w / 2 - 0.1)); }   // + guide rails for the bare cores
    for (let k = 0, n = Math.round(L / 0.1); k < n; k++) cyl(root, m.steel, 0.022, w, x0 + (k + 0.5) * L / n, BT - 0.025, z, 'z', 10);
    for (let k = 0, n = Math.max(1, Math.ceil(L / 1.4)); k <= n; k++) { const x = x0 + 0.1 + (L - 0.2) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (w / 2 + 0.03)], [x, BT - 0.11, z + sz * (w / 2 + 0.03)], 0.04); foot(root, x, z + sz * (w / 2 + 0.03)); } prof(root, [x, 0.3, z - w / 2 - 0.03], [x, 0.3, z + w / 2 + 0.03], 0.04); } };

  // ================================================================ the spine: upper pallet conveyor, lower return, lifts at both ends
  const X0 = S.merge, X1 = S.pack + 0.6;   // the in-lift is the merge station itself (the returned pallet rises straight into the loading position); the out-lift sits past the packer
  pbelt(X0 + 0.22, X1 - 0.22); pbelt(X0 + 0.22, X1 - 0.22, LOW, false);
  for (const x of [X0, X1]) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [x + sx * 0.2, 0.06, Z0 + sz * 0.27], [x + sx * 0.2, BT - 0.08, Z0 + sz * 0.27], 0.045); box(root, blue, 0.46, 0.06, 0.6, x, 0.09, Z0); box(root, m.aluDark, 0.5, 0.02, 0.8, x, 0.01, Z0);   // low lift frame inside the conveyor line (4 posts + base), the pallet carrier runs on them
    const lf = G(x === X0 ? 'Lift_In' : 'Lift_Out', root, x, LOW - 0.06, Z0); for (const sz of [-1, 1]) box(lf, beltM, 0.4, 0.012, 0.05, 0, 0, sz * BW / 2); box(lf, m.aluDark, 0.4, 0.05, 0.4, 0, -0.03, 0); for (const sz of [-1, 1]) box(lf, m.yellow, 0.4, 0.01, 0.02, 0, 0.012, sz * (BW / 2 + 0.035));
    nameplate(x === X0 ? '팔레트 리프트 (상승)' : '팔레트 리프트 (하강)', x, 0.3, Z0 - 0.31, 0, 0.36); }
  fp('스파인', X0 - 0.3, X1 + 0.3, Z0 - 0.3, Z0 + 0.3);
  // ================================================================ A. loading & paste apply (x −1.2 … 5.9)
  for (const [li, z] of LANES.entries()) { const sz = li ? 1 : -1;
    rollers(0.1, S.lane + 0.25, z); box(root, m.yellow, 0.025, 0.05, 0.3, S.lane + 0.11, BT + 0.03, z);   // lane rollers with a fixed end stop
    for (const sx of [-1, 1]) prof(root, [0.55, 0.06, z + sx * 0.36], [0.55, 1.6, z + sx * 0.36], 0.045, m.frameDark); box(root, m.frameDark, 0.07, 0.07, 0.79, 0.55, 1.6, z);   // centring gate
    for (const s2 of [-1, 1]) { const p = G('A_Center_' + li + (s2 < 0 ? '_L' : '_R'), root); box(p, m.yellow, 0.14, 0.05, 0.03, 0.55, BT + 0.04, z + s2 * 0.2); cyl(root, m.alu, 0.012, 0.1, 0.55, BT + 0.04, z + s2 * 0.27, 'z', 8); }
    box(root, m.black, 0.06, 0.1, 0.06, 0.55, 1.52, z); plane(root, m.red, 0.03, 0.03, 0.55, 1.469, z, [Math.PI / 2, 0, 0]);   // direction sensor under the beam
    camera(0.85, 1.5, z, 'A_FinCam_' + li, BT + 0.02); box(root, m.black, 0.06, 0.06, 0.1, 0.95, BT + 0.15, z + sz * 0.3); box(root, m.red, 0.004, 0.02, 0.06, 0.92, BT + 0.15, z + sz * 0.3);
    nameplate(li ? '투입 레인 2' : '투입 레인 1', 0.3, 1.7, z, 0, 0.36); }
  { // loader gantry: a 2-axis pick-and-place takes cores out of the tote on the stand (x −0.6) and sets them on lane 1 / lane 2 alternately
    const tx = S.tote; box(root, m.sheet, 0.7, 0.55, 1.0, tx, 0.275, Z0); box(root, m.black, 0.72, 0.02, 1.02, tx, 0.56, Z0); nameplate('코어 상자 스탠드', tx, 0.35, Z0 - 0.51, 0, 0.36); fp('상자 스탠드', tx - 0.35, tx + 0.35, Z0 - 0.5, Z0 + 0.5);
    for (const sz of [-1, 1]) { prof(root, [tx - 0.5, 0.06, Z0 + sz * 1.15], [tx - 0.5, 2.1, Z0 + sz * 1.15], 0.06, m.frameDark); prof(root, [0.6, 0.06, Z0 + sz * 1.15], [0.6, 2.1, Z0 + sz * 1.15], 0.06, m.frameDark); box(root, blue, 1.1 + 0.5, 0.12, 0.12, (tx - 0.5 + 0.6) / 2, 2.1, Z0 + sz * 1.15); }
    const gx = G('A_Loader_X', root, tx, 0, Z0), gz = G('A_Loader_Z', gx), gy = G('A_Loader_Y', gz); box(gx, m.aluDark, 0.16, 0.14, 2.42, 0, 2.1, 0); box(gz, m.aluDark, 0.14, 0.12, 0.16, 0, 2.03, 0); box(gy, m.alu, 0.05, 0.9, 0.05, 0, 1.55, 0); box(gy, m.aluDark, 0.14, 0.03, 0.2, 0, 1.1, 0); for (const sz of [-1, 1]) box(gy, m.black, 0.12, 0.08, 0.012, 0, 1.06, sz * 0.1);
    const lp = G('A_Loader_Part', gy, 0, 1.015, 0); lookCore(lp); nameplate('코어 투입 로더', (tx + 0.6) / 2, 2.25, Z0 - 1.15, 0, 0.44);
    for (let k = 0; k < 6; k++) { const c = G('A_Tote_Core_' + k, root, tx + (k % 3 - 1) * 0.22, 0.58, Z0 + (k < 3 ? -0.2 : 0.2)); lookCore(c); } }   // cores in the tote
  { const R = robot('A', ...RBASE.A); if (R) { const g = gripper(R.tool, 'A_Grip_Part'); lookCore(G('A_Grip_Core', g)); } fp('핸들링 로봇 A', RBASE.A[0] - 0.25, RBASE.A[0] + 0.25, Z0 - 0.25, Z0 + 0.25); nameplate('핸들링 로봇 A', RBASE.A[0], 0.5, Z0 - 0.19, 0, 0.3); }
  stopper('Stop_merge', S.merge);
  stopper('Stop_prof', S.prof); gate(S.prof, 0.8, 1.75); { const h = slide('A_ProfHead', S.prof, Z0, 1.75); box(h, m.black, 0.12, 0.08, 0.1, 0, -0.06, 0); const pl = G('A_Profile', h); plane(pl, laserM, 0.16, 0.6, 0, -0.4, 0, [0, Math.PI / 2, 0]); } nameplate('프로파일 검사', S.prof, 1.89, Z0 - 0.05, 0, 0.4); fp('프로파일 검사', S.prof - 0.15, S.prof + 0.15, Z0 - 0.45, Z0 + 0.45);
  stopper('Stop_disp', S.disp); gate(S.disp, 0.9, 1.85); { const dx = G('A_Disp_X', root, S.disp, 0, Z0), dz = G('A_Disp_Z', dx), dy = G('A_Disp_Y', dz); box(dx, m.aluDark, 0.14, 0.1, 0.9, 0, 1.85, 0); box(dz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.79, 0); box(dy, m.alu, 0.05, 0.5, 0.05, 0, 1.5, 0); box(dy, m.yellow, 0.1, 0.16, 0.1, 0, 1.32, 0); cyl(dy, m.black, 0.03, 0.1, 0, 1.19, 0, 'y', 12); cyl(dy, m.steel, 0.004, 0.06, 0, 1.11, 0, 'y', 6);
    if (!part('paste-tank', S.disp, Z0 + 1.05)) { box(root, m.sheet, 0.5, 0.8, 0.5, S.disp, 0.4, Z0 + 1.05); cyl(root, m.stainless, 0.17, 0.5, S.disp, 1.05, Z0 + 1.05, 'y', 24); }
    cyl(root, m.black, 0.012, 0.7, S.disp, 1.7, Z0 + 0.72, 'z', 8); prof(root, [S.disp, 1.12, Z0 + 1.05], [S.disp, 1.7, Z0 + 1.05], 0.03, m.frameDark); nameplate('페이스트 공급', S.disp, 1.25, Z0 + 0.8, 0, 0.36); fp('페이스트 공급', S.disp - 0.31, S.disp + 0.31, Z0 + 0.8, Z0 + 1.3); }   // pressure tank from the CAD, hose up the post and over to the dispenser
  nameplate('페이스트 도포', S.disp, 1.99, Z0 - 0.05, 0, 0.4); fp('페이스트 도포', S.disp - 0.15, S.disp + 0.15, Z0 - 0.5, Z0 + 0.5);
  stopper('Stop_cam', S.cam); gate(S.cam, 0.8, 1.7); camera(S.cam, 1.5, Z0, 'A_NozCam', PT + 0.1); nameplate('노즐 비전', S.cam, 1.84, Z0 - 0.05, 0, 0.36); fp('노즐 비전', S.cam - 0.15, S.cam + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopper('Stop_scale', S.scale); const sc = G('A_Scale', root, S.scale, BT - 0.2, Z0); box(sc, m.black, 0.36, 0.1, 0.5, 0, 0, 0); box(sc, m.steel, 0.3, 0.012, 0.26, 0, 0.056, 0); box(root, m.display, 0.14, 0.04, 0.004, S.scale, BT - 0.18, Z0 - 0.252); nameplate('도포 중량 검사', S.scale, BT - 0.3, Z0 - 0.26, 0, 0.32); }   // scale platform rises under the pallet between the belts
  { stopper('Stop_ngA', S.ngA); pusher('A_NG_Pusher', S.ngA, Z0 - 0.3, BT + 0.05); rollers(S.ngA - 0.25, S.ngA + 1.1, Z0 + 0.95, 0.42); nameplate('NG 배출', S.ngA + 0.4, BT + 0.25, Z0 + 1.2, 0, 0.36); }
  monitor('A_HMI', 3.4, Z0 - 1.4, 0.4); tower(S.aEnd - 0.2, Z0 - 1.5);

  // ================================================================ B. end tank assembly & scan laser welding (x 5.9 … 12.0)
  { stopper('Stop_turn', S.turn); const tu = G('B_Turn', root, S.turn, BT - 0.15, Z0); cyl(tu, m.frameDark, 0.14, 0.2, 0, 0, 0, 'y', 20); cyl(root, m.frameDark, 0.1, 0.5, S.turn, 0.35, Z0, 'y', 16); nameplate('팔레트 턴 유닛', S.turn, 0.45, Z0 - 0.11, 0, 0.3); }
  // tank feeders: the CAD's tank magazine conveyors (0.74 × 1.87 m, top 1.19 m) run across the line on both sides; a pick-and-place on a Z rail
  // takes the tank at the magazine's near end (Z0 ± 0.5) and sets it on the core end (Z0 ± 0.17)
  for (const sz of [-1, 1]) { const fx = S.tank, mz = Z0 + sz * 1.335, nm = sz < 0 ? '_L' : '_R';
    if (!part('tank-magazine', fx, mz, sz < 0 ? Math.PI : 0)) { box(root, m.sheet, 0.5, 0.86, 0.5, fx, 0.43, mz); for (let k = 0; k < 8; k++) tank(root, fx, 0.95 + k * 0.1, mz); }
    const px = fx + 0.47, pz = Z0 + sz * 0.95; prof(root, [px, 0.06, pz], [px, 2.12, pz], 0.06, m.frameDark); foot(root, px, pz); box(root, blue, 0.47, 0.1, 0.1, fx + 0.235, 2.12, pz); box(root, blue, 0.12, 0.12, 0.95, fx, 2.12, Z0 + sz * 0.52);   // post, bracket, Z rail
    const arm = G('B_TankArm' + nm, root, fx, 1.98, Z0 + sz * 0.5); box(arm, m.aluDark, 0.1, 0.1, 0.16, 0, 0.06, 0); box(arm, m.alu, 0.04, 0.6, 0.04, 0, -0.3, 0); box(arm, m.black, 0.12, 0.04, 0.08, 0, -0.62, 0); const t = G('B_TankArm' + nm + '_Tank', arm, 0, -0.66, 0); box(t, tankM, 0.1, 0.08, 0.05, 0, 0, 0);
    nameplate(sz < 0 ? '탱크 공급기 1' : '탱크 공급기 2', px, 1.5, pz - sz * 0.04, sz < 0 ? 0 : Math.PI, 0.3); fp('탱크 공급기 ' + (sz < 0 ? 1 : 2), fx - 0.37, fx + 0.53, Math.min(mz - 0.94, pz - 0.05), Math.max(mz + 0.94, pz + 0.05)); }
  stopper('Stop_tank', S.tank);
  for (const [k, px] of S.press.entries()) { stopper('Stop_press' + k, px); const sz = k ? 1 : -1, pz = Z0 + sz * 0.75; box(root, blue, 0.4, 1.3, 0.3, px, 0.65, pz + sz * 0.15); box(root, blue, 0.4, 0.22, 0.75, px, 1.17, pz - sz * 0.15); box(root, m.sheet, 0.42, 0.3, 0.3, px, 1.45, pz + sz * 0.15);
    const ram = G('B_Press_' + k, root, px, PT + YC, pz - sz * 0.42); cyl(ram, m.steel, 0.03, 0.3, 0, 0, 0, 'z', 12); box(ram, m.aluDark, 0.12, 0.12, 0.06, 0, 0, -sz * 0.17);
    nameplate('탱크 프레스 ' + (k + 1), px, 1.35, pz - sz * 0.53 + (sz < 0 ? 0.02 : -0.02), sz < 0 ? 0 : Math.PI, 0.36); fp('탱크 프레스 ' + (k + 1), px - 0.22, px + 0.22, Math.min(pz, pz + sz * 0.3), Math.max(pz, pz + sz * 0.3)); }
  stopper('Stop_vis', S.vis); gate(S.vis, 0.8, 1.7); camera(S.vis, 1.5, Z0, 'B_PressCam', PT + 0.1); nameplate('프레스 비전', S.vis, 1.84, Z0 - 0.05, 0, 0.36); fp('프레스 비전', S.vis - 0.15, S.vis + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopper('Stop_bstop', S.bstop); const R = robot('B', ...RBASE.B); if (R) { const g = gripper(R.tool, 'B_Grip_Part', Math.PI / 2); lookCore(G('B_Grip_Core', g)); lookPaste(G('B_Grip_Paste', g)); lookTanks(G('B_Grip_Tanks', g)); lookSeam(G('B_Grip_Seam', g)); } fp('핸들링 로봇 B', RBASE.B[0] - 0.25, RBASE.B[0] + 0.25, RBASE.B[1] - 0.25, RBASE.B[1] + 0.25); nameplate('핸들링 로봇 B', RBASE.B[0], 0.5, RBASE.B[1] - 0.19, 0, 0.3);
    const [cx, cz] = S.bcab; cabin('스캔 레이저 용접', cx - 0.3, cx + 0.3, cz - 0.65, cz + 0.35, 2.1, 'N'); fixture(cx, cz);
    // the CAD's scan laser head on its stand, lens towards the fixture (+Z), firing across at the tank seam
    if (!part('laser-scan-head', cx, cz - 0.4)) { box(root, m.black, 0.2, 0.22, 0.2, cx, 0.95, cz - 0.3); }
    const bm = G('B_Laser_Beam', root); cyl(bm, laserM, 0.003, 0.14, cx, 0.93, cz - 0.125, 'z', 6);
    stopper('Stop_bback', S.bback); }
  { stopper('Stop_bng', S.bng); pusher('B_NG_Pusher', S.bng, Z0 - 0.3, BT + 0.05); rollers(S.bng - 0.25, S.bng + 0.9, Z0 + 0.95, 0.42); nameplate('NG 배출', S.bng + 0.3, BT + 0.25, Z0 + 1.2, 0, 0.36); }
  monitor('B_HMI', 9.0, Z0 - 1.4, 0.4); tower(S.bEnd - 0.2, Z0 - 1.5);

  // ================================================================ C. tack welding (x 12.0 … 16.9): flange feeders, four MIG robots, manual MIG
  for (const [k, sz] of [[0, -1], [1, 1]]) { const fx = S.flange, fz = Z0 + sz * 1.35, pz = fz - sz * 0.56;
    // the CAD's flange index feeder (0.41 × 0.48 m) on a profile stand; the pick-and-place takes the flange off its index table at 0.87 m
    for (const sx of [-1, 1]) for (const s2 of [-1, 1]) { prof(root, [fx + sx * 0.17, 0.06, pz + s2 * 0.2], [fx + sx * 0.17, 0.56, pz + s2 * 0.2], 0.04); foot(root, fx + sx * 0.17, pz + s2 * 0.2); }
    box(root, m.aluDark, 0.42, 0.02, 0.48, fx, 0.565, pz);
    if (!part('flange-index-feeder', fx, pz, sz < 0 ? Math.PI : 0, 0.575)) { cyl(root, m.stainless, 0.2, 0.2, fx, 0.7, pz, 'y', 24); }
    prof(root, [fx + 0.3, 0.06, fz], [fx + 0.3, 1.7, fz], 0.06, m.frameDark); box(root, blue, 0.14, 0.12, 0.9, fx + 0.3, 1.7, fz - sz * 0.45); const pa = G('C_FlangeArm_' + k, root, fx, 1.6, fz - sz * 0.56); box(pa, m.aluDark, 0.3, 0.1, 0.1, 0.15, 0, 0); box(pa, m.alu, 0.04, 0.6, 0.04, 0, -0.3, 0); const f = G('C_FlangeArm_' + k + '_Flange', pa, 0, -0.62, 0); box(f, m.stainless, 0.15, 0.1, 0.012, 0, 0, 0);
    nameplate('플랜지 공급기 ' + (k + 1), fx + 0.3, 1.2, fz - sz * 0.05, sz < 0 ? 0 : Math.PI, 0.3); fp('플랜지 공급기 ' + (k + 1), fx - 0.22, fx + 0.36, Math.min(pz - 0.25, fz - 0.05), Math.max(pz + 0.25, fz + 0.05)); }
  stopper('Stop_flange', S.flange); gate(S.flange, 0.9, 1.6);
  S.mig.forEach((x, i) => { stopper('Stop_mig' + i, x); const R = robot('C' + i, x, MZ, 'FR10', RHM); if (R) { torch(R.tool); const ar = G('C' + i + '_Arc', R.tool); arcFx(ar, 0.255); }
    const bz = MZ - 0.75;   // welding power source + wire feeder from the CAD (0.29 × 0.72 m, 0.92 m tall), front to the aisle; wire drum beside it
    if (!part('welding-power-source', x, bz, Math.PI)) { box(root, m.red, 0.46, 0.9, 0.4, x, 0.45, bz); box(root, m.black, 0.42, 0.08, 0.36, x, 0.94, bz); }
    nameplate('MIG 용접기 ' + (i + 1), x - 0.33, 1.05, bz - 0.2, Math.PI, 0.26); prof(root, [x - 0.33, 0.06, bz - 0.2], [x - 0.33, 0.95, bz - 0.2], 0.03, m.frameDark);
    cyl(root, m.aluDark, 0.14, 0.35, x + 0.42, 0.175, bz, 'y', 20); cyl(root, m.black, 0.15, 0.02, x + 0.42, 0.36, bz, 'y', 20); box(root, m.aluDark, 0.06, 0.06, 0.4, x + 0.15, 0.95, MZ - 0.2); cyl(root, m.black, 0.012, 0.4, x + 0.15, 0.98, MZ - 0.2, 'z', 8);
    { const a = [x + 0.05, 0.93, bz + 0.1], b = [x, RHM - 0.08, MZ - 0.18], n = 6; for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n, sag = u => -0.25 * Math.sin(Math.PI * u), p = u => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + sag(u), a[2] + (b[2] - a[2]) * u]; prof(root, p(u0), p(u1), 0.022, m.black); } }   // welding cable: power source → robot pedestal
    fp('MIG 로봇 ' + (i + 1), x - 0.25, x + 0.25, bz - 0.36, MZ + 0.2); fp('MIG 와이어 드럼 ' + (i + 1), x + 0.28, x + 0.56, bz - 0.14, bz + 0.14); nameplate('MIG 로봇 ' + (i + 1), x, 0.4, MZ - 0.19, 0, 0.3); });
  { stopper('Stop_cturn', S.cturn); const tu = G('C_Turn', root, S.cturn, BT - 0.15, Z0); cyl(tu, m.frameDark, 0.14, 0.2, 0, 0, 0, 'y', 20); cyl(root, m.frameDark, 0.1, 0.5, S.cturn, 0.35, Z0, 'y', 16); nameplate('팔레트 턴 180°', S.cturn, 0.45, Z0 - 0.11, 0, 0.3); }
  { for (const [x, z] of [[S.mig[0] - 0.35, Z0 - 0.5], [S.mig[3] + 0.35, Z0 - 0.5], [S.mig[0] - 0.35, Z0 + 0.6], [S.mig[3] + 0.35, Z0 + 0.6]]) prof(root, [x, 0.06, z], [x, 2.6, z], 0.06, m.frameDark);   // fume hood on four posts
    const hx = (S.mig[0] + S.mig[3]) / 2; box(root, m.sheet, S.mig[3] - S.mig[0] + 0.5, 0.08, 1.2, hx, 2.6, Z0 + 0.05); box(root, m.sheet, 0.6, 0.3, 0.6, hx, 2.8, Z0 + 0.05); cyl(root, m.sheet, 0.13, 3.9, hx, 4.85, Z0 + 0.05, 'y', 20); for (const y of [3.4, 4.6, 5.8]) box(root, m.aluDark, 0.34, 0.03, 0.34, hx, y, Z0 + 0.05);   // exhaust duct up to the roof, with hanger plates
    plane(root, curtain, S.mig[3] - S.mig[0] + 1.2, 1.8, hx, 1.05, Z0 + 0.65, [0, 0, 0]); box(root, m.aluDark, S.mig[3] - S.mig[0] + 1.2, 0.03, 0.03, hx, 1.97, Z0 + 0.65); for (const x of [S.mig[0] - 0.6, S.mig[3] + 0.6]) { prof(root, [x, 0.06, Z0 + 0.65], [x, 2.0, Z0 + 0.65], 0.04, m.frameDark); foot(root, x, Z0 + 0.65); }   // welding screen on the far side
    { const sx = S.mig[3] + 0.8; for (const z of [Z0 - 2.25, Z0 - 0.4]) { prof(root, [sx, 0.06, z], [sx, 2.0, z], 0.04, m.frameDark); foot(root, sx, z); } box(root, m.aluDark, 0.03, 0.03, 1.85, sx, 1.97, Z0 - 1.325); plane(root, curtain, 1.8, 1.8, sx, 1.05, Z0 - 1.325, [0, Math.PI / 2, 0]); nameplate('차광 스크린', sx + 0.02, 1.75, Z0 - 1.325, Math.PI / 2, 0.3); fp('차광 스크린', sx - 0.05, sx + 0.05, Z0 - 2.3, Z0 - 0.35); }   // welding screen: robot 4 ↔ manual MIG operator
    stopper('Stop_manual', S.manual); const mt = balancer('C_Manual_Torch', S.manual + 0.5, Z0 - 1.45, 1.45, Math.PI * 0.72); cyl(mt, m.black, 0.015, 0.25, 0, 0, 0, 'y', 8); cyl(mt, m.orange, 0.01, 0.05, 0, -0.14, 0, 'y', 8); const ma = G('C_Manual_Arc', root, S.manual + 0.02, PT + 0.03, Z0 - 0.14); arcFx(ma, 0, true);
    box(root, m.red, 0.4, 0.6, 0.35, S.manual + 0.5, 0.3, Z0 - 1.95); nameplate('수동 MIG', S.manual + 0.5, 0.45, Z0 - 2.13, Math.PI, 0.3); fp('수동 MIG', S.manual + 0.25, S.manual + 0.75, Z0 - 2.15, Z0 - 1.25); }
  monitor('C_HMI', S.cEnd - 0.4, Z0 - 1.4, 0.4); tower(S.cEnd - 0.2, Z0 - 1.5);

  // ================================================================ D. C/F check, external paste, manual check (x 16.9 … 20.5)
  // C/F tester and laser marking: inspection tunnels (the catalogue's pallet scanner, rv_scanner, scale 0.7: 1.42 × 1.36 × 1.54 m, opening along X)
  // are placed over the conveyor by tools/egr-module-asset-layout.py from this station table; only the moving heads inside are modelled here
  const TUN = [0.71, 0.68, 1.54];
  { stopper('Stop_cf', S.cf); fp('C/F 검사 터널', S.cf - TUN[0], S.cf + TUN[0], Z0 - TUN[1], Z0 + TUN[1]); const hd = G('D_CF_Hood', root, S.cf, 1.28, Z0); box(hd, m.yellow, 0.4, 0.26, 0.34, 0, 0, 0); box(hd, glass, 0.3, 0.1, 0.28, 0, 0, 0); box(root, m.aluDark, 0.05, 0.14, 0.05, S.cf, 1.47, Z0);   // test hood hung from the tunnel roof
    const ok = G('D_CF_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.cf + 0.5, TUN[2] + 0.04, Z0 - 0.5, 'y', 14); }
  { stopper('Stop_paste', S.paste); gate(S.paste, 0.9, 1.85); const gx = G('D_Disp_X', root, S.paste, 0, Z0), gz = G('D_Disp_Z', gx), gy = G('D_Disp_Y', gz); box(gx, m.aluDark, 0.14, 0.1, 0.9, 0, 1.85, 0); box(gz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.79, 0); box(gy, m.alu, 0.05, 0.5, 0.05, 0, 1.5, 0); box(gy, m.yellow, 0.1, 0.16, 0.1, 0, 1.32, 0); cyl(gy, m.black, 0.03, 0.1, 0, 1.19, 0, 'y', 12); cyl(gy, m.steel, 0.004, 0.06, 0, 1.11, 0, 'y', 6);
    let tanks = 0; for (let k = 0; k < 4; k++) if (part('paste-tank', S.paste - 0.96 + k * 0.64, Z0 + 1.2)) tanks++;   // four pressure tanks from the CAD, one per paste
    if (!tanks) { box(root, m.sheet, 1.4, 0.8, 0.5, S.paste, 0.4, Z0 + 1.15); for (let k = 0; k < 4; k++) cyl(root, magenta, 0.12, 0.5, S.paste - 0.5 + k * 0.34, 1.06, Z0 + 1.15, 'y', 20); }
    cyl(root, m.black, 0.012, 0.75, S.paste, 1.75, Z0 + 0.8, 'z', 8); prof(root, [S.paste, 1.12, Z0 + 1.2], [S.paste, 1.75, Z0 + 1.2], 0.03, m.frameDark);
    nameplate('외부 페이스트 도포', S.paste, 1.99, Z0 - 0.05, 0, 0.44); nameplate('페이스트 탱크 ×4', S.paste - 0.32, 1.3, Z0 + 0.95, 0, 0.36); fp('페이스트 탱크', S.paste - 1.27, S.paste + 1.27, Z0 + 0.96, Z0 + 1.44); fp('외부 도포', S.paste - 0.15, S.paste + 0.15, Z0 - 0.5, Z0 + 0.5); }
  { stopper('Stop_check', S.check); for (const sz of [-1, 1]) prof(root, [S.check, 0.06, Z0 + sz * 0.42], [S.check, 1.7, Z0 + sz * 0.42], 0.04); box(root, m.aluDark, 0.08, 0.04, 0.9, S.check, 1.72, Z0); box(root, m.light, 0.06, 0.012, 0.7, S.check, 1.695, Z0);
    cyl(root, m.frameDark, 0.015, 0.5, S.check + 0.3, 1.3, Z0 - 0.42, 'y', 8); cyl(root, glass, 0.09, 0.012, S.check + 0.3, 1.42, Z0 - 0.3, 'z', 20); cyl(root, m.black, 0.1, 0.01, S.check + 0.3, 1.42, Z0 - 0.31, 'z', 20); nameplate('수동 검사', S.check, 1.86, Z0 - 0.05, 0, 0.36); }
  tower(S.dEnd - 0.2, Z0 - 1.5);

  // ================================================================ E. leak test (x 20.5 … 27.3)
  { stopper('Stop_eturn', S.eturn); const tu = G('E_Turn', root, S.eturn, BT - 0.15, Z0); cyl(tu, m.frameDark, 0.14, 0.2, 0, 0, 0, 'y', 20); cyl(root, m.frameDark, 0.1, 0.5, S.eturn, 0.35, Z0, 'y', 16); box(root, m.black, 0.06, 0.06, 0.1, S.eturn - 0.35, BT + 0.3, Z0 - 0.4); box(root, m.red, 0.004, 0.02, 0.06, S.eturn - 0.32, BT + 0.3, Z0 - 0.4); prof(root, [S.eturn - 0.35, 0.06, Z0 - 0.42], [S.eturn - 0.35, BT + 0.35, Z0 - 0.42], 0.03); nameplate('바코드 · 턴 유닛', S.eturn, 0.45, Z0 - 0.11, 0, 0.3); }
  stopper('Stop_evis', S.evis); gate(S.evis, 0.8, 1.7); camera(S.evis, 1.5, Z0, 'E_VisCam', PT + 0.1); nameplate('외관 검사', S.evis, 1.84, Z0 - 0.05, 0, 0.36); fp('외관 검사', S.evis - 0.15, S.evis + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopper('Stop_estop', S.estop); const R = robot('E', ...RBASE.E); if (R) { const g = gripper(R.tool, 'E_Grip_Part', Math.PI / 2); lookCore(G('E_Grip_Core', g)); lookPaste(G('E_Grip_Paste', g)); lookTanks(G('E_Grip_Tanks', g)); lookSeam(G('E_Grip_Seam', g)); for (const sx of [-1, 1]) lookFlange(G('E_Grip_Flange' + (sx < 0 ? 'L' : 'R'), g), sx); lookPipes(G('E_Grip_Pipes', g)); } fp('핸들링 로봇 E', RBASE.E[0] - 0.25, RBASE.E[0] + 0.25, RBASE.E[1] - 0.25, RBASE.E[1] + 0.25); nameplate('핸들링 로봇 E', RBASE.E[0], 0.5, RBASE.E[1] - 0.19, 0, 0.3);
    const [cx, cz] = S.ecab; cabin('리크 테스터', cx - 0.3, cx + 0.3, cz - 0.45, cz + 0.35, 2.0, 'N'); fixture(cx, cz);
    const hood = G('E_Hood', root, cx, 1.5, cz); box(hood, glass, 0.4, 0.3, 0.34, 0, 0, 0); box(hood, m.yellow, 0.42, 0.03, 0.36, 0, 0.165, 0); box(root, m.aluDark, 0.08, 0.5, 0.08, cx, 1.85, cz);
    const ok = G('E_Leak_OK', root); cyl(ok, m.lampG, 0.032, 0.06, cx + 0.4, 1.5, cz - 0.1, 'y', 14); const ng = G('E_Leak_NG', root); cyl(ng, m.lampR, 0.032, 0.06, cx + 0.4, 1.5, cz + 0.1, 'y', 14); prof(root, [cx + 0.4, 0.06, cz], [cx + 0.4, 1.45, cz], 0.03, m.frameDark);
    stopper('Stop_eback', S.eback); }
  { stopper('Stop_mark', S.mark); fp('레이저 마킹 터널', S.mark - TUN[0], S.mark + TUN[0], Z0 - TUN[1], Z0 + TUN[1]); box(root, m.aluDark, 0.05, 0.16, 0.05, S.mark, 1.46, Z0); const h = G('E_MarkHead', root, S.mark, 1.3, Z0); box(h, m.black, 0.18, 0.16, 0.18, 0, 0, 0); cyl(h, m.steel, 0.04, 0.04, 0, -0.1, 0, 'y', 12); const bm = G('E_Mark_Beam', h); cyl(bm, laserM, 0.003, 0.2, 0, -0.22, 0, 'y', 6); }   // galvo head hung from the tunnel roof
  { stopper('Stop_nut', S.nut); const nr = balancer('E_Nutrunner', S.nut + 0.5, Z0 + 0.75, 1.5, Math.PI * 1.25); cyl(nr, m.black, 0.02, 0.4, 0, 0, 0, 'y', 10); cyl(nr, m.yellow, 0.03, 0.08, 0, 0.1, 0, 'y', 10); cyl(nr, m.steel, 0.006, 0.08, 0, -0.24, 0, 'y', 6);
    box(root, m.aluDark, 0.4, 0.03, 0.3, S.nut, 0.9, Z0 - 0.7); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [S.nut + sx * 0.17, 0.06, Z0 - 0.7 + sz * 0.12], [S.nut + sx * 0.17, 0.885, Z0 - 0.7 + sz * 0.12], 0.04); for (let k = 0; k < 3; k++) cyl(root, m.rubber, 0.04, 0.004, S.nut - 0.1 + k * 0.1, 0.918, Z0 - 0.7, 'y', 16); cyl(root, m.sheet, 0.12, 0.3, S.nut + 0.25, 1.05, Z0 - 0.7, 'y', 16);
    nameplate('가스켓 · 볼트 체결', S.nut, 0.9, Z0 - 0.86, 0, 0.36); fp('가스켓 · 볼트', S.nut - 0.22, S.nut + 0.4, Z0 - 0.9, Z0 - 0.5); }
  { stopper('Stop_okng', S.okng); gate(S.okng, 0.8, 1.6); const ok = G('E_OKNG_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.okng, 1.65, Z0 - 0.4, 'y', 14); const ng = G('E_OKNG_NG', root); cyl(ng, m.lampR, 0.032, 0.06, S.okng, 1.65, Z0 + 0.4, 'y', 14); nameplate('OK / NG 분기', S.okng, 1.74, Z0 - 0.05, 0, 0.36);
    pusher('E_NG_Pusher', S.okng, Z0 - 0.3, BT + 0.05); rollers(S.okng - 0.25, S.okng + 1.1, Z0 + 0.95, 0.42); nameplate('NG 보관', S.okng + 0.4, BT + 0.25, Z0 + 1.2, 0, 0.36); }
  { // packer: a 2-axis pick-and-place lifts the finished cooler off the pallet into the carton on the stand (x pack, z −1.05)
    stopper('Stop_pack', S.pack); const bx = S.pack, bz = Z0 - 1.05; box(root, m.sheet, 0.7, 0.55, 0.6, bx, 0.275, bz); box(root, m.black, 0.72, 0.02, 0.62, bx, 0.56, bz); nameplate('완제품 상자 스탠드', bx, 0.35, bz - 0.31, 0, 0.36); fp('상자 스탠드 E', bx - 0.35, bx + 0.35, bz - 0.3, bz + 0.3);
    for (const sx of [-1, 1]) { prof(root, [bx + sx * 0.5, 0.06, Z0 + 0.5], [bx + sx * 0.5, 2.1, Z0 + 0.5], 0.06, m.frameDark); prof(root, [bx + sx * 0.5, 0.06, bz - 0.45], [bx + sx * 0.5, 2.1, bz - 0.45], 0.06, m.frameDark); box(root, blue, 0.12, 0.12, Z0 + 0.5 - (bz - 0.45), bx + sx * 0.5, 2.1, (Z0 + 0.5 + bz - 0.45) / 2); }
    const gz = G('E_Packer_Z', root, bx, 0, Z0), gy = G('E_Packer_Y', gz); box(gz, m.aluDark, 1.16, 0.14, 0.16, 0, 2.1, 0); box(gy, m.alu, 0.05, 0.9, 0.05, 0, 1.55, 0); box(gy, m.aluDark, 0.14, 0.03, 0.2, 0, 1.1, 0); for (const sz of [-1, 1]) box(gy, m.black, 0.12, 0.08, 0.012, 0, 1.06, sz * 0.1);
    const pp = G('E_Packer_Part', gy, 0, 1.015, 0); pp.rotation.y = Math.PI / 2; lookCore(pp); lookTanks(pp); for (const sx of [-1, 1]) lookFlange(G('E_Packer_F' + (sx < 0 ? 'L' : 'R'), pp), sx); lookPipes(pp); lookMark(pp); nameplate('완제품 포장 로더', bx, 2.25, Z0 - 1.5, 0, 0.44); }
  monitor('E_HMI', S.eturn + 0.8, Z0 - 1.4, 0.4); tower(S.eEnd - 0.2, Z0 - 1.5);

  // ================================================================ the four operators (the only manual stations, as in the CAD): the catalogue's factory worker
  // as a rigid figure on a rig W_n_X › W_n_Z › W_n (turn) › W_n_Lean; W_n_Carry holds what they carry. Home spots face the line (+Z).
  const operator = (n, x, z) => { const wx = G('W_' + n + '_X', root, x, 0, 0), wz = G('W_' + n + '_Z', wx, 0, 0, z), wr = G('W_' + n, wz), wl = G('W_' + n + '_Lean', wr);
    const src = (globalThis.PARTS || {}).worker; if (src) { const o = src.clone(true), b = new THREE.Box3().setFromObject(o); o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); wl.add(o); }
    else { box(wl, m.sheet, 0.4, 1.7, 0.25, 0, 0.85, 0); }
    return G('W_' + n + '_Carry', wr, 0, 0.92, 0.32); };
  const HOMES = { 1: [S.tote, Z0 - 1.45], 2: [S.manual - 0.1, Z0 - 0.8], 3: [S.check, Z0 - 0.85], 4: [S.pack, Z0 - 1.95] };
  { const c1 = operator(1, ...HOMES[1]), t = G('W_1_Tote', c1); box(t, m.tote, 0.6, 0.22, 0.4, 0, 0.0, 0); box(t, m.black, 0.62, 0.02, 0.42, 0, 0.11, 0);   // core tote (empty out, full back)
    operator(2, ...HOMES[2]); operator(3, ...HOMES[3]);
    const c4 = operator(4, ...HOMES[4]), ct = G('W_4_Carton', c4); box(ct, cardboard, 0.5, 0.36, 0.4, 0, 0, 0);
    const cs = G('E_Pack_Carton', root, S.pack, 0.56 + 0.18, Z0 - 1.05); box(cs, cardboard, 0.5, 0.36, 0.4, 0, 0, 0); }   // the carton on the stand the packer fills
  TABLE.homes = HOMES;

  // ================================================================ guard fences: automatic cells fenced on both sides, openings at the manual stations
  fenceRun(-1.4, Z0 - 2.4, S.cEnd, Z0 - 2.4, [S.manual + 0.5, Z0 - 2.4]); fenceRun(-1.4, Z0 + 2.9, S.eEnd + 0.6, Z0 + 2.9);
  fenceRun(-1.4, Z0 - 2.4, -1.4, Z0 + 2.9, [-1.4, Z0 - 0.5]); fenceRun(S.eEnd + 0.6, Z0 - 2.4, S.eEnd + 0.6, Z0 + 2.9, [S.eEnd + 0.6, Z0 - 0.5]);
  fenceRun(S.dEnd + 0.4, Z0 - 2.4, S.eEnd + 0.6, Z0 - 2.4, [S.pack, Z0 - 2.4]);

  // ================================================================ pallets and parts: Pal_i (x / y / ry, with clamps) carries Part_i; Part_i has its own rig for the robot / packer hand-offs
  const N = MODULE_T / MODULE_P;
  for (let i = 0; i < N; i++) {
    const PN = 'Pal_' + (i + 1), px = G(PN + '_X', root, S.merge, BT, Z0), py = G(PN + '_Y', px), pr = G(PN, py); palletGeo(pr, PN);
    const QN = 'Part_' + (i + 1), x = G(QN + '_X', root, 0, PT, Z0), y = G(QN + '_Y', x), z = G(QN + '_Z', y), p = G(QN, z), lk = G(QN + '_Look', p);
    lookCore(G(QN + '_Core', lk)); lookPaste(G(QN + '_Paste', lk)); lookTanks(G(QN + '_Tanks', lk)); lookSeam(G(QN + '_Seam', lk)); for (const sx of [-1, 1]) lookFlange(G(QN + '_Flange' + (sx < 0 ? 'L' : 'R'), lk), sx); lookPipes(G(QN + '_Pipes', lk)); lookMark(G(QN + '_Mark', lk));
  }
  const bad = [];
  for (let a = 0; a < FOOT.length; a++) for (let b = a + 1; b < FOOT.length; b++) { const A = FOOT[a], B = FOOT[b]; const conv = F => /^컨베이어|^스파인/.test(F[0]), straddles = F => F[3] < Z0 && F[4] > Z0 && !conv(F);
    if ((conv(A) && (conv(B) || straddles(B))) || (conv(B) && straddles(A))) continue;
    if (A[1] < B[2] - 0.02 && B[1] < A[2] - 0.02 && A[3] < B[4] - 0.02 && B[3] < A[4] - 0.02) bad.push(A[0] + ' × ' + B[0]); }
  if (bad.length) throw new Error('machine footprints overlap: ' + bad.join(', '));
  root.userData.homes = HOMES; root.userData.table = TABLE; const model = animate(pbrClamp(finalize(root)), robots);   // rule set v2.0 §5: machine surfaces metalness 0.5–0.8, roughness 0.2–0.4 (after finalize builds the meshes)
  return model;
}

// rule set v2.0 §5 (rules/smart-factory-standard-v2.md): machines and equipment in MeshStandardMaterial with metalness 0.5–0.8 and roughness
// 0.2–0.4. Glass, curtains, lamps, screens, beams, arcs and printed plates keep their own values (they are not machine surfaces).
const PBR_EXEMPT = /glass|polycarbonate|acryl|curtain|^lamp_|led_ring|ring_light|screen|display|beam|weld_arc|^plate_|label|syringe/i;
function pbrClamp(root) {
  const done = new Map(), cl = (v, a, b) => Math.min(b, Math.max(a, v));
  root.traverse(o => { if (!o.isMesh) return; const one = mt => { if (!mt || !mt.isMeshStandardMaterial || mt.transparent || PBR_EXEMPT.test(mt.name) || (mt.emissiveIntensity > 0 && mt.emissive && mt.emissive.getHex())) return mt;
      if (!done.has(mt)) { const c = mt.clone(); c.metalness = cl(mt.metalness, 0.5, 0.8); c.roughness = cl(mt.roughness, 0.2, 0.4); done.set(mt, c); } return done.get(mt); };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  return root;
}

// ---------------------------------------------------------------- the cycle
function animate(root, robots) {
  const T = MODULE_T, P = MODULE_P, N = T / P, V = (x, y, z) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
  const ease = u => u * u * (3 - 2 * u), ch = {}, add = (node, c, list) => { if (!root.getObjectByName(node)) throw new Error('no node ' + node); const key = node + '|' + c; (ch[key] || (ch[key] = [])).push(...list); };
  const ser = (evs, rest) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); const f = t => { let k = -1; while (k + 1 < evs.length && evs[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === evs.length - 1) return evs[k][1]; const [t0, v0] = evs[k], [t1, v1] = evs[k + 1]; return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1); }; return [[0, f(0)], ...evs.filter(e => e[0] > 0 && e[0] < T), [T, f(T)]]; };
  const vis = (evs, v0) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); let s = v0; for (const [t, v] of evs) if (t <= 0) s = v; return [[0, s], ...evs.filter(e => e[0] > 0 && e[0] < T)]; };
  const flash = (node, t0, t1) => add(node, 'vis', [[t0, true], [t1, false]]);
  const head = (node, t0, t1, d) => add(node, 'y', [[t0, 0], [t0 + 1.0, -d], [t1 - 1.0, -d], [t1, 0]]);
  const AXN = ['ry', 'rz', 'rz', 'rz', 'ry', 'rz'], TIPL = V(0, 0, 0.101 + 0.165), H = 0.12;
  const rig = (key, tip = TIPL) => robots[key] ? ikRig(root, robots[key].J, tip) : null;
  const playRobot = (key, rp, t0) => { if (!robots[key]) return; robots[key].J.forEach((j, q) => add(j.name, AXN[q], [[t0 - 0.01, 0], ...rp.wp.map(([t, v]) => [t0 + t, v[q] - rp.rest[q]]), [t0 + rp.T + 0.01, 0]])); };
  // robot paths
  const rigA = rig('A');
  const pathA = li => { const sz = li ? 1 : -1, lz = LANES[li], y0 = BT + YC, y1 = PT + YC;   // lane roller end → the pallet cradle at the merge stop
    return rigA && rigA.trace([[HOME.A(li), 0], [[RBASE.A[0] - 0.1, RH + 0.4, Z0 + sz * 0.5], 0.8], [[S.lane, y0 + H, lz], 1.2], [[S.lane, y0, lz], 0.6], [[S.lane, y0, lz], 0.3, 'grip'], [[S.lane, y0 + H, lz], 0.5],
      [[S.merge, y1 + H, Z0], 1.6], [[S.merge, y1 + 0.003, Z0], 0.5], [[S.merge, y1 + 0.003, Z0], 0.3, 'release'], [[S.merge, y1 + H, Z0], 0.4], [[RBASE.A[0] - 0.1, RH + 0.4, Z0 + sz * 0.5], 1.0], [HOME.A(li), 0.6]], 'A robot lane ' + li); };
  const RA = rigA ? [pathA(0), pathA(1)] : null;
  const pathSide = (key, home, base, stopX, cab, backX, label) => { const rg = rig(key); if (!rg) return null; const y0 = PT + YC, [cx, cz] = cab, yc = FIXY + YC, out = [base[0] - 0.5, RH + 0.2, base[1]];
    return rg.trace([[home, 0], [out, 0.8], [[stopX, y0 + H, Z0], 1.2], [[stopX, y0, Z0], 0.6], [[stopX, y0, Z0], 0.3, 'grip'], [[stopX, y0 + H, Z0], 0.5], [[stopX + 0.3, y0 + H + 0.05, Z0 - 0.15], 0.6], [[cx, yc + H, cz], 1.4], [[cx, yc + 0.003, cz], 0.6], [[cx, yc + 0.003, cz], 0.3, 'put'], [[cx, yc + H, cz], 0.5], [[cx - 0.25, yc + H + 0.1, cz - 0.1], 0.6], [home, 1.0], [home, 10.0, 'wait'],
      [[cx, yc + H, cz], 1.4], [[cx, yc + 0.003, cz], 0.6], [[cx, yc + 0.003, cz], 0.3, 'take'], [[cx, yc + H, cz], 0.5], [[backX, y0 + H, Z0], 1.8], [[backX, y0 + 0.003, Z0], 0.5], [[backX, y0 + 0.003, Z0], 0.3, 'release'], [[backX, y0 + H, Z0], 0.4], [[base[0], y0 + H, Z0], 0.8], [out, 0.8], [home, 0.8]], label); };
  const RB = pathSide('B', HOME.B, RBASE.B, S.bstop, S.bcab, S.bback, 'B robot'), RE = pathSide('E', HOME.E, RBASE.E, S.estop, S.ecab, S.eback, 'E robot');
  const RM = (() => { if (!robots.C0) return null; const rg = ikRig(root, robots.C0.J, V(0, 0, 0.255)), bx = S.mig[0], yj = PT + YC, zj = Z0 - 0.146, r = 0.052;   // MIG torch: upper half of the near flange ring (traced on C0, reused)
    const arc = []; for (let i = 0; i <= 6; i++) { const a = 0.25 + (Math.PI - 0.5) * i / 6; arc.push([[bx + r * Math.cos(a), yj + r * Math.sin(a) + 0.004, zj - 0.012], i ? 0.55 : 0.3, i === 0 ? 'weld0' : i === 6 ? 'weld1' : undefined]); }
    return rg.trace([[[bx, RHM + 0.55, MZ + 0.45], 0], [[bx + 0.2, 1.2, Z0 - 0.55], 1.0], [[bx + r + 0.03, yj + 0.1, zj - 0.012], 0.8], ...arc, [[bx - r - 0.02, yj + 0.1, zj - 0.012], 0.4], [[bx - 0.2, 1.2, Z0 - 0.55], 0.8], [[bx, RHM + 0.55, MZ + 0.45], 0.8]], 'MIG robot'); })();

  const CV = 0.4, RV = 0.6;   // belt speed, return speed
  for (let jj = -2; jj < N + 2; jj++) {
    const k = ((jj % N) + N) % N, QN = 'Part_' + (k + 1), PN = 'Pal_' + (k + 1), s = jj * P, li = k % 2, lz = LANES[li], dNG = k === 5, lNG = k === 2;
    const PK = [], VIS = [], RY = [], PX = [], PY = [], PRY = [], CL = []; let cx = S.merge, ct = 0;
    const at = (t, pos) => PK.push([s + t, pos]), show = (t, v) => VIS.push([s + t, v]), ry = (t, v) => RY.push([s + t, v]);
    const palAt = (t, x, y = BT) => { PX.push([s + t, x - S.merge]); PY.push([s + t, y - BT]); }, palRy = (t, v) => PRY.push([s + t, v]), clamp = (t, closed) => CL.push([s + t, closed ? 0 : -1.4]);
    const partOnPallet = (t, x, y = PT) => at(t, [x, y, Z0]);
    const release = name => add(name, 'y', [[s + ct - 0.4, 0], [s + ct, -0.11], [s + ct + 1.6, -0.11], [s + ct + 2.0, 0]]);   // the pallet stop drops as the pallet leaves
    const conv = (x1, stopName) => { if (stopName) release(stopName); const t1 = ct + Math.abs(x1 - cx) / CV; palAt(ct, cx); partOnPallet(ct, cx); palAt(t1, x1); partOnPallet(t1, x1); cx = x1; ct = t1; return t1; };
    const dwell = dt => { const t0 = ct; ct = t0 + dt; return t0; };
    const finish = () => { PK.sort((a, b) => a[0] - b[0]); for (const [cc, q] of [['x', 0], ['y', 1], ['z', 2]]) add(QN + '_' + cc.toUpperCase(), cc, PK.map(([t, p]) => [t, p[q] - [0, PT, Z0][q]])); add(QN, 'vis', VIS); add(QN, 'ry', RY);
      add(PN + '_X', 'x', PX); add(PN + '_Y', 'y', PY); add(PN, 'ry', PRY); add(PN + '_ClampL', 'rx', CL.map(([t, v]) => [t, v])); add(PN + '_ClampR', 'rx', CL.map(([t, v]) => [t, -v])); };
    // ---- A: loader gantry tote → lane; lane rollers; centring, direction, fin vision, barcode at the end stop; robot A → pallet; clamps close
    { const tz = Z0 + (li ? 0.2 : -0.2), slot = (k >> 1) % 3, sx = (slot - 1) * 0.22;   // the loader takes core k from the tote (slot by part number) and sets it on this part's lane
      add('A_Loader_Z', 'z', [[s - 9, 0], [s - 8, tz - Z0], [s - 5, tz - Z0], [s - 3.5, lz - Z0], [s - 1, lz - Z0], [s, 0]]); add('A_Loader_X', 'x', [[s - 9, 0], [s - 8, sx], [s - 5, sx], [s - 3.5, 0.1 - S.tote], [s - 1, 0.1 - S.tote], [s, 0]]);
      add('A_Loader_Y', 'y', [[s - 8, 0], [s - 7, -(1.015 - 0.58)], [s - 6, -(1.015 - 0.58)], [s - 5, 0], [s - 3.5, 0], [s - 2.5, -(1.015 - BT)], [s - 1.8, -(1.015 - BT)], [s - 1, 0]]);
      flash('A_Loader_Part', s - 6, s - 1.8); add('A_Tote_Core_' + ((k >> 1) % 3 + (li ? 3 : 0)), 'vis', [[s - 6, false], [s + 30, true]]); }
    show(0, true); ry(0, 0); at(-1.8, [0.1, BT, lz]); at(0, [0.1, BT, lz]); at(5, [S.lane, BT, lz]);
    for (const sd of ['_L', '_R']) add('A_Center_' + li + sd, 'z', [[s + 1.5, 0], [s + 2.2, sd === '_L' ? 0.06 : -0.06], [s + 3.2, sd === '_L' ? 0.06 : -0.06], [s + 3.8, 0]]);
    flash('A_FinCam_' + li, s + 3.6, s + 4.0);
    const ra = s + 6.0, rA = RA ? RA[li] : null;
    palAt(0, S.merge); clamp(0, false);   // the empty pallet waits at the merge stop, clamps open
    if (rA) { playRobot('A', rA, ra); const e = rA.ev; at(ra + e.grip - s, [S.lane, BT, lz]); show(ra + e.grip - s, false); flash('A_Grip_Part', ra + e.grip, ra + e.release); partOnPallet(ra + e.release - s, S.merge); show(ra + e.release - s, true); ct = ra + e.release - s; }
    else { partOnPallet(14, S.merge); ct = 14; }
    clamp(ct + 0.3, false); clamp(ct + 1.2, true); ct += 2.0;
    conv(S.prof, 'Stop_merge'); { const t0 = dwell(6); head('A_ProfHead', s + t0 + 0.8, s + t0 + 5.2, 0.5); flash('A_Profile', s + t0 + 1.8, s + t0 + 4.4); }
    conv(S.disp, 'Stop_prof'); { const t0 = dwell(10); add('A_Disp_Y', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 8.5, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 9.5, 0]]);
      add('A_Disp_X', 'x', [[s + t0 + 2, -0.093], [s + t0 + 5, -0.093], [s + t0 + 5.4, 0.093], [s + t0 + 8.5, 0.093], [s + t0 + 9.5, 0]]); add('A_Disp_Z', 'z', [[s + t0 + 2, -0.04], [s + t0 + 5, 0.04], [s + t0 + 5.4, -0.04], [s + t0 + 8.5, 0.04], [s + t0 + 9.5, 0]]); add(QN + '_Paste', 'vis', [[s, false], [s + t0 + 8.5, true]]); }
    conv(S.cam, 'Stop_disp'); { const t0 = dwell(3); flash('A_NozCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.scale, 'Stop_cam'); { const t0 = dwell(4); add('A_Scale', 'y', [[s + t0, 0], [s + t0 + 0.8, 0.19], [s + t0 + 3.2, 0.19], [s + t0 + 4, 0]]); palAt(t0 + 0.8, S.scale, BT + 0.02); palAt(t0 + 3.2, S.scale, BT + 0.02); partOnPallet(t0 + 0.8, S.scale, PT + 0.02); partOnPallet(t0 + 3.2, S.scale, PT + 0.02); }
    conv(S.ngA, 'Stop_scale');
    if (dNG) { const t0 = dwell(1); add('A_NG_Pusher', 'z', [[s + t0, 0], [s + t0 + 1.2, 0.95], [s + t0 + 2.4, 0]]); palAt(t0, S.ngA); partOnPallet(t0, S.ngA); add(PN + '_X', 'z', [[s + t0, 0], [s + t0 + 1.2, 0.95], [s + t0 + 20, 0.95], [s + t0 + 22, 0]]);
      at(t0 + 1.2, [S.ngA, PT, Z0 + 0.95]); at(t0 + 5, [S.ngA + 0.9, PT, Z0 + 0.95]); show(t0 + 5, false); palAt(t0 + 1.2, S.ngA); palAt(t0 + 5, S.ngA + 0.9); palAt(t0 + 18, S.ngA + 0.9); palAt(t0 + 20, S.ngA); palAt(t0 + 60, S.ngA); palAt(t0 + 60 + (S.ngA - S.merge) / RV, S.merge);   // the NG pallet is unloaded by hand, pushed back and runs empty back to the merge stop (simplified: along the upper level)
      finish(); continue; }
    // ---- B: pallet turn → tank feeders → presses → vision → robot takes the core into the laser cabin and back → NG divert → outfeed
    conv(S.turn, 'Stop_ngA'); { const t0 = dwell(5); add('B_Turn', 'ry', [[s + t0 + 1, 0], [s + t0 + 3.5, Math.PI / 2], [s + t0 + 4.2, Math.PI / 2], [s + t0 + 4.21, 0]]); palRy(t0 + 1, 0); palRy(t0 + 3.5, Math.PI / 2); ry(t0 + 1, 0); ry(t0 + 3.5, Math.PI / 2); }
    conv(S.tank, 'Stop_turn'); { const t0 = dwell(9); for (const sd of ['_L', '_R']) { const sg = sd === '_L' ? -1 : 1; add('B_TankArm' + sd, 'y', [[s + t0, 0], [s + t0 + 1, -0.1], [s + t0 + 1.8, -0.1], [s + t0 + 2.6, 0], [s + t0 + 4.4, 0], [s + t0 + 5.4, -(1.32 - (PT + YC))], [s + t0 + 6.6, -(1.32 - (PT + YC))], [s + t0 + 7.6, 0]]);   // down onto the magazine's end tank, up, along the rail, down onto the core end
      add('B_TankArm' + sd, 'z', [[s + t0 + 2.6, 0], [s + t0 + 4.4, -sg * 0.33], [s + t0 + 7.6, -sg * 0.33], [s + t0 + 9, 0]]); add('B_TankArm' + sd + '_Tank', 'vis', [[s + t0 + 1.8, true], [s + t0 + 6.6, false]]); } add(QN + '_Tanks', 'vis', [[s, false], [s + t0 + 6.6, true]]); }
    for (const [k2, px] of S.press.entries()) { conv(px, k2 ? 'Stop_press0' : 'Stop_tank'); const t0 = dwell(6), sg = k2 ? 1 : -1; add('B_Press_' + k2, 'z', [[s + t0 + 1, 0], [s + t0 + 2.2, sg * 0.29], [s + t0 + 4, sg * 0.29], [s + t0 + 5, 0]]); }
    conv(S.vis, 'Stop_press1'); { const t0 = dwell(3); flash('B_PressCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.bstop, 'Stop_vis'); { const t0 = ct, rb = s + t0 + 1.5; clamp(t0 + 0.2, true); clamp(t0 + 1.0, false);
      if (RB) { playRobot('B', RB, rb); const e = RB.ev; partOnPallet(rb + e.grip - s, S.bstop); show(rb + e.grip - s, false); flash('B_Grip_Part', rb + e.grip, rb + e.put); flash('B_Grip_Part', rb + e.take, rb + e.release);
        at(rb + e.put - s, [S.bcab[0], FIXY, S.bcab[1]]); show(rb + e.put - s, true); flash('B_Laser_Beam', rb + e.put + 2.2, rb + e.take - 2.2); add(QN + '_Seam', 'vis', [[s, false], [rb + e.take - 2.2, true]]); flash('B_Grip_Seam', rb + e.take, rb + e.release);
        at(rb + e.take - s, [S.bcab[0], FIXY, S.bcab[1]]); show(rb + e.take - s, false);
        // the empty pallet moves on to the back stop while the robot works, and receives the part there
        release('Stop_bstop'); palAt(t0 + 1.0, S.bstop); palAt(t0 + 1.0 + (S.bback - S.bstop) / CV, S.bback); cx = S.bback;
        partOnPallet(rb + e.release - s, S.bback); show(rb + e.release - s, true); ct = rb + e.release - s + 0.5; clamp(ct, false); clamp(ct + 0.8, true); ct += 1.5; }
      else { ct = t0 + 30; cx = S.bback; partOnPallet(ct, S.bback); } }
    conv(S.bng, 'Stop_bback'); dwell(1);
    // ---- C: flanges from both feeders at one stop; four MIG robots; manual MIG
    conv(S.flange, 'Stop_bng'); { const t0 = dwell(9); for (const fk of [0, 1]) { const sg = fk ? 1 : -1; add('C_FlangeArm_' + fk, 'y', [[s + t0, 0], [s + t0 + 1, -(0.98 - 0.87)], [s + t0 + 1.8, -(0.98 - 0.87)], [s + t0 + 2.6, 0], [s + t0 + 4.4, 0], [s + t0 + 5.4, -(0.98 - (PT + YC))], [s + t0 + 6.4, -(0.98 - (PT + YC))], [s + t0 + 7.4, 0]]);   // down onto the track end, up, across, down onto the core end
      add('C_FlangeArm_' + fk, 'z', [[s + t0 + 2.6, 0], [s + t0 + 4.4, -sg * (1.35 - 0.56 - 0.152)], [s + t0 + 7.4, -sg * (1.35 - 0.56 - 0.152)], [s + t0 + 8.8, 0]]); add('C_FlangeArm_' + fk + '_Flange', 'vis', [[s + t0 + 1.8, true], [s + t0 + 6.4, false]]); add(QN + (fk ? '_FlangeR' : '_FlangeL'), 'vis', [[s, false], [s + t0 + 6.4, true]]); } }
    S.mig.forEach((x, i) => { if (i === 2) { conv(S.cturn, 'Stop_mig1'); const t0 = dwell(5); add('C_Turn', 'ry', [[s + t0 + 1, 0], [s + t0 + 3.5, Math.PI], [s + t0 + 4.2, Math.PI], [s + t0 + 4.21, 0]]); palRy(t0 + 1, Math.PI / 2); palRy(t0 + 3.5, Math.PI * 1.5); ry(t0 + 1, Math.PI / 2); ry(t0 + 3.5, Math.PI * 1.5); }   // 180° turn: robots 3 and 4 weld the other flange
      conv(x, i === 2 ? 'Stop_cturn' : i ? 'Stop_mig' + (i - 1) : 'Stop_flange'); const t0 = dwell(9); if (RM) { playRobot('C' + i, RM, s + t0 + 0.5); flash('C' + i + '_Arc', s + t0 + 0.5 + RM.ev.weld0, s + t0 + 0.5 + RM.ev.weld1); } });
    conv(S.manual, 'Stop_mig3'); { const t0 = dwell(8); add('W_2_Z', 'z', [[s + t0, 0], [s + t0 + 1, 0.15], [s + t0 + 7, 0.15], [s + t0 + 7.8, 0]]); add('W_2_Lean', 'rx', [[s + t0 + 0.6, 0], [s + t0 + 1.4, 0.22], [s + t0 + 6.8, 0.22], [s + t0 + 7.6, 0]]); flash('C_Manual_Arc', s + t0 + 1.5, s + t0 + 6.2); add('C_Manual_Torch', 'y', [[s + t0 + 0.5, 0], [s + t0 + 1.5, -0.45], [s + t0 + 6.5, -0.45], [s + t0 + 7.5, 0]]); add('C_Manual_Torch', 'x', [[s + t0 + 0.5, 0], [s + t0 + 1.5, -0.5], [s + t0 + 6.5, -0.5], [s + t0 + 7.5, 0]]); add('C_Manual_Torch', 'z', [[s + t0 + 0.5, 0], [s + t0 + 1.5, 0.75], [s + t0 + 6.5, 0.75], [s + t0 + 7.5, 0]]); add(QN + '_Pipes', 'vis', [[s, false], [s + t0 + 6.2, true]]); }   // the operator steps up, leans in and welds
    // ---- D
    conv(S.cf, 'Stop_manual'); { const t0 = dwell(14); add('D_CF_Hood', 'y', [[s + t0 + 1, 0], [s + t0 + 2.2, -0.26], [s + t0 + 12, -0.26], [s + t0 + 13.2, 0]]); flash('D_CF_OK', s + t0 + 11, s + t0 + 14); }
    conv(S.paste, 'Stop_cf'); { const t0 = dwell(10); add('D_Disp_Y', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 8.5, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 9.5, 0]]); add('D_Disp_Z', 'z', [[s + t0 + 2, -0.13], [s + t0 + 5, -0.13], [s + t0 + 5.4, 0.13], [s + t0 + 8.5, 0.13], [s + t0 + 9.5, 0]]); add('D_Disp_X', 'x', [[s + t0 + 2, -0.05], [s + t0 + 5, 0.05], [s + t0 + 5.4, -0.05], [s + t0 + 8.5, 0.05], [s + t0 + 9.5, 0]]); }
    conv(S.check, 'Stop_paste'); { const t0 = dwell(12); add('W_3_Z', 'z', [[s + t0, 0], [s + t0 + 1, 0.18], [s + t0 + 8, 0.18], [s + t0 + 9, 0]]); add('W_3_Lean', 'rx', [[s + t0 + 0.8, 0], [s + t0 + 1.6, 0.3], [s + t0 + 7.6, 0.3], [s + t0 + 8.4, 0]]); add('W_3', 'ry', [[s + t0 + 9, 0], [s + t0 + 9.8, Math.PI], [s + t0 + 11.2, Math.PI], [s + t0 + 12, 0]]); }   // inspects the welds, turns to the table to log the result
    // ---- E
    conv(S.eturn, 'Stop_check'); { const t0 = dwell(5); add('E_Turn', 'ry', [[s + t0 + 1, 0], [s + t0 + 3.5, Math.PI], [s + t0 + 4.2, Math.PI], [s + t0 + 4.21, 0]]); palRy(t0 + 1, Math.PI * 1.5); palRy(t0 + 3.5, Math.PI * 2.5); palRy(t0 + 4.21, Math.PI / 2); ry(t0 + 1, Math.PI * 1.5); ry(t0 + 3.5, Math.PI * 2.5); ry(t0 + 4.21, Math.PI / 2); }
    conv(S.evis, 'Stop_eturn'); { const t0 = dwell(3); flash('E_VisCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.estop, 'Stop_evis'); { const t0 = ct, re = s + t0 + 1.5; clamp(t0 + 0.2, true); clamp(t0 + 1.0, false);
      if (RE) { playRobot('E', RE, re); const e = RE.ev; partOnPallet(re + e.grip - s, S.estop); show(re + e.grip - s, false); flash('E_Grip_Part', re + e.grip, re + e.put); flash('E_Grip_Part', re + e.take, re + e.release);
        at(re + e.put - s, [S.ecab[0], FIXY, S.ecab[1]]); show(re + e.put - s, true); add('E_Hood', 'y', [[re + e.put + 0.8, 0], [re + e.put + 1.8, -0.42], [re + e.take - 2.5, -0.42], [re + e.take - 1.3, 0]]); flash(lNG ? 'E_Leak_NG' : 'E_Leak_OK', re + e.take - 3.5, re + e.take + 2);
        at(re + e.take - s, [S.ecab[0], FIXY, S.ecab[1]]); show(re + e.take - s, false);
        release('Stop_estop'); palAt(t0 + 1.0, S.estop); palAt(t0 + 1.0 + (S.eback - S.estop) / CV, S.eback); cx = S.eback;
        partOnPallet(re + e.release - s, S.eback); show(re + e.release - s, true); ct = re + e.release - s + 0.5; clamp(ct, false); clamp(ct + 0.8, true); ct += 1.5; }
      else { ct = t0 + 30; cx = S.eback; partOnPallet(ct, S.eback); } }
    conv(S.mark, 'Stop_eback'); { const t0 = dwell(6); head('E_MarkHead', s + t0 + 0.8, s + t0 + 5.2, 0.06); flash('E_Mark_Beam', s + t0 + 2, s + t0 + 4.2); add(QN + '_Mark', 'vis', [[s, false], [s + t0 + 4.2, true]]); }
    conv(S.nut, 'Stop_mark'); { const t0 = dwell(12); add('E_Nutrunner', 'x', [[s + t0, 0], [s + t0 + 1, -0.62], [s + t0 + 5.5, -0.62], [s + t0 + 6.2, -0.38], [s + t0 + 10.5, -0.38], [s + t0 + 11.5, 0]]); add('E_Nutrunner', 'z', [[s + t0, 0], [s + t0 + 1, 0.75], [s + t0 + 10.5, 0.75], [s + t0 + 11.5, 0]]);
      add('E_Nutrunner', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -0.4], [s + t0 + 5, -0.4], [s + t0 + 5.6, -0.1], [s + t0 + 6.4, -0.1], [s + t0 + 7, -0.4], [s + t0 + 10, -0.4], [s + t0 + 10.8, 0]]); add('E_Nutrunner', 'ry', [[s + t0 + 2, 0], [s + t0 + 5, 6 * TAU], [s + t0 + 7, 6 * TAU], [s + t0 + 10, 12 * TAU], [s + t0 + 11.5, 12 * TAU], [s + t0 + 11.51, 0]]); }
    conv(S.okng, 'Stop_nut'); { const t0 = dwell(4); flash(lNG ? 'E_OKNG_NG' : 'E_OKNG_OK', s + t0 + 1, s + t0 + 4);
      if (lNG) { add('E_NG_Pusher', 'z', [[s + t0 + 4, 0], [s + t0 + 5.2, 0.95], [s + t0 + 6.4, 0]]); palAt(t0 + 4, S.okng); partOnPallet(t0 + 4, S.okng); add(PN + '_X', 'z', [[s + t0 + 4, 0], [s + t0 + 5.2, 0.95], [s + t0 + 20, 0.95], [s + t0 + 22, 0]]); at(t0 + 5.2, [S.okng, PT, Z0 + 0.95]); at(t0 + 9, [S.okng + 0.9, PT, Z0 + 0.95]); show(t0 + 9, false); palAt(t0 + 5.2, S.okng); palAt(t0 + 9, S.okng + 0.9); palAt(t0 + 18, S.okng + 0.9); palAt(t0 + 20, S.okng); palAt(t0 + 60, S.okng);
        palAt(t0 + 60 + (S.okng - S.merge) / RV, S.merge); finish(); continue; } }
    // packer: clamps open, the gantry lifts the cooler into the carton; the empty pallet goes down the lift and returns on the lower level to the start lift
    conv(S.pack, 'Stop_okng'); { const t0 = dwell(10); clamp(t0 + 0.3, true); clamp(t0 + 1.0, false);
      add('E_Packer_Z', 'z', [[s + t0 - 2, 0], [s + t0 + 3.5, 0], [s + t0 + 5.5, -1.05], [s + t0 + 8.5, -1.05], [s + t0 + 10, 0]]); add('E_Packer_Y', 'y', [[s + t0 + 1.2, 0], [s + t0 + 2.2, -(1.015 - PT)], [s + t0 + 3.0, -(1.015 - PT)], [s + t0 + 3.5, 0], [s + t0 + 5.5, 0], [s + t0 + 6.5, -(1.015 - 0.6)], [s + t0 + 7.5, -(1.015 - 0.6)], [s + t0 + 8.5, 0]]);
      partOnPallet(t0 + 3.0, S.pack); show(t0 + 3.0, false); flash('E_Packer_Part', s + t0 + 3.0, s + t0 + 7.5);
      // pallet: to the exit lift, down, back along the lower level, up at the start lift, wait at the merge stop
      release('Stop_pack'); const tl = t0 + 4 + 0.6 / CV; palAt(t0 + 4, S.pack); palAt(tl, S.pack + 0.6); palAt(tl + 3, S.pack + 0.6, LOW); add('Lift_Out', 'y', [[s + t0 + 4, BT - LOW], [s + tl, BT - LOW], [s + tl + 3, 0], [s + tl + 5, 0], [s + tl + 7, BT - LOW]]);
      const tr = tl + 3.5 + (S.pack + 0.6 - S.merge) / RV; palAt(tl + 3.5, S.pack + 0.6, LOW); palAt(tr, S.merge, LOW); palAt(tr + 3, S.merge, BT); add('Lift_In', 'y', [[s + tr - 2, 0], [s + tr, 0], [s + tr + 3, BT - LOW], [s + tr + 5, BT - LOW], [s + tr + 7, 0]]); }
    finish();
  }
  // operator trips: walk a path (x, z points in the line frame) at 1.0 m/s, turning to the walking direction at each point
  const walk = (n, pts, t0, back = true) => { const H = TABLE_HOMES[n], X = [], Z = [], R = []; let t = t0, yaw = 0, cur = H;
    const go = (p, face) => { const dx = p[0] - cur[0], dz = p[1] - cur[1], d = Math.hypot(dx, dz); if (d < 1e-3) return; let h = Math.atan2(dx, dz); while (h - yaw > Math.PI) h -= 2 * Math.PI; while (h - yaw < -Math.PI) h += 2 * Math.PI;
      R.push([t, yaw]); X.push([t, cur[0] - H[0]]); Z.push([t, cur[1] - H[1]]); t += 0.5; R.push([t, h]); yaw = h; X.push([t, cur[0] - H[0]]); Z.push([t, cur[1] - H[1]]); t += d / 1.0; X.push([t, p[0] - H[0]]); Z.push([t, p[1] - H[1]]); cur = p; };
    pts.forEach(p => go(p)); const tTurn = t; return { X, Z, R, t, at: () => t, pause: dt => { t += dt; X.push([t, cur[0] - H[0]]); Z.push([t, cur[1] - H[1]]); R.push([t, yaw]); }, go, end: () => { let h = 0; while (h - yaw > Math.PI) h -= 2 * Math.PI; while (h - yaw < -Math.PI) h += 2 * Math.PI; R.push([t, yaw]); t += 0.6; R.push([t, h]); add('W_' + n + '_X', 'x', X); add('W_' + n + '_Z', 'z', Z); add('W_' + n, 'ry', R); return t; } }; };
  const TABLE_HOMES = root.userData.homes;
  { // loader operator: once a cycle the empty tote goes out through the west door to the AGV stand and a full one comes back
    const w = walk(1, [[S.tote - 0.2, Z0 - 0.7], [-1.8, Z0 - 0.7], [-1.8, -1.45]], 130); w.pause(4); w.go([-1.8, Z0 - 0.7]); w.go([S.tote - 0.2, Z0 - 0.7]); w.go(TABLE_HOMES[1]); const te = w.end(); add('W_1_Tote', 'vis', [[129.9, true], [te, false]]); }
  for (const tc of [90, 290]) { // packing operator: the full carton goes out through the east door onto the shipping pallet, a flat empty one is set up again
    const w = walk(4, [[S.pack + 0.8, Z0 - 1.95], [S.pack + 0.8, Z0 - 0.5], [S.eEnd + 1.2, Z0 - 0.5], [S.eEnd + 1.2, Z0 + 0.2]], tc + 1.5); w.pause(3); w.go([S.eEnd + 1.2, Z0 - 0.5]); w.go([S.pack + 0.8, Z0 - 0.5]); w.go([S.pack + 0.8, Z0 - 1.95]); w.go(TABLE_HOMES[4]); const te = w.end();
    add('W_4_Carton', 'vis', [[tc + 1.5, true], [tc + 1.5 + 2 * 0.5 + (0.8 + 1.45 + (S.eEnd + 0.4 - S.pack) + 0.7) / 1.0 + 3, false]]); add('E_Pack_Carton', 'vis', [[tc + 1.5, false], [te - 0.5, true]]); }
  const keys = [];
  for (const [key, evs] of Object.entries(ch)) { const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, /_(Cam|Beam|Arc|OK|NG|Part|Paste|Seam|Tanks|Pipes|Mark|FlangeL|FlangeR|Profile|Tote|Carton)$|^Part_\d$|_Grip_|^A_Loader_Part$|^E_Packer_Part$/.test(node) && !/_Tank$|_Flange$|^A_Tote_Core_/.test(node) ? false : true)]);
    else keys.push([node, c, ser(evs, 0)]); }
  return cycleClip(root, 'Module_Cycle', T, keys, 4);
}
