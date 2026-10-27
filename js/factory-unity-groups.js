// Model groups for the factory builder (console 1): a 'ufmodel' object whose params carry `items` instead of one
// `model` is a whole block of catalog models (js/factory-unity.js) placed as one object — a production block of the
// Unity Factory demo, a pallet rack with its stock, a floor stock area. Items are [catalog key, x, y, z, yaw°] in the
// object's frame (x/y/z = the item's placed() origin, as in assets/models/*/scene-placements.json), or
// [key, x, y, z, yaw°, quat [x, y, z, w], scale [x, y, z]] for tilted / non-uniform items.
// In console 1 every model mesh becomes one InstancedMesh per group (hundreds of conveyors stay a few dozen draw
// calls); the factory export (console 2) gets plain meshes instead, because three r147's GLTFExporter does not write
// instancing. Robot arms in robot cells stay real clones so they keep their idle sway. The demo layouts
// (assets/layouts/) are built from these groups by tools/factory-warehouse-layout.py. Single belt models can also carry
// moving products (params.flow), and the builder's AMRs, workers and doors get Asset Store models (end of file).
(function () {
  const FE = window.FactoryElements, FU = window.FactoryUnity, T = FE && FE.TYPES.ufmodel;
  if (!T || !FU || !window.FactoryAssets) return;
  const { build, animate, drives, footprint } = T;
  const ARM = 'uf_arm', JOINTS = [['Rig_Arm_1', 'UF_J1', 'z'], ['Rig_Arm_2', 'UF_J2', 'y'], ['Rig_Arm_3', 'UF_J3', 'y'], ['Rig_Arm_4', 'UF_J4', 'y']];

  // lighter geometry for the models a demo repeats hundreds of times (assets/models/*/lod/, meshoptimizer-simplified
  // to ~25 % of the triangles, no textures): a group draws the LOD shape with the full model's materials
  const A = window.FactoryAssets, LOD = '@lod';
  const LODS = ['unity-factory/Line_01', 'unity-factory/Line_02', 'unity-factory/Line_03', 'unity-factory/Line_04', 'unity-factory/Line_05', 'unity-factory/Line_06',
    'unity-factory/Line_07', 'unity-factory/Line_07A', 'unity-factory/Line_07B', 'unity-factory/Line_07C', 'unity-factory/Line_08', 'unity-factory/Line_09',
    'unity-factory/Product', 'unity-factory/Worker', 'unity-factory/Controller_1', 'unity-warehouse/PlasticBox_A', 'unity-warehouse/Worker'];
  for (const [id, m] of Object.entries(A.MODELS)) {
    const f = LODS.find(f => m.url === 'assets/models/' + f + '.glb');
    if (f) A.MODELS[id + LOD] = { url: m.url.replace(/([^/]+)\.glb$/, 'lod/$1.glb'), label: m.label };
  }
  // a LOD arriving rebuilds the groups like its full model does (the builder listens for the full model's id)
  addEventListener('factory-assets-ready', e => { const id = e.detail.id; if (id.endsWith(LOD)) dispatchEvent(new CustomEvent('factory-assets-ready', { detail: { id: id.slice(0, -LOD.length) } })); });
  // the part to show: the full model with its meshes' geometry swapped for the LOD's (same node order), or null
  function part(id) {
    const m = A.get(id); if (!m) { A.load(id).catch(() => {}); return null; }
    if (!A.MODELS[id + LOD] || A.state(id + LOD) === 'failed') return m;
    const lod = A.get(id + LOD); if (!lod) return null; // loading
    const a = [], b = []; m.traverse(o => o.isMesh && a.push(o)); lod.traverse(o => o.isMesh && b.push(o));
    if (a.length === b.length) a.forEach((o, i) => { o.userData.lod = b[i].geometry; });
    return m;
  }

  // key → { meshes: [{ geometry, material, matrix }], arm: Matrix4 | null }, relative to the item's placed() origin;
  // made once every part of the key (and its LOD) has loaded
  const templates = {};
  function template(key) {
    if (templates[key]) return templates[key];
    const c = FU.CATALOG[key]; if (!c) return null;
    const all = new THREE.Group(); let missing = false;
    for (const [id, x, y, z] of c.parts) { const m = part(id); if (!m) { missing = true; continue; } m.position.set(x, y, z); m.userData.part = id; all.add(m); }
    if (missing) return null;
    const root = A.placed(all, 'T'); root.updateMatrixWorld(true); // placed on the full model's box
    const t = { meshes: [], arm: null };
    for (const part of all.children) {
      if (part.userData.part === ARM && c.parts.length > 1) { t.arm = part.matrixWorld.clone(); continue; } // a cell's arm stays a live clone
      part.traverse(m => { if (m.isMesh && m.visible) t.meshes.push({ geometry: m.userData.lod || m.geometry, material: m.material, matrix: m.matrixWorld.clone() }); });
    }
    return (templates[key] = t);
  }
  const itemMatrix = it => {
    const q = it[5] ? new THREE.Quaternion(...it[5]) : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (it[4] || 0) * Math.PI / 180);
    const s = it[6] ? new THREE.Vector3(...it[6]) : new THREE.Vector3(1, 1, 1);
    return new THREE.Matrix4().compose(new THREE.Vector3(it[1], it[2], it[3]), q, s);
  };

  function buildGroup(g, p) {
    const s = Math.max(0.1, p.scale || 1), all = new THREE.Group(); all.name = 'UF_Group'; all.scale.setScalar(s);
    const inView = FE.inView ? FE.inView() : true, byKey = {};
    p.items.forEach(it => (byKey[it[0]] = byKey[it[0]] || []).push(it));
    let missing = 0;
    for (const [key, list] of Object.entries(byKey)) {
      const t = template(key); if (!t) { missing += list.length; continue; }
      const mats = list.map(itemMatrix);
      t.meshes.forEach((m, k) => {
        if (inView) {
          const im = new THREE.InstancedMesh(m.geometry, m.material, mats.length); im.name = key + '_' + k;
          const tmp = new THREE.Matrix4(); mats.forEach((M, i) => im.setMatrixAt(i, tmp.multiplyMatrices(M, m.matrix)));
          im.castShadow = im.receiveShadow = true; im.frustumCulled = false; all.add(im); // r147 culls by the base geometry's sphere
        } else mats.forEach((M, i) => { const mesh = new THREE.Mesh(m.geometry, m.material); mesh.name = key + '_' + i + '_' + k; mesh.matrixAutoUpdate = false; mesh.matrix.multiplyMatrices(M, m.matrix); all.add(mesh); });
      });
      if (t.arm) mats.forEach((M, i) => { // the cell's arm: a jointed clone, swaying like a single arm
        const arm = A.get(ARM); if (!arm) return;
        arm.name = 'UF_Arm_' + key + '_' + i; new THREE.Matrix4().multiplyMatrices(M, t.arm).decompose(arm.position, arm.quaternion, arm.scale);
        for (const [n, w, ax] of JOINTS) { const node = arm.getObjectByName(n); if (node) { const j = A.jointWrap(node, w); j.userData.axis = ax; j.userData.phase = i * 0.7; } }
        all.add(arm);
      });
    }
    g.add(all); g.userData.ufLoaded = !missing;
    g.userData.joints = []; all.traverse(o => { if (/^UF_J\d$/.test(o.name)) g.userData.joints.push(o); });
    animateGroup(g, p, 0);
  }
  // every arm of the group sways like js/factory-unity.js's single arm, each a little out of phase
  const AMP = { UF_J1: 0.7, UF_J2: 0.22, UF_J3: -0.35, UF_J4: 0.25 };
  function animateGroup(g, p, t) {
    const per = Math.max(4, p.cycle || 12);
    for (const j of g.userData.joints || []) j.rotation[j.userData.axis] = AMP[j.name] * Math.sin(2 * Math.PI * t / per + j.userData.phase + (j.name === 'UF_J1' ? 0 : 0.6));
  }
  // the items' box in the object's frame: [x, z] size, for the footprint, selection and placement checks
  function extent(p) {
    if (p._ext) return p._ext;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const it of p.items) {
      const c = FU.CATALOG[it[0]], [w, , d] = c ? c.size : [1, 1, 1], a = (it[4] || 0) * Math.PI / 180;
      const hx = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * d) / 2, hz = (Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * d) / 2;
      x0 = Math.min(x0, it[1] - hx); x1 = Math.max(x1, it[1] + hx); z0 = Math.min(z0, it[3] - hz); z1 = Math.max(z1, it[3] + hz);
    }
    const s = Math.max(0.1, p.scale || 1);
    Object.defineProperty(p, '_ext', { value: [Math.max(0.2, (x1 - x0) * s), Math.max(0.2, (z1 - z0) * s)], enumerable: false });
    return p._ext;
  }

  // a belt model with params.flow = { speed m/s, pitch m, item: catalog key }: items ride its local Z axis on
  // the belt top, entering at -Z and leaving at +Z (dir -1 reverses), evenly spaced, forever
  const flowLen = p => FU.CATALOG[p.model].size[2] * Math.max(0.1, p.scale || 1);
  const flowTop = p => FU.CATALOG[p.model].size[1] * Math.max(0.1, p.scale || 1);
  const flowCount = p => Math.max(1, Math.floor(flowLen(p) / Math.max(0.3, p.flow.pitch || 1.2)));
  const flowZ = (p, k, t) => { const L = flowLen(p), n = flowCount(p), u = ((t * (p.flow.speed || 0.3) / L + k / n) % 1 + 1) % 1; return (u - 0.5) * L * (p.flow.dir === -1 ? -1 : 1); };
  function buildFlow(g, p) {
    const key = p.flow.item || 'product', c = FU.CATALOG[key]; if (!c) return;
    const lane = new THREE.Group(); lane.name = 'UF_Flow'; g.add(lane);
    for (let k = 0; k < flowCount(p); k++) {
      const holder = new THREE.Group(); holder.name = 'UF_Flow_' + (k + 1); holder.position.y = flowTop(p) + (p.flow.lift || 0); lane.add(holder);
      const m = A.get(c.parts[0][0]); if (m) holder.add(A.placed(m, 'UF_Flow_Item')); else A.load(c.parts[0][0]).catch(() => {});
    }
    animateFlow(g, p, 0);
  }
  function animateFlow(g, p, t) { const lane = g.getObjectByName('UF_Flow'); if (lane) lane.children.forEach((h, k) => { h.position.z = flowZ(p, k, t); }); }
  // console 2: each item's Z travel (mm) from its start, a LinearZ drive per item
  const flowDrives = (g, p, frames, spf) => { const lane = g.getObjectByName('UF_Flow'); return lane ? lane.children.map((h, k) => {
    const z0 = flowZ(p, k, 0), series = new Array(frames); for (let f = 0; f < frames; f++) series[f] = Math.round((flowZ(p, k, f * spf) - z0) * 10000) / 10;
    return { node: h, dir: 'LinearZ', rev: false, series };
  }) : []; };

  // the factory export (console 2) draws single models through the group path too, so they get the LOD shapes
  const hasLod = key => FU.CATALOG[key] && FU.CATALOG[key].parts.some(([id]) => A.MODELS[id + LOD]);
  T.build = (g, p) => {
    if (p.items && p.items.length) return buildGroup(g, p);
    if (FE.inView && !FE.inView() && hasLod(p.model)) buildGroup(g, Object.assign({}, p, { items: [[p.model, 0, 0, 0, 0]] })); else build(g, p);
    if (p.flow && FU.CATALOG[p.model]) buildFlow(g, p);
  };
  T.animate = (g, p, t) => { if (p.items) return animateGroup(g, p, t); animate(g, p, t); if (p.flow) animateFlow(g, p, t); };
  T.drives = (g, p, frames, spf) => (p.items ? [] : drives(g, p, frames, spf).concat(p.flow ? flowDrives(g, p, frames, spf) : []));
  T.footprint = p => (p.items && p.items.length ? extent(p) : footprint(p));
  const cycle = T.cycle; T.cycle = p => (p.items ? 0 : p.flow ? Math.max(cycle(p), flowLen(p) / (p.flow.speed || 0.3)) : cycle(p));

  // Asset Store vehicles and people for the builder's movers: an AMR with params.model 'uw_forklift' or
  // 'uw_palletrobot' and every worker use the warehouse models (front turned to local +X, the travel
  // direction); AMR_Load (a pallet with a carton) shows while it carries. Until a model loads the
  // procedural shape stands in. A door with params.open has no leaf, so movers visibly pass through it.
  const TY = FE.TYPES, LOAD = { uw_forklift: [1.55, 0.18], uw_palletrobot: [0, 0.14] }; // load x, y in the AMR frame
  const front = (m, name) => { const turn = new THREE.Group(); turn.add(m); m.rotation.y = Math.PI / 2; return A.placed(turn, name); };
  const amrBuild = TY.amr.build;
  TY.amr.build = (g, p) => {
    const m = LOAD[p.model] && A.get(p.model);
    if (!m) { if (LOAD[p.model]) A.load(p.model).catch(() => {}); return amrBuild(g, Object.assign({}, p, { model: LOAD[p.model] ? 'simple' : p.model })); }
    g.add(front(m, 'AMR_Model'));
    const load = new THREE.Group(); load.name = 'AMR_Load'; const [lx, ly] = LOAD[p.model]; load.position.set(lx, ly, 0); g.add(load);
    const pal = A.get('uw_pallet'), box = A.get('uw_cardboard_a1');
    if (pal) load.add(A.placed(pal, 'AMR_Pallet')); else A.load('uw_pallet').catch(() => {});
    if (box) { const b = A.placed(box, 'AMR_Carton'); b.position.y = 0.13; load.add(b); } else A.load('uw_cardboard_a1').catch(() => {});
  };
  const workerBuild = TY.worker.build;
  TY.worker.build = (g, p, f) => {
    const m = A.get('uw_worker');
    workerBuild(g, p, f); // ring and the ⚠ warning stay; the box figure goes once the model is here
    if (!m) return;
    g.children.filter(o => /^Worker_(Leg|Body|Head|Helmet)$/.test(o.name)).forEach(o => g.remove(o));
    g.add(front(m, 'Worker_Model'));
  };
  const doorBuild = TY.door.build;
  TY.door.build = (g, p, f) => { doorBuild(g, p, f); if (p.open) { const leaf = g.getObjectByName('Door_Leaf'); if (leaf) g.remove(leaf); } };
})();
