// Landing hero (index.html): small line-drawn blocks drop onto a perspective grid and build "ONE AUTOMATION",
// then a signal wave runs through them. Hidden-line drawing (faces filled with the background, edges in white,
// back to front), tweened with anime.js (js/vendor/anime.min.js, MIT).
//
// Every block is one object from start to end: it comes down from above and lands on its place; nothing pops.
(() => {
  'use strict';
  const svg = document.getElementById('stage'), stage = document.getElementById('stageBox');
  if (!svg || !stage || !window.anime) return;
  const anime = window.anime, NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BG = '#101113', LINE = 'rgba(236,238,240,.78)', ACC = '#eec539', ACC_BG = '#1d1a10';

  /* ---------------------------------------------------------------- letters (5 × 7 pixels; I is 3 wide) */
  const G = {
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  };
  // a word as blocks: { x, y } of each pixel's lower-left corner (y up), `s` blocks per pixel side
  function word(text, s, x0, y0, accent) {
    const out = []; let cx = x0;
    for (const ch of text) {
      const g = G[ch]; const w = g[0].length;
      g.forEach((row, r) => [...row].forEach((c, x) => {
        if (c !== '#') return;
        for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) out.push({ x: cx + x * s + a, y: y0 + (6 - r) * s + b, acc: !!(accent && accent(ch, x, r)) });
      }));
      cx += (w + 1) * s;
    }
    return { blocks: out, w: cx - x0 - s };
  }

  /* ---------------------------------------------------------------- layout: one row (wide) or two rows (phone) */
  let cubes = [], els = [], W0 = 0, H0 = 0, wide = true;
  const world = document.createElementNS(NS, 'g'), gridG = document.createElementNS(NS, 'g'), scanG = document.createElementNS(NS, 'path'), leadG = document.createElementNS(NS, 'g');
  gridG.setAttribute('class', 'grid'); scanG.setAttribute('class', 'scan'); leadG.setAttribute('class', 'lead');
  svg.append(gridG, world, scanG, leadG);
  function build() {
    const r = stage.getBoundingClientRect(); wide = r.width / Math.max(1, r.height) > 1.25;
    // "ONE" in 2 × 2 blocks per pixel (the N's first stem in yellow, like the 1 in the logo), "AUTOMATION" in single blocks
    const accN = (ch, x) => ch === 'N' && x === 0;
    let one, auto;
    if (wide) { one = word('ONE', 2, 0, 0, accN); auto = word('AUTOMATION', 1, one.w + 5, 0); }
    else { auto = word('AUTOMATION', 1, 0, 0); one = word('ONE', 2, (auto.w - word('ONE', 2, 0, 0).w) / 2, 9, accN); }
    const list = [...one.blocks.map(b => Object.assign(b, { part: 'one' })), ...auto.blocks.map(b => Object.assign(b, { part: 'auto' }))];
    const W = wide ? one.w + 5 + auto.w : auto.w, H = wide ? 14 : 23;
    // centre on the origin (x across, y up, z toward the viewer); every block 0.86 of its cell (a hairline gap)
    cubes = list.map(b => ({ x: b.x - W / 2, y: b.y, z: -0.5, s: 0.86, acc: b.acc, part: b.part, drop: 0, o: 0, lift: 0 }));
    W0 = W; H0 = H;
    world.textContent = '';
    els = cubes.map(c => { const g = document.createElementNS(NS, 'g'); const f = [0, 1, 2].map(() => { const p = document.createElementNS(NS, 'path'); g.appendChild(p); return p; }); world.appendChild(g); return { g, f }; });
  }

  /* ---------------------------------------------------------------- camera: perspective, a little from above and the right */
  const cam = { yaw: -0.24, pitch: 0.27, dist: 0, fov: 0.62 };
  let C = null; // camera basis for this frame
  function setCam() {
    const D = cam.dist || Math.max(W0, H0 * 2.4) * 1.9, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const tgt = [0, H0 * 0.42, 0], pos = [tgt[0] - sy * cp * D, tgt[1] + sp * D, tgt[2] + cy * cp * D];
    const f = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const rgt = [-f[2], 0, f[0]], rl = Math.hypot(...rgt); rgt[0] /= rl; rgt[2] /= rl;
    const up = [rgt[1] * f[2] - rgt[2] * f[1], rgt[2] * f[0] - rgt[0] * f[2], rgt[0] * f[1] - rgt[1] * f[0]];
    C = { pos, f, r: rgt, u: up, k: 1 / Math.tan(cam.fov / 2) };
  }
  const P = (x, y, z) => { const d = [x - C.pos[0], y - C.pos[1], z - C.pos[2]], zz = d[0] * C.f[0] + d[1] * C.f[1] + d[2] * C.f[2], xx = d[0] * C.r[0] + d[1] * C.r[1] + d[2] * C.r[2], yy = d[0] * C.u[0] + d[1] * C.u[1] + d[2] * C.u[2]; return [xx / zz * C.k * 100, -yy / zz * C.k * 100, zz]; };

  /* ---------------------------------------------------------------- drawing */
  const view = { grid: 0, sweep: -1e9, scan: 0, wave: -1e9, waveOn: 0 };
  let box = null;
  function fit() { // viewBox around the finished word, with room for the labels
    setCam(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cubes) for (const [dx, dy] of [[0, 0], [1, 1]]) { const p = P(c.x + dx, c.y + dy * 1, c.z + 1); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const r = stage.getBoundingClientRect(), asp = r.width / Math.max(1, r.height), padX = wide ? 0.16 : 0.08;
    let w = (x1 - x0) * (1 + padX * 2), h = w / asp; if ((y1 - y0) * (wide ? 2.1 : 2.0) > h) { h = (y1 - y0) * (wide ? 2.1 : 2.0); w = h * asp; }
    box = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h * (wide ? 0.5 : 0.46), w, h };
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${w} ${h}`);
  }
  function drawGrid() {
    const lines = [], ext = Math.max(W0, 40) * 0.9, step = 2;
    for (let x = -ext; x <= ext + 1e-6; x += step) lines.push([[x, 0, -ext * 0.9], [x, 0, ext * 0.45]]);
    for (let z = -ext * 0.9; z <= ext * 0.45 + 1e-6; z += step) lines.push([[-ext, 0, z], [ext, 0, z]]);
    gridG.textContent = '';
    for (const [a, b] of lines) {
      const p = P(...a), q = P(...b); if (p[2] < 1 || q[2] < 1) continue;
      const l = document.createElementNS(NS, 'path'); l.setAttribute('d', `M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`);
      const far = Math.min(1, Math.abs((a[2] + b[2]) / 2 + ext * 0.9) / (ext * 1.35)); l.style.opacity = (0.25 + 0.75 * far).toFixed(2);
      gridG.appendChild(l);
    }
  }
  const pt = p => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  function render() {
    setCam();
    const order = cubes.map((c, i) => { const cx = c.x + 0.5, cy = c.y + 0.5, cz = c.z + 0.5; return [i, (cx - C.pos[0]) ** 2 + (cy - C.pos[1]) ** 2 + (cz - C.pos[2]) ** 2]; }).sort((a, b) => b[1] - a[1]);
    for (const [i] of order) {
      const c = cubes[i], e = els[i], s = c.s, x = c.x + (1 - s) / 2, y = c.y + c.drop + c.lift + (1 - s) / 2, z = c.z + (1 - s) / 2;
      const faces = [];
      // visible faces: front (+z), top (+y), the side facing the camera (±x)
      if (C.pos[2] > z + s) faces.push([P(x, y, z + s), P(x + s, y, z + s), P(x + s, y + s, z + s), P(x, y + s, z + s)]);
      if (C.pos[1] > y + s) faces.push([P(x, y + s, z), P(x + s, y + s, z), P(x + s, y + s, z + s), P(x, y + s, z + s)]);
      if (C.pos[0] > x + s) faces.push([P(x + s, y, z), P(x + s, y + s, z), P(x + s, y + s, z + s), P(x + s, y, z + s)]);
      else if (C.pos[0] < x) faces.push([P(x, y, z), P(x, y + s, z), P(x, y + s, z + s), P(x, y, z + s)]);
      e.f.forEach((p, k) => p.setAttribute('d', faces[k] ? 'M' + faces[k].map(pt).join('L') + 'Z' : ''));
      const hot = c.acc || c.lift > 0.12;
      e.g.setAttribute('class', hot ? 'b hot' : 'b'); e.g.style.opacity = c.o.toFixed(3);
      world.appendChild(e.g);
    }
    // the landing front: a thin yellow line standing at the sweep position
    if (view.scan > 0.01) { const a = P(view.sweep, 0, 0.6), b = P(view.sweep, H0 + 1.5, 0.6); scanG.setAttribute('d', `M${pt(a)}L${pt(b)}`); scanG.style.opacity = view.scan.toFixed(2); } else scanG.style.opacity = 0;
  }

  /* ---------------------------------------------------------------- labels: dotted leaders from the word to the three tools */
  const LABELS = [...document.querySelectorAll('#stageBox .tag')];
  function placeLabels() {
    leadG.textContent = '';
    const ctm = svg.getScreenCTM(), sr = stage.getBoundingClientRect(); if (!ctm) return;
    const toPx = p => { const q = svg.createSVGPoint(); q.x = p[0]; q.y = p[1]; const s = q.matrixTransform(ctm); return [s.x - sr.left, s.y - sr.top]; };
    const toSvg = (px, py) => { const q = svg.createSVGPoint(); q.x = px + sr.left; q.y = py + sr.top; const s = q.matrixTransform(ctm.inverse()); return [s.x, s.y]; };
    const anchors = { one: cubes.filter(c => c.part === 'one'), auto: cubes.filter(c => c.part === 'auto') };
    const at = (list, f) => { const xs = list.map(c => c.x), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1; const x = x0 + (x1 - x0) * f; const top = Math.max(...list.filter(c => Math.abs(c.x + 0.5 - x) < 1.2).map(c => c.y)) + 1; return P(x, top, 0.5); };
    const spots = wide ? [[anchors.one, 0.5, -1], [anchors.auto, 0.32, -1], [anchors.auto, 0.86, 1]] : [[anchors.one, 0.5, -1], [anchors.auto, 0.2, 1], [anchors.auto, 0.85, 1]];
    LABELS.forEach((el, n) => {
      const [list, f, side] = spots[n], a = toPx(at(list, f)), w = el.offsetWidth, h = el.offsetHeight;
      let lx = a[0] - w / 2, ly = side < 0 ? a[1] - h - (wide ? 56 : 30) : a[1] + (wide ? 150 : n === 1 ? 70 : 104);
      lx = Math.max(8, Math.min(sr.width - w - 8, lx)); ly = Math.max(8, Math.min(sr.height - h - 8, ly));
      el.style.left = lx + 'px'; el.style.top = ly + 'px';
      const end = toSvg(lx + w / 2, side < 0 ? ly + h : ly), path = document.createElementNS(NS, 'path');
      const start = toSvg(a[0], a[1]);
      path.setAttribute('d', `M${start[0].toFixed(2)} ${start[1].toFixed(2)}L${end[0].toFixed(2)} ${end[1].toFixed(2)}`);
      const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('cx', start[0]); dot.setAttribute('cy', start[1]); dot.setAttribute('r', box.w / 700);
      leadG.append(path, dot);
    });
  }

  /* ---------------------------------------------------------------- play */
  const counter = document.getElementById('count'), total = document.getElementById('total'), replayB = document.getElementById('replay');
  let anims = [], timers = [], idle = false, t0 = 0;
  const stopAll = () => { anims.forEach(a => a.pause()); anims = []; timers.forEach(clearTimeout); timers = []; };
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function setup() { build(); fit(); drawGrid(); total.textContent = String(cubes.length).padStart(3, '0'); }
  function play() {
    stopAll(); idle = false; replayB.hidden = true;
    cubes.forEach((c, i) => { c.drop = 7 + ((i * 7919) % 11); c.o = 0; c.lift = 0; });
    LABELS.forEach(l => { l.style.opacity = 0; }); leadG.style.opacity = 0; counter.textContent = '000';
    gridG.style.opacity = 0; anims.push(anime({ targets: gridG, opacity: [0, 1], duration: 900, easing: 'easeOutQuad' }));
    const xs = cubes.map(c => c.x), xmin = Math.min(...xs), xmax = Math.max(...xs) + 1, span = xmax - xmin, dur = wide ? 1700 : 1500;
    const delay = c => 250 + ((c.x - xmin) / span) * dur + (c.y % 3) * 18;
    anims.push(anime({ targets: cubes, drop: 0, o: [{ value: 1, duration: 260, easing: 'linear' }], duration: 700, delay: (c) => delay(c), easing: 'easeOutExpo',
      update: () => { const landed = cubes.filter(c => c.drop < 0.05).length; counter.textContent = String(landed).padStart(3, '0'); } }));
    view.sweep = xmin; view.scan = 1;
    anims.push(anime({ targets: view, sweep: [xmin, xmax + 1], duration: dur + 500, delay: 250, easing: 'linear', complete: () => anims.push(anime({ targets: view, scan: 0, duration: 400, easing: 'linear' })) }));
    later(250 + dur + 750, () => {
      counter.textContent = String(cubes.length).padStart(3, '0');
      placeLabels();
      anims.push(anime({ targets: leadG, opacity: [0, 1], duration: 600, easing: 'linear' }));
      anims.push(anime({ targets: LABELS, opacity: [0, 1], translateY: [8, 0], duration: 600, delay: anime.stagger(140), easing: 'easeOutCubic' }));
      idle = true; t0 = performance.now(); replayB.hidden = false;
    });
  }
  function finish() { stopAll(); cubes.forEach(c => { c.drop = 0; c.o = 1; c.lift = 0; }); gridG.style.opacity = 1; view.scan = 0; counter.textContent = String(cubes.length).padStart(3, '0'); render(); placeLabels(); leadG.style.opacity = 1; LABELS.forEach(l => { l.style.opacity = 1; l.style.transform = 'none'; }); replayB.hidden = false; }

  // after the build: a signal wave runs across the word every few seconds (blocks lift a little and turn yellow), the view sways slowly
  function tick(now) {
    if (idle && !reduce) {
      const t = (now - t0) / 1000, period = 4.2, u = (t % period) / period, xs = W0 / 2 + 6, wx = -xs + u * xs * 2;
      for (const c of cubes) { const d = (c.x + 0.5 - wx) / 2.2; c.lift = 0.55 * Math.exp(-d * d) * (u < 0.98 ? 1 : 0); }
    }
    render();
    requestAnimationFrame(tick);
  }
  replayB.onclick = () => { play(); };
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const was = wide; const r = stage.getBoundingClientRect(); if ((r.width / Math.max(1, r.height) > 1.25) !== was) { setup(); finish(); } else { fit(); drawGrid(); if (idle || reduce) placeLabels(); } }, 120); });
  setup();
  cubes.forEach(c => { c.o = 0; });
  let started = false;
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; reduce ? finish() : play(); } }), { threshold: 0.25 }).observe(stage);
  requestAnimationFrame(tick);
  window.ONE_LANDING = { play, finish, cubes: () => cubes };
})();
