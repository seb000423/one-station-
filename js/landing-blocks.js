// Landing hero (index.html): scattered blocks fly together into a small robot-cell factory and, beside it, the
// "one" mark; then the factory runs. Plain SVG boxes (isometric for the factory, a front view for the letters),
// tweened with anime.js (js/vendor/anime.min.js, MIT).
//
// Every block is one box (min corner i, j, k and size a × b × c; i to the right-front, j to the left-front, k up)
// and stays the same object from the scatter to the end: it flies, it never pops in or out. While the factory runs,
// the parts ride a closed loop conveyor in index steps (all move one pitch, then wait), the press and the robot's
// tool come down onto the part standing under them during the wait (touching its top, never through it), and the
// AGV drives its tote between two stations along the yellow lane.
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

  /* ---------------------------------------------------------------- the "one" mark (front view: across, up) */
  const GLYPH = {
    o: ['.###.', '#...#', '#...#', '#...#', '.###.'],
    n: ['####.', '#...#', '#...#', '#...#', '#...#'],
    e: ['.###.', '#...#', '#####', '#....', '.####'],
  };
  const NF = B.length; // blocks 0 … NF−1 build the factory, the rest spell "one"
  ['o', 'n', 'e'].forEach((ch, li) => GLYPH[ch].forEach((row, r) => [...row].forEach((c, x) => {
    if (c !== '#') return;
    const teal = ch === 'n' && (x === 0 || (r === 0 && x === 1)); // the logo's "1" in the n
    B.push({ role: 'letter', px: li * 6 + x, row: r, col: hex(teal ? C.teal : C.white) });
  })));
  const LW = 17; // the letters span 17 pixels across, 5 down

  /* ---------------------------------------------------------------- views: isometric (factory) and front (letters) */
  // m = 0: isometric; m = 1: a front view (x across, y down; a little depth up and to the right)
  const proj = (i, j, k, m) => [(i - j) * 0.866 * (1 - m) + (i - 0.3 * j) * m, (i + j) * 0.5 * (1 - m) + (0.3 * j) * m - k];
  const corners = s => { const o = []; for (const di of [0, s.a]) for (const dj of [0, s.b]) for (const dk of [0, s.c]) o.push([s.i + di, s.j + dj, s.k + dk]); return o; };
  const bounds = (list, m) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const s of list) for (const [i, j, k] of corners(s)) { const [x, y] = proj(i, j, k, m); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };

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
  // the factory as it stands when it starts running
  const F = B.slice(0, NF).map(b => ({ i: b.F.i, j: b.F.j, k: b.F.k, a: b.F.a, b: b.F.b, c: b.F.c, r: b.F.col[0], g: b.F.col[1], bl: b.F.col[2], m: 0 }));
  factoryAt(0, F);
  const FB = bounds(F, 0);

  /* ---------------------------------------------------------------- layout: where the factory, the letters and the text go */
  const finale = document.getElementById('finale'), fin = [...finale.children], replayB = document.getElementById('replay');
  const view = { x: 0, y: 0, w: 40, drift: 1, op: 0 };
  let T = null; // targets of every block for the current screen
  function layout() {
    const r = svg.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height), wide = W / H > 1.15 && W > 760;
    // fractions of the stage: Rf the factory, Rl the letters (the text sits under the letters, or at the bottom on a phone)
    const Rf = wide ? { x0: 0.47, w: 0.5, y0: 0.13, h: 0.8 } : { x0: 0.03, w: 0.94, y0: 0.27, h: 0.36 };
    const Rl = wide ? { x0: 0.07, w: 0.3, y0: 0.21, h: 0.2 } : { x0: 0.14, w: 0.72, y0: 0.13, h: 0.1 };
    const u = Math.max((FB.x1 - FB.x0) / (Rf.w * W), (FB.y1 - FB.y0) / (Rf.h * H)); // viewBox units per pixel
    const left = (FB.x0 + FB.x1) / 2 - (Rf.x0 + Rf.w / 2) * W * u, top = (FB.y0 + FB.y1) / 2 - (Rf.y0 + Rf.h / 2) * H * u;
    Object.assign(view, { x: left + W * u / 2, y: top + H * u / 2, w: W * u });
    const lw = Rl.w * W * u, lh = Rl.h * H * u, s = Math.min(lw / (LW + 0.3), lh / 5.4), lx = left + Rl.x0 * W * u + (wide ? 0 : (lw - LW * s) / 2), ly = top + Rl.y0 * H * u;
    const c = s * 0.88;
    T = B.map((b, x) => x < NF ? F[x] : { i: lx + b.px * s, j: 0, k: -(ly + b.row * s) - c, a: c, b: c, c, r: b.col[0], g: b.col[1], bl: b.col[2], m: 1 });
    // the text block: under the letters (wide) or along the bottom (phone)
    if (wide) Object.assign(finale.style, { left: (Rl.x0 * 100) + '%', top: ((Rl.y0 + Rl.h) * H + 18) + 'px', right: 'auto', bottom: 'auto', width: (Rl.w * 100 + 6) + '%', textAlign: 'left' });
    else Object.assign(finale.style, { left: '0', right: '0', top: 'auto', bottom: 'max(5vh, 28px)', width: 'auto', textAlign: 'center' });
    finale.classList.toggle('wide', wide);
    return { W, H, u };
  }

  /* ---------------------------------------------------------------- state */
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const PAL = [C.part, C.tote, C.steel, C.white, C.teal, C.wall];
  const cur = B.map(() => ({ i: 0, j: 0, k: 0, a: 1, b: 1, c: 1, r: 0, g: 0, bl: 0, m: 0, o: 1 }));
  const seeds = B.map(() => [rnd(), rnd(), rnd(), rnd(), Math.floor(rnd() * PAL.length)]);
  function scatter() { // unit-ish cubes spread over the whole stage (isometric), drifting
    const { W, H, u } = layout(), x0 = view.x - view.w / 2, y0 = view.y - H * u / 2;
    cur.forEach((c, x) => {
      const [p, q, h, z, ci] = seeds[x], sx = x0 + p * W * u, sy = y0 + (0.08 + q * 0.86) * H * u, k = h * 4 - 1, sz = (0.45 + z * 0.5) * u * 26;
      const a = sx / 0.866, b = 2 * (sy + k); // invert the isometric view
      const col = hex(PAL[ci]); Object.assign(c, { i: (a + b) / 2, j: (b - a) / 2, k, a: sz, b: sz, c: sz, r: col[0], g: col[1], bl: col[2], m: 0, o: 1 });
    });
  }
  let opT = 0, last = performance.now();
  const worldF = document.createElementNS(NS, 'g'), worldL = document.createElementNS(NS, 'g'); world.append(worldF, worldL);
  const els = B.map((b, x) => { const g = document.createElementNS(NS, 'g'), f = ['t', 'r', 'l'].map(() => { const p = document.createElementNS(NS, 'path'); g.appendChild(p); return p; }); (x < NF ? worldF : worldL).appendChild(g); return { g, f }; });
  const shade = (r, g, b, k) => `rgb(${Math.round(Math.min(255, r * k))},${Math.round(Math.min(255, g * k))},${Math.round(Math.min(255, b * k))})`;
  const shadeUp = (r, g, b) => `rgb(${Math.round(r + (255 - r) * 0.16)},${Math.round(g + (255 - g) * 0.16)},${Math.round(b + (255 - b) * 0.16)})`;

  /* ---------------------------------------------------------------- drawing */
  const orders = [null, null];
  const E = 1e-4, behind = (A, Bx) => { // the visible faces are +i, +j, +k in both views: a box wholly at lower k, i or j is behind
    if (A.k1 <= Bx.k0 + E) return true; if (Bx.k1 <= A.k0 + E) return false;
    if (A.i1 <= Bx.i0 + E) return true; if (Bx.i1 <= A.i0 + E) return false;
    if (A.j1 <= Bx.j0 + E) return true; if (Bx.j1 <= A.j0 + E) return false;
    return (A.i0 + A.i1 + A.j0 + A.j1 + A.k0 + A.k1) < (Bx.i0 + Bx.i1 + Bx.j0 + Bx.j1 + Bx.k0 + Bx.k1);
  };
  function paintOrder(bx, slot, parent) { // painter's order (a box before every box it lies behind), only where pictures overlap
    const back = bx.map(() => []);
    for (let p = 0; p < bx.length; p++) for (let q = p + 1; q < bx.length; q++) {
      const A = bx[p], Q = bx[q];
      if (A.x1 <= Q.x0 || Q.x1 <= A.x0 || A.y1 <= Q.y0 || Q.y1 <= A.y0) continue;
      if (behind(A, Q)) back[q].push(p); else back[p].push(q);
    }
    const seen = new Uint8Array(bx.length), out = [];
    const visit = p => { if (seen[p]) return; seen[p] = 1; for (const q of back[p]) visit(q); out.push(p); };
    for (let p = 0; p < bx.length; p++) visit(p);
    const ord = out.join(); if (ord !== orders[slot]) { orders[slot] = ord; for (const p of out) parent.appendChild(els[bx[p].x].g); }
  }
  function render(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (view.op > 0) { opT += dt; factoryAt(opT, cur); }
    const tt = now / 1000, r = svg.getBoundingClientRect(), asp = Math.max(0.3, r.width / Math.max(1, r.height)), h = view.w / asp;
    svg.setAttribute('viewBox', `${(view.x - view.w / 2).toFixed(3)} ${(view.y - h / 2).toFixed(3)} ${view.w.toFixed(3)} ${h.toFixed(3)}`);
    const bf = [], bl = [];
    cur.forEach((s, x) => {
      const fl = view.drift * 0.3 * Math.sin(tt * 0.9 + x * 1.7), i = s.i, j = s.j, k = s.k + fl, a = s.a, b = s.b, c = s.c, m = s.m;
      const P = (di, dj, dk) => proj(i + di, j + dj, k + dk, m), pt = p => p[0].toFixed(3) + ' ' + p[1].toFixed(3);
      const top = [P(0, 0, c), P(a, 0, c), P(a, b, c), P(0, b, c)], ri = [P(a, 0, 0), P(a, b, 0), P(a, b, c), P(a, 0, c)], le = [P(0, b, 0), P(a, b, 0), P(a, b, c), P(0, b, c)];
      const e = els[x];
      e.f[0].setAttribute('d', 'M' + top.map(pt).join('L') + 'Z'); e.f[1].setAttribute('d', 'M' + ri.map(pt).join('L') + 'Z'); e.f[2].setAttribute('d', 'M' + le.map(pt).join('L') + 'Z');
      e.f[0].setAttribute('fill', shadeUp(s.r, s.g, s.bl)); e.f[1].setAttribute('fill', shade(s.r, s.g, s.bl, 0.82)); e.f[2].setAttribute('fill', shade(s.r, s.g, s.bl, 0.6));
      const xs = [...top, ...ri, ...le].map(p => p[0]), ys = [...top, ...ri, ...le].map(p => p[1]);
      (x < NF ? bf : bl).push({ x, i0: i, i1: i + a, j0: j, j1: j + b, k0: k, k1: k + c, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    });
    paintOrder(bf, 0, worldF); paintOrder(bl, 1, worldL);
    requestAnimationFrame(render);
  }

  /* ---------------------------------------------------------------- play: blocks → factory and "one" together → running */
  let anims = [], timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const stopAll = () => { anims.forEach(a => a.pause()); anims = []; timers.forEach(clearTimeout); timers = []; };
  const KEYS = ['i', 'j', 'k', 'a', 'b', 'c', 'r', 'g', 'bl', 'm'];
  const showText = now => { if (now) fin.forEach(e => { e.style.opacity = 1; e.style.transform = 'none'; }); else anims.push(anime({ targets: fin, opacity: [0, 1], translateY: [14, 0], duration: 800, delay: anime.stagger(110), easing: 'easeOutCubic' })); };
  function play() {
    stopAll(); scatter(); view.op = 0; view.drift = 1; replayB.hidden = true;
    fin.forEach(e => { e.style.opacity = 0; e.style.transform = 'translateY(14px)'; });
    // the floor lands first, then walls and machines, low before high; the letters fill in left to right alongside
    const rank = B.map((b, x) => [x, x < NF ? F[x].k * 3 + (F[x].i + F[x].j) * 0.12 : 2 + b.px * 0.35]).sort((p, q) => p[1] - q[1]), pos = new Map(rank.map((p, n) => [p[0], n]));
    later(350, () => {
      anims.push(anime(Object.assign({ targets: cur, easing: 'easeOutExpo', duration: 1300, delay: (el, x) => pos.get(x) * 9 }, Object.fromEntries(KEYS.map(k => [k, (el, x) => T[x][k]])))));
      anims.push(anime({ targets: view, drift: 0, duration: 700, easing: 'easeOutQuad' }));
    });
    later(1500, () => showText(false));
    later(2300, () => { opT = 0; view.op = 1; replayB.hidden = false; });
  }
  function finish(run) { // straight to the end (reduced motion: standing still)
    stopAll(); layout(); cur.forEach((c, x) => Object.assign(c, T[x], { o: 1 })); view.drift = 0; view.op = run ? 1 : 0; opT = 0; showText(true); replayB.hidden = false;
  }
  replayB.onclick = play;
  addEventListener('resize', () => { const done = view.op > 0 || view.drift === 0; layout(); if (done) cur.forEach((c, x) => { if (x >= NF) Object.assign(c, T[x]); }); });
  let started = false;
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; reduce ? finish(false) : play(); } })).observe(svg);
  scatter(); requestAnimationFrame(render);
  window.ONE_LANDING = { play, finish, view, cur, B, T: () => T };
})();
