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
  const LODS = ['unity-factory/Line_01', 'unity-factory/Line_02', 'unity-factory/Line_03', 'unity-factory/Line_06',
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
    if (a.length === b.length) a.forEach((o, i) => { lodOf.set(o.geometry, b[i].geometry); });
    return m;
  }

  // key → { meshes: [{ geometry, material, matrix }], arm: Matrix4 | null }, relative to the item's placed() origin;
  // made once every part of the key (and its LOD) has loaded
  const templates = {}, lodOf = new WeakMap(); // full geometry -> LOD geometry (not in userData: the exporter would write it into the GLB's JSON)
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
      part.traverse(m => { if (m.isMesh && m.visible) t.meshes.push({ geometry: lodOf.get(m.geometry) || m.geometry, material: m.material, matrix: m.matrixWorld.clone() }); });
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
    g.add(all); g.userData.ufLoaded = !missing; // (no Object3D refs in userData: the exporter writes userData into the GLB)
    animateGroup(g, p, 0);
  }
  // every arm of the group runs the pick-and-place cycle below, each a little out of phase
  function animateGroup(g, p, t) { for (const j of armJoints(g)) j.rotation[j.userData.axis] = armPose(p, t, j.name, j.userData.phase); }
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
  const flowAx = p => FU.CATALOG[p.model].flowAxis || 'z'; // Unity belts run along local Z, the EGR line v3 conveyors along X
  const flowLen = p => FU.CATALOG[p.model].size[flowAx(p) === 'x' ? 0 : 2] * Math.max(0.1, p.scale || 1);
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
  function animateFlow(g, p, t) { const lane = g.getObjectByName('UF_Flow'); if (lane) lane.children.forEach((h, k) => { h.position[flowAx(p)] = flowZ(p, k, t); }); }
  // console 2: each item's Z travel (mm) from its start, a LinearZ drive per item
  const flowDrives = (g, p, frames, spf) => { const lane = g.getObjectByName('UF_Flow'); return lane ? lane.children.map((h, k) => {
    const z0 = flowZ(p, k, 0), series = new Array(frames); for (let f = 0; f < frames; f++) series[f] = Math.round((flowZ(p, k, f * spf) - z0) * 10000) / 10;
    return flowAx(p) === 'x' ? { node: h, dir: 'LinearX', rev: true, series } : { node: h, dir: 'LinearZ', rev: false, series };
  }) : []; };

  /* ---------- robot arm: pick and place in time with the belt ---------- */
  // one cycle (p.cycle s): swing to the pick side, dip, lift, swing to the place side, dip, lift, swing back
  const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const pulse = (u, a, b, r = 0.05) => ease((u - a) / r) * (1 - ease((u - b) / r)); // 1 between a and b, soft edges
  const DIP = { UF_J2: 0.38, UF_J3: -0.55, UF_J4: 0.32 }; // rad: the three pitch joints bend down together
  function armPose(p, t, name, phase = 0) {
    const per = Math.max(4, p.cycle || 12), u = (((t / per + phase / (2 * Math.PI)) % 1) + 1) % 1;
    if (name === 'UF_J1') return -0.65 + 1.3 * (ease((u - 0.38) / 0.17) - ease((u - 0.88) / 0.12)) - (u < 0.88 ? 0 : 0); // −0.65 (pick) → +0.65 (place) → back
    return DIP[name] * (pulse(u, 0.08, 0.3) + pulse(u, 0.58, 0.8));
  }
  const armJoints = g => { const out = []; g.traverse(o => { if (/^UF_J\d$/.test(o.name)) out.push(o); }); return out; };
  const armDrives = (g, p, frames, spf) => armJoints(g).map(j => {
    const series = new Array(frames), deg = 180 / Math.PI, ph = j.userData.phase || 0;
    for (let f = 0; f < frames; f++) series[f] = Math.round((armPose(p, f * spf, j.name, ph) - armPose(p, 0, j.name, ph)) * deg * 100) / 100;
    return { node: j, dir: 'Rotation' + j.userData.axis.toUpperCase(), rev: false, series };
  });

  /* ---------- wall openings: params.cut = [[x0, x1, z0, z1, h], ...] in the model's own (unscaled) frame ----------
     The Asset Store factory building has no gate at all, so a doorway is cut out of every mesh that crosses the
     box (walls, skirts, a shutter): triangles are split along the box's faces and the pieces inside are dropped.
     Flat meshes (floors) are left alone. A plain frame marks the jambs. Cut geometry is cached per mesh. */
  const cutCache = new Map();
  function splitTri(tri, n, c, stride) { // tri: 3 flat vertex arrays; returns the pieces on each side of plane n·p + c = 0
    const d = tri.map(v => n[0] * v[0] + n[1] * v[1] + n[2] * v[2] + c), eps = 1e-5;
    if (d.every(x => x >= -eps) || d.every(x => x <= eps)) return [tri];
    const pos = [], neg = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], da = d[i], db = d[(i + 1) % 3];
      (da >= 0 ? pos : neg).push(a);
      if ((da > eps && db < -eps) || (da < -eps && db > eps)) { const f = da / (da - db), v = new Float32Array(stride); for (let k = 0; k < stride; k++) v[k] = a[k] + (b[k] - a[k]) * f; pos.push(v); neg.push(v); }
    }
    const fan = P => { const out = []; for (let i = 1; i + 1 < P.length; i++) out.push([P[0], P[i], P[i + 1]]); return out; };
    return fan(pos).concat(fan(neg));
  }
  function cutGeometry(geom, toFrame, boxes) {
    const names = Object.keys(geom.attributes), sizes = names.map(n => geom.attributes[n].itemSize), stride = sizes.reduce((a, b) => a + b, 0);
    const src = geom.index ? geom.toNonIndexed() : geom, count = src.attributes.position.count, V = new Array(count);
    for (let i = 0; i < count; i++) { const v = new Float32Array(stride); let o = 0; names.forEach((n, k) => { const at = src.attributes[n]; for (let j = 0; j < sizes[k]; j++) v[o++] = at.array[i * at.itemSize + j]; }); V[i] = v; }
    const inv = toFrame.clone().invert(), tmp = new THREE.Vector3();
    const frameOf = v => tmp.set(v[0], v[1], v[2]).applyMatrix4(toFrame);
    const planes = []; // box faces as planes in the mesh's own space
    for (const [x0, x1, z0, z1, h] of boxes) for (const [n, c] of [[[1, 0, 0], -x0], [[1, 0, 0], -x1], [[0, 0, 1], -z0], [[0, 0, 1], -z1], [[0, 1, 0], -h]]) {
      const pl = new THREE.Plane(new THREE.Vector3(...n), c).applyMatrix4(inv); planes.push([[pl.normal.x, pl.normal.y, pl.normal.z], pl.constant]);
    }
    const inside = tri => { const c = [0, 1, 2].map(k => (tri[0][k] + tri[1][k] + tri[2][k]) / 3); const q = frameOf(c); return boxes.some(([x0, x1, z0, z1, h]) => q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1 && q.y < h && q.y > (h >= 50 ? -50 : -0.5)); };
    const touches = tri => { const b = new THREE.Box3(); tri.forEach(v => b.expandByPoint(frameOf(v))); return boxes.some(([x0, x1, z0, z1, h]) => b.max.x > x0 && b.min.x < x1 && b.max.z > z0 && b.min.z < z1 && b.min.y < h); };
    const out = [];
    for (let i = 0; i < count; i += 3) {
      let tris = [[V[i], V[i + 1], V[i + 2]]];
      if (!touches(tris[0])) { out.push(tris[0]); continue; }
      for (const [n, c] of planes) tris = tris.flatMap(t => splitTri(t, n, c, stride));
      for (const t of tris) if (!inside(t)) out.push(t);
    }
    const g2 = new THREE.BufferGeometry(); let o = 0;
    names.forEach((n, k) => { const arr = new Float32Array(out.length * 3 * sizes[k]); let w = 0; for (const t of out) for (const v of t) for (let j = 0; j < sizes[k]; j++) arr[w++] = v[o + j]; g2.setAttribute(n, new THREE.BufferAttribute(arr, sizes[k])); o += sizes[k]; });
    return g2;
  }
  const jambMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6, metalness: 0.3 });
  // params.crop = [x0, x1, z0, z1]: only that part of the building stays (real scale, a corner of the asset);
  // the open sides get plain walls, inset so they sit on the kept floor. Expressed as crop boxes for cutModel.
  const BIG = 400;
  function cropModel(g, p) {
    const P = g.getObjectByName('UF_Model'); if (!P || !p.crop) return;
    const [x0, x1, z0, z1] = p.crop, b = A.bounds(P.children[0], P), H = b.max.y, cut = [];
    if (x0 > b.min.x + 0.01) cut.push([-BIG, x0, -BIG, BIG, BIG]); if (x1 < b.max.x - 0.01) cut.push([x1, BIG, -BIG, BIG, BIG]);
    if (z0 > b.min.z + 0.01) cut.push([-BIG, BIG, -BIG, z0, BIG]); if (z1 < b.max.z - 0.01) cut.push([-BIG, BIG, z1, BIG, BIG]);
    if (!cut.length) return;
    cutModel(g, Object.assign({}, p, { cut: cut.concat(p.cut || []) }), true);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.85, metalness: 0.05 });
    const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.name = 'UF_CropWall'; m.position.set(x, H / 2, z); m.castShadow = m.receiveShadow = true; P.add(m); };
    if (x0 > b.min.x + 0.01) add(0.2, z1 - z0, x0 + 0.1, (z0 + z1) / 2); if (x1 < b.max.x - 0.01) add(0.2, z1 - z0, x1 - 0.1, (z0 + z1) / 2);
    if (z0 > b.min.z + 0.01) add(x1 - x0, 0.2, (x0 + x1) / 2, z0 + 0.1); if (z1 < b.max.z - 0.01) add(x1 - x0, 0.2, (x0 + x1) / 2, z1 - 0.1);
    // doorways through the new walls: cut them too
    if (p.cut && p.cut.length) P.children.filter(m => m.name === 'UF_CropWall').forEach(m => { P.updateMatrixWorld(true); const rel = P.matrixWorld.clone().invert().multiply(m.matrixWorld), bb = A.bounds(m, P); const hit = p.cut.filter(([a0, a1, c0, c1, h]) => bb.max.x > a0 && bb.min.x < a1 && bb.max.z > c0 && bb.min.z < c1 && bb.min.y < h); if (hit.length) m.geometry = cutGeometry(m.geometry, rel, hit); });
  }
  function cutModel(g, p, noDoorsInCrop) {
    const P = g.getObjectByName('UF_Model'); if (!P || !p.cut || !p.cut.length) return;
    P.updateMatrixWorld(true); const invP = P.matrixWorld.clone().invert(), key = JSON.stringify(p.cut);
    P.traverse(m => {
      if (!m.isMesh || m.name === 'UF_Jamb') return;
      const rel = invP.clone().multiply(m.matrixWorld), b = A.bounds(m, P), flat = b.max.y - b.min.y < 0.05;
      const hit = p.cut.filter(([x0, x1, z0, z1, h]) => (!flat || h >= 50) && b.max.x > x0 && b.min.x < x1 && b.max.z > z0 && b.min.z < z1 && b.min.y < h); // floors only go with a crop
      if (!hit.length) return;
      const ck = m.geometry.uuid + key; if (!cutCache.has(ck)) cutCache.set(ck, cutGeometry(m.geometry, rel, hit));
      m.geometry = cutCache.get(ck);
    });
    for (const [x0, x1, z0, z1, h] of p.cut) if (h < 50) { // jambs: posts and a lintel on the wall's line
      const alongZ = x1 - x0 < z1 - z0, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, T = 0.12, D = 0.3;
      const add = (w, hh, d, x, y, z) => { const j = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), jambMat); j.name = 'UF_Jamb'; j.position.set(x, y, z); P.add(j); };
      if (alongZ) { add(D, h, T, xm, h / 2, z0 + T / 2); add(D, h, T, xm, h / 2, z1 - T / 2); add(D, T, z1 - z0, xm, h - T / 2, zm); }
      else { add(T, h, D, x0 + T / 2, h / 2, zm); add(T, h, D, x1 - T / 2, h / 2, zm); add(x1 - x0, T, D, xm, h - T / 2, zm); }
    }
  }

  /* ---------- packing: params.pack = { n, dx, dz, item } on a belt with params.flow ----------
     Items leaving the belt end are stacked on a pallet beside it (dx, dz in the object's frame), n per pallet;
     a badge counts 적재 n / N and finished pallets. The pallet's stack is 2 × 2 per layer. */
  const idOf = key => (FU.CATALOG[key] ? FU.CATALOG[key].parts[0][0] : key); // catalog key -> asset id of its (first) part
  const packT = p => flowLen(p) / ((p.flow.speed || 0.3) * flowCount(p)); // seconds between items leaving the belt
  const packCount = (p, t) => Math.max(0, Math.floor(t / packT(p)));
  const HIDE = -30; // parked below the floor (console 2 plays positions, not visibility)
  function stackSlots(key, n) { // positions of n items on a pallet, 2 × 2 per layer
    const c = FU.CATALOG[key], [w, h, d] = c ? c.size : [0.4, 0.2, 0.5], out = [];
    for (let k = 0; k < n; k++) out.push([((k % 2) - 0.5) * (w + 0.04), 0.13 + Math.floor(k / 4) * h, ((Math.floor(k / 2) % 2) - 0.5) * (d + 0.04)]);
    return out;
  }
  function buildPack(g, p) {
    const q = p.pack, key = q.item || p.flow.item || 'product', n = Math.max(1, q.n || 8);
    const st = new THREE.Group(); st.name = 'UF_Pack'; st.position.set(q.dx || 0, 0, q.dz || 0); g.add(st);
    const pal = A.get('uw_pallet'); if (pal) st.add(A.placed(pal, 'UF_Pack_Pallet')); else A.load('uw_pallet').catch(() => {});
    stackSlots(key, n).forEach(([x, y, z], k) => { const h = new THREE.Group(); h.name = 'UF_Pack_' + (k + 1); h.position.set(x, HIDE, z); h.userData.y = y; st.add(h); const m = A.get(idOf(key)); if (m) h.add(A.placed(m, 'UF_Pack_Item')); else A.load(idOf(key)).catch(() => {}); });
    if (FE.inView && FE.inView()) { const b = badge('UF_Pack_Count'); b.position.set(0, 1.9, 0); st.add(b); }
    animatePack(g, p, 0);
  }
  const packY = (p, k, t) => (packCount(p, t) % Math.max(1, p.pack.n || 8)) > k ? null : HIDE; // null: its slot height
  function animatePack(g, p, t) {
    const st = g.getObjectByName('UF_Pack'); if (!st) return;
    const n = Math.max(1, p.pack.n || 8), c = packCount(p, t);
    st.children.forEach(h => { const m = /^UF_Pack_(\d+)$/.exec(h.name); if (m) { const y = packY(p, +m[1] - 1, t); h.position.y = y === null ? h.userData.y : HIDE; } });
    const b = st.getObjectByName('UF_Pack_Count'); if (b) setBadge(b, `적재 ${c % n} / ${n} · 팔레트 ${Math.floor(c / n)}`);
  }
  const packDrives = (g, p, frames, spf) => { const st = g.getObjectByName('UF_Pack'); if (!st) return []; return st.children.filter(h => /^UF_Pack_\d+$/.test(h.name)).map(h => {
    const k = +h.name.split('_')[2] - 1, y = t => { const v = packY(p, k, t); return v === null ? h.userData.y : HIDE; }, y0 = y(0), series = new Array(frames);
    h.position.y = y0; for (let f = 0; f < frames; f++) series[f] = Math.round((y(f * spf) - y0) * 1000);
    return { node: h, dir: 'LinearY', rev: false, series };
  }); };
  // a small text badge (sprite), console 1 only
  function badge(name) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 64; const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); b.name = name; b.scale.set(2.5, 0.5, 1); b.renderOrder = 6; b.raycast = () => {}; return b;
  }
  function setBadge(b, text) {
    if (b.userData.text === text) return; b.userData.text = text;
    const c = b.material.map.image, x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(11,13,16,.82)'; x.beginPath(); x.roundRect ? x.roundRect(4, 6, c.width - 8, 52, 12) : x.rect(4, 6, c.width - 8, 52); x.fill();
    x.fillStyle = '#ffd166'; x.font = 'bold 30px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, 33);
    b.material.map.needsUpdate = true;
  }

  // the factory export (console 2) draws single models through the group path too, so they get the LOD shapes
  const hasLod = key => FU.CATALOG[key] && FU.CATALOG[key].parts.some(([id]) => A.MODELS[id + LOD]);
  T.build = (g, p) => {
    if (p.items && p.items.length) return buildGroup(g, p);
    const inView = !FE.inView || FE.inView();
    if (!inView && hasLod(p.model) && template(p.model)) buildGroup(g, Object.assign({}, p, { items: [[p.model, 0, 0, 0, 0]] }));
    else { build(g, p); if (hasLod(p.model)) template(p.model); } // in view: start loading the LOD so the export can use it
    if (g.userData.ufLoaded) {
      if (p.crop) cropModel(g, p); else if (p.cut) cutModel(g, p);
      if (/building/.test(p.model) && !p.ceiling) g.traverse(o => { if (o.isMesh && /^(CL_|Bldg_Cable)/.test(o.name)) o.visible = false; }); // the ceiling layer (pipes, trusses, lights, drooping cables: ~1M triangles) hides the floor from above; params.ceiling shows it
    }
    if (p.flow && FU.CATALOG[p.model]) { buildFlow(g, p); if (p.pack) buildPack(g, p); }
    T.animate(g, p, 0);
  };
  T.animate = (g, p, t) => {
    if (p.items) return animateGroup(g, p, t);
    for (const j of armJoints(g)) j.rotation[j.userData.axis] = armPose(p, t, j.name);
    if (p.flow) { animateFlow(g, p, t); if (p.pack) animatePack(g, p, t); }
    FU.clipTime(g, t);
  };
  T.drives = (g, p, frames, spf, plan) => (p.items ? armDrives(g, p, frames, spf) : armDrives(g, p, frames, spf).concat(p.flow ? flowDrives(g, p, frames, spf) : [], p.flow && p.pack ? packDrives(g, p, frames, spf) : [], FU.clipDrives(g, frames, spf, plan && plan.warp)));
  T.footprint = p => (p.items && p.items.length ? extent(p) : footprint(p));
  const cycle = T.cycle; T.cycle = p => (p.items ? 0 : p.flow ? Math.max(cycle(p), flowLen(p) / (p.flow.speed || 0.3), p.pack ? packT(p) * Math.max(1, p.pack.n || 8) : 0) : cycle(p));

  /* ---------- movers and zones with Asset Store models ----------
     An AMR with params.model 'uw_forklift' or 'uw_palletrobot' and every worker use the warehouse models (front
     turned to local +X, the travel direction). AMR_Load (a pallet with its load) shows while it carries; the
     forklift's inner mast and the load rise while it loads (params.liftLow) and up to params.lift when it unloads
     at a zone whose name contains params.liftAt. A worker can push a prop (params.prop, e.g. 'uw_trolley').
     A tracked zone shows its stock as pallets (params.load: a carton key, or 'tray' for 8 product trays). */
  const TY = FE.TYPES, LOAD = { uw_forklift: [1.16, 0.14], uw_palletrobot: [0, 0.14], e3_amr_deck_bot: [0, 0.62], e3_omron_agv: [0, 1.15] }; // load x, y in the AMR frame
  const OWN = { e3_amr_deck_bot: true, e3_omron_agv: true }; // EGR line v3 AMRs: modelled front +X, carry their load without a pallet
  const front = (m, name) => { const turn = new THREE.Group(); turn.add(m); m.rotation.y = Math.PI / 2; return A.placed(turn, name); };
  // a pallet load of small boxes (≤ 620 × 420 mm, e.g. 600 × 400 packing cartons or KLT totes): pinwheel of 4 per layer on a T11 pallet, `layers` high
  function palletStack(parent, kind, layers = 3, y0 = 0.13) {
    const id = idOf(kind), m = A.get(id); if (!m) { A.load(id).catch(() => {}); return null; } // null: still loading (the builder rebuilds)
    const b = new THREE.Box3().setFromObject(m), L = b.max.x - b.min.x, W = b.max.z - b.min.z, H = b.max.y - b.min.y; if (Math.max(L, W) > 0.62) return false;
    const P = [[-0.2, -0.3, 0], [0.3, -0.2, 1], [0.2, 0.3, 0], [-0.3, 0.2, 1]]; // centres of a 1.0 × 1.0 pinwheel (box long side along X, or turned)
    for (let l = 0; l < layers; l++) P.forEach(([x, z, turn], k) => { const h = A.placed(A.get(id), 'Load_Box_' + (l * 4 + k + 1)); h.position.set(l % 2 ? -x : x, y0 + l * H, l % 2 ? -z : z); h.rotation.y = turn ? Math.PI / 2 : 0; parent.add(h); });
    return true;
  }
  const unitOf = p => p.unit || (p.thresholdKg > 0 && p.unitKg > 0 ? 'part' : p.standH > 0 ? 'tote' : 'pallet'); // zone handling unit
  const vehicleUnit = model => (/forklift|reachlift|palletrobot/.test(model || '') ? 'pallet' : 'tote');
  function loadOn(parent, kind, y0 = 0.13) { // a pallet's load
    if (kind === 'tray') { stackSlots('product', 8).forEach(([x, y, z], k) => { const m = A.get(idOf('product')); if (!m) { A.load(idOf('product')).catch(() => {}); return; } const h = A.placed(m, 'Load_Tray_' + (k + 1)); h.position.set(x, y0 - 0.13 + y, z); parent.add(h); }); return; }
    const id = idOf(kind || 'uw_cardboard_a1'), m = A.get(id); if (m) { const b = A.placed(m, 'Load_Carton'); b.position.y = y0; parent.add(b); } else A.load(id).catch(() => {});
  }
  const amrBuild = TY.amr.build;
  TY.amr.build = (g, p) => {
    const m = LOAD[p.model] && A.get(p.model);
    if (!m) { if (LOAD[p.model]) A.load(p.model).catch(() => {}); return amrBuild(g, Object.assign({}, p, { model: LOAD[p.model] ? 'simple' : p.model })); }
    g.add(OWN[p.model] ? A.placed(m, 'AMR_Model') : front(m, 'AMR_Model'));
    const load = new THREE.Group(); load.name = 'AMR_Load'; const [lx, ly] = LOAD[p.model]; load.position.set(lx, ly, 0); load.userData.y = ly; g.add(load);
    if (OWN[p.model]) { if (p.load && p.model === 'e3_amr_deck_bot') loadOn(load, p.load, 0); }
    else { const pal = A.get('uw_pallet'); if (pal) load.add(A.placed(pal, 'AMR_Pallet')); else A.load('uw_pallet').catch(() => {}); if (palletStack(load, p.load, p.layers || 3) === false) loadOn(load, p.load); }
    if (p.model === 'e3_amr_deck_bot') { // tote on the deck that batch zones fill part by part (fillAt, ensureFill); hidden unless this AMR serves one
      const fill = new THREE.Group(); fill.name = 'AMR_Fill'; fill.position.set(lx, ly, 0); fill.userData.y = ly; fill.userData.x = lx; fill.visible = false; g.add(fill);
      for (let k = 0; k < FILL_MAX; k++) { const s = new THREE.Group(); s.name = 'Fill_Part_' + (k + 1); s.visible = false; fill.add(s); }
    }
    const mast = g.getObjectByName('Rig_mast_2'); if (mast) mast.userData.y = mast.position.y;
  };
  // batch zones (weighing / stacking: the zone's AMR leaves at a weight): the AMR waits at the zone while the parts go into the tote on
  // its deck one by one, then leaves with the full tote. Parts in the tote at t; null when this AMR serves no batch zone.
  const FILL_MAX = 12;
  const batchZone = (p, pl) => pl && pl.zoneAt && (p.stops || []).map(s => s.act === 'load' && pl.zoneAt(s.at)).find(z => z && z.n > 1);
  // the tote and the zone's parts in it, laid out from the part's size (rows across the tote, layers upwards); false while models load
  function ensureFill(fill, item) {
    if (fill.userData.ok) return true;
    const tm = A.get('e3_tote_600x400'), probe = A.get(idOf(item)); if (!tm || !probe) { A.load('e3_tote_600x400').catch(() => {}); A.load(idOf(item)).catch(() => {}); return false; }
    fill.add(A.placed(tm, 'Fill_Tote'));
    // grid in the 560 × 380 mm inside of the tote: long side along X, rows along Z, then layers (8 coolers = 2 × 2 × 2)
    const b = new THREE.Box3().setFromObject(probe), bx = b.max.x - b.min.x, bz = b.max.z - b.min.z, turn = bz > bx, L = Math.max(bx, bz), W = Math.min(bx, bz), h = b.max.y - b.min.y;
    const nx = Math.max(1, Math.floor(0.56 / (L + 0.005))), nz = Math.max(1, Math.floor(0.38 / (W + 0.005))), per = nx * nz;
    fill.children.forEach(c => { const m = /^Fill_Part_(\d+)$/.exec(c.name); if (!m) return; const k = +m[1] - 1, r = k % per;
      c.position.set((r % nx - (nx - 1) / 2) * (0.56 / nx), 0.025 + Math.floor(k / per) * (h + 0.004), (Math.floor(r / nx) - (nz - 1) / 2) * (0.38 / nz)); c.userData.y = c.position.y;
      const md = A.placed(A.get(idOf(item)), 'Fill_Part_Model'); if (turn) md.rotation.y = Math.PI / 2; c.add(md); });
    return (fill.userData.ok = true);
  }
  function fillAt(p, pl, t) {
    if (!pl || !pl.ok || pl.still || !pl.state || !pl.zoneAt) return null;
    const bz = batchZone(p, pl); if (!bz) return null;
    const s = pl.state(t) || '', m = /^대기: (.+) 무게 미달$/.exec(s) || /^(대기|적재) 중 \((.+)\)$/.exec(s), z = m && pl.zoneAt(m[2] || m[1]);
    if (z && z.n > 1) return Math.min(FILL_MAX, /^적재/.test(s) ? z.n : Math.max(0, Math.floor(z.stock(t))));
    return pl.carry && pl.carry(t) ? Math.min(FILL_MAX, bz.n) : 0;
  }
  // where the mover is in its current dwell: the plan's state label and the 0..1 fraction of the dwell
  const STEP = 0.16;
  function dwellPhase(pl, t) {
    const label = pl.state(t); let t0 = t, t1 = t, n = 0;
    while (n++ < 600 && pl.state(t0 - STEP) === label) t0 -= STEP;
    while (n++ < 1200 && pl.state(t1 + STEP) === label) t1 += STEP;
    return { label, f: t1 > t0 ? (t - t0) / (t1 - t0) : 1 };
  }
  function liftAt(p, pl, t) {
    if (!pl || !pl.ok || pl.still || !pl.state) return 0;
    const lo = p.liftLow != null ? p.liftLow : (p.model === 'uw_forklift' ? 0.25 : 0.1), { label, f } = dwellPhase(pl, t);
    if (/^적재 중/.test(label)) return lo * ease(f / 0.5);
    if (/^하역 중/.test(label)) { const hi = p.lift && p.liftAt && label.includes(p.liftAt) ? p.lift : lo; return f < 0.35 ? lo + (hi - lo) * ease(f / 0.35) : f < 0.65 ? hi : hi * (1 - ease((f - 0.65) / 0.35)); }
    return pl.carry && pl.carry(t) ? lo : 0;
  }
  // load / unload as a visible hand-off: during the dwell at a zone the load travels between the zone (where the stock stands)
  // and the deck / forks, with a small lift — instead of vanishing there and appearing on the AMR. Positions in the AMR frame,
  // from the plan's pose and the zone centre (plan.zoneAt, set by js/factory-builder.js).
  function transfer(p, pl, t) {
    if (!pl || !pl.ok || pl.still || !pl.state || !pl.zoneAt) return null;
    const m = /^(적재|하역) 중 \((.+)\)$/.exec(pl.state(t) || ''); if (!m) return null;
    const z = pl.zoneAt(m[2]); if (!z) return null;
    const q = pl.pose(t), dx = z.x - q.x, dz = z.z - q.z, c = Math.cos(q.yaw), s = Math.sin(q.yaw);
    const lx = c * dx - s * dz, lz = s * dx + c * dz;   // zone centre in the AMR frame (yaw about +Y)
    const [ox, oy] = LOAD[p.model] || [0, 0.14], { f } = dwellPhase(pl, t), u = ease((f - 0.12) / 0.7);
    const k = m[1] === '적재' ? u : 1 - u, h = z.h || 0; // 0 = at the zone (on the floor, or on its stand at h: a roller transfer, no lift), 1 = on the AMR
    return { x: lx + (ox - lx) * k, z: lz * (1 - k), dy: (oy - h) * (k - 1) + (h > 0 ? 0.02 : 0.25) * Math.sin(Math.PI * k), show: true };
  }
  TY.amr.animate = (g, p, t, pl) => {
    const L = liftAt(p, pl, t), mast = g.getObjectByName('Rig_mast_2'), load = g.getObjectByName('AMR_Load');
    if (mast && mast.userData.y != null) mast.position.y = mast.userData.y + L;
    if (load && load.userData.y != null) {
      const tr = transfer(p, pl, t);
      if (load.userData.x == null) load.userData.x = load.position.x;
      if (tr) { load.position.set(tr.x, load.userData.y + L + tr.dy, tr.z); load.visible = true; }
      else { load.position.set(load.userData.x, load.userData.y + L, 0); }
    }
    const fill = g.getObjectByName('AMR_Fill'), n = fill && fillAt(p, pl, t);
    if (fill && n != null) { const bz = batchZone(p, pl); if (bz) ensureFill(fill, bz.item || 'e3_egr_cooler'); }
    if (fill) { fill.visible = n != null; if (n != null) { if (load) load.visible = false; fill.children.forEach(c => { if (/^Fill_Part_/.test(c.name)) c.visible = +c.name.slice(10) <= n; });
      const tr = transfer(p, pl, t); if (tr) fill.position.set(tr.x, fill.userData.y + L + tr.dy, tr.z); else fill.position.set(fill.userData.x, fill.userData.y + L, 0); } }
  };
  TY.amr.drives = (g, p, frames, spf, pl) => {
    if (!pl || !pl.ok || pl.still) return [];
    const out = [], mast = g.getObjectByName('Rig_mast_2'), load = g.getObjectByName('AMR_Load');
    const rec = (node, y) => { const y0 = y(0), s = new Array(frames); node.position.y = y0; for (let f = 0; f < frames; f++) s[f] = Math.round((y(f * spf) - y0) * 1000); out.push({ node, dir: 'LinearY', rev: false, series: s }); };
    if (mast && mast.userData.y != null) rec(mast, t => mast.userData.y + liftAt(p, pl, t));
    // a batch AMR's tote (AMR_Fill) replaces its carried load: the tote stays on the deck, its parts appear one by one, and it is the tote
    // that is handed over at the unload stop
    const fill = g.getObjectByName('AMR_Fill'), fillOn = !!(fill && fillAt(p, pl, 0) != null && ensureFill(fill, batchZone(p, pl).item || 'e3_egr_cooler'));
    if (fillOn && load) rec(load, () => HIDE);
    const mv = fillOn ? fill : load;
    if (mv && mv.userData.y != null) {
      // the load exists while carried and while it is handed over; X / Z of the hand-off on wrappers (one drive per node)
      if (fillOn) mv.visible = true;
      rec(mv, t => { const tr = transfer(p, pl, t); return tr ? mv.userData.y + liftAt(p, pl, t) + tr.dy : !fillOn && pl.carry && !pl.carry(t) ? HIDE : mv.userData.y + liftAt(p, pl, t); });
      const x0 = mv.position.x, tx = new THREE.Group(), tz = new THREE.Group(); tx.name = g.name + (fillOn ? '_Fill_TX' : '_Load_TX'); tz.name = g.name + (fillOn ? '_Fill_TZ' : '_Load_TZ');
      mv.parent.add(tx); tx.add(tz); tz.add(mv); mv.position.x = 0; tx.position.x = x0;
      const sx = new Array(frames), sz = new Array(frames);
      for (let f = 0; f < frames; f++) { const tr = transfer(p, pl, f * spf); sx[f] = tr ? Math.round((tr.x - x0) * 1000) : 0; sz[f] = tr ? Math.round(tr.z * 1000) : 0; }
      if (sx.some(v => v)) out.push({ node: tx, dir: 'LinearX', rev: true, series: sx }); if (sz.some(v => v)) out.push({ node: tz, dir: 'LinearZ', rev: false, series: sz });
    }
    if (fillOn) fill.children.forEach(c => { if (!/^Fill_Part_/.test(c.name)) return; const k = +c.name.slice(10); c.visible = true; rec(c, t => fillAt(p, pl, t) >= k ? c.userData.y : HIDE); });
    return out;
  };
  const workerBuild = TY.worker.build;
  TY.worker.build = (g, p, f) => {
    const m = A.get('uw_worker');
    workerBuild(g, p, f); // ring and the ⚠ warning stay; the box figure goes once the model is here
    if (!m) return;
    g.children.filter(o => /^Worker_(Leg|Body|Head|Helmet)$/.test(o.name)).forEach(o => g.remove(o));
    g.add(front(m, 'Worker_Model'));
    if (p.prop) { const pm = A.get(p.prop); if (pm) { const pr = front(pm, 'Worker_Prop'); pr.position.x = 0.9; g.add(pr); } else A.load(p.prop).catch(() => {}); }
  };
  const zoneBuild = TY.zone.build;
  let STAND_MAT = null;
  TY.zone.build = (g, p, f) => {
    zoneBuild(g, p, f);
    if (p.track && p.unit === 'pallet' && p.perBox > 0) { // a pallet being built: the pallet stands there, a carton per perBox parts (Zone_Pallet_k = carton k)
      const pal = A.get('uw_pallet'), bm = A.get(idOf(p.load || 'e3_pack_box')); if (!pal || !bm) { A.load('uw_pallet').catch(() => {}); A.load(idOf(p.load || 'e3_pack_box')).catch(() => {}); return; }
      g.add(A.placed(pal, 'Zone_Base_Pallet')); const tmp = new THREE.Group(); palletStack(tmp, p.load || 'e3_pack_box', p.layers || 3);
      tmp.children.slice().forEach((c, k) => { const h = new THREE.Group(); h.name = 'Zone_Pallet_' + k; h.visible = false; h.add(c); g.add(h); }); return;
    }
    if (!p.track || (p.thresholdKg > 0 && p.unitKg > 0)) return; // a weighing zone's parts go into the tote on its AMR (fillAt)
    if (unitOf(p) === 'tote' && !(p.standH > 0)) p = Object.assign({}, p, { standH: 0.62 });
    if (p.standH > 0 && unitOf(p) !== 'pallet') { // a roller stand at deck height: the stock stands on it side by side (no pallets); the AMR rolls totes on / off
      const n = Math.min(4, Math.max(1, p.cap || 1)), id = idOf(p.load || 'e3_tote_600x400'), m = A.get(id); if (!m) { A.load(id).catch(() => {}); return; }
      if (p.stand !== false) { // roller stand (the line model brings its own where stand is false)
        const mt = STAND_MAT || (STAND_MAT = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x66727f).convertSRGBToLinear(), metalness: 0.7, roughness: 0.4 }));
        const W = n * 0.66, top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.46), mt); top.name = 'Zone_Stand'; top.position.y = p.standH - 0.02; g.add(top);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, p.standH - 0.04, 0.04), mt); l.name = 'Zone_Stand_Leg'; l.position.set(sx * (W / 2 - 0.03), (p.standH - 0.04) / 2, sz * 0.2); g.add(l); }
      }
      for (let k = 0; k < n; k++) { const h = new THREE.Group(); h.name = 'Zone_Pallet_' + k; h.visible = false; h.position.set((k - (n - 1) / 2) * 0.66, 0, 0); h.add(Object.assign(A.placed(A.get(id), 'Zone_Load'), {})); h.children[0].position.y += p.standH; g.add(h); }
      return;
    }
    const n = Math.min(6, Math.max(1, p.cap || 4)), cols = Math.max(1, Math.floor(p.w / 1.25)), rows = Math.ceil(n / cols), pal = A.get('uw_pallet');
    if (!pal) { A.load('uw_pallet').catch(() => {}); return; }
    for (let k = 0; k < n; k++) {
      const h = new THREE.Group(); h.name = 'Zone_Pallet_' + k; h.visible = false;
      h.position.set(((k % cols) - (cols - 1) / 2) * 1.25, p.standH || 0, ((Math.floor(k / cols)) - (rows - 1) / 2) * 1.25); // standH: a rack bay's deck
      h.add(A.placed(A.get('uw_pallet'), 'Zone_Pallet')); if (palletStack(h, p.load, p.layers || 3) === false) loadOn(h, p.load); g.add(h);
    }
  };
  TY.zone.drives = (g, p, frames, spf, z) => {
    if (!z || !z.stock) return [];
    return g.children.filter(h => /^Zone_Pallet_\d+$/.test(h.name)).map(h => {
      const k = +h.name.split('_')[2], per = p.unit === 'pallet' && p.perBox > 0 ? p.perBox : 1, y = t => (Math.ceil(z.stock(t) / per) > k ? 0 : HIDE), y0 = y(0), s = new Array(frames);
      h.visible = true; h.position.y = y0; for (let f = 0; f < frames; f++) s[f] = Math.round((y(f * spf) - y0) * 1000);
      return { node: h, dir: 'LinearY', rev: false, series: s };
    });
  };
  const doorBuild = TY.door.build;
  TY.door.build = (g, p, f) => { doorBuild(g, p, f); if (p.open) { const leaf = g.getObjectByName('Door_Leaf'); if (leaf) g.remove(leaf); } };
})();
