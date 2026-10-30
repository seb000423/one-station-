// Our own equipment as assets for ONE BUILDER (console 1). A machine is built from frame parts (js/factory-frame.js: profiles, plates,
// feet, shape blocks, catalogue models) plus the user's own model files (GLB / glTF binary / STL, e.g. exported from CAD), then saved
// as one asset: a name, kind, cycle time, thumbnail and its parts. Assets are placed in a layout as a single object (type 'mine') and
// can be taken apart again for editing.
// Storage: uploaded files live in this browser's IndexedDB ('one-station-equip'); their list and the asset library live in localStorage.
// An asset can be exported as one .equip.json file (its uploaded files embedded) and imported in another browser.
(function () {
  const FE = window.FactoryElements; if (!FE) return;
  if (FE.MACHINES && !FE.MACHINES.includes('mine')) FE.MACHINES.push('mine'); // a placed asset has a footprint and collides like equipment
  const LOADERS = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/';
  const DB = 'one-station-equip', ST = 'files', META = 'one-station-equip-files', LIB = 'one-station-frame-mine';
  const KINDS = { process: '가공', assembly: '조립', inspect: '검사', transfer: '이송 · 핸들링', storage: '보관 · 버퍼', other: '기타' };

  // ---------------------------------------------------------------- IndexedDB file store
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, fail) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); }));
  const tx = (mode, fn) => db().then(d => new Promise((ok, fail) => { const t = d.transaction(ST, mode), r = fn(t.objectStore(ST)); t.oncomplete = () => ok(r && r.result); t.onerror = () => fail(t.error); }));
  const putFile = rec => tx('readwrite', s => s.put(rec)), getFile = id => tx('readonly', s => s.get(id)), delFile = id => tx('readwrite', s => s.delete(id));
  const json = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const files = () => json(META, []); // [{ id, name, n: [x, y, z] m, bytes, mm }]
  const label = id => (files().find(f => f.id === id) || {}).name || '내 모델 (이 브라우저에 없음)';

  // ---------------------------------------------------------------- parsing (GLB / glTF binary / STL) → a root in metres
  const script = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('load failed: ' + src)); document.head.appendChild(s); });
  let gltf = null, stl = null;
  const gltfLoader = () => gltf || (gltf = (async () => {
    if (!THREE.GLTFLoader) await script(LOADERS + 'GLTFLoader.js');
    if (!THREE.DRACOLoader) await script(LOADERS + 'DRACOLoader.js');
    if (!window.MeshoptDecoder) await script(LOADERS.replace('loaders/', 'libs/') + 'meshopt_decoder.js');
    const L = new THREE.GLTFLoader(), d = new THREE.DRACOLoader(); d.setDecoderPath('realvirtual/draco/'); L.setDRACOLoader(d); L.setMeshoptDecoder(window.MeshoptDecoder); return L;
  })());
  const stlLoader = () => stl || (stl = (async () => { if (!THREE.STLLoader) await script(LOADERS + 'STLLoader.js'); return new THREE.STLLoader(); })());
  const bodyMat = () => { const m = new THREE.MeshStandardMaterial({ color: 0xb8bfc6, metalness: 0.6, roughness: 0.35 }); m.color.convertSRGBToLinear(); return m; };
  const sizeOf = o => { const b = window.FactoryAssets.bounds(o, null), s = b.getSize(new THREE.Vector3()); return [s.x, s.y, s.z]; };
  async function parse(buf, name) {
    let root;
    if (/\.stl$/i.test(name)) {
      const g = (await stlLoader()).parse(buf); g.computeVertexNormals();
      const m = new THREE.Mesh(g, g.hasColors ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4 }) : bodyMat());
      m.rotation.x = -Math.PI / 2; // CAD files are Z-up, the factory is Y-up
      root = new THREE.Group(); root.add(m);
    } else {
      const L = await gltfLoader(); root = (await new Promise((ok, fail) => L.parse(buf, '', ok, fail))).scene;
    }
    root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    const wrap = new THREE.Group(); wrap.add(root);
    let n = sizeOf(wrap), mm = false;
    if (Math.max(...n) > 30) { root.scale.multiplyScalar(0.001); mm = true; n = sizeOf(wrap); } // CAD exports in mm: anything over 30 m is read as millimetres
    return { root: wrap, n: n.map(v => Math.round(v * 1e4) / 1e4), mm };
  }
  const cache = new Map(); // id → { state: 'loading' | 'ready' | 'failed', root }
  function ensure(id) {
    if (cache.has(id)) return; const e = { state: 'loading', root: null }; cache.set(id, e);
    getFile(id).then(rec => { if (!rec) throw new Error('not in this browser'); return parse(rec.data, rec.name); })
      .then(r => { e.root = r.root; e.state = 'ready'; dispatchEvent(new CustomEvent('factory-assets-ready', { detail: { id: 'up:' + id } })); })
      .catch(err => { e.state = 'failed'; console.warn('[factory-equip]', id, err.message); });
  }
  const get = id => { const e = cache.get(id); if (!e) { ensure(id); return null; } return e.state === 'ready' ? e.root.clone(true) : null; };
  const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  // a model file the user picked: stored once per content (same file → same id), measured, listed
  async function upload(file) {
    if (!/\.(glb|gltf|stl)$/i.test(file.name)) throw new Error('GLB, glTF(바이너리), STL 파일만 올릴 수 있습니다');
    const buf = await file.arrayBuffer(), id = 'f' + await hex(buf), r = await parse(buf, file.name);
    await putFile({ id, name: file.name, data: buf });
    cache.set(id, { state: 'ready', root: r.root });
    const L = files().filter(f => f.id !== id); L.push({ id, name: file.name.replace(/\.(glb|gltf|stl)$/i, ''), n: r.n, bytes: buf.byteLength, mm: r.mm }); keep(META, L);
    return L[L.length - 1];
  }
  async function removeFile(id) { await delFile(id); keep(META, files().filter(f => f.id !== id)); cache.delete(id); }

  // ---------------------------------------------------------------- asset library (localStorage, same list the 내 설비 tiles read)
  const library = () => json(LIB, []);
  const saveLibrary = L => keep(LIB, L);
  // a small picture of a group for the palette tile
  let TR = null, TS = null;
  function thumbnail(obj) {
    try {
      if (!TR) {
        TR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); TR.setPixelRatio(1); TR.setSize(192, 144);
        TS = new THREE.Scene(); TS.add(new THREE.HemisphereLight(0xffffff, 0x3a3f45, 0.7)); const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(3, 6, 4); TS.add(d);
        if (THREE.RoomEnvironment) { const pm = new THREE.PMREMGenerator(TR); TS.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; }
      }
      TS.add(obj); obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj), sp = b.getBoundingSphere(new THREE.Sphere()), cam = new THREE.PerspectiveCamera(32, 192 / 144, 0.01, 200);
      cam.position.copy(sp.center).addScaledVector(new THREE.Vector3(1, 0.75, 1.25).normalize(), sp.radius / Math.sin(THREE.MathUtils.degToRad(16)) * 1.05); cam.lookAt(sp.center);
      TR.render(TS, cam); TS.remove(obj);
      return TR.domElement.toDataURL('image/webp', 0.85);
    } catch (e) { console.warn('[factory-equip] thumbnail', e); return ''; }
  }
  // export: one JSON file with the asset and every uploaded model file it uses (base64)
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u.buffer; };
  async function exportAsset(a) {
    const ids = [...new Set((a.parts || []).filter(q => q.type === 'model' && String((q.params || {}).src).startsWith('up:')).map(q => q.params.src.slice(3)))], out = [];
    for (const id of ids) { const rec = await getFile(id); if (rec) out.push({ id, name: rec.name, meta: files().find(f => f.id === id) || null, data: b64(rec.data) }); }
    const body = JSON.stringify({ format: 'one-station-equipment', version: 1, name: a.name, kind: a.kind || 'process', ct: a.ct || 0, note: a.note || '', thumb: a.thumb || '', parts: a.parts, files: out });
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); el.download = `${a.name.replace(/[\\/:*?"<>|]+/g, '_')}.equip.json`;
    document.body.appendChild(el); el.click(); setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1000);
    return { files: out.length, missing: ids.length - out.length };
  }
  async function importAsset(file) {
    const d = JSON.parse(await file.text());
    if (d.format !== 'one-station-equipment' || !Array.isArray(d.parts)) throw new Error('ONE STATION 설비 에셋 파일이 아닙니다');
    const meta = files();
    for (const f of d.files || []) {
      const buf = unb64(f.data); await putFile({ id: f.id, name: f.name, data: buf });
      if (!meta.some(m => m.id === f.id)) meta.push(f.meta || { id: f.id, name: f.name, n: null, bytes: buf.byteLength }); cache.delete(f.id);
    }
    keep(META, meta);
    return { name: d.name, kind: d.kind, ct: d.ct, note: d.note, thumb: d.thumb, parts: d.parts };
  }

  window.FactoryEquip = { KINDS, files, label, upload, removeFile, ensure, get, library, saveLibrary, thumbnail, exportAsset, importAsset };
})();
