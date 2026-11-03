// ONE stage (three r147 globals): the look shared by SIMULATION and BUILDER.
// Orthographic isometric camera from (1,1,1), one ivory key light with shadows + a weak rim light, Neutral tone mapping,
// a floor whose edge melts radially into the background, a shader grid (0.5 m and 2 m, no depth write), a faint floor
// mirror and a very light bloom that only the glowing rings / status lamps pass. No outlines.
// Also: a "studio" colour mode (charcoal · grey · ivory + one amber accent) and an X-ray mode (crease-edge lines of every
// mesh, see-through, moving parts in amber).
//
// Needs: three.min.js, OrbitControls, postprocessing Pass / EffectComposer / ShaderPass, CopyShader,
// LuminosityHighPassShader, UnrealBloomPass (all three@0.147.0 examples/js).
(() => {
  'use strict';
  const T = window.THREE;
  const DIR = new T.Vector3(1, 1, 1).normalize();
  const PAL = { bg: '#0f1012', floor: '#1b1c1f', line: '#e9e3d5', charcoal: '#2a2b2f', grey: '#8d8b86', ivory: '#e9e3d5', amber: '#ffae42' };
  const GHOST_LAYER = 1;

  // final pass: Khronos PBR Neutral tone mapping + exposure + sRGB (rendering into targets stays linear / HDR for the bloom)
  const OutputShader = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure; varying vec2 vUv;
      vec3 neutral(vec3 c){
        const float S = 0.76; const float D = 0.15;
        float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
        float peak = max(c.r, max(c.g, c.b)); if (peak < S) return c;
        float d = 1.0 - S; float np = 1.0 - d * d / (peak + d - S); c *= np / peak;
        float g = 1.0 - 1.0 / (D * (peak - np) + 1.0); return mix(c, vec3(np), g);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main(){ vec4 t = texture2D(tDiffuse, vUv); gl_FragColor = vec4(toSRGB(clamp(neutral(max(t.rgb, 0.0) * exposure), 0.0, 1.0)), 1.0); }`,
  };

  function create(canvas, opt = {}) {
    const BG = new T.Color(opt.bg || PAL.bg);
    const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.NoToneMapping;          // done in the output pass
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(BG, 1);

    const scene = new T.Scene(); scene.background = BG;
    const world = new T.Group(); scene.add(world);      // everything under here is mirrored in the floor
    const overlay = new T.Group(); scene.add(overlay);  // helpers that are not mirrored

    const hemi = new T.HemisphereLight(0xfff4e2, 0x0b0b0c, 0.3);
    const key = new T.DirectionalLight(0xfff5e8, 1.2);  // ivory key, the only shadow caster
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    const rim = new T.DirectionalLight(0xc9d3e0, 0.5);
    scene.add(hemi, key, key.target, rim, rim.target);
    for (const l of [hemi, key, rim]) l.layers.enableAll();

    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    camera.layers.enable(0);
    const controls = new T.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;
    controls.minZoom = 1 / 60; controls.maxZoom = 1 / 0.4;
    controls.screenSpacePanning = true;

    /* ---- floor: radial fade into the background, shadow catcher, shader grid */
    const floor = new T.Group(); scene.add(floor);
    const fu = { uCenter: { value: new T.Vector2() }, uR0: { value: 8 }, uR1: { value: 18 }, uBg: { value: BG.clone() } };
    const fade = 'uniform vec2 uCenter; uniform float uR0; uniform float uR1; float edgeFade(vec2 p){ return smoothstep(uR0, uR1, length(p - uCenter)); }';
    const vtx = 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }';
    const floorMat = new T.ShaderMaterial({
      uniforms: { ...fu, uFloor: { value: new T.Color(opt.floor || PAL.floor) }, uMirror: { value: 0.84 } }, transparent: true, depthWrite: true,
      vertexShader: vtx,
      fragmentShader: `${fade} uniform vec3 uFloor; uniform vec3 uBg; uniform float uMirror; varying vec2 vP;
        void main(){ float f = edgeFade(vP); gl_FragColor = vec4(mix(uFloor, uBg, f), mix(uMirror, 1.0, f)); }`,
    });
    const floorMesh = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), floorMat); floorMesh.renderOrder = -2;
    const shadowMesh = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.ShadowMaterial({ color: 0, opacity: 0.5, depthWrite: false }));
    shadowMesh.position.y = 0.001; shadowMesh.receiveShadow = true; shadowMesh.renderOrder = -1;
    const gridMat = new T.ShaderMaterial({
      uniforms: { ...fu, uLine: { value: new T.Color(PAL.line) }, uS1: { value: 0.5 }, uS2: { value: 2.0 } }, transparent: true, depthWrite: false,
      extensions: { derivatives: true },
      vertexShader: vtx,
      fragmentShader: `${fade} uniform vec3 uLine; uniform float uS1; uniform float uS2; varying vec2 vP;
        float grid(vec2 p, float s, float w){ vec2 g = abs(fract(p / s - 0.5) - 0.5) / (fwidth(p / s) * w); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){ float a = grid(vP, uS1, 1.0) * 0.024 + grid(vP, uS2, 1.2) * 0.055; a *= 1.0 - edgeFade(vP); if (a < 0.002) discard; gl_FragColor = vec4(uLine, a); }`,
    });
    const gridMesh = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), gridMat); gridMesh.position.y = 0.002;
    floor.add(floorMesh, shadowMesh, gridMesh);
    floor.traverse(o => o.layers.enableAll());

    /* ---- passes: mirror (world upside down under a semi-transparent floor) → bloom → output */
    const mirrorPass = new T.Pass(); mirrorPass.needsSwap = false; mirrorPass.mirror = opt.mirror !== false;
    mirrorPass.render = (r, writeBuffer, readBuffer) => {
      const auto = r.autoClear; r.autoClear = false;
      r.setRenderTarget(mirrorPass.renderToScreen ? null : readBuffer); r.clear();
      if (mirrorPass.mirror) {
        world.scale.y = -1; world.updateMatrixWorld(true); floor.visible = false; overlay.visible = false;
        const ky = key.position.y, ry = rim.position.y; key.position.y = -ky; rim.position.y = -ry;
        r.shadowMap.autoUpdate = false; r.render(scene, camera); r.shadowMap.autoUpdate = true;
        key.position.y = ky; rim.position.y = ry;
        world.scale.y = 1; world.updateMatrixWorld(true); floor.visible = true; overlay.visible = true;
        r.clearDepth();
      }
      r.render(scene, camera);
      r.autoClear = auto;
    };
    const rt = new T.WebGLRenderTarget(2, 2, { type: T.HalfFloatType, samples: 4 });
    const composer = new T.EffectComposer(renderer, rt);
    const bloom = new T.UnrealBloomPass(new T.Vector2(2, 2), 0.38, 0.45, 2.4);
    const output = new T.ShaderPass(OutputShader);
    composer.addPass(mirrorPass); composer.addPass(bloom); composer.addPass(output);

    /* ---- framing */
    let center = new T.Vector3(), radius = 10, dir = DIR.clone();
    const size = new T.Vector2();
    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
      renderer.setSize(w, h, false); composer.setSize(w, h); size.set(w, h);
      const a = w / h; Object.assign(camera, { left: -a, right: a, top: 1, bottom: -1 }); camera.updateProjectionMatrix();
    };
    // look at a point from the iso direction; halfH = half of the visible height in metres
    const look = (target, halfH) => {
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, 120); camera.up.set(0, 1, 0); camera.lookAt(target);
      camera.zoom = 1 / Math.max(0.3, halfH); camera.updateProjectionMatrix(); controls.update();
    };
    // fit a box (world metres) into the view
    const fit = (box, pad = 1.08) => {
      const c = box.getCenter(new T.Vector3());
      camera.position.copy(c).addScaledVector(dir, 120); camera.up.set(0, 1, 0); camera.lookAt(c); camera.updateMatrixWorld();
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let hx = 0, hy = 0; const p = new T.Vector3();
      for (let i = 0; i < 8; i++) { p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
        hx = Math.max(hx, Math.abs(p.dot(right))); hy = Math.max(hy, Math.abs(p.dot(up))); }
      const a = size.x / Math.max(1, size.y);
      look(c, Math.max(hy, hx / a) * pad);
    };
    // floor, fade and lights around the content
    const setBounds = box => {
      box.getCenter(center); const s = box.getSize(new T.Vector3());
      radius = Math.max(4, Math.hypot(s.x, s.z) / 2);
      fu.uCenter.value.set(center.x, center.z); fu.uR0.value = radius * 0.62; fu.uR1.value = radius * 1.12;
      const L = radius * 3; for (const m of [floorMesh, shadowMesh, gridMesh]) { m.scale.set(L, 1, L); m.position.x = center.x; m.position.z = center.z; }
      const sc = key.shadow.camera; Object.assign(sc, { left: -radius, right: radius, top: radius, bottom: -radius, near: 0.5, far: radius * 6 + 40 }); sc.updateProjectionMatrix();
      key.position.copy(center).add(new T.Vector3(-0.35, 1, 0.55).normalize().multiplyScalar(radius * 2 + 20)); key.target.position.copy(center);
      rim.position.copy(center).add(new T.Vector3(-0.6, 0.55, -1).normalize().multiplyScalar(radius * 2 + 20)); rim.target.position.copy(center);
    };

    /* ---- studio colours: charcoal · grey · ivory, one amber accent; emissive lamps keep their colour and glow */
    const C = { ch: new T.Color(PAL.charcoal), gr: new T.Color(PAL.grey), iv: new T.Color(PAL.ivory), am: new T.Color(PAL.amber) };
    const ACCENT = /yellow|amber|orange|hazard/i;
    const tint = c => { const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, t = Math.min(1, Math.max(0, (L - 0.01) / 0.85));
      return t < 0.5 ? C.ch.clone().lerp(C.gr, t * 2) : C.gr.clone().lerp(C.iv, (t - 0.5) * 2); };
    const studioMats = new Map();
    const studio = (root, on) => {
      root.traverse(o => { if (!o.isMesh || o.isPoints) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m || !m.color) continue;
          if (!studioMats.has(m)) studioMats.set(m, { color: m.color.clone(), metalness: m.metalness, roughness: m.roughness, env: m.envMapIntensity, ei: m.emissiveIntensity });
          const s = studioMats.get(m), glowing = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.25;
          if (!on) { m.color.copy(s.color); m.metalness = s.metalness; m.roughness = s.roughness; m.envMapIntensity = s.env; if (glowing) m.emissiveIntensity = s.ei; continue; }
          if (glowing) { m.emissiveIntensity = Math.max(s.ei || 1, 3); continue; }
          if (m.map) { m.envMapIntensity = 0.4; continue; }
          m.color.copy(ACCENT.test(m.name) ? C.am.clone().multiplyScalar(0.8) : tint(s.color));
          m.metalness = Math.min(s.metalness ?? 0, 0.25); m.roughness = Math.max(s.roughness ?? 0.5, 0.5); m.envMapIntensity = 0.35;
        } });
    };

    /* ---- X-ray twin: crease edges of every mesh as lines on their own layer (children of the meshes, so they move with
       every animated node). X-ray on = the solid layer is hidden and only the lines are drawn: you see through the whole
       line. Objects the caller marks as accents (moving parts) are drawn in amber, bright enough to pass the bloom. */
    const xrMat = new T.LineBasicMaterial({ color: new T.Color(0.86, 0.83, 0.76), transparent: true, opacity: 0, depthWrite: false });
    const xrAccent = new T.LineBasicMaterial({ color: new T.Color(3.2, 1.75, 0.45), transparent: true, opacity: 0, depthWrite: false });
    const edgeCache = new Map();
    const edgesOf = g => { let e = edgeCache.get(g.uuid); if (!e) { e = new T.EdgesGeometry(g, 28); edgeCache.set(g.uuid, e); } return e; };
    // accent(obj) → true for objects to draw in amber (checked on the mesh and its ancestors)
    const addTwin = (root, accent) => {
      const meshes = []; root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !o.userData.twin && !o.userData.noTwin) meshes.push(o); });
      for (const m of meshes) {
        let hot = false; if (accent) for (let a = m; a && !hot; a = a.parent) hot = accent(a);
        const l = new T.LineSegments(edgesOf(m.geometry), hot ? xrAccent : xrMat); l.layers.set(GHOST_LAYER); l.userData.noTwin = true; l.raycast = () => {};
        m.add(l); m.userData.twin = true;
      }
    };
    let ghostT = 0, ghostTo = 0;
    const ghost = on => { ghostTo = on ? 1 : 0; };
    const stepGhost = dt => {
      if (ghostT === ghostTo) return;
      ghostT = ghostTo > ghostT ? Math.min(1, ghostT + dt / 0.35) : Math.max(0, ghostT - dt / 0.35);
      xrMat.opacity = ghostT * 0.42; xrAccent.opacity = ghostT;
      if (ghostT > 0.5) camera.layers.disable(0); else camera.layers.enable(0);
      if (ghostT > 0) camera.layers.enable(GHOST_LAYER); else camera.layers.disable(GHOST_LAYER);
    };

    /* ---- amber ring on the floor (blooms) */
    const ring = (r = 1) => {
      const m = new T.Mesh(new T.RingGeometry(r - 0.04, r, 96).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial({ color: 0, emissive: C.am, emissiveIntensity: 3, roughness: 1, metalness: 0, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.y = 0.012; m.renderOrder = 1; m.layers.enableAll(); world.add(m); return m;
    };

    let last = performance.now();
    const render = () => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; stepGhost(dt); controls.update(); composer.render(); };
    const setDir = v => { dir.copy(v).normalize(); };
    const setGrid = (minor, major) => { gridMat.uniforms.uS1.value = minor; gridMat.uniforms.uS2.value = major; };

    window.addEventListener('resize', resize); resize();
    return { renderer, scene, world, overlay, camera, controls, key, rim, hemi, bloom, output, mirrorPass, PAL, render, resize, look, fit, setBounds, setDir, setGrid, floor, studio, addTwin, ghost, ring,
      get ghosting() { return ghostT > 0.5; } };
  }

  window.OneStage = { create, DIR, PAL };
})();
