// Parametric, real-scale building blocks for the factory builder (console 1) and the factory export, in the clean
// "VEXPLOR" look of the EGR line v3 models (grey-blue anodised aluminium, silver rollers, black mesh, orange-red beams,
// ONE STATION yellow #EEC539 for safety): every size is a parameter and the parts repeat at their real pitch
// (rollers every 0.1 m, legs ≤ 1.5 m apart, rack uprights per bay, fence posts per panel, roof trusses per bay)
// instead of stretching one mesh. Restyles js/factory-elements.js' conveyor, rack, column, wall, door and the
// factory floor, and adds fence, tote (stacks of totes / cartons) and roof (pitched trusses, purlins, skylights).
// Rollers / drums keep their realvirtual jog drives and get a dark stripe, so they visibly turn in both consoles.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const { mat, jog, labelPlane } = FE.helpers, TYPES = FE.TYPES;

  // ---------------------------------------------------------------- textures (canvas) and materials
  const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.encoding = THREE.sRGBEncoding; return t; };
  function ribNormal() { // trapezoid sheet-metal ribs, one period per texture width (normal map)
    return canvasTex(128, 4, (g, W) => { const img = g.createImageData(W, 4), h = u => { const x = ((u % 1) + 1) % 1; return x < 0.15 ? 0 : x < 0.25 ? (x - 0.15) / 0.1 : x < 0.45 ? 1 : x < 0.55 ? 1 - (x - 0.45) / 0.1 : 0; };
      for (let i = 0; i < W; i++) { const d = (h((i + 1) / W) - h((i - 1) / W)) * W / 2 * 0.06, l = Math.hypot(d, 1), nx = -d / l, nz = 1 / l;
        for (let r = 0; r < 4; r++) { const k = (r * W + i) * 4; img.data[k] = (nx * 0.5 + 0.5) * 255; img.data[k + 1] = 128; img.data[k + 2] = (nz * 0.5 + 0.5) * 255; img.data[k + 3] = 255; } }
      g.putImageData(img, 0, 0); }, false);
  }
  const meshTex = () => canvasTex(64, 64, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64); });
  const slotTex = () => canvasTex(16, 64, g => { g.fillStyle = '#e2e5e8'; g.fillRect(0, 0, 16, 64); g.fillStyle = '#23262a'; g.fillRect(5, 8, 6, 20); g.fillRect(5, 40, 6, 20); }); // punched upright face, 0.1 m per tile
  const hazardTex = () => canvasTex(64, 64, g => { g.fillStyle = '#EEC539'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#111'; for (let k = -64; k < 128; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 0); g.lineTo(k + 16 - 64, 64); g.lineTo(k - 64, 64); g.fill(); } });
  const concreteTex = () => canvasTex(512, 512, g => { g.fillStyle = '#c6cacd'; g.fillRect(0, 0, 512, 512); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) { const x = rnd() * 512, y = rnd() * 512, r = 20 + rnd() * 90, v = 186 + rnd() * 26 | 0, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v + 3},${v + 6},0.05)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } });
  const K = {
    alu: mat(0x9aa7b5, { metalness: 0.8, roughness: 0.36 }), aluDark: mat(0x66727f, { metalness: 0.75, roughness: 0.42 }),
    steel: mat(0xd4d8dc, { metalness: 1, roughness: 0.2 }), black: mat(0x1c1e21, { metalness: 0.25, roughness: 0.55 }), rubber: mat(0x111214, { metalness: 0, roughness: 0.85 }),
    belt: mat(0x2b2e33, { metalness: 0, roughness: 0.7 }), orange: mat(0xe0461d, { metalness: 0.25, roughness: 0.42 }), yellow: mat(0xeec539, { metalness: 0.2, roughness: 0.45 }),
    rackWhite: mat(0xe2e5e8, { metalness: 0.3, roughness: 0.45 }), steelCol: mat(0x8a949e, { metalness: 0.6, roughness: 0.45 }), steelLight: mat(0xa8b0b8, { metalness: 0.6, roughness: 0.45 }),
    frameDark: mat(0x3b4148, { metalness: 0.5, roughness: 0.45 }), concrete: mat(0xa9adb1, { metalness: 0, roughness: 0.85 }),
    window: mat(0xcfe2f0, { metalness: 0.1, roughness: 0.05, emissive: 0xdde9f4, emissiveIntensity: 0.25, transparent: true, opacity: 0.3, depthWrite: false }), // lets the sun through (no shadow)
    skylight: mat(0xe8f1f8, { metalness: 0, roughness: 0.2, emissive: 0xe8f1f8, emissiveIntensity: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    lamp: mat(0xffffff, { metalness: 0, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 2 }),
    wallCore: mat(0xd5d9dd, { metalness: 0.35, roughness: 0.5 }), tape: mat(0xd9c39a, { roughness: 0.6 }),
    esd: mat(0x5f7d74, { metalness: 0.05, roughness: 0.7 }), binBlue: mat(0x2f6fb5, { metalness: 0, roughness: 0.55 }), sheet: mat(0xb4bac1, { metalness: 0.15, roughness: 0.55 }),
    screen: mat(0x0f1726, { metalness: 0.1, roughness: 0.25, emissive: 0x1a2a46, emissiveIntensity: 1 }),
    tote: mat(0x8fa39c, { metalness: 0, roughness: 0.55 }), carton: mat(0xc49a63, { metalness: 0, roughness: 0.9 }), wood: mat(0xb88a55, { metalness: 0, roughness: 0.85 })
  };
  K.clad = mat(0xd9dde1, { metalness: 0.35, roughness: 0.42, normalMap: ribNormal() }); K.roof = mat(0xc9ced3, { metalness: 0.3, roughness: 0.5, normalMap: ribNormal(), side: THREE.DoubleSide });
  K.door = mat(0xc4c9ce, { metalness: 0.4, roughness: 0.4, normalMap: ribNormal() });
  K.mesh = mat(0x1a1c1f, { metalness: 0.4, roughness: 0.55, map: meshTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  K.upright = mat(0xffffff, { metalness: 0.3, roughness: 0.45, map: slotTex() }); K.hazard = mat(0xffffff, { metalness: 0.2, roughness: 0.5, map: hazardTex() });
  K.floor = mat(0xffffff, { metalness: 0, roughness: 0.32, map: concreteTex() });
  // the hex colours above are sRGB (as in the GLB models); console 1 runs three r147 in legacy colour mode, so convert to linear
  for (const m of Object.values(K)) { m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); }

  // ---------------------------------------------------------------- geometry helpers (meshes named for the export; uv in metres where tiled)
  // shared geometries (same size → same BufferGeometry), so repeated rollers, legs, uprights, totes are stored once in the export
  const GEO = new Map(), keyed = (k, make) => { if (!GEO.has(k)) GEO.set(k, make()); return GEO.get(k); };
  const boxGeo = (w, h, d) => keyed(`b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
  const cylGeo = (r1, r2, h, s) => keyed(`c${r1.toFixed(3)},${r2.toFixed(3)},${h.toFixed(3)},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
  const add = (g, n, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.name = n; o.position.set(x, y, z); o.castShadow = o.receiveShadow = !m.transparent; g.add(o); return o; };
  const box = (g, n, w, h, d, m, x, y, z) => add(g, n, boxGeo(w, h, d), m, x, y, z);
  const tiled = (geo, su, sv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; };
  const plane = (g, n, w, h, m, x, y, z, cell, ry = 0, rx = 0) => { const o = add(g, n, tiled(new THREE.PlaneGeometry(w, h), cell ? w / cell : 1, cell ? h / cell : 1), m, x, y, z); o.rotation.set(rx, ry, 0); return o; };
  const PROF = new Map();
  function profGeo(s) { // T-slot aluminium profile, s × s, 1 m long along Z (centred)
    if (PROF.has(s)) return PROF.get(s);
    const h = s / 2, w = s * 0.11, d = s * 0.18, pts = [];
    const side = (ax, ay, bx, by, nx, ny) => { const mx = (ax + bx) / 2, my = (ay + by) / 2, tx = (bx - ax) / s, ty = (by - ay) / s;
      pts.push([ax, ay], [mx - tx * w, my - ty * w], [mx - tx * w + nx * d, my - ty * w + ny * d], [mx + tx * w + nx * d, my + ty * w + ny * d], [mx + tx * w, my + ty * w]); };
    side(-h, -h, h, -h, 0, 1); side(h, -h, h, h, -1, 0); side(h, h, -h, h, 0, -1); side(-h, h, -h, -h, 1, 0);
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 1, bevelEnabled: false }); geo.translate(0, 0, -0.5);
    PROF.set(s, geo); return geo;
  }
  function prof(g, n, a, b, s = 0.045, m = K.alu) { // aluminium profile from point a to point b
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B), o = new THREE.Mesh(profGeo(s), m);
    o.name = n; o.scale.z = L; o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize()); o.castShadow = o.receiveShadow = true; g.add(o); return o;
  }
  const foot = (g, x, y, z) => { add(g, 'Foot', cylGeo(0.04, 0.04, 0.012, 16), K.rubber, x, y + 0.006, z); add(g, 'Foot_Stem', cylGeo(0.009, 0.009, 0.05, 8), K.steel, x, y + 0.035, z); };
  // a roller / drum: the holder (named for animate + jog drive) spins about local Z; a dark stripe shows the turning
  function roller(parent, name, r, len, x, y, z, yaw, degPerSec) {
    const h = new THREE.Group(); h.name = name; h.position.set(x, y, z); h.rotation.y = yaw; parent.add(h);
    const c = add(h, name + '_mesh', cylGeo(r, r, len, 18), K.steel); c.rotation.x = Math.PI / 2;
    add(h, name + '_Mark', new THREE.BoxGeometry(0.012, 0.004, len * 0.9), K.black, 0, r, 0);
    add(h, name + '_Axle', cylGeo(0.008, 0.008, len + 0.03, 6), K.aluDark).rotation.x = Math.PI / 2;
    jog(h, 'RotationZ', true, degPerSec); return h;
  }

  // ---------------------------------------------------------------- conveyor (roller / belt; straight, 90° curve, U-turn)
  const conv = TYPES.conveyor, convDefaults = conv.defaults;
  conv.defaults = () => Object.assign(convDefaults(), { height: 0.85, width: 0.6, length: 4 });
  conv.build = (g, p) => {
    const P = FE.conveyorPath(p), W = p.width, H = p.height, r = 0.035, pitch = 0.1;
    const degPerSec = (p.speed / r) * 180 / Math.PI * (p.dir < 0 ? -1 : 1);
    const along = (rr, s) => { if (P.shape === 'straight') return [-P.len / 2 + s, rr]; const t = s / P.R, R = P.R + rr; return [P.cx + R * Math.sin(t), P.m * (P.cz + R * Math.cos(t))]; }; // centre-line distance s, lateral offset rr
    const yawAt = s => (P.shape === 'straight' ? 0 : P.m * s / P.R);
    // side channels (short straight pieces on curves) with a dark top lip, and the stopper slots
    for (const side of [-1, 1]) {
      const rr = side * (W / 2 + 0.0175), n = P.shape === 'straight' ? 1 : Math.max(6, Math.ceil(P.A * (P.R + rr) / 0.15));
      for (let i = 0; i < n; i++) {
        const s0 = i / n * P.len, s1 = (i + 1) / n * P.len, [x0, z0] = along(rr, s0), [x1, z1] = along(rr, s1), L = Math.hypot(x1 - x0, z1 - z0) + 0.004, yaw = -Math.atan2(z1 - z0, x1 - x0);
        box(g, 'Conveyor_Side', L, 0.12, 0.035, K.alu, (x0 + x1) / 2, H - 0.03, (z0 + z1) / 2).rotation.y = yaw;
        box(g, 'Conveyor_Lip', L, 0.008, 0.045, K.aluDark, (x0 + x1) / 2, H + 0.034, (z0 + z1) / 2).rotation.y = yaw;
      }
    }
    // legs: a pair at both ends and at most 1.5 m apart, with a cross brace and levelling feet
    const nLeg = Math.max(2, Math.ceil(P.len / 1.5) + 1);
    for (let i = 0; i < nLeg; i++) {
      const s = Math.min(P.len - 0.06, Math.max(0.06, i * P.len / (nLeg - 1))), yaw = yawAt(s), pts = [-1, 1].map(side => along(side * (W / 2 - 0.02), s));
      for (const [x, z] of pts) { prof(g, 'Conveyor_Leg', [x, 0.06, z], [x, H - 0.09, z], 0.04); foot(g, x, 0, z); }
      prof(g, 'Conveyor_Brace', [pts[0][0], 0.25, pts[0][1]], [pts[1][0], 0.25, pts[1][1]], 0.04);
      if (P.shape === 'straight' && i < nLeg - 1) for (const side of [-1, 1]) { const [x0, z0] = along(side * (W / 2 - 0.02), s), [x1] = along(0, Math.min(P.len - 0.06, (i + 1) * P.len / (nLeg - 1))); prof(g, 'Conveyor_Rail', [x0, 0.25, z0], [x1, 0.25, z0], 0.03, K.aluDark); }
      void yaw;
    }
    if (p.kind === 'belt') {
      if (P.shape === 'straight') { box(g, 'Conveyor_Belt', P.len - 2 * r, 0.006, W - 0.02, K.belt, 0, H + r - 0.003, 0); box(g, 'Conveyor_Belt_Return', P.len - 2 * r, 0.006, W - 0.02, K.belt, 0, H - r + 0.003, 0); box(g, 'Conveyor_Bed', P.len - 2 * r, 0.01, W - 0.04, K.aluDark, 0, H + r - 0.012, 0); }
      else { const belt = new THREE.Mesh(new THREE.RingGeometry(P.R - (W - 0.02) / 2, P.R + (W - 0.02) / 2, 48, 1, P.m > 0 ? -Math.PI / 2 : Math.PI / 2 - P.A, P.A), K.belt); belt.name = 'Conveyor_Belt'; belt.rotation.x = -Math.PI / 2; belt.position.set(P.cx, H + r, P.m * P.cz); belt.receiveShadow = true; g.add(belt); }
      for (const s of [r, P.len - r]) { const [x, z] = along(0, s); roller(g, 'Conveyor_Drum', r, W - 0.02, x, H, z, yawAt(s), -degPerSec); }
      const [hx, hz] = along(-(W / 2 + 0.06), P.len - r), dv = new THREE.Group(); dv.name = 'Conveyor_Drive'; dv.position.set(hx, H, hz); dv.rotation.y = yawAt(P.len - r); g.add(dv); // gear motor on the head drum
      box(dv, 'Drive_Gear', 0.14, 0.14, 0.1, K.black, 0, 0, -0.03); add(dv, 'Drive_Motor', cylGeo(0.06, 0.06, 0.2, 20), K.black, 0, -0.02, -0.18).rotation.x = Math.PI / 2;
    } else {
      const n = Math.max(2, Math.min(240, Math.round(P.len / pitch)));
      for (let i = 0; i < n; i++) { const s = (i + 0.5) * P.len / n, [x, z] = along(0, s); roller(g, 'Conveyor_Roller', r, W - 0.01, x, H, z, yawAt(s), -degPerSec); }
      if (P.len > 1.5) { const [x, z] = along(0, P.len / 2); const dv = box(g, 'Conveyor_Drive', 0.3, 0.12, 0.16, K.black, x, H - 0.2, z); dv.rotation.y = yawAt(P.len / 2); }
    }
    // flat arrows along the travel direction (console 1 hint), source / sink labels
    const nA = Math.max(1, Math.round(P.len / 1.2));
    for (let i = 0; i < nA; i++) { const [x, z, yaw] = P.at((i + 0.5) * P.len / nA), a = new THREE.Group(); a.name = 'Conveyor_Arrow'; a.position.set(x, H + r + 0.006, z); a.rotation.y = yaw; a.add(labelPlane('▶', 0.3, 'rgba(238,197,57,.65)', true)); g.add(a); }
    for (const [on, s, text, color] of [[p.source, 0, '투입', '#7cc4ff'], [p.sink, P.len, '배출', '#ffb37c']]) {
      if (!on) continue; const [x, z] = P.at(s), lab = labelPlane(text, 0.6, color, true); lab.name = 'Conveyor_' + (s ? 'Sink' : 'Source'); lab.userData.floorLabel = true; lab.position.set(x, H + r + 0.012, z); g.add(lab); // painted on the belt end
    }
  };

  // ---------------------------------------------------------------- selective rack (bays × levels; white punched uprights, orange beams, wire decks, loads)
  const rack = TYPES.rack;
  rack.defaults = () => ({ bays: 2, levels: 4, bayWidth: 2.7, depth: 1.1, levelHeight: 1.5, perSlot: 3, fill: 60, load: 'tote' });
  rack.build = (g, p) => {
    const W = p.bays * p.bayWidth, D = p.depth, Hh = 0.15 + p.levels * p.levelHeight + 0.3, u = 0.09;
    for (let i = 0; i <= p.bays; i++) {
      const x = -W / 2 + i * p.bayWidth;
      for (const s of [-1, 1]) {
        add(g, 'Rack_Upright', keyed('up' + Hh.toFixed(3), () => tiled(new THREE.BoxGeometry(u, Hh, 0.07), 1, Hh / 0.1)), K.upright, x, Hh / 2, s * (D / 2 - 0.035)); // punched-slot texture tiles every 0.1 m
        box(g, 'Rack_Baseplate', 0.16, 0.008, 0.12, K.aluDark, x, 0.004, s * (D / 2 - 0.035));
      }
      for (let y = 0.3, k = 0; y < Hh - 0.6; y += 0.9, k++) { // frame bracing between the front and back upright
        box(g, 'Rack_Brace_H', 0.03, 0.03, D - 0.14, K.rackWhite, x, y, 0);
        const z0 = (k % 2 ? -1 : 1) * (D / 2 - 0.07), len = Math.hypot(0.9, 2 * z0), b = box(g, 'Rack_Brace_D', 0.025, len, 0.025, K.rackWhite, x, y + 0.45, 0); b.rotation.x = Math.atan2(-2 * z0, 0.9);
      }
    }
    const total = p.bays * p.levels * p.perSlot, want = Math.round(total * Math.min(100, Math.max(0, p.fill)) / 100); let filled = 0;
    for (let l = 0; l < p.levels; l++) {
      const y = 0.15 + l * p.levelHeight;
      for (const s of [-1, 1]) box(g, 'Rack_Beam', W - u, 0.12, 0.05, K.orange, 0, y, s * (D / 2 - 0.04));
      plane(g, 'Rack_Deck', W - u, D - 0.1, K.mesh, 0, y + 0.061, 0, 0.05, 0, -Math.PI / 2);
      for (let bI = 0; bI < p.bays; bI++) for (let k = 0; k < p.perSlot; k++) {
        if (filled >= want || p.load === 'none') continue; filled++;
        const cw = p.bayWidth / p.perSlot, x = -W / 2 + bI * p.bayWidth + (k + 0.5) * cw, lh = Math.min(p.levelHeight - 0.25, p.load === 'carton' ? 0.9 : 0.6);
        if (p.load === 'carton') { box(g, 'Rack_Pallet', Math.min(cw - 0.1, 1.2), 0.14, Math.min(D - 0.1, 1.0), K.wood, x, y + 0.13, 0); box(g, 'Rack_Carton', Math.min(cw - 0.14, 1.15), lh - 0.14, Math.min(D - 0.14, 0.95), K.carton, x, y + 0.2 + (lh - 0.14) / 2, 0); }
        else for (let t = 0; t < Math.max(1, Math.floor((lh + 0.02) / 0.3)); t++) totePart(g, 'Rack_Tote', Math.min(cw - 0.08, 0.6), 0.28, Math.min(D - 0.1, 0.4), x, y + 0.061 + t * 0.29, 0, K.tote);
      }
    }
  };
  rack.footprint = p => [p.bays * p.bayWidth, p.depth];

  // ---------------------------------------------------------------- tote / carton stack (on the floor, a conveyor, a rack or an AMR deck)
  function totePart(g, n, L, H, Wd, x, y, z, m) { // open stacking tote, base at y
    const t = 0.008; box(g, n + '_Floor', L - 0.02, t, Wd - 0.02, m, x, y + 0.012, z);
    for (const s of [-1, 1]) { box(g, n + '_Side', L, H - 0.02, t, m, x, y + H / 2 + 0.01, z + s * (Wd / 2 - t / 2)); box(g, n + '_End', t, H - 0.02, Wd, m, x + s * (L / 2 - t / 2), y + H / 2 + 0.01, z); box(g, n + '_Rim', L + 0.012, 0.025, 0.014, m, x, y + H - 0.012, z + s * Wd / 2); }
  }
  TYPES.tote = {
    label: '부품 상자', group: 'equipment',
    defaults: () => ({ kind: 'tote', length: 0.6, width: 0.4, height: 0.28, stack: 1 }),
    build: (g, p) => {
      for (let k = 0; k < Math.max(1, p.stack); k++) {
        const y = k * (p.height + 0.004);
        if (p.kind === 'carton') { box(g, 'Carton', p.length, p.height, p.width, K.carton, 0, y + p.height / 2, 0); box(g, 'Carton_Tape', p.length + 0.002, 0.004, 0.05, K.tape, 0, y + p.height + 0.001, 0); }
        else totePart(g, 'Tote', p.length, p.height, p.width, 0, y, 0, K.tote);
      }
    },
    footprint: p => [p.length, p.width]
  };

  // ---------------------------------------------------------------- manual workstation (assembly / leak test / inspection): profile table, ESD top,
  // light bar, parts bins on a rail, a monitor; kind adds the leak tester box or the packing scale
  TYPES.bench = {
    label: '작업대', group: 'equipment',
    defaults: () => ({ kind: 'assembly', length: 1.6, depth: 0.8, height: 0.9 }),
    build: (g, p) => {
      const L = p.length, D = p.depth, H = p.height, X = L / 2 - 0.0225, Z = D / 2 - 0.0225;
      for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z]]) { prof(g, 'Bench_Leg', [x, 0.06, z], [x, H - 0.03, z]); foot(g, x, 0, z); }
      for (const z of [-Z, Z]) prof(g, 'Bench_Rail', [-X, 0.2, z], [X, 0.2, z]);
      box(g, 'Bench_Top', L, 0.03, D, K.esd, 0, H - 0.015, 0); box(g, 'Bench_Shelf', L - 0.05, 0.02, D - 0.05, K.aluDark, 0, 0.22, 0);
      for (const x of [-X, X]) prof(g, 'Bench_Upright', [x, H, -Z], [x, H + 1.1, -Z]);
      prof(g, 'Bench_Top_Rail', [-X, H + 1.1, -Z], [X, H + 1.1, -Z]); box(g, 'Bench_Light', L - 0.1, 0.03, 0.08, K.lamp, 0, H + 1.07, -Z + 0.04);
      prof(g, 'Bench_Bin_Rail', [-X, H + 0.55, -Z], [X, H + 0.55, -Z], 0.03);
      const nb = Math.max(2, Math.floor(L / 0.22)); for (let i = 0; i < nb; i++) box(g, 'Bench_Bin', 0.16, 0.1, 0.18, i % 2 ? K.binBlue : K.orange, -L / 2 + (i + 0.5) * L / nb, H + 0.5, -Z + 0.1);
      box(g, 'Bench_Monitor', 0.4, 0.26, 0.03, K.black, L / 2 - 0.35, H + 0.38, -Z + 0.12); box(g, 'Bench_Screen', 0.36, 0.22, 0.002, K.screen, L / 2 - 0.35, H + 0.38, -Z + 0.136);
      if (p.kind === 'leak') { box(g, 'Leak_Tester', 0.5, 0.35, 0.4, K.sheet, -L / 4, H + 0.175, 0); box(g, 'Leak_Display', 0.2, 0.08, 0.002, K.screen, -L / 4, H + 0.25, 0.201); add(g, 'Leak_Gauge', cylGeo(0.05, 0.05, 0.03, 20), K.steel, -L / 4 + 0.15, H + 0.25, 0.21).rotation.x = Math.PI / 2; }
      if (p.kind === 'pack') { box(g, 'Pack_Scale', 0.35, 0.05, 0.35, K.sheet, -L / 4, H + 0.025, 0); box(g, 'Pack_Box', 0.45, 0.25, 0.3, K.carton, L / 6, H + 0.125, 0.1); }
      if (p.kind === 'assembly') { box(g, 'Asm_Fixture', 0.45, 0.06, 0.25, K.aluDark, 0, H + 0.03, 0.05); box(g, 'Asm_Part', 0.4, 0.09, 0.11, K.steel, 0, H + 0.105, 0.05); }
    },
    footprint: p => [p.length, p.depth]
  };

  // ---------------------------------------------------------------- safety fence (black mesh panels, posts every panel)
  TYPES.fence = {
    label: '안전 펜스', group: 'building',
    defaults: () => ({ length: 4, height: 2.0, panel: 1.0 }),
    build: (g, p) => {
      const n = Math.max(1, Math.round(p.length / p.panel)), pw = p.length / n;
      for (let i = 0; i <= n; i++) { const x = -p.length / 2 + i * pw; box(g, 'Fence_Post', 0.06, p.height, 0.06, K.black, x, p.height / 2, 0); box(g, 'Fence_Foot', 0.14, 0.008, 0.14, K.black, x, 0.004, 0); }
      for (let i = 0; i < n; i++) {
        const x = -p.length / 2 + (i + 0.5) * pw, w = pw - 0.07, y0 = 0.1, y1 = p.height - 0.02;
        for (const y of [y0, y1]) box(g, 'Fence_Frame', w, 0.02, 0.02, K.black, x, y, 0);
        for (const s of [-1, 1]) box(g, 'Fence_Frame', 0.02, y1 - y0, 0.02, K.black, x + s * w / 2, (y0 + y1) / 2, 0);
        plane(g, 'Fence_Mesh', w - 0.02, y1 - y0 - 0.02, K.mesh, x, (y0 + y1) / 2, 0, 0.05);
      }
    },
    footprint: p => [p.length, 0.14]
  };

  // ---------------------------------------------------------------- building: column (H section), wall (cladding + window band), door (sectional), roof, floor
  TYPES.column.defaults = () => ({ w: 0.3, d: 0.4, h: 0 });
  TYPES.column.build = (g, p, f) => {
    const H = p.h || f.height, b = p.w, d = p.d, tf = 0.019, tw = 0.011;
    for (const s of [-1, 1]) box(g, 'Column_Flange', b, H, tf, K.steelCol, 0, H / 2, s * (d / 2 - tf / 2));
    box(g, 'Column_Web', tw, H, d - 2 * tf, K.steelCol, 0, H / 2, 0);
    box(g, 'Column_Base', b + 0.2, 0.03, d + 0.2, K.steelCol, 0, 0.015, 0);
    box(g, 'Column_Guard', b + 0.004, 1.2, d + 0.004, K.yellow, 0, 0.6, 0); box(g, 'Column_Guard_Stripe', b + 0.006, 0.2, d + 0.006, K.hazard, 0, 1.3, 0);
  };
  TYPES.wall.defaults = () => ({ length: 6, thickness: 0.2, h: 0, windows: true });
  TYPES.wall.build = (g, p, f) => {
    const H = p.h || f.height, L = p.length, t = Math.max(0.08, p.thickness), wy0 = Math.min(H - 1, 4.4), wy1 = Math.min(H - 0.3, wy0 + 1.4);
    box(g, 'Wall_Plinth', L, Math.min(1.2, H), t + 0.06, K.concrete, 0, Math.min(1.2, H) / 2, 0);
    const bands = p.windows && H > 3 ? [[1.2, wy0], [wy1, H]] : [[1.2, H]];
    for (const [y0, y1] of bands) { if (y1 - y0 < 0.05) continue; box(g, 'Wall_Core', L, y1 - y0, t, K.wallCore, 0, (y0 + y1) / 2, 0);
      for (const s of [-1, 1]) plane(g, 'Wall_Cladding', L, y1 - y0, K.clad, 0, (y0 + y1) / 2, s * (t / 2 + 0.001), 0.25, s > 0 ? 0 : Math.PI); }
    if (p.windows && H > 3) {
      for (const y of [wy0, wy1]) box(g, 'Wall_Window_Frame', L, 0.08, t + 0.02, K.frameDark, 0, y, 0);
      for (let x = -L / 2; x <= L / 2 + 1e-6; x += L / Math.max(1, Math.round(L))) box(g, 'Wall_Mullion', 0.06, wy1 - wy0, t, K.frameDark, x, (wy0 + wy1) / 2, 0);
      box(g, 'Wall_Window', L, wy1 - wy0 - 0.08, 0.012, K.window, 0, (wy0 + wy1) / 2, 0);
    }
    for (const s of [-1, 1]) box(g, 'Wall_Stripe', L, 0.06, 0.01, K.yellow, 0, 1.25, s * (t / 2 + 0.006));
  };
  TYPES.door.defaults = () => ({ width: 4, height: 4.5, thickness: 0.2 });
  TYPES.door.build = (g, p) => {
    const W = p.width, H = p.height, t = p.thickness, leaf = new THREE.Group(); leaf.name = 'Door_Leaf'; g.add(leaf);
    const n = Math.max(2, Math.round(H / 0.5));
    for (let k = 0; k < n; k++) { const y = (k + 0.5) * H / n; plane(leaf, 'Door_Panel', W, H / n - 0.01, n > 4 && k === n - 3 ? K.window : K.door, 0, y, t / 2 + 0.002, 0.25); box(leaf, 'Door_Joint', W, 0.015, 0.02, K.frameDark, 0, k * H / n, t / 2); }
    box(leaf, 'Door_Back', W, H, 0.03, K.steelLight, 0, H / 2, 0);
    for (const s of [-1, 1]) box(g, 'Door_Jamb', 0.18, H + 0.2, t + 0.04, K.hazard, s * (W / 2 + 0.09), (H + 0.2) / 2, 0);
    box(g, 'Door_Housing', W + 0.36, 0.4, t + 0.3, K.black, 0, H + 0.4, 0.1);
    box(g, 'Door_Sill', W, 0.01, t + 0.6, K.yellow, 0, 0.005, 0);
  };
  TYPES.door.footprint = p => [p.width + 0.36, p.thickness + 0.6];
  TYPES.roof = {
    label: '지붕 트러스', group: 'building',
    // a portal-frame roof: one I-section rafter pair per bay line resting on the column tops (columns on the same 6 m grid),
    // eave beams along both edges and a ridge beam tie the frames together, knee braces at the eaves, light purlins every
    // ~3 m, skylight strips and LED high-bays. length along X, span along Z, eave height h (0 = factory height);
    // sheet: roof sheets (the builder hides them while the camera is above the roof)
    defaults: () => ({ length: 24, span: 24, h: 0, bay: 6, rise: 1.2, sheet: true }),
    build: (g, p, f) => {
      const Y = p.h || f.height, S = p.span, L = p.length, nb = Math.max(1, Math.round(L / p.bay)), bay = L / nb, rise = p.rise, RH = 0.4;
      const top = z => Y + RH / 2 + rise * (1 - Math.abs(z) / (S / 2));
      const member = (n, a, b, w, h, m = K.steelCol) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = add(g, n, boxGeo(w, h, A.distanceTo(B)), m); o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize()); return o; };
      for (let i = 0; i <= nb; i++) {
        const x = -L / 2 + i * bay;
        for (const s of [-1, 1]) {
          member('Roof_Rafter', [x, top(s * S / 2), s * S / 2], [x, top(0), 0], 0.18, RH);              // I-section rafter (web drawn as one solid)
          box(g, 'Roof_Haunch', 0.2, 0.5, 0.6, K.steelCol, x, Y + 0.05, s * (S / 2 - 0.3));               // haunch on the column top
          member('Roof_Knee_Brace', [x, Y - 1.4, s * (S / 2 - 0.05)], [x, top(s * (S / 2 - 1.6)) - RH / 2, s * (S / 2 - 1.6)], 0.08, 0.08);
        }
      }
      for (const s of [-1, 1]) member('Roof_Eave_Beam', [-L / 2, Y + 0.05, s * (S / 2 - 0.1)], [L / 2, Y + 0.05, s * (S / 2 - 0.1)], 0.18, 0.3);   // ties the column tops
      member('Roof_Ridge_Beam', [-L / 2, top(0) + 0.05, 0], [L / 2, top(0) + 0.05, 0], 0.16, 0.26);
      const np = Math.max(2, Math.round(S / 2 / 3));                                                       // purlins ~3 m apart each side
      for (const s of [-1, 1]) for (let k = 1; k < np; k++) { const z = s * k * S / 2 / np; member('Roof_Purlin', [-L / 2, top(z) + RH / 2 + 0.05, z], [L / 2, top(z) + RH / 2 + 0.05, z], 0.06, 0.12, K.steelLight); }
      const a = Math.atan2(rise, S / 2), len = Math.hypot(rise, S / 2);
      for (const s of [-1, 1]) for (const [f0, f1, sky] of [[0, 0.42, false], [0.42, 0.58, true], [0.58, 1, false]]) {
        const u = (f0 + f1) / 2, l = (f1 - f0) * len, o = plane(g, sky ? 'Roof_Skylight' : 'Roof_Sheet', L, l, sky ? K.skylight : K.roof, 0, top(0) - u * rise + RH / 2 + 0.14, s * u * S / 2, sky ? 0 : 0.3, 0, 0);
        o.rotation.set(-Math.PI / 2 + s * a, 0, 0); o.visible = sky || p.sheet;
      }
      for (let i = 0; i < nb; i++) for (const z of [-S / 4, S / 4]) { const x = -L / 2 + (i + 0.5) * bay; add(g, 'Roof_Lamp', cylGeo(0.18, 0.25, 0.12, 24), K.frameDark, x, Y - 0.4, z); add(g, 'Roof_Lamp_LED', cylGeo(0.22, 0.22, 0.01, 24), K.lamp, x, Y - 0.465, z); add(g, 'Roof_Lamp_Cable', cylGeo(0.006, 0.006, top(z) - Y - 0.3, 4), K.black, x, (top(z) + Y) / 2 - 0.15, z); }
    },
    footprint: p => [p.length, p.span]
  };
  // the factory floor: polished concrete (texture tiles every 6 m) instead of the flat dark slab
  const shell = FE.buildShell;
  FE.buildShell = (f, opts) => {
    const g = shell(f, opts), fl = g.getObjectByName('Factory_Floor');
    if (fl) { fl.material = K.floor; const uv = fl.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * f.width / 6, uv.getY(i) * f.depth / 6); fl.receiveShadow = true; }
    return g;
  };
  window.FactoryKit = { K, totePart, roller };
})();
