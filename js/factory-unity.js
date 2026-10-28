// Unity Factory equipment for the factory builder (console 1) and the factory export: the production-line
// machines, 6-axis arm and control cabinets of Unity's "Unity Factory" asset, converted to GLB
// (assets/models/unity-factory/, loaded by js/factory-assets.js) and placed as one element type 'ufmodel'
// with a model picker. Each entry has its footprint in metres (x × z, the GLB's own size) so collision
// checks and the grey stand-in box (shown until the GLB arrives) match the model. 'cell07' composes the
// robot cell the way the Unity prefab does: frame body + three guard frames + the arm on its base.
// The arm (alone or in the cell) idles with a slow joint sway: animate() in console 1, drives() for console 2.
// Unity's "Unity Warehouse" asset (building, pallet racks, forklifts, pallets, boxes, workers; assets/models/unity-warehouse/)
// and the Unity Factory building, carts and workers come in the same way, one part each.
// The EGR cooler line workstations (assets/models/egr-line/) stay in the catalog for saved layouts but are not in the
// palette. Every other catalog entry is its own palette tile (모델 tab) with a thumbnail from assets/models/thumbs/.
// The EGR line v3 models (assets/models/egr-line-v3/, keys e3_*) come first, as the 'EGR 라인' group.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const { mat, box } = FE.helpers;
  const stand = mat(0x9aa3ad, { transparent: true, opacity: 0.35, metalness: 0.1, roughness: 0.8 });

  // id → { label, size: [x, y, z] m, parts: [[asset id, x, y, z]] }  (parts share the GLB origin; the Unity
  // prefab offsets are mirrored in X because the GLBs come out of Blender's FBX import, not Unity's)
  const UF = '공장', UW = '창고', EGR = 'EGR 조립 라인', E3 = 'EGR 라인'; // sources; the palette and object list group by cat // group names shown in the 모델 tab
  const CATALOG = {
    line01: { label: '캐비닛 벨트 유닛', group: UF, cat: '공장 설비', size: [0.93, 1.26, 0.90], parts: [['uf_line01', 0, 0, 0]] },
    line02: { label: '소형 벨트 유닛', group: UF, cat: '공장 설비', size: [0.69, 0.89, 0.69], parts: [['uf_line02', 0, 0, 0]] },
    line03: { label: '곡선 벨트 유닛', group: UF, cat: '공장 설비', size: [0.77, 0.90, 0.77], parts: [['uf_line03', 0, 0, 0]] },
    line06: { label: '프레임 가공 셀', group: UF, cat: '공장 설비', size: [1.16, 2.18, 1.35], parts: [['uf_line06', 0, 0, 0]] },
    cell07: { label: '로봇 셀 (본체 + 프레임 + 로봇팔)', group: UF, cat: '로봇', size: [3.37, 3.88, 3.58], parts: [['uf_line07', 0, 0, 0], ['uf_line07a', 0, 0, 0], ['uf_line07b', 0, 0, 0], ['uf_line07c', 0, 0, 0], ['uf_arm', 1.42, 0.149, 0]] },
    line07: { label: '로봇 셀 본체만', group: UF, cat: '공장 설비', size: [3.37, 2.21, 2.86], parts: [['uf_line07', 0, 0, 0]] },
    line08: { label: '설비 캐비닛 (문)', group: UF, cat: '공장 설비', size: [0.71, 1.73, 1.10], parts: [['uf_line08', 0, 0, 0]] },
    line09: { label: '설비 캐비닛 (소형)', group: UF, cat: '공장 설비', size: [0.59, 0.96, 0.79], parts: [['uf_line09', 0, 0, 0]] },
    arm: { label: '6축 로봇팔', group: UF, cat: '로봇', size: [1.30, 2.95, 0.71], parts: [['uf_arm', 0, 0, 0]] },
    ctrl1: { label: '제어반 (대형)', group: UF, cat: '공장 설비', size: [1.70, 2.27, 0.47], parts: [['uf_ctrl1', 0, 0, 0]] },
    ctrl2: { label: '조작반 (램프)', group: UF, cat: '공장 설비', size: [0.40, 1.25, 1.52], parts: [['uf_ctrl2', 0, 0, 0]] },
    ctrl3: { label: '조작반 (램프) B', group: UF, cat: '공장 설비', size: [0.40, 1.25, 1.59], parts: [['uf_ctrl3', 0, 0, 0]] },
    product: { label: '가공품 트레이', group: UF, cat: '부품 · 소품', size: [0.32, 0.17, 0.50], parts: [['uf_product', 0, 0, 0]] },
    uf_building: { label: '공장 건물', group: UF, cat: '건물', size: [67.37, 9.55, 67.34], parts: [['uf_building', 0, 0, 0]] },
    uf_cart: { label: '운반 카트', group: UF, cat: '물류', size: [0.56, 1.01, 0.94], parts: [['uf_cart', 0, 0, 0]] },
    uf_wagon: { label: '부품 왜건', group: UF, cat: '물류', size: [0.59, 1.08, 1.56], parts: [['uf_wagon', 0, 0, 0]] },
    uf_worker: { label: '작업자 (공장)', group: UF, cat: '사람', size: [0.80, 1.82, 0.40], parts: [['uf_worker', 0, 0, 0]] },
    uf_tablet: { label: '태블릿 (공장)', group: UF, cat: '부품 · 소품', size: [0.31, 0.22, 0.01], parts: [['uf_tablet', 0, 0, 0]] },
    uw_building: { label: '창고 건물', group: UW, cat: '건물', size: [37.66, 9.80, 65.03], parts: [['uw_building', 0, 0, 0]] },
    uw_shelf: { label: '파렛트 랙 15.5 m', group: UW, cat: '물류', size: [1.14, 7.06, 15.52], parts: [['uw_shelf', 0, 0, 0]] },
    uw_forklift: { label: '지게차', group: UW, cat: '물류', size: [1.12, 2.09, 3.56], parts: [['uw_forklift', 0, 0, 0]] },
    uw_reachlift: { label: '리치 지게차', group: UW, cat: '물류', size: [1.20, 2.48, 2.57], parts: [['uw_reachlift', 0, 0, 0]] },
    uw_palletrobot: { label: '팔레트 운반 로봇', group: UW, cat: '물류', size: [0.76, 0.13, 0.99], parts: [['uw_palletrobot', 0, 0, 0]] },
    uw_trolley: { label: '롤 대차', group: UW, cat: '물류', size: [1.24, 1.83, 1.12], parts: [['uw_trolley', 0, 0, 0]] },
    uw_pallet: { label: '플라스틱 팔레트', group: UW, cat: '물류', size: [1.07, 0.13, 1.06], parts: [['uw_pallet', 0, 0, 0]] },
    uw_sunoko: { label: '목재 팔레트', group: UW, cat: '물류', size: [1.06, 0.13, 1.06], parts: [['uw_sunoko', 0, 0, 0]] },
    uw_pedestal: { label: '팔레트 받침대', group: UW, cat: '물류', size: [1.10, 0.18, 1.13], parts: [['uw_pedestal', 0, 0, 0]] },
    uw_plasticbox_a: { label: '플라스틱 박스 (대)', group: UW, cat: '물류', size: [1.04, 0.80, 1.05], parts: [['uw_plasticbox_a', 0, 0, 0]] },
    uw_plasticbox_b: { label: '플라스틱 박스 (소)', group: UW, cat: '물류', size: [1.03, 0.34, 1.04], parts: [['uw_plasticbox_b', 0, 0, 0]] },
    uw_cardboard_a1: { label: '골판지 상자 A1', group: UW, cat: '물류', size: [1.05, 0.82, 1.03], parts: [['uw_cardboard_a1', 0, 0, 0]] },
    uw_cardboard_a2: { label: '골판지 상자 A2', group: UW, cat: '물류', size: [1.05, 0.82, 1.03], parts: [['uw_cardboard_a2', 0, 0, 0]] },
    uw_cardboard_a3: { label: '골판지 상자 A3', group: UW, cat: '물류', size: [1.05, 0.82, 1.03], parts: [['uw_cardboard_a3', 0, 0, 0]] },
    uw_cardboard_b1: { label: '골판지 상자 B1', group: UW, cat: '물류', size: [0.93, 0.33, 1.04], parts: [['uw_cardboard_b1', 0, 0, 0]] },
    uw_cardboard_b2: { label: '골판지 상자 B2', group: UW, cat: '물류', size: [0.93, 0.33, 1.04], parts: [['uw_cardboard_b2', 0, 0, 0]] },
    uw_cardboard_b3: { label: '골판지 상자 B3', group: UW, cat: '물류', size: [0.93, 0.33, 1.04], parts: [['uw_cardboard_b3', 0, 0, 0]] },
    uw_cardboard_c1: { label: '골판지 상자 C1', group: UW, cat: '물류', size: [1.05, 0.37, 1.04], parts: [['uw_cardboard_c1', 0, 0, 0]] },
    uw_cardboard_c2: { label: '골판지 상자 C2', group: UW, cat: '물류', size: [1.05, 0.37, 1.04], parts: [['uw_cardboard_c2', 0, 0, 0]] },
    uw_cardboard_c3: { label: '골판지 상자 C3', group: UW, cat: '물류', size: [1.05, 0.37, 1.04], parts: [['uw_cardboard_c3', 0, 0, 0]] },
    uw_worker: { label: '작업자 (창고)', group: UW, cat: '사람', size: [0.79, 1.89, 0.40], parts: [['uw_worker', 0, 0, 0]] },
    uw_tablet: { label: '태블릿 (창고)', group: UW, cat: '부품 · 소품', size: [0.31, 0.22, 0.01], parts: [['uw_tablet', 0, 0, 0]] },
    egr_st01: { label: '조립 작업대 1', group: EGR, cat: '공정 설비', size: [1.02, 2.15, 1.04], parts: [['egr_st01', 0, 0, 0]] },
    egr_st02: { label: '조립 작업대 2', group: EGR, cat: '공정 설비', size: [1.42, 2.15, 1.13], parts: [['egr_st02', 0, 0, 0]] },
    egr_st03: { label: '리크 테스트 작업대 1', group: EGR, cat: '공정 설비', size: [1.63, 2.15, 1.44], parts: [['egr_st03', 0, 0, 0]] },
    egr_st04: { label: '리크 테스트 작업대 2', group: EGR, cat: '공정 설비', size: [1.02, 2.15, 1.13], parts: [['egr_st04', 0, 0, 0]] },
    egr_st05: { label: '검사 · 포장 작업대', group: EGR, cat: '공정 설비', size: [1.22, 2.15, 1.13], parts: [['egr_st05', 0, 0, 0]] },
    egr_rack: { label: '슬라이딩 부품 랙', group: EGR, cat: '공정 설비', size: [0.47, 1.54, 1.48], parts: [['egr_rack', 0, 0, 0]] },
    egr_pallet: { label: '팔레트', group: EGR, cat: '공정 설비', size: [1.0, 0.15, 1.2], parts: [['egr_pallet', 0, 0, 0]] },
    // EGR line v3 (assets/models/egr-line-v3/): cat = palette / object-list category; keepY = authored at its working height (roof, gable);
    // flowAxis 'x' = conveys along local X (js/factory-unity-groups.js flow); clip = a baked animation played from the sim clock
    e3_fr5_stacking_cell: { label: '적재 셀 (FR5)', group: E3, cat: 'EGR 라인', size: [2.81, 1.33, 2.03], parts: [['e3_fr5_stacking_cell', 0, 0, 0]], clip: 'Stacking_Cycle', clipLen: 26.8 },
    e3_fr5_tending_cell: { label: '가공 셀 (AMR → FR5 → 가공기)', group: E3, cat: 'EGR 라인', size: [3.38, 2.22, 1.79], parts: [['e3_fr5_tending_cell', 0, 0, 0]], clip: 'Tending_Cycle', clipLen: 24.9 },
    e3_egr_auto_line: { label: 'EGR 자동 라인 (자동 도포 → 건조·소성 → 검사 → 인서트 사출)', group: E3, cat: 'EGR 라인', size: [16.25, 3.25, 4.49], parts: [['e3_egr_auto_line', 0, 0, 0]], clip: 'Line_Cycle', clipLen: 128 },
    e3_dispensed_sub: { label: 'Ni 페이스트 도포 기판', group: E3, cat: '부품 · 소품', size: [0.2, 0.02, 0.14], parts: [['e3_dispensed_sub', 0, 0, 0]] },
    e3_tote_dispensed: { label: '부품 상자 (도포 기판 8)', group: E3, cat: '물류', size: [0.61, 0.27, 0.42], parts: [['e3_tote_dispensed', 0, 0, 0]] },
    e3_tote_moulded: { label: '부품 상자 (사출품 8)', group: E3, cat: '물류', size: [0.61, 0.27, 0.42], parts: [['e3_tote_moulded', 0, 0, 0]] },
    e3_insert_part: { label: '인서트 사출품 (Ni 패턴 기판)', group: E3, cat: '부품 · 소품', size: [0.24, 0.06, 0.18], parts: [['e3_insert_part', 0, 0, 0]] },
    e3_injection_cell: { label: '사출 셀 (인서트 사출기 · 취출 로봇)', group: E3, cat: 'EGR 라인', size: [4.67, 3.25, 3.6], parts: [['e3_injection_cell', 0, 0, 0]], clip: 'Inject_Cycle', clipLen: 24 },
    e3_press_line_2level: { label: '2층 컨베이어 + 프레스 라인', group: E3, cat: 'EGR 라인', size: [8.0, 3.27, 1.65], parts: [['e3_press_line_2level', 0, 0, 0]], clip: 'Press_Cycle', clipLen: 36 },
    e3_dispense_cell: { label: 'Ni 페이스트 도포 셀', group: E3, cat: 'EGR 라인', size: [2.43, 2.52, 1.72], parts: [['e3_dispense_cell', 0, 0, 0]], clip: 'Dispense_Cycle', clipLen: 24 },
    e3_vision_gantry: { label: '비전 카메라 게이트', group: E3, cat: 'EGR 라인', size: [1.66, 2.0, 0.62], parts: [['e3_vision_gantry', 0, 0, 0]] },
    e3_ng_chute: { label: 'NG 배출 슈트', group: E3, cat: 'EGR 라인', size: [1.05, 0.97, 0.54], parts: [['e3_ng_chute', 0, 0, 0]] },
    e3_roller_conveyor_1m: { label: '롤러 컨베이어 1 m', group: E3, cat: 'EGR 라인', size: [1.0, 0.87, 0.64], parts: [['e3_roller_conveyor_1m', 0, 0, 0]], flowAxis: 'x' },
    e3_roller_conveyor_2m: { label: '롤러 컨베이어 2 m', group: E3, cat: 'EGR 라인', size: [2.01, 0.87, 0.71], parts: [['e3_roller_conveyor_2m', 0, 0, 0]], flowAxis: 'x' },
    e3_roller_curve_90: { label: '롤러 컨베이어 곡선 90°', group: E3, cat: 'EGR 라인', size: [1.41, 0.87, 1.41], parts: [['e3_roller_curve_90', 0, 0, 0]] },
    e3_belt_conveyor_2m: { label: '벨트 컨베이어 2 m', group: E3, cat: 'EGR 라인', size: [2.03, 0.88, 0.93], parts: [['e3_belt_conveyor_2m', 0, 0, 0]], flowAxis: 'x' },
    e3_conveyor_stopper: { label: '컨베이어 스토퍼', group: E3, cat: 'EGR 라인', size: [0.16, 0.2, 0.08], parts: [['e3_conveyor_stopper', 0, 0, 0]], clip: 'Stopper_Cycle', clipLen: 8 },
    e3_fence_panel_1m: { label: '안전 펜스 1 m', group: E3, cat: 'EGR 라인', size: [1.07, 2.0, 0.14], parts: [['e3_fence_panel_1m', 0, 0, 0]] },
    e3_fence_panel_2m: { label: '안전 펜스 2 m', group: E3, cat: 'EGR 라인', size: [2.07, 2.0, 0.14], parts: [['e3_fence_panel_2m', 0, 0, 0]] },
    e3_fr3: { label: 'FAIRINO FR3 협동로봇', group: E3, cat: '로봇', size: [0.38, 0.48, 0.23], parts: [['e3_fr3', 0, 0, 0]], spec: { payload: 3, reach: 622, use: '초소형 · 간단한 픽앤플레이스' } },
    e3_fr5: { label: 'FAIRINO FR5 협동로봇', group: E3, cat: '로봇', size: [0.61, 0.68, 0.28], parts: [['e3_fr5', 0, 0, 0]], spec: { payload: 5, reach: 922, use: '조립 · 포장 · 머신 텐딩' } },
    e3_fr10: { label: 'FAIRINO FR10 협동로봇', group: E3, cat: '로봇', size: [0.79, 0.95, 0.37], parts: [['e3_fr10', 0, 0, 0]], spec: { payload: 10, reach: 1350, use: '박스 포장 · 팔레타이징 · 디스펜싱' } },
    e3_fr16: { label: 'FAIRINO FR16 협동로봇', group: E3, cat: '로봇', size: [0.6, 0.77, 0.37], parts: [['e3_fr16', 0, 0, 0]], spec: { payload: 16, reach: 1253, use: '중량물 정밀 가공' } },
    e3_fr20: { label: 'FAIRINO FR20 협동로봇', group: E3, cat: '로봇', size: [1, 1.3, 0.46], parts: [['e3_fr20', 0, 0, 0]], spec: { payload: 20, reach: 1854, use: '대형 팔레타이징 · 무거운 부품 적재' } },
    e3_fr30: { label: 'FAIRINO FR30 협동로봇', group: E3, cat: '로봇', size: [0.79, 1.01, 0.46], parts: [['e3_fr30', 0, 0, 0]], spec: { payload: 30, reach: 1403, use: '대용량 원자재 핸들링 · 적재' } },
    e3_asrs_cell: { label: '자동창고 일체형 셀 (랙 · 크레인 · 입출고 루프)', group: E3, cat: '물류', size: [15.93, 7.75, 3.05], parts: [['e3_asrs_cell', 0, 0, 0]], clip: 'ASRS_Cycle', clipLen: 128 },
    e3_asrs_crane: { label: '자동창고 스태커 크레인', group: E3, cat: '물류', size: [3.52, 7.51, 0.87], parts: [['e3_asrs_crane', 0, 0, 0]], clip: 'Crane_Cycle', clipLen: 32 },
    e3_asrs_rail_4m: { label: '스태커 크레인 레일 4 m', group: E3, cat: '물류', size: [4.0, 7.94, 0.24], parts: [['e3_asrs_rail_4m', 0, 0, 0]] },
    e3_rack_bay: { label: '자동창고 랙 (7.5 m)', group: E3, cat: '물류', size: [2.86, 7.51, 1.15], parts: [['e3_rack_bay', 0, 0, 0]] },
    e3_amr_deck_bot: { label: 'AMR (롤러 상판)', group: E3, cat: '물류', size: [1.0, 0.68, 0.72], parts: [['e3_amr_deck_bot', 0, 0, 0]] },
    e3_amr_roller_deck: { label: 'AMR 롤러 상판', group: E3, cat: '물류', size: [0.96, 0.3, 0.71], parts: [['e3_amr_roller_deck', 0, 0, 0]] },
    e3_omron_agv: { label: 'AGV (Omron, 트롤리)', group: E3, cat: '물류', size: [1.7, 1.15, 1.26], parts: [['e3_omron_agv', 0, 0, 0]] },
    e3_pack_box: { label: '포장 박스 600×400×300 (쿨러 8개)', group: E3, cat: '물류', size: [0.6, 0.3, 0.4], parts: [['e3_pack_box', 0, 0, 0]] },
    e3_tote_600x400: { label: '부품 상자 600×400', group: E3, cat: '물류', size: [0.61, 0.27, 0.42], parts: [['e3_tote_600x400', 0, 0, 0]] },
    e3_bay_sign_01: { label: '랙 번호판 01', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_01', 0, 0, 0]] },
    e3_bay_sign_02: { label: '랙 번호판 02', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_02', 0, 0, 0]] },
    e3_bay_sign_03: { label: '랙 번호판 03', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_03', 0, 0, 0]] },
    e3_bay_sign_04: { label: '랙 번호판 04', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_04', 0, 0, 0]] },
    e3_bay_sign_05: { label: '랙 번호판 05', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_05', 0, 0, 0]] },
    e3_bay_sign_06: { label: '랙 번호판 06', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_06', 0, 0, 0]] },
    e3_bay_sign_07: { label: '랙 번호판 07', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_07', 0, 0, 0]] },
    e3_bay_sign_08: { label: '랙 번호판 08', group: E3, cat: '물류', size: [0.5, 0.5, 0.02], parts: [['e3_bay_sign_08', 0, 0, 0]] },
    e3_egr_cooler: { label: 'EGR 쿨러 (감마 1.6 T-GDI, 280×150×130)', group: E3, cat: '부품 · 소품', size: [0.28, 0.14, 0.15], parts: [['e3_egr_cooler', 0, 0, 0]] },
    e3_hall_wall_6m: { label: '공장 벽 6 m (창문)', group: E3, cat: '건물', size: [6.06, 9.2, 0.24], parts: [['e3_hall_wall_6m', 0, 0, 0]] },
    e3_hall_door_6m: { label: '공장 벽 6 m (셔터 · 출입문)', group: E3, cat: '건물', size: [6.15, 9.21, 0.61], parts: [['e3_hall_door_6m', 0, 0, 0]] },
    e3_hall_gable_24m: { label: '박공 벽 24 m', group: E3, cat: '건물', size: [24.01, 1.42, 0.16], parts: [['e3_hall_gable_24m', 0, 0, 0]], keepY: true },
    e3_hall_column: { label: '공장 기둥 8 m', group: E3, cat: '건물', size: [0.5, 8.03, 0.9], parts: [['e3_hall_column', 0, 0, 0]] },
    e3_hall_roof_6m: { label: '지붕 트러스 6 m (채광창 · 조명)', group: E3, cat: '건물', size: [6.01, 2.78, 24.3], parts: [['e3_hall_roof_6m', 0, 0, 0]], keepY: true },
    e3_floor_6m: { label: '바닥 6 m', group: E3, cat: '건물', size: [6.0, 0.01, 6.0], parts: [['e3_floor_6m', 0, 0, 0]] },
    e3_floor_6m_aisle: { label: '바닥 6 m (통로선)', group: E3, cat: '건물', size: [6.0, 0.01, 6.0], parts: [['e3_floor_6m_aisle', 0, 0, 0]] }
  };
  // palette tiles: one per catalog entry (모델 tab), images rendered by tools/render-thumbs.cjs. Only the Asset Store
  // and EGR line v3 groups are offered; the EGR workstations stay in the catalog so saved layouts that use them still open.
  const GROUPS = [E3, UF, UW]; // sources offered in the palette
  const CATS = ['EGR 라인', '로봇', '물류', '건물', '공장 설비', '부품 · 소품', '사람']; // palette sections / object-list groups, in order
  const ALIAS = { e3_rack_bay_10m: 'e3_rack_bay' }; // renamed keys in saved layouts
  const thumb = k => 'assets/models/thumbs/' + k + '.webp';
  const OPTIONS = Object.entries(CATALOG).filter(([, v]) => GROUPS.includes(v.group)).map(([k, v]) => [k, v.label]);
  const entry = p => CATALOG[ALIAS[p.model] || p.model] || CATALOG.line01;
  const assetIds = () => [...new Set(Object.values(CATALOG).flatMap(c => c.parts.map(x => x[0])))];

  // the arm's joints: GLB node → wrapper name, axis in the node's own frame (the rig is Z-up inside its root:
  // local −Z points up, so the base yaw is about Z and the three pitch joints about Y)
  const ARM_JOINTS = [['Rig_Arm_1', 'UF_J1', 'z'], ['Rig_Arm_2', 'UF_J2', 'y'], ['Rig_Arm_3', 'UF_J3', 'y'], ['Rig_Arm_4', 'UF_J4', 'y']];
  const ARM_AMP = { UF_J1: 0.7, UF_J2: 0.22, UF_J3: -0.35, UF_J4: 0.25 }; // rad, idle sway amplitude
  const armPose = (p, t, name) => ARM_AMP[name] * Math.sin(2 * Math.PI * t / Math.max(4, p.cycle) + (name === 'UF_J1' ? 0 : 0.6));

  // console 2 (ONE MONITOR) has no animation clips, only single-axis drives: sample the clip into one drive per moving node.
  // Joints (quaternion tracks about their extras.anim axis) → RotationX/Y/Z; position tracks → LinearX/Y/Z per changing axis;
  // scale tracks (parts shown / hidden) → a wrapper under the node that drops 50 m down while the part is hidden.
  const REV = { LinearX: true, LinearY: false, LinearZ: false, RotationX: false, RotationY: true, RotationZ: true }; // as js/station-export.js: positive along +X/+Y/+Z
  function clipDrives(g, frames, spf, warp) { // warp: sim time → clip time (a cell gated by its zones, js/factory-builder.js)
    const u = g.children.find(c => c.name === 'UF_Model'), mixer = u && u.userData.clipMixer, clip = u && u.userData.clip; if (!mixer || !clip) return [];
    const W = window.FactoryAssets, out = [], probes = [];
    for (const tr of clip.tracks) {
      const [name, prop] = tr.name.split('.'), node = u.getObjectByName(name); if (!node) continue;
      if (prop === 'quaternion') { const ax = (node.userData.anim && node.userData.anim.axis) || 'z'; probes.push({ node, dir: 'Rotation' + ax.toUpperCase(), get: () => { const q = node.quaternion; return 2 * Math.atan2(q[ax], q.w) * 180 / Math.PI; }, deg: true }); }
      else if (prop === 'position') for (const ax of ['x', 'y', 'z']) probes.push({ node, dir: 'Linear' + ax.toUpperCase(), get: () => node.position[ax] * 1000 });
      else if (prop === 'scale') { const vis = W.jointWrap(node, name + '_Vis'); probes.push({ node: vis, dir: 'LinearY', get: () => (node.scale.x < 0.01 ? -50000 : 0), scaleOf: node }); }
    }
    const series = probes.map(() => new Array(frames)), v0 = [];
    for (let f = 0; f < frames; f++) { mixer.setTime(warp ? warp(f * spf) : f * spf); probes.forEach((p, i) => { let v = p.get(); if (f === 0) v0[i] = v; let d = v - v0[i]; if (p.deg) { const prev = f ? series[i][f - 1] : 0; while (d - prev > 180) d -= 360; while (d - prev < -180) d += 360; } series[i][f] = Math.round(d * 100) / 100; }); }
    mixer.setTime(0);
    probes.forEach(p => { if (p.scaleOf) p.scaleOf.scale.setScalar(1); });  // exported shown; the _Vis drive hides it from frame 0 where needed
    probes.forEach((p, i) => { if (p.scaleOf) series[i] = series[i].map(d => d + (v0[i] < 0 ? -50000 : 0)); });
    probes.forEach((p, i) => { if (series[i].some(v => v !== 0)) out.push({ node: p.node, dir: p.dir, rev: REV[p.dir], series: series[i] }); });
    return out;
  }
  const clipTime = (g, t) => { const u = g.children.find(c => c.name === 'UF_Model'), m = u && u.userData.clipMixer; if (m) m.setTime(t); }; // looping clip at sim time t (the builder replaces g.userData)
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
        const y0 = c.keepY ? A.bounds(all).min.y : 0;
        const placed = A.placed(all, 'UF_Model'); all.position.y += y0; placed.scale.setScalar(s); g.add(placed);
        if (c.clip) { // a baked animation clip, driven by the sim clock (animate → clipTime): moves only while the simulation plays
          const clip = all.children.flatMap(m => m.animations || []).find(k => k.name === c.clip);
          if (clip) { const mixer = new THREE.AnimationMixer(placed); mixer.clipAction(clip).play(); placed.userData.clipMixer = mixer; placed.userData.clip = clip; }
        }
        g.userData.ufLoaded = !missing;
      }
      if (missing) { // stand-in box until the GLB(s) arrive (or for a part that failed to load)
        const [w, h, d] = c.size.map(v => v * s);
        const b = box(g, 'UF_Standin', w, h, d, stand, 0, h / 2, 0); b.castShadow = false;
        if (A) for (const [id] of c.parts) A.load(id).catch(() => {});
      }
      ufmodel.animate(g, p, 0);
    },
    animate: (g, p, t) => { for (const [, w] of ARM_JOINTS) { const j = g.getObjectByName(w); if (j) j.rotation[j.userData.axis] = armPose(p, t, w); } clipTime(g, t); },
    drives: (g, p, frames, spf, plan) => ARM_JOINTS.map(([, w]) => {
      const j = g.getObjectByName(w); if (!j) return null;
      const series = new Array(frames), deg = 180 / Math.PI;
      for (let f = 0; f < frames; f++) series[f] = Math.round((armPose(p, f * spf, w) - armPose(p, 0, w)) * deg * 100) / 100;
      return { node: j, dir: 'Rotation' + j.userData.axis.toUpperCase(), rev: false, series };
    }).filter(Boolean).concat(clipDrives(g, frames, spf, plan && plan.warp)),
    footprint: p => { const c = entry(p), s = Math.max(0.1, p.scale || 1); return [c.size[0] * s, c.size[2] * s]; },
    cycle: p => (entry(p).clipLen || (entry(p).parts.some(x => x[0] === 'uf_arm') ? Math.max(4, p.cycle) : 0))
  };
  FE.TYPES.ufmodel = ufmodel;
  FE.MACHINES = ['ufmodel']; // the only equipment type left (footprints, collisions, animation)
  window.FactoryUnity = { CATALOG, OPTIONS, GROUPS, CATS, ALIAS, thumb, assetIds, clipTime, clipDrives, catOf: key => (CATALOG[ALIAS[key] || key] || {}).cat || '공정 설비' };
})();
