// General manufacturing equipment for the factory builder (console 1) and the factory export, registered
// into js/factory-elements.js: two-level conveyor (pallet loop with end lifts), press, injection moulding
// machine, machining centre, tunnel washer and gantry transfer (이재기). Each is built from its parameters
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

  Object.assign(FE.TYPES, { conveyor2, press, injection, machining, washer, transfer });
  FE.WORK_AREA.push('conveyor2', 'press', 'injection', 'machining', 'washer', 'transfer');
  FE.MACHINES = ['conveyor2', 'press', 'injection', 'machining', 'washer', 'transfer'];
})();
