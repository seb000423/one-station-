// Blender GLB → web GLB: dedup, textures ≤ 1024 px (JPEG, PNG only where the alpha is used), Draco geometry.
// node pack.mjs in.glb out.glb   (needs @gltf-transform/core, functions, extensions, draco3dgltf, sharp)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const [, , src, dst] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(src);
const root = doc.getRoot();
// textures whose alpha is used (base colour of a BLEND / MASK material) stay PNG
const alpha = new Set();
for (const m of root.listMaterials()) if (m.getAlphaMode() !== 'OPAQUE' && m.getBaseColorTexture()) alpha.add(m.getBaseColorTexture());
for (const t of root.listTextures()) if (!t.getName()) t.setName(t.getURI() || 'tex');
let i = 0; for (const t of root.listTextures()) t.setName(`${alpha.has(t) ? 'A' : 'O'}${i++}_${t.getName()}`);
await doc.transform(
  dedup(), prune({ keepLeaves: true }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 82, resize: [1024, 1024], pattern: /^O\d+_/ }),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [1024, 1024], pattern: /^A\d+_/ }),
  draco({ method: 'edgebreaker' }),
);
await io.write(dst, doc);
