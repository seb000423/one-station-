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
  const newMachine = () => S.Machine.parse({ schema: S.MACHINE_SCHEMA, meta: { id: S.uuidv7(), name: '새 설비', bbox: [4000, 1200, 1800], fidelity: 'L2' } });
  const load = (scope, make) => { const d = LS.get(KEY[scope], null); try { return d ? (scope === 'factory' ? S.Factory : S.Machine).parse(d) : make(); } catch { return make(); } };
  const ED = { factory: new C.Editor('factory', load('factory', newFactory)), machine: new C.Editor('machine', load('machine', newMachine)) };
  let tab = LS.get(KEY.tab, 'factory') === 'machine' ? 'machine' : 'factory';
  let mode = 'edit', sel = null, dirty = { factory: false, machine: false };
  const lib = () => LS.get(KEY.lib, {}); // machine id → { name, versions: { n: machine doc } }
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
  const OPEN = { door: 'door', shutter: 'shutter', dock: 'dock', exit: 'emergency-exit' };
  const STOR = { rack: 'rack', floor: 'floor-storage', buffer: 'floor-storage' };
  const MOV = { worker: 'worker', amr: 'amr', forklift: 'forklift' };
  function factoryItems(doc) {
    const out = [], push = (item, path, def, extra = {}) => out.push(Object.assign({ id: item.id, item, path, def }, extra));
    for (const w of doc.building.walls) push(w, 'building.walls', 'outer-wall');
    for (const c of doc.building.columns) push(c, 'building.columns', 'column');
    for (const r of doc.building.roofs) push(r, 'building.roofs', 'roof');
    for (const o of doc.building.openings) push(o, 'building.openings', OPEN[o.kind] || 'door');
    for (const m of doc.markings) push(m, 'markings', 'floor-marking');
    for (const m of doc.machines) { const lr = /^lib:([a-z0-9-]+)@/.exec(m.ref), loc = /^local:([^@]+)@(\d+)/.exec(m.ref); push(m, 'machines', lr ? lr[1] : null, { local: loc ? { id: loc[1], v: +loc[2] } : null }); }
    for (const s of doc.storage) push(s, 'storage', STOR[s.kind]);
    for (const m of doc.movers) push(m, 'movers', MOV[m.kind]);
    for (const d of doc.utilities.drops) push(d, 'utilities.drops', d.kind === 'air' ? 'air-drop' : 'power-drop');
    for (const b of doc.blocks) push(b, 'blocks', b.type);
    return out;
  }
  const slabRect = doc => { const p = doc.building.slabs[0]?.polygon || [[0, 0], [30000, 0], [30000, 20000], [0, 20000]]; const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  const itemName = it => { if (it.local) { const m = lib()[it.local.id]; return it.item.name || (m ? m.name : '내 설비'); } const d = L.FACTORY[it.def]; return it.item.name || (d ? d.name : it.item.type || '객체'); };
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
    drawFloor(); if (sel && !objs.has(sel)) sel = null; if (xray) stage.addTwin(root, o => !!(o.userData.node && nodeDef(o.userData.node)?.work));
  }
  function placeObj(obj, pos, yawDeg = 0) { obj.position.copy(toS(pos)); obj.rotation.y = S.storedYawToScene(yawDeg); }
  function buildFactoryObj(it, doc) {
    const x = it.item, lvH = (doc.meta.levels[0]?.height || 7000) / 1000;
    if (it.path === 'building.walls') {
      const dx = x.to[0] - x.from[0], dy = x.to[1] - x.from[1], len = Math.hypot(dx, dy) / 1000, H = x.height ? x.height / 1000 : lvH;
      const o = L.special.wall(len, H, x.thickness / 1000); placeObj(o, [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2, 0]); o.rotation.y = Math.atan2(dy, dx); return o;
    }
    if (it.path === 'building.roofs') { const r = slabRect(doc), w = (x.params.w || r.x1 - r.x0) / 1000, d = (x.params.d || r.y1 - r.y0) / 1000; const o = L.special.roof(x.params, w, d, (x.params.eave || lvH * 1000) / 1000); placeObj(o, x.transform.position, x.transform.rotation[2]); o.userData.roof = true; return o; }
    if (it.path === 'building.columns') { const o = L.special.column({ size: x.size[0], h: x.height ? x.height / 1000 : lvH }); placeObj(o, x.transform.position); return o; }
    if (it.path === 'markings') { const o = L.special.marking(x.kind, x.params); placeObj(o, x.transform.position, x.transform.rotation[2]); return o; }
    if (it.local) { const o = buildLocalMachine(it.local); placeObj(o, x.transform.position, x.transform.rotation[2]); return o; }
    const params = Object.assign({}, x.params, it.path === 'storage' || it.path === 'movers' ? {} : {});
    const o = L.buildFactory(it.def, params); placeObj(o, x.transform.position, x.transform.rotation[2]); return o;
  }
  function buildLocalMachine({ id, v }) {
    const m = lib()[id], doc = m && (m.versions[v] || m.versions[Object.keys(m.versions).pop()]), g = new T.Group();
    if (!doc) { const b = L.buildFactory('control-cabinet'); g.add(b); return g; }
    for (const n of doc.nodes) { const o = L.buildBlock(n.blockType, n.params); placeObj(o, n.transform.position, n.transform.rotation[2]); g.add(o); }
    return g;
  }
  function buildMachineObj(n) { const o = L.buildBlock(n.blockType, n.params); placeObj(o, n.transform.position, n.transform.rotation[2]); o.userData.node = n; return o; }

  const floorMat = new T.MeshStandardMaterial({ color: 0x1e1e24, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.7, depthWrite: false });
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
      slabMesh.position.set(c.x, 0.001, c.z); ov.add(slabMesh);
      { const m = Math.max(w, d) * 0.35 + 6; controls.minZoom = 1 / ((Math.max(w, d) / 2 + m) * 0.9); stage.setBounds(new T.Box3(new T.Vector3(c.x - w / 2 - m, 0, c.z - d / 2 - m), new T.Vector3(c.x + w / 2 + m, 6, c.z + d / 2 + m))); } stage.setGrid(0.5, 5);
    } else {
      const [W, D, H] = doc.meta.bbox.map(v => v / 1000);
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
  function updateEnvelope() {
    if (!envelope) return; const b = contentBox(); envelope.visible = !b.isEmpty(); if (b.isEmpty()) return;
    b.min.y = 0; const sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), pad = 0.02;
    const key = [sz.x, sz.y, sz.z].map(v => v.toFixed(3)).join();
    if (envelope.userData.key !== key) { envelope.geometry.dispose(); envelope.geometry = new T.EdgesGeometry(new T.BoxGeometry(sz.x + pad, Math.max(0.05, sz.y), sz.z + pad)); envelope.computeLineDistances(); envelope.userData.key = key; }
    envelope.position.copy(c);
    const sz2 = contentSize(); if (sz2 && tab === 'machine') { [$('sW').value, $('sD').value, $('sH').value] = sz2; }
  }

  /* selection marker: an amber footprint on the floor (blooms), no outlines */
  const selMark = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new T.LineBasicMaterial({ color: 0xffae42 }));
  const selFill = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.08, depthWrite: false }));
  const selGrp = new T.Group(); selGrp.add(selFill, selMark); ov.add(selGrp); selGrp.visible = false;
  const tmpBox = new T.Box3();
  function updateSelMark() {
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
        + list.map(i => `<button class="item" data-add="${esc(i.key)}" title="${esc(i.why || i.name)}"><span class="code">${esc(i.code || '')}${i.grade ? `<i>${i.grade}차</i>` : ''}</span><b>${esc(i.name)}</b></button>`).join('') + '</div></div>';
    };
    if (tab === 'factory') {
      $('palTitle').innerHTML = '에셋 팔레트 <small>누르면 놓임</small>';
      for (const g of L.FACTORY_GROUPS) sec(g.id, g.name, Object.values(L.FACTORY).filter(d => d.group === g.id).map(d => ({ key: 'f:' + d.id, name: d.name, code: d.process ? d.process.split(' ')[0] : '', grade: d.grade, why: d.why })));
      const mine = Object.entries(lib()).map(([id, m]) => ({ key: 'l:' + id, name: m.name, code: 'v' + Math.max(...Object.keys(m.versions).map(Number)), why: '설비 탭에서 저장한 설비' }));
      sec('mine', '내 설비 (설비 탭에서 저장)', mine.length ? mine : []);
      if (!mine.length && !q) html += '<p class="why">설비 탭에서 만든 설비를 저장하면 여기에 나옵니다.</p>';
    } else {
      $('palTitle').innerHTML = '블록 팔레트 <small>누르면 놓임</small>';
      for (const c of L.MACHINE_CATS) sec(c.id, c.name, Object.values(L.BLOCKS).filter(b => b.cat === c.id).map(b => ({ key: 'b:' + b.id, name: b.name, code: b.code, why: b.onTop ? '선택한 블록 위에 놓입니다' : '' })));
    }
    box.innerHTML = html;
  }
  $('pal').addEventListener('click', e => {
    const c = e.target.closest('.cat>button'); if (c) { const id = c.parentElement.dataset.cat; openCats[id] = !c.parentElement.classList.contains('open'); LS.set('one.build.cats', openCats); c.parentElement.classList.toggle('open'); return; }
    const b = e.target.closest('[data-add]'); if (!b) return; if (mode === 'run') setMode('edit'); if (xray) setXray(false);
    const [k, id] = b.dataset.add.split(/:(.*)/s);
    if (k === 'f') addFactory(id); else if (k === 'l') addLocal(id); else addBlock(id);
  });
  $('search').addEventListener('input', drawPalette);

  // where a new object goes: the view centre, on the floor, snapped
  const viewPoint = step => { const t = controls.target, p = fromS(t); return [S.snap(p[0], step), S.snap(p[1], step)]; };
  function addFactory(id) {
    const d = L.FACTORY[id], k = d.kind, doc = ed().doc, r = slabRect(doc);
    let [x, y] = viewPoint(500); x = Math.min(r.x1 - 500, Math.max(r.x0 + 500, x)); y = Math.min(r.y1 - 500, Math.max(r.y0 + 500, y));
    const params = JSON.parse(JSON.stringify(d.params || {}));
    let nid;
    switch (k.cmd) {
      case 'slab': select(doc.building.slabs[0]?.id || null); return;
      case 'draw_wall': nid = exec('draw_wall', { from: [x - params.length / 2, y], to: [x + params.length / 2, y], thickness: 200 }); break;
      case 'add_column': nid = exec('add_column', { position: [x, y], size: [params.size, params.size] }); break;
      case 'add_roof': { if (doc.building.roofs.length) { toast('지붕은 이미 있습니다. 선택해서 형식을 바꿀 수 있습니다'); select(doc.building.roofs[0].id); return; }
        nid = exec('add_roof', { position: [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2], params: { type: params.type, w: r.x1 - r.x0, d: r.y1 - r.y0 } }); break; }
      case 'add_opening': nid = exec('add_opening', { kind: k.kind, position: [x, r.y1], params }); break;
      case 'add_marking': { const hl = params.length / 2, hw = params.width / 2;
        nid = exec('add_marking', { kind: params.variant, params, ...(params.variant === 'aisle' ? { polyline: [[x - hl, y], [x + hl, y]] } : { polygon: [[x - hl, y - hw], [x + hl, y - hw], [x + hl, y + hw], [x - hl, y + hw]] }) }); break; }
      case 'add_drop': nid = exec('add_drop', { kind: k.kind, position: [x, y], params }); break;
      case 'add_storage': nid = exec('add_storage', { kind: k.kind, position: [x, y], params }); break;
      case 'add_mover': nid = exec('add_mover', { kind: k.kind, position: [x, y], params }); break;
      case 'add_block': nid = exec('add_block', { type: k.type, position: [x, y], params }); break;
      case 'place_machine': nid = exec('place_machine', { ref: k.ref, name: d.name, position: [x, y], params }); break;
    }
    if (nid) { select(nid); toast(`${d.name} 배치 · 끌어서 옮기고 R로 돌립니다`); }
  }
  function addLocal(id) { const m = lib()[id]; if (!m) return; const v = Math.max(...Object.keys(m.versions).map(Number)); const [x, y] = viewPoint(500);
    const nid = exec('place_machine', { ref: `local:${id}@${v}`, name: m.name, position: [x, y] }); if (nid) { select(nid); toast(`${m.name} v${v} 배치`); } }
  function addBlock(id) {
    const d = L.BLOCKS[id], doc = ed().doc, P = nextCode(doc, d.code), params = Object.assign({ tag: P }, JSON.parse(JSON.stringify(d.params)));
    const base = sel && doc.nodes.find(n => n.id === sel);
    let pos, parent = null;
    if (d.onTop && base) { const bp = base.transform.position; pos = [bp[0], bp[1], nodeTop(base)]; parent = base.id;
      const bd = nodeDef(base); if (bd && bd.conveyor && (d.stops || d.sensor)) pos[0] = bp[0] + (base.params.length || 1000) / 2 - 150; // stopper / sensor near the outfeed end
      if (bd && bd.conveyor && d.sensor) pos[1] = bp[1] - (base.params.w || 500) / 2 - 30; }
    else { const xs = doc.nodes.filter(n => !n.parent).map(n => n.transform.position[0] + blockHalfX(n)); pos = [xs.length ? S.snap(Math.max(...xs) + 400, 50) : 0, 0, 0]; }
    const nid = exec('add_block', { blockType: id, name: `${d.name.replace(/ \(.*\)$/, '')} ${P.replace(/^\D+/, '')}`, parent, position: pos, params, joints: d.joints(P, params), io: d.io(P, params) });
    if (nid) { select(nid); toast(`${P} ${d.name}: 축 ${d.joints(P, params).length} · 태그 ${d.io(P, params).length} 추가`); }
  }
  const blockHalfX = n => { const o = objs.get(n.id)?.obj; if (!o) return 300; tmpBox.setFromObject(o); return tmpBox.isEmpty() ? 300 : Math.max(100, (tmpBox.max.x - tmpBox.min.x) * 500); };

  /* ------------------------------------------------------------------ tree */
  function drawTree() {
    const doc = ed().doc, box = $('tree'); let html = '', n = 0;
    if (tab === 'factory') {
      const items = factoryItems(doc), groups = {};
      for (const it of items) { const g = it.path === 'machines' ? '설비' : (L.FACTORY[it.def] ? L.FACTORY_GROUPS.find(x => x.id === L.FACTORY[it.def].group)?.name : '기타') || '기타'; (groups[g] || (groups[g] = [])).push(it); }
      html += `<div data-id="${esc(doc.building.slabs[0]?.id || '')}" class="${sel === doc.building.slabs[0]?.id ? 'on' : ''}"><code>바닥</code><span>${esc(doc.meta.name)} · ${((slabRect(doc).x1 - slabRect(doc).x0) / 1000).toFixed(1)} × ${((slabRect(doc).y1 - slabRect(doc).y0) / 1000).toFixed(1)} m</span></div>`;
      for (const [g, list] of Object.entries(groups)) { html += `<div class="grp">${esc(g)} · ${list.length}</div>`; for (const it of list) { n++; html += `<div data-id="${it.id}" class="${sel === it.id ? 'on' : ''}"><code>${esc(itemCode(it))}</code><span>${esc(itemName(it))}</span></div>`; } }
    } else {
      html += `<div data-id="" class="${!sel ? 'on' : ''}"><code>설비</code><span>${esc(doc.meta.name)}</span></div>`;
      const kids = id => doc.nodes.filter(x => (x.parent || null) === id);
      const walk = (id, depth) => { for (const x of kids(id)) { n++; html += `<div data-id="${x.id}" class="${sel === x.id ? 'on' : ''}" style="padding-left:${6 + depth * 14}px"><code>${esc(nodeCode(x))}</code><span>${esc(x.name || x.blockType)}</span></div>`; walk(x.id, depth + 1); } };
      walk(null, 1);
    }
    box.innerHTML = html; $('treeN').textContent = n;
  }
  $('tree').addEventListener('click', e => { const d = e.target.closest('[data-id]'); if (d) select(d.dataset.id || null, true); });

  /* ------------------------------------------------------------------ properties */
  const field = (f, val, key = f.key) => {
    if (f.type === 'select') return `<span class="k">${esc(f.label)}</span><select data-k="${esc(key)}">${f.options.map(([v, t]) => `<option value="${esc(v)}"${String(val) === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    return `<span class="k">${esc(f.label)}</span><span class="unit"><input type="number" data-k="${esc(key)}" value="${val ?? ''}" step="${f.step || 1}" min="${f.min ?? ''}"><small>${esc(f.unit || '')}</small></span>`;
  };
  const howtoFactory = `<ol class="howto"><li><b>왼쪽 팔레트</b>에서 에셋을 누르면 화면 가운데에 놓입니다.</li><li>3D에서 <b>끌면</b> 옮겨집니다 (500 mm 단위, Alt를 누르면 10 mm). 빈 곳을 끌면 화면이 돌고, 휠은 확대입니다.</li><li><b>R</b> 90° 회전 · <b>Delete</b> 삭제 · <b>Ctrl+D</b> 복사 · <b>Ctrl+Z / Y</b> 되돌리기.</li><li><b>설비</b> 탭에서 만든 설비를 저장하면 <b>내 설비</b>에서 공장에 놓을 수 있습니다.</li></ol>`;
  const howtoMachine = `<ol class="howto"><li><b>왼쪽 팔레트</b>에서 블록을 누르면 바닥에 놓입니다. 컨베이어를 고른 상태면 센서·스토퍼·워크는 그 위에 놓입니다.</li><li>3D에서 블록을 <b>끌면</b> 옮겨집니다 (50 mm 단위, Alt를 누르면 5 mm).</li><li>블록을 고르면 여기에 길이·속도 같은 숫자가 나옵니다. 고치면 3D가 바로 바뀝니다.</li><li>위의 <b>실행</b>을 누르면 아래에 조작 패널이 열립니다. 명령(예: 운전, 올리기)을 눌러 켜면 설비가 움직이고, 센서·끝 위치 같은 상태는 자동으로 바뀝니다.</li><li><b>저장</b>하면 설비 카드가 만들어지고 공장 탭의 <b>내 설비</b>에 나옵니다.</li></ol>`;
  function drawProps() {
    const doc = ed().doc, box = $('props'); let html = '';
    if (tab === 'factory') {
      const it = sel && factoryItems(doc).find(x => x.id === sel), slab = doc.building.slabs.find(s => s.id === sel);
      if (slab) { const r = slabRect(doc); html = `<div class="sec"><h2>바닥 슬래브</h2><p class="why">모든 배치와 이동 경로가 놓이는 기준면입니다. 원점은 왼쪽 아래(입고) 모서리입니다.</p><div class="props">${field(num('w', '가로', 'm', 0.5), (r.x1 - r.x0) / 1000, 'slab.w')}${field(num('d', '세로', 'm', 0.5), (r.y1 - r.y0) / 1000, 'slab.d')}<span class="k">공장 이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"></div></div>`; }
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
        html += `</div><div class="acts"><button class="btn" data-act="rot">R 회전</button><button class="btn" data-act="dup">복사</button><button class="btn" data-act="del">삭제</button></div></div>`;
      } else html = `<div class="sec"><h2>공장</h2><div class="props"><span class="k">이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"><span class="k">놓인 것</span><span class="v">${factoryItems(doc).length}개 · 설비 ${doc.machines.length}대</span></div></div><div class="sec"><h2>이 화면 쓰는 법</h2>${howtoFactory}</div>`;
    } else {
      const n = sel && doc.nodes.find(x => x.id === sel);
      if (n) { const d = nodeDef(n) || { fields: [], params: {} }, P = nodeCode(n), p = n.transform.position;
        const tags = doc.io.filter(t => t.tag.startsWith(P + '_')), joints = doc.joints.filter(j => j.node === n.id);
        html = `<div class="sec"><h2><span><b style="font-family:var(--mono)">${esc(P)}</b> ${esc(d.name || n.blockType)}</span></h2><div class="props"><span class="k">이름</span><input data-k="name" value="${esc(n.name)}">`;
        for (const f of d.fields) html += field(f, n.params[f.key] ?? d.params[f.key], 'p.' + f.key);
        html += `<span class="k">위치 X·Y·Z</span><span class="unit"><input type="number" data-k="pos.0" value="${p[0]}" step="5"><input type="number" data-k="pos.1" value="${p[1]}" step="5"><input type="number" data-k="pos.2" value="${p[2]}" step="5"></span><span class="k">방향</span><span class="v">${n.transform.rotation[2]}°</span></div>`;
        if (joints.length) html += `<h2 style="margin-top:14px">축 <small>${joints.length}</small></h2><div class="taglist">${joints.map(j => `<span>${esc(j.id)} · ${j.type === 'rot' ? '회전' : '직선'} ${j.mode} · ${j.min}~${j.max} · ${j.vmax}${j.type === 'rot' ? '°/s' : ' mm/s'}</span>`).join('')}</div>`;
        if (tags.length) html += `<h2 style="margin-top:14px">태그 <small>${tags.length}</small></h2><div class="taglist">${tags.map(t => `<span>${esc(t.tag)} · ${t.dir === 'out' ? 'OUT' : 'IN'} · ${t.type.toUpperCase()}</span>`).join('')}</div>`;
        html += `<div class="acts"><button class="btn" data-act="rot">R 회전</button><button class="btn" data-act="del">삭제</button></div></div>`;
      } else {
        const ct = doc.card;
        html = `<div class="sec"><h2>설비 <small>${doc.meta.fidelity}</small></h2><div class="props"><span class="k">이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"><span class="k">외곽 (자동)</span><span class="v">${(contentSize() || doc.meta.bbox).join(' × ')} mm</span>
          ${field(num('cycle_time', '사이클', 's', 0.5), ct.cycle_time ?? '', 'card.cycle_time')}${field(num('ok_rate', '양품률', '0~1', 0.01), ct.ok_rate ?? '', 'card.ok_rate')}${field(num('operators', '작업자', '명', 1), ct.operators, 'card.operators')}
          <span class="k">카드</span><span class="v">사이클 ${ct.cycle_time ?? '–'} s · 양품률 ${ct.ok_rate != null ? (ct.ok_rate * 100).toFixed(1) + '%' : '–'}</span></div></div><div class="sec"><h2>이 화면 쓰는 법</h2>${howtoMachine}</div>`;
      }
    }
    box.innerHTML = html;
  }
  const num = (key, label, unit, step) => ({ key, label, type: 'num', unit, step });
  $('props').addEventListener('change', e => {
    const k = e.target.dataset.k; if (!k || !sel && !k.startsWith('meta.') && !k.startsWith('card.')) return;
    const raw = e.target.value, v = e.target.type === 'number' ? (raw === '' ? null : +raw) : raw, doc = ed().doc;
    if (k === 'meta.name') { exec('set_meta', { name: raw || (tab === 'factory' ? '공장' : '설비') }); return; }
    if (k.startsWith('card.')) { exec('set_card', { [k.slice(5)]: v }); return; }
    if (k === 'slab.w' || k === 'slab.d') { const r = slabRect(doc), w = k === 'slab.w' ? v * 1000 : r.x1 - r.x0, d = k === 'slab.d' ? v * 1000 : r.y1 - r.y0; if (w > 0 && d > 0) exec('set_slab', { polygon: [[r.x0, r.y0], [r.x0 + w, r.y0], [r.x0 + w, r.y0 + d], [r.x0, r.y0 + d]] }); return; }
    if (k === 'name') { exec('rename', { id: sel, name: raw }); return; }
    if (k === 'wall.length') { const w = doc.building.walls.find(x => x.id === sel); if (!w || !(v > 0)) return; const cx = (w.from[0] + w.to[0]) / 2, cy = (w.from[1] + w.to[1]) / 2, a = Math.atan2(w.to[1] - w.from[1], w.to[0] - w.from[0]), h = v * 500;
      const nid = exec('draw_wall', { from: [cx - Math.cos(a) * h, cy - Math.sin(a) * h], to: [cx + Math.cos(a) * h, cy + Math.sin(a) * h], thickness: w.thickness, height: w.height }); if (nid) { exec('delete', { id: sel }); select(nid); } return; }
    if (k.startsWith('pos.')) { const n = doc.nodes.find(x => x.id === sel); if (!n) return; const p = [...n.transform.position]; p[+k.slice(4)] = v ?? 0; exec('move', { id: sel, position: p }); return; }
    if (k.startsWith('p.')) exec('set_param', { id: sel, key: k.slice(2), value: v });
  });
  $('props').addEventListener('click', e => { const a = e.target.dataset.act; if (a === 'rot') rotateSel(); else if (a === 'del') deleteSel(); else if (a === 'dup') dupSel(); });

  function rotateSel() { if (!sel || mode === 'run' || xray) return; const doc = ed().doc;
    if (tab === 'factory') { const it = factoryItems(doc).find(x => x.id === sel); if (!it) return; const yaw = it.item.transform ? it.item.transform.rotation[2] : (it.item.params?.yaw || 0); exec('move', { id: sel, yaw: (yaw + 90) % 360 }); }
    else { const n = doc.nodes.find(x => x.id === sel); if (n) exec('move', { id: sel, rotation: [0, 0, n.transform.rotation[2] + 90] }); } }
  function deleteSel() { if (!sel || mode === 'run' || xray) return; if (tab === 'factory' && ed().doc.building.slabs.some(s => s.id === sel)) { toast('바닥 슬래브는 지울 수 없습니다. 크기를 바꿔 주세요'); return; } exec('delete', { id: sel }); select(null); }
  function dupSel() { if (!sel || tab !== 'factory') return; const nid = exec('duplicate', { id: sel }); if (nid) select(nid); }

  /* ------------------------------------------------------------------ signals table and run mode (machine) */
  const RUN = { t: 0, v: {}, tags: {}, procs: {}, works: {}, last: 0 };
  function resetRun() {
    const doc = ED.machine.doc; RUN.t = 0; RUN.v = {}; RUN.tags = {}; RUN.procs = {}; RUN.works = {};
    for (const j of doc.joints) RUN.v[j.id] = j.home ?? j.min;
    for (const t of doc.io) RUN.tags[t.tag] = t.type === 'bool' ? false : 0;
    for (const n of doc.nodes) { const d = nodeDef(n); if (d && d.work) RUN.works[n.id] = { dx: 0 }; }
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
  $('bFold').onclick = () => { const b = $('bottom'); b.classList.toggle('fold'); $('bFold').textContent = b.classList.contains('fold') ? '▴ 펼치기' : '▾ 접기'; setTimeout(stage.resize, 0); };

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
    const convs = doc.nodes.filter(n => nodeDef(n)?.conveyor), stops = doc.nodes.filter(n => nodeDef(n)?.stops);
    for (const n of doc.nodes) { const w = RUN.works[n.id]; if (!w) continue; const p = n.transform.position, x = p[0] + w.dx, hw = (n.params.w || 300) / 2;
      const c = convs.find(c => { const q = c.transform.position, Lh = (c.params.length || 3000) / 2; return Math.abs(p[2] - (q[2] + (c.params.h || 900))) < 60 && x >= q[0] - Lh - 1 && x <= q[0] + Lh + 1 && Math.abs(p[1] - q[1]) < (c.params.w || 500) / 2; });
      if (!c) continue; const P = nodeCode(c); if (!tags[`${P}_RUN`]) continue;
      const sp = (tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : c.params.speed || 300) * (tags[`${P}_DIR`] ? -1 : 1) * dt; let nx = x + sp;
      const q = c.transform.position, Lh = (c.params.length || 3000) / 2;
      for (const s of stops) { const sp0 = s.transform.position; if (Math.abs(sp0[1] - q[1]) > (c.params.w || 500) / 2 || !(RUN.v[`${nodeCode(s)}_Z`] > 5)) continue;
        if (sp > 0 && x + hw <= sp0[0] + 1 && nx + hw > sp0[0]) nx = sp0[0] - hw; if (sp < 0 && x - hw >= sp0[0] - 1 && nx - hw < sp0[0]) nx = sp0[0] + hw; }
      const next = convs.some(o => o !== c && Math.abs(o.transform.position[2] - q[2]) < 5 && Math.abs(o.transform.position[1] - q[1]) < 100 && Math.abs((o.transform.position[0] - (o.params.length || 3000) / 2) - (q[0] + Lh)) < 60);
      if (!next) nx = Math.max(q[0] - Lh + hw, Math.min(q[0] + Lh - hw, nx));
      w.dx = nx - p[0]; }
    // sensors, processes, robots
    for (const t of doc.io) {
      if (t.dir !== 'in' || !t.binding) continue; const b = t.binding;
      if (b.kind === 'sensor' && b.target === 'work') { const sn = doc.nodes.find(n => t.tag.startsWith(nodeCode(n) + '_')); if (!sn) continue; const sp = sn.transform.position, range = sn.params.range || 500;
        tags[t.tag] = doc.nodes.some(n => { const w = RUN.works[n.id]; if (!w) return false; const p = n.transform.position, hw = (n.params.w || 300) / 2; return Math.abs(p[0] + w.dx - sp[0]) < hw && Math.abs(p[1] - sp[1]) < range + (n.params.d || 200) / 2; }); }
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
      if (RUN.works[n.id]) placeObj(o, [n.transform.position[0] + RUN.works[n.id].dx, n.transform.position[1], n.transform.position[2]], n.transform.rotation[2]); }
  }
  function setMode(m) {
    if (tab !== 'machine') m = 'edit'; mode = m; document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'run') { resetRun(); log('실행 시작 · 신호 표의 값을 눌러 태그를 켜고 끕니다'); }
    else { for (const v of objs.values()) root.remove(v.obj); objs = new Map(); syncScene(); }
    $('bottom').hidden = !(tab === 'machine' && m === 'run'); setTimeout(stage.resize, 0); drawIo(); updateHint();
  }
  $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });

  /* ------------------------------------------------------------------ picking and dragging */
  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
  let drag = null;
  const setNdc = e => { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  function pick(e) { setNdc(e); const hits = ray.intersectObjects(root.children, true).filter(h => h.object.visible && !h.object.isPoints);
    for (const h of hits) { const id = h.object.userData.pick; if (!id) continue; const o = objs.get(id)?.obj; if (tab === 'factory' && o && o.userData.roof && hits.some(x => x.object.userData.pick && x.object.userData.pick !== id)) continue; return id; } return null; }
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0 || xray) return; const id = pick(e); // X-ray is a view-only mode: dragging only turns the view
    if (!id) { if (!e.shiftKey) select(null); return; }
    select(id); if (mode === 'run') return;
    const o = objs.get(id).obj; plane.constant = 0; if (!ray.ray.intersectPlane(plane, hit)) return;
    drag = { id, o, start: o.position.clone(), grab: hit.clone(), moved: false, sx: e.clientX, sy: e.clientY, armed: false }; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!drag) return; if (!drag.armed) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return; drag.armed = true; } setNdc(e); if (!ray.ray.intersectPlane(plane, hit)) return;
    const d = hit.clone().sub(drag.grab); const step = (tab === 'factory' ? (e.altKey ? 10 : 500) : (e.altKey ? 5 : 50)) / 1000;
    d.x = Math.round(d.x / step) * step; d.z = Math.round(d.z / step) * step; if (d.lengthSq() > 0) drag.moved = true;
    drag.o.position.set(drag.start.x + d.x, drag.start.y, drag.start.z + d.z); drag.d = d; updateSelMark(); if (tab === 'machine') updateEnvelope();
  });
  const endDrag = () => {
    if (!drag) return; const { id, d, moved } = drag; drag = null; controls.enabled = true; if (!moved || !d) return;
    const by = S.sceneToStored([d.x, 0, d.z]);
    if (tab === 'factory') exec('move', { id, by: [by[0], by[1]] });
    else { const n = ED.machine.doc.nodes.find(x => x.id === id); if (!n) return; const p = n.transform.position, np = [p[0] + by[0], p[1] + by[1], p[2]];
      // children ride along
      const kids = []; const walk = pid => { for (const k of ED.machine.doc.nodes.filter(x => x.parent === pid)) { kids.push(k); walk(k.id); } }; walk(id);
      exec('move', { id, position: np }); for (const k of kids) { const q = k.transform.position; exec('move', { id: k.id, position: [q[0] + by[0], q[1] + by[1], q[2]] }, true); } }
  };
  renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag);

  function select(id, focus) { sel = id || null; drawTree(); drawProps(); updateSelMark(); if (tab === 'machine') drawIo(); if (focus && sel) focusSel(); }
  function focusSel() { const o = sel && objs.get(sel)?.obj; if (!o) return; tmpBox.setFromObject(o); if (!tmpBox.isEmpty()) stage.fit(tmpBox.clone().expandByScalar(tab === 'factory' ? 2 : 0.4), 1.2); }
  function fitAll() {
    const doc = ed().doc;
    if (tab === 'factory') { const r = slabRect(doc), a = toS([r.x0, r.y0, 0]), b = toS([r.x1, r.y1, 4000]); stage.fit(new T.Box3().setFromPoints([a, b]), 1.05); }
    else { const [W, D, H] = doc.meta.bbox.map(v => v / 1000), box = new T.Box3(new T.Vector3(-W / 2, 0, -D / 2), new T.Vector3(W / 2, H, D / 2)); for (const v of objs.values()) box.expandByObject(v.obj); stage.fit(box, 1.25); }
  }
  $('views').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'fit') fitAll(); else if (b.dataset.v === 'xray') setXray(!xray); else focusSel(); });
  let xray = false;
  const setXray = on => { xray = on; if (on) { if (drag) { drag = null; controls.enabled = true; } select(null); toast('X-RAY는 보기 전용입니다 · 다시 누르면 편집으로 돌아갑니다'); } updateHint(); if (on) stage.addTwin(root, o => !!(o.userData.node && nodeDef(o.userData.node)?.work)); stage.ghost(on); $('xrayChip').classList.toggle('on', on); };

  /* ------------------------------------------------------------------ keys, toolbar, files */
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); if (mode === 'edit') ed().undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); if (mode === 'edit') ed().redo(); }
    else if (mod && k === 'd') { e.preventDefault(); dupSel(); }
    else if (mod && k === 's') { e.preventDefault(); save(); }
    else if (k === 'r' && !mod) rotateSel();
    else if (k === 'delete' || k === 'backspace') deleteSel();
    else if (k === 'escape') select(null);
    else if (k === 'f') sel ? focusSel() : fitAll();
    else if (k === 'x' && !mod) setXray(!xray);
  });
  $('bUndo').onclick = () => mode === 'edit' && ed().undo();
  $('bRedo').onclick = () => mode === 'edit' && ed().redo();
  for (const id of ['sW', 'sD', 'sH']) $(id).addEventListener('change', () => {
    const doc = ed().doc, w = +$('sW').value, d = +$('sD').value, h = +$('sH').value;
    if (tab === 'factory') { const r = slabRect(doc); if (w > 0 && d > 0) exec('set_slab', { polygon: [[r.x0, r.y0], [r.x0 + w * 1000, r.y0], [r.x0 + w * 1000, r.y0 + d * 1000], [r.x0, r.y0 + d * 1000]] }); }

  });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.t !== tab) switchTab(b.dataset.t); });
  function save() {
    if (tab === 'machine') {
      const doc = ED.machine.doc, all = lib(), m = all[doc.meta.id] || { name: doc.meta.name, versions: {} }, v = Object.keys(m.versions).length ? Math.max(...Object.keys(m.versions).map(Number)) + 1 : 1;
      const sz = contentSize(); if (sz && sz.join() !== doc.meta.bbox.join()) ED.machine.exec('set_meta', { bbox: sz }); const cur = ED.machine.doc;
      const snap = JSON.parse(JSON.stringify(cur)); snap.meta.version = v; snap.card.footprint = [cur.meta.bbox[0], cur.meta.bbox[1]];
      m.name = doc.meta.name; m.versions[v] = snap; all[doc.meta.id] = m; LS.set(KEY.lib, all);
      dirty.machine = false; toast(`설비 카드 저장: ${doc.meta.name} v${v} · 공장 탭의 '내 설비'에 나옵니다`); log(`저장 v${v}`);
    } else { LS.set(KEY.factory, ED.factory.doc); dirty.factory = false; toast('공장을 이 브라우저에 저장했습니다 · 파일로 받으려면 내보내기'); }
    drawCrumb();
  }
  $('bSave').onclick = save;
  $('bExport').onclick = () => { const doc = ed().doc, a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    a.download = `${(doc.meta.name || tab).replace(/[\\/:*?"<>|\s]+/g, '_')}.${tab}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('bOpen').onclick = () => $('file').click();
  $('file').onchange = async () => {
    const f = $('file').files[0]; $('file').value = ''; if (!f) return;
    try { const j = JSON.parse(await f.text()); const scope = j.schema === S.FACTORY_SCHEMA ? 'factory' : j.schema === S.MACHINE_SCHEMA ? 'machine' : null;
      if (!scope) throw new Error('factory.json 또는 machine.json이 아닙니다'); ED[scope] = new C.Editor(scope, j); ED[scope].subscribe(() => { dirty[scope] = true; LS.set(KEY[scope], ED[scope].doc); if (scope === tab) refresh(); });
      LS.set(KEY[scope], ED[scope].doc); switchTab(scope, true); toast(`${j.meta?.name || f.name} 불러옴`); }
    catch (e) { toast('불러오지 못했습니다: ' + (e.message || e), true); }
  };

  /* ------------------------------------------------------------------ chrome */
  function drawCrumb() {
    const doc = ed().doc;
    if (tab === 'factory') $('crumb').innerHTML = `<span>공장</span><span>/</span><b>${esc(doc.meta.name)}</b><span class="ver">${dirty.factory ? '수정됨' : ''}</span>`;
    else { const m = lib()[doc.meta.id], v = m ? Math.max(...Object.keys(m.versions).map(Number)) : 0;
      $('crumb').innerHTML = `<span>설비</span><span>/</span><b>${esc(doc.meta.name)}</b><span class="pill">${doc.meta.fidelity}</span><span class="ver">v0.1.${v}${dirty.machine ? ' · 수정됨' : ''}</span>`; }
  }
  function drawBar() {
    const doc = ed().doc;
    if (tab === 'factory') { const r = slabRect(doc); for (const i of ['sW', 'sD', 'sH']) $(i).readOnly = false; $('sizeLab').textContent = '공장 크기'; $('sW').value = (r.x1 - r.x0) / 1000; $('sD').value = (r.y1 - r.y0) / 1000; $('sH').hidden = $('sHx').hidden = true; $('sizeUnit').textContent = 'm'; $('units').textContent = 'm · deg · Z-up · 스냅 500 mm · 원점 = 왼쪽 아래(입고)'; }
    else { $('sizeLab').textContent = '설비 크기 (자동)'; for (const i of ['sW', 'sD', 'sH']) $(i).readOnly = true; [$('sW').value, $('sD').value, $('sH').value] = contentSize() || doc.meta.bbox; $('sH').hidden = $('sHx').hidden = false; $('sizeUnit').textContent = 'mm'; $('units').textContent = 'mm · deg · Z-up · 스냅 50 mm (Alt 5 mm)'; }
    $('bUndo').disabled = !ed().canUndo || mode === 'run'; $('bRedo').disabled = !ed().canRedo || mode === 'run';
    if (tab === 'factory') { const its = factoryItems(doc); $('chipCount').innerHTML = `객체 <b>${its.length}</b> · 설비 <b>${doc.machines.length}</b>`; $('chipOrigin').hidden = true; }
    else { $('chipCount').innerHTML = `블록 <b>${doc.nodes.length}</b> · 관절 <b>${doc.joints.length}</b> · 태그 <b>${doc.io.length}</b>`; $('chipOrigin').hidden = true; }
  }
  function updateHint() { $('hint').textContent = xray ? 'X-RAY 보기 전용: 끌면 화면이 돌고, 휠은 확대입니다 · X를 다시 누르면 편집' : tab === 'machine' && mode === 'run' ? '실행 중: 아래 조작 패널에서 명령 값을 눌러 켜고 끕니다 · 편집으로 돌아가면 처음 자세로' : '블록을 누른 채 끌면 옮겨집니다 · 빈 곳을 끌면 화면 회전 · 휠 확대 · R 회전 · Delete 삭제'; }
  function refresh() { syncScene(); drawTree(); drawProps(); drawBar(); drawCrumb(); updateSelMark(); if (tab === 'machine') updateEnvelope(); if (tab === 'machine') drawIo(); }
  function switchTab(t, fit) {
    if (mode === 'run') setMode('edit');
    tab = t; LS.set(KEY.tab, t); sel = null; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    for (const v of objs.values()) root.remove(v.obj); objs = new Map(); floorKey = '';
    $('mode').hidden = t !== 'machine'; $('bottom').hidden = true; $('bSave').textContent = t === 'machine' ? '설비 카드 저장' : '저장';
    $('search').value = ''; drawPalette(); refresh(); updateHint(); drawLog(); setTimeout(() => { stage.resize(); fitAll(); }, 0);
  }

  /* ------------------------------------------------------------------ labels (projected HTML) */
  const lblBox = $('labels'), lbls = new Map(), v3 = new T.Vector3();
  function drawLabels() {
    const r = renderer.domElement.getBoundingClientRect(), want = new Set();
    if (tab === 'machine') for (const n of ED.machine.doc.nodes) { if (n.parent && sel !== n.id) continue; want.add(n.id); }
    else for (const it of factoryItems(ED.factory.doc)) if (it.path === 'machines' || it.id === sel) want.add(it.id);
    for (const [id, el] of lbls) if (!want.has(id)) { el.remove(); lbls.delete(id); }
    for (const id of want) {
      const o = objs.get(id)?.obj; if (!o) continue; let el = lbls.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'lbl'; lblBox.appendChild(el); lbls.set(id, el); }
      tmpBox.setFromObject(o); if (tmpBox.isEmpty()) continue; tmpBox.getCenter(v3); v3.y = tmpBox.max.y + 0.05; v3.project(camera);
      const vis = Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05; el.style.display = vis ? '' : 'none'; if (!vis) continue;
      el.style.left = ((v3.x + 1) / 2 * r.width) + 'px'; el.style.top = ((1 - v3.y) / 2 * r.height) + 'px';
      let code, name; if (tab === 'machine') { const n = ED.machine.doc.nodes.find(x => x.id === id); code = nodeCode(n); name = n.name; } else { const it = factoryItems(ED.factory.doc).find(x => x.id === id); code = itemCode(it); name = itemName(it); }
      const html = `${code ? `<b>${esc(code)}</b>` : ''}${esc(name)}`; if (el.innerHTML !== html) el.innerHTML = html; el.classList.toggle('on', id === sel);
    }
  }

  /* ------------------------------------------------------------------ loop */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'run' && tab === 'machine') { stepRun(dt); if ((RUN.frame = (RUN.frame || 0) + 1) % 6 === 0) drawIo(); }
    stage.render(); drawLabels(); requestAnimationFrame(loop);
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
  if (!ED.factory.doc.building.walls.length && !ED.factory.doc.machines.length && !LS.get(KEY.factory + '.seeded', false)) {
    LS.set(KEY.factory + '.seeded', true); const e = ED.factory, r = slabRect(e.doc);
    e.exec('draw_wall', { from: [r.x0, r.y1], to: [r.x1, r.y1], thickness: 200 }); e.exec('draw_wall', { from: [r.x0, r.y0], to: [r.x0, r.y1], thickness: 200 });
    e.exec('add_column_grid', { origin: [6000, 6000], nx: 4, ny: 2, dx: 6000, dy: 8000 });
    e.exec('add_opening', { kind: 'shutter', position: [4000, r.y1], params: { w: 3500, h: 4000 } }); e.exec('add_opening', { kind: 'door', position: [9000, r.y1], params: { w: 1000, h: 2100 } });
    e.exec('add_marking', { kind: 'aisle', polyline: [[2000, 3000], [28000, 3000]], params: { variant: 'aisle', length: 26000, width: 3000 } });
    e.exec('place_machine', { ref: 'lib:press@1', name: L.FACTORY.press.name, position: [8000, 10000], params: { cycle_time: 6, ok_rate: 0.995 } });
    e.exec('add_block', { type: 'conveyor', position: [12500, 10000], params: { variant: 'roller', length: 4000, w: 800, h: 800 } });
    e.exec('place_machine', { ref: 'lib:handling-robot@1', name: L.FACTORY['handling-robot'].name, position: [16500, 10000], params: { cycle_time: 12, ok_rate: 0.999 } });
    e.exec('place_machine', { ref: 'lib:vision-inspection@1', name: L.FACTORY['vision-inspection'].name, position: [19500, 10000], params: { cycle_time: 8, ok_rate: 0.98 } });
    e.exec('add_storage', { kind: 'rack', position: [25000, 15000], params: { variant: 'pallet', bays: 2, levels: 3 } });
    e.exec('add_mover', { kind: 'forklift', position: [22000, 3000] }); e.exec('add_mover', { kind: 'worker', position: [12500, 8800] });
    e.exec('add_block', { type: 'control-cabinet', position: [8000, 12500] }); e.exec('add_block', { type: 'andon-board', position: [14500, 13500], params: { mount: 2800 } });
  }
  dirty = { factory: false, machine: false };
  switchTab(tab);
  requestAnimationFrame(loop);
  window.ONE_BUILD = { ED, stage, select, switchTab, setMode, RUN, get sel() { return sel; } };
})();
