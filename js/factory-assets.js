// GLB equipment models for the factory builder (console 1): loads glTF/GLB files once (GLTFLoader + Draco),
// caches them and hands out clones, so equipment in js/factory-elements.js can show a real model instead of
// its procedural mesh. Builds stay synchronous: get(id) returns a clone when the model is loaded and null
// otherwise (the caller then builds its procedural fallback). When a model finishes loading the page gets a
// 'factory-assets-ready' event ({ detail: { id } }) and the builder rebuilds the objects that use it.
// Models come from the realvirtual WEB library already in this repo (realvirtual/library, AGPL-3.0 like the
// rest of realvirtual/). To add a model: put the .glb under assets/models/, add an entry to MODELS. Files may be
// Draco or meshopt (EXT_meshopt_compression) compressed.
(function () {
  const LOADERS = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/';
  const MODELS = {
    // FANUC CRX-10iA/L cobot, joints A1…A6 (A1 RotationY, A2 A3 A5 RotationZ, A4 A6 RotationX), base at y = 0
    fanuc: { url: 'realvirtual/library/Robots/FanucCRX-10iA-L.glb', label: 'FANUC CRX-10iA/L' },
    // AGV with lift pod, about 0.8 × 1.1 m, front towards local +Z
    agv: { url: 'realvirtual/library/MobileRobots/AGVStacker.glb', label: 'AGV Stacker' }
  };
  // Unity Factory (Unity Technologies Japan, Asset Store, converted to GLB — see assets/models/unity-factory/README.md):
  // production-line machines, a 6-axis arm, control cabinets. Metres, on the floor at y = 0, Draco compressed.
  const UF = 'assets/models/unity-factory/';
  for (const [id, file, label] of [
    ['uf_line01', 'Line_01', '캐비닛 벨트 유닛'], ['uf_line02', 'Line_02', '소형 벨트 유닛'], ['uf_line03', 'Line_03', '곡선 벨트 유닛'],
    ['uf_line06', 'Line_06', '프레임 가공 셀'],
    ['uf_line07', 'Line_07', '로봇 셀 본체'], ['uf_line07a', 'Line_07A', '로봇 셀 프레임 A'], ['uf_line07b', 'Line_07B', '로봇 셀 프레임 B'], ['uf_line07c', 'Line_07C', '로봇 셀 프레임 C'],
    ['uf_line08', 'Line_08', '설비 캐비닛 (문)'], ['uf_line09', 'Line_09', '설비 캐비닛 (소형)'],
    ['uf_arm', 'Arm', '6축 로봇팔'], ['uf_product', 'Product', '가공품 트레이'],
    ['uf_ctrl1', 'Controller_1', '제어반 (대형)'], ['uf_ctrl2', 'Controller_2', '조작반 (램프)'], ['uf_ctrl3', 'Controller_3', '조작반 (램프) B']
  ]) MODELS[id] = { url: UF + file + '.glb', label };
  for (const [id, file, label] of [
    ['uf_building', 'Building', '공장 건물'],
    ['uf_cart', 'Cart', '운반 카트'],
    ['uf_wagon', 'Wagon', '부품 왜건'],
    ['uf_worker', 'Worker', '작업자 (공장)'],
    ['uf_tablet', 'Tablet', '태블릿 (공장)']
  ]) MODELS[id] = { url: UF + file + '.glb', label };
  // Unity Warehouse (Unity Technologies Japan, Asset Store, converted the same way — assets/models/unity-warehouse/README.md):
  // warehouse building, pallet racks, forklifts, pallet robot, pallets, boxes, workers. Metres, Draco compressed.
  const UW = 'assets/models/unity-warehouse/';
  for (const [id, file, label] of [
    ['uw_building', 'Building', '창고 건물'],
    ['uw_shelf', 'Shelf', '파렛트 랙 15.5 m'],
    ['uw_forklift', 'Forklift', '지게차'],
    ['uw_reachlift', 'Reachlift', '리치 지게차'],
    ['uw_palletrobot', 'Palletrobot', '팔레트 운반 로봇'],
    ['uw_trolley', 'Trolley', '롤 대차'],
    ['uw_pallet', 'Pallet', '플라스틱 팔레트'],
    ['uw_sunoko', 'Sunoko', '목재 팔레트'],
    ['uw_pedestal', 'Pedestal', '팔레트 받침대'],
    ['uw_plasticbox_a', 'PlasticBox_A', '플라스틱 박스 (대)'],
    ['uw_plasticbox_b', 'PlasticBox_B', '플라스틱 박스 (소)'],
    ['uw_cardboard_a1', 'Cardboard_A1', '골판지 상자 A1'],
    ['uw_cardboard_a2', 'Cardboard_A2', '골판지 상자 A2'],
    ['uw_cardboard_a3', 'Cardboard_A3', '골판지 상자 A3'],
    ['uw_cardboard_b1', 'Cardboard_B1', '골판지 상자 B1'],
    ['uw_cardboard_b2', 'Cardboard_B2', '골판지 상자 B2'],
    ['uw_cardboard_b3', 'Cardboard_B3', '골판지 상자 B3'],
    ['uw_cardboard_c1', 'Cardboard_C1', '골판지 상자 C1'],
    ['uw_cardboard_c2', 'Cardboard_C2', '골판지 상자 C2'],
    ['uw_cardboard_c3', 'Cardboard_C3', '골판지 상자 C3'],
    ['uw_worker', 'Worker', '작업자 (창고)'],
    ['uw_tablet', 'Tablet', '태블릿 (창고)']
  ]) MODELS[id] = { url: UW + file + '.glb', label };
  MODELS.uw_forklift.scale = 0.75; // the Asset Store forklift is modelled ~1.33× too big (2.8 m tall): 2.1 m overhead guard, 3.6 m with forks
  // EGR cooler assembly line workstations (converted from the line's CAD, fasteners removed, meshopt compressed)
  const EGR = 'assets/models/egr-line/';
  for (const [id, file, label] of [
    ['egr_st01', 'station-01', '조립 작업대 1'], ['egr_st02', 'station-02', '조립 작업대 2'], ['egr_st03', 'station-03', '리크 테스트 작업대 1'],
    ['egr_st04', 'station-04', '리크 테스트 작업대 2'], ['egr_st05', 'station-05', '검사 · 포장 작업대'], ['egr_rack', 'rack-sliding', '슬라이딩 부품 랙'], ['egr_pallet', 'pallet', '팔레트']
  ]) MODELS[id] = { url: EGR + file + '.glb', label };
  // EGR line v3 (Ni paste dispensing → belt → stacking → AMR): procedural equipment from tools/egr-line-v3/ and the
  // FAIRINO FR5 cobot converted from the maker's STEP (joints Joint_1…Joint_6), and the Omron AGV with trolley (Sketchfab,
  // CC-BY 4.0 'Cels', see assets/models/egr-line-v3/CREDITS.md; Draco compressed). Metres.
  const E3 = 'assets/models/egr-line-v3/';
  for (const file of ['asrs_cell_a', 'egr_core_line', 'egr_core_line_manual', 'brazed_core', 'tote_brazed', 'tote_coolers', 'pack_box', 'fr3', 'fr10', 'fr16', 'fr20', 'fr30', 'insert_part', 'dispensed_sub', 'tote_dispensed', 'tote_moulded', 'egr_auto_line', 'asrs_cell', 'injection_cell', 'asrs_crane', 'asrs_rail_4m', 'rack_bay', 'omron_agv', 'dispense_cell', 'vision_gantry', 'ng_chute', 'amr_roller_deck', 'amr_deck_bot', 'conveyor_stopper',
    'roller_conveyor_1m', 'roller_conveyor_2m', 'roller_curve_90', 'belt_conveyor_2m', 'fence_panel_1m', 'fence_panel_2m', 'tote_600x400', 'egr_cooler', 'fr5',
    'fr5_stacking_cell', 'fr5_tending_cell', 'press_line_2level', 'hall_wall_6m', 'hall_door_6m', 'hall_gable_24m', 'hall_column', 'hall_roof_6m', 'floor_6m', 'floor_6m_aisle', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => 'bay_sign_0' + n)
  ]) MODELS['e3_' + file] = { url: E3 + file + '.glb', label: file };
  const entries = {}; // id → { state: 'loading' | 'ready' | 'failed', scene, promise }
  let loader = null; // Promise<GLTFLoader>

  const script = src => new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('load failed: ' + src)); document.head.appendChild(s);
  });
  const getLoader = () => loader || (loader = (async () => {
    await script(LOADERS + 'GLTFLoader.js'); await script(LOADERS + 'DRACOLoader.js'); await script(LOADERS.replace('loaders/', 'libs/') + 'meshopt_decoder.js');
    const draco = new THREE.DRACOLoader(); draco.setDecoderPath('realvirtual/draco/');
    const L = new THREE.GLTFLoader(); L.setDRACOLoader(draco); L.setMeshoptDecoder(window.MeshoptDecoder); return L;
  })());
  function load(id) {
    const m = MODELS[id]; if (!m) return Promise.reject(new Error('unknown model ' + id));
    if (entries[id]) return entries[id].promise;
    const e = entries[id] = { state: 'loading', scene: null };
    e.promise = getLoader().then(L => new Promise((ok, fail) => L.load(m.url, ok, undefined, fail))).then(gltf => {
      const root = gltf.scene; root.name = 'Model_' + id;
      if (m.scale) root.scale.multiplyScalar(m.scale); // unit fix at the source, for every use (catalog, movers, thumbnails)
      root.traverse(o => {
        delete o.userData.realvirtual; // the library's own drives; console 2 gets ours from drives()
        if (o.isMesh) { o.castShadow = o.receiveShadow = true; }
      });
      root.animations = gltf.animations || []; // clips (e.g. the FR5 stacking cell), played from the sim clock by js/factory-unity.js
      e.scene = root; e.state = 'ready';
      dispatchEvent(new CustomEvent('factory-assets-ready', { detail: { id } }));
      return root;
    }).catch(err => { e.state = 'failed'; console.warn('[factory-assets]', id, err); throw err; });
    return e.promise;
  }
  // a fresh clone of a loaded model (geometry and materials shared), or null while loading / after a failure
  function get(id) {
    const e = entries[id];
    if (!e) { load(id).catch(() => {}); return null; }
    if (e.state !== 'ready') return null;
    const c = e.scene.clone(true); c.animations = e.scene.animations; return c;
  }
  const state = id => (entries[id] ? entries[id].state : 'idle');
  // box of an object's visible meshes in the frame of `frame` (default: its parent)
  function bounds(o, frame = o.parent) { (frame || o).updateMatrixWorld(true); const inv = frame ? frame.matrixWorld.clone().invert() : new THREE.Matrix4(); const b = new THREE.Box3(); o.traverse(m => { if (m.isMesh && m.visible) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv)); } }); return b; }
  // wrap a model in a group so it is centred on the origin in x/z and stands on y = 0, optionally scaled
  // uniformly to fit [length (x), width (z)]; returns the wrapper
  function placed(model, name, fit) {
    const g = new THREE.Group(); g.name = name; g.add(model);
    let b = bounds(model); // visible meshes only
    if (fit) { const s = Math.min(fit[0] / (b.max.x - b.min.x), fit[1] / (b.max.z - b.min.z)); model.scale.multiplyScalar(s); b = bounds(model); }
    model.position.x -= (b.min.x + b.max.x) / 2; model.position.z -= (b.min.z + b.max.z) / 2; model.position.y -= b.min.y;
    return g;
  }
  // put an empty group between a node and its children, so a joint can turn about the node's own axes
  // without overwriting the node's authored rotation
  function jointWrap(node, name) {
    const j = new THREE.Group(); j.name = name;
    while (node.children.length) j.add(node.children[0]);
    node.add(j); return j;
  }
  window.FactoryAssets = { MODELS, load, get, state, placed, bounds, jointWrap, preload: ids => Promise.allSettled(ids.map(load)) };
})();
