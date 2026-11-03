// 설비 구성 마법사 (ONE BUILDER): step-by-step configuration of a linear axis / gantry, like a supplier's selection tool,
// except that every step changes the 3D model at once and the result carries on into the line (cycle time, signals, BOM).
//
//   TYPES.linax           the equipment type: body, carriages, motor, stand / wall plate, gantry bridge, load box, load-centre
//                         marker; animate() runs the carriage cycle the user entered (dwell → move → dwell → move back,
//                         trapezoid speed 1/3 · 1/3 · 1/3)
//   FactoryConfig.sizing  speed / acceleration / thrust / moment / stroke checks against the series table, picks the
//                         smallest series that passes (or checks the one the user chose)
//   FactoryConfig.mount   renders the wizard into the BUILDER's properties panel and reports changes
//
// SERIES below is a generic example table (round numbers in the range of common ball-screw axes), not a supplier
// catalogue. Part numbers are ONE's own code (LA-…); a supplier catalogue table (part number rule, price, lead time,
// CAD) replaces it later.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  const TYPES = FE.TYPES, { mat } = FE.helpers;
  const G = 9.81, MU = 0.02;   // guide friction (linear guide + seals, conservative)

  const SERIES = {
    S: { label: 'S (소형)', w: 0.06, h: 0.05, car: 0.08, load: { floor: 20, wall: 10 }, vmax: 1.0, thrust: 150, moment: 15, strokeMax: 800 },
    M: { label: 'M (중형)', w: 0.09, h: 0.07, car: 0.12, load: { floor: 60, wall: 30 }, vmax: 1.5, thrust: 500, moment: 60, strokeMax: 1500 },
    L: { label: 'L (대형)', w: 0.13, h: 0.09, car: 0.18, load: { floor: 150, wall: 80 }, vmax: 2.0, thrust: 1500, moment: 200, strokeMax: 3000 },
  };
  const DRIVERS = [['none', '불필요 (고객 준비)'], ['pulse', '펄스열 드라이버'], ['ethercat', 'EtherCAT 드라이버'], ['eip', 'EtherNet/IP 드라이버']];
  const STROKES = []; for (let s = 50; s <= 3000; s += s < 1000 ? 50 : 100) STROKES.push(s);

  const defaults = () => ({
    form: 'single', carriages: 1, mount: 'floor', elev: 0.8, span: 600,
    offX: 10, offY: 10, offZ: 50, load: 10, dist: 300, dwell: 1, move: 1,
    stroke: 400, series: 'auto', driver: 'none', prefix: '',
  });

  /* ------------------------------------------------------------------ sizing */
  function motion(p) {   // trapezoid 1/3 · 1/3 · 1/3
    const d = Math.max(0, p.dist) / 1000, t = Math.max(0.05, p.move);
    const v = 1.5 * d / t, a = v / (t / 3);
    return { d, t, v, a };
  }
  function check(p, key) {
    const S = SERIES[key], m = motion(p), mass = Math.max(0, p.load);
    const thrust = mass * (m.a + MU * G);
    const off = Math.hypot(p.offX, p.offY, p.offZ) / 1000;
    const moment = mass * G * off + mass * m.a * Math.abs(p.offZ) / 1000;
    const rows = [
      ['가반 하중', mass, S.load[p.mount] / (p.form === 'gantry' ? 0.5 : 1), 'kg', 0],
      ['최고 속도', m.v, S.vmax, 'm/s', 2],
      ['필요 추력', thrust, S.thrust * (p.form === 'gantry' ? 2 : 1), 'N', 0],
      ['모멘트 (편심)', moment, S.moment * (p.form === 'gantry' ? 2 : 1), 'N·m', 1],
      ['스트로크', p.stroke, S.strokeMax, 'mm', 0],
    ].map(([label, need, cap, unit, dp]) => ({ label, need, cap, unit, dp, ratio: cap > 0 ? need / cap : Infinity }));
    const travel = { label: '이동 거리 ≤ 스트로크', need: p.dist, cap: p.stroke, unit: 'mm', dp: 0, ratio: p.stroke > 0 ? p.dist / p.stroke : Infinity };
    rows.push(travel);
    return { key, rows, ok: rows.every(r => r.ratio <= 1), worst: rows.reduce((a, b) => (b.ratio > a.ratio ? b : a)) };
  }
  function sizing(p) {
    p = Object.assign(defaults(), p);
    const m = motion(p), cycleOne = p.dwell + p.move;
    const order = ['S', 'M', 'L'];
    let pick = null;
    if (p.series !== 'auto' && SERIES[p.series]) pick = check(p, p.series);
    else pick = order.map(k => check(p, k)).find(c => c.ok) || check(p, 'L');
    const advice = [];
    if (!pick.ok) {
      const w = pick.worst;
      if (w.label === '최고 속도' || w.label === '필요 추력') advice.push('이동 시간을 늘리면 속도·가속도가 줄어듭니다');
      if (w.label === '모멘트 (편심)') advice.push('편심(특히 Z)을 줄이거나 갠트리로 바꾸면 모멘트가 나뉩니다');
      if (w.label === '가반 하중') advice.push('하중을 줄이거나 갠트리 · 바닥 설치로 바꾸세요');
      if (w.label.startsWith('이동 거리')) advice.push('스트로크를 이동 거리 이상으로 고르세요');
      if (w.label === '스트로크') advice.push('이 시리즈의 최대 스트로크를 넘습니다. 큰 시리즈를 고르세요');
      if (p.series !== 'auto' && pick.key !== 'L') advice.push('시리즈를 "자동"으로 두면 통과하는 가장 작은 형식을 고릅니다');
    }
    return { m, cycleOne, cycleRound: 2 * cycleOne, pick, advice, series: SERIES[pick.key] };
  }
  const recStroke = dist => STROKES.find(s => s >= dist + 20) || STROKES[STROKES.length - 1];

  function partNo(p, sz) {
    const f = p.form === 'gantry' ? 'G' : 'S', mt = p.mount === 'wall' ? 'W' : 'F';
    const dv = { none: 'N', pulse: 'P', ethercat: 'E', eip: 'I' }[p.driver] || 'N';
    return `LA-${sz.pick.key}${f}${mt}-${String(p.stroke).padStart(4, '0')}-${p.carriages}C-${dv}`;
  }
  function signals(p, name) {
    const base = (p.prefix || name || 'AX').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase().replace(/^_+|_+$/g, '') || 'AX';
    const pre = (/^[A-Z]/.test(base) ? base : 'AX' + base).slice(0, 14);
    const o = (k, l) => ({ tag: `${pre}_${k}`.slice(0, 32), dir: 'out', label: l }), i = (k, l) => ({ tag: `${pre}_${k}`.slice(0, 32), dir: 'in', label: l });
    return [o('SERVO_ON', '서보 ON'), o('START', '이동 시작'), o('POS_SEL', '위치 번호 선택'), o('HOME_REQ', '원점 복귀 요청'),
      i('READY', '준비 완료'), i('INPOS', '위치 도달'), i('HOME', '원점 위치'), i('ALARM', '알람')];
  }
  function bom(p, sz) {
    const axes = p.form === 'gantry' ? 2 : 1, rows = [[partNo(p, sz), `리니어 축 ${sz.pick.key} 시리즈 · 스트로크 ${p.stroke} mm · 가동자 ${p.carriages}`, axes]];
    if (p.driver !== 'none') rows.push([`DRV-${sz.pick.key}-${p.driver.toUpperCase()}`, DRIVERS.find(d => d[0] === p.driver)[1], axes], [`CBL-${sz.pick.key}-3M`, '모터 · 엔코더 케이블 3 m', axes]);
    if (p.form === 'gantry') rows.push([`BRG-${sz.pick.key}-${String(p.span).padStart(4, '0')}`, `갠트리 브리지 판 (축 간격 ${p.span} mm)`, 1]);
    rows.push(p.mount === 'wall' ? [`WPL-${sz.pick.key}`, '벽면 장착 판 + 기둥', axes] : [`STD-${sz.pick.key}-${Math.round(p.elev * 1000)}`, `설치 가대 (높이 ${Math.round(p.elev * 1000)} mm)`, axes]);
    return rows;
  }

  /* ------------------------------------------------------------------ 3D */
  const MAT = {
    body: mat(0xb9c1ca, { metalness: 0.7, roughness: 0.35 }), cover: mat(0x4a525b, { metalness: 0.5, roughness: 0.4 }),
    car: mat(0xdfe3e7, { metalness: 0.6, roughness: 0.3 }), motor: mat(0x23262b, { metalness: 0.5, roughness: 0.4 }),
    frame: mat(0x6f7a85, { metalness: 0.6, roughness: 0.4 }), load: mat(0xb7a888, { metalness: 0.05, roughness: 0.8 }),
    mark: mat(0xff8a2a, { metalness: 0, roughness: 0.4, emissive: 0xff8a2a, emissiveIntensity: 0.8 }),
  };
  const bx = (g, n, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.name = n; b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  const cy = (g, n, r, l, m, x, y, z) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 20), m); c.name = n; c.rotation.z = Math.PI / 2; c.position.set(x, y, z); c.castShadow = true; g.add(c); return c; };

  function dims(p) {
    const S = SERIES[sizing(p).pick.key], n = Math.max(1, Math.min(4, p.carriages | 0)), gap = 0.02, cap = 0.035, motorL = S.h * 1.6;
    const carsL = n * S.car + (n - 1) * gap, len = p.stroke / 1000 + carsL + 2 * cap;
    return { S, n, gap, cap, motorL, carsL, len, total: len + motorL };
  }
  // one axis along X, body centred at x = 0 (motor at -X end); returns the carriage group (moved by animate)
  function axis(g, p, D, z, withLoad) {
    const { S } = D, y = p.mount === 'wall' ? p.elev : p.elev + S.h / 2, a = new THREE.Group(); a.name = 'LA_Axis'; a.position.set(0, y, z); g.add(a);
    if (p.mount === 'wall') a.rotation.x = -Math.PI / 2;   // body on its side, carriage faces +Z (away from the wall plate)
    const x0 = -D.len / 2;
    bx(a, 'LA_Body', D.len, S.h, S.w, MAT.body, 0, 0, 0);
    bx(a, 'LA_Cover', D.len - 2 * D.cap, 0.006, S.w * 0.55, MAT.cover, 0, S.h / 2 + 0.003, 0);
    for (const s of [-1, 1]) bx(a, 'LA_EndCap', D.cap, S.h * 1.05, S.w * 1.05, MAT.cover, s * (D.len / 2 - D.cap / 2), 0, 0);
    bx(a, 'LA_MotorFlange', 0.02, S.h * 0.9, S.w * 0.9, MAT.motor, x0 - 0.01, 0, 0);
    cy(a, 'LA_Motor', S.h * 0.42, D.motorL, MAT.motor, x0 - 0.02 - D.motorL / 2, 0, 0);
    const car = new THREE.Group(); car.name = 'LA_Carriage'; car.position.set(x0 + D.cap + D.carsL / 2, 0, 0); a.add(car);
    for (let i = 0; i < D.n; i++) {
      const cx = -D.carsL / 2 + S.car / 2 + i * (S.car + D.gap);
      bx(car, 'LA_Slider', S.car, 0.025, S.w * 1.25, MAT.car, cx, S.h / 2 + 0.0125, 0);
    }
    car.userData.home = car.position.x;
    if (withLoad && p.load > 0) {   // load box on the first carriage + load-centre marker at the offsets
      const s = Math.min(0.3, Math.max(0.05, Math.cbrt(p.load / 3000)));   // a jig / part block (~3 t/m³ incl. fixture)
      const lx = -D.carsL / 2 + S.car / 2, top = S.h / 2 + 0.025;
      bx(car, 'LA_Load', s, s, s, MAT.load, lx, top + s / 2, 0);
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), MAT.mark); mk.name = 'LA_LoadCentre';
      mk.position.set(lx + p.offX / 1000, top + p.offZ / 1000, p.offY / 1000); car.add(mk);
    }
    return car;
  }
  function build(g, p) {
    p = Object.assign(defaults(), p);
    const D = dims(p), gantry = p.form === 'gantry', span = gantry ? Math.max(0.2, p.span / 1000) : 0;
    const zs = gantry ? [-span / 2, span / 2] : [0];
    const cars = zs.map((z, i) => axis(g, p, D, z, !gantry || i === 0 ? !gantry : false));
    if (gantry) {   // bridge across the two carriages; it carries the load
      const S = D.S, car = cars[0], top = S.h / 2 + 0.025, lx = -D.carsL / 2 + S.car / 2;
      const br = bx(car, 'LA_Bridge', S.car * 1.1, 0.02, span + S.w * 1.25, MAT.frame, lx, top + 0.01, span / 2);
      br.userData.gantry = true;
      if (p.load > 0) {
        const s = Math.min(0.3, Math.max(0.05, Math.cbrt(p.load / 3000)));
        bx(car, 'LA_Load', s, s, s, MAT.load, lx, top + 0.02 + s / 2, span / 2);
        const mk = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), MAT.mark); mk.name = 'LA_LoadCentre';
        mk.position.set(lx + p.offX / 1000, top + 0.02 + p.offZ / 1000, span / 2 + p.offY / 1000); car.add(mk);
      }
      cars[1].userData.follow = true;
    }
    // supports: two stands per axis (floor) or a wall plate on two posts
    const S = D.S, legX = D.len / 2 - 0.12;
    for (const z of zs) {
      if (p.mount === 'wall') {
        const plateH = S.w * 1.6, back = z - S.h / 2 - 0.01;
        bx(g, 'LA_WallPlate', D.len, plateH, 0.015, MAT.frame, 0, p.elev, back - 0.0075);
        for (const s of [-1, 1]) {
          bx(g, 'LA_Post', 0.06, p.elev + plateH / 2, 0.06, MAT.frame, s * legX, (p.elev + plateH / 2) / 2, back - 0.045);
          bx(g, 'LA_Foot', 0.16, 0.012, 0.16, MAT.frame, s * legX, 0.006, back - 0.045);
        }
      } else if (p.elev > 0.05) {
        for (const s of [-1, 1]) {
          bx(g, 'LA_Stand', 0.06, p.elev, 0.06, MAT.frame, s * legX, p.elev / 2, z);
          bx(g, 'LA_StandTop', 0.12, 0.012, S.w * 1.3, MAT.frame, s * legX, p.elev - 0.006, z);
          bx(g, 'LA_Foot', 0.16, 0.012, 0.16, MAT.frame, s * legX, 0.006, z);
        }
      }
    }
  }
  // carriage travel: dwell at home → move out → dwell → move back (trapezoid 1/3 · 1/3 · 1/3)
  function travel(p, t) {
    const d = Math.min(p.dist, p.stroke) / 1000, tm = Math.max(0.05, p.move), tw = Math.max(0, p.dwell), T = 2 * (tm + tw);
    const u = ((t % T) + T) % T;
    const prof = s => { // fraction of the distance after s seconds of a move
      const ta = tm / 3, v = 1.5 / tm, a = v / ta;
      if (s <= ta) return 0.5 * a * s * s;
      if (s <= 2 * ta) return 0.5 * a * ta * ta + v * (s - ta);
      const r = tm - s; return 1 - 0.5 * a * r * r;
    };
    if (u < tw) return 0;
    if (u < tw + tm) return d * prof(u - tw);
    if (u < 2 * tw + tm) return d;
    return d * (1 - prof(u - 2 * tw - tm));
  }
  TYPES.linax = {
    label: '리니어 축', group: 'equip', defaults, build,
    animate: (g, p, t) => {
      p = Object.assign(defaults(), p);
      const x = travel(p, t);
      g.traverse(o => { if (o.name === 'LA_Carriage' && o.userData.home !== undefined) o.position.x = o.userData.home + x; });
    },
    footprint: p => {
      p = Object.assign(defaults(), p); const D = dims(p), S = D.S;
      const depth = p.form === 'gantry' ? Math.max(0.2, p.span / 1000) + S.w * 1.3 : S.w * 1.4 + (p.mount === 'wall' ? 0.12 : 0);
      return [D.total + 0.04, Math.max(0.2, depth)];
    },
  };

  /* ------------------------------------------------------------------ wizard UI */
  const STEPS = ['형식', '설치 방식', '사용 조건', '스트로크', '제어', '결과'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, dp) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: dp, minimumFractionDigits: dp }) : '—');
  // small line drawings for the choice cards (isometric-ish bars)
  const ART = {
    single: n => `<svg viewBox="0 0 120 70"><path d="M10 52 L92 14 L108 22 L26 60 Z" class="b"/>${Array.from({ length: n }, (_, i) => { const t = 0.2 + i * 0.17; const x = 10 + 82 * t, y = 52 - 38 * t; return `<path d="M${x} ${y - 4} L${x + 12} ${y - 9.5} L${x + 20} ${y - 5.5} L${x + 8} ${y} Z" class="c"/>`; }).join('')}</svg>`,
    gantry: () => '<svg viewBox="0 0 120 70"><path d="M6 46 L70 16 L82 22 L18 52 Z" class="b"/><path d="M38 60 L102 30 L114 36 L50 66 Z" class="b"/><path d="M30 38 L44 32 L76 48 L62 54 Z" class="c"/></svg>',
    floor: () => '<svg viewBox="0 0 120 70"><path d="M14 50 L90 16 L104 23 L28 57 Z" class="b"/><path d="M44 36 L58 30 L70 36 L56 42 Z" class="c"/><path d="M60 22 v-14 M60 8 l-3 5 M60 8 l3 5" class="ax"/><text x="64" y="12">Z</text></svg>',
    wall: () => '<svg viewBox="0 0 120 70"><path d="M20 10 L96 10 L96 60 L20 60 Z" class="w"/><path d="M26 30 L90 30 L90 42 L26 42 Z" class="b"/><path d="M48 26 L62 26 L62 46 L48 46 Z" class="c"/></svg>',
  };
  function profileSVG(p, sz) {   // speed–time chart of one move (like a supplier's sizing sheet)
    const W = 260, H = 96, tw = Math.max(0, p.dwell), tm = Math.max(0.05, p.move), T = tw + tm, sx = t => 30 + (t / T) * (W - 44), base = H - 22, top = 18;
    const a = sx(tw), b = sx(tw + tm / 3), c = sx(tw + 2 * tm / 3), d = sx(T);
    return `<svg class="cfgProf" viewBox="0 0 ${W} ${H}"><path d="M30 ${base} H${a} L${b} ${top} H${c} L${d} ${base}" class="v"/><path d="M30 ${top - 8} V${base} H${W - 8}" class="ax"/>
      <path d="M${a} ${top - 6} V${base + 4}" class="dash"/><text x="${(30 + a) / 2}" y="${base + 15}" text-anchor="middle">정지 ${fmt(tw, 2)} s</text>
      <text x="${(a + d) / 2}" y="${base + 15}" text-anchor="middle">이동 ${fmt(tm, 2)} s</text><text x="${(b + c) / 2}" y="${top - 4}" text-anchor="middle">${fmt(sz.m.v, 2)} m/s</text>
      <text x="6" y="${(top + base) / 2}" class="lab">속도</text></svg>`;
  }
  const card = (on, data, art, label) => `<button type="button" class="cfgCard${on ? ' on' : ''}" ${data}>${art}<span>${label}</span></button>`;
  const num = (k, label, v, step, min, max, unit, hint) => `<label class="cfgNum"><span>${label}</span><input type="number" data-cfg="${k}" value="${v}" step="${step}" min="${min}" max="${max}"><em>${unit}</em>${hint ? `<small>${hint}</small>` : ''}</label>`;

  function html(o, p, step) {
    const sz = sizing(p), S = sz.series;
    const head = `<div class="cfgSteps">${STEPS.map((s, i) => `<button type="button" data-step="${i}" class="${i === step ? 'now' : i < step ? 'done' : ''}"><b>${i < 5 ? i + 1 : '✓'}</b>${s}</button>`).join('')}</div>`;
    let body = '';
    if (step === 0) {
      body = `<h5>형식을 고르세요</h5><div class="cfgCards">${card(p.form === 'single', 'data-set="form=single"', ART.single(p.carriages), '단일축')}${card(p.form === 'gantry', 'data-set="form=gantry"', ART.gantry(), '갠트리 (2축 + 브리지)')}</div>
        <h5>가동자 개수</h5><div class="cfgCards four">${[1, 2, 3, 4].map(n => card(p.carriages === n, `data-set="carriages=${n}"`, ART.single(n), `가동자 ${n}개`)).join('')}</div>
        <p class="hint">가동자가 여러 개면 지금은 함께 움직입니다(같은 위치 명령).</p>`;
    } else if (step === 1) {
      body = `<h5>설치 방식</h5><div class="cfgCards">${card(p.mount === 'floor', 'data-set="mount=floor"', ART.floor(), '수평 설치 (바닥 · 가대 위)')}${card(p.mount === 'wall', 'data-set="mount=wall"', ART.wall(), '벽면 장착')}</div>
        <div class="cfgGrid">${num('elev', p.mount === 'wall' ? '축 중심 높이' : '설치 높이 (가대)', p.elev, 0.05, 0, 3, 'm')}${p.form === 'gantry' ? num('span', '축 간격', p.span, 10, 200, 3000, 'mm') : ''}
        ${num('offX', '편심 X (진행 방향)', p.offX, 1, 0, 600, 'mm')}${num('offY', '편심 Y (옆)', p.offY, 1, 0, 600, 'mm')}${num('offZ', '편심 Z (위)', p.offZ, 1, 0, 600, 'mm', '하중 중심까지 · 3D 주황 점')}</div>`;
    } else if (step === 2) {
      body = `<h5>이동 조건</h5><div class="cfgGrid">${num('load', '하중', p.load, 0.5, 0, 500, 'kg')}${num('dist', '이동 거리', p.dist, 1, 1, 3000, 'mm')}
        ${num('dwell', '정지 시간', p.dwell, 0.1, 0, 600, 's')}${num('move', '이동 시간', p.move, 0.05, 0.05, 60, 's')}</div>
        ${profileSVG(p, sz)}
        <div class="cfgKV"><span>편도 사이클 (정지 + 이동)</span><b>${fmt(sz.cycleOne, 2)} s</b><span>왕복 사이클</span><b>${fmt(sz.cycleRound, 2)} s</b>
        <span>가속도</span><b>${fmt(sz.m.a, 2)} m/s²</b><span>필요 추력</span><b>${fmt(p.load * (sz.m.a + MU * G), 0)} N</b></div>
        <p class="hint">3D의 가동자가 이 조건 그대로 왕복합니다(재생 중일 때).</p>`;
    } else if (step === 3) {
      const rec = recStroke(p.dist);
      body = `<h5>스트로크</h5><div class="cfgStroke"><div class="bar"><i style="left:${Math.min(80, (p.dist / Math.max(1, p.stroke)) * 80)}%"></i><span>가동자</span></div><p>이동 거리 ${p.dist} mm · 추천 ${rec} mm 이상</p></div>
        <label class="cfgNum"><span>스트로크</span><select data-cfg="stroke">${STROKES.map(s => `<option value="${s}" ${s === p.stroke ? 'selected' : ''}>${s}</option>`).join('')}</select><em>mm</em></label>
        <div class="acts"><button type="button" data-set="stroke=${rec}">추천값 ${rec} mm로</button></div>
        <p class="hint">본체 길이 ${fmt(dims(p).total * 1000, 0)} mm (모터 포함) · ${S.label} 최대 ${S.strokeMax} mm</p>`;
    } else if (step === 4) {
      body = `<h5>제어 사양</h5><label class="cfgNum"><span>드라이버</span><select data-cfg="driver">${DRIVERS.map(([v, l]) => `<option value="${v}" ${v === p.driver ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="cfgNum"><span>시리즈</span><select data-cfg="series"><option value="auto" ${p.series === 'auto' ? 'selected' : ''}>자동 (통과하는 가장 작은 형식)</option>${Object.entries(SERIES).map(([k, s]) => `<option value="${k}" ${p.series === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
        <label class="cfgNum"><span>신호 이름 앞부분</span><input type="text" data-cfg="prefix" value="${esc(p.prefix)}" placeholder="${esc(signals(p, o.name)[0].tag.split('_')[0])}" maxlength="14"></label>
        <h5>로직에 등록될 신호</h5><table class="cfgTbl">${signals(p, o.name).map(s => `<tr><td>${s.dir === 'out' ? 'PLC → 축' : '축 → PLC'}</td><td><code>${s.tag}</code></td><td>${s.label}</td></tr>`).join('')}</table>`;
    } else {
      const pn = partNo(p, sz), rows = sz.pick.rows;
      body = `<div class="cfgVerdict ${sz.pick.ok ? 'ok' : 'ng'}"><b>${sz.pick.ok ? '선정 가능' : '조건을 다시 보세요'}</b><span>${S.label} 시리즈${p.series === 'auto' ? ' (자동)' : ''}</span></div>
        <div class="cfgKV"><span>품번 (ONE 코드)</span><b><code>${pn}</code></b><span>편도 사이클</span><b>${fmt(sz.cycleOne, 2)} s</b><span>가격 · 납기</span><b class="mute">카탈로그 표 연결 전</b></div>
        <h5>판정 근거</h5><table class="cfgTbl chk">${rows.map(r => `<tr class="${r.ratio > 1 ? 'bad' : ''}"><td>${r.label}</td><td>${fmt(r.need, r.dp)} / ${fmt(r.cap, r.dp)} ${r.unit}</td><td><i style="width:${Math.min(100, r.ratio * 100)}%"></i>${fmt(r.ratio * 100, 0)}%</td></tr>`).join('')}</table>
        ${sz.advice.length ? `<ul class="cfgAdvice">${sz.advice.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
        <h5>자재 목록</h5><table class="cfgTbl">${bom(p, sz).map(([c, l, n]) => `<tr><td><code>${c}</code></td><td>${esc(l)}</td><td>${n}</td></tr>`).join('')}</table>
        <h5>신호 ${signals(p, o.name).length}개</h5><p class="hint">${signals(p, o.name).map(s => s.tag).join(' · ')}</p>
        <div class="acts"><button type="button" data-cfgact="csv">자재 목록 CSV</button><button type="button" data-step="0">처음부터 다시 구성</button></div>
        <p class="hint">시리즈 표는 일반 예시값입니다. 실제 구매처 카탈로그(품번 규칙 · 가격 · 납기 · CAD) 표로 바꿀 수 있게 됩니다.</p>`;
    }
    const nav = `<div class="cfgNav">${step > 0 ? '<button type="button" data-step="' + (step - 1) + '">이전 단계</button>' : '<span></span>'}${step < 5 ? `<button type="button" class="primary" data-step="${step + 1}">${step === 4 ? '선택 완료' : '다음 단계'}</button>` : ''}</div>`;
    const live = step < 5 ? `<p class="cfgLive ${sz.pick.ok ? 'ok' : 'ng'}">${sz.pick.ok ? '현재 조건 통과' : '현재 조건 초과: ' + esc(sz.pick.worst.label)} · ${S.label}</p>` : '';
    return `<div class="cfgWiz"><h4>설비 구성 마법사</h4>${head}${live}<div class="cfgBody">${body}</div>${nav}</div>`;
  }

  // mount(host, obj, { step, onStep(i), onChange(patch) })
  function mount(host, o, api) {
    const p = Object.assign(defaults(), o.params || {}), step = Math.max(0, Math.min(5, api.step | 0));
    host.innerHTML = html(o, p, step);
    host.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => api.onStep(+b.dataset.step)));
    host.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
      const [k, v] = b.dataset.set.split('='), val = /^-?\d+(\.\d+)?$/.test(v) ? +v : v, patch = { [k]: val };
      if (k === 'form' && val === 'gantry' && p.carriages > 2) patch.carriages = 1;
      api.onChange(patch);
    }));
    host.querySelectorAll('[data-cfg]').forEach(i => i.addEventListener('change', () => {
      const k = i.dataset.cfg;
      if (i.type === 'number') {
        const v = parseFloat(i.value); if (Number.isNaN(v)) return api.onStep(step);
        const patch = { [k]: Math.min(+i.max, Math.max(+i.min, v)) };
        if (k === 'dist' && p.stroke < patch.dist) patch.stroke = recStroke(patch.dist);   // keep the travel inside the stroke
        return api.onChange(patch);
      }
      api.onChange({ [k]: k === 'stroke' ? +i.value : k === 'prefix' ? i.value.trim().slice(0, 14) : i.value });
    }));
    const csv = host.querySelector('[data-cfgact="csv"]');
    if (csv) csv.addEventListener('click', () => {
      const sz = sizing(p), lines = [['품번', '품명', '수량']].concat(bom(p, sz)).map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
      a.download = `${(o.name || 'linear-axis').replace(/[\\/:*?"<>|]/g, '_')}-bom.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  // styles (BUILDER colours from its CSS variables)
  const css = document.createElement('style');
  css.textContent = `
  .cfgWiz{margin:6px 0 8px;border:1px solid var(--line);background:var(--panel2);padding:10px}
  .cfgWiz h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;color:var(--fg)}
  .cfgWiz h5{margin:10px 0 6px;font-size:12px;font-weight:600;color:var(--fg)}
  .cfgSteps{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;margin-bottom:6px}
  .cfgSteps button{font:500 10.5px var(--sans);color:var(--mute);background:var(--panel);border:1px solid var(--line);padding:5px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;white-space:nowrap}
  .cfgSteps button b{font:600 10px var(--mono);width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1px solid currentColor}
  .cfgSteps button.done{color:var(--fg)}
  .cfgSteps button.now{color:var(--accent-ink,#000);background:var(--accent);border-color:var(--accent)}
  .cfgLive{margin:0 0 6px;font-size:11px;color:var(--ok)}.cfgLive.ng{color:var(--ng)}
  .cfgCards{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.cfgCards.four{grid-template-columns:repeat(4,1fr)}
  .cfgCard{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:6px 4px 5px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font:500 11px var(--sans)}
  .cfgCard svg{width:100%;height:auto;max-height:64px}
  .cfgCard.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
  .cfgCard svg .b{fill:#9aa3ad;stroke:#3a4048;stroke-width:1.2}.cfgCard svg .c{fill:var(--accent);stroke:#3a4048;stroke-width:1.2}
  .cfgCard svg .w{fill:none;stroke:#5d6064;stroke-dasharray:3 3}.cfgCard svg .ax{stroke:var(--ng);fill:none;stroke-width:1.4}.cfgCard svg text{fill:var(--ng);font:10px var(--mono)}
  .cfgGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .cfgNum{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 6px;font-size:11px;color:var(--mute);margin:4px 0}
  .cfgNum span{grid-column:1/-1}.cfgNum input,.cfgNum select{width:100%;min-width:0}.cfgNum em{font-style:normal;font-family:var(--mono);font-size:10.5px}
  .cfgNum small{grid-column:1/-1;font-size:10px;color:var(--dim)}
  .cfgProf{width:100%;height:auto;margin:8px 0 2px}.cfgProf .v{fill:none;stroke:var(--accent);stroke-width:1.8}.cfgProf .ax{fill:none;stroke:var(--mute)}
  .cfgProf .dash{stroke:var(--dim);stroke-dasharray:3 3}.cfgProf text{fill:var(--mute);font:9.5px var(--sans)}.cfgProf .lab{writing-mode:vertical-rl}
  .cfgKV{display:grid;grid-template-columns:1fr auto;gap:3px 10px;font-size:11.5px;margin:6px 0;color:var(--mute)}.cfgKV b{color:var(--fg);font-family:var(--mono);font-weight:500;text-align:right}.cfgKV b.mute{color:var(--dim);font-family:var(--sans)}
  .cfgStroke .bar{position:relative;height:26px;background:var(--panel);border:1px solid var(--line);margin:4px 0}
  .cfgStroke .bar i{position:absolute;top:-3px;bottom:-3px;width:20%;background:var(--accent);opacity:.85;transition:left .3s}
  .cfgStroke .bar span{position:absolute;left:6px;top:4px;font-size:10.5px;color:var(--fg)}.cfgStroke p{margin:2px 0 4px;font-size:11px;color:var(--mute)}
  .cfgTbl{width:100%;border-collapse:collapse;font-size:10.5px}.cfgTbl td{border-bottom:1px solid var(--line);padding:3px 4px;color:var(--fg);vertical-align:top}
  .cfgTbl td:first-child{color:var(--mute)}.cfgTbl code{font:10.5px var(--mono);color:var(--fg)}
  .cfgTbl.chk td:last-child{width:34%;position:relative;font-family:var(--mono);text-align:right}
  .cfgTbl.chk td:last-child i{position:absolute;left:4px;top:50%;height:4px;margin-top:-2px;background:var(--ok);opacity:.7;max-width:calc(100% - 44px)}
  .cfgTbl.chk tr.bad td{color:var(--ng)}.cfgTbl.chk tr.bad i{background:var(--ng)}
  .cfgVerdict{display:flex;justify-content:space-between;align-items:center;padding:7px 9px;border:1px solid var(--ok);color:var(--ok);font-size:12px}
  .cfgVerdict.ng{border-color:var(--ng);color:var(--ng)}.cfgVerdict span{color:var(--fg);font-size:11px}
  .cfgAdvice{margin:6px 0;padding-left:16px;font-size:11px;color:var(--warn)}
  .cfgNav{display:flex;justify-content:space-between;gap:6px;margin-top:10px}.cfgNav button{flex:1}
  `;
  document.head.appendChild(css);

  window.FactoryConfig = { SERIES, STEPS, defaults, sizing, partNo, signals, bom, mount, travel };
})();
