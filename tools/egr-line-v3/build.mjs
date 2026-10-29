// Builds the EGR line v3 custom equipment: runs build.html (three.js models.js → GLTFExporter) in headless Chrome
// through Playwright, writes assets/models/egr-line-v3/<name>.glb and a preview PNG per model to _ref_vexplor/.
// three.js and Playwright come from the realvirtual-WEB checkout (THREE_PKG / PW_PKG override the paths).
// Usage (repo root):  PATH=$HOME/.local/bin:$PATH node tools/egr-line-v3/build.mjs [name ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const RV = path.join(ROOT, '..', 'realvirtual-WEB', 'node_modules');
const THREE_DIR = process.env.THREE_PKG || path.join(RV, 'three');
const { chromium } = createRequire(import.meta.url)(process.env.PW_PKG || path.join(RV, 'playwright'));
const OUT = path.join(ROOT, 'assets', 'models', 'egr-line-v3'), PREV = path.join(ROOT, '_ref_vexplor');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(PREV, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text()); });
page.on('pageerror', e => console.error('page error:', e.message));
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary' };
await page.route('http://build.local/**', route => {
  const p = new URL(route.request().url()).pathname;
  const file = p.startsWith('/three/') ? path.join(THREE_DIR, p.slice(7)) : p.startsWith('/assets/') || p.startsWith('/realvirtual/draco/') ? path.join(ROOT, p.slice(1)) : path.join(HERE, p.slice(1)); // /assets/: models other models build on (the FR5)
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
});
await page.goto('http://build.local/build.html');
const names = await page.waitForFunction(() => window.ready).then(h => h.jsonValue());
const want = process.argv.slice(2).length ? process.argv.slice(2) : names;
for (const name of want) {
  const r = await page.evaluate(n => window.buildOne(n), name);
  const glb = path.join(OUT, name + '.glb'), png = path.join(PREV, 'preview_' + name + '.png');
  fs.writeFileSync(glb, Buffer.from(r.glb, 'base64')); fs.writeFileSync(png, Buffer.from(r.png, 'base64'));
  if (r.table) fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(r.table));   // the model's station table (userData.table), for the layout script
  console.log(`${name}: ${Math.round(r.tris)} tris, ${r.meshes} meshes, ${(fs.statSync(glb).size / 1024).toFixed(0)} KB, size ${r.size.join(' x ')} m, min ${r.min.join(' ')}` + (r.nodes.length ? `\n   moving: ${r.nodes.join(', ')}` : ''));
}
await browser.close();
