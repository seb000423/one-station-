// Renders the palette thumbnails of console 1's 모델 tab (assets/models/thumbs/<catalog key>.webp, 256 px):
// opens console.html, loads every FactoryUnity.CATALOG entry through js/factory-assets.js (same loaders and
// part offsets as the builder), frames it from the front-right and saves a transparent WebP. Also prints
// each model's measured size, to check the catalog's footprints.
//
// Usage: node tools/render-thumbs.cjs [path/to/playwright] [catalog key ...]
// The playwright path defaults to ../realvirtual-WEB/node_modules/playwright.
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), PW = args[0] && !/^[a-z0-9_]+$/.test(args[0]) ? args.shift() : path.resolve(ROOT, '../realvirtual-WEB/node_modules/playwright');
const OUT = path.join(ROOT, 'assets/models/thumbs');
const { chromium } = require(PW);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((req, rsp) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
  rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rsp);
}).listen(0, async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${srv.address().port}/console.html`);
  await page.waitForFunction(() => window.FactoryUnity && window.FactoryAssets && window.THREE);
  fs.mkdirSync(OUT, { recursive: true });
  const keys = args.length ? args : await page.evaluate(() => Object.keys(FactoryUnity.CATALOG));
  for (const key of keys) {
    const r = await page.evaluate(async key => {
      const A = FactoryAssets, c = FactoryUnity.CATALOG[key];
      await Promise.all(c.parts.map(([id]) => A.load(id)));
      const all = new THREE.Group();
      for (const [id, x, y, z] of c.parts) { const m = A.get(id); m.position.set(x, y, z); all.add(m); }
      const scene = new THREE.Scene(), obj = A.placed(all, 'thumb'); scene.add(obj);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(4, 8, 6); scene.add(sun);
      const R = window.__thumbR || (window.__thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
      R.setPixelRatio(1); R.setSize(512, 512); R.outputEncoding = THREE.sRGBEncoding; R.setClearColor(0x000000, 0);
      if (!window.__thumbEnv) window.__thumbEnv = new THREE.PMREMGenerator(R).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      scene.environment = window.__thumbEnv;
      const b = A.bounds(obj, null), s = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 200), dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
      const rad = s.length() / 2; cam.position.copy(ctr).addScaledVector(dir, rad / Math.sin(15 * Math.PI / 180) * 1.02); cam.lookAt(ctr);
      R.render(scene, cam);
      const big = R.domElement, small = document.createElement('canvas'); small.width = small.height = 256;
      small.getContext('2d').drawImage(big, 0, 0, 256, 256);
      return { url: small.toDataURL('image/webp', 0.86), size: [s.x, s.y, s.z].map(v => +v.toFixed(2)), cat: c.size };
    }, key);
    const f = path.join(OUT, key + '.webp');
    fs.writeFileSync(f, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(key.padEnd(11), 'measured', r.size.join(' × '), '| catalog', r.cat.join(' × '), '|', fs.statSync(f).size, 'B');
  }
  await browser.close(); srv.close();
});
