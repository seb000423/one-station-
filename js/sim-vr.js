// ONE SIMULATION VR view (Meta Quest 3, WebXR): stand in the line at 1:1.
// The head only looks. Walking and turning are on the sticks only: left stick walks (1.4 m/s, along where you look,
// on the floor), right stick left / right turns in 30° snaps. No teleport, no menu in VR. Machines, walls and columns
// stop you (you slide along them); nothing to walk through. You start at the line's infeed end looking down the line.
// Plus the desktop pairing chip ("VR 연결", js/sim-link.js) and the "VR 보기" chip on a headset.
(() => {
  'use strict';
  const $ = id => document.getElementById(id), T = window.THREE, S = window.ONE_SIMB;
  if (!S) return;
  const { stage, SC, objs, rect: r } = S, rig = stage.xrRig, renderer = stage.renderer;
  const WALK = 1.4, TURN = Math.PI / 6, DEAD = 0.2, BODY = 0.25;

  /* ---------------------------------------------------------------- chips */
  const views = $('views');
  const chip = (txt, fn) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = txt; b.onclick = () => fn(b); views.appendChild(b); return b; };
  const note = document.createElement('div'); note.className = 'chip'; note.style.cursor = 'default'; note.hidden = true; views.appendChild(note);
  const say = (t, on) => { note.hidden = !t; note.textContent = t || ''; note.classList.toggle('on', !!on); };
  if (window.ONE_VR_STATUS) say(window.ONE_VR_STATUS.text, window.ONE_VR_STATUS.state === 'open');
  window.ONE_VR_SAY = say;

  const isHeadset = /OculusBrowser|Quest/i.test(navigator.userAgent);
  if (!isHeadset && window.OneLink && !new URLSearchParams(location.search).has('vr')) {
    let link = null;
    chip('VR 연결', b => {
      if (link) { link.close(); link = null; b.classList.remove('on'); say(''); return; }
      b.classList.add('on'); link = window.OneLink.host((state, text) => { say(text, state === 'open'); if (state === 'error' || state === 'closed') { b.classList.remove('on'); link = null; } });
    }).title = 'Quest 3에서 이 화면을 VR로 봅니다 (같은 Wi-Fi)';
  }

  if (isHeadset && !new URLSearchParams(location.search).has('vr'))
    chip('연결 코드', () => { const c = (prompt('데스크톱 화면의 6자리 코드') || '').trim(); if (/^\d{6}$/.test(c)) location.search = `?vr=${c}`; });

  let session = null;
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (!ok) return;
    chip('VR 보기', async b => {
      if (session) { session.end(); return; }
      try { session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
        session.addEventListener('end', () => { session = null; b.classList.remove('on'); });
        await renderer.xr.setSession(session); b.classList.add('on'); start(); }
      catch (e) { say(`VR 시작 실패: ${e.message}`); }
    }).title = '1:1 현장 보기 · 왼 스틱 걷기 · 오른 스틱 회전';
  }).catch(() => {});

  /* ---------------------------------------------------------------- obstacles (floor plan boxes) */
  // every placed object that stands on the floor at body height (machines, conveyors, walls, columns, pallets…),
  // not the slab, not roofs or anything overhead. Re-measured every 4 s while in VR (models load late).
  let boxes = [], measured = -1e9;
  const measure = () => { boxes = []; const b = new T.Box3();
    for (const { o } of objs.values()) { b.setFromObject(o); if (b.isEmpty()) continue;
      if (b.max.y < 0.15 || b.min.y > 1.9) continue;
      boxes.push({ x0: b.min.x - BODY, x1: b.max.x + BODY, z0: b.min.z - BODY, z1: b.max.z + BODY }); } };
  const blocked = (x, z) => boxes.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);

  /* ---------------------------------------------------------------- start pose */
  const head = new T.Vector3(), fwd = new T.Vector3();
  const headPos = v => renderer.xr.getCamera().getWorldPosition(v);
  // Quest frame budget: small parts (bolts, sensors, cables, < 25 cm across) stop casting shadows during the session
  let quiet = [];
  const sv = new T.Vector3();
  const lightenShadows = () => { quiet = []; stage.world.traverse(o => { if (!o.isMesh || !o.castShadow) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    o.getWorldScale(sv); if (g.boundingSphere.radius * Math.max(sv.x, sv.y, sv.z) < 0.125) { o.castShadow = false; quiet.push(o); } }); };
  renderer.xr.addEventListener('sessionend', () => { for (const o of quiet) o.castShadow = true; quiet = []; });
  function start() {
    measure(); measured = performance.now(); lightenShadows();
    // 1.5 m before the infeed edge of the floor, halfway across, facing the flow direction (stored +X)
    const p = SC.toS([r.x0 - 1500, (r.y0 + r.y1) / 2, 0]);
    let x = p.x; while (blocked(x, p.z) && x > p.x - 20) x -= 0.5;
    rig.position.set(x, 0, p.z); rig.rotation.set(0, -Math.PI / 2, 0);
  }

  /* ---------------------------------------------------------------- sticks */
  let turnHeld = false;
  stage.onFrame.push(dt => {
    if (!renderer.xr.isPresenting) return;
    const now = performance.now(); if (now - measured > 4000) { measure(); measured = now; }
    const ses = renderer.xr.getSession(); if (!ses) return;
    let mx = 0, my = 0, tx = 0;
    for (const src of ses.inputSources) { const g = src.gamepad; if (!g || g.axes.length < 4) continue;
      const ax = g.axes[2], ay = g.axes[3];
      if (src.handedness === 'left') { mx = ax; my = ay; } else if (src.handedness === 'right') tx = ax; }
    // walk: along where the head looks, flattened to the floor
    const m = Math.hypot(mx, my);
    if (m > DEAD) { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
      renderer.xr.getCamera().getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) return; fwd.normalize();
      const rx = -fwd.z, rz = fwd.x;   // right of the view
      const step = WALK * dt * k, dx = (fwd.x * -my + rx * mx) * step, dz = (fwd.z * -my + rz * mx) * step;
      headPos(head);
      if (blocked(head.x, head.z)) { rig.position.x += dx; rig.position.z += dz; }   // stepped into something in the room: let them walk out
      else if (!blocked(head.x + dx, head.z + dz)) { rig.position.x += dx; rig.position.z += dz; }
      else if (!blocked(head.x + dx, head.z)) rig.position.x += dx;     // slide along the obstacle
      else if (!blocked(head.x, head.z + dz)) rig.position.z += dz; }
    // turn: 30° per push, around the head (the view does not swing sideways)
    if (Math.abs(tx) > 0.7 && !turnHeld) { turnHeld = true; const a = tx > 0 ? -TURN : TURN; headPos(head);
      rig.position.sub(head).applyAxisAngle(new T.Vector3(0, 1, 0), a).add(head); rig.rotation.y += a; }
    else if (Math.abs(tx) < 0.3) turnHeld = false;
  });

  window.ONE_VR = { start, measure, blocked, get boxes() { return boxes; } };
})();
