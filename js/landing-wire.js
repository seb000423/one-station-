// Landing hero (index.html): small line-drawn blocks float scattered over a perspective grid, then fly together and
// build "ONE AUTOMATION" in the company logo's colours (white / ink, the N's first stem in the logo teal); after
// that a gentle wave runs through the word. Hidden-line drawing (faces filled with the background, edges drawn,
// back to front), tweened with anime.js (js/vendor/anime.min.js, MIT). Colours come from CSS (light / dark).
//
// Every block is one object from start to end: it flies to its place; nothing pops in or out.
(() => {
  'use strict';
  const svg = document.getElementById('stage'), stage = document.getElementById('stageBox');
  if (!svg || !stage || !window.anime) return;
  const anime = window.anime, NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  function word(text, s, x0, y0, accent) { // blocks of a word: lower-left corner of each, `s` blocks per pixel side
    const out = []; let cx = x0;
    for (const ch of text) {
      const g = G[ch], w = g[0].length;
      g.forEach((row, r) => [...row].forEach((c, x) => {
        if (c !== '#') return;
        for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) out.push({ x: cx + x * s + a, y: y0 + (6 - r) * s + b, acc: !!(accent && accent(ch, x)) });
      }));
      cx += (w + 1) * s;
    }
    return { blocks: out, w: cx - x0 - s };
  }

  /* ---------------------------------------------------------------- the word: one row (wide) or two rows (phone) */
  let cubes = [], els = [], W0 = 0, H0 = 0, wide = true;
  const gridG = document.createElementNS(NS, 'g'), world = document.createElementNS(NS, 'g');
  gridG.setAttribute('class', 'grid'); svg.append(gridG, world);
  const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  function build() {
    const r = stage.getBoundingClientRect(); wide = r.width / Math.max(1, r.height) > 1.25;
    const accN = (ch, x) => ch === 'N' && x === 0; // the "1" of the logo
    let one, auto;
    if (wide) { one = word('ONE', 2, 0, 0, accN); auto = word('AUTOMATION', 1, one.w + 5, 0); }
    else { auto = word('AUTOMATION', 1, 0, 0); one = word('ONE', 2, (auto.w - word('ONE', 2, 0, 0).w) / 2, 9, accN); }
    const W = wide ? one.w + 5 + auto.w : auto.w, H = wide ? 14 : 23;
    W0 = W; H0 = H;
    cubes = [...one.blocks, ...auto.blocks].map(b => {
      // where it floats before the build: anywhere over the grid, around and above the word
      const sx = (rnd() - 0.5) * W * 1.5, sy = 1 + rnd() * H * 1.9, sz = -W * 0.5 + rnd() * W * 0.62;
      return { tx: b.x - W / 2, ty: b.y, tz: -0.5, x: sx, y: sy, z: sz, sx, sy, sz, ph: rnd() * 6.28, s: 0.86, acc: b.acc, lift: 0, float: 1 };
    });
    world.textContent = '';
    els = cubes.map(() => { const g = document.createElementNS(NS, 'g'); const f = [0, 1, 2].map(() => { const p = document.createElementNS(NS, 'path'); g.appendChild(p); return p; }); world.appendChild(g); return { g, f }; });
  }

  /* ---------------------------------------------------------------- camera: perspective, a little from above and the right */
  const cam = { yaw: -0.24, pitch: 0.27, fov: 0.62 };
  let C = null;
  function setCam() {
    const D = Math.max(W0, H0 * 2.4) * 1.9, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const tgt = [0, H0 * 0.42, 0], pos = [tgt[0] - sy * cp * D, tgt[1] + sp * D, tgt[2] + cy * cp * D];
    const f = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const rg = [-f[2], 0, f[0]], rl = Math.hypot(...rg); rg[0] /= rl; rg[2] /= rl;
    const up = [rg[1] * f[2] - rg[2] * f[1], rg[2] * f[0] - rg[0] * f[2], rg[0] * f[1] - rg[1] * f[0]];
    C = { pos, f, r: rg, u: up, k: 1 / Math.tan(cam.fov / 2) };
  }
  const P = (x, y, z) => { const d = [x - C.pos[0], y - C.pos[1], z - C.pos[2]], zz = d[0] * C.f[0] + d[1] * C.f[1] + d[2] * C.f[2], xx = d[0] * C.r[0] + d[1] * C.r[1] + d[2] * C.r[2], yy = d[0] * C.u[0] + d[1] * C.u[1] + d[2] * C.u[2]; return [xx / zz * C.k * 100, -yy / zz * C.k * 100, zz]; };

  function fit() { // viewBox around the finished word
    setCam(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cubes) for (const [dx, dy] of [[0, 0], [1, 1]]) { const p = P(c.tx + dx, c.ty + dy, c.tz + 1); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const r = stage.getBoundingClientRect(), asp = r.width / Math.max(1, r.height), pad = wide ? 0.14 : 0.07;
    let w = (x1 - x0) * (1 + pad * 2), h = w / asp; if ((y1 - y0) * 1.9 > h) { h = (y1 - y0) * 1.9; w = h * asp; }
    svg.setAttribute('viewBox', `${(x0 + x1) / 2 - w / 2} ${(y0 + y1) / 2 - h * 0.52} ${w} ${h}`);
  }
  function drawGrid() {
    const ext = Math.max(W0, 40) * 0.9, step = 2; gridG.textContent = '';
    const lines = [];
    for (let x = -ext; x <= ext + 1e-6; x += step) lines.push([[x, 0, -ext * 0.9], [x, 0, ext * 0.45]]);
    for (let z = -ext * 0.9; z <= ext * 0.45 + 1e-6; z += step) lines.push([[-ext, 0, z], [ext, 0, z]]);
    for (const [a, b] of lines) {
      const p = P(...a), q = P(...b); if (p[2] < 1 || q[2] < 1) continue;
      const l = document.createElementNS(NS, 'path'); l.setAttribute('d', `M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`);
      l.style.opacity = (0.25 + 0.75 * Math.min(1, Math.abs((a[2] + b[2]) / 2 + ext * 0.9) / (ext * 1.35))).toFixed(2);
      gridG.appendChild(l);
    }
  }
  const pt = p => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  function render(tt) {
    setCam();
    const order = cubes.map((c, i) => [i, (c.x + 0.5 - C.pos[0]) ** 2 + (c.y + 0.5 - C.pos[1]) ** 2 + (c.z + 0.5 - C.pos[2]) ** 2]).sort((a, b) => b[1] - a[1]);
    for (const [i] of order) {
      const c = cubes[i], e = els[i], s = c.s, fl = c.float * 0.45 * Math.sin(tt * 0.8 + c.ph);
      const x = c.x + (1 - s) / 2, y = c.y + c.lift + fl + (1 - s) / 2, z = c.z + (1 - s) / 2, faces = [];
      if (C.pos[2] > z + s) faces.push([P(x, y, z + s), P(x + s, y, z + s), P(x + s, y + s, z + s), P(x, y + s, z + s)]);
      if (C.pos[1] > y + s) faces.push([P(x, y + s, z), P(x + s, y + s, z), P(x + s, y + s, z + s), P(x, y + s, z + s)]);
      if (C.pos[0] > x + s) faces.push([P(x + s, y, z), P(x + s, y + s, z), P(x + s, y + s, z + s), P(x + s, y, z + s)]);
      else if (C.pos[0] < x) faces.push([P(x, y, z), P(x, y + s, z), P(x, y + s, z + s), P(x, y, z + s)]);
      e.f.forEach((p, k) => p.setAttribute('d', faces[k] ? 'M' + faces[k].map(pt).join('L') + 'Z' : ''));
      e.g.setAttribute('class', c.acc || c.lift > 0.12 ? 'b acc' : 'b');
      world.appendChild(e.g);
    }
  }

  /* ---------------------------------------------------------------- play: scattered → gathered → a wave runs through */
  const replayB = document.getElementById('replay');
  let anims = [], timers = [], idle = false, t0 = 0;
  const stopAll = () => { anims.forEach(a => a.pause()); anims = []; timers.forEach(clearTimeout); timers = []; };
  function setup() { build(); fit(); drawGrid(); }
  function play() {
    stopAll(); idle = false; if (replayB) replayB.hidden = true;
    cubes.forEach(c => Object.assign(c, { x: c.sx, y: c.sy, z: c.sz, float: 1, lift: 0 }));
    const xs = cubes.map(c => c.tx), xmin = Math.min(...xs), span = Math.max(...xs) - xmin + 1;
    timers.push(setTimeout(() => {
      anims.push(anime({ targets: cubes, x: c => c.tx, y: c => c.ty, z: c => c.tz, float: 0, duration: 1500, easing: 'easeInOutCubic', delay: c => ((c.tx - xmin) / span) * 900 + (c.ty % 4) * 25 }));
    }, 900));
    timers.push(setTimeout(() => { idle = true; t0 = performance.now(); if (replayB) replayB.hidden = false; }, 900 + 900 + 1500 + 200));
  }
  function finish() { stopAll(); cubes.forEach(c => Object.assign(c, { x: c.tx, y: c.ty, z: c.tz, float: 0, lift: 0 })); idle = !reduce; t0 = performance.now(); if (replayB) replayB.hidden = false; }
  function tick(now) {
    if (idle && !reduce) { // the wave: blocks lift a little and turn teal as it passes, left to right
      const t = (now - t0) / 1000, period = 4.5, u = (t % period) / period, xs = W0 / 2 + 6, wx = -xs + u * xs * 2;
      for (const c of cubes) { const d = (c.tx + 0.5 - wx) / 2.2; c.lift = 0.5 * Math.exp(-d * d); }
    }
    render(now / 1000);
    requestAnimationFrame(tick);
  }
  if (replayB) replayB.onclick = play;
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const r = stage.getBoundingClientRect(); if ((r.width / Math.max(1, r.height) > 1.25) !== wide) { setup(); finish(); } else { fit(); drawGrid(); } }, 120); });
  setup();
  let started = false;
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; reduce ? finish() : play(); } }), { threshold: 0.2 }).observe(stage);
  requestAnimationFrame(tick);
  window.ONE_LANDING = { play, finish };
})();
