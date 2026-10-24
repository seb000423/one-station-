// Reports whether the save/load API is configured (booleans only, never the values) and which upload mode api/upload uses.
import { sendJson } from './_lib.js';

export default function handler(req, res) {
  const env = process.env, oidc = !!(env.VERCEL_OIDC_TOKEN || req.headers['x-vercel-oidc-token']);
  sendJson(res, 200, {
    blobToken: !!env.BLOB_READ_WRITE_TOKEN, blobStoreId: !!env.BLOB_STORE_ID, oidc, webhookKey: !!env.BLOB_WEBHOOK_PUBLIC_KEY, savePassword: !!env.SAVE_PASSWORD,
    // how api/upload issues upload credentials (console-save.js picks upload() or uploadPresigned() from this)
    uploadMode: env.BLOB_READ_WRITE_TOKEN ? 'token' : (oidc && env.BLOB_STORE_ID ? 'presigned' : null)
  });
}
