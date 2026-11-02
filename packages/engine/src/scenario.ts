/**
 * Scenarios (R1 §8.4): a scenario = demo-line parameters + run settings (horizon, warm-up, seeds).
 * Results are averaged over replications with a 95 % confidence half-width; two scenarios run on the
 * same seeds (common random numbers) so the difference between them is the change, not the dice.
 */
import { buildDemoLine, type DemoParams } from './demo-line';
import { simulateLine, type LineResult } from './line';

export interface RunSettings { horizon: number; warmup: number; seeds: number[] }
export const DEFAULT_RUN: RunSettings = { horizon: 8 * 3600 + 3600, warmup: 3600, seeds: [1, 2, 3, 4, 5] };
export interface Stat { mean: number; half: number; min: number; max: number }
export interface ScenarioResult {
  name: string; params: DemoParams; runs: LineResult[];
  kpi: { throughputPerHour: Stat; leadTime: Stat; wip: Stat; scrapped: Stat; perShift: Stat };
  utilisation: Record<string, { busy: number; blocked: number; idle: number; down: number }>;
  bottleneck: string | null;
}

const T95 = [0, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23];
export function stat(xs: number[]): Stat {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, half: n > 1 ? (T95[Math.min(n - 1, 10)] ?? 1.96) * sd / Math.sqrt(n) : 0, min: Math.min(...xs), max: Math.max(...xs) };
}

export function runScenario(name: string, params: DemoParams, run: RunSettings = DEFAULT_RUN): ScenarioResult {
  const model = buildDemoLine(params).model;
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
    },
  };
}

/** Side-by-side comparison: change of each KPI and whether it is beyond the noise (CIs do not overlap). */
export function compare(a: ScenarioResult, b: ScenarioResult): { kpi: string; a: number; b: number; delta: number; pct: number; significant: boolean }[] {
  return (Object.keys(a.kpi) as (keyof ScenarioResult['kpi'])[]).map(k => {
    const x = a.kpi[k], y = b.kpi[k], delta = y.mean - x.mean;
    return { kpi: k, a: x.mean, b: y.mean, delta, pct: x.mean ? (delta / x.mean) * 100 : 0, significant: Math.abs(delta) > x.half + y.half };
  });
}
