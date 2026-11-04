/**
 * 설계 구조 규칙 (design structure rules) v1. The class table is the platform catalogue in packages/schema/src/structure.ts
 * (general industrial practice + the pairs verified in the four reference stations 조립 · 도포 · 브레이징 · 검사).
 *
 * Every object of a machine gets a ROLE (how it is held: on the floor, on top of something, on the side of something,
 * a robot, an operator seat). Objects that can carry others have a HOST capability (top surface, side faces). From roles
 * and positions the algorithm finds each object's host and builds a join tree (parent = host): what sits on or hangs on a
 * thing moves and grows with it. The checks R1–R10 then say what a real build would not allow.
 *
 * Geometry is stored mm, Z-up: a part = bottom-centre position + size [X, Y, Z] + yaw (deg, about Z).
 * A reference (the same machine as first built, e.g. the partner station v1) makes the checks relative: an offset or an
 * overlap that is already in the reference model is how the real equipment is built, only a change away from it is reported.
 */

import { STRUCTURE_CATALOG, MOUNT_LABEL, ROLE_LABEL, SLOT_LABEL, GROUP_LABEL, type Role, type SlotKind, type HostCap, type MountKind, type ClassDef } from '@one-twin/schema';
export { STRUCTURE_CATALOG, MOUNT_LABEL, ROLE_LABEL, SLOT_LABEL, GROUP_LABEL, type Role, type SlotKind, type HostCap, type MountKind, type ClassDef };
export interface Part { id: string; name: string; kind?: string; size: [number, number, number]; pos: [number, number, number]; yaw?: number; role?: Role; cls?: string; reach?: number }
export interface Mount { host: string | null; rel: 'floor' | 'top' | 'side' | 'in'; dz: number; gap: number; off?: [number, number, number] }
export interface StructureIssue { rule: string; lv: 'err' | 'warn'; ids: string[]; at: [number, number, number]; txt: string; fix?: { label: string; moves: { id: string; by: [number, number, number] }[] } }

/** Object classes (the platform catalogue, packages/schema/src/structure.ts): label keywords → class, role, what it can carry, how it is joined. */
export const CLASSES: ClassDef[] = STRUCTURE_CATALOG.classes;
const NOHOST: HostCap = { top: false, side: false };
const byCls = new Map(CLASSES.map(c => [c.cls, c]));
/** Which slots an object of this class can take, best first. */
export const needsOf = (cls?: string, role?: Role): SlotKind[] => (cls && byCls.get(cls)?.needs) || STRUCTURE_CATALOG.needsByRole[role || (cls && byCls.get(cls)?.role) || 'floor'];
/** How a part of this class is joined in a slot (앵커 · 레벨링 풋 · 볼트 · 브래킷 · DIN 레일 …). */
export const mountOf = (cls: string | undefined, slot: SlotKind): MountKind => (cls && byCls.get(cls)?.mount?.[slot]) || STRUCTURE_CATALOG.mountBySlot[slot];
/** Verified part>host pairs per slot: the reference stations plus standard practice; a pair outside is allowed with a warning. */
export const SEEN_PAIRS: Record<SlotKind, string[]> = STRUCTURE_CATALOG.verified;
/** Can a thing of this class carry things on top / on its sides? */
export const hostCap = (cls?: string): HostCap => (cls && byCls.get(cls)?.host) || NOHOST;
const isSolid = (cls?: string) => !!(cls && byCls.get(cls)?.solid);

/** Role of a classed object at height z: a mounted class standing on the floor is a floor object; a shelf / desk / rail / frame up on something is carried. */
function roleFor(c: ClassDef, z: number): Role {
  if (c.role !== 'floor' && c.role !== 'robot' && c.role !== 'seat' && z < 50) return 'floor';
  if (c.role === 'floor' && z >= 50 && (c.cls === 'shelf' || c.cls === 'desk' || c.cls === 'rail' || c.cls === 'frame')) return 'top';
  return c.role;
}
/**
 * Class and role of an object from its name and kind — the fallback for imported parts without a stored class. A block or
 * part that carries its class (params.cls, the palette block's cls) never goes through the name: see withRoles.
 */
export function classify(name: string, kind?: string, z = 0): { cls: string; role: Role } {
  if (kind === 'robot') return { cls: 'robot', role: 'robot' };
  if (kind === 'rotary') return { cls: 'rotary', role: 'floor' };
  const n = ` ${name.toLowerCase()} `;
  // the most specific keyword wins ('진공로 부대설비' is a utility, '회전 테이블' a rotary table, not a desk)
  let c: ClassDef | undefined, best = 0; for (const k of CLASSES) for (const w of k.words) if (w.length > best && n.includes(w.toLowerCase())) { best = w.length; c = k; }
  if (!c) return { cls: 'part', role: z < 50 ? 'floor' : 'top' };
  return { cls: c.cls, role: roleFor(c, z) };
}

