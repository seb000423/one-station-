/** IDs (R1 §5): UUID v7 for nodes and documents, kebab-case for block type ids. */
const hex = (n: number, len: number): string => n.toString(16).padStart(len, '0');

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
}

let lastMs = -1;
let seq = 0;
/** RFC 9562 UUID version 7: 48-bit Unix ms timestamp, then random bits; monotonic within one ms. */
export function uuidv7(now: number = Date.now()): string {
  const r = randomBytes(10);
  if (now === lastMs) seq = (seq + 1) & 0xfff;
  else { lastMs = now; seq = ((r[0]! << 8) | r[1]!) & 0x7ff; }
  const ts = hex(now, 12);
  const randA = 0x7000 | seq; // version 7 + 12-bit counter
  const varB = 0x8000 | ((r[2]! << 8) | r[3]!) & 0x3fff; // variant 10
  const tail = Array.from(r.slice(4, 10), x => hex(x, 2)).join('');
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-${hex(randA, 4)}-${hex(varB, 4)}-${tail}`;
}

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isUuidV7 = (s: string): boolean => UUID_V7.test(s);
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isKebab = (s: string): boolean => KEBAB.test(s);
/** Timestamp (ms) encoded in a UUID v7. */
export const uuidv7Time = (id: string): number => parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
