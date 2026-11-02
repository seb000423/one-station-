import { describe, expect, it } from 'vitest';
import { buildDemoLine, simulateLine, LineSim, DEMO_STATIONS, LINE_MAP, slowestCycle, palletLoop } from '@one-twin/engine';

describe('demo line (times measured from the 3D motion)', () => {
  it('builds a valid model: tote → loader → lane → robot A (pallet) → 29 stops → carton', () => {
    const d = buildDemoLine();
    expect(d.model.nodes.filter(n => n.kind === 'station')).toHaveLength(DEMO_STATIONS.length);
    expect(DEMO_STATIONS.map(s => s.id).slice(2)).toEqual(LINE_MAP.stations);
    expect(() => new LineSim(d.model)).not.toThrow();
    // measured values are physical: every station and conveyor takes time; where two stops are too close for a pallet
    // in between there is no waiting place (the pallet waits on the stop before and then travels straight on)
    for (const s of DEMO_STATIONS) expect(s.ct).toBeGreaterThan(0.5);
    for (const [id, c] of Object.entries(LINE_MAP.des.conveyors)) {
      expect(c.transit).toBeGreaterThan(1); expect(c.places).toBeGreaterThanOrEqual(0);
      const buf = d.model.nodes.find(n => n.id === 'CV_' + id), st = d.model.nodes.find(n => n.id === id);
      if (c.places === 0) { expect(buf).toBeUndefined(); expect(st && st.kind === 'station' && st.approach).toBe(c.transit); }
      else expect(buf && buf.kind === 'buffer' && buf.cap).toBe(c.places);
    }
    expect(Object.values(LINE_MAP.des.conveyors).filter(c => c.places === 0).length).toBeGreaterThan(0);
  });
  it('deterministic, enough pallets: throughput = 3600 / slowest station cycle (hand calculation)', () => {
    const d = buildDemoLine({ deterministic: true, pallets: 30 });
    const r = simulateLine(d.model, 10 * 3600, { warmup: 3600 }), slow = slowestCycle(d.stations);
    expect(r.throughputPerHour).toBeCloseTo(3600 / slow.cycle, 0);
    expect(r.bottleneck).toBe(slow.id);
  });
  it('deterministic, few pallets: throughput = pallets / round trip (Little’s law)', () => {
    const d = buildDemoLine({ deterministic: true, pallets: 3 });
    const r = simulateLine(d.model, 12 * 3600, { warmup: 3600 });
    expect(r.throughputPerHour).toBeCloseTo((3 / palletLoop(d)) * 3600, 0);
  });
  it('the real demo run: plausible, reproducible, conserves parts and pallets', () => {
    const d = buildDemoLine();
    const a = new LineSim(d.model, { seed: 1, warmup: 3600, log: 400000 }).run(9 * 3600), r = a.result();
    expect(r.throughputPerHour).toBeGreaterThan(50);
    expect(r.throughputPerHour).toBeLessThan(3600 / slowestCycle(d.stations).cycle);
    expect(r.scrapped).toBeGreaterThan(0);
    const c = a.conservation(); expect(c.created).toBe(c.inLine + c.out);
    // every pallet is somewhere: carrying a part, on the way back, in front of the lift or at the merge stop
    const s = a.snapshot(), pl = s.pools.PAL!;
    const carried = s.parts.filter(p => p.carrier !== null).length;
    expect(carried + pl.returning.length + pl.lower.length + (pl.top && pl.top.part === null ? 1 : 0)).toBe(8);
    expect(new Set(s.parts.filter(p => p.carrier !== null).map(p => p.carrier)).size).toBe(carried);
    expect(simulateLine(d.model, 9 * 3600, { seed: 1, warmup: 3600 })).toEqual(r);
  });
  it('NG parts are taken off at the next NG stop; the empty pallet runs on and leaves at the end', () => {
    const d = buildDemoLine({ stations: { A5: { okRate: 0.5 } } });
    const sim = new LineSim(d.model, { seed: 4, log: true }).run(4 * 3600);
    const rejects = sim.log.filter(e => e.kind === 'reject');
    expect(rejects.length).toBeGreaterThan(5);
    expect(new Set(rejects.map(e => e.node))).toEqual(new Set(['A6', 'E6'].filter(n => rejects.some(e => e.node === n))));
    for (const e of rejects.slice(0, 5)) {
      const later = sim.log.filter(x => x.part === e.part && x.t > e.t && x.kind === 'enter').map(x => x.node);
      if (later.length) expect(later[later.length - 1] === 'OUT' || later.length < 60).toBe(true);
      expect(sim.log.some(x => x.part === e.part && x.kind === 'exit')).toBe(false);
    }
  });
  it('the carton is changed after every third cooler; the tote after every eighth core', () => {
    const d = buildDemoLine({ deterministic: true, pallets: 20 });
    const sim = new LineSim(d.model, { log: true }).run(3 * 3600);
    const packed = sim.log.filter(e => e.kind === 'exit').length, setups = sim.log.filter(e => e.kind === 'setup' && e.node === 'E7').length;
    expect(setups).toBe(Math.floor(packed / 3));
    const created = sim.log.filter(e => e.kind === 'create').map(e => e.t);
    for (let i = 8; i < created.length; i += 8) expect(created[i]! - created[i - 1]!).toBeGreaterThanOrEqual(LINE_MAP.des.tote.gap - 1e-6);
  });
  it('more pallets help until the bottleneck saturates', () => {
    const th = (p: number) => simulateLine(buildDemoLine({ pallets: p }).model, 30 * 3600, { seed: 2, warmup: 3600 }).throughputPerHour;
    const t4 = th(4), t8 = th(8), t14 = th(14), t24 = th(24);
    expect(t8).toBeGreaterThan(t4 * 1.5);
    expect(t14).toBeGreaterThan(t8 * 1.3);
    expect(t24 - t14).toBeLessThan(t14 - t8);
  });
});
