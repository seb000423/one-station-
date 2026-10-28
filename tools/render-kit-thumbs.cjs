// Renders the palette thumbnails of console 1's parametric parts (js/factory-kit.js) for the 모델 tab
// (assets/models/thumbs/kit_<type>[_<preset>].webp, 256 px), framed like tools/render-thumbs.cjs.
// Usage: node tools/render-kit-thumbs.cjs [path/to/playwright]
// (derived from render-thumbs.cjs:)
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
  await page.waitForFunction(() => window.FactoryElements && window.FactoryKit && window.THREE);
  fs.mkdirSync(OUT, { recursive: true });
  const KITS = [['conveyor_roller', 'conveyor', { kind: 'roller', length: 3 }], ['conveyor_belt', 'conveyor', { kind: 'belt', length: 3 }], ['fence', 'fence', { length: 3 }],
    ['rack', 'rack', {}], ['tote_tote', 'tote', { stack: 2 }], ['tote_carton', 'tote', { kind: 'carton', length: 0.6, width: 0.4, height: 0.3, stack: 2 }],
    ['bench_dispense', 'bench', { kind: 'dispense', side: 1 }], ['bench_assembly', 'bench', { kind: 'assembly' }], ['bench_leak', 'bench', { kind: 'leak' }], ['bench_pack', 'bench', { kind: 'pack' }],
    ['wall', 'wall', { length: 6, h: 9 }], ['column', 'column', { h: 8 }], ['door', 'door', {}], ['roof', 'roof', { length: 12, span: 12, h: 6 }]];
  for (const [name, type, params] of KITS) {
    const r = await page.evaluate(async ([type, params]) => {
      const FE = FactoryElements, f = { width: 30, depth: 30, height: 8 };
      const obj = FE.build({ type, x: 0, z: 0, params: Object.assign(FE.defaults(type, f), params) }, f);
      obj.traverse(o => { if (o.isSprite || (o.userData && o.userData.label) || /Arrow/.test(o.name)) o.visible = false; });
      const scene = new THREE.Scene(); scene.add(obj);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(4, 8, 6); scene.add(sun);
      const R = window.__thumbR || (window.__thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
      R.setPixelRatio(1); R.setSize(512, 512); R.outputEncoding = THREE.sRGBEncoding; R.setClearColor(0x000000, 0);
      if (!window.__thumbEnv) window.__thumbEnv = new THREE.PMREMGenerator(R).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      scene.environment = window.__thumbEnv;
      const b = new THREE.Box3(); obj.updateMatrixWorld(true); obj.traverse(m => { if (m.isMesh && m.visible) b.expandByObject(m); });
      const s = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 400), dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
      cam.position.copy(ctr).addScaledVector(dir, s.length() / 2 / Math.sin(15 * Math.PI / 180) * 1.02); cam.lookAt(ctr);
      R.render(scene, cam);
      const small = document.createElement('canvas'); small.width = small.height = 256; small.getContext('2d').drawImage(R.domElement, 0, 0, 256, 256);
      return { url: small.toDataURL('image/webp', 0.86), size: [s.x, s.y, s.z].map(v => +v.toFixed(2)) };
    }, [type, params]);
    const f = path.join(OUT, 'kit_' + name + '.webp'); fs.writeFileSync(f, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name.padEnd(16), r.size.join(' × '), fs.statSync(f).size, 'B');
  }
  await browser.close(); srv.close();
});
