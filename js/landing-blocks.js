// Landing hero (index.html): scattered blocks assemble into a small smart factory that runs, then gather into the
// "one" mark. Plain SVG boxes drawn in an isometric view, tweened with anime.js (js/vendor/anime.min.js, MIT).
//
// Every block is one box (min corner i, j, k and size a × b × c, in grid units; i to the right-front, j to the
// left-front, k up) and stays the same object through all four phases: it flies, it never pops in or out.
// While the factory runs, the parts ride a closed loop conveyor in index steps (all move one pitch, then wait), the
// press and the robot's tool come down onto the part standing under them during the wait (touching its top, never
// through it), and the AGV drives its tote between two stations along the yellow lane.
(() => {
  'use strict';
  const svg = document.getElementById('stage'), world = document.getElementById('world');
  if (!svg || !world || !window.anime) return;
  const anime = window.anime, NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- colours */
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {
    floor: '#24272c', floor2: '#2b2f35', stripe: '#eec539', wall: '#3b4048', glass: '#1b4f63', steel: '#7a828c', belt: '#4a5058',
    part: '#eec539', press: '#c9ced4', head: '#eec539', robot: '#e8eaed', tool: '#0b6787', agv: '#eec539', tote: '#2fa3c8',
    rack: '#5d646d', box: '#b08a52', cab: '#d7dade', lampG: '#46d17a', lampY: '#ffd84a', teal: '#0b6787', white: '#f1f2f3', plinth: '#202328',
  };

  /* ---------------------------------------------------------------- the factory (grid units) */
  const B = []; // blocks: { F: target box in the factory, role, … }
  const box = (i, j, k, a, b, c, col, role, x) => B.push(Object.assign({ F: { i, j, k, a, b, c, col: hex(col) }, role: role || '' }, x || {}));
  // floor slabs and the AGV lane
  for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) box(x * 4.8, y * 5, -0.35, 4.8, 5, 0.35, (x + y) % 2 ? C.floor2 : C.floor);
  box(0.4, 8.05, 0, 13.6, 0.12, 0.03, C.stripe); box(0.4, 9.65, 0, 13.6, 0.12, 0.03, C.stripe);
  box(11.2, 0.6, 0, 0.12, 6.6, 0.03, C.stripe);
  // back walls with windows
  for (let n = 0; n < 4; n++) { box(n * 3.6, -0.45, 0, 3.6, 0.45, 3.4, C.wall); box(n * 3.6 + 0.6, -0.02, 1.6, 2.4, 0.02, 1.1, C.glass); }
  for (let n = 0; n < 3; n++) box(-0.45, n * 3.34, 0, 0.45, 3.34, 3.4, C.wall);
  // loop conveyor (centre line: i 2.5 … 9.5, j 2.5 … 5.5; belt top at k 0.8)
  box(2, 2, 0, 8, 1, 0.8, C.belt); box(2, 5, 0, 8, 1, 0.8, C.belt); box(2, 3, 0, 1, 2, 0.8, C.belt); box(9, 3, 0, 1, 2, 0.8, C.belt);
  const LOOP = { i0: 2.5, j0: 2.5, i1: 9.5, j1: 5.5, k: 0.8 }, PER = 2 * ((LOOP.i1 - LOOP.i0) + (LOOP.j1 - LOOP.j0)), PITCH = 2, PART = 0.62, PH = 0.42;
  for (let n = 0; n < PER / PITCH; n++) box(0, 0, LOOP.k, PART, PART, PH, C.part, 'part', { s0: n * PITCH });
  // press over the loop at i 4.5 (north side): two pillars, a beam, the moving head
  const PRESS = { i: 4.5, j: 2.5, up: 2.15, down: LOOP.k + PH };
  box(4.3, 1.45, 0, 0.4, 0.4, 3.0, C.press); box(4.3, 3.15, 0, 0.4, 0.4, 3.0, C.press); box(4.2, 1.45, 3.0, 0.6, 2.1, 0.35, C.press);
  box(PRESS.i - 0.4, PRESS.j - 0.4, PRESS.up, 0.8, 0.8, 0.5, C.head, 'press');
  box(PRESS.i - 0.06, PRESS.j - 0.06, PRESS.up + 0.5, 0.12, 0.12, 2.5 - PRESS.up + 0.5, C.steel, 'rod'); // the ram between head and beam
  // robot at the south side (i 5.5): base, column, boom over the belt, the tool coming down on the part
  const ROB = { i: 5.5, j: 5.5, up: 1.75, down: LOOP.k + PH };
  box(5.0, 6.45, 0, 1.0, 1.0, 0.55, C.robot); box(5.25, 6.7, 0.55, 0.5, 0.5, 1.75, C.robot); box(5.3, 5.2, 2.3, 0.4, 2.0, 0.35, C.robot);
  box(ROB.i - 0.15, ROB.j - 0.15, ROB.up, 0.3, 0.3, 0.55, C.tool, 'tool');
  box(5.82, 6.5, 0.55, 0.16, 0.16, 0.42, C.lampG, 'lamp');
  // AGV lane: two stations, the AGV and its tote
  box(0.5, 8.4, 0, 1.2, 1.0, 0.75, C.rack); box(12.3, 8.4, 0, 1.2, 1.0, 0.75, C.rack);
  const AGV = { i0: 1.9, i1: 10.9, j: 8.45 };
  box(AGV.i0, AGV.j, 0, 1.1, 0.9, 0.3, C.agv, 'agv'); box(AGV.i0 + 0.15, AGV.j + 0.1, 0.3, 0.8, 0.7, 0.55, C.tote, 'tote');
  // storage racks along the back wall with cartons, a control cabinet with a lamp
  for (const ri of [1.0, 7.0]) { box(ri, 0.2, 0, 3.4, 1.0, 0.12, C.rack); box(ri, 0.2, 1.1, 3.4, 1.0, 0.12, C.rack); for (const bi of [0.2, 1.3, 2.4]) box(ri + bi, 0.35, 0.12, 0.8, 0.7, 0.6, C.box); box(ri + 0.6, 0.35, 1.22, 0.8, 0.7, 0.6, C.box); }
  box(12.0, 1.0, 0, 1.2, 0.7, 2.2, C.cab); box(12.5, 1.7, 1.55, 0.2, 0.05, 0.2, C.lampY, 'blink');

  /* ---------------------------------------------------------------- the "one" mark (front view: i across, k up) */
  const GLYPH = {
    o: ['.###.', '#...#', '#...#', '#...#', '.###.'],
    n: ['####.', '#...#', '#...#', '#...#', '#...#'],
    e: ['.###.', '#...#', '#####', '#....', '.####'],
  };
  const PIX = [];
  ['o', 'n', 'e'].forEach((ch, li) => GLYPH[ch].forEach((row, r) => [...row].forEach((c, x) => {
    if (c !== '#') return;
    const teal = ch === 'n' && (x === 0 || (r === 0 && x === 1)); // the logo's "1" in the n
    PIX.push({ i: li * 6 + x, k: 4 - r, col: teal ? C.teal : C.white });
  })));
  const LW = 17; // letters span 0 … 17
  // what is left over lies as a low stage under the letters
  const rest = B.length - PIX.length, rows = Math.max(1, Math.ceil(rest / 19)), L = PIX.map(p => ({ i: p.i - LW / 2 + 0.05, j: 0, k: p.k + 0.35, a: 0.9, b: 0.9, c: 0.9, col: hex(p.col) }));
  for (let r = 0, n = 0; r < rows; r++) { const cnt = Math.ceil((rest - n) / (rows - r)), w = (LW + 2) / cnt; for (let c = 0; c < cnt; c++, n++) L.push({ i: -LW / 2 - 1 + c * w + 0.04, j: 0.4 + r * 0.95, k: -0.05, a: w - 0.08, b: 0.85, c: 0.22, col: hex(C.plinth) }); }

  /* ---------------------------------------------------------------- views: isometric ↔ front (oblique) */
  const proj = (i, j, k, m) => [(i - j) * 0.866 * (1 - m) + (i - 0.3 * j) * m, (i + j) * 0.5 * (1 - m) + (0.3 * j) * m - k];
  const corners = s => { const o = []; for (const di of [0, s.a]) for (const dj of [0, s.b]) for (const dk of [0, s.c]) o.push([s.i + di, s.j + dj, s.k + dk]); return o; };
  const bounds = (list, m) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const s of list) for (const [i, j, k] of corners(s)) { const [x, y] = proj(i, j, k, m); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };

  /* ---------------------------------------------------------------- state */
  // scatter: unit-ish cubes spread over a wide field, drifting
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const PAL = [C.part, C.tote, C.steel, C.white, C.teal, C.wall];
  const S = B.map(() => { const sz = 0.5 + rnd() * 0.5; return { i: -9 + rnd() * 32, j: -9 + rnd() * 26, k: rnd() * 7 - 1, a: sz, b: sz, c: sz, col: hex(PAL[Math.floor(rnd() * PAL.length)]) }; });
  const cur = S.map(s => ({ i: s.i, j: s.j, k: s.k, a: s.a, b: s.b, c: s.c, r: s.col[0], g: s.col[1], bl: s.col[2], o: 1 }));
  const view = { m: 0, x: 0, y: 0, w: 40, drift: 1, op: 0 }; // m: 0 isometric … 1 front; drift: floating of the scattered blocks; op: the factory runs
  let opT = 0, last = performance.now();

  // SVG: one group of three faces per block
  const els = B.map(() => { const g = document.createElementNS(NS, 'g'), f = ['t', 'r', 'l'].map(() => { const p = document.createElementNS(NS, 'path'); g.appendChild(p); return p; }); world.appendChild(g); return { g, f }; });
  const shade = (r, g, b, k) => `rgb(${Math.round(Math.min(255, r * k))},${Math.round(Math.min(255, g * k))},${Math.round(Math.min(255, b * k))})`;
  const shadeUp = (r, g, b) => `rgb(${Math.round(r + (255 - r) * 0.16)},${Math.round(g + (255 - g) * 0.16)},${Math.round(b + (255 - b) * 0.16)})`;

  /* ---------------------------------------------------------------- the running factory */
  const ease = u => u * u * (3 - 2 * u), clamp = u => Math.max(0, Math.min(1, u));
  const STEP = 2.0, MOVE = 0.8; // one index step: move one pitch, then wait while the stations work
  const loopAt = s => { s = ((s % PER) + PER) % PER; const w = LOOP.i1 - LOOP.i0, h = LOOP.j1 - LOOP.j0;
    if (s < w) return [LOOP.i0 + s, LOOP.j0]; s -= w; if (s < h) return [LOOP.i1, LOOP.j0 + s]; s -= h; if (s < w) return [LOOP.i1 - s, LOOP.j1]; s -= w; return [LOOP.i0, LOOP.j1 - s]; };
  const stamp = t => { const f = t % STEP; if (f < MOVE) return 0; const u = (f - MOVE) / (STEP - MOVE); return Math.sin(Math.PI * clamp((u - 0.08) / 0.7)); }; // 0 up … 1 on the part
  function factoryAt(t, out) { // positions of the moving blocks at running time t (out[n] = cur-like)
    const n = Math.floor(t / STEP), f = t - n * STEP, s = (n + ease(clamp(f / MOVE))) * PITCH, d = stamp(t);
    B.forEach((b, x) => {
      const o = out[x];
      if (b.role === 'part') { const [pi, pj] = loopAt(b.s0 + s); o.i = pi - PART / 2; o.j = pj - PART / 2; }
      else if (b.role === 'press') o.k = PRESS.up - (PRESS.up - PRESS.down) * d;
      else if (b.role === 'rod') { o.k = PRESS.up - (PRESS.up - PRESS.down) * d + 0.5; o.c = 3.0 - o.k; }
      else if (b.role === 'tool') o.k = ROB.up - (ROB.up - ROB.down) * d;
      else if (b.role === 'agv' || b.role === 'tote') { const T = 9, u = (t % T) / T, g = u < 0.12 ? 0 : u < 0.5 ? ease((u - 0.12) / 0.38) : u < 0.62 ? 1 : 1 - ease((u - 0.62) / 0.38); o.i = AGV.i0 + (AGV.i1 - AGV.i0) * g + (b.role === 'tote' ? 0.15 : 0); }
      else if (b.role === 'lamp') { const c = d > 0.6 ? hex(C.lampY) : hex(C.lampG); o.r = c[0]; o.g = c[1]; o.bl = c[2]; }
      else if (b.role === 'blink') { const on = Math.floor(t * 1.6) % 2 === 0, c = hex(on ? C.lampY : '#5a4a10'); o.r = c[0]; o.g = c[1]; o.bl = c[2]; }
    });
  }
  // the factory targets = the running factory at time 0 (so the run starts exactly where the assembly ends)
  const F = B.map(b => ({ i: b.F.i, j: b.F.j, k: b.F.k, a: b.F.a, b: b.F.b, c: b.F.c, r: b.F.col[0], g: b.F.col[1], bl: b.F.col[2] }));
  factoryAt(0, F);

  /* ---------------------------------------------------------------- drawing */
  let order = null;
  function render(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (view.op > 0) { opT += dt; factoryAt(opT, cur); }
    const m = view.m, tt = now / 1000;
    // the camera: a viewBox around (x, y) of width w, fitted to the element's aspect
    const r = svg.getBoundingClientRect(), asp = Math.max(0.3, r.width / Math.max(1, r.height)), h = view.w / asp;
    svg.setAttribute('viewBox', `${(view.x - view.w / 2).toFixed(3)} ${(view.y - h / 2).toFixed(3)} ${view.w.toFixed(3)} ${h.toFixed(3)}`);
    const bx = [];
    cur.forEach((s, x) => {
      const fl = view.drift * 0.35 * Math.sin(tt * 0.9 + x * 1.7), i = s.i, j = s.j, k = s.k + fl, a = s.a, b = s.b, c = s.c;
      const P = (di, dj, dk) => proj(i + di, j + dj, k + dk, m), pt = p => p[0].toFixed(3) + ' ' + p[1].toFixed(3);
      const top = [P(0, 0, c), P(a, 0, c), P(a, b, c), P(0, b, c)], ri = [P(a, 0, 0), P(a, b, 0), P(a, b, c), P(a, 0, c)], le = [P(0, b, 0), P(a, b, 0), P(a, b, c), P(0, b, c)];
      const e = els[x];
      e.f[0].setAttribute('d', 'M' + top.map(pt).join('L') + 'Z'); e.f[1].setAttribute('d', 'M' + ri.map(pt).join('L') + 'Z'); e.f[2].setAttribute('d', 'M' + le.map(pt).join('L') + 'Z');
      e.f[0].setAttribute('fill', shadeUp(s.r, s.g, s.bl)); e.f[1].setAttribute('fill', shade(s.r, s.g, s.bl, 0.82)); e.f[2].setAttribute('fill', shade(s.r, s.g, s.bl, 0.6));
      e.g.setAttribute('opacity', s.o.toFixed(3));
      const xs = [...top, ...ri, ...le].map(p => p[0]), ys = [...top, ...ri, ...le].map(p => p[1]);
      bx.push({ x, i0: i, i1: i + a, j0: j, j1: j + b, k0: k, k1: k + c, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    });
    // painter's order: a box is drawn before every box it lies behind (the visible faces are +i, +j, +k in both views,
    // so a box entirely at smaller i, smaller j or lower k is behind); only boxes whose pictures overlap are compared
    const E = 1e-4, behind = (A, Bx) => {
      if (A.k1 <= Bx.k0 + E) return true; if (Bx.k1 <= A.k0 + E) return false;
      if (A.i1 <= Bx.i0 + E) return true; if (Bx.i1 <= A.i0 + E) return false;
      if (A.j1 <= Bx.j0 + E) return true; if (Bx.j1 <= A.j0 + E) return false;
      return (A.i0 + A.i1 + A.j0 + A.j1 + A.k0 + A.k1) < (Bx.i0 + Bx.i1 + Bx.j0 + Bx.j1 + Bx.k0 + Bx.k1);
    };
    const back = bx.map(() => []);
    for (let p = 0; p < bx.length; p++) for (let q = p + 1; q < bx.length; q++) {
      const A = bx[p], Q = bx[q];
      if (A.x1 <= Q.x0 || Q.x1 <= A.x0 || A.y1 <= Q.y0 || Q.y1 <= A.y0) continue;
      if (behind(A, Q)) back[q].push(p); else back[p].push(q);
    }
    const seen = new Uint8Array(bx.length), out = [];
    const visit = p => { if (seen[p]) return; seen[p] = 1; for (const q of back[p]) visit(q); out.push(p); };
    for (let p = 0; p < bx.length; p++) visit(p);
    const ord = out.join();
    if (ord !== order) { order = ord; for (const x of out) world.appendChild(els[x].g); }
    requestAnimationFrame(render);
  }

  /* ---------------------------------------------------------------- the camera for each phase */
  const camFor = (list, m, opt = {}) => {
    const bb = bounds(list, m), r = svg.getBoundingClientRect(), asp = Math.max(0.3, r.width / Math.max(1, r.height));
    const pad = opt.pad || 1.18, bw = (bb.x1 - bb.x0) * pad, bh = (bb.y1 - bb.y0) * pad / (opt.hFrac || 0.82);
    const w = Math.max(bw, bh * asp), h = w / asp;
    // shift so the content sits in the part of the stage it is meant for (hFrac of the height, from yTop)
    const cy = (bb.y0 + bb.y1) / 2 + (opt.yShift || 0) * h;
    return { x: (bb.x0 + bb.x1) / 2, y: cy, w };
  };
  const narrow = () => innerWidth < 640;
  const FCAM = () => ({ pad: narrow() ? 1.04 : 1.08, hFrac: narrow() ? 0.62 : 0.84, yShift: 0.01 });
  const LCAM = () => ({ pad: narrow() ? 1.12 : 1.6, hFrac: narrow() ? 0.3 : 0.38, yShift: narrow() ? 0.17 : 0.15 });

  /* ---------------------------------------------------------------- phases */
  const steps = [...document.querySelectorAll('#steps li')], finale = document.getElementById('finale'), fin = [...finale.children];
  const skipB = document.getElementById('skip'), replayB = document.getElementById('replay');
  const setStep = n => steps.forEach((li, x) => { li.classList.toggle('on', x === n); li.classList.toggle('done', x < n); });
  let anims = [], timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const run = a => { anims.push(a); return a; };
  const stopAll = () => { anims.forEach(a => a.pause()); anims = []; timers.forEach(clearTimeout); timers = []; };
  const tween = (targets, to, o) => run(anime(Object.assign({ targets, easing: 'easeOutExpo', duration: 1600 }, typeof to === 'function' ? {} : to, o)));
  const toProps = (list, keys) => Object.fromEntries(keys.map(k => [k, (el, x) => list[x][k]]));
  const KEYS = ['i', 'j', 'k', 'a', 'b', 'c', 'r', 'g', 'bl'];

  function phaseScatter() {
    setStep(0); view.m = 0; view.op = 0; view.drift = 1;
    cur.forEach((c, x) => Object.assign(c, { i: S[x].i, j: S[x].j, k: S[x].k, a: S[x].a, b: S[x].b, c: S[x].c, r: S[x].col[0], g: S[x].col[1], bl: S[x].col[2], o: 1 }));
    Object.assign(view, camFor(S, 0, { pad: 0.85, hFrac: 1 }));
    fin.forEach(e => { e.style.opacity = 0; e.style.transform = 'translateY(14px)'; });
    document.getElementById('steps').style.opacity = 1;
  }
  function phaseAssemble() {
    setStep(1);
    // the floor lands first, then walls and machines; low blocks before high ones
    const rank = B.map((b, x) => [x, F[x].k * 3 + (F[x].i + F[x].j) * 0.12]).sort((p, q) => p[1] - q[1]), pos = new Map(rank.map((p, n) => [p[0], n]));
    run(anime(Object.assign({ targets: cur, easing: 'easeOutExpo', duration: 1500, delay: (el, x) => pos.get(x) * 16 }, toProps(F, KEYS))));
    run(anime({ targets: view, drift: 0, duration: 900, easing: 'easeOutQuad' }));
    run(anime(Object.assign({ targets: view, duration: 1800, easing: 'easeInOutCubic' }, camFor(F, 0, FCAM()))));
  }
  function phaseRun() { setStep(2); opT = 0; view.op = 1; }
  function phaseOne() {
    setStep(3); view.op = 0;
    // blocks fly to the letters in order across the screen (left blocks to left pixels), the view turns to face them
    const sx = s => proj(s.i + s.a / 2, s.j + s.b / 2, s.k, 0)[0];
    const from = cur.map((c, x) => [x, sx(c)]).sort((p, q) => p[1] - q[1]).map(p => p[0]);
    const toL = L.map((l, x) => [x, l.i + (l.k > 0.2 ? 0 : 100)]).sort((p, q) => p[1] - q[1]).map(p => p[0]); // letters first, the stage after
    const big = from.slice().sort((p, q) => (B[q].F.a * B[q].F.b * B[q].F.c) - (B[p].F.a * B[p].F.b * B[p].F.c));
    // the biggest blocks (floor, walls) become the stage; the rest become the letters, matched left to right
    const stageN = L.length - PIX.length, stageSet = new Set(big.slice(0, stageN)), letterFrom = from.filter(x => !stageSet.has(x)), stageFrom = from.filter(x => stageSet.has(x));
    const letterTo = toL.filter(x => x < PIX.length), stageTo = toL.filter(x => x >= PIX.length).sort((p, q) => L[p].i - L[q].i);
    const map = new Map(); letterFrom.forEach((x, n) => map.set(x, letterTo[n])); stageFrom.forEach((x, n) => map.set(x, stageTo[n]));
    const T = cur.map((c, x) => L[map.get(x)]), tk = T.map(t => ({ i: t.i, j: t.j, k: t.k, a: t.a, b: t.b, c: t.c, r: t.col[0], g: t.col[1], bl: t.col[2] }));
    run(anime(Object.assign({ targets: cur, easing: 'easeInOutExpo', duration: 1700, delay: (el, x) => (map.get(x) % 40) * 14 }, toProps(tk, KEYS))));
    const cam = camFor(L, 1, LCAM());
    run(anime(Object.assign({ targets: view, m: 1, duration: 1900, easing: 'easeInOutCubic' }, cam)));
    later(1500, () => {
      document.getElementById('steps').style.opacity = 0.0;
      run(anime({ targets: fin, opacity: [0, 1], translateY: [14, 0], duration: 900, delay: anime.stagger(140), easing: 'easeOutCubic' }));
      skipB.hidden = true; replayB.hidden = false;
    });
  }
  function play() {
    stopAll(); phaseScatter(); skipB.hidden = false; replayB.hidden = true;
    later(1100, phaseAssemble);
    later(1100 + 2600, phaseRun);
    later(1100 + 2600 + 7000, phaseOne);
  }
  function finish() { // straight to the end (skip, reduced motion)
    stopAll(); phaseScatter(); view.drift = 0;
    phaseOne(); anims.forEach(a => a.seek(a.duration));
    timers.forEach(clearTimeout); timers = [];
    document.getElementById('steps').style.opacity = 0; fin.forEach(e => { e.style.opacity = 1; e.style.transform = 'none'; });
    skipB.hidden = true; replayB.hidden = false;
  }
  skipB.onclick = finish; replayB.onclick = play;
  addEventListener('resize', () => { if (view.m > 0.99) Object.assign(view, camFor(L, 1, LCAM())); else if (view.op) Object.assign(view, camFor(F, 0, FCAM())); });
  // run only while the stage is on screen (start when first seen)
  let started = false;
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; reduce ? finish() : play(); } })).observe(svg);
  phaseScatter(); requestAnimationFrame(render);
  window.ONE_LANDING = { play, finish, view, cur, B, L, F };
})();
