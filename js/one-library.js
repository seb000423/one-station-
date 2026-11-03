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

  // a 6-axis arm on a base; joints named j1..j3 so run mode can turn them
  function arm(g, reach = 1.2, x = 0, z = 0, y = 0) {
    const s = reach / 1.2, base = grp(g, 'arm', x, y, z);
    cy(base, 'frame', 0.2 * s, 0.12 * s);
    const j1 = grp(base, 'j1', 0, 0.12 * s, 0); cy(j1, 'light', 0.15 * s, 0.32 * s);
    const j2 = grp(j1, 'j2', 0, 0.36 * s, 0); cy(j2, 'dark', 0.1 * s, 0.26 * s, 0, 0, 0, 'z'); bx(j2, 'light', 0.16 * s, 0.62 * s, 0.16 * s, 0, 0, 0);
    const j3 = grp(j2, 'j3', 0, 0.62 * s, 0); cy(j3, 'dark', 0.08 * s, 0.22 * s, 0, 0, 0, 'z'); bx(j3, 'light', 0.55 * s, 0.12 * s, 0.12 * s, 0.24 * s, -0.06 * s, 0);
    const w = grp(j3, 'wrist', 0.52 * s, 0, 0); cy(w, 'dark', 0.05 * s, 0.12 * s, 0, -0.06 * s, 0); bx(w, 'steel', 0.08 * s, 0.06 * s, 0.1 * s, 0, -0.12 * s, 0);
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
  fdef('assembly-point', { name: '대피 동선·집결지', group: 'fire', grade: 2, kind: { cmd: 'add_block', type: 'assembly-point' }, why: '비상시 대피 경로와 모이는 곳',
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
    { id: 'option', name: '예시 라인용 (선택)', note: '용접 모듈 예시 라인을 보여 줄 때만' },
  ];

  /* ------------------------------------------------------------------ machine-builder blocks */
  // code: tag prefix letters; joints(P, p) / io(P, p): what add_block brings; top(p): height a block placed on it sits at (m)
  // pose(g, p, v, tag): run mode, v = joint values by short name, tag(name) = signal value
  const MACHINE_CATS = [
    { id: 'structure', name: '구조' }, { id: 'transport', name: '반송' }, { id: 'pneumatic', name: '공압' }, { id: 'electric', name: '전동' },
    { id: 'robot', name: '로봇' }, { id: 'sensor', name: '센서' }, { id: 'work', name: '워크·용기' }, { id: 'feeder', name: '피더' }, { id: 'process', name: '공정' },
  ];
  const B = {};
  const bdef = (id, o) => { B[id] = Object.assign({ id, params: {}, fields: [], joints: () => [], io: () => [], top: () => 0, onTop: false }, o); };
  const J = (id, type, axis, mode, min, max, vmax, amax) => ({ id, type, axis, mode, min, max, home: min, vmax, amax, verified: { vmax: false, amax: false } });
  const out = (tag, type = 'bool', binding) => ({ tag, dir: 'out', type, ...(binding ? { binding } : {}) });
  const inn = (tag, type = 'bool', binding) => ({ tag, dir: 'in', type, ...(binding ? { binding } : {}) });

  bdef('frame', { name: '프레임 (테이블)', cat: 'structure', code: 'FR', params: { w: 1200, d: 800, h: 850 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이', 'mm', 10)],
    top: p => mm(p.h), heightKey: 'h', build: p => { const g = new T.Group(); legs(g, mm(p.w), mm(p.d), mm(p.h) - 0.03); bx(g, 'body', mm(p.w), 0.03, mm(p.d), 0, mm(p.h) - 0.03); bx(g, 'frame', mm(p.w), 0.04, mm(p.d) - 0.1, 0, 0.12); return g; } });
  bdef('pedestal', { name: '로봇 단상 (받침대)', cat: 'structure', code: 'PD', params: { w: 700, d: 700, h: 600 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이', 'mm', 10)], heightKey: 'h',
    top: p => mm(p.h), build: p => { const g = new T.Group(), w = mm(p.w), d = mm(p.d), h = mm(p.h); bx(g, 'frame', w, 0.03, d); bx(g, 'body', w * 0.7, Math.max(0.02, h - 0.06), d * 0.7, 0, 0.03); bx(g, 'light', w * 0.85, 0.03, d * 0.85, 0, h - 0.03); return g; } });
  bdef('base-plate', { name: '베이스 플레이트', cat: 'structure', code: 'BP', params: { w: 800, d: 600, t: 25 }, fields: [num('w', '가로'), num('d', '세로'), num('t', '두께', 'mm', 5)], onTop: true,
    top: p => mm(p.t), build: p => { const g = new T.Group(); bx(g, 'steel', mm(p.w), mm(p.t), mm(p.d)); return g; } });
  bdef('post', { name: '기둥 프로파일', cat: 'structure', code: 'PT', params: { h: 1200, s: 60 }, fields: [num('h', '높이', 'mm', 10), num('s', '단면', 'mm', 5)], onTop: true,
    top: p => mm(p.h), build: p => { const g = new T.Group(); bx(g, 'frame', mm(p.s), mm(p.h), mm(p.s)); return g; } });
  bdef('cover', { name: '커버·안전 가드', cat: 'structure', code: 'GD', params: { w: 1200, h: 1200 }, fields: [num('w', '가로'), num('h', '높이')], onTop: true,
    build: p => { const g = new T.Group(); bx(g, 'glass', mm(p.w), mm(p.h), 0.01); bx(g, 'frame', mm(p.w), 0.03, 0.03, 0, mm(p.h) - 0.03); bx(g, 'frame', mm(p.w), 0.03, 0.03); for (const s of [-1, 1]) bx(g, 'frame', 0.03, mm(p.h), 0.03, s * mm(p.w) / 2); return g; } });
  bdef('control-cabinet', { name: '제어반 외함', cat: 'structure', code: 'CP', params: { w: 600, d: 400, h: 1800 }, fields: [num('w', '가로'), num('d', '세로'), num('h', '높이')], build: p => cabinet(mm(p.w), mm(p.d), mm(p.h)) });
  bdef('op-panel', { name: 'OP 조작반', cat: 'structure', code: 'OP', build: () => opPanel(),
    io: P => [inn(`${P}_START_PB`), inn(`${P}_STOP_PB`), inn(`${P}_ESTOP`)] });
  bdef('tower-lamp', { name: '타워램프', cat: 'structure', code: 'TL', onTop: true, build: () => { const g = new T.Group(); cy(g, 'frame', 0.012, 0.3); lampStack(g, 0, 0.3, 0, 1.2); return g; },
    io: P => [out(`${P}_RED`), out(`${P}_YEL`), out(`${P}_GRN`)],
    pose: (g, p, v, tag, P) => { const set = (n, on, role) => { const m = g.getObjectByName(n); if (m) m.material = on ? mat(role) : mat('dark'); };
      set('lamp_red', tag(`${P}_RED`), 'glowR'); set('lamp_yel', tag(`${P}_YEL`), 'glowA'); set('lamp_grn', tag(`${P}_GRN`), 'glowG'); } });

  const convIo = (P, p) => [out(`${P}_RUN`, 'bool', { kind: 'joint', target: `${P}_BELT` }), out(`${P}_DIR`), out(`${P}_SPEED`, 'real'), inn(`${P}_FAULT`)];
  for (const [id, name, v] of [['belt-conveyor', '벨트 컨베이어', 'belt'], ['roller-conveyor', '롤러 컨베이어', 'roller']]) bdef(id, { name, cat: 'transport', code: 'CV',
    params: { length: 3000, w: 500, h: 900, speed: 300 }, fields: [num('length', '길이'), num('w', '폭', 'mm', 10), num('h', '반송 높이', 'mm', 10), num('speed', '속도', 'mm/s', 10)],
    top: p => mm(p.h), conveyor: true, heightKey: 'h', pose: (g, p, v) => conveyorPose(g, v.BELT),
    joints: (P, p) => [J(`${P}_BELT`, 'lin', [1, 0, 0], 'continuous', 0, p.length, p.speed, 1000)], io: convIo,
    build: p => conveyorShape(v, mm(p.length), mm(p.w), mm(p.h)) });
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
  bdef('rotary-table', { name: '회전 테이블 (인덱스)', cat: 'electric', code: 'RT', params: { d: 800, stations: 4 }, fields: [num('d', '지름', 'mm', 10), num('stations', '분할 수', '개', 1, 2)], onTop: true,
    top: () => 0.25, joints: (P) => [J(`${P}_R`, 'rot', [0, 0, 1], 'position', 0, 360, 90, 360)],
    io: P => [out(`${P}_INDEX`, 'real', { kind: 'joint', target: `${P}_R` }), inn(`${P}_INPOS`, 'bool', { kind: 'sensor', target: `${P}_R:target` })],
    build: p => { const g = new T.Group(); cy(g, 'frame', 0.15, 0.2); const t = grp(g, 'disk', 0, 0.2); cy(t, 'body', mm(p.d) / 2, 0.05, 0, 0, 0, 'y', 40); for (let i = 0; i < (p.stations | 0); i++) { const a = (i / p.stations) * Math.PI * 2; bx(t, 'steel', 0.12, 0.03, 0.12, Math.cos(a) * mm(p.d) * 0.35, 0.05, Math.sin(a) * mm(p.d) * 0.35); } return g; },
    pose: (g, p, v) => { const t = g.getObjectByName('disk'); if (t) t.rotation.y = (v.R || 0) * Math.PI / 180; } });

  const robotIo = P => [out(`${P}_START`), out(`${P}_PROG`, 'int'), inn(`${P}_BUSY`, 'bool', { kind: 'process', target: `${P}_START` }), inn(`${P}_DONE`, 'bool', { kind: 'process', target: `${P}_START` })];
  bdef('robot-6axis', { name: '6축 다관절 로봇', cat: 'robot', code: 'RB', onTop: true, params: { reach: 1200, payload: 10, cycle: 4 }, fields: [num('reach', '도달 거리', 'mm', 50), num('payload', '가반 중량', 'kg', 1), num('cycle', '동작 시간', 's', 0.5)],
    joints: (P) => [J(`${P}_J1`, 'rot', [0, 0, 1], 'position', -170, 170, 180, 720)], io: robotIo,
    build: p => { const g = new T.Group(); arm(g, mm(p.reach)); return g; },
    pose: (g, p, v) => { const j1 = g.getObjectByName('j1'), j2 = g.getObjectByName('j2'), j3 = g.getObjectByName('j3'); const k = v.RUN || 0;
      if (j1) j1.rotation.y = Math.sin(k * Math.PI) * 1.4; if (j2) j2.rotation.z = -0.35 - Math.sin(k * Math.PI) * 0.4; if (j3) j3.rotation.z = 0.2 + Math.sin(k * Math.PI) * 0.5; } });
  bdef('scara', { name: '스카라 로봇', cat: 'robot', code: 'SCR', onTop: true, params: { reach: 600, cycle: 2 }, fields: [num('reach', '도달 거리', 'mm', 50), num('cycle', '동작 시간', 's', 0.5)],
    io: robotIo, build: p => { const g = new T.Group(), r = mm(p.reach); cy(g, 'light', 0.1, 0.5); const a1 = grp(g, 'j1', 0, 0.5); bx(a1, 'light', r * 0.55, 0.08, 0.12, r * 0.27); const a2 = grp(a1, 'j2', r * 0.52, 0.08); bx(a2, 'light', r * 0.5, 0.07, 0.1, r * 0.24); cy(a2, 'steel', 0.015, 0.3, r * 0.48, -0.3); return g; },
    pose: (g, p, v) => { const k = v.RUN || 0, a1 = g.getObjectByName('j1'), a2 = g.getObjectByName('j2'); if (a1) a1.rotation.y = Math.sin(k * Math.PI) * 1.2; if (a2) a2.rotation.y = -Math.sin(k * Math.PI) * 1.6; } });

  const sensorBuild = (role) => () => { const g = new T.Group(); bx(g, 'frame', 0.02, 0.08, 0.02); bx(g, role, 0.03, 0.04, 0.02, 0, 0.08); return g; };
  bdef('photo-sensor', { name: '광전 센서', cat: 'sensor', code: 'PS', onTop: true, params: { range: 500 }, fields: [num('range', '감지 거리', 'mm', 10)], sensor: true,
    io: P => [inn(`${P}_ON`, 'bool', { kind: 'sensor', target: 'work' })], build: sensorBuild('dark') });
  bdef('proximity-sensor', { name: '근접 센서', cat: 'sensor', code: 'PX', onTop: true, params: { range: 8 }, fields: [num('range', '감지 거리', 'mm', 1)], sensor: true,
    io: P => [inn(`${P}_ON`, 'bool', { kind: 'sensor', target: 'work' })], build: () => { const g = new T.Group(); cy(g, 'steel', 0.009, 0.06, 0, 0, 0); return g; } });
  bdef('vision-camera', { name: '비전 카메라', cat: 'sensor', code: 'CAM', params: { h: 1200 }, fields: [num('h', '설치 높이', 'mm', 10)],
    io: P => [out(`${P}_TRIG`), inn(`${P}_OK`, 'bool', { kind: 'process', target: `${P}_TRIG` }), inn(`${P}_NG`)],
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

  function buildBlock(id, p = {}) { const d = B[id]; if (!d) { const g = new T.Group(); bx(g, 'body', 0.2, 0.2, 0.2); return g; } return d.build(Object.assign({}, d.params, p)); }

  window.OneLibrary = { mat, lampMat, FACTORY: F, FACTORY_GROUPS, buildFactory, special, BLOCKS: B, MACHINE_CATS, buildBlock, conveyorShape, workShape, arm, person };
})();
