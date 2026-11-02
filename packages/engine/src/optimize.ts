/**
 * Layout / buffer optimisation (R1 §9.1 "레이아웃·버퍼·밸런싱 최적화", shown generation by generation).
 * A small genetic algorithm over integer genes (number of jig pallets, extra pallet places in front of
 * chosen stations). Every candidate is simulated on the same seeds; the score is throughput minus the
 * cost of pallets and conveyor length, so the search shows the trade-off instead of "buy everything".
 * Deterministic for a given seed; `onGeneration` lets the UI animate each generation's best line.
 */
import { Rng } from './rng';
import { buildDemoLine, type DemoParams } from './demo-line';
import { simulateLine, type LineModel } from './line';

export interface Gene { key: string; label: string; min: number; max: number; apply: (p: DemoParams, v: number) => void }
export interface Candidate { genes: number[]; score: number; throughput: number; cost: number }
export interface Generation { index: number; best: Candidate; mean: number; population: Candidate[] }
export interface OptimizeOptions {
  genes: Gene[]; base?: DemoParams; population?: number; generations?: number; seed?: number;
  horizon?: number; warmup?: number; evalSeeds?: number[];
  costPerUnit?: Record<string, number>; // score penalty per unit of each gene (parts / h)
  onGeneration?: (g: Generation) => void;
  /** the line for a set of parameters (default: the demo line) */
  build?: (p: DemoParams) => LineModel;
}

export const palletGene: Gene = { key: 'pallets', label: '지그 팔레트 수', min: 4, max: 24, apply: (p, v) => { p.pallets = v; } };
export const bufferGene = (station: string, label: string, max = 4): Gene => ({
  key: `buf_${station}`, label, min: 0, max, apply: (p, v) => { (p.extraBuffer ??= {})[station] = v; },
});
/** a faster version of a station (an upgrade): level v runs the cycle at (1 − step·v) of `ct` */
export const ctGene = (station: string, label: string, ct: number, levels = 3, step = 0.1): Gene => ({
  key: `ct_${station}`, label, min: 0, max: levels, apply: (p, v) => { if (v > 0) ((p.stations ??= {})[station] ??= {}).ct = +(ct * (1 - step * v)).toFixed(3); },
});

export function optimize(o: OptimizeOptions): Generation[] {
  const history: Generation[] = [];
  for (const g of optimizeSteps(o)) history.push(g);
  return history;
}

/** the same search one generation at a time (a UI can draw each generation before asking for the next) */
export function* optimizeSteps(o: OptimizeOptions): Generator<Generation, void, void> {
  const rng = new Rng(o.seed ?? 1), P = o.population ?? 16, G = o.generations ?? 12;
  const seeds = o.evalSeeds ?? [11, 12], horizon = o.horizon ?? 9 * 3600, warmup = o.warmup ?? 3600;
  const cache = new Map<string, Candidate>();
  const evaluate = (genes: number[]): Candidate => {
    const key = genes.join(','); const hit = cache.get(key); if (hit) return hit;
    const p: DemoParams = structuredClone(o.base ?? {});
    o.genes.forEach((g, i) => g.apply(p, genes[i]!));
    const model = o.build ? o.build(p) : buildDemoLine(p).model;
    const th = seeds.reduce((a, s) => a + simulateLine(model, horizon, { seed: s, warmup }).throughputPerHour, 0) / seeds.length;
    const cost = o.genes.reduce((a, g, i) => a + (o.costPerUnit?.[g.key] ?? 0) * genes[i]!, 0);
    const c = { genes, score: th - cost, throughput: th, cost };
    cache.set(key, c); return c;
  };
  const rand = (g: Gene) => g.min + Math.floor(rng.next() * (g.max - g.min + 1));
  const clamp = (g: Gene, v: number) => Math.max(g.min, Math.min(g.max, v));
  // start from the base line plus random neighbours
  const baseGenes = o.genes.map(g => clamp(g, g.key === 'pallets' ? (o.base?.pallets ?? 8) : 0));
  let pop: Candidate[] = [evaluate(baseGenes)];
  while (pop.length < P) pop.push(evaluate(o.genes.map(rand)));
  const pick = () => { const a = pop[Math.floor(rng.next() * pop.length)]!, b = pop[Math.floor(rng.next() * pop.length)]!; return a.score >= b.score ? a : b; };
  for (let gi = 0; gi < G; gi++) {
    pop.sort((a, b) => b.score - a.score);
    const gen: Generation = { index: gi, best: pop[0]!, mean: pop.reduce((a, c) => a + c.score, 0) / pop.length, population: pop.slice() };
    o.onGeneration?.(gen); yield gen;
    const next = pop.slice(0, 2); // elitism
    while (next.length < P) {
      const a = pick(), b = pick();
      const child = o.genes.map((g, i) => {
        let v = rng.next() < 0.5 ? a.genes[i]! : b.genes[i]!;
        if (rng.next() < 0.25) v = clamp(g, v + (rng.next() < 0.5 ? -1 : 1) * (1 + Math.floor(rng.next() * 2)));
        return v;
      });
      next.push(evaluate(child));
    }
    pop = next;
  }
}
