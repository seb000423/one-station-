// Building elements for the factory builder (console 1) and the factory export: columns, wall segments,
// doors, stairs, walkways and named zones, each built from its parameters in metres. The element sits on
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
    glass: mat(0x8ea3b5, { transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide })
  };
  const box = (g, n, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.name = n; b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };

  function labelPlane(text, w, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = color; x.font = 'bold 64px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 64);
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
        for (let i = 0; i < n; i++) box(g, 'Stair_Step_' + (i + 1), p.width, rise, tread, M.stair, 0, rise * (i + 0.5), -p.run / 2 + tread * (i + 0.5)).scale.y = 1;
        for (const s of [-1, 1]) {
          const len = Math.hypot(p.run, p.height), r = box(g, 'Stair_Rail_' + (s > 0 ? 'R' : 'L'), 0.05, 0.05, len, M.yellow, s * p.width / 2, p.height / 2 + 0.9, 0);
          r.rotation.x = -Math.atan2(p.height, p.run);
        }
      },
      footprint: p => [p.width, p.run]
    },
    walkway: {
      label: '보행로', group: 'route',
      defaults: () => ({ length: 6, width: 1.2 }),
      build: (g, p) => {
        box(g, 'Walkway_Floor', p.length, 0.006, p.width, M.walkway, 0, 0.003, 0).castShadow = false;
        for (const s of [-1, 1]) box(g, 'Walkway_Edge', p.length, 0.008, 0.08, M.yellow, 0, 0.004, s * (p.width / 2 - 0.04)).castShadow = false;
        const lab = labelPlane('보행로', Math.min(p.length, p.width * 2.5), '#e9f5ee'); g.add(lab);
      },
      footprint: p => [p.length, p.width]
    },
    zone: {
      label: '구역', group: 'route',
      defaults: () => ({ w: 3, d: 3, label: 'A 구역', color: '#2f7dd1' }),
      build: (g, p) => {
        const c = new THREE.Color(p.color || '#2f7dd1');
        box(g, 'Zone_Area', p.w, 0.004, p.d, mat(c, { transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.002, 0).castShadow = false;
        const edge = mat(c);
        for (const [w, d, x, z] of [[p.w, 0.06, 0, -p.d / 2], [p.w, 0.06, 0, p.d / 2], [0.06, p.d, -p.w / 2, 0], [0.06, p.d, p.w / 2, 0]]) box(g, 'Zone_Edge', w, 0.01, d, edge, x, 0.005, z).castShadow = false;
        g.add(labelPlane(p.label || '구역', p.w, '#ffffff'));
      },
      footprint: p => [p.w, p.d]
    }
  };

  function build(obj, factory) {
    const T = TYPES[obj.type], g = new THREE.Group();
    g.name = (obj.name || T.label).replace(/[\/\s]+/g, '_');
    g.position.set(obj.x || 0, 0, obj.z || 0); g.rotation.y = obj.rot || 0;
    T.build(g, Object.assign(T.defaults(factory), obj.params || {}), factory);
    return g;
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

  window.FactoryElements = { TYPES, build, buildShell, defaults: (type, f) => TYPES[type].defaults(f), footprint: (obj, f) => TYPES[obj.type].footprint(Object.assign(TYPES[obj.type].defaults(f), obj.params || {})) };
})();
