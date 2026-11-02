/* ONE SIM: scenario compare and optimisation (GA) pages. Both run the same DES as the 3D view (OneTwinSim);
 * any result can be opened in the 3D run view with its conditions. */
(() => {
  'use strict';
  const E = window.OneTwinSim, $ = id => document.getElementById(id);
  const ST = E.DEMO_STATIONS, byId = Object.fromEntries(ST.map(s => [s.id, s]));
  const C_A = '#3d86d6', C_B = '#b08a1a', C_DOT = '#5d6064', C_BEST = '#eec539'; // validated pair (dark surface), muted, highlight
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = v => v.toFixed(1), f0 = v => Math.round(v).toLocaleString('ko-KR');

  /* ---------------------------------------------------------------- modes */
  const PAGES = { run: null, cmp: $('pg-cmp'), opt: $('pg-opt') };
  function setMode(m) {
    for (const [k, el] of Object.entries(PAGES)) if (el) el.hidden = k !== m;
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m !== 'run') window.ONE_SIM?.setPlaying(false);
    document.querySelector('footer').hidden = m !== 'run';
  }
  document.querySelectorAll('#modes button').forEach(b => (b.onclick = () => setMode(b.dataset.m)));
  const show3D = (params, label) => { setMode('run'); window.ONE_SIM?.load(params, label); };

  /* ---------------------------------------------------------------- tooltip */
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  document.addEventListener('mousemove', e => {
    const g = e.target.closest && e.target.closest('[data-tip]');
    if (!g) { tip.hidden = true; return; }
    tip.innerHTML = g.dataset.tip; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(innerWidth - r.width - 8, e.clientX + 12) + 'px'; tip.style.top = Math.max(8, e.clientY - r.height - 10) + 'px';
  });

  /* ---------------------------------------------------------------- a small SVG chart frame */
  function nice(lo, hi, n = 4) {
    if (hi - lo < 1e-9) { hi = lo + 1; lo = lo - 1; }
    const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= raw);
    const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st, ticks = [];
    for (let v = a; v <= b + st / 2; v += st) ticks.push(+v.toFixed(6));
    return { lo: a, hi: b, ticks };
  }
  function frame({ w = 640, h = 240, x, y, xTicks, yTicks, xFmt = String, yFmt = String, xLabel = '', yLabel = '' }) {
    const m = { l: 52, r: 14, t: 12, b: 34 }, X = v => m.l + (v - x[0]) / (x[1] - x[0] || 1) * (w - m.l - m.r), Y = v => h - m.b - (v - y[0]) / (y[1] - y[0] || 1) * (h - m.t - m.b);
    let s = '';
    for (const t of yTicks) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="#1c1d1f"/><text x="${m.l - 6}" y="${Y(t) + 3.5}" text-anchor="end">${yFmt(t)}</text>`;
    for (const t of xTicks) s += `<text x="${X(t)}" y="${h - m.b + 15}" text-anchor="middle">${xFmt(t)}</text>`;
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}" stroke="#3a3c40"/>`;
    if (xLabel) s += `<text x="${(m.l + w - m.r) / 2}" y="${h - 4}" text-anchor="middle">${esc(xLabel)}</text>`;
    if (yLabel) s += `<text x="12" y="${(m.t + h - m.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(m.t + h - m.b) / 2})">${esc(yLabel)}</text>`;
    return { X, Y, svg: body => `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${s}${body}</svg>` };
  }
  const dot = (cx, cy, r, fill, tipHtml, ring = '#0a0a0b') => `<g data-tip="${esc(tipHtml)}"><circle cx="${cx}" cy="${cy}" r="9" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${ring}" stroke-width="2"/></g>`;

  /* ================================================================ scenario compare */
  // the stations worth changing: the slowest cycles (time + stop turnover), and the two checks with an OK rate
  const CT_IDS = ST.filter(s => s.id !== 'A0' && s.id !== 'A1').map(s => ({ id: s.id, c: s.ct + (s.turnover ?? 0) })).sort((a, b) => b.c - a.c).slice(0, 6).map(s => s.id);
  const OK_IDS = ST.filter(s => s.okRate !== undefined).map(s => s.id);
  const DEF = { name: '', pallets: 8, ct: Object.fromEntries(CT_IDS.map(id => [id, byId[id].ct])), ok: Object.fromEntries(OK_IDS.map(id => [id, byId[id].okRate * 100])) };
  const SIDES = [{ key: 'A', color: C_A, name: '현재안' }, { key: 'B', color: C_B, name: '개선안' }];

  function formHtml(side) {
    let h = `<div class="card"><h3><span class="sw" style="background:${side.color}"></span><input id="nm${side.key}" value="${esc(side.name)}" style="background:transparent;border:0;border-bottom:1px solid var(--line);font-weight:600;font-size:13.5px;flex:1;min-width:0"><button class="btn" id="v3d${side.key}">3D로 보기</button></h3><div class="fields">`;
    h += `<span class="lab">지그 팔레트 수</span><input type="number" min="3" max="32" step="1" data-k="pallets" data-def="${DEF.pallets}" id="${side.key}_pallets" value="${DEF.pallets}">`;
    for (const id of CT_IDS) h += `<span class="lab"><b>${id}</b>${esc(byId[id].name)} 사이클 (s)</span><input type="number" min="1" step="0.1" data-k="ct" data-id="${id}" data-def="${DEF.ct[id]}" value="${DEF.ct[id]}">`;
    for (const id of OK_IDS) h += `<span class="lab"><b>${id}</b>${esc(byId[id].name)} 양품률 (%)</span><input type="number" min="50" max="100" step="0.5" data-k="ok" data-id="${id}" data-def="${DEF.ok[id]}" value="${DEF.ok[id]}">`;
    return h + '</div></div>';
  }
  $('scnForms').innerHTML = SIDES.map(formHtml).join('');
  const inputs = k => [...document.querySelectorAll(`#scnForms .card:nth-child(${k === 'A' ? 1 : 2}) input[data-k]`)];
  const mark = el => el.classList.toggle('chg', Math.abs(+el.value - +el.dataset.def) > 1e-9);
  document.querySelectorAll('#scnForms input[data-k]').forEach(el => el.addEventListener('input', () => mark(el)));
  function readSide(k) {
    const p = { pallets: DEF.pallets, stations: {} };
    for (const el of inputs(k)) {
      const v = +el.value; if (!Number.isFinite(v)) continue;
      if (el.dataset.k === 'pallets') p.pallets = Math.max(3, Math.min(32, Math.round(v)));
      else if (Math.abs(v - +el.dataset.def) > 1e-9) { const o = (p.stations[el.dataset.id] ??= {}); if (el.dataset.k === 'ct') o.ct = Math.max(1, v); else o.okRate = Math.max(0.5, Math.min(1, v / 100)); }
    }
    return p;
  }
  function writeSide(k, p) {
    for (const el of inputs(k)) {
      const st = p.stations?.[el.dataset.id];
      el.value = el.dataset.k === 'pallets' ? (p.pallets ?? DEF.pallets) : el.dataset.k === 'ct' ? (st?.ct ?? el.dataset.def) : st?.okRate !== undefined ? +(st.okRate * 100).toFixed(1) : el.dataset.def;
      mark(el);
    }
  }
  const ct = (id, f) => +(byId[id].ct * f).toFixed(2);
  const PRESETS = [
    { label: '팔레트 8 → 14', name: '팔레트 14', p: { pallets: 14 } },
    { label: '리크 테스트 20% 단축', name: '리크 20% 단축', p: { pallets: 16, stations: { E3: { ct: ct('E3', 0.8) } } } },
    { label: '리크·레이저 20% 단축 + 팔레트 16', name: '리크·레이저 단축', p: { pallets: 16, stations: { E3: { ct: ct('E3', 0.8) }, B6: { ct: ct('B6', 0.8) } } } },
    { label: '리크 양품률 97 → 90%', name: '리크 NG 증가', p: { pallets: 8, stations: { E3: { okRate: 0.9 } } } },
  ];
  for (const pr of PRESETS) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = pr.label; b.onclick = () => { writeSide('B', pr.p); $('nmB').value = pr.name; }; $('presets').appendChild(b); }
  writeSide('B', PRESETS[0].p); $('nmB').value = PRESETS[0].name;
  for (const s of SIDES) $('v3d' + s.key).onclick = () => show3D(readSide(s.key), $('nm' + s.key).value || s.name);

  const KPI = [
    { k: 'throughputPerHour', label: '시간당 생산', unit: '개/h', fmt: f1, up: true },
    { k: 'perShift', label: '8시간당 생산', unit: '개', fmt: f0, up: true },
    { k: 'leadTime', label: '리드타임 (투입 → 포장)', unit: '분', fmt: v => f1(v / 60), scale: 1 / 60, up: false },
    { k: 'wip', label: '평균 재공', unit: '개', fmt: f1, up: false },
    { k: 'ngRate', label: 'NG 비율 (배출 ÷ 전체)', unit: '%', fmt: v => v.toFixed(2), up: false },
    { k: 'scrapped', label: 'NG 배출 수 (측정 구간)', unit: '개', fmt: f1, info: true },
  ];

  $('runCmp').onclick = () => {
    const reps = +$('reps').value, shift = +$('shift').value;
    const run = { horizon: shift * 3600 + 3600, warmup: 3600, seeds: Array.from({ length: reps }, (_, i) => i + 1) };
    const pa = readSide('A'), pb = readSide('B'), na = $('nmA').value || '현재안', nb = $('nmB').value || '개선안';
    $('runCmp').disabled = true; $('cmpBusy').textContent = `계산 중… (${reps}회 × 2안, ${shift + 1}시간씩)`;
    setTimeout(() => {
      const t0 = performance.now();
      const a = E.runScenario(na, pa, run), b = E.runScenario(nb, pb, run), rows = E.compare(a, b);
      renderCompare(a, b, rows, run, pa, pb);
      $('cmpBusy').textContent = `완료 · ${((performance.now() - t0) / 1000).toFixed(1)}초`; $('runCmp').disabled = false;
    }, 30);
  };

  function renderCompare(a, b, rows, run, pa, pb) {
    $('cmpOut').hidden = false;
    const pm = (s, k) => `${k.fmt(s.mean)}<small>± ${k.fmt(s.half)}</small>`;
    let h = `<tr><th>지표</th><th><span style="color:${C_A}">■</span> ${esc(a.name)}</th><th><span style="color:${C_B}">■</span> ${esc(b.name)}</th><th>차이 (B − A)</th><th>판정</th></tr>`;
    for (const k of KPI) {
      const r = rows.find(x => x.kpi === k.k), better = k.up ? r.delta > 0 : r.delta < 0;
      const v = k.info ? '<span class="verdict">생산량에 따라 변함</span>' : !r.significant ? '<span class="verdict">차이 없음 (잡음 범위)</span>' : better ? '<span class="verdict up">▲ 개선</span>' : '<span class="verdict down">▼ 악화</span>';
      const sign = r.delta > 0 ? '+' : r.delta < 0 ? '−' : '±';
      h += `<tr><td>${k.label} <small style="color:var(--dim)">${k.unit}</small></td><td>${pm(a.kpi[k.k], k)}</td><td>${pm(b.kpi[k.k], k)}</td><td>${sign}${k.fmt(Math.abs(r.delta))}<small>± ${k.fmt(r.half)}</small> <small>(${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%)</small></td><td>${v}</td></tr>`;
    }
    $('kt').innerHTML = h;
    $('ktNote').textContent = `평균 ± 95% 신뢰구간, 시드 ${run.seeds.join('·')} (두 안 같은 시드). 측정 ${(run.horizon - run.warmup) / 3600}시간, 앞 1시간은 워밍업으로 빼고 셉니다. 판정은 시드별 차이의 신뢰구간이 0을 포함하지 않을 때만 '개선/악화'입니다.`;

    // per-seed throughput (paired: a thin line joins the same seed)
    { const xs = run.seeds, va = a.runs.map(r => r.throughputPerHour), vb = b.runs.map(r => r.throughputPerHour);
      const yy = nice(Math.min(...va, ...vb) * 0.97, Math.max(...va, ...vb) * 1.03);
      const F = frame({ w: 520, h: 230, x: [0.5, xs.length + 0.5], y: [yy.lo, yy.hi], xTicks: xs.map((_, i) => i + 1), yTicks: yy.ticks, xFmt: i => '시드 ' + xs[i - 1], yFmt: v => v.toFixed(0), yLabel: '개/h' });
      let body = '';
      xs.forEach((sd, i) => { const x = F.X(i + 1); body += `<line x1="${x - 7}" x2="${x + 7}" y1="${F.Y(va[i])}" y2="${F.Y(vb[i])}" stroke="#3a3c40" stroke-width="1.5"/>`; });
      xs.forEach((sd, i) => { const x = F.X(i + 1); body += dot(x - 7, F.Y(va[i]), 4.5, C_A, `시드 ${sd} · ${esc(a.name)} ${f1(va[i])} 개/h`) + dot(x + 7, F.Y(vb[i]), 4.5, C_B, `시드 ${sd} · ${esc(b.name)} ${f1(vb[i])} 개/h<br>차이 ${(vb[i] - va[i] >= 0 ? '+' : '')}${f1(vb[i] - va[i])}`); });
      $('seedChart').innerHTML = `<div class="bar" style="font-size:11.5px;color:var(--mute);margin-bottom:6px"><span><span style="color:${C_A}">●</span> ${esc(a.name)}</span><span><span style="color:${C_B}">●</span> ${esc(b.name)}</span></div>` + F.svg(body); }

    // hand calculation vs simulation, bottleneck
    const hand = (s, p) => {
      const c = E.capacity(E.buildDemoLine(p)), lim = c.station.perHour <= c.pallets.perHour ? 'station' : 'pallets', sim = s.kpi.throughputPerHour.mean;
      return `<div style="margin-bottom:10px"><b style="color:inherit;font-family:var(--sans)">${esc(s.name)}</b><br>
        가장 느린 공정 ${c.station.id} ${c.station.cycle.toFixed(2)} s → <b>${f1(c.station.perHour)}</b> 개/h${lim === 'station' ? ' (한계)' : ''}<br>
        팔레트 ${c.pallets.count}개 ÷ 1회전 ${c.pallets.loop.toFixed(0)} s → <b>${f1(c.pallets.perHour)}</b> 개/h${lim === 'pallets' ? ' (한계)' : ''}<br>
        손계산 상한 <b>${f1(c.perHour)}</b> · 시뮬 <b>${f1(sim)}</b> 개/h (변동·고장·NG로 ${((1 - sim / c.perHour) * 100).toFixed(1)}% 낮음)<br>
        시뮬 병목 <b>${s.bottleneck}</b> ${esc(byId[s.bottleneck]?.name ?? '')}</div>`;
    };
    $('hand').innerHTML = hand(a, pa) + hand(b, pb) + '<span style="color:var(--dim)">변동·고장·NG 없이 돌리면 시뮬과 손계산이 일치합니다 (자동 테스트로 확인).</span>';

    // utilisation, busiest first
    const ids = Object.keys(a.utilisation).filter(id => byId[id]).sort((x, y) => Math.max(b.utilisation[y].busy + b.utilisation[y].down, a.utilisation[y].busy + a.utilisation[y].down) - Math.max(b.utilisation[x].busy + b.utilisation[x].down, a.utilisation[x].busy + a.utilisation[x].down)).slice(0, 10);
    const bar = (u, nm, id) => `<div class="u" data-tip="${esc(`${id} · ${nm}<br>가동 ${(u.busy * 100).toFixed(1)}% · 막힘 ${(u.blocked * 100).toFixed(1)}% · 고장 ${(u.down * 100).toFixed(1)}%`)}"><u style="width:${u.busy * 100}%;background:var(--busy)"></u><u style="width:${u.blocked * 100}%;background:var(--blocked)"></u><u style="width:${u.down * 100}%;background:var(--down)"></u><span>${(u.busy * 100).toFixed(0)}%</span></div>`;
    let ub = `<span></span><span class="hd">${esc(a.name)}</span><span class="hd">${esc(b.name)}</span>`;
    for (const id of ids) ub += `<span class="id" title="${esc(byId[id].name)}">${id}</span>${bar(a.utilisation[id], a.name, id)}${bar(b.utilisation[id], b.name, id)}`;
    $('ub').innerHTML = ub;
  }

  /* ================================================================ optimisation (GA) */
  const GENES = [
    { on: true, gene: E.palletGene, cost: 0.6, unit: '팔레트 1개', show: v => `${v}개` },
    { on: true, gene: E.ctGene('E3', 'E3 리크 테스트 단축', byId.E3.ct), cost: 2, unit: '1단계 (−10%)', show: v => v ? `−${v * 10}% (${(byId.E3.ct * (1 - 0.1 * v)).toFixed(1)} s)` : '그대로' },
    { on: true, gene: E.ctGene('B6', 'B6 레이저 용접 단축', byId.B6.ct), cost: 2, unit: '1단계 (−10%)', show: v => v ? `−${v * 10}% (${(byId.B6.ct * (1 - 0.1 * v)).toFixed(1)} s)` : '그대로' },
    { on: false, gene: E.ctGene('E5', 'E5 가스켓·볼트 단축', byId.E5.ct), cost: 1, unit: '1단계 (−10%)', show: v => v ? `−${v * 10}% (${(byId.E5.ct * (1 - 0.1 * v)).toFixed(1)} s)` : '그대로' },
  ];
  $('genes').innerHTML = GENES.map((g, i) => `<span class="lab"><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-g="${i}" ${g.on ? 'checked' : ''} style="width:auto">${esc(g.gene.label)} <span style="color:var(--dim)">(${g.gene.min}–${g.gene.max}) · 비용/${esc(g.unit)}</span></label></span><input type="number" step="0.1" min="0" data-gc="${i}" value="${g.cost}">`).join('');
  const SET = [{ k: 'population', label: '세대당 후보 수', v: 12, min: 4, max: 40 }, { k: 'generations', label: '세대 수', v: 10, min: 2, max: 40 }, { k: 'seeds', label: '후보마다 시뮬 반복', v: 2, min: 1, max: 5 }, { k: 'hours', label: '시뮬 시간 (h, 워밍업 1h 별도)', v: 6, min: 2, max: 16 }, { k: 'seed', label: '탐색 난수 시드', v: 1, min: 1, max: 99 }];
  $('gaSet').innerHTML = SET.map(s => `<span class="lab">${s.label}</span><input type="number" min="${s.min}" max="${s.max}" step="1" id="ga_${s.k}" value="${s.v}">`).join('');
  const setv = k => { const s = SET.find(x => x.k === k); return Math.max(s.min, Math.min(s.max, Math.round(+$('ga_' + k).value || s.v))); };

  let ga = null; // { it, gens, all, genes, timer, base }
  $('stopOpt').onclick = () => { if (ga) { clearTimeout(ga.timer); ga.stopped = true; finishOpt('멈춤'); } };
  $('runOpt').onclick = () => {
    const sel = GENES.filter((g, i) => (g.cost = Math.max(0, +document.querySelector(`[data-gc="${i}"]`).value || 0), document.querySelector(`[data-g="${i}"]`).checked));
    if (!sel.length) { $('optBusy').textContent = '찾을 항목을 하나 이상 고르세요'; return; }
    const opts = {
      genes: sel.map(g => g.gene), base: { pallets: 8 }, population: setv('population'), generations: setv('generations'), seed: setv('seed'),
      horizon: setv('hours') * 3600 + 3600, warmup: 3600, evalSeeds: Array.from({ length: setv('seeds') }, (_, i) => 11 + i),
      costPerUnit: Object.fromEntries(sel.map(g => [g.gene.key, g.cost])),
    };
    ga = { it: E.optimizeSteps(opts), gens: [], all: new Map(), sel, opts, timer: null, stopped: false, t0: performance.now() };
    $('runOpt').disabled = true; $('stopOpt').disabled = false;
    const step = () => {
      if (!ga || ga.stopped) return;
      const r = ga.it.next();
      if (r.done) { finishOpt('완료'); return; }
      const g = r.value; ga.gens.push(g);
      for (const c of g.population) ga.all.set(c.genes.join(','), c);
      $('optBusy').textContent = `세대 ${g.index + 1} / ${opts.generations} · 후보 ${ga.all.size}개 평가`;
      drawGA(); ga.timer = setTimeout(step, 120); // a short pause so each generation is seen
    };
    $('optBusy').textContent = '첫 세대 계산 중…'; drawGA(); ga.timer = setTimeout(step, 30);
  };
  function finishOpt(word) { $('runOpt').disabled = false; $('stopOpt').disabled = true; if (ga) $('optBusy').textContent = `${word} · ${ga.gens.length}세대 · 후보 ${ga.all.size}개 · ${((performance.now() - ga.t0) / 1000).toFixed(1)}초`; }
  const paramsOf = (sel, genes) => { const p = { pallets: 8 }; sel.forEach((g, i) => g.gene.apply(p, genes[i])); return p; };

  function drawGA() {
    const G = ga.opts.generations, gens = ga.gens;
    if (!gens.length) { $('gaChart').innerHTML = ''; $('paretoChart').innerHTML = ''; return; }
    const allScores = gens.flatMap(g => g.population.map(c => c.score)), yy = nice(Math.min(...allScores), Math.max(...allScores));
    const F = frame({ w: 680, h: 260, x: [-0.5, G - 0.5], y: [yy.lo, yy.hi], xTicks: Array.from({ length: G }, (_, i) => i), yTicks: yy.ticks, xFmt: i => (i % Math.ceil(G / 10) === 0 ? String(i + 1) : ''), yFmt: v => v.toFixed(0), xLabel: '세대', yLabel: '점수' });
    let body = '';
    for (const g of gens) for (const c of g.population) body += dot(F.X(g.index) + ((c.genes.reduce((a, v) => a * 31 + v, 7) % 9) - 4) * 1.6, F.Y(c.score), 2.6, C_DOT, `세대 ${g.index + 1}<br>${describe(c.genes, ' · ')}<br>생산 ${f1(c.throughput)} − 비용 ${f1(c.cost)} = ${f1(c.score)}`, 'none');
    const line = (vals, color, dash = '') => `<polyline fill="none" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${vals.map((v, i) => `${F.X(i)},${F.Y(v)}`).join(' ')}"/>`;
    body += line(gens.map(g => g.mean), C_A, '4 3') + line(gens.map(g => g.best.score), C_B);
    const lb = gens[gens.length - 1];
    body += dot(F.X(lb.index), F.Y(lb.best.score), 4.5, C_BEST, `세대 ${lb.index + 1} 최고 ${f1(lb.best.score)}`);
    $('gaChart').innerHTML = `<div class="bar" style="font-size:11.5px;color:var(--mute);margin-bottom:6px"><span><span style="color:${C_B}">━</span> 세대 최고</span><span><span style="color:${C_A}">┅</span> 세대 평균</span><span><span style="color:${C_DOT}">●</span> 후보</span></div>` + F.svg(body);

    // best so far
    const best = lb.best, found = gens.findIndex(g => g.best.genes.join(',') === best.genes.join(','));
    const base = [...ga.all.values()].find(c => c.genes.every((v, i) => v === (ga.sel[i].gene.key === 'pallets' ? 8 : 0)));
    $('bestBox').innerHTML = `<div class="gv">${ga.sel.map((g, i) => `<span>${esc(g.gene.label)}</span><span>${esc(g.show(best.genes[i]))}</span>`).join('')}</div>
      <div class="gv" style="border-top:1px solid var(--line);padding-top:6px"><span>시간당 생산</span><span>${f1(best.throughput)} 개/h</span><span>투자 비용 (환산)</span><span>${f1(best.cost)}</span><span>점수</span><span style="color:var(--accent)">${f1(best.score)}</span>${base ? `<span>현재안 (팔레트 8, 개선 없음)</span><span>${f1(base.throughput)} 개/h · 점수 ${f1(base.score)}</span>` : ''}<span>처음 나온 세대</span><span>${found + 1}</span></div>
      <div class="bar" style="margin-top:6px"><button class="btn pri" id="best3d">이 안을 3D로 보기</button><button class="btn" id="bestCmp">비교에 넣기</button></div>`;
    $('best3d').onclick = () => show3D(paramsOf(ga.sel, best.genes), '최적화 최고안');
    $('bestCmp').onclick = () => { writeSide('A', { pallets: 8 }); $('nmA').value = '현재안'; writeSide('B', paramsOf(ga.sel, best.genes)); $('nmB').value = '최적화 최고안'; setMode('cmp'); };

    // every evaluated candidate: cost vs throughput
    const all = [...ga.all.values()], xx = nice(0, Math.max(1, ...all.map(c => c.cost))), ty = nice(Math.min(...all.map(c => c.throughput)), Math.max(...all.map(c => c.throughput)));
    const P = frame({ w: 1100, h: 260, x: [xx.lo, xx.hi], y: [ty.lo, ty.hi], xTicks: xx.ticks, yTicks: ty.ticks, xFmt: v => v.toFixed(0), yFmt: v => v.toFixed(0), xLabel: '투자 비용 (시간당 생산 환산)', yLabel: '개/h' });
    let pb = '';
    for (const c of all) if (c !== best) pb += dot(P.X(c.cost), P.Y(c.throughput), 3, C_DOT, `${describe(c.genes, ' · ')}<br>생산 ${f1(c.throughput)} · 비용 ${f1(c.cost)} · 점수 ${f1(c.score)}`, 'none');
    pb += dot(P.X(best.cost), P.Y(best.throughput), 5.5, C_BEST, `최고안 · ${describe(best.genes, ' · ')}<br>생산 ${f1(best.throughput)} · 비용 ${f1(best.cost)} · 점수 ${f1(best.score)}`);
    $('paretoChart').innerHTML = P.svg(pb);
  }
  const describe = (genes, sep) => ga.sel.map((g, i) => `${g.gene.key === 'pallets' ? '팔레트' : g.gene.key.slice(3)} ${g.show(genes[i])}`).join(sep);
})();
