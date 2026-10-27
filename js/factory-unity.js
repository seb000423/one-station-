// Unity Factory equipment for the factory builder (console 1) and the factory export: the production-line
// machines, 6-axis arm and control cabinets of Unity's "Unity Factory" asset, converted to GLB
// (assets/models/unity-factory/, loaded by js/factory-assets.js) and placed as one element type 'ufmodel'
// with a model picker. Each entry has its footprint in metres (x × z, the GLB's own size) so collision
// checks and the grey stand-in box (shown until the GLB arrives) match the model. 'cell07' composes the
// robot cell the way the Unity prefab does: frame body + three guard frames + the arm on its base.
// The arm (alone or in the cell) idles with a slow joint sway: animate() in console 1, drives() for console 2.
// The same type also places the EGR cooler assembly line workstations (assets/models/egr-line/). Every catalog
// entry is its own palette tile (모델 tab) with a thumbnail from assets/models/thumbs/.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const { mat, box } = FE.helpers;
  const stand = mat(0x9aa3ad, { transparent: true, opacity: 0.35, metalness: 0.1, roughness: 0.8 });

  // id → { label, size: [x, y, z] m, parts: [[asset id, x, y, z]] }  (parts share the GLB origin; the Unity
  // prefab offsets are mirrored in X because the GLBs come out of Blender's FBX import, not Unity's)
  const UF = 'Unity Factory', EGR = 'EGR 조립 라인';
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
    product: { label: '가공품 트레이', group: UF, size: [0.40, 0.21, 0.63], parts: [['uf_product', 0, 0, 0]] },
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
  window.FactoryUnity = { CATALOG, OPTIONS, GROUPS: [UF, EGR], thumb, assetIds };
})();
