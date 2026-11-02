#!/usr/bin/env node
/**
 * "No magic" audit of the 3D replay (sim.html): plays the line frame by frame in a headless browser and counts
 * pallets closer than one pallet length (overlap) and objects that move more than 3 cm in one frame without the
 * motion behind it (a jump / teleport). Every case must give 0 / 0.
 *   npm run audit:sim                    (needs Playwright with Chromium)
 *   THREE_DIR=node_modules/three npm run audit:sim   (serve three r147 locally when the CDN is not reachable)
 */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { console.error('Playwright is needed: npm i -D playwright && npx playwright install chromium'); process.exit(2); }
const ROOT = path.resolve(__dirname, '../..'), THREE_DIR = process.env.THREE_DIR && path.resolve(process.env.THREE_DIR);
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.css': 'text/css', '.png': 'image/png' };
const CASES = [
  ['8 pallets', { pallets: 8 }, 0, 1200],
  ['24 pallets', { pallets: 24 }, 0, 2400],
  ['many NG', { pallets: 12, stations: { A5: { okRate: 0.6 }, E3: { okRate: 0.6 } } }, 0, 2400],
  ['faster bottlenecks', { pallets: 23, stations: { E3: { ct: 18.56 }, B6: { ct: 18.47 } } }, 0, 2400],
  ['deterministic', { pallets: 16, deterministic: true }, 0, 1800],
];
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const port = server.address().port, b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  if (THREE_DIR) await p.route('https://cdn.jsdelivr.net/npm/three@0.147.0/**', r => r.fulfill({ path: path.join(THREE_DIR, new URL(r.request().url()).pathname.replace('/npm/three@0.147.0/', '')), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto(`http://localhost:${port}/sim.html`);
  await p.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 180000 });
  let failed = 0;
  for (const [name, params, t0, t1] of CASES) {
    const r = await p.evaluate(([params, t0, t1]) => { const S = window.ONE_SIM; S.load(params, 'audit'); S.setPlaying(false); return S.audit(t0, t1, 0.1); }, [params, t0, t1]);
    const ok = r.overlaps === 0 && r.jumps === 0; if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} frames ${r.frames}  overlaps ${r.overlaps}  jumps ${r.jumps}${ok ? '' : '\n     ' + JSON.stringify([...r.firstOverlaps.slice(0, 2), ...r.firstJumps.slice(0, 2)])}`);
  }
  await b.close(); server.close(); process.exit(failed ? 1 : 0);
});
