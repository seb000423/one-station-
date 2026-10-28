// Post-pass for OCCT-exported GLBs: drops line/point primitives (CAD wire edges, robot envelopes), simplifies every mesh with
// meshopt (target ratio + error bound), merges meshes per material and re-exports a flat GLB (Y up, metres).
// usage: PATH=$HOME/.local/bin:$PATH node glb-simplify.mjs outdir ratio error in1.glb [in2.glb ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const RV = '/home/eon/Desktop/realvirtual-WEB/node_modules';
const { chromium } = createRequire(import.meta.url)(path.join(RV, 'playwright'));
const [outdir, ratio, error, budget, mindiag, ...files] = process.argv.slice(2); // budget: max tris per file; mindiag: drop meshes smaller than this (m)
fs.mkdirSync(outdir, { recursive: true });
const html = `<!doctype html><html><body><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js'; import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
await MeshoptSimplifier.ready;
const L = new GLTFLoader();
const ZUP = new THREE.Matrix4().makeRotationX(-Math.PI / 2); // OCCT wrote CAD axes unchanged: CAD Z up -> glTF Y up
window.doOne = async (urls, ratio0, err, budget, mindiag) => {
  const root = new THREE.Group(); for (const u of urls) { const g = await L.loadAsync(u); root.add(g.scene); } root.applyMatrix4(ZUP); root.updateMatrixWorld(true);
  const byMat = new Map(); let trisIn = 0, trisOut = 0, lines = 0, total = 0, small = 0;
  root.traverse(o => { if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (bb.min.distanceTo(bb.max) < mindiag) { o.userData.drop = true; return; } total += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  const ratio = Math.min(ratio0, budget / Math.max(1, total));
  root.traverse(o => {
    if (o.isLine || o.isPoints || o.isLineSegments) { lines++; return; }
    if (!o.isMesh) return; if (o.userData.drop) { small++; return; }
    let geo = o.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    if (!geo.index) geo = mergeVertices(geo); if (!geo.attributes.normal) geo.computeVertexNormals();
    const idx = geo.index.array, pos = geo.attributes.position.array, n = idx.length / 3; trisIn += n;
    let out = idx;
    if (n > 120) { const target = Math.max(40, Math.floor(n * ratio)) * 3;
      const [res] = MeshoptSimplifier.simplify(idx instanceof Uint32Array ? idx : new Uint32Array(idx), pos, 3, target, err, window.__flags || []);
      if (res && res.length >= 3) out = res;
      if (out.length > 2 * target) { const [sl] = MeshoptSimplifier.simplifySloppy(idx instanceof Uint32Array ? idx : new Uint32Array(idx), pos, 3, null, target, err); if (sl && sl.length >= 3 && sl.length < out.length) out = sl; }
      if (window.__dbg && n > 20000) console.log('DBG', n, '->', out.length / 3, 'target', target / 3, 'verts', pos.length / 3, 'err', MeshoptSimplifier.getScale ? '' : ''); }
    trisOut += out.length / 3;
    geo.setIndex(new THREE.BufferAttribute(out instanceof Uint32Array ? new Uint32Array(out) : new Uint32Array(out), 1)); geo = mergeVertices(geo); // drops unused vertices
    geo.applyMatrix4(o.matrixWorld);
    const m = o.material, key = m.color.getHexString() + '|' + (m.metalness || 0).toFixed(2) + '|' + (m.roughness || 0).toFixed(2) + '|' + (m.transparent ? m.opacity.toFixed(2) : '1');
    if (!byMat.has(key)) byMat.set(key, { mat: m, geos: [] }); byMat.get(key).geos.push(geo);
  });
  const scene = new THREE.Group(); scene.name = 'Station'; let k = 0;
  for (const { mat, geos } of byMat.values()) { const merged = mergeGeometries(geos, false); if (!merged) continue; const mm = new THREE.MeshStandardMaterial({ color: mat.color, metalness: mat.metalness ?? 0.3, roughness: mat.roughness ?? 0.6, transparent: !!mat.transparent, opacity: mat.opacity ?? 1, side: THREE.FrontSide }); mm.name = 'm' + k; const mesh = new THREE.Mesh(merged, mm); mesh.name = 'part' + (k++); scene.add(mesh); }
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const b = new THREE.Box3().setFromObject(scene);
  const u8 = new Uint8Array(glb); let bin = ''; for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return { glb: btoa(bin), trisIn, trisOut, lines, small, meshes: k, box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => +v.toFixed(4)) };
};
window.ready = true;
</script></body></html>`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message)); page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text()); });
await page.route('http://v.local/**', route => {
  const p = new URL(route.request().url()).pathname;
  if (p === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  const file = p.startsWith('/three/') ? path.join(RV, 'three', p.slice(7)) : p.startsWith('/glb/') ? files.find(f => path.basename(f) === decodeURIComponent(p.slice(5))) : null;
  if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: fs.readFileSync(file) });
});
page.on('console', m => { if (m.text().startsWith('DBG')) console.log(m.text()); });
await page.goto('http://v.local/'); if (process.env.DBG) await page.evaluate(() => { window.__dbg = true; }); if (process.env.FLAGS) await page.evaluate(f => { window.__flags = f.split(','); }, process.env.FLAGS); await page.waitForFunction(() => window.ready);
const summary = {};
const jobs = process.env.MERGE ? [[process.env.MERGE + '.glb', files]] : files.map(f => [path.basename(f), [f]]);
for (const [name, ins] of jobs) {
  const r = await page.evaluate(([u, ra, er, bu, md]) => window.doOne(u, ra, er, bu, md), [ins.map(f => '/glb/' + path.basename(f)), +ratio, +error, +budget, +mindiag]);
  const out = path.join(outdir, name); fs.writeFileSync(out, Buffer.from(r.glb, 'base64'));
  summary[name] = { trisIn: r.trisIn, trisOut: r.trisOut, box: r.box, kb: Math.round(fs.statSync(out).size / 1024) };
  console.log(`${name}: ${r.trisIn} -> ${r.trisOut} tris, ${r.lines} lines + ${r.small} small meshes dropped, ${r.meshes} meshes, ${Math.round(fs.statSync(out).size / 1024)} KB`);
}
const sp = path.join(outdir, 'summary.json'); const prev = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp)) : {}; fs.writeFileSync(sp, JSON.stringify({ ...prev, ...summary }, null, 1));
await browser.close();
