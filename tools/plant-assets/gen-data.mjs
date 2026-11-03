// <out-dir>/<id>.json (from run.js) → js/plant-data.js: per station its size and its parts
// [GLB node, label, kind, size [X, Y, Z] mm, bottom-centre position [X, Y, Z] mm]. node gen-data.mjs <out-dir>
import { readFileSync, writeFileSync } from 'node:fs';
const dir = process.argv[2], out = {};
for (const id of ['inspection', 'assembly', 'paste', 'brazing']) {
  const j = JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'));
  out[id] = { size: j.size, parts: j.parts.map(p => [p.node, p.label, p.kind, p.size, p.pos]) };
}
writeFileSync(new URL('../../js/plant-data.js', import.meta.url), '// Partner plant stations converted from FBX (tools/plant-assets): per station its size [X, Y, Z] mm and its parts\n'
  + '// [GLB node, label, kind, size [X, Y, Z] mm, bottom-centre position [X, Y, Z] mm in the station frame]. Generated, do not edit by hand.\n'
  + 'window.ONE_PLANT_DATA = ' + JSON.stringify(out).replace(/\],\[/g, '],\n[') + ';\n');
