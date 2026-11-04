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
  const newMachine = () => S.Machine.parse({ schema: S.MACHINE_SCHEMA, meta: { id: S.uuidv7(), name: '새 설비', bbox: [4000, 2400, 2000], cellFixed: false, fidelity: 'L2' } });
  // drafts made while a fixed 4000 × 2400 × 2000 cell was the default go back to 블록 따라 (the default now)
  const load = (scope, make) => { const d = LS.get(KEY[scope], null); try { if (!d) return make(); const doc = (scope === 'factory' ? S.Factory : S.Machine).parse(d);
    if (scope === 'machine' && doc.meta.cellFixed && doc.meta.bbox.join() === '4000,2400,2000') doc.meta.cellFixed = false;
    // drafts saved before delete took a block's unbound tags along still carry them (TL1_RED with no TL1): drop those
    if (scope === 'machine') { const codes = new Set(doc.nodes.map(n => n.params.tag).filter(Boolean)), dead = new Set(doc.io.filter(t => { const m = /^([A-Z]+\d+)_/.exec(t.tag); return m && !codes.has(m[1]); }).map(t => t.tag));
      if (dead.size) { doc.io = doc.io.filter(t => !dead.has(t.tag)); for (const st of doc.sequence.steps) { st.wait = st.wait.filter(w => !dead.has(w.tag)); st.set = st.set.filter(x => !dead.has(x.tag)); } } }
    return doc; } catch { return make(); } };
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
  function toast(msg, err, act) { const t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT);
    if (act) { const b = document.createElement('button'); b.textContent = act.label; b.onclick = () => { t.hidden = true; act.run(); }; t.appendChild(b); }
    toastT = setTimeout(() => { t.hidden = true; }, act ? 6000 : err ? 4200 : 2200); }

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
  const nextCode = (doc, code) => { const used = new Set([...doc.nodes.map(nodeCode), ...(doc.io || []).map(t => t.tag.split('_')[0])]); for (let i = 1; ; i++) if (!used.has(code + i)) return code + i; };
  const nodeTop = n => { const d = nodeDef(n); return n.transform.position[2] + (d ? d.top(Object.assign({}, d.params, n.params)) * 1000 : 0); };

  /* ------------------------------------------------------------------ scene objects (rebuilt only when their data changed) */
  let objs = new Map(); // id → { obj, data }
  let slabMesh = null, envelope = null, originMark = null, showOrigin = !!LS.get('one.build.origin', false);
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
      const dot = new T.Mesh(new T.RingGeometry(0.03, 0.045, 24).rotateX(-Math.PI / 2), L.mat('glowA')); dot.position.y = 0.004; originMark.add(dot); originMark.visible = showOrigin; ov.add(originMark);
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
  // the conveyor pieces whose flow the ⇄ button reverses: the picked ones and every piece joined to them (a line flows one way)
  const flowIds = () => { if (tab !== 'machine') return []; const doc = ED.machine.doc, ok = n => n && !n.parent && (nodeDef(n)?.conveyor || nodeDef(n)?.curve || nodeDef(n)?.corner);
    const picked = selIds().filter(id => ok(doc.nodes.find(n => n.id === id))); if (!picked.length) return [];
    return [...joinedConveyors(doc, picked)].filter(id => { const d = nodeDef(doc.nodes.find(n => n.id === id)); return !d.corner && !d.lift; }); };
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

  /* ---- 내 설비 편집: 이름 바꾸기 · Machine Builder에서 열기 · 복제 · 삭제 (a built-in partner station is reset instead) */
  function mineMenu(id, at) { document.querySelectorAll('.mine-menu').forEach(x => x.remove()); const m = lib()[id]; if (!m) return;
    const placed = ED.factory.doc.machines.filter(x => x.ref.startsWith(`local:${id}@`)).length, raw = LS.get(KEY.lib, {});
    const box = document.createElement('div'); box.className = 'mine-menu';
    box.innerHTML = `<b>${esc(m.name)}</b><small>버전 ${Object.keys(m.versions).join(', ')}${placed ? ` · 공장에 ${placed}대` : ''}</small>`
      + Object.keys(m.versions).map(Number).sort((a, b) => b - a).slice(0, 12).map(v => `<button data-mineact="open@${v}" data-id="${esc(id)}">v${v} 열기${v === Math.max(...Object.keys(m.versions).map(Number)) ? ' (최신)' : ''}</button>`).join('')
      + [ ['rename', '이름 바꾸기'], ['dup', '복제'], m.builtin ? (raw[id] ? ['reset', '원래대로 (저장한 버전 지우기)'] : null) : ['del', '삭제']].filter(Boolean).map(([k, t]) => `<button data-mineact="${k}" data-id="${esc(id)}"${k === 'del' || k === 'reset' ? ' class="warn"' : ''}>${t}</button>`).join('');
    at.closest('.item').after(box); setTimeout(() => addEventListener('click', function off(ev) { if (!box.contains(ev.target)) { box.remove(); removeEventListener('click', off, true); } }, true), 0); }
  function mineAct(k, id) { document.querySelectorAll('.mine-menu').forEach(x => x.remove()); const all = LS.get(KEY.lib, {}), m = lib()[id]; if (!m) return;
    const latest = Math.max(...Object.keys(m.versions).map(Number)), placed = ED.factory.doc.machines.filter(x => x.ref.startsWith(`local:${id}@`));
    let ver = latest; if (k.startsWith('open@')) { ver = +k.slice(5); k = 'open'; }
    if (k === 'open') { if (dirty.machine && !confirm('Machine Builder에서 저장하지 않은 변경이 있습니다. 버리고 이 설비를 열까요?')) return;
      openDoc('machine', S.Machine.parse(JSON.parse(JSON.stringify(m.versions[ver])))); dirty.machine = false; switchTab('machine', true); toast(`${m.name} v${ver}를 열었습니다 · 고친 뒤 저장하면 v${latest + 1}이 됩니다`); return; }
    if (k === 'rename') { const n = (prompt('설비 이름', m.name) || '').trim(); if (!n || n === m.name) return;
      const e_ = all[id] || { name: m.name, builtin: !!m.builtin, versions: {} }; e_.name = n; for (const d of Object.values(e_.versions)) d.meta.name = n; all[id] = e_; LS.set(KEY.lib, all);
      if (ED.machine.doc.meta.id === id) exec('set_meta', { name: n }); toast(`이름을 '${n}'(으)로 바꿨습니다`); drawPalette(); refresh(); return; }
    if (k === 'dup') { const nid = S.uuidv7(), d = JSON.parse(JSON.stringify(m.versions[latest])); d.meta.id = nid; d.meta.version = 1; d.meta.name = m.name + ' 복사본';
      all[nid] = { name: d.meta.name, versions: { 1: d } }; LS.set(KEY.lib, all); toast(`'${d.meta.name}'을(를) 만들었습니다`); drawPalette(); return; }
    if (k === 'del' || k === 'reset') { if (placed.length) { toast(`공장에 놓인 ${placed.length}대를 먼저 지워 주세요`); return; }
      if (!confirm(k === 'reset' ? `${m.name}을(를) 원래 협력사 설비(v1)로 되돌릴까요? 저장한 버전은 지워집니다.` : `${m.name}을(를) 내 설비에서 지울까요? 되돌릴 수 없습니다.`)) return;
      delete all[id]; LS.set(KEY.lib, all); toast(k === 'reset' ? '원래 설비로 되돌렸습니다' : '내 설비에서 지웠습니다'); drawPalette(); refresh(); return; } }
  /* ------------------------------------------------------------------ palette */
  let openCats = LS.get('one.build.cats', { building: true, structure: true, transport: true });
  function drawPalette() {
    const q = $('search').value.trim(), box = $('pal'); let html = '';
    const sec = (id, name, items) => {
      const list = items.filter(i => !q || i.name.includes(q) || (i.code || '').toLowerCase().includes(q.toLowerCase())); if (!list.length) return;
      html += `<div class="cat${openCats[id] || q ? ' open' : ''}" data-cat="${id}"><button><span>${esc(name)}</span><small>${list.length}</small></button><div class="items">`
        + list.map(i => `<button class="item" draggable="true" data-add="${esc(i.key)}" title="${esc(i.why || i.name)}"><span class="code">${esc(i.code || '')}${i.grade ? `<i>${i.grade}차</i>` : ''}${i.mine ? `<i class="mine-ed" data-mine="${esc(i.mine)}" title="이름 바꾸기 · 열기 · 복제 · 삭제">⋯</i>` : ''}</span><b>${esc(i.name)}</b></button>`).join('') + '</div></div>';
    };
    if (tab === 'factory') {
      $('palTitle').innerHTML = '에셋 팔레트';
      for (const g of L.FACTORY_GROUPS) sec(g.id, g.name, Object.values(L.FACTORY).filter(d => d.group === g.id && !d.retired).map(d => ({ key: 'f:' + d.id, name: d.name, code: d.process ? d.process.split(' ')[0] : '', grade: d.grade, why: d.why })));
      const mine = Object.entries(lib()).map(([id, m]) => ({ key: 'l:' + id, mine: id, name: m.name, code: 'v' + Math.max(...Object.keys(m.versions).map(Number)), why: m.builtin ? '협력사 설비 · 객체 하나하나의 크기·위치·속도를 Machine Builder에서 바꿀 수 있습니다' : 'Machine Builder에서 저장한 설비' }));
      sec('mine', '내 설비 (Machine Builder에서 저장)', mine.length ? mine : []);
      if (!mine.length && !q) html += '<p class="why">Machine Builder에서 만든 설비를 저장하면 여기에 나옵니다.</p>';
    } else {
      $('palTitle').innerHTML = '블록 팔레트';
      // 내 설비 불러오기: open a saved machine (any version) to keep editing it
      const mineM = Object.entries(lib()).map(([id, m]) => ({ key: 'o:' + id, mine: id, name: m.name, code: 'v' + Math.max(...Object.keys(m.versions).map(Number)), why: '눌러서 불러오기 · ⋯ = 버전 고르기·이름·복제·삭제' }));
      sec('open', '내 설비 불러오기 (저장한 설비 편집)', mineM);
      for (const c of L.MACHINE_CATS) { sec(c.id, c.name, Object.values(L.BLOCKS).filter(b => b.cat === c.id).map(b => ({ key: 'b:' + b.id, name: b.name, code: b.code, why: b.onTop ? '선택한 블록 위에 놓입니다' : '' })));
        if (c.id === 'transport') sec('shapes', '컨베이어 레이아웃 (전환·회송·2단)', Object.entries(SHAPES).map(([id, x]) => ({ key: 's:' + id, name: x.name, code: x.code, why: x.why }))); }
    }
    box.innerHTML = html;
  }
  $('pal').addEventListener('click', e => {
    const c = e.target.closest('.cat>button'); if (c) { const id = c.parentElement.dataset.cat; openCats[id] = !c.parentElement.classList.contains('open'); LS.set('one.build.cats', openCats); c.parentElement.classList.toggle('open'); return; }
    const me = e.target.closest('[data-mine]'); if (me) { e.stopPropagation(); mineMenu(me.dataset.mine, me); return; }
    const mm = e.target.closest('[data-mineact]'); if (mm) { mineAct(mm.dataset.mineact, mm.dataset.id); return; }
    const b = e.target.closest('[data-add]'); if (!b) return; if (mode === 'run') setMode('edit'); if (xray) setXray(false);
    const [k, id] = b.dataset.add.split(/:(.*)/s);
    if (k === 'o') { mineAct('open', id); return; }
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
    'two-level': { name: '상하 2단 순환 라인', code: 'CV×2 LCV×2', why: '상단은 작업, 하단은 회송. 양 끝 리프트 컨베이어가 워크를 싣고 단 사이를 오르내립니다',
      pieces: [{ t: CV, x: 0, y: 0, yaw: 0, p: { h: 900 } }, { t: CV, x: 0, y: 0, yaw: 180, p: { h: 450 } }, { t: 'lift-conveyor', x: 1800, y: 0, yaw: 0, p: { h: 450, stroke: 450 } }, { t: 'lift-conveyor', x: -1800, y: 0, yaw: 0, p: { h: 450, stroke: 450 } }] },
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
  $('pal').addEventListener('dragstart', e => { const b = e.target.closest('[data-add]'); if (!b) return; const [k, id] = b.dataset.add.split(/:(.*)/s); if (k === 'o') { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', b.dataset.add); e.dataTransfer.effectAllowed = 'copy'; startPlace(k, id); });
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
      for (const it of items) { const g = it.path === 'machines' ? '설비' : it.def === 'model-part' ? '셀 객체' : (L.FACTORY[it.def] ? L.FACTORY_GROUPS.find(x => x.id === L.FACTORY[it.def].group)?.name : '기타') || '기타'; (groups[g] || (groups[g] = [])).push(it); }
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
  const howtoMachine = `<ol class="howto"><li><b>왼쪽 팔레트</b>에서 블록을 고르면 커서를 따라다닙니다. 놓을 곳을 누르세요. 센서·스토퍼·워크는 컨베이어 위에 대면 그 위에 올라갑니다.</li><li>블록을 고르면 오른쪽에 길이·속도 같은 값과 <b>조작 패드</b>(이동·회전·높이)가 나옵니다. 방향키도 됩니다.</li><li>로봇·센서 같은 블록을 컨베이어·프레임·단상 위로 옮기면 윗면에 붙습니다. 받침 높이를 바꾸면 같이 움직입니다.</li><li><b>Shift+클릭</b>, 빈 곳 <b>Shift+드래그</b>, <b>Ctrl+A</b>로 여러 개를 골라 한꺼번에 다룹니다.</li><li>위의 <b>동작 시험</b>을 누르면 아래에 Control Panel이 열립니다. 객체마다 ON / OFF를 누르면 설비가 움직이고, 센서·끝 위치 같은 상태는 자동으로 바뀝니다.</li><li>아래 <b>동작 순서</b>의 <b>블록으로 만들기</b>는 놓인 컨베이어·스토퍼·센서·공정·리프트를 보고 순서를 새로 만듭니다(지금 순서는 지워지고 실행 취소로 되돌림). <b>워크 다시 투입</b>은 워크를 처음 놓은 자리로 다시 올려 같은 시험을 반복합니다.</li><li>바닥의 <b>원 + 화살표</b>는 설비 원점과 X 방향(투입 → 배출)을 나타내는 기준 표시입니다. 객체가 아니라 지워지지 않습니다.</li><li>위 막대의 <b>객체 선택</b> 목록으로 이름을 골라 선택하고, <b>전체 지우기</b>로 지금 탭의 객체를 한 번에 지웁니다(Ctrl+Z로 복구).</li><li><b>저장</b>하면 설비 카드가 만들어지고 Factory Builder의 <b>내 설비</b>에 나옵니다.</li></ol>`;
  function drawProps() {
    const doc = ed().doc, box = $('props'); let html = '';
    const many = selIds(), cp = cellParts(sel), wholeCell = cp.length && many.every(id => id === sel || cp.includes(id)); // a split cell picked as a whole shows the cell
    if (many.length > 1 && !wholeCell) {
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
        else if (it.path !== 'building.columns') for (const f of typeof d.fields === 'function' ? d.fields(Object.assign({}, d.params, x.params)) : d.fields || []) { const pv = x.params[f.key] ?? d.params[f.key]; html += field(f, pv, 'p.' + f.key); }
        if (it.path === 'machines') { html += `<span class="k">태그 접두어</span><span class="v">${esc(x.tagPrefix)}</span><span class="k">참조</span><span class="v">${esc(x.ref)}</span>`;
          if (d.size) html += `<span class="k">외곽</span><span class="v">${d.size.join(' × ')} mm</span>`; if (d.process) html += `<span class="k">공정 분류</span><span class="v" style="font-family:var(--sans)">${esc(d.process)}</span>`; }
        const ldoc = it.local && SCN.localDoc(it.local), split = !!x.params?.exploded;
        if (split) { const A = SCN.cellArea(ldoc, x.params); html += `<span class="k" style="grid-column:1/-1;margin-top:6px;color:var(--amber)">셀 영역 · 입구는 −X 변, 출구는 +X 변</span>`;
          for (const [k, lb, v] of [['area_w', '영역 가로', A.w], ['area_d', '영역 세로', A.d], ['area_x', '중심 이동 X', A.x], ['area_y', '중심 이동 Y', A.y]]) html += field(num(k, lb, 'mm', 100), v, 'p.' + k); }
        const cell = it.path === 'blocks' && x.params?.cell && doc.machines.find(m => m.id === x.params.cell);
        if (cell) html += `<span class="k">셀</span><span class="v" style="font-family:var(--sans)">${esc(cell.tagPrefix.split('.').pop())} ${esc(cell.name)}</span><span class="k">동작</span><span class="v" style="font-family:var(--sans)">${x.params.kind === 'robot' ? '로봇 팔 (셀 공정 중 한 사이클 움직임)' : x.params.kind === 'rotary' ? '인덱스 회전 (사이클마다 90°)' : '고정 객체'}</span>`;
        html += `</div>${cell && x.params.kind !== 'static' ? `<p class="why" style="margin-top:10px">고른 동안 동작을 미리 보여 줍니다. 시뮬레이션에서는 셀이 일할 때 움직입니다.</p>` : ''}${split ? `<p class="why" style="margin-top:10px">이 셀은 객체 ${cellParts(x.id).length}개로 나뉘어 있습니다. 객체를 눌러 하나씩 크기·위치·동작 시간을 바꿉니다. 셀을 고르면 객체가 함께 움직입니다. Machine Builder에서 이 설비를 고치면 새 버전이 되고, 새로 놓는 셀부터 반영됩니다(이미 나눈 객체는 그대로).</p><div class="acts"><button class="btn" data-act="editLocal">Machine Builder에서 편집</button></div>` : it.local ? `<p class="why" style="margin-top:10px">${window.OnePlant?.splittable(ldoc) ? '객체로 나누면 공장 안에서 객체 하나하나를 바로 고르고 고칩니다. ' : ''}Machine Builder에서 고치면 새 버전이 되고 이 공장의 같은 설비가 그 버전을 씁니다.</p><div class="acts">${window.OnePlant?.splittable(ldoc) ? '<button class="btn" data-act="split">객체로 나누기</button>' : ''}<button class="btn" data-act="editLocal">Machine Builder에서 편집</button></div>` : ''}</div>${it.path === 'machines' || it.path === 'storage' ? flowSec(x.id) : ''}${it.path === 'building.slabs' ? '' : teleop(true)}`;
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
        html = `<div class="sec"><h2>설비 <small>${doc.meta.fidelity}</small></h2><div class="props"><span class="k">이름</span><input data-k="meta.name" value="${esc(doc.meta.name)}"><span class="k">${doc.meta.cellFixed ? '작업 칸' : '외곽 (블록 기준)'}</span><span class="v">${(doc.meta.cellFixed ? doc.meta.bbox : contentSize() || doc.meta.bbox).join(' × ')} mm</span>
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
      ${tab === 'machine' && flowIds().length ? `<div class="rotr"><button data-flip="1" title="투입과 배출을 바꿉니다 · 제자리에서 돌고, 이어진 라인은 전체가 같이 바뀝니다 · 바닥의 화살표 방향으로 흐릅니다">⇄ 흐름 방향 뒤집기${flowIds().length > 1 ? ` (${flowIds().length}개)` : ''}</button></div>` : ''}
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
  // the open ends of a conveyor piece if it stood at position c: point, outward heading, top, width (stored mm)
  function pieceEnds(n, c) { const d = nodeDef(n); if (!d || n.parent) return []; const p = Object.assign({}, d.params, n.params), r = n.transform.rotation[2] * Math.PI / 180, a = [Math.cos(r), Math.sin(r)], z = n.transform.position[2], top = z + (+p.h || 900);
    if (d.curve) { const g = L.curveGeom({ params: n.params, transform: { position: [c[0], c[1], z], rotation: n.transform.rotation } }), h0 = g.heading(0);
      return [{ pt: g.point(0), hd: [-h0[0], -h0[1]], top, w: +p.w, role: 'in' }, { pt: g.point(1), hd: g.heading(1), top, w: +p.w, role: 'out' }]; }
    const half = d.corner ? (+p.w || 500) / 2 : (+p.length || 3000) / 2, sides = d.corner ? [a, [-a[0], -a[1]], [-a[1], a[0]], [a[1], -a[0]]] : d.conveyor ? [a, [-a[0], -a[1]]] : [];
    return sides.map((h, i) => ({ pt: [c[0] + h[0] * half, c[1] + h[1] * half], hd: h, top, w: +p.w || 500, role: d.corner || d.lift ? 'any' : i ? 'in' : 'out' })); }
  // end to end: an open end of the moved piece meets an open end of another one, facing it (straight, curve, turn module, lift)
  function endSnap(n, c, skip) { const mine = pieceEnds(n, c); if (!mine.length) return null; let best = null;
    for (const b of ED.machine.doc.nodes) { if (b.id === n.id || skip.has(b.id)) continue; const bd = nodeDef(b); if (!bd || !(bd.conveyor || bd.curve || bd.corner)) continue;
      for (const o of pieceEnds(b, b.transform.position)) for (const m of mine) { if (m.hd[0] * o.hd[0] + m.hd[1] * o.hd[1] > -0.98) continue;
        const dx = o.pt[0] - m.pt[0], dy = o.pt[1] - m.pt[1], dist = Math.hypot(dx, dy);
        // a different width is never joined end to end (the work would catch on a rail or drop in the step): say why instead
        if (Math.abs(m.w - o.w) > 1) { if (dist < 400 && (!snapRefused || dist < snapRefused.dist)) snapRefused = { dist, other: b, w: m.w, ow: o.w }; continue; }
        if (dist < 400 && (!best || dist < best.dist)) best = { dist, pos: [Math.round(c[0] + dx), Math.round(c[1] + dy)], h: bd.lift ? +(n.params.h ?? nodeDef(n).params.h) : +(Object.assign({}, bd.params, b.params).h), other: b, pt: o.pt }; } }
    return best; }
  let snapRefused = null;
  function conveyorSnap(n, c, skip) { snapRefused = null; const e = endSnap(n, c, skip), s0 = straightSnap(n, c, skip); return !e ? s0 : !s0 ? e : e.dist <= s0.dist ? e : s0; }
  function straightSnap(n, c, skip) { const doc = ED.machine.doc, d = nodeDef(n); if (!d || !d.conveyor || n.parent) return null;
    const pa = Object.assign({}, d.params, n.params), rA = n.transform.rotation[2] * Math.PI / 180, dA = [Math.cos(rA), Math.sin(rA)], LA = +pa.length;
    let best = null;
    for (const b of doc.nodes) { const bd = nodeDef(b); if (b.id === n.id || !bd || !bd.conveyor || b.parent || skip.has(b.id)) continue;
      const pb = Object.assign({}, bd.params, b.params), rB = b.transform.rotation[2] * Math.PI / 180, dB = [Math.cos(rB), Math.sin(rB)], q = b.transform.position, LB = +pb.length, wB = +pb.w; if (Math.abs(wB - +pa.w) > 1) continue;
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
            // the snapped piece takes the flow of the line it joins (turned in place if its ends faced the wrong way)
            let turned = false; if (flowClashes(ED.machine.doc, n.id).length) { const m = ED.machine.doc.nodes.find(x => x.id === n.id); if (reversePiece(m)) { turned = true;
              if (flowClashes(ED.machine.doc, n.id).length) { reversePiece(ED.machine.doc.nodes.find(x => x.id === n.id)); turned = false; } } }
            setTimeout(() => toast(`${nodeCode(n)}을(를) ${nodeCode(sn.other)}에 붙였습니다 · 높이 ${sn.h} mm${turned ? ' · 흐름 방향도 라인에 맞춰 돌렸습니다' : ''}`), 0); }
          else if (snapRefused) { const r = snapRefused, id = n.id; setTimeout(() => toast(`폭이 달라 ${nodeCode(r.other)}에 붙이지 않았습니다 (${r.w} / ${r.ow} mm)`, true,
            { label: `폭 맞추기 (→ ${r.ow})`, run: () => { setParamKeepKids(id, 'w', r.ow); select(id); moveSelBy([0, 0, 0]); refresh(); } }), 0); } }
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
  /* conveyors that are really joined: an open end meets an open end face to face (gap ≤ 10 mm), or an end sits on the side
     of another (90° transfer), with the same width and the same top (a lift also at its upper stop). Pieces that only lie
     near each other, or that the snap refused (different width), are not a line and move on their own. */
  function joinedConveyors(doc, start, stop) { const cv = doc.nodes.filter(n => !n.parent && (nodeDef(n)?.conveyor || nodeDef(n)?.corner || nodeDef(n)?.curve)), P = n => Object.assign({}, nodeDef(n).params, n.params);
    const E = new Map(cv.map(n => [n.id, pieceEnds(n, n.transform.position)])), tops = n => { const t = nodeTop(n); return nodeDef(n).lift ? [t, t + +P(n).stroke] : [t]; };
    const level = (a, b) => tops(a).some(x => tops(b).some(y => Math.abs(x - y) < 5));
    const side = (e, b) => { const d = nodeDef(b); if (!d.conveyor || d.curve) return false; const r = b.transform.rotation[2] * Math.PI / 180, ax = [Math.cos(r), Math.sin(r)];
      if (Math.abs(e.hd[0] * ax[0] + e.hd[1] * ax[1]) > 0.02) return false; const dx = e.pt[0] - b.transform.position[0], dy = e.pt[1] - b.transform.position[1], a = dx * ax[0] + dy * ax[1], l = -dx * ax[1] + dy * ax[0];
      return Math.abs(a) <= +P(b).length / 2 + 1 && Math.abs(Math.abs(l) - +P(b).w / 2) <= 10 && Math.abs(e.w - +P(b).w) <= 1; };
    const meets = (a, b) => level(a, b) && (E.get(a.id).some(m => E.get(b.id).some(o => m.hd[0] * o.hd[0] + m.hd[1] * o.hd[1] < -0.98 && Math.hypot(o.pt[0] - m.pt[0], o.pt[1] - m.pt[1]) <= 10 && Math.abs(m.w - o.w) <= 1))
      || E.get(a.id).some(m => side(m, b)) || E.get(b.id).some(o => side(o, a)));
    const out = new Set(start), q = [...start]; while (q.length) { const id = q.shift(), a = cv.find(n => n.id === id); if (!a) continue; for (const b of cv) if (!out.has(b.id) && !(stop && stop.has(b.id)) && meets(a, b)) { out.add(b.id); q.push(b.id); } }
    return out; }
  /* flow direction (진행 방향): a straight piece (and a lift) carries along its +X, a curve from its 'in' end to its 'out' end.
     Reversing a piece keeps it where it is: a straight one turns 180° in place, a curve swaps left/right and turns ∓90°, which
     is the same arc run the other way. A line flows one way, so reversing a piece of a joined line reverses the whole line. */
  const yawN = a => ((Math.round(a) % 360) + 360) % 360;
  function reversePiece(n) { const d = nodeDef(n); if (!d || d.corner || d.lift) return false; /* a lift rolls both ways (DIR) */ const yaw = n.transform.rotation[2];
    if (d.curve) { const right = (n.params.turn ?? d.params.turn) === 'right'; exec('set_param', { id: n.id, key: 'turn', value: right ? 'left' : 'right' }, true); exec('move', { id: n.id, rotation: [0, 0, yawN(yaw + (right ? 90 : -90))] }, true); }
    else exec('move', { id: n.id, rotation: [0, 0, yawN(yaw + 180)] }, true); return true; }
  function reverseLine(ids, why) { const doc0 = ED.machine.doc; let lift = [...joinedConveyors(doc0, ids)].some(id => nodeDef(doc0.nodes.find(n => n.id === id))?.lift);
    ed().batch('flow', () => { for (const id of ids) { const n = ED.machine.doc.nodes.find(x => x.id === id); if (n) reversePiece(n); }
      if (lift && doc0.sequence.steps.length) exec('set_sequence', { steps: genSequence(ED.machine.doc) }, true); });
    refresh(); toast(`${why || '흐름 방향을 뒤집었습니다'}${ids.length > 1 ? ` · 이어진 ${ids.length}개 전체` : ''}${lift ? ' · 리프트 동작 순서도 다시 만들었습니다' : ''}`); }
  // two joined ends that both push out (or both take in): the work would meet head-on there
  function flowClashes(doc, onlyId) { const cv = doc.nodes.filter(n => !n.parent && (nodeDef(n)?.conveyor || nodeDef(n)?.curve || nodeDef(n)?.corner)), out = [];
    const E = cv.map(n => pieceEnds(n, n.transform.position).map(e => Object.assign(e, { n })));
    for (let i = 0; i < cv.length; i++) for (let j = i + 1; j < cv.length; j++) { if (onlyId && cv[i].id !== onlyId && cv[j].id !== onlyId) continue;
      for (const a of E[i]) for (const b of E[j]) if (a.role !== 'any' && a.role === b.role && a.hd[0] * b.hd[0] + a.hd[1] * b.hd[1] < -0.98 && Math.hypot(a.pt[0] - b.pt[0], a.pt[1] - b.pt[1]) < 60) out.push({ a, b }); }
    return out; }
  /* 설계 검사 (design check): what a real line would not run with. Joints = two open ends facing each other within 60 mm.
     Width or height that differ at a joint, a gap, a work wider than the conveyor or too short for the rollers, a work that
     cannot pass a curve, works lying on each other. Each issue names its objects, a point to mark and, where it is clear, a fix. */
  const ROLLER_PITCH = 100, RAIL = 20;
  function designIssues(doc) { const out = [], cv = doc.nodes.filter(n => !n.parent && (nodeDef(n)?.conveyor || nodeDef(n)?.curve || nodeDef(n)?.corner)), P = n => Object.assign({}, nodeDef(n).params, n.params);
    const ends = cv.map(n => pieceEnds(n, n.transform.position).map(e => Object.assign(e, { n })));
    for (let i = 0; i < cv.length; i++) for (let j = i + 1; j < cv.length; j++) for (const a of ends[i]) for (const b of ends[j]) {
      if (a.hd[0] * b.hd[0] + a.hd[1] * b.hd[1] > -0.98) continue; const gx = b.pt[0] - a.pt[0], gy = b.pt[1] - a.pt[1], gap = Math.hypot(gx, gy); if (gap >= 60) continue;
      const A = a.n, B = b.n, at = [(a.pt[0] + b.pt[0]) / 2, (a.pt[1] + b.pt[1]) / 2, Math.max(a.top, b.top)], ca = nodeCode(A), cb = nodeCode(B);
      if (Math.abs(a.w - b.w) > 1) out.push({ lv: 'err', ids: [A.id, B.id], at, txt: `${ca} · ${cb} 폭이 다릅니다 (${a.w} / ${b.w} mm) · 워크가 레일에 걸립니다`,
        fix: { label: `폭 맞추기 (${cb} → ${a.w})`, run: () => setParamKeepKids(B.id, 'w', a.w) } });
      if (a.role !== 'any' && a.role === b.role) { const side = [...joinedConveyors(doc, [B.id], new Set([A.id]))];
        out.push({ lv: 'err', ids: [A.id, B.id], at, txt: `${ca} · ${cb} 흐름이 이음에서 맞섭니다 (${a.role === 'out' ? '배출끼리' : '투입끼리'}) · 워크가 지나갈 수 없습니다`,
          fix: { label: `흐름 맞추기 (${cb}${side.length > 1 ? ` 쪽 ${side.length}개` : ''} 뒤집기)`, run: () => side.forEach(id => { const x = ED.machine.doc.nodes.find(y => y.id === id); if (x) reversePiece(x); }) } }); }
      const lift = nodeDef(A).lift ? A : nodeDef(B).lift ? B : null, dt = b.top - a.top;
      if (Math.abs(dt) > 5 && !(lift && Math.abs(Math.abs(dt) - +P(lift).stroke) <= 5)) { const hk = nodeDef(B).heightKey;
        out.push({ lv: 'err', ids: [A.id, B.id], at, txt: `${ca} · ${cb} 반송 높이가 ${Math.abs(Math.round(dt))} mm 다릅니다 · 이음에 턱이 생깁니다`,
          fix: hk && !lift ? { label: `높이 맞추기 (${cb} → ${Math.round(+P(B)[hk] - dt)})`, run: () => setParamKeepKids(B.id, hk, Math.round(+P(B)[hk] - dt)) } : null }); }
      if (gap > 10) out.push({ lv: 'warn', ids: [A.id, B.id], at, txt: `${ca} · ${cb} 이음 틈 ${Math.round(gap)} mm · 작은 워크가 빠질 수 있습니다`,
        fix: { label: '틈 붙이기', run: () => moveNode(B.id, [-Math.round(gx), -Math.round(gy), 0]) } }); }
    // works: across = the side facing the rails, along = the length the rollers carry
    const works = doc.nodes.filter(n => nodeDef(n)?.work), dims = w => { const p = P(w), base = doc.nodes.find(x => x.id === w.parent), th = ((w.transform.rotation[2] - (base ? base.transform.rotation[2] : 0)) * Math.PI) / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
      return { along: +p.w * c + +p.d * s, across: +p.w * s + +p.d * c, base }; };
    for (const w of works) { const { along, across, base } = dims(w), bd = base && nodeDef(base), c = nodeCode(w) || w.name, at = [...w.transform.position];
      if (!bd || !(bd.conveyor || bd.curve || bd.corner)) continue; const W = +P(base).w;
      if (across > W - RAIL) out.push({ lv: 'err', ids: [w.id, base.id], at, txt: `${c} 폭 ${Math.round(across)} mm가 ${nodeCode(base)} 레일 사이 ${W - RAIL} mm에 안 들어갑니다 (컨베이어 폭 ${W} − 레일 ${RAIL})`, fix: null });
      const roller = (base.blockType || "").includes('roller') || bd.lift;
      if (roller && along < ROLLER_PITCH * 3) out.push({ lv: 'warn', ids: [w.id], at, txt: `${c} 길이 ${Math.round(along)} mm · 롤러 ${Math.max(1, Math.floor(along / ROLLER_PITCH))}개에만 얹혀 흔들립니다 (3개 이상 = ${ROLLER_PITCH * 3} mm)`, fix: null }); }
    // curves: the work's outer corner swings out, sqrt((R+a/2)^2 + (L/2)^2) - (R - a/2) must fit between the rails
    for (const n of cv.filter(n => nodeDef(n).curve)) { const p = P(n), R = +p.r, W = +p.w;
      for (const w of works) { const { along, across } = dims(w), need = Math.hypot(R + across / 2, along / 2) - (R - across / 2);
        if (need > W - RAIL) { const k = W - RAIL - across / 2, rMin = 2 * k > across ? Math.ceil((across * across / 4 + along * along / 4 - k * k) / (2 * k - across) / 50) * 50 : 0, g = L.curveGeom(n), m = g.point(0.5); out.push({ lv: 'warn', ids: [n.id, w.id], at: [m[0], m[1], n.transform.position[2] + +p.h], txt: `${nodeCode(w) || w.name}이(가) ${nodeCode(n)} 커브(R ${R})를 돌 때 모서리가 ${Math.round(need)} mm를 쓰는데 레일 사이는 ${W - RAIL} mm입니다 · ` + (rMin ? `반경을 R ${rMin} 이상으로 키우거나 워크를 줄이세요` : '이 폭의 라인으로는 돌 수 없습니다 · 워크를 줄이세요'), fix: null }); break; } } }
    // works lying on each other (same base, footprints overlap)
    for (let i = 0; i < works.length; i++) for (let j = i + 1; j < works.length; j++) { const a = works[i], b = works[j]; if ((a.parent || null) !== (b.parent || null)) continue;
      const fp = w => { const p = P(w), r = w.transform.rotation[2] * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)); return [(+p.w * c + +p.d * s) / 2, (+p.w * s + +p.d * c) / 2]; }, ea = fp(a), eb = fp(b), pa = a.transform.position, pb = b.transform.position;
      if (Math.abs(pa[0] - pb[0]) < ea[0] + eb[0] - 1 && Math.abs(pa[1] - pb[1]) < ea[1] + eb[1] - 1 && Math.abs(pa[2] - pb[2]) < 1) out.push({ lv: 'err', ids: [a.id, b.id], at: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, pa[2]], txt: `${nodeCode(a) || a.name} · ${nodeCode(b) || b.name} 워크가 서로 겹쳐 있습니다`, fix: null }); }
    return out; }
  const chkG = new T.Group(); ov.add(chkG); let issues = [];
  const chkMat = { err: new T.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }), warn: new T.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }) }, chkGeo = new T.RingGeometry(0.07, 0.11, 28).rotateX(-Math.PI / 2);
  function updateCheck() { const on = tab === 'machine' && mode !== 'run'; issues = on ? designIssues(ED.machine.doc) : []; chkG.clear();
    for (const it of issues) { const m = new T.Mesh(chkGeo, chkMat[it.lv]), p = toS(it.at); m.position.set(p.x, p.y + 0.015, p.z); m.renderOrder = 10; chkG.add(m); }
    if (!on) $('chkList').hidden = true; // the check is a Machine Builder tool: its list closes in Factory Builder and in 동작 시험
    const b = $('chkChip'), ne = issues.filter(i => i.lv === 'err').length; b.hidden = !on; b.textContent = issues.length ? `설계 검사 ⚠ ${issues.length}` : '설계 검사 ✓'; b.classList.toggle('bad', ne > 0); b.classList.toggle('warn', !ne && issues.length > 0);
    if (!$('chkList').hidden) drawCheck(); }
  function drawCheck() { $('chkRows').innerHTML = issues.length ? issues.map((it, i) => `<div class="chkrow ${it.lv}" data-ci="${i}"><span>${it.lv === 'err' ? '●' : '▲'}</span><p>${esc(it.txt)}</p>${it.fix ? `<button data-cf="${i}">${esc(it.fix.label)}</button>` : ''}</div>`).join('') : '<p class="ok">문제가 없습니다 · 이음 폭·높이·틈, 워크 크기, 커브 통과, 워크 겹침을 봤습니다</p>'; }
  $('chkChip').onclick = () => { const on = $('chkList').hidden; $('chkList').hidden = !on; if (on) { $('objList').hidden = true; drawCheck(); } };
  $('chkRows').onclick = e => { const f = e.target.closest('[data-cf]'); if (f) { const it = issues[+f.dataset.cf]; if (it?.fix) { ed().batch('design fix', () => it.fix.run()); refresh(); toast(`고쳤습니다 · ${it.fix.label}`); } return; }
    const r = e.target.closest('[data-ci]'); if (!r) return; const it = issues[+r.dataset.ci]; if (!it) return; select(it.ids[0], true); if (it.ids.length > 1) { multi = new Set(it.ids); drawTree(); updateSelMark(); } };
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
  // 공정 흐름 of a placed machine: what comes in, what goes out, delete one, link to the next machine
  const VIA_KO = { auto: '자동', conveyor: '컨베이어', amr: 'AMR', forklift: '지게차', worker: '작업자' };
  function flowSec(id) { const doc = ED.factory.doc, items = factoryItems(doc), nm = end => { const x = items.find(y => y.id === end.split('.')[0]); return x ? (itemCode(x) || itemName(x)) : '?'; };
    const mine = doc.flows.filter(f => f.from.split('.')[0] === id || f.to.split('.')[0] === id), others = items.filter(x => (x.path === 'machines' || x.path === 'storage') && x.id !== id && !doc.flows.some(f => f.from.split('.')[0] === id && f.to.split('.')[0] === x.id));
    return `<div class="sec"><h2>공정 흐름 <small>${mine.length}</small></h2>${mine.map(f => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px"><span style="flex:1">${f.to.startsWith(id + '.') ? '들어옴' : '나감'} · <b style="font-family:var(--mono)">${esc(nm(f.from))} → ${esc(nm(f.to))}</b> <span style="color:var(--mute)">${VIA_KO[f.via] || f.via}</span></span><button class="btn" data-pickflow="${f.id}" title="흐름을 골라 운반 수단·비율을 바꿉니다">편집</button><button class="btn" data-delflow="${f.id}">삭제</button></div>`).join('') || '<p class="why">아직 이어진 흐름이 없습니다.</p>'}
      ${others.length ? `<div class="props" style="margin-top:8px"><span class="k">다음 설비로 잇기</span><select data-k="flow.new"><option value="">— 고르기 —</option>${others.map(x => `<option value="${x.id}">${esc((itemCode(x) ? itemCode(x) + ' ' : '') + itemName(x))}</option>`).join('')}</select></div>` : ''}
      <p class="why" style="margin-top:6px">화면에서는 주황 출구 화살표를 끌어 다음 설비에 놓아도 이어집니다. 흐름 선이나 라벨을 눌러도 편집·삭제할 수 있습니다.</p></div>`; }
  $('props').addEventListener('change', e => {
    if ('tstep' in e.target.dataset || 'tang' in e.target.dataset) { const v = Math.abs(+e.target.value); if (v > 0) TELE[tab]['tstep' in e.target.dataset ? 'step' : 'ang'] = Math.min('tang' in e.target.dataset ? 180 : 100000, v); drawProps(); return; }
    const k = e.target.dataset.k; if (!k || !sel && !k.startsWith('meta.') && !k.startsWith('card.')) return;
    const raw = e.target.value, v = e.target.type === 'number' ? (raw === '' ? null : +raw) : raw, doc = ed().doc;
    if (k === 'meta.name') { exec('set_meta', { name: raw || (tab === 'factory' ? '공장' : '설비') }); return; }
    if (k === 'flow.new') { if (!raw) return; const nid = exec('connect_flow', { from: `${sel}.outlet`, to: `${raw}.inlet` }); if (nid) toast('흐름을 이었습니다 · 운반 수단은 흐름 편집에서 고릅니다'); return; }
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
    if (D.act === 'rot') rotateSel(); else if (D.act === 'del') deleteSel(); else if (D.act === 'dup') dupSel(); else if (D.act === 'editLocal') editLocal(); else if (D.act === 'example') loadExample(); else if (D.act === 'split') splitCell();
    else if (D.mv) nudge(D.mv, e.shiftKey); else if (D.rot) turnSel(+D.rot * TELE[tab].ang); else if (D.flip) { if (mode !== 'run' && !xray) reverseLine(flowIds()); } else if (D.z) raiseSel(+D.z * TELE.machine.step * (e.shiftKey ? 5 : 1));
    else if (D.preset) { TELE[tab].step = +D.preset; drawProps(); }
    else if (D.delflow) { exec('delete', { id: D.delflow }); toast('흐름을 지웠습니다 · 실행 취소로 되돌립니다'); } else if (D.pickflow) select(D.pickflow); });

  function rotateSel() { turnSel(90); }
  function deleteSel() { if (!sel || mode === 'run' || xray) return; if (isSlab(sel)) { toast('바닥 슬래브는 지울 수 없습니다. 크기를 바꿔 주세요'); return; }
    const ids = selIds(); ed().batch(ids.length > 1 ? `delete ${ids.length}` : 'delete', () => { for (const id of ids) if (tab === 'factory' ? factoryItems(ed().doc).some(x => x.id === id) || ed().doc.flows.some(x => x.id === id) : ed().doc.nodes.some(x => x.id === id)) exec('delete', { id }, true); });
    if (ids.length > 1) toast(`${ids.length}개 삭제 · Ctrl+Z로 되돌립니다`); select(null); }
  function dupSel() { if (!sel || tab !== 'factory' || isSlab(sel)) return; const ids = selIds(), out = [], map = {};
    ed().batch(ids.length > 1 ? `duplicate ${ids.length}` : 'duplicate', () => { for (const id of ids) { const src = factoryItems(ed().doc).find(x => x.id === id), nid = exec('duplicate', { id }, true); if (nid) { out.push(nid); map[id] = nid; if (src) exec('rename', { id: nid, name: nextName(ed().doc, (src.item.name || itemName(src)).replace(/ \d+$/, '')) }, true); } }
      // a copied cell takes its copied objects along
      for (const nid of out) { const b = ed().doc.blocks.find(x => x.id === nid); if (b && map[b.params.cell]) exec('set_param', { id: nid, key: 'cell', value: map[b.params.cell] }, true); } }); selectMany(out); }
  function selectAll() { const doc = ed().doc; selectMany(tab === 'factory' ? factoryItems(doc).map(x => x.id) : doc.nodes.filter(n => !n.parent).map(n => n.id)); }

  /* ------------------------------------------------------------------ signals table and run mode (machine) */
  const RUN = { t: 0, v: {}, tags: {}, procs: {}, works: {}, last: 0 };
  function resetRun() {
    const doc = ED.machine.doc; RUN.t = 0; RUN.v = {}; RUN.tags = {}; RUN.procs = {}; RUN.works = {};
    for (const j of doc.joints) RUN.v[j.id] = j.home ?? j.min;
    for (const t of doc.io) RUN.tags[t.tag] = t.type === 'bool' ? false : 0;
    for (const n of doc.nodes) { const d = nodeDef(n); if (d && d.work) RUN.works[n.id] = { p: [n.transform.position[0], n.transform.position[1]], z: n.transform.position[2] }; }
  }
  const fmtVal = (t, v) => t.type === 'bool' ? (v ? '켜짐' : '꺼짐') : (+v).toFixed(t.type === 'int' ? 0 : 1);
  // plain meaning of a signal from its suffix (PLC view: 명령 = PLC → 설비, 상태 = 설비 → PLC)
  const MEAN = { PRESENT: '워크 있음', RUN: '운전', DIR: '역방향', SPEED: '속도 지정 (mm/s)', FAULT: '이상', UP: '올리기', IS_UP: '올라감', IS_DOWN: '내려감', ON: '감지됨 / 켜기', EXT: '전진', IS_EXT: '전진 끝', IS_RET: '후진 끝',
    CLOSE: '잡기', IS_CLOSED: '잡음', IS_OPEN: '벌림', OK: '양품 / 정상', NG: '불량', START: '시작', BUSY: '작업 중', DONE: '완료', READY: '준비됨', TRIG: '촬영', SERVO_ON: '서보 켜기', POS: '위치 지정 (mm)',
    INPOS: '위치 도착', ALARM: '알람', INDEX: '회전 각도 지정 (°)', PROG: '프로그램 번호', START_PB: '시작 버튼', STOP_PB: '정지 버튼', ESTOP: '비상정지 버튼', RED: '빨간 램프', YEL: '노란 램프', GRN: '초록 램프', NEXT: '다음 트레이', EMPTY: '비었음' };
  const meaning = (t, P) => { const k = t.tag.slice(P.length + 1); return MEAN[k] || (k === 'ON' && t.dir === 'in' ? '감지됨' : k); };
  // Signal = the on/off (bool) points that the 동작 시험 really reads or writes: commands that move a joint, roll a
  // belt (RUN, DIR) or start a process, end-position / presence sensors, process results (DONE, OK, NG), panel
  // buttons (START / STOP / 비상정지 act on 자동 운전 and motion), lamps and servo-on. Set-points (speed, position,
  // program no.) and diagnostics nothing sets yet (fault, alarm, empty) are tags too, but they sit under "기타 태그".
  const HMI = /_(START_PB|STOP_PB|ESTOP|RED|YEL|GRN|SERVO_ON)$/;
  function realSignals(doc) { const ref = new Set(doc.io.map(t => t.binding?.target).filter(Boolean)), belts = new Set(), corners = new Set(), procs = new Set();
    for (const n of doc.nodes) { const d = nodeDef(n); if (!d) continue; const P = nodeCode(n); if (d.conveyor || d.curve) belts.add(P); if (d.corner) corners.add(P); if (!d.conveyor) procs.add(P); }
    const pre = t => t.tag.replace(/_[A-Z]+$/, '');
    return new Set(doc.io.filter(t => t.type === 'bool' && !/_(FAULT|ALARM|EMPTY)$/.test(t.tag) && (t.binding || ref.has(t.tag) || HMI.test(t.tag)
      || (/_DIR$/.test(t.tag) && belts.has(pre(t))) || (/_RUN$/.test(t.tag) && corners.has(pre(t))) || (/_(NG|DONE|OK|BUSY|READY)$/.test(t.tag) && t.dir === 'in' && procs.has(pre(t))))).map(t => t.tag)); }
  const IO = { all: false };
  function drawIo() {
    const doc = ED.machine.doc, selP = sel && nodeCode(doc.nodes.find(n => n.id === sel) || { params: {} }), real = realSignals(doc), extra = doc.io.length - real.size;
    $('ioN').textContent = `Signal ${real.size}개`; $('tblN').textContent = IO.all ? `${doc.io.length}개 (기타 태그 포함)` : `${real.size}개`; $('ioAll').textContent = IO.all ? '기타 태그 숨기기' : `기타 태그 ${extra}개 보기`; $('ioAll').hidden = !extra;
    const owner = t => doc.nodes.find(n => t.tag.startsWith(nodeCode(n) + '_'));
    // ON / OFF for every object that can be switched (its real command signals)
    const sw = []; for (const n of doc.nodes) { const P = nodeCode(n), nd = nodeDef(n), outs = doc.io.filter(t => t.dir === 'out' && t.type === 'bool' && real.has(t.tag) && owner(t) === n && !(/_DIR$/.test(t.tag) && !nd?.lift)); if (!outs.length) continue;
      sw.push(`<div class="sw${selP === P ? ' hl' : ''}"><b>${esc(P)}</b><span class="nm">${esc(n.name)}</span>${outs.map(t => { const on = !!RUN.tags[t.tag];
        return `<span class="swl">${outs.length > 1 || !/_RUN$/.test(t.tag) ? esc(meaning(t, P)) : ''}<span class="onoff"><button data-sw="${esc(t.tag)}" data-v="1" class="${on ? 'on' : ''}">ON</button><button data-sw="${esc(t.tag)}" data-v="0" class="${on ? '' : 'off'}">OFF</button></span></span>`; }).join('')}</div>`); }
    $('ioSw').innerHTML = sw.join('') || '<small>켜고 끌 수 있는 객체가 없습니다</small>'; fitSwRows(); $('swN').textContent = sw.length ? `${sw.length}개 객체` : '';
    $('io').innerHTML = doc.io.filter(t => IO.all || real.has(t.tag)).map(t => { const n = owner(t), P = n ? nodeCode(n) : '', v = RUN.tags[t.tag], auto = !!t.binding || (t.dir === 'in' && /_(NG|DONE|OK|BUSY|READY)$/.test(t.tag)), manual = mode === 'run' && (t.dir === 'out' || !auto);
      const kind = !real.has(t.tag) ? '기타 태그' : t.dir === 'out' ? '명령' : auto ? '상태 (자동)' : '상태 (직접 켜기)';
      return `<tr class="${selP && P === selP ? 'hl' : ''}${real.has(t.tag) ? '' : ' xtra'}"><td class="ko">${esc(n ? n.name : '')}</td><td>${esc(t.tag)}</td><td class="ko">${esc(meaning(t, P))}</td><td><span class="kind">${kind}</span></td><td class="val${manual ? ' click' : ''}${v === true ? ' on' : ''}" data-tag="${esc(t.tag)}">${fmtVal(t, v)}</td></tr>`; }).join('')
      || '<tr><td colspan="5" style="color:var(--dim);font-family:var(--sans)">블록을 놓으면 그 블록의 신호가 여기에 생깁니다.</td></tr>';
  }
  // the ON / OFF area shows whole rows only (a scrolled half-row looked cut off)
  function fitSwRows() { const el = $('ioSw'), ctl = el.closest('.ctl'), card = el.querySelector('.sw'); if (!ctl || !card || $('subSw').classList.contains('shut')) return;
    const rowH = card.offsetHeight + 6, heads = [...ctl.querySelectorAll('.bhead, .shead')].reduce((a, x) => a + x.offsetHeight, 0), tbl = $('subTbl').classList.contains('shut') ? 0 : 96;
    const rows = Math.max(1, Math.floor((ctl.clientHeight - heads - tbl - 16 + 6) / rowH)); el.style.maxHeight = (rows * rowH - 6 + 8) + 'px'; }
  new ResizeObserver(() => fitSwRows()).observe($('bottom'));
  $('ioAll').onclick = () => { IO.all = !IO.all; drawIo(); };
  $('ioSw').addEventListener('pointerdown', e => { const b = e.target.closest('[data-sw]'); if (!b || mode !== 'run') return; const v = b.dataset.v === '1'; if (!!RUN.tags[b.dataset.sw] === v) return;
    RUN.tags[b.dataset.sw] = v; log(`${b.dataset.sw} ${v ? 'ON' : 'OFF'}`); drawIo(); });
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
    const convs = B.filter(x => (x.d.conveyor || x.d.corner || x.d.curve) && !x.d.lift && out(`${x.P}_RUN`)), stops = B.filter(x => x.d.stops && out(`${x.P}_UP`)), sens = B.filter(x => x.d.sensor && io.has(`${x.P}_ON`));
    const procs = B.filter(x => !x.d.conveyor).map(x => ({ ...x, go: out(`${x.P}_START`) ? `${x.P}_START` : out(`${x.P}_TRIG`) ? `${x.P}_TRIG` : null, done: io.has(`${x.P}_DONE`) ? `${x.P}_DONE` : io.has(`${x.P}_OK`) ? `${x.P}_OK` : null })).filter(x => x.go && x.done);
    const near = (a, b) => Math.hypot(a.n.transform.position[0] - b.n.transform.position[0], a.n.transform.position[1] - b.n.transform.position[1]);
    const sensor = stops.length && sens.length ? sens.slice().sort((a, b) => near(a, stops[0]) - near(b, stops[0]))[0] : sens[0];
    const steps = []; let k = 0; const S = (name, o = {}) => { const st = Object.assign({ id: `s${++k}`, name, wait: [], set: [] }, o); steps.push(st); return st; };
    const up = v => stops.map(x => ({ tag: `${x.P}_UP`, value: v }));
    S('준비 · 컨베이어 운전, 스토퍼 올림', { set: [...convs.map(x => ({ tag: `${x.P}_RUN`, value: true })), ...up(true)] });
    const liftOnly = B.filter(x => x.d.lift).length >= 2 && !sensor && !procs.length;
    const arrive = sensor ? S(`워크 도착 대기 (${sensor.P})`, { wait: [{ tag: `${sensor.P}_ON`, op: '==', value: true }], delay: 0.3 }) : liftOnly ? null : S('워크 도착 (센서 없음 · 시간으로)', { delay: 3 });
    for (const p of procs) { S(`${p.P} 작업 시작`, { set: [{ tag: p.go, value: true }] }); S(`${p.P} 완료 대기`, { wait: [{ tag: p.done, op: '==', value: true }], set: [{ tag: p.go, value: false }] }); }
    if (!procs.length && !liftOnly) S('공정 (카드 사이클)', { delay: +doc.card.cycle_time || 5 });
    if (stops.length) { S('배출 · 스토퍼 내림', { set: up(false) }); S('워크 빠짐 대기 · 스토퍼 올림', sensor ? { wait: [{ tag: `${sensor.P}_ON`, op: '==', value: false }], set: up(true), delay: 0.5 } : { delay: 3, set: up(true) }); }
    const loop = liftSteps(doc, B, S); steps[steps.length - 1].next = [(arrive || loop || steps[0]).id]; return steps; }
  // two-level line: the lift at the end of the upper line takes the work down, the lower line returns it, the other lift
  // brings it back up. Lift A = the one at the outlet end of the highest conveyor.
  function liftSteps(doc, B, S) {
    const lifts = B.filter(x => x.d.lift), convs = B.filter(x => x.d.conveyor && !x.d.lift); if (lifts.length < 2 || !convs.length) return null;
    const par = x => Object.assign({}, x.d.params, x.n.params), top = x => x.n.transform.position[2] + (+par(x).h || 900), ax = x => { const r = x.n.transform.rotation[2] * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; };
    const upper = convs.slice().sort((a, b) => top(b) - top(a))[0], ua = ax(upper), q = upper.n.transform.position, L = (+par(upper).length || 3000) / 2, outEnd = [q[0] + ua[0] * L, q[1] + ua[1] * L];
    const d2 = x => Math.hypot(x.n.transform.position[0] - outEnd[0], x.n.transform.position[1] - outEnd[1]);
    const [A, Bl] = lifts.slice().sort((a, b) => d2(a) - d2(b)), fwd = x => { const a = ax(x); return a[0] * ua[0] + a[1] * ua[1] < 0; }; // DIR value that rolls along the upper flow
    const run = (x, on, along) => [{ tag: `${x.P}_RUN`, value: on }, ...(on ? [{ tag: `${x.P}_DIR`, value: along ? fwd(x) : !fwd(x) }] : [])];
    const lower = convs.filter(x => x !== upper);
    S('리프트 준비 · 하단 운전, A 올림 · B 내림', { set: [...lower.map(x => ({ tag: `${x.P}_RUN`, value: true })), { tag: `${A.P}_UP`, value: true }, { tag: `${Bl.P}_UP`, value: false }, ...run(A, true, true), ...run(Bl, false)] });
    const ride = x => Math.round(((+par(x).length || 600) / (+par(x).speed || 300) + 0.3) * 10) / 10; // time for the work to roll onto the lift's far end
    const first = S(`A(${A.P}) 워크 받음 대기`, { wait: [{ tag: `${A.P}_PRESENT`, op: '==', value: true }, { tag: `${A.P}_IS_UP`, op: '==', value: true }], delay: ride(A) });
    S(`A 롤러 정지 · 내림`, { set: [...run(A, false), { tag: `${A.P}_UP`, value: false }] });
    S(`A 아래 도착 · 하단으로 보냄`, { wait: [{ tag: `${A.P}_IS_DOWN`, op: '==', value: true }], set: run(A, true, false) });
    S(`A 비움 · 올림, B 받을 준비`, { wait: [{ tag: `${A.P}_PRESENT`, op: '==', value: false }], set: [...run(A, true, true), { tag: `${A.P}_UP`, value: true }, ...run(Bl, true, false)] });
    S(`B(${Bl.P}) 워크 받음 대기`, { wait: [{ tag: `${Bl.P}_PRESENT`, op: '==', value: true }], delay: ride(Bl) });
    S(`B 롤러 정지 · 올림`, { set: [...run(Bl, false), { tag: `${Bl.P}_UP`, value: true }] });
    S(`B 위 도착 · 상단으로 보냄`, { wait: [{ tag: `${Bl.P}_IS_UP`, op: '==', value: true }], set: run(Bl, true, true) });
    S(`B 비움 · 내림`, { wait: [{ tag: `${Bl.P}_PRESENT`, op: '==', value: false }], set: [...run(Bl, false), { tag: `${Bl.P}_UP`, value: false }] });
    return first; }
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
    if (on && doc.io.some(x => /_ESTOP$/.test(x.tag) && RUN.tags[x.tag])) { toast('비상정지가 눌려 있습니다 · 먼저 비상정지를 해제하세요', true); return; }
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
  // 워크 다시 투입: every work goes back to the spot (and height) it was placed at, as if it were loaded again;
  // 자동 운전 starts over from its first step. Conveyors, stoppers and other outputs keep their state.
  $('bWorkBack').onclick = () => { const doc = ED.machine.doc; let k = 0; for (const n of doc.nodes) if (nodeDef(n)?.work) { RUN.works[n.id] = { p: [n.transform.position[0], n.transform.position[1]], z: n.transform.position[2] }; k++; }
    if (!k) { toast('워크 블록이 없습니다. 팔레트의 워크를 컨베이어 위에 놓으세요', true); return; }
    AUTO.i = 0; AUTO.phase = 'wait'; AUTO.t = 0; AUTO.waited = 0; log(`워크 ${k}개를 처음 놓은 자리로 다시 투입${AUTO.on ? ' · 자동 운전은 1단계부터' : ''}`); drawSeq(); };
  // the panel under the view: drag its top edge to make it taller or shorter; the 3D view takes the rest
  (() => { const b = $('bottom'), g = $('bGrip'); let h0 = LS.get('one.build.bottomH', 300), drag = null;
    const apply = h => { h0 = Math.max(120, Math.min(innerHeight * 0.7, h)); b.style.height = h0 + 'px'; stage.resize(); };
    b.style.height = h0 + 'px';
    g.addEventListener('pointerdown', e => { if (b.classList.contains('fold')) { $('bFold').click(); return; } drag = { y: e.clientY, h: b.getBoundingClientRect().height }; g.setPointerCapture(e.pointerId); e.preventDefault(); });
    g.addEventListener('pointermove', e => { if (drag) apply(drag.h - (e.clientY - drag.y)); });
    g.addEventListener('pointerup', () => { if (drag) { drag = null; LS.set('one.build.bottomH', h0); } });
    g.addEventListener('dblclick', () => $('bFold').click()); })();
  $('bFold').onclick = () => { const b = $('bottom'); b.classList.toggle('fold'); b.style.height = b.classList.contains('fold') ? '' : LS.get('one.build.bottomH', 300) + 'px'; $('bFold').textContent = b.classList.contains('fold') ? '▴ 전체 펼치기' : '▾ 전체 접기'; setTimeout(stage.resize, 0); };
  // each part of the bottom panel folds on its own (객체별 ON / OFF, 신호 목록, 동작 순서); remembered per browser
  const FOLD = LS.get('one.build.fold', {}); const applyFold = () => { for (const id of ['subSw', 'subTbl']) $(id).classList.toggle('shut', !!FOLD[id]); $('bottom').classList.toggle('seqshut', !!FOLD.seq); document.querySelector('.seqb').classList.toggle('shut', !!FOLD.seq); };
  for (const h of document.querySelectorAll('.shead[data-fold]')) h.onclick = () => { FOLD[h.dataset.fold] = !FOLD[h.dataset.fold]; LS.set('one.build.fold', FOLD); applyFold(); fitSwRows(); };
  $('seqFold').onclick = () => { FOLD.seq = !FOLD.seq; LS.set('one.build.fold', FOLD); applyFold(); }; applyFold();

  // OP 조작반: START = 자동 운전 시작, STOP = 자동 운전 정지, 비상정지 = 자동 운전 정지 + 모든 동작 멈춤 (풀면 이어서)
  function panelButtons(doc, tags) { const pb = RUN.pb || (RUN.pb = {});
    for (const t of doc.io) { const m = /_(START_PB|STOP_PB|ESTOP)$/.exec(t.tag); if (!m) continue; const on = !!tags[t.tag], was = !!pb[t.tag]; pb[t.tag] = on; if (on === was) continue;
      if (m[1] === 'ESTOP') { if (on) { if (AUTO.on) setAuto(false); log(`${t.tag} 비상정지 · 모든 동작 멈춤`); } else log(`${t.tag} 비상정지 해제`); }
      else if (on && m[1] === 'STOP_PB' && AUTO.on) { setAuto(false); log(`${t.tag} 정지 버튼 · 자동 운전 정지`); }
      else if (on && m[1] === 'START_PB' && !AUTO.on && !doc.io.some(x => /_ESTOP$/.test(x.tag) && tags[x.tag])) { setAuto(true); log(`${t.tag} 시작 버튼 · 자동 운전`); } }
    return doc.io.some(x => /_ESTOP$/.test(x.tag) && tags[x.tag]); }
  function stepRun(dt) {
    const doc = ED.machine.doc, tags = RUN.tags, byNode = new Map(doc.nodes.map(n => [n.id, n]));
    if (panelButtons(doc, tags)) return;
    RUN.t += dt;
    for (const j of doc.joints) {
      const t = doc.io.find(x => x.dir === 'out' && x.binding?.kind === 'joint' && x.binding.target === j.id); let v = RUN.v[j.id] ?? j.min;
      const sv = `${j.id.replace(/_[A-Z0-9]+$/, '')}_SERVO_ON`; if (sv in tags && !tags[sv]) continue; // a servo axis holds still until its servo is on
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
    const loc = (f, p) => [(p[0] - f.q[0]) * f.a[0] + (p[1] - f.q[1]) * f.a[1], (p[0] - f.q[0]) * f.nrm[0] + (p[1] - f.q[1]) * f.nrm[1]];
    // works ride conveyors along each conveyor's own direction; at an end they pass onto a conveyor that continues
    // (straight or at 90°), otherwise they stop at the end; a raised stopper on the way holds them
    const frame = c => { const q = c.transform.position, r = c.transform.rotation[2] * Math.PI / 180, d = nodeDef(c), p = Object.assign({}, d.params, c.params);
      return { q, a: [Math.cos(r), Math.sin(r)], nrm: [-Math.sin(r), Math.cos(r)], Lh: (p.length || 3000) / 2, wh: (p.w || 500) / 2, top: q[2] + (p.h || 900) + (d.lift ? RUN.v[`${nodeCode(c)}_Z`] || 0 : 0) }; };
    // a lift conveyor carries the work standing on it up and down with its rollers
    for (const c of convs) { if (!nodeDef(c).lift) continue; const f = frame(c);
      for (const id in RUN.works) { const w = RUN.works[id]; const [lx, ly] = loc(f, w.p); if (Math.abs(lx) <= f.Lh && Math.abs(ly) <= f.wh && Math.abs(w.z - f.top) < 60) w.z = f.top; } }
    for (const n of doc.nodes) { const w = RUN.works[n.id]; if (!w) continue; const z = w.z, hw = (n.params.w || 300) / 2; let best = null;
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
        const P = nodeCode(c); if (!tags[`${P}_RUN`]) continue; if (nodeDef(c).lift) { const zj = doc.joints.find(j => j.id === `${P}_Z`), zv = RUN.v[`${P}_Z`]; if (zj && Math.abs(zv - zj.min) > 0.5 && Math.abs(zv - zj.max) > 0.5) continue; } const dir = tags[`${P}_DIR`] ? -1 : 1, sp = (tags[`${P}_SPEED`] > 0 ? tags[`${P}_SPEED`] : c.params.speed || 300) * dir * dt;
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
        if (nodeDef(sn)?.lift) { const f = frame(sn); tags[t.tag] = doc.nodes.some(n => { const w = RUN.works[n.id]; if (!w) return false; const [lx, ly] = loc(f, w.p); return Math.abs(lx) < f.Lh + (n.params.w || 300) / 2 - 10 && Math.abs(ly) <= f.wh && Math.abs(w.z - f.top) < 60; }); continue; }
        tags[t.tag] = doc.nodes.some(n => { const w = RUN.works[n.id]; if (!w) return false; const hw = (n.params.w || 300) / 2; const pc = convs.find(c => c.id === sn.parent), f = pc ? frame(pc) : { q: [0, 0], a: [1, 0], nrm: [0, 1] }, [sx, sy] = loc(f, sp), [wx, wy] = loc(f, w.p);
          if (pc && Math.abs(w.z - f.top) > 60) return false;
          return Math.abs(wx - sx) <= hw + 25 && Math.abs(wy - sy) < range + (n.params.d || 200) / 2; }); }
      else if (b.kind === 'sensor') { const [jid, end] = b.target.split(':'), j = doc.joints.find(x => x.id === jid); if (!j) continue; const v = RUN.v[jid];
        tags[t.tag] = end === 'max' ? Math.abs(v - j.max) < 0.5 : end === 'min' ? Math.abs(v - j.min) < 0.5 : Math.abs(v - (RUN.v[jid + ':target'] ?? v)) < 0.5; }
    }
    for (const n of doc.nodes) { const P = nodeCode(n), d = nodeDef(n); if (!d) continue; const start = doc.io.find(t => t.tag === `${P}_START` || t.tag === `${P}_TRIG` || t.tag === `${P}_ON` && t.dir === 'out' || (t.tag === `${P}_RUN` || t.tag === `${P}_NEXT`) && !d.conveyor && !d.corner); if (!start) continue;
      const pr = RUN.procs[P] || (RUN.procs[P] = { busy: false, t0: 0, prev: false }), on = !!tags[start.tag], cyc = Math.max(0.2, +(n.params.cycle || d.params.cycle || (start.tag.endsWith('_TRIG') ? 0.5 : 1)));
      if (on && !pr.prev) { pr.busy = true; pr.t0 = RUN.t; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; }
      if (!on) { pr.busy = false; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = false; }
      if (pr.busy && RUN.t - pr.t0 >= cyc) { pr.busy = false; if (`${P}_DONE` in tags) tags[`${P}_DONE`] = true; const ok = Math.random() < (n.params.ok_rate ?? 1); if (`${P}_OK` in tags) tags[`${P}_OK`] = ok; if (`${P}_NG` in tags) tags[`${P}_NG`] = !ok; if (`${P}_READY` in tags) tags[`${P}_READY`] = true; }
      if (`${P}_BUSY` in tags) tags[`${P}_BUSY`] = pr.busy; if (start.tag === `${P}_ON` && `${P}_OK` in tags) tags[`${P}_OK`] = on;
      pr.run = pr.busy ? (RUN.t - pr.t0) / cyc : 0; pr.prev = on; }
    // pose
    for (const n of doc.nodes) { const o = objs.get(n.id)?.obj, d = nodeDef(n); if (!o || !d) continue; const P = nodeCode(n), vals = {};
      for (const j of doc.joints) if (j.node === n.id) vals[j.id.slice(P.length + 1)] = RUN.v[j.id];
      vals.RUN = RUN.procs[P]?.run || 0;
      if (d.pose) d.pose(o, Object.assign({}, d.params, n.params), vals, tg => !!tags[tg], P);
      if (RUN.works[n.id]) placeObj(o, [RUN.works[n.id].p[0], RUN.works[n.id].p[1], RUN.works[n.id].z], n.transform.rotation[2]); }
  }
  function setMode(m) {
    if (tab !== 'machine') m = 'edit'; mode = m; if (AUTO.on) setAuto(false); document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'run') { resetRun(); log('동작 시험 시작 · Control Panel의 ON / OFF로 켜고 끄거나 ▶ 자동 운전을 누릅니다');
      // tall blocks that never move (cabinets, panels, guards) turn see-through so the work and stoppers stay in view
      for (const n of ED.machine.doc.nodes) { const d = nodeDef(n), o = objs.get(n.id)?.obj; if (!d || !o || runState(n) || d.cat !== 'structure') continue;
        o.traverse(x => { if (x.isMesh) { x.material = x.material.clone(); x.material.transparent = true; x.material.opacity = 0.18; x.material.depthWrite = false; } }); } }
    else { for (const v of objs.values()) root.remove(v.obj); objs = new Map(); syncScene(); }
    portGrp.visible = m !== 'run'; $('bottom').hidden = !(tab === 'machine' && m === 'run'); setTimeout(stage.resize, 0); drawIo(); drawSeq(); updateHint(); updateCheck(); if (m === 'run') $('chkList').hidden = true;
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
  /* conveyor decks are mostly gaps (rollers, legs): a click anywhere on the deck area at belt height counts as that conveyor,
     not only a click exactly on a roller. The nearest deck along the ray wins, unless a solid part is hit in front of it. */
  const deckPlane = new T.Plane(new T.Vector3(0, 1, 0), 0), deckHit = new T.Vector3();
  function pickDeck() { if (tab !== 'machine') return null; let best = null, bestD = Infinity;
    for (const n of ED.machine.doc.nodes) { const d = nodeDef(n); if (n.parent || !d || !(d.conveyor || d.curve || d.corner) || !objs.has(n.id)) continue;
      deckPlane.constant = -toS([0, 0, nodeTop(n)]).y; if (!ray.ray.intersectPlane(deckPlane, deckHit)) continue; const q = S.sceneToStored([deckHit.x, deckHit.y, deckHit.z]), p = Object.assign({}, d.params, n.params), m = 40;
      let on; if (d.curve) { const g = L.curveGeom(n); on = false; for (let i = 0; i <= 24 && !on; i++) { const a = g.point(i / 24); on = Math.hypot(a[0] - q[0], a[1] - q[1]) <= +p.w / 2 + m; } }
      else { const r = n.transform.rotation[2] * Math.PI / 180, dx = q[0] - n.transform.position[0], dy = q[1] - n.transform.position[1], a = dx * Math.cos(r) + dy * Math.sin(r), l = -dx * Math.sin(r) + dy * Math.cos(r), half = d.corner ? +p.w / 2 : +p.length / 2;
        on = Math.abs(a) <= half + m && Math.abs(l) <= +p.w / 2 + m; }
      const dist = ray.ray.origin.distanceTo(deckHit); if (on && dist < bestD) { best = n.id; bestD = dist; } }
    return best ? { id: best, dist: bestD } : null; }
  function pick1(e) { setNdc(e); const dk = pickDeck(); if (dk) { const h = ray.intersectObjects(root.children, true).find(x => x.object.visible && !x.object.isPoints && x.object.userData.pick && !isSlab(x.object.userData.pick));
      if (!h || h.distance >= dk.dist - 0.02 || h.object.userData.pick === dk.id) { const nr = pickNear(e); if (nr && nr !== dk.id) { const nn = ED.machine.doc.nodes.find(x => x.id === nr); if (nn && nn.parent) return nr; } return dk.id; } return h.object.userData.pick; }
    const ex = pickExact(), near = pickNear(e); if (!near || near === ex) return ex;
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
  function objRows() { const rows = [];
    if (tab === 'machine') { const doc = ED.machine.doc, depth = n => { let d = 0; for (let p = n.parent; p && d < 6; p = doc.nodes.find(x => x.id === p)?.parent) d++; return d; };
      const order = []; const walk = pid => { for (const n of doc.nodes.filter(x => (x.parent || null) === pid)) { order.push(n); walk(n.id); } }; walk(null); for (const n of doc.nodes) if (!order.includes(n)) order.push(n);
      for (const n of order) rows.push({ id: n.id, code: nodeCode(n), name: n.name, d: depth(n), g: '' }); }
    else { const G = { 'building.walls': '건물', 'building.columns': '건물', 'building.roofs': '건물', 'building.openings': '건물', 'building.slabs': '건물', markings: '바닥 표시', machines: '설비', storage: '물류·보관', movers: '물류·보관', 'utilities.drops': '전기·공압', blocks: '기타' };
      for (const it of factoryItems(ED.factory.doc)) rows.push({ id: it.id, code: itemCode(it) || '', name: itemName(it), d: 0, g: G[it.path] || '기타' });
      rows.sort((a, b) => a.g.localeCompare(b.g)); }
    return rows; }
  function drawObjList() { const q = ($('olQ').value || '').trim().toLowerCase(), rows = objRows();
    const hit = rows.filter(r => !q || `${r.code} ${r.name}`.toLowerCase().includes(q)), sels = new Set(selIds()); let g0 = null, html = '';
    for (const r of hit) { if (r.g && r.g !== g0) { html += `<h4>${esc(r.g)}</h4>`; g0 = r.g; }
      html += `<button data-oid="${r.id}" class="${sels.has(r.id) ? 'on' : ''}" style="padding-left:${10 + r.d * 14}px"><b>${esc(r.code)}</b>${esc(r.name)}</button>`; }
    $('olList').innerHTML = html || '<p>찾는 객체가 없습니다</p>'; }
  function toggleObjList(on = $('objList').hidden) { $('objList').hidden = !on; if (on) { $('olQ').value = ''; drawObjList(); setTimeout(() => $('olQ').focus(), 0); } }
  $('olBtn').onclick = () => { $('chkList').hidden = true; toggleObjList(); };
  // 설비 원점 (machine origin, floor centre, X = 투입 → 배출): the point the machine is placed by in the factory; hidden unless asked for
  const originChip = () => { $('originChip').classList.toggle('on', showOrigin); $('originChip').hidden = tab !== 'machine'; };
  $('originChip').onclick = () => { showOrigin = !showOrigin; LS.set('one.build.origin', showOrigin); if (originMark) originMark.visible = showOrigin; originChip(); };
  // dropdown in the bar: every object of this tab by group, the selected one shown; picking one selects and frames it
  function drawObjSel() { const rows = objRows(), cur = selIds(); let g0 = null, html = `<option value="">객체 선택 (${rows.length}개)</option>`;
    for (const r of rows) { if (r.g !== g0) { if (g0 !== null) html += '</optgroup>'; html += `<optgroup label="${esc(r.g || (tab === 'machine' ? '블록' : '기타'))}">`; g0 = r.g; }
      html += `<option value="${esc(r.id)}">${'\u00a0\u00a0'.repeat(r.d)}${esc([r.code, r.name].filter(Boolean).join(' · ') || '(이름 없음)')}</option>`; }
    if (g0 !== null) html += '</optgroup>'; const el = $('objSel'); el.innerHTML = html; el.value = cur.length === 1 && rows.some(r => r.id === cur[0]) ? cur[0] : ''; }
  $('objSel').onchange = e => { const id = e.target.value; if (xray) setXray(false); if (id) select(id, true); else select(null); e.target.blur(); };
  // 전체 지우기: everything placed in this tab goes in one step (one Ctrl+Z brings it all back); the floor slab stays
  $('bClear').onclick = () => { if (mode === 'run') { toast('편집 모드에서 지울 수 있습니다', true); return; }
    const doc = ed().doc, ids = tab === 'factory' ? factoryItems(doc).filter(x => !isSlab(x.id)).map(x => x.id) : doc.nodes.filter(n => !n.parent).map(n => n.id);
    if (!ids.length) { toast('지울 객체가 없습니다'); return; }
    if (!confirm(`${tab === 'factory' ? 'Factory Builder' : 'Machine Builder'}의 객체 ${ids.length}개를 모두 지울까요?${tab === 'machine' ? ' (블록의 신호와 동작 순서도 같이 지워집니다)' : ''}\nCtrl+Z로 한 번에 되돌릴 수 있습니다.`)) return;
    ed().batch(`clear ${ids.length}`, () => { for (const id of ids) exec('delete', { id }, true); if (tab === 'machine' && ed().doc.sequence.steps.length) exec('set_sequence', { steps: [] }, true); });
    select(null); toast(`${ids.length}개 지움 · Ctrl+Z로 되돌립니다`); };
  $('olQ').addEventListener('input', drawObjList);
  $('olQ').addEventListener('keydown', e => { if (e.key === 'Escape') toggleObjList(false); if (e.key === 'Enter') { const b = $('olList').querySelector('[data-oid]'); if (b) b.click(); } e.stopPropagation(); });
  $('olList').addEventListener('click', e => { const b = e.target.closest('[data-oid]'); if (!b) return; if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSel(b.dataset.oid); else select(b.dataset.oid); drawObjList(); focusSel(); });
  renderer.domElement.addEventListener('pointerdown', e => {
    if (placing) { if (e.button === 0) { trackPlace(e); commitPlace(e.shiftKey); } return; }
    if (e.button === 0 && !xray && tab === 'factory' && mode === 'edit') { const port = pickPort(e); if (port && port.kind === 'outlet' && startLink(e, port)) return; }
    if (e.button !== 0 || xray) return; let id = pick(e); // X-ray is a view-only mode: dragging only turns the view
    // with several objects selected, pressing anywhere inside their dashed box (on the floor or on one of them) drags them all
    if (!e.shiftKey && mode === 'edit' && selIds().length > 1 && (!id || isSlab(id))) { const ids = selIds().filter(x => !isSlab(x)); plane.constant = 0;
      if (ids.length > 1) { const bb = new T.Box3(); for (const x of ids) { const o = objs.get(x)?.obj; if (o) bb.expandByObject(o); }
        if (!bb.isEmpty()) { const r = renderer.domElement.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (let i = 0; i < 8; i++) { pc.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(camera); const sx = (pc.x + 1) / 2 * r.width, sy = (1 - pc.y) / 2 * r.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
          if (mx >= x0 - 8 && mx <= x1 + 8 && my >= y0 - 8 && my <= y1 + 8) id = ids[0]; } } }
    if (!id) { if (e.shiftKey && mode === 'edit') { startBox(e); return; } select(null); return; }
    if (e.shiftKey && mode === 'edit') { toggleSel(id); return; }
    // joined conveyors (a layout, or pieces snapped end to end) are picked as one line; pressing a piece of the
    // already picked line again (without dragging) picks just that piece, and a single picked piece stays single
    let drill = null; if (tab === 'machine' && mode === 'edit') { const doc = ED.machine.doc, n = doc.nodes.find(x => x.id === id), d = n && nodeDef(n);
      if (d && !n.parent && (d.conveyor || d.curve || d.corner)) { const chain = [...joinedConveyors(doc, [id])], cur = selIds();
        if (chain.length > 1 && !(cur.length === 1 && cur[0] === id)) { if (cur.length === chain.length && chain.every(x => cur.includes(x))) drill = id;
          else { selectMany([id, ...chain.filter(x => x !== id)]); toast(`이어진 컨베이어 ${chain.length}개를 한 덩어리로 골랐습니다 · 한 번 더 누르면 그 조각만`); } } } }
    const group = selIds().includes(id) && selIds().length > 1; if (!group) select(id); if (mode === 'run' || isSlab(id)) return;
    plane.constant = 0; if (!ray.ray.intersectPlane(plane, hit)) return;
    const ids = group ? selIds().filter(x => !isSlab(x)) : [id], os = ids.map(x => objs.get(x)?.obj).filter(Boolean);
    drag = { drill, id, ids, os, starts: os.map(o => o.position.clone()), grab: hit.clone(), moved: false, sx: e.clientX, sy: e.clientY, armed: false }; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId);
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
    if (!drag) return; showSnap(null); const { d, moved, drill } = drag; drag = null; controls.enabled = true; if (!moved || !d) { if (drill) { select(drill); toast('조각 하나만 골랐습니다 · 빈 곳을 눌렀다가 다시 누르면 라인 전체'); } return; }
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
  function selectMany(ids) { ids = ids.filter(x => !isSlab(x)); multi = new Set(ids.slice(1)); sel = ids[0] || null; drawTree(); drawObjSel(); drawProps(); updateSelMark(); if (tab === 'machine') drawIo(); }
  // a cell split into its objects: picking the cell picks its objects with it, so they move, turn, copy and delete together
  const cellParts = id => tab === 'factory' && id && ED.factory.doc.machines.some(m => m.id === id && m.params?.exploded) ? ED.factory.doc.blocks.filter(b => b.params?.cell === id).map(b => b.id) : [];
  function select(id, focus) { const kids = cellParts(id); if (kids.length) { selectMany([id, ...kids]); if (focus) focusSel(); return; } multi = new Set(); sel = id || null; drawTree(); drawObjSel(); drawProps(); updateSelMark(); if (tab === 'machine') drawIo(); if (focus && sel) focusSel(); }
  function focusSel() { const o = sel && objs.get(sel)?.obj; if (!o) return; tmpBox.setFromObject(o); if (!tmpBox.isEmpty()) stage.fit(tmpBox.clone().expandByScalar(tab === 'factory' ? 2 : 0.4), 1.2); }
  function fitAll() {
    const doc = ed().doc;
    if (tab === 'factory') { const r = slabRect(doc), a = toS([r.x0, r.y0, 0]), b = toS([r.x1, r.y1, 4000]); stage.fit(new T.Box3().setFromPoints([a, b]), 1.05); }
    else { const [W, D, H] = doc.meta.bbox.map(v => v / 1000), box = new T.Box3(new T.Vector3(-W / 2, 0, -D / 2), new T.Vector3(W / 2, H, D / 2)); if (!doc.meta.cellFixed) for (const v of objs.values()) box.expandByObject(v.obj); stage.fit(box, 1.2); }
  }
  $('views').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'fit') fitAll(); else if (b.dataset.v === 'xray') setXray(!xray); else focusSel(); });
  let xray = false;
  const setXray = on => { xray = on; if (on) { if (drag) { drag = null; controls.enabled = true; } select(null); } updateHint(); if (on) stage.addTwin(root, o => !!(o.userData.node && nodeDef(o.userData.node)?.work)); stage.ghost(on); $('xrayChip').classList.toggle('on', on); };

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
  // 공장 영역: the work cell = the area this machine has in Factory Builder (셀 영역 of its placed copy), so what is built
  // here can be checked against the room it really has in the factory
  function factoryArea() { const doc = ED.machine.doc, fdoc = ED.factory.doc, inst = fdoc.machines.find(m => m.ref.startsWith(`local:${doc.meta.id}@`));
    if (!inst) { toast('이 설비는 아직 공장에 놓이지 않았습니다 · Factory Builder에 놓은 뒤 셀 영역을 불러옵니다', true); return; }
    const A = SCN.cellArea(doc, inst.params || {}), H = doc.meta.cellFixed ? doc.meta.bbox[2] : (contentSize() || doc.meta.bbox)[2];
    exec('set_meta', { cellFixed: true, bbox: [Math.round(A.w), Math.round(A.d), Math.max(500, Math.round(H))] }); fitAll();
    toast(`공장의 셀 영역을 작업 칸으로 불러왔습니다 · ${Math.round(A.w)} × ${Math.round(A.d)} mm (${inst.tagPrefix.split('.').pop()})${outOfCell() ? ' · 빨간 선 = 영역 밖 블록' : ''}`, outOfCell()); }
  $('cellSeg').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b || tab !== 'machine') return;
    if (b.dataset.c === 'factory') { factoryArea(); return; }
    const fx = b.dataset.c === 'fixed', doc = ED.machine.doc; if (fx === !!doc.meta.cellFixed && !doc.meta.areaFrom) return;
    if (fx) { const c = contentSize(), up = v => Math.ceil(v / 100) * 100; exec('set_meta', { cellFixed: true, bbox: c ? [up(c[0] + 200), up(c[1] + 200), up(c[2] + 100)] : doc.meta.bbox }); toast('작업 칸을 고정했습니다 · 크기를 바꾸면 그 안에 놓입니다'); }
    else exec('set_meta', { cellFixed: false }); fitAll(); });
  // 블록에 맞추기: the cell stays centred on the machine origin, so it grows to the farthest block on each side (+100 mm)
  $('cellFit').onclick = () => { if (tab !== 'machine') return; const bx0 = contentBox(); if (bx0.isEmpty()) return toast('놓인 블록이 없습니다');
    const a = fromS(bx0.min), c = fromS(bx0.max), up = v => Math.ceil(v / 100) * 100;
    const W = up(2 * Math.max(Math.abs(a[0]), Math.abs(c[0])) + 200), D = up(2 * Math.max(Math.abs(a[1]), Math.abs(c[1])) + 200), H = up(Math.max(a[2], c[2]) + 100);
    exec('set_meta', { cellFixed: true, bbox: [W, D, H] }); fitAll(); toast(`작업 칸을 블록에 맞췄습니다 · ${W} × ${D} × ${H} mm`); };
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
  function splitCell() { const id = sel; if (!id || !window.OnePlant) return; let ids = [];
    ED.factory.batch('split cell', () => { ids = window.OnePlant.explode(ED.factory, id, lib()); }); select(id); toast(`객체 ${ids.length}개로 나눴습니다 · 객체를 눌러 하나씩 고칩니다`); }
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
    if (tab === 'factory') { const r = slabRect(doc); for (const i of ['sW', 'sD', 'sH']) $(i).readOnly = false; $('sizeLab').textContent = '공장 크기'; $('sW').value = (r.x1 - r.x0) / 1000; $('sD').value = (r.y1 - r.y0) / 1000; $('sH').hidden = $('sHx').hidden = true; $('cellSeg').hidden = true; $('cellFit').hidden = true; $('sizeUnit').textContent = 'm'; $('units').textContent = 'm · deg · Z-up · 스냅 500 mm · 원점 = 왼쪽 아래(입고)'; }
    else { const fx = !!doc.meta.cellFixed; $('sizeLab').textContent = '작업 칸'; for (const i of ['sW', 'sD', 'sH']) $(i).readOnly = !fx; [$('sW').value, $('sD').value, $('sH').value] = fx ? doc.meta.bbox : contentSize() || doc.meta.bbox; document.querySelectorAll('#cellSeg button').forEach(b => b.classList.toggle('on', (b.dataset.c === 'fixed') === fx)); $('sH').hidden = $('sHx').hidden = false; $('cellSeg').hidden = false; $('cellFit').hidden = !fx; $('sizeUnit').textContent = 'mm'; $('units').textContent = 'mm · deg · Z-up · 스냅 50 mm (Alt 5 mm)'; }
    $('bUndo').disabled = !ed().canUndo || mode === 'run'; $('bRedo').disabled = !ed().canRedo || mode === 'run';
    if (tab === 'factory') { const its = factoryItems(doc); $('chipCount').innerHTML = `객체 <b>${its.length}</b> · 설비 <b>${doc.machines.length}</b>`; $('chipOrigin').hidden = true; }
    else { $('chipCount').innerHTML = `블록 <b>${doc.nodes.length}</b> · 관절 <b>${doc.joints.length}</b> · 태그 <b>${doc.io.length}</b>`; $('chipOrigin').hidden = true; }
  }
  function updateHint() { $('hint').textContent = placing ? `${placing.name}: 놓을 곳을 누르세요 · Shift+클릭 = 계속 놓기 · R 회전 · Esc/우클릭 취소` : xray ? 'X-RAY 보기 전용: 끌면 화면이 돌고, 휠은 확대입니다 · X를 다시 누르면 편집' : tab === 'machine' && mode === 'run' ? '동작 시험 중: Control Panel의 ON / OFF로 켜고 끄거나, 오른쪽 아래 ▶ 자동 운전으로 동작 순서를 돌립니다 · 편집으로 돌아가면 처음 자세로' : ''; }
  /* ports (입구 · 출구): an ivory arrow where parts come in, an amber one where they leave; labelled in Machine Builder */
  const portGrp = new T.Group(); ov.add(portGrp);
  const arrowGeo = (() => { const sh = new T.Shape(); sh.moveTo(0.22, 0); sh.lineTo(-0.12, 0.14); sh.lineTo(-0.05, 0); sh.lineTo(-0.12, -0.14); sh.lineTo(0.22, 0); return new T.ShapeGeometry(sh).rotateX(-Math.PI / 2); })();
  const portMat = { in: new T.MeshBasicMaterial({ color: 0xe9e3d5, side: T.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }), out: new T.MeshBasicMaterial({ color: 0xffae42, side: T.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }) };
  const portLbl = { in: document.createElement('div'), out: document.createElement('div') }; for (const [k, el] of Object.entries(portLbl)) { el.className = 'lbl port ' + k; el.textContent = k === 'in' ? '투입' : '배출'; $('labels').appendChild(el); }
  let portAnchors = [];
  // the ring + arrow on the floor is the machine's origin (0, 0) and its X axis (투입 → 배출); it is a guide, not an object
  const originLbl = document.createElement('div'); originLbl.className = 'lbl origin'; originLbl.textContent = '설비 원점 · X = 투입 → 배출'; originLbl.title = '편집용 기준 표시입니다. 객체가 아니라 지워지지 않습니다'; $('labels').appendChild(originLbl);
  function addPortArrow(pos, dir, kind, scale, lift) { const g = new T.Group(), m = new T.Mesh(arrowGeo, portMat[kind]); m.scale.setScalar(scale); m.renderOrder = 3; g.add(m);
    const p = toS([pos[0], pos[1], lift ? pos[2] + 15 : 20]); g.position.copy(p);
    g.rotation.y = S.storedYawToScene(Math.atan2(dir[1], dir[0]) * 180 / Math.PI); portGrp.add(g); return p; }
  // small arrows on every conveyor deck pointing the way the work goes, so the flow of each piece can be read at a glance
  const deckArrowMat = new T.MeshBasicMaterial({ color: 0xffae42, transparent: true, opacity: 0.75, depthWrite: false });
  function flowMarks() { for (const n of ED.machine.doc.nodes) { const d = nodeDef(n); if (n.parent || !d || d.corner || !(d.conveyor || d.curve)) continue; const p = Object.assign({}, d.params, n.params), top = nodeTop(n) + 12;
      const at = (pt, hd) => { const m = new T.Mesh(arrowGeo, deckArrowMat); m.scale.setScalar(0.55); m.renderOrder = 4; const s = toS([pt[0], pt[1], top]); m.position.copy(s); m.rotation.y = S.storedYawToScene(Math.atan2(hd[1], hd[0]) * 180 / Math.PI); portGrp.add(m); };
      if (d.curve) { const g = L.curveGeom(n); for (const u of [0.25, 0.75]) at(g.point(u), g.heading(u)); continue; }
      const r = n.transform.rotation[2] * Math.PI / 180, a = [Math.cos(r), Math.sin(r)], Ln = +p.length, k = Math.max(1, Math.min(5, Math.round(Ln / 900))), q = n.transform.position;
      for (let i = 0; i < k; i++) { const t = (i + 0.5) / k - 0.5; at([q[0] + a[0] * Ln * t, q[1] + a[1] * Ln * t], a); } } }
  function drawPorts() { portGrp.clear(); portAnchors = [];
    if (tab === 'machine') { const P = SCN.portsOf(ED.machine.doc); if (!ED.machine.doc.nodes.length) return; flowMarks();
      // only where a part really comes in / goes out: a conveyor end or a chosen block; without one there is nothing to mark
      if (!P.inlet.key && !P.outlet.key) return;
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
  function drawPortLabels() { const r = renderer.domElement.getBoundingClientRect();
    if (tab !== 'machine' || !originMark || !showOrigin || xray || mode === 'run') originLbl.style.display = 'none';
    else { const v = originMark.position.clone().project(camera); originLbl.style.display = ''; originLbl.style.left = ((v.x + 1) / 2 * r.width + 10) + 'px'; originLbl.style.top = ((1 - v.y) / 2 * r.height + 12) + 'px'; } for (const k of ['in', 'out']) { const a = portAnchors.find(x => x[0] === k), el = portLbl[k]; if (!a || xray || mode === 'run') { el.style.display = 'none'; continue; }
      const v = a[1].clone().project(camera); el.style.display = ''; el.style.left = ((v.x + 1) / 2 * r.width) + 'px'; el.style.top = ((1 - v.y) / 2 * r.height) + 'px'; } }
  function refresh() { syncScene(); drawPorts(); drawTree(); drawObjSel(); drawProps(); drawBar(); drawCrumb(); updateSelMark(); if (tab === 'machine') updateEnvelope(); else { cellPlate.visible = false; $('cellWarn').hidden = true; } if (tab === 'machine') drawIo(); updateCheck(); }
  function switchTab(t, fit) {
    if (mode === 'run') setMode('edit');
    tab = t; LS.set(KEY.tab, t); originChip(); sel = null; multi = new Set(); if (!$('helpBox').hidden) setTimeout(drawHelp, 0); document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
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
    if (d.lift) { const lv = t[`${P}_IS_UP`] ? '위' : t[`${P}_IS_DOWN`] ? '아래' : t[`${P}_UP`] ? '올라가는 중' : '내려가는 중'; return { txt: `${lv}${t[`${P}_RUN`] ? ' · 롤러 ' + (t[`${P}_DIR`] ? '←' : '→') : ''}${t[`${P}_PRESENT`] ? ' · 워크' : ''}`, on: !!(t[`${P}_RUN`] || t[`${P}_PRESENT`]) }; }
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
  // Factory Builder: a selected robot / index table shows its motion; the rest stand still (no motion without a reason)
  let moving = new Set();
  function animateSelected(now) { if (tab !== 'factory') { moving = new Set(); return; } const next = new Set();
    for (const id of selIds()) { const o = objs.get(id)?.obj; if (o && o.userData.rig) { next.add(o); const c = o.userData.cycle || 6; L.poseModel(o, (now / 1000 % c) / c); } }
    for (const o of moving) if (!next.has(o)) L.poseModel(o, 0); moving = next; }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'run' && tab === 'machine') { stepAuto(dt); stepRun(dt); if ((RUN.frame = (RUN.frame || 0) + 1) % 6 === 0) drawIo(); }
    animateSelected(now); stage.render(); drawLabels(); drawPortLabels(); drawFlowLabels(); requestAnimationFrame(loop);
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
  if (window.OnePlant && !LS.get(KEY.factory + '.plant4', false)) {
    // .plant4: the example with its cells split into objects, in process order, equipment only; a factory that is still the earlier example is simply replaced
    const ex = ['예시 공정 · 감마 라인', '감마 라인 (협력사 설비)'].includes(ED.factory.doc.meta.name); LS.set(KEY.factory + '.plant4', true);
    if (ex) LS.set(KEY.factory + '.plant', false);
  }
  if (window.OnePlant && !LS.get(KEY.factory + '.plant', false)) {
    if (ED.factory.doc.building.walls.length || ED.factory.doc.machines.length) LS.set(KEY.factory + '.before-plant', ED.factory.doc);
    LS.set(KEY.factory + '.plant', true); LS.set(KEY.factory + '.seeded', true); openDoc('factory', window.OnePlant.defaultFactory());
  }
  L.onModel(g => { updateSelMark(); if (xray) stage.addTwin(g); });
  dirty = { factory: false, machine: false };
  switchTab(tab);
  requestAnimationFrame(loop);
  window.ONE_BUILD = { ED, stage, select, selectMany, moveSelBy, switchTab, setMode, RUN, addBlock, addShape: (id, at, yaw) => ed().batch('add', () => addShape(id, at, yaw)), joined: id => [...joinedConveyors(ED.machine.doc, [id])], issues: () => issues, get sel() { return sel; } };
})();
