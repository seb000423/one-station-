/**
 * 설계 구조 규칙 (design structure rules) v0, derived from the four reference stations (조립 · 도포 · 브레이징 · 검사).
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

export type Role = 'floor' | 'top' | 'side' | 'robot' | 'seat';
export type HostCap = { top: boolean; side: boolean };
export interface Part { id: string; name: string; kind?: string; size: [number, number, number]; pos: [number, number, number]; yaw?: number; role?: Role; cls?: string; reach?: number }
export interface Mount { host: string | null; rel: 'floor' | 'top' | 'side' | 'in'; dz: number; gap: number; off?: [number, number, number] }
export interface StructureIssue { rule: string; lv: 'err' | 'warn'; ids: string[]; at: [number, number, number]; txt: string; fix?: { label: string; moves: { id: string; by: [number, number, number] }[] } }

/** Object classes: label keywords (generic names, in priority order) → class, role and what it can carry. */
export const CLASSES: { cls: string; label: string; words: string[]; role: Role; host: HostCap }[] = [
  { cls: 'base', label: '셀 베이스', words: ['셀 베이스', '베이스', 'base'], role: 'floor', host: { top: true, side: true } },
  { cls: 'utility', label: '부대 설비', words: ['부대설비', '부대 설비', '용접 전원', '에어 필터', '컴프레서', '전원'], role: 'floor', host: { top: false, side: false } },
  { cls: 'furnace', label: '로 · 대형 장비', words: ['브레이징로', '진공로', '열처리로'], role: 'floor', host: { top: false, side: true } },
  { cls: 'rotary', label: '회전 테이블', words: ['회전 테이블', '턴테이블'], role: 'floor', host: { top: true, side: false } },
  { cls: 'desk', label: '작업대', words: ['작업대', '테이블'], role: 'floor', host: { top: true, side: true } },
  { cls: 'frame', label: '프레임', words: ['프레임', 'frame'], role: 'floor', host: { top: true, side: true } },
  { cls: 'rail', label: '레일', words: ['레일', 'rail'], role: 'floor', host: { top: true, side: true } },
  { cls: 'shelf', label: '선반', words: ['선반', '랙', 'shelf'], role: 'floor', host: { top: true, side: true } },
  { cls: 'lamp', label: '경광등', words: ['경광등', '타워램프', 'lamp'], role: 'top', host: { top: false, side: false } },
  { cls: 'jig', label: '지그', words: ['지그', 'jig'], role: 'top', host: { top: true, side: false } },
  { cls: 'tray', label: '트레이', words: ['트레이', 'tray'], role: 'top', host: { top: true, side: false } },
  { cls: 'work', label: '제품', words: ['제품', '워크', 'work'], role: 'top', host: { top: true, side: false } },
  { cls: 'dispenser', label: '디스펜서', words: ['디스펜서'], role: 'floor', host: { top: false, side: false } },
  { cls: 'control', label: '제어함', words: ['제어함', '제어반', 'control'], role: 'side', host: { top: false, side: false } },
  { cls: 'monitor', label: '모니터', words: ['모니터', 'monitor'], role: 'side', host: { top: false, side: false } },
  { cls: 'sensor', label: '센서', words: ['센서', 'sensor'], role: 'side', host: { top: false, side: false } },
  { cls: 'guard', label: '가림판 · 가드', words: ['가림판', '가드', 'guard'], role: 'side', host: { top: false, side: false } },
  { cls: 'aux', label: '부속 · 부대 장치', words: ['부대 장치', '부속'], role: 'side', host: { top: false, side: false } },
  { cls: 'seat', label: '의자', words: ['의자', 'chair'], role: 'seat', host: { top: false, side: false } },
  { cls: 'robot', label: '로봇', words: ['로봇', 'robot'], role: 'robot', host: { top: false, side: false } },
];
export const ROLE_LABEL: Record<Role, string> = { floor: '바닥에 섬', top: '위에 얹힘', side: '옆면에 붙음', robot: '로봇', seat: '작업자 자리' };
const NOHOST: HostCap = { top: false, side: false };
const byCls = new Map(CLASSES.map(c => [c.cls, c]));
/** Can a thing of this class carry things on top / on its sides? */
export const hostCap = (cls?: string): HostCap => (cls && byCls.get(cls)?.host) || NOHOST;

