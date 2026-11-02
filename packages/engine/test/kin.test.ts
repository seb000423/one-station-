import { describe, expect, it } from 'vitest';
import { trapezoid, positionAt, ptp, onoffTime, SignalTable, OnOffAxis, SequenceRunner, runTicks, buildGraph, astar, nearest, travelTime } from '@one-twin/engine';

describe('kinematics (R1 §8.5)', () => {
  it('trapezoid and triangle times', () => {
    expect(trapezoid(1000, 500, 1000).T).toBeCloseTo(2.5, 9); // 0.5 + 1.5 + 0.5
    expect(trapezoid(100, 500, 1000).T).toBeCloseTo(2 * Math.sqrt(0.1), 9); // never reaches vmax
    const p = trapezoid(-1000, 500, 1000);
    expect(positionAt(p, p.T / 2)).toBeCloseTo(-500, 6);
    expect(positionAt(p, p.T)).toBe(-1000);
  });
  it('PTP: joints arrive together at the slowest joint’s time', () => {
    const r = ptp([0, 0], [90, 10], [{ vmax: 180, amax: 360 }, { vmax: 180, amax: 360 }]);
    expect(r.T).toBeCloseTo(trapezoid(90, 180, 360).T, 9);
    for (const p of r.profiles) { expect(p.T).toBeCloseTo(r.T, 9); expect(positionAt(p, r.T)).toBeCloseTo(p.d, 9); }
    expect(r.profiles[1]!.vpeak).toBeLessThan(180);
  });
  it('ON/OFF cylinder time', () => expect(onoffTime(50, 250, 0.1)).toBeCloseTo(0.3, 9));
});

describe('signal layer: a cylinder station runs its sequence on tags', () => {
  it('cycle = FWD move + dwell + BWD move, limit switches follow the axis', () => {
    const sig = new SignalTable();
    const cyl = new OnOffAxis('CYL', 100, 200, 2000); cyl.init(sig);
    sig.define('START', 1);
    const seq = new SequenceRunner([
      { id: 's1', wait: [{ tag: 'START', value: true }, { tag: 'CYL_BWD_LS', value: true }], set: [{ tag: 'CYL_BWD', value: false }, { tag: 'CYL_FWD', value: true }] },
      { id: 's2', wait: [{ tag: 'CYL_FWD_LS', value: true }], delay: 0.5 },
      { id: 's3', set: [{ tag: 'CYL_FWD', value: false }, { tag: 'CYL_BWD', value: true }] },
      { id: 's4', wait: [{ tag: 'CYL_BWD_LS', value: true }] },
    ]);
    const trace: string[] = [];
    sig.on((tag, v, t) => { if (tag.endsWith('_LS') && v) trace.push(`${tag}@${t.toFixed(2)}`); });
    runTicks(sig, [seq, cyl], 6);
    const move = trapezoid(100, 200, 2000).T; // 0.6 s
    expect(seq.cycles).toBeGreaterThanOrEqual(3);
    const ct = seq.cycleTimes[1]!;
    expect(Math.abs(ct - (2 * move + 0.5))).toBeLessThan(0.05); // within a few 10 ms ticks
    expect(trace[0]).toMatch(/^CYL_FWD_LS@0\.6/);
  });
  it('a stuck step raises an alarm after its timeout', () => {
    const sig = new SignalTable(); sig.define('DOOR_CLOSED', 0);
    const seq = new SequenceRunner([{ id: 'wait-door', wait: [{ tag: 'DOOR_CLOSED', value: true }], timeout: 1 }]);
    runTicks(sig, [seq], 2);
    expect(seq.alarm).toMatch(/wait-door/);
  });
});

describe('navigation', () => {
  it('A* over drawn paths, one-way respected, travel time with corners', () => {
    const g = buildGraph([{ points: [[0, 0], [10000, 0], [10000, 5000]] }, { points: [[0, 0], [0, 5000], [10000, 5000]], oneway: true }]);
    const a = nearest(g, [0, 0]), b = nearest(g, [10000, 5000]);
    expect(astar(g, a, b)!.length).toBe(15000);
    const back = astar(g, b, a)!; // must not use the one-way side backwards
    expect(back.path.map(i => g.nodes[i])).toEqual([[10000, 5000], [10000, 0], [0, 0]]);
    const T = travelTime(g, back.path, { vmax: 1000, amax: 500, turnRate: 90 });
    expect(T).toBeCloseTo(trapezoid(5000, 1000, 500).T + 1 + trapezoid(10000, 1000, 500).T, 6);
  });
});