// ---------------------------------------------------------------------------------------------------------- geometry
const half = (p: Part): [number, number] => { const r = ((p.yaw || 0) * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)); return [(p.size[0] * c + p.size[1] * s) / 2, (p.size[0] * s + p.size[1] * c) / 2]; };
const topOf = (p: Part) => p.pos[2] + p.size[2];
/** Signed horizontal gaps between two footprints (negative = overlap depth) along X and Y. */
function gaps(a: Part, b: Part): [number, number] { const ea = half(a), eb = half(b); return [Math.abs(a.pos[0] - b.pos[0]) - ea[0] - eb[0], Math.abs(a.pos[1] - b.pos[1]) - ea[1] - eb[1]]; }
const zOverlap = (a: Part, b: Part) => Math.min(topOf(a), topOf(b)) - Math.max(a.pos[2], b.pos[2]);
/** Volume overlap depth: the smallest of the three overlaps, ≤ 0 when apart. */
const interfere = (a: Part, b: Part) => { const [gx, gy] = gaps(a, b); return Math.min(-gx, -gy, zOverlap(a, b)); };
const inside = (x: number, y: number, h: Part, m = 0) => { const e = half(h); return Math.abs(x - h.pos[0]) <= e[0] + m && Math.abs(y - h.pos[1]) <= e[1] + m; };
/** Share of a's footprint that lies within b's (axis-aligned by their yaws' extents). */
const within = (a: Part, b: Part) => { const ea = half(a), eb = half(b), ox = Math.max(0, Math.min(a.pos[0] + ea[0], b.pos[0] + eb[0]) - Math.max(a.pos[0] - ea[0], b.pos[0] - eb[0])), oy = Math.max(0, Math.min(a.pos[1] + ea[1], b.pos[1] + eb[1]) - Math.max(a.pos[1] - ea[1], b.pos[1] - eb[1])); return (ox * oy) / (4 * ea[0] * ea[1]); };
const hDist = (a: Part, b: Part) => { const [gx, gy] = gaps(a, b); return Math.hypot(Math.max(0, gx), Math.max(0, gy)); };
const vol = (p: Part) => p.size[0] * p.size[1] * p.size[2];

/** Fill in class and role (unless given). A stored class is kept as it is (a '로봇 단상' block classed frame stays a frame); only an unclassed part is classified by its name. */
export function withRoles(parts: Part[]): Part[] {
  return parts.map(p => { if (p.role && p.cls) return p; const c = p.cls ? byCls.get(p.cls) : undefined;
    if (c) return Object.assign({}, p, { role: p.role || roleFor(c, p.pos[2]) });
    return Object.assign({}, p, classify(p.name, p.kind, p.pos[2]), p.role ? { role: p.role } : {}); });
}

/**
 * Host finding. A 'top' object sits on the highest top-host whose top is at or just under its bottom and whose footprint
 * holds its centre; a 'side' object hangs on the nearest side-host face it touches (≤ 300 mm) at its height; a robot sits
 * on a top host when it is lifted, else on the floor; floor objects and seats have no host. Hosts never form a loop.
 */
export function findMounts(parts0: Part[]): Map<string, Mount> {
  const parts = withRoles(parts0), out = new Map<string, Mount>();
  const hollow = (p: Part) => parts.filter(h => h !== p && hostCap(h.cls).inside && vol(h) > vol(p) * 2 && within(p, h) >= 0.7 && p.pos[2] >= h.pos[2] - 50 && p.pos[2] < topOf(h)).sort((a, b) => vol(a) - vol(b))[0] || null;
  for (const p of parts) {
    const z = p.pos[2]; let best = null as Part | null, bestScore = Infinity, rel = 'floor' as Mount['rel'];
    const onTop = () => { for (const h of parts) { if (h === p || !hostCap(h.cls).top || vol(h) < vol(p) * 0.2) continue; const t = topOf(h), dz = z - t;
      if (dz < -150 || dz > 400 || !inside(p.pos[0], p.pos[1], h)) continue; const sc = Math.abs(dz) + (h.cls === 'base' ? 200 : 0); if (sc < bestScore) { best = h; bestScore = sc; rel = 'top'; } } };
    const onSide = (max: number) => { for (const h of parts) { if (h === p || !hostCap(h.cls).side) continue; if (zOverlap(p, h) <= 0) continue; const [gx, gy] = gaps(p, h), g = Math.max(gx, gy);
      if (g > max || g < -Math.min(...p.size.slice(0, 2))) continue; const sc = Math.abs(g) + (h.cls === 'base' ? 300 : 0); if (sc < bestScore) { best = h; bestScore = sc; rel = 'side'; } } };
    const inHollow = () => { const h = hollow(p); if (h) { best = h; rel = 'in'; } };
    if (p.role === 'top') { onTop(); if (!best) inHollow(); if (!best) onSide(10); }
    else if (p.role === 'robot') { if (z >= 50) onTop(); if (!best) inHollow(); }
    else if (p.role === 'side') { onSide(300); if (!best) inHollow(); if (!best && z < 50) onTop(); }
    else if (p.role === 'floor' && p.cls !== 'base') inHollow();
    if (best && rel === 'in') { out.set(p.id, { host: best.id, rel, dz: 0, gap: 0, off: [p.pos[0] - best.pos[0], p.pos[1] - best.pos[1], z - best.pos[2]] }); continue; }
    out.set(p.id, best ? { host: best.id, rel, dz: rel === 'top' ? Math.round(z - topOf(best)) : 0, gap: rel === 'side' ? Math.round(Math.max(...gaps(p, best))) : 0 } : { host: null, rel: 'floor', dz: Math.round(z), gap: 0 });
  }
  // no loops: walk up, cut a host that leads back to the part
  for (const [id] of out) { const seen = new Set([id]); let cur = out.get(id)!.host; while (cur) { if (seen.has(cur)) { out.set(id, { host: null, rel: 'floor', dz: 0, gap: 0 }); break; } seen.add(cur); cur = out.get(cur)?.host ?? null; } }
  return out;
}

