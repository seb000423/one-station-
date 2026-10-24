// Issues Vercel Blob client-upload tokens for a console 1 save (the browser uploads the ~8 MB GLB
// straight to Blob, past the 4.5 MB function body limit). Requires SAVE_PASSWORD.
import { handleUpload } from '@vercel/blob/client';
import { PREFIX, FILES, ID_RE, checkPassword, sendJson } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
  try {
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { password } = JSON.parse(clientPayload || '{}');
        checkPassword(password);
        const m = pathname.startsWith(PREFIX) && pathname.slice(PREFIX.length).split('/');
        if (!m || m.length !== 2 || !ID_RE.test(m[0]) || !FILES[m[1]]) throw new Error('invalid save path');
        return { allowedContentTypes: [FILES[m[1]]], maximumSizeInBytes: 60 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
      }
    });
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, /password/.test(e.message) ? 401 : 400, { error: e.message });
  }
}
