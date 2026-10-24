// Console 1 "레이아웃 편집": factory size (floor, walls, ceiling outline), where the station cell sits in the
// factory, and where its equipment stands (positioner, dispensing robot R2, DMC reader, scale, jig row,
// R1 rail line). Objects are picked by clicking or from the list, moved with a gizmo (grid snap) or typed
// in; equipment changes rebuild the station through window.__station.applyLayout, so console 1's own IK,
// collision checks and cycle planning run on the edited positions. "도달 검사" runs one full cycle and
// reports whether it finishes and how many poses hit the reach limit.
// The layout is kept in this browser (localStorage) and saved with the station (js/console-save.js).
(function () {
  const TC_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/TransformControls.js';
  const STORE = 'one-station-layout-v1';
  const FACTORY_DEFAULT = { width: 12, depth: 10, height: 5 };
  const TABLE_Y = 0.85, BASE_Y = 0.95;
  // cell-local limits for equipment (the enclosure spans z -1.35 … 0.8 and grows in x with the rail)
  const ZMIN = -1.25, ZMAX = 0.7, XMIN = -2.4, XMAX = 2.4;
  // editable objects: label, which layout keys move, and where the selection marker sits (cell coordinates)
  const OBJECTS = {
    cell: { label: '스테이션 셀 (전체)', axes: 'xz', rotate: true },
    positioner: { label: '2축 포지셔너', axes: 'xz', at: L => [L.positioner.x, TABLE_Y + 0.4, L.positioner.z] },
    r2: { label: '도포 로봇 R2', axes: 'xz', at: L => [L.r2.x, BASE_Y + 0.35, L.r2.z] },
    dmc: { label: 'DMC 리더', axes: 'xz', at: L => [L.dmc.x, TABLE_Y + 0.4, L.dmc.z] },
    scale: { label: '정밀 저울', axes: 'xz', at: L => [L.scale.x, TABLE_Y + 0.12, L.scale.z] },
    jig: { label: '지그 열', axes: 'z', at: L => [0, TABLE_Y + 0.06, L.jig.z] },
    rail: { label: 'R1 레일', axes: 'z', at: L => [0, TABLE_Y + 0.06, L.rail.z] }
  };
  const $ = q => document.querySelector(q);
  const S = () => window.__station;
  const busy = () => { const s = S(); return !(s.sim.phase === 'idle' || s.sim.phase === 'done'); };
  const r2 = v => Math.round(v * 100) / 100;

  let factory = { ...FACTORY_DEFAULT }, editing = false, selected = null, tc = null, proxy = null, marker = null, building = null;

  /* ---------- persistence ---------- */
  function load() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); if (v && v.factory) return v; } catch (e) {}
    return null;
  }
  function store() {
    try { localStorage.setItem(STORE, JSON.stringify(current())); } catch (e) {}
  }
  function current() { return { factory: { ...factory }, ...S().layoutParams() }; }

  /* ---------- factory: floor, walls, ceiling outline ---------- */
  function buildFactory() {
    const s = S(), { width: W, depth: D, height: H } = factory;
    if (building) { s.scene.remove(building); building.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    building = new THREE.Group(); building.name = 'factory';
    s.floor.geometry.dispose(); s.floor.geometry = new THREE.PlaneGeometry(W, D);
    // grid sized to the factory, 0.5 m cells
    const size = Math.max(W, D), gh = new THREE.GridHelper(size, Math.max(1, Math.round(size / 0.5)), 0x2c323b, 0x1b1f25);
    s.grid.geometry.dispose(); s.grid.geometry = gh.geometry;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8ea3b5, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x59636e, metalness: 0.4, roughness: 0.6 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xd6b21a, roughness: 0.6 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); building.add(b); return b; };
    for (const [w, d, x, z] of [[W, 0.02, 0, -D / 2], [W, 0.02, 0, D / 2], [0.02, D, -W / 2, 0], [0.02, D, W / 2, 0]]) {
      box(w, H, d, wallMat, x, H / 2, z);
      box(Math.max(w, 0.06), 0.06, Math.max(d, 0.06), curbMat, x, 0.03, z);       // floor edge marking
      box(Math.max(w, 0.08), 0.08, Math.max(d, 0.08), beamMat, x, H, z);          // ceiling outline
    }
    for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) box(0.16, H, 0.16, beamMat, x, H / 2, z); // corner columns
    s.scene.add(building);
    s.scene.fog.far = Math.max(24, Math.hypot(W, D) * 1.6);
    s.controls.maxDistance = Math.max(9, Math.hypot(W, D) * 1.1);
  }

  /* ---------- applying a layout ---------- */
  function clampLayout(L) {
    const c = (v, a, b) => Math.min(b, Math.max(a, v));
    const hw = factory.width / 2 - 1.2, hd = factory.depth / 2 - 1.2;
    L.cell.x = c(L.cell.x, -Math.max(0, hw), Math.max(0, hw)); L.cell.z = c(L.cell.z, -Math.max(0, hd), Math.max(0, hd));
    for (const k of ['positioner', 'r2', 'dmc', 'scale']) { L[k].x = c(L[k].x, XMIN, XMAX); L[k].z = c(L[k].z, ZMIN, ZMAX); }
    L.jig.z = c(L.jig.z, ZMIN, ZMAX); L.rail.z = c(L.rail.z, ZMIN, ZMAX);
    return L;
  }
  function apply(L, { keepSelection = true } = {}) {
    if (busy()) { note('사이클 중에는 배치를 바꿀 수 없습니다', true); return false; }
    const s = S(), before = s.CELL.position.clone();
    const ok = s.applyLayout(clampLayout(L));
    // keep looking at the cell when it moves
    const d = s.CELL.position.clone().sub(before);
    if (ok && d.lengthSq() > 1e-8) { s.camera.position.add(d); s.controls.target.add(d); s.controls.update(); }
    if (ok) { store(); if (keepSelection && selected) select(selected); refreshPanel(); }
    return ok;
  }

  /* ---------- selection + gizmo ---------- */
  function ensureGizmo() {
    if (tc) return Promise.resolve();
    return new Promise((ok, fail) => {
      if (THREE.TransformControls) return ok();
      const sc = document.createElement('script'); sc.src = TC_URL; sc.onload = ok; sc.onerror = () => fail(new Error('TransformControls could not be loaded')); document.head.appendChild(sc);
    }).then(() => {
      const s = S();
      tc = new THREE.TransformControls(s.camera, s.renderer.domElement);
      tc.setTranslationSnap(0.05); tc.setRotationSnap(THREE.MathUtils.degToRad(15)); tc.setSize(0.8);
      tc.addEventListener('dragging-changed', e => { s.controls.enabled = !e.value; if (!e.value) commitDrag(); });
      tc.addEventListener('objectChange', () => { if (selected === 'cell') refreshFields(); });
      s.scene.add(tc);
      proxy = new THREE.Object3D(); proxy.name = 'layout-proxy';
      marker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 32), new THREE.MeshBasicMaterial({ color: 0x00e8d0, transparent: true, opacity: 0.35, depthTest: false }));
      marker.renderOrder = 10; proxy.add(marker);
    });
  }
  function select(key) {
    selected = key; const s = S(), L = s.layoutParams(), o = OBJECTS[key];
    if (!tc) return;
    if (!o) { tc.detach(); if (proxy.parent) proxy.parent.remove(proxy); refreshPanel(); return; }
    if (key === 'cell') {
      if (proxy.parent) proxy.parent.remove(proxy);
      tc.attach(s.CELL); tc.showX = tc.showZ = true; tc.showY = false;
    } else {
      s.CELL.add(proxy); proxy.position.set(...o.at(L)); proxy.rotation.set(0, 0, 0);
      tc.setMode('translate'); tc.attach(proxy);
      tc.showX = o.axes.includes('x'); tc.showZ = o.axes.includes('z'); tc.showY = false;
    }
    refreshPanel();
  }
  function commitDrag() {
    const L = S().layoutParams();
    if (selected === 'cell') { const C = S().CELL; L.cell = { x: r2(C.position.x), z: r2(C.position.z), rot: C.rotation.y }; }
    else if (selected === 'jig') L.jig.z = r2(proxy.position.z);
    else if (selected === 'rail') L.rail.z = r2(proxy.position.z);
    else if (OBJECTS[selected]) L[selected] = { x: r2(proxy.position.x), z: r2(proxy.position.z) };
    apply(L);
  }
  // click: the nearest editable object to the hit point (within 0.35 m), otherwise the whole cell
  function onPick(e) {
    if (!editing || !tc || tc.dragging) return;
    const s = S(), el = s.renderer.domElement, r = el.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, s.camera);
    const hit = ray.intersectObject(s.CELL, true).find(h => h.object.visible && h.object !== marker);
    if (!hit) return;
    const p = s.CELL.worldToLocal(hit.point.clone()), L = s.layoutParams();
    let best = 'cell', bd = 0.35;
    for (const [k, o] of Object.entries(OBJECTS)) { if (!o.at) continue; const a = o.at(L), d = o.axes === 'z' ? Math.abs(p.z - a[2]) + (Math.abs(p.x) > 1.4 ? 1 : 0) : Math.hypot(p.x - a[0], p.z - a[2]); if (d < bd) { bd = d; best = k; } }
    select(best);
  }

  /* ---------- reach / cycle check ---------- */
  async function checkCycle() {
    if (busy()) return note('사이클 중에는 검사할 수 없습니다', true);
    note('사이클 검사 중… (몇 초 걸립니다)'); await new Promise(r => setTimeout(r, 60));
    try {
      const r = window.StationExport.checkCycle();
      // the default layout itself has a few near-limit poses (about 4), so only many more is a warning
      const tight = r.ikFail > 20;
      note(r.completed ? `사이클 완료 · ${r.cycleTotal.toFixed(1)} s (개당 ${(r.cycleTotal / r.parts).toFixed(1)} s) · 도달 한계 근접 ${r.ikFail}건 (기본 배치 약 4건)${tight ? ' — 로봇이 무리한 자세를 많이 씁니다. 위치를 조정해 보세요' : ''}` : `사이클이 끝나지 않습니다 (${r.reason}). 로봇이 닿지 않는 배치일 수 있습니다.`, !r.completed || tight);
    } catch (e) { note('검사 실패: ' + e.message, true); }
  }

  /* ---------- panel ---------- */
  const css = `
  #layoutChip.on{border-color:var(--accent);color:var(--accent)}
  #layoutPanel{position:absolute;left:14px;top:14px;width:300px;max-height:calc(100% - 120px);overflow:auto;padding:12px 14px;display:grid;gap:10px;z-index:5;font-size:12.5px}
  #layoutPanel h4{margin:0;font-size:12px;letter-spacing:.16em;font-family:var(--mono);color:var(--mute);font-weight:500}
  #layoutPanel .row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  #layoutPanel label{display:grid;gap:3px;color:var(--mute);font-size:11px}
  #layoutPanel input{width:100%;min-width:0;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:6px 7px;border-radius:3px;font:inherit;font-family:var(--mono);font-size:12px}
  #layoutPanel input:focus{outline:none;border-color:var(--accent)}
  #layoutPanel input:disabled{opacity:.35}
  #layoutPanel .objs{display:flex;flex-wrap:wrap;gap:4px}
  #layoutPanel .objs button,#layoutPanel .acts button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:5px 8px;border-radius:3px;cursor:pointer;font:inherit;font-size:11.5px}
  #layoutPanel .objs button.on{border-color:var(--accent);color:var(--accent)}
  #layoutPanel .acts{display:flex;flex-wrap:wrap;gap:4px}
  #layoutPanel .note{color:var(--mute);line-height:1.5;min-height:1.5em}
  #layoutPanel .note.err{color:var(--warn)}
  #layoutPanel .hint{color:var(--dim);font-size:11px;line-height:1.5;margin:0}
  .layout-editing .hud.tl{display:none}`;
  let panel = null;
  function note(t, warn) { const n = panel && panel.querySelector('.note'); if (n) { n.textContent = t; n.classList.toggle('err', !!warn); } }
  function buildPanel() {
    panel = document.createElement('div'); panel.id = 'layoutPanel'; panel.className = 'card'; panel.hidden = true;
    panel.innerHTML = `
      <h4>공장 크기 (m)</h4>
      <div class="row"><label>가로<input type="number" step="0.5" min="4" max="200" data-f="width"></label><label>세로<input type="number" step="0.5" min="4" max="200" data-f="depth"></label><label>높이<input type="number" step="0.5" min="2.5" max="30" data-f="height"></label></div>
      <h4>객체 선택</h4>
      <div class="objs">${Object.entries(OBJECTS).map(([k, o]) => `<button type="button" data-o="${k}">${o.label}</button>`).join('')}</div>
      <div class="row"><label>X (m)<input type="number" step="0.05" data-p="x"></label><label>Z (m)<input type="number" step="0.05" data-p="z"></label><label>회전 (°)<input type="number" step="15" data-p="rot"></label></div>
      <p class="hint">3D 화면에서 객체를 클릭하거나 위 목록에서 고른 뒤 화살표를 끌어 옮깁니다 (0.05 m 단위). 셀은 R 키로 회전 모드, T 키로 이동 모드. 장비 위치가 바뀌면 로봇 동작을 그 배치로 다시 계산합니다.</p>
      <div class="acts"><button type="button" data-a="check">도달 검사</button><button type="button" data-a="reset">기본 배치로</button><button type="button" data-a="close">편집 종료</button></div>
      <div class="note"></div>`;
    document.querySelector('.view').appendChild(panel);
    panel.querySelectorAll('[data-f]').forEach(i => i.addEventListener('change', () => {
      const v = parseFloat(i.value); if (!(v > 0)) return refreshPanel();
      factory[i.dataset.f] = Math.min(+i.max, Math.max(+i.min, v)); buildFactory(); apply(S().layoutParams());
    }));
    panel.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => select(b.dataset.o)));
    panel.querySelectorAll('[data-p]').forEach(i => i.addEventListener('change', () => {
      const L = S().layoutParams(), v = parseFloat(i.value); if (Number.isNaN(v) || !selected) return refreshPanel();
      const k = i.dataset.p;
      if (selected === 'cell') { if (k === 'rot') L.cell.rot = THREE.MathUtils.degToRad(v); else L.cell[k] = v; }
      else if (k !== 'rot' && OBJECTS[selected].axes.includes(k)) L[selected][k] = v;
      apply(L);
    }));
    panel.querySelector('[data-a=check]').onclick = checkCycle;
    panel.querySelector('[data-a=reset]').onclick = () => { factory = { ...FACTORY_DEFAULT }; buildFactory(); apply(JSON.parse(JSON.stringify(S().LAYOUT_DEFAULT))); note('기본 배치로 되돌렸습니다'); };
    panel.querySelector('[data-a=close]').onclick = () => toggle(false);
  }
  function refreshFields() {
    if (!panel) return;
    const L = S().layoutParams(), o = OBJECTS[selected], set = (k, v, on) => { const i = panel.querySelector(`[data-p=${k}]`); i.disabled = !on; if (document.activeElement !== i) i.value = on ? (k === 'rot' ? Math.round(THREE.MathUtils.radToDeg(v)) : r2(v)) : ''; };
    if (!o) { ['x', 'z', 'rot'].forEach(k => set(k, 0, false)); return; }
    const cell = selected === 'cell', src = cell ? { x: S().CELL.position.x, z: S().CELL.position.z } : L[selected];
    set('x', src.x, o.axes.includes('x')); set('z', src.z, o.axes.includes('z')); set('rot', cell ? S().CELL.rotation.y : 0, cell);
  }
  function refreshPanel() {
    if (!panel) return;
    panel.querySelectorAll('[data-f]').forEach(i => { if (document.activeElement !== i) i.value = factory[i.dataset.f]; });
    panel.querySelectorAll('[data-o]').forEach(b => b.classList.toggle('on', b.dataset.o === selected));
    refreshFields();
  }
  async function toggle(on) {
    if (on && busy()) return;
    editing = on;
    document.querySelector('.app').classList.toggle('layout-editing', on);
    panel.hidden = !on; chip.classList.toggle('on', on);
    if (on) { await ensureGizmo(); select(selected || 'cell'); note('편집할 객체를 고르세요'); }
    else if (tc) { tc.detach(); if (proxy.parent) proxy.parent.remove(proxy); S().controls.enabled = true; }
  }

  let chip;
  function init() {
    const s = S();
    if (!s || !s.applyLayout) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    chip = document.createElement('button'); chip.className = 'chip'; chip.id = 'layoutChip'; chip.textContent = '레이아웃 편집';
    $('.hud.tr').appendChild(chip);
    chip.addEventListener('click', () => toggle(!editing));
    buildPanel();
    const saved = load();
    if (saved) { factory = { ...FACTORY_DEFAULT, ...saved.factory }; }
    buildFactory();
    if (saved) s.applyLayout(clampLayout(saved));
    s.renderer.domElement.addEventListener('pointerdown', e => { onPick.down = [e.clientX, e.clientY]; });
    s.renderer.domElement.addEventListener('pointerup', e => { const d = onPick.down; if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 4) onPick(e); });
    addEventListener('keydown', e => { if (!editing || !tc || selected !== 'cell' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.key === 'r' || e.key === 'R') tc.setMode('rotate'), tc.showX = tc.showZ = false, tc.showY = true; if (e.key === 't' || e.key === 'T') tc.setMode('translate'), tc.showX = tc.showZ = true, tc.showY = false; });
    // edits are refused while a cycle runs
    setInterval(() => { chip.disabled = busy() && !editing; }, 500);
  }

  window.LayoutEditor = { current, factory: () => ({ ...factory }) };
  if (window.__station) init(); else addEventListener('load', init);
})();