/** Robot reach (mm): its own value, else ¾ of its height (the partner robots: 1.7 – 2.4 m). */
export const reachOf = (p: Part) => p.reach ?? Math.round(p.size[2] * 0.75);
const TARGET = new Set(['jig', 'rotary', 'tray', 'rail', 'work']);
const PAIR: Record<string, string[]> = { utility: ['furnace', 'robot'], seat: ['desk'] };

/**
 * The checks. `ref` = the same objects as first built (by id): offsets, overlaps and distances already in it are accepted.
 * `area` = the work cell [X, Y] centred on the origin when it is fixed. Mounts come from the reference when given.
 */
export function checkStructure(parts0: Part[], opt: { ref?: Part[] | null; area?: [number, number] | null; mounts?: Map<string, Mount> } = {}): StructureIssue[] {
  const parts = withRoles(parts0), P = new Map(parts.map(p => [p.id, p])), ref = opt.ref ? withRoles(opt.ref) : null, R = new Map((ref || []).map(p => [p.id, p]));
  /* mounts: the reference's (its offsets are how the equipment was built) while a part still sits on the same host the same way;
     a part re-seated by the user (another host, or top → side) is judged by where it is now */
  const Mcur = findMounts(parts), M = opt.mounts || (() => { if (!ref || !ref.length) return Mcur; const Mref = findMounts(ref.filter(r => P.has(r.id)).concat(parts.filter(p => !R.has(p.id)))), out = new Map<string, Mount>();
    for (const p of parts) { const a = Mref.get(p.id), b = Mcur.get(p.id)!; out.set(p.id, a && a.host === b.host && a.rel === b.rel ? a : b); } return out; })();
  const out: StructureIssue[] = [], nm = (p: Part) => p.name, mid = (a: Part, b?: Part): [number, number, number] => b ? [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2, Math.max(topOf(a), topOf(b))] : [a.pos[0], a.pos[1], topOf(a)];
  const tol = 10;
  for (const p of parts) {
    const m = M.get(p.id), h = m?.host ? P.get(m.host) : null, r = R.get(p.id);
    // R1 받침: held by the floor, a host top or a host side, at the offset of the reference
    if (!m || !m.host || !h) {
      if (p.role === 'floor' || p.role === 'seat' || p.role === 'robot') { const want = r && R.get(p.id) && !M.get(p.id)?.host ? Math.max(0, r.pos[2]) : 0;
        if (Math.abs(p.pos[2] - want) > 20) out.push({ rule: 'R1', lv: 'err', ids: [p.id], at: mid(p), txt: `${nm(p)}이(가) 바닥에서 ${Math.round(p.pos[2] - want)} mm ${p.pos[2] > want ? '떠 있습니다' : '박혀 있습니다'}`, fix: { label: '바닥에 놓기', moves: [{ id: p.id, by: [0, 0, want - p.pos[2]] }] } }); }
      else out.push({ rule: 'R1', lv: 'err', ids: [p.id], at: mid(p), txt: `${nm(p)}(${ROLE_LABEL[p.role!]})을(를) 받치는 것이 없습니다 · ${p.role === 'side' ? '프레임·선반·베이스 옆면' : '프레임·선반·작업대·지그 윗면'}에 붙이세요` });
      continue;
    }
    if (m.rel === 'top') { const dz = p.pos[2] - topOf(h);
      if (Math.abs(dz - m.dz) > tol) out.push({ rule: 'R1', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(p)}이(가) ${nm(h)} 위에서 ${Math.round(Math.abs(dz - m.dz))} mm ${dz > m.dz ? '떠 있습니다' : '박혀 있습니다'}`, fix: { label: `${nm(h)} 위에 다시 얹기`, moves: [{ id: p.id, by: [0, 0, m.dz - dz] }] } });
      // R2 올리기: the host must carry on top, the part's centre over the host
      if (!hostCap(h.cls).top) out.push({ rule: 'R2', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(h)}에는 위에 올릴 수 없습니다 (${byCls.get(h.cls || '')?.label || h.cls})` });
      else if (!inside(p.pos[0], p.pos[1], h)) { const e = half(h), bx = Math.max(-e[0], Math.min(e[0], p.pos[0] - h.pos[0])) + h.pos[0], by = Math.max(-e[1], Math.min(e[1], p.pos[1] - h.pos[1])) + h.pos[1];
        out.push({ rule: 'R2', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(p)}의 중심이 ${nm(h)} 윗면 밖에 있습니다 · 넘어집니다`, fix: { label: '윗면 안으로', moves: [{ id: p.id, by: [Math.round(bx - p.pos[0]), Math.round(by - p.pos[1]), 0] }] } }); }
    } else if (m.rel === 'in') { // carried inside a hollow host (a jig in the cell base): it may slide inside, not rise, sink or leave it
      const o = m.off!, dz = h.pos[2] + o[2] - p.pos[2];
      if (Math.abs(dz) > tol) out.push({ rule: 'R1', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(p)}이(가) ${nm(h)} 안의 받침 높이에서 ${Math.round(Math.abs(dz))} mm ${dz < 0 ? '떠 있습니다' : '박혀 있습니다'}`, fix: { label: '받침 높이로', moves: [{ id: p.id, by: [0, 0, Math.round(dz)] }] } });
      if (!inside(p.pos[0], p.pos[1], h)) out.push({ rule: 'R3', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(p)}이(가) ${nm(h)} 밖으로 나갔습니다 · 받침이 없습니다`, fix: { label: '제자리로', moves: [{ id: p.id, by: [Math.round(h.pos[0] + o[0] - p.pos[0]), Math.round(h.pos[1] + o[1] - p.pos[1]), Math.round(dz)] }] } });
    } else if (m.rel === 'side') { const g = Math.max(...gaps(p, h));
      if (g - m.gap > tol) out.push({ rule: 'R3', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(p)}이(가) ${nm(h)} 옆면에서 ${Math.round(g - m.gap)} mm 떨어졌습니다 · 결합이 풀렸습니다` });
      if (zOverlap(p, h) <= 0) out.push({ rule: 'R3', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(p)}이(가) ${nm(h)} 높이 밖에 붙어 있습니다` });
      if (!hostCap(h.cls).side) out.push({ rule: 'R3', lv: 'err', ids: [p.id, h.id], at: mid(p), txt: `${nm(h)}에는 옆에 붙일 수 없습니다` });
    }
  }
  // R4 겹침: bodies do not run into each other (host ↔ carried pair and reference overlaps excepted)
  const joined = (a: Part, b: Part) => M.get(a.id)?.host === b.id || M.get(b.id)?.host === a.id;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) { const a = parts[i]!, b = parts[j]!; if (joined(a, b)) continue;
    const d = interfere(a, b); if (d <= 20) continue; const ra = R.get(a.id), rb = R.get(b.id); if (ra && rb && interfere(ra, rb) > 20) continue;
    if (a.cls === 'base' || b.cls === 'base') continue; // the cell base is a hollow frame around the cell
    out.push({ rule: 'R4', lv: 'err', ids: [a.id, b.id], at: mid(a, b), txt: `${nm(a)} · ${nm(b)}이(가) ${Math.round(d)} mm 겹칩니다` }); }
  // R5 로봇 반경: what the robot served in the reference (jigs, index tables, trays, rails in reach) stays in reach
  for (const rb of parts.filter(p => p.role === 'robot')) { const reach = reachOf(rb), rr = R.get(rb.id);
    const targets = parts.filter(t => TARGET.has(t.cls || '') && (rr && R.get(t.id) ? hDist(rr, R.get(t.id)!) <= reachOf(rr) : !ref && hDist(rb, t) <= reach * 1.5));
    for (const t of targets) { const d = hDist(rb, t); if (d > reach) out.push({ rule: 'R5', lv: 'warn', ids: [rb.id, t.id], at: mid(rb, t), txt: `${nm(t)}이(가) ${nm(rb)} 도달 거리 ${reach} mm 밖입니다 (${Math.round(d)} mm)` }); } }
  // R6 작업자 자리: a seat stays at its desk (≤ 1200 mm from the desk edge, not under its top)
  // R7 짝 설비: utilities stay next to what they serve (≤ 1000 mm more than in the reference, else ≤ 3000 mm)
  for (const p of parts) { const want = p.cls === 'seat' ? ['desk'] : PAIR[p.cls || ''] || []; if (!want.length) continue; const rp = R.get(p.id);
    const near = (q: Part, set: Part[]) => set.filter(x => x !== q && want.includes(x.cls || '')).sort((x, y) => hDist(q, x) - hDist(q, y))[0];
    const mate = rp ? (() => { const rm = near(rp, ref!); return rm && P.get(rm.id); })() : near(p, parts); if (!mate) continue;
    const d = hDist(p, mate), lim = p.cls === 'seat' ? 1200 : (rp ? hDist(rp, R.get(mate.id) || mate) + 1000 : 3000);
    if (d > lim) out.push({ rule: p.cls === 'seat' ? 'R6' : 'R7', lv: 'warn', ids: [p.id, mate.id], at: mid(p, mate), txt: p.cls === 'seat' ? `${nm(p)}이(가) ${nm(mate)}에서 ${Math.round(d)} mm 떨어졌습니다 (작업자 손 닿는 거리 1200 mm)` : `${nm(p)}이(가) ${nm(mate)}에서 ${Math.round(d)} mm 떨어졌습니다 · 배관·케이블 길이를 넘습니다 (${Math.round(lim)} mm)` }); }
  // R8 통로·보수 공간: floor equipment that had ≥ 600 mm between it in the reference keeps 600 mm
  const big = parts.filter(p => p.role === 'floor' && p.cls !== 'base' && p.size[2] >= 1000 && p.size[0] * p.size[1] >= 1e6);
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) { const a = big[i]!, b = big[j]!, ra = R.get(a.id), rb = R.get(b.id); if (!ra || !rb) continue;
    const g0 = Math.max(...gaps(ra, rb)), g = Math.max(...gaps(a, b)); if (g0 >= 600 && g < 600 && g > -20) out.push({ rule: 'R8', lv: 'warn', ids: [a.id, b.id], at: mid(a, b), txt: `${nm(a)} · ${nm(b)} 사이 ${Math.round(Math.max(0, g))} mm · 통로·보수 공간 600 mm가 안 됩니다` }); }
  // R9 경광등: nothing above a tower lamp (it must be seen from the aisle)
  for (const l of parts.filter(p => p.cls === 'lamp')) { const o = parts.find(q => q !== l && q.cls !== 'base' && q.pos[2] >= topOf(l) - 5 && inside(l.pos[0], l.pos[1], q)); if (o) out.push({ rule: 'R9', lv: 'warn', ids: [l.id, o.id], at: mid(l), txt: `${nm(l)} 위를 ${nm(o)}이(가) 가립니다` }); }
  // R10 작업 칸: everything inside the fixed work cell
  if (opt.area) { const [W, D] = opt.area; for (const p of parts) { const e = half(p), ox = Math.abs(p.pos[0]) + e[0] - W / 2, oy = Math.abs(p.pos[1]) + e[1] - D / 2; if (ox > 5 || oy > 5) out.push({ rule: 'R10', lv: 'warn', ids: [p.id], at: mid(p), txt: `${nm(p)}이(가) 작업 칸 밖으로 ${Math.round(Math.max(ox, oy))} mm 나갑니다` }); } }
  return out;
}

/** The rules, for the help popover and the doc. */
export const STRUCTURE_RULES: { id: string; name: string; txt: string }[] = [
  { id: 'R1', name: '받침', txt: '모든 객체는 바닥 · 받침 윗면 · 받침 옆면 중 하나에 실려 있다. 떠 있거나 박히지 않는다.' },
  { id: 'R2', name: '올리기', txt: '윗면을 내주는 객체(베이스·프레임·선반·작업대·레일·지그·트레이)에만 올린다. 무게중심은 윗면 안.' },
  { id: 'R3', name: '결합', txt: '얹히거나 붙은 객체는 받침에 결합된다: 받침과 같이 움직이고, 받침 높이가 바뀌면 같이 오르내린다.' },
  { id: 'R4', name: '겹침 금지', txt: '결합된 짝이 아닌 두 객체는 서로 파고들지 않는다.' },
  { id: 'R5', name: '로봇 반경', txt: '로봇이 다루는 지그·회전 테이블·트레이·레일은 도달 거리 안에 있다.' },
  { id: 'R6', name: '작업자 자리', txt: '의자는 자기 작업대에서 1200 mm 안.' },
  { id: 'R7', name: '짝 설비', txt: '부대 설비(진공로 부대설비·용접 전원·에어 필터)는 섬기는 장비 곁에 둔다.' },
  { id: 'R8', name: '통로 · 보수 공간', txt: '바닥 장비 사이 600 mm 이상.' },
  { id: 'R9', name: '경광등 시야', txt: '경광등 위를 가리지 않는다.' },
  { id: 'R10', name: '작업 칸', txt: '작업 칸을 고정하면 모든 객체가 그 안에 든다.' },
];

// ------------------------------------------------------------------------------------------------------- placement
/** Where the user dropped a part: the pointer hit in stored mm, the kind of surface under it and the object it belongs to. */
export interface Drop { at: [number, number, number]; face: SlotKind; host?: string | null }
export interface Placement { ok: boolean; pos: [number, number, number]; yaw: number; host: string | null; rel: Mount['rel']; how?: MountKind; why?: string; lv?: 'err' | 'warn' }

const clsLabel = (c?: string) => (c && byCls.get(c)?.label) || c || '객체';
/** The side face of `h` nearest to point (x, y): its outward unit normal (world) and the distance from the face. */
function nearestFace(h: Part, x: number, y: number): { n: [number, number]; d: number; along: number } {
  const r = ((h.yaw || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), dx = x - h.pos[0], dy = y - h.pos[1];
  const lx = dx * c + dy * s, ly = -dx * s + dy * c, ex = h.size[0] / 2, ey = h.size[1] / 2;
  const faces: { n: [number, number]; d: number; along: number }[] = [
    { n: [c, s], d: lx - ex, along: ly }, { n: [-c, -s], d: -lx - ex, along: ly }, { n: [-s, c], d: ly - ey, along: lx }, { n: [s, -c], d: -ly - ey, along: lx }];
  return faces.sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0]!;
}

/**
 * Put `part` where the user dropped it, by the slot rules: the part's class says which slots it can take (needsOf), the
 * host's class which it offers (hostCap). The result is snapped to the slot (on the top plane, against the side face,
 * inside the host at the pointer height, in front of a desk, on the floor) and refused with a reason when the slot is
 * wrong, the part does not fit in it, or it would run into another object. A pair never seen in the reference stations
 * is allowed with a warning.
 */
export function placePart(parts0: Part[], part0: Part, drop: Drop): Placement {
  const parts = withRoles(parts0.filter(p => p.id !== part0.id)), part = withRoles([part0])[0]!, P = new Map(parts.map(p => [p.id, p]));
  const needs = needsOf(part.cls, (part.cls && byCls.get(part.cls)?.role) || part.role), host = drop.host ? P.get(drop.host) || null : null, cap = hostCap(host?.cls);
  const no = (why: string, pos: [number, number, number] = [drop.at[0], drop.at[1], 0]): Placement => ({ ok: false, pos, yaw: part.yaw || 0, host: null, rel: 'floor', why, lv: 'err' });
  let face: SlotKind = drop.face; if (face === 'floor' || !host) face = 'floor';
  // a desk's top under the pointer with a seat in hand: the seat goes in front of the desk
  if (face !== 'floor' && needs.includes('front') && cap.front) face = 'front';
  if (!needs.includes(face)) {
    const want = needs.map(k => SLOT_LABEL[k]).join('·');
    return no(face === 'floor' ? `${clsLabel(part.cls)}은(는) 바닥에 놓을 수 없습니다 · ${want}에 놓으세요` : `${clsLabel(part.cls)}은(는) ${clsLabel(host?.cls)} ${face === 'top' ? '윗면' : face === 'side' ? '옆면' : '안'}에 둘 수 없습니다 · ${want}에 놓으세요`);
  }
  let pos: [number, number, number] = [drop.at[0], drop.at[1], 0], yaw = part.yaw || 0, rel: Mount['rel'] = 'floor';
  if (face === 'floor') { pos = [drop.at[0], drop.at[1], 0]; }
  else if (face === 'inside' && part.role === 'floor' && host && hostCap(host.cls).inside) { pos = [drop.at[0], drop.at[1], 0]; rel = 'in'; }
  else if (!host) return no('받침이 없습니다');
  else if (face === 'top') { if (!cap.top) return no(`${clsLabel(host.cls)} 위에는 올릴 수 없습니다`);
    const e = half(host), hx = Math.max(-e[0], Math.min(e[0], drop.at[0] - host.pos[0])), hy = Math.max(-e[1], Math.min(e[1], drop.at[1] - host.pos[1]));
    const stack = host.cls === part.cls && cap.stack ? host.pos[2] + cap.stack : topOf(host);
    pos = [host.pos[0] + hx, host.pos[1] + hy, stack]; rel = 'top'; if (host.cls === part.cls && cap.stack) { pos[0] = host.pos[0]; pos[1] = host.pos[1]; yaw = host.yaw || 0; } }
  else if (face === 'side') { if (!cap.side) return no(`${clsLabel(host.cls)} 옆에는 붙일 수 없습니다`);
    const f = nearestFace(host, drop.at[0], drop.at[1]), hy = (host.yaw || 0) * Math.PI / 180, r = ((part.yaw || 0) - (host.yaw || 0)) * Math.PI / 180;
    const depth = Math.abs(f.n[0] * Math.cos(hy) + f.n[1] * Math.sin(hy)) > 0.5 ? (Math.abs(Math.cos(r)) * part.size[0] + Math.abs(Math.sin(r)) * part.size[1]) / 2 : (Math.abs(Math.sin(r)) * part.size[0] + Math.abs(Math.cos(r)) * part.size[1]) / 2;
    // on the face at the pointer, pushed out so the part touches it; at the pointer height, kept within the host's height
    const fx = drop.at[0] - f.n[0] * f.d, fy = drop.at[1] - f.n[1] * f.d, z = Math.max(host.pos[2], Math.min(topOf(host) - part.size[2] / 2, drop.at[2] - part.size[2] / 2));
    pos = [fx + f.n[0] * depth, fy + f.n[1] * depth, z]; rel = 'side'; }
  else if (face === 'inside') { if (!cap.inside) return no(`${clsLabel(host.cls)} 안에는 둘 수 없습니다`);
    const e = half(host), hx = Math.max(-e[0], Math.min(e[0], drop.at[0] - host.pos[0])), hy = Math.max(-e[1], Math.min(e[1], drop.at[1] - host.pos[1]));
    pos = [host.pos[0] + hx, host.pos[1] + hy, Math.max(host.pos[2], Math.min(topOf(host) - part.size[2], drop.at[2]))]; rel = 'in'; }
  else if (face === 'front') { // a seat at a desk: against the long face under the pointer, tucked 100 mm under the top
    const f = nearestFace(host, drop.at[0], drop.at[1]), depth = Math.max(part.size[0], part.size[1]) / 2 - 100;
    const fx = drop.at[0] - f.n[0] * f.d, fy = drop.at[1] - f.n[1] * f.d; pos = [fx + f.n[0] * depth, fy + f.n[1] * depth, 0]; yaw = host.yaw || 0; rel = 'floor'; }
  pos = pos.map(v => Math.round(v)) as [number, number, number];
  let placed: Part = Object.assign({}, part, { pos, yaw }), hostId: string | null = face === 'floor' || face === 'front' ? null : host!.id;
  // a floor object set down inside a hollow frame, shelf or cell base (a turntable in its frame) is carried by it
  if (face === 'floor' && part.cls !== 'base') { const h = parts.filter(o => hostCap(o.cls).inside && o !== host && vol(o) > vol(placed) * 2 && within(placed, o) >= 0.7).sort((a, b) => vol(a) - vol(b))[0];
    if (h) { hostId = h.id; rel = 'in'; } }
  /* real objects are not boxes (a chair tucks under a desk, a shelf stands in its frame), so an overlap of two outlines is a
     warning, except two solid floor machines (furnaces, utilities, desks) driven into each other */
  let warn: string | null = null;
  for (const o of parts) { if (o.id === hostId || o === host || o.cls === 'base' || placed.cls === 'base') continue; const d = interfere(placed, o); if (d <= 20) continue;
    if (isSolid(placed.cls) && isSolid(o.cls)) return { ok: false, pos, yaw, host: hostId, rel, why: `${o.name}와(과) ${Math.round(d)} mm 겹칩니다`, lv: 'err' };
    warn = warn || `${o.name}와(과) 외곽이 ${Math.round(d)} mm 겹칩니다 · 실제 형상을 확인하세요`; }
  if (face === 'floor' && part.role === 'seat') { const desk = parts.filter(o => o.cls === 'desk').sort((a, b) => hDist(placed, a) - hDist(placed, b))[0];
    if (!desk || hDist(placed, desk) > 1200) warn = '작업대에서 1200 mm 안에 두세요'; }
  const pair = host ? `${part.cls}>${host.cls}` : '*', seen = !host || SEEN_PAIRS[face].includes(pair) || SEEN_PAIRS[face].includes('*');
  if (!seen) warn = warn || `${clsLabel(part.cls)}을(를) ${clsLabel(host?.cls)}에 두는 조합은 기준 설비에 없습니다 · 확인하세요`;
  const how = mountOf(part.cls, rel === 'in' ? 'inside' : face === 'front' ? 'front' : face);
  return { ok: true, pos, yaw, host: hostId, rel, how, ...(warn ? { why: warn, lv: 'warn' as const } : {}) };
}

// ------------------------------------------------------------------------------------------------ pull to a valid slot
/** placePart, and when the drop is refused, the nearest slot within `radius` (mm) that takes the part: the pointer need not hit the exact face. On the floor, the part snaps flush / aligned with a neighbour within `edge` mm. */
export function snapPlace(parts0: Part[], part0: Part, drop: Drop, opt: { radius?: number; edge?: number } = {}): Placement & { snapped?: boolean; snapWhy?: string } {
  const radius = opt.radius ?? 600, edge = opt.edge ?? 150, first = placePart(parts0, part0, drop);
  const parts = withRoles(parts0.filter(p => p.id !== part0.id)), part = withRoles([part0])[0]!, needs = needsOf(part.cls, (part.cls && byCls.get(part.cls)?.role) || part.role);
  const onFloor = first.ok && first.rel === 'floor' && !first.host && drop.face === 'floor';
  // a part set on the floor whose place is really on a host (a lamp, a jig, a tray, a robot on its pedestal) goes onto a host within reach
  const flush = (): ReturnType<typeof snapPlace> => { if (!onFloor) return first; const e = edgeSnap(parts, Object.assign({}, part, { pos: first.pos, yaw: first.yaw }), edge); if (!e) return first; const r = placePart(parts0, part0, { at: [e.pos[0], e.pos[1], 0], face: 'floor' }); return r.ok ? { ...r, snapped: true, snapWhy: e.why } : first; };
  if (first.ok && !(onFloor && needs[0] !== 'floor')) return flush();
  let best: (Placement & { d: number; snapWhy: string }) | null = null;
  const consider = (d: Drop, why: string) => { const r = placePart(parts0, part0, d); if (!r.ok) return; const dist = Math.hypot(r.pos[0] - drop.at[0], r.pos[1] - drop.at[1]); if (dist <= radius && (!best || dist < best.d)) best = { ...r, d: dist, snapWhy: why }; };
  const pe = half(part);
  for (const h of parts) { const cap = hostCap(h.cls), e = half(h), mx = Math.max(0, e[0] - pe[0]), my = Math.max(0, e[1] - pe[1]), cx = Math.max(-mx, Math.min(mx, drop.at[0] - h.pos[0])) + h.pos[0], cy = Math.max(-my, Math.min(my, drop.at[1] - h.pos[1])) + h.pos[1];
    if (hDist(h, { ...part, pos: [drop.at[0], drop.at[1], 0] }) > radius) continue;
    if (needs.includes('top') && cap.top) consider({ at: [cx, cy, topOf(h)], face: 'top', host: h.id }, `${h.name} 윗면으로 끌어당김`);
    if (needs.includes('side') && cap.side) { const f = nearestFace(h, drop.at[0], drop.at[1]); consider({ at: [drop.at[0] - f.n[0] * f.d, drop.at[1] - f.n[1] * f.d, Math.min(topOf(h), Math.max(h.pos[2] + part.size[2] / 2, drop.at[2]))], face: 'side', host: h.id }, `${h.name} 옆면으로 끌어당김`); }
    if (needs.includes('inside') && cap.inside && drop.face === 'inside') consider({ at: [cx, cy, Math.max(h.pos[2], Math.min(topOf(h) - part.size[2], drop.at[2]))], face: 'inside', host: h.id }, `${h.name} 안으로 끌어당김`);
    if (needs.includes('front') && cap.front) consider({ at: [cx, cy, 0], face: 'front', host: h.id }, `${h.name} 앞으로 끌어당김`); }
  if (!first.ok && needs.includes('floor') && drop.face !== 'floor') consider({ at: [drop.at[0], drop.at[1], 0], face: 'floor' }, '바닥으로 내림');
  if (!best) return flush();
  const b = best as Placement & { d: number; snapWhy: string }; return { ok: b.ok, pos: b.pos, yaw: b.yaw, host: b.host, rel: b.rel, how: b.how, ...(b.why ? { why: b.why, lv: b.lv } : {}), snapped: true, snapWhy: b.snapWhy };
}
/** Flush / aligned with the nearest floor neighbour (axis-aligned, both unrotated or rotated by multiples of 90°): a gap under `edge` closes, an edge within `edge` of the neighbour's lines up. */
export function edgeSnap(parts: Part[], p: Part, edge = 150): { pos: [number, number, number]; why: string } | null {
  const ok = (q: Part) => Math.abs(((q.yaw || 0) % 90 + 90) % 90) < 1e-6; if (!ok(p)) return null;
  const ep = half(p), pp = [p.pos[0], p.pos[1]]; let pos = [p.pos[0], p.pos[1]], why = '', bestD = Infinity;
  for (const q of parts) { if (!ok(q) || q.role === 'top' || q.role === 'side' || q.cls === 'base') continue; const eq = half(q), qp = [q.pos[0], q.pos[1]], [gx, gy] = gaps(p, q);
    const axes = [[0, gx, gy, eq[0] + ep[0]], [1, gy, gx, eq[1] + ep[1]]]; // [axis, gap along it, gap on the other, centre distance when touching]
    for (const [ax, g, go, touch] of axes as [number, number, number, number][]) { if (g <= 0 || g > edge || go > edge) continue; // beside each other across this axis, overlapping along the other
      if (g >= bestD) continue; bestD = g; const oa = 1 - ax, s = Math.sign(pp[ax]! - qp[ax]!) || 1; pos = [pp[0]!, pp[1]!]; pos[ax] = qp[ax]! + s * touch; why = `${q.name}에 맞닿게`;
      const lines: [number, number][] = [[qp[oa]! - eq[oa]!, -ep[oa]!], [qp[oa]! + eq[oa]!, ep[oa]!], [qp[oa]!, 0]]; // align an edge or the centre on the other axis
      for (const [ln, off] of lines) { const d = Math.abs(pp[oa]! + off - ln); if (d <= edge && d > 0) { pos[oa] = ln - off; why += ' · 모서리 맞춤'; break; } } } }
  return why ? { pos: [Math.round(pos[0]!), Math.round(pos[1]!), p.pos[2]], why } : null;
}
