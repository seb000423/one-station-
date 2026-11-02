import { describe, expect, it } from 'vitest';
import { simulateLine, LineSim, Scheduler, Rng, type LineModel } from '@one-twin/engine';

const serial = (cts: number[], buf = 2): LineModel => {
  const nodes: LineModel['nodes'] = [{ kind: 'source', id: 'in' }], routes: LineModel['routes'] = [];
  let prev = 'in';
  cts.forEach((ct, i) => {
    if (i > 0) { nodes.push({ kind: 'buffer', id: `b${i}`, cap: buf }); routes.push({ from: prev, to: `b${i}` }); prev = `b${i}`; }
    nodes.push({ kind: 'station', id: `s${i + 1}`, ct }); routes.push({ from: prev, to: `s${i + 1}` }); prev = `s${i + 1}`;
  });
  nodes.push({ kind: 'sink', id: 'out' }); routes.push({ from: prev, to: 'out' });
  return { nodes, routes };
};

describe('scheduler', () => {
  it('runs events in time order, ties in insertion order, cancelled ones never', () => {
    const s = new Scheduler(), seen: string[] = [];
    s.at(5, () => seen.push('c')); s.at(1, () => seen.push('a')); s.at(5, () => seen.push('d')); s.at(3, () => seen.push('b'));
    const x = s.at(4, () => seen.push('x')); s.cancel(x);
    s.at(2, () => s.after(0.5, () => seen.push('a2')));
    s.runUntil(10);
    expect(seen).toEqual(['a', 'a2', 'b', 'c', 'd']);
    expect(s.now).toBe(10);
  });
});

describe('DES against hand calculation', () => {
  it('deterministic serial line: throughput = 3600 / slowest cycle, bottleneck = slowest station', () => {
    const r = simulateLine(serial([20, 30, 25]), 8 * 3600, { warmup: 600 });
    expect(r.throughputPerHour).toBeCloseTo(120, 0);
    expect(r.bottleneck).toBe('s2');
    expect(r.stations.s2!.busy).toBeCloseTo(1, 2);
    expect(r.stations.s1!.busy).toBeCloseTo(20 / 30, 2); // s1 runs 20 s, then is blocked 10 s
    expect(r.stations.s1!.blocked).toBeCloseTo(10 / 30, 2);
    expect(r.stations.s3!.idle).toBeCloseTo(5 / 30, 2); // s3 starved 5 s per cycle
  });
  it('lead time of an empty deterministic line = sum of cycle times', () => {
    const r = simulateLine(serial([10, 12, 8]), 5 * 3600, { warmup: 0 });
    // with infinite supply the line fills; the first part's lead time equals the sum
    const sim = new LineSim(serial([10, 12, 8]), { log: true }).run(100);
    const exit = sim.log.find(e => e.kind === 'exit')!;
    expect(exit.t).toBe(30);
    expect(r.throughputPerHour).toBeCloseTo(300, 0);
  });
  it('M/M/1 queue: mean time in system ≈ 1 / (μ − λ), utilisation ≈ λ / μ', () => {
    const lam = 1 / 60, mu = 1 / 45; // arrivals every 60 s, service 45 s, both exponential
    const model: LineModel = {
      nodes: [{ kind: 'source', id: 'in', interarrival: { kind: 'exp', mean: 60 } }, { kind: 'buffer', id: 'q', cap: 1e9 }, { kind: 'station', id: 's', ct: { kind: 'exp', mean: 45 } }, { kind: 'sink', id: 'out' }],
      routes: [{ from: 'in', to: 'q' }, { from: 'q', to: 's' }, { from: 's', to: 'out' }],
    };
    const runs = [1, 2, 3, 4].map(seed => simulateLine(model, 400 * 3600, { seed, warmup: 10 * 3600 }));
    const W = runs.reduce((a, r) => a + r.leadTime.mean, 0) / runs.length;
    const rho = runs.reduce((a, r) => a + r.stations.s!.busy, 0) / runs.length;
    expect(Math.abs(W - 1 / (mu - lam)) / (1 / (mu - lam))).toBeLessThan(0.08); // 180 s
    expect(rho).toBeCloseTo(lam / mu, 1.5);
    // Little's law: WIP = λ · W
    const wip = runs.reduce((a, r) => a + r.wip, 0) / runs.length;
    expect(Math.abs(wip - lam * W) / (lam * W)).toBeLessThan(0.05);
  });
  it('failures: throughput ≈ availability × 3600 / ct', () => {
    const model = serial([30]);
    (model.nodes[1] as { mtbf?: unknown; mttr?: unknown }).mtbf = { kind: 'exp', mean: 3600 };
    (model.nodes[1] as { mtbf?: unknown; mttr?: unknown }).mttr = { kind: 'exp', mean: 400 };
    const r = simulateLine(model, 2000 * 3600, { seed: 7, warmup: 3600 });
    const A = 3600 / (3600 + 400);
    expect(r.throughputPerHour / (A * 120)).toBeGreaterThan(0.97);
    expect(r.throughputPerHour / (A * 120)).toBeLessThan(1.03);
    expect(r.stations.s1!.down).toBeCloseTo(1 - A, 1.5);
  });
  it('ok rate: NG parts leave through the NG exit, good ones through the line', () => {
    const model: LineModel = {
      nodes: [{ kind: 'source', id: 'in' }, { kind: 'station', id: 'insp', ct: 10, okRate: 0.9, ng: 'ngbox' }, { kind: 'sink', id: 'out' }, { kind: 'sink', id: 'ngbox' }],
      routes: [{ from: 'in', to: 'insp' }, { from: 'insp', to: 'out' }],
    };
    const r = simulateLine(model, 100 * 3600, { seed: 3 });
    const ng = r.scrapped / (r.produced + r.scrapped);
    expect(ng).toBeGreaterThan(0.09); expect(ng).toBeLessThan(0.11);
  });
  it('routing ratios split the flow', () => {
    const model: LineModel = {
      nodes: [{ kind: 'source', id: 'in' }, { kind: 'station', id: 'a', ct: 5 }, { kind: 'buffer', id: 'q1', cap: 1e6 }, { kind: 'buffer', id: 'q2', cap: 1e6 }, { kind: 'sink', id: 'o1' }, { kind: 'sink', id: 'o2' }],
      routes: [{ from: 'in', to: 'a' }, { from: 'a', to: 'q1', ratio: 0.3 }, { from: 'a', to: 'q2', ratio: 0.7 }, { from: 'q1', to: 'o1' }, { from: 'q2', to: 'o2' }],
    };
    const sim = new LineSim(model, { seed: 11, log: true }).run(20000);
    const o1 = sim.log.filter(e => e.kind === 'exit' && e.node === 'o1').length, o2 = sim.log.filter(e => e.kind === 'exit' && e.node === 'o2').length;
    expect(o1 / (o1 + o2)).toBeCloseTo(0.3, 1);
  });
  it('accumulating conveyor: parts need transit time, capacity limits the queue', () => {
    const model: LineModel = {
      nodes: [{ kind: 'source', id: 'in' }, { kind: 'station', id: 'a', ct: 10 }, { kind: 'buffer', id: 'cv', cap: 3, transit: 25 }, { kind: 'station', id: 'b', ct: 10 }, { kind: 'sink', id: 'out' }],
      routes: [{ from: 'in', to: 'a' }, { from: 'a', to: 'cv' }, { from: 'cv', to: 'b' }, { from: 'b', to: 'out' }],
    };
    const sim = new LineSim(model, { log: true }).run(3600);
    expect(sim.log.find(e => e.kind === 'exit')!.t).toBe(45); // 10 + 25 + 10
    expect(sim.result().buffers.cv!.max).toBeLessThanOrEqual(3);
  });
});

