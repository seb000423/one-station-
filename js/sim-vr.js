// ONE SIMULATION VR view (Meta Quest 3, WebXR): stand in the line at 1:1.
// Left stick walks (1.4 m/s, relative to where you look, on the floor). Right stick left / right turns the view
// smoothly (45°/s, around the head; no up / down tilt of the world, that makes people sick); right stick up / down
// raises / lowers the eye height (0.5 m/s, 0.6–3.0 m). On entering, the eye height is set for a 175 cm person (1.63 m)
// whatever the wearer's real height or posture. The head looks as usual. No teleport, no menu in VR. Machines, walls and columns (real surfaces, by short rays)
// stop you (you slide along them); nothing to walk through. You start at the line's infeed end looking down the line.
// Plus the desktop pairing chip ("VR 연결", js/sim-link.js) and the "VR 보기" chip on a headset.
(() => {
  'use strict';
  const $ = id => document.getElementById(id), T = window.THREE, S = window.ONE_SIMB;
  if (!S) return;
  const { stage, SC, objs, rect: r } = S, rig = stage.xrRig, renderer = stage.renderer;
  const WALK = 1.4, TURN = Math.PI / 4, DEAD = 0.2, BODY = 0.25, EYE0 = 1.63, LIFT = 0.5, UP = new T.Vector3(0, 1, 0);

  /* ---------------------------------------------------------------- chips */
  const views = $('views');
  const chip = (txt, fn) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = txt; b.onclick = () => fn(b); views.appendChild(b); return b; };
  const note = document.createElement('div'); note.className = 'chip'; note.style.cursor = 'default'; note.hidden = true; views.appendChild(note);
  const say = (t, on) => { note.hidden = !t; note.textContent = t || ''; note.classList.toggle('on', !!on); };
  if (window.ONE_VR_STATUS) say(window.ONE_VR_STATUS.text, window.ONE_VR_STATUS.state === 'open');
  window.ONE_VR_SAY = say;

  const isHeadset = /OculusBrowser|Quest/i.test(navigator.userAgent);
  const following = new URLSearchParams(location.search).has('vr') || location.pathname.replace(/\/$/, '') === '/vr';
  if (!isHeadset && window.OneLink && !following) {
    let link = null;
    chip('VR 연결', b => {
      if (link) { link.close(); link = null; b.classList.remove('on'); say(''); return; }
      b.classList.add('on'); link = window.OneLink.host((state, text) => { say(text, state === 'open'); if (state === 'error' || state === 'closed') { b.classList.remove('on'); link = null; } });
    }).title = 'Quest 3에서 이 화면을 VR로 봅니다 (같은 Wi-Fi)';
  }

  if (isHeadset && !following) chip('PC 연결', () => { location.href = '/vr'; });

  let session = null;
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (!ok) return;
    let starting = false;
    chip('VR 보기', async b => {
      if (starting) return;                       // a second tap while the headset is still opening the session
      if (session) { session.end(); return; }
      starting = true; say('VR 여는 중…');
      try { session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
        session.addEventListener('end', () => { session = null; b.classList.remove('on'); say(''); });
        try { await renderer.xr.setSession(session); }
        catch (e) { const s = session; session = null; try { await s.end(); } catch (x) {} throw e; }   // never leave a half-open session behind
        b.classList.add('on'); say(''); start(); }
      catch (e) { say(/already an active/i.test(e.message) ? 'VR이 이미 다른 탭에서 열려 있습니다. 다른 탭을 닫고 이 페이지를 새로 고친 뒤 다시 누르세요' : `VR 시작 실패: ${e.message}`); }
      finally { starting = false; }
    }).title = '1:1 현장 보기 · 왼 스틱 걷기 · 오른 스틱 시점';
  }).catch(() => {});

  /* ---------------------------------------------------------------- obstacles (floor plan boxes) */
  // every placed object that stands on the floor at body height (machines, conveyors, walls, columns, pallets…),
  // not the slab, not roofs or anything overhead. Re-measured every 4 s while in VR (models load late).
  let boxes = [], measured = -1e9;
  const measure = () => { boxes = []; const b = new T.Box3();
    for (const { o } of objs.values()) { b.setFromObject(o); if (b.isEmpty()) continue;
      if (b.max.y < 0.15 || b.min.y > 1.9) continue;
      boxes.push({ o, x0: b.min.x - BODY, x1: b.max.x + BODY, z0: b.min.z - BODY, z1: b.max.z + BODY }); } };
  const blocked = (x, z) => boxes.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);

  /* ---------------------------------------------------------------- walking into things */
  // A step is free unless a real surface of a placed object (machine, guard, wall, column…) lies within the step plus
  // 25 cm of body, at knee (0.35 m) or chest (1.1 m) height. Rays, not bounding boxes: a cell's open aisle or a big
  // group's empty middle is walkable, a guard panel is not. Back faces do not count, so someone who stepped into a
  // machine in the room can walk out.
  const ray = new T.Raycaster(), rayO = new T.Vector3(), rayD = new T.Vector3();
  ray.params.Line = { threshold: 0 }; ray.params.Points = { threshold: 0 };
  // only objects whose footprint (re-measured every 4 s) is within reach of this step are tested
  const targets = (h, reach) => boxes.filter(q => h.x > q.x0 - reach && h.x < q.x1 + reach && h.z > q.z0 - reach && h.z < q.z1 + reach).map(q => q.o);
  function free(h, dx, dz) { const len = Math.hypot(dx, dz); if (len < 1e-6) return true;
    rayD.set(dx / len, 0, dz / len); ray.far = len + BODY; const list = targets(h, len + BODY); if (!list.length) return true;
    for (const y of [0.35, 1.1]) { rayO.set(h.x, y, h.z); ray.set(rayO, rayD);
      if (ray.intersectObjects(list, true).some(i => i.object.isMesh && i.object.visible && !((m => m && m.opacity < 0.2)(Array.isArray(i.object.material) ? i.object.material[0] : i.object.material)))) return false; }
    return true; }

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
    eye = EYE0; head0 = null;   // the wearer's own head height is read on the first tracked frame
  }
  // eye height: rig.y = eye − head0, head0 = the wearer's head height above their real floor when entering
  let eye = EYE0, head0 = null;

  /* ---------------------------------------------------------------- sticks */
  stage.onFrame.push(dt => {
    if (!renderer.xr.isPresenting) return;
    const now = performance.now(); if (now - measured > 4000) { measure(); measured = now; }
    const ses = renderer.xr.getSession(); if (!ses) return;
    // thumbstick = axes 2/3 on Quest Touch (xr-standard), 0/1 on some pads
    if (head0 == null && stage.xrCam.position.y > 0.3) head0 = stage.xrCam.position.y;
    let mx = 0, my = 0, tx = 0, ty = 0;
    for (const src of ses.inputSources) { const g = src.gamepad; if (!g) continue;
      const ax = g.axes.length >= 4 ? g.axes[2] : g.axes[0] || 0, ay = g.axes.length >= 4 ? g.axes[3] : g.axes[1] || 0;
      // only the stick pushed furthest on each side counts: Quest can list more input sources (hands, a second pad)
      // with idle sticks, and those must not reset the left stick to zero
      if (src.handedness === 'right') { if (Math.abs(ax) > Math.abs(tx)) tx = ax; if (Math.abs(ay) > Math.abs(ty)) ty = ay; }
      else if (Math.hypot(ax, ay) > Math.hypot(mx, my)) { mx = ax; my = ay; } }
    // view: right stick left / right turns smoothly around the head
    if (Math.abs(tx) > DEAD) { const a = -Math.sign(tx) * Math.min(1, (Math.abs(tx) - DEAD) / (1 - DEAD)) * TURN * dt; headPos(head);
      rig.position.sub(head).applyAxisAngle(UP, a).add(head); rig.rotation.y += a; }
    // eye height: right stick up = higher
    if (Math.abs(ty) > DEAD) eye = Math.max(0.6, Math.min(3.0, eye - Math.sign(ty) * Math.min(1, (Math.abs(ty) - DEAD) / (1 - DEAD)) * LIFT * dt));
    if (head0 != null) rig.position.y = eye - head0;
    // walk: along where the head looks, flattened to the floor
    const m = Math.hypot(mx, my);
    if (m > DEAD) { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
      renderer.xr.getCamera().getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) return; fwd.normalize();
      const rx = -fwd.z, rz = fwd.x;   // right of the view
      const step = WALK * dt * k, dx = (fwd.x * -my + rx * mx) * step, dz = (fwd.z * -my + rz * mx) * step;
      headPos(head);
      if (free(head, dx, dz)) { rig.position.x += dx; rig.position.z += dz; }
      else if (free(head, dx, 0)) rig.position.x += dx;     // slide along the obstacle
      else if (free(head, 0, dz)) rig.position.z += dz; }
  });

  window.ONE_VR = { get eye() { return eye; }, start, measure, blocked, free, get boxes() { return boxes; } };
})();
