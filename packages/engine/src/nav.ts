/**
 * Navigation layer (R1 §8.1, basic): a graph from drawn paths (points closer than `join` mm merge),
 * shortest paths by A*, travel time with accelerate / cruise / brake per straight and a turn time per corner.
 */
import { trapezoid } from './kinematics';

export interface NavGraph { nodes: [number, number][]; adj: { to: number; len: number }[][] }

export function buildGraph(paths: { points: [number, number][]; oneway?: boolean }[], join = 200): NavGraph {
  const nodes: [number, number][] = [], adj: { to: number; len: number }[][] = [];
  const idx = (p: [number, number]): number => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i]![0] - p[0], nodes[i]![1] - p[1]) <= join) return i;
    nodes.push([p[0], p[1]]); adj.push([]); return nodes.length - 1;
  };
  for (const path of paths) {
    for (let k = 1; k < path.points.length; k++) {
      const a = idx(path.points[k - 1]!), b = idx(path.points[k]!);
      if (a === b) continue;
      const len = Math.hypot(nodes[a]![0] - nodes[b]![0], nodes[a]![1] - nodes[b]![1]);
      adj[a]!.push({ to: b, len });
      if (!path.oneway) adj[b]!.push({ to: a, len });
    }
  }
  return { nodes, adj };
}
export function nearest(g: NavGraph, p: [number, number]): number {
  let best = -1, bd = Infinity;
  g.nodes.forEach((n, i) => { const d = Math.hypot(n[0] - p[0], n[1] - p[1]); if (d < bd) { bd = d; best = i; } });
  return best;
}
/** A* shortest path between graph nodes; null when unreachable. */
export function astar(g: NavGraph, from: number, to: number): { path: number[]; length: number } | null {
  const h = (i: number) => Math.hypot(g.nodes[i]![0] - g.nodes[to]![0], g.nodes[i]![1] - g.nodes[to]![1]);
  const gs = new Map<number, number>([[from, 0]]), prev = new Map<number, number>();
  const open = new Set([from]), f = new Map<number, number>([[from, h(from)]]);
  while (open.size) {
    let cur = -1, cf = Infinity; for (const i of open) { const v = f.get(i)!; if (v < cf) { cf = v; cur = i; } }
    if (cur === to) { const path = [to]; while (prev.has(path[0]!)) path.unshift(prev.get(path[0]!)!); return { path, length: gs.get(to)! }; }
    open.delete(cur);
    for (const e of g.adj[cur]!) {
      const t = gs.get(cur)! + e.len;
      if (t < (gs.get(e.to) ?? Infinity)) { gs.set(e.to, t); prev.set(e.to, cur); f.set(e.to, t + h(e.to)); open.add(e.to); }
    }
  }
  return null;
}
/** Travel time along a node path: stop at every corner (turn in place), trapezoid on every straight. */
export function travelTime(g: NavGraph, path: number[], v: { vmax: number; amax: number; turnRate?: number }): number {
  let T = 0, prevHeading: number | null = null;
  // merge collinear segments into straights
  let segStart = 0;
  for (let k = 1; k < path.length; k++) {
    const a = g.nodes[path[k - 1]!]!, b = g.nodes[path[k]!]!, hd = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nxt = path[k + 1] !== undefined ? g.nodes[path[k + 1]!]! : null;
    const straightEnds = !nxt || Math.abs(Math.atan2(nxt[1] - b[1], nxt[0] - b[0]) - hd) > 1e-3;
    if (straightEnds) {
      const s = g.nodes[path[segStart]!]!, L = Math.hypot(b[0] - s[0], b[1] - s[1]);
      if (prevHeading !== null && v.turnRate) { let d = Math.abs(hd - prevHeading) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; T += (d * 180 / Math.PI) / v.turnRate; }
      T += trapezoid(L, v.vmax, v.amax).T; prevHeading = hd; segStart = k;
    }
  }
  return T;
}