describe('determinism and conservation', () => {
  const noisy = (): LineModel => {
    const m = serial([{ kind: 'normal', mean: 20, sd: 4 }, { kind: 'tri', a: 15, m: 22, b: 35 }, { kind: 'uniform', a: 18, b: 24 }] as never, 3);
    (m.nodes.find(n => n.id === 's2') as { mtbf?: unknown; mttr?: unknown }).mtbf = { kind: 'exp', mean: 1800 };
    (m.nodes.find(n => n.id === 's2') as { mtbf?: unknown; mttr?: unknown }).mttr = { kind: 'exp', mean: 300 };
    return m;
  };
  it('same seed → identical results and event log; another seed → different', () => {
    const a = new LineSim(noisy(), { seed: 42, log: true }).run(8 * 3600), b = new LineSim(noisy(), { seed: 42, log: true }).run(8 * 3600);
    expect(a.result()).toEqual(b.result());
    expect(a.log).toEqual(b.log);
    expect(simulateLine(noisy(), 8 * 3600, { seed: 43 }).produced).not.toBe(a.result().produced);
  });
  it('no part appears or disappears: created = in line + left; each part has one place at a time', () => {
    const sim = new LineSim(noisy(), { seed: 5, log: true });
    for (let t = 600; t <= 4 * 3600; t += 600) {
      sim.run(t);
      const c = sim.conservation(), r = sim.result();
      expect(c.created).toBe(c.inLine + c.out);
      expect(c.out).toBe(sim.log.filter(e => e.kind === 'exit' || e.kind === 'ng').length);
      void r;
      const snap = sim.snapshot();
      for (const n of ['s1', 's2', 's3']) expect(snap.parts.filter(p => p.at === n).length).toBeLessThanOrEqual(1);
      for (const b of ['b1', 'b2']) expect(snap.parts.filter(p => p.at === b).length).toBeLessThanOrEqual(3);
    }
    // every part's log is a continuous chain: each enter follows the previous node
    const byPart = new Map<number, string[]>();
    for (const e of sim.log) if (e.kind === 'enter' || e.kind === 'create') byPart.set(e.part, [...(byPart.get(e.part) ?? []), e.node]);
    const order = ['in', 's1', 'b1', 's2', 'b2', 's3', 'out'];
    for (const path of byPart.values()) expect(order.slice(0, path.length)).toEqual(path);
  });
  it('rng streams are reproducible and independent per element', () => {
    const r = new Rng(9), a = r.fork('a'), b = r.fork('b');
    expect(new Rng(9).fork('a').next()).toBe(a.next());
    expect(a.next()).not.toBe(b.next());
    const e = new Rng(1); let s = 0; for (let i = 0; i < 20000; i++) s += e.sample({ kind: 'exp', mean: 10 });
    expect(s / 20000).toBeCloseTo(10, 0);
  });
  it('model errors are reported', () => {
    expect(() => new LineSim({ nodes: [{ kind: 'station', id: 's', ct: 1 }], routes: [] })).toThrow(/no outgoing/);
    expect(() => new LineSim({ nodes: [{ kind: 'source', id: 'a' }], routes: [{ from: 'a', to: 'x' }] })).toThrow(/unknown/);
  });
});
