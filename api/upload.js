// Lets the browser upload a console 1 save straight to Vercel Blob (the ~8 MB GLB is past the 4.5 MB
// function body limit). Two auth modes, picked by what the connected store provides:
//   - BLOB_READ_WRITE_TOKEN: client tokens (handleUpload / upload() in the browser)
//   - OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID): presigned URLs (handleUploadPresigned / uploadPresigned())
// Both require SAVE_PASSWORD and only allow saves/<id>/{station.glb,timeline.json,meta.json}.
import { handleUpload, handleUploadPresigned } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { PREFIX, FILES, ID_RE, checkPassword, sendJson } from './_lib.js';

const MAX_BYTES = 60 * 1024 * 1024;

function allowed(pathname, clientPayload) {
  const { password } = JSON.parse(clientPayload || '{}');
  checkPassword(password);
  const m = pathname.startsWith(PREFIX) && pathname.slice(PREFIX.length).split('/');
  if (!m || m.length !== 2 || !ID_RE.test(m[0]) || !FILES[m[1]]) throw new Error('invalid save path');
  return FILES[m[1]];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
  try {
    const body = req.body || {};
    const result = body.type === 'blob.generate-presigned-url'
      ? await handleUploadPresigned({
          body, request: req,
          webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused', // only needed for upload-completed callbacks, which we don't use
          getSignedToken: async (pathname, clientPayload) => {
            const contentType = allowed(pathname, clientPayload);
            const token = await issueSignedToken({ pathname, operations: ['put'], allowedContentTypes: [contentType], maximumSizeInBytes: MAX_BYTES });
            return { token, urlOptions: { allowedContentTypes: [contentType], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 } };
          }
        })
      : await handleUpload({
          body, request: req,
          onBeforeGenerateToken: async (pathname, clientPayload) => {
            const contentType = allowed(pathname, clientPayload);
            return { allowedContentTypes: [contentType], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
          }
        });
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, /password/.test(e.message) ? 401 : 400, { error: e.message });
  }
}
