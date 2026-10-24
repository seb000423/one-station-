// Reports whether the save/load API is configured (booleans only, never the values) and which upload mode api/upload uses.
import { put, del, list } from '@vercel/blob';
import { sendJson } from './_lib.js';

// smallest valid GLB (empty scene), used by the one-off storage self-test below
function probeGlb() {
  let json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + json.length, 8);
  head.writeUInt32LE(json.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, json]);
}

export default async function handler(req, res) {
  const env = process.env, oidc = !!(env.VERCEL_OIDC_TOKEN || req.headers['x-vercel-oidc-token']);
  const status = {
    blobToken: !!env.BLOB_READ_WRITE_TOKEN, blobStoreId: !!env.BLOB_STORE_ID, oidc, webhookKey: !!env.BLOB_WEBHOOK_PUBLIC_KEY, savePassword: !!env.SAVE_PASSWORD,
    // how api/upload issues upload credentials (console-save.js picks upload() or uploadPresigned() from this)
    uploadMode: env.BLOB_READ_WRITE_TOKEN ? 'token' : (oidc && env.BLOB_STORE_ID ? 'presigned' : null)
  };
  const storage = status.blobToken || (status.oidc && status.blobStoreId);
  try {
    // temporary storage self-test: writes/removes one fixed tiny file under saves/_test/
    if (req.query.selftest === 'put' && storage) {
      const blob = await put('saves/_test/probe.glb', probeGlb(), { access: 'public', contentType: 'model/gltf-binary', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
      return sendJson(res, 200, { ...status, url: blob.url });
    }
    if (req.query.selftest === 'cleanup' && storage) {
      const { blobs } = await list({ prefix: 'saves/_test/' });
      if (blobs.length) await del(blobs.map(b => b.url));
      return sendJson(res, 200, { ...status, removed: blobs.length });
    }
  } catch (e) {
    return sendJson(res, 500, { ...status, error: e.message });
  }
  sendJson(res, 200, status);
}
