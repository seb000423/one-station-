import { describe, expect, it } from 'vitest';
import { buildDemoLine, simulateLine, LineSim, DEMO_STATIONS, slowestCt, BELT_SPEED } from '@one-twin/engine';

describe('demo line', () => {
  it('builds a valid model in station order with conveyors between stops', () => {
    const d = buildDemoLine();
    expect(d.model.nodes.filter(n => n.kind === 'station')).toHaveLength(DEMO_STATIONS.length);
    for (let i = 1; i < DEMO_STATIONS.length; i++) expect(DEMO_STATIONS[i]!.x).toBeGreaterThan(DEMO_STATIONS[i - 1]!.x);
    expect(() => new LineSim(d.model)).not.toThrow();
  });
  it('deterministic, enough pallets: throughput = 3600 / slowest station (hand calculation)', () => {
    const d = buildDemoLine({ deterministic: true, pallets: 30 });
    const r = simulateLine(d.model, 8 * 3600, { warmup: 3600 });
    expect(r.throughputPerHour).toBeCloseTo(3600 / slowestCt(d.stations), 0);
    expect(r.bottleneck).toBe('E3');
  });
  it('deterministic, few pallets: throughput = pallets / loop time (Little’s law)', () => {
    const d = buildDemoLine({ deterministic: true, pallets: 3 });
    const sim = new LineSim(d.model, { log: true, warmup: 3600 }).run(10 * 3600);
    const r = sim.result();
    // one pallet's round trip: all cycle times + belt travel + return trip (no waiting when pallets are scarce)
    const st = d.stations, belt = (st[st.length - 1]!.x - st[0]!.x) / BELT_SPEED;
    const src = d.model.nodes.find(n => n.id === 'IN') as { carrierReturn: number };
    const loop = st.reduce((a, s) => a + s.ct, 0) + belt + src.carrierReturn;
    expect(r.throughputPerHour).toBeCloseTo((3 / loop) * 3600, 0);
    expect(r.wip).toBeLessThanOrEqual(3);
  });
  it('the real demo run: plausible, reproducible, conserves parts and pallets', () => {
    const d = buildDemoLine();
    const a = new LineSim(d.model, { seed: 1, warmup: 3600, log: 200000 }).run(9 * 3600), r = a.result();
    expect(r.throughputPerHour).toBeGreaterThan(40);
    expect(r.throughputPerHour).toBeLessThan(3600 / 46);
    expect(r.wipNow).toBeLessThanOrEqual(8);
    expect(r.scrapped).toBeGreaterThan(0);
    const c = a.conservation(); expect(c.created).toBe(c.inLine + c.out);
    expect(simulateLine(d.model, 9 * 3600, { seed: 1, warmup: 3600 })).toEqual(r);
  });
  it('more pallets help until the bottleneck saturates', () => {
    const th = (p: number) => simulateLine(buildDemoLine({ pallets: p }).model, 40 * 3600, { seed: 2, warmup: 3600 }).throughputPerHour;
    const t4 = th(4), t8 = th(8), t14 = th(14), t20 = th(20);
    expect(t8).toBeGreaterThan(t4 * 1.3);
    expect(t14).toBeGreaterThan(t8);
    expect(t20 - t14).toBeLessThan(t14 - t8 + 1);
  });
});
