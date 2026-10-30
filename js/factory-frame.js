// Machine-building parts for ONE BUILDER (console 1): T-slot aluminium profiles cut to any length (5 mm steps), plates and
// guard panels, levelling feet and castors, and a ready frame set (W × D × H) that is placed as separate parts.
// Every part is a box in the factory's metre frame ({ x, y, z, rot } + params). Moving a part near another snaps it face to
// face (a profile end onto a side face, a plate onto the top of a frame) and lines its edges or centre up with the part it
// touches; profile ends that meet a side face get corner brackets (params.ends, refreshed by the builder after each change).
// Parts that touch form an assembly (components()), which the builder can move, copy and delete as one.
// Rule set v2.0 exception (rules/smart-factory-standard-v2.md, GLB over primitives): a profile's length and a plate's size are
// parameters, so they are procedural geometry, not GLB. The profile is an extruded real T-slot section (slots, bores, chamfered
// corners) with anodised MeshStandardMaterial; the export bakes it into the GLB like every other part.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const { mat } = FE.helpers, TYPES = FE.TYPES, V3 = THREE.Vector3;
  const lin = m => { m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); return m; }; // sRGB hex → three r147 legacy (linear) colour
  const K = {
    clear: lin(mat(0xc3cad1, { metalness: 0.7, roughness: 0.3 })), black: lin(mat(0x2a2d31, { metalness: 0.55, roughness: 0.36 })),
    bracket: lin(mat(0x8e979f, { metalness: 0.65, roughness: 0.35 })), plate: lin(mat(0xb9c0c7, { metalness: 0.6, roughness: 0.34 })),
    guard: lin(mat(0xdfe9f0, { metalness: 0, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false })),
    diecast: lin(mat(0x3a3f45, { metalness: 0.55, roughness: 0.4 })), hole: lin(mat(0x15171a, { metalness: 0.3, roughness: 0.6 })),
    steel: lin(mat(0xd4d8dc, { metalness: 0.8, roughness: 0.25 })), rubber: lin(mat(0x141518, { metalness: 0, roughness: 0.85 }))
  };
  // section: sy = height of a lying profile (Y), sz = its width (Z); m = slot module (one slot per m of face)
  // common metric series (20 / 30 / 40 / 45 mm modules, slot opening 6 / 8 / 8 / 10 mm); key = height × width of a lying profile
  const SECTIONS = {
    '2020': { sy: 0.02, sz: 0.02, m: 0.02, label: '20×20' }, '2040': { sy: 0.04, sz: 0.02, m: 0.02, label: '20×40' },
    '3030': { sy: 0.03, sz: 0.03, m: 0.03, label: '30×30' }, '3060': { sy: 0.06, sz: 0.03, m: 0.03, label: '30×60' },
    '4040': { sy: 0.04, sz: 0.04, m: 0.04, label: '40×40' }, '8040': { sy: 0.08, sz: 0.04, m: 0.04, label: '40×80' }, '8080': { sy: 0.08, sz: 0.08, m: 0.04, label: '80×80' },
    '4545': { sy: 0.045, sz: 0.045, m: 0.045, label: '45×45' }, '9045': { sy: 0.09, sz: 0.045, m: 0.045, label: '45×90' }, '9090': { sy: 0.09, sz: 0.09, m: 0.045, label: '90×90' }
  };
  const SLOT = { 0.02: 0.006, 0.03: 0.008, 0.04: 0.008, 0.045: 0.01 };
  // joints between profiles: kind per end (params.joint[i]); sizes follow the profile's series, a bracket's leg can be set (params.leg, m)
  const JOINTS = { bracket: '코너 브래킷 (L)', gusset: '거셋 브래킷 (대형)', anchor: '앵커 체결 (숨김)', cube: '큐브 코너 커넥터', plate: '조인트 플레이트 (L · T)' };
  const SEC = p => SECTIONS[p.section] || SECTIONS['4545'];
  const footH = p => (p.kind === 'caster' ? 0.125 : p.h || 0.08);

  // ---------------------------------------------------------------- geometry
  const GEO = new Map(), keyed = (k, make) => { if (!GEO.has(k)) GEO.set(k, make()); return GEO.get(k); };
  // T-slot section (sz wide, sy high) with one slot per module on every face, chamfered corners and a bore per module;
  // extruded 1 m along +X from x = 0 (the mesh is scaled to the cut length)
  function sectionGeo(key) {
    return keyed('prof' + key, () => {
      const S = SECTIONS[key], W = S.sz, H = S.sy, m = S.m, ch = m * 0.05, ow = SLOT[m] || m * 0.2, iw = Math.max(m * 0.44, ow * 1.8), lip = m * 0.06, dep = m * 0.21, pts = [];
      const side = (ax, ay, bx, by) => {
        const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len, nx = -ty, ny = tx, P = (s, d) => pts.push(new THREE.Vector2(ax + tx * s + nx * d, ay + ty * s + ny * d));
        const n = Math.max(1, Math.round(len / m));
        P(ch, 0);
        for (let i = 0; i < n; i++) { const c = len * (i + 0.5) / n; P(c - ow / 2, 0); P(c - ow / 2, lip); P(c - iw / 2, lip); P(c - iw * 0.3, dep); P(c + iw * 0.3, dep); P(c + iw / 2, lip); P(c + ow / 2, lip); P(c + ow / 2, 0); }
        P(len - ch, 0);
      };
      side(-W / 2, -H / 2, W / 2, -H / 2); side(W / 2, -H / 2, W / 2, H / 2); side(W / 2, H / 2, -W / 2, H / 2); side(-W / 2, H / 2, -W / 2, -H / 2);
      const shape = new THREE.Shape(pts), nz = Math.max(1, Math.round(W / m)), ny = Math.max(1, Math.round(H / m));
      for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) { const h = new THREE.Path(); h.absarc(-W / 2 + W * (i + 0.5) / nz, -H / 2 + H * (j + 0.5) / ny, m * 0.1, 0, Math.PI * 2, true); shape.holes.push(h); }
      const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 6 });
      g.rotateY(Math.PI / 2); // extrusion (z 0..1) → +X 0..1; the section's width lies along Z, its height along Y
      g.computeVertexNormals(); return g;
    });
  }
  const boxGeo = (w, h, d) => keyed(`b${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)}`, () => new THREE.BoxGeometry(w, h, d));
  const cylGeo = (r1, r2, h, s) => keyed(`c${r1.toFixed(4)},${r2.toFixed(4)},${h.toFixed(4)},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
  const add = (g, n, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.name = n; o.position.set(x, y, z); o.castShadow = o.receiveShadow = !m.transparent; g.add(o); return o; };
  // corner bracket in its own frame: X = along the profile (inward from the end), Y = out of the profile's side face,
  // Z = across; leg 1 lies on the profile's side, leg 2 on the face the end meets, with a gusset between them
  function bracketGroup(leg, bw, tb = 0.004) {
    const g = new THREE.Group(); g.name = 'Bracket';
    add(g, 'Bracket_Leg', boxGeo(leg, tb, bw), K.bracket, leg / 2, tb / 2, 0);
    add(g, 'Bracket_Leg', boxGeo(tb, leg, bw), K.bracket, tb / 2, leg / 2, 0);
    const gus = keyed(`gus${leg.toFixed(4)},${tb}`, () => { const s = new THREE.Shape([new THREE.Vector2(tb, tb), new THREE.Vector2(leg * 0.9, tb), new THREE.Vector2(tb, leg * 0.9)]); const e = new THREE.ExtrudeGeometry(s, { depth: tb, bevelEnabled: false }); e.translate(0, 0, -tb / 2); return e; });
    add(g, 'Bracket_Gusset', gus, K.bracket);
    return g;
  }

  // die-cast corner block: a solid chamfered wedge in the corner (same frame as bracketGroup)
  function cubeGroup(leg, bw) {
    const g = new THREE.Group(); g.name = 'Corner_Cube';
    const geo = keyed(`cube${leg.toFixed(4)},${bw.toFixed(4)}`, () => { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(leg, 0), new THREE.Vector2(leg, leg * 0.3), new THREE.Vector2(leg * 0.3, leg), new THREE.Vector2(0, leg)]); const e = new THREE.ExtrudeGeometry(s, { depth: bw, bevelEnabled: false }); e.translate(0, 0, -bw / 2); return e; });
    add(g, 'Corner_Cube', geo, K.diecast); return g;
  }
  // joint plate outline in the (along the profile, along the other profile) plane: the strip over the profile end and the strip over the face
  const jointPlateGeo = (dep, leg, hs, r0, r1) => keyed(`jp${[dep, leg, hs, r0, r1].map(v => v.toFixed(4)).join(',')}`, () => {
    const P2 = (x, y) => new THREE.Vector2(x, y), sh = new THREE.Shape([P2(-dep, -r0), P2(0, -r0), P2(0, -hs), P2(leg, -hs), P2(leg, hs), P2(0, hs), P2(0, r1), P2(-dep, r1)]);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: false });
  });
  const jointOf = (p, i) => p['joint' + i] || 'bracket';
  const legOf = (p, kind) => (p.leg > 0 && (kind === 'bracket' || kind === 'gusset' || kind === 'cube') ? p.leg : SEC(p).m * (kind === 'gusset' ? 2 : kind === 'plate' ? 1.5 : kind === 'cube' ? 0.8 : 0.95));

  // ---------------------------------------------------------------- part types
  // profile: origin = the start end's section centre; axis 'x' lies along local X (yaw = rot), 'y' stands up from the origin
  TYPES.profile = {
    label: '알루미늄 프로파일', group: 'frame',
    defaults: () => ({ section: '4545', length: 0.6, axis: 'y', finish: 'clear', ends: [null, null], joint0: 'bracket', joint1: 'bracket', leg: 0 }),
    build: (g, p) => {
      const S = SEC(p), L = Math.max(0.01, p.length), up = p.axis === 'y';
      const m = add(g, 'Profile_' + (p.section || '4545'), sectionGeo(p.section in SECTIONS ? p.section : '4545'), p.finish === 'black' ? K.black : K.clear);
      m.scale.x = L; if (up) m.rotation.z = Math.PI / 2; // standing: X → Y; the section's height then lies along X
      const A = up ? new V3(0, 1, 0) : new V3(1, 0, 0), half = up ? new V3(S.sy / 2, 0, S.sz / 2) : new V3(0, S.sy / 2, S.sz / 2);
      const hx = v => Math.abs(v.x) * half.x + Math.abs(v.y) * half.y + Math.abs(v.z) * half.z; // half width of the section along v
      const put = (o, a, s, w, at) => { o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, s, w)); o.position.copy(at); g.add(o); };
      (p.ends || []).forEach((e, i) => {
        if (!e || !e.t) return;
        const t = new V3(...e.t).normalize(); if (Math.abs(t.dot(A)) > 0.1) return; // colinear joint: nothing to show
        const kind = jointOf(p, i), a = A.clone().multiplyScalar(i ? -1 : 1), end = i ? A.clone().multiplyScalar(L) : new V3(), leg = legOf(p, kind);
        if (kind === 'plate') { // a flat plate on both outer faces, over the end and the face it meets (T mid-span, L at the other profile's end)
          const room = e.room || [S.m * 2, S.m * 2], dep = e.depth || S.m;
          for (const sg of [1, -1]) {
            const tt = t.clone().multiplyScalar(sg), w = new V3().crossVectors(a, tt), hs = hx(t), r0 = Math.min(leg + hs, sg > 0 ? room[0] : room[1]), r1 = Math.min(leg + hs, sg > 0 ? room[1] : room[0]);
            put(new THREE.Mesh(jointPlateGeo(dep, leg, hs, r0, r1), K.bracket), a, tt, w, end.clone().addScaledVector(w, hx(w)));
          }
          return;
        }
        if (kind === 'anchor') { // hidden anchor fastener: only its access hole shows on the side
          const s = (e.sides || [1])[0] > 0 ? t : t.clone().negate(), h = add(g, 'Anchor_Hole', cylGeo(S.m * 0.13, S.m * 0.13, 0.001, 16), K.hole);
          h.quaternion.setFromUnitVectors(new V3(0, 1, 0), s); h.position.copy(end).addScaledVector(a, S.m / 2).addScaledVector(s, hx(s) + 0.0006); return;
        }
        for (const sgn of e.sides || [1, -1]) {
          const s = t.clone().multiplyScalar(sgn), w = new V3().crossVectors(a, s), bw = 2 * hx(w) * 0.8;
          const b = kind === 'cube' ? cubeGroup(leg, bw) : bracketGroup(leg, bw, kind === 'gusset' ? 0.006 : 0.004);
          put(b, a, s, w, end.clone().addScaledVector(s, hx(s)));
        }
      });
    },
    footprint: p => (p.axis === 'y' ? [SEC(p).sy, SEC(p).sz] : [p.length, SEC(p).sz])
  };
  // plate: 'h' lies flat, origin = centre of its bottom face; 'v' stands up, origin = bottom centre of its back face (it grows to +Z)
  TYPES.plate = {
    label: '판 · 가드', group: 'frame',
    defaults: () => ({ kind: 'alu', orient: 'h', w: 0.6, d: 0.4, t: 0.01 }),
    build: (g, p) => {
      const v = p.orient === 'v', w = p.w, d = p.d, t = p.kind === 'alu' ? p.t : Math.min(p.t, 0.006);
      const dims = v ? [w, d, t] : [w, t, d], c = v ? [0, d / 2, t / 2] : [0, t / 2, 0];
      if (p.kind === 'mesh') { // welded mesh in a thin steel frame
        const KK = window.FactoryKit && window.FactoryKit.K, pl = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, (v ? d : d) - 0.02), KK ? KK.mesh : K.black);
        const uv = pl.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w - 0.02) / 0.05, uv.getY(i) * (d - 0.02) / 0.05);
        pl.name = 'Plate_Mesh'; pl.castShadow = true; if (v) pl.position.set(0, d / 2, t / 2); else { pl.rotation.x = -Math.PI / 2; pl.position.set(0, t / 2, 0); } g.add(pl);
        const f = 0.01; const bar = (bw, bh, bd, x, y, z) => add(g, 'Plate_Frame', boxGeo(bw, bh, bd), K.black, x, y, z);
        if (v) { bar(w, f, t, 0, f / 2, t / 2); bar(w, f, t, 0, d - f / 2, t / 2); bar(f, d, t, -w / 2 + f / 2, d / 2, t / 2); bar(f, d, t, w / 2 - f / 2, d / 2, t / 2); }
        else { bar(w, t, f, 0, t / 2, -d / 2 + f / 2); bar(w, t, f, 0, t / 2, d / 2 - f / 2); bar(f, t, d, -w / 2 + f / 2, t / 2, 0); bar(f, t, d, w / 2 - f / 2, t / 2, 0); }
        return;
      }
      add(g, p.kind === 'guard' ? 'Plate_Guard' : 'Plate', boxGeo(...dims), p.kind === 'guard' ? K.guard : K.plate, ...c);
    },
    footprint: p => [p.w, p.orient === 'v' ? p.t : p.d]
  };
  // levelling foot (threaded stem, nut, swivel pad) or locking castor; origin on the floor, top plate at footH
  TYPES.foot = {
    label: '발 · 캐스터', group: 'frame',
    defaults: () => ({ kind: 'level', h: 0.08 }),
    build: (g, p) => {
      const H = footH(p);
      if (p.kind === 'caster') {
        add(g, 'Caster_Plate', boxGeo(0.07, 0.006, 0.07), K.steel, 0, H - 0.003, 0);
        add(g, 'Caster_Swivel', cylGeo(0.022, 0.022, 0.012, 20), K.steel, 0, H - 0.012, 0);
        for (const s of [-1, 1]) add(g, 'Caster_Fork', boxGeo(0.004, 0.07, 0.04), K.steel, s * 0.019, H - 0.05, -0.012);
        const wh = add(g, 'Caster_Wheel', cylGeo(0.05, 0.05, 0.03, 24), K.rubber, 0, 0.05, -0.012); wh.rotation.z = Math.PI / 2;
        add(g, 'Caster_Hub', cylGeo(0.018, 0.018, 0.034, 16), K.steel, 0, 0.05, -0.012).rotation.z = Math.PI / 2;
        add(g, 'Caster_Lock', boxGeo(0.03, 0.006, 0.03), K.rubber, 0, H - 0.03, 0.03);
        return;
      }
      add(g, 'Foot_Pad', cylGeo(0.04, 0.042, 0.014, 24), K.rubber, 0, 0.007, 0);
      add(g, 'Foot_Base', cylGeo(0.032, 0.036, 0.01, 24), K.steel, 0, 0.019, 0);
      add(g, 'Foot_Stem', cylGeo(0.008, 0.008, H - 0.03, 12), K.steel, 0, 0.024 + (H - 0.03) / 2, 0);
      add(g, 'Foot_Nut', cylGeo(0.013, 0.013, 0.008, 6), K.steel, 0, H - 0.016, 0);
      add(g, 'Foot_Plate', boxGeo(0.045, 0.006, 0.045), K.clear, 0, H - 0.003, 0);
    },
    footprint: () => [0.085, 0.085]
  };

  // ---------------------------------------------------------------- frame set (W × D × H): posts, top and bottom rings, feet, top plate
  // explode(p) lists the parts in the set's own frame (origin = floor centre); the builder places them as separate parts
  function explode(p) {
    const S = SECTIONS[p.section] || SECTIONS['4545'], fh = p.feet === 'none' ? 0 : p.feet === 'caster' ? 0.125 : 0.08, pt = p.top ? 0.01 : 0;
    const W = p.w, D = p.d, postL = Math.max(0.1, p.h - fh - pt), sx = S.sy, sz = S.sz, out = [];
    const prof = (x, y, z, rot, length, axis) => out.push({ type: 'profile', x, y, z, rot, params: { section: p.section, length: +length.toFixed(4), axis, finish: p.finish || 'clear', ends: [null, null], joint0: p.joint || 'bracket', joint1: p.joint || 'bracket' } });
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = i * (W / 2 - sx / 2), z = j * (D / 2 - sz / 2);
      prof(x, fh, z, 0, postL, 'y');
      if (fh) out.push({ type: 'foot', x, y: 0, z, rot: 0, params: { kind: p.feet === 'caster' ? 'caster' : 'level', h: 0.08 } });
    }
    const rings = [fh + postL - sx / 2]; if (p.lower) rings.push(fh + Math.min(0.15, postL / 3) + sx / 2);
    for (const y of rings) {
      for (const j of [-1, 1]) prof(-W / 2 + sx, y, j * (D / 2 - sz / 2), 0, W - 2 * sx, 'x');            // along X, between the posts
      for (const i of [-1, 1]) prof(i * (W / 2 - sx / 2), y, -D / 2 + sz, -Math.PI / 2, D - 2 * sz, 'x');  // along Z (yaw -90°: local X → world +Z)
    }
    if (p.top) out.push({ type: 'plate', x: 0, y: fh + postL, z: 0, rot: 0, params: { kind: 'alu', orient: 'h', w: W, d: D, t: pt } });
    return out;
  }
  TYPES.frameset = {
    label: '프레임 세트', group: 'frame',
    defaults: () => ({ w: 1.2, d: 0.8, h: 0.9, section: '4545', feet: 'level', top: true, lower: true, finish: 'clear', joint: 'bracket' }),
    build: (g, p) => { for (const q of explode(p)) { const c = FE.build(q, null); g.add(c); } },
    footprint: p => [p.w, p.d]
  };

  TYPES.mine = {
    label: '내 설비', group: 'frame',
    defaults: () => ({ parts: [] }),
    build: (g, p) => { for (const q of p.parts || []) g.add(FE.build(q, null)); },
    footprint: () => [0.5, 0.5]
  };

  // ---------------------------------------------------------------- boxes, snapping, joints, assemblies
  const FRAME = ['profile', 'plate', 'foot'], isFrame = o => !!o && FRAME.includes(o.type);
  const P = o => Object.assign(TYPES[o.type].defaults(), o.params || {});
  const axesOf = rot => { const c = Math.cos(rot || 0), s = Math.sin(rot || 0); return [new V3(c, 0, -s), new V3(0, 1, 0), new V3(s, 0, c)]; };
  // oriented box of a part: centre c, axes ax (local X, Y, Z in world), half sizes h
  function boxOf(o) {
    const p = P(o), ax = axesOf(o.rot), [X, Y, Z] = ax, O = new V3(o.x, o.y || 0, o.z);
    let h, c;
    if (o.type === 'profile') { const S = SEC(p), L = p.length; if (p.axis === 'y') { h = [S.sy / 2, L / 2, S.sz / 2]; c = O.clone().addScaledVector(Y, L / 2); } else { h = [L / 2, S.sy / 2, S.sz / 2]; c = O.clone().addScaledVector(X, L / 2); } }
    else if (o.type === 'plate') { if (p.orient === 'v') { h = [p.w / 2, p.d / 2, p.t / 2]; c = O.clone().addScaledVector(Y, p.d / 2).addScaledVector(Z, p.t / 2); } else { h = [p.w / 2, p.t / 2, p.d / 2]; c = O.clone().addScaledVector(Y, p.t / 2); } }
    else { const fh = footH(p); h = [0.0225, fh / 2, 0.0225]; /* the mounting plate; the pad below may stick out a little */ c = O.clone().addScaledVector(Y, fh / 2); }
    return { o, c, ax, h };
  }
  const extent = (B, e) => B.ax.reduce((s, a, i) => s + Math.abs(a.dot(e)) * B.h[i], 0); // half size of box B along unit vector e
  const near = (A, B, pad) => A.c.distanceTo(B.c) < Math.hypot(...A.h) + Math.hypot(...B.h) + pad;
  // gap / overlap of A and B along each of B's axes (> 0: apart)
  const seps = (A, B) => B.ax.map((e, k) => Math.abs(A.c.clone().sub(B.c).dot(e)) - B.h[k] - extent(A, e));
  const parallel = (A, B) => B.ax.every(e => A.ax.some(a => Math.abs(Math.abs(a.dot(e)) - 1) < 1e-3));
  const STEP = 0.005;
  // the best face-to-face contact of part o with another frame part within reach R: o moves by `delta` so a face of it lies on
  // a face of the target, and along that face its centre or an edge lines up with the target's centre or edge (else 5 mm steps)
  function snap(doc, o, R = 0.06) {
    const M = boxOf(o); let best = null;
    for (const q of doc.objects) {
      if (q.id === o.id || !isFrame(q)) continue;
      const B = boxOf(q); if (!near(M, B, R) || !parallel(M, B)) continue;
      for (let j = 0; j < 3; j++) for (const sb of [1, -1]) {
        const n = B.ax[j].clone().multiplyScalar(sb), rel = M.c.clone().sub(B.c);
        if (rel.dot(n) <= 0) continue; // o is on the other side of this face
        const shift = B.h[j] - (rel.dot(n) - extent(M, n)); // moves o's facing side onto the face plane
        if (Math.abs(shift) > R) continue;
        const delta = n.clone().multiplyScalar(shift); let score = Math.abs(shift), ok = true, lined = 0;
        for (let k = 0; k < 3 && ok; k++) {
          if (k === j) continue;
          const e = B.ax[k], a = rel.dot(e), hm = extent(M, e), hb = B.h[k];
          if (Math.abs(a) > hb + hm + R) { ok = false; break; } // not over this face
          let off = null;
          for (const t of [0, -hb + hm, hb - hm]) { const d = t - a; if (Math.abs(d) < R && (off === null || Math.abs(d) < Math.abs(off))) off = d; }
          if (off === null) { const u = a + hb - hm; off = Math.round(u / STEP) * STEP - u; score += 0.02; } else { lined++; score += Math.abs(off); }
          if (Math.abs(a + off) >= hb + hm - 1e-4) { ok = false; break; } // after the move the faces must still overlap
          delta.addScaledVector(e, off);
        }
        if (ok && (!best || score < best.score)) best = { score, delta, target: q, lined };
      }
    }
    const fy = extent(M, new V3(0, 1, 0)), floorGap = M.c.y - fy;
    if (Math.abs(floorGap) < R && (!best || Math.abs(floorGap) < best.score - 0.02)) best = { score: Math.abs(floorGap), delta: new V3(0, -floorGap, 0), target: null, lined: 0 };
    if (!best) return null;
    const r = v => Math.round(v * 1e4) / 1e4;
    return { x: r(o.x + best.delta.x), y: r(Math.max(0, (o.y || 0) + best.delta.y)), z: r(o.z + best.delta.z), target: best.target && best.target.id, text: best.target ? `${best.target.name}에 붙였습니다` : '바닥에 붙였습니다' };
  }
  // parts o overlaps (more than 2 mm into each other); touching is fine
  function overlaps(doc, o, skip) {
    const M = boxOf(o), out = [];
    for (const q of doc.objects) { if (q.id === o.id || !isFrame(q) || (skip && skip.has(q.id))) continue; const B = boxOf(q); if (near(M, B, 0) && seps(M, B).every(s => s < -0.002) && seps(B, M).every(s => s < -0.002)) out.push(q.name); }
    return out;
  }
  const touching = (A, B) => near(A, B, 0.01) && seps(A, B).every(s => s < 0.002) && seps(B, A).every(s => s < 0.002);
  // the parts connected to id by contact (its assembly), id included
  function components(doc, id) {
    const parts = doc.objects.filter(isFrame), boxes = new Map(parts.map(o => [o.id, boxOf(o)])), seen = new Set([id]), todo = [id];
    while (todo.length) { const a = boxes.get(todo.pop()); if (!a) continue; for (const q of parts) if (!seen.has(q.id) && touching(a, boxes.get(q.id))) { seen.add(q.id); todo.push(q.id); } }
    return [...seen];
  }
  // for every profile: what each end meets — { t: the other profile's axis in this profile's local frame } — or null
  function joints(doc) {
    const profs = doc.objects.filter(o => o.type === 'profile'), out = new Map();
    for (const o of profs) {
      const p = P(o), A = boxOf(o), [X, Y, Z] = A.ax, d = p.axis === 'y' ? Y : X, ends = [null, null];
      [0, 1].forEach(i => {
        const fc = new V3(o.x, o.y || 0, o.z).addScaledVector(d, i ? p.length : 0), n = d.clone().multiplyScalar(i ? 1 : -1);
        for (const q of profs) {
          if (q === o) continue; const B = boxOf(q);
          if (!near(A, B, 0.01)) continue;
          for (let j = 0; j < 3 && !ends[i]; j++) for (const sb of [1, -1]) {
            const nb = B.ax[j].clone().multiplyScalar(sb); if (nb.dot(n) > -0.999) continue;
            const rel = fc.clone().sub(B.c); if (Math.abs(rel.dot(nb) - B.h[j]) > 0.002) continue;
            if ([0, 1, 2].some(k => k !== j && Math.abs(rel.dot(B.ax[k])) > B.h[k] + 0.001)) continue;
            const qp = P(q), bd = qp.axis === 'y' ? B.ax[1] : B.ax[0], r = v => Math.round(v * 1e3) / 1e3;
            // a bracket goes on each side of the end along the other profile, unless a part already fills that corner (a top plate, a beam)
            const S = SEC(p), leg = S.m * 0.95, a = n.clone().negate(), sides = [1, -1].filter(sg => {
              const sv = bd.clone().multiplyScalar(sg), c = fc.clone().addScaledVector(sv, extent(A, sv) + leg / 2).addScaledVector(a, leg / 2); // sv ⟂ the profile, so extent() is its half width
              const W = new V3().crossVectors(a, sv), Bk = { c, ax: [a, sv, W], h: [leg / 2 - 0.001, leg / 2 - 0.001, 0.01] };
              return !doc.objects.some(x => isFrame(x) && x.id !== o.id && x.id !== q.id && (() => { const X2 = boxOf(x); return near(Bk, X2, 0) && seps(Bk, X2).every(v => v < 0) && seps(X2, Bk).every(v => v < 0); })());
            });
            const cb = B.c.dot(bd) - fc.dot(bd), hb = extent(B, bd);
            ends[i] = { t: [r(bd.dot(X)), r(bd.dot(Y)), r(bd.dot(Z))], to: q.id, depth: r(2 * B.h[j]), room: [r(hb - cb), r(hb + cb)] }; if (sides.length < 2) ends[i].sides = sides; break;
          }
        }
      });
      out.set(o.id, ends);
    }
    return out;
  }
  // where a new part goes when the pointer is over a face of another part (hit: { obj, point, normal } in world) or the floor
  function poseOnHit(doc, c, hit) {
    const p = Object.assign(TYPES[c.type].defaults(), c.params || {}), pt = hit.point, n = hit.normal.clone().normalize(), q = hit.obj;
    const up = n.y > 0.7, down = n.y < -0.7, side = !up && !down, out = { x: pt.x, y: Math.max(0, pt.y), z: pt.z, rot: c.rot || 0, lift: 0 };
    const yawTo = v => Math.atan2(-v.z, v.x); // rot that turns local X onto horizontal v
    if (c.type === 'profile') {
      const S = SEC(p);
      if (p.axis === 'y') {
        if (down) out.y = pt.y - p.length;
        else if (side) { out.x += n.x * S.sy / 2; out.z += n.z * S.sz / 2; out.y = Math.max(0, pt.y - p.length / 2); }
      } else {
        if (side) { out.rot = yawTo(n); }
        else {
          if (q && q.type === 'profile' && P(q).axis !== 'y') out.rot = (q.rot || 0) + Math.PI / 2;
          const X = axesOf(out.rot)[0]; out.x -= X.x * p.length / 2; out.z -= X.z * p.length / 2; out.y = up ? pt.y + S.sy / 2 : pt.y - S.sy / 2;
        }
      }
    } else if (c.type === 'plate') {
      if (p.orient === 'v') { if (side) out.rot = Math.atan2(n.x, n.z); out.y = side ? Math.max(0, pt.y - p.d / 2) : up ? pt.y : pt.y - p.d; }
      else if (down) out.y = pt.y - p.t;
    } else if (c.type === 'foot') {
      const fh = footH(p);
      if (q && q.type === 'profile' && P(q).axis === 'y') { out.x = q.x; out.z = q.z; out.y = (q.y || 0) - fh; out.target = q.id; if (out.y < 0) { out.lift = -out.y; out.y = 0; } return out; }
    }
    out.y = Math.max(0, out.y);
    const sn = q ? snap(doc, Object.assign({}, c, out, { id: c.id || '__ghost' }), 0.1) : null;
    if (sn) Object.assign(out, { x: sn.x, y: sn.y, z: sn.z, snapped: sn.text });
    return out;
  }
  // a horizontal plate sized to the frame tops it rests on (same assembly, top faces at the plate's bottom)
  function fitPlate(doc, o) {
    const p = P(o); if (p.orient === 'v') return null;
    const ids = components(doc, o.id), Y0 = o.y || 0, [X, , Z] = axesOf(o.rot); let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const id of ids) {
      const q = doc.objects.find(x => x.id === id); if (!q || q.id === o.id || q.type !== 'profile') continue;
      const B = boxOf(q), top = B.c.y + extent(B, new V3(0, 1, 0)); if (Math.abs(top - Y0) > 0.003) continue;
      [X, Z].forEach((e, k) => { const a = B.c.dot(e), h = extent(B, e); lo[k] = Math.min(lo[k], a - h); hi[k] = Math.max(hi[k], a + h); });
    }
    if (!isFinite(lo[0])) return null;
    const cx = (lo[0] + hi[0]) / 2, cz = (lo[1] + hi[1]) / 2, r = v => Math.round(v * 1e4) / 1e4;
    return { x: r(X.x * cx + Z.x * cz), z: r(X.z * cx + Z.z * cz), w: r(hi[0] - lo[0]), d: r(hi[1] - lo[1]) };
  }
  // stretch an assembly along unit vector e by delta at plane (e·x = plane): parts beyond the plane move, parts across it grow.
  // Profiles grow along their axis, plates along their matching side; returns the changed copies (null when a crossing part cannot grow that way)
  function stretch(doc, ids, e, plane, delta) {
    const out = [], r = v => Math.round(v * 1e4) / 1e4;
    for (const id of ids) {
      const o = doc.objects.find(x => x.id === id); if (!o || !isFrame(o)) continue;
      const B = boxOf(o), c = B.c.dot(e), h = extent(B, e), q = JSON.parse(JSON.stringify(o)), p = Object.assign(P(o), q.params);
      const move = k => { q.x = r(q.x + e.x * k); q.y = r((q.y || 0) + e.y * k); q.z = r(q.z + e.z * k); };
      if (c - h >= plane - 1e-6) move(delta);
      else if (c + h > plane + 1e-6) {
        const k = B.ax.findIndex(a => Math.abs(Math.abs(a.dot(e)) - 1) < 1e-3); if (k < 0) return null;
        const along = B.ax[k].dot(e) > 0 ? 1 : -1;
        if (o.type === 'profile') { if ((p.axis === 'y' ? 1 : 0) !== k) return null; p.length = r(p.length + delta); if (along < 0) move(delta); }
        else if (o.type === 'plate') { const key = k === 0 ? 'w' : p.orient === 'v' ? (k === 1 ? 'd' : null) : (k === 2 ? 'd' : null); if (!key) return null; p[key] = r(p[key] + delta); if (!(p.orient === 'v' && k === 1)) move(delta / 2); }
        else return null;
        if ((o.type === 'profile' ? p.length : Math.min(p.w, p.d)) < 0.02) return null;
        q.params = p;
      } else continue;
      out.push(q);
    }
    return out;
  }
  // cut list: profiles by section and length, plates by kind and size, feet by kind
  function bom(doc, ids) {
    const rows = new Map(), put = (k, label) => { const r = rows.get(k) || { label, n: 0 }; r.n++; rows.set(k, r); };
    for (const o of doc.objects) {
      if (!isFrame(o) || (ids && !ids.includes(o.id))) continue; const p = P(o);
      if (o.type === 'profile') put('p' + p.section + p.length, `프로파일 ${SEC(p).label} · ${Math.round(p.length * 1000)} mm`);
      else if (o.type === 'plate') put('t' + p.kind + p.w + p.d + p.t, `${{ alu: '알루미늄 판', guard: '투명 가드', mesh: '메시 가드' }[p.kind] || '판'} ${Math.round(p.w * 1000)}×${Math.round(p.d * 1000)}×${Math.round(p.t * 1000)} mm`);
      else put('f' + p.kind, p.kind === 'caster' ? '캐스터 (잠금)' : '레벨링 발');
    }
    for (const o of doc.objects) {
      if (o.type !== 'profile' || (ids && !ids.includes(o.id))) continue; const p = P(o), A = p.axis === 'y' ? [0, 1, 0] : [1, 0, 0];
      (p.ends || []).forEach((e, i) => {
        if (!e || !e.t || Math.abs(e.t[0] * A[0] + e.t[1] * A[1] + e.t[2] * A[2]) > 0.1) return;
        const kind = jointOf(p, i), n = kind === 'anchor' ? 1 : kind === 'plate' ? 2 : (e.sides || [1, -1]).length, series = Math.round(SEC(p).m * 1000);
        const k = 'j' + kind + series + legOf(p, kind), r = rows.get(k) || { label: `${JOINTS[kind]} · ${series} 계열${['bracket', 'gusset', 'cube'].includes(kind) ? ` · 다리 ${Math.round(legOf(p, kind) * 1000)} mm` : ''}`, n: 0 }; r.n += n; rows.set(k, r);
      });
    }
    return [...rows.values()];
  }

  window.FactoryFrame = { SECTIONS, JOINTS, FRAME, isFrame, boxOf, extent, axesOf, touching, stretch, snap, overlaps, components, joints, poseOnHit, fitPlate, explode, bom, footH, STEP };
})();
