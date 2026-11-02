import { describe, expect, it } from 'vitest';
import { buildLayoutLine, simulateLine, LineSim, type LayoutInput } from '@one-twin/engine';

// a straight line: 8 m belt (0.3 m/s), items 0.4 m + 0.05 m gap, a robot at 3 m (10 s) and a check at 6 m (6 s)
const straight = (interval = 4): LayoutInput => ({
  pitch: 0.45,
  belts: [{ id: 'b1', name: '컨베이어 1', len: 8, speed: 0.3, next: null, source: { interval }, sink: true }],
  stations: [{ id: 's1', name: '로봇 1', belt: 'b1', s: 3, ct: 10 }, { id: 's2', name: '검사', belt: 'b1', s: 6, ct: 6 }],
});

describe('a BUILDER line as a DES model', () => {
  it('splits the belt at the stations: source → conveyor → station → conveyor → station → conveyor → sink', () => {
    const L = buildLayoutLine(straight());
    expect(L.warnings).toEqual([]);
    expect(L.model.nodes.map(n => n.kind)).toEqual(['source', 'buffer', 'station', 'buffer', 'station', 'buffer', 'sink']);
    const bufs = L.model.nodes.filter(n => n.kind === 'buffer') as { id: string; cap: number; transit?: number }[];
    // 0–3 m from the source (first place one pitch before the stop, the last one a pitch clear of the entry)
    expect(bufs[0]!.transit).toBeCloseTo(3 / 0.3, 6);
    expect(bufs[0]!.cap).toBe(Math.floor((3 - 0.9) / 0.45) + 1);
    // 3–6 m between the two stations: clear of both stops
    expect(bufs[1]!.cap).toBe(Math.floor((3 - 0.9) / 0.45) + 1);
    expect(L.stations.map(s => s.turnover)).toEqual([1.5, 1.5]);
    expect(L.paths[bufs[1]!.id]!.pieces).toEqual([{ belt: 'b1', s0: 3, s1: 6 }]);
  });
  it('deterministic throughput = hand calculation (slowest station cycle incl. turnover, or the supply)', () => {
    const r = simulateLine(buildLayoutLine(straight(4), { deterministic: true }).model, 4 * 3600, { warmup: 1800 });
    expect(r.throughputPerHour).toBeCloseTo(3600 / (10 + 1.5), 0);
    const slow = simulateLine(buildLayoutLine(straight(20), { deterministic: true }).model, 4 * 3600, { warmup: 1800 });
    expect(slow.throughputPerHour).toBeCloseTo(3600 / 20, 0);
    expect(r.bottleneck).toBe('s1');
  });
  it('follows belt to belt, through a side merge, to the sink; two sources share the merged belt', () => {
    const L = buildLayoutLine({
      pitch: 0.45,
      belts: [
        { id: 'a', name: 'A', len: 4, speed: 0.4, next: { id: 'm', s: 0 }, source: { interval: 10 } },
        { id: 'm', name: 'M', len: 6, speed: 0.4, next: null, sink: true },
        { id: 'c', name: 'C', len: 3, speed: 0.4, next: { id: 'm', s: 2 }, source: { interval: 12 } },
      ],
      stations: [{ id: 'p', name: '프레스', belt: 'm', s: 4.5, ct: 4 }],
    });
    expect(L.warnings).toEqual([]);
    const ids = L.model.nodes.map(n => n.id);
    // A runs 4 m + 2 m of M to the merge point; C joins there; the merged stretch runs to the press
    const toPress = L.model.routes.find(r => r.to === 'p')!.from;
    expect(L.paths[toPress]!.pieces).toEqual([{ belt: 'm', s0: 2, s1: 4.5 }]);
    // both feed one merge gate (a zero-time station, one item per pitch) that leads into the merged stretch
    expect(L.gates.map(g => g.id)).toEqual(['MG1']);
    expect(L.model.routes).toContainEqual({ from: 'MG1', to: toPress });
    expect(L.model.routes.filter(r => r.to === 'MG1').length).toBe(2);
    expect(L.gates[0]!.into.length).toBe(2);
    const aRun = L.model.routes.find(r => r.from === 'IN1')!.to;
    expect(L.paths[aRun]!.pieces).toEqual([{ belt: 'a', s0: 0, s1: 4 }, { belt: 'm', s0: 0, s1: 2 }]);
    expect(L.stations.map(s => s.id)).toEqual(['p']); // the gate is not a process
    expect(ids.filter(i => i.startsWith('OUT')).length).toBe(1);
    const sim = new LineSim(L.model, { seed: 1 }).run(3600), c = sim.conservation();
    expect(c.created).toBe(c.inLine + c.out);
    expect(sim.result().produced).toBeGreaterThan(500);
  });
  it('a robot moves the item from the end of one belt onto another (not joined): the line carries on from there', () => {
    const L = buildLayoutLine({
      pitch: 0.45,
      belts: [
        { id: 'a', name: 'A', len: 3, speed: 0.3, next: null, source: { interval: 8 } },
        { id: 'b', name: 'B', len: 4, speed: 0.3, next: null, sink: true },
      ],
      stations: [{ id: 'r', name: '이송 로봇', belt: 'a', s: 2.75, ct: 6, to: { belt: 'b', s: 0.25 } }, { id: 'q', name: '검사', belt: 'b', s: 2.5, ct: 5 }],
    });
    expect(L.warnings).toEqual([]);
    const after = L.model.routes.find(r => r.from === 'r')!.to;
    expect(L.paths[after]!.pieces).toEqual([{ belt: 'b', s0: 0.25, s1: 2.5 }]);
    expect(L.stations.map(s => s.id)).toEqual(['r', 'q']);
    const sim = new LineSim(L.model, { seed: 1 }).run(3600), c = sim.conservation();
    expect(c.created).toBe(c.inLine + c.out);
    expect(sim.result().produced).toBeGreaterThan(400);
  });
  it('two close stations link directly (no waiting place); open ends and loops are reported, not crashed', () => {
    const L = buildLayoutLine({ pitch: 0.45, belts: [{ id: 'b', name: 'B', len: 5, speed: 0.3, next: null, source: { interval: 5 } }],
      stations: [{ id: 'x', name: 'X', belt: 'b', s: 2, ct: 5 }, { id: 'y', name: 'Y', belt: 'b', s: 2.6, ct: 5 }] });
    expect(L.model.routes).toContainEqual({ from: 'x', to: 'y' });
    expect(L.stations.find(s => s.id === 'y')!.approach).toBeCloseTo(0.6 / 0.3, 6);
    expect(L.warnings.some(w => w.includes('배출로 보았습니다'))).toBe(true);
    const loop = buildLayoutLine({ pitch: 0.45, belts: [
      { id: 'a', name: 'A', len: 3, speed: 0.3, next: { id: 'b', s: 0 }, source: { interval: 6 } },
      { id: 'b', name: 'B', len: 3, speed: 0.3, next: { id: 'c', s: 0 } },
      { id: 'c', name: 'C', len: 3, speed: 0.3, next: { id: 'b', s: 1 } }], stations: [] });
    expect(loop.warnings.some(w => w.includes('고리'))).toBe(true);
    expect(() => new LineSim(loop.model, { seed: 1 }).run(600)).not.toThrow();
  });
  it('per-station overrides (scenario / optimiser) change the cycle', () => {
    const L = buildLayoutLine(straight(4), { deterministic: true, stations: { s1: { ct: 5 } } });
    const r = simulateLine(L.model, 4 * 3600, { warmup: 1800 });
    expect(r.throughputPerHour).toBeCloseTo(3600 / (6 + 1.5), 0);
  });
});

