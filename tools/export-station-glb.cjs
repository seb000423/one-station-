// Exports the ONE STATION scene that console.html builds (default settings: tube product, 6 slots)
// to realvirtual-models/station.glb + station-timeline.json, the default station console2.html shows.
// The export itself lives in js/station-export.js (shared with console.html's 저장): the station with
// realvirtual drives and console 1's recorded cycle, plus the HUD/result timeline for console 2's
// panels. Math.random is seeded here, so DMC codes, weights and simulated faults are reproducible.
//
// Usage (needs Node and Playwright; Microsoft Edge is used as the browser):
//   node tools/export-station-glb.cjs [path/to/playwright] [out.glb]
// The playwright path defaults to ../realvirtual-WEB/node_modules/playwright.
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PW = process.argv[2] || path.resolve(ROOT, '../realvirtual-WEB/node_modules/playwright');
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'realvirtual-models/station.glb'));
const TIMELINE = OUT.replace(/.glb$/i, '') + '-timeline.json';
const SEED = 20261024;
const { chromium } = require(PW);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

// Runs in the page: js/station-export.js does the work (console.html's 저장 uses the same module).
async function exportInPage() {
  const { glb, timeline, info } = await window.StationExport.exportStation();
  const bytes = new Uint8Array(glb); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { glb: btoa(s), timeline: JSON.stringify(timeline), info };
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    // deterministic console 1 run (DMC codes, weights, simulated faults)
    await page.addInitScript(seed => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, SEED);
    await page.goto(`http://localhost:${srv.address().port}/console.html`);
    await page.waitForFunction(() => window.__station && window.__station.ST, null, { timeout: 30000 });
    await page.addScriptTag({ path: path.join(ROOT, 'js/station-export.js') });
    const { glb, timeline, info } = await page.evaluate(exportInPage);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(glb, 'base64'));
    fs.writeFileSync(TIMELINE, timeline);
    console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), ${TIMELINE} (${(fs.statSync(TIMELINE).size / 1024).toFixed(0)} KB)`, JSON.stringify(info));
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
