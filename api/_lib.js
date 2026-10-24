// Shared helpers for the save/load API (Vercel Blob store connected to this project).
import { timingSafeEqual } from 'node:crypto';

export const PREFIX = 'saves/';
// one folder per save: saves/<id>/{station.glb, timeline.json, meta.json}
export const FILES = { 'station.glb': 'model/gltf-binary', 'timeline.json': 'application/json', 'meta.json': 'application/json' };
export const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

// Upload and delete need SAVE_PASSWORD (Vercel → Settings → Environment Variables).
export function checkPassword(given) {
  const want = process.env.SAVE_PASSWORD;
  if (!want) throw new Error('SAVE_PASSWORD is not configured on the server');
  const a = Buffer.from(String(given ?? '')), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('wrong password');
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
