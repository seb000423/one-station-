// Pairing for the ONE SIMULATION VR view (js/sim-link.js): the desktop and the headset swap one WebRTC offer / answer
// through here, then talk to each other directly. Only these two small messages pass through the server.
// POST {code, kind: 'offer' | 'answer', sdp} · GET ?code=&kind= → {sdp} (404 while not there yet) · DELETE {code}.
// GET ?waiting=1 → {codes: [...]}: desktops that posted an offer in the last 10 min and have no answer yet, newest first
// (the headset at /vr connects to the newest one without typing a code).
// Each message is a new blob (vr/<code>/<kind>-<ms>.json), so a CDN-cached copy never hides a newer one.
// Old pairings (> 30 min) are removed when a new offer is posted.
import { list, del, put } from '@vercel/blob';
import { sendJson } from './_lib.js';

const CODE_RE = /^\d{6}$/, KINDS = new Set(['offer', 'answer']);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.waiting) {
      const { blobs } = await list({ prefix: 'vr/' }), by = {};
      for (const b of blobs) { const [, code, file] = b.pathname.split('/'); if (!CODE_RE.test(code || '')) continue; const e = by[code] = by[code] || { code, at: 0, answered: false };
        if (file.startsWith('answer-')) e.answered = true; else if (file.startsWith('offer-')) e.at = Math.max(e.at, new Date(b.uploadedAt).getTime()); }
      const codes = Object.values(by).filter(e => e.at && !e.answered && Date.now() - e.at < 10 * 60 * 1000).sort((a, b) => b.at - a.at).map(e => e.code);
      return sendJson(res, 200, { codes });
    }
    if (req.method === 'GET') {
      const code = String(req.query?.code || ''), kind = String(req.query?.kind || '');
      if (!CODE_RE.test(code) || !KINDS.has(kind)) return sendJson(res, 400, { error: 'invalid code or kind' });
      const { blobs } = await list({ prefix: `vr/${code}/${kind}-` });
      if (!blobs.length) return sendJson(res, 404, { error: 'not yet' });
      const b = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
      const m = await (await fetch(b.url, { cache: 'no-store' })).json();
      return sendJson(res, 200, { sdp: m.sdp });
    }
    if (req.method === 'POST') {
      const { code, kind, sdp } = req.body || {};
      if (!CODE_RE.test(code || '') || !KINDS.has(kind) || typeof sdp !== 'string' || sdp.length > 40000) return sendJson(res, 400, { error: 'invalid pairing message' });
      if (kind === 'offer') {
        const { blobs } = await list({ prefix: 'vr/' }), old = blobs.filter(b => Date.now() - new Date(b.uploadedAt).getTime() > 30 * 60 * 1000 || b.pathname.startsWith(`vr/${code}/`));
        if (old.length) await del(old.map(b => b.url));
      }
      await put(`vr/${code}/${kind}-${Date.now()}.json`, JSON.stringify({ sdp }), { access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const { code } = req.body || {};
      if (!CODE_RE.test(code || '')) return sendJson(res, 400, { error: 'invalid code' });
      const { blobs } = await list({ prefix: `vr/${code}/` });
      if (blobs.length) await del(blobs.map(b => b.url));
      return sendJson(res, 200, { removed: blobs.length });
    }
    sendJson(res, 405, { error: 'GET, POST or DELETE' });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
