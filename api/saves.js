// GET: list saved stations (newest first). DELETE {id, password}: remove one save.
// POST {action: "check", password}: verify the save password before console 1 records.
import { list, del } from '@vercel/blob';
import { PREFIX, ID_RE, checkPassword, sendJson } from './_lib.js';

async function allBlobs() {
  const out = []; let cursor;
  do { const r = await list({ prefix: PREFIX, cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const byId = {};
      for (const b of await allBlobs()) {
        const [id, file] = b.pathname.slice(PREFIX.length).split('/');
        if (!ID_RE.test(id || '')) continue;
        (byId[id] = byId[id] || { id })[file] = b.url;
      }
      const saves = await Promise.all(Object.values(byId).filter(s => s['station.glb'] && s['timeline.json'] && s['meta.json']).map(async s => {
        let meta = {};
        try { meta = await (await fetch(s['meta.json'], { cache: 'no-store' })).json(); } catch (e) {}
        return { id: s.id, name: meta.name || s.id, created: meta.created || null, summary: meta.summary || null, glb: s['station.glb'], timeline: s['timeline.json'] };
      }));
      saves.sort((a, b) => String(b.created).localeCompare(String(a.created)));
      return sendJson(res, 200, { saves });
    }
    if (req.method === 'DELETE') {
      const { id, password } = req.body || {};
      checkPassword(password);
      if (!ID_RE.test(id || '')) return sendJson(res, 400, { error: 'invalid id' });
      const { blobs } = await list({ prefix: `${PREFIX}${id}/` });
      if (blobs.length) await del(blobs.map(b => b.url));
      return sendJson(res, 200, { removed: blobs.length });
    }
    if (req.method === 'POST' && (req.body || {}).action === 'check') {
      checkPassword(req.body.password);
      return sendJson(res, 200, { ok: true });
    }
    sendJson(res, 405, { error: 'GET, POST check or DELETE' });
  } catch (e) {
    sendJson(res, /password/.test(e.message) ? 401 : 500, { error: e.message });
  }
}
