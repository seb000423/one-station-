// node run.js <base-url-of-fbx2glb.html> <out-dir> id…  → <id>.raw.glb + <id>.json (then node pack.mjs)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [url, dir, ...ids] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--js-flags=--max-old-space-size=12000'] });
  for (const id of ids) {
    const p = await b.newPage(); p.on('console', m => { if (m.type() === 'error') console.log(id, 'console:', m.text().slice(0, 200)); });
    await p.goto(`${url}?id=${id}`); await p.waitForFunction('window.DONE', null, { timeout: 900000 });
    const d = await p.evaluate('({ err: window.DONE.err, json: window.DONE.json, log: window.DONE.log })');
    if (d.err) { console.log(id, 'ERROR', d.err); continue; }
    // fetch the GLB in 8 MB slices (one huge string does not cross the page boundary)
    const n = await p.evaluate('window.GLB.length'), parts = [];
    for (let o = 0; o < n; o += 8e6) parts.push(Buffer.from(await p.evaluate(([a, b]) => { let s = ''; const u = window.GLB.subarray(a, b); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }, [o, Math.min(n, o + 8e6)]), 'base64'));
    fs.writeFileSync(`${dir}/${id}.raw.glb`, Buffer.concat(parts)); fs.writeFileSync(`${dir}/${id}.json`, JSON.stringify(d.json, null, 1));
    console.log(id, 'ok', d.json.parts.length, 'parts', d.json.faces, 'faces', d.json.size, d.log.join(' ')); await p.close();
  }
  await b.close();
})();
