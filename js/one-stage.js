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
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.0 }, aces: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure; uniform float aces; varying vec2 vUv;
      vec3 neutral(vec3 c){
        const float S = 0.76; const float D = 0.15;
        float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
        float peak = max(c.r, max(c.g, c.b)); if (peak < S) return c;
        float d = 1.0 - S; float np = 1.0 - d * d / (peak + d - S); c *= np / peak;
        float g = 1.0 - 1.0 / (D * (peak - np) + 1.0); return mix(c, vec3(np), g);
      }
      // ACES filmic (Narkowicz fit): film-like contrast and highlight roll-off, used by the realistic look
      vec3 filmic(vec3 c){ c *= 0.6; return (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main(){ vec4 t = texture2D(tDiffuse, vUv); vec3 c = max(t.rgb, 0.0) * exposure; gl_FragColor = vec4(toSRGB(clamp(aces > 0.5 ? filmic(c) : neutral(c), 0.0, 1.0)), 1.0); }`,
  };

  function create(canvas, opt = {}) {
    const BG = new T.Color(opt.bg || PAL.bg);
    const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.NoToneMapping;          // done in the output pass
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(BG, 1);
    // WebXR (ONE SIMULATION VR view, js/sim-vr.js): the headset pose drives xrCam inside xrRig; the rig is moved by the sticks
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');

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
      uniforms: { ...fu, uLine: { value: new T.Color(PAL.line) }, uS1: { value: 0.5 }, uS2: { value: 2.0 }, uFaint: { value: 1 } }, transparent: true, depthWrite: false,
      extensions: { derivatives: true },
      vertexShader: vtx,
      fragmentShader: `${fade} uniform vec3 uLine; uniform float uS1; uniform float uS2; uniform float uFaint; varying vec2 vP;
        float grid(vec2 p, float s, float w){ vec2 g = abs(fract(p / s - 0.5) - 0.5) / (fwidth(p / s) * w); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){ float a = grid(vP, uS1, 1.0) * 0.024 + grid(vP, uS2, 1.2) * 0.055; a *= (1.0 - edgeFade(vP)) * uFaint; if (a < 0.002) discard; gl_FragColor = vec4(uLine, a); }`,
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

    /* ---- ambient occlusion (realistic look, desktop): one cheap depth-only render at half size, occlusion estimated from
       depth alone (normals from screen derivatives, 12 samples over a 0.45 m world radius), then a depth-aware blur that
       darkens the HDR image before bloom and tone mapping: corners, gaps between rollers and feet on the floor go dark. */
    const aoDepth = new T.MeshBasicMaterial({ colorWrite: false });
    const aoRT = { depth: null, ao: null };
    const aoMat = new T.ShaderMaterial({
      uniforms: { tDepth: { value: null }, uProjInv: { value: new T.Matrix4() }, uProj: { value: new T.Matrix4() }, uRes: { value: new T.Vector2(2, 2) },
        uRadius: { value: 0.5 }, uIntensity: { value: 1.6 }, uOrtho: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      extensions: { derivatives: true },
      fragmentShader: `
        uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uProj; uniform vec2 uRes; uniform float uRadius; uniform float uIntensity; uniform float uOrtho; varying vec2 vUv;
        vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uProjInv * c; return v.xyz / v.w; }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          float d0 = texture2D(tDepth, vUv).x; if (d0 >= 0.9999) { gl_FragColor = vec4(1.0); return; }
          vec3 P = viewPos(vUv); vec3 N = normalize(cross(dFdx(P), dFdy(P)));
          // radius in pixels: world radius through the projection (orthographic: constant; perspective: over distance)
          float rPx = uRadius * uProj[1][1] * 0.5 * uRes.y / (uOrtho > 0.5 ? 1.0 : max(0.1, -P.z));
          if (rPx < 1.5) { gl_FragColor = vec4(1.0); return; }
          float a0 = hash(gl_FragCoord.xy) * 6.2831853, sum = 0.0;
          const int S = 12;
          for (int i = 0; i < S; i++) {
            float t = (float(i) + 0.5) / float(S), ang = a0 + float(i) * 2.3999632;   // golden-angle spiral
            vec2 off = vec2(cos(ang), sin(ang)) * rPx * t / uRes;
            vec3 v = viewPos(vUv + off) - P; float vv = dot(v, v), vn = dot(v, N);
            float fall = max(0.0, 1.0 - vv / (uRadius * uRadius));
            sum += max(0.0, vn - 0.06 * uRadius) / (vv + 0.002) * fall;
          }
          float ao = max(0.0, 1.0 - 2.0 * uIntensity * uRadius * sum / float(S));
          ao = mix(1.0, ao, smoothstep(3.0, 10.0, rPx));   // zoomed far out, a 0.5 m radius is a few pixels: no AO, no grain
          gl_FragColor = vec4(vec3(ao), 1.0); }`,
    });
    const aoMix = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new T.Vector2() }, uStrength: { value: 1.0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uStrength; varying vec2 vUv;
        void main(){
          float d0 = texture2D(tDepth, vUv).x, w = 0.0, a = 0.0;
          for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
            vec2 uv = vUv + vec2(float(x), float(y)) * uTexel; float d = texture2D(tDepth, uv).x;
            float k = 1.0 / (1.0 + abs(d - d0) * 4000.0); a += texture2D(tAO, uv).x * k; w += k; }
          vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(c.rgb * mix(1.0, a / w, uStrength), c.a); }`,
    });
    const aoQuad = new T.FullScreenQuad(aoMat), mixQuad = new T.FullScreenQuad(aoMix);
    const aoPass = new T.Pass(); aoPass.enabled = false; aoPass.needsSwap = true;
    aoPass.setSize = (w, h) => {
      const hw = Math.max(2, Math.round(w / 2)), hh = Math.max(2, Math.round(h / 2));
      if (aoRT.depth) { aoRT.depth.dispose(); aoRT.ao.dispose(); }
      aoRT.depth = new T.WebGLRenderTarget(hw, hh, { depthTexture: new T.DepthTexture(hw, hh, T.UnsignedIntType), minFilter: T.NearestFilter, magFilter: T.NearestFilter });
      aoRT.ao = new T.WebGLRenderTarget(hw, hh, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
      aoMat.uniforms.uRes.value.set(hw, hh); aoMix.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    };
    aoPass.render = (r, writeBuffer, readBuffer) => {
      if (!aoRT.depth) return;
      const ov = scene.overrideMaterial, bg = scene.background, au = r.shadowMap.autoUpdate;
      scene.overrideMaterial = aoDepth; scene.background = null; r.shadowMap.autoUpdate = false;
      r.setRenderTarget(aoRT.depth); r.clear(); r.render(scene, camera);
      scene.overrideMaterial = ov; scene.background = bg; r.shadowMap.autoUpdate = au;
      aoMat.uniforms.tDepth.value = aoRT.depth.depthTexture; aoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
      aoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse); aoMat.uniforms.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
      r.setRenderTarget(aoRT.ao); aoQuad.render(r);
      aoMix.uniforms.tDiffuse.value = readBuffer.texture; aoMix.uniforms.tAO.value = aoRT.ao.texture; aoMix.uniforms.tDepth.value = aoRT.depth.depthTexture;
      r.setRenderTarget(aoPass.renderToScreen ? null : writeBuffer); mixQuad.render(r);
    };
    composer.addPass(mirrorPass); composer.addPass(aoPass); composer.addPass(bloom); composer.addPass(output);

    /* ---- framing */
    let center = new T.Vector3(), radius = 10, dir = DIR.clone();
    const size = new T.Vector2();
    const resize = () => {
      if (renderer.xr.isPresenting) return;   // the headset owns the size during a VR session
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
      const L = radius * 3; for (const m of [floorMesh, shadowMesh, gridMesh, realFloor]) if (m) { m.scale.set(L, 1, L); m.position.x = center.x; m.position.z = center.z; }
      const sc = key.shadow.camera; Object.assign(sc, { left: -radius, right: radius, top: radius, bottom: -radius, near: 0.5, far: radius * 6 + 40 }); sc.updateProjectionMatrix();
      key.position.copy(center).add(new T.Vector3(-0.35, 1, 0.55).normalize().multiplyScalar(radius * 2 + 20)); key.target.position.copy(center);
      rim.position.copy(center).add(new T.Vector3(-0.6, 0.55, -1).normalize().multiplyScalar(radius * 2 + 20)); rim.target.position.copy(center);
    };

    /* ---- studio colours: charcoal · grey · ivory, one amber accent; emissive lamps keep their colour and glow */
    const C = { ch: new T.Color(PAL.charcoal), gr: new T.Color(PAL.grey), iv: new T.Color(PAL.ivory), am: new T.Color(PAL.amber) };
    const ACCENT = /yellow|amber|orange|hazard/i;
    const tint = c => { const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, t = Math.min(1, Math.max(0, (L - 0.01) / 0.85));
      return t < 0.5 ? C.ch.clone().lerp(C.gr, t * 2) : C.gr.clone().lerp(C.iv, (t - 0.5) * 2); };
    const studioMats = new Map(), texAvg = new Map();
    // average colour of a texture (textured models have a white base colour; their look is in the map)
    const avgOf = tex => { if (texAvg.has(tex.uuid)) return texAvg.get(tex.uuid); let c = new T.Color(0.6, 0.6, 0.6);
      try { const img = tex.image, cv = document.createElement('canvas'); cv.width = cv.height = 8; const x = cv.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
        const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        c = new T.Color().setRGB(r / 64 / 255, g / 64 / 255, b / 64 / 255).convertSRGBToLinear(); } catch (e) { /* image not ready */ }
      texAvg.set(tex.uuid, c); return c; };
    const studio = (root, on) => {
      root.traverse(o => { if (!o.isMesh || o.isPoints) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m || !m.color || m.userData.noStudio) continue;
          if (!studioMats.has(m)) studioMats.set(m, { color: m.color.clone(), metalness: m.metalness, roughness: m.roughness, env: m.envMapIntensity, ei: m.emissiveIntensity, map: m.map });
          const s = studioMats.get(m), glowing = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.25 && !m.emissiveMap;
          if (!on) { m.color.copy(s.color); m.metalness = s.metalness; m.roughness = s.roughness; m.envMapIntensity = s.env; if (glowing) m.emissiveIntensity = s.ei;
            if (m.map !== s.map) { m.map = s.map; m.needsUpdate = true; } continue; }
          if (glowing) { m.emissiveIntensity = Math.max(s.ei || 1, 3); continue; }
          // a textured part: the map comes off and its average colour is tinted like any other
          const base = s.map && s.map.image ? avgOf(s.map).clone().multiply(s.color) : s.color;
          if (m.map) { m.map = null; m.needsUpdate = true; }
          m.color.copy(ACCENT.test(m.name) ? C.am.clone().multiplyScalar(0.8) : tint(base));
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
      aoPass.enabled = realOn && ghostT < 0.5;
      if (ghostT > 0) camera.layers.enable(GHOST_LAYER); else camera.layers.disable(GHOST_LAYER);
    };

    /* ---- amber ring on the floor (blooms) */
    const ring = (r = 1) => {
      const m = new T.Mesh(new T.RingGeometry(r - 0.04, r, 96).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial({ color: 0, emissive: C.am, emissiveIntensity: 3, roughness: 1, metalness: 0, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.y = 0.012; m.renderOrder = 1; m.layers.enableAll(); world.add(m); return m;
    };

    /* ---- VR: post passes do not reach the headset, so in a session the scene is drawn straight to it (no mirror, no
       bloom; tone mapping by the renderer). Static shadows are refreshed every 3rd frame to keep the headset frame rate. */
    const xrRig = new T.Group(), xrCam = new T.PerspectiveCamera(70, 1, 0.05, 400); xrRig.add(xrCam); scene.add(xrRig);
    const onFrame = [];
    let xrFrame = 0;
    renderer.xr.addEventListener('sessionstart', () => {
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      try { renderer.xr.setFoveation(1); } catch (e) { /* not offered */ } });
    renderer.xr.addEventListener('sessionend', () => { renderer.toneMapping = T.NoToneMapping; renderer.shadowMap.autoUpdate = true; setTimeout(resize, 0); });

    /* ---- realistic look (ONE SIMULATION, user 2026-11-06): the factory-hall look of a real plant.
       - light: a warehouse HDRI (assets/env/warehouse_1k.hdr, Poly Haven "Empty Warehouse 01", CC0) as the environment, so
         metal and paint reflect a real hall; the room environment stands in until it has loaded. Warm sun key (shadow 4096).
       - materials by role (standard v2.0 amended 2026-11-06): only bare metal is metallic (0.5–0.8, roughness 0.2–0.4);
         painted steel, robots, plastic, rubber, wood, glass are dielectrics (metalness 0–0.1) with their own roughness.
       - floor: light-grey trowelled concrete with saw-cut joints every 6 m (user chose the bright floor over the #1e1e24
         epoxy for the simulation, 2026-11-06), lit and shadowed, its edge melting into a light-grey surround. No mirror. */
    let realOn = false;
    const R = {
      glass: /glass|acryl|window|trans_|lens/i,
      soft: /skin|person|worker|human|cloth|fabric|chair|seat|foam|hair/i,
      rubber: /rubber|tire|tyre|belt|cable|hose|net_|grip_pad|seal/i,
      paper: /wood|pallet|carton|cardboard|paper|box_kraft|tape/i,
      robot: /otc|fanuc|robot|kuka|yaskawa|abb|cobot/i,
      metal: /metal|steel|chrome|alu|^ss_|_ss|sus|stainless|rail|shaft|roller|bolt|screw|pipe|tube|nozzle|torch|cylinder|linear|gold|copper|brass|zinc|galv|bearing|spring|chain/i,
      skip: /lamp|screen|monitor|led|light|label|sign|text|floor|wall|paint_mark|mark/i,
    };
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const roleOf = (m, o) => { const n = `${m.name} ${o.name}`;
      if (m.userData.role) return { steel: 'metal', frame: 'paint', body: 'paint', light: 'paint', dark: 'paint', accent: 'paint', work: 'metal' }[m.userData.role] || 'keep';
      if ((m.transparent && m.opacity < 0.95) || R.glass.test(n)) return 'glass';
      if (R.skip.test(n)) return 'keep';
      for (const k of ['soft', 'rubber', 'paper', 'robot', 'metal']) if (R[k].test(m.name)) return k;
      for (const k of ['soft', 'rubber', 'paper', 'robot']) if (R[k].test(o.name)) return k;
      return 'paint'; };
    const tune = root => { if (!realOn) return; root.traverse(o => { if (!o.isMesh || o.userData.noReal) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || !m.isMeshStandardMaterial || m.userData.realDone || m.userData.noStudio) continue; m.userData.realDone = true;
        const glowing = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.25;
        if (glowing) continue;
        const r0 = m.roughness ?? 0.5, role = roleOf(m, o);
        if (role === 'keep') { m.envMapIntensity = 0.7; continue; }
        if (role === 'metal') { m.metalness = 0.75; m.roughness = clamp(r0, 0.25, 0.4); m.envMapIntensity = 1.0; }
        else if (role === 'glass') { m.metalness = 0; m.roughness = 0.06; m.envMapIntensity = 1.2; }
        else if (role === 'robot') { m.metalness = 0.05; m.roughness = 0.3; m.envMapIntensity = 1.0; }      // glossy enamel
        else if (role === 'rubber') { m.metalness = 0; m.roughness = 0.8; m.envMapIntensity = 0.5; }
        else if (role === 'soft') { m.metalness = 0; m.roughness = 0.75; m.envMapIntensity = 0.5; }
        else if (role === 'paper') { m.metalness = 0; m.roughness = 0.88; m.envMapIntensity = 0.4; }
        else { m.metalness = 0.05; m.roughness = clamp(r0, 0.4, 0.6); m.envMapIntensity = 0.8; }               // painted steel / plastic
        m.needsUpdate = true;
      } }); };

    // concrete: tileable value noise (blotches, speckle, trowel marks) baked once into colour + roughness canvases
    const concrete = () => {
      const N = 1024, P = 6;                       // 1024 px per 6 m tile (≈6 mm a pixel); joints on the tile edge
      const rnd = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
      const vn = (x, y, f, s) => { const X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), xf = X - xi, yf = Y - yi, w = i => ((i % f) + f) % f;
        const a = rnd(w(xi), w(yi), s), b = rnd(w(xi + 1), w(yi), s), c = rnd(w(xi), w(yi + 1), s), d = rnd(w(xi + 1), w(yi + 1), s);
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
      const col = document.createElement('canvas'), rou = document.createElement('canvas'); col.width = col.height = rou.width = rou.height = N;
      const cx = col.getContext('2d'), rx = rou.getContext('2d'), ci = cx.createImageData(N, N), ri = rx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N, i = (y * N + x) * 4;
        const big = vn(u, v, 3, 1) * 0.55 + vn(u, v, 7, 2) * 0.3 + vn(u, v, 17, 3) * 0.15;     // cloudy patches
        const fine = vn(u, v, 160, 4) * 0.6 + vn(u, v, 420, 5) * 0.4;                          // aggregate grain
        const trowel = vn(u * 0.4 + v * 0.9, v * 0.4 - u * 0.9, 40, 6);                        // faint swirls
        const stain = Math.max(0, vn(u, v, 5, 7) - 0.72) * 2.2;                                // a few darker stains
        const speck = rnd(x, y, 9) > 0.996 ? -0.12 : rnd(x, y, 10) > 0.997 ? 0.08 : 0;
        const jd = Math.min(x, N - 1 - x, y, N - 1 - y), joint = jd < 2 ? 0.55 : jd < 3 ? 0.85 : 1;
        let L = 0.60 + (big - 0.5) * 0.035 + (fine - 0.5) * 0.05 + (trowel - 0.5) * 0.02 - stain * 0.035 + speck * 0.6;
        L *= joint; const g = clamp(L, 0, 1) * 255;
        ci.data[i] = g * 1.0; ci.data[i + 1] = g * 0.995; ci.data[i + 2] = g * 0.975; ci.data[i + 3] = 255;
        const ro = clamp(0.72 + (big - 0.5) * 0.25 - (trowel - 0.5) * 0.12 + stain * 0.1 + (jd < 3 ? 0.2 : 0), 0.4, 1) * 255;
        ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = ro; ri.data[i + 3] = 255;
      }
      cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0);
      const tex = (cv, srgb) => { const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        if (srgb) t.encoding = T.sRGBEncoding; return t; };
      return { map: tex(col, true), roughnessMap: tex(rou, false), tile: P };
    };
    let realFloor = null;
    const REAL_BG = new T.Color(0x4a4c4e);         // linear; ≈ #b6b8ba on screen: a light-grey hall around the floor
    const makeRealFloor = () => {
      const c = concrete();
      const m = new T.MeshStandardMaterial({ color: 0xffffff, map: c.map, roughnessMap: c.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 0.55 });
      m.userData.noStudio = true;
      m.onBeforeCompile = sh => { Object.assign(sh.uniforms, fu, { uTile: { value: c.tile } }); sh.uniforms.uBg = { value: REAL_BG };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWp;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vWp; uniform float uTile; uniform vec3 uBg;\n${fade}`)
          // world-space UVs: the concrete tile stays fixed on the floor whatever the plane's scale
          .replace('#include <map_fragment>', T.ShaderChunk.map_fragment.replace(/vUv/g, '(vWp / uTile)'))
          .replace('#include <roughnessmap_fragment>', T.ShaderChunk.roughnessmap_fragment.replace(/vUv/g, '(vWp / uTile)'))
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, edgeFade(vWp));'); };
      const f = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m);
      f.receiveShadow = true; f.renderOrder = -2; f.layers.enableAll(); f.userData.noReal = true;
      return f; };

    const real = () => { if (realOn) return; realOn = true;
      const pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
      if (T.RGBELoader) new T.RGBELoader().load(opt.hdr || 'assets/env/warehouse_1k.hdr', hdr => {
        hdr.mapping = T.EquirectangularReflectionMapping; const old = scene.environment;
        scene.environment = pm.fromEquirectangular(hdr).texture; hdr.dispose(); if (old) old.dispose(); }, undefined, () => { /* keep the room */ });
      const amb = new T.AmbientLight(0xffffff, 0.15); amb.layers.enableAll(); scene.add(amb);
      hemi.color.set(0xf2f0ea); hemi.groundColor.set(0x6b6a66); hemi.intensity = 0.3;
      key.color.set(0xfff1dc); key.intensity = 1.8; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0003;
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
      rim.intensity = 0.25;
      output.uniforms.aces.value = 1; output.uniforms.exposure.value = 0.85; aoPass.enabled = true;
      BG.copy(REAL_BG); renderer.setClearColor(BG, 1); fu.uBg.value.copy(REAL_BG);
      mirrorPass.mirror = false; floorMesh.visible = false; shadowMesh.visible = false;
      realFloor = makeRealFloor(); floor.add(realFloor); realFloor.scale.copy(floorMesh.scale); realFloor.position.copy(floorMesh.position);
      gridMat.uniforms.uLine.value.set(0x000000); gridMat.uniforms.uFaint.value = 0.15;
      tune(world); };

    let last = performance.now();
    const render = () => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; stepGhost(dt);
      for (const f of onFrame) f(dt);
      if (renderer.xr.isPresenting) {
        xrCam.layers.mask = camera.layers.mask;
        if (++xrFrame % 3 === 0) renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, xrCam); return;   // three has already bound the headset's framebuffer for this frame
      }
      controls.update(); composer.render(); };
    const setDir = v => { dir.copy(v).normalize(); };
    const setGrid = (minor, major) => { gridMat.uniforms.uS1.value = minor; gridMat.uniforms.uS2.value = major; };

    window.addEventListener('resize', resize); resize();
    return { renderer, scene, world, overlay, camera, controls, xrRig, xrCam, onFrame, real, tune, key, rim, hemi, bloom, output, mirrorPass, PAL, render, resize, look, fit, setBounds, setDir, setGrid, floor, studio, addTwin, ghost, ring,
      get ghosting() { return ghostT > 0.5; } };
  }

  window.OneStage = { create, DIR, PAL };
})();
