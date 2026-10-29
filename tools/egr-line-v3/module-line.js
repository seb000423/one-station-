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

const MAG_N = 7, MAG_P = 0.2, MAG_Y = 1.2, PROF_D = 0.3, GRIP_IN = 0.0475, GRIP_OPEN = 0.022, NUT_RY = 2.69;   // gripper inner half-gap on the core fins (94 mm + 1 mm), opening stroke per finger; nutrunner balancer arm angle
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
  const cardboard = std('cardboard', 0xb88a55, 0.0, 0.8), blue = std('machine_paint', 0xa9aeac, 0.3, 0.5), palM = std('pallet_alu', 0xa9b2bb, 0.85, 0.35), beltM = std('pallet_belt', 0x2a2d31, 0.0, 0.75), curtain = std('weld_curtain', 0xc8461e, 0.0, 0.55, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const robots = {}, FOOT = [], TABLE = { S, RBASE, MZ, Z0, BT, LOW, LANES };
  const fp = (name, x0, x1, z0, z1) => FOOT.push([name, x0, x1, z0, z1]);
  const plates = {}, plateMat = text => plates[text] || (plates[text] = std('plate_' + text, 0xffffff, 0.1, 0.5, { map: labelTexture(text, '#1f2a36', '#ffffff') }));

  // ---------------------------------------------------------------- generic pieces
  const toteSlot = k => [S.tote + ((k >> 1) - 1.5) * 0.2, Z0 + (k % 2 ? 0.12 : -0.12)];
  // a 2-axis pick-and-place hand (loader, packer): mast, a narrow bracket (clears the coolant pipes), two pads that clamp the core across its
  // fins; KEY_Ref at the part's bottom centre (1.015 above the hand's origin), KEY_PadA / _PadB open by GRIP_OPEN
  const padHand = (gy, key) => { box(gy, m.alu, 0.05, 0.9, 0.05, 0, 1.585, 0); box(gy, m.aluDark, 0.06, 0.025, 0.15, 0, 1.112, 0);
    for (const s of [-1, 1]) { const pd = G(key + (s > 0 ? '_PadA' : '_PadB'), gy, 0, 0, s * (GRIP_IN + 0.006 + GRIP_OPEN)); box(pd, m.black, 0.12, 0.08, 0.012, 0, 1.06, 0); box(pd, m.aluDark, 0.03, 0.012, 0.012 + GRIP_OPEN, 0, 1.106, s * (GRIP_OPEN / 2)); }
    G(key + '_Ref', gy, 0, 1.015, 0); };
  const nameplate = (text, x, y, z, ry = 0, w = 0.4) => { box(root, m.black, w + 0.02, w / 2 + 0.02, 0.012, x, y, z, [0, ry, 0]); for (const sd of [1, -1]) plane(root, plateMat(text), w, w / 2, x + Math.sin(ry) * 0.008 * sd, y, z + Math.cos(ry) * 0.008 * sd, [0, ry + (sd < 0 ? Math.PI : 0), 0]); };   // printed on both faces
  const BW = 0.34;   // twin-belt conveyor: belts at z ± BW/2, 45 mm profile beams under them
  const segs = (a, b, gaps) => { const out = []; let x = a; for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > x) out.push([x, Math.min(g0, b)]); x = Math.max(x, g1); } if (x < b) out.push([x, b]); return out; };
  const pbelt = (x0, x1, y = BT, legs = true, gaps = []) => { const L = x1 - x0, c = (x0 + x1) / 2;   // pallet conveyor section, flow +X, belt top at y; gaps: openings in the +Z guide rail for side transfers
    for (const sz of [-1, 1]) { const z = Z0 + sz * BW / 2; prof(root, [x0, y - 0.06, z], [x1, y - 0.06, z], 0.045); box(root, beltM, L, 0.012, 0.05, c, y - 0.006, z); for (const [a, b] of segs(x0, x1, sz > 0 ? gaps : [])) box(root, m.aluDark, b - a, 0.02, 0.02, (a + b) / 2, y + 0.01, z + sz * 0.035); }
    prof(root, [c, y - 0.12, Z0 - BW / 2], [c, y - 0.12, Z0 + BW / 2], 0.03);
    if (legs) for (let k = 0, n = Math.max(1, Math.ceil(L / 1.5)); k <= n; k++) { const x = x0 + 0.1 + (L - 0.2) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, Z0 + sz * 0.28], [x, y - 0.09, Z0 + sz * 0.28], 0.045); foot(root, x, Z0 + sz * 0.28); } prof(root, [x, 0.3, Z0 - 0.28], [x, 0.3, Z0 + 0.28], 0.045); } };
  const STOPS = {}, stopper = (name, x, pins = true) => { STOPS[x.toFixed(3)] = name;   // pallet stop: a blade between the belts against the pallet's front edge (drops 0.11 to release)
    const st = G(name, root, x + 0.16, BT - 0.1, Z0); box(st, m.yellow, 0.02, 0.1, 0.12, 0, 0.07, 0); box(root, m.black, 0.06, 0.06, 0.12, x + 0.16, BT - 0.13, Z0);
    if (pins) { const pu = G(name + '_Pins', root, x, BT - 0.1, Z0); box(pu, m.aluDark, 0.3, 0.025, 0.05, 0, 0, 0); for (const sx of [-1, 1]) { box(pu, m.aluDark, 0.03, 0.025, 0.3, sx * 0.12, 0, 0); cyl(pu, m.steel, 0.007, 0.06, sx * 0.12, 0.04, sx * 0.12, 'y', 10); cyl(pu, m.steel, 0.004, 0.01, sx * 0.12, 0.075, sx * 0.12, 'y', 8); }   // locating unit: two diagonal pins rise into the pallet's bushings
      box(root, m.black, 0.05, 0.05, 0.05, x, BT - 0.15, Z0); }
    return st; };
  // pallet turn unit: a lift-and-turn table between the belts (top 50 mm under the belt), hung from the belt beams above the return lane
  const turnUnit = (name, x) => { const tu = G(name, root, x, BT - 0.05, Z0); cyl(tu, m.frameDark, 0.14, 0.03, 0, -0.015, 0, 'y', 24); cyl(tu, m.rubber, 0.13, 0.004, 0, 0.002, 0, 'y', 24); cyl(tu, m.steel, 0.04, 0.08, 0, -0.07, 0, 'y', 12);
    box(root, m.aluDark, 0.2, 0.1, 0.2, x, BT - 0.2, Z0); for (const sz of [-1, 1]) box(root, m.aluDark, 0.2, 0.17, 0.012, x, BT - 0.145, Z0 + sz * 0.16); };
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
  const pusher = (name, x, z, y, len = 0.5, dir = 1) => { const p = G(name, root); box(p, m.aluDark, 0.34, 0.058, 0.02, x, y, z); cyl(p, m.steel, 0.012, len, x, y, z - dir * len / 2, 'z', 8); cyl(root, m.alu, 0.035, 0.3, x, y, z - dir * (len + 0.15), 'z', 16); box(root, m.aluDark, 0.12, y - 0.06, 0.1, x, (y - 0.06) / 2, z - dir * (len + 0.15)); return p; };   // pneumatic transfer pusher (stroke dir·Z); the plate meets the pallet's edge just above the belt rails
  // NG station: the pusher shoves the pallet over a dead plate onto the NG roller conveyor (+Z); the rollers carry it into the closed NG store, where the
  // part is taken off; it comes back out empty and a return pusher sets it back on the line
  const ngStation = (key, x, text, len = 1.15) => { pusher(key + '_NG_Pusher', x, Z0 - 0.3, BT + 0.051, 0.5, 1); box(root, m.steel, 0.32, 0.008, 0.48, x, BT - 0.004, Z0 + 0.46);   // dead plate belt → NG rollers
    rollers(x - 0.25, x + len, Z0 + 0.95, 0.42); pusher(key + '_NG_Return', x, Z0 + 1.13, BT + 0.051, 0.4, -1);
    const hx = x + len - 0.27; box(root, m.sheet, 0.5, 0.012, 0.52, hx, BT + 0.4, Z0 + 0.95); for (const sz of [-1, 1]) box(root, m.sheet, 0.5, 0.39, 0.012, hx, BT + 0.205, Z0 + 0.95 + sz * 0.26); box(root, m.sheet, 0.012, 0.39, 0.52, hx + 0.25, BT + 0.205, Z0 + 0.95);   // NG store: closed on top, sides and end, open towards the line
    box(root, m.aluDark, 0.5, 0.06, 0.53, hx, BT + 0.43, Z0 + 0.95); plane(root, m.hazard, 0.2, 0.36, hx - 0.25, BT + 0.205, Z0 + 0.95, [0, -Math.PI / 2, 0]); nameplate(text, hx, BT + 0.6, Z0 + 0.69, 0, 0.36); };
  const balancer = (name, x, z, y, ry, wire = true) => { prof(root, [x, 0.06, z], [x, 2.2, z], 0.06, m.frameDark); box(root, m.aluDark, 0.36, 0.012, 0.36, x, 0.006, z); const ax = x + Math.cos(ry) * 0.5, az = z - Math.sin(ry) * 0.5;
    box(root, m.aluDark, 1.0, 0.06, 0.06, (x + ax) / 2, 2.2, (z + az) / 2, [0, ry, 0]); cyl(root, m.black, 0.07, 0.1, ax, 2.1, az, 'y', 16); if (wire) cyl(root, m.black, 0.006, 2.1 - y - 0.2, ax, (2.05 + y + 0.2) / 2, az, 'y', 6); return G(name, root, ax, y, az); };
  const robot = (key, x, z, kind = 'FR5', h = RH, ry = 0) => { const name = key + '_Robot', src = globalThis[kind] || globalThis.FR5, fr = src ? src.clone(true) : null;
    box(root, m.black, 0.36, h - 0.02, 0.36, x, (h - 0.02) / 2 + 0.02, z); box(root, m.yellow, 0.37, 0.04, 0.37, x, h - 0.04, z); box(root, m.aluDark, 0.5, 0.02, 0.5, x, 0.01, z);
    if (!fr) return null; fr.name = name; fr.position.set(x, h, z); fr.rotation.y = ry; root.add(fr);
    const J = [1, 2, 3, 4, 5, 6].map(i => fr.getObjectByName('Joint_' + i)); J.forEach(j => { j.name = name + '_' + j.name; }); const tool = G(name + '_Tool', J[5], 0, 0, 0.101); robots[key] = { J, tool, fr }; return robots[key]; };
  // parallel gripper: the tool tip (0.165 below the flange plate) is the part's centre; the fingers clamp the part's 94 mm core across its fins
  // (closed: inner faces at ±GRIP_IN, open: +GRIP_OPEN), along tool Y (rot 0) or tool X (rot π/2); KEY_Ref sits at the part's bottom centre
  const gripper = (tool, key, rot = 0) => { const g = G(key + '_Gripper', tool); g.rotation.z = rot;
    box(g, m.aluDark, 0.07, 0.07, 0.1, 0, 0, 0.05); box(g, m.aluDark, 0.06, 0.13, 0.02, 0, 0, 0.11);
    for (const s of [-1, 1]) { const f = G(key + (s > 0 ? '_FingerA' : '_FingerB'), g, 0, s * (GRIP_IN + 0.006 + GRIP_OPEN), 0); box(f, m.black, 0.03, 0.012, 0.095, 0, 0, 0.1475); box(f, m.rubber, 0.026, 0.002, 0.05, 0, -s * 0.005, 0.165); }
    G(key + '_Ref', tool, 0, 0, 0.165 + YC); };
  const torch = tool => { cyl(tool, m.black, 0.022, 0.18, 0, 0, 0.09, 'z', 10); cyl(tool, m.orange, 0.013, 0.05, 0, 0, 0.2, 'z', 10); cyl(tool, m.steel, 0.002, 0.03, 0, 0, 0.24, 'z', 6); };
  const cabin = (text, x0, x1, z0, z1, h = 2.0, openSide = null) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) prof(root, [x, 0.06, z], [x, h, z], 0.06, m.frameDark); box(root, blue, w + 0.06, 0.12, d + 0.06, cx, h - 0.06, cz); box(root, m.sheet, w + 0.06, 0.4, d + 0.06, cx, 0.2, cz);
    for (const [side, px, pz, r, L] of [['S', cx, z0, 0, w], ['N', cx, z1, 0, w], ['W', x0, cz, Math.PI / 2, d], ['E', x1, cz, Math.PI / 2, d]]) if (side !== openSide) plane(root, glass, L - 0.08, h - 0.55, px, (h + 0.4) / 2 - 0.05, pz, [0, r, 0]);
    nameplate(text, cx, h + 0.1, cz, 0, 0.44); fp(text, x0, x1, z0, z1); };
  // a CAD station sub-assembly (globalThis.PARTS, loaded by build.html): centred on (x, z), standing on y, turned ry
  const part = (key, x, z, ry = 0, y = 0) => { const src = (globalThis.PARTS || {})[key]; if (!src) return null; const o = src.clone(true), w = new THREE.Group(); w.add(o); w.rotation.y = ry; w.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(w); w.position.set(x - (b.min.x + b.max.x) / 2, y - b.min.y, z - (b.min.z + b.max.z) / 2); w.name = 'CAD_' + key.replace(/-/g, '_');
    w.traverse(o => { if (o.isMesh) o.material = [].concat(o.material).map(q => { if (!q || !q.color || q.transparent) return q; const hsl = {}; q.color.getHSL(hsl); if (hsl.l <= 0.72) return q; const c = q.clone(); c.color.setHSL(hsl.h, hsl.s * 0.8, 0.72); return c; }).reduce((a, q, i, arr) => arr.length === 1 ? q : arr, null); });   // no pure-white CAD surfaces
    w.traverse(o => { if (o.isMesh && [].concat(o.material).some(q => q && q.transparent)) { o.castShadow = false; o.receiveShadow = false; [].concat(o.material).forEach(q => { if (q && q.transparent) q.depthWrite = false; }); } });   // clear covers: no shadow speckle
    root.add(w); return w; };
  const fixture = (x, z, alongX) => { const w = alongX ? 0.42 : 0.3, d = alongX ? 0.26 : 0.36; box(root, m.aluDark, w, 0.03, d, x, FIXY - 0.015, z); for (const sx of [-1, 1]) prof(root, [x + sx * (w / 2 - 0.03), 0.4, z], [x + sx * (w / 2 - 0.03), FIXY - 0.03, z], 0.04);   // cabin fixture: plate top at FIXY
    for (const sx of [-1, 1]) box(root, clampM, alongX ? 0.03 : 0.05, 0.03, 0.2, x + sx * (alongX ? 0.175 : 0.11), FIXY + 0.015, z); };   // locating blocks beside the part (part along X: at its ends; along Z: at its sides)
  // the jig pallet: 300 × 300 aluminium plate, cradle for the 180 × 90 core (its long axis along X on the pallet), two toggle clamps
  const palletGeo = (pal, name) => { box(pal, palM, 0.3, PAL, 0.3, 0, PAL / 2, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(pal, m.black, 0.012, 0.01, sx * 0.12, -0.005, sz * 0.12, 'y', 8);
    box(pal, clampM, 0.2, 0.012, 0.11, 0, PAL + 0.006, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(pal, clampM, 0.03, 0.03, 0.01, sx * 0.05, PAL + 0.027, sz * 0.057);   // cradle plate + four side guides (5 mm off the fins; the end tanks pass over the plate)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(pal, m.black, 0.013, 0.002, sx * 0.12, PAL + 0.001, sz * 0.12, 'y', 12); cyl(pal, m.steel, 0.006, 0.003, sx * 0.12, PAL + 0.002, sz * 0.12, 'y', 8); }   // locating bushings
    for (const [sz, nm] of [[-1, '_ClampL'], [1, '_ClampR']]) { box(pal, m.steel, 0.06, 0.09, 0.03, 0, PAL + 0.045, sz * 0.085); const c = G(name + nm, pal, 0, PAL + 0.094, sz * 0.085); box(c, clampM, 0.012, 0.012, 0.05, 0, 0.014, -sz * 0.025); box(c, m.red, 0.016, 0.016, 0.016, 0, 0.022, sz * 0.002); box(c, clampM, 0.05, 0.008, 0.02, 0, 0.004, -sz * 0.04); } };   // toggle clamps: hinge at the back, the pad lands on the core top (rx)
  // part looks (origin at the bottom centre, body centre at YC; long axis X)
  const lookCore = n => { box(n, brazed, 0.18, 0.07, 0.09, 0, YC, 0); for (let x = -0.075; x <= 0.0751; x += 0.025) box(n, brazed, 0.004, 0.074, 0.094, x, YC, 0); };
  const lookPaste = n => { for (const sx of [-1, 1]) for (const dz of [-0.03, 0, 0.03]) box(n, m.paste, 0.004, 0.072, 0.012, sx * 0.093, YC, dz); };
  const lookTanks = n => { for (const sx of [-1, 1]) box(n, tankM, 0.05, 0.08, 0.1, sx * 0.115, YC, 0); };
  const lookSeam = n => { for (const sx of [-1, 1]) box(n, bead, 0.006, 0.084, 0.104, sx * 0.09, YC, 0); };
  const lookFlange = (n, sx) => { box(n, m.stainless, 0.012, 0.1, 0.15, sx * 0.146, YC, 0); box(n, bead, 0.008, 0.07, 0.08, sx * 0.136, YC, 0); };
  const lookPipes = n => { for (const sx of [-1, 1]) cyl(n, m.stainless, 0.011, 0.06, sx * 0.05, 0.105, 0.03, 'y', 8); box(n, m.steel, 0.12, 0.004, 0.03, 0, 0.008, -0.055); };
  const lookMark = n => plane(n, m.display, 0.03, 0.02, 0.04, YC + 0.0355, 0.02, [-Math.PI / 2, 0, 0]);
  const tank = (n, x = 0, y = 0, z = 0) => box(n, tankM, 0.05, 0.08, 0.1, x, y, z);
  const lookFinal = n => { lookCore(n); lookPaste(n); lookTanks(n); lookSeam(n); for (const sx of [-1, 1]) lookFlange(n, sx); lookPipes(n); lookMark(n); };
  const cartonSlot = j => [0, 0.575 + (j >> 1) * 0.15, (j % 2 ? 0.1 : -0.1)];   // part along X; 2 side by side, 2 layers
  const rollers = (x0, x1, z, w = 0.5, guides = []) => { fp('컨베이어 ' + x0.toFixed(1), x0, x1, z - w / 2 - 0.05, z + w / 2 + 0.05); const L = x1 - x0, c = (x0 + x1) / 2;
    for (const sz of [-1, 1]) { box(root, m.alu, L, 0.1, 0.035, c, BT - 0.06, z + sz * (w / 2 + 0.03)); box(root, m.aluDark, L, 0.008, 0.045, c, BT + 0.014, z + sz * (w / 2 + 0.03)); for (const [a, b] of guides) box(root, m.aluDark, b - a, 0.03, 0.01, (a + b) / 2, BT + 0.06, z + sz * (w / 2 - 0.1)); }   // guide rails for bare cores (pallet conveyors have none)
    for (let k = 0, n = Math.round(L / 0.1); k < n; k++) cyl(root, m.steel, 0.022, w, x0 + (k + 0.5) * L / n, BT - 0.025, z, 'z', 10);
    for (let k = 0, n = Math.max(1, Math.ceil(L / 1.4)); k <= n; k++) { const x = x0 + 0.1 + (L - 0.2) * k / n; for (const sz of [-1, 1]) { prof(root, [x, 0.06, z + sz * (w / 2 + 0.03)], [x, BT - 0.11, z + sz * (w / 2 + 0.03)], 0.04); foot(root, x, z + sz * (w / 2 + 0.03)); } prof(root, [x, 0.3, z - w / 2 - 0.03], [x, 0.3, z + w / 2 + 0.03], 0.04); } };

  // ================================================================ the spine: upper pallet conveyor, lower return, lifts at both ends
  const X0 = S.merge, X1 = S.pack + 0.6;   // the in-lift is the merge station itself (the returned pallet rises straight into the loading position); the out-lift sits past the packer
  pbelt(X0 + 0.22, X1 - 0.22, BT, true, [S.ngA, S.bng, S.okng].map(x => [x - 0.17, x + 0.17])); pbelt(X0 + 0.22, X1 - 0.22, LOW, false);
  for (const x of [X0, X1]) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [x + sx * 0.2, 0.06, Z0 + sz * 0.27], [x + sx * 0.2, BT - 0.08, Z0 + sz * 0.27], 0.045); box(root, blue, 0.46, 0.06, 0.6, x, 0.09, Z0); box(root, m.aluDark, 0.5, 0.02, 0.8, x, 0.01, Z0);   // low lift frame inside the conveyor line (4 posts + base), the pallet carrier runs on them
    const lf = G(x === X0 ? 'Lift_In' : 'Lift_Out', root, x, LOW - 0.06, Z0); for (const sz of [-1, 1]) box(lf, beltM, 0.4, 0.012, 0.05, 0, 0, sz * BW / 2); box(lf, m.aluDark, 0.4, 0.05, 0.4, 0, -0.03, 0); for (const sz of [-1, 1]) box(lf, m.yellow, 0.4, 0.01, 0.02, 0, 0.012, sz * (BW / 2 + 0.035));
    nameplate(x === X0 ? '팔레트 리프트 (상승)' : '팔레트 리프트 (하강)', x, 0.3, Z0 - 0.31, 0, 0.36); }
  fp('스파인', X0 - 0.3, X1 + 0.3, Z0 - 0.3, Z0 + 0.3);
  // ================================================================ A. loading & paste apply (x −1.2 … 5.9)
  for (const [li, z] of LANES.entries()) { const sz = li ? 1 : -1;
    rollers(0.1, S.lane + 0.25, z, 0.5, [[0.1, 0.4], [0.7, S.lane + 0.25]]); box(root, m.yellow, 0.025, 0.05, 0.3, S.lane + 0.09 + 0.0125, BT + 0.03, z);   // lane rollers, guide rails (open at the centring gate), end stop the core runs against
    for (const sx of [-1, 1]) prof(root, [0.55, 0.06, z + sx * 0.36], [0.55, 1.6, z + sx * 0.36], 0.045, m.frameDark); box(root, m.frameDark, 0.07, 0.07, 0.79, 0.55, 1.6, z);   // centring gate
    for (const s2 of [-1, 1]) { const p = G('A_Center_' + li + (s2 < 0 ? '_L' : '_R'), root); box(p, m.yellow, 0.14, 0.05, 0.03, 0.55, BT + 0.04, z + s2 * 0.2); cyl(root, m.alu, 0.012, 0.1, 0.55, BT + 0.04, z + s2 * 0.27, 'z', 8); }
    box(root, m.black, 0.06, 0.1, 0.06, 0.55, 1.52, z); plane(root, m.red, 0.03, 0.03, 0.55, 1.469, z, [Math.PI / 2, 0, 0]);   // direction sensor under the beam
    camera(0.85, 1.5, z, 'A_FinCam_' + li, BT + 0.02); box(root, m.black, 0.06, 0.06, 0.1, 0.95, BT + 0.15, z + sz * 0.3); box(root, m.red, 0.004, 0.02, 0.06, 0.92, BT + 0.15, z + sz * 0.3);
    nameplate(li ? '투입 레인 2' : '투입 레인 1', 0.55, 1.76, z, 0, 0.36); }
  { // loader gantry: a 2-axis pick-and-place takes cores out of the tote on the stand (x −0.6) and sets them on lane 1 / lane 2 alternately
    const tx = S.tote; box(root, m.sheet, 0.9, 0.55, 1.0, tx, 0.275, Z0); box(root, m.black, 0.92, 0.02, 1.02, tx, 0.56, Z0); nameplate('코어 상자 스탠드', tx, 0.35, Z0 - 0.51, 0, 0.36); fp('상자 스탠드', tx - 0.45, tx + 0.45, Z0 - 0.5, Z0 + 0.5);
    { const tt = G('A_Tote', root, tx, 0.57, Z0); box(tt, m.tote, 0.86, 0.005, 0.5, 0, 0.0025, 0); for (const sx of [-1, 1]) box(tt, m.tote, 0.01, 0.1, 0.5, sx * 0.425, 0.05, 0); for (const sz of [-1, 1]) box(tt, m.tote, 0.86, 0.1, 0.01, 0, 0.05, sz * 0.245); }   // open core tote (8 cores, 4 × 2)
    for (const sz of [-1, 1]) { prof(root, [tx - 0.5, 0.06, Z0 + sz * 1.15], [tx - 0.5, 2.1, Z0 + sz * 1.15], 0.06, m.frameDark); prof(root, [0.6, 0.06, Z0 + sz * 1.15], [0.6, 2.1, Z0 + sz * 1.15], 0.06, m.frameDark); box(root, blue, 1.1 + 0.5, 0.12, 0.12, (tx - 0.5 + 0.6) / 2, 2.1, Z0 + sz * 1.15); }
    const gx = G('A_Loader_X', root, tx, 0, Z0), gz = G('A_Loader_Z', gx), gy = G('A_Loader_Y', gz); box(gx, m.aluDark, 0.16, 0.14, 2.42, 0, 2.1, 0); box(gz, m.aluDark, 0.14, 0.12, 0.16, 0, 2.03, 0); padHand(gy, 'A_Loader');
    nameplate('코어 투입 로더', (tx + 0.6) / 2, 2.25, Z0 - 1.15, 0, 0.44);
    for (let k = 0; k < 8; k++) { const [x, z] = toteSlot(k); lookCore(G('A_Tote_Core_' + k, root, x, 0.575, z)); } }   // cores in the tote (slot k = part k)
  { const R = robot('A', ...RBASE.A); if (R) gripper(R.tool, 'A'); fp('핸들링 로봇 A', RBASE.A[0] - 0.25, RBASE.A[0] + 0.25, Z0 - 0.25, Z0 + 0.25); nameplate('핸들링 로봇 A', RBASE.A[0], 0.5, Z0 - 0.19, 0, 0.3); }
  stopper('Stop_merge', S.merge, false);
  stopper('Stop_prof', S.prof); gate(S.prof, 0.8, 1.75); { const h = slide('A_ProfHead', S.prof, Z0, 1.75); box(h, m.black, 0.12, 0.08, 0.1, 0, -0.06, 0); const pl = G('A_Profile', h), L = (1.65 - PROF_D) - 0.1 - (PT + 0.082); { const fan = new THREE.BufferGeometry(); fan.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.1, 0, 0, -0.1 - L, -0.06, 0, -0.1 - L, 0.06], 3)); fan.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 2)); fan.computeVertexNormals(); bin(pl, laserM, fan); const fb = new THREE.BufferGeometry(); fb.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.1, 0, 0, -0.1 - L, 0.06, 0, -0.1 - L, -0.06], 3)); fb.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 2)); fb.computeVertexNormals(); bin(pl, laserM, fb); box(pl, laserM, 0.004, 0.002, 0.12, 0, -0.1 - L + 0.001, 0); } } nameplate('프로파일 검사', S.prof, 1.89, Z0 - 0.05, 0, 0.4); fp('프로파일 검사', S.prof - 0.15, S.prof + 0.15, Z0 - 0.45, Z0 + 0.45);
  stopper('Stop_disp', S.disp); gate(S.disp, 0.9, 1.85); { const dx = G('A_Disp_X', root, S.disp, 0, Z0), dz = G('A_Disp_Z', dx), dy = G('A_Disp_Y', dz); box(dx, m.aluDark, 0.14, 0.1, 0.9, 0, 1.85, 0); box(dz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.79, 0); box(dy, m.alu, 0.05, 0.5, 0.05, 0, 1.5, 0); box(dy, blue, 0.1, 0.16, 0.1, 0, 1.32, 0); cyl(dy, m.black, 0.03, 0.1, 0, 1.19, 0, 'y', 12); cyl(dy, m.steel, 0.004, 0.06, 0, 1.11, 0, 'y', 6);
    if (!part('paste-tank', S.disp, Z0 + 1.05)) { box(root, m.sheet, 0.5, 0.8, 0.5, S.disp, 0.4, Z0 + 1.05); cyl(root, m.stainless, 0.17, 0.5, S.disp, 1.05, Z0 + 1.05, 'y', 24); }
    cyl(root, m.black, 0.012, 0.7, S.disp, 1.7, Z0 + 0.72, 'z', 8); prof(root, [S.disp, 1.12, Z0 + 1.05], [S.disp, 1.7, Z0 + 1.05], 0.03, m.frameDark); nameplate('페이스트 공급', S.disp, 1.25, Z0 + 0.8, 0, 0.36); fp('페이스트 공급', S.disp - 0.31, S.disp + 0.31, Z0 + 0.8, Z0 + 1.3); }   // pressure tank from the CAD, hose up the post and over to the dispenser
  nameplate('페이스트 도포', S.disp, 1.99, Z0 - 0.05, 0, 0.4); fp('페이스트 도포', S.disp - 0.15, S.disp + 0.15, Z0 - 0.5, Z0 + 0.5);
  stopper('Stop_cam', S.cam); gate(S.cam, 0.8, 1.7); camera(S.cam, 1.5, Z0, 'A_NozCam', PT + 0.1); nameplate('노즐 비전', S.cam, 1.84, Z0 - 0.05, 0, 0.36); fp('노즐 비전', S.cam - 0.15, S.cam + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopper('Stop_scale', S.scale, false); const sc = G('A_Scale', root, S.scale, BT - 0.2, Z0); box(sc, m.black, 0.36, 0.1, 0.5, 0, 0, 0); box(sc, m.steel, 0.3, 0.012, 0.26, 0, 0.056, 0); box(root, m.display, 0.14, 0.04, 0.004, S.scale, BT - 0.18, Z0 - 0.252); nameplate('도포 중량 검사', S.scale, BT - 0.3, Z0 - 0.26, 0, 0.32); }   // scale platform rises under the pallet between the belts
  { stopper('Stop_ngA', S.ngA); ngStation('A', S.ngA, 'NG 배출 · 보관'); }
  monitor('A_HMI', 3.4, Z0 - 1.4, 0.4); tower(S.aEnd - 0.2, Z0 - 1.5);

  // ================================================================ B. end tank assembly & scan laser welding (x 5.9 … 12.0)
  { stopper('Stop_turn', S.turn, false); turnUnit('B_Turn', S.turn); nameplate('팔레트 턴 유닛', S.turn, BT - 0.3, Z0 - 0.33, 0, 0.3); }
  // tank feeders: the CAD's tank magazine conveyors (0.74 × 1.87 m, top 1.19 m) run across the line on both sides; a pick-and-place on a Z rail
  // takes the tank at the magazine's near end (Z0 ± 0.5) and sets it on the core end (Z0 ± 0.17)
  for (const sz of [-1, 1]) { const fx = S.tank, mz = Z0 + sz * 1.335, nm = sz < 0 ? '_L' : '_R';
    const mg = part('tank-magazine', fx, mz, sz < 0 ? Math.PI : 0); if (mg) mg.traverse(o => { if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = false; [].concat(o.material).forEach(q => { if (q && q.transparent) { q.color.set(0xdfe6ea); q.opacity = 0.16; } }); });
    if (!mg) { box(root, m.sheet, 0.5, 0.86, 0.5, fx, 0.43, mz); for (let k = 0; k < 8; k++) tank(root, fx, 0.95 + k * 0.1, mz); }
    for (let j = 0; j < MAG_N; j++) { const t = G('B_Mag' + nm + '_T' + j, root, fx, MAG_Y, Z0 + sz * (0.5 + j * MAG_P)); box(t, tankM, 0.1, 0.08, 0.05, 0, 0, 0); }   // tanks in the magazine pockets: the front one sits at the pick point
    { const hz = Z0 + sz * (0.5 + MAG_N * MAG_P + 0.04), hy = MAG_Y + 0.02; box(root, m.sheet, 0.26, 0.012, 0.3, fx, hy + 0.2, hz); for (const sx of [-1, 1]) box(root, m.sheet, 0.012, 0.2, 0.3, fx + sx * 0.13, hy + 0.1, hz); box(root, m.sheet, 0.26, 0.2, 0.012, fx, hy + 0.1, hz + sz * 0.15);   // tank hopper over the magazine's back end: bulk tanks drop into the back pocket inside it
      box(root, m.sheet, 0.3, 0.25, 0.32, fx, hy + 0.33, hz + sz * 0.02); for (let k = 0; k < 3; k++) box(root, tankM, 0.1, 0.08, 0.05, fx - 0.06 + k * 0.06, hy + 0.5, hz + sz * 0.02); nameplate('탱크 호퍼', fx, hy + 0.3, hz - sz * 0.165, sz < 0 ? 0 : Math.PI, 0.26); }
    const px = fx + 0.47, pz = Z0 + sz * 0.95; prof(root, [px, 0.06, pz], [px, 2.12, pz], 0.06, m.frameDark); foot(root, px, pz); box(root, blue, 0.47, 0.1, 0.1, fx + 0.235, 2.12, pz); box(root, blue, 0.12, 0.12, 0.95, fx, 2.12, Z0 + sz * 0.52);   // post, bracket, Z rail
    const arm = G('B_TankArm' + nm, root, fx, 1.98, Z0 + sz * 0.5); box(arm, m.aluDark, 0.1, 0.1, 0.16, 0, 0.06, 0); box(arm, m.alu, 0.04, 0.6, 0.04, 0, -0.3, 0); box(arm, m.black, 0.12, 0.04, 0.08, 0, -0.62, 0); const t = G('B_TankArm' + nm + '_Tank', arm, 0, -0.68, 0); box(t, tankM, 0.1, 0.08, 0.05, 0, 0, 0);
    nameplate(sz < 0 ? '탱크 공급기 1' : '탱크 공급기 2', px, 1.5, pz - sz * 0.04, sz < 0 ? 0 : Math.PI, 0.3); fp('탱크 공급기 ' + (sz < 0 ? 1 : 2), fx - 0.37, fx + 0.53, Math.min(mz - 0.94, pz - 0.05), Math.max(mz + 0.94, pz + 0.05)); }
  stopper('Stop_tank', S.tank);
  for (const [k, px] of S.press.entries()) { stopper('Stop_press' + k, px); const sz = k ? 1 : -1, pz = Z0 + sz * 0.75; box(root, blue, 0.4, 1.3, 0.3, px, 0.65, pz + sz * 0.15); box(root, blue, 0.4, 0.22, 0.75, px, 1.17, pz - sz * 0.15); box(root, m.sheet, 0.42, 0.3, 0.3, px, 1.45, pz + sz * 0.15);
    const ram = G('B_Press_' + k, root, px, PT + YC, Z0 + sz * 0.2); box(ram, m.aluDark, 0.12, 0.12, 0.03, 0, 0, sz * 0.015); cyl(ram, m.steel, 0.03, 0.22, 0, 0, sz * 0.14, 'z', 12); box(root, m.black, 0.14, 0.14, 0.14, px, PT + YC, Z0 + sz * 0.42); box(root, blue, 0.1, 1.06 - PT - YC + 0.07, 0.1, px, (1.06 + PT + YC - 0.07) / 2, Z0 + sz * 0.42);   // ram face at |z| 0.2; cylinder hung from the C-frame arm
    nameplate('탱크 프레스 ' + (k + 1), px, 1.35, pz - sz * 0.53 + (sz < 0 ? 0.02 : -0.02), sz < 0 ? 0 : Math.PI, 0.36); fp('탱크 프레스 ' + (k + 1), px - 0.22, px + 0.22, Math.min(pz, pz + sz * 0.3), Math.max(pz, pz + sz * 0.3)); }
  stopper('Stop_vis', S.vis); gate(S.vis, 0.8, 1.7); camera(S.vis, 1.5, Z0, 'B_PressCam', PT + 0.1); nameplate('프레스 비전', S.vis, 1.84, Z0 - 0.05, 0, 0.36); fp('프레스 비전', S.vis - 0.15, S.vis + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopper('Stop_bstop', S.bstop); const R = robot('B', ...RBASE.B); if (R) gripper(R.tool, 'B', Math.PI / 2); fp('핸들링 로봇 B', RBASE.B[0] - 0.25, RBASE.B[0] + 0.25, RBASE.B[1] - 0.25, RBASE.B[1] + 0.25); nameplate('핸들링 로봇 B', RBASE.B[0], 0.5, RBASE.B[1] - 0.19, 0, 0.3);
    const [cx, cz] = S.bcab; cabin('스캔 레이저 용접', cx - 0.3, cx + 0.3, cz - 0.65, cz + 0.35, 2.1, 'N'); fixture(cx, cz, false);
    // the CAD's scan laser head on its stand, lens towards the fixture (+Z), firing across at the tank seam
    if (!part('laser-scan-head', cx, cz - 0.4)) { box(root, m.black, 0.2, 0.22, 0.2, cx, 0.95, cz - 0.3); }
    const bm = G('B_Laser_Beam', root); cyl(bm, laserM, 0.003, 0.18, cx, FIXY + YC, cz - 0.142 - 0.09, 'z', 6); cyl(bm, glowM, 0.012, 0.01, cx, FIXY + YC, cz - 0.147, 'z', 12);   // beam ends on the tank face
    stopper('Stop_bback', S.bback); }
  { stopper('Stop_bng', S.bng); ngStation('B', S.bng, 'NG 배출 · 보관', 0.95); }
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
  { stopper('Stop_cturn', S.cturn, false); turnUnit('C_Turn', S.cturn); nameplate('팔레트 턴 180°', S.cturn, BT - 0.3, Z0 - 0.33, 0, 0.3); }
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
  { stopper('Stop_cf', S.cf); fp('C/F 검사 터널', S.cf - TUN[0], S.cf + TUN[0], Z0 - TUN[1], Z0 + TUN[1]); const hd = G('D_CF_Hood', root, S.cf, 1.28, Z0); box(hd, blue, 0.4, 0.26, 0.34, 0, 0, 0); box(hd, glass, 0.3, 0.1, 0.28, 0, 0, 0); for (const sz of [-1, 1]) { cyl(hd, m.black, 0.015, 0.025, -0.03, -0.1425, sz * 0.05, 'y', 12); cyl(hd, m.black, 0.006, 0.05, -0.03, -0.105, sz * 0.05, 'y', 8); } box(root, m.aluDark, 0.05, 0.14, 0.05, S.cf, 1.47, Z0);   // test head hung from the tunnel roof: two sealing nozzles for the coolant pipes
    const ok = G('D_CF_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.cf + 0.5, TUN[2] + 0.04, Z0 - 0.5, 'y', 14); }
  { stopper('Stop_paste', S.paste); gate(S.paste, 0.9, 1.85); const gx = G('D_Disp_X', root, S.paste, 0, Z0), gz = G('D_Disp_Z', gx), gy = G('D_Disp_Y', gz); box(gx, m.aluDark, 0.14, 0.1, 0.9, 0, 1.85, 0); box(gz, m.aluDark, 0.12, 0.1, 0.12, 0, 1.79, 0); box(gy, m.alu, 0.05, 0.5, 0.05, 0, 1.5, 0); box(gy, blue, 0.1, 0.16, 0.1, 0, 1.32, 0); cyl(gy, m.black, 0.03, 0.1, 0, 1.19, 0, 'y', 12); cyl(gy, m.steel, 0.004, 0.06, 0, 1.11, 0, 'y', 6);
    let tanks = 0; for (let k = 0; k < 4; k++) if (part('paste-tank', S.paste - 0.96 + k * 0.64, Z0 + 1.2)) tanks++;   // four pressure tanks from the CAD, one per paste
    if (!tanks) { box(root, m.sheet, 1.4, 0.8, 0.5, S.paste, 0.4, Z0 + 1.15); for (let k = 0; k < 4; k++) cyl(root, magenta, 0.12, 0.5, S.paste - 0.5 + k * 0.34, 1.06, Z0 + 1.15, 'y', 20); }
    cyl(root, m.black, 0.012, 0.75, S.paste, 1.75, Z0 + 0.8, 'z', 8); prof(root, [S.paste, 1.12, Z0 + 1.2], [S.paste, 1.75, Z0 + 1.2], 0.03, m.frameDark);
    nameplate('외부 페이스트 도포', S.paste, 1.99, Z0 - 0.05, 0, 0.44); nameplate('페이스트 탱크 ×4', S.paste - 0.32, 1.3, Z0 + 0.95, 0, 0.36); fp('페이스트 탱크', S.paste - 1.27, S.paste + 1.27, Z0 + 0.96, Z0 + 1.44); fp('외부 도포', S.paste - 0.15, S.paste + 0.15, Z0 - 0.5, Z0 + 0.5); }
  { stopper('Stop_check', S.check); for (const sz of [-1, 1]) prof(root, [S.check, 0.06, Z0 + sz * 0.42], [S.check, 1.7, Z0 + sz * 0.42], 0.04); box(root, m.aluDark, 0.08, 0.04, 0.9, S.check, 1.72, Z0); box(root, m.light, 0.06, 0.012, 0.7, S.check, 1.695, Z0);
    cyl(root, m.frameDark, 0.015, 0.5, S.check + 0.3, 1.3, Z0 - 0.42, 'y', 8); cyl(root, glass, 0.09, 0.012, S.check + 0.3, 1.42, Z0 - 0.3, 'z', 20); cyl(root, m.black, 0.1, 0.01, S.check + 0.3, 1.42, Z0 - 0.31, 'z', 20); nameplate('수동 검사', S.check, 1.86, Z0 - 0.05, 0, 0.36); }
  tower(S.dEnd - 0.2, Z0 - 1.5);

  // ================================================================ E. leak test (x 20.5 … 27.3)
  { stopper('Stop_eturn', S.eturn, false); turnUnit('E_Turn', S.eturn); box(root, m.black, 0.06, 0.06, 0.1, S.eturn - 0.35, BT + 0.3, Z0 - 0.4); box(root, m.red, 0.004, 0.02, 0.06, S.eturn - 0.32, BT + 0.3, Z0 - 0.4); prof(root, [S.eturn - 0.35, 0.06, Z0 - 0.42], [S.eturn - 0.35, BT + 0.35, Z0 - 0.42], 0.03); nameplate('바코드 · 턴 유닛', S.eturn, BT - 0.3, Z0 - 0.33, 0, 0.3); }
  stopper('Stop_evis', S.evis); gate(S.evis, 0.8, 1.7); camera(S.evis, 1.5, Z0, 'E_VisCam', PT + 0.1); nameplate('외관 검사', S.evis, 1.84, Z0 - 0.05, 0, 0.36); fp('외관 검사', S.evis - 0.15, S.evis + 0.15, Z0 - 0.45, Z0 + 0.45);
  { stopper('Stop_estop', S.estop); const R = robot('E', ...RBASE.E); if (R) gripper(R.tool, 'E'); fp('핸들링 로봇 E', RBASE.E[0] - 0.25, RBASE.E[0] + 0.25, RBASE.E[1] - 0.25, RBASE.E[1] + 0.25); nameplate('핸들링 로봇 E', RBASE.E[0], 0.5, RBASE.E[1] - 0.19, 0, 0.3);
    const [cx, cz] = S.ecab; cabin('리크 테스터', cx - 0.3, cx + 0.3, cz - 0.45, cz + 0.35, 2.0, 'N'); fixture(cx, cz, true);
    const hood = G('E_Hood', root, cx, 1.5, cz); box(hood, glass, 0.4, 0.3, 0.24, 0, 0, 0); box(hood, m.aluDark, 0.42, 0.03, 0.26, 0, 0.165, 0); box(hood, m.rubber, 0.4, 0.01, 0.24, 0, -0.145, 0);   // sealing hood: closes onto the fixture plate around the part box(root, m.aluDark, 0.08, 0.5, 0.08, cx, 1.85, cz);
    const ok = G('E_Leak_OK', root); cyl(ok, m.lampG, 0.032, 0.06, cx + 0.4, 1.5, cz - 0.1, 'y', 14); const ng = G('E_Leak_NG', root); cyl(ng, m.lampR, 0.032, 0.06, cx + 0.4, 1.5, cz + 0.1, 'y', 14); prof(root, [cx + 0.4, 0.06, cz], [cx + 0.4, 1.45, cz], 0.03, m.frameDark);
    stopper('Stop_eback', S.eback); }
  { stopper('Stop_mark', S.mark); fp('레이저 마킹 터널', S.mark - TUN[0], S.mark + TUN[0], Z0 - TUN[1], Z0 + TUN[1]); box(root, m.aluDark, 0.05, 0.16, 0.05, S.mark, 1.46, Z0); const h = G('E_MarkHead', root, S.mark, 1.3, Z0); box(h, m.black, 0.18, 0.16, 0.18, 0, 0, 0); cyl(h, m.steel, 0.04, 0.04, 0, -0.1, 0, 'y', 12); const bm = G('E_Mark_Beam', h), LB = 1.3 - 0.06 - 0.12 - (PT + YC + 0.0355); cyl(bm, laserM, 0.003, LB, 0, -0.12 - LB / 2, 0, 'y', 6); }   // galvo head hung from the tunnel roof
  { stopper('Stop_nut', S.nut); const nr = balancer('E_Nutrunner', S.nut + 0.45, Z0 + 0.65, 1.5, NUT_RY); cyl(nr, m.black, 0.02, 0.4, 0, 0, 0, 'y', 10); cyl(nr, m.yellow, 0.03, 0.08, 0, 0.1, 0, 'y', 10); cyl(nr, m.steel, 0.006, 0.08, 0, -0.24, 0, 'y', 6); cyl(nr, m.black, 0.006, 0.4, 0, 0.4, 0, 'y', 6);
    box(root, m.aluDark, 0.4, 0.03, 0.3, S.nut, 0.9, Z0 - 0.7); for (const sx of [-1, 1]) for (const sz of [-1, 1]) prof(root, [S.nut + sx * 0.17, 0.06, Z0 - 0.7 + sz * 0.12], [S.nut + sx * 0.17, 0.885, Z0 - 0.7 + sz * 0.12], 0.04); for (let k = 0; k < 3; k++) cyl(root, m.rubber, 0.04, 0.004, S.nut - 0.1 + k * 0.1, 0.918, Z0 - 0.7, 'y', 16); cyl(root, m.sheet, 0.12, 0.3, S.nut + 0.25, 1.05, Z0 - 0.7, 'y', 16);
    nameplate('가스켓 · 볼트 체결', S.nut, 0.9, Z0 - 0.86, 0, 0.36); fp('가스켓 · 볼트', S.nut - 0.22, S.nut + 0.4, Z0 - 0.9, Z0 - 0.5); }
  { stopper('Stop_okng', S.okng); gate(S.okng, 0.8, 1.6); const ok = G('E_OKNG_OK', root); cyl(ok, m.lampG, 0.032, 0.06, S.okng, 1.65, Z0 - 0.4, 'y', 14); const ng = G('E_OKNG_NG', root); cyl(ng, m.lampR, 0.032, 0.06, S.okng, 1.65, Z0 + 0.4, 'y', 14); nameplate('OK / NG 분기', S.okng, 1.74, Z0 - 0.05, 0, 0.36);
    ngStation('E', S.okng, 'NG 보관'); }
  { // packer: a 2-axis pick-and-place lifts the finished cooler off the pallet into the carton on the stand (x pack, z −1.05)
    stopper('Stop_pack', S.pack); const bx = S.pack, bz = Z0 - 1.05; box(root, m.sheet, 0.7, 0.55, 0.6, bx, 0.275, bz); box(root, m.black, 0.72, 0.02, 0.62, bx, 0.56, bz); nameplate('완제품 상자 스탠드', bx, 0.35, bz - 0.31, 0, 0.36); fp('상자 스탠드 E', bx - 0.35, bx + 0.35, bz - 0.3, bz + 0.3);
    for (const sx of [-1, 1]) { prof(root, [bx + sx * 0.5, 0.06, Z0 + 0.5], [bx + sx * 0.5, 2.1, Z0 + 0.5], 0.06, m.frameDark); prof(root, [bx + sx * 0.5, 0.06, bz - 0.45], [bx + sx * 0.5, 2.1, bz - 0.45], 0.06, m.frameDark); box(root, blue, 0.12, 0.12, Z0 + 0.5 - (bz - 0.45), bx + sx * 0.5, 2.1, (Z0 + 0.5 + bz - 0.45) / 2); }
    const gz = G('E_Packer_Z', root, bx, 0, Z0), gy = G('E_Packer_Y', gz); box(gz, m.aluDark, 1.16, 0.14, 0.16, 0, 2.1, 0); box(gz, m.aluDark, 0.14, 0.12, 0.16, 0, 2.03, 0); padHand(gy, 'E_Packer');
    nameplate('완제품 포장 로더', bx, 2.25, Z0 - 1.5, 0, 0.44);
    const cs = G('E_Pack_Carton', root, bx, 0.57, bz); box(cs, cardboard, 0.5, 0.005, 0.4, 0, 0.0025, 0); for (const sx of [-1, 1]) box(cs, cardboard, 0.006, 0.36, 0.4, sx * 0.247, 0.18, 0); for (const sz of [-1, 1]) box(cs, cardboard, 0.5, 0.36, 0.006, 0, 0.18, sz * 0.197);   // open carton on the stand
    const lid = G('E_Pack_Lid', root, bx, 0.57 + 0.363, bz); box(lid, cardboard, 0.5, 0.006, 0.4, 0, 0, 0); box(lid, m.tote, 0.5, 0.002, 0.05, 0, 0.004, 0);   // flaps closed, taped
    for (let j = 0; j < 4; j++) { const [dx, y, dz] = cartonSlot(j), it = G('E_Carton_Item_' + j, root, bx + dx, y, bz + dz); lookFinal(it); } }
  monitor('E_HMI', S.eturn + 0.8, Z0 - 1.4, 0.4); tower(S.eEnd - 0.2, Z0 - 1.5);

  // ================================================================ the four operators (the only manual stations, as in the CAD): the catalogue's factory worker
  // as a rigid figure on a rig W_n_X › W_n_Z › W_n (turn) › W_n_Lean; W_n_Carry holds what they carry. Home spots face the line (+Z).
  const operator = (n, x, z) => { const wx = G('W_' + n + '_X', root, x, 0, 0), wz = G('W_' + n + '_Z', wx, 0, 0, z), wr = G('W_' + n, wz), wl = G('W_' + n + '_Lean', wr);
    const src = (globalThis.PARTS || {}).worker; if (src) { const o = src.clone(true), b = new THREE.Box3().setFromObject(o); o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); wl.add(o); }
    else { box(wl, m.sheet, 0.4, 1.7, 0.25, 0, 0.85, 0); }
    return G('W_' + n + '_Carry', wr, 0, 0.92, 0.32); };
  const HOMES = { 1: [S.tote, Z0 - 1.45], 2: [S.manual - 0.1, Z0 - 0.8], 3: [S.check, Z0 - 0.85], 4: [S.pack, Z0 - 1.95] };
  { const c1 = operator(1, ...HOMES[1]), t = G('W_1_Tote', c1); box(t, m.tote, 0.86, 0.005, 0.5, 0, -0.05, 0); for (const sx of [-1, 1]) box(t, m.tote, 0.01, 0.1, 0.5, sx * 0.425, 0, 0); for (const sz of [-1, 1]) box(t, m.tote, 0.86, 0.1, 0.01, 0, 0, sz * 0.245); const full = G('W_1_ToteFull', t); for (let k = 0; k < 8; k++) lookCore(G('W_1_ToteCore_' + k, full, ((k >> 1) - 1.5) * 0.2, -0.045, k % 2 ? 0.12 : -0.12));   // the core tote (empty out, full back)
    operator(2, ...HOMES[2]); operator(3, ...HOMES[3]);
    const c4 = operator(4, ...HOMES[4]), ct = G('W_4_Carton', c4); box(ct, cardboard, 0.5, 0.36, 0.4, 0, 0, 0);
    }
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
  root.userData.homes = HOMES; root.userData.table = TABLE; root.userData.stops = STOPS; const model = animate(pbrClamp(finalize(root)), robots);   // rule set v2.0 §5: machine surfaces metalness 0.5–0.8, roughness 0.2–0.4 (after finalize builds the meshes)
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
// Every product is ONE object (Part_k rig) from the tote to the carton: while a hand holds it (loader, robot gripper, packer) its keys are
// sampled from the hand's own motion (the KEY_Ref point at the part's bottom centre), so it never leaves the fingers and is never swapped for a
// copy while moving. Copies exist only for stock at rest (cores waiting in the tote, coolers packed in the carton), swapped at the same pose.
function animate(root, robots) {
  const T = MODULE_T, P = MODULE_P, N = T / P, V = (x, y, z) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
  const ease = u => u * u * (3 - 2 * u); let ch = {};
  const add = (node, c, list) => { if (!root.getObjectByName(node)) throw new Error('no node ' + node); const key = node + '|' + c; (ch[key] || (ch[key] = [])).push(...list); };
  const ser = (evs, rest) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); const f = t => { let k = -1; while (k + 1 < evs.length && evs[k + 1][0] <= t) k++; if (k < 0) return rest; if (k === evs.length - 1) return evs[k][1]; const [t0, v0] = evs[k], [t1, v1] = evs[k + 1]; return v0 + (v1 - v0) * ease(t1 > t0 ? (t - t0) / (t1 - t0) : 1); }; return [[0, f(0)], ...evs.filter(e => e[0] > 0 && e[0] < T), [T, f(T)]]; };
  const vis = (evs, v0) => { evs = evs.slice().sort((a, b) => a[0] - b[0]); let s = v0; for (const [t, v] of evs) if (t <= 0) s = v; return [[0, s], ...evs.filter(e => e[0] > 0 && e[0] < T)]; };
  const flash = (node, t0, t1) => add(node, 'vis', [[t0, true], [t1, false]]);
  const head = (node, t0, t1, d) => add(node, 'y', [[t0, 0], [t0 + 1.0, -d], [t1 - 1.0, -d], [t1, 0]]);
  const fingers = (key, close, open, pads = false) => { const A = key + (pads ? '_PadA' : '_FingerA'), B = key + (pads ? '_PadB' : '_FingerB'), c = pads ? 'z' : 'y';   // close: [t0, t1] closing; open: [t0, t1] opening
    add(A, c, [[close[0], 0], [close[1], -GRIP_OPEN], [open[0], -GRIP_OPEN], [open[1], 0]]); add(B, c, [[close[0], 0], [close[1], GRIP_OPEN], [open[0], GRIP_OPEN], [open[1], 0]]); };
  const AXN = ['ry', 'rz', 'rz', 'rz', 'ry', 'rz'], TIPL = V(0, 0, 0.101 + 0.165), H = 0.12;
  const rig = (key, tip = TIPL) => robots[key] ? ikRig(root, robots[key].J, tip) : null;
  const playRobot = (key, rp, t0) => { if (!robots[key]) return; robots[key].J.forEach((j, q) => add(j.name, AXN[q], [[t0 - 0.01, 0], ...rp.wp.map(([t, v]) => [t0 + t, v[q] - rp.rest[q]]), [t0 + rp.T + 0.01, 0]])); };
  // ---- robot paths: the tool tip is the part's centre (bottom + YC); grip / release points are exact (part bottom on the support surface)
  const rigA = rig('A');
  const pathA = li => { const sz = li ? 1 : -1, lz = LANES[li], y0 = BT + YC, y1 = PT + YC;   // lane end → the pallet cradle at the merge stop
    return rigA && rigA.trace([[HOME.A(li), 0], [[RBASE.A[0] - 0.1, RH + 0.4, Z0 + sz * 0.5], 0.8], [[S.lane, y0 + H, lz], 1.2], [[S.lane, y0, lz], 0.6], [[S.lane, y0, lz], 0.3, 'grip'], [[S.lane, y0 + H, lz], 0.5],
      [[S.merge, y1 + H, Z0], 1.6], [[S.merge, y1, Z0], 0.5], [[S.merge, y1, Z0], 0.3, 'release'], [[S.merge, y1 + H, Z0], 0.4], [[RBASE.A[0] - 0.1, RH + 0.4, Z0 + sz * 0.5], 1.0], [HOME.A(li), 0.6]], 'A robot lane ' + li); };
  const RA = rigA ? [pathA(0), pathA(1)] : null;
  const pathSide = (key, home, base, stopX, cab, backX, label) => { const rg = rig(key); if (!rg) return null; const y0 = PT + YC, [cx, cz] = cab, yc = FIXY + YC, out = [base[0] - 0.5, RH + 0.2, base[1]];
    return rg.trace([[home, 0], [out, 0.8], [[stopX, y0 + H, Z0], 1.2], [[stopX, y0, Z0], 0.6], [[stopX, y0, Z0], 0.3, 'grip'], [[stopX, y0 + H, Z0], 0.5], [[stopX + 0.3, y0 + H + 0.05, Z0 - 0.15], 0.6], [[cx, yc + H, cz], 1.4], [[cx, yc, cz], 0.6], [[cx, yc, cz], 0.3, 'put'], [[cx, yc + H, cz], 0.5], [[cx - 0.25, yc + H + 0.1, cz - 0.1], 0.6], [home, 1.0], [home, 10.0, 'wait'],
      [[cx, yc + H, cz], 1.4], [[cx, yc, cz], 0.6], [[cx, yc, cz], 0.3, 'take'], [[cx, yc + H, cz], 0.5], [[backX, y0 + H, Z0], 1.8], [[backX, y0, Z0], 0.5], [[backX, y0, Z0], 0.3, 'release'], [[backX, y0 + H, Z0], 0.4], [[base[0], y0 + H, Z0], 0.8], [out, 0.8], [home, 0.8]], label); };
  const RB = pathSide('B', HOME.B, RBASE.B, S.bstop, S.bcab, S.bback, 'B robot'), RE = pathSide('E', HOME.E, RBASE.E, S.estop, S.ecab, S.eback, 'E robot');
  const RM = (() => { if (!robots.C0) return null; const rg = ikRig(root, robots.C0.J, V(0, 0, 0.255)), bx = S.mig[0], yj = PT + YC, zj = Z0 - 0.146, r = 0.052;   // MIG torch: upper half of the near flange ring (traced on C0, reused)
    const arc = []; for (let i = 0; i <= 6; i++) { const a = 0.25 + (Math.PI - 0.5) * i / 6; arc.push([[bx + r * Math.cos(a), yj + r * Math.sin(a) + 0.004, zj - 0.012], i ? 0.55 : 0.3, i === 0 ? 'weld0' : i === 6 ? 'weld1' : undefined]); }
    return rg.trace([[[bx, RHM + 0.55, MZ + 0.45], 0], [[bx + 0.2, 1.2, Z0 - 0.55], 1.0], [[bx + r + 0.03, yj + 0.1, zj - 0.012], 0.8], ...arc, [[bx - r - 0.02, yj + 0.1, zj - 0.012], 0.4], [[bx - 0.2, 1.2, Z0 - 0.55], 0.8], [[bx, RHM + 0.55, MZ + 0.45], 0.8]], 'MIG robot'); })();

  // ---- interference checks at build time (A7): the closed fingers / pads sit on the core fins (0–1 mm), clear of the coolant pipes
  { const fin = 0.094 / 2, pipe = 0.05 - 0.011; if (GRIP_IN < fin || GRIP_IN - fin > 0.001) throw new Error('gripper: inner face ' + GRIP_IN + ' vs core fins ' + fin);
    if (0.035 >= pipe || 0.03 >= pipe) throw new Error('gripper body / hand bracket reaches the coolant pipes'); }

  const STOPS = root.userData.stops, stopAt = x => STOPS[x.toFixed(3)], hasPins = n => !!(n && root.getObjectByName(n + '_Pins'));
  const CV = 0.4, RV = 1.0, PACKS = [];   // belt speed, return speed; pack times (pass 1)
  let SLOT = null, parts = [];
  const NUT = (() => { const ax = S.nut + 0.45 + Math.cos(NUT_RY) * 0.5, az = Z0 + 0.65 - Math.sin(NUT_RY) * 0.5, y = PT + YC + 0.05 + 0.28 - 1.5;   // bit tip on the flange top, 4 bolts
    return [[S.nut - 0.146, Z0 - 0.04], [S.nut - 0.146, Z0 + 0.04], [S.nut + 0.146, Z0 + 0.04], [S.nut + 0.146, Z0 - 0.04]].map(([x, z]) => [x - ax, y, z - az]); })();

  const runParts = pass => { parts = []; const MAG = { _L: [...Array(MAG_N).keys()], _R: [...Array(MAG_N).keys()] };   // MAG[side][j] = pocket of tank j (0 = pick point)
  for (let jj = -2; jj < N + 2; jj++) {
    const k = ((jj % N) + N) % N, cyc = Math.floor(jj / N), QN = 'Part_' + (k + 1), PN = 'Pal_' + (k + 1), s = jj * P, li = k % 2, lz = LANES[li], dNG = k === 5, lNG = k === 2;
    const R = { QN, PN, KX: [], KY: [], KZ: [], VIS: [], RY: [], PX: [], PZ: [], PY: [], PRY: [], CL: [], carries: [] }; parts.push(R);
    let cx = S.merge, ct = 0, empty = false, pyaw = TAU * cyc, qyaw = dNG ? 0 : TAU * cyc;   // pallet / part yaw: one full turn per round trip (B +¼, C +½, E +¼)
    const at = (t, [x, y, z]) => { R.KX.push([s + t, x]); R.KY.push([s + t, y - PT]); R.KZ.push([s + t, z - Z0]); }, show = (t, v) => R.VIS.push([s + t, v]), ry = (t, v) => R.RY.push([s + t, v]);
    const palAt = (t, x, y = BT, z = Z0) => { R.PX.push([s + t, x - S.merge]); R.PY.push([s + t, y - BT]); R.PZ.push([s + t, z - Z0]); }, palRy = (t, v) => R.PRY.push([s + t, v]), clamp = (t, closed) => R.CL.push([s + t, closed ? 0 : -1.4]);
    const partOn = (t, x, y = PT, z = Z0) => { if (!empty) at(t, [x, y, z]); };
    const carry = (ref, t0, t1) => R.carries.push({ ref, t0, t1, yaw: qyaw });
    const conv = (x1, stopName) => { if (stopName) { if (hasPins(stopName)) { add(stopName + '_Pins', 'y', [[s + ct, 0.05], [s + ct + 0.5, 0]]); ct += 0.6; } add(stopName, 'y', [[s + ct - 0.1, 0], [s + ct + 0.3, -0.11], [s + ct + 1.9, -0.11], [s + ct + 2.3, 0]]); ct += 0.3; }
      const t1 = ct + Math.abs(x1 - cx) / CV; palAt(ct, cx); partOn(ct, cx); palAt(t1, x1); partOn(t1, x1); cx = x1; ct = t1;
      const st = stopAt(x1); if (hasPins(st)) add(st + '_Pins', 'y', [[s + t1 + 0.2, 0], [s + t1 + 0.7, 0.05]]); return t1; };
    const dwell = dt => { const t0 = ct; ct = t0 + dt; return t0; };
    const turn = (node, dq) => { const t0 = dwell(5); add(node, 'y', [[s + t0 + 0.3, 0], [s + t0 + 0.8, 0.05], [s + t0 + 1.2, 0.08], [s + t0 + 3.5, 0.08], [s + t0 + 3.9, 0.05], [s + t0 + 4.3, 0]]); add(node, 'ry', [[s + t0 + 1.2, 0], [s + t0 + 3.5, dq], [s + t0 + 4.4, dq], [s + t0 + 4.41, 0]]);
      palAt(t0 + 0.8, cx); palAt(t0 + 1.2, cx, BT + 0.03); palAt(t0 + 3.5, cx, BT + 0.03); palAt(t0 + 3.9, cx); palRy(t0 + 1.2, pyaw); palRy(t0 + 3.5, pyaw + dq); pyaw += dq;   // lift 30 mm clear of the guide rails, turn, set down
      if (!empty) { partOn(t0 + 0.8, cx); partOn(t0 + 1.2, cx, PT + 0.03); partOn(t0 + 3.5, cx, PT + 0.03); partOn(t0 + 3.9, cx); ry(t0 + 1.2, qyaw); ry(t0 + 3.5, qyaw + dq); qyaw += dq; } };
    // NG: pusher → NG rollers → into the NG store (the part is taken off inside) → back out empty → return pusher → on the line again, empty
    const ngTrip = key => { const x = cx, sx = x + 0.75, z1 = Z0 + 0.95, stn = stopAt(x); if (hasPins(stn)) { add(stn + '_Pins', 'y', [[s + ct + 0.8, 0.05], [s + ct + 1.3, 0]]); ct += 1.4; } const t0 = dwell(0);
      add(key + '_NG_Pusher', 'z', [[s + t0, 0], [s + t0 + 0.5, 0.14], [s + t0 + 2.0, 1.09], [s + t0 + 2.4, 1.09], [s + t0 + 3.4, 0]]);
      palAt(t0 + 0.5, x); palAt(t0 + 2.0, x, BT, z1); palAt(t0 + 2.6, x, BT, z1); palAt(t0 + 2.6 + 0.75 / 0.3, sx, BT, z1); partOn(t0 + 0.5, x); partOn(t0 + 2.0, x, PT, z1); partOn(t0 + 2.6, x, PT, z1); partOn(t0 + 2.6 + 0.75 / 0.3, sx, PT, z1);
      const tin = t0 + 2.6 + 0.75 / 0.3; show(tin, false); empty = true;   // inside the closed NG store
      palAt(tin + 6, sx, BT, z1); palAt(tin + 6 + 0.75 / 0.3, x, BT, z1); const tb = tin + 6.5 + 0.75 / 0.3;
      add(key + '_NG_Return', 'z', [[s + tb - 0.5, 0], [s + tb, -0.02], [s + tb + 1.5, -0.97], [s + tb + 1.9, -0.97], [s + tb + 2.9, 0]]); palAt(tb, x, BT, z1); palAt(tb + 1.5, x); if (hasPins(stn)) add(stn + '_Pins', 'y', [[s + tb + 2.0, 0], [s + tb + 2.5, 0.05]]); ct = tb + 2.6; };

    // ---- A: the loader takes core k out of the tote and sets it on its lane; centring; fin vision; robot A → pallet; clamps close
    { const [tx, tz] = toteSlotOf(k), col = k >> 1;
      add('A_Loader_X', 'x', [[s - 9.5, 0], [s - 8.5, tx - S.tote], [s - 6, tx - S.tote], [s - 4.5, 0.1 - S.tote], [s - 1.8, 0.1 - S.tote], [s - 0.5, 0]]);
      add('A_Loader_Z', 'z', [[s - 9.5, 0], [s - 8.5, tz - Z0], [s - 6, tz - Z0], [s - 4.5, lz - Z0], [s - 1.8, lz - Z0], [s - 0.5, 0]]);
      add('A_Loader_Y', 'y', [[s - 8.5, 0], [s - 7.6, -(1.015 - 0.575)], [s - 6.6, -(1.015 - 0.575)], [s - 5.6, 0], [s - 4.5, 0], [s - 3.4, -(1.015 - BT)], [s - 2.2, -(1.015 - BT)], [s - 1.8, 0]]);
      fingers('A_Loader', [s - 7.4, s - 6.8], [s - 3.2, s - 2.6], true);
      ry(-7.2, qyaw); at(-7.2, [tx, 0.575, tz]); show(-7.2, false); show(-6.8, true); add('A_Tote_Core_' + k, 'vis', [[s - 6.8, false]]);   // copy → the real part, at rest in the pads
      for (const g of ['_Paste', '_Tanks', '_Seam', '_FlangeL', '_FlangeR', '_Pipes', '_Mark']) add(QN + g, 'vis', [[s - 7.4, false]]);
      at(-6.6, [tx, 0.575, tz]); carry('A_Loader_Ref', s - 6.6, s - 3.4); at(-3.4, [0.1, BT, lz]); }
    at(0.6, [0.55, BT, lz]); at(2.6, [0.55, BT, lz]); at(5.6, [S.lane, BT, lz]);   // rollers to the centring gate, centred, on to the end stop
    for (const sd of ['_L', '_R']) add('A_Center_' + li + sd, 'z', [[s + 0.7, 0], [s + 1.3, sd === '_L' ? 0.138 : -0.138], [s + 2.0, sd === '_L' ? 0.138 : -0.138], [s + 2.5, 0]]);   // pushers land on the core's sides
    flash('A_FinCam_' + li, s + 3.9, s + 4.3);
    const ra = s + 6.0, rA = RA ? RA[li] : null;
    palAt(0, S.merge); clamp(0, false);   // the empty pallet waits at the merge stop, clamps open
    if (rA) { playRobot('A', rA, ra); const e = rA.ev, tg = ra + e.grip, tr = ra + e.release - 0.3; fingers('A', [tg - 0.3, tg], [tr + 0.05, tr + 0.3]); at(tg - s, [S.lane, BT, lz]); carry('A_Ref', tg, tr); at(tr - s, [S.merge, PT, Z0]); ct = tr - s + 0.3; }
    else { at(14, [S.merge, PT, Z0]); ct = 14; }
    clamp(ct + 0.3, false); clamp(ct + 1.0, true); ct += 1.4;
    conv(S.prof, 'Stop_merge'); { const t0 = dwell(6); head('A_ProfHead', s + t0 + 0.8, s + t0 + 5.2, PROF_D); flash('A_Profile', s + t0 + 1.8, s + t0 + 4.4); }
    conv(S.disp, 'Stop_prof'); { const t0 = dwell(10); add('A_Disp_Y', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 8.5, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 9.5, 0]]);
      add('A_Disp_X', 'x', [[s + t0 + 2, -0.093], [s + t0 + 5, -0.093], [s + t0 + 5.4, 0.093], [s + t0 + 8.5, 0.093], [s + t0 + 9.5, 0]]); add('A_Disp_Z', 'z', [[s + t0 + 2, -0.04], [s + t0 + 5, 0.04], [s + t0 + 5.4, -0.04], [s + t0 + 8.5, 0.04], [s + t0 + 9.5, 0]]); add(QN + '_Paste', 'vis', [[s + t0 + 8.5, true]]); }
    conv(S.cam, 'Stop_disp'); { const t0 = dwell(3); flash('A_NozCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.scale, 'Stop_cam'); { const t0 = dwell(4); add('A_Scale', 'y', [[s + t0, 0], [s + t0 + 0.6, 0.138], [s + t0 + 0.9, 0.158], [s + t0 + 3.1, 0.158], [s + t0 + 3.4, 0.138], [s + t0 + 4, 0]]);   // the platform rises to the pallet and lifts it 20 mm off the belts
      palAt(t0 + 0.6, S.scale); palAt(t0 + 0.9, S.scale, BT + 0.02); palAt(t0 + 3.1, S.scale, BT + 0.02); palAt(t0 + 3.4, S.scale); partOn(t0 + 0.6, S.scale); partOn(t0 + 0.9, S.scale, PT + 0.02); partOn(t0 + 3.1, S.scale, PT + 0.02); partOn(t0 + 3.4, S.scale); }
    conv(S.ngA, 'Stop_scale');
    if (dNG) ngTrip('A'); else dwell(1);
    // ---- B: pallet turn → tank feeders → presses → vision → robot: pallet → laser fixture → pallet → outfeed
    conv(S.turn, 'Stop_ngA'); turn('B_Turn', Math.PI / 2);
    conv(S.tank, 'Stop_turn'); { const t0 = dwell(9); if (!empty) { for (const sd of ['_L', '_R']) { const sg = sd === '_L' ? -1 : 1;
      add('B_TankArm' + sd, 'y', [[s + t0, 0], [s + t0 + 1, -0.1], [s + t0 + 1.8, -0.1], [s + t0 + 2.6, 0], [s + t0 + 4.4, 0], [s + t0 + 5.4, -(1.30 - (PT + YC))], [s + t0 + 6.6, -(1.30 - (PT + YC))], [s + t0 + 7.6, 0]]);   // down onto the magazine's end tank, up, along the rail, down onto the core end
      add('B_TankArm' + sd, 'z', [[s + t0 + 2.6, 0], [s + t0 + 4.4, -sg * 0.385], [s + t0 + 7.6, -sg * 0.385], [s + t0 + 9, 0]]); add('B_TankArm' + sd + '_Tank', 'vis', [[s + t0 + 1.8, true], [s + t0 + 6.6, false]]);
      const sl = MAG[sd], off = (j, slot) => sg * MAG_P * (slot - j);   // the arm takes the front tank; the chain then indexes one pitch; the back pocket is refilled
      for (let j = 0; j < MAG_N; j++) { const nn = 'B_Mag' + sd + '_T' + j;
        if (sl[j] === 0) { add(nn, 'vis', [[s + t0 + 1.8, false], [s + t0 + 2.4, true]]); add(nn, 'z', [[s + t0 + 1.9, off(j, 0)], [s + t0 + 2.0, off(j, MAG_N)], [s + t0 + 3.0, off(j, MAG_N)], [s + t0 + 4.0, off(j, MAG_N - 1)]]); sl[j] = MAG_N - 1; }   // the next tank drops from the hopper into the back pocket (inside the hopper) and rides out with the index
        else { add(nn, 'z', [[s + t0 + 3.0, off(j, sl[j])], [s + t0 + 4.0, off(j, sl[j] - 1)]]); sl[j] -= 1; } } } add(QN + '_Tanks', 'vis', [[s + t0 + 6.6, true]]); } }
    for (const [k2, px] of S.press.entries()) { conv(px, k2 ? 'Stop_press0' : 'Stop_tank'); const t0 = dwell(6), sg = k2 ? 1 : -1; if (!empty) add('B_Press_' + k2, 'z', [[s + t0 + 1, 0], [s + t0 + 2.2, -sg * 0.06], [s + t0 + 4, -sg * 0.06], [s + t0 + 5, 0]]); }   // the ram face lands on the tank
    conv(S.vis, 'Stop_press1'); { const t0 = dwell(3); if (!empty) flash('B_PressCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.bstop, 'Stop_vis');
    if (!empty && RB) { const t0 = ct, rb = s + t0 + 1.5, e = RB.ev, tg = rb + e.grip, tp = rb + e.put - 0.3, tk = rb + e.take, tr = rb + e.release - 0.3; clamp(t0 + 0.2, true); clamp(t0 + 1.0, false);
      playRobot('B', RB, rb); fingers('B', [tg - 0.3, tg], [tp + 0.05, tp + 0.3]); fingers('B', [tk - 0.3, tk], [tr + 0.05, tr + 0.3]);
      at(tg - s, [S.bstop, PT, Z0]); carry('B_Ref', tg, tp); carry('B_Ref', tk, tr);
      flash('B_Laser_Beam', tp + 1.5, tk - 1.5); add(QN + '_Seam', 'vis', [[tk - 1.5, true]]);
      ct = tg - s + 0.8; conv(S.bback, 'Stop_bstop'); clamp(ct, false); ct = tr - s; at(tr - s, [S.bback, PT, Z0]); clamp(ct + 0.35, false); clamp(ct + 1.1, true); ct += 1.5; }   // the empty pallet waits at the back stop
    else { dwell(1); conv(S.bback, 'Stop_bstop'); dwell(1); }
    conv(S.bng, 'Stop_bback'); dwell(1);
    // ---- C: flanges from both feeders at one stop; MIG robots 1-2; pallet turn 180°; MIG robots 3-4; manual MIG
    conv(S.flange, 'Stop_bng'); { const t0 = dwell(9); if (!empty) for (const fk of [0, 1]) { const sg = fk ? 1 : -1;
      add('C_FlangeArm_' + fk, 'y', [[s + t0, 0], [s + t0 + 1, -(0.98 - 0.87)], [s + t0 + 1.8, -(0.98 - 0.87)], [s + t0 + 2.6, 0], [s + t0 + 4.4, 0], [s + t0 + 5.4, -(0.98 - (PT + YC))], [s + t0 + 6.4, -(0.98 - (PT + YC))], [s + t0 + 7.4, 0]]);
      add('C_FlangeArm_' + fk, 'z', [[s + t0 + 2.6, 0], [s + t0 + 4.4, -sg * 0.644], [s + t0 + 7.4, -sg * 0.644], [s + t0 + 8.8, 0]]); add('C_FlangeArm_' + fk + '_Flange', 'vis', [[s + t0 + 1.8, true], [s + t0 + 6.4, false]]); add(QN + (fk ? '_FlangeR' : '_FlangeL'), 'vis', [[s + t0 + 6.4, true]]); } }
    S.mig.forEach((x, i) => { if (i === 2) { conv(S.cturn, 'Stop_mig1'); turn('C_Turn', Math.PI); }
      conv(x, i === 2 ? 'Stop_cturn' : i ? 'Stop_mig' + (i - 1) : 'Stop_flange'); const t0 = dwell(9); if (!empty && RM) { playRobot('C' + i, RM, s + t0 + 0.5); flash('C' + i + '_Arc', s + t0 + 0.5 + RM.ev.weld0, s + t0 + 0.5 + RM.ev.weld1); } });
    conv(S.manual, 'Stop_mig3'); { const t0 = dwell(8); if (!empty) { add('W_2_Z', 'z', [[s + t0, 0], [s + t0 + 1, 0.15], [s + t0 + 7, 0.15], [s + t0 + 7.8, 0]]); add('W_2_Lean', 'rx', [[s + t0 + 0.6, 0], [s + t0 + 1.4, 0.22], [s + t0 + 6.8, 0.22], [s + t0 + 7.6, 0]]);
      flash('C_Manual_Arc', s + t0 + 1.5, s + t0 + 6.2); add('C_Manual_Torch', 'y', [[s + t0 + 0.5, 0], [s + t0 + 1.5, -0.45], [s + t0 + 6.5, -0.45], [s + t0 + 7.5, 0]]); add('C_Manual_Torch', 'x', [[s + t0 + 0.5, 0], [s + t0 + 1.5, -0.5], [s + t0 + 6.5, -0.5], [s + t0 + 7.5, 0]]); add('C_Manual_Torch', 'z', [[s + t0 + 0.5, 0], [s + t0 + 1.5, 0.75], [s + t0 + 6.5, 0.75], [s + t0 + 7.5, 0]]); add(QN + '_Pipes', 'vis', [[s + t0 + 6.2, true]]); } }
    // ---- D: C/F test (nozzles seal on the coolant pipes), external paste, manual check
    conv(S.cf, 'Stop_manual'); { const t0 = dwell(14); if (!empty) { const d = PT + 0.27 - 1.28; add('D_CF_Hood', 'y', [[s + t0 + 1, 0], [s + t0 + 2.4, d], [s + t0 + 12, d], [s + t0 + 13.2, 0]]); flash('D_CF_OK', s + t0 + 11, s + t0 + 14); } }
    conv(S.paste, 'Stop_cf'); { const t0 = dwell(10); if (!empty) { add('D_Disp_Y', 'y', [[s + t0 + 1, 0], [s + t0 + 2, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 8.5, -(1.05 - (PT + 2 * YC + 0.01))], [s + t0 + 9.5, 0]]); add('D_Disp_Z', 'z', [[s + t0 + 2, -0.13], [s + t0 + 5, -0.13], [s + t0 + 5.4, 0.13], [s + t0 + 8.5, 0.13], [s + t0 + 9.5, 0]]); add('D_Disp_X', 'x', [[s + t0 + 2, -0.05], [s + t0 + 5, 0.05], [s + t0 + 5.4, -0.05], [s + t0 + 8.5, 0.05], [s + t0 + 9.5, 0]]); } }
    conv(S.check, 'Stop_paste'); { const t0 = dwell(12); if (!empty) { add('W_3_Z', 'z', [[s + t0, 0], [s + t0 + 1, 0.18], [s + t0 + 8, 0.18], [s + t0 + 9, 0]]); add('W_3_Lean', 'rx', [[s + t0 + 0.8, 0], [s + t0 + 1.6, 0.3], [s + t0 + 7.6, 0.3], [s + t0 + 8.4, 0]]); add('W_3', 'ry', [[s + t0 + 9, 0], [s + t0 + 9.8, Math.PI], [s + t0 + 11.2, Math.PI], [s + t0 + 12, 0]]); } }
    // ---- E: pallet turn ¼ (the part lies along X again), vision, robot: pallet → leak fixture → pallet, marking, gaskets & bolts, OK/NG, packing
    conv(S.eturn, 'Stop_check'); turn('E_Turn', Math.PI / 2);
    conv(S.evis, 'Stop_eturn'); { const t0 = dwell(3); if (!empty) flash('E_VisCam', s + t0 + 1.2, s + t0 + 1.6); }
    conv(S.estop, 'Stop_evis');
    if (!empty && RE) { const t0 = ct, re = s + t0 + 1.5, e = RE.ev, tg = re + e.grip, tp = re + e.put - 0.3, tk = re + e.take, tr = re + e.release - 0.3; clamp(t0 + 0.2, true); clamp(t0 + 1.0, false);
      playRobot('E', RE, re); fingers('E', [tg - 0.3, tg], [tp + 0.05, tp + 0.3]); fingers('E', [tk - 0.3, tk], [tr + 0.05, tr + 0.3]);
      at(tg - s, [S.estop, PT, Z0]); carry('E_Ref', tg, tp); carry('E_Ref', tk, tr);
      add('E_Hood', 'y', [[tp + 0.6, 0], [tp + 1.8, -(1.5 - FIXY - 0.15)], [tk - 2.5, -(1.5 - FIXY - 0.15)], [tk - 1.0, 0]]); flash(lNG ? 'E_Leak_NG' : 'E_Leak_OK', tk - 3.5, tk + 2);
      ct = tg - s + 0.8; conv(S.eback, 'Stop_estop'); clamp(ct, false); ct = tr - s; at(tr - s, [S.eback, PT, Z0]); clamp(ct + 0.35, false); clamp(ct + 1.1, true); ct += 1.5; }
    else { dwell(1); conv(S.eback, 'Stop_estop'); dwell(1); }
    conv(S.mark, 'Stop_eback'); { const t0 = dwell(6); if (!empty) { head('E_MarkHead', s + t0 + 0.8, s + t0 + 5.2, 0.06); flash('E_Mark_Beam', s + t0 + 2, s + t0 + 4.2); add(QN + '_Mark', 'vis', [[s + t0 + 4.2, true]]); } }
    conv(S.nut, 'Stop_mark'); { const t0 = dwell(14); if (!empty) { const X = [[s + t0, 0]], Y = [[s + t0, 0]], Z = [[s + t0, 0]], RT = [[s + t0, 0]]; let t = s + t0 + 1.2, turns = 0;   // the bit runs each of the 4 flange bolts down
      for (const [dx, dy, dz] of NUT) { X.push([t, dx]); Z.push([t, dz]); Y.push([t, dy + 0.06]); Y.push([t + 0.5, dy]); RT.push([t + 0.5, turns * TAU]); turns += 5; RT.push([t + 2.2, turns * TAU]); Y.push([t + 2.2, dy]); Y.push([t + 2.6, dy + 0.06]); X.push([t + 2.6, dx]); Z.push([t + 2.6, dz]); t += 3.0; }
      X.push([t + 0.6, 0]); Z.push([t + 0.6, 0]); Y.push([t + 0.6, 0]); RT.push([t + 0.6, turns * TAU]); RT.push([t + 0.61, 0]); add('E_Nutrunner', 'x', X); add('E_Nutrunner', 'y', Y); add('E_Nutrunner', 'z', Z); add('E_Nutrunner', 'ry', RT); } }
    conv(S.okng, 'Stop_nut'); { const t0 = dwell(4); if (!empty) flash(lNG ? 'E_OKNG_NG' : 'E_OKNG_OK', s + t0 + 1, s + t0 + 4); }
    if (lNG && !empty) ngTrip('E');
    conv(S.pack, 'Stop_okng');
    { const t0 = dwell(empty ? 2 : 13);
      if (!empty) { const slot = SLOT ? SLOT(s + t0) : 0, [, sy, sdz] = cartonSlot(slot), Zc = -1.05 + sdz, Yp = -(1.015 - PT), Yc = -(1.015 - sy);   // packer: down onto the cooler, close, up, over the carton, down into its slot, open, up, back
        clamp(t0 + 0.3, true); clamp(t0 + 1.0, false);
        add('E_Packer_Y', 'y', [[s + t0 + 1.0, 0], [s + t0 + 2.2, Yp], [s + t0 + 3.2, Yp], [s + t0 + 4.4, 0], [s + t0 + 7.0, 0], [s + t0 + 8.4, Yc], [s + t0 + 9.4, Yc], [s + t0 + 10.6, 0]]);
        add('E_Packer_Z', 'z', [[s + t0 + 4.4, 0], [s + t0 + 7.0, Zc], [s + t0 + 10.6, Zc], [s + t0 + 12.6, 0]]); fingers('E_Packer', [s + t0 + 2.4, s + t0 + 3.0], [s + t0 + 8.6, s + t0 + 9.2], true);
        at(t0 + 3.2, [S.pack, PT, Z0]); carry('E_Packer_Ref', s + t0 + 3.2, s + t0 + 8.4); at(t0 + 8.4, [S.pack, sy, Z0 - 1.05 + sdz]);
        show(t0 + 8.4, false); add('E_Carton_Item_' + slot, 'vis', [[s + t0 + 8.4, true]]); if (pass === 1) PACKS.push(s + t0 + 8.4); } }   // the cooler at rest in the carton → the carton's copy
    // pallet: to the exit lift, down, back along the lower level, up at the start lift into the merge stop
    { const t0 = ct; if (hasPins('Stop_pack')) add('Stop_pack_Pins', 'y', [[s + t0, 0.05], [s + t0 + 0.5, 0]]); add('Stop_pack', 'y', [[s + t0 + 0.5, 0], [s + t0 + 0.9, -0.11], [s + t0 + 2.4, -0.11], [s + t0 + 2.8, 0]]);
      const tl = t0 + 0.9 + 0.6 / CV; palAt(t0 + 0.9, S.pack); palAt(tl, S.pack + 0.6); palAt(tl + 3, S.pack + 0.6, LOW); add('Lift_Out', 'y', [[s + t0 + 0.9, BT - LOW], [s + tl, BT - LOW], [s + tl + 3, 0], [s + tl + 5, 0], [s + tl + 7, BT - LOW]]);
      const tr = tl + 3.5 + (S.pack + 0.6 - S.merge) / RV; palAt(tl + 3.5, S.pack + 0.6, LOW); palAt(tr, S.merge, LOW); palAt(tr + 3, S.merge, BT); add('Lift_In', 'y', [[s + tr - 2, 0], [s + tr, 0], [s + tr + 3, BT - LOW], [s + tr + 5, BT - LOW], [s + tr + 7, 0]]);
      if (pass === 1) { if (tr + 3 > P * N - 1) throw new Error('pallet ' + PN + ' is back at the merge stop only at +' + (tr + 3).toFixed(0) + ' s'); globalThis.__palBack = Math.max(globalThis.__palBack || 0, tr + 3); } }
    if (pass === 1 && !dNG && !lNG && R.KX.length) { const tEnd = R.VIS[R.VIS.length - 1][0] - s; if (tEnd + 7.2 > T) throw new Error('part ' + QN + ' lives ' + (tEnd + 7.2).toFixed(0) + ' s > the cycle'); }
  } };
  const toteSlotOf = k => [S.tote + ((k >> 1) - 1.5) * 0.2, Z0 + (k % 2 ? 0.12 : -0.12)];
  const cartonSlot = j => [0, 0.575 + (j >> 1) * 0.15, (j % 2 ? 0.1 : -0.1)];

  // pass 1: timing only (pack times → carton changes every 3 coolers); pass 2: the real keys
  runParts(1);
  const md = t => ((t % T) + T) % T, packs = [...new Set(PACKS.map(t => Math.round(md(t) * 100) / 100))].sort((a, b) => a - b), SWAPS = [];
  if (packs.length % 3) throw new Error(packs.length + ' coolers packed per cycle: not a multiple of the 3 per carton');
  for (let i = 2; i < packs.length; i += 3) SWAPS.push(packs[i] + 5);   // the carton changes right after its 3rd cooler
  SLOT = t0 => { const tm = md(t0 + 8.4), i = packs.findIndex(p => Math.abs(p - tm) < 0.05); if (i < 0) throw new Error('no pack slot at ' + tm.toFixed(2)); return i % 3; };
  ch = {}; runParts(2);

  // ---- carried parts: sample each hand's reference point (its own keys, evaluated like cycleClip does) and key the part there
  const BASE = new Map(), SERD = {};
  const evalCh = (node, c, t) => { const key = node + '|' + c; if (!(key in SERD)) SERD[key] = ch[key] ? ser(ch[key], 0) : null; const pts = SERD[key]; if (!pts) return 0;
    let k = 0; while (k < pts.length - 2 && pts[k + 1][0] <= t) k++; const [t0, v0] = pts[k], [t1, v1] = pts[Math.min(k + 1, pts.length - 1)]; const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1; return v0 + (v1 - v0) * ease(u); };
  const poseAt = (refName, t) => { const ref = root.getObjectByName(refName), chain = []; for (let o = ref; o && o !== root; o = o.parent) chain.unshift(o);
    const W = new THREE.Matrix4(); for (const o of chain) { if (!BASE.has(o)) BASE.set(o, { p: o.position.clone(), r: o.rotation.clone() }); const b = BASE.get(o); o.position.copy(b.p); o.rotation.copy(b.r);
      for (const c of ['x', 'y', 'z']) if (ch[o.name + '|' + c]) o.position[c] += evalCh(o.name, c, t); for (const c of ['rx', 'ry', 'rz']) if (ch[o.name + '|' + c]) o.rotation[c[1]] += evalCh(o.name, c, t);
      o.updateMatrix(); W.multiply(o.matrix); }
    const e = W.elements; return { x: e[12], y: e[13], z: e[14], yaw: Math.atan2(-e[2], e[0]) }; };
  let worstSnap = 0;
  for (const R of parts) { for (const c of R.carries) { const p0 = poseAt(c.ref, c.t0); let prevYaw = p0.yaw, acc = 0; const n = Math.max(2, Math.ceil((c.t1 - c.t0) / 0.125));
      for (let i = 0; i <= n; i++) { const t = c.t0 + (c.t1 - c.t0) * i / n, q = poseAt(c.ref, t); let d = q.yaw - prevYaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; acc += d; prevYaw = q.yaw;
        R.KX.push([t, q.x]); R.KY.push([t, q.y - PT]); R.KZ.push([t, q.z - Z0]); R.RY.push([t, c.yaw + acc]); }
      worstSnap = Math.max(worstSnap, Math.abs(acc)); } }
  for (const [o, b] of BASE) { o.position.copy(b.p); o.rotation.copy(b.r); o.updateMatrix(); }
  if (worstSnap > 0.05) throw new Error('a carried part turns ' + (worstSnap * 180 / Math.PI).toFixed(1) + '° in the hand (tool yaw drifts)');
  for (const R of parts) { add(R.QN + '_X', 'x', R.KX); add(R.QN + '_Y', 'y', R.KY); add(R.QN + '_Z', 'z', R.KZ); add(R.QN, 'vis', R.VIS); add(R.QN, 'ry', R.RY);
    add(R.PN + '_X', 'x', R.PX); add(R.PN + '_X', 'z', R.PZ); add(R.PN + '_Y', 'y', R.PY); add(R.PN, 'ry', R.PRY); add(R.PN + '_ClampL', 'rx', R.CL.map(([t, v]) => [t, v])); add(R.PN + '_ClampR', 'rx', R.CL.map(([t, v]) => [t, -v])); }

  // ---- operator trips: walk a path (line frame) at 1.0 m/s, turning to the walking direction at each point
  const TABLE_HOMES = root.userData.homes;
  const walk = (n, pts, t0) => { const H0 = TABLE_HOMES[n], X = [], Z = [], Rr = []; let t = t0, yaw = 0, cur = H0;
    const go = p => { const dx = p[0] - cur[0], dz = p[1] - cur[1], d = Math.hypot(dx, dz); if (d < 1e-3) return; let h = Math.atan2(dx, dz); while (h - yaw > Math.PI) h -= TAU; while (h - yaw < -Math.PI) h += TAU;
      Rr.push([t, yaw]); X.push([t, cur[0] - H0[0]]); Z.push([t, cur[1] - H0[1]]); t += 0.5; Rr.push([t, h]); yaw = h; X.push([t, cur[0] - H0[0]]); Z.push([t, cur[1] - H0[1]]); t += d; X.push([t, p[0] - H0[0]]); Z.push([t, p[1] - H0[1]]); cur = p; };
    pts.forEach(go); return { at: () => t, pause: dt => { t += dt; X.push([t, cur[0] - H0[0]]); Z.push([t, cur[1] - H0[1]]); Rr.push([t, yaw]); }, go, end: () => { let h = 0; while (h - yaw > Math.PI) h -= TAU; while (h - yaw < -Math.PI) h += TAU; Rr.push([t, yaw]); t += 0.6; Rr.push([t, h]); add('W_' + n + '_X', 'x', X); add('W_' + n + '_Z', 'z', Z); add('W_' + n, 'ry', Rr); return t; } }; };
  { // loader operator: after the 8th core has left the tote, the empty tote goes out through the west door to the AGV stand and a full one comes back
    const tPick = 7 * P - 6.6 + 1.5, H1 = TABLE_HOMES[1], w = walk(1, [[H1[0], Z0 - 0.75]], tPick); w.pause(1.5); const tUp = w.at();
    w.go([-1.0, Z0 - 0.7]); w.go([-1.9, Z0 - 0.5]); w.go([-1.9, -1.5]); w.pause(4); const tSwap = w.at(); w.go([-1.9, Z0 - 0.5]); w.go([-1.0, Z0 - 0.7]); w.go([H1[0], Z0 - 0.75]); w.pause(1.5); const tDown = w.at(); w.go(H1); w.end();
    if (tDown > 8 * P - 7.6) throw new Error('tote refill comes back too late');
    add('A_Tote', 'vis', [[tUp, false], [tDown, true]]); add('W_1_Tote', 'vis', [[tUp, true], [tDown, false]]); add('W_1_ToteFull', 'vis', [[tSwap, true], [tDown, false]]);
    for (let k = 0; k < 8; k++) add('A_Tote_Core_' + k, 'vis', [[tDown, true]]); }
  for (const tc of SWAPS) { // packing operator: the lid closes, the full carton goes out through the east door to the shipping pallet, an empty one comes back
    const H4 = TABLE_HOMES[4]; add('E_Pack_Lid', 'vis', [[tc - 0.5, true]]);
    const w = walk(4, [[H4[0], Z0 - 1.5]], tc); w.pause(1.0); const tUp = w.at(); w.go([S.pack + 0.8, Z0 - 1.5]); w.go([S.pack + 0.8, Z0 - 0.5]); w.go([S.eEnd + 1.3, Z0 - 0.5]); w.go([S.eEnd + 1.3, Z0 + 0.2]); w.pause(2.5); const tDrop = w.at(); w.pause(2.0); const tNew = w.at();
    w.go([S.eEnd + 1.3, Z0 - 0.5]); w.go([S.pack + 0.8, Z0 - 0.5]); w.go([S.pack + 0.8, Z0 - 1.5]); w.go([H4[0], Z0 - 1.5]); w.pause(1.0); const tDown = w.at(); w.go(H4); w.end();
    add('E_Pack_Carton', 'vis', [[tUp, false], [tDown, true]]); add('E_Pack_Lid', 'vis', [[tUp, false]]); for (let j = 0; j < 4; j++) add('E_Carton_Item_' + j, 'vis', [[tUp, false]]);
    add('W_4_Carton', 'vis', [[tUp, true], [tDrop, false], [tNew, true], [tDown, false]]); }

  const keys = [];
  const SHOWN = /^A_Tote$|^A_Tote_Core_\d$|^E_Pack_Carton$/, HIDDEN = /_(Cam|Beam|Arc|OK|NG|Paste|Seam|Tanks|Pipes|Mark|FlangeL|FlangeR|Profile|Tank|Flange|Tote|ToteFull|Carton|Lid)$|^Part_\d+$|^E_Carton_Item_\d$/;
  for (const [key, evs] of Object.entries(ch)) { const [node, c] = key.split('|');
    if (c === 'vis') keys.push([node, 'vis', vis(evs, SHOWN.test(node) ? true : !HIDDEN.test(node))]);
    else keys.push([node, c, ser(evs, 0)]); }
  // fast movers (robots, hands, parts, pallets) at 8 fps so the part and the hand that holds it stay together between samples; the rest at 4
  return cycleClip(root, 'Module_Cycle', T, keys, name => /_Robot_Joint_|^Part_\d|^Pal_\d|_Loader_|_Packer_|_Finger|_Pad[AB]/.test(name) ? 8 : 4);
}
