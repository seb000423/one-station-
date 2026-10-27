// Model groups for the factory builder (console 1): a 'ufmodel' object whose params carry `items` instead of one
// `model` is a whole block of catalog models (js/factory-unity.js) placed as one object — a production block of the
// Unity Factory demo, a pallet rack with its stock, a floor stock area. Items are [catalog key, x, y, z, yaw°] in the
// object's frame (x/y/z = the item's placed() origin, as in assets/models/*/scene-placements.json), or
// [key, x, y, z, yaw°, quat [x, y, z, w], scale [x, y, z]] for tilted / non-uniform items.
// In console 1 every model mesh becomes one InstancedMesh per group (hundreds of conveyors stay a few dozen draw
// calls); the factory export (console 2) gets plain meshes instead, because three r147's GLTFExporter does not write
// instancing. Robot arms in robot cells stay real clones so they keep their idle sway. The demo layouts
// (assets/layouts/) are built from these groups by tools/unity-demo-layout.py.
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

  T.build = (g, p) => (p.items && p.items.length ? buildGroup(g, p) : build(g, p));
  T.animate = (g, p, t) => (p.items ? animateGroup(g, p, t) : animate(g, p, t));
  T.drives = (g, p, frames, spf) => (p.items ? [] : drives(g, p, frames, spf));
  T.footprint = p => (p.items && p.items.length ? extent(p) : footprint(p));
  const cycle = T.cycle; T.cycle = p => (p.items ? 0 : cycle(p));
})();
