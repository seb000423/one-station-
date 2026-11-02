import { describe, expect, it } from 'vitest';
import { runScenario, compare, optimize, optimizeSteps, palletGene, bufferGene, ctGene, stat, buildDemoLine } from '@one-twin/engine';

describe('scenarios', () => {
  it('confidence interval of a constant is zero, of noise is positive', () => {
    expect(stat([5, 5, 5]).half).toBe(0);
    expect(stat([4, 5, 6]).half).toBeGreaterThan(0);
  });
  it('more pallets is a significant throughput gain; same scenario twice is identical', () => {
    const run = { horizon: 9 * 3600, warmup: 3600, seeds: [1, 2, 3] };
    const a = runScenario('현재안 (팔레트 8)', { pallets: 8 }, run), b = runScenario('팔레트 14', { pallets: 14 }, run);
    const rows = compare(a, b), th = rows.find(r => r.kpi === 'throughputPerHour')!;
    expect(th.delta).toBeGreaterThan(5);
    expect(th.significant).toBe(true);
    expect(runScenario('x', { pallets: 8 }, run).kpi).toEqual(a.kpi);
  });
  it('paired comparison on common seeds: identical scenarios differ by exactly 0 and are not significant', () => {
    const run = { horizon: 5 * 3600, warmup: 1800, seeds: [1, 2, 3] };
    const a = runScenario('a', { pallets: 10 }, run), b = runScenario('b', { pallets: 10 }, run);
    for (const r of compare(a, b)) { expect(r.delta).toBe(0); expect(r.half).toBe(0); expect(r.significant).toBe(false); }
  });
  it('a faster bottleneck only helps when the line is not pallet-limited', () => {
    const run = { horizon: 9 * 3600, warmup: 3600, seeds: [1, 2, 3] };
    const base = runScenario('a', { pallets: 24 }, run), fast = runScenario('b', { pallets: 24, stations: { E3: { ct: 22 } } }, run);
    expect(fast.kpi.throughputPerHour.mean).toBeGreaterThan(base.kpi.throughputPerHour.mean + 0.5);
    expect(fast.bottleneck).toBe('B6');
    expect(base.bottleneck).toBe('E3');
  });
});

describe('optimisation (GA)', () => {
  it('improves the score over generations, is reproducible, reports every generation', () => {
    const seen: number[] = [];
    const opts = {
      genes: [palletGene, bufferGene('E3', '리크 앞 버퍼'), bufferGene('B6', '레이저 앞 버퍼')],
      population: 10, generations: 6, seed: 3, horizon: 5 * 3600, warmup: 1800, evalSeeds: [1],
      costPerUnit: { pallets: 1.2, buf_E3: 0.5, buf_B6: 0.5 },
      onGeneration: (g: { index: number }) => seen.push(g.index),
    };
    const h = optimize(opts);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < h.length; i++) expect(h[i]!.best.score).toBeGreaterThanOrEqual(h[i - 1]!.best.score);
    expect(h[h.length - 1]!.best.score).toBeGreaterThan(h[0]!.population.find(c => c.genes[0] === 8 && c.genes[1] === 0 && c.genes[2] === 0)!.score);
    expect(optimize({ ...opts, onGeneration: undefined }).map(g => g.best.genes)).toEqual(h.map(g => g.best.genes));
  });
  it('steps one generation at a time (same result as the whole run); a cycle-time gene speeds up a station', () => {
    const genes = [palletGene, ctGene('E3', '리크 테스트 개선', buildDemoLine().stations.find(s => s.id === 'E3')!.ct)];
    const opts = { genes, population: 8, generations: 4, seed: 5, horizon: 4 * 3600, warmup: 1800, evalSeeds: [1], costPerUnit: { pallets: 1, ct_E3: 3 } };
    const it = optimizeSteps(opts), first = it.next();
    expect(first.done).toBe(false);
    const rest = [...it];
    expect([first.value, ...rest].map(g => g!.best.genes)).toEqual(optimize(opts).map(g => g.best.genes));
    const p: { stations?: Record<string, { ct?: number }> } = {}; genes[1]!.apply(p, 2);
    expect(p.stations!.E3!.ct).toBeCloseTo(genes[1]!.max >= 2 ? buildDemoLine().stations.find(s => s.id === 'E3')!.ct * 0.8 : 0, 3);
  });
});
