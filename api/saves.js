// GET: list saved stations (newest first). DELETE {id, password}: remove one save.
// POST {action: "check", password}: verify the save password before console 1 records.
// POST {action: "edit", id, password, name, note}: change a save's name / description after saving. Written as a new
// saves/<id>/edit-<ms>.json (the newest wins, older ones are removed) so a CDN-cached meta.json never hides the change.
import { list, del, put } from '@vercel/blob';
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
        const s = byId[id] = byId[id] || { id };
        if (/^edit-\d+\.json$/.test(file || '')) { if (!s.edit || file > s.editFile) { s.edit = b.url; s.editFile = file; } } else s[file] = b.url;
      }
      const saves = await Promise.all(Object.values(byId).filter(s => s['station.glb'] && s['timeline.json'] && s['meta.json']).map(async s => {
        let meta = {};
        try { meta = await (await fetch(s['meta.json'], { cache: 'no-store' })).json(); } catch (e) {}
        if (s.edit) try { const e = await (await fetch(s.edit, { cache: 'no-store' })).json(); meta = { ...meta, name: e.name || meta.name, note: e.note ?? meta.note }; } catch (e) {}
        return { id: s.id, name: meta.name || s.id, note: meta.note || '', created: meta.created || null, kind: meta.kind || 'station', summary: meta.summary || null, glb: s['station.glb'], timeline: s['timeline.json'], factory: s['factory.json'] || null };
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
    if (req.method === 'POST' && (req.body || {}).action === 'edit') {
      const { id, password } = req.body, name = String(req.body.name || '').trim().slice(0, 60), note = String(req.body.note || '').trim().slice(0, 200);
      checkPassword(password);
      if (!ID_RE.test(id || '') || !name) return sendJson(res, 400, { error: 'invalid id or empty name' });
      const { blobs } = await list({ prefix: `${PREFIX}${id}/` });
      if (!blobs.some(b => b.pathname.endsWith('/meta.json'))) return sendJson(res, 404, { error: 'no such save' });
      await put(`${PREFIX}${id}/edit-${Date.now()}.json`, JSON.stringify({ name, note }), { access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 });
      const old = blobs.filter(b => /\/edit-\d+\.json$/.test(b.pathname)); if (old.length) await del(old.map(b => b.url));
      return sendJson(res, 200, { ok: true, name, note });
    }
    if (req.method === 'POST' && (req.body || {}).action === 'check') {
      checkPassword(req.body.password);
      return sendJson(res, 200, { ok: true });
    }
    sendJson(res, 405, { error: 'GET, POST check / edit or DELETE' });
  } catch (e) {
    sendJson(res, /password/.test(e.message) ? 401 : 500, { error: e.message });
  }
}
