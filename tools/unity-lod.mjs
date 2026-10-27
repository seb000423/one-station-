// Lighter copies of the Unity models a demo layout repeats hundreds of times, for model groups
// (js/factory-unity-groups.js): meshoptimizer simplification to ~15-25 % of the triangles, textures dropped
// (the group reuses the full model's materials), Draco. Writes <out>/<same name>.glb.
// npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf meshoptimizer
// node tools/unity-lod.mjs assets/models/unity-factory/lod 0.15 0.004 assets/models/unity-factory/Line_01.glb ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld, draco, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import path from 'path';
const [,, out, ratio, error, ...files] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
await MeshoptSimplifier.ready;
for (const f of files) {
  const doc = await io.read(f);
  const count = () => doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
  const before = count();
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +error, lockBorder: false }));
  doc.getRoot().listTextures().forEach(t => t.dispose()); // geometry only: the full model's materials are reused
  await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), draco());
  const o = path.join(out, path.basename(f)); await io.write(o, doc);
  console.log(path.basename(f), before, '->', count());
}
