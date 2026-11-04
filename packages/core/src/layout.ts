/**
 * 공장 배치 규칙 (factory layout rules) F1–F6: how machine cells sit next to each other in a factory. The Machine Builder's
 * structure rules (structure.ts) say how one machine is built; these say how built machines are laid out.
 * Geometry is factory mm, Z-up: a cell = the area rectangle of a machine instance (centre, size, yaw) with its inlet and
 * outlet points and the direction parts travel through it.
 */
import type { StructureIssue } from './structure';

export interface Cell { id: string; name: string; c: [number, number]; size: [number, number]; yaw: number; inlet?: [number, number]; outlet?: [number, number]; dir?: [number, number] }
export interface CellFlow { id: string; from: string; to: string }
export interface LayoutOptions { gap?: number; aisles?: { id: string; name: string; poly: [number, number][]; width?: number }[]; slab?: [number, number][] | null; maxFlow?: number }
export type LayoutIssue = StructureIssue;

const rad = (d: number) => (d * Math.PI) / 180;
/** The four corners of a cell, counter-clockwise. */
export function corners(c: Cell): [number, number][] {
  const r = rad(c.yaw || 0), cs = Math.cos(r), sn = Math.sin(r), hx = c.size[0] / 2, hy = c.size[1] / 2;
  return ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as [number, number][]).map(([x, y]) => [c.c[0] + x * cs - y * sn, c.c[1] + x * sn + y * cs]);
}
/** Separating-axis test of two rectangles: the overlap depth and the axis (unit, pointing from a to b) of least penetration; depth ≤ 0 = apart (its value = the gap along the best axis, a lower bound of the true gap). */
export function obbOverlap(a: Cell, b: Cell): { depth: number; axis: [number, number] } {
  const A = corners(a), B = corners(b), axes: [number, number][] = [];
  for (const c of [a, b]) { const r = rad(c.yaw || 0); axes.push([Math.cos(r), Math.sin(r)], [-Math.sin(r), Math.cos(r)]); }
  let best = Infinity, bestAxis: [number, number] = [1, 0];
  for (const ax of axes) { const pa = A.map(p => p[0] * ax[0] + p[1] * ax[1]), pb = B.map(p => p[0] * ax[0] + p[1] * ax[1]);
    const d = Math.min(Math.max(...pa) - Math.min(...pb), Math.max(...pb) - Math.min(...pa)); // overlap along this axis (negative = gap)
    if (d < best) { best = d; const s = (b.c[0] - a.c[0]) * ax[0] + (b.c[1] - a.c[1]) * ax[1]; bestAxis = s >= 0 ? ax : [-ax[0], -ax[1]]; } }
  return { depth: best, axis: bestAxis };
}
const segDist = (p: [number, number], a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
/** True clearance between two cells (0 when they touch or overlap). */
export function cellGap(a: Cell, b: Cell): number {
  if (obbOverlap(a, b).depth > 0) return 0; const A = corners(a), B = corners(b); let d = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { d = Math.min(d, segDist(A[i]!, B[j]!, B[(j + 1) % 4]!), segDist(B[j]!, A[i]!, A[(i + 1) % 4]!)); } return d;
}
const inPoly = (p: [number, number], poly: [number, number][]) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };
const segsCross = (p: [number, number], q: [number, number], a: [number, number], b: [number, number]) => { const o = (u: [number, number], v: [number, number], w: [number, number]) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0])); return o(p, q, a) !== o(p, q, b) && o(a, b, p) !== o(a, b, q); };
/** Does the segment p→q pass through the cell (not just touch its boundary)? */
function segThrough(p: [number, number], q: [number, number], c: Cell, shrink = 50): boolean {
  const s: Cell = { ...c, size: [Math.max(1, c.size[0] - 2 * shrink), Math.max(1, c.size[1] - 2 * shrink)] }, C = corners(s);
  if (inPoly(p, C) || inPoly(q, C)) return true; for (let i = 0; i < 4; i++) if (segsCross(p, q, C[i]!, C[(i + 1) % 4]!)) return true; return false;
}

/**
 * The checks. F1 cells do not overlap (fix: push the moved one out by the least vector). F2 cells keep the maintenance
 * gap (default 600 mm; fix: open the gap). F3 a cell does not stand on a marked aisle. F4 a cell stays on the slab.
 * F5 a flow leaves an outlet in its travel direction and arrives at an inlet from in front (fix: bring the inlet in front
 * of the outlet); very long flows are flagged. F6 a straight flow does not run through a third cell.
 */
