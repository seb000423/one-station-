// ONE library: the basic asset set for the factory builder and the block set for the machine builder.
// Every asset is drawn here as a plain, single-colour parametric shape (no maker models, no textures).
// Scene units: metres, Y up, origin = floor centre of the object, +X = infeed → outfeed. Parameters are in mm.
// Factory list: 37 items every factory has + 11 representative production machines (one per process family)
// + 2 optional items for the welded-module example line. Names follow the team's asset list.
(() => {
  'use strict';
  const T = window.THREE;
  const mm = v => v / 1000;

  /* ------------------------------------------------------------------ materials (charcoal · grey · ivory, one amber) */
  const MAT = {};
  const ROLE = {
    wall: { color: '#4a4b50', metalness: 0.0, roughness: 0.85, envMapIntensity: 0.25 },
    frame: { color: '#3c3e43', metalness: 0.3, roughness: 0.55 },
    body: { color: '#9b988f', metalness: 0.05, roughness: 0.6 },
    light: { color: '#e4ddcf', metalness: 0.0, roughness: 0.65 },
    dark: { color: '#222326', metalness: 0.2, roughness: 0.6 },
    steel: { color: '#b9bcbf', metalness: 0.45, roughness: 0.4 },
    accent: { color: '#d98e2b', metalness: 0.05, roughness: 0.55 },
    rubber: { color: '#151517', metalness: 0, roughness: 0.9 },
    glass: { color: '#a9bcc4', metalness: 0, roughness: 0.15, transparent: true, opacity: 0.22, depthWrite: false },
    mark: { color: '#c9a24a', metalness: 0, roughness: 0.9 },
    markw: { color: '#d8d3c6', metalness: 0, roughness: 0.9 },
    work: { color: '#c8b48a', metalness: 0.2, roughness: 0.5 },
    wood: { color: '#a8865a', metalness: 0, roughness: 0.85 },
    glowA: { color: '#2a1a05', emissive: '#ffae42', emissiveIntensity: 3 },
    glowG: { color: '#062a10', emissive: '#3ddc84', emissiveIntensity: 2.5 },
    glowR: { color: '#2a0606', emissive: '#ff4d4f', emissiveIntensity: 2.5 },
    glowW: { color: '#333', emissive: '#fff2dc', emissiveIntensity: 2.2 },
    screen: { color: '#0b0d10', emissive: '#7fa7c9', emissiveIntensity: 0.35 },
  };
  const mat = role => MAT[role] || (MAT[role] = new T.MeshStandardMaterial(ROLE[role] || ROLE.body));
  // lamp materials that switch on and off in run mode
  const lampMat = on => mat(on);

  /* ------------------------------------------------------------------ geometry helpers (bottom-centre placement) */
  const bx = (g, role, w, h, d, x = 0, y = 0, z = 0) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(role)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const cy = (g, role, r, h, x = 0, y = 0, z = 0, axis = 'y', seg = 20) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), mat(role)); m.castShadow = m.receiveShadow = true;
    if (axis === 'y') m.position.set(x, y + h / 2, z); else { m.position.set(x, y, z); if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2; }
    g.add(m); return m;
  };
  const sp = (g, role, r, x, y, z) => { const m = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat(role)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const grp = (g, name, x = 0, y = 0, z = 0) => { const n = new T.Group(); n.name = name; n.position.set(x, y, z); g.add(n); return n; };
  const legs = (g, w, d, h, inset = 0.06, s = 0.05) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 'frame', s, h, s, sx * (w / 2 - inset), 0, sz * (d / 2 - inset)); };
  const flatRing = (g, role, r0, r1, y = 0.004, x = 0, z = 0) => { const m = new T.Mesh(new T.RingGeometry(r0, r1, 48).rotateX(-Math.PI / 2), mat(role)); m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
  const flatRect = (g, role, w, d, y = 0.003, x = 0, z = 0) => { const m = new T.Mesh(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(role)); m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
  const frameRect = (g, role, w, d, t = 0.08, y = 0.003) => { flatRect(g, role, w, t, y, 0, -d / 2 + t / 2); flatRect(g, role, w, t, y, 0, d / 2 - t / 2); flatRect(g, role, t, d - 2 * t, y, -w / 2 + t / 2, 0); flatRect(g, role, t, d - 2 * t, y, w / 2 - t / 2, 0); };
  const lampStack = (g, x, y, z, s = 1) => { const t = grp(g, 'lamp', x, y, z); cy(t, 'frame', 0.012 * s, 0.25 * s); cy(t, 'glowR', 0.03 * s, 0.06 * s, 0, 0.25 * s).name = 'lamp_red'; cy(t, 'glowA', 0.03 * s, 0.06 * s, 0, 0.31 * s).name = 'lamp_yel'; cy(t, 'glowG', 0.03 * s, 0.06 * s, 0, 0.37 * s).name = 'lamp_grn'; return t; };

  /* a 6-axis arm on a base: j1 base yaw (vertical), j2 shoulder and j3 elbow pitch (local Z), j4 forearm roll (local X),
     j5 wrist pitch (local Z, home = flange facing down), j6 flange roll; 'wrist' = the TCP, the tip of the gripper */
  function arm(g, reach = 1.2, x = 0, z = 0, y = 0) {
    const s = reach / 1.2, base = grp(g, 'arm', x, y, z);
    cy(base, 'frame', 0.2 * s, 0.12 * s);
    const j1 = grp(base, 'j1', 0, 0.12 * s, 0); cy(j1, 'light', 0.15 * s, 0.32 * s);
    const j2 = grp(j1, 'j2', 0, 0.36 * s, 0); cy(j2, 'dark', 0.1 * s, 0.26 * s, 0, 0, 0, 'z'); bx(j2, 'light', 0.16 * s, 0.62 * s, 0.16 * s, 0, 0, 0);
    const j3 = grp(j2, 'j3', 0, 0.62 * s, 0); cy(j3, 'dark', 0.08 * s, 0.22 * s, 0, 0, 0, 'z'); bx(j3, 'light', 0.27 * s, 0.13 * s, 0.13 * s, 0.1 * s, -0.065 * s, 0);
    const j4 = grp(j3, 'j4', 0.235 * s, 0, 0); cy(j4, 'dark', 0.07 * s, 0.03 * s, 0.015 * s, 0, 0, 'x'); bx(j4, 'light', 0.25 * s, 0.1 * s, 0.1 * s, 0.155 * s, -0.05 * s, 0);
    const j5 = grp(j4, 'j5', 0.285 * s, 0, 0); cy(j5, 'dark', 0.055 * s, 0.13 * s, 0, 0, 0, 'z'); j5.rotation.z = -Math.PI / 2 + 0.15; // + J2 / J3 home bend (−0.35 + 0.2): the tool points straight down at 0°
    const j6 = grp(j5, 'j6', 0.06 * s, 0, 0); cy(j6, 'steel', 0.045 * s, 0.025 * s, 0.0125 * s, 0, 0, 'x');
    bx(j6, 'steel', 0.07 * s, 0.05 * s, 0.09 * s, 0.06 * s, -0.025 * s, 0); for (const k of [-1, 1]) bx(j6, 'dark', 0.06 * s, 0.03 * s, 0.015 * s, 0.125 * s, -0.015 * s, k * 0.03 * s);
    grp(j6, 'wrist', 0.155 * s, 0, 0);
    j2.rotation.z = -0.35; j3.rotation.z = 0.2;
    return base;
  }
  function person(g, x = 0, z = 0, yaw = 0) {
    const p = grp(g, 'person', x, 0, z); p.rotation.y = yaw;
    for (const s of [-1, 1]) bx(p, 'dark', 0.12, 0.82, 0.14, 0, 0, s * 0.1);
    bx(p, 'light', 0.24, 0.58, 0.42, 0, 0.82, 0);
    for (const s of [-1, 1]) bx(p, 'light', 0.1, 0.55, 0.1, 0, 0.84, s * 0.26);
    sp(p, 'body', 0.11, 0, 1.55, 0); const h = sp(p, 'accent', 0.125, 0, 1.6, 0); h.scale.y = 0.6;
    return p;
  }

  /* ------------------------------------------------------------------ factory assets */
  // kind: how the builder stores it (edit-API command); size: default footprint W × D × H (mm) for picking and labels
  const V = (o, k) => o.variants && o.variants[k] ? o.variants[k] : '';
  const F = {};
  const fdef = (id, o) => { F[id] = Object.assign({ id, params: {}, fields: [] }, o); };
  const num = (key, label, unit = 'mm', step = 100, min = 0) => ({ key, label, type: 'num', unit, step, min });
  const sel = (key, label, options) => ({ key, label, type: 'select', options });

  /* 1. building */
  fdef('floor-slab', { name: '바닥 슬래브', group: 'building', grade: 1, kind: { cmd: 'slab' }, why: '모든 배치와 이동 경로가 놓이는 기준면' });
  fdef('floor-marking', { name: '바닥 마킹 (통로·안전구역·보관구역)', group: 'building', grade: 1, kind: { cmd: 'add_marking' }, why: '통로·구역 표시',
    params: { variant: 'aisle', length: 8000, width: 3000 }, fields: [sel('variant', '종류', [['aisle', '통로선'], ['zone', '보관 구역'], ['safety', '안전 구역']]), num('length', '길이'), num('width', '폭')] });
  fdef('outer-wall', { name: '외벽', group: 'building', grade: 1, kind: { cmd: 'draw_wall' }, why: '공장 경계이자 이동 경로상의 장애물', params: { length: 6000 }, fields: [num('length', '길이')] });
  fdef('partition', { name: '내벽·파티션', group: 'building', grade: 1, kind: { cmd: 'add_block', type: 'partition' }, why: '생산·창고·사무 구역을 나눔',
    params: { length: 4000, h: 3000, variant: 'glass' }, fields: [num('length', '길이'), num('h', '높이'), sel('variant', '형식', [['glass', '유리 상부'], ['panel', '패널'], ['mesh', '메시']])],
    build: p => { const g = new T.Group(), L = mm(p.length), H = mm(p.h); bx(g, 'body', L, 1.1, 0.08); if (p.variant === 'panel') bx(g, 'body', L, H - 1.1, 0.08, 0, 1.1); else bx(g, p.variant === 'mesh' ? 'glass' : 'glass', L, H - 1.1, 0.03, 0, 1.1);
      for (let x = -L / 2; x <= L / 2 + 1e-6; x += Math.max(1, L / Math.round(L / 1.2))) bx(g, 'frame', 0.05, H, 0.1, x); bx(g, 'frame', L, 0.05, 0.1, 0, H - 0.05); return g; } });
  fdef('column', { name: '기둥', group: 'building', grade: 1, kind: { cmd: 'add_column' }, why: '설비 배치를 제약하는 장애물', params: { size: 500 }, fields: [num('size', '단면', 'mm', 50, 100)] });
  fdef('roof', { name: '지붕', group: 'building', grade: 1, kind: { cmd: 'add_roof' }, why: '공장 외형', params: { type: 'gable' }, fields: [sel('type', '형식', [['gable', '박공'], ['flat', '평지붕']])] });
  fdef('door', { name: '출입문 (사람)', group: 'building', grade: 1, kind: { cmd: 'add_opening', kind: 'door' }, why: '작업자가 드나드는 통과점', params: { w: 1000, h: 2100 }, fields: [num('w', '폭'), num('h', '높이')] });
  fdef('shutter', { name: '고속 셔터·오버헤드 도어', group: 'building', grade: 1, kind: { cmd: 'add_opening', kind: 'shutter' }, why: 'AMR·지게차가 드나드는 통과점', params: { w: 3500, h: 4000 }, fields: [num('w', '폭'), num('h', '높이')] });
  fdef('dock', { name: '로딩 도크 (레벨러·쉘터)', group: 'building', grade: 1, kind: { cmd: 'add_opening', kind: 'dock' }, why: '자재가 들어오고 제품이 나가는 지점', params: { w: 3000, h: 3200 }, fields: [num('w', '폭'), num('h', '높이')] });
  fdef('emergency-exit', { name: '비상구', group: 'building', grade: 2, kind: { cmd: 'add_opening', kind: 'exit' }, why: '법적으로 필요한 대피 출구', params: { w: 1000, h: 2100 }, fields: [num('w', '폭'), num('h', '높이')] });

  /* 2. power and air */
  fdef('distribution-panel', { name: '분전반 (MCC·동력·전등)', group: 'power', grade: 1, kind: { cmd: 'add_block', type: 'distribution-panel' }, why: '설비마다 전기를 나눠 주는 곳',
    params: { bays: 3 }, fields: [num('bays', '면 수', '면', 1, 1)],
    build: p => { const g = new T.Group(), n = Math.max(1, p.bays | 0), w = 0.8; for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * w; bx(g, 'body', w - 0.01, 2.1, 0.6, x); bx(g, 'dark', 0.3, 0.2, 0.01, x, 1.6, 0.305); bx(g, 'frame', w - 0.01, 0.1, 0.62, x); } return g; } });
  fdef('power-drop', { name: '전원 드롭 (설비 접속점)', group: 'power', grade: 1, kind: { cmd: 'add_drop', kind: 'power' }, why: '설비가 전기에 연결되는 지점' });
  fdef('air-drop', { name: '에어 드롭 (설비 접속점)', group: 'power', grade: 1, kind: { cmd: 'add_drop', kind: 'air' }, why: '설비가 압축공기에 연결되는 지점' });
  fdef('compressor', { name: '컴프레서', group: 'power', grade: 2, kind: { cmd: 'add_block', type: 'compressor' }, why: '공장 전체에 압축공기를 만들어 보냄',
    build: () => { const g = new T.Group(); bx(g, 'light', 1.6, 1.5, 1.0, -0.4); bx(g, 'dark', 0.5, 0.3, 0.01, -0.6, 1.0, 0.505); cy(g, 'body', 0.38, 1.7, 0.85, 0, 0); sp(g, 'body', 0.38, 0.85, 1.7, 0); cy(g, 'steel', 0.04, 0.6, 0.3, 1.1, 0.3, 'x'); return g; } });
  fdef('lighting', { name: '조명 (고천장·라인)', group: 'power', grade: 2, kind: { cmd: 'add_block', type: 'lighting' }, why: '공장 내부 밝기',
    params: { variant: 'highbay', mount: 6000 }, fields: [sel('variant', '형식', [['highbay', '고천장'], ['line', '라인 조명']]), num('mount', '설치 높이')],
    build: p => { const g = new T.Group(), y = mm(p.mount); cy(g, 'frame', 0.006, 0.8, 0, y - 0.8, 0);
      if (p.variant === 'line') { bx(g, 'body', 1.5, 0.06, 0.12, 0, y - 0.86); bx(g, 'glowW', 1.44, 0.01, 0.1, 0, y - 0.87); }
      else { const c = new T.Mesh(new T.CylinderGeometry(0.12, 0.25, 0.22, 24, 1, true), mat('body')); c.position.set(0, y - 0.91, 0); g.add(c); cy(g, 'glowW', 0.24, 0.01, 0, y - 1.02, 0); }
      return g; } });

  /* 3. fire and safety */
  fdef('fire-equipment', { name: '스프링클러·소화전·소화기', group: 'fire', grade: 2, kind: { cmd: 'add_block', type: 'fire-equipment' }, why: '어느 공장에나 있는 소방 설비',
    params: { variant: 'extinguisher' }, fields: [sel('variant', '종류', [['extinguisher', '소화기'], ['hydrant', '옥내 소화전'], ['sprinkler', '스프링클러 입상관']])],
    build: p => { const g = new T.Group();
      if (p.variant === 'hydrant') { bx(g, 'accent', 0.75, 1.3, 0.25, 0, 0.5); bx(g, 'dark', 0.6, 0.6, 0.01, 0, 0.9, 0.126); }
      else if (p.variant === 'sprinkler') { cy(g, 'accent', 0.08, 6); bx(g, 'body', 0.3, 0.3, 0.2, 0, 1.2, 0.1); }
      else { bx(g, 'frame', 0.4, 0.05, 0.3); cy(g, 'accent', 0.08, 0.55, 0, 0.05); cy(g, 'dark', 0.025, 0.08, 0, 0.6); bx(g, 'body', 0.04, 1.6, 0.04, 0, 0, -0.14); bx(g, 'light', 0.25, 0.25, 0.01, 0, 1.6, -0.11); }
      return g; } });
  fdef('assembly-point', { name: '대피 동선·집결지', group: 'fire', retired: true, // off the palette (user 2026-11-03); kept so saved layouts still draw
    grade: 2, kind: { cmd: 'add_block', type: 'assembly-point' }, why: '비상시 대피 경로와 모이는 곳',
    params: { d: 4000 }, fields: [num('d', '지름')],
    build: p => { const g = new T.Group(), r = mm(p.d) / 2; flatRing(g, 'markw', r - 0.12, r); flatRing(g, 'markw', r * 0.3, r * 0.3 + 0.08); bx(g, 'frame', 0.05, 2.2, 0.05, r * 0.8, 0, 0); bx(g, 'light', 0.6, 0.4, 0.03, r * 0.8, 1.8, 0); return g; } });
  fdef('safety-guard', { name: '안전 펜스·볼라드·가드레일', group: 'fire', grade: 1, kind: { cmd: 'add_block', type: 'safety-guard' }, why: '로봇 셀 구획, 통로·설비 보호',
    params: { variant: 'fence', length: 3000 }, fields: [sel('variant', '종류', [['fence', '안전 펜스'], ['bollard', '볼라드'], ['guardrail', '가드레일']]), num('length', '길이')],
    build: p => { const g = new T.Group(), L = mm(p.length);
      if (p.variant === 'bollard') { const n = Math.max(1, Math.round(L / 1.5) + 1); for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : -L / 2 + (L * i) / (n - 1); cy(g, 'accent', 0.06, 1.0, x); cy(g, 'dark', 0.062, 0.08, x, 0.75); } }
      else if (p.variant === 'guardrail') { for (let x = -L / 2; x <= L / 2 + 1e-6; x += Math.max(0.5, L / Math.max(1, Math.round(L / 1.5)))) bx(g, 'frame', 0.08, 0.5, 0.08, x); bx(g, 'accent', L, 0.2, 0.06, 0, 0.3, 0.05); }
      else { const n = Math.max(1, Math.round(L / 1.0)); for (let i = 0; i <= n; i++) bx(g, 'frame', 0.04, 2.0, 0.04, -L / 2 + (L * i) / n); bx(g, 'glass', L, 1.7, 0.01, 0, 0.15); bx(g, 'accent', L, 0.04, 0.03, 0, 1.96); bx(g, 'frame', L, 0.04, 0.03, 0, 0.12); }
      return g; } });

  /* 4. logistics */
  fdef('conveyor', { name: '벨트·롤러·체인·타이밍벨트 컨베이어', group: 'logistics', grade: 1, kind: { cmd: 'add_block', type: 'conveyor' }, why: '설비와 설비 사이 워크 이동',
    params: { variant: 'roller', length: 4000, w: 800, h: 800 }, fields: [sel('variant', '형식', [['belt', '벨트'], ['roller', '롤러'], ['chain', '체인'], ['timing', '타이밍벨트']]), num('length', '길이'), num('w', '폭'), num('h', '반송 높이')],
    build: p => conveyorShape(p.variant, mm(p.length), mm(p.w), mm(p.h)) });
  fdef('forklift', { name: '지게차·전동 지게차', group: 'logistics', grade: 2, kind: { cmd: 'add_mover', kind: 'forklift' }, why: '파렛트·무거운 자재 운반' });
  fdef('cart', { name: '대차·카트', group: 'logistics', grade: 2, kind: { cmd: 'add_block', type: 'cart' }, why: '사람이 밀고 다니는 부품 운반',
    build: () => { const g = new T.Group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, 'rubber', 0.06, 0.04, sx * 0.4, 0.06, sz * 0.25, 'z'); bx(g, 'body', 1.0, 0.04, 0.6, 0, 0.12); bx(g, 'body', 1.0, 0.04, 0.6, 0, 0.6); legs(g, 1.0, 0.6, 0.62, 0.02, 0.025); bx(g, 'frame', 0.03, 0.4, 0.6, -0.5, 0.62); return g; } });
  fdef('amr', { name: 'AMR·AGV·RGV', group: 'logistics', grade: 2, kind: { cmd: 'add_mover', kind: 'amr' }, why: '구역 사이 물류 자동 이동', params: { variant: 'amr' }, fields: [sel('variant', '종류', [['amr', 'AMR'], ['agv', 'AGV'], ['rgv', 'RGV (레일)']])] });
  fdef('amr-dock', { name: 'AMR 도킹·픽업 스테이션 (설비 입출구)', group: 'logistics', grade: 1, kind: { cmd: 'add_block', type: 'amr-dock' }, why: 'AMR이 설비에 붙어 싣고 내리는 지점',
    build: () => { const g = new T.Group(); frameRect(g, 'mark', 1.4, 1.0, 0.05); bx(g, 'frame', 1.0, 0.65, 0.7, 0, 0, -0.85); const c = conveyorShape('roller', 1.0, 0.6, 0.65); c.position.z = -0.85; g.add(c); bx(g, 'glowA', 0.5, 0.01, 0.02, 0, 0.02, -0.47); return g; } });
  fdef('rack', { name: '랙 (파렛트랙·선반랙·캔틸레버)', group: 'logistics', grade: 1, kind: { cmd: 'add_storage', kind: 'rack' }, why: '원자재·완제품 보관',
    params: { variant: 'pallet', bays: 2, levels: 3 }, fields: [sel('variant', '형식', [['pallet', '파렛트랙'], ['shelf', '선반랙'], ['cantilever', '캔틸레버']]), num('bays', '칸 수', '칸', 1, 1), num('levels', '단 수', '단', 1, 1)] });
  fdef('floor-storage', { name: '보관 구역 (평치)', group: 'logistics', grade: 1, kind: { cmd: 'add_storage', kind: 'floor' }, why: '재공품·버퍼 재고', params: { w: 4000, d: 3000 }, fields: [num('w', '가로'), num('d', '세로')] });
  fdef('container', { name: '통박스·파렛트·트레이', group: 'logistics', grade: 1, kind: { cmd: 'add_block', type: 'container' }, why: '워크를 담아 옮기는 단위',
    params: { variant: 'tote', stack: 1 }, fields: [sel('variant', '종류', [['tote', '통박스'], ['pallet', '파렛트'], ['tray', '트레이']]), num('stack', '적재 단', '단', 1, 1)],
    build: p => { const g = new T.Group(), n = Math.max(1, p.stack | 0);
      for (let i = 0; i < n; i++) { if (p.variant === 'pallet') { const y = i * 0.15; for (const z of [-0.45, 0, 0.45]) bx(g, 'body', 1.2, 0.1, 0.1, 0, y, z); bx(g, 'body', 1.2, 0.03, 1.0, 0, y + 0.1); }
        else if (p.variant === 'tray') bx(g, 'dark', 0.6, 0.05, 0.4, 0, i * 0.05);
        else { const y = i * 0.3; bx(g, 'frame', 0.6, 0.02, 0.4, 0, y); for (const s of [-1, 1]) { bx(g, 'frame', 0.6, 0.28, 0.015, 0, y, s * 0.2); bx(g, 'frame', 0.015, 0.28, 0.4, s * 0.3, y); } } }
      return g; } });

  /* 5. people and spaces */
  fdef('worker', { name: '작업자', group: 'people', grade: 2, kind: { cmd: 'add_mover', kind: 'worker' }, why: '수작업·운반·설비 조작을 하는 사람' });
  fdef('workbench', { name: '작업대·선반·랙', group: 'people', grade: 2, kind: { cmd: 'add_block', type: 'workbench' }, why: '조립·수리·부품 놓기',
    params: { w: 1500, d: 750 }, fields: [num('w', '가로'), num('d', '세로')], build: p => workbench(mm(p.w), mm(p.d)) });
  fdef('office', { name: '사무실·현장 사무실', group: 'people', grade: 2, kind: { cmd: 'add_block', type: 'office' }, why: '관리·사무 업무 공간',
    params: { w: 6000, d: 4000, h: 2800 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이')], build: p => room(mm(p.w), mm(p.d), mm(p.h), true) });
  fdef('amenity', { name: '휴게실·탈의실·화장실·식당', group: 'people', grade: 3, kind: { cmd: 'add_block', type: 'amenity' }, why: '작업자가 쓰는 기본 편의 공간',
    params: { variant: 'break', w: 6000, d: 4000, h: 2800 }, fields: [sel('variant', '용도', [['break', '휴게실'], ['locker', '탈의실'], ['toilet', '화장실'], ['canteen', '식당']]), num('w', '가로'), num('d', '세로'), num('h', '높이')],
    build: p => room(mm(p.w), mm(p.d), mm(p.h), false) });

  /* 6. machine accessories */
  fdef('control-cabinet', { name: '제어반 외함', group: 'accessory', grade: 1, kind: { cmd: 'add_block', type: 'control-cabinet' }, why: '설비를 제어하는 전기함', build: () => cabinet(0.8, 0.5, 2.0) });
  fdef('op-panel', { name: 'OP 조작반·펜던트', group: 'accessory', grade: 1, kind: { cmd: 'add_block', type: 'op-panel' }, why: '작업자가 설비를 시작·정지·비상정지하는 버튼', build: () => opPanel() });
  fdef('tower-lamp', { name: '타워램프', group: 'accessory', grade: 1, kind: { cmd: 'add_block', type: 'tower-lamp' }, why: '설비 상태(가동·정지·이상) 표시', build: () => { const g = new T.Group(); bx(g, 'frame', 0.12, 0.02, 0.12); cy(g, 'frame', 0.015, 1.6); lampStack(g, 0, 1.6, 0, 1.4); return g; } });
  fdef('andon-board', { name: '안돈 보드·대형 모니터', group: 'accessory', grade: 1, kind: { cmd: 'add_block', type: 'andon-board' }, why: '라인 상태를 보여 주는 지점',
    params: { mount: 2800 }, fields: [num('mount', '설치 높이')],
    build: p => { const g = new T.Group(), y = mm(p.mount); bx(g, 'frame', 0.06, y, 0.06); bx(g, 'dark', 1.8, 0.9, 0.08, 0, y - 0.2, 0.06); bx(g, 'screen', 1.7, 0.8, 0.01, 0, y - 0.15, 0.105); return g; } });

  /* 7. flow elements */
  fdef('workpiece', { name: '워크 기본형 (박스·원통·판재)', group: 'flow', grade: 1, kind: { cmd: 'add_block', type: 'workpiece' }, why: '라인을 흘러가는 제품',
    params: { variant: 'box', w: 300, d: 200, h: 150 }, fields: [sel('variant', '형상', [['box', '박스'], ['cylinder', '원통'], ['plate', '판재']]), num('w', '가로', 'mm', 10), num('d', '세로', 'mm', 10), num('h', '높이', 'mm', 10)],
    build: p => workShape(p.variant, mm(p.w), mm(p.d), mm(p.h)) });
  fdef('source', { name: '소스 (워크 생성)', group: 'flow', grade: 1, kind: { cmd: 'add_block', type: 'source' }, why: '워크가 생겨나는 시작점',
    params: { interval: 30 }, fields: [num('interval', '투입 간격', 's', 1, 1)], build: () => flowMark('source') });
  fdef('sink', { name: '싱크 (워크 소멸)', group: 'flow', grade: 1, kind: { cmd: 'add_block', type: 'sink' }, why: '완료(OK)·불량(NG) 워크가 빠지는 끝점',
    params: { variant: 'ok' }, fields: [sel('variant', '종류', [['ok', 'OK (완료)'], ['ng', 'NG (불량)']])], build: p => flowMark(p.variant === 'ng' ? 'ng' : 'sink') });

  /* 8. representative production machines (black boxes: envelope, infeed / outfeed, cycle, yield) */
  const rep = (id, name, process, size, card, build, opt = {}) => fdef(id, Object.assign({ name, group: opt.group || 'production', grade: opt.grade || 0, process,
    kind: { cmd: 'place_machine', ref: `lib:${id}@1` }, size, card, why: opt.why || process,
    params: { cycle_time: card[0], ok_rate: card[1] }, fields: [num('cycle_time', '사이클', 's', 0.5, 0), num('ok_rate', '양품률', '0~1', 0.01, 0)], build }, opt));
  rep('press', '기계식/서보 프레스 (단발·프로그레시브)', '1. 프레스·판금', [2400, 2000, 3600], [6, 0.995], () => { const g = new T.Group();
    bx(g, 'frame', 2.4, 0.6, 2.0); for (const s of [-1, 1]) bx(g, 'light', 0.45, 2.6, 1.4, s * 0.95, 0.6); bx(g, 'light', 2.4, 0.5, 1.6, 0, 3.1); const sl = bx(g, 'body', 1.4, 0.45, 1.2, 0, 2.0); sl.name = 'slide'; bx(g, 'steel', 1.4, 0.12, 1.2, 0, 0.6); bx(g, 'dark', 0.7, 0.4, 0.5, 1.25, 3.15, 0.2); return g; });
  rep('die-casting', '다이캐스팅 머신', '2. 주조·다이캐스팅', [7000, 2200, 2600], [55, 0.97], () => { const g = new T.Group();
    bx(g, 'frame', 7.0, 0.7, 2.0); bx(g, 'light', 0.5, 1.9, 2.0, -1.6, 0.7); bx(g, 'light', 0.5, 1.9, 2.0, 0.6, 0.7); bx(g, 'light', 0.6, 1.7, 1.8, -3.0, 0.7);
    for (const y of [1.1, 2.2]) for (const z of [-0.7, 0.7]) cy(g, 'steel', 0.08, 3.6, -1.2, y, z, 'x'); cy(g, 'body', 0.25, 2.2, 2.0, 1.4, 0, 'x'); bx(g, 'glass', 2.4, 1.6, 0.02, -0.5, 0.75, 1.02); bx(g, 'dark', 0.6, 0.5, 0.4, 3.0, 0.7, 0.6); return g; });
  rep('machining-center', '머시닝센터 (수직·수평)', '3. 기계가공', [2600, 2400, 2700], [180, 0.99], () => { const g = new T.Group();
    bx(g, 'light', 2.6, 2.5, 2.2); bx(g, 'dark', 1.2, 1.0, 0.02, -0.2, 0.9, 1.11); bx(g, 'glass', 1.0, 0.8, 0.01, -0.2, 1.0, 1.125); bx(g, 'body', 2.6, 0.2, 2.2, 0, 2.5); bx(g, 'dark', 0.4, 0.6, 0.15, 1.05, 1.1, 1.15); bx(g, 'screen', 0.3, 0.22, 0.01, 1.05, 1.4, 1.23); lampStack(g, 1.1, 2.7, -0.9); return g; });
  rep('heat-treat-furnace', '배치 열처리로', '4. 열처리·표면처리', [3200, 2600, 3000], [3600, 0.995], () => { const g = new T.Group();
    bx(g, 'body', 3.0, 2.6, 2.4); bx(g, 'frame', 1.6, 1.6, 0.15, 0, 0.4, 1.25); bx(g, 'accent', 1.6, 0.06, 0.16, 0, 2.0, 1.25); cy(g, 'steel', 0.18, 1.0, -1.0, 2.6, -0.6); bx(g, 'dark', 0.6, 1.8, 0.5, 1.8, 0, 0.6); bx(g, 'frame', 3.2, 0.3, 0.8, 0, 0, 1.7); return g; });
  rep('injection-molding', '사출성형기', '5. 플라스틱·고무', [6000, 1800, 2200], [40, 0.985], () => { const g = new T.Group();
    bx(g, 'frame', 6.0, 0.9, 1.5); bx(g, 'light', 2.4, 1.3, 1.6, -1.6, 0.9); bx(g, 'glass', 2.2, 1.0, 0.01, -1.6, 1.0, 0.81); cy(g, 'steel', 0.12, 2.6, 1.0, 1.5, 0, 'x'); bx(g, 'body', 1.0, 0.7, 0.9, 2.3, 0.9);
    const h = new T.Mesh(new T.CylinderGeometry(0.3, 0.08, 0.6, 16), mat('body')); h.position.set(1.6, 2.05, 0); g.add(h); bx(g, 'dark', 0.5, 0.6, 0.12, -0.2, 1.1, 0.8); return g; });
  rep('arc-weld-robot', '아크 용접 로봇 (전용 암 + 토치 케이블 내장)', '6. 접합', [3500, 3000, 2200], [45, 0.99], () => { const g = new T.Group();
    const f = F['safety-guard'].build({ variant: 'fence', length: 3.5 * 1000 }); f.position.z = -1.5; g.add(f); const f2 = f.clone(); f2.rotation.y = Math.PI / 2; f2.scale.x = 3 / 3.5; f2.position.set(-1.75, 0, 0); g.add(f2);
    bx(g, 'frame', 0.6, 0.6, 0.6, -0.6, 0, -0.4); arm(g, 1.25, -0.6, -0.4, 0.6); bx(g, 'body', 1.6, 0.8, 0.8, 0.8, 0, 0.3); cy(g, 'steel', 0.25, 1.0, 0.8, 1.0, 0.3, 'x'); bx(g, 'dark', 0.6, 1.0, 0.5, -1.2, 0, 1.1); return g; });
  rep('nutrunner', '너트러너 (단축·다축·핸들·로봇)', '7. 조립 — 기계류 (자동)', [1600, 1200, 2300], [20, 0.998], () => { const g = new T.Group();
    legs(g, 1.6, 1.2, 0.9); bx(g, 'body', 1.6, 0.08, 1.2, 0, 0.9); for (const s of [-1, 1]) bx(g, 'frame', 0.08, 1.4, 0.08, s * 0.7, 0.98, -0.5); bx(g, 'frame', 1.5, 0.12, 0.12, 0, 2.3, -0.5);
    const head = grp(g, 'head', 0, 1.6, -0.1); bx(head, 'light', 0.6, 0.35, 0.5); for (const x of [-0.18, 0, 0.18]) cy(head, 'steel', 0.03, 0.35, x, -0.35, 0.1); bx(g, 'steel', 0.6, 0.12, 0.4, 0, 0.98, -0.05); opPanelAt(g, 0.65, 0.98, 0.45); return g; });
  rep('manual-station', '셀형 수작업 스테이션', '7. 조립 — 기계류 (수작업)', [1800, 1500, 2200], [60, 0.99], () => { const g = workbench(1.8, 0.8); bx(g, 'frame', 1.8, 0.04, 0.04, 0, 2.0, -0.38); bx(g, 'glowW', 1.6, 0.02, 0.1, 0, 1.96, -0.2);
    for (let i = 0; i < 4; i++) bx(g, 'accent', 0.2, 0.12, 0.15, -0.6 + i * 0.4, 1.25, -0.3); person(g, 0, 0.75, -Math.PI / 2); return g; }, { operators: 1 });
  rep('smt-line', 'SMT 라인 (프린터·마운터·리플로우·AOI)', '8. 조립 — 전장·전자', [8000, 1500, 1600], [30, 0.995], () => { const g = new T.Group();
    const mods = [[1.2, 'light'], [1.4, 'light'], [1.4, 'light'], [2.6, 'body'], [1.0, 'light']]; let x = -4;
    for (const [w, r] of mods) { bx(g, r, w - 0.05, 1.4, 1.2, x + w / 2); bx(g, 'glass', w * 0.6, 0.3, 0.01, x + w / 2, 1.0, 0.61); bx(g, 'screen', 0.25, 0.18, 0.01, x + w / 2 + w * 0.3, 1.2, 0.61); lampStack(g, x + w - 0.15, 1.4, -0.45, 0.6); x += w; }
    bx(g, 'frame', 0.3, 0.9, 0.5, -4.15); bx(g, 'frame', 0.3, 0.9, 0.5, 4.15); return g; });
  rep('vision-inspection', '2D/3D 비전 검사', '10. 검사·측정', [1600, 1200, 2100], [8, 0.98], () => { const g = new T.Group();
    const c = conveyorShape('belt', 1.6, 0.5, 0.8); g.add(c); for (const s of [-1, 1]) bx(g, 'frame', 0.08, 1.3, 0.08, 0, 0.8, s * 0.5); bx(g, 'frame', 0.08, 0.08, 1.08, 0, 2.05); bx(g, 'dark', 0.14, 0.2, 0.14, 0, 1.75); flatRing(g, 'glowW', 0.08, 0.12, 1.74); bx(g, 'body', 0.6, 0.9, 0.5, 0.6, 0, 0.75); return g; });
  rep('handling-robot', '6축 다관절 핸들링 (소·중형, ~50kg)', '13. 로봇 (핸들링)', [1500, 1500, 2200], [12, 0.999], () => { const g = new T.Group(); bx(g, 'frame', 0.6, 0.5, 0.6); arm(g, 1.4, 0, 0, 0.5); bx(g, 'body', 0.5, 0.8, 0.4, -0.6, 0, 0.55); flatRing(g, 'mark', 1.45, 1.5); return g; });
  rep('vacuum-brazing-furnace', '브레이징 — 진공 브레이징로 (배치형)', '선택: 용접 모듈 예시 라인', [5000, 2800, 2800], [5400, 0.99], () => { const g = new T.Group();
    for (const x of [-1.4, 0, 1.4]) bx(g, 'frame', 0.3, 0.6, 1.8, x); const v = cy(g, 'light', 1.1, 3.6, 0, 1.7, 0, 'x', 32); v.castShadow = true; cy(g, 'body', 1.15, 0.2, 1.85, 1.7, 0, 'x', 32); cy(g, 'steel', 0.25, 1.2, -0.8, 2.6, 0); bx(g, 'dark', 0.8, 1.9, 0.6, -2.2, 0, 1.0); bx(g, 'body', 0.9, 1.0, 0.8, 2.2, 0, -0.9); return g; }, { group: 'option', why: '용접 모듈 예시 라인의 핵심 공정' });
  rep('leak-tester', '리크 테스터 (공압·헬륨)', '선택: 용접 모듈 예시 라인', [1600, 1200, 2200], [40, 0.98], () => { const g = new T.Group();
    legs(g, 1.6, 1.2, 0.85); bx(g, 'body', 1.6, 0.06, 1.2, 0, 0.85); const ch = grp(g, 'chamber', 0, 0.91, -0.05); bx(ch, 'light', 1.0, 0.6, 0.8); bx(ch, 'glass', 0.7, 0.35, 0.01, 0, 0.15, 0.405); cabinetAt(g, 0.65, 1.3, 0.55, 0.62); for (const z of [-0.2, 0.2]) cy(g, 'body', 0.12, 0.9, -0.6, 0, z - 0.4); return g; }, { group: 'option', why: '용접 모듈 예시 라인의 필수 검사' });

  /* shared shapes */
  function conveyorShape(variant, L, W, H) {
    const g = new T.Group(); const n = Math.max(2, Math.round(L / 1.2) + 1);
    for (let i = 0; i < n; i++) { const x = -L / 2 + 0.08 + ((L - 0.16) * i) / (n - 1); for (const s of [-1, 1]) bx(g, 'frame', 0.05, H - 0.08, 0.05, x, 0, s * (W / 2 - 0.05)); }
    for (const s of [-1, 1]) bx(g, 'frame', L, 0.1, 0.05, 0, H - 0.1, s * (W / 2 + 0.01));
    const top = grp(g, 'belt', 0, H - 0.03, 0);
    if (variant === 'roller') { const k = Math.floor(L / 0.1); const rg = new T.CylinderGeometry(0.025, 0.025, W - 0.04, 12); rg.rotateX(Math.PI / 2);
      const im = new T.InstancedMesh(rg, mat('steel'), k); const m4 = new T.Matrix4(); for (let i = 0; i < k; i++) { m4.makeTranslation(-L / 2 + 0.05 + i * 0.1, 0, 0); im.setMatrixAt(i, m4); } im.castShadow = im.receiveShadow = true; top.add(im);
      // one dark mark per roller, so you can see the rollers turn when the conveyor runs
      const mk = new T.InstancedMesh(new T.BoxGeometry(0.014, 0.006, W - 0.07), mat('dark'), k); mk.name = 'rmarks'; mk.userData = { k, L }; top.add(mk); conveyorPose(g, 0); }
    else if (variant === 'chain') { for (const s of [-1, 1]) bx(top, 'dark', L, 0.04, 0.06, 0, -0.02, s * W * 0.3); }
    else { bx(top, variant === 'timing' ? 'dark' : 'rubber', L, 0.03, W - 0.04, 0, -0.015);
      // cross stripes on the belt that travel with it
      const st = grp(top, 'stripes'); st.userData.L = L; for (let i = 0; i < Math.floor(L / 0.25); i++) bx(st, 'steel', 0.02, 0.002, W - 0.08, 0, 0.015); conveyorPose(g, 0); cy(g, 'steel', 0.04, W, -L / 2, H - 0.05, 0, 'z'); cy(g, 'steel', 0.04, W, L / 2, H - 0.05, 0, 'z'); }
    g.userData.top = H; return g;
  }
  // conveyor motion: s = belt travel in mm (the BELT joint value)
  const m4a = new T.Matrix4(), m4b = new T.Matrix4(), m4c = new T.Matrix4();
  function conveyorPose(g, s) { const m = (s || 0) / 1000;
    const mk = g.getObjectByName('rmarks'); if (mk) { const { k, L } = mk.userData, a = -m / 0.025;
      for (let i = 0; i < k; i++) { m4a.makeTranslation(-L / 2 + 0.05 + i * 0.1, 0, 0); m4b.makeRotationZ(a); m4c.makeTranslation(0, 0.026, 0); mk.setMatrixAt(i, m4a.multiply(m4b).multiply(m4c)); } mk.instanceMatrix.needsUpdate = true; }
    const st = g.getObjectByName('stripes'); if (st) { const L = st.userData.L, n = st.children.length, gap = L / n; st.children.forEach((c, i) => { c.position.x = -L / 2 + 0.01 + (((i * gap + m) % L) + L) % L * ((L - 0.02) / L); }); } }
  function workbench(w, d) { const g = new T.Group(); legs(g, w, d, 0.85, 0.05, 0.04); bx(g, 'light', w, 0.04, d, 0, 0.85); bx(g, 'frame', w, 0.03, d - 0.1, 0, 0.18); for (const s of [-1, 1]) bx(g, 'frame', 0.04, 1.1, 0.04, s * (w / 2 - 0.05), 0.89, -d / 2 + 0.05); bx(g, 'body', w - 0.1, 0.03, 0.3, 0, 1.4, -d / 2 + 0.2); return g; }
  function room(w, d, h, office) { const g = new T.Group(); flatRect(g, 'body', w, d, 0.002);
    const wall = (L, x, z, ry, glass) => { const s = new T.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s); bx(s, 'light', L, glass ? 1.0 : h, 0.1); if (glass) { bx(s, 'glass', L, h - 1.0, 0.03, 0, 1.0); bx(s, 'frame', L, 0.06, 0.1, 0, h - 0.06); } };
    wall(w, 0, d / 2, 0, office); wall(w, 0, -d / 2, 0, false); wall(d, -w / 2, 0, Math.PI / 2, false); wall(d, w / 2, 0, Math.PI / 2, office);
    bx(g, 'body', w, 0.06, d, 0, h); if (office) { for (let i = 0; i < Math.max(1, Math.floor(w / 2)); i++) bx(g, 'light', 1.2, 0.74, 0.6, -w / 2 + 1 + i * 2, 0, -d / 4); } else { bx(g, 'light', 1.8, 0.74, 0.9, 0, 0, 0); } return g; }
  function cabinet(w, d, h) { const g = new T.Group(); cabinetAt(g, 0, w, d, h); return g; }
  function cabinetAt(g, x, w, d, h) { bx(g, 'frame', w, 0.1, d, x); bx(g, 'light', w, h - 0.1, d, x, 0.1); bx(g, 'body', 0.01, h * 0.7, 0.02, x + w * 0.3, h * 0.2, d / 2 + 0.01); bx(g, 'dark', w * 0.5, 0.25, 0.01, x, h * 0.7, d / 2 + 0.005); }
  function opPanel() { const g = new T.Group(); opPanelAt(g, 0, 0, 0); return g; }
  function opPanelAt(g, x, y, z) { bx(g, 'frame', 0.06, 1.1, 0.06, x, y, z); const b = bx(g, 'light', 0.4, 0.3, 0.18, x, y + 1.1, z); b.rotation.x = -0.4; sp(g, 'glowR', 0.03, x + 0.12, y + 1.3, z + 0.08); sp(g, 'glowG', 0.025, x - 0.05, y + 1.3, z + 0.08); bx(g, 'screen', 0.14, 0.1, 0.01, x - 0.05, y + 1.22, z + 0.09); }
  function workShape(v, w, d, h) { const g = new T.Group(); if (v === 'cylinder') cy(g, 'work', Math.min(w, d) / 2, h, 0, 0, 0, 'y', 24); else if (v === 'plate') bx(g, 'steel', w, Math.min(h, 0.02), d); else bx(g, 'work', w, h, d); return g; }
  function flowMark(kind) { const g = new T.Group(); const r = 0.5; flatRing(g, kind === 'ng' ? 'glowR' : kind === 'source' ? 'glowG' : 'glowA', r - 0.05, r, 0.01);
    const a = new T.Mesh(new T.ConeGeometry(0.16, 0.3, 3), mat(kind === 'ng' ? 'glowR' : kind === 'source' ? 'glowG' : 'glowA')); a.rotation.z = -Math.PI / 2; a.rotation.x = -Math.PI / 2; a.position.set(kind === 'source' ? 0.1 : -0.1, 0.02, 0); a.scale.y = 0.2; g.add(a); return g; }

  /* builders for items stored in dedicated collections */
  const special = {
    column: p => { const g = new T.Group(), s = mm(p.size || 500); bx(g, 'body', s, p.h || 7, s); bx(g, 'accent', s + 0.04, 1.0, s + 0.04, 0, 0); return g; },
    opening: (kind, p) => { const g = new T.Group(), w = mm(p.w || (kind === 'shutter' ? 3500 : kind === 'dock' ? 3000 : 1000)), h = mm(p.h || (kind === 'shutter' ? 4000 : kind === 'dock' ? 3200 : 2100));
      bx(g, 'frame', 0.08, h, 0.3, -w / 2 - 0.04); bx(g, 'frame', 0.08, h, 0.3, w / 2 + 0.04); bx(g, 'frame', w + 0.16, 0.1, 0.3, 0, h);
      if (kind === 'shutter') { bx(g, 'body', w, h * 0.92, 0.05, 0, h * 0.08); bx(g, 'dark', w + 0.1, 0.4, 0.45, 0, h + 0.1); }
      else if (kind === 'dock') { bx(g, 'body', w, h * 0.9, 0.05, 0, 1.2); bx(g, 'dark', w + 0.6, 0.2, 2.0, 0, 1.0, -1.1); bx(g, 'dark', w + 0.8, h - 0.8, 0.5, 0, 1.2, -0.35).material = mat('rubber'); bx(g, 'accent', w, 0.06, 0.2, 0, 1.2, 0.12); }
      else { bx(g, kind === 'exit' ? 'body' : 'light', w, h, 0.05); if (kind === 'exit') bx(g, 'glowG', 0.5, 0.2, 0.04, 0, h + 0.2, 0.1); }
      return g; },
    drop: (kind) => { const g = new T.Group(); bx(g, 'frame', 0.06, 6, 0.06); if (kind === 'air') { cy(g, 'accent', 0.03, 1.2, 0, 1.2, 0.06); bx(g, 'light', 0.18, 0.35, 0.12, 0, 1.1, 0.08); cy(g, 'body', 0.04, 0.1, 0, 0.95, 0.12); } else { bx(g, 'light', 0.3, 0.4, 0.15, 0, 1.4, 0.08); bx(g, 'dark', 0.1, 0.1, 0.01, 0, 1.55, 0.16); } return g; },
    storage: (kind, p) => { if (kind === 'floor') { const g = new T.Group(), w = mm(p.w || 4000), d = mm(p.d || 3000); frameRect(g, 'mark', w, d, 0.08); for (let i = 0; i < Math.floor(w / 1.4); i++) { const c = F.container.build({ variant: 'pallet', stack: 1 }); c.position.set(-w / 2 + 0.8 + i * 1.4, 0, 0); g.add(c); } return g; } return rack(p); },
    mover: (kind, p) => kind === 'worker' ? (() => { const g = new T.Group(); person(g); return g; })() : kind === 'forklift' ? forklift() : amr(p.variant),
    marking: (kind, p) => { const g = new T.Group(), L = mm(p.length || 8000), W = mm(p.width || 3000);
      if (kind === 'aisle') { flatRect(g, 'mark', L, 0.1, 0.004, 0, -W / 2); flatRect(g, 'mark', L, 0.1, 0.004, 0, W / 2); for (let x = -L / 2 + 1; x < L / 2 - 0.5; x += 3) { const a = new T.Mesh(new T.ConeGeometry(0.2, 0.5, 3).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), mat('markw')); a.scale.y = 0.02; a.position.set(x, 0.004, 0); g.add(a); } }
      else { frameRect(g, kind === 'safety' ? 'accent' : 'markw', L, W, 0.1, 0.004); if (kind === 'safety') for (let x = -L / 2 + 0.3; x < L / 2; x += 0.6) { const s = flatRect(g, 'accent', 0.1, 0.4, 0.005, x, -W / 2 + 0.3); s.rotation.y = 0.6; } }
      return g; },
    roof: (p, w, d, eave) => { const g = new T.Group(); if (p.type === 'flat') { bx(g, 'body', w, 0.3, d, 0, eave); return g; }
      const rise = Math.min(3, d * 0.12), half = Math.hypot(d / 2, rise), ang = Math.atan2(rise, d / 2);
      for (const s of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(w, 0.12, half), mat('body')); m.position.set(0, eave + rise / 2, s * d / 4); m.rotation.x = s * ang; m.castShadow = true; g.add(m); }
      return g; },
    wall: (L, H, t) => { const g = new T.Group(); bx(g, 'wall', L, H, t); bx(g, 'frame', L, 1.2, t + 0.02, 0, 0); bx(g, 'light', L, 0.06, t + 0.02, 0, H - 0.06); return g; },
  };
  function rack(p) { const g = new T.Group(), bays = Math.max(1, p.bays | 0 || 2), lv = Math.max(1, p.levels | 0 || 3);
    if (p.variant === 'shelf') { const w = 1.0, d = 0.6, h = 0.45; for (let b = 0; b <= bays; b++) for (const s of [-1, 1]) bx(g, 'frame', 0.04, lv * h + 0.2, 0.04, -bays * w / 2 + b * w, 0, s * (d / 2 - 0.02)); for (let l = 0; l <= lv; l++) bx(g, 'body', bays * w, 0.03, d, 0, 0.1 + l * h); return g; }
    if (p.variant === 'cantilever') { const L = bays * 1.5; bx(g, 'frame', L, 0.1, 1.2); for (let b = 0; b <= bays; b++) { const x = -L / 2 + b * 1.5; bx(g, 'frame', 0.15, lv * 0.6 + 0.4, 0.15, x, 0.1, -0.5); for (let l = 1; l <= lv; l++) bx(g, 'accent', 0.08, 0.08, 1.0, x, 0.1 + l * 0.6, 0); } return g; }
    const w = 2.7, d = 1.1, h = 1.5; for (let b = 0; b <= bays; b++) for (const s of [-1, 1]) bx(g, 'accent', 0.08, lv * h + 0.3, 0.08, -bays * w / 2 + b * w, 0, s * (d / 2 - 0.04));
    for (let l = 1; l <= lv; l++) for (const s of [-1, 1]) bx(g, 'frame', bays * w, 0.1, 0.05, 0, l * h - 0.1, s * (d / 2 - 0.04));
    for (let l = 0; l < lv; l++) for (let b = 0; b < bays; b++) for (const k of [-0.65, 0.65]) { const c = F.container.build({ variant: 'pallet', stack: 1 }); c.scale.setScalar(0.95); c.rotation.y = Math.PI / 2; c.position.set(-bays * w / 2 + (b + 0.5) * w + k, l * h + (l ? 0 : 0.05), 0); g.add(c); if ((l + b) % 2 === 0) bx(g, 'body', 1.0, 0.8, 0.9, -bays * w / 2 + (b + 0.5) * w + k, l * h + 0.2); }
    return g; }
  function forklift() { const g = new T.Group(); bx(g, 'accent', 1.6, 0.9, 1.1, -0.2, 0.15); bx(g, 'dark', 0.6, 0.5, 1.0, -0.8, 0.15); for (const sx of [-0.7, 0.4]) for (const s of [-1, 1]) cy(g, 'rubber', 0.22, 0.2, sx, 0.22, s * 0.5, 'z');
    for (const s of [-1, 1]) { bx(g, 'frame', 0.06, 2.2, 0.06, -0.1 + s * 0, 1.05, s * 0.5); bx(g, 'frame', 0.06, 2.1, 0.06, 0.65, 0.1, s * 0.35); bx(g, 'steel', 1.1, 0.05, 0.12, 1.2, 0.1, s * 0.3); }
    bx(g, 'frame', 0.06, 0.06, 1.0, -0.1, 3.2); bx(g, 'body', 0.4, 0.06, 0.5, -0.2, 1.05); return g; }
  function amr(v) { const g = new T.Group(); if (v === 'rgv') { bx(g, 'frame', 1.6, 0.06, 0.08, 0, 0, -0.35); bx(g, 'frame', 1.6, 0.06, 0.08, 0, 0, 0.35); }
    bx(g, 'light', 1.0, 0.3, 0.7, 0, 0.04); bx(g, 'glowA', 1.0, 0.03, 0.01, 0, 0.18, 0.355); bx(g, 'dark', 0.12, 0.08, 0.2, 0.5, 0.15); if (v === 'agv') bx(g, 'body', 0.8, 0.05, 0.6, 0, 0.34); else cy(g, 'body', 0.3, 0.05, 0, 0.34, 0); return g; }

  // build any factory asset; `kind` for items that live in dedicated collections
  function buildFactory(id, p = {}) {
    const d = F[id]; if (!d) return new T.Group();
    const q = Object.assign({}, d.params, p);
    if (d.build) return d.build(q);
    const k = d.kind;
    if (k.cmd === 'add_column') return special.column(q);
    if (k.cmd === 'add_opening') return special.opening(k.kind, q);
    if (k.cmd === 'add_drop') return special.drop(k.kind);
    if (k.cmd === 'add_storage') return special.storage(k.kind, q);
    if (k.cmd === 'add_mover') return special.mover(k.kind, q);
    if (k.cmd === 'add_marking') return special.marking(q.variant, q);
    return new T.Group();
  }

  const FACTORY_GROUPS = [
    { id: 'building', name: '공장 건물', note: '공장 껍데기와 사람·물건이 드나드는 곳' },
    { id: 'power', name: '전기·공압', note: '설비를 돌리는 데 필요한 전기와 압축공기' },
    { id: 'fire', name: '소방·안전', note: '화재 대비와 사람·설비 보호' },
    { id: 'logistics', name: '물류·보관', note: '워크·자재를 옮기고 쌓아 두는 것' },
    { id: 'people', name: '사람·지원 공간', note: '일하는 사람과 그 사람이 쓰는 공간' },
    { id: 'accessory', name: '설비 공통 부속·표시', note: '제어·조작·상태 표시 장치' },
    { id: 'flow', name: '흐름 요소', note: '워크가 라인을 흘러가게 하는 요소' },
    { id: 'production', name: '생산 설비 대표', note: '공정 분류마다 대표 설비 (블랙박스 카드)' },
    // group 'option' (the old welding-module example line's furnace and leak tester) is no longer in the palette;
    // the defs stay so factories saved with them still open
  ];

  /* ------------------------------------------------------------------ machine-builder blocks */
  // code: tag prefix letters; joints(P, p) / io(P, p): what add_block brings; top(p): height a block placed on it sits at (m)
  // pose(g, p, v, tag): run mode, v = joint values by short name, tag(name) = signal value
  const MACHINE_CATS = [
    { id: 'structure', name: '구조' }, { id: 'transport', name: '반송' }, { id: 'pneumatic', name: '공압' }, { id: 'electric', name: '전동' },
    { id: 'robot', name: '로봇' }, { id: 'sensor', name: '센서' }, { id: 'work', name: '워크·용기' }, { id: 'feeder', name: '피더' }, { id: 'process', name: '공정' },
  ]; // blocks of cat 'model' (모델 객체) come with a plant station and are not in the palette
  const B = {};
  const bdef = (id, o) => { B[id] = Object.assign({ id, params: {}, fields: [], joints: () => [], io: () => [], top: () => 0, onTop: false }, o); };
  const J = (id, type, axis, mode, min, max, vmax, amax) => ({ id, type, axis, mode, min, max, home: min, vmax, amax, verified: { vmax: false, amax: false } });
  const out = (tag, type = 'bool', binding) => ({ tag, dir: 'out', type, ...(binding ? { binding } : {}) });
  const inn = (tag, type = 'bool', binding) => ({ tag, dir: 'in', type, ...(binding ? { binding } : {}) });

  bdef('frame', { cls: 'frame', name: '프레임 (테이블)', cat: 'structure', code: 'FR', params: { w: 1200, d: 800, h: 850 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이', 'mm', 10)],
    top: p => mm(p.h), heightKey: 'h', build: p => { const g = new T.Group(); legs(g, mm(p.w), mm(p.d), mm(p.h) - 0.03); bx(g, 'body', mm(p.w), 0.03, mm(p.d), 0, mm(p.h) - 0.03); bx(g, 'frame', mm(p.w), 0.04, mm(p.d) - 0.1, 0, 0.12); return g; } });
  bdef('pedestal', { cls: 'column', name: '로봇 단상 (받침대)', cat: 'structure', code: 'PD', params: { w: 700, d: 700, h: 600 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이', 'mm', 10)], heightKey: 'h',
    top: p => mm(p.h), build: p => { const g = new T.Group(), w = mm(p.w), d = mm(p.d), h = mm(p.h); bx(g, 'frame', w, 0.03, d); bx(g, 'body', w * 0.7, Math.max(0.02, h - 0.06), d * 0.7, 0, 0.03); bx(g, 'light', w * 0.85, 0.03, d * 0.85, 0, h - 0.03); return g; } });
  bdef('base-plate', { name: '베이스 플레이트', cat: 'structure', code: 'BP', params: { w: 800, d: 600, t: 25 }, fields: [num('w', '가로'), num('d', '세로'), num('t', '두께', 'mm', 5)], onTop: true,
    top: p => mm(p.t), build: p => { const g = new T.Group(); bx(g, 'steel', mm(p.w), mm(p.t), mm(p.d)); return g; } });
  bdef('post', { name: '기둥 프로파일', cat: 'structure', code: 'PT', params: { h: 1200, s: 60 }, fields: [num('h', '높이', 'mm', 10), num('s', '단면', 'mm', 5)], onTop: true,
    top: p => mm(p.h), build: p => { const g = new T.Group(); bx(g, 'frame', mm(p.s), mm(p.h), mm(p.s)); return g; } });
  bdef('cover', { cls: 'guard', name: '커버·안전 가드', cat: 'structure', code: 'GD', params: { w: 1200, h: 1200 }, fields: [num('w', '가로'), num('h', '높이')], onTop: true,
    build: p => { const g = new T.Group(); bx(g, 'glass', mm(p.w), mm(p.h), 0.01); bx(g, 'frame', mm(p.w), 0.03, 0.03, 0, mm(p.h) - 0.03); bx(g, 'frame', mm(p.w), 0.03, 0.03); for (const s of [-1, 1]) bx(g, 'frame', 0.03, mm(p.h), 0.03, s * mm(p.w) / 2); return g; } });
  bdef('control-cabinet', { cls: 'utility', name: '제어반 외함', cat: 'structure', code: 'CP', params: { w: 600, d: 400, h: 1800 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이')], build: p => cabinet(mm(p.w), mm(p.d), mm(p.h)) });
  bdef('op-panel', { cls: 'monitor', name: 'OP 조작반', cat: 'structure', code: 'OP', build: () => opPanel(),
    io: P => [inn(`${P}_START_PB`), inn(`${P}_STOP_PB`), inn(`${P}_ESTOP`)] });
  bdef('tower-lamp', { cls: 'lamp', name: '타워램프', cat: 'structure', code: 'TL', onTop: true, build: () => { const g = new T.Group(); cy(g, 'frame', 0.012, 0.3); lampStack(g, 0, 0.3, 0, 1.2); return g; },
    io: P => [out(`${P}_RED`), out(`${P}_YEL`), out(`${P}_GRN`)],
    pose: (g, p, v, tag, P) => { const set = (n, on, role) => { const m = g.getObjectByName(n); if (m) m.material = on ? mat(role) : mat('dark'); };
      set('lamp_red', tag(`${P}_RED`), 'glowR'); set('lamp_yel', tag(`${P}_YEL`), 'glowA'); set('lamp_grn', tag(`${P}_GRN`), 'glowG'); } });

  const convIo = (P, p) => [out(`${P}_RUN`, 'bool', { kind: 'joint', target: `${P}_BELT` }), out(`${P}_DIR`), out(`${P}_SPEED`, 'real'), inn(`${P}_FAULT`)];
  for (const [id, name, v] of [['belt-conveyor', '벨트 컨베이어', 'belt'], ['roller-conveyor', '롤러 컨베이어', 'roller']]) bdef(id, { name, cat: 'transport', code: 'CV',
    params: { length: 3000, w: 500, h: 900, speed: 300 }, fields: [num('length', '길이'), num('w', '폭', 'mm', 10), num('h', '반송 높이', 'mm', 10), num('speed', '속도', 'mm/s', 10)],
    top: p => mm(p.h), conveyor: true, heightKey: 'h', pose: (g, p, v) => conveyorPose(g, v.BELT),
    joints: (P, p) => [J(`${P}_BELT`, 'lin', [1, 0, 0], 'continuous', 0, p.length, p.speed, 1000)], io: convIo,
    build: p => conveyorShape(v, mm(p.length), mm(p.w), mm(p.h)) });
  // a 90° curve: rollers fan out between an inner and an outer rail, so the line turns without a seam.
  // Stored frame: origin = centre of the arc, the work enters at (0, ∓r) heading +X and leaves at (r, 0) heading ±Y
  // (turn 'left' = to +Y, 'right' = to −Y). Shared with the run logic through curveGeom().
  bdef('curve-conveyor', { name: '커브 컨베이어 (90°)', cat: 'transport', code: 'CV', curve: true, heightKey: 'h', params: { r: 750, w: 500, h: 900, speed: 300, turn: 'left' },
    fields: [sel('turn', '방향', [['left', '왼쪽으로'], ['right', '오른쪽으로']]), num('r', '중심 반경', 'mm', 10), num('w', '폭', 'mm', 10), num('h', '반송 높이', 'mm', 10), num('speed', '속도', 'mm/s', 10)],
    top: p => mm(p.h), joints: (P, p) => [J(`${P}_BELT`, 'lin', [1, 0, 0], 'continuous', 0, Math.PI / 2 * p.r, p.speed, 1000)], io: convIo,
    build: p => { const g = new T.Group(), R = mm(p.r), W = mm(p.w), H = mm(p.h), sg = p.turn === 'right' ? -1 : 1, th = u => sg * (-Math.PI / 2) * (1 - u);
      const at = (r, t) => [r * Math.cos(t), -r * Math.sin(t)];
      for (const rr of [R - W / 2 - 0.01, R + W / 2 + 0.01]) for (let i = 0; i < 16; i++) { const t0 = th(i / 16), t1 = th((i + 1) / 16), a = at(rr, t0), b = at(rr, t1), m = bx(g, 'frame', Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.004, 0.1, 0.05, (a[0] + b[0]) / 2, H - 0.1, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); }
      const rl = grp(g, 'rollers'); const n = Math.max(6, Math.round(R * Math.PI / 2 / 0.1));
      for (let i = 0; i <= n; i++) { const t = th((i + 0.5) / (n + 1)), c = at(R, t), k = grp(rl, 'r', c[0], H - 0.03, c[1]); k.rotation.y = t; cy(k, 'steel', 0.025, W - 0.04, 0, 0, 0, 'x', 12); bx(k, 'dark', W - 0.07, 0.006, 0.014, 0, 0.023, 0); }
      for (const u of [0.04, 0.5, 0.96]) for (const rr of [R - W / 2 + 0.05, R + W / 2 - 0.05]) { const c = at(rr, th(u)); bx(g, 'frame', 0.05, H - 0.08, 0.05, c[0], 0, c[1]); }
      return g; } });
  // a square module where a line turns 90°: the work rides in, stops on the centre, and leaves on the conveyor at its side
  bdef('transfer-corner', { name: '직각 전환 유닛 (턴테이블)', cat: 'transport', code: 'CT', corner: true, heightKey: 'h', params: { w: 500, h: 900 }, fields: [num('w', '크기', 'mm', 10), num('h', '반송 높이', 'mm', 10)],
    top: p => mm(p.h), io: P => [out(`${P}_RUN`), inn(`${P}_FAULT`)],
    build: p => { const g = new T.Group(), W = mm(p.w), H = mm(p.h); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 'frame', 0.05, H - 0.08, 0.05, sx * (W / 2 - 0.05), 0, sz * (W / 2 - 0.05));
      bx(g, 'frame', W, 0.08, W, 0, H - 0.12); const t = grp(g, 'table', 0, H - 0.04); cy(t, 'steel', W * 0.46, 0.03, 0, 0, 0, 'y', 32); for (let i = -2; i <= 2; i++) bx(t, 'light', W * 0.8, 0.012, 0.03, 0, 0.03, i * W * 0.16); return g; } });
  bdef('stopper', { name: '스토퍼', cat: 'transport', code: 'STP', onTop: true, params: { stroke: 30 }, fields: [num('stroke', '스트로크', 'mm', 5)],
    joints: (P, p) => [J(`${P}_Z`, 'lin', [0, 0, 1], 'onoff', 0, p.stroke, 150, 2000)],
    io: P => [out(`${P}_UP`, 'bool', { kind: 'joint', target: `${P}_Z` }), inn(`${P}_IS_UP`, 'bool', { kind: 'sensor', target: `${P}_Z:max` }), inn(`${P}_IS_DOWN`, 'bool', { kind: 'sensor', target: `${P}_Z:min` })],
    build: () => { const g = new T.Group(); bx(g, 'frame', 0.08, 0.02, 0.12, 0, -0.12); bx(g, 'body', 0.06, 0.1, 0.08, 0, -0.1); const r = grp(g, 'rod'); bx(r, 'accent', 0.03, 0.05, 0.06, 0, -0.035); return g; },
    pose: (g, p, v) => { const r = g.getObjectByName('rod'); if (r) r.position.y = mm(v.Z || 0); }, stops: true });
  // a lift with its own driven rollers (리프트 컨베이어): it takes the work from a conveyor, carries it up or down to
  // the other level and rolls it off there. h = roller height at the lower stop, stroke = how far it rises.
  bdef('lift-conveyor', { name: '리프트 컨베이어 (승강 롤러)', cat: 'transport', code: 'LCV', conveyor: true, lift: true, heightKey: 'h',
    params: { length: 600, w: 500, h: 450, stroke: 450, speed: 300 }, fields: [num('length', '길이'), num('w', '폭', 'mm', 10), num('h', '아래 반송 높이', 'mm', 10), num('stroke', '승강 거리', 'mm', 10), num('speed', '롤러 속도', 'mm/s', 10)],
    top: p => mm(p.h), joints: (P, p) => [J(`${P}_Z`, 'lin', [0, 0, 1], 'onoff', 0, p.stroke, 250, 1000), J(`${P}_BELT`, 'lin', [1, 0, 0], 'continuous', 0, p.length, p.speed, 1000)],
    io: P => [out(`${P}_UP`, 'bool', { kind: 'joint', target: `${P}_Z` }), inn(`${P}_IS_UP`, 'bool', { kind: 'sensor', target: `${P}_Z:max` }), inn(`${P}_IS_DOWN`, 'bool', { kind: 'sensor', target: `${P}_Z:min` }),
      out(`${P}_RUN`, 'bool', { kind: 'joint', target: `${P}_BELT` }), out(`${P}_DIR`), inn(`${P}_PRESENT`, 'bool', { kind: 'sensor', target: 'work' })],
    build: p => { const g = new T.Group(), Lm = mm(p.length), W = mm(p.w), H = mm(p.h), top = H + mm(p.stroke) + 0.12;
      bx(g, 'frame', Lm + 0.1, 0.04, W + 0.16); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 'frame', 0.06, top, 0.06, sx * (Lm / 2 - 0.03), 0, sz * (W / 2 + 0.05));
      for (const sz of [-1, 1]) bx(g, 'frame', Lm, 0.05, 0.06, 0, top - 0.05, sz * (W / 2 + 0.05));
      const c = grp(g, 'carriage'); cy(c, 'steel', 0.04, Math.max(0.05, H - 0.14), 0, 0.04); bx(c, 'body', Lm - 0.04, 0.05, W - 0.02, 0, H - 0.14);
      for (const sz of [-1, 1]) bx(c, 'accent', Lm - 0.02, 0.09, 0.04, 0, H - 0.1, sz * (W / 2 + 0.005));
      const belt = grp(c, 'belt', 0, H - 0.03, 0), k = Math.max(2, Math.floor(Lm / 0.1)); const rg = new T.CylinderGeometry(0.025, 0.025, W - 0.04, 12); rg.rotateX(Math.PI / 2);
      const im = new T.InstancedMesh(rg, mat('steel'), k), m4 = new T.Matrix4(); for (let i = 0; i < k; i++) { m4.makeTranslation(-Lm / 2 + 0.05 + i * 0.1, 0, 0); im.setMatrixAt(i, m4); } im.castShadow = im.receiveShadow = true; belt.add(im);
      const mk = new T.InstancedMesh(new T.BoxGeometry(0.014, 0.006, W - 0.07), mat('dark'), k); mk.name = 'rmarks'; mk.userData = { k, L: Lm }; belt.add(mk); conveyorPose(g, 0); g.userData.top = H; return g; },
    pose: (g, p, v) => { const c = g.getObjectByName('carriage'); if (c) c.position.y = mm(v.Z || 0); conveyorPose(g, v.BELT); } });
  bdef('lifter', { name: '리프터 (테이블)', cat: 'transport', code: 'LFT', params: { w: 600, d: 500, stroke: 200 }, fields: [num('w', '가로'), num('d', '세로'), num('stroke', '스트로크', 'mm', 5)],
    top: p => 0.45, joints: (P, p) => [J(`${P}_Z`, 'lin', [0, 0, 1], 'onoff', 0, p.stroke, 120, 1000)],
    io: P => [out(`${P}_UP`, 'bool', { kind: 'joint', target: `${P}_Z` }), inn(`${P}_IS_UP`, 'bool', { kind: 'sensor', target: `${P}_Z:max` }), inn(`${P}_IS_DOWN`, 'bool', { kind: 'sensor', target: `${P}_Z:min` })],
    build: p => { const g = new T.Group(); bx(g, 'frame', mm(p.w), 0.08, mm(p.d)); cy(g, 'steel', 0.04, 0.35, 0, 0.08); const t = grp(g, 'table', 0, 0.42); bx(t, 'body', mm(p.w), 0.03, mm(p.d)); return g; },
    pose: (g, p, v) => { const t = g.getObjectByName('table'); if (t) t.position.y = 0.42 + mm(v.Z || 0); } });

  bdef('cylinder', { name: '공압 실린더', cat: 'pneumatic', code: 'CYL', onTop: true, params: { stroke: 100, bore: 32 }, fields: [num('stroke', '스트로크', 'mm', 5), num('bore', '보어', 'mm', 2)],
    joints: (P, p) => [J(`${P}_X`, 'lin', [1, 0, 0], 'onoff', 0, p.stroke, 300, 3000)],
    io: P => [out(`${P}_EXT`, 'bool', { kind: 'joint', target: `${P}_X` }), inn(`${P}_IS_EXT`, 'bool', { kind: 'sensor', target: `${P}_X:max` }), inn(`${P}_IS_RET`, 'bool', { kind: 'sensor', target: `${P}_X:min` })],
    build: p => { const g = new T.Group(), L = mm(p.stroke) + 0.08, r = mm(p.bore) / 2 + 0.006; bx(g, 'frame', L + 0.04, 0.02, r * 3); cy(g, 'light', r, L, -0.02, 0.02 + r, 0, 'x'); const rod = grp(g, 'rod', L / 2 - 0.02, 0.02 + r, 0); cy(rod, 'steel', r * 0.35, L, -L / 2 + 0.01, 0, 0, 'x'); bx(rod, 'frame', 0.03, r * 2.4, r * 2.4, 0.015); return g; },
    pose: (g, p, v) => { const rod = g.getObjectByName('rod'); if (rod) rod.position.x = (mm(p.stroke) + 0.08) / 2 - 0.02 + mm(v.X || 0); } });
  bdef('gripper', { name: '공압 그리퍼', cat: 'pneumatic', code: 'GRP', onTop: true, params: { stroke: 20 }, fields: [num('stroke', '핑거 스트로크', 'mm', 1)],
    joints: (P, p) => [J(`${P}_F`, 'lin', [0, 1, 0], 'onoff', 0, p.stroke, 100, 2000)],
    io: P => [out(`${P}_CLOSE`, 'bool', { kind: 'joint', target: `${P}_F` }), inn(`${P}_IS_CLOSED`, 'bool', { kind: 'sensor', target: `${P}_F:max` }), inn(`${P}_IS_OPEN`, 'bool', { kind: 'sensor', target: `${P}_F:min` })],
    build: p => { const g = new T.Group(); bx(g, 'light', 0.1, 0.06, 0.08, 0, 0.08); for (const s of [-1, 1]) { const f = grp(g, 'finger' + (s > 0 ? 'R' : 'L'), 0, 0, s * 0.05); bx(f, 'steel', 0.03, 0.08, 0.012); } return g; },
    pose: (g, p, v) => { const k = mm(v.F || 0) / 2; const l = g.getObjectByName('fingerL'), r = g.getObjectByName('fingerR'); if (l) l.position.z = -0.05 + k; if (r) r.position.z = 0.05 - k; } });
  bdef('vacuum-pad', { name: '진공 흡착 패드', cat: 'pneumatic', code: 'VAC', onTop: true, io: P => [out(`${P}_ON`), inn(`${P}_OK`, 'bool', { kind: 'process', target: `${P}_ON` })],
    build: () => { const g = new T.Group(); cy(g, 'steel', 0.008, 0.1, 0, 0.03); const c = new T.Mesh(new T.CylinderGeometry(0.012, 0.03, 0.03, 16), mat('rubber')); c.position.y = 0.015; g.add(c); return g; } });

  bdef('linear-axis', { name: '리니어 축 (전동)', cat: 'electric', code: 'AX', params: { stroke: 600, speed: 500 }, fields: [num('stroke', '스트로크', 'mm', 10), num('speed', '최고 속도', 'mm/s', 10)],
    onTop: true, top: () => 0.12, joints: (P, p) => [J(`${P}_X`, 'lin', [1, 0, 0], 'position', 0, p.stroke, p.speed, 3000)],
    io: P => [out(`${P}_SERVO_ON`), out(`${P}_POS`, 'real', { kind: 'joint', target: `${P}_X` }), inn(`${P}_INPOS`, 'bool', { kind: 'sensor', target: `${P}_X:target` }), inn(`${P}_ALARM`)],
    build: p => { const g = new T.Group(), L = mm(p.stroke) + 0.3; bx(g, 'body', L, 0.08, 0.12); bx(g, 'dark', 0.12, 0.1, 0.1, -L / 2 - 0.06, 0.01); const c = grp(g, 'carriage', -mm(p.stroke) / 2, 0.08); bx(c, 'light', 0.18, 0.04, 0.16); return g; },
    pose: (g, p, v) => { const c = g.getObjectByName('carriage'); if (c) c.position.x = -mm(p.stroke) / 2 + mm(v.X || 0); } });
  bdef('rotary-table', { cls: 'rotary', name: '회전 테이블 (인덱스)', cat: 'electric', code: 'RT', params: { d: 800, stations: 4 }, fields: [num('d', '지름', 'mm', 10), num('stations', '분할 수', '개', 1, 2)], onTop: true,
    top: () => 0.25, joints: (P) => [J(`${P}_R`, 'rot', [0, 0, 1], 'position', 0, 360, 90, 360)],
    io: P => [out(`${P}_INDEX`, 'real', { kind: 'joint', target: `${P}_R` }), inn(`${P}_INPOS`, 'bool', { kind: 'sensor', target: `${P}_R:target` })],
    build: p => { const g = new T.Group(); cy(g, 'frame', 0.15, 0.2); const t = grp(g, 'disk', 0, 0.2); cy(t, 'body', mm(p.d) / 2, 0.05, 0, 0, 0, 'y', 40); for (let i = 0; i < (p.stations | 0); i++) { const a = (i / p.stations) * Math.PI * 2; bx(t, 'steel', 0.12, 0.03, 0.12, Math.cos(a) * mm(p.d) * 0.35, 0.05, Math.sin(a) * mm(p.d) * 0.35); } return g; },
    pose: (g, p, v) => { const t = g.getObjectByName('disk'); if (t) t.rotation.y = (v.R || 0) * Math.PI / 180; } });

  const robotIo = P => [out(`${P}_START`), out(`${P}_PROG`, 'int'), inn(`${P}_BUSY`, 'bool', { kind: 'process', target: `${P}_START` }), inn(`${P}_DONE`, 'bool', { kind: 'process', target: `${P}_START` })];
  bdef('robot-6axis', { cls: 'robot', name: '6축 다관절 로봇', cat: 'robot', code: 'RB', onTop: true, params: { reach: 1200, payload: 10, cycle: 4 }, fields: [num('reach', '도달 거리', 'mm', 50), num('payload', '가반 중량', 'kg', 1), num('cycle', '동작 시간', 's', 0.5)],
    joints: (P) => [J(`${P}_J1`, 'rot', [0, 0, 1], 'position', -170, 170, 180, 720)], io: robotIo,
    build: p => { const g = new T.Group(); arm(g, mm(p.reach)); g.userData.rig = rigOfArm(g); g.userData.kind = 'robot'; return g; },
    pose: (g, p, v) => { if (g.userData.prog) return; const j1 = g.getObjectByName('j1'), j2 = g.getObjectByName('j2'), j3 = g.getObjectByName('j3'), j5 = g.getObjectByName('j5'), k = Math.sin((v.RUN || 0) * Math.PI);
      if (j1) j1.rotation.y = k * 1.4; if (j2) j2.rotation.z = -0.35 - k * 0.4; if (j3) j3.rotation.z = 0.2 + k * 0.5; if (j5) j5.rotation.z = -Math.PI / 2 + 0.15 - k * 0.1; /* the wrist keeps the gripper pointing down */ } });
  /* 작업자: a person who walks, reaches and carries works in 동작 시험 (a program like a robot's: MOVJ walks to a point,
     MOVL reaches the hand to it, GRIP takes / puts down a work). Arms hang from shoulder pivots so a reach shows. */
  const workerIo = P => [out(`${P}_START`), inn(`${P}_BUSY`, 'bool', { kind: 'process', target: `${P}_START` }), inn(`${P}_DONE`, 'bool', { kind: 'process', target: `${P}_START` }), out(`${P}_PASS`)]; // PASS: a work handed on (put where the next person takes it)
  function operatorFig(h) { const g = new T.Group(), s = h / 1.75; g.name = 'operator';
    for (const k of [-1, 1]) bx(g, 'dark', 0.13 * s, 0.84 * s, 0.15 * s, 0, 0, k * 0.1 * s);
    bx(g, 'accent', 0.26 * s, 0.56 * s, 0.44 * s, 0, 0.84 * s, 0);
    sp(g, 'body', 0.105 * s, 0, 1.56 * s, 0); const cap = sp(g, 'light', 0.115 * s, 0, 1.62 * s, 0); cap.scale.y = 0.55;
    for (const k of [-1, 1]) { const a = grp(g, k < 0 ? 'armL' : 'armR', 0, 1.36 * s, k * 0.27 * s); bx(a, 'accent', 0.09 * s, 0.34 * s, 0.09 * s, 0, -0.34 * s, 0); bx(a, 'body', 0.08 * s, 0.3 * s, 0.08 * s, 0, -0.64 * s, 0); }
    g.userData.shoulder = 1.36 * s; g.userData.armLen = 0.64 * s; return g; }
  bdef('operator', { name: '작업자', cat: 'robot', code: 'WK', operator: true, params: { h: 1750 }, fields: [num('h', '키', 'mm', 10)],
    io: workerIo, top: () => 0, build: p => { const g = new T.Group(); g.add(operatorFig(mm(p.h))); g.userData.kind = 'operator'; return g; } });
  bdef('scara', { cls: 'robot', name: '스카라 로봇', cat: 'robot', code: 'SCR', onTop: true, params: { reach: 600, cycle: 2 }, fields: [num('reach', '도달 거리', 'mm', 50), num('cycle', '동작 시간', 's', 0.5)],
    io: robotIo, build: p => { const g = new T.Group(), r = mm(p.reach); cy(g, 'light', 0.1, 0.5); const a1 = grp(g, 'j1', 0, 0.5); bx(a1, 'light', r * 0.55, 0.08, 0.12, r * 0.27); const a2 = grp(a1, 'j2', r * 0.52, 0.08); bx(a2, 'light', r * 0.5, 0.07, 0.1, r * 0.24); cy(a2, 'steel', 0.015, 0.3, r * 0.48, -0.3); return g; },
    pose: (g, p, v) => { const k = v.RUN || 0, a1 = g.getObjectByName('j1'), a2 = g.getObjectByName('j2'); if (a1) a1.rotation.y = Math.sin(k * Math.PI) * 1.2; if (a2) a2.rotation.y = -Math.sin(k * Math.PI) * 1.6; } });

  const sensorBuild = (role) => () => { const g = new T.Group(); bx(g, 'frame', 0.02, 0.08, 0.02); bx(g, role, 0.03, 0.04, 0.02, 0, 0.08); return g; };
  bdef('photo-sensor', { cls: 'sensor', name: '광전 센서', cat: 'sensor', code: 'PS', onTop: true, params: { range: 500 }, fields: [num('range', '감지 거리', 'mm', 10)], sensor: true,
    io: P => [inn(`${P}_ON`, 'bool', { kind: 'sensor', target: 'work' })], build: sensorBuild('dark') });
  bdef('proximity-sensor', { cls: 'sensor', name: '근접 센서', cat: 'sensor', code: 'PX', onTop: true, params: { range: 8 }, fields: [num('range', '감지 거리', 'mm', 1)], sensor: true,
    io: P => [inn(`${P}_ON`, 'bool', { kind: 'sensor', target: 'work' })], build: () => { const g = new T.Group(); cy(g, 'steel', 0.009, 0.06, 0, 0, 0); return g; } });
  bdef('vision-camera', { cls: 'sensor', name: '비전 카메라', cat: 'sensor', code: 'CAM', params: { h: 1200 }, fields: [num('h', '설치 높이', 'mm', 10)],
    io: P => [out(`${P}_TRIG`), inn(`${P}_OK`, 'bool', { kind: 'process', target: `${P}_TRIG` }), inn(`${P}_NG`, 'bool', { kind: 'process', target: `${P}_TRIG` })],
    build: p => { const g = new T.Group(), h = mm(p.h); bx(g, 'frame', 0.04, h, 0.04, 0, 0, -0.25); bx(g, 'frame', 0.04, 0.04, 0.3, 0, h - 0.04, -0.1); bx(g, 'dark', 0.08, 0.1, 0.08, 0, h - 0.14, 0.02); flatRing(g, 'glowW', 0.035, 0.05, h - 0.145, 0, 0.02); return g; } });

  const workDef = (id, name, v, d) => bdef(id, { name, cat: 'work', code: 'W', onTop: true, params: d, work: true,
    fields: [num('w', '가로', 'mm', 5), num('d', '세로', 'mm', 5), num('h', '높이', 'mm', 5)], top: p => mm(p.h), build: p => workShape(v, mm(p.w), mm(p.d), mm(p.h)) });
  workDef('work-box', '워크 (박스)', 'box', { w: 300, d: 200, h: 150 });
  workDef('work-cylinder', '워크 (원통)', 'cylinder', { w: 200, d: 200, h: 250 });
  workDef('work-plate', '워크 (판재)', 'plate', { w: 400, d: 300, h: 10 });
  bdef('tote', { name: '통박스', cat: 'work', code: 'TOT', onTop: true, work: true, params: { w: 600, d: 400, h: 280 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이', 'mm', 10)], top: () => 0.02,
    build: p => { const g = new T.Group(), w = mm(p.w), d = mm(p.d), h = mm(p.h); bx(g, 'frame', w, 0.02, d); for (const s of [-1, 1]) { bx(g, 'frame', w, h, 0.015, 0, 0, s * d / 2); bx(g, 'frame', 0.015, h, d, s * w / 2); } return g; } });
  bdef('pallet', { name: '지그 팔레트', cat: 'work', code: 'PAL', onTop: true, work: true, params: { w: 400, d: 400 }, fields: [num('w', '가로'), num('d', '세로')], top: () => 0.04,
    build: p => { const g = new T.Group(); bx(g, 'steel', mm(p.w), 0.03, mm(p.d)); for (const s of [-1, 1]) bx(g, 'accent', 0.04, 0.03, 0.04, s * mm(p.w) * 0.3, 0.03, 0); return g; } });

  // 적재 파렛트: a wooden pallet (1200 × 1000, three runners and deck boards) on the floor that finished works are stacked on
  bdef('wood-pallet', { name: '적재 파렛트 (목재)', cat: 'structure', code: 'WP', params: { w: 1200, d: 1000, h: 144 }, fields: [num('w', '가로'), num('d', '세로')], top: p => mm(p.h),
    build: p => { const g = new T.Group(), w = mm(p.w), d = mm(p.d), h = mm(p.h); for (const z of [-0.45, 0, 0.45]) bx(g, 'wood', w, h * 0.7, 0.1, 0, 0, z * d);
      for (let i = 0; i < 7; i++) bx(g, 'wood', 0.12 * w / 1.2, h * 0.3 - 0.002, d, (i - 3) * (w - 0.12) / 6, h * 0.7); return g; } });
  bdef('bowl-feeder', { name: '보울 피더', cat: 'feeder', code: 'FD', params: { d: 400 }, fields: [num('d', '보울 지름', 'mm', 10)],
    io: P => [out(`${P}_RUN`), inn(`${P}_READY`, 'bool', { kind: 'process', target: `${P}_RUN` })],
    build: p => { const g = new T.Group(), r = mm(p.d) / 2; legs(g, r * 2, r * 2, 0.7, 0.04, 0.04); bx(g, 'body', r * 2, 0.03, r * 2, 0, 0.7); cy(g, 'dark', r * 0.5, 0.15, 0, 0.73); const b = new T.Mesh(new T.CylinderGeometry(r, r * 0.6, 0.18, 32, 1, true), mat('steel')); b.position.y = 0.97; g.add(b); bx(g, 'steel', r * 1.4, 0.03, 0.06, r * 1.0, 0.95, 0); return g; } });
  bdef('tray-feeder', { name: '트레이 피더', cat: 'feeder', code: 'TF', params: { w: 700, d: 500 }, fields: [num('w', '가로'), num('d', '세로')],
    io: P => [out(`${P}_NEXT`), inn(`${P}_READY`, 'bool', { kind: 'process', target: `${P}_NEXT` }), inn(`${P}_EMPTY`)],
    build: p => { const g = new T.Group(); bx(g, 'light', mm(p.w), 0.9, mm(p.d)); for (let i = 0; i < 5; i++) bx(g, 'dark', mm(p.w) * 0.8, 0.03, mm(p.d) * 0.8, 0, 0.92 + i * 0.05); return g; } });

  const procIo = P => [out(`${P}_START`), inn(`${P}_BUSY`, 'bool', { kind: 'process', target: `${P}_START` }), inn(`${P}_DONE`, 'bool', { kind: 'process', target: `${P}_START` }), inn(`${P}_OK`, 'bool', { kind: 'process', target: `${P}_START` })];
  bdef('process-unit', { name: '공정 유닛 (블랙박스)', cat: 'process', code: 'PU', params: { w: 1200, d: 1000, h: 1600, cycle: 10, ok_rate: 0.99 },
    fields: [num('w', '가로'), num('d', '세로'), num('h', '높이'), num('cycle', '사이클', 's', 0.5), num('ok_rate', '양품률', '0~1', 0.01)], io: procIo,
    build: p => { const g = new T.Group(), w = mm(p.w), d = mm(p.d), h = mm(p.h); bx(g, 'light', w, h, d); bx(g, 'glass', w * 0.6, h * 0.35, 0.01, 0, h * 0.35, d / 2 + 0.005); lampStack(g, w / 2 - 0.08, h, -d / 2 + 0.08, 0.8); return g; } });
  bdef('press-unit', { name: '압입·프레스 유닛', cat: 'process', code: 'PR', onTop: true, params: { force: 20, cycle: 6 }, fields: [num('force', '가압력', 'kN', 1), num('cycle', '사이클', 's', 0.5)],
    joints: () => [], io: procIo, build: () => { const g = new T.Group(); bx(g, 'frame', 0.5, 0.05, 0.4); for (const s of [-1, 1]) bx(g, 'steel', 0.04, 0.8, 0.04, s * 0.2, 0.05, -0.15); bx(g, 'light', 0.5, 0.2, 0.4, 0, 0.85); const r = grp(g, 'ram', 0, 0.55); cy(r, 'steel', 0.03, 0.3); return g; },
    pose: (g, p, v) => { const r = g.getObjectByName('ram'); if (r) r.position.y = 0.55 - Math.sin((v.RUN || 0) * Math.PI) * 0.25; } });
  bdef('dispenser', { name: '도포 디스펜서', cat: 'process', code: 'DSP', onTop: true, params: { cycle: 8 }, fields: [num('cycle', '사이클', 's', 0.5)], io: procIo,
    build: () => { const g = new T.Group(); bx(g, 'light', 0.12, 0.25, 0.12, 0, 0.1); cy(g, 'steel', 0.006, 0.1, 0, 0); cy(g, 'body', 0.05, 0.3, -0.15, 0.1, 0); return g; } });
  bdef('screw-unit', { name: '체결 (스크류·너트런너)', cat: 'process', code: 'SCW', onTop: true, params: { spindles: 1, cycle: 5 }, fields: [num('spindles', '축 수', '축', 1, 1), num('cycle', '사이클', 's', 0.5)], io: procIo,
    build: p => { const g = new T.Group(), n = Math.max(1, p.spindles | 0); bx(g, 'light', 0.1 + n * 0.08, 0.2, 0.15, 0, 0.25); for (let i = 0; i < n; i++) cy(g, 'steel', 0.012, 0.25, -((n - 1) * 0.08) / 2 + i * 0.08, 0); return g; } });

  /* ---- 모델 객체: one part of a converted plant station (assets/models/plant/<src>.glb, node P_…). Every part is its own
     block, so size (w · d · h against the original w0 · d0 · h0), position and motion are edited one by one. Robots swing
     their joint chain and index tables turn while their process runs (동작 시험), over 사이클 seconds. */
  const GLB = {}, GLB_READY = {};
  let gltfLoader = null;
  function plantGlb(src) {
    if (GLB[src]) return GLB[src];
    if (!T.GLTFLoader) return (GLB[src] = Promise.reject(new Error('GLTFLoader missing')));
    if (!gltfLoader) { gltfLoader = new T.GLTFLoader(); if (T.DRACOLoader) { const dl = new T.DRACOLoader(); dl.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/libs/draco/gltf/'); gltfLoader.setDRACOLoader(dl); } }
    return (GLB[src] = new Promise((ok, bad) => gltfLoader.load(`assets/models/plant/${src}.glb`, g => { g.scene.updateMatrixWorld(true); flatGlowOff(g.scene); GLB_READY[src] = g.scene; ok(g.scene); }, undefined, bad)));
  }
  const modelListeners = new Set(); // called when a station GLB has arrived (the builder redraws its selection box)
  // joint chain of a rig: J1 and its first J child, then that one's, … (fingers and side bones stay as they are)
  function jointChain(o, max = 6) { const out = []; let j = null; o.traverse(x => { if (!j && /^J\d+(_\d+)?$/.test(x.name)) j = x; });
    while (j && out.length < max) { out.push(j); let nx = null; j.traverse(x => { if (!nx && x !== j && /^J\d+(_\d+)?$/.test(x.name)) nx = x; }); j = nx; } return out; }
  /* Some robot models (the blue arm of the inspection cell) carry one J node more than the six axes: J1 is the fixed pedestal,
     and the node origins are not on the real joint axes. For those the rig skips the pedestal and finds each axis from the
     mesh: a bending joint turns about the middle of the surface where its two links touch, the forearm rolls about its own
     long axis, the flange about the line from the wrist to the flange. rigSet then turns each link about that pivot. */
  function linkPts(node, stop, cap = 40000) { const pts = [], v = new T.Vector3();
    node.traverse(m => { if (!m.isMesh || !m.geometry?.attributes?.position) return; let q = m; while (q && q !== node) { if (q === stop) return; q = q.parent; }
      const pa = m.geometry.attributes.position, st = Math.max(1, Math.floor(pa.count / cap)); for (let i = 0; i < pa.count; i += st) pts.push(v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld).clone()); }); return pts; }
  function contactMid(a, b, th = 0.025) { const cs = 0.03, H = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
    for (const q of a) { const k = key(Math.floor(q.x / cs), Math.floor(q.y / cs), Math.floor(q.z / cs)); if (!H.has(k)) H.set(k, []); H.get(k).push(q); }
    const c = new T.Vector3(); let n = 0; for (const q of b) { const bx = Math.floor(q.x / cs), by = Math.floor(q.y / cs), bz = Math.floor(q.z / cs); let hit = false;
      for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) for (let k = -1; k <= 1 && !hit; k++) { const l = H.get(key(bx + i, by + j, bz + k)); if (l) for (const r of l) if (r.distanceToSquared(q) < th * th) { hit = true; break; } }
      if (hit) { c.add(q); n++; } } return n ? c.divideScalar(n) : null; }
  function mainAxis(pts) { const c = new T.Vector3(); pts.forEach(q => c.add(q)); c.divideScalar(pts.length); let d = new T.Vector3(1, 0, 0);
    for (let it = 0; it < 30; it++) { const nd = new T.Vector3(); for (const q of pts) { const e = q.clone().sub(c); nd.addScaledVector(e, e.dot(d)); } if (nd.lengthSq() < 1e-12) break; d = nd.normalize(); } return { c, d }; }
  function deepRig(c, ch) { c.updateWorldMatrix(true, true); const J = ch.slice(1, 7), links = [linkPts(ch[0], J[0])].concat(J.map((j, i) => linkPts(j, J[i + 1] || null)));
    const wp = J.map(j => j.getWorldPosition(new T.Vector3())), up = new T.Vector3(0, 1, 0);
    const mid = i => contactMid(links[i], links[i + 1]) || wp[i].clone();
    const p1 = mid(1), p2 = mid(2), p4 = mid(4), fa = mainAxis(links[4]);
    const reach = wp[5].clone().sub(wp[0]); reach.y = 0; if (reach.lengthSq() < 1e-8) reach.set(1, 0, 0); reach.normalize(); const pitch = new T.Vector3().crossVectors(up, reach).normalize();
    const toWrist = p4.clone().sub(fa.c); if (fa.d.dot(toWrist) < 0) fa.d.negate();
    const flange = wp[5].clone().sub(p4); if (flange.lengthSq() < 1e-8) flange.copy(fa.d); flange.normalize();
    const W = [[wp[0], up], [p1, pitch], [p2, pitch], [fa.c, fa.d], [p4, pitch], [wp[5], flange]];
    return J.map((j, i) => { const pq = new T.Quaternion(), inv = new T.Matrix4(); if (j.parent) { j.parent.getWorldQuaternion(pq); inv.copy(j.parent.matrixWorld).invert(); }
      return { j, i, base: j.quaternion.clone(), p0: j.position.clone(), cp: W[i][0].clone().applyMatrix4(inv), axis: W[i][1].clone().transformDirection(inv) }; }); } // transformDirection: the full inverse (the stage world is mirrored, a quaternion alone would flip the axis)
  // models whose J1 node is the fixed pedestal and whose node origins are off the axes (see deepRig)
  const DEEP_RIG = /^P_OP\d+_robot$/;
  function rigOf(c, kind, node) {
    c.updateMatrixWorld(true); if (kind !== 'rotary' && DEEP_RIG.test(node || '')) { const deep = jointChain(c, 7); if (deep.length === 7) { const rig = deepRig(c, deep); rig.deep = true; toolOf(rig); return rig; } }
    const ch = jointChain(c); if (!ch.length) return null; const up = new T.Vector3(0, 1, 0);
    const wp = ch.map(j => j.getWorldPosition(new T.Vector3())), reach = wp[wp.length - 1].clone().sub(wp[0]); reach.y = 0; if (reach.lengthSq() < 1e-6) reach.set(1, 0, 0); reach.normalize();
    const pitch = new T.Vector3().crossVectors(up, reach).normalize();
    const axisW = i => { if (kind === 'rotary') return up; if (i === 0) return up;
      if (i === 3 || i === 5) { const a = wp[Math.min(i + 1, wp.length - 1)].clone().sub(wp[i]); if (i === 5 || a.lengthSq() < 1e-8) a.copy(wp[i]).sub(wp[i - 1]); return a.lengthSq() > 1e-8 ? a.normalize() : reach; }
      return pitch; };
    const list = kind === 'rotary' ? [ch[ch.length - 1]] : ch;
    const rig = list.map((j, k) => { const i = kind === 'rotary' ? 0 : k, pq = new T.Quaternion(); if (j.parent) j.parent.getWorldQuaternion(pq);
      return { j, i, base: j.quaternion.clone(), axis: axisW(i).clone().applyQuaternion(pq.invert()).normalize() }; });
    if (kind !== 'rotary' && rig.length >= 6) toolOf(rig);
    return rig;
  }
  /* The tool of a model robot: its TCP is the tip of what hangs on the flange (the torch tip, the middle of the gripper
     fingers) and not the flange itself — otherwise the arm stretches a whole tool length past every point. The IK moves
     J1–J3 and turns J5 so the tool points straight down (J4 / J6 stay as jogged), the way a pick or a top weld is done. */
  function toolOf(rig) { const last = rig[rig.length - 1].j; last.updateMatrixWorld(true); const inv = last.matrixWorld.clone().invert(), v = new T.Vector3(), pts = [];
    last.traverse(m => { if (!m.isMesh || !m.geometry?.attributes?.position) return; const pa = m.geometry.attributes.position, st = Math.max(1, Math.floor(pa.count / 3000));
      for (let i = 0; i < pa.count; i += st) pts.push(v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv).clone()); });
    if (pts.length < 8) return; let far = 0; for (const q of pts) far = Math.max(far, q.length()); const tip = new T.Vector3(); let n = 0;
    for (const q of pts) if (q.length() > far * 0.94) { tip.add(q); n++; } tip.divideScalar(n);
    const t = new T.Object3D(); t.name = 'tcp'; t.position.copy(tip); last.add(t); rig.tcp = t; rig.ikN = 3; rig.hold = a => { a[4] = toolDown(rig, a); }; }
  function toolDown(rig, a) { const r5 = rig[4], b = a.slice(); b[4] = 0; rigSet(rig, b); rig[0].j.updateMatrixWorld(true);
    const A = r5.axis.clone().applyQuaternion(r5.j.parent.getWorldQuaternion(new T.Quaternion())).normalize();
    // the tool points down, or (rig.pitch, deg below horizontal) out from the robot and tilted down, e.g. a torch reaching in under a hood
    const p5 = r5.j.getWorldPosition(new T.Vector3()), v = rig.tcp.getWorldPosition(new T.Vector3()).sub(p5), d = new T.Vector3(0, -1, 0), pt = rig.pitch ?? 90;
    if (pt < 89.5) { const out = p5.clone().sub(rig[0].j.getWorldPosition(new T.Vector3())); out.y = 0; if (out.lengthSq() > 1e-8) { out.normalize(); const k = pt * Math.PI / 180; d.copy(out.multiplyScalar(Math.cos(k))).add(new T.Vector3(0, -Math.sin(k), 0)); } }
    v.sub(A.clone().multiplyScalar(v.dot(A))); d.sub(A.clone().multiplyScalar(d.dot(A))); if (v.lengthSq() < 1e-12 || d.lengthSq() < 1e-12) return a[4];
    return Math.atan2(A.dot(new T.Vector3().crossVectors(v, d)), v.dot(d)) * 180 / Math.PI; }
  /** The palette arm (arm()): six joints; the IK moves J1–J3 and turns J5 against J2 + J3 so the gripper keeps its taught
      tilt (J4 / J6 stay as jogged), the way a pendant's linear jog keeps the tool orientation. */
  function rigOfArm(g) { const n = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'].map(k => g.getObjectByName(k)), w = g.getObjectByName('wrist'); if (!n[0] || !n[1] || !n[2]) return null;
    const ax = [[0, 1, 0], [0, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 1], [1, 0, 0]], rig = n.map((j, i) => j && { j, i, base: j.quaternion.clone(), axis: new T.Vector3(...ax[i]) }).filter(Boolean);
    rig.tcp = w || n[2]; rig.limits = [[-170, 170], [-90, 80], [-110, 140], [-190, 190], [-130, 130], [-360, 360]]; if (rig.length === 6) { rig.ikN = 3; rig.hold = (a, a0) => { a[4] = a0[4] - (a[1] - a0[1]) - (a[2] - a0[2]); }; } return rig; }
  /* ------------------------------------------------------------- 티칭 (teach) kinematics: angles in, TCP out, and the inverse
     rigSet: joint angles (deg) → pose. rigTcp: TCP position in world (scene m). rigIk: joint angles that put the TCP at a
     target, by damped least squares on a numeric Jacobian (position only; the wrist keeps its taught orientation).
     No dynamics, no collision: a trajectory through an object is reported by the design check, not prevented. */
  const LIMITS6 = [[-170, 170], [-100, 135], [-150, 150], [-190, 190], [-120, 120], [-360, 360]];
  const limitsOf = rig => rig.limits || LIMITS6;
  function rigSet(rig, deg) { if (!rig) return; for (const r of rig) { const a = deg[r.i] || 0; qa.setFromAxisAngle(r.axis, a * Math.PI / 180); r.j.quaternion.copy(r.base).premultiply(qa); if (r.cp) r.j.position.copy(r.p0).sub(r.cp).applyQuaternion(qa).add(r.cp); } }
  function rigTcp(rig, g) { if (!rig) return null; (g || rig[0].j).updateMatrixWorld(true); const t = rig.tcp || rig[rig.length - 1].j; return t.getWorldPosition(new T.Vector3()); }
  /* rigIk: a stretched arm sits on a singular pose (pulling the hand in needs the elbow to bend first, the gradient alone
     never does it): when the first try stays short, retry from seeds with the elbow / shoulder bent and keep the best */
  function rigIk(rig, g, target, deg0, opt = {}) { if (!rig) return null; const r0 = ikOnce(rig, g, target, deg0, opt); if (!r0 || rig.length < 3) return r0;
    const lim = opt.lim || limitsOf(rig), pinned = d => d.filter((v, i) => i < 3 && lim[i] && (v <= lim[i][0] + 0.5 || v >= lim[i][1] - 0.5)).length;
    if (r0.err <= 3 && pinned(r0.deg) < 2) return r0;
    let best = r0; const d0 = (deg0 || []).slice(); while (d0.length < rig.length) d0.push(0);
    // relative seeds (bend the elbow / shoulder from here), then absolute ones: J1 turned to face the target and the arm in a
    // plain pose — a pose pinned against its limits (J2 and J3 both at the end) is a dead end the gradient cannot leave
    rigSet(rig, d0); const p0 = rig[0].j.getWorldPosition(new T.Vector3()), c = rigTcp(rig, g), yaw = (Math.atan2(-(target.z - p0.z), target.x - p0.x) - Math.atan2(-(c.z - p0.z), c.x - p0.x)) * 180 / Math.PI;
    const j1 = d0[0] + ((yaw + 540) % 360) - 180, seeds = [[2, 35], [2, -35], [1, -25], [1, 25], [2, 70]].map(([i, d]) => { const s0 = d0.slice(); s0[i] += d; if (i === 1) s0[2] += d * 1.6; return s0; });
    if (rig.length >= 3 && rig[0].axis.y > 0.9) for (const [a2, a3] of [[0, 0], [-30, 40], [20, -40], [-50, 90], [30, 60]]) { const s0 = d0.map(() => 0); s0[0] = j1; s0[1] = a2; s0[2] = a3; seeds.push(s0); }
    for (const s0 of seeds) { const r = ikOnce(rig, g, target, s0, { ...opt, a0: d0 }); if (r && (r.err < best.err - 2 || (r.err <= best.err + 1 && pinned(r.deg) < pinned(best.deg)))) best = r; if (best.err <= 3 && pinned(best.deg) < 2) break; }
    if (best !== r0) rigSet(rig, best.deg); return best; }
  function ikOnce(rig, g, target, deg0, opt = {}) { if (!rig) return null; const n = rig.length, a = (deg0 || []).slice(0, n); while (a.length < n) a.push(0); const lim = opt.lim || limitsOf(rig), it = opt.iters || 24, lam2 = 0.004, h = 0.5, R = 180 / Math.PI;
    const tmp = new T.Vector3(), m = opt.ikN || rig.ikN || n, a0 = (opt.a0 || a).slice(), clamp = (v, i) => Math.max(lim[i]?.[0] ?? -180, Math.min(lim[i]?.[1] ?? 180, v));
    const fk = ang => { if (rig.hold) { rig.hold(ang, a0); ang[4] = clamp(ang[4], 4); } rigSet(rig, ang); return rigTcp(rig, g).clone(); };
    let cur = fk(a), err = target.clone().sub(cur);
    for (let k = 0; k < it && err.length() > 0.0008; k++) {
      // J in m per rad (numeric, h deg): (J Jᵀ + λ² I) y = err, 3×3; Δa = Jᵀ y (rad) → deg, at most 25° a step
      const J = []; for (let i = 0; i < m; i++) { const b = a.slice(); b[i] += h; const q = fk(b); J.push([(q.x - cur.x) / h * R, (q.y - cur.y) / h * R, (q.z - cur.z) / h * R]); }
      const A = [[lam2, 0, 0], [0, lam2, 0], [0, 0, lam2]]; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let i = 0; i < m; i++) A[r][c] += J[i][r] * J[i][c];
      const e = [err.x, err.y, err.z], y = solve3(A, e); if (!y) break;
      for (let i = 0; i < m; i++) { let d = (J[i][0] * y[0] + J[i][1] * y[1] + J[i][2] * y[2]) * R * 0.8; d = Math.max(-25, Math.min(25, d)); a[i] = clamp(a[i] + d, i); }
      cur = fk(a); err = tmp.copy(target).sub(cur); }
    return { deg: a, err: err.length() * 1000, tcp: cur }; }
  /** Arm length along the joint chain (mm), the reach the pendant uses to look for pick / place targets. */
  function rigReach(rig, g) { if (!rig || rig.length < 2) return 0; (g || rig[0].j).updateMatrixWorld(true); const wp = rig.map(r => r.j.getWorldPosition(new T.Vector3())); const t = rig.tcp ? rig.tcp.getWorldPosition(new T.Vector3()) : wp[wp.length - 1];
    let d = 0; for (let i = 1; i < wp.length; i++) d += wp[i].distanceTo(wp[i - 1]); d += t.distanceTo(wp[wp.length - 1]); return Math.round(d * 1000); }
  function solve3(A, b) { const m = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; [m[c], m[p]] = [m[p], m[c]]; if (Math.abs(m[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) { if (r === c) continue; const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; } } return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]; }
  // swing of joint i at k = 0…1 of the cycle (degrees): out and back, each joint its own way
  const SWING = [55, 22, -28, 70, 35, 90];
  const qa = new T.Quaternion();
  function poseRig(rig, kind, k) { if (!rig) return; const s = Math.sin(Math.PI * k), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    for (const r of rig) { const deg = kind === 'rotary' ? 90 * e : SWING[r.i] * s * (r.i === 0 ? Math.sin(Math.PI * k * 2) : 1); r.j.quaternion.copy(r.base).premultiply(qa.setFromAxisAngle(r.axis, deg * Math.PI / 180)); } }
  // the converter left a flat emissive colour on some materials (whole control boxes glowed green): only emissive maps
  // (sensor LEDs, buttons) keep glowing; tower lamps get their own lenses below
  function flatGlowOff(scene) { scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.emissive && !m.emissiveMap) m.emissive.setRGB(0, 0, 0); }); }

  /* ---- status effects of model parts, driven by the state of their cell (SIMULATION) or 동작 시험 (Machine Builder):
     경광등 = tower lamp, its three lenses lit by state (green 가동, amber 대기, red blinking 막힘 / 불량);
     센서 = its indicator lights while a part is in front of it; 모니터 = an operator screen with the cell state. */
  const SCREENS = { // screen rectangle in the monitor mesh's own space: outward normal, centre, width, height (m)
    P_monitor03: { n: [-1, 0, 0], c: [-0.0075, 0.429, 0], w: 0.69, h: 0.408 },
    P_black_monitor: { n: [-1, 0, 0], c: [-0.0245, 0.2515, 0], w: 0.646, h: 0.455 },
    P_OP110_monitor: { n: [-0.983, 0, 0.181], c: [-0.053, 0.272, 0.007], w: 0.57, h: 0.408 } };
  const fxKind = node => /(^|_)sign/i.test(node) ? 'lamp' : SCREENS[node] ? 'screen' : /sensor/i.test(node) ? 'sensor' : null;
  // lens bands of the tower lamp mesh along its height (fraction of the mesh height, bottom = 0): green, amber, red
  function towerMat(src, y0, len) {
    const m = src.clone(); m.emissive = new T.Color(0); m.userData.on = new T.Vector3(1, 0, 0); const band = new T.Vector2(y0, len);
    m.onBeforeCompile = sh => { sh.uniforms.uOn = { value: m.userData.on }; sh.uniforms.uBand = { value: band };
      sh.vertexShader = 'uniform vec2 uBand;\nvarying float vT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vT = (position.y - uBand.x) / uBand.y;');
      sh.fragmentShader = 'uniform vec3 uOn;\nvarying float vT;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  vec3 lens = vec3(0.0); float lit = 0.0;
  if (vT > 0.575 && vT < 0.675) { lens = vec3(0.10, 0.85, 0.22); lit = uOn.x; }
  else if (vT > 0.72 && vT < 0.80) { lens = vec3(1.0, 0.62, 0.08); lit = uOn.y; }
  else if (vT > 0.84 && vT < 0.925) { lens = vec3(1.0, 0.16, 0.12); lit = uOn.z; }
  if (lens.r + lens.g > 0.0) { diffuseColor.rgb = lens * 0.22; totalEmissiveRadiance += lens * lit * 3.2; }`); };
    m.customProgramCacheKey = () => 'tower-lamp-3'; m.userData.noStudio = true; return m; }
  function screenOf(mesh, S) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.round(256 * S.h / S.w); const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
    const mat = new T.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1, roughness: 0.35, metalness: 0 }); mat.userData.noStudio = true;
    const pl = new T.Mesh(new T.PlaneGeometry(S.w * 0.96, S.h * 0.94), mat), n = new T.Vector3(...S.n).normalize();
    pl.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n); pl.position.set(...S.c).addScaledVector(n, 0.002); pl.userData.noTwin = true; pl.castShadow = false; mesh.add(pl);
    return { cv, tex, key: '' };
  }
  const STATE_TXT = { busy: ['가동', '#3ddc63'], idle: ['대기', '#ffae42'], blocked: ['막힘', '#ff4a3d'], ready: ['준비', '#8d8b86'] };
  function drawScreen(sc, f) {
    const k = Math.round((f.k || 0) * 20), key = [f.title, f.state, f.made, f.ng, k].join('|'); if (key === sc.key) return; sc.key = key;
    const x = sc.cv.getContext('2d'), W = sc.cv.width, H = sc.cv.height, [txt, col] = STATE_TXT[f.state] || STATE_TXT.ready;
    x.fillStyle = '#0c1014'; x.fillRect(0, 0, W, H); x.fillStyle = '#1b222b'; x.fillRect(0, 0, W, 30);
    x.font = '600 16px sans-serif'; x.fillStyle = '#e9e3d5'; x.textBaseline = 'middle'; x.fillText(String(f.title || 'ONE').slice(0, 18), 10, 15);
    x.fillStyle = col; x.fillRect(10, 42, 12, 12); x.font = '700 26px sans-serif'; x.fillText(txt, 30, 49);
    x.font = '500 15px sans-serif'; x.fillStyle = '#c8c3b8'; x.fillText(`생산 ${f.made || 0}   불량 ${f.ng || 0}`, 10, H - 42);
    x.fillStyle = '#2a2f36'; x.fillRect(10, H - 22, W - 20, 10); x.fillStyle = col; x.fillRect(10, H - 22, (W - 20) * k / 20, 10);
    sc.tex.needsUpdate = true; }
  function setupFx(g, c, kind, node) {
    const fx = { kind, list: [] };
    c.traverse(m => { if (!m.isMesh) return;
      if (kind === 'lamp') { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; m.material = towerMat(m.material, b.min.y, Math.max(1e-6, b.max.y - b.min.y)); fx.list.push(m.material); }
      else if (kind === 'sensor') { const mats = [].concat(m.material).map(x => x.emissiveMap ? Object.assign(x.clone(), { emissiveIntensity: 0.25 }) : x); m.material = Array.isArray(m.material) ? mats : mats[0]; fx.list.push(...mats.filter(x => x.emissiveMap)); } });
    if (kind === 'screen') { let mesh = null; c.traverse(m => { if (!mesh && m.isMesh) mesh = m; }); if (mesh) fx.screen = screenOf(mesh, SCREENS[node]); }
    g.userData.fx = fx; setFx(g, { state: 'ready' });
  }
  /** Show the state of a model part's cell: { state: busy | idle | blocked | ready, hit (a part in front of a sensor),
      alarm (just made a reject), title, made, ng, k (0…1 of the current cycle) }. Parts without an effect ignore it. */
  function setFx(g, f) { const fx = g.userData.fx; if (!fx) return;
    if (fx.kind === 'lamp') { const blink = Math.floor(performance.now() / 450) % 2 === 0 ? 1 : 0.08;
      for (const m of fx.list) m.userData.on.set(f.state === 'busy' || f.state === 'ready' ? 1 : 0, f.state === 'idle' ? 1 : 0, f.state === 'blocked' || f.alarm ? blink : 0); }
    else if (fx.kind === 'sensor') { for (const m of fx.list) m.emissiveIntensity = f.hit ? 3.5 : 0.25; }
    else if (fx.screen) drawScreen(fx.screen, f); }
  function attachModel(g, p, scene) {
    const src = scene.getObjectByName(p.node); if (!src) return;
    const c = src.clone(true); c.position.set(0, 0, 0); c.updateMatrix();
    const fit = new T.Group(); fit.name = 'fit'; fit.scale.set(+p.w / (+p.w0 || +p.w), +p.h / (+p.h0 || +p.h), +p.d / (+p.d0 || +p.d)); fit.add(c);
    c.traverse(m => { m.userData.pick = g.userData.pick; if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    const ph = g.getObjectByName('placeholder'); if (ph) g.remove(ph);
    const fk = fxKind(p.node); if (fk) setupFx(g, c, fk, p.node);
    g.add(fit); g.userData.rig = p.kind === 'robot' || p.kind === 'rotary' ? rigOf(c, p.kind, p.node) : null; if (g.userData.rig && p.toolPitch != null) g.userData.rig.pitch = +p.toolPitch; g.userData.kind = p.kind; g.userData.cycle = +p.cycle || 6;
    for (const f of modelListeners) f(g);
  }
  bdef('model-part', { name: '모델 객체', cat: 'model', code: 'P', model: true,
    params: { src: '', node: '', kind: 'static', cls: '', w0: 1000, d0: 1000, h0: 1000, w: 1000, d: 1000, h: 1000, cycle: 6 },
    fields: p => [num('w', '가로', 'mm', 10, 1), num('d', '세로', 'mm', 10, 1), num('h', '높이', 'mm', 10, 1), ...(p.kind === 'robot' || p.kind === 'rotary' ? [num('cycle', p.kind === 'robot' ? '동작 시간 (속도)' : '인덱스 시간 (속도)', 's', 0.5, 0.5)] : [])],
    top: p => mm(p.h), heightKey: null,
    // a part that does a timed job (도포 · 검사 · 각인: params.proc) starts on _START like a process unit; a conveyor rail
    // (params.convey) reports a work at its end; a jig (params.jig) has 클램프 (loaded) and 작업 끝 signals
    io: (P, p) => p.kind === 'robot' ? robotIo(P) : p.kind === 'rotary' || p.proc ? procIo(P) : p.convey ? [inn(`${P}_PRESENT`)] : p.jig ? [out(`${P}_CLAMP`), out(`${P}_FIN`)] : [],
    build: p => { const g = new T.Group(); g.name = 'model-part';
      const ph = bx(g, 'glass', Math.max(0.02, mm(p.w)), Math.max(0.02, mm(p.h)), Math.max(0.02, mm(p.d))); ph.name = 'placeholder'; ph.castShadow = false;
      if (!p.src || !p.node) return g;
      if (GLB_READY[p.src]) attachModel(g, p, GLB_READY[p.src]); else plantGlb(p.src).then(sc => attachModel(g, p, sc)).catch(() => {});
      return g; },
    pose: (g, p, v) => { if (!g.userData.prog) poseRig(g.userData.rig, p.kind, v.RUN || 0);
      if (p.proc === 'dispense') { const k = Math.sin(Math.PI * Math.min(1, v.RUN || 0)); g.traverse(m => { if (!m.isMesh || !/mohno_dispenser$/.test(m.material?.name || '')) return; if (m.userData.y0 === undefined) m.userData.y0 = m.position.y; m.position.y = m.userData.y0 - 0.055 * Math.min(1, k * 1.6); }); } // the pump and needle come down onto the work, dwell, go back up
      if (g.userData.fx) setFx(g, { state: v.RUN ? 'busy' : 'ready', k: v.RUN || 0, hit: (v.RUN || 0) > 0.05 && (v.RUN || 0) < 0.3 }); } });
  // the same part placed on its own in Factory Builder (a factory block): a cell split into its objects
  fdef('model-part', { name: '모델 객체', group: 'model', kind: { cmd: 'add_block', type: 'model-part' }, params: B['model-part'].params, fields: B['model-part'].fields, build: p => B['model-part'].build(p),
    why: '셀을 이루는 객체 하나 · 크기와 위치를 따로 바꿉니다' });
  /** Motion of a placed model part at k = 0…1 of its cycle (robots swing their arm, index tables turn). */
  const poseModel = (g, k) => poseRig(g.userData.rig, g.userData.kind, k);

  /** 90° curve in stored mm, about its node: point(u) and heading(u) for u = 0 (entry) … 1 (exit). */
  function curveGeom(n) { const p = Object.assign({}, B['curve-conveyor'].params, n.params), sg = p.turn === 'right' ? -1 : 1, q = n.transform.position, yaw = n.transform.rotation[2] * Math.PI / 180;
    const c = Math.cos(yaw), s = Math.sin(yaw), th = u => sg * (-Math.PI / 2) * (1 - u), rot = (x, y) => [q[0] + x * c - y * s, q[1] + x * s + y * c];
    return { R: +p.r, W: +p.w, top: q[2] + +p.h, len: Math.PI / 2 * p.r, sg, point: u => { const t = th(u); return rot(p.r * Math.cos(t), p.r * Math.sin(t)); },
      heading: u => { const t = th(u), hx = -Math.sin(t) * sg, hy = Math.cos(t) * sg; return [hx * c - hy * s, hx * s + hy * c]; },
      // nearest u of a point and its distance from the centre line (null when outside the sector)
      locate: pt => { const dx = pt[0] - q[0], dy = pt[1] - q[1], lx = dx * c + dy * s, ly = -dx * s + dy * c, r = Math.hypot(lx, ly), t = Math.atan2(ly, lx), u = 1 - t / (sg * (-Math.PI / 2));
        return u < -0.02 || u > 1.02 ? null : { u: Math.max(0, Math.min(1, u)), off: r - p.r }; } }; }
  function buildBlock(id, p = {}) { const d = B[id]; if (!d) { const g = new T.Group(); bx(g, 'body', 0.2, 0.2, 0.2); return g; } return d.build(Object.assign({}, d.params, p)); }

  window.OneLibrary = { plantGlb, poseModel, setFx, rigSet, rigTcp, rigIk, rigReach, limitsOf, onModel: f => modelListeners.add(f), curveGeom, mat, lampMat, FACTORY: F, FACTORY_GROUPS, buildFactory, special, BLOCKS: B, MACHINE_CATS, buildBlock, conveyorShape, workShape, arm, person };
})();
