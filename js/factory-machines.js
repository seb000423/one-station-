// General manufacturing equipment for the factory builder (console 1) and the factory export, registered
// into js/factory-elements.js: two-level conveyor (pallet loop with end lifts), press, injection moulding
// machine, machining centre, tunnel washer, gantry transfer (이재기), vacuum brazing furnace, welding cell
// and helium leak tester, and for assembly lines: pallet loop conveyor (indexing workpiece carriers), assembly
// station (manual load, press-fit, screwing, robot, test, vision) and gravity flow rack. Each is built from its parameters
// in metres (local +X = length / flow direction) and has a repeating cycle: animate(g, p, t) poses it in
// console 1, drives() records the same motion for console 2 (linear axes in mm, rotations in degrees, as
// deltas from the pose at t = 0). Travelling items (pallets, washer parts) are shown in console 1 only.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const { M, mat, box, cyl, jog, labelPlane, ease } = FE.helpers;
  const C = {
    body: mat(0x3d6fb0, { metalness: 0.35, roughness: 0.5 }),   // machine frame blue
    bodyLight: mat(0xd9dee4, { metalness: 0.2, roughness: 0.55 }),
    green: mat(0x2f8a6b, { metalness: 0.3, roughness: 0.5 }),
    dark: mat(0x2b3138, { metalness: 0.4, roughness: 0.5 }),
    steel: mat(0xb9c1ca, { metalness: 0.75, roughness: 0.3 }),
    glass: mat(0x9fc4e0, { transparent: true, opacity: 0.25, depthWrite: false }),
    yellow: mat(0xf2c200, { roughness: 0.6 }),
    part: mat(0xc9ccd1, { metalness: 0.8, roughness: 0.3 }),
    plastic: mat(0xe0533d, { roughness: 0.5 }),
    pallet: mat(0x8a6a44, { roughness: 0.9 }),
    water: mat(0x55c8ff, { transparent: true, opacity: 0.35, depthWrite: false }),
    lamp: mat(0x2bb673, { emissive: 0x2bb673, emissiveIntensity: 0.8 })
  };
  const grp = (parent, name, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };
  const seg = (u, a, b) => ease((u - a) / (b - a)); // eased 0..1 between phases a and b
  const phase = (t, T) => ((t % T) + T) % T / T;
  const panel = (g, x, y, z, rotY = 0) => { const p = grp(g, 'Control_Panel', x, y, z); p.rotation.y = rotY; box(p, 'Panel_Box', 0.45, 0.6, 0.18, C.bodyLight, 0, 0, 0); box(p, 'Panel_Screen', 0.32, 0.22, 0.01, M.black, 0, 0.1, 0.095); box(p, 'Panel_Stop', 0.06, 0.06, 0.03, mat(0xd13f3f), 0.12, -0.18, 0.1); return p; };
  const lampTower = (g, x, y, z) => { cyl(g, 'Lamp_Post', 0.02, 0.3, C.dark, x, y + 0.15, z); cyl(g, 'Lamp_Green', 0.05, 0.08, C.lamp, x, y + 0.34, z); cyl(g, 'Lamp_Amber', 0.05, 0.08, mat(0xe8a019, { emissive: 0xe8a019, emissiveIntensity: 0.25 }), x, y + 0.42, z); };
  const titled = (g, text, w, z) => { const l = labelPlane(text, w, '#ffffff'); l.position.z = z; if (l.isSprite) l.position.y = 3.2; g.add(l); };
  // drive series for console 2 from a pose function: specs [[node name, dir, rev, value(t)]]
  function record(g, frames, spf, specs) {
    return specs.map(([n, dir, rev, f]) => {
      const lin = dir.startsWith('Linear'), k = lin ? 1000 : 180 / Math.PI, v0 = f(0), series = new Array(frames);
      for (let i = 0; i < frames; i++) series[i] = Math.round((f(i * spf) - v0) * k * 10) / 10;
      return { node: g.getObjectByName(n), dir, rev, series };
    }).filter(d => d.node);
  }

  /* ---------- two-level conveyor: loaded pallets on top, empty pallets return below, lifts at both ends ---------- */
  function c2Loop(p) {
    const L = p.length, ex = L / 2 + 0.45, run = 2 * ex / Math.max(0.05, p.speed), lift = Math.max(1, p.lift), T = 2 * run + 2 * lift;
    const n = Math.max(1, Math.min(p.pallets, Math.floor(T / (2 * lift))));
    // pose of an item at loop time u (0..T): top run → lift down (B end) → bottom run back → lift up (A end)
    const at = u => {
      if (u < run) return [-ex + 2 * ex * u / run, p.h2, true];
      u -= run; if (u < lift) return [ex, p.h2 + (p.h1 - p.h2) * ease(u / lift), false];
      u -= lift; if (u < run) return [ex - 2 * ex * u / run, p.h1, false];
      u -= run; return [-ex, p.h1 + (p.h2 - p.h1) * ease(u / lift), true];
    };
    // a lift goes down (or up) with the pallet, then returns empty; one pallet per lift slot (T / n)
    const liftY = (t, start, from, to) => { const slot = T / n, u = (((t - start) % slot) + slot) % slot; return u < lift ? from + (to - from) * ease(u / lift) : u < 2 * lift ? to + (from - to) * ease((u - lift) / lift) : from; };
    return { L, ex, run, lift, T, n, at, liftB: t => liftY(t, run, p.h2, p.h1), liftA: t => liftY(t, 2 * run + lift, p.h1, p.h2) };
  }
  const conveyor2 = {
    label: '2층 컨베이어', group: 'equipment',
    // upper deck carries loaded pallets forward, lower deck returns them; lift: s per lift move; pallets on the loop
    defaults: () => ({ length: 6, width: 0.7, h1: 0.5, h2: 1.3, speed: 0.3, lift: 5, pallets: 6 }),
    build: (g, p) => {
      const Q = c2Loop(p), W = p.width, r = 0.035;
      for (const [h, nm, dir] of [[p.h2, 'U', 1], [p.h1, 'L', -1]]) {
        for (const s of [-1, 1]) box(g, 'C2_Side_' + nm, Q.L, 0.1, 0.04, M.conveyorFrame, 0, h - 0.02, s * (W / 2 + 0.02));
        const n = Math.max(2, Math.floor(Q.L / 0.15));
        for (let i = 0; i < n; i++) jog(cyl(g, 'C2_Roller_' + nm, r, W - 0.02, M.roller, -Q.L / 2 + 0.07 + i * (Q.L - 0.14) / (n - 1), h, 0, 'z'), 'RotationZ', true, -dir * p.speed / r * 180 / Math.PI);
      }
      const legs = Math.max(2, Math.ceil(Q.L / 1.5) + 1);
      for (let i = 0; i < legs; i++) for (const s of [-1, 1]) box(g, 'C2_Leg', 0.06, p.h2, 0.06, M.conveyorFrame, -Q.L / 2 + 0.05 + i * (Q.L - 0.1) / (legs - 1), p.h2 / 2, s * (W / 2 + 0.03));
      // lifts: four posts and a platform each
      for (const [nm, x] of [['A', -Q.ex], ['B', Q.ex]]) {
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 'C2_LiftPost', 0.06, p.h2 + 0.5, 0.06, C.yellow, x + dx * 0.42, (p.h2 + 0.5) / 2, dz * (W / 2 + 0.08));
        box(g, 'C2_LiftTop', 0.9, 0.08, W + 0.22, C.yellow, x, p.h2 + 0.5, 0);
        const lift = grp(g, 'C2_Lift_' + nm, x, nm === 'A' ? Q.liftA(0) : Q.liftB(0), 0);
        box(lift, 'C2_LiftDeck', 0.8, 0.05, W, M.conveyorFrame, 0, -0.03, 0);
        for (let i = 0; i < 5; i++) cyl(lift, 'C2_LiftRoller', r, W - 0.04, M.roller, -0.32 + i * 0.16, 0.01, 0, 'z');
      }
      // pallets (with a carton while on the upper deck)
      for (let k = 0; k < Q.n; k++) {
        const it = grp(g, 'C2_Item_' + (k + 1));
        box(it, 'C2_Pallet', 0.6, 0.1, W - 0.12, C.pallet, 0, 0.09, 0);
        box(it, 'C2_Carton', 0.45, 0.32, W - 0.2, M.carton, 0, 0.3, 0);
      }
      titled(g, '2층 컨베이어', 2.4, W / 2 + 0.7);
      conveyor2.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const Q = c2Loop(p), rr = 0.035;
      g.traverse(o => { if (!o.isMesh && /^C2_Roller_[UL]$/.test(o.name)) o.rotation.z = (o.name.endsWith('U') ? -1 : 1) * p.speed / rr * t; });
      const a = g.getObjectByName('C2_Lift_A'), b = g.getObjectByName('C2_Lift_B'); if (a) a.position.y = Q.liftA(t); if (b) b.position.y = Q.liftB(t);
      for (let k = 0; k < Q.n; k++) {
        const it = g.getObjectByName('C2_Item_' + (k + 1)); if (!it) continue;
        const [x, y, loaded] = Q.at(((t + k * Q.T / Q.n) % Q.T + Q.T) % Q.T);
        it.position.set(x, y, 0); const c = it.getObjectByName('C2_Carton'); if (c) c.visible = loaded;
      }
    },
    drives: (g, p, frames, spf) => { const Q = c2Loop(p); return record(g, frames, spf, [['C2_Lift_A', 'LinearY', false, Q.liftA], ['C2_Lift_B', 'LinearY', false, Q.liftB]]); },
    footprint: p => [p.length + 1.9, p.width + 0.4],
    cycle: p => c2Loop(p).T
  };

  /* ---------- press: crank press, the slide strokes spm times a minute ---------- */
  function pressDims(p) {
    const bolster = 1.02, dieTop = bolster + 0.15, slideH = 0.45, dieH = 0.15;
    const bdc = dieTop + dieH + slideH / 2 + 0.005; // slide centre at bottom dead centre: upper die just meets the lower die
    return { bolster, slideH, dieH, bdc, tdc: bdc + p.stroke, crownY: Math.max(p.height - 0.3, bdc + p.stroke + slideH / 2 + 0.6) };
  }
  const pressY = (p, t) => { const D = pressDims(p), a = 2 * Math.PI * t * p.spm / 60; return D.tdc - p.stroke * (1 - Math.cos(a)) / 2; };
  const press = {
    label: '프레스', group: 'equipment',
    defaults: () => ({ width: 2.2, depth: 1.8, height: 3.6, stroke: 0.25, spm: 20, tonnage: 200 }),
    build: (g, p) => {
      const D = pressDims(p), w = p.width, d = p.depth, H = D.crownY + 0.3;
      box(g, 'Press_Bed', w, 0.9, d, C.body, 0, 0.45, 0);
      box(g, 'Press_Bolster', w * 0.8, 0.12, d * 0.7, C.dark, 0, 0.96, 0);
      box(g, 'Press_LowerDie', w * 0.55, D.dieH, d * 0.5, C.steel, 0, D.bolster + 0.075, 0);
      box(g, 'Press_Part', w * 0.35, 0.02, d * 0.35, C.part, 0, D.bolster + D.dieH + 0.01, 0);
      for (const s of [-1, 1]) box(g, 'Press_Upright', 0.36, D.crownY - 0.3 - 0.9, d * 0.9, C.body, s * (w / 2 - 0.18), (0.9 + D.crownY - 0.3) / 2, 0);
      box(g, 'Press_Crown', w + 0.1, 0.6, d, C.body, 0, D.crownY, 0);
      const slide = grp(g, 'Press_Slide', 0, pressY(p, 0), 0);
      box(slide, 'Press_SlideBody', w * 0.68, D.slideH, d * 0.62, C.dark, 0, 0, 0);
      box(slide, 'Press_UpperDie', w * 0.55, D.dieH, d * 0.5, C.steel, 0, -D.slideH / 2 - D.dieH / 2, 0);
      const rod = D.crownY - 0.3 - (D.bdc + D.slideH / 2) + 0.05;
      for (const s of [-1, 1]) box(slide, 'Press_Rod', 0.12, rod, 0.12, C.steel, s * w * 0.18, D.slideH / 2 + rod / 2, 0);
      const fw = grp(g, 'Press_Flywheel', w / 2 + 0.12, D.crownY, 0); cyl(fw, 'Press_FlywheelDisc', 0.42, 0.14, C.dark, 0, 0, 0, 'x'); box(fw, 'Press_FlywheelSpoke', 0.05, 0.7, 0.05, C.yellow, 0.08, 0, 0);
      for (const s of [-1, 1]) { box(g, 'Press_Curtain', 0.06, 1.4, 0.06, C.yellow, s * w * 0.36, 1.0 + 0.7, d / 2 + 0.25); box(g, 'Press_CurtainCap', 0.08, 0.06, 0.08, M.black, s * w * 0.36, 2.43, d / 2 + 0.25); }
      panel(g, w / 2 + 0.45, 1.3, d / 2 - 0.1, -Math.PI / 6);
      lampTower(g, -w / 2 + 0.15, H, d / 2 - 0.15);
      titled(g, `프레스 ${p.tonnage}t`, 2.2, d / 2 + 0.9);
    },
    animate: (g, p, t) => { const s = g.getObjectByName('Press_Slide'), f = g.getObjectByName('Press_Flywheel'); if (s) s.position.y = pressY(p, t); if (f) f.rotation.x = 2 * Math.PI * t * p.spm / 60; },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['Press_Slide', 'LinearY', false, t => pressY(p, t)], ['Press_Flywheel', 'RotationX', false, t => 2 * Math.PI * t * p.spm / 60]]),
    footprint: p => [p.width + 0.8, p.depth + 0.8],
    cycle: p => 60 / Math.max(1, p.spm)
  };

  /* ---------- injection moulding machine: close → inject → cool → open → eject ---------- */
  function immPose(p, t) {
    const u = phase(t, Math.max(5, p.cycle));
    const close = u < 0.12 ? seg(u, 0, 0.12) : u < 0.75 ? 1 : u < 0.87 ? 1 - seg(u, 0.75, 0.87) : 0;
    const screw = u < 0.12 ? 0 : u < 0.3 ? seg(u, 0.12, 0.3) : u < 0.75 ? 1 - seg(u, 0.3, 0.75) : 0;
    return { close, screw, eject: u >= 0.87 ? (u - 0.87) / 0.13 : -1, u };
  }
  const injection = {
    label: '사출기', group: 'equipment',
    defaults: () => ({ length: 5.5, width: 1.4, tonnage: 150, cycle: 30 }),
    build: (g, p) => {
      const L = p.length, W = p.width, y0 = 0.9, cy = y0 + 0.65, fixedX = -L * 0.05, rearX = -L / 2 + 0.3;
      box(g, 'IMM_Base', L, y0, W, C.green, 0, y0 / 2, 0);
      box(g, 'IMM_RearPlaten', 0.25, 1.2, 1.2, C.green, rearX, cy, 0);
      box(g, 'IMM_FixedPlaten', 0.25, 1.3, 1.25, C.green, fixedX, cy, 0);
      for (const [dy, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const len = fixedX - rearX; cyl(g, 'IMM_TieBar', 0.05, len, C.steel, (fixedX + rearX) / 2, cy + dy * 0.45, dz * 0.45, 'x'); }
      box(g, 'IMM_FixedMold', 0.22, 0.75, 0.75, C.steel, fixedX - 0.235, cy, 0);
      const pl = grp(g, 'IMM_Platen', 0, 0, 0);
      box(pl, 'IMM_MovingPlaten', 0.25, 1.1, 1.1, C.green, 0, cy, 0); box(pl, 'IMM_MovingMold', 0.22, 0.75, 0.75, C.steel, 0.235, cy, 0);
      box(pl, 'IMM_Toggle', 0.9, 0.2, 0.5, C.dark, -0.55, cy, 0);
      const part = box(g, 'IMM_Part', 0.25, 0.18, 0.25, C.plastic, fixedX - 0.45, cy, 0); part.visible = false;
      box(g, 'IMM_Chute', 0.6, 0.04, 0.5, C.steel, fixedX - 0.45, y0 + 0.02, W / 2 - 0.25);
      // injection unit
      const inj = grp(g, 'IMM_Screw', 0, 0, 0);
      cyl(inj, 'IMM_Barrel', 0.11, L / 2 - 0.9, C.steel, fixedX + 0.15 + (L / 2 - 0.9) / 2, cy, 0, 'x');
      box(inj, 'IMM_InjUnit', 0.9, 0.55, 0.6, C.green, L / 2 - 0.55, cy, 0);
      const hop = cyl(inj, 'IMM_Hopper', 0.22, 0.55, C.bodyLight, L / 2 - 1.05, cy + 0.5, 0); hop.children[0].geometry = new THREE.CylinderGeometry(0.24, 0.07, 0.55, 20);
      // safety guard over the clamp, control panel
      box(g, 'IMM_Guard', fixedX - rearX + 0.6, 1.5, W + 0.05, C.glass, (fixedX + rearX) / 2 - 0.1, y0 + 0.75, 0).castShadow = false;
      panel(g, fixedX + 0.6, y0 + 0.55, W / 2 + 0.12, 0);
      lampTower(g, fixedX, y0 + 1.5, -W / 2 + 0.1);
      titled(g, `사출기 ${p.tonnage}t`, 2.2, W / 2 + 0.8);
      injection.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const q = immPose(p, t), fixedX = -p.length * 0.05, y0 = 0.9, cy = y0 + 0.65;
      const pl = g.getObjectByName('IMM_Platen'), sc = g.getObjectByName('IMM_Screw'), part = g.getObjectByName('IMM_Part');
      if (pl) pl.position.x = fixedX - 0.71 - 0.55 * (1 - q.close);
      if (sc) sc.position.x = -0.12 * (1 - q.screw);
      if (part) { part.visible = q.eject >= 0; if (q.eject >= 0) part.position.y = cy - (cy - y0 - 0.12) * Math.min(1, q.eject * 1.6); }
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['IMM_Platen', 'LinearX', true, t => -0.55 * (1 - immPose(p, t).close)], ['IMM_Screw', 'LinearX', true, t => -0.12 * (1 - immPose(p, t).screw)]]),
    footprint: p => [p.length, p.width + 0.6],
    cycle: p => Math.max(5, p.cycle)
  };

  /* ---------- machining centre: door opens to load, spindle machines the part, tool change on the way ---------- */
  function mcPose(p, t) {
    const u = phase(t, Math.max(10, p.cycle)), cut = u >= 0.16 && u < 0.9 ? (u - 0.16) / 0.74 : -1;
    const open = u < 0.04 ? seg(u, 0, 0.04) : u < 0.12 ? 1 : u < 0.16 ? 1 - seg(u, 0.12, 0.16) : 0;
    const x = cut >= 0 ? Math.sin(cut * Math.PI * 6) * 0.35 : 0;
    const z = cut >= 0 ? (Math.sin(cut * Math.PI * 24) > -0.2 ? -0.18 : 0) * Math.min(1, cut * 20, (1 - cut) * 20) : 0;
    const tool = u >= 0.48 && u < 0.53 ? seg(u, 0.48, 0.53) : u >= 0.53 ? 1 : 0;
    return { open, x, z, spin: cut >= 0 ? t * 40 : 0, tool };
  }
  const machining = {
    label: '가공기', group: 'equipment',
    defaults: () => ({ width: 2.4, depth: 2.2, height: 2.6, cycle: 60 }),
    build: (g, p) => {
      const w = p.width, d = p.depth, H = p.height;
      box(g, 'MC_Base', w, 0.45, d, C.dark, 0, 0.225, 0);
      box(g, 'MC_Back', w, H - 0.45, 0.08, C.bodyLight, 0, (H + 0.45) / 2, -d / 2 + 0.04);
      for (const s of [-1, 1]) box(g, 'MC_Side', 0.08, H - 0.45, d, C.bodyLight, s * (w / 2 - 0.04), (H + 0.45) / 2, 0);
      box(g, 'MC_Roof', w, 0.08, d, C.bodyLight, 0, H, 0);
      box(g, 'MC_FrontFixed', w * 0.5, H - 0.45, 0.06, C.bodyLight, w * 0.25, (H + 0.45) / 2, d / 2 - 0.03);
      box(g, 'MC_FrontWindow', w * 0.3, 0.5, 0.01, C.glass, w * 0.25, 1.6, d / 2 + 0.005).castShadow = false;
      const door = grp(g, 'MC_Door', -w * 0.24, 0, d / 2 + 0.03);
      box(door, 'MC_DoorLeaf', w * 0.48, H - 0.75, 0.04, C.body, 0, (H + 0.3) / 2, 0);
      box(door, 'MC_DoorWindow', w * 0.32, 0.7, 0.01, C.glass, 0, 1.5, 0.025).castShadow = false;
      box(door, 'MC_DoorHandle', 0.04, 0.4, 0.05, C.steel, w * 0.2, 1.2, 0.05);
      box(g, 'MC_Table', w * 0.55, 0.12, d * 0.38, C.steel, 0, 0.95, 0.05);
      box(g, 'MC_Vise', 0.3, 0.12, 0.2, C.dark, 0, 1.07, 0.05);
      box(g, 'MC_Work', 0.22, 0.12, 0.16, C.part, 0, 1.19, 0.05);
      const head = grp(g, 'MC_Head', 0, 0, 0), zx = grp(head, 'MC_Z', 0, 0, 0);
      box(head, 'MC_Column', 0.4, H - 0.6, 0.35, C.dark, 0, (H + 0.3) / 2, -d / 2 + 0.3);
      box(zx, 'MC_Headstock', 0.32, 0.55, 0.45, C.body, 0, 1.75, -0.12);
      const sp = grp(zx, 'MC_Spindle', 0, 1.42, 0.05); cyl(sp, 'MC_SpindleNose', 0.07, 0.12, C.steel, 0, 0, 0); cyl(sp, 'MC_Tool', 0.02, 0.14, C.yellow, 0, -0.12, 0);
      const mag = grp(g, 'MC_Magazine', -w / 2 + 0.3, 1.9, -0.2); cyl(mag, 'MC_MagazineDisc', 0.38, 0.12, C.dark, 0, 0, 0, 'x');
      for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI; cyl(mag, 'MC_MagTool', 0.03, 0.18, C.steel, 0.12, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 'x'); }
      box(g, 'MC_ChipConveyor', 0.5, 0.6, d * 0.7, C.dark, w / 2 + 0.25, 0.3, 0);
      panel(g, w / 2 + 0.15, 1.4, d / 2 + 0.12, -Math.PI / 5);
      lampTower(g, w / 2 - 0.2, H, d / 2 - 0.2);
      titled(g, '머시닝센터', 2.0, d / 2 + 0.8);
    },
    animate: (g, p, t) => {
      const q = mcPose(p, t), n = k => g.getObjectByName(k);
      const door = n('MC_Door'); if (door) door.position.x = -p.width * 0.24 + q.open * p.width * 0.46; // slides open over the fixed half
      const h = n('MC_Head'); if (h) h.position.x = q.x;
      const z = n('MC_Z'); if (z) z.position.y = q.z;
      const sp = n('MC_Spindle'); if (sp) sp.rotation.y = q.spin;
      const m = n('MC_Magazine'); if (m) m.rotation.x = q.tool * Math.PI / 6;
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['MC_Door', 'LinearX', true, t => mcPose(p, t).open * p.width * 0.46], ['MC_Head', 'LinearX', true, t => mcPose(p, t).x], ['MC_Z', 'LinearY', false, t => mcPose(p, t).z], ['MC_Magazine', 'RotationX', false, t => mcPose(p, t).tool * Math.PI / 6]]),
    footprint: p => [p.width + 0.8, p.depth + 0.6],
    cycle: p => Math.max(10, p.cycle)
  };

  /* ---------- tunnel washer: parts ride a belt through the spray tunnel ---------- */
  const washer = {
    label: '세척기', group: 'equipment',
    defaults: () => ({ length: 3.5, width: 0.8, height: 2.0, speed: 0.2, interval: 8 }),
    build: (g, p) => {
      const L = p.length, W = p.width, H = p.height, cv = 0.8, ext = 0.6;
      box(g, 'WS_Tank', L, 0.55, W + 0.3, mat(0x2f6fd1, { metalness: 0.4 }), 0, 0.275, 0);
      for (const s of [-1, 1]) box(g, 'WS_Wall', L, H - 0.55, 0.05, C.steel, 0, (H + 0.55) / 2, s * (W / 2 + 0.15));
      box(g, 'WS_Roof', L, 0.06, W + 0.35, C.steel, 0, H, 0);
      box(g, 'WS_Window', L * 0.5, 0.4, 0.01, C.glass, 0, 1.3, W / 2 + 0.18).castShadow = false;
      cyl(g, 'WS_Duct', 0.15, 0.7, C.steel, L * 0.3, H + 0.35, 0);
      box(g, 'WS_Belt', L + 2 * ext, 0.03, W - 0.1, M.belt, 0, cv, 0);
      for (const s of [-1, 1]) { box(g, 'WS_BeltSide', L + 2 * ext, 0.08, 0.03, M.conveyorFrame, 0, cv - 0.02, s * (W / 2 - 0.03)); for (const e of [-1, 1]) box(g, 'WS_Leg', 0.05, cv, 0.05, M.conveyorFrame, e * (L / 2 + ext - 0.1), cv / 2, s * (W / 2 - 0.05)); }
      for (const e of [-1, 1]) for (let i = 0; i < 6; i++) box(g, 'WS_Curtain', 0.01, 0.6, (W - 0.1) / 6 - 0.01, M.black, e * L / 2, cv + 0.42, -W / 2 + 0.05 + (i + 0.5) * (W - 0.1) / 6).castShadow = false;
      for (let i = 0; i < 4; i++) { const x = -L / 2 + (i + 0.5) * L / 4; cyl(g, 'WS_Nozzle', 0.03, 0.08, C.steel, x, H - 0.25, 0); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, H - 0.3 - cv - 0.1, 16, 1, true), C.water); sp.name = 'WS_Spray'; sp.position.set(x, (H - 0.3 + cv + 0.1) / 2, 0); g.add(sp); }
      const n = Math.max(1, Math.ceil((L + 2 * ext) / Math.max(0.2, p.speed * p.interval)));
      for (let k = 0; k < n; k++) { const it = grp(g, 'WS_Item_' + (k + 1)); box(it, 'WS_Part', 0.35, 0.18, 0.3, C.part, 0, cv + 0.1, 0); }
      panel(g, L / 2 - 0.3, 1.3, W / 2 + 0.3, 0);
      titled(g, '세척기', 2.0, W / 2 + 0.8);
      washer.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const span = p.length + 1.2, gap = Math.max(0.2, p.speed * p.interval);
      for (let k = 0; ; k++) { const it = g.getObjectByName('WS_Item_' + (k + 1)); if (!it) break; const s = ((t * p.speed + k * gap) % (Math.ceil(span / gap) * gap)); it.position.x = -span / 2 + s; it.visible = s <= span; }
      const pulse = 0.25 + 0.15 * Math.sin(t * 6); g.traverse(o => { if (o.name === 'WS_Spray') o.material.opacity = pulse; });
    },
    footprint: p => [p.length + 1.2, p.width + 0.6],
    cycle: p => (p.length + 1.2) / Math.max(0.05, p.speed)
  };

  /* ---------- gantry transfer (이재기): picks a part on one side, places it on the other ---------- */
  function trPose(p, t) {
    const u = phase(t, Math.max(3, p.cycle)), x0 = -p.span / 2 + 0.5, x1 = p.span / 2 - 0.5, down = -(p.height - 1.25);
    const x = u < 0.25 ? x0 : u < 0.55 ? x0 + (x1 - x0) * seg(u, 0.25, 0.55) : u < 0.8 ? x1 : x1 + (x0 - x1) * seg(u, 0.8, 1);
    const z = u < 0.1 ? down * seg(u, 0, 0.1) : u < 0.15 ? down : u < 0.25 ? down * (1 - seg(u, 0.15, 0.25)) : u < 0.55 ? 0 : u < 0.65 ? down * seg(u, 0.55, 0.65) : u < 0.7 ? down : u < 0.8 ? down * (1 - seg(u, 0.7, 0.8)) : 0;
    return { x, z, carry: u >= 0.12 && u < 0.67, placed: u >= 0.67 };
  }
  const transfer = {
    label: '이재기', group: 'equipment',
    defaults: () => ({ span: 3, depth: 1.2, height: 2.4, cycle: 10 }),
    build: (g, p) => {
      const S = p.span, D = p.depth, H = p.height;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 'TR_Post', 0.12, H, 0.12, M.beam, sx * S / 2, H / 2, sz * D / 2);
      for (const s of [-1, 1]) box(g, 'TR_Beam', S + 0.12, 0.14, 0.12, M.beam, 0, H, s * D / 2);
      for (const [nm, x] of [['TR_TableA', -S / 2 + 0.5], ['TR_TableB', S / 2 - 0.5]]) { box(g, nm, 0.6, 0.06, 0.6, C.steel, x, 0.8, 0); box(g, nm + 'Leg', 0.08, 0.77, 0.08, M.conveyorFrame, x, 0.385, 0); }
      const xa = grp(g, 'TR_X', 0, 0, 0), za = grp(xa, 'TR_Z', 0, 0, 0);
      box(xa, 'TR_Carriage', 0.3, 0.16, D + 0.1, C.dark, 0, H + 0.12, 0);
      box(za, 'TR_Mast', 0.1, 1.1, 0.1, C.steel, 0, H - 0.45, 0);
      box(za, 'TR_Gripper', 0.36, 0.06, 0.3, C.dark, 0, H - 1.03, 0);
      for (const s of [-1, 1]) box(za, 'TR_Finger', 0.03, 0.12, 0.2, C.yellow, s * 0.15, H - 1.12, 0);
      const pc = box(za, 'TR_Part', 0.26, 0.16, 0.22, C.part, 0, H - 1.14, 0); pc.visible = false;
      box(g, 'TR_PartA', 0.26, 0.16, 0.22, C.part, -S / 2 + 0.5, 0.91, 0);
      box(g, 'TR_PartB', 0.26, 0.16, 0.22, C.part, S / 2 - 0.5, 0.91, 0).visible = false;
      titled(g, '이재기', 1.6, D / 2 + 0.6);
      transfer.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const q = trPose(p, t), n = k => g.getObjectByName(k);
      const x = n('TR_X'), z = n('TR_Z'); if (x) x.position.x = q.x; if (z) z.position.y = q.z;
      const c = n('TR_Part'), a = n('TR_PartA'), b = n('TR_PartB'); if (c) c.visible = q.carry; if (a) a.visible = !q.carry && !q.placed; if (b) b.visible = q.placed;
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['TR_X', 'LinearX', true, t => trPose(p, t).x], ['TR_Z', 'LinearY', false, t => trPose(p, t).z]]),
    footprint: p => [p.span + 0.3, p.depth + 0.3],
    cycle: p => Math.max(3, p.cycle)
  };

  /* ---------- vacuum brazing furnace: door opens, the charge cart rolls in, heat cycle, cart out ---------- */
  function fuPose(p, t) {
    const u = phase(t, Math.max(20, p.cycle));
    const door = u < 0.05 ? seg(u, 0, 0.05) : u < 0.14 ? 1 : u < 0.19 ? 1 - seg(u, 0.14, 0.19) : u < 0.84 ? 0 : u < 0.89 ? seg(u, 0.84, 0.89) : u < 0.97 ? 1 : 1 - seg(u, 0.97, 1);
    const cart = u < 0.05 ? 0 : u < 0.14 ? seg(u, 0.05, 0.14) : u < 0.89 ? 1 : u < 0.96 ? 1 - seg(u, 0.89, 0.96) : 0;
    const heat = u >= 0.19 && u < 0.84 ? Math.sin(Math.PI * (u - 0.19) / 0.65) : 0;
    return { door, cart, heat };
  }
  const furnace = {
    label: '진공 브레이징로', group: 'equipment',
    // horizontal front-loading vacuum furnace; cycle compressed (real brazing runs take hours); temp is the label only
    defaults: () => ({ width: 3.0, depth: 3.2, height: 3.0, cycle: 120, temp: 1100 }),
    build: (g, p) => {
      const W = p.width, D = p.depth, R = Math.min(W, p.height) * 0.42, cy = R + 0.45;
      for (const s of [-1, 1]) box(g, 'FU_Saddle', 0.3, cy - 0.2, D * 0.7, C.dark, s * R * 0.6, (cy - 0.2) / 2, 0);
      const ves = cyl(g, 'FU_Vessel', R, D, C.bodyLight, 0, cy, 0, 'z'); ves.children[0].material = mat(0xdfe5ea, { metalness: 0.5, roughness: 0.35 });
      cyl(g, 'FU_BackCap', R * 0.96, 0.12, C.steel, 0, cy, -D / 2 - 0.06, 'z');
      const glow = cyl(g, 'FU_Hot', R * 0.8, 0.02, mat(0xff6a00, { emissive: 0xff5a00, emissiveIntensity: 0, transparent: true, opacity: 0, depthWrite: false }), 0, cy, D / 2 + 0.005, 'z'); glow.children[0].castShadow = false;
      // door: hinged at the left of the opening
      const hinge = grp(g, 'FU_Door', -R, cy, D / 2 + 0.08);
      cyl(hinge, 'FU_DoorDisc', R, 0.16, C.steel, R, 0, 0, 'z'); box(hinge, 'FU_DoorClamp', 0.2, 0.5, 0.2, C.dark, 2 * R - 0.05, 0, 0.05);
      // loading rails and the cart with a basket of cores
      for (const s of [-1, 1]) box(g, 'FU_Rail', 0.06, 0.06, 1.9, C.steel, s * 0.45, 0.43, D / 2 + 1.0);
      box(g, 'FU_RailStand', 1.1, 0.4, 0.2, C.dark, 0, 0.2, D / 2 + 1.85);
      const cart = grp(g, 'FU_Cart', 0, 0, D / 2 + 1.1);
      box(cart, 'FU_CartFrame', 1.0, 0.08, 1.4, C.dark, 0, 0.5, 0);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(cart, 'FU_Core', 0.26, 0.42, 0.55, C.steel, -0.33 + i * 0.33, 0.76, -0.32 + j * 0.64);
      box(g, 'FU_Pump', 0.9, 1.1, 0.9, C.body, W / 2 + 0.1, 0.55, -D / 2 + 0.5);
      box(g, 'FU_Cabinet', 0.6, 1.9, 0.5, C.bodyLight, -W / 2 - 0.1, 0.95, -D / 2 + 0.4);
      panel(g, W / 2 + 0.2, 1.3, D / 2 - 0.2, -Math.PI / 6);
      lampTower(g, -W / 2 - 0.1, 1.9, -D / 2 + 0.4);
      titled(g, `진공 브레이징로 ${p.temp}°C`, 2.6, D / 2 + 2.3);
      furnace.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const q = fuPose(p, t), D = p.depth, n = k => g.getObjectByName(k);
      const d = n('FU_Door'); if (d) d.rotation.y = q.door * Math.PI * 0.55;
      const c = n('FU_Cart'); if (c) c.position.z = D / 2 + 1.1 - q.cart * (D / 2 + 1.0);
      const h = n('FU_Hot'); if (h) { const m = h.children[0].material; m.opacity = q.heat * 0.9; m.emissiveIntensity = q.heat * 1.5; }
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['FU_Door', 'RotationY', true, t => fuPose(p, t).door * Math.PI * 0.55], ['FU_Cart', 'LinearZ', false, t => -fuPose(p, t).cart * (p.depth / 2 + 1.0)]]),
    footprint: p => [p.width + 1.4, p.depth + 2.4],
    cycle: p => Math.max(20, p.cycle)
  };

  /* ---------- welding cell: a robot welds the part on a turning positioner behind curtains ---------- */
  function wePose(p, t) {
    const u = phase(t, Math.max(10, p.cycle)), weld = u >= 0.15 && u < 0.85, w = weld ? (u - 0.15) / 0.7 : 0;
    const j1 = weld ? 0.25 * Math.sin(w * 2 * Math.PI * 3) : u < 0.15 ? -0.6 * (1 - seg(u, 0, 0.15)) : -0.6 * seg(u, 0.85, 1);
    return { weld, pos: weld ? w * 2 * Math.PI : 0, j1, j2: weld ? -0.15 + 0.08 * Math.sin(w * Math.PI * 10) : -0.45 };
  }
  const welder = {
    label: '용접 셀', group: 'equipment',
    defaults: () => ({ width: 3.0, depth: 3.0, cycle: 60 }),
    build: (g, p) => {
      const W = p.width, D = p.depth, H = 2.2;
      box(g, 'WE_Floor', W, 0.04, D, C.dark, 0, 0.02, 0).castShadow = false;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 'WE_Post', 0.06, H, 0.06, C.yellow, x * W / 2, H / 2, z * D / 2);
      const curtain = mat(0xe8a019, { transparent: true, opacity: 0.35, depthWrite: false });
      box(g, 'WE_Curtain', W, H - 0.1, 0.01, curtain, 0, H / 2, -D / 2).castShadow = false;
      for (const s of [-1, 1]) box(g, 'WE_Curtain', 0.01, H - 0.1, D, curtain, s * W / 2, H / 2, 0).castShadow = false;
      box(g, 'WE_CurtainFront', W * 0.45, H - 0.1, 0.01, curtain, -W * 0.27, H / 2, D / 2).castShadow = false;
      // positioner with the cooler housing
      box(g, 'WE_PosBase', 0.7, 0.75, 0.7, C.body, 0.4, 0.375, 0);
      const pos = grp(g, 'WE_Positioner', 0.4, 0.8, 0); cyl(pos, 'WE_Table', 0.4, 0.06, C.steel, 0, 0, 0);
      box(pos, 'WE_Housing', 0.25, 0.25, 0.6, C.part, 0, 0.16, 0); for (const s of [-1, 1]) box(pos, 'WE_Flange', 0.4, 0.4, 0.04, C.steel, 0, 0.18, s * 0.3);
      // robot with torch
      box(g, 'WE_RobotBase', 0.4, 0.5, 0.4, C.dark, -0.7, 0.25, 0);
      const j1 = grp(g, 'WE_J1', -0.7, 0.5, 0); cyl(j1, 'WE_Turret', 0.15, 0.2, M.robot, 0, 0.1, 0);
      const j2 = grp(j1, 'WE_J2', 0, 0.3, 0); box(j2, 'WE_Arm', 0.9, 0.12, 0.12, M.robot, 0.45, 0, 0);
      const tip = grp(j2, 'WE_Tip', 0.9, 0, 0); box(tip, 'WE_Torch', 0.05, 0.3, 0.05, C.dark, 0, -0.15, 0);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0xfff2a8, { emissive: 0xffe066, emissiveIntensity: 2 })); spark.name = 'WE_Spark'; spark.position.y = -0.32; tip.add(spark);
      box(g, 'WE_Source', 0.5, 0.8, 0.6, C.body, -W / 2 + 0.35, 0.4, -D / 2 + 0.4);
      panel(g, W / 2 + 0.15, 1.2, D / 2 - 0.3, -Math.PI / 4);
      lampTower(g, W / 2 - 0.05, H, -D / 2 + 0.05);
      titled(g, '용접 셀', 1.8, D / 2 + 0.7);
      welder.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const q = wePose(p, t), n = k => g.getObjectByName(k);
      const pos = n('WE_Positioner'); if (pos) pos.rotation.y = q.pos;
      const j1 = n('WE_J1'), j2 = n('WE_J2'); if (j1) j1.rotation.y = q.j1; if (j2) j2.rotation.z = q.j2;
      const sp = n('WE_Spark'); if (sp) { sp.visible = q.weld && Math.sin(t * 37) > -0.3; sp.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t * 23))); }
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['WE_Positioner', 'RotationY', true, t => wePose(p, t).pos], ['WE_J1', 'RotationY', true, t => wePose(p, t).j1], ['WE_J2', 'RotationZ', true, t => wePose(p, t).j2]]),
    footprint: p => [p.width + 0.6, p.depth + 0.6],
    cycle: p => Math.max(10, p.cycle)
  };

  /* ---------- helium leak tester: the bell comes down over the part, test, result lamp ---------- */
  function ltPose(p, t) {
    const T = Math.max(10, p.cycle), u = phase(t, T), k = Math.floor(t / T);
    const bell = u < 0.12 ? seg(u, 0, 0.12) : u < 0.8 ? 1 : u < 0.92 ? 1 - seg(u, 0.8, 0.92) : 0;
    const ng = ((Math.abs(k) * 2654435761) % 1000) / 10 < p.ng; // deterministic: about ng % of the cycles fail
    return { bell, testing: u >= 0.12 && u < 0.8, result: u >= 0.8 ? (ng ? 'ng' : 'ok') : '' };
  }
  const leaktest = {
    label: '리크 테스터', group: 'equipment',
    // ng: share of parts failing (%) — shown by the result lamp
    defaults: () => ({ width: 2.0, depth: 1.6, height: 2.2, cycle: 40, ng: 5 }),
    build: (g, p) => {
      const W = p.width, D = p.depth, H = p.height;
      box(g, 'LT_Base', W, 0.9, D, C.bodyLight, 0, 0.45, 0);
      box(g, 'LT_Fixture', 0.7, 0.08, 0.5, C.dark, 0, 0.94, 0.05);
      box(g, 'LT_Part', 0.3, 0.25, 0.45, C.part, 0, 1.105, 0.05);
      for (const s of [-1, 1]) box(g, 'LT_Column', 0.12, H - 0.9, 0.12, C.body, s * 0.55, 0.9 + (H - 0.9) / 2, -0.25);
      box(g, 'LT_Top', 1.25, 0.15, 0.3, C.body, 0, H, -0.25);
      const bell = grp(g, 'LT_Bell', 0, 0, 0); box(bell, 'LT_Chamber', 0.75, 0.55, 0.62, mat(0x9aa6b2, { metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.85 }), 0, 1.6, 0.05); box(bell, 'LT_Cylinder', 0.08, 0.5, 0.08, C.steel, 0, 2.0, 0.05);
      for (let i = 0; i < 2; i++) cyl(g, 'LT_HeBottle', 0.11, 1.3, mat(0x7a8b99, { metalness: 0.5 }), W / 2 + 0.2, 0.65, -D / 2 + 0.2 + i * 0.28);
      box(g, 'LT_Detector', 0.45, 0.5, 0.45, C.body, -W / 2 + 0.3, 1.15, -D / 2 + 0.3);
      [['LT_LampOK', 0x2bb673, -0.18], ['LT_LampNG', 0xe5484d, 0], ['LT_LampRun', 0xe8a019, 0.18]].forEach(([nm, col, x]) => cyl(g, nm, 0.06, 0.08, mat(col, { emissive: col, emissiveIntensity: 0 }), x, H + 0.15, -0.25));
      panel(g, W / 2 - 0.25, 1.25, D / 2 + 0.05, 0);
      titled(g, '헬륨 리크 테스트', 2.0, D / 2 + 0.7);
      leaktest.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const q = ltPose(p, t), n = k => g.getObjectByName(k);
      const b = n('LT_Bell'); if (b) b.position.y = -0.33 * q.bell;
      const lamp = (k, on) => { const l = n(k); if (l) l.children[0].material.emissiveIntensity = on ? 1.6 : 0; };
      lamp('LT_LampRun', q.testing && Math.sin(t * 8) > 0); lamp('LT_LampOK', q.result === 'ok'); lamp('LT_LampNG', q.result === 'ng');
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, [['LT_Bell', 'LinearY', false, t => -0.33 * ltPose(p, t).bell]]),
    footprint: p => [p.width + 0.7, p.depth + 0.8],
    cycle: p => Math.max(10, p.cycle)
  };

  /* ---------- pallet loop: workpiece carriers index around a closed loop (Bosch-type square ends or an oval) ---------- */
  // all carriers move one pitch together, then stand still for dwell s while the stations work (a synchronous
  // indexing line); stop s = 0 is the start of the first lane (x = -length / 2, z = -width / 2), flow +X there.
  // The product on a carrier gains a part with each quarter of the loop and is taken off near the end.
  const PRODUCT = {
    pedal: [['base', 0.3, 0.03, 0.22, 0x9aa1a8], ['bush', 0.08, 0.08, 0.08, 0x2b3138], ['arm', 0.06, 0.04, 0.3, 0x1e2226], ['spring', 0.05, 0.12, 0.05, 0xf2c200], ['pad', 0.12, 0.03, 0.08, 0x3a3f45]],
    lego: [['base', 0.28, 0.03, 0.2, 0x9aa1a8], ['frame', 0.24, 0.06, 0.16, 0xf2c200], ['pcb', 0.2, 0.015, 0.13, 0x2e9e57], ['top', 0.1, 0.05, 0.06, 0xe5484d]],
    box: [['base', 0.26, 0.03, 0.2, 0x9aa1a8], ['body', 0.2, 0.12, 0.14, 0xb08a5a]]
  };
  function loopPath(p) {
    const L = p.length, W = p.width, round = p.ends === 'round', end = round ? Math.PI * W / 2 : W, P = 2 * L + 2 * end;
    const at = s => {
      s = ((s % P) + P) % P;
      if (s < L) return [-L / 2 + s, -W / 2, 0];
      s -= L; if (s < end) { if (!round) return [L / 2, -W / 2 + s, 0]; const a = s / (W / 2); return [L / 2 + Math.sin(a) * W / 2, -Math.cos(a) * W / 2, -a]; }
      s -= end; if (s < L) return [L / 2 - s, W / 2, round ? -Math.PI : 0];
      s -= L; if (!round) return [-L / 2, W / 2 - s, 0]; const a = s / (W / 2); return [-L / 2 - Math.sin(a) * W / 2, Math.cos(a) * W / 2, -Math.PI - a];
    };
    const n = Math.max(2, Math.round(P / Math.max(0.3, p.pitch))), pitch = P / n, move = pitch / Math.max(0.02, p.speed), T = move + Math.max(0, p.dwell);
    const offset = t => { const k = Math.floor(t / T), u = t - k * T; return (k + ease(Math.min(1, u / move))) * pitch; };
    const slot = k => Math.round(k * n / Math.max(1, Math.min(n, p.pallets)));
    return { L, W, P, at, n, pitch, move, T, offset, slot, round, end };
  }
  const palletloop = {
    label: '팔레트 순환 컨베이어', group: 'equipment',
    defaults: () => ({ length: 9, width: 2.4, ends: 'square', pallets: 10, pitch: 1.5, speed: 0.3, dwell: 6, height: 0.85, product: 'pedal' }),
    build: (g, p) => {
      const Q = loopPath(p), H = p.height, lane = 0.36, frame = mat(0xc8cdd3, { metalness: 0.6, roughness: 0.35 }), belt = M.belt;
      const strip = (x, z, len, yaw) => { const s2 = grp(g, 'PL_Lane', x, 0, z); s2.rotation.y = yaw; box(s2, 'PL_Profile', len, 0.08, lane, frame, 0, H - 0.04, 0); for (const e of [-1, 1]) box(s2, 'PL_Belt', len, 0.012, 0.05, belt, 0, H + 0.006, e * (lane / 2 - 0.05)).castShadow = false; };
      for (const z of [-Q.W / 2, Q.W / 2]) strip(0, z, Q.L, 0);
      if (Q.round) { const N = 14; for (const e of [-1, 1]) for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI, a1 = (i + 1) / N * Math.PI, am = (a0 + a1) / 2, r = Q.W / 2; strip(e * (Q.L / 2 + Math.sin(am) * r), -e * Math.cos(am) * r, 2 * r * Math.sin((a1 - a0) / 2) + 0.02, -am); } }
      else for (const x of [-Q.L / 2, Q.L / 2]) { strip(x, 0, Q.W + lane, Math.PI / 2); box(g, 'PL_Transfer', 0.5, 0.18, 0.5, mat(0x3d4650, { metalness: 0.4 }), x, H - 0.17, -Q.W / 2); box(g, 'PL_Transfer', 0.5, 0.18, 0.5, mat(0x3d4650, { metalness: 0.4 }), x, H - 0.17, Q.W / 2); }
      const legs = Math.max(2, Math.ceil(Q.L / 1.5) + 1);
      for (let i = 0; i < legs; i++) for (const z of [-Q.W / 2, Q.W / 2]) box(g, 'PL_Leg', 0.06, H - 0.08, 0.06, frame, -Q.L / 2 + i * Q.L / (legs - 1), (H - 0.08) / 2, z);
      for (let k = 0; k < Q.n; k++) { const [x, z] = Q.at(k * Q.pitch); if (Math.abs(x) <= Q.L / 2 + 1e-6 && Math.abs(Math.abs(z) - Q.W / 2) < 1e-6) box(g, 'PL_Stopper', 0.04, 0.06, lane + 0.04, C.dark, x + (z < 0 ? 0.2 : -0.2), H + 0.03, z).castShadow = false; }
      const parts = PRODUCT[p.product] || PRODUCT.box, np = Math.max(1, Math.min(Q.n, p.pallets));
      for (let k = 0; k < np; k++) {
        const it = grp(g, 'PL_Pallet_' + (k + 1)); box(it, 'PL_Carrier', 0.34, 0.025, 0.34, frame, 0, H + 0.025, 0); box(it, 'PL_Jig', 0.26, 0.02, 0.2, C.dark, 0, H + 0.048, 0);
        let y = H + 0.058; parts.forEach(([n, w, h, d, col], i) => { const m = box(it, 'PL_Part_' + i, w, h, d, mat(col, { roughness: 0.5, metalness: n === 'base' ? 0.6 : 0.1 }), 0, y + h / 2, n === 'arm' ? 0.04 : 0); if (n === 'arm') m.rotation.x = -0.5; if (n !== 'arm' && n !== 'spring') y += h; });
      }
      titled(g, '팔레트 순환 컨베이어', 2.4, Q.W / 2 + 0.8);
      palletloop.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const Q = loopPath(p), off = Q.offset(t), parts = (PRODUCT[p.product] || PRODUCT.box).length, np = Math.max(1, Math.min(Q.n, p.pallets));
      for (let k = 0; k < np; k++) {
        const it = g.getObjectByName('PL_Pallet_' + (k + 1)); if (!it) continue;
        const s = ((Q.slot(k) * Q.pitch + off) % Q.P + Q.P) % Q.P, [x, z, yaw] = Q.at(s); it.position.set(x, 0, z); it.rotation.y = yaw;
        const f = s / Q.P, stage = f > 0.88 ? -1 : Math.min(parts - 1, Math.floor(f / 0.85 * parts)); // taken off near the end of the loop
        for (let i = 0; i < parts; i++) { const m = it.getObjectByName('PL_Part_' + i); if (m) m.visible = i <= stage; }
      }
    },
    footprint: p => { const Q = loopPath(p); return [Q.L + (Q.round ? Q.W : 0) + 0.5, Q.W + 0.5]; },
    cycle: p => loopPath(p).T
  };

  /* ---------- assembly station: aluminium-profile cell beside the pallet loop; works while the carriers stand still ---------- */
  // kind: manual (operator loads parts into the poka-yoke jig), press (press-fit), screw (nut runner), robot,
  // test (function test with HMI), camera (vision check). Front (local +Z) faces the conveyor; the tool reaches
  // reach m past the front edge, over the carrier. It works for dwell s at the end of every cycle s.
  function asPose(p, t) {
    const T = Math.max(1, p.cycle), u = ((t % T) + T) % T, a = T - Math.min(T, p.dwell);
    const w = u < a ? -1 : (u - a) / Math.max(0.1, T - a); // 0..1 while working
    const dip = w < 0 ? 0 : Math.sin(Math.PI * Math.min(1, w * 1.25));
    return { w, dip, spin: w < 0 ? 0 : t * 12, u, a };
  }
  const ASKIND = { manual: '수동 투입', press: '압입', screw: '체결', robot: '로봇 조립', test: '기능 검사', camera: '비전 검사' };
  const asmstation = {
    label: '조립 스테이션', group: 'equipment',
    defaults: () => ({ kind: 'press', width: 1.2, depth: 1.2, cycle: 11, dwell: 6, reach: 0.55, title: '' }),
    build: (g, p) => {
      const W = p.width, D = p.depth, top = 0.85, H = 2.05, frame = mat(0xc8cdd3, { metalness: 0.6, roughness: 0.35 }), red = mat(0xc8202a, { roughness: 0.5 });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 'AS_Post', 0.05, p.kind === 'manual' ? top : H, 0.05, frame, x * (W / 2 - 0.025), (p.kind === 'manual' ? top : H) / 2, z * (D / 2 - 0.025));
      box(g, 'AS_Table', W, 0.04, D, mat(0xdfe3e8, { metalness: 0.3 }), 0, top, 0);
      box(g, 'AS_Panel', W - 0.06, 0.55, 0.02, red, 0, 0.35, D / 2 - 0.03); for (const s2 of [-1, 1]) box(g, 'AS_Panel', 0.02, 0.55, D - 0.06, red, s2 * (W / 2 - 0.03), 0.35, 0);
      const T2 = new THREE.Group(); T2.name = 'AS_ToolMount'; g.add(T2);
      if (p.kind !== 'manual') {
        for (const z of [-1, 1]) box(g, 'AS_TopBeam', W, 0.05, 0.05, frame, 0, H, z * (D / 2 - 0.025)); for (const x of [-1, 1]) box(g, 'AS_TopBeam', 0.05, 0.05, D, frame, x * (W / 2 - 0.025), H, 0);
        box(g, 'AS_Guard', W - 0.06, H - top - 0.05, 0.01, C.glass, 0, (H + top) / 2, -D / 2 + 0.01).castShadow = false;
        for (const s2 of [-1, 1]) box(g, 'AS_Guard', 0.01, H - top - 0.05, D - 0.06, C.glass, s2 * (W / 2 - 0.01), (H + top) / 2, 0).castShadow = false;
        // bridge reaching over the carrier
        const R = D / 2 + p.reach;
        for (const x of [-1, 1]) box(g, 'AS_Bridge', 0.05, 0.05, R - D / 2 + 0.05, frame, x * 0.25, 1.65, D / 2 + (R - D / 2) / 2);
        box(g, 'AS_Bridge', 0.55, 0.05, 0.05, frame, 0, 1.65, R);
        const tool = grp(g, 'AS_Tool', 0, 0, R);
        if (p.kind === 'press') { box(tool, 'AS_Cylinder', 0.16, 0.35, 0.16, C.steel, 0, 1.45, 0); box(tool, 'AS_Ram', 0.1, 0.3, 0.1, C.dark, 0, 1.12, 0); }
        if (p.kind === 'screw') { box(tool, 'AS_Motor', 0.1, 0.3, 0.1, C.body, 0, 1.45, 0); const sp = grp(tool, 'AS_Spindle', 0, 1.18, 0); cyl(sp, 'AS_Bit', 0.015, 0.25, C.steel, 0, 0, 0); box(sp, 'AS_Flag', 0.06, 0.02, 0.01, C.yellow, 0.04, 0.05, 0); }
        if (p.kind === 'test') { box(tool, 'AS_Probe', 0.22, 0.12, 0.18, C.body, 0, 1.25, 0); for (const x of [-1, 1]) cyl(tool, 'AS_Pin', 0.01, 0.12, C.yellow, x * 0.06, 1.13, 0); }
        if (p.kind === 'camera') { box(tool, 'AS_Camera', 0.1, 0.16, 0.1, M.black, 0, 1.5, 0); cyl(tool, 'AS_Ring', 0.09, 0.03, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0 }), 0, 1.4, 0); }
        if (p.kind === 'robot') {
          tool.position.z = 0; box(g, 'AS_RobotBase', 0.26, 0.18, 0.26, M.robotDark, 0, top + 0.09, D / 2 - 0.25);
          const j1 = grp(g, 'AS_J1', 0, top + 0.18, D / 2 - 0.25); cyl(j1, 'AS_Turret', 0.11, 0.16, red, 0, 0.08, 0);
          const j2 = grp(j1, 'AS_J2', 0, 0.2, 0); j2.rotation.x = -0.6; box(j2, 'AS_Upper', 0.1, 0.5, 0.1, red, 0, 0.25, 0);
          const j3 = grp(j2, 'AS_J3', 0, 0.5, 0); j3.rotation.x = 1.9; box(j3, 'AS_Fore', 0.08, 0.42, 0.08, red, 0, 0.21, 0); box(j3, 'AS_Gripper', 0.1, 0.08, 0.06, C.dark, 0, 0.46, 0);
          const held = box(j3, 'AS_Held', 0.08, 0.05, 0.06, mat(0x2e9e57), 0, 0.53, 0); held.visible = false;
        }
      } else {
        box(g, 'AS_Bin', 0.4, 0.25, 0.3, mat(0x2f6fd1), -W / 2 + 0.3, top + 0.125, -D / 2 + 0.25);
        box(g, 'AS_Bin', 0.4, 0.25, 0.3, mat(0xc8202a), W / 2 - 0.3, top + 0.125, -D / 2 + 0.25);
        box(g, 'AS_PokaYoke', 0.36, 0.05, 0.26, C.yellow, 0, top + 0.045, D / 2 - 0.25);
        box(g, 'AS_Andon', 0.04, 0.6, 0.04, frame, W / 2 - 0.05, top + 0.3, -D / 2 + 0.05); cyl(g, 'AS_Lamp', 0.04, 0.06, C.lamp, W / 2 - 0.05, top + 0.63, -D / 2 + 0.05);
      }
      // HMI on an arm
      box(g, 'AS_HmiArm', 0.04, 0.5, 0.04, frame, W / 2 + 0.02, 1.3, D / 2 - 0.1);
      box(g, 'AS_Hmi', 0.32, 0.24, 0.03, M.black, W / 2 + 0.1, 1.55, D / 2 - 0.06).rotation.y = -0.4;
      if (p.kind !== 'manual') lampTower(g, -W / 2 + 0.06, H, -D / 2 + 0.06);
      titled(g, p.title || ASKIND[p.kind] || '조립 스테이션', 1.5, -D / 2 - 0.35);
      asmstation.animate(g, p, 0);
    },
    animate: (g, p, t) => {
      const q = asPose(p, t), n = k => g.getObjectByName(k);
      const tool = n('AS_Tool'); if (tool && p.kind !== 'robot') tool.position.y = -0.2 * q.dip;
      const sp = n('AS_Spindle'); if (sp) sp.rotation.y = q.spin;
      const ring = n('AS_Ring'); if (ring) ring.children[0].material.emissiveIntensity = q.w >= 0 && Math.sin(t * 20) > 0 ? 2 : 0;
      const j1 = n('AS_J1'); if (j1) {
        // robot: turns back to the rack and picks while the carriers move, places on the carrier while they stand
        j1.rotation.y = Math.PI * Math.sin(Math.PI * Math.min(1, q.u / Math.max(0.1, q.a)));
        const j3 = n('AS_J3'); if (j3) j3.rotation.x = 1.9 + 0.3 * q.dip;
        const held = n('AS_Held'); if (held) held.visible = q.u > q.a * 0.5 && q.w < 0.5;
      }
    },
    drives: (g, p, frames, spf) => record(g, frames, spf, p.kind === 'robot' ? [] : [['AS_Tool', 'LinearY', false, t => -0.2 * asPose(p, t).dip]]),
    footprint: p => [p.width + 0.2, p.depth + 0.2],
    cycle: p => Math.max(1, p.cycle)
  };

  /* ---------- gravity flow rack: inclined shelves of part bins that roll down to the picking side (front, local +Z) ---------- */
  const flowrack = {
    label: '경사 부품 선반', group: 'equipment',
    defaults: () => ({ width: 1.6, depth: 1.0, height: 1.9, levels: 4, bins: 5 }),
    build: (g, p) => {
      const W = p.width, D = p.depth, H = p.height, frame = mat(0xc8cdd3, { metalness: 0.6, roughness: 0.35 }), cols = [0x2f6fd1, 0xc8202a, 0xf2c200, 0x2e9e57, 0x3a3f45];
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 'FR_Post', 0.05, z < 0 ? H : H - 0.35, 0.05, frame, x * (W / 2 - 0.025), (z < 0 ? H : H - 0.35) / 2, z * (D / 2 - 0.025));
      const tilt = Math.atan2(0.3, D);
      for (let l = 0; l < p.levels; l++) {
        const y = 0.45 + l * (H - 0.6) / Math.max(1, p.levels), sh = grp(g, 'FR_Shelf', 0, y, 0); sh.rotation.x = tilt;
        box(sh, 'FR_Roller', W - 0.08, 0.02, D, frame, 0, 0, 0);
        for (let b = 0; b < p.bins; b++) for (let r = 0; r < 2; r++) box(sh, 'FR_Bin', (W - 0.1) / p.bins - 0.04, 0.12, D / 2 - 0.06, mat(cols[(b + l) % cols.length], { roughness: 0.6 }), -W / 2 + 0.05 + (b + 0.5) * (W - 0.1) / p.bins, 0.07, -D / 4 + r * D / 2);
      }
      titled(g, '경사 부품 선반', 1.4, D / 2 + 0.3);
    },
    footprint: p => [p.width + 0.2, p.depth + 0.2]
  };

  Object.assign(FE.TYPES, { conveyor2, press, injection, machining, washer, transfer, furnace, welder, leaktest, palletloop, asmstation, flowrack });
  FE.MACHINES = ['conveyor2', 'press', 'injection', 'machining', 'washer', 'transfer', 'furnace', 'welder', 'leaktest', 'palletloop', 'asmstation', 'flowrack'];
  FE.WORK_AREA.push(...FE.MACHINES);
})();
