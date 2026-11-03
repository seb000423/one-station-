// ONE SIMULATION, ?src=build: opens the factory laid out in ONE BUILDER (Factory Builder) with the machines saved in
// Machine Builder, on the same stage as the demo line. Step 1 of the hand-over: layout + each machine's card
// (cycle, yield → hourly output) + the card bottleneck. Parts start flowing once machines are linked by process
// flows in Factory Builder (next step); until then nothing moves, so nothing moves without a reason.
(() => {
  'use strict';
  const $ = id => document.getElementById(id), T = window.THREE, L = window.OneLibrary;
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fdoc = read('one.build.factory'), lib = read('one.build.machines') || {};

  // header: this page now shows the builder's factory
  const back = document.querySelector('.back'); back.href = '/build'; back.textContent = '← ONE BUILDER';
  document.querySelector('.crumb').textContent = fdoc ? `Factory Builder · ${fdoc.meta.name || '공장'} · 배치 확인` : 'Factory Builder';
  $('modes').hidden = true; document.querySelector('.legend').hidden = true; document.querySelector('footer').style.display = 'none'; // no clock until flows exist

  const stage = window.OneStage.create($('c')), { camera } = stage;
  if (!fdoc) { $('loading').innerHTML = 'ONE BUILDER에 저장된 공장이 없습니다.<br><br><a class="btn pri" href="/build" style="text-decoration:none">ONE BUILDER로 가기</a>'; return; }

  const SC = window.OneScene.create({ lib: () => lib }), root = new T.Group(); stage.world.add(root);
  const items = SC.factoryItems(fdoc), objs = new Map();
  for (const it of items) { let o; try { o = SC.buildFactoryObj(it, fdoc); } catch (e) { continue; } root.add(o); objs.set(it.id, { o, it }); }

  // floor: the slab as a faint tint with an ivory edge, the stage grid underneath
  const r = SC.slabRect(fdoc), w = (r.x1 - r.x0) / 1000, d = (r.y1 - r.y0) / 1000, c = SC.toS([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0]);
  const slab = new T.Group(); slab.add(new T.Mesh(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x2a2b31, transparent: true, opacity: 0.3, depthWrite: false })));
  slab.add(new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, 0.001, d)), new T.LineBasicMaterial({ color: 0xe9e3d5, transparent: true, opacity: 0.55 })));
  slab.position.set(c.x, 0.001, c.z); stage.overlay.add(slab); stage.mirrorPass.mirror = false;
  const m = Math.max(w, d) * 0.35 + 6; stage.setBounds(new T.Box3(new T.Vector3(c.x - w / 2 - m, 0, c.z - d / 2 - m), new T.Vector3(c.x + w / 2 + m, 6, c.z + d / 2 + m))); stage.setGrid(0.5, 5);
  const fitAll = () => stage.fit(new T.Box3().setFromPoints([SC.toS([r.x0, r.y0, 0]), SC.toS([r.x1, r.y1, 4000])]), 1.05);
  fitAll();

  // machine cards: instance override → saved machine card → library card
  const machines = items.filter(it => it.path === 'machines').map(it => {
    const x = it.item, def = it.def && L.FACTORY[it.def], ov = x.cardOverride || {};
    let card = {}, name = x.name;
    if (it.local) { const mm = lib[it.local.id], doc = mm && (mm.versions[it.local.v] || mm.versions[Object.keys(mm.versions).pop()]); card = doc?.card || {}; name = name || mm?.name; }
    else if (def) { card = { cycle_time: x.params?.cycle_time ?? def.params.cycle_time, ok_rate: x.params?.ok_rate ?? def.params.ok_rate }; name = name || def.name; }
    const ct = ov.cycle_time ?? card.cycle_time ?? null, ok = ov.ok_rate ?? card.ok_rate ?? 1;
    return { it, code: x.tagPrefix.split('.').pop(), name: name || '설비', ct, ok, uph: ct ? 3600 / ct * ok : null };
  });
  const rated = machines.filter(x => x.uph), bn = rated.length ? rated.reduce((a, b) => (b.uph < a.uph ? b : a)) : null;
  if (bn) { const o = objs.get(bn.it.id).o, b = new T.Box3().setFromObject(o), s = b.getSize(new T.Vector3()), ctr = b.getCenter(new T.Vector3()); const ring = stage.ring(Math.max(s.x, s.z) * 0.62 + 0.3); ring.position.x = ctr.x; ring.position.z = ctr.z; }

  const flows = fdoc.flows || [];
  document.querySelector('aside').innerHTML = `
    <section><h2>배치 <span>${esc(fdoc.meta.name || '공장')}</span></h2>
      <div class="kpis"><div class="kpi"><b>${items.length}</b><span>놓인 객체</span></div><div class="kpi"><b>${machines.length}</b><span>설비</span></div>
      <div class="kpi"><b>${bn ? bn.uph.toFixed(1) : '–'}</b><span>시간당 생산 상한 (카드 기준)</span></div><div class="kpi"><b>${flows.length}</b><span>공정 흐름 연결</span></div></div></section>
    <section><h2>병목 <span>카드 기준</span></h2><div class="bn-box"><b>${bn ? esc(`${bn.code} ${bn.name}`) : '–'}</b><span>${bn ? `사이클 ${bn.ct} s · 양품률 ${(bn.ok * 100).toFixed(1)}% → 시간당 ${bn.uph.toFixed(1)}개. 라인은 이 설비보다 빨리 만들 수 없습니다.` : '사이클이 적힌 설비가 없습니다'}</span></div></section>
    <section><h2>설비 카드</h2><div id="rows">${machines.map(x => `<div class="row" style="display:grid;grid-template-columns:44px 1fr auto;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px${x === bn ? ';color:var(--accent)' : ''}"><b style="font-family:var(--mono)">${esc(x.code)}</b><span>${esc(x.name)}</span><span style="font-family:var(--mono)">${x.ct ? `${x.ct} s · ${x.uph.toFixed(1)}/h` : '–'}</span></div>`).join('') || '<p class="note">놓인 설비가 없습니다</p>'}</div></section>
    <section><h2>실행</h2><p class="note" style="line-height:1.7">${flows.length ? '공정 흐름이 연결되어 있습니다. 부품 흐름 실행은 다음 단계에서 붙습니다.' : '아직 설비끼리 공정 흐름이 연결되지 않았습니다. Factory Builder에서 설비를 순서대로 잇고 (투입 → 공정 → 배출), 옮기는 수단(컨베이어·AMR·작업자)을 정하면 여기서 부품이 실제로 흐르며 실행됩니다.'}</p>
      <div style="display:flex;gap:8px;margin-top:10px"><a class="btn" href="/build" style="text-decoration:none">ONE BUILDER에서 고치기</a></div></section>`;

  // view chips: 전체 · X-RAY
  let xray = false;
  const chip = (txt, fn) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = txt; b.onclick = () => fn(b); $('views').appendChild(b); return b; };
  chip('전체', fitAll);
  chip('X-RAY', b => { xray = !xray; if (xray) stage.addTwin(root, o => machines.some(x => objs.get(x.it.id)?.o === o)); stage.ghost(xray); b.classList.toggle('on', xray); });

  // machine labels (projected HTML), the bottleneck in amber
  const tags = $('tags'), v3 = new T.Vector3(), box = new T.Box3();
  const els = machines.map(x => { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<b>${esc(x.code)}</b>${esc(x.name)}`; if (x === bn) el.style.borderColor = 'var(--accent)'; tags.appendChild(el); return { x, el }; });
  const updateTags = () => { const rc = $('c').getBoundingClientRect(); for (const { x, el } of els) { const o = objs.get(x.it.id)?.o; if (!o) continue; box.setFromObject(o); box.getCenter(v3); v3.y = box.max.y + 0.1; v3.project(camera);
    el.style.display = Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05 ? '' : 'none'; el.style.left = ((v3.x + 1) / 2 * rc.width) + 'px'; el.style.top = ((1 - v3.y) / 2 * rc.height) + 'px'; } };

  $('loading').hidden = true;
  const loop = () => { stage.render(); updateTags(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();