export function checkLayout(cells: Cell[], flows: CellFlow[], opt: LayoutOptions = {}): LayoutIssue[] {
  const out: LayoutIssue[] = [], gap = opt.gap ?? 600, C = new Map(cells.map(c => [c.id, c])), nm = (c: Cell) => c.name || c.id;
  const mid = (a: Cell, b?: Cell): [number, number, number] => b ? [(a.c[0] + b.c[0]) / 2, (a.c[1] + b.c[1]) / 2, 0] : [a.c[0], a.c[1], 0];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) { const a = cells[i]!, b = cells[j]!, o = obbOverlap(a, b);
    if (o.depth > 20) { const by: [number, number, number] = [Math.round(o.axis[0] * (o.depth + gap)), Math.round(o.axis[1] * (o.depth + gap)), 0];
      out.push({ rule: 'F1', lv: 'err', ids: [b.id, a.id], at: mid(a, b), txt: `${nm(a)} · ${nm(b)} 셀 영역이 ${Math.round(o.depth)} mm 겹칩니다`, fix: { label: `${nm(b)} 밀어내기 (${gap} mm 띄움)`, moves: [{ id: b.id, by }] } }); continue; }
    const g = cellGap(a, b); if (g < gap) { const ax = o.axis, by: [number, number, number] = [Math.round(ax[0] * (gap - g)), Math.round(ax[1] * (gap - g)), 0];
      out.push({ rule: 'F2', lv: 'warn', ids: [b.id, a.id], at: mid(a, b), txt: `${nm(a)} · ${nm(b)} 사이 ${Math.round(g)} mm · 보수·통로 공간 ${gap} mm가 안 됩니다`, fix: { label: `${gap} mm 띄우기`, moves: [{ id: b.id, by }] } }); } }
  for (const c of cells) {
    for (const a of opt.aisles || []) { if (corners(c).some(p => inPoly(p, a.poly)) || a.poly.some(p => inPoly(p, corners(c)))) out.push({ rule: 'F3', lv: 'err', ids: [c.id, a.id], at: mid(c), txt: `${nm(c)}이(가) 통로 ${a.name || ''}를 침범합니다` }); }
    if (opt.slab && opt.slab.length >= 3) { const outPts = corners(c).filter(p => !inPoly(p, opt.slab!)); if (outPts.length) out.push({ rule: 'F4', lv: 'warn', ids: [c.id], at: mid(c), txt: `${nm(c)}의 모서리 ${outPts.length}개가 바닥(슬래브) 밖입니다` }); }
  }
  for (const f of flows) { const a = C.get(f.from.split('.')[0]!), b = C.get(f.to.split('.')[0]!); if (!a || !b || a === b || !a.outlet || !b.inlet) continue;
    const v: [number, number] = [b.inlet[0] - a.outlet[0], b.inlet[1] - a.outlet[1]], len = Math.hypot(v[0], v[1]), ad = a.dir || [1, 0], bd = b.dir || [1, 0];
    const outDot = len ? (v[0] * ad[0] + v[1] * ad[1]) / len : 1, inDot = len ? (v[0] * bd[0] + v[1] * bd[1]) / len : 1, at: [number, number, number] = [(a.outlet[0] + b.inlet[0]) / 2, (a.outlet[1] + b.inlet[1]) / 2, 0];
    // backwards = the inlet lies behind the outlet; facing away is fine when there is room for the conveyor to turn (a U line), not within 3 m
    if (len > 100 && (outDot < -0.2 || (inDot < -0.2 && len < 3000))) { const want: [number, number] = [a.outlet[0] + ad[0] * Math.max(1500, gap * 2), a.outlet[1] + ad[1] * Math.max(1500, gap * 2)], by: [number, number, number] = [Math.round(want[0] - b.inlet[0]), Math.round(want[1] - b.inlet[1]), 0];
      out.push({ rule: 'F5', lv: 'warn', ids: [b.id, a.id], at, txt: outDot < -0.2 ? `${nm(a)} 출구가 ${nm(b)} 쪽을 보지 않습니다 · 흐름이 뒤로 갑니다` : `${nm(b)} 입구가 ${nm(a)}를 등지고 있습니다 · 부품이 돌아 들어갑니다`, fix: { label: `${nm(b)} 입구를 ${nm(a)} 출구 앞으로`, moves: [{ id: b.id, by }] } }); }
    if (len > (opt.maxFlow ?? 30000)) out.push({ rule: 'F5', lv: 'warn', ids: [a.id, b.id], at, txt: `${nm(a)} → ${nm(b)} 흐름이 ${Math.round(len / 1000)} m · 너무 멉니다` });
    for (const c of cells) if (c !== a && c !== b && segThrough(a.outlet, b.inlet, c)) out.push({ rule: 'F6', lv: 'warn', ids: [a.id, b.id, c.id], at, txt: `${nm(a)} → ${nm(b)} 흐름이 ${nm(c)} 셀을 가로지릅니다 · 컨베이어 경로를 돌리거나 셀을 옮기세요` });
  }
  return out;
}

export const LAYOUT_RULES: { id: string; name: string; txt: string }[] = [
  { id: 'F1', name: '셀 겹침 금지', txt: '설비 셀 영역은 서로 겹치지 않는다 (회전 반영).' },
  { id: 'F2', name: '보수 · 통로 공간', txt: '셀 사이 600 mm 이상 (설정값).' },
  { id: 'F3', name: '통로 침범 금지', txt: '셀은 통로 표시 위에 서지 않는다.' },
  { id: 'F4', name: '바닥 안', txt: '셀은 바닥(슬래브) 안에 든다.' },
  { id: 'F5', name: '흐름 방향', txt: '출구는 다음 설비 쪽을, 입구는 앞 설비 쪽을 본다. 흐름 길이 상한 30 m.' },
  { id: 'F6', name: '흐름 경로', txt: '흐름은 다른 셀을 가로지르지 않는다.' },
];
