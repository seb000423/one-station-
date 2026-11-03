// ONE BUILD: factory builder + machine builder on one page.
// Every edit goes through the ONE Twin edit API (window.OneTwin.core.Editor, packages/core): the UI only calls commands,
// so undo / redo, the command log and validation work the same for both documents. Stored frame: mm, deg, Z up,
// X = infeed → outfeed; the scene uses OneTwin.schema.storedToScene for every conversion.
// A machine is built here on its own (blocks + axes + signals + card) and placed in a factory as a reference
// (local:<id>@<version>); the representative production machines are references to the library (lib:<id>@1).
(() => {
  'use strict';
  const { schema: S, core: C } = window.OneTwin, L = window.OneLibrary, T = window.THREE;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const KEY = { factory: 'one.build.factory', machine: 'one.build.machine', lib: 'one.build.machines', tab: 'one.build.tab' };

  /* ------------------------------------------------------------------ stage */
  const stage = window.OneStage.create($('c'));
  const { renderer, scene, camera, controls } = stage;
  scene.environment = new T.PMREMGenerator(renderer).fromScene(new T.RoomEnvironment(), 0.04).texture;
  const root = new T.Group(); stage.world.add(root);
  const ov = stage.overlay; // selection marker, machine envelope: not mirrored
  const toS = p => new T.Vector3(...S.storedToScene([p[0], p[1], p[2] ?? 0]));
  const fromS = v => S.sceneToStored([v.x, v.y, v.z]);

  /* ------------------------------------------------------------------ documents and editors */
  const newFactory = () => S.Factory.parse({ schema: S.FACTORY_SCHEMA, meta: { id: S.uuidv7(), name: '새 공장', levels: [{ id: 'L1', name: '1F', height: 7000 }] },
    building: { slabs: [{ id: S.uuidv7(), polygon: [[0, 0], [30000, 0], [30000, 20000], [0, 20000]] }] } });
  const newMachine = () => S.Machine.parse({ schema: S.MACHINE_SCHEMA, meta: { id: S.uuidv7(), name: '새 설비', bbox: [4000, 2400, 2000], cellFixed: true, fidelity: 'L2' } });
  const load = (scope, make) => { const d = LS.get(KEY[scope], null); try { return d ? (scope === 'factory' ? S.Factory : S.Machine).parse(d) : make(); } catch { return make(); } };
  const ED = { factory: new C.Editor('factory', load('factory', newFactory)), machine: new C.Editor('machine', load('machine', newMachine)) };
  let tab = LS.get(KEY.tab, 'factory') === 'machine' ? 'machine' : 'factory';
  let mode = 'edit', sel = null, multi = new Set(), dirty = { factory: false, machine: false };
  // machine id → { name, versions: { n: machine doc } }; the partner plant stations (js/plant-machines.js) are always in it
  const lib = () => window.OnePlant ? window.OnePlant.withPlant(LS.get(KEY.lib, {})) : LS.get(KEY.lib, {});
  const ed = () => ED[tab];

  const logLines = [];
  const log = (txt, cls = '') => { logLines.push({ t: new Date(), txt, cls }); if (logLines.length > 200) logLines.shift(); if (tab === 'machine') drawLog(); };
  function exec(name, args, quiet) {
    try { const r = ed().exec(name, args); if (!quiet) log(`${name} ${short(args)}`); return r; }
    catch (e) { toast(e.message || String(e), true); return undefined; }
  }
  const short = a => { const s = JSON.stringify(a, (k, v) => (k === 'joints' || k === 'io' ? `[${v.length}]` : v)); return s.length > 90 ? s.slice(0, 88) + '…' : s; };
  for (const s of ['factory', 'machine']) ED[s].subscribe(() => { dirty[s] = true; LS.set(KEY[s], ED[s].doc); if (s === tab) refresh(); });

  let toastT = 0;
  function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 4200 : 2200); }

  /* ------------------------------------------------------------------ factory: what each placed object is */
  const SCN = window.OneScene.create({ lib: () => lib() }), { factoryItems, slabRect, placeObj, buildFactoryObj, buildLocalMachine } = SCN;
  // every object has its own name: a new one gets "<종류> N" (N = next free number); unnamed old ones are numbered on screen
  const baseName = it => { if (it.local) { const m = lib()[it.local.id]; return m ? m.name : '내 설비'; } const d = L.FACTORY[it.def]; return (d ? d.name : it.item.type || '객체').replace(/\s*\(.*\)\s*$/, ''); };
  let nameCache = { doc: null, map: null };
  const itemName = it => { if (it.item.name) return it.item.name; const doc = ED.factory.doc;
    if (nameCache.doc !== doc) { const map = new Map(), n = {}; for (const x of factoryItems(doc)) { if (x.item.name) continue; const b = baseName(x); n[b] = (n[b] || 0) + 1; map.set(x.id, `${b} ${n[b]}`); } nameCache = { doc, map }; }
    return nameCache.map.get(it.id) || baseName(it); };
  const nextName = (doc, base) => { let max = 0; const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$');
    for (const x of factoryItems(doc)) { const m = re.exec(x.item.name || itemName(x)); if (m) max = Math.max(max, +m[1]); } return `${base} ${max + 1}`; };
  const itemCode = it => it.path === 'machines' ? it.item.tagPrefix.split('.').pop() : '';

  /* ------------------------------------------------------------------ machine: block prefixes and placement */
  const nodeDef = n => L.BLOCKS[n.blockType];
  const nodeCode = n => n.params.tag || '';
  const nextCode = (doc, code) => { const used = new Set(doc.nodes.map(nodeCode)); for (let i = 1; ; i++) if (!used.has(code + i)) return code + i; };
  const nodeTop = n => { const d = nodeDef(n); return n.transform.position[2] + (d ? d.top(Object.assign({}, d.params, n.params)) * 1000 : 0); };

  /* ------------------------------------------------------------------ scene objects (rebuilt only when their data changed) */
  let objs = new Map(); // id → { obj, data }
  let slabMesh = null, envelope = null, originMark = null;
  function syncScene() {
    const doc = ed().doc, keep = new Map();
    const want = tab === 'factory' ? factoryItems(doc).map(it => ({ id: it.id, data: it.item, it })) : doc.nodes.map(n => ({ id: n.id, data: n, n }));
    for (const w of want) {
      const prev = objs.get(w.id);
      if (prev && prev.data === w.data) { keep.set(w.id, prev); objs.delete(w.id); continue; }
      if (prev) { root.remove(prev.obj); objs.delete(w.id); }
      const obj = tab === 'factory' ? buildFactoryObj(w.it, doc) : buildMachineObj(w.n);
      obj.userData.id = w.id; obj.traverse(o => { o.userData.pick = w.id; });
      root.add(obj); keep.set(w.id, { obj, data: w.data });
    }
    for (const v of objs.values()) root.remove(v.obj);
    objs = keep;
    drawFloor(); for (const x of [...multi]) if (!objs.has(x)) multi.delete(x); if (sel && !objs.has(sel)) sel = multi.size ? [...multi][0] : null; if (xray) stage.addTwin(root, o => !!(o.userData.node && nodeDef(o.userData.node)?.work));
  }
  function buildMachineObj(n) { const o = L.buildBlock(n.blockType, n.params); placeObj(o, n.transform.position, n.transform.rotation[2]); o.userData.node = n; return o; }

  const floorMat = new T.MeshBasicMaterial({ color: 0x2a2b31, transparent: true, opacity: 0.3, depthWrite: false }); // unlit: the room environment turned a lit slab pale grey
  const edgeMat = new T.LineBasicMaterial({ color: 0xe9e3d5, transparent: true, opacity: 0.55 });
  const dashMat = new T.LineDashedMaterial({ color: 0xe9e3d5, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.55 });
  let floorKey = '';
  function drawFloor() {
    const doc = ed().doc;
    const key = tab === 'factory' ? 'f' + JSON.stringify(doc.building.slabs[0]?.polygon) : 'm' + doc.meta.bbox.join(',');
    if (key === floorKey) return; floorKey = key;
    for (const o of [slabMesh, envelope, originMark]) if (o) o.parent.remove(o);
    slabMesh = envelope = originMark = null;
    if (tab === 'factory') {
      const r = slabRect(doc), w = (r.x1 - r.x0) / 1000, d = (r.y1 - r.y0) / 1000, c = toS([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0]);
      slabMesh = new T.Group();
      const m = new T.Mesh(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), floorMat); m.receiveShadow = true; m.renderOrder = -1; slabMesh.add(m);
      const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, 0.001, d)), edgeMat); slabMesh.add(e);
      slabMesh.position.set(c.x, 0.001, c.z); ov.add(slabMesh); stage.mirrorPass.mirror = false; // tall walls mirrored in the floor washed it out
      { const m = Math.max(w, d) * 0.35 + 6; controls.minZoom = 1 / ((Math.max(w, d) / 2 + m) * 0.9); stage.setBounds(new T.Box3(new T.Vector3(c.x - w / 2 - m, 0, c.z - d / 2 - m), new T.Vector3(c.x + w / 2 + m, 6, c.z + d / 2 + m))); } stage.setGrid(0.5, 5);
    } else {
      const [W, D, H] = doc.meta.bbox.map(v => v / 1000); stage.mirrorPass.mirror = true;
      envelope = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), dashMat); envelope.computeLineDistances(); ov.add(envelope); updateEnvelope();
      originMark = new T.Group(); const ax = new T.ArrowHelper(new T.Vector3(1, 0, 0), new T.Vector3(0, 0.003, 0), Math.max(0.4, W * 0.18), 0xffae42, 0.08, 0.05); originMark.add(ax);
      const dot = new T.Mesh(new T.RingGeometry(0.03, 0.045, 24).rotateX(-Math.PI / 2), L.mat('glowA')); dot.position.y = 0.004; originMark.add(dot); ov.add(originMark);
      const R = Math.max(12, Math.max(W, D) * 2); controls.minZoom = 1 / (R * 0.75); stage.setBounds(new T.Box3(new T.Vector3(-R, 0, -R), new T.Vector3(R, H, R))); stage.setGrid(0.1, 0.5);
    }
  }

  // the dashed envelope always wraps every block (it moves and grows with them); its size is the machine's outer size
  const envBox = new T.Box3();
  function contentBox() { envBox.makeEmpty(); for (const v of objs.values()) envBox.expandByObject(v.obj); return envBox; }
  function contentSize() { const b = contentBox(); if (b.isEmpty()) return null; const a = fromS(b.min), c = fromS(b.max);
    const up = v => Math.max(50, Math.ceil(Math.abs(v) / 50) * 50); return [up(c[0] - a[0]), up(a[1] - c[1]), up(c[2] - a[2])]; }
  // the work cell (작업 칸): fixed = the size the user set, centred on the machine origin (floor centre); auto = around the blocks
  const cellMat = new T.LineDashedMaterial({ color: 0xffae42, dashSize: 0.1, gapSize: 0.06, transparent: true, opacity: 0.9 }), cellBad = new T.LineDashedMaterial({ color: 0xff5a4f, dashSize: 0.1, gapSize: 0.06 });
  const cellPlate = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.05, depthWrite: false })); cellPlate.position.y = 0.002; cellPlate.raycast = () => {}; ov.add(cellPlate);
  const cellOf = () => { const m = ED.machine.doc.meta; return tab === 'machine' && m.cellFixed ? m.bbox : null; };
  function outOfCell() { const c = cellOf(); if (!c) return false; const b = contentBox(); if (b.isEmpty()) return false; const [W, D, H] = c.map(v => v / 1000), e = 0.002;
    return b.min.x < -W / 2 - e || b.max.x > W / 2 + e || b.min.z < -D / 2 - e || b.max.z > D / 2 + e || b.max.y > H + e; }
  function updateEnvelope() {
    const cell = cellOf(); cellPlate.visible = !!cell;
    if (!envelope) return;
    if (cell) { const [W, D, H] = cell.map(v => v / 1000), key = `cell${W},${D},${H}`; envelope.visible = true; cellPlate.scale.set(W, 1, D); cellPlate.position.x = cellPlate.position.z = 0;
      if (envelope.userData.key !== key) { envelope.geometry.dispose(); envelope.geometry = new T.EdgesGeometry(new T.BoxGeometry(W, H, D)); envelope.computeLineDistances(); envelope.userData.key = key; }
      envelope.position.set(0, H / 2, 0); const bad = outOfCell(); envelope.material = bad ? cellBad : cellMat; $('cellWarn').hidden = !bad; return; }
    envelope.material = dashMat; $('cellWarn').hidden = true;
    const b = contentBox(); envelope.visible = !b.isEmpty(); if (b.isEmpty()) return;
    b.min.y = 0; const sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), pad = 0.02;
    const key = [sz.x, sz.y, sz.z].map(v => v.toFixed(3)).join();
    if (envelope.userData.key !== key) { envelope.geometry.dispose(); envelope.geometry = new T.EdgesGeometry(new T.BoxGeometry(sz.x + pad, Math.max(0.05, sz.y), sz.z + pad)); envelope.computeLineDistances(); envelope.userData.key = key; }
    envelope.position.copy(c);
    const sz2 = contentSize(); if (sz2 && tab === 'machine' && !cellOf()) { [$('sW').value, $('sD').value, $('sH').value] = sz2; }
  }

  /* selection marker: an amber footprint on the floor (blooms), no outlines */
  const selMark = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new T.LineBasicMaterial({ color: 0xffae42 }));
  const selFill = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.08, depthWrite: false }));
  const selGrp = new T.Group(); selGrp.add(selFill, selMark); ov.add(selGrp); selGrp.visible = false;
  const tmpBox = new T.Box3(), multiMarks = [];
  // everything selected: the primary first, then the Shift-added ones
  const selIds = () => sel ? [sel, ...[...multi].filter(x => x !== sel && objs.has(x))] : [];
  const isSlab = id => tab === 'factory' && ED.factory.doc.building.slabs.some(s => s.id === id);
  function updateSelMark() {
    const extra = selIds().slice(1);
    while (multiMarks.length < extra.length) { const g = selGrp.clone(); ov.add(g); multiMarks.push(g); }
    multiMarks.forEach((g, i) => { const o = extra[i] && objs.get(extra[i])?.obj; g.visible = !!o; if (!o) return; tmpBox.setFromObject(o); if (tmpBox.isEmpty()) { g.visible = false; return; }
      const sz = tmpBox.getSize(new T.Vector3()), c = tmpBox.getCenter(new T.Vector3()), pad = tab === 'factory' ? 0.25 : 0.04; g.position.set(c.x, 0.006, c.z); g.scale.set(Math.max(0.1, sz.x + pad), 1, Math.max(0.1, sz.z + pad)); });
    const o = sel && objs.get(sel)?.obj; selGrp.visible = !!o; if (!o) return;
    tmpBox.setFromObject(o); if (tmpBox.isEmpty()) { selGrp.visible = false; return; }
    const sz = tmpBox.getSize(new T.Vector3()), c = tmpBox.getCenter(new T.Vector3()), pad = tab === 'factory' ? 0.25 : 0.04;
    selGrp.position.set(c.x, 0.006, c.z); selGrp.scale.set(Math.max(0.1, sz.x + pad), 1, Math.max(0.1, sz.z + pad));
  }

  /* ------------------------------------------------------------------ palette */
  let openCats = LS.get('one.build.cats', { building: true, structure: true, transport: true });
  function drawPalette() {
    const q = $('search').value.trim(), box = $('pal'); let html = '';
    const sec = (id, name, items) => {
      const list = items.filter(i => !q || i.name.includes(q) || (i.code || '').toLowerCase().includes(q.toLowerCase())); if (!list.length) return;
      html += `<div class="cat${openCats[id] || q ? ' open' : ''}" data-cat="${id}"><button><span>${esc(name)}</span><small>${list.length}</small></button><div class="items">`
        + list.map(i => `<button class="item" draggable="true" data-add="${esc(i.key)}" title="${esc(i.why || i.name)}"><span class="code">${esc(i.code || '')}${i.grade ? `<i>${i.grade}차</i>` : ''}</span><b>${esc(i.name)}</b></button>`).join('') + '</div></div>';
    };
    if (tab === 'factory') {
      $('palTitle').innerHTML = '에셋 팔레트';
      for (const g of L.FACTORY_GROUPS) sec(g.id, g.name, Object.values(L.FACTORY).filter(d => d.group === g.id).map(d => ({ key: 'f:' + d.id, name: d.name, code: d.process ? d.process.split(' ')[0] : '', grade: d.grade, why: d.why })));
      const mine = Object.entries(lib()).map(([id, m]) => ({ key: 'l:' + id, name: m.name, code: 'v' + Math.max(...Object.keys(m.versions).map(Number)), why: m.builtin ? '협력사 설비 · 객체 하나하나의 크기·위치·속도를 Machine Builder에서 바꿀 수 있습니다' : 'Machine Builder에서 저장한 설비' }));
      sec('mine', '내 설비 (Machine Builder에서 저장)', mine.length ? mine : []);
      if (!mine.length && !q) html += '<p class="why">Machine Builder에서 만든 설비를 저장하면 여기에 나옵니다.</p>';
    } else {
      $('palTitle').innerHTML = '블록 팔레트';
      for (const c of L.MACHINE_CATS) { sec(c.id, c.name, Object.values(L.BLOCKS).filter(b => b.cat === c.id).map(b => ({ key: 'b:' + b.id, name: b.name, code: b.code, why: b.onTop ? '선택한 블록 위에 놓입니다' : '' })));
        if (c.id === 'transport') sec('shapes', '컨베이어 레이아웃 (전환·회송·2단)', Object.entries(SHAPES).map(([id, x]) => ({ key: 's:' + id, name: x.name, code: x.code, why: x.why }))); }
    }
    box.innerHTML = html;
  }
  $('pal').addEventListener('click', e => {
    const c = e.target.closest('.cat>button'); if (c) { const id = c.parentElement.dataset.cat; openCats[id] = !c.parentElement.classList.contains('open'); LS.set('one.build.cats', openCats); c.parentElement.classList.toggle('open'); return; }
    const b = e.target.closest('[data-add]'); if (!b) return; if (mode === 'run') setMode('edit'); if (xray) setXray(false);
    const [k, id] = b.dataset.add.split(/:(.*)/s);
    if (k === 'f' && ['slab', 'add_roof'].includes(L.FACTORY[id]?.kind.cmd)) { addFactory(id); return; }
    startPlace(k, id);
  });
  $('search').addEventListener('input', drawPalette);

  // where a new object goes: the view centre, on the floor, snapped
  const viewPoint = step => { const t = controls.target, p = fromS(t); return [S.snap(p[0], step), S.snap(p[1], step)]; };
  function addFactory(id, at, yaw = 0) {
    const d = L.FACTORY[id], k = d.kind, doc = ed().doc, r = slabRect(doc);
    let [x, y] = at || viewPoint(500); x = Math.min(r.x1 - 500, Math.max(r.x0 + 500, x)); y = Math.min(r.y1 - 500, Math.max(r.y0 + 500, y));
    const params = JSON.parse(JSON.stringify(d.params || {}));
    let nid;
    switch (k.cmd) {
      case 'slab': select(doc.building.slabs[0]?.id || null); return;
      case 'draw_wall': nid = exec('draw_wall', { from: [x - params.length / 2, y], to: [x + params.length / 2, y], thickness: 200 }); break;
      case 'add_column': nid = exec('add_column', { position: [x, y], size: [params.size, params.size] }); break;
      case 'add_roof': { if (doc.building.roofs.length) { toast('지붕은 이미 있습니다. 선택해서 형식을 바꿀 수 있습니다'); select(doc.building.roofs[0].id); return; }
        nid = exec('add_roof', { position: [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2], params: { type: params.type, w: r.x1 - r.x0, d: r.y1 - r.y0 } }); break; }
      case 'add_opening': { const ey = Math.abs(y - r.y0) < Math.abs(y - r.y1) ? r.y0 : r.y1; nid = exec('add_opening', { kind: k.kind, position: [x, ey], params }); break; }
      case 'add_marking': { const hl = params.length / 2, hw = params.width / 2;
        nid = exec('add_marking', { kind: params.variant, params, ...(params.variant === 'aisle' ? { polyline: [[x - hl, y], [x + hl, y]] } : { polygon: [[x - hl, y - hw], [x + hl, y - hw], [x + hl, y + hw], [x - hl, y + hw]] }) }); break; }
      case 'add_drop': nid = exec('add_drop', { kind: k.kind, position: [x, y], params }); break;
      case 'add_storage': nid = exec('add_storage', { kind: k.kind, position: [x, y], params }); break;
      case 'add_mover': nid = exec('add_mover', { kind: k.kind, position: [x, y], params }); break;
      case 'add_block': nid = exec('add_block', { type: k.type, position: [x, y], params }); break;
      case 'place_machine': nid = exec('place_machine', { ref: k.ref, name: nextName(doc, d.name.replace(/\s*\(.*\)\s*$/, '')), position: [x, y], params }); break;
    }
    if (nid && yaw) exec('move', { id: nid, yaw }, true);
    if (nid) { const it = factoryItems(ed().doc).find(x => x.id === nid); if (it && !it.item.name) exec('rename', { id: nid, name: nextName(ed().doc, baseName(it)) }, true); }
    if (nid) { select(nid); toast(`${d.name} 배치 · 오른쪽 조작 패드나 방향키로 맞춥니다`); }
  }
  function addLocal(id, at, yaw = 0) { const m = lib()[id]; if (!m) return; const v = Math.max(...Object.keys(m.versions).map(Number)); const [x, y] = at || viewPoint(500);
    const nid = exec('place_machine', { ref: `local:${id}@${v}`, name: nextName(ed().doc, m.name), position: [x, y] }); if (nid && yaw) exec('move', { id: nid, yaw }, true); if (nid) { select(nid); toast(`${m.name} v${v} 배치`); } }
  // a point given in a block's own frame (x along its length, y across) → stored mm
  function localToStored(n, lx, ly, z) { const p = n.transform.position, r = n.transform.rotation[2] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [S.snap(p[0] + lx * c - ly * s, 5), S.snap(p[1] + lx * s + ly * c, 5), z]; }
  function storedToLocal(n, p) { const q = n.transform.position, r = n.transform.rotation[2] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = p[0] - q[0], dy = p[1] - q[1]; return [dx * c + dy * s, -dx * s + dy * c]; }
  /* a free spot on a base for a new block that sits on it, so a second stopper or sensor never lands on the first one.
     Same-kind blocks on a conveyor keep 400 mm apart along it (from the outfeed end back); anything else on a base
     steps around until its footprint clears what is already there. Returns local [lx, ly] or null if the base is full. */
  const footOf = (n, d) => { const p = Object.assign({}, d?.params, n?.params); return [+(p.w || p.s || p.length || 200), +(p.d || p.s || p.w || 200)]; };
  function freeSlot(base, d, want, skip) { const doc = ed().doc, bd = nodeDef(base), bp = Object.assign({}, bd?.params, base.params);
    const kids = doc.nodes.filter(n => n.parent === base.id && n.id !== skip).map(n => ({ n, d: nodeDef(n), l: storedToLocal(base, n.transform.position) }));
    if (bd?.conveyor && (d.stops || d.sensor)) { const L = +bp.length || 1000, same = kids.filter(k => d.stops ? k.d?.stops : k.d?.sensor).map(k => k.l[0]);
      const ok = x => same.every(sx => Math.abs(sx - x) >= 300);
      if (want && ok(want[0])) return want;
      const cands = []; for (let x = L / 2 - 150; x >= -L / 2 + 150; x -= 50) cands.push(x);
      if (want) cands.sort((a, b) => Math.abs(a - want[0]) - Math.abs(b - want[0])); else { const firsts = []; for (let x = L / 2 - 150; x >= -L / 2 + 150; x -= 400) firsts.push(x); cands.unshift(...firsts); }
      const x = cands.find(ok); return x === undefined ? null : [x, want ? want[1] : 0]; }
    const [fw, fd] = footOf(null, d), BW = +bp.length || +bp.w || +bp.s || 1000, BD = +bp.w && bp.length ? +bp.w : +bp.d || +bp.s || 1000;
    const clear = (x, y) => kids.every(k => { if (k.d?.work || !k.d) return true; const [kw, kd] = footOf(k.n, k.d); return Math.abs(k.l[0] - x) >= (kw + fw) / 2 || Math.abs(k.l[1] - y) >= (kd + fd) / 2; });
    const w0 = want || [0, 0]; if (clear(w0[0], w0[1])) return w0;
    const step = 50, out = []; for (let x = -BW / 2 + fw / 2; x <= BW / 2 - fw / 2 + 1; x += step) for (let y = -BD / 2 + fd / 2; y <= BD / 2 - fd / 2 + 1; y += step) out.push([x, y]);
    out.sort((a, b) => Math.hypot(a[0] - w0[0], a[1] - w0[1]) - Math.hypot(b[0] - w0[0], b[1] - w0[1])); return out.find(q => clear(q[0], q[1])) || null; }
  function addBlock(id, at, onto, yaw = 0, over) {
    const d = L.BLOCKS[id], doc = ed().doc, P = nextCode(doc, d.code), params = Object.assign({ tag: P }, JSON.parse(JSON.stringify(d.params)), over || {});
    const base = at ? (d.onTop && onto ? doc.nodes.find(n => n.id === onto) : null) : sel && doc.nodes.find(n => n.id === sel);
    let pos, parent = null;
    if (at) { pos = [at[0], at[1], base ? nodeTop(base) : 0]; parent = base ? base.id : null;
      if (base && !d.work) { const l = storedToLocal(base, at), f = freeSlot(base, d, l); if (!f) { toast(`${base.params.tag || ''} 위에 ${d.name}을(를) 더 놓을 자리가 없습니다`, true); return null; }
        if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 1) { pos = localToStored(base, f[0], f[1], nodeTop(base)); toast('같은 자리에 이미 있어 옆 빈자리에 놓았습니다'); } } }
    else if (d.onTop && base) { const bd = nodeDef(base), bpar = Object.assign({}, bd?.params, base.params); parent = base.id; yaw = yaw || base.transform.rotation[2];
      // stopper / sensor from the outfeed end back, 400 mm apart; a sensor on the side rail; everything follows the base's direction
      const ly = bd && bd.conveyor && d.sensor ? -((bpar.w || 500) / 2 + 30) : 0, f = d.work ? [0, 0] : freeSlot(base, d, null);
      if (!f) { toast(`${bpar.tag || ''} 위에 ${d.name}을(를) 더 놓을 자리가 없습니다`, true); return null; }
      pos = localToStored(base, f[0], f[1] || ly, nodeTop(base)); }
    else { const xs = doc.nodes.filter(n => !n.parent).map(n => n.transform.position[0] + blockHalfX(n)); pos = [xs.length ? S.snap(Math.max(...xs) + 400, 50) : 0, 0, 0]; }
    const nid = exec('add_block', { blockType: id, name: `${d.name.replace(/ \(.*\)$/, '')} ${P.replace(/^\D+/, '')}`, parent, position: pos, params, joints: d.joints(P, params), io: d.io(P, params) });
    if (nid && yaw) exec('move', { id: nid, rotation: [0, 0, yaw] }, true);
    if (nid) { select(nid); toast(`${P} ${d.name}: 축 ${d.joints(P, params).length} · 태그 ${d.io(P, params).length} 추가`); }
    return nid;
  }
  /* placing: the chosen asset follows the pointer as a see-through preview; a click puts it there (Shift keeps placing) */
  let placing = null;
  /* conveyor layouts (컨베이어 형태): several conveyors placed at once, already joined so a work passes from one to the
     next (90° side transfers), plus a two-level line whose lifters carry the work between the levels.
     Piece positions are mm about the layout origin, yaw in degrees; X = 투입 → 배출. */
  const CV = 'roller-conveyor';
  const CT = 'transfer-corner';
  const CU = 'curve-conveyor', RC = 750; // curve centre-line radius
  const SHAPES = {
    'l-right': { name: '직각 전환 라인 · 우측 90°', code: 'CV×2 커브', why: '직선 3 m → 90° 커브 → 오른쪽으로 3 m. 롤러가 끊김 없이 이어집니다',
      pieces: [{ t: CV, x: 0, y: 0, yaw: 0 }, { t: CU, x: 1500, y: -RC, yaw: 0, p: { turn: 'right', r: RC } }, { t: CV, x: 1500 + RC, y: -RC - 1500, yaw: -90 }] },
    'l-left': { name: '직각 전환 라인 · 좌측 90°', code: 'CV×2 커브', why: '직선 3 m → 90° 커브 → 왼쪽으로 3 m',
      pieces: [{ t: CV, x: 0, y: 0, yaw: 0 }, { t: CU, x: 1500, y: RC, yaw: 0, p: { turn: 'left', r: RC } }, { t: CV, x: 1500 + RC, y: RC + 1500, yaw: 90 }] },
    'u-turn': { name: '리턴 라인 · 180° 회송', code: 'CV×3 커브×2', why: '나간 라인이 90° 커브 두 개로 같은 쪽으로 되돌아옵니다',
      pieces: [{ t: CV, x: 0, y: 0, yaw: 0 }, { t: CU, x: 1500, y: RC, yaw: 0, p: { turn: 'left', r: RC } }, { t: CV, x: 1500 + RC, y: RC + 1500, yaw: 90 },
        { t: CU, x: 1500, y: RC + 3000, yaw: 90, p: { turn: 'left', r: RC } }, { t: CV, x: 0, y: 2 * RC + 3000, yaw: 180 }] },
    'two-level': { name: '상하 2단 순환 라인', code: 'CV×2 LFT×2', why: '상단은 작업, 하단은 빈 팔레트 회송. 양 끝 리프터가 단 사이를 오르내립니다',
      pieces: [{ t: CV, x: 0, y: 0, yaw: 0, p: { h: 900 } }, { t: CV, x: 0, y: 0, yaw: 180, p: { h: 450, w: 300 } }, { t: 'lifter', x: 1800, y: 0, yaw: 0, p: { stroke: 450 } }, { t: 'lifter', x: -1800, y: 0, yaw: 0, p: { stroke: 450 } }] },
  };
  const rotXY = (x, y, deg) => { const r = deg * Math.PI / 180; return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; };
  function addShape(id, at, yaw = 0) { const S0 = SHAPES[id], made = [];
    for (const pc of S0.pieces) { const [dx, dy] = rotXY(pc.x, pc.y, yaw), nid = addBlock(pc.t, [at[0] + dx, at[1] + dy], null, ((pc.yaw + yaw) % 360 + 360) % 360, pc.p); if (nid) made.push(nid); }
    if (made.length) { selectMany(made); toast(`${S0.name}: 이어진 채로 놓였습니다 · 한 덩어리로 옮기려면 그대로 끄세요`); } }
  function previewOf(k, id) {
    let o = null;
    try { if (k === 's') { o = new T.Group(); for (const pc of SHAPES[id].pieces) { const b = L.buildBlock(pc.t, Object.assign({}, L.BLOCKS[pc.t].params, pc.p)); placeObj(b, [pc.x, pc.y, 0], pc.yaw); o.add(b); } }
      else if (k === 'b') o = L.buildBlock(id, L.BLOCKS[id].params);
      else if (k === 'l') o = buildLocalMachine({ id, v: Math.max(...Object.keys(lib()[id].versions).map(Number)) });
      else { const d = L.FACTORY[id], p = d.params || {};
        o = d.kind.cmd === 'draw_wall' ? L.special.wall((p.length || 6000) / 1000, 4, 0.2) : d.kind.cmd === 'add_column' ? L.special.column({ size: p.size || 500, h: 6 })
          : d.kind.cmd === 'add_marking' ? L.special.marking(p.variant, p) : L.buildFactory(id, JSON.parse(JSON.stringify(p))); } } catch (err) { o = null; }
    const g = new T.Group(); if (o) g.add(o); else g.add(new T.Mesh(new T.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0)));
    g.traverse(m => { if (!m.isMesh) return; m.castShadow = false; m.material = (Array.isArray(m.material) ? m.material[0] : m.material).clone(); Object.assign(m.material, { transparent: true, opacity: 0.55, depthWrite: false }); m.raycast = () => {}; });
    const ring = new T.Mesh(new T.RingGeometry(0.0, 1, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.18, depthWrite: false }));
    tmpBox.setFromObject(g); const sz = tmpBox.getSize(new T.Vector3()); ring.scale.setScalar(Math.max(0.3, Math.hypot(sz.x, sz.z) / 2 + 0.1)); ring.position.y = 0.004; ring.raycast = () => {}; g.add(ring);
    return g; }
  function startPlace(k, id) { endPlace(); if (mode === 'run') setMode('edit'); if (xray) setXray(false);
    const name = k === 's' ? SHAPES[id].name : k === 'b' ? L.BLOCKS[id].name : k === 'l' ? lib()[id]?.name : L.FACTORY[id].name;
    placing = { k, id, name, yaw: 0, at: null, onto: null, obj: previewOf(k, id) }; placing.obj.visible = false; ov.add(placing.obj);
    document.querySelectorAll('#pal [data-add]').forEach(b => b.classList.toggle('placing', b.dataset.add === k + ':' + id));
    renderer.domElement.style.cursor = 'copy'; updateHint(); toast(`${name}: 놓을 곳을 누르세요 · R 회전 · Esc 취소`); }
  function endPlace() { if (!placing) return; ov.remove(placing.obj); placing = null; renderer.domElement.style.cursor = ''; document.querySelectorAll('#pal .placing').forEach(b => b.classList.remove('placing')); updateHint(); }
  function trackPlace(e) {
    setNdc(e); plane.constant = 0; let onto = null, z = 0;
    if (placing.k === 'b' && L.BLOCKS[placing.id].onTop) { const id = pickExact(); const n = id && ED.machine.doc.nodes.find(x => x.id === id); if (n) { onto = n.id; z = nodeTop(n) / 1000; } }
    if (!ray.ray.intersectPlane(plane, hit)) return; const st = tab === 'factory' ? (e.altKey ? 10 : 500) : (e.altKey ? 5 : 50);
    let p = fromS(hit); p = [S.snap(p[0], st), S.snap(p[1], st)];
    if (tab === 'factory') { const r = slabRect(ed().doc); p = [Math.min(r.x1, Math.max(r.x0, p[0])), Math.min(r.y1, Math.max(r.y0, p[1]))]; }
    else { const c = cellOf(); if (c) p = [Math.min(c[0] / 2, Math.max(-c[0] / 2, p[0])), Math.min(c[1] / 2, Math.max(-c[1] / 2, p[1]))]; }
    placing.at = p; placing.onto = onto; placing.obj.visible = true; placeObj(placing.obj, [p[0], p[1], z * 1000], placing.yaw); }
  function commitPlace(keep) { const P = placing; if (!P || !P.at) return; const { k, id, at, onto, yaw } = P;
    if (!keep) endPlace();
    ed().batch('add', () => { if (k === 'f') addFactory(id, at, yaw); else if (k === 'l') addLocal(id, at, yaw); else if (k === 's') addShape(id, at, yaw); else addBlock(id, at, onto, yaw); if (tab === 'factory' && sel) autoLink([sel]); }); }
  // drag straight from the palette onto the canvas works too
  $('pal').addEventListener('dragstart', e => { const b = e.target.closest('[data-add]'); if (!b) return; const [k, id] = b.dataset.add.split(/:(.*)/s); e.dataTransfer.setData('text/plain', b.dataset.add); e.dataTransfer.effectAllowed = 'copy'; startPlace(k, id); });
  $('pal').addEventListener('dragend', () => setTimeout(() => { if (placing && placing.dragging !== false) endPlace(); }, 0));
  renderer.domElement.addEventListener('dragover', e => { if (!placing) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; trackPlace(e); });
  renderer.domElement.addEventListener('dragleave', () => { if (placing) placing.obj.visible = false; });
  renderer.domElement.addEventListener('drop', e => { if (!placing) return; e.preventDefault(); trackPlace(e); commitPlace(false); });
  renderer.domElement.addEventListener('contextmenu', e => { if (placing) { e.preventDefault(); endPlace(); } });
  const blockHalfX = n => { const o = objs.get(n.id)?.obj; if (!o) return 300; tmpBox.setFromObject(o); return tmpBox.isEmpty() ? 300 : Math.max(100, (tmpBox.max.x - tmpBox.min.x) * 500); };

  /* ------------------------------------------------------------------ tree */
  function drawTree() {
    const doc = ed().doc, box = $('tree'); let html = '', n = 0;
    if (tab === 'factory') {
      const items = factoryItems(doc), groups = {};
      for (const it of items) { const g = it.path === 'machines' ? '설비' : (L.FACTORY[it.def] ? L.FACTORY_GROUPS.find(x => x.id === L.FACTORY[it.def].group)?.name : '기타') || '기타'; (groups[g] || (groups[g] = [])).push(it); }
      html += `<div data-id="${esc(doc.building.slabs[0]?.id || '')}" class="${sel === doc.building.slabs[0]?.id ? 'on' : ''}"><code>바닥</code><span>${esc(doc.meta.name)} · ${((slabRect(doc).x1 - slabRect(doc).x0) / 1000).toFixed(1)} × ${((slabRect(doc).y1 - slabRect(doc).y0) / 1000).toFixed(1)} m</span></div>`;
      if (doc.flows.length) { groups['공정 흐름'] = null; }
      for (const [g, list] of Object.entries(groups)) { if (!list) { html += `<div class="grp">공정 흐름 · ${doc.flows.length}</div>`; const nm = end => { const x = items.find(y => y.id === end.split('.')[0]); return x ? itemCode(x) || itemName(x) : '?'; };
          for (const f of doc.flows) { n++; html += `<div data-id="${f.id}" class="${sel === f.id ? 'on' : ''}"><code>${esc(VIA[f.via || 'auto'])}</code><span>${esc(nm(f.from))} → ${esc(nm(f.to))}</span></div>`; } continue; }
        html += `<div class="grp">${esc(g)} · ${list.length}</div>`; for (const it of list) { n++; html += `<div data-id="${it.id}" class="${selIds().includes(it.id) ? 'on' : ''}"><code>${esc(itemCode(it))}</code><span>${esc(itemName(it))}</span></div>`; } }
    } else {
      html += `<div data-id="" class="${!sel ? 'on' : ''}"><code>설비</code><span>${esc(doc.meta.name)}</span></div>`;
      const kids = id => doc.nodes.filter(x => (x.parent || null) === id);
      const walk = (id, depth) => { for (const x of kids(id)) { n++; html += `<div data-id="${x.id}" class="${selIds().includes(x.id) ? 'on' : ''}" style="padding-left:${6 + depth * 14}px"><code>${esc(nodeCode(x))}</code><span>${esc(x.name || x.blockType)}</span></div>`; walk(x.id, depth + 1); } };
      walk(null, 1);
    }
    box.innerHTML = html; $('treeN').textContent = n;
  }
  $('tree').addEventListener('click', e => { const d = e.target.closest('[data-id]'); if (!d) return; if ((e.shiftKey || e.ctrlKey || e.metaKey) && d.dataset.id) toggleSel(d.dataset.id); else select(d.dataset.id || null, true); });

  /* ------------------------------------------------------------------ properties */
  const field = (f, val, key = f.key) => {
    if (f.type === 'select') return `<span class="k">${esc(f.label)}</span><select data-k="${esc(key)}">${f.options.map(([v, t]) => `<option value="${esc(v)}"${String(val) === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    return `<span class="k">${esc(f.label)}</span><span class="unit"><input type="number" data-k="${esc(key)}" value="${val ?? ''}" step="${f.step || 1}" min="${f.min ?? ''}"><small>${esc(f.unit || '')}</small></span>`;
  };
  const howtoFactory = `<ol class="howto"><li><b>왼쪽 팔레트</b>에서 에셋을 고르면 커서를 따라다닙니다. 놓을 곳을 누르세요 (끌어다 놓아도 됩니다, Esc 취소).</li><li>놓은 것을 고르면 오른쪽에 <b>조작 패드</b>가 나옵니다: 화살표로 옮기고, 회전 버튼으로 돌립니다. 방향키도 됩니다.</li><li><b>Shift+클릭</b>, 빈 곳 <b>Shift+드래그</b>, <b>Ctrl+A</b>로 여러 개를 골라 한꺼번에 다룹니다.</li><li>3D에서 직접 <b>끌어도</b> 옮겨집니다 (500 mm 단위, Alt = 10 mm). 빈 곳을 끌면 화면이 돌고, 휠은 확대입니다.</li><li><b>Machine Builder</b>에서 만든 설비를 저장하면 <b>내 설비</b>에서 공장에 놓을 수 있습니다.</li><li><b>▶ 시뮬레이션</b>을 누르면 저장하고 이 공장을 SIMULATION에서 엽니다.</li></ol>`;
  const howtoMachine = `<ol class="howto"><li><b>왼쪽 팔레트</b>에서 블록을 고르면 커서를 따라다닙니다. 놓을 곳을 누르세요. 센서·스토퍼·워크는 컨베이어 위에 대면 그 위에 올라갑니다.</li><li>블록을 고르면 오른쪽에 길이·속도 같은 값과 <b>조작 패드</b>(이동·회전·높이)가 나옵니다. 방향키도 됩니다.</li><li>로봇·센서 같은 블록을 컨베이어·프레임·단상 위로 옮기면 윗면에 붙습니다. 받침 높이를 바꾸면 같이 움직입니다.</li><li><b>Shift+클릭</b>, 빈 곳 <b>Shift+드래그</b>, <b>Ctrl+A</b>로 여러 개를 골라 한꺼번에 다룹니다.</li><li>위의 <b>동작 시험</b>을 누르면 아래에 조작 패널이 열립니다. 명령(예: 운전, 올리기)을 눌러 켜면 설비가 움직이고, 센서·끝 위치 같은 상태는 자동으로 바뀝니다.</li><li><b>저장</b>하면 설비 카드가 만들어지고 Factory Builder의 <b>내 설비</b>에 나옵니다.</li></ol>`;
  function drawProps() {
    const doc = ed().doc, box = $('props'); let html = '';
    const many = selIds();
    if (many.length > 1) {
      const names = many.map(id => { if (tab === 'factory') { const it = factoryItems(doc).find(x => x.id === id); return it ? (itemCode(it) ? itemCode(it) + ' ' : '') + itemName(it) : ''; } const n = doc.nodes.find(x => x.id === id); return n ? nodeCode(n) + ' ' + n.name : ''; });
      box.innerHTML = `<div class="sec"><h2>${many.length}개 선택 <small>Shift+클릭으로 더하거나 빼기</small></h2><p class="why">끌거나 아래 조작 패드로 한꺼번에 옮기고 돌립니다. 회전은 묶음 가운데를 중심으로 돕니다.</p><div class="taglist">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div></div>${teleop(tab === 'factory')}`;
      return; }
    if (tab === 'factory') {
      const it = sel && factoryItems(doc).find(x => x.id === sel), slab = doc.building.slabs.find(s => s.id === sel), flow = sel && doc.flows.find(f => f.id === sel);
      if (flow) { const nm = end => { const x = factoryItems(doc).find(y => y.id === end.split('.')[0]); return x ? (itemCode(x) ? itemCode(x) + ' ' : '') + itemName(x) : '?'; };
        html = `<div class="sec"><h2>공정 흐름</h2><p class="why">${esc(nm(flow.from))} 출구 → ${esc(nm(flow.to))} 입구</p><div class="props">
          <span class="k">옮기는 수단</span><select data-k="flow.via">${Object.entries(VIA).map(([v, t]) => `<option value="${v}"${(flow.via || 'auto') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          ${field(num('ratio', '분기 비율', '0~1', 0.05), flow.ratio, 'flow.ratio')}</div>
          <p class="why" style="margin-top:10px">자동: 두 끝이 맞닿으면 컨베이어, 아니면 공장에 있는 AMR·지게차·작업자 중 가까운 것이 옮깁니다.</p><div class="acts"><button class="btn" data-act="del">흐름 삭제</button></div></div>`; }
      else if (slab) { const r = slabRect(doc); html = `<div class="sec"><h2>바닥 슬래브</h2><p class="why">모든 배치와 이동 경로가 놓이는 기준면입니다. 원점은 왼쪽 아래(입고) 모서리입니다.</p><div class="props">${field(num('w', '가로', 'm', 0.5), (r.x1 - r.x0) / 1000, 'slab.w')}${field(num('d', '세로', 'm', 0.5), (r.y1 - r.y0) / 1000, 'slab.d')}<span class="k">공장 이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"></div></div>`; }
      else if (it) {
        const d = L.FACTORY[it.def] || {}, x = it.item, pos = x.transform ? x.transform.position : [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2, 0];
        html = `<div class="sec"><h2>${esc(itemName(it))} <small>${esc(itemCode(it))}</small></h2>${d.why ? `<p class="why">${esc(d.why)}</p>` : ''}<div class="props">`;
        html += `<span class="k">이름</span><input data-k="name" value="${esc(x.name || '')}" placeholder="${esc(d.name || '')}">`;
        html += `<span class="k">위치 X · Y</span><span class="v">${(pos[0] / 1000).toFixed(2)} · ${(pos[1] / 1000).toFixed(2)} m</span>`;
        if (x.transform) html += `<span class="k">방향</span><span class="v">${x.transform.rotation[2]}°</span>`;
        if (it.path === 'building.walls') html += field(num('length', '길이', 'm', 0.5), (Math.hypot(x.to[0] - x.from[0], x.to[1] - x.from[1]) / 1000).toFixed(2), 'wall.length');
        else if (it.path !== 'building.columns') for (const f of d.fields || []) { const pv = x.params[f.key] ?? d.params[f.key]; html += field(f, pv, 'p.' + f.key); }
        if (it.path === 'machines') { html += `<span class="k">태그 접두어</span><span class="v">${esc(x.tagPrefix)}</span><span class="k">참조</span><span class="v">${esc(x.ref)}</span>`;
          if (d.size) html += `<span class="k">외곽</span><span class="v">${d.size.join(' × ')} mm</span>`; if (d.process) html += `<span class="k">공정 분류</span><span class="v" style="font-family:var(--sans)">${esc(d.process)}</span>`; }
        html += `</div>${it.local ? `<p class="why" style="margin-top:10px">객체 하나하나의 크기·위치·속도는 Machine Builder에서 바꿉니다. 저장하면 새 버전이 되고 이 공장의 같은 설비가 그 버전을 씁니다.</p><div class="acts"><button class="btn" data-act="editLocal">Machine Builder에서 편집</button></div>` : ''}</div>${it.path === 'building.slabs' ? '' : teleop(true)}`;
      } else html = `<div class="sec"><h2>공장</h2><div class="props"><span class="k">이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"><span class="k">배치 현황</span><span class="v">${factoryItems(doc).length}개 · 설비 ${doc.machines.length}대</span></div>
        ${window.OnePlant ? `<p class="why" style="margin-top:10px">예시 공정: 감마 라인 (1 조립 → 2 페이스트 도포 → 3 브레이징 → 4 검사)</p><div class="acts"><button class="btn" data-act="example">예시 공정 불러오기</button></div>` : ''}</div>`;
    } else {
      const n = sel && doc.nodes.find(x => x.id === sel);
      if (n) { const d = nodeDef(n) || { fields: [], params: {} }, P = nodeCode(n), p = n.transform.position;
        const tags = doc.io.filter(t => t.tag.startsWith(P + '_')), joints = doc.joints.filter(j => j.node === n.id);
        html = `<div class="sec"><h2><span><b style="font-family:var(--mono)">${esc(P)}</b> ${esc(d.name || n.blockType)}</span></h2><div class="props"><span class="k">이름</span><input data-k="name" value="${esc(n.name)}">`;
        for (const f of typeof d.fields === 'function' ? d.fields(Object.assign({}, d.params, n.params)) : d.fields) html += field(f, n.params[f.key] ?? d.params[f.key], 'p.' + f.key);
        html += `<span class="k">위치 X·Y·Z</span><span class="unit"><input type="number" data-k="pos.0" value="${p[0]}" step="5"><input type="number" data-k="pos.1" value="${p[1]}" step="5"><input type="number" data-k="pos.2" value="${p[2]}" step="5"></span><span class="k">방향</span><span class="v">${n.transform.rotation[2]}°</span></div>`;
        if (joints.length) html += `<h2 style="margin-top:14px">축 <small>${joints.length}</small></h2><div class="taglist">${joints.map(j => `<span>${esc(j.id)} · ${j.type === 'rot' ? '회전' : '직선'} ${j.mode} · ${j.min}~${j.max} · ${j.vmax}${j.type === 'rot' ? '°/s' : ' mm/s'}</span>`).join('')}</div>`;
        if (tags.length) html += `<h2 style="margin-top:14px">태그 <small>${tags.length}</small></h2><div class="taglist">${tags.map(t => `<span>${esc(t.tag)} · ${t.dir === 'out' ? 'OUT' : 'IN'} · ${t.type.toUpperCase()}</span>`).join('')}</div>`;
        html += `</div>${teleop(false)}`;
      } else {
        const ct = doc.card;
        html = `<div class="sec"><h2>설비 <small>${doc.meta.fidelity}</small></h2><div class="props"><span class="k">이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"><span class="k">${doc.meta.cellFixed ? '작업 칸' : '외곽 (블록 따라)'}</span><span class="v">${(doc.meta.cellFixed ? doc.meta.bbox : contentSize() || doc.meta.bbox).join(' × ')} mm</span>
          ${field(num('cycle_time', '사이클', 's', 0.5), ct.cycle_time ?? '', 'card.cycle_time')}${field(num('ok_rate', '양품률', '0~1', 0.01), ct.ok_rate ?? '', 'card.ok_rate')}${field(num('operators', '작업자', '명', 1), ct.operators, 'card.operators')}
          <span class="k">입구</span>${portSelect('inlet')}<span class="k">출구</span>${portSelect('outlet')}
          <span class="k">카드</span><span class="v">사이클 ${ct.cycle_time ?? '–'} s · 양품률 ${ct.ok_rate != null ? (ct.ok_rate * 100).toFixed(1) + '%' : '–'}</span></div></div>`;
      }
    }
    box.innerHTML = html;
  }
  // the "teleop" pad: nudge, turn, raise, copy and delete the selected object without dragging
  // how far one press moves / turns: typed in, with sensible defaults per builder (factory 500 mm · 90°, machine 50 mm · 90°)
  const TELE = { factory: { step: 500, ang: 90, presets: [100, 500, 1000] }, machine: { step: 50, ang: 90, presets: [5, 50, 100] } };
  const teleop = canDup => { const t = TELE[tab];
    return `<div class="sec tele"><h2>조작 <small>방향키로도 움직입니다 · Shift = 5배</small></h2>
      <div class="tgrid"><div class="dpad"><span></span><button data-mv="up" title="화면 위쪽으로">▲</button><span></span><button data-mv="left" title="화면 왼쪽으로">◀</button><b>${t.step}<small>mm</small></b><button data-mv="right" title="화면 오른쪽으로">▶</button><span></span><button data-mv="down" title="화면 아래쪽으로">▼</button><span></span></div>
      <div class="tcol"><label class="tin"><span>한 번에</span><input type="number" data-tstep min="1" step="1" value="${t.step}"><small>mm</small></label>
      <div class="seg2">${t.presets.map(v => `<button data-preset="${v}" class="${v === t.step ? 'on' : ''}">${v}</button>`).join('')}</div>
      <label class="tin"><span>회전</span><input type="number" data-tang min="1" max="180" step="1" value="${t.ang}"><small>°</small></label>
      <div class="rotr"><button data-rot="-1">⟲ ${t.ang}°</button><button data-rot="1">${t.ang}° ⟳</button></div>
      ${tab === 'machine' ? `<div class="rotr"><button data-z="1" title="위에 올린 블록은 올라가고, 바닥에 선 컨베이어·단상은 다리가 늘어납니다">높이 ▲</button><button data-z="-1">높이 ▼</button></div>` : ''}</div></div>
      <div class="acts">${canDup ? '<button class="btn" data-act="dup">복사</button>' : ''}<button class="btn" data-act="del">삭제</button></div></div>`; };
  // screen direction → the stored axis (±X / ±Y) it points along most, so ▲ always moves "up the screen"
  function screenAxis(dir) { const f = new T.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); const r = new T.Vector3(-f.z, 0, f.x);
    const v = dir === 'up' ? f : dir === 'down' ? f.clone().negate() : dir === 'right' ? r : r.clone().negate();
    const st = S.sceneToStored([v.x, 0, v.z]); return Math.abs(st[0]) >= Math.abs(st[1]) ? [Math.sign(st[0]), 0] : [0, Math.sign(st[1])]; }
  function nudge(dir, big) { if (!sel || mode === 'run' || xray) return; const st = TELE[tab].step * (big ? 5 : 1), [ax, ay] = screenAxis(dir);
    moveSelBy([ax * st, ay * st, 0]); }
  /* conveyors snap to conveyors while you move them: end to end when they point the same way, onto the side of
     the end when they meet at 90°. Within 400 mm of such a spot the moved one jumps there and takes the other's height. */
  function conveyorSnap(n, c, skip) { const doc = ED.machine.doc, d = nodeDef(n); if (!d || !d.conveyor || n.parent) return null;
    const pa = Object.assign({}, d.params, n.params), rA = n.transform.rotation[2] * Math.PI / 180, dA = [Math.cos(rA), Math.sin(rA)], LA = +pa.length;
    let best = null;
    for (const b of doc.nodes) { const bd = nodeDef(b); if (b.id === n.id || !bd || !bd.conveyor || b.parent || skip.has(b.id)) continue;
      const pb = Object.assign({}, bd.params, b.params), rB = b.transform.rotation[2] * Math.PI / 180, dB = [Math.cos(rB), Math.sin(rB)], q = b.transform.position, LB = +pb.length, wB = +pb.w;
      const out = [q[0] + dB[0] * LB / 2, q[1] + dB[1] * LB / 2], inn = [q[0] - dB[0] * LB / 2, q[1] - dB[1] * LB / 2], diff = ((n.transform.rotation[2] - b.transform.rotation[2]) % 360 + 360) % 360, cands = [];
      if (diff < 1 || diff > 359) cands.push([out[0] + dA[0] * LA / 2, out[1] + dA[1] * LA / 2, out], [inn[0] - dA[0] * LA / 2, inn[1] - dA[1] * LA / 2, inn]);
      else if (Math.abs(diff - 90) < 1 || Math.abs(diff - 270) < 1) { const ai = [out[0] - dB[0] * wB / 2 + dA[0] * wB / 2, out[1] - dB[1] * wB / 2 + dA[1] * wB / 2], ao = [inn[0] + dB[0] * wB / 2 - dA[0] * wB / 2, inn[1] + dB[1] * wB / 2 - dA[1] * wB / 2];
        cands.push([ai[0] + dA[0] * LA / 2, ai[1] + dA[1] * LA / 2, ai], [ao[0] - dA[0] * LA / 2, ao[1] - dA[1] * LA / 2, ao]); }
      for (const [x, y, pt] of cands) { const dist = Math.hypot(x - c[0], y - c[1]); if (dist < 400 && (!best || dist < best.dist)) best = { dist, pos: [Math.round(x), Math.round(y)], h: +pb.h, other: b, pt }; } }
    return best; }
  const snapMark = new T.Mesh(new T.RingGeometry(0.1, 0.16, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.9, depthWrite: false })); snapMark.visible = false; ov.add(snapMark);
  function showSnap(sn) { snapMark.visible = !!sn; if (sn) { const p = toS([sn.pt[0], sn.pt[1], sn.h]); snapMark.position.set(p.x, p.y + 0.01, p.z); } }
  // move every selected object by the same amount, as one undo step (children ride along with their parent)
  function moveSelBy(by) { const ids = selIds().filter(x => !isSlab(x)); if (!ids.length) return;
    ed().batch(ids.length > 1 ? `move ${ids.length}` : 'move', () => {
      if (tab === 'factory') { for (const id of ids) exec('move', { id, by: [by[0], by[1]] }, true); autoLink(ids); }
      else { const doc = ED.machine.doc, set = new Set(ids), up = n => { for (let p = n.parent; p; p = doc.nodes.find(x => x.id === p)?.parent) if (set.has(p)) return true; return false; };
        for (const id of ids) { const n = doc.nodes.find(x => x.id === id); if (n && !up(n)) moveNode(id, [...by]); }
        if (ids.length === 1) { const n = ED.machine.doc.nodes.find(x => x.id === ids[0]), p = n.transform.position, sn = conveyorSnap(n, p, new Set());
          if (sn) { moveNode(n.id, [sn.pos[0] - p[0], sn.pos[1] - p[1], 0]); const hk = nodeDef(n).heightKey; if (+(n.params[hk] ?? nodeDef(n).params[hk]) !== sn.h) setParamKeepKids(n.id, hk, sn.h);
            setTimeout(() => toast(`${nodeCode(n)}을(를) ${nodeCode(sn.other)}에 붙였습니다 · 높이 ${sn.h} mm`), 0); } }
        settle(ids); } }); showSnap(null); }
  function moveNode(id, by) { by = by.slice(); const doc = ED.machine.doc, n = doc.nodes.find(x => x.id === id); if (!n) return; const p = n.transform.position;
    if (p[2] + by[2] < 0) by[2] = -p[2]; if (!by[0] && !by[1] && !by[2]) return;
    const kids = []; const walk = pid => { for (const k of doc.nodes.filter(x => x.parent === pid)) { kids.push(k); walk(k.id); } }; walk(id);
    exec('move', { id, position: [p[0] + by[0], p[1] + by[1], p[2] + by[2]] }); for (const k of kids) { const q = k.transform.position; exec('move', { id: k.id, position: [q[0] + by[0], q[1] + by[1], q[2] + by[2]] }, true); } }
  /* machine: blocks rest on something. An onTop block (robot, sensor, stopper, cylinder…) moved over a conveyor, frame or pedestal
     lands on its top and becomes its child; moved off, it goes back to the floor. Changing a base's height carries what sits on it. */
  function descendants(doc, id) { const out = []; const walk = pid => { for (const k of doc.nodes.filter(x => x.parent === pid)) { out.push(k); walk(k.id); } }; walk(id); return out; }
  function baseUnder(doc, n, skip) { const p = n.transform.position, s = toS([p[0], p[1], 0]); let best = null, bestTop = -1;
    for (const b of doc.nodes) { if (skip.has(b.id)) continue; const top = nodeTop(b); if (top <= b.transform.position[2] + 1) continue;
      const o = objs.get(b.id)?.obj; if (!o) continue; tmpBox.setFromObject(o); const m = 0.06;
      if (s.x < tmpBox.min.x - m || s.x > tmpBox.max.x + m || s.z < tmpBox.min.z - m || s.z > tmpBox.max.z + m) continue; if (top > bestTop) { best = b; bestTop = top; } }
    return best; }
  function settle(ids) { const doc0 = ED.machine.doc, moved = new Set(); for (const id of ids) { moved.add(id); descendants(doc0, id).forEach(k => moved.add(k.id)); }
    for (const id of ids) { const doc = ED.machine.doc, n = doc.nodes.find(x => x.id === id), d = n && nodeDef(n); if (!d || !d.onTop || (n.parent && moved.has(n.parent))) continue;
      const base = baseUnder(doc, n, moved), z = base ? nodeTop(base) : 0, par = base ? base.id : null;
      if ((n.parent || null) !== par) exec('set_parent', { id, parent: par }, true);
      const dz = z - n.transform.position[2]; if (Math.abs(dz) > 0.5) moveNode(id, [0, 0, dz]);
      // dropped onto another stopper / sensor / block on the same base: slide to the nearest free spot
      if (base && ids.length === 1 && !d.work) { const m = ED.machine.doc.nodes.find(x => x.id === id), l = storedToLocal(base, m.transform.position), f = freeSlot(base, d, l, id);
        if (f && Math.hypot(f[0] - l[0], f[1] - l[1]) > 1) { const q = localToStored(base, f[0], f[1], m.transform.position[2]); moveNode(id, [q[0] - m.transform.position[0], q[1] - m.transform.position[1], 0]); toast('다른 블록과 겹쳐 옆 빈자리로 옮겼습니다'); } } } }
  function setParamKeepKids(id, key, value) { const doc = ED.machine.doc, n = doc.nodes.find(x => x.id === id); if (!n) return;
    ed().batch('set_param', () => { const before = nodeTop(n); exec('set_param', { id, key, value }, true); const after = nodeTop(ED.machine.doc.nodes.find(x => x.id === id));
      if (Math.abs(after - before) > 0.5) for (const k of ED.machine.doc.nodes.filter(x => x.parent === id)) moveNode(k.id, [0, 0, after - before]); }); }
  // conveyors that meet end to end or at a side transfer, at the same height: they rise and fall together
  function joinedConveyors(doc, start) { const cv = doc.nodes.filter(n => !n.parent && (nodeDef(n)?.conveyor || nodeDef(n)?.corner || nodeDef(n)?.curve)), P = n => { const p = Object.assign({}, nodeDef(n).params, n.params); if (nodeDef(n).corner) p.length = p.w; return p; };
    const ends = n => { if (nodeDef(n).curve) { const g = L.curveGeom(n); return [g.point(0), g.point(1)]; } if (!nodeDef(n).corner) return ['in', 'out'].map(k => SCN.portAt(doc, `${n.id}/${k}`).pos); const q = n.transform.position, h = +P(n).w / 2; return [[q[0] + h, q[1]], [q[0] - h, q[1]], [q[0], q[1] + h], [q[0], q[1] - h]]; }, H = n => +P(n).h;
    const over = (p, b) => { if (nodeDef(b).curve) return ends(b).some(e => Math.hypot(e[0] - p[0], e[1] - p[1]) <= +P(b).w / 2 + 80); const r = b.transform.rotation[2] * Math.PI / 180, dx = p[0] - b.transform.position[0], dy = p[1] - b.transform.position[1], a = dx * Math.cos(r) + dy * Math.sin(r), l = -dx * Math.sin(r) + dy * Math.cos(r);
      return Math.abs(a) <= +P(b).length / 2 + 80 && Math.abs(l) <= +P(b).w / 2 + 80; };
    const meets = (a, b) => Math.abs(H(a) - H(b)) < 5 && (ends(a).some(p => over(p, b)) || ends(b).some(p => over(p, a)));
    const out = new Set(start), q = [...start]; while (q.length) { const id = q.shift(), a = cv.find(n => n.id === id); if (!a) continue; for (const b of cv) if (!out.has(b.id) && meets(a, b)) { out.add(b.id); q.push(b.id); } }
    return out; }
  function raiseSel(dz) { if (!sel || mode === 'run' || xray || tab !== 'machine') return; const doc = ED.machine.doc, picked = selIds(), ids = [...joinedConveyors(doc, picked.filter(id => { const d = nodeDef(doc.nodes.find(n => n.id === id)); return d?.conveyor || d?.corner || d?.curve; }))].filter(id => !picked.includes(id)).concat(picked), set = new Set(ids); let msg = '';
    if (ids.length > picked.length) msg = `이어진 컨베이어 ${ids.length - picked.length}개도 같은 높이로 같이 움직였습니다`;
    ed().batch('height', () => { for (const id of ids) { const n = ED.machine.doc.nodes.find(x => x.id === id), d = n && nodeDef(n); if (!n || (n.parent && set.has(n.parent))) continue;
      if (d.heightKey && !n.parent) { const cur = +(n.params[d.heightKey] ?? d.params[d.heightKey]); setParamKeepKids(id, d.heightKey, Math.max(100, cur + dz)); }
      else if (n.parent) msg = '받침 위에 붙은 블록은 받침 높이를 따라갑니다. 받침(컨베이어·프레임·단상)을 골라 높이를 바꾸세요';
      else msg = `${d.name}은(는) 바닥에 서는 블록입니다. 단상·프레임 위로 옮기면 그 높이에 올라갑니다`; } });
    if (msg) toast(msg); }
  function turnSel(deg) { if (!sel || mode === 'run' || xray) return; const doc = ed().doc, norm = a => ((Math.round(a) % 360) + 360) % 360;
    const ids = selIds().filter(x => !isSlab(x));
    if (ids.length > 1) { // turn the whole selection about its centre
      const posOf = id => { if (tab === 'factory') { const it = factoryItems(doc).find(x => x.id === id); const x = it.item; return x.transform ? x.transform.position : [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2, 0]; } return doc.nodes.find(x => x.id === id).transform.position; };
      let all = ids; if (tab === 'machine') { const set = new Set(ids); const walk = pid => { for (const k of doc.nodes.filter(x => x.parent === pid)) { if (!set.has(k.id)) { set.add(k.id); } walk(k.id); } }; ids.forEach(walk); all = [...set]; }
      const ps = all.map(posOf), cx = ps.reduce((a, p) => a + p[0], 0) / ps.length, cy = ps.reduce((a, p) => a + p[1], 0) / ps.length, r = deg * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
      const snapStep = tab === 'factory' ? 10 : 5;
      ed().batch(`turn ${ids.length}`, () => all.forEach((id, i) => { const p = ps[i], dx = p[0] - cx, dy = p[1] - cy, np = [S.snap(cx + dx * c - dy * sn, snapStep), S.snap(cy + dx * sn + dy * c, snapStep), p[2] || 0];
        if (tab === 'factory') { const it = factoryItems(doc).find(x => x.id === id), yaw = it.item.transform ? it.item.transform.rotation[2] : (it.item.params?.yaw ?? Math.round(Math.atan2(it.item.to[1] - it.item.from[1], it.item.to[0] - it.item.from[0]) * 180 / Math.PI)); exec('move', { id, position: [np[0], np[1]], yaw: norm(yaw + deg) }, true); }
        else { const n = doc.nodes.find(x => x.id === id); exec('move', { id, position: np, rotation: [0, 0, norm(n.transform.rotation[2] + deg)] }, true); } }));
      return; }
    if (tab === 'factory') { const it = factoryItems(doc).find(x => x.id === sel); if (!it) return; const yaw = it.item.transform ? it.item.transform.rotation[2] : (it.item.params?.yaw || 0); exec('move', { id: sel, yaw: norm(yaw + deg) }); }
    else { const n = doc.nodes.find(x => x.id === sel); if (n) exec('move', { id: sel, rotation: [0, 0, norm(n.transform.rotation[2] + deg)] }); } }
  // 입구 / 출구: automatic (first → last conveyor of the chain) unless one is picked
  const portSelect = which => { const doc = ED.machine.doc, cur = doc.card[which] || '', c = SCN.portCandidates(doc), P = SCN.portsOf(doc), auto = P[which];
    const autoLabel = auto && auto.key ? (c.find(x => x.key === auto.key)?.label || '') : '외곽 ' + (which === 'inlet' ? '−X 면' : '+X 면');
    return `<select data-k="card.${which}"><option value=""${cur ? '' : ' selected'}>자동 · ${esc(autoLabel)}</option>${c.map(x => `<option value="${esc(x.key)}"${x.key === cur ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`; };
  const num = (key, label, unit, step) => ({ key, label, type: 'num', unit, step });
  $('props').addEventListener('change', e => {
    if ('tstep' in e.target.dataset || 'tang' in e.target.dataset) { const v = Math.abs(+e.target.value); if (v > 0) TELE[tab]['tstep' in e.target.dataset ? 'step' : 'ang'] = Math.min('tang' in e.target.dataset ? 180 : 100000, v); drawProps(); return; }
    const k = e.target.dataset.k; if (!k || !sel && !k.startsWith('meta.') && !k.startsWith('card.')) return;
    const raw = e.target.value, v = e.target.type === 'number' ? (raw === '' ? null : +raw) : raw, doc = ed().doc;
    if (k === 'meta.name') { exec('set_meta', { name: raw || (tab === 'factory' ? '공장' : '설비') }); return; }
    if (k === 'flow.via') { exec('set_flow', { id: sel, via: raw }); return; } if (k === 'flow.ratio') { exec('set_flow', { id: sel, ratio: Math.max(0, Math.min(1, +raw)) }); return; }
    if (k.startsWith('card.')) { const ck = k.slice(5); exec('set_card', { [ck]: ck === 'inlet' || ck === 'outlet' ? (raw || null) : v }); return; }
    if (k === 'slab.w' || k === 'slab.d') { const r = slabRect(doc), w = k === 'slab.w' ? v * 1000 : r.x1 - r.x0, d = k === 'slab.d' ? v * 1000 : r.y1 - r.y0; if (w > 0 && d > 0) exec('set_slab', { polygon: [[r.x0, r.y0], [r.x0 + w, r.y0], [r.x0 + w, r.y0 + d], [r.x0, r.y0 + d]] }); return; }
    if (k === 'name') { exec('rename', { id: sel, name: raw }); return; }
    if (k === 'wall.length') { const w = doc.building.walls.find(x => x.id === sel); if (!w || !(v > 0)) return; const cx = (w.from[0] + w.to[0]) / 2, cy = (w.from[1] + w.to[1]) / 2, a = Math.atan2(w.to[1] - w.from[1], w.to[0] - w.from[0]), h = v * 500;
      const nid = exec('draw_wall', { from: [cx - Math.cos(a) * h, cy - Math.sin(a) * h], to: [cx + Math.cos(a) * h, cy + Math.sin(a) * h], thickness: w.thickness, height: w.height }); if (nid) { exec('delete', { id: sel }); select(nid); } return; }
    if (k.startsWith('pos.')) { const n = doc.nodes.find(x => x.id === sel); if (!n) return; const p = [...n.transform.position]; p[+k.slice(4)] = v ?? 0; exec('move', { id: sel, position: p }); return; }
    if (k.startsWith('p.')) { if (tab === 'machine') setParamKeepKids(sel, k.slice(2), v); else exec('set_param', { id: sel, key: k.slice(2), value: v }); }
  });
  $('props').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const D = b.dataset;
    if (D.act === 'rot') rotateSel(); else if (D.act === 'del') deleteSel(); else if (D.act === 'dup') dupSel(); else if (D.act === 'editLocal') editLocal(); else if (D.act === 'example') loadExample();
    else if (D.mv) nudge(D.mv, e.shiftKey); else if (D.rot) turnSel(+D.rot * TELE[tab].ang); else if (D.z) raiseSel(+D.z * TELE.machine.step * (e.shiftKey ? 5 : 1));
    else if (D.preset) { TELE[tab].step = +D.preset; drawProps(); } });

  function rotateSel() { turnSel(90); }
  function deleteSel() { if (!sel || mode === 'run' || xray) return; if (isSlab(sel)) { toast('바닥 슬래브는 지울 수 없습니다. 크기를 바꿔 주세요'); return; }
    const ids = selIds(); ed().batch(ids.length > 1 ? `delete ${ids.length}` : 'delete', () => { for (const id of ids) if (tab === 'factory' ? factoryItems(ed().doc).some(x => x.id === id) || ed().doc.flows.some(x => x.id === id) : ed().doc.nodes.some(x => x.id === id)) exec('delete', { id }, true); });
    if (ids.length > 1) toast(`${ids.length}개 삭제 · Ctrl+Z로 되돌립니다`); select(null); }
  function dupSel() { if (!sel || tab !== 'factory' || isSlab(sel)) return; const ids = selIds(), out = [];
    ed().batch(ids.length > 1 ? `duplicate ${ids.length}` : 'duplicate', () => { for (const id of ids) { const src = factoryItems(ed().doc).find(x => x.id === id), nid = exec('duplicate', { id }, true); if (nid) { out.push(nid); if (src) exec('rename', { id: nid, name: nextName(ed().doc, (src.item.name || itemName(src)).replace(/ \d+$/, '')) }, true); } } }); selectMany(out); }
  function selectAll() { const doc = ed().doc; selectMany(tab === 'factory' ? factoryItems(doc).map(x => x.id) : doc.nodes.filter(n => !n.parent).map(n => n.id)); }

  /* ------------------------------------------------------------------ signals table and run mode (machine) */
  const RUN = { t: 0, v: {}, tags: {}, procs: {}, works: {}, last: 0 };
  function resetRun() {
    const doc = ED.machine.doc; RUN.t = 0; RUN.v = {}; RUN.tags = {}; RUN.procs = {}; RUN.works = {};
    for (const j of doc.joints) RUN.v[j.id] = j.home ?? j.min;
    for (const t of doc.io) RUN.tags[t.tag] = t.type === 'bool' ? false : 0;
    for (const n of doc.nodes) { const d = nodeDef(n); if (d && d.work) RUN.works[n.id] = { p: [n.transform.position[0], n.transform.position[1]] }; }
  }
  const fmtVal = (t, v) => t.type === 'bool' ? (v ? '켜짐' : '꺼짐') : (+v).toFixed(t.type === 'int' ? 0 : 1);
  // plain meaning of a signal from its suffix (PLC view: 명령 = PLC → 설비, 상태 = 설비 → PLC)
  const MEAN = { RUN: '운전', DIR: '역방향', SPEED: '속도 지정 (mm/s)', FAULT: '이상', UP: '올리기', IS_UP: '올라감', IS_DOWN: '내려감', ON: '감지됨 / 켜기', EXT: '전진', IS_EXT: '전진 끝', IS_RET: '후진 끝',
    CLOSE: '잡기', IS_CLOSED: '잡음', IS_OPEN: '벌림', OK: '양품 / 정상', NG: '불량', START: '시작', BUSY: '작업 중', DONE: '완료', READY: '준비됨', TRIG: '촬영', SERVO_ON: '서보 켜기', POS: '위치 지정 (mm)',
    INPOS: '위치 도착', ALARM: '알람', INDEX: '회전 각도 지정 (°)', PROG: '프로그램 번호', START_PB: '시작 버튼', STOP_PB: '정지 버튼', ESTOP: '비상정지 버튼', RED: '빨간 램프', YEL: '노란 램프', GRN: '초록 램프', NEXT: '다음 트레이', EMPTY: '비었음' };
  const meaning = (t, P) => { const k = t.tag.slice(P.length + 1); return MEAN[k] || (k === 'ON' && t.dir === 'in' ? '감지됨' : k); };
  function drawIo() {
    const doc = ED.machine.doc, selP = sel && nodeCode(doc.nodes.find(n => n.id === sel) || { params: {} });
    $('ioN').textContent = `신호 ${doc.io.length}개`;
    const owner = t => doc.nodes.find(n => t.tag.startsWith(nodeCode(n) + '_'));
    $('io').innerHTML = doc.io.map(t => { const n = owner(t), P = n ? nodeCode(n) : '', v = RUN.tags[t.tag], manual = mode === 'run' && (t.dir === 'out' || !t.binding);
      const kind = t.dir === 'out' ? '명령' : t.binding ? '상태 (자동)' : '상태 (직접 켜기)';
      return `<tr class="${selP && P === selP ? 'hl' : ''}"><td class="ko">${esc(n ? n.name : '')}</td><td>${esc(t.tag)}</td><td class="ko">${esc(meaning(t, P))}</td><td><span class="kind">${kind}</span></td><td class="val${manual ? ' click' : ''}${v === true ? ' on' : ''}" data-tag="${esc(t.tag)}">${fmtVal(t, v)}</td></tr>`; }).join('')
      || '<tr><td colspan="5" style="color:var(--dim);font-family:var(--sans)">블록을 놓으면 그 블록의 신호가 여기에 생깁니다.</td></tr>';
  }
  function drawLog() { if (tab !== 'machine' || !$('log')) return; const hh = d => d.toTimeString().slice(0, 8); $('log').innerHTML = (mode === 'run' ? '' : '<span>위의 모드에서 "실행"을 누르면 태그를 켜고 끌 수 있습니다.</span>') + logLines.slice(-80).map(l => `<span>${hh(l.t)} <b>${esc(l.txt)}</b></span>`).join(''); $('log').scrollTop = 1e9; }
  $('io').addEventListener('click', e => {
    const td = e.target.closest('td.click'); if (!td) return; const t = ED.machine.doc.io.find(x => x.tag === td.dataset.tag); if (!t) return;
    if (t.type === 'bool') RUN.tags[t.tag] = !RUN.tags[t.tag];
    else { const s = prompt(`${t.tag} 값`, String(RUN.tags[t.tag] ?? 0)); if (s === null || s.trim() === '' || isNaN(+s)) return; RUN.tags[t.tag] = +s; }
    drawIo();
  });
  /* ---- 동작 순서 (sequence): made from the blocks (conveyors run, stoppers hold the work, the sensor sees it arrive,
     each process/robot does its job, the stopper lets it go); 자동 운전 steps through it on the signal table. */
  function genSequence(doc) {
    const io = new Map(doc.io.map(t => [t.tag, t])), out = t => io.get(t)?.dir === 'out';
    const B = doc.nodes.map(n => ({ n, P: nodeCode(n), d: nodeDef(n) })).filter(x => x.d);
    const convs = B.filter(x => (x.d.conveyor || x.d.corner || x.d.curve) && out(`${x.P}_RUN`)), stops = B.filter(x => x.d.stops && out(`${x.P}_UP`)), sens = B.filter(x => x.d.sensor && io.has(`${x.P}_ON`));
    const procs = B.filter(x => !x.d.conveyor).map(x => ({ ...x, go: out(`${x.P}_START`) ? `${x.P}_START` : out(`${x.P}_TRIG`) ? `${x.P}_TRIG` : null, done: io.has(`${x.P}_DONE`) ? `${x.P}_DONE` : io.has(`${x.P}_OK`) ? `${x.P}_OK` : null })).filter(x => x.go && x.done);
    const near = (a, b) => Math.hypot(a.n.transform.position[0] - b.n.transform.position[0], a.n.transform.position[1] - b.n.transform.position[1]);
    const sensor = stops.length && sens.length ? sens.slice().sort((a, b) => near(a, stops[0]) - near(b, stops[0]))[0] : sens[0];
    const steps = []; let k = 0; const S = (name, o = {}) => { const st = Object.assign({ id: `s${++k}`, name, wait: [], set: [] }, o); steps.push(st); return st; };
    const up = v => stops.map(x => ({ tag: `${x.P}_UP`, value: v }));
    S('준비 · 컨베이어 운전, 스토퍼 올림', { set: [...convs.map(x => ({ tag: `${x.P}_RUN`, value: true })), ...up(true)] });
    const arrive = sensor ? S(`워크 도착 대기 (${sensor.P})`, { wait: [{ tag: `${sensor.P}_ON`, op: '==', value: true }], delay: 0.3 }) : S('워크 도착 (센서 없음 · 시간으로)', { delay: 3 });
    for (const p of procs) { S(`${p.P} 작업 시작`, { set: [{ tag: p.go, value: true }] }); S(`${p.P} 완료 대기`, { wait: [{ tag: p.done, op: '==', value: true }], set: [{ tag: p.go, value: false }] }); }
    if (!procs.length) S('공정 (카드 사이클)', { delay: +doc.card.cycle_time || 5 });
    if (stops.length) { S('배출 · 스토퍼 내림', { set: up(false) }); S('워크 빠짐 대기 · 스토퍼 올림', sensor ? { wait: [{ tag: `${sensor.P}_ON`, op: '==', value: false }], set: up(true), delay: 0.5 } : { delay: 3, set: up(true) }); }
    steps[steps.length - 1].next = [arrive.id]; return steps; }
  const AUTO = { on: false, i: 0, phase: 'wait', t: 0, waited: 0 };
  const cmp = (v, op, x) => { v = typeof x === 'boolean' ? !!v : +v; return op === '!=' ? v !== x : op === '>' ? v > x : op === '<' ? v < x : op === '>=' ? v >= x : op === '<=' ? v <= x : v === x; };
  const valTxt = (tag, v) => typeof v === 'boolean' ? (v ? '켜짐' : '꺼짐') : String(v);
  function stepAuto(dt) { const steps = ED.machine.doc.sequence.steps; if (!AUTO.on || !steps.length) return;
    for (let g = 0; g < 12; g++) { const st = steps[AUTO.i]; if (!st) { AUTO.i = 0; continue; }
      if (AUTO.phase === 'wait') { if (!st.wait.every(w => cmp(RUN.tags[w.tag], w.op || '==', w.value))) { AUTO.waited += dt;
          if (/^워크 빠짐/.test(st.name || '') && AUTO.waited > 4 && !AUTO.warned) { AUTO.warned = true; log('워크가 컨베이어 끝(출구)에 섰습니다. 공장에서는 다음 설비가 가져갑니다 · ↺ 워크로 다시 투입하세요'); }
          if (AUTO.waited > 20 && !AUTO.warned) { AUTO.warned = true; log(`${st.name}: 20초째 조건을 기다립니다 (${st.wait.map(w => `${w.tag} ${valTxt(w.tag, w.value)}`).join(', ')})`); } return; }
        for (const x of st.set) RUN.tags[x.tag] = x.value; log(`▶ ${st.name}`); AUTO.phase = 'delay'; AUTO.t = 0; AUTO.waited = 0; AUTO.warned = false; }
      AUTO.t += dt; dt = 0; if (AUTO.t < (st.delay || 0)) return;
      const nx = st.next?.[0]; AUTO.i = nx ? Math.max(0, steps.findIndex(q => q.id === nx)) : (AUTO.i + 1) % steps.length; AUTO.phase = 'wait'; drawSeq(); } }
  function setAuto(on) { if (on && mode !== 'run') return; const doc = ED.machine.doc;
    if (on && !doc.sequence.steps.length) { const r = exec('set_sequence', { steps: genSequence(doc) }, true); if (r === undefined && !ED.machine.doc.sequence.steps.length) return; log('동작 순서를 블록에서 자동으로 만들었습니다'); }
    if (on && !doc.nodes.some(n => nodeDef(n)?.work)) toast('워크 블록이 없어 센서가 켜지지 않습니다 · 편집에서 컨베이어 위에 워크를 놓아 주세요');
    AUTO.on = on; AUTO.i = 0; AUTO.phase = 'wait'; AUTO.t = 0; AUTO.waited = 0; $('bAuto').textContent = on ? '■ 자동 운전 멈춤' : '▶ 자동 운전'; $('bAuto').classList.toggle('pri', on); if (on) log('자동 운전 시작 · 동작 순서를 차례로 실행합니다'); drawSeq(); drawIo(); }
  // the list; a click on a step opens it for editing (조건 · 동작 · 시간 · 다음 단계), every change is one set_sequence
  AUTO.open = -1;
  const seqCopy = () => JSON.parse(JSON.stringify(ED.machine.doc.sequence.steps));
  const saveSeq = steps => { exec('set_sequence', { steps }, true); drawSeq(); };
  function valSel(t, v, kind) { if (!t || t.type === 'bool') return `<select data-f="value">${(kind === 'set' ? [[true, '켜기'], [false, '끄기']] : [[true, '켜짐'], [false, '꺼짐']]).map(([x, l]) => `<option value="${x}"${v === x ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<input data-f="value" type="number" step="any" value="${+v || 0}">`; }
  const tagMean = t => { const n = ED.machine.doc.nodes.find(q => t.tag.startsWith(nodeCode(q) + '_')); return meaning(t, n ? nodeCode(n) : ''); };
  function tagSel(cur, outsOnly) { const doc = ED.machine.doc; return `<select data-f="tag">${doc.io.filter(t => !outsOnly || t.dir === 'out').map(t => `<option value="${esc(t.tag)}"${t.tag === cur ? ' selected' : ''}>${esc(t.tag)} · ${esc(tagMean(t))}</option>`).join('')}</select>`; }
  function drawSeq() { if (!$('seq')) return; const steps = ED.machine.doc.sequence.steps, io = new Map(ED.machine.doc.io.map(t => [t.tag, t])); $('seqN').textContent = steps.length ? `${steps.length}단계` : '';
    const set = x => `${esc(x.tag)} ${x.value === true ? '켜기' : x.value === false ? '끄기' : '= ' + x.value}`;
    const row = (st, i) => {
      const sum = `<small>${[st.wait.length ? '조건 ' + st.wait.map(w => `${esc(w.tag)} ${(w.op || '==') === '==' ? '' : esc(w.op) + ' '}${valTxt(w.tag, w.value)}`).join(', ') + (st.set.length ? ' → ' : '') : '', st.set.map(set).join(', ')].join('')}${[st.delay ? `${st.delay} s 기다림` : '', st.next ? `↩ ${steps.findIndex(q => q.id === st.next[0]) + 1}단계로` : ''].filter(Boolean).map(x => (st.wait.length || st.set.length ? ' · ' : '') + x).join('')}</small>`;
      if (AUTO.open !== i) return `<div class="seqst${AUTO.on && i === AUTO.i ? ' on' : ''}" data-si="${i}" title="눌러서 고치기"><b>${i + 1}</b><div><span>${esc(st.name || st.id)}</span>${sum}</div></div>`;
      const ops = ['==', '!=', '>', '<', '>=', '<='];
      return `<div class="seqst open${AUTO.on && i === AUTO.i ? ' on' : ''}" data-si="${i}"><b>${i + 1}</b><div class="seqed">
        <input data-f="name" value="${esc(st.name || '')}" placeholder="단계 이름">
        <h5>조건 <em>모두 맞으면 다음으로 (없으면 바로)</em></h5>
        ${st.wait.map((w, k) => `<div class="seqline" data-k="wait" data-j="${k}">${tagSel(w.tag)}${io.get(w.tag)?.type === 'bool' ? '' : `<select data-f="op">${ops.map(o => `<option${(w.op || '==') === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`}${valSel(io.get(w.tag), w.value, 'wait')}<button data-x="del">×</button></div>`).join('')}
        <button class="add" data-x="add-wait">+ 조건</button>
        <h5>동작 <em>조건이 맞으면 켜고/끄는 명령</em></h5>
        ${st.set.map((x, k) => `<div class="seqline" data-k="set" data-j="${k}">${tagSel(x.tag, true)}${valSel(io.get(x.tag), x.value, 'set')}<button data-x="del">×</button></div>`).join('')}
        <button class="add" data-x="add-set">+ 동작</button>
        <div class="seqline"><label>그 뒤 기다림</label><input data-f="delay" type="number" min="0" step="0.1" value="${st.delay || 0}"><label>s · 다음</label>
          <select data-f="next"><option value="">${i + 2 <= steps.length ? `${i + 2}단계` : '1단계 (처음)'}</option>${steps.map((q, k) => `<option value="${q.id}"${st.next?.[0] === q.id ? ' selected' : ''}>${k + 1}단계 ${esc(q.name || '')}</option>`).join('')}</select></div>
        <div class="seqbtns"><button data-x="up">↑</button><button data-x="down">↓</button><button data-x="dup">복제</button><button data-x="rm">단계 삭제</button><button data-x="close" class="pri">닫기</button></div></div></div>`; };
    $('seq').innerHTML = steps.map(row).join('') + (steps.length ? '<button class="seqadd" data-x="new">+ 단계 추가</button>' : '<p class="seqempty">아직 동작 순서가 없습니다. "블록으로 만들기"를 누르면 블록(컨베이어·스토퍼·센서·공정)에서 순서를 만들고, 각 단계를 눌러 직접 고칠 수 있습니다. <button class="seqadd" data-x="new">+ 빈 단계부터</button></p>'); }
  $('seq').addEventListener('click', e => { const st = e.target.closest('[data-si]'), x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'new') { const steps = seqCopy(); let n = steps.length + 1; while (steps.some(q => q.id === `s${n}`)) n++; steps.push({ id: `s${n}`, name: `${steps.length + 1}단계`, wait: [], set: [] }); AUTO.open = steps.length - 1; saveSeq(steps); return; }
    if (!st) return; const i = +st.dataset.si;
    if (!x) { if (AUTO.open !== i) { AUTO.open = i; drawSeq(); } return; }
    const steps = seqCopy(), s0 = steps[i], line = e.target.closest('.seqline'), io = ED.machine.doc.io;
    if (x === 'close') { AUTO.open = -1; drawSeq(); return; }
    if (x === 'add-wait') { const t = io.find(q => q.dir === 'in') || io[0]; if (!t) return toast('신호가 없습니다'); s0.wait.push({ tag: t.tag, op: '==', value: t.type === 'bool' ? true : 0 }); }
    else if (x === 'add-set') { const t = io.find(q => q.dir === 'out'); if (!t) return toast('켜고 끌 명령 신호가 없습니다'); s0.set.push({ tag: t.tag, value: t.type === 'bool' ? true : 0 }); }
    else if (x === 'del' && line) s0[line.dataset.k].splice(+line.dataset.j, 1);
    else if (x === 'up' && i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; AUTO.open = i - 1; }
    else if (x === 'down' && i < steps.length - 1) { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; AUTO.open = i + 1; }
    else if (x === 'dup') { let n = steps.length + 1; while (steps.some(q => q.id === `s${n}`)) n++; steps.splice(i + 1, 0, Object.assign(JSON.parse(JSON.stringify(s0)), { id: `s${n}`, next: undefined })); AUTO.open = i + 1; }
    else if (x === 'rm') { steps.splice(i, 1); for (const q of steps) if (q.next && q.next[0] === s0.id) delete q.next; AUTO.open = -1; if (AUTO.i >= steps.length) AUTO.i = 0; }
    else return;
    saveSeq(steps); });
  $('seq').addEventListener('change', e => { const st = e.target.closest('[data-si]'), f = e.target.dataset.f; if (!st || !f) return; const steps = seqCopy(), s0 = steps[+st.dataset.si], line = e.target.closest('.seqline[data-k]'), v = e.target.value;
    const io = new Map(ED.machine.doc.io.map(t => [t.tag, t]));
    if (line) { const it = s0[line.dataset.k][+line.dataset.j];
      if (f === 'tag') { it.tag = v; const t = io.get(v); it.value = t?.type === 'bool' ? true : 0; if (line.dataset.k === 'wait') it.op = '=='; }
      else if (f === 'op') it.op = v; else if (f === 'value') it.value = v === 'true' ? true : v === 'false' ? false : +v; }
    else if (f === 'name') s0.name = v; else if (f === 'delay') { const d = Math.max(0, +v || 0); if (d) s0.delay = d; else delete s0.delay; }
    else if (f === 'next') { if (v) s0.next = [v]; else delete s0.next; }
    saveSeq(steps); });
  $('seq').addEventListener('keydown', e => e.stopPropagation());
  $('bAuto').onclick = () => setAuto(!AUTO.on);
  $('bSeqGen').onclick = () => { const doc = ED.machine.doc; if (doc.sequence.steps.length && !confirm('지금 동작 순서를 지우고 블록에서 다시 만들까요? (실행 취소로 되돌릴 수 있습니다)')) return; AUTO.open = -1; exec('set_sequence', { steps: genSequence(doc) }); AUTO.i = 0; AUTO.phase = 'wait'; drawSeq(); if (ED.machine.doc.sequence.steps.length) toast('동작 순서를 블록에서 만들었습니다'); };
  $('bWorkBack').onclick = () => { const doc = ED.machine.doc; for (const n of doc.nodes) if (nodeDef(n)?.work) RUN.works[n.id] = { p: [n.transform.position[0], n.transform.position[1]] }; log('워크를 처음 위치로 되돌렸습니다'); };
  // the panel under the view: drag its top edge to make it taller or shorter; the 3D view takes the rest
  (() => { const b = $('bottom'), g = $('bGrip'); let h0 = LS.get('one.build.bottomH', 260), drag = null;
    const apply = h => { h0 = Math.max(120, Math.min(innerHeight * 0.7, h)); b.style.height = h0 + 'px'; stage.resize(); };
    b.style.height = h0 + 'px';
    g.addEventListener('pointerdown', e => { if (b.classList.contains('fold')) { $('bFold').click(); return; } drag = { y: e.clientY, h: b.getBoundingClientRect().height }; g.setPointerCapture(e.pointerId); e.preventDefault(); });
    g.addEventListener('pointermove', e => { if (drag) apply(drag.h - (e.clientY - drag.y)); });
    g.addEventListener('pointerup', () => { if (drag) { drag = null; LS.set('one.build.bottomH', h0); } });
    g.addEventListener('dblclick', () => $('bFold').click()); })();
  $('bFold').onclick = () => { const b = $('bottom'); b.classList.toggle('fold'); b.style.height = b.classList.contains('fold') ? '' : LS.get('one.build.bottomH', 260) + 'px'; $('bFold').textContent = b.classList.contains('fold') ? '▴ 펼치기' : '▾ 접기'; setTimeout(stage.resize, 0); };

  function stepRun(dt) {
    const doc = ED.machine.doc, tags = RUN.tags, byNode = new Map(doc.nodes.map(n => [n.id, n]));
    RUN.t += dt;
    for (const j of doc.joints) {
      const t = doc.io.find(x => x.dir === 'out' && x.binding?.kind === 'joint' && x.binding.target === j.id); let v = RUN.v[j.id] ?? j.min;
      if (j.mode === 'continuous') { const P = j.id.replace(/_[A-Z0-9]+$/, ''); const sp = tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : j.vmax; RUN.v[j.id] = v + (t && tags[t.tag] ? (tags[`${P}_DIR`] ? -1 : 1) * sp * dt : 0); continue; }
      const target = !t ? v : j.mode === 'onoff' ? (tags[t.tag] ? j.max : j.min) : Math.min(j.max, Math.max(j.min, +tags[t.tag] || 0));
      const step = j.vmax * dt; v = Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step; RUN.v[j.id] = v; RUN.v[j.id + ':target'] = target;
    }
    // works ride on running conveyors and stop at raised stoppers
    const convs = doc.nodes.filter(n => nodeDef(n)?.conveyor), stops = doc.nodes.filter(n => nodeDef(n)?.stops), corners = doc.nodes.filter(n => nodeDef(n)?.corner);
    const curves = doc.nodes.filter(n => nodeDef(n)?.curve).map(n => ({ n, g: L.curveGeom(n) }));
    const onCurve = (p, top, tol = 1) => { for (const c of curves) { if (Math.abs(c.g.top - top) > 60) continue; const l = c.g.locate(p); if (l && Math.abs(l.off) <= c.g.W / 2 + tol) return { c, l }; } return null; };
    const cframe = c => { const q = c.transform.position, r = c.transform.rotation[2] * Math.PI / 180; return { q, a: [Math.cos(r), Math.sin(r)], nrm: [-Math.sin(r), Math.cos(r)], wh: (c.params.w || 500) / 2, top: q[2] + (c.params.h || 900) }; };
    const inCorner = (p, top) => corners.find(c => { const f = cframe(c); if (Math.abs(f.top - top) > 60) return false; const dx = p[0] - f.q[0], dy = p[1] - f.q[1]; return Math.abs(dx * f.a[0] + dy * f.a[1]) <= f.wh + 1 && Math.abs(dx * f.nrm[0] + dy * f.nrm[1]) <= f.wh + 1; });
    // works ride conveyors along each conveyor's own direction; at an end they pass onto a conveyor that continues
    // (straight or at 90°), otherwise they stop at the end; a raised stopper on the way holds them
    const frame = c => { const q = c.transform.position, r = c.transform.rotation[2] * Math.PI / 180; return { q, a: [Math.cos(r), Math.sin(r)], nrm: [-Math.sin(r), Math.cos(r)], Lh: (c.params.length || 3000) / 2, wh: (c.params.w || 500) / 2, top: q[2] + (c.params.h || 900) }; };
    const loc = (f, p) => [(p[0] - f.q[0]) * f.a[0] + (p[1] - f.q[1]) * f.a[1], (p[0] - f.q[0]) * f.nrm[0] + (p[1] - f.q[1]) * f.nrm[1]];
    for (const n of doc.nodes) { const w = RUN.works[n.id]; if (!w) continue; const z = n.transform.position[2], hw = (n.params.w || 300) / 2; let best = null;
      // on a curve: ride along the arc at its centre line; at the exit, onto whatever continues
      const oc = onCurve(w.p, z); if (oc) { const { c, l } = oc, P = nodeCode(c.n); if (!tags[`${P}_RUN`]) continue; const sp = (tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : c.n.params.speed || 300) * (tags[`${P}_DIR`] ? -1 : 1);
        let u = l.u + sp * dt / c.g.len; if (u > 1 || u < 0) { const e = u > 1 ? 1 : 0, ep = c.g.point(e), hd = c.g.heading(e).map(v => v * Math.sign(sp)), probe = [ep[0] + hd[0] * 5, ep[1] + hd[1] * 5];
          const next = !!inCorner(probe, c.g.top) || curves.some(o => o !== c && Math.abs(o.g.top - c.g.top) < 5 && o.g.locate(probe)) || convs.some(o => { const g = frame(o); if (Math.abs(g.top - c.g.top) > 5) return false; const [ex, ey] = loc(g, probe); return Math.abs(ey) <= g.wh + 60 && ex >= -g.Lh - g.wh - 60 && ex <= g.Lh; });
          w.p = next ? [ep[0] + hd[0] * (Math.abs(u - e) * c.g.len + 6), ep[1] + hd[1] * (Math.abs(u - e) * c.g.len + 6)] : ep; continue; }
        w.p = c.g.point(u); continue; }
      // on a turn module: ride to its centre first; from the centre the conveyor at its side takes the work
      const cn = inCorner(w.p, z); if (!cn) delete w.centred; else if (w.centred !== cn.id) { const q = cn.transform.position, dx = q[0] - w.p[0], dy = q[1] - w.p[1], dd = Math.hypot(dx, dy);
        if (dd > 2) { if (!tags[`${nodeCode(cn)}_RUN`]) continue; const st = Math.min(dd, (cn.params.speed || 300) * dt); w.p = [w.p[0] + dx / dd * st, w.p[1] + dy / dd * st]; continue; } w.centred = cn.id; }
      for (const c of convs) { const f = frame(c); if (Math.abs(z - f.top) > 60) continue; const [lx, ly] = loc(f, w.p); if (Math.abs(ly) > f.wh || lx < -f.Lh - f.wh - 1 || lx > f.Lh + 1) continue;
        const P = nodeCode(c); if (!tags[`${P}_RUN`]) continue; const dir = tags[`${P}_DIR`] ? -1 : 1, sp = (tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : c.params.speed || 300) * dir * dt;
        let nx = lx + sp;
        for (const s0 of stops) { if (!(RUN.v[`${nodeCode(s0)}_Z`] > 5)) continue; const [sx, sy] = loc(f, s0.transform.position); if (Math.abs(sy) > f.wh) continue;
          if (sp > 0 && lx + hw <= sx + 1 && nx + hw > sx) nx = sx - hw; if (sp < 0 && lx - hw >= sx - 1 && nx - hw < sx) nx = sx + hw; }
        const endP = [f.q[0] + f.a[0] * (Math.sign(sp) * f.Lh), f.q[1] + f.a[1] * (Math.sign(sp) * f.Lh)];
        const handover = !!inCorner(endP, f.top) || !!onCurve(endP, f.top, 60) || convs.some(o => { if (o === c) return false; const g = frame(o); if (Math.abs(g.top - f.top) > 5) return false; const [ex, ey] = loc(g, endP); return Math.abs(ey) <= g.wh + 60 && ex >= -g.Lh - g.wh - 60 && ex <= g.Lh; });
        if (!handover) nx = Math.max(-f.Lh + hw, Math.min(f.Lh - hw, nx));
        const adv = Math.abs(nx - lx); if (!best || adv > best.adv) best = { adv, p: [w.p[0] + f.a[0] * (nx - lx), w.p[1] + f.a[1] * (nx - lx)] }; }
      if (best) w.p = best.p; }
    // sensors, processes, robots
    for (const t of doc.io) {
      if (t.dir !== 'in' || !t.binding) continue; const b = t.binding;
      if (b.kind === 'sensor' && b.target === 'work') { const sn = doc.nodes.find(n => t.tag.startsWith(nodeCode(n) + '_')); if (!sn) continue; const sp = sn.transform.position, range = sn.params.range || 500;
        tags[t.tag] = doc.nodes.some(n => { const w = RUN.works[n.id]; if (!w) return false; const p = n.transform.position, hw = (n.params.w || 300) / 2; const pc = convs.find(c => c.id === sn.parent), f = pc ? frame(pc) : { q: [0, 0], a: [1, 0], nrm: [0, 1] }, [sx, sy] = loc(f, sp), [wx, wy] = loc(f, w.p);
          return Math.abs(wx - sx) <= hw + 25 && Math.abs(wy - sy) < range + (n.params.d || 200) / 2; }); }
      else if (b.kind === 'sensor') { const [jid, end] = b.target.split(':'), j = doc.joints.find(x => x.id === jid); if (!j) continue; const v = RUN.v[jid];
        tags[t.tag] = end === 'max' ? Math.abs(v - j.max) < 0.5 : end === 'min' ? Math.abs(v - j.min) < 0.5 : Math.abs(v - (RUN.v[jid + ':target'] ?? v)) < 0.5; }
    }
    for (const n of doc.nodes) { const P = nodeCode(n), d = nodeDef(n); if (!d) continue; const start = doc.io.find(t => t.tag === `${P}_START` || t.tag === `${P}_TRIG` || t.tag === `${P}_ON` && t.dir === 'out' || (t.tag === `${P}_RUN` || t.tag === `${P}_NEXT`) && !d.conveyor); if (!start) continue;
      const pr = RUN.procs[P] || (RUN.procs[P] = { busy: false, t0: 0, prev: false }), on = !!tags[start.tag], cyc = Math.max(0.2, +(n.params.cycle || d.params.cycle || (start.tag.endsWith('_TRIG') ? 0.5 : 1)));
      if (on && !pr.prev) { pr.busy = true; pr.t0 = RUN.t; tags[`${P}_DONE`] = false; }
      if (!on) { pr.busy = false; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; }
      if (pr.busy && RUN.t - pr.t0 >= cyc) { pr.busy = false; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = true; const ok = Math.random() < (n.params.ok_rate ?? 1); if (`${P}_OK` in tags) tags[`${P}_OK`] = ok; if (`${P}_NG` in tags) tags[`${P}_NG`] = !ok; if (`${P}_READY` in tags) tags[`${P}_READY`] = true; }
      if (`${P}_BUSY` in tags) tags[`${P}_BUSY`] = pr.busy; if (start.tag === `${P}_ON` && `${P}_OK` in tags) tags[`${P}_OK`] = on;
      pr.run = pr.busy ? (RUN.t - pr.t0) / cyc : 0; pr.prev = on; }
    // pose
    for (const n of doc.nodes) { const o = objs.get(n.id)?.obj, d = nodeDef(n); if (!o || !d) continue; const P = nodeCode(n), vals = {};
      for (const j of doc.joints) if (j.node === n.id) vals[j.id.slice(P.length + 1)] = RUN.v[j.id];
      vals.RUN = RUN.procs[P]?.run || 0;
      if (d.pose) d.pose(o, Object.assign({}, d.params, n.params), vals, tg => !!tags[tg], P);
      if (RUN.works[n.id]) placeObj(o, [RUN.works[n.id].p[0], RUN.works[n.id].p[1], n.transform.position[2]], n.transform.rotation[2]); }
  }
  function setMode(m) {
    if (tab !== 'machine') m = 'edit'; mode = m; if (AUTO.on) setAuto(false); document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'run') { resetRun(); log('동작 시험 시작 · 명령 값을 눌러 켜고 끄거나 ▶ 자동 운전을 누릅니다');
      // tall blocks that never move (cabinets, panels, guards) turn see-through so the work and stoppers stay in view
      for (const n of ED.machine.doc.nodes) { const d = nodeDef(n), o = objs.get(n.id)?.obj; if (!d || !o || runState(n) || d.cat !== 'structure') continue;
        o.traverse(x => { if (x.isMesh) { x.material = x.material.clone(); x.material.transparent = true; x.material.opacity = 0.18; x.material.depthWrite = false; } }); } }
    else { for (const v of objs.values()) root.remove(v.obj); objs = new Map(); syncScene(); }
    portGrp.visible = m !== 'run'; $('bottom').hidden = !(tab === 'machine' && m === 'run'); setTimeout(stage.resize, 0); drawIo(); drawSeq(); updateHint();
  }
  $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });

  /* ------------------------------------------------------------------ picking and dragging */
  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
  let drag = null;
  const setNdc = e => { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  function pickExact() { const hits = ray.intersectObjects(root.children, true).filter(h => h.object.visible && !h.object.isPoints);
    for (const h of hits) { const id = h.object.userData.pick; if (!id) continue; const o = objs.get(id)?.obj; if (tab === 'factory' && o && o.userData.roof && hits.some(x => x.object.userData.pick && x.object.userData.pick !== id)) continue; return id; } return null; }
  // thin things (an extinguisher, a sensor, a stopper) are a few pixels wide on screen: a click near them counts
  const pc = new T.Vector3();
  function pickNear(e) { const r = renderer.domElement.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let best = null, bestA = Infinity;
    for (const [id, v] of objs) { tmpBox.setFromObject(v.obj); if (tmpBox.isEmpty()) continue; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) { pc.set(i & 1 ? tmpBox.max.x : tmpBox.min.x, i & 2 ? tmpBox.max.y : tmpBox.min.y, i & 4 ? tmpBox.max.z : tmpBox.min.z).project(camera);
        const sx = (pc.x + 1) / 2 * r.width, sy = (1 - pc.y) / 2 * r.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
      const a = (x1 - x0) * (y1 - y0); if (a > 90 * 90) continue; const pad = 12;
      if (mx >= x0 - pad && mx <= x1 + pad && my >= y0 - pad && my <= y1 + pad && a < bestA) { best = id; bestA = a; } }
    return best; }
  function pick1(e) { setNdc(e); const ex = pickExact(), near = pickNear(e); if (!near || near === ex) return ex;
    if (!ex) return near; tmpBox.setFromObject(objs.get(ex).obj); const s = tmpBox.getSize(pc); return s.x * s.z > 1 || s.y < 0.05 ? near : ex; }
  // everything under the cursor, front to back (the slab last)
  function pickAll(e) { setNdc(e); const out = [], first = pick1(e); if (first) out.push(first);
    for (const h of ray.intersectObjects(root.children, true)) { const id = h.object.visible && h.object.userData.pick; if (id && !out.includes(id)) out.push(id); }
    return out.sort((a, b) => (isSlab(a) ? 1 : 0) - (isSlab(b) ? 1 : 0)); }
  // clicking the same spot again steps to the object behind the one already selected
  let lastPick = null;
  function pick(e) { const all = pickAll(e); if (!all.length) { lastPick = null; return null; }
    let id = all[0]; if (lastPick && Math.hypot(e.clientX - lastPick.x, e.clientY - lastPick.y) < 5 && all.includes(sel) && all.length > 1) { id = all[(all.indexOf(sel) + 1) % all.length]; if (id !== all[0]) toast(`뒤에 있는 객체: ${objLabel(id)} · 같은 자리를 다시 누르면 다음`); }
    lastPick = { x: e.clientX, y: e.clientY }; return id; }
  function objLabel(id) { if (tab === 'machine') { const n = ED.machine.doc.nodes.find(x => x.id === id); return n ? `${nodeCode(n)} ${n.name}` : ''; } const it = factoryItems(ED.factory.doc).find(x => x.id === id); return it ? `${itemCode(it) || ''} ${itemName(it)}`.trim() : ''; }

  /* object list (객체 목록): pick anything by name, also what is hard to click */
  function drawObjList() { const q = ($('olQ').value || '').trim().toLowerCase(), rows = [];
    if (tab === 'machine') { const doc = ED.machine.doc, depth = n => { let d = 0; for (let p = n.parent; p && d < 6; p = doc.nodes.find(x => x.id === p)?.parent) d++; return d; };
      const order = []; const walk = pid => { for (const n of doc.nodes.filter(x => (x.parent || null) === pid)) { order.push(n); walk(n.id); } }; walk(null); for (const n of doc.nodes) if (!order.includes(n)) order.push(n);
      for (const n of order) rows.push({ id: n.id, code: nodeCode(n), name: n.name, d: depth(n), g: '' }); }
    else { const G = { 'building.walls': '건물', 'building.columns': '건물', 'building.roofs': '건물', 'building.openings': '건물', 'building.slabs': '건물', markings: '바닥 표시', machines: '설비', storage: '물류·보관', movers: '물류·보관', 'utilities.drops': '전기·공압', blocks: '기타' };
      for (const it of factoryItems(ED.factory.doc)) rows.push({ id: it.id, code: itemCode(it) || '', name: itemName(it), d: 0, g: G[it.path] || '기타' });
      rows.sort((a, b) => a.g.localeCompare(b.g)); }
    const hit = rows.filter(r => !q || `${r.code} ${r.name}`.toLowerCase().includes(q)), sels = new Set(selIds()); let g0 = null, html = '';
    for (const r of hit) { if (r.g && r.g !== g0) { html += `<h4>${esc(r.g)}</h4>`; g0 = r.g; }
      html += `<button data-oid="${r.id}" class="${sels.has(r.id) ? 'on' : ''}" style="padding-left:${10 + r.d * 14}px"><b>${esc(r.code)}</b>${esc(r.name)}</button>`; }
    $('olList').innerHTML = html || '<p>찾는 객체가 없습니다</p>'; }
  function toggleObjList(on = $('objList').hidden) { $('objList').hidden = !on; if (on) { $('olQ').value = ''; drawObjList(); setTimeout(() => $('olQ').focus(), 0); } }
  $('olBtn').onclick = () => toggleObjList();
  $('olQ').addEventListener('input', drawObjList);
  $('olQ').addEventListener('keydown', e => { if (e.key === 'Escape') toggleObjList(false); if (e.key === 'Enter') { const b = $('olList').querySelector('[data-oid]'); if (b) b.click(); } e.stopPropagation(); });
  $('olList').addEventListener('click', e => { const b = e.target.closest('[data-oid]'); if (!b) return; if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSel(b.dataset.oid); else select(b.dataset.oid); drawObjList(); focusSel(); });
  renderer.domElement.addEventListener('pointerdown', e => {
    if (placing) { if (e.button === 0) { trackPlace(e); commitPlace(e.shiftKey); } return; }
    if (e.button === 0 && !xray && tab === 'factory' && mode === 'edit') { const port = pickPort(e); if (port && port.kind === 'outlet' && startLink(e, port)) return; }
    if (e.button !== 0 || xray) return; const id = pick(e); // X-ray is a view-only mode: dragging only turns the view
    if (!id) { if (e.shiftKey && mode === 'edit') { startBox(e); return; } select(null); return; }
    if (e.shiftKey && mode === 'edit') { toggleSel(id); return; }
    const group = selIds().includes(id) && selIds().length > 1; if (!group) select(id); if (mode === 'run' || isSlab(id)) return;
    plane.constant = 0; if (!ray.ray.intersectPlane(plane, hit)) return;
    const ids = group ? selIds().filter(x => !isSlab(x)) : [id], os = ids.map(x => objs.get(x)?.obj).filter(Boolean);
    drag = { id, ids, os, starts: os.map(o => o.position.clone()), grab: hit.clone(), moved: false, sx: e.clientX, sy: e.clientY, armed: false }; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (placing && !drag) { trackPlace(e); return; }
    if (link) { moveLink(e); return; }
    if (!drag) return; if (!drag.armed) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return; drag.armed = true; } setNdc(e); if (!ray.ray.intersectPlane(plane, hit)) return;
    const d = hit.clone().sub(drag.grab); const step = (tab === 'factory' ? (e.altKey ? 10 : 500) : (e.altKey ? 5 : 50)) / 1000;
    d.x = Math.round(d.x / step) * step; d.z = Math.round(d.z / step) * step; if (d.lengthSq() > 0) drag.moved = true;
    if (tab === 'machine' && drag.ids.length === 1) { const n = ED.machine.doc.nodes.find(x => x.id === drag.ids[0]), by = S.sceneToStored([d.x, 0, d.z]), p = n.transform.position, sn = n && conveyorSnap(n, [p[0] + by[0], p[1] + by[1]], new Set());
      showSnap(sn); if (sn) { const s2 = toS([sn.pos[0] - p[0], sn.pos[1] - p[1], 0]); d.x = s2.x; d.z = s2.z; } }
    drag.os.forEach((o, i) => o.position.set(drag.starts[i].x + d.x, drag.starts[i].y, drag.starts[i].z + d.z)); drag.d = d; updateSelMark(); if (tab === 'machine') updateEnvelope();
  });
  const endDrag = e => {
    if (link) { endLink(e); return; }
    if (!drag) return; showSnap(null); const { d, moved } = drag; drag = null; controls.enabled = true; if (!moved || !d) return;
    const by = S.sceneToStored([d.x, 0, d.z]); moveSelBy([by[0], by[1], 0]);
  };
  // Shift + drag on an empty spot: a box; everything whose centre falls inside is selected
  let boxSel = null; const boxEl = document.createElement('div'); boxEl.className = 'boxsel'; boxEl.hidden = true; $('labels').parentElement.appendChild(boxEl);
  function startBox(e) { const r = renderer.domElement.getBoundingClientRect(); boxSel = { x0: e.clientX - r.left, y0: e.clientY - r.top, r }; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); }
  renderer.domElement.addEventListener('pointermove', e => { if (!boxSel) return; const x = e.clientX - boxSel.r.left, y = e.clientY - boxSel.r.top;
    Object.assign(boxSel, { x1: x, y1: y }); boxEl.hidden = false; Object.assign(boxEl.style, { left: Math.min(x, boxSel.x0) + 'px', top: Math.min(y, boxSel.y0) + 'px', width: Math.abs(x - boxSel.x0) + 'px', height: Math.abs(y - boxSel.y0) + 'px' }); });
  renderer.domElement.addEventListener('pointerup', () => { if (!boxSel) return; const b = boxSel; boxSel = null; boxEl.hidden = true; controls.enabled = true; if (b.x1 === undefined) return;
    const [x0, x1] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)], [y0, y1] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)], got = [...selIds()];
    for (const [id, v] of objs) { if (isSlab(id) || (tab === 'machine' && v.data.parent)) continue; tmpBox.setFromObject(v.obj); if (tmpBox.isEmpty()) continue; tmpBox.getCenter(v3).project(camera);
      const sx = (v3.x + 1) / 2 * b.r.width, sy = (1 - v3.y) / 2 * b.r.height; if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && !got.includes(id)) got.push(id); }
    selectMany(got); if (got.length > 1) toast(`${got.length}개 선택 · 끌거나 조작 패드로 한꺼번에 움직입니다`); });
  renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag);

  function toggleSel(id) { if (!id || isSlab(id)) return select(id);
    if (!sel || isSlab(sel)) return select(id);
    if (id === sel) { const rest = selIds().slice(1); multi = new Set(rest.slice(1)); sel = rest[0] || null; }
    else if (multi.has(id)) multi.delete(id); else multi.add(id);
    drawTree(); drawProps(); updateSelMark(); }
  function selectMany(ids) { ids = ids.filter(x => !isSlab(x)); multi = new Set(ids.slice(1)); sel = ids[0] || null; drawTree(); drawProps(); updateSelMark(); if (tab === 'machine') drawIo(); }
  function select(id, focus) { multi = new Set(); sel = id || null; drawTree(); drawProps(); updateSelMark(); if (tab === 'machine') drawIo(); if (focus && sel) focusSel(); }
  function focusSel() { const o = sel && objs.get(sel)?.obj; if (!o) return; tmpBox.setFromObject(o); if (!tmpBox.isEmpty()) stage.fit(tmpBox.clone().expandByScalar(tab === 'factory' ? 2 : 0.4), 1.2); }
  function fitAll() {
    const doc = ed().doc;
    if (tab === 'factory') { const r = slabRect(doc), a = toS([r.x0, r.y0, 0]), b = toS([r.x1, r.y1, 4000]); stage.fit(new T.Box3().setFromPoints([a, b]), 1.05); }
    else { const [W, D, H] = doc.meta.bbox.map(v => v / 1000), box = new T.Box3(new T.Vector3(-W / 2, 0, -D / 2), new T.Vector3(W / 2, H, D / 2)); if (!doc.meta.cellFixed) for (const v of objs.values()) box.expandByObject(v.obj); stage.fit(box, 1.2); }
  }
  $('views').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'fit') fitAll(); else if (b.dataset.v === 'xray') setXray(!xray); else focusSel(); });
  let xray = false;
  const setXray = on => { xray = on; if (on) { if (drag) { drag = null; controls.enabled = true; } select(null); toast('X-RAY는 보기 전용입니다 · 다시 누르면 편집으로 돌아갑니다'); } updateHint(); if (on) stage.addTwin(root, o => !!(o.userData.node && nodeDef(o.userData.node)?.work)); stage.ghost(on); $('xrayChip').classList.toggle('on', on); };

  /* ------------------------------------------------------------------ keys, toolbar, files */
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    // a select (e.g. 종류) keeps focus after a change; only text fields swallow keys
    if (e.target.matches('select') && !mod && (k === 'delete' || k === 'backspace' || k === 'escape')) e.target.blur();
    else if (e.target.matches('input, select, textarea')) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); if (mode === 'edit') ed().undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); if (mode === 'edit') ed().redo(); }
    else if (mod && k === 'd') { e.preventDefault(); dupSel(); }
    else if (mod && k === 's') { e.preventDefault(); save(); }
    else if (mod && k === 'a') { e.preventDefault(); if (mode === 'edit' && !xray) selectAll(); }
    else if (k === 'r' && !mod) { if (placing) { placing.yaw = (placing.yaw + 90) % 360; if (placing.at) placeObj(placing.obj, [placing.at[0], placing.at[1], placing.obj.position.y * 1000], placing.yaw); } else rotateSel(); }
    else if (k === 'delete' || k === 'backspace') deleteSel();
    else if (k.startsWith('arrow') && sel) { e.preventDefault(); nudge(k.slice(5), e.shiftKey); }
    else if (k === 'escape') { if (placing) endPlace(); else select(null); }
    else if (k === 'f') sel ? focusSel() : fitAll();
    else if (k === 'x' && !mod) setXray(!xray);
    else if (k === 'l' && !mod) { e.preventDefault(); toggleObjList(); }
  });
  $('bUndo').onclick = () => mode === 'edit' && ed().undo();
  $('bRedo').onclick = () => mode === 'edit' && ed().redo();
  $('cellSeg').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b || tab !== 'machine') return; const fx = b.dataset.c === 'fixed', doc = ED.machine.doc; if (fx === !!doc.meta.cellFixed) return;
    if (fx) { const c = contentSize(), up = v => Math.ceil(v / 100) * 100; exec('set_meta', { cellFixed: true, bbox: c ? [up(c[0] + 200), up(c[1] + 200), up(c[2] + 100)] : doc.meta.bbox }); toast('작업 칸을 고정했습니다 · 크기를 바꾸면 그 안에 놓입니다'); }
    else exec('set_meta', { cellFixed: false }); fitAll(); });
  for (const id of ['sW', 'sD', 'sH']) $(id).addEventListener('change', () => {
    const doc = ed().doc, w = +$('sW').value, d = +$('sD').value, h = +$('sH').value;
    if (tab === 'factory') { const r = slabRect(doc); if (w > 0 && d > 0) exec('set_slab', { polygon: [[r.x0, r.y0], [r.x0 + w * 1000, r.y0], [r.x0 + w * 1000, r.y0 + d * 1000], [r.x0, r.y0 + d * 1000]] }); }
    else if (doc.meta.cellFixed && w > 0 && d > 0 && h > 0) { exec('set_meta', { bbox: [w, d, h].map(v => Math.round(v / 50) * 50) }); if (outOfCell()) toast('블록이 작업 칸 밖으로 나갑니다 · 빨간 선을 확인하세요', true); }

  });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.t !== tab) switchTab(b.dataset.t); });
  // a machine placed in the factory → Machine Builder, at the version the factory uses
  function editLocal() { const it = sel && factoryItems(ED.factory.doc).find(x => x.id === sel); if (!it?.local) return; const m = lib()[it.local.id]; if (!m) return;
    const v = m.versions[it.local.v] ? it.local.v : Math.max(...Object.keys(m.versions).map(Number)), doc = m.versions[v];
    if (dirty.machine && ED.machine.doc.meta.id !== doc.meta.id && !confirm('Machine Builder에서 저장하지 않은 변경이 있습니다. 버리고 이 설비를 열까요?')) return;
    openDoc('machine', S.Machine.parse(JSON.parse(JSON.stringify(doc)))); dirty.machine = false; switchTab('machine', true);
    toast(`${m.name} v${v} · 객체를 골라 오른쪽에서 크기·위치·동작 시간을 바꾸고 '설비 카드 저장'을 누릅니다`); }
  // the example process (감마 라인) back in Factory Builder; the factory on screen is kept under one.build.factory.before-plant
  function loadExample() { const doc = ED.factory.doc;
    if ((doc.machines.length || doc.building.walls.length) && !confirm('지금 공장 대신 예시 공정을 엽니다. 지금 공장은 이 브라우저에 따로 보관됩니다. 계속할까요?')) return;
    if (doc.machines.length || doc.building.walls.length) LS.set(KEY.factory + '.before-plant', doc);
    openDoc('factory', window.OnePlant.defaultFactory()); dirty.factory = false; switchTab('factory', true); toast('예시 공정 · 감마 라인을 열었습니다'); }
  function save() {
    if (tab === 'machine') {
      const doc = ED.machine.doc, all = lib(), m = all[doc.meta.id] || { name: doc.meta.name, versions: {} }, v = Object.keys(m.versions).length ? Math.max(...Object.keys(m.versions).map(Number)) + 1 : 1;
      const sz = contentSize(); if (!doc.meta.cellFixed && sz && sz.join() !== doc.meta.bbox.join()) ED.machine.exec('set_meta', { bbox: sz }); const cur = ED.machine.doc;
      const snap = JSON.parse(JSON.stringify(cur)); snap.meta.version = v; snap.card.footprint = [cur.meta.bbox[0], cur.meta.bbox[1]];
      m.name = doc.meta.name; m.versions[v] = snap; all[doc.meta.id] = m; LS.set(KEY.lib, all);
      // the same machine already placed in the factory now uses this version
      const placed = ED.factory.doc.machines.filter(x => x.ref.startsWith(`local:${doc.meta.id}@`) && x.ref !== `local:${doc.meta.id}@${v}`);
      if (placed.length) ED.factory.batch('set_machine_ref', () => { for (const x of placed) ED.factory.exec('set_machine_ref', { id: x.id, ref: `local:${doc.meta.id}@${v}` }); });
      dirty.machine = false; toast(`설비 카드 저장: ${doc.meta.name} v${v} · ${placed.length ? `공장에 놓인 ${placed.length}대도 v${v}로 바뀌었습니다` : "Factory Builder의 '내 설비'에 나옵니다"}`); log(`저장 v${v}`);
    } else { LS.set(KEY.factory, ED.factory.doc); dirty.factory = false; toast('공장을 이 브라우저에 저장했습니다 · 파일로 받으려면 내보내기'); }
    drawCrumb();
  }
  $('bSave').onclick = save;
  // 도움말: a popover from the header (?) instead of a block in the properties panel
  const drawHelp = () => { $('helpBody').innerHTML = tab === 'factory' ? howtoFactory : howtoMachine; };
  $('bHelp').onclick = () => { drawHelp(); $('helpBox').hidden = !$('helpBox').hidden; };
  $('helpX').onclick = () => { $('helpBox').hidden = true; };
  $('bSim').onclick = e => { e.preventDefault(); if (tab === 'machine') save(); LS.set(KEY.factory, ED.factory.doc); dirty.factory = false; location.href = '/sim?src=build'; };
  $('bExport').onclick = () => { const doc = ed().doc, a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    a.download = `${(doc.meta.name || tab).replace(/[\\/:*?"<>|\s]+/g, '_')}.${tab}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('bOpen').onclick = () => $('file').click();
  // several files at once: every machine.json goes into 내 설비 (as its next version), the last one opens in Machine Builder;
  // a factory.json opens in Factory Builder (if there are several, the last one wins)
  const openDoc = (scope, j) => { ED[scope] = new C.Editor(scope, j); ED[scope].subscribe(() => { dirty[scope] = true; LS.set(KEY[scope], ED[scope].doc); if (scope === tab) refresh(); }); LS.set(KEY[scope], ED[scope].doc); };
  $('file').onchange = async () => {
    const files = [...$('file').files]; $('file').value = ''; if (!files.length) return;
    const ok = [], bad = []; let lastScope = null, lastMachine = null, factory = null;
    for (const f of files) {
      try { const j = JSON.parse(await f.text()); const scope = j.schema === S.FACTORY_SCHEMA ? 'factory' : j.schema === S.MACHINE_SCHEMA ? 'machine' : null;
        if (!scope) throw new Error('factory.json / machine.json이 아님');
        if (scope === 'machine') { const doc = S.Machine.parse(j), all = lib(), m = all[doc.meta.id] || { name: doc.meta.name, versions: {} }, v = Object.keys(m.versions).length ? Math.max(...Object.keys(m.versions).map(Number)) + 1 : 1;
          const snap = JSON.parse(JSON.stringify(doc)); snap.meta.version = v; m.name = doc.meta.name; m.versions[v] = snap; all[doc.meta.id] = m; LS.set(KEY.lib, all); lastMachine = doc; }
        else factory = S.Factory.parse(j);
        lastScope = scope; ok.push(j.meta?.name || f.name); }
      catch (e) { bad.push(`${f.name} (${e.message || e})`); }
    }
    if (lastMachine) openDoc('machine', lastMachine); if (factory) openDoc('factory', factory);
    if (lastScope) switchTab(files.length > 1 && factory ? 'factory' : lastScope, true);
    toast(ok.length ? `${ok.length}개 불러옴: ${ok.join(', ')}${bad.length ? ` · 실패 ${bad.length}개` : ''}` : '불러오지 못했습니다: ' + bad.join(', '), !ok.length);
  };

  /* ------------------------------------------------------------------ chrome */
  function drawCrumb() {
    const doc = ed().doc;
    if (tab === 'factory') $('crumb').innerHTML = `<b>${esc(doc.meta.name)}</b><span class="ver">${dirty.factory ? '수정됨' : ''}</span>`;
    else { const m = lib()[doc.meta.id], v = m ? Math.max(...Object.keys(m.versions).map(Number)) : 0;
      $('crumb').innerHTML = `<b>${esc(doc.meta.name)}</b><span class="pill">${doc.meta.fidelity}</span><span class="ver">v0.1.${v}${dirty.machine ? ' · 수정됨' : ''}</span>`; }
  }
  function drawBar() {
    const doc = ed().doc;
    if (tab === 'factory') { const r = slabRect(doc); for (const i of ['sW', 'sD', 'sH']) $(i).readOnly = false; $('sizeLab').textContent = '공장 크기'; $('sW').value = (r.x1 - r.x0) / 1000; $('sD').value = (r.y1 - r.y0) / 1000; $('sH').hidden = $('sHx').hidden = true; $('cellSeg').hidden = true; $('sizeUnit').textContent = 'm'; $('units').textContent = 'm · deg · Z-up · 스냅 500 mm · 원점 = 왼쪽 아래(입고)'; }
    else { const fx = !!doc.meta.cellFixed; $('sizeLab').textContent = fx ? '작업 칸' : '작업 칸 (블록 따라)'; for (const i of ['sW', 'sD', 'sH']) $(i).readOnly = !fx; [$('sW').value, $('sD').value, $('sH').value] = fx ? doc.meta.bbox : contentSize() || doc.meta.bbox; document.querySelectorAll('#cellSeg button').forEach(b => b.classList.toggle('on', (b.dataset.c === 'fixed') === fx)); $('sH').hidden = $('sHx').hidden = false; $('cellSeg').hidden = false; $('sizeUnit').textContent = 'mm'; $('units').textContent = 'mm · deg · Z-up · 스냅 50 mm (Alt 5 mm)'; }
    $('bUndo').disabled = !ed().canUndo || mode === 'run'; $('bRedo').disabled = !ed().canRedo || mode === 'run';
    if (tab === 'factory') { const its = factoryItems(doc); $('chipCount').innerHTML = `객체 <b>${its.length}</b> · 설비 <b>${doc.machines.length}</b>`; $('chipOrigin').hidden = true; }
    else { $('chipCount').innerHTML = `블록 <b>${doc.nodes.length}</b> · 관절 <b>${doc.joints.length}</b> · 태그 <b>${doc.io.length}</b>`; $('chipOrigin').hidden = true; }
  }
  function updateHint() { $('hint').textContent = placing ? `${placing.name}: 놓을 곳을 누르세요 · Shift+클릭 = 계속 놓기 · R 회전 · Esc/우클릭 취소` : xray ? 'X-RAY 보기 전용: 끌면 화면이 돌고, 휠은 확대입니다 · X를 다시 누르면 편집' : tab === 'machine' && mode === 'run' ? '동작 시험 중: 명령 값을 눌러 켜고 끄거나, 오른쪽 아래 ▶ 자동 운전으로 동작 순서를 돌립니다 · 편집으로 돌아가면 처음 자세로' : ''; }
  /* ports (입구 · 출구): an ivory arrow where parts come in, an amber one where they leave; labelled in Machine Builder */
  const portGrp = new T.Group(); ov.add(portGrp);
  const arrowGeo = (() => { const sh = new T.Shape(); sh.moveTo(0.22, 0); sh.lineTo(-0.12, 0.14); sh.lineTo(-0.05, 0); sh.lineTo(-0.12, -0.14); sh.lineTo(0.22, 0); return new T.ShapeGeometry(sh).rotateX(-Math.PI / 2); })();
  const portMat = { in: new T.MeshBasicMaterial({ color: 0xe9e3d5, side: T.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }), out: new T.MeshBasicMaterial({ color: 0xffae42, side: T.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }) };
  const portLbl = { in: document.createElement('div'), out: document.createElement('div') }; for (const [k, el] of Object.entries(portLbl)) { el.className = 'lbl port ' + k; el.textContent = k === 'in' ? '투입' : '배출'; $('labels').appendChild(el); }
  let portAnchors = [];
  function addPortArrow(pos, dir, kind, scale, lift) { const g = new T.Group(), m = new T.Mesh(arrowGeo, portMat[kind]); m.scale.setScalar(scale); m.renderOrder = 3; g.add(m);
    const p = toS([pos[0], pos[1], lift ? pos[2] + 15 : 20]); g.position.copy(p);
    g.rotation.y = S.storedYawToScene(Math.atan2(dir[1], dir[0]) * 180 / Math.PI); portGrp.add(g); return p; }
  function drawPorts() { portGrp.clear(); portAnchors = [];
    if (tab === 'machine') { const P = SCN.portsOf(ED.machine.doc); if (!ED.machine.doc.nodes.length) return;
      // a flat arrow at belt height just past each end (not on the rollers): where parts come in and go out
      const off = (q, d, k) => [q.pos[0] + d[0] * k, q.pos[1] + d[1] * k, q.pos[2]];
      portAnchors.push(['in', addPortArrow(off(P.inlet, P.inlet.dir, -280), P.inlet.dir, 'in', 0.9, true)], ['out', addPortArrow(off(P.outlet, P.outlet.dir, 280), P.outlet.dir, 'out', 0.9, true)]); }
    else { for (const it of factoryItems(ED.factory.doc)) { if (it.path !== 'machines' && it.path !== 'storage') continue; const P = portsF(it); if (!P) continue;
        addPortArrow(P.inA, P.dir, 'in', 3, false); const o = addPortArrow(P.outA, P.dir, 'out', 3, false); portGrp.children[portGrp.children.length - 1].userData.port = { id: it.id, kind: 'outlet' }; portGrp.children[portGrp.children.length - 2].userData.port = { id: it.id, kind: 'inlet' }; }
      drawFlows(); } }
  // factory ports: the arrows sit just outside the object, pointing along the flow
  function portsF(it) { const P = SCN.instancePorts(it); if (!P) return null; const off = (p, k) => [p[0] + P.dir[0] * k, p[1] + P.dir[1] * k, p[2]]; return Object.assign(P, { inA: off(P.inlet, -450), outA: off(P.outlet, 450) }); }

  /* flows (공정 흐름): drag from an amber 출구 arrow onto the next machine (or rack) to link them; machines whose
     출구 and 입구 meet get linked by conveyor automatically. Each link shows what carries the part. */
  const VIA = { auto: '자동', conveyor: '컨베이어', amr: 'AMR', forklift: '지게차', worker: '작업자' };
  const flowGrp = new T.Group(); ov.add(flowGrp); const flowEls = new Map();
  const flowMat = new T.LineDashedMaterial({ color: 0xffae42, dashSize: 0.35, gapSize: 0.2, transparent: true, opacity: 0.95 });
  const flowTube = new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.7 }), flowTubeOn = new T.MeshBasicMaterial({ color: 0xffc46b });
  function flowCurve(a, b) { const A = toS([a[0], a[1], 60]), B = toS([b[0], b[1], 60]), M = A.clone().add(B).multiplyScalar(0.5); M.y += Math.min(3, A.distanceTo(B) * 0.18) + 0.2; return new T.QuadraticBezierCurve3(A, M, B); }
  function drawFlows() { flowGrp.traverse(o => { if (o.geometry && o.geometry !== arrowGeo) o.geometry.dispose(); }); flowGrp.clear(); const doc = ED.factory.doc, items = new Map(factoryItems(doc).map(it => [it.id, it])), seen = new Set();
    for (const f of doc.flows) { const a = items.get(f.from.split('.')[0]), b = items.get(f.to.split('.')[0]); if (!a || !b) continue; const pa = portsF(a), pb = portsF(b); if (!pa || !pb) continue;
      const cv = flowCurve(pa.outA, pb.inA), on = sel === f.id; flowGrp.add(new T.Mesh(new T.TubeGeometry(cv, 40, on ? 0.05 : 0.035, 6), on ? flowTubeOn : flowTube));
      for (const t of [0.3, 0.7]) { const tip = new T.Mesh(arrowGeo, portMat.out); tip.scale.setScalar(2); const p1 = cv.getPoint(t + 0.03), p0 = cv.getPoint(t); tip.position.copy(p1); tip.rotation.y = Math.atan2(-(p1.z - p0.z), p1.x - p0.x); flowGrp.add(tip); }
      let el = flowEls.get(f.id); if (!el) { el = document.createElement('button'); el.className = 'flowlbl'; el.dataset.flow = f.id; $('labels').appendChild(el); flowEls.set(f.id, el); }
      el.textContent = VIA[f.via || 'auto'] + (f.ratio < 1 ? ` · ${Math.round(f.ratio * 100)}%` : ''); el.userData = cv.getPoint(0.5); el.classList.toggle('on', sel === f.id); seen.add(f.id); }
    for (const [id, el] of flowEls) if (!seen.has(id)) { el.remove(); flowEls.delete(id); } }
  function drawFlowLabels() { const r = renderer.domElement.getBoundingClientRect(); for (const el of flowEls.values()) { if (tab !== 'factory' || xray || !el.userData) { el.style.display = 'none'; continue; }
      const v = el.userData.clone().project(camera); el.style.display = ''; el.style.left = ((v.x + 1) / 2 * r.width) + 'px'; el.style.top = ((1 - v.y) / 2 * r.height) + 'px'; } }
  $('labels').addEventListener('click', e => { const b = e.target.closest('[data-flow]'); if (b) select(b.dataset.flow); });
  let link = null; const linkLine = new T.Line(new T.BufferGeometry(), flowMat); linkLine.visible = false; ov.add(linkLine);
  function pickPort(e) { setNdc(e); const h = ray.intersectObjects(portGrp.children, true).find(x => x.object.parent?.userData.port || x.object.userData.port); return h ? (h.object.parent.userData.port || h.object.userData.port) : null; }
  function startLink(e, port) { const it = factoryItems(ED.factory.doc).find(x => x.id === port.id), P = it && portsF(it); if (!P) return false; link = { from: port.id, a: P.outA }; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); return true; }
  function moveLink(e) { setNdc(e); plane.constant = 0; if (!ray.ray.intersectPlane(plane, hit)) return; const b = fromS(hit); const cv = flowCurve(link.a, b); linkLine.geometry.dispose(); linkLine.geometry = new T.BufferGeometry().setFromPoints(cv.getPoints(30)); linkLine.computeLineDistances(); linkLine.visible = true; }
  function endLink(e) { const L0 = link; link = null; linkLine.visible = false; controls.enabled = true; const port = pickPort(e); let to = port && port.kind === 'inlet' ? port.id : null;
    if (!to) { const id = pickExact(); const it = id && factoryItems(ED.factory.doc).find(x => x.id === id); if (it && (it.path === 'machines' || it.path === 'storage')) to = id; }
    if (!to || to === L0.from) { toast('다음 설비(또는 랙) 위에서 놓으면 이어집니다'); return; }
    const nid = exec('connect_flow', { from: `${L0.from}.outlet`, to: `${to}.inlet` }); if (nid) { select(nid); toast('흐름을 이었습니다 · 오른쪽에서 옮기는 수단을 고릅니다'); } }
  // after a machine moves or is placed: link it to a neighbour whose ports meet its own (≤ 800 mm), carried by conveyor
  function autoLink(ids) { const doc = ED.factory.doc, items = factoryItems(doc).filter(it => it.path === 'machines'), P = new Map(items.map(it => [it.id, SCN.instancePorts(it)])); let n = 0;
    for (const id of ids) { const me = P.get(id); if (!me) continue;
      for (const [oid, o] of P) { if (oid === id || !o) continue;
        for (const [fa, fb, A, B] of [[id, oid, me.outlet, o.inlet], [oid, id, o.outlet, me.inlet]]) if (Math.hypot(A[0] - B[0], A[1] - B[1]) <= 800 && !doc.flows.some(f => f.from === `${fa}.outlet` && f.to === `${fb}.inlet`) && !doc.flows.some(f => f.from === `${fa}.outlet`)) { if (exec('connect_flow', { from: `${fa}.outlet`, to: `${fb}.inlet`, via: 'conveyor' }, true)) n++; } } }
    if (n) setTimeout(() => toast(`맞닿은 설비 ${n}곳을 컨베이어 흐름으로 이었습니다`), 0); }
  function drawPortLabels() { const r = renderer.domElement.getBoundingClientRect(); for (const k of ['in', 'out']) { const a = portAnchors.find(x => x[0] === k), el = portLbl[k]; if (!a || xray || mode === 'run') { el.style.display = 'none'; continue; }
      const v = a[1].clone().project(camera); el.style.display = ''; el.style.left = ((v.x + 1) / 2 * r.width) + 'px'; el.style.top = ((1 - v.y) / 2 * r.height) + 'px'; } }
  function refresh() { syncScene(); drawPorts(); drawTree(); drawProps(); drawBar(); drawCrumb(); updateSelMark(); if (tab === 'machine') updateEnvelope(); if (tab === 'machine') drawIo(); }
  function switchTab(t, fit) {
    if (mode === 'run') setMode('edit');
    tab = t; LS.set(KEY.tab, t); sel = null; multi = new Set(); if (!$('helpBox').hidden) setTimeout(drawHelp, 0); document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    for (const v of objs.values()) root.remove(v.obj); objs = new Map(); floorKey = '';
    $('mode').hidden = t !== 'machine'; $('bottom').hidden = true; $('bSave').textContent = t === 'machine' ? '설비 카드 저장' : '저장';
    $('search').value = ''; drawPalette(); refresh(); updateHint(); drawLog(); setTimeout(() => { stage.resize(); fitAll(); }, 0);
  }

  /* ------------------------------------------------------------------ labels (projected HTML) */
  const lblBox = $('labels'), lbls = new Map(), v3 = new T.Vector3();
  // labels never pile up: the selected / hovered one first, then the rest by size; a label that would overlap one already
  // shown drops to its short code, and if even that overlaps it is hidden until you zoom in or point at it
  let hoverId = null; const lw = new Map(), meas = document.createElement('div'); meas.className = 'lbl'; meas.style.visibility = 'hidden'; meas.style.left = '-999px'; lblBox.appendChild(meas);
  const wOf = (el, html) => { let w = lw.get(html); if (w === undefined) { meas.innerHTML = html; w = meas.offsetWidth; if (w) lw.set(html, w); else w = 80; } return w; };
  // 동작 시험: what each moving block is doing right now, always labelled so nothing hides behind a cabinet
  function runState(n) { const d = nodeDef(n); if (!d) return null; const P = nodeCode(n), t = RUN.tags, has = k => k in t;
    if (d.work) return { txt: '워크', on: true };
    if (d.conveyor || d.corner || d.curve) return { txt: t[`${P}_RUN`] ? '운전 중' : '정지', on: !!t[`${P}_RUN`] };
    if (d.stops) { const up = has(`${P}_IS_UP`) ? t[`${P}_IS_UP`] : t[`${P}_UP`]; return { txt: up ? '올림 · 워크 멈춤' : '내림', on: !!up }; }
    if (d.sensor) return { txt: t[`${P}_ON`] ? '워크 감지' : '감지 없음', on: !!t[`${P}_ON`] };
    const pr = RUN.procs[P]; if (pr || has(`${P}_START`) || has(`${P}_TRIG`)) return { txt: pr?.busy ? '작업 중' : t[`${P}_DONE`] ? '완료' : '대기', on: !!pr?.busy };
    return null; }
  function drawLabels() {
    const r = renderer.domElement.getBoundingClientRect(), want = new Set(), sels = new Set(selIds());
    const live = tab === 'machine' && mode === 'run' && !xray;
    if (tab === 'machine') for (const n of ED.machine.doc.nodes) { if (live ? !runState(n) && n.parent : n.parent && !sels.has(n.id) && hoverId !== n.id) continue; want.add(n.id); }
    else for (const it of factoryItems(ED.factory.doc)) if (it.path === 'machines' || sels.has(it.id) || it.id === hoverId) want.add(it.id);
    for (const [id, el] of lbls) if (!want.has(id)) { el.remove(); lbls.delete(id); }
    const items = [];
    for (const id of want) {
      const o = objs.get(id)?.obj; if (!o) continue; let el = lbls.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'lbl'; lblBox.appendChild(el); lbls.set(id, el); }
      tmpBox.setFromObject(o); if (tmpBox.isEmpty()) { el.style.display = 'none'; continue; } const size = tmpBox.getSize(v3).length(); tmpBox.getCenter(v3); v3.y = tmpBox.max.y + 0.05; v3.project(camera);
      if (Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) { el.style.display = 'none'; continue; }
      let code, name, rs = null; if (tab === 'machine') { const n = ED.machine.doc.nodes.find(x => x.id === id); code = nodeCode(n); name = n.name; if (live && (rs = runState(n))) name = rs.txt; } else { const it = factoryItems(ED.factory.doc).find(x => x.id === id); code = itemCode(it); name = itemName(it); }
      items.push({ id, el, x: (v3.x + 1) / 2 * r.width, y: (1 - v3.y) / 2 * r.height, size, code, name, rs, pri: id === sel ? 3 : id === hoverId || rs ? 2 : sels.has(id) ? 1 : 0 });
    }
    items.sort((a, b) => b.pri - a.pri || b.size - a.size);
    const placed = [], H = 22, hits = (x0, x1, y0, y1) => placed.some(p => x0 < p[1] + 4 && x1 > p[0] - 4 && y0 < p[3] + 2 && y1 > p[2] - 2);
    for (const it of items) {
      const full = `${it.code ? `<b>${esc(it.code)}</b>` : ''}${esc(it.name)}`, short = it.code ? `<b>${esc(it.code)}</b>` : full;
      let html = full, w = wOf(it.el, full) ; let y0 = it.y - H, y1 = it.y;
      if (it.pri < 2 && hits(it.x - w / 2, it.x + w / 2, y0, y1)) { html = short; w = wOf(it.el, short); if (hits(it.x - w / 2, it.x + w / 2, y0, y1)) { it.el.style.display = 'none'; continue; } }
      if (it.rs) for (let k = 0; k < 6 && hits(it.x - w / 2, it.x + w / 2, y0, y1); k++) { y0 -= H + 2; y1 -= H + 2; } // live states stack upward instead of hiding
      it.y = y1; placed.push([it.x - w / 2, it.x + w / 2, y0, y1]);
      if (it.el.innerHTML !== html) it.el.innerHTML = html; it.el.style.display = ''; it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px';
      it.el.classList.toggle('on', sels.has(it.id)); it.el.classList.toggle('hov', it.pri === 2 && !it.rs); it.el.classList.toggle('live', !!it.rs?.on); it.el.classList.toggle('idle', !!it.rs && !it.rs.on); it.el.style.zIndex = it.pri >= 2 ? 2 : 1;
    }
  }
  renderer.domElement.addEventListener('pointermove', e => { if (drag || placing || e.buttons) return; setNdc(e); const id = pickExact(); if (id !== hoverId) hoverId = id; });
  renderer.domElement.addEventListener('pointerleave', () => { hoverId = null; });

  /* ------------------------------------------------------------------ loop */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'run' && tab === 'machine') { stepAuto(dt); stepRun(dt); if ((RUN.frame = (RUN.frame || 0) + 1) % 6 === 0) drawIo(); }
    stage.render(); drawLabels(); drawPortLabels(); drawFlowLabels(); requestAnimationFrame(loop);
  }

  // first visit: a small example in each document so the screens are not empty
  if (!ED.machine.doc.nodes.length && !LS.get(KEY.machine + '.seeded', false)) {
    LS.set(KEY.machine + '.seeded', true); const t = tab; tab = 'machine';
    ED.machine.exec('set_meta', { name: '컨베이어 스테이션' }); syncScene();
    addBlock('roller-conveyor'); const cv = sel; addBlock('stopper'); select(cv); addBlock('photo-sensor'); select(cv);
    const cvn = ED.machine.doc.nodes.find(n => n.id === cv); sel = null; addBlock('control-cabinet'); const cp = sel; ED.machine.exec('move', { id: cp, position: [500, 900, 0] });
    select(cv); addBlock('work-box'); const w = sel; ED.machine.exec('move', { id: w, position: [cvn.transform.position[0] - 1100, 0, ED.machine.doc.nodes.find(n => n.id === w).transform.position[2]] });
    ED.machine.exec('set_card', { cycle_time: 12, ok_rate: 0.995 }); sel = null; for (const v of objs.values()) root.remove(v.obj); objs = new Map(); tab = t; logLines.length = 0;
  }
  // the default factory is the partner plant line (js/plant-machines.js), shown once to every browser; a factory made
  // before it is kept under one.build.factory.before-plant
  if (window.OnePlant && !LS.get(KEY.factory + '.plant', false)) {
    if (ED.factory.doc.building.walls.length || ED.factory.doc.machines.length) LS.set(KEY.factory + '.before-plant', ED.factory.doc);
    LS.set(KEY.factory + '.plant', true); LS.set(KEY.factory + '.seeded', true); openDoc('factory', window.OnePlant.defaultFactory());
  }
  L.onModel(() => { updateSelMark(); });
  dirty = { factory: false, machine: false };
  switchTab(tab);
  requestAnimationFrame(loop);
  window.ONE_BUILD = { ED, stage, select, selectMany, moveSelBy, switchTab, setMode, RUN, addBlock, addShape: (id, at, yaw) => ed().batch('add', () => addShape(id, at, yaw)), get sel() { return sel; } };
})();
