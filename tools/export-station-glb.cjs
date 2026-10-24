// Exports the ONE STATION scene that console.html builds (default settings, idle home pose)
// to realvirtual-models/station.glb, so console2.html can open it in realvirtual WEB.
//
// Usage (needs Node and Playwright; Microsoft Edge is used as the browser):
//   node tools/export-station-glb.cjs [path/to/playwright] [out.glb]
// The playwright path defaults to ../realvirtual-WEB/node_modules/playwright.
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PW = process.argv[2] || path.resolve(ROOT, '../realvirtual-WEB/node_modules/playwright');
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'realvirtual-models/station.glb'));
const EXPORTER = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/GLTFExporter.js';
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

// Runs in the page: gathers the station into one named root and exports it as binary glTF.
async function exportInPage() {
  const S = window.__station, ST = S.ST, scene = ST.group.parent;
  const root = new THREE.Group(); root.name = 'ONE_STATION';
  const name = (o, n) => { if (o) o.name = n; };
  const meshesWith = mat => { const out = []; ST.group.traverse(o => { if (o.isMesh && o.material === mat) out.push(o); }); return out; };

  name(ST.group, 'Station');
  name(ST.enc, 'Enclosure');
  name(ST.door, 'Door');
  ST.leaves.forEach((l, i) => name(l, i ? 'Door_Leaf_R' : 'Door_Leaf_L'));
  const LINKS = ['base', 'j2h', 'upper', 'j3h', 'fore', 'j4h', 'j5h', 'j6h', 'baseRing', 'j1cap', 'j2cap', 'j3cap', 'j4cap', 'j5cap', 'j6cap', 'flange'];
  ST.robots.forEach(r => {
    const tag = r.name + (r.kind === 'handler' ? '_Handler' : '_Dispenser');
    name(r.root, tag);
    LINKS.forEach((n, i) => name(r.root.children[i], `${r.name}_${n}`));
    name(r.tool, `${r.name}_Tool`);
    (r.fingers || []).forEach((f, i) => name(f, `${r.name}_Finger_${i ? 'R' : 'L'}`));
    name(r.carriage, `${r.name}_RailCarriage`);
    if (r.reach) r.reach.removeFromParent();
  });
  name(ST.pos.tilt, 'Positioner_A_Tilt');
  name(ST.pos.rot, 'Positioner_C_Rotary');
  ST.pos.clamps.forEach((c, i) => name(c, `Positioner_Clamp_${i + 1}`));
  ST.sensors.forEach((m, i) => meshesWith(m).forEach(o => name(o, `Jig_Sensor_${i + 1}`)));
  Object.entries(ST.lamps).forEach(([k, m]) => (m.isMaterial ? meshesWith(m) : [m]).forEach(o => name(o, `TowerLamp_${k}`)));
  meshesWith(ST.startMat).forEach(o => name(o, 'StartButton'));
  ST.group.traverse(o => { if (o.isMesh && o.material.map === ST.hmi.tex) name(o, 'HMI_Screen'); });
  ST.parts.forEach(p => name(p.obj, `Part_Slot${p.slotIdx + 1}_${p.code}`));

  [ST.group, ...ST.parts.map(p => p.obj)].forEach(o => root.add(o));
  scene.add(root);
  root.updateMatrixWorld(true);

  const glb = await new Promise((ok, fail) => new THREE.GLTFExporter().parse(root, ok, fail, { binary: true, onlyVisible: true }));
  const bytes = new Uint8Array(glb); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${srv.address().port}/console.html`);
    await page.waitForFunction(() => window.__station && window.__station.ST, null, { timeout: 30000 });
    await page.addScriptTag({ url: EXPORTER });
    const b64 = await page.evaluate(exportInPage);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
    console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
