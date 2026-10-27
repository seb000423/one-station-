// Unity Factory equipment for the factory builder (console 1) and the factory export: the production-line
// machines, 6-axis arm and control cabinets of Unity's "Unity Factory" asset, converted to GLB
// (assets/models/unity-factory/, loaded by js/factory-assets.js) and placed as one element type 'ufmodel'
// with a model picker. Each entry has its footprint in metres (x × z, the GLB's own size) so collision
// checks and the grey stand-in box (shown until the GLB arrives) match the model. 'cell07' composes the
// robot cell the way the Unity prefab does: frame body + three guard frames + the arm on its base.
// The arm (alone or in the cell) idles with a slow joint sway: animate() in console 1, drives() for console 2.
// Unity's "Unity Warehouse" asset (building, pallet racks, forklifts, pallets, boxes, workers; assets/models/unity-warehouse/)
// and the Unity Factory building, carts and workers come in the same way, one part each.
// The same type also places the EGR cooler assembly line workstations (assets/models/egr-line/). Every catalog
// entry is its own palette tile (모델 tab) with a thumbnail from assets/models/thumbs/.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const { mat, box } = FE.helpers;
  const stand = mat(0x9aa3ad, { transparent: true, opacity: 0.35, metalness: 0.1, roughness: 0.8 });

  // id → { label, size: [x, y, z] m, parts: [[asset id, x, y, z]] }  (parts share the GLB origin; the Unity
  // prefab offsets are mirrored in X because the GLBs come out of Blender's FBX import, not Unity's)
  const UF = 'Unity Factory', UW = 'Unity Warehouse', EGR = 'EGR 조립 라인';
  const CATALOG = {
    line01: { label: '캐비닛 벨트 유닛', group: UF, size: [0.93, 1.26, 0.90], parts: [['uf_line01', 0, 0, 0]] },
    line02: { label: '소형 벨트 유닛', group: UF, size: [0.69, 0.89, 0.69], parts: [['uf_line02', 0, 0, 0]] },
    line03: { label: '곡선 벨트 유닛', group: UF, size: [0.77, 0.90, 0.77], parts: [['uf_line03', 0, 0, 0]] },
    line04: { label: '벨트 컨베이어 4.6 m', group: UF, size: [0.60, 0.85, 4.65], parts: [['uf_line04', 0, 0, 0]] },
    line05: { label: '벨트 컨베이어 2.3 m', group: UF, size: [0.60, 0.85, 2.25], parts: [['uf_line05', 0, 0, 0]] },
    line06: { label: '프레임 가공 셀', group: UF, size: [1.16, 2.18, 1.35], parts: [['uf_line06', 0, 0, 0]] },
    cell07: { label: '로봇 셀 (본체 + 프레임 + 로봇팔)', group: UF, size: [3.37, 3.88, 3.58], parts: [['uf_line07', 0, 0, 0], ['uf_line07a', 0, 0, 0], ['uf_line07b', 0, 0, 0], ['uf_line07c', 0, 0, 0], ['uf_arm', 1.42, 0.149, 0]] },
    line07: { label: '로봇 셀 본체만', group: UF, size: [3.37, 2.21, 2.86], parts: [['uf_line07', 0, 0, 0]] },
    line08: { label: '설비 캐비닛 (문)', group: UF, size: [0.71, 1.73, 1.10], parts: [['uf_line08', 0, 0, 0]] },
    line09: { label: '설비 캐비닛 (소형)', group: UF, size: [0.59, 0.96, 0.79], parts: [['uf_line09', 0, 0, 0]] },
    arm: { label: '6축 로봇팔', group: UF, size: [1.30, 2.95, 0.71], parts: [['uf_arm', 0, 0, 0]] },
    ctrl1: { label: '제어반 (대형)', group: UF, size: [1.70, 2.27, 0.47], parts: [['uf_ctrl1', 0, 0, 0]] },
    ctrl2: { label: '조작반 (램프)', group: UF, size: [0.40, 1.25, 1.52], parts: [['uf_ctrl2', 0, 0, 0]] },
    ctrl3: { label: '조작반 (램프) B', group: UF, size: [0.40, 1.25, 1.59], parts: [['uf_ctrl3', 0, 0, 0]] },
    product: { label: '가공품 트레이', group: UF, size: [0.32, 0.17, 0.50], parts: [['uf_product', 0, 0, 0]] },
    uf_building: { label: '공장 건물 (Unity Factory)', group: UF, size: [67.37, 9.55, 67.34], parts: [['uf_building', 0, 0, 0]] },
    uf_cart: { label: '운반 카트', group: UF, size: [0.56, 1.01, 0.94], parts: [['uf_cart', 0, 0, 0]] },
    uf_wagon: { label: '부품 왜건', group: UF, size: [0.59, 1.08, 1.56], parts: [['uf_wagon', 0, 0, 0]] },
    uf_worker: { label: '작업자 (공장)', group: UF, size: [0.80, 1.82, 0.40], parts: [['uf_worker', 0, 0, 0]] },
    uf_tablet: { label: '태블릿 (공장)', group: UF, size: [0.31, 0.22, 0.01], parts: [['uf_tablet', 0, 0, 0]] },
    uw_building: { label: '창고 건물', group: UW, size: [37.66, 9.80, 65.03], parts: [['uw_building', 0, 0, 0]] },
    uw_shelf: { label: '파렛트 랙 15.5 m', group: UW, size: [1.14, 7.06, 15.52], parts: [['uw_shelf', 0, 0, 0]] },
    uw_forklift: { label: '지게차', group: UW, size: [1.49, 2.79, 4.74], parts: [['uw_forklift', 0, 0, 0]] },
    uw_reachlift: { label: '리치 지게차', group: UW, size: [1.20, 2.48, 2.57], parts: [['uw_reachlift', 0, 0, 0]] },
    uw_palletrobot: { label: '팔레트 운반 로봇', group: UW, size: [0.76, 0.13, 0.99], parts: [['uw_palletrobot', 0, 0, 0]] },
    uw_trolley: { label: '롤 대차', group: UW, size: [1.24, 1.83, 1.12], parts: [['uw_trolley', 0, 0, 0]] },
    uw_pallet: { label: '플라스틱 팔레트', group: UW, size: [1.07, 0.13, 1.06], parts: [['uw_pallet', 0, 0, 0]] },
    uw_sunoko: { label: '목재 팔레트', group: UW, size: [1.06, 0.13, 1.06], parts: [['uw_sunoko', 0, 0, 0]] },
    uw_pedestal: { label: '팔레트 받침대', group: UW, size: [1.10, 0.18, 1.13], parts: [['uw_pedestal', 0, 0, 0]] },
    uw_plasticbox_a: { label: '플라스틱 박스 (대)', group: UW, size: [1.04, 0.80, 1.05], parts: [['uw_plasticbox_a', 0, 0, 0]] },
    uw_plasticbox_b: { label: '플라스틱 박스 (소)', group: UW, size: [1.03, 0.34, 1.04], parts: [['uw_plasticbox_b', 0, 0, 0]] },
    uw_cardboard_a1: { label: '골판지 상자 A1', group: UW, size: [1.05, 0.82, 1.03], parts: [['uw_cardboard_a1', 0, 0, 0]] },
    uw_cardboard_a2: { label: '골판지 상자 A2', group: UW, size: [1.05, 0.82, 1.03], parts: [['uw_cardboard_a2', 0, 0, 0]] },
    uw_cardboard_a3: { label: '골판지 상자 A3', group: UW, size: [1.05, 0.82, 1.03], parts: [['uw_cardboard_a3', 0, 0, 0]] },
    uw_cardboard_b1: { label: '골판지 상자 B1', group: UW, size: [0.93, 0.33, 1.04], parts: [['uw_cardboard_b1', 0, 0, 0]] },
    uw_cardboard_b2: { label: '골판지 상자 B2', group: UW, size: [0.93, 0.33, 1.04], parts: [['uw_cardboard_b2', 0, 0, 0]] },
    uw_cardboard_b3: { label: '골판지 상자 B3', group: UW, size: [0.93, 0.33, 1.04], parts: [['uw_cardboard_b3', 0, 0, 0]] },
    uw_cardboard_c1: { label: '골판지 상자 C1', group: UW, size: [1.05, 0.37, 1.04], parts: [['uw_cardboard_c1', 0, 0, 0]] },
    uw_cardboard_c2: { label: '골판지 상자 C2', group: UW, size: [1.05, 0.37, 1.04], parts: [['uw_cardboard_c2', 0, 0, 0]] },
    uw_cardboard_c3: { label: '골판지 상자 C3', group: UW, size: [1.05, 0.37, 1.04], parts: [['uw_cardboard_c3', 0, 0, 0]] },
    uw_worker: { label: '작업자 (창고)', group: UW, size: [0.79, 1.89, 0.40], parts: [['uw_worker', 0, 0, 0]] },
    uw_tablet: { label: '태블릿 (창고)', group: UW, size: [0.31, 0.22, 0.01], parts: [['uw_tablet', 0, 0, 0]] },
    egr_st01: { label: '조립 작업대 1', group: EGR, size: [1.02, 2.15, 1.04], parts: [['egr_st01', 0, 0, 0]] },
    egr_st02: { label: '조립 작업대 2', group: EGR, size: [1.42, 2.15, 1.13], parts: [['egr_st02', 0, 0, 0]] },
    egr_st03: { label: '리크 테스트 작업대 1', group: EGR, size: [1.63, 2.15, 1.44], parts: [['egr_st03', 0, 0, 0]] },
    egr_st04: { label: '리크 테스트 작업대 2', group: EGR, size: [1.02, 2.15, 1.13], parts: [['egr_st04', 0, 0, 0]] },
    egr_st05: { label: '검사 · 포장 작업대', group: EGR, size: [1.22, 2.15, 1.13], parts: [['egr_st05', 0, 0, 0]] },
    egr_rack: { label: '슬라이딩 부품 랙', group: EGR, size: [0.47, 1.54, 1.48], parts: [['egr_rack', 0, 0, 0]] },
    egr_pallet: { label: '팔레트', group: EGR, size: [1.0, 0.15, 1.2], parts: [['egr_pallet', 0, 0, 0]] }
  };
  // palette tiles: one per catalog entry (모델 tab), images rendered by tools/render-thumbs.cjs
  const thumb = k => 'assets/models/thumbs/' + k + '.webp';
  const OPTIONS = Object.entries(CATALOG).map(([k, v]) => [k, v.label]);
  const entry = p => CATALOG[p.model] || CATALOG.line01;
  const assetIds = () => [...new Set(Object.values(CATALOG).flatMap(c => c.parts.map(x => x[0])))];

  // the arm's joints: GLB node → wrapper name, axis in the node's own frame (the rig is Z-up inside its root:
  // local −Z points up, so the base yaw is about Z and the three pitch joints about Y)
  const ARM_JOINTS = [['Rig_Arm_1', 'UF_J1', 'z'], ['Rig_Arm_2', 'UF_J2', 'y'], ['Rig_Arm_3', 'UF_J3', 'y'], ['Rig_Arm_4', 'UF_J4', 'y']];
  const ARM_AMP = { UF_J1: 0.7, UF_J2: 0.22, UF_J3: -0.35, UF_J4: 0.25 }; // rad, idle sway amplitude
  const armPose = (p, t, name) => ARM_AMP[name] * Math.sin(2 * Math.PI * t / Math.max(4, p.cycle) + (name === 'UF_J1' ? 0 : 0.6));

  const ufmodel = {
    label: '설비 모델', group: 'equipment',
    defaults: () => ({ model: 'line01', scale: 1, cycle: 12 }),
    build: (g, p) => {
      const c = entry(p), s = Math.max(0.1, p.scale || 1), A = window.FactoryAssets;
      const all = new THREE.Group(); all.name = 'UF_Parts';
      let missing = false;
      for (const [id, x, y, z] of c.parts) {
        const m = A && A.get(id);
        if (!m) { missing = true; continue; }
        m.position.set(x, y, z); all.add(m);
        if (id === 'uf_arm') for (const [n, w, ax] of ARM_JOINTS) { const node = m.getObjectByName(n); if (node) { const j = A.jointWrap(node, w); j.userData.axis = ax; } }
      }
      if (all.children.length) {
        const placed = A.placed(all, 'UF_Model'); placed.scale.setScalar(s); g.add(placed);
        g.userData.ufLoaded = !missing;
      }
      if (missing) { // stand-in box until the GLB(s) arrive (or for a part that failed to load)
        const [w, h, d] = c.size.map(v => v * s);
        const b = box(g, 'UF_Standin', w, h, d, stand, 0, h / 2, 0); b.castShadow = false;
        if (A) for (const [id] of c.parts) A.load(id).catch(() => {});
      }
      ufmodel.animate(g, p, 0);
    },
    animate: (g, p, t) => { for (const [, w] of ARM_JOINTS) { const j = g.getObjectByName(w); if (j) j.rotation[j.userData.axis] = armPose(p, t, w); } },
    drives: (g, p, frames, spf) => ARM_JOINTS.map(([, w]) => {
      const j = g.getObjectByName(w); if (!j) return null;
      const series = new Array(frames), deg = 180 / Math.PI;
      for (let f = 0; f < frames; f++) series[f] = Math.round((armPose(p, f * spf, w) - armPose(p, 0, w)) * deg * 100) / 100;
      return { node: j, dir: 'Rotation' + j.userData.axis.toUpperCase(), rev: false, series };
    }).filter(Boolean),
    footprint: p => { const c = entry(p), s = Math.max(0.1, p.scale || 1); return [c.size[0] * s, c.size[2] * s]; },
    cycle: p => (entry(p).parts.some(x => x[0] === 'uf_arm') ? Math.max(4, p.cycle) : 0)
  };
  FE.TYPES.ufmodel = ufmodel;
  if (FE.MACHINES && !FE.MACHINES.includes('ufmodel')) FE.MACHINES.push('ufmodel');
  window.FactoryUnity = { CATALOG, OPTIONS, GROUPS: [UF, UW, EGR], thumb, assetIds };
})();
