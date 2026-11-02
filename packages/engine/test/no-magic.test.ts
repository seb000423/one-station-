/**
 * "No magic" regression tests on the DES the 3D view replays (project rule: every part is one object that
 * travels the whole line, nothing appears, disappears, overlaps or teleports, every handoff is visible).
 * The renderer draws exactly what the DES says, so these physical rules are checked on the DES itself:
 * every pallet is in one place, no place holds more than fits, a stop takes the next pallet only after its
 * turnover, every part visits every station in order, and parts / pallets are conserved.
 * The 3D side (pallet gaps, no jumps between frames) is audited in the browser: npm run audit:sim.
 */
import { describe, expect, it } from 'vitest';
import { buildDemoLine, LineSim, type DemoParams } from '@one-twin/engine';

const CASES: [string, DemoParams][] = [
  ['8 pallets (the demo default)', { pallets: 8 }],
  ['4 pallets (pallet-limited)', { pallets: 4 }],
  ['24 pallets (station-limited, queues full)', { pallets: 24 }],
  ['many NG at the weighing check and the leak test', { pallets: 12, stations: { A5: { okRate: 0.6 }, E3: { okRate: 0.6 } } }],
  ['faster bottlenecks (an optimised line)', { pallets: 23, stations: { E3: { ct: 18.56 }, B6: { ct: 18.47 } } }],
  ['deterministic', { pallets: 16, deterministic: true }],
];

describe('no magic: physical rules of the replayed DES', () => {
  for (const [name, params] of CASES) it(name, () => {
    const line = buildDemoLine(params), sim = new LineSim(line.model, { seed: 3, log: 2_000_000 });
    const nodes = new Map(line.model.nodes.map(n => [n.id, n])), order = line.model.nodes.map(n => n.id);
    const N = line.pool.count, H = 3 * 3600, bad: string[] = [];
    const fail = (t: number, msg: string) => { if (bad.length < 5) bad.push(`t=${t}: ${msg}`); };
    for (let t = 0; t <= H; t += 1) {
      sim.run(t);
      const s = sim.snapshot(), pl = s.pools.PAL!;
      // every pallet is in exactly one place: under a part, on the way back, in front of the lift, or on the lift
      const places = [...s.parts.filter(p => p.carrier !== null).map(p => p.carrier!), ...pl.returning.map(r => r.id), ...pl.lower.map(l => l.id), ...(pl.top && pl.top.part === null ? [pl.top.id] : [])];
      if (places.length !== N || new Set(places).size !== N) fail(t, `pallets ${places.join(',')}`);
      // no conveyor holds more pallets than its places (pallets about to set off still count), a stop holds one
      for (const [id, list] of Object.entries(s.buffers)) { const b = nodes.get(id)!; if (b.kind === 'buffer' && list.length > b.cap) fail(t, `${id} over capacity`); }
      const atStation = new Set<string>();
      for (const p of s.parts) if (nodes.get(p.at)?.kind === 'station') { if (atStation.has(p.at)) fail(t, `two parts at ${p.at}`); atStation.add(p.at); }
      // nothing is created out of thin air: parts in + parts out = parts made
      const c = sim.conservation(); if (c.created !== c.inLine + c.out) fail(t, 'parts not conserved');
    }
    expect(bad).toEqual([]);
    // every part goes through the nodes in line order, none skipped (a rejected part's empty pallet runs on)
    const seq = new Map<number, string[]>();
    for (const e of sim.log) if (e.kind === 'enter') (seq.get(e.part) ?? seq.set(e.part, []).get(e.part)!).push(e.node);
    const skipped = [...seq].filter(([, path]) => { const i0 = order.indexOf(path[0]!); return path.some((n, i) => n !== order[i0 + i]); }).map(([p]) => p);
    expect(skipped).toEqual([]);
    // a stop takes the next pallet no sooner than its turnover after the last one left
    const lastLeft = new Map<string, number>(), stationOf = new Map<number, string>(), early: string[] = [];
    for (const e of sim.log) {
      if (e.kind === 'enter') {
        const prev = stationOf.get(e.part); if (prev) lastLeft.set(prev, e.t);
        const n = nodes.get(e.node); stationOf.set(e.part, n?.kind === 'station' ? e.node : '');
      }
      if (e.kind === 'start') {
        const n = nodes.get(e.node)!, left = lastLeft.get(e.node);
        if (n.kind === 'station' && left !== undefined && n.turnover && e.t < left + n.turnover - 1e-6) early.push(`${e.node} at ${e.t.toFixed(2)}`);
      }
    }
    expect(early.slice(0, 5)).toEqual([]);
    expect(sim.result().produced).toBeGreaterThan(0);
  });
});