describe('BUILDER line: hand calculation, scenarios and the optimiser', () => {
  it('layoutCapacity matches the deterministic run; runScenario / optimize take the line builder', async () => {
    const { layoutCapacity, runScenario, compare, optimize, ctGene } = await import('@one-twin/engine');
    const input = straight(4), L = buildLayoutLine(input, { deterministic: true }), c = layoutCapacity(L);
    expect(c.station!.id).toBe('s1');
    expect(simulateLine(L.model, 4 * 3600, { warmup: 1800 }).throughputPerHour).toBeCloseTo(c.perHour, 0);
    const build = (p: { stations?: Record<string, { ct?: number }> }) => buildLayoutLine(input, p).model;
    const run = { horizon: 3 * 3600, warmup: 1800, seeds: [1, 2, 3] };
    const a = runScenario('현재', {}, run, build), b = runScenario('로봇 빠르게', { stations: { s1: { ct: 6 } } }, run, build);
    expect(compare(a, b).find(r => r.kpi === 'throughputPerHour')!.significant).toBe(true);
    const h = optimize({ genes: [ctGene('s1', '로봇 1 단축', 10)], population: 4, generations: 3, seed: 1, horizon: 2 * 3600, warmup: 1800, evalSeeds: [1], costPerUnit: { ct_s1: 1 }, build });
    expect(h[h.length - 1]!.best.genes[0]).toBeGreaterThan(0);
  });
});

