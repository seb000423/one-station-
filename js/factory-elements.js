// Building elements and equipment for the factory builder (console 1) and the factory export: columns,
// wall segments, doors, stairs, walkways, typed zones, conveyors, standalone robots, racks, AMRs and
// chargers, each built from its parameters in metres.
// Moving equipment: conveyor rollers carry realvirtual jog drives (they spin in console 2 without a
// recording); a standalone robot runs a pick-and-place loop between two angles, previewed live by
// animate() and recorded for console 2 by drives(). The element sits on
// the floor at its object origin (x, z), rotated about Y by obj.rot. Also builds the factory shell
// (floor, perimeter walls, corner columns, ceiling outline) for a { width, depth, height } factory.
(function () {
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.1 }, o));
  const M = {
    concrete: mat(0x8a8f96, { roughness: 0.85 }),
    wall: mat(0x6f7781, { roughness: 0.8 }),
    steel: mat(0x59636e, { metalness: 0.4, roughness: 0.6 }),
    door: mat(0x2f7dd1, { transparent: true, opacity: 0.55 }),
    frame: mat(0x3b434c, { metalness: 0.3 }),
    stair: mat(0x9aa1a8, { metalness: 0.5, roughness: 0.5 }),
    walkway: mat(0x2e7d4f, { roughness: 0.9 }),
    yellow: mat(0xd6b21a, { roughness: 0.6 }),
    floor: mat(0x2a2f36, { roughness: 0.9, metalness: 0 }),
    glass: mat(0x8ea3b5, { transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
    conveyorFrame: mat(0x3f4a55, { metalness: 0.5, roughness: 0.5 }),
    roller: mat(0xb9bfc6, { metalness: 0.8, roughness: 0.35 }),
    belt: mat(0x1b1e22, { roughness: 0.95 }),
    robot: mat(0xe8a019, { metalness: 0.2, roughness: 0.45 }),
    robotDark: mat(0x2f343b, { metalness: 0.3, roughness: 0.5 }),
    rack: mat(0x2f6fd1, { metalness: 0.5, roughness: 0.45 }),
    beam: mat(0xe07a1f, { metalness: 0.5, roughness: 0.45 }),
    carton: mat(0xb08a5a, { roughness: 0.9 }),
    amr: mat(0xdfe3e8, { metalness: 0.2, roughness: 0.5 }),
    black: mat(0x16181c, { roughness: 0.6 }),
    green: mat(0x2bb673, { emissive: 0x2bb673, emissiveIntensity: 0.6 })
  };
  const cyl = (g, n, r, len, m, x, y, z, axis) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), m); c.name = n; c.castShadow = c.receiveShadow = true;
    if (axis === 'z') c.rotation.x = Math.PI / 2; else if (axis === 'x') c.rotation.z = Math.PI / 2;
    const holder = new THREE.Group(); holder.name = n; holder.position.set(x, y, z); holder.add(c); c.name = n + '_mesh'; g.add(holder); return holder;
  };
  // realvirtual drive extras (console 2); harmless in console 1
  const jog = (node, dir, rev, degPerSec) => { node.userData.realvirtual = { Drive: { Direction: dir, ReverseDirection: rev, TargetSpeed: Math.abs(degPerSec), JogForward: degPerSec > 0, JogBackward: degPerSec < 0, UseLimits: false } }; };
  const ZONE_KIND = { pickup: ['적재 구역', '#3a7bc8'], dropoff: ['하역 구역', '#d08a2e'], storage: ['보관 구역', '#5f7489'], keepout: ['금지 구역', '#d13f3f'], none: ['구역', '#5f6b78'] };
  // floor ring (range / safety circles); its material is its own so it can turn red
  function ring(g, n, r, color, opacity = 0.55) {
    const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, r - 0.04), r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.name = n; m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.renderOrder = 2; g.add(m); return m;
  }
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  // standalone robot pick & place: joint angles (rad) at time t (s) of one cycle
  function robotPose(p, t) {
    const T = Math.max(2, p.cycle), u = ((t % T) + T) % T / T, a0 = p.pick * Math.PI / 180, a1 = p.place * Math.PI / 180;
    const seg = (a, b) => ease((u - a) / (b - a));
    // yaw: pick → place (0.25–0.5), place → pick (0.75–1.0); reach down at both ends
    const yaw = u < 0.25 ? a0 : u < 0.5 ? a0 + (a1 - a0) * seg(0.25, 0.5) : u < 0.75 ? a1 : a1 + (a0 - a1) * seg(0.75, 1);
    const down = u < 0.25 ? Math.sin(Math.PI * Math.min(1, u / 0.25)) : u >= 0.5 && u < 0.75 ? Math.sin(Math.PI * (u - 0.5) / 0.25) : 0;
    return { j1: yaw, j2: -0.35 - 0.45 * down, j3: 1.2 + 0.25 * down, j4: -0.85 + 0.2 * down, carry: u >= 0.12 && u < 0.62, down };
  }
  // the same pick & place on the FANUC CRX GLB (js/factory-assets.js): elbow-up IK of the wrist centre (A5) in
  // the arm plane, flange pointing down. Joint angles (rad) for the wrappers Robot_J1 (in A1, about Y),
  // Robot_J2 / J3 / J5 (in A2 / A3 / A5, about Z). At zero the upper arm points up and the forearm along local +X,
  // and A1's authored yaw turns local +X to world −Z, hence the −90° on J1.
  const CRX = { base: 0.5, shoulder: 0.245, upper: 0.71, fore: 0.54, tool: 0.16, side: 0.15 };
  function crxPose(p, t) {
    const q = robotPose(p, t), r = Math.min(p.reach * 0.75, CRX.upper + CRX.fore - 0.05);
    const hs = CRX.base + CRX.shoulder, y = 0.12 + 0.45 * (1 - q.down) + CRX.tool - hs, r1 = r * (1 - 0.15 * (1 - q.down));
    const d = Math.min(Math.hypot(r1, y), CRX.upper + CRX.fore - 1e-3);
    const a = Math.atan2(y, r1) + Math.acos(Math.max(-1, Math.min(1, (CRX.upper ** 2 + d * d - CRX.fore ** 2) / (2 * CRX.upper * d))));
    const b = Math.atan2(y - CRX.upper * Math.sin(a), r1 - CRX.upper * Math.cos(a));
    const j2 = a - Math.PI / 2, j3 = b - j2;
    // the flange sits CRX.side off the arm plane: turn J1 a little so the tool, not the plane, meets the pad
    return { j1: q.j1 - Math.PI / 2 + Math.asin(CRX.side / Math.max(r1, CRX.side)), j2, j3, j5: -Math.PI / 2 - b, carry: q.carry };
  }
  const CRX_JOINTS = [['A1', 'Robot_J1', 'j1', 'y'], ['A2', 'Robot_J2', 'j2', 'z'], ['A3', 'Robot_J3', 'j3', 'z'], ['A5', 'Robot_J5', 'j5', 'z']];
  const isCrx = g => !!g.getObjectByName('Robot_J5'); // the builder replaces g.userData, so look at the joints
  // pick / place pads on the floor and the reach circle
  function robotPads(g, p) {
    for (const [n, ang, col] of [['Robot_Pick', p.pick, '#2f7dd1'], ['Robot_Place', p.place, '#d1782f']]) {
      const rad = ang * Math.PI / 180, pad = box(g, n, 0.4, 0.01, 0.4, mat(new THREE.Color(col), { transparent: true, opacity: 0.6 }), Math.cos(rad) * p.reach * 0.75, 0.005, -Math.sin(rad) * p.reach * 0.75);
      pad.castShadow = false;
    }
    ring(g, 'Robot_Range', p.reach, 0xe8a019, 0.45);
  }
  // conveyor centre line in its own frame. base(u) runs 0..len along local +X first (dir +1); at(s) runs along
  // the actual travel direction (dir −1 reverses it). Both return [x, z, yaw]. A 90° curve / 180° U-turn turns
  // left (m +1) or right (m −1) around centre (cx, m·cz) with radius R; its footprint box is centred on the origin.
  function conveyorPath(p) {
    const W = p.width, h = W / 2 + 0.05, shape = p.shape === 'curve' || p.shape === 'uturn' ? p.shape : 'straight', m = p.turn === 'right' ? -1 : 1;
    let len, base, size, R = 0, A = 0, cx = 0, cz = 0;
    if (shape === 'straight') { len = p.length; base = u => [-len / 2 + u, 0, 0]; size = [len, W + 0.1]; }
    else {
      R = Math.max(p.radius, h + 0.05); A = shape === 'uturn' ? Math.PI : Math.PI / 2;
      const Sx = R + h; size = [Sx, shape === 'uturn' ? 2 * Sx : Sx]; cx = -Sx / 2; cz = shape === 'uturn' ? 0 : -Sx / 2; len = R * A;
      base = u => { const t = u / R; return [cx + R * Math.sin(t), m * (cz + R * Math.cos(t)), m * t]; };
    }
    const clamp = s => Math.max(0, Math.min(len, s));
    const at = p.dir < 0 ? s => { const q = base(len - clamp(s)); return [q[0], q[1], q[2] + Math.PI]; } : s => base(clamp(s));
    return { shape, len, base, at, size, top: p.height + 0.035, R, A, cx, cz, m, h };
  }
  const box = (g, n, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.name = n; b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };

  let BILLBOARD = false; // set while building for console 1
  function labelPlane(text, w, color, flat) {
    if (BILLBOARD && !flat) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const x = c.getContext('2d'); x.fillStyle = 'rgba(11,13,16,.72)'; const tw = Math.min(500, x.measureText ? 500 : 500);
      x.font = 'bold 56px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; const m = Math.min(500, x.measureText(text).width + 48);
      x.beginPath(); x.roundRect ? x.roundRect((512 - m) / 2, 20, m, 88, 16) : x.rect((512 - m) / 2, 20, m, 88); x.fill();
      x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 66);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      const W = Math.min(Math.max(w, 1.2), 2.4); s.scale.set(W, W / 4, 1); s.position.y = 0.5; s.renderOrder = 5; s.userData.label = true; return s;
    }
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = color; x.font = 'bold 64px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    // console 2 (realvirtual) shows the model mirrored in X: floor text in the export is drawn mirrored so it reads right there
    // (arrows are not: they mirror together with what they point along)
    if (!BILLBOARD && !/^[▶◀\s]+$/.test(text)) { x.translate(512, 0); x.scale(-1, 1); }
    x.fillText(text, 256, 64);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, 3), Math.min(w, 3) / 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012; return m;
  }

  // type -> { label, group, defaults(factory), build(group, params, factory), footprint(params) [w, d] }
  const TYPES = {
    column: {
      label: '기둥', group: 'building',
      defaults: () => ({ w: 0.5, d: 0.5, h: 0 }), // h 0 = factory height
      build: (g, p, f) => { const h = p.h || f.height; box(g, 'Column', p.w, h, p.d, M.concrete, 0, h / 2, 0); },
      footprint: p => [p.w, p.d]
    },
    wall: {
      label: '벽', group: 'building',
      defaults: () => ({ length: 4, thickness: 0.2, h: 0 }),
      build: (g, p, f) => { const h = p.h || f.height; box(g, 'Wall', p.length, h, p.thickness, M.wall, 0, h / 2, 0); },
      footprint: p => [p.length, p.thickness]
    },
    door: {
      label: '출입문', group: 'building',
      defaults: () => ({ width: 1.2, height: 2.2, thickness: 0.2 }),
      build: (g, p) => {
        const fw = 0.08;
        box(g, 'Door_Post_L', fw, p.height, p.thickness, M.frame, -p.width / 2 - fw / 2, p.height / 2, 0);
        box(g, 'Door_Post_R', fw, p.height, p.thickness, M.frame, p.width / 2 + fw / 2, p.height / 2, 0);
        box(g, 'Door_Lintel', p.width + 2 * fw, fw, p.thickness, M.frame, 0, p.height + fw / 2, 0);
        box(g, 'Door_Leaf', p.width, p.height, 0.03, M.door, 0, p.height / 2, 0);
        box(g, 'Door_Sill', p.width, 0.01, p.thickness + 0.6, M.yellow, 0, 0.005, 0);
      },
      footprint: p => [p.width + 0.16, p.thickness + 0.6]
    },
    stairs: {
      label: '계단', group: 'building',
      defaults: () => ({ width: 1.2, run: 3, height: 2.4 }),
      build: (g, p) => {
        const n = Math.max(2, Math.round(p.height / 0.18)), rise = p.height / n, tread = p.run / n;
        for (let i = 0; i < n; i++) box(g, 'Stair_Step_' + (i + 1), p.width, rise, tread, M.stair, 0, rise * (i + 0.5), -p.run / 2 + tread * (i + 0.5));
        for (const s of [-1, 1]) {
          const len = Math.hypot(p.run, p.height), r = box(g, 'Stair_Rail_' + (s > 0 ? 'R' : 'L'), 0.05, 0.05, len, M.yellow, s * p.width / 2, p.height / 2 + 0.9, 0);
          r.rotation.x = -Math.atan2(p.height, p.run);
        }
      },
      footprint: p => [p.width, p.run]
    },
    walkway: {
      label: '보행로', group: 'route',
      defaults: () => ({ length: 6, width: 1.2, label: '' }),
      build: (g, p) => {
        box(g, 'Walkway_Floor', p.length, 0.006, p.width, M.walkway, 0, 0.003, 0).castShadow = false;
        for (const s of [-1, 1]) box(g, 'Walkway_Edge', p.length, 0.008, 0.08, M.yellow, 0, 0.004, s * (p.width / 2 - 0.04)).castShadow = false;
        const lab = labelPlane(p.label || '보행로', Math.min(p.length * 0.5, p.width * 1.4, 1.4), '#e9f5ee', true); lab.userData.floorLabel = true; g.add(lab); // painted on the walkway
      },
      footprint: p => [p.length, p.width]
    },
    zone: {
      label: '구역', group: 'route',
      defaults: () => ({ w: 3, d: 3, kind: 'pickup', label: '', color: '', track: false, stock: 0, cap: 0, supply: 0, consume: 0, unitKg: 0, thresholdKg: 0 }), // unitKg / thresholdKg: a weighing zone (AMR takes a batch when the weight reaches the threshold) // track: count stock (js/factory-motion.js)
      build: (g, p) => {
        const c = new THREE.Color(p.color || (ZONE_KIND[p.kind] || ZONE_KIND.none)[1]);
        box(g, 'Zone_Area', p.w, 0.004, p.d, mat(c, { transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.002, 0).castShadow = false;
        const edge = mat(c);
        for (const [w, d, x, z] of [[p.w, 0.08, 0, -p.d / 2], [p.w, 0.08, 0, p.d / 2], [0.08, p.d, -p.w / 2, 0], [0.08, p.d, p.w / 2, 0]]) box(g, 'Zone_Edge', w, 0.012, d, edge, x, 0.006, z).castShadow = false;
        // the name is painted on the floor; console 1 shows one screen-space card per zone (name, stock, state) instead of floating labels
        const name = labelPlane(p.label || (ZONE_KIND[p.kind] || ZONE_KIND.none)[0], Math.min(p.w * 0.75, 1.5), '#ffffff', true); name.name = 'Zone_Name'; name.userData.floorLabel = true; g.add(name);
      },
      footprint: p => [p.w, p.d]
    },
    conveyor: {
      label: '컨베이어', group: 'equipment',
      // shape: straight / curve (90°) / uturn (180°), turning left or right around radius (centre line);
      // source: items are put on at the entry every interval s (item: carton length m); sink: taken off at the exit
      defaults: () => ({ shape: 'straight', length: 4, radius: 0.9, turn: 'left', width: 0.6, height: 0.8, speed: 0.3, kind: 'roller', dir: 1, source: false, interval: 6, item: 0.4, sink: false }),
      build: (g, p) => {
        const P = conveyorPath(p), W = p.width, H = p.height, r = 0.035;
        const degPerSec = (p.speed / r) * 180 / Math.PI * (p.dir < 0 ? -1 : 1);
        // a part laid along the base centre line at distance u (local +X = travel direction of dir +1)
        const seg = u => { const [x, z, yaw] = P.base(u), s = new THREE.Group(); s.name = 'Conveyor_Seg'; s.position.set(x, 0, z); s.rotation.y = yaw; g.add(s); return s; };
        if (P.shape === 'straight') {
          const L = P.len;
          for (const s of [-1, 1]) box(g, 'Conveyor_Side', L, 0.12, 0.04, M.conveyorFrame, 0, H - 0.02, s * (W / 2 + 0.02));
          const legs = Math.max(2, Math.ceil(L / 1.5) + 1);
          for (let i = 0; i < legs; i++) for (const s of [-1, 1]) box(g, 'Conveyor_Leg', 0.05, H - 0.06, 0.05, M.conveyorFrame, -L / 2 + 0.05 + i * (L - 0.1) / (legs - 1), (H - 0.06) / 2, s * (W / 2 - 0.02));
        } else {
          // curved side rails from short pieces; legs at the ends and between
          const arc = (rr, t) => [P.cx + rr * Math.sin(t), P.m * (P.cz + rr * Math.cos(t)), P.m * t];
          for (const side of [-1, 1]) {
            const rr = P.R + side * (W / 2 + 0.02), n = Math.max(6, Math.ceil(P.A * rr / 0.12));
            for (let i = 0; i < n; i++) { const t0 = i / n * P.A, t1 = (i + 1) / n * P.A, [x, z, yaw] = arc(rr, (t0 + t1) / 2); box(g, 'Conveyor_Side', 2 * rr * Math.sin((t1 - t0) / 2) + 0.01, 0.12, 0.04, M.conveyorFrame, x, H - 0.02, z).rotation.y = yaw; }
            const nl = P.shape === 'uturn' ? 4 : 2;
            for (let i = 0; i <= nl; i++) { const [x, z] = arc(P.R + side * (W / 2 - 0.02), Math.min(P.A - 0.05, Math.max(0.05, i / nl * P.A))); box(g, 'Conveyor_Leg', 0.05, H - 0.06, 0.05, M.conveyorFrame, x, (H - 0.06) / 2, z); }
          }
        }
        if (p.kind === 'belt') {
          if (P.shape === 'straight') box(g, 'Conveyor_Belt', P.len - 2 * r, 0.012, W - 0.02, M.belt, 0, H + r - 0.006, 0);
          else {
            const belt = new THREE.Mesh(new THREE.RingGeometry(P.R - (W - 0.02) / 2, P.R + (W - 0.02) / 2, 48, 1, P.m > 0 ? -Math.PI / 2 : Math.PI / 2 - P.A, P.A), M.belt);
            belt.name = 'Conveyor_Belt'; belt.rotation.x = -Math.PI / 2; belt.position.set(P.cx, H + r, P.m * P.cz); belt.receiveShadow = true; g.add(belt);
          }
          for (const u of [r, P.len - r]) jog(cyl(seg(u), 'Conveyor_Drum', r, W - 0.02, M.roller, 0, H, 0, 'z'), 'RotationZ', true, -degPerSec);
        } else {
          const n = Math.max(2, Math.min(120, Math.floor(P.len / 0.12)));
          for (let i = 0; i < n; i++) jog(cyl(seg(0.06 + i * (P.len - 0.12) / (n - 1)), 'Conveyor_Roller', r, W - 0.02, M.roller, 0, H, 0, 'z'), 'RotationZ', true, -degPerSec);
        }
        // flat arrows along the travel direction
        const nA = Math.max(1, Math.round(P.len / 1.2));
        for (let i = 0; i < nA; i++) {
          const [x, z, yaw] = P.at((i + 0.5) * P.len / nA), a = new THREE.Group(); a.name = 'Conveyor_Arrow'; a.position.set(x, H + r + 0.006, z); a.rotation.y = yaw;
          const arrow = labelPlane('▶', 0.35, 'rgba(238,197,57,.7)', true); arrow.position.y = 0; a.add(arrow); g.add(a);
        }
        // where items are put on / taken off
        for (const [on, s, text, color] of [[p.source, 0, '투입', '#7cc4ff'], [p.sink, P.len, '배출', '#ffb37c']]) {
          if (!on) continue;
          const [x, z] = P.at(s), lab = labelPlane(text, 0.9, color); lab.name = 'Conveyor_' + (s ? 'Sink' : 'Source');
          lab.position.set(x, lab.isSprite ? H + 0.75 : H + r + 0.012, z); g.add(lab);
        }
      },
      animate: (g, p, t) => { const r = 0.035, a = -(p.speed / r) * t * (p.dir < 0 ? -1 : 1); g.traverse(o => { if (/^Conveyor_(Roller|Drum)$/.test(o.name) && !o.isMesh) o.rotation.z = a; }); },
      footprint: p => conveyorPath(p).size
    },
    robot: {
      label: '로봇', group: 'equipment',
      defaults: () => ({ model: 'fanuc', reach: 1.3, pick: -90, place: 90, cycle: 8 }),
      build: (g, p) => {
        const R = p.reach, a = R * 0.48, b = R * 0.42;
        box(g, 'Robot_Pedestal', 0.5, 0.5, 0.5, M.robotDark, 0, 0.25, 0);
        const crx = p.model === 'fanuc' && window.FactoryAssets && window.FactoryAssets.get('fanuc');
        if (crx) {
          crx.position.y = CRX.base; g.add(crx);
          for (const [n, w] of CRX_JOINTS) { const node = crx.getObjectByName(n); if (node) FactoryAssets.jointWrap(node, w); }
          robotPads(g, p); TYPES.robot.animate(g, p, 0);
          return;
        }
        const j1 = new THREE.Group(); j1.name = 'Robot_J1'; j1.position.y = 0.5; g.add(j1);
        cyl(j1, 'Robot_Base', 0.16, 0.22, M.robot, 0, 0.11, 0);
        const j2 = new THREE.Group(); j2.name = 'Robot_J2'; j2.position.y = 0.3; j1.add(j2);
        cyl(j2, 'Robot_Shoulder', 0.12, 0.26, M.robotDark, 0, 0, 0, 'z');
        box(j2, 'Robot_UpperArm', a, 0.14, 0.14, M.robot, a / 2, 0, 0);
        const j3 = new THREE.Group(); j3.name = 'Robot_J3'; j3.position.x = a; j2.add(j3);
        cyl(j3, 'Robot_Elbow', 0.09, 0.2, M.robotDark, 0, 0, 0, 'z');
        box(j3, 'Robot_Forearm', b, 0.1, 0.1, M.robot, b / 2, 0, 0);
        const j4 = new THREE.Group(); j4.name = 'Robot_J4'; j4.position.x = b; j3.add(j4);
        box(j4, 'Robot_Wrist', 0.12, 0.08, 0.08, M.robotDark, 0.06, 0, 0);
        box(j4, 'Robot_Gripper', 0.04, 0.16, 0.12, M.black, 0.14, 0, 0);
        robotPads(g, p);
        const pose = robotPose(p, 0); j1.rotation.y = pose.j1; j2.rotation.z = pose.j2; j3.rotation.z = pose.j3; j4.rotation.z = pose.j4;
      },
      animate: (g, p, t) => {
        if (isCrx(g)) { const q = crxPose(p, t); for (const [, w, k, ax] of CRX_JOINTS) { const j = g.getObjectByName(w); if (j) j.rotation[ax] = q[k]; } return; }
        const q = robotPose(p, t), n = k => g.getObjectByName(k);
        n('Robot_J1').rotation.y = q.j1; n('Robot_J2').rotation.z = q.j2; n('Robot_J3').rotation.z = q.j3; n('Robot_J4').rotation.z = q.j4;
      },
      // recorded joint deltas (deg) from the authored pose; frames of simPerFrame seconds
      drives: (g, p, frames, simPerFrame) => {
        const crx = isCrx(g), pose = crx ? crxPose : robotPose, q0 = pose(p, 0), deg = 180 / Math.PI;
        const joints = crx ? CRX_JOINTS.map(([, w, k, ax]) => [w, k, ax === 'y' ? 'RotationY' : 'RotationZ'])
          : [['Robot_J1', 'j1', 'RotationY'], ['Robot_J2', 'j2', 'RotationZ'], ['Robot_J3', 'j3', 'RotationZ'], ['Robot_J4', 'j4', 'RotationZ']];
        return joints.map(([n, k, dir]) => {
          const series = new Array(frames);
          for (let f = 0; f < frames; f++) series[f] = Math.round((pose(p, f * simPerFrame)[k] - q0[k]) * deg * 100) / 100;
          return { node: g.getObjectByName(n), dir, rev: true, series };
        });
      },
      footprint: p => [p.reach * 1.6, p.reach * 1.6],
      cycle: p => Math.max(2, p.cycle)
    },
    rack: {
      label: '랙 · 버퍼', group: 'equipment',
      defaults: () => ({ bays: 3, levels: 4, bayWidth: 1.2, depth: 1.0, levelHeight: 1.0, perSlot: 2, fill: 50 }),
      build: (g, p) => {
        const W = p.bays * p.bayWidth, Hh = p.levels * p.levelHeight + 0.2;
        for (let i = 0; i <= p.bays; i++) for (const s of [-1, 1]) box(g, 'Rack_Upright', 0.08, Hh, 0.08, M.rack, -W / 2 + i * p.bayWidth, Hh / 2, s * (p.depth / 2 - 0.04));
        let filled = 0; const total = p.bays * p.levels * p.perSlot, want = Math.round(total * Math.min(100, Math.max(0, p.fill)) / 100);
        for (let l = 0; l < p.levels; l++) {
          const y = 0.15 + l * p.levelHeight;
          for (const s of [-1, 1]) box(g, 'Rack_Beam', W, 0.1, 0.05, M.beam, 0, y, s * (p.depth / 2 - 0.04));
          for (let bI = 0; bI < p.bays; bI++) for (let k = 0; k < p.perSlot; k++) {
            if (filled >= want) continue; filled++;
            const cw = p.bayWidth / p.perSlot - 0.1;
            box(g, 'Rack_Carton', cw, Math.min(0.5, p.levelHeight * 0.55), p.depth * 0.8, M.carton, -W / 2 + bI * p.bayWidth + (k + 0.5) * (p.bayWidth / p.perSlot), y + 0.05 + Math.min(0.5, p.levelHeight * 0.55) / 2, 0);
          }
        }
      },
      footprint: p => [p.bays * p.bayWidth, p.depth]
    },
    amr: {
      label: 'AMR', group: 'equipment',
      defaults: () => ({ model: 'agv', length: 0.9, width: 0.6, speed: 1.2, payload: 300, battery: 100, from: '', to: '', dwell: 5, stops: [] }), // stops: job list [{ at, act, dwell }]
      build: (g, p) => {
        ring(g, 'AMR_Safety', Math.hypot(p.length, p.width) / 2 + 0.5, 0xeec539, 0.5);
        const agv = p.model === 'agv' && window.FactoryAssets && window.FactoryAssets.get('agv');
        if (agv) { // pallet stacker: drive unit front (+Z) turned to the travel direction (+X), forks trail; scaled to the width
          agv.traverse(o => { if (/^Safety_Field/.test(o.name)) o.visible = false; }); // the AMR_Safety ring shows that
          const turn = new THREE.Group(); turn.add(agv); agv.rotation.y = Math.PI / 2;
          const m = FactoryAssets.placed(turn, 'AMR_Model', [Infinity, p.width]); g.add(m);
          const fk = new THREE.Box3();
          for (const n of ['Fork_L', 'Fork_R']) { const f = m.getObjectByName(n); if (f) fk.union(FactoryAssets.bounds(f, g)); }
          if (!fk.isEmpty()) { const c = fk.getCenter(new THREE.Vector3()); box(g, 'AMR_Load', (fk.max.x - fk.min.x) * 0.85, 0.3, p.width * 0.9, M.carton, c.x, fk.max.y + 0.15, c.z); }
          return;
        }
        box(g, 'AMR_Load', p.length * 0.6, 0.22, p.width * 0.7, M.carton, 0, 0.44, 0);
        box(g, 'AMR_Body', p.length, 0.25, p.width, M.amr, 0, 0.16, 0);
        box(g, 'AMR_Top', p.length * 0.92, 0.04, p.width * 0.92, M.black, 0, 0.305, 0);
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cyl(g, 'AMR_Wheel', 0.06, 0.04, M.black, x * p.length * 0.32, 0.06, z * (p.width / 2 + 0.01), 'z');
        cyl(g, 'AMR_Lidar', 0.05, 0.05, M.black, p.length / 2 - 0.08, 0.31, 0);
        box(g, 'AMR_Light', 0.02, 0.04, p.width * 0.8, M.green, p.length / 2 + 0.005, 0.16, 0);
      },
      footprint: p => [p.length, p.width]
    },
    route: {
      label: 'AMR 경로', group: 'route',
      defaults: () => ({ points: [], oneway: false }),
      build: (g, p) => {
        const pts = p.points || [], line = mat(0xd9a92b, { emissive: 0xd9a92b, emissiveIntensity: 0.35 }), node = mat(0xeec539);
        for (let k = 1; k < pts.length; k++) {
          const [x0, z0] = pts[k - 1], [x1, z1] = pts[k], len = Math.hypot(x1 - x0, z1 - z0);
          const seg = box(g, 'Route_Segment', len, 0.006, 0.06, line, (x0 + x1) / 2, 0.009, (z0 + z1) / 2); seg.rotation.y = Math.atan2(-(z1 - z0), x1 - x0); seg.castShadow = false;
          const arr = labelPlane(p.oneway ? '▶' : '◀▶', 0.5, '#eec539', true); // direction arrows stay on the floor
          arr.position.set((x0 + x1) / 2, 0.016, (z0 + z1) / 2); arr.rotation.z = Math.atan2(-(z1 - z0), x1 - x0); g.add(arr);
        }
        pts.forEach(([x, z], k) => { const n = cyl(g, 'Route_Point_' + (k + 1), 0.09, 0.02, node, x, 0.012, z); n.children[0].castShadow = false; });
        if (pts.length) { const s = labelPlane('출발', 0.8, '#eec539'); s.position.set(pts[0][0], 0.02, pts[0][1] + 0.3); g.add(s); }
        if (pts.length > 1) { const e = labelPlane('끝', 0.6, '#eec539'); const q = pts[pts.length - 1]; e.position.set(q[0], 0.02, q[1] + 0.3); g.add(e); }
      },
      footprint: () => [0.5, 0.5]
    },
    walkroute: {
      label: '작업자 경로', group: 'route',
      defaults: () => ({ points: [] }),
      build: (g, p) => {
        const pts = p.points || [], line = mat(0x2bb673, { emissive: 0x2bb673, emissiveIntensity: 0.3 }), node = mat(0x7dffb2);
        for (let k = 1; k < pts.length; k++) {
          const [x0, z0] = pts[k - 1], [x1, z1] = pts[k], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(len / 0.5));
          for (let i = 0; i < n; i++) { // dashed: a pedestrian path, not an AMR lane
            const t0 = (i + 0.15) / n, t1 = (i + 0.85) / n, dl = len * (t1 - t0);
            const seg = box(g, 'WalkRoute_Dash', dl, 0.006, 0.05, line, x0 + (x1 - x0) * (t0 + t1) / 2, 0.009, z0 + (z1 - z0) * (t0 + t1) / 2); seg.rotation.y = Math.atan2(-(z1 - z0), x1 - x0); seg.castShadow = false;
          }
        }
        pts.forEach(([x, z], k) => { const n = cyl(g, 'WalkRoute_Point_' + (k + 1), 0.07, 0.02, node, x, 0.012, z); n.children[0].castShadow = false; });
      },
      footprint: () => [0.5, 0.5]
    },
    worker: {
      label: '작업자', group: 'route',
      defaults: () => ({ walkway: '', speed: 1.2, dwell: 4 }),
      build: g => {
        const vest = mat(0xff7a1a, { roughness: 0.7 }), skin = mat(0xe0b896, { roughness: 0.8 }), pants = mat(0x2b3442, { roughness: 0.8 });
        for (const s of [-1, 1]) box(g, 'Worker_Leg', 0.12, 0.8, 0.14, pants, 0, 0.4, s * 0.1);
        box(g, 'Worker_Body', 0.22, 0.6, 0.4, vest, 0, 1.1, 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), skin); head.name = 'Worker_Head'; head.position.y = 1.55; head.castShadow = true; g.add(head);
        const hat = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2c200)); hat.name = 'Worker_Helmet'; hat.position.y = 1.58; g.add(hat);
        ring(g, 'Worker_Ring', 0.45, 0x2bb673, 0.6);
        const warn = labelPlane('⚠', 0.9, '#ff3b30'); warn.name = 'Worker_Warning'; warn.rotation.x = 0; warn.position.y = 2.0; warn.visible = false; g.add(warn);
      },
      footprint: () => [0.6, 0.6]
    },
    charger: {
      label: '충전소', group: 'equipment',
      defaults: () => ({ width: 0.7 }),
      build: (g, p) => {
        box(g, 'Charger_Body', p.width, 0.9, 0.25, M.amr, 0, 0.45, 0);
        box(g, 'Charger_Screen', p.width * 0.6, 0.18, 0.01, M.green, 0, 0.7, 0.13);
        for (const s of [-1, 1]) box(g, 'Charger_Contact', 0.08, 0.06, 0.12, M.yellow, s * 0.12, 0.12, 0.18);
        box(g, 'Charger_Bay', p.width + 0.4, 0.004, 1.2, mat(0x2bb673, { transparent: true, opacity: 0.25 }), 0, 0.002, 0.8).castShadow = false;
      },
      footprint: p => [p.width + 0.4, 1.5]
    }
  };

  function build(obj, factory, opts = {}) {
    BILLBOARD = !!opts.billboard;
    try { return buildInner(obj, factory); } finally { BILLBOARD = false; }
  }
  function buildInner(obj, factory) {
    const T = TYPES[obj.type], g = new THREE.Group();
    g.name = (obj.name || T.label).replace(/[\/\s]+/g, '_');
    g.position.set(obj.x || 0, obj.y || 0, obj.z || 0); g.rotation.y = obj.rot || 0;
    T.build(g, Object.assign(T.defaults(factory), obj.params || {}), factory);
    if (obj.type === 'zone' || WORK_AREA.includes(obj.type)) permMarks(g, obj);
    return g;
  }
  // work areas show who may enter: hatched = closed, small tags for allowed AMR / pedestrian entry
  const WORK_AREA = ['robot', 'conveyor', 'rack', 'charger'];
  function hatch(w, d, color) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.strokeStyle = color; x.lineWidth = 6; x.globalAlpha = 0.55; for (let i = -64; i < 128; i += 22) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, w / 0.6), Math.max(1, d / 0.6));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.006; m.name = 'Area_Closed'; m.renderOrder = 1; return m;
  }
  function permMarks(g, obj) {
    const amr = !!(obj.perm && obj.perm.amr), walk = !!(obj.perm && obj.perm.walk);
    if (obj.type === 'zone') {
      const p = Object.assign(TYPES.zone.defaults(), obj.params || {});
      if (!amr && !walk) g.add(hatch(p.w, p.d, p.kind === 'keepout' ? '#ff3b30' : '#c9d2dc'));
    }
    const tags = [amr ? 'AMR 진입 허용' : '', walk ? '보행 허용' : ''].filter(Boolean).join(' · ') || (obj.type === 'zone' ? '진입 금지' : '');
    if (!tags) return;
    if (BILLBOARD) return; // console 1: access is shown by the floor hatch and the object's card, not by a floating tag
    const lab = labelPlane(tags, 1.6, amr || walk ? '#7dffb2' : '#ff8a80'); lab.name = 'Area_Access';
    if (lab.isSprite) lab.position.y = obj.type === 'zone' ? 0.95 : 2.4; else { lab.position.z = (Object.assign(TYPES.zone.defaults(), obj.params || {}).d || 2) * -0.3; }
    g.add(lab);
  }

  // floor, perimeter (see-through) walls, corner columns, ceiling outline
  function buildShell(f, { walls = true } = {}) {
    const { width: W, depth: D, height: H } = f, g = new THREE.Group(); g.name = 'Factory';
    box(g, 'Factory_Floor', W, 0.004, D, M.floor, 0, 0.002, 0).castShadow = false;
    [[W, 0.06, 0, -D / 2], [W, 0.06, 0, D / 2], [0.06, D, -W / 2, 0], [0.06, D, W / 2, 0]].forEach(([w, d, x, z], i) => {
      box(g, 'Factory_Edge_' + i, w, 0.02, d, M.yellow, x, 0.01, z).castShadow = false;
      box(g, 'Factory_Ceiling_' + i, Math.max(w, 0.08), 0.08, Math.max(d, 0.08), M.steel, x, H, z);
      if (walls) box(g, 'Factory_Wall_' + i, w, H, d, M.glass, x, H / 2, z).castShadow = false;
    });
    [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([x, z], i) => box(g, 'Factory_Corner_' + i, 0.16, H, 0.16, M.steel, x, H / 2, z));
    return g;
  }

  const animate = (obj, g, t, plan) => { const T = TYPES[obj.type]; if (T.animate) T.animate(g, Object.assign(T.defaults(), obj.params || {}), t, plan); }; // plan: the mover's / zone's motion plan, when the caller has one
  const drives = (obj, g, frames, simPerFrame, plan) => { const T = TYPES[obj.type]; return T.drives ? T.drives(g, Object.assign(T.defaults(), obj.params || {}), frames, simPerFrame, plan) : []; };
  const cycleSeconds = obj => { const T = TYPES[obj.type]; return T && T.cycle ? T.cycle(Object.assign(T.defaults(), obj.params || {})) : 0; };

  // js/factory-machines.js adds more equipment types with these helpers
  const helpers = { M, mat, box, cyl, jog, ring, labelPlane, ease };
  window.FactoryElements = { inView: () => BILLBOARD, TYPES, ZONE_KIND, WORK_AREA, helpers, conveyorPath, animate, drives, cycleSeconds, build, buildShell, defaults: (type, f) => TYPES[type].defaults(f), footprint: (obj, f) => TYPES[obj.type].footprint(Object.assign(TYPES[obj.type].defaults(f), obj.params || {})) };
})();
