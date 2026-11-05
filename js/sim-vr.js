// ONE SIMULATION VR view (Meta Quest 3, WebXR): stand in the line at 1:1.
// Left stick walks (1.4 m/s, relative to where you look, on the floor). Right stick left / right turns the view
// smoothly (45°/s, around the head; no up / down tilt of the world, that makes people sick). The eye height is fixed
// for a 175 cm person (1.63 m) whatever the wearer's real height or posture (sitting or standing). The head looks as usual. No teleport, no menu in VR. Machines, walls and columns (real surfaces, by short rays)
// stop you (you slide along them); nothing to walk through. You start at the line's infeed end looking down the line.
// Plus the desktop pairing chip ("VR 연결", js/sim-link.js) and the "VR 보기" chip on a headset.
(() => {
  'use strict';
  const $ = id => document.getElementById(id), T = window.THREE, S = window.ONE_SIMB;
  if (!S) return;
  // the run can start again (time bar going back): its objects are read from the current ONE_SIMB each time; the stage,
  // the VR rig and this file's frame hook stay the same
  const stage = S.stage, rig = stage.xrRig, renderer = stage.renderer, cur = () => window.ONE_SIMB || S;
  if (window.ONE_VR) return;   // already set up on this page
  const WALK = 1.4, TURN = Math.PI / 4, DEAD = 0.2, BODY = 0.25, EYE0 = 1.63, UP = new T.Vector3(0, 1, 0);

  /* ---------------------------------------------------------------- chips */
  const views = $('views');
  const chip = (txt, fn) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = txt; b.onclick = () => fn(b); views.appendChild(b); return b; };
  const note = document.createElement('div'); note.className = 'chip'; note.style.cursor = 'default'; note.hidden = true; views.appendChild(note);
  const say = (t, on) => { note.hidden = !t; note.textContent = t || ''; note.classList.toggle('on', !!on); };
  if (window.ONE_VR_STATUS) say(window.ONE_VR_STATUS.text, window.ONE_VR_STATUS.state === 'open');
  window.ONE_VR_SAY = say;

  const isHeadset = /OculusBrowser|Quest/i.test(navigator.userAgent);
  const following = new URLSearchParams(location.search).has('vr') || location.pathname.replace(/\/$/, '') === '/vr';
  if (!isHeadset && window.OneLink && !following) {
    let link = null;
    chip('VR 연결', b => {
      if (link) { link.close(); link = null; b.classList.remove('on'); say(''); return; }
      b.classList.add('on'); link = window.OneLink.host((state, text) => { say(text, state === 'open'); if (state === 'error' || state === 'closed') { b.classList.remove('on'); link = null; } });
    }).title = 'Quest 3에서 이 화면을 VR로 봅니다 (같은 Wi-Fi)';
  }

  if (isHeadset && !following) chip('PC 연결', () => { location.href = '/vr'; });

  let session = null;
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (!ok) return;
    let starting = false;
    chip('VR 보기', async b => {
      if (starting) return;                       // a second tap while the headset is still opening the session
      if (session) { session.end(); return; }
      starting = true; say('VR 여는 중…');
      try { session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
        session.addEventListener('end', () => { session = null; b.classList.remove('on'); say(''); });
        try { await renderer.xr.setSession(session); }
        catch (e) { const s = session; session = null; try { await s.end(); } catch (x) {} throw e; }   // never leave a half-open session behind
        b.classList.add('on'); say(''); start(); }
      catch (e) { say(/already an active/i.test(e.message) ? 'VR이 이미 다른 탭에서 열려 있습니다. 다른 탭을 닫고 이 페이지를 새로 고친 뒤 다시 누르세요' : `VR 시작 실패: ${e.message}`); }
      finally { starting = false; }
    }).title = '1:1 현장 보기 · 왼 스틱 걷기 · 오른 스틱 시점';
  }).catch(() => {});

  /* ---------------------------------------------------------------- obstacles (floor plan boxes) */
  // every placed object that stands on the floor at body height (machines, conveyors, walls, columns, pallets…),
  // not the slab, not roofs or anything overhead. Re-measured every 4 s while in VR (models load late).
  let boxes = [], measured = -1e9;
  const measure = () => { boxes = []; const b = new T.Box3();
    // placed objects + anything else the run says is solid (ONE_SIMB.solids: e.g. the cell groups of programmed cells)
    const solids = [...[...cur().objs.values()].map(v => v.o), ...(cur().solids || [])];
    for (const o of solids) { b.setFromObject(o); if (b.isEmpty()) continue;
      if (b.max.y < 0.15 || b.min.y > 1.9) continue;
      boxes.push({ o, x0: b.min.x - BODY, x1: b.max.x + BODY, z0: b.min.z - BODY, z1: b.max.z + BODY }); } };
  const blocked = (x, z) => boxes.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);

  /* ---------------------------------------------------------------- walking into things */
  // A step is free unless a real surface of a placed object (machine, guard, wall, column…) lies within the step plus
  // 25 cm of body, at knee (0.35 m) or chest (1.1 m) height. Rays, not bounding boxes: a cell's open aisle or a big
  // group's empty middle is walkable, a guard panel is not. Back faces do not count, so someone who stepped into a
  // machine in the room can walk out.
  const ray = new T.Raycaster(), rayO = new T.Vector3(), rayD = new T.Vector3();
  ray.params.Line = { threshold: 0 }; ray.params.Points = { threshold: 0 };
  // only objects whose footprint (re-measured every 4 s) is within reach of this step are tested
  const targets = (h, reach) => boxes.filter(q => h.x > q.x0 - reach && h.x < q.x1 + reach && h.z > q.z0 - reach && h.z < q.z1 + reach).map(q => q.o);
  function free(h, dx, dz) { const len = Math.hypot(dx, dz); if (len < 1e-6) return true;
    rayD.set(dx / len, 0, dz / len); ray.far = len + BODY; const list = targets(h, len + BODY); if (!list.length) return true;
    for (const y of [0.35, 1.1]) { rayO.set(h.x, y, h.z); ray.set(rayO, rayD);
      if (ray.intersectObjects(list, true).some(i => i.object.isMesh && i.object.visible && !((m => m && m.opacity < 0.2)(Array.isArray(i.object.material) ? i.object.material[0] : i.object.material)))) return false; }
    return true; }

  /* ---------------------------------------------------------------- fewer draw calls in the headset */
  // The headset draws every mesh once per eye (~850 meshes → ~1,700 draw calls a frame, too many for 72 fps). In VR the
  // meshes that do not move are drawn as one merged mesh per placed object + material; the originals stay in the scene
  // on a hidden layer (the walking rays still hit them). Whatever moves (robots, parts, carriers, a clamp), changes
  // material or visibility is watched every frame: it leaves its batch for good and is drawn on its own again. Meshes
  // seen moving before VR starts (watched every 0.5 s from page load) are never batched.
  const HIDE = 30, moved = new WeakSet(), seen = new WeakMap(); ray.layers.enable(HIDE);
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const roots = () => stage.world.children.filter(o => o.name !== 'vr-batch');   // everything in the factory
  let watchT = 0;
  const watch = () => { for (const r of roots()) r.traverse(o => { if (!o.isMesh) return; const s = seen.get(o);
    if (!s) seen.set(o, { m: o.matrixWorld.clone(), mat: o.material, v: shown(o), n: 0 });
    else if (!s.m.equals(o.matrixWorld) || s.mat !== o.material || s.v !== shown(o)) { s.m.copy(o.matrixWorld); s.mat = o.material; s.v = shown(o);
      if (++s.n >= 2) moved.add(o); } }); };   // twice: once is the model being placed when it loads
  let batches = [], members = [], batchedFor = null, batching = true;
  // materials that look the same share a batch (the models bring ~150 materials, many of them equal): the batch draws a
  // copy, and a member whose own material changes later (a lamp colour, a highlight) leaves the batch
  const tx = t => t ? t.uuid : '', plain = m => /^Mesh(Standard|Physical|Lambert|Phong|Basic)Material$/.test(m.type) && m.onBeforeCompile === T.Material.prototype.onBeforeCompile;
  const msig = m => !plain(m) ? m.uuid : [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.metalness, m.roughness, m.opacity, m.transparent,
    m.side, m.envMapIntensity, m.vertexColors, m.flatShading, m.wireframe, m.depthWrite, m.depthTest, m.alphaTest, m.visible, m.toneMapped, m.polygonOffset, m.polygonOffsetFactor, m.blending,
    tx(m.map), tx(m.normalMap), tx(m.roughnessMap), tx(m.metalnessMap), tx(m.emissiveMap), tx(m.aoMap), tx(m.alphaMap), tx(m.envMap), tx(m.bumpMap), tx(m.lightMap)].join('|');
  const ATTR = ['position', 'normal', 'uv', 'uv2', 'color'];
  const nm = new T.Matrix3(), tv = new T.Vector3();
  function mergeInto(list) {   // list of meshes with the same material and attributes → one geometry in world space
    let nv = 0, ni = 0; for (const o of list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const geo = new T.BufferGeometry(), keys = ATTR.filter(k => list[0].geometry.attributes[k]), out = {};
    for (const k of keys) out[k] = new Float32Array(nv * list[0].geometry.attributes[k].itemSize);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let v0 = 0, i0 = 0;
    for (const o of list) { const g = o.geometry, n = g.attributes.position.count, M = o.matrixWorld, flip = M.determinant() < 0; nm.getNormalMatrix(M);
      for (const k of keys) { const a = g.attributes[k], s = a.itemSize, d = out[k];
        for (let i = 0; i < n; i++) { const j = (v0 + i) * s;
          if (k === 'position') { tv.fromBufferAttribute(a, i).applyMatrix4(M); d[j] = tv.x; d[j + 1] = tv.y; d[j + 2] = tv.z; }
          else if (k === 'normal') { tv.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); d[j] = tv.x; d[j + 1] = tv.y; d[j + 2] = tv.z; }
          else { d[j] = a.getX(i); if (s > 1) d[j + 1] = a.getY(i); if (s > 2) d[j + 2] = a.getZ(i); if (s > 3) d[j + 3] = a.getW(i); } } }
      const m = g.index ? g.index.count : n;
      for (let t = 0; t < m; t += 3) for (let c = 0; c < 3; c++) idx[i0 + t + c] = v0 + (g.index ? g.index.getX(t + (flip ? 2 - c : c)) : t + (flip ? 2 - c : c));
      v0 += n; i0 += m; }   // geometry groups are ignored, as three does for a mesh with one material
    for (const k of keys) geo.setAttribute(k, new T.BufferAttribute(out[k], list[0].geometry.attributes[k].itemSize));
    geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo; }
  function build(b) { if (b.mesh) { stage.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh = null; }
    const live = b.list.filter(x => !x.out).map(x => x.o); if (!live.length) return;
    const geo = mergeInto(live), c = geo.boundingSphere.center.clone(); geo.translate(-c.x, -c.y, -c.z);   // placed at its centre: see-through batches sort by distance
    const mesh = new T.Mesh(geo, b.mat); mesh.position.copy(c); mesh.updateMatrix(); mesh.matrixAutoUpdate = false; mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    mesh.name = 'vr-batch'; b.mesh = mesh; stage.scene.add(mesh); }
  function unbatch() { for (const x of members) if (!x.out) x.o.layers.mask = x.mask; for (const b of batches) if (b.mesh) { stage.scene.remove(b.mesh); b.mesh.geometry.dispose(); if (b.mat !== b.list[0]?.mat) b.mat.dispose(); }
    batches = []; members = []; batchedFor = null; }
  let batchN = 0, stats = null, skipped = {}; const meshCount = () => { let n = 0; for (const r of roots()) r.traverse(o => { if (o.isMesh) n++; }); return n; };
  function batch() { unbatch(); batchedFor = cur(); batchN = meshCount(); skipped = {}; stage.scene.updateMatrixWorld(true); const groups = new Map();
    roots().forEach((r, ri) => r.traverse(o => { const g = o.geometry, m = o.material;
      if (!o.isMesh) return; const why = o.isSkinnedMesh || o.isInstancedMesh ? 'kind' : moved.has(o) ? 'moved' : o.layers.mask !== 1 ? 'layer' : !shown(o) ? 'hidden' : '';
      if (why) { skipped[why] = (skipped[why] || 0) + 1; return; }
      const why2 = !m || Array.isArray(m) ? 'matArray' : !g.attributes.position || !g.attributes.normal ? 'noNormal' : g.attributes.tangent ? 'tangent'
        : (g.morphAttributes && g.morphAttributes.position) ? 'morph' : (g.drawRange && g.drawRange.count !== Infinity) ? 'range' : '';
      if (why2) { skipped[why2] = (skipped[why2] || 0) + 1; return; }
      o.getWorldPosition(tv); const chunk = `${Math.floor(tv.x / 12)},${Math.floor(tv.z / 12)}`;   // 12 m tiles: batches still cull by view
      const key = `${chunk}|${msig(m)}|${o.castShadow}|${o.receiveShadow}|${ATTR.map(k => g.attributes[k] ? g.attributes[k].itemSize : 0).join(',')}`;
      if (!groups.has(key)) groups.set(key, { mat: plain(m) ? m.clone() : m, cast: o.castShadow, recv: o.receiveShadow, list: [] }); groups.get(key).list.push(o); }));
    stats = { groups: groups.size, single: [...groups.values()].filter(g => g.list.length < 2).length, skipped };
    for (const gr of groups.values()) { if (gr.list.length < 2) continue;
      const b = { mat: gr.mat, cast: gr.cast, recv: gr.recv, list: [], mesh: null, dirty: false };
      for (let i = 0; i < gr.list.length; i += 400) { const part = { ...b, list: [] };   // at most 400 meshes a batch: a rebuild stays short
        for (const o of gr.list.slice(i, i + 400)) { const x = { o, b: part, m: o.matrixWorld.clone(), mat: o.material, sig: msig(o.material), geo: o.geometry, mask: o.layers.mask, out: false }; part.list.push(x); members.push(x); o.layers.set(HIDE); }
        build(part); batches.push(part); } } }
  const sigs = new Map();
  function check() { sigs.clear(); for (const x of members) { if (x.out) continue; const o = x.o;
      let g = sigs.get(o.material); if (g === undefined && o.material) sigs.set(o.material, g = msig(o.material));
      if (!o.parent || !x.m.equals(o.matrixWorld) || o.material !== x.mat || g !== x.sig || o.geometry !== x.geo || !shown(o)) { x.out = true; moved.add(o); o.layers.mask = x.mask; x.b.dirty = true; } }
    for (const b of batches) if (b.dirty) { b.dirty = false; build(b); } }
  renderer.xr.addEventListener('sessionend', unbatch);

  /* ---------------------------------------------------------------- start pose */
  const head = new T.Vector3(), fwd = new T.Vector3();
  const headPos = v => renderer.xr.getCamera().getWorldPosition(v);
  // Quest frame budget: small parts (bolts, sensors, cables, brackets, < 60 cm across) stop casting shadows during the session
  let quiet = [];
  const sv = new T.Vector3();
  const lightenShadows = () => { quiet = []; stage.world.traverse(o => { if (!o.isMesh || !o.castShadow) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    o.getWorldScale(sv); if (g.boundingSphere.radius * Math.max(sv.x, sv.y, sv.z) < 0.3) { o.castShadow = false; quiet.push(o); } });
    // a 1024 shadow map in the headset (the desktop keeps 2048): a quarter of the pixels to draw on each shadow update
    const k = stage.key; if (k && k.shadow.mapSize.x > 1024) { k.userData.mapSize = k.shadow.mapSize.x; k.shadow.mapSize.set(1024, 1024); if (k.shadow.map) { k.shadow.map.dispose(); k.shadow.map = null; } } };
  renderer.xr.addEventListener('sessionend', () => { for (const o of quiet) o.castShadow = true; quiet = [];
    const k = stage.key; if (k && k.userData.mapSize) { k.shadow.mapSize.set(k.userData.mapSize, k.userData.mapSize); delete k.userData.mapSize; if (k.shadow.map) { k.shadow.map.dispose(); k.shadow.map = null; } } });
  function start() {
    measure(); measured = performance.now(); lightenShadows(); batch();
    // 1.5 m before the infeed edge of the floor, halfway across, facing the flow direction (stored +X)
    const { SC, rect: r } = cur(), p = SC.toS([r.x0 - 1500, (r.y0 + r.y1) / 2, 0]);
    let x = p.x; while (blocked(x, p.z) && x > p.x - 20) x -= 0.5;
    rig.position.set(x, 0, p.z); rig.rotation.set(0, -Math.PI / 2, 0);
    eye = EYE0; head0 = null;   // the wearer's own head height is read on the first tracked frame
  }
  // eye height: rig.y = eye − head0, head0 = the wearer's head height above their real floor when entering
  let eye = EYE0, head0 = null;

  /* ---------------------------------------------------------------- sticks */
  stage.onFrame.push(dt => {
    const now = performance.now();
    if (!renderer.xr.isPresenting) { if (now - watchT > 500) { watchT = now; try { watch(); } catch (e) {} } return; }
    // batches: built for the current run (the time bar going back starts a new one), rebuilt when models arrive late
    if (!batching) { if (batches.length) unbatch(); } else if (batchedFor !== cur()) batch(); else check();
    if (now - measured > 4000) { measure(); measured = now; if (batching && meshCount() !== batchN) batch(); }
    const ses = renderer.xr.getSession(); if (!ses) return;
    // thumbstick = axes 2/3 on Quest Touch (xr-standard), 0/1 on some pads
    if (head0 == null && stage.xrCam.position.y > 0.3) head0 = stage.xrCam.position.y;
    let mx = 0, my = 0, tx = 0, ty = 0;
    for (const src of ses.inputSources) { const g = src.gamepad; if (!g) continue;
      const ax = g.axes.length >= 4 ? g.axes[2] : g.axes[0] || 0, ay = g.axes.length >= 4 ? g.axes[3] : g.axes[1] || 0;
      // only the stick pushed furthest on each side counts: Quest can list more input sources (hands, a second pad)
      // with idle sticks, and those must not reset the left stick to zero
      if (src.handedness === 'right') { if (Math.abs(ax) > Math.abs(tx)) tx = ax; if (Math.abs(ay) > Math.abs(ty)) ty = ay; }
      else if (Math.hypot(ax, ay) > Math.hypot(mx, my)) { mx = ax; my = ay; } }
    // view: right stick left / right turns smoothly around the head
    if (Math.abs(tx) > DEAD) { const a = -Math.sign(tx) * Math.min(1, (Math.abs(tx) - DEAD) / (1 - DEAD)) * TURN * dt; headPos(head);
      rig.position.sub(head).applyAxisAngle(UP, a).add(head); rig.rotation.y += a; }
    // eye height: fixed at 1.63 m (a 175 cm person), set once on the first tracked frame
    if (head0 != null) rig.position.y = eye - head0;
    // walk: along where the head looks, flattened to the floor
    const m = Math.hypot(mx, my);
    if (m > DEAD) { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
      renderer.xr.getCamera().getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) return; fwd.normalize();
      const rx = -fwd.z, rz = fwd.x;   // right of the view
      const step = WALK * dt * k, dx = (fwd.x * -my + rx * mx) * step, dz = (fwd.z * -my + rz * mx) * step;
      headPos(head);
      if (free(head, dx, dz)) { rig.position.x += dx; rig.position.z += dz; }
      else if (free(head, dx, 0)) rig.position.x += dx;     // slide along the obstacle
      else if (free(head, 0, dz)) rig.position.z += dz; }
  });

  window.ONE_VR = { get eye() { return eye; }, start, measure, blocked, free, batch, unbatch, check, get batching() { return batching; }, set batching(v) { batching = !!v; }, get batches() { return batches; }, get stats() { return stats; }, get members() { return members; }, get boxes() { return boxes; } };
})();
