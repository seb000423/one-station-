/**
 * Scenarios (R1 §8.4): a scenario = demo-line parameters + run settings (horizon, warm-up, seeds).
 * Results are averaged over replications with a 95 % confidence half-width; two scenarios run on the
 * same seeds (common random numbers) so the difference between them is the change, not the dice.
 */
import { buildDemoLine, type DemoParams } from './demo-line';
import { simulateLine, type LineResult, type LineModel } from './line';

export interface RunSettings { horizon: number; warmup: number; seeds: number[] }
export const DEFAULT_RUN: RunSettings = { horizon: 8 * 3600 + 3600, warmup: 3600, seeds: [1, 2, 3, 4, 5] };
export interface Stat { mean: number; half: number; min: number; max: number }
export interface ScenarioResult {
  name: string; params: DemoParams; runs: LineResult[];
  kpi: { throughputPerHour: Stat; leadTime: Stat; wip: Stat; scrapped: Stat; ngRate: Stat; perShift: Stat };
  utilisation: Record<string, { busy: number; blocked: number; idle: number; down: number }>;
  bottleneck: string | null;
}

const T95 = [0, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23];
export function stat(xs: number[]): Stat {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, half: n > 1 ? (T95[Math.min(n - 1, 10)] ?? 1.96) * sd / Math.sqrt(n) : 0, min: Math.min(...xs), max: Math.max(...xs) };
}

/** NG share of everything that left the line, % */
const ngRate = (r: LineResult) => (r.produced + r.scrapped ? (r.scrapped / (r.produced + r.scrapped)) * 100 : 0);

/** `build` turns the scenario's parameters into a line (default: the demo line; a BUILDER line passes its own) */
export function runScenario(name: string, params: DemoParams, run: RunSettings = DEFAULT_RUN, build: (p: DemoParams) => LineModel = p => buildDemoLine(p).model): ScenarioResult {
  const model = build(params);
  const runs = run.seeds.map(seed => simulateLine(model, run.horizon, { seed, warmup: run.warmup }));
  const util: ScenarioResult['utilisation'] = {};
  for (const id of Object.keys(runs[0]!.stations)) {
    const avg = (k: 'busy' | 'blocked' | 'idle' | 'down') => runs.reduce((a, r) => a + r.stations[id]![k], 0) / runs.length;
    util[id] = { busy: avg('busy'), blocked: avg('blocked'), idle: avg('idle'), down: avg('down') };
  }
  const bottleneck = Object.entries(util).sort((a, b) => (b[1].busy + b[1].down) - (a[1].busy + a[1].down))[0]?.[0] ?? null;
  const measured = run.horizon - run.warmup;
  return {
    name, params, runs, utilisation: util, bottleneck,
    kpi: {
      throughputPerHour: stat(runs.map(r => r.throughputPerHour)),
      perShift: stat(runs.map(r => (r.produced / measured) * 8 * 3600)),
      leadTime: stat(runs.map(r => r.leadTime.mean)),
      wip: stat(runs.map(r => r.wip)),
      scrapped: stat(runs.map(r => r.scrapped)),
      ngRate: stat(runs.map(ngRate)),
    },
  };
}

export interface CompareRow { kpi: keyof ScenarioResult['kpi']; a: number; b: number; delta: number; half: number; pct: number; significant: boolean }
/**
 * Side-by-side comparison. With the same seeds on both sides (common random numbers) the change is judged on
 * the per-seed differences (paired t interval): significant when the 95 % interval of the difference excludes 0.
 * Otherwise (different seeds) the two intervals must not overlap.
 */
export function compare(a: ScenarioResult, b: ScenarioResult): CompareRow[] {
  const paired = a.runs.length === b.runs.length && a.runs.length > 1;
  const per = (r: ScenarioResult, k: keyof ScenarioResult['kpi']) => r.runs.map(x => {
    const measured = x.measured;
    return k === 'throughputPerHour' ? x.throughputPerHour : k === 'perShift' ? (x.produced / measured) * 8 * 3600 : k === 'leadTime' ? x.leadTime.mean : k === 'wip' ? x.wip : k === 'ngRate' ? ngRate(x) : x.scrapped;
  });
  return (Object.keys(a.kpi) as (keyof ScenarioResult['kpi'])[]).map(k => {
    const x = a.kpi[k], y = b.kpi[k], delta = y.mean - x.mean;
    let half: number, significant: boolean;
    if (paired) { const pa = per(a, k), pb = per(b, k), d = stat(pb.map((v, i) => v - pa[i]!)); half = d.half; significant = Math.abs(d.mean) > d.half && d.half >= 0 && Math.abs(d.mean) > 1e-9; }
    else { half = x.half + y.half; significant = Math.abs(delta) > half; }
    return { kpi: k, a: x.mean, b: y.mean, delta, half, pct: x.mean ? (delta / x.mean) * 100 : 0, significant };
  });
}