describe('BUILDER line: merges and the no-magic rules', () => {
  // two sources, a side feeder joining the main belt (0.35 m across), a slow assembly before the merge, a check after it
  const merged = (assy = 20): LayoutInput => ({
    pitch: 0.45,
    belts: [
      { id: 'c1', name: '투입', len: 6, speed: 0.3, next: { id: 'c2', s: 0 }, source: { interval: 5 } },
      { id: 'c2', name: '배출', len: 6, speed: 0.3, next: null, sink: true },
      { id: 'c3', name: '보조', len: 3, speed: 0.3, next: { id: 'c2', s: 4, gap: 0.35 }, source: { interval: 15 } },
    ],
    stations: [{ id: 'r1', name: '로봇', belt: 'c1', s: 3, ct: 8 }, { id: 'w1', name: '조립', belt: 'c2', s: 1.6, ct: assy }, { id: 'w2', name: '검사', belt: 'c2', s: 5.3, ct: 9 }],
  });
  it('the side feeder runs across onto the main belt; the gate lets one item at a time through, two pitches apart', () => {
    const L = buildLayoutLine(merged());
    const feed = L.model.routes.find(r => r.from === 'IN2')!.to;
    expect(L.paths[feed]!.pieces).toEqual([{ belt: 'c3', s0: 0, s1: 3 }, { belt: 'c3', s0: 3, s1: 3.35 }]);
    expect(L.gates[0]!.turnover).toBeCloseTo(2 * 0.45 / 0.3, 9);
  });
  it('hand calculation follows the flow through the merge and matches the deterministic run', async () => {
    const { layoutCapacity } = await import('@one-twin/engine');
    for (const assy of [20, 6]) {
      const L = buildLayoutLine(merged(assy), { deterministic: true }), c = layoutCapacity(L);
      const r = simulateLine(L.model, 6 * 3600, { warmup: 3600 });
      expect(r.throughputPerHour).toBeCloseTo(c.perHour, -0.5); // within ±1.5 / h
    }
    const c = layoutCapacity(buildLayoutLine(merged(20), { deterministic: true }));
    // the assembly passes 3600 / 21.5, the feeder adds 3600 / 15: more than the check after the merge takes (3600 / 10.5)
    expect(c.limit).toBe('station');
    expect(c.station!.id).toBe('w2');
    expect(c.perHour).toBeCloseTo(3600 / 10.5, 6);
    const free = layoutCapacity(buildLayoutLine({ ...merged(20), stations: merged(20).stations.filter(s => s.id !== 'w2') }, { deterministic: true }));
    expect(free.perHour).toBeCloseTo(3600 / 21.5 + 3600 / 15, 6); // without it: the assembly's rate plus the feeder's supply
  });
  it('no magic: every place holds what fits, a gate or station one item, nothing waits out of sight at a source', () => {
    for (const [input, params] of [[merged(), {}], [merged(6), {}], [straight(2), { stations: { s1: { okRate: 0.8, mtbf: 600, mttr: 120 } } }]] as const) {
      const L = buildLayoutLine(input, params), nodes = new Map(L.model.nodes.map(n => [n.id, n]));
      const sim = new LineSim(L.model, { seed: 5, log: 500_000 }), bad: string[] = [];
      for (let t = 0; t <= 2 * 3600; t += 0.5) {
        sim.run(t);
        const s = sim.snapshot(), at = new Map<string, number>();
        for (const p of s.parts) at.set(p.at, (at.get(p.at) ?? 0) + 1);
        for (const [id, k] of at) {
          const n = nodes.get(id)!;
          if (n.kind === 'source' && k > 0) bad.push(`t=${t}: ${k} parts at ${id}`);
          if (n.kind === 'station' && k > 1) bad.push(`t=${t}: ${k} parts at ${id}`);
          if (n.kind === 'buffer' && k > n.cap) bad.push(`t=${t}: ${id} over capacity`);
        }
        const c = sim.conservation(); if (c.created !== c.inLine + c.out) bad.push(`t=${t}: not conserved`);
        if (bad.length > 5) break;
      }
      expect(bad).toEqual([]);
      // a gate or station starts on the next item no sooner than its turnover after the last one left
      const left = new Map<string, number>(), stationOf = new Map<number, string>(), early: string[] = [];
      const turn = new Map<string, number>([...L.stations.map(x => [x.id, x.turnover] as const), ...L.gates.map(g => [g.id, g.turnover] as const)]);
      for (const e of sim.log) {
        if (e.kind === 'enter') { const prev = stationOf.get(e.part); if (prev) left.set(prev, e.t); stationOf.set(e.part, turn.has(e.node) ? e.node : ''); }
        if (e.kind === 'start' && left.has(e.node) && e.t < left.get(e.node)! + turn.get(e.node)! - 1e-6) early.push(`${e.node} at ${e.t}`);
      }
      expect(early).toEqual([]);
      expect(sim.result().produced).toBeGreaterThan(100);
    }
  });
});
