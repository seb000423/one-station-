/** Seeded random numbers and the distributions used by machine cards (deterministic: same seed → same run). */
export type Dist =
  | number
  | { kind: 'const'; v: number }
  | { kind: 'uniform'; a: number; b: number }
  | { kind: 'normal'; mean: number; sd: number; min?: number }
  | { kind: 'exp'; mean: number }
  | { kind: 'tri'; a: number; m: number; b: number }
  | { kind: 'lognormal'; mean: number; sd: number };

export class Rng {
  private s: number;
  private spare: number | null = null;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  /** mulberry32, uniform in [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** independent stream for one model element, so adding an element does not shift the others */
  fork(key: string): Rng {
    let h = this.s ^ 0x811c9dc5;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
    return new Rng(h >>> 0);
  }
  normal(): number {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    let u = 0, v = 0, s = 0;
    do { u = this.next() * 2 - 1; v = this.next() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * f; return u * f;
  }
  sample(d: Dist): number {
    if (typeof d === 'number') return d;
    switch (d.kind) {
      case 'const': return d.v;
      case 'uniform': return d.a + (d.b - d.a) * this.next();
      case 'normal': return Math.max(d.min ?? 0, d.mean + d.sd * this.normal());
      case 'exp': return -d.mean * Math.log(1 - this.next());
      case 'tri': {
        const u = this.next(), c = (d.m - d.a) / (d.b - d.a);
        return u < c ? d.a + Math.sqrt(u * (d.b - d.a) * (d.m - d.a)) : d.b - Math.sqrt((1 - u) * (d.b - d.a) * (d.b - d.m));
      }
      case 'lognormal': {
        const s2 = Math.log(1 + (d.sd * d.sd) / (d.mean * d.mean));
        return Math.exp(Math.log(d.mean) - s2 / 2 + Math.sqrt(s2) * this.normal());
      }
    }
  }
  pick<T>(items: T[], weights: number[]): T {
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) { r -= weights[i]!; if (r < 0) return items[i]!; }
    return items[items.length - 1]!;
  }
}

export const mean = (d: Dist): number => {
  if (typeof d === 'number') return d;
  switch (d.kind) {
    case 'const': return d.v;
    case 'uniform': return (d.a + d.b) / 2;
    case 'normal': return d.mean;
    case 'exp': return d.mean;
    case 'tri': return (d.a + d.m + d.b) / 3;
    case 'lognormal': return d.mean;
  }
};