/** Class and role of an object from its name and kind; a part standing on the floor whose class is mounted keeps 'floor'. */
export function classify(name: string, kind?: string, z = 0): { cls: string; role: Role } {
  if (kind === 'robot') return { cls: 'robot', role: 'robot' };
  if (kind === 'rotary') return { cls: 'rotary', role: 'floor' };
  const n = ` ${name.toLowerCase()} `;
  const c = CLASSES.find(c => c.words.some(w => n.includes(w.toLowerCase())));
  if (!c) return { cls: 'part', role: z < 50 ? 'floor' : 'top' };
  // a tray table, a shelf base, an aux unit standing on the floor are floor objects; a shelf up on a frame is carried
  if (c.role !== 'floor' && c.role !== 'robot' && c.role !== 'seat' && z < 50) return { cls: c.cls, role: 'floor' };
  if (c.role === 'floor' && z >= 50 && (c.cls === 'shelf' || c.cls === 'desk' || c.cls === 'rail' || c.cls === 'frame')) return { cls: c.cls, role: 'top' };
  return { cls: c.cls, role: c.role };
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
const hDist = (a: Part, b: Part) => { const [gx, gy] = gaps(a, b); return Math.hypot(Math.max(0, gx), Math.max(0, gy)); };
const vol = (p: Part) => p.size[0] * p.size[1] * p.size[2];

/** Fill in class and role (unless given). */
export function withRoles(parts: Part[]): Part[] { return parts.map(p => (p.role && p.cls ? p : Object.assign({}, p, classify(p.name, p.kind, p.pos[2]), p.role ? { role: p.role } : {}))); }

/**
 * Host finding. A 'top' object sits on the highest top-host whose top is at or just under its bottom and whose footprint
 * holds its centre; a 'side' object hangs on the nearest side-host face it touches (≤ 300 mm) at its height; a robot sits
 * on a top host when it is lifted, else on the floor; floor objects and seats have no host. Hosts never form a loop.
 */
export function findMounts(parts0: Part[]): Map<string, Mount> {
  const parts = withRoles(parts0), out = new Map<string, Mount>();
  for (const p of parts) {
    const z = p.pos[2]; let best: Part | null = null, bestScore = Infinity, rel: Mount['rel'] = 'floor';
    if (p.role === 'top' || (p.role === 'robot' && z >= 50) || (p.role === 'side' && z < 50)) {
      for (const h of parts) { if (h === p || !hostCap(h.cls).top || vol(h) < vol(p) * 0.2) continue; const t = topOf(h), dz = z - t;
        if (dz < -150 || dz > 400 || !inside(p.pos[0], p.pos[1], h)) continue; const sc = Math.abs(dz) + (h.cls === 'base' ? 200 : 0); // the cell base carries what nothing else carries
        if (sc < bestScore) { best = h; bestScore = sc; rel = 'top'; } }
    }
    if (p.role === 'side' || (p.role === 'top' && !best)) {
      for (const h of parts) { if (h === p || !hostCap(h.cls).side) continue; if (zOverlap(p, h) <= 0) continue; const [gx, gy] = gaps(p, h), g = Math.max(gx, gy);
        if (g > 300 || g < -Math.min(...p.size.slice(0, 2))) continue; const sc = Math.abs(g) + (h.cls === 'base' ? 300 : 0); if (sc < bestScore) { best = h; bestScore = sc; rel = 'side'; } }
    }
    // fixed inside a hollow host (a sensor or guard in the cell base, a part in a shelf): keeps its place in the host
    if (!best && p.role !== 'floor' && p.role !== 'seat') for (const h of parts) { if (h === p || !(hostCap(h.cls).top || hostCap(h.cls).side) || vol(h) < vol(p) * 4) continue;
      if (inside(p.pos[0], p.pos[1], h) && z >= h.pos[2] && z < topOf(h)) { const sc = vol(h); if (sc < bestScore) { best = h; bestScore = sc; rel = 'in'; } } }
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
  const M = opt.mounts || findMounts(ref && ref.length ? ref.filter(r => P.has(r.id)).concat(parts.filter(p => !R.has(p.id))) : parts);
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
