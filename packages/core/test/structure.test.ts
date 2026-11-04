import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkStructure, findMounts, withRoles, type Part } from '@one-twin/core';

// the four partner stations (js/plant-data.js is a browser script: window.ONE_PLANT_DATA = {...})
const src = readFileSync(new URL('../../../js/plant-data.js', import.meta.url), 'utf8');
const DATA = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)) as Record<string, { parts: [string, string, string, number[], number[]][] }>;
const station = (k: string): Part[] => DATA[k]!.parts.map(([, name, kind, size, pos], i) => ({ id: `${k}-${i}`, name, kind, size: size as [number, number, number], pos: pos as [number, number, number] }));
const move = (ps: Part[], id: string, by: number[]) => ps.map(p => (p.id === id ? { ...p, pos: [p.pos[0] + by[0]!, p.pos[1] + by[1]!, p.pos[2] + by[2]!] as [number, number, number] } : p));
const find = (ps: Part[], name: string, n = 0) => ps.filter(p => p.name === name)[n]!;

describe('design structure rules on the four reference stations', () => {
  for (const k of ['assembly', 'paste', 'brazing', 'inspection']) it(`${k}: as built, no errors`, () => {
    const ps = station(k), errs = checkStructure(ps, { ref: ps }).filter(i => i.lv === 'err');
    expect(errs.map(e => e.txt)).toEqual([]);
  });
  it('roles and hosts: lamp on its frame top, control box on a side, robots carried, furnaces on the floor', () => {
    const ps = withRoles(station('inspection')), m = findMounts(ps);
    const lamp = find(ps, 'OP80 경광등'), frame = find(ps, 'OP80 프레임');
    expect(lamp.role).toBe('top'); expect(m.get(lamp.id)).toMatchObject({ host: frame.id, rel: 'top' });
    const box = find(ps, 'OP90 제어함'); expect(box.role).toBe('side'); expect(m.get(box.id)!.rel).toBe('side');
    const br = withRoles(station('brazing')); expect(br.every(p => p.role === 'floor')).toBe(true);
    const pa = withRoles(station('paste')); expect(pa.filter(p => p.role === 'seat').length).toBe(10);
  });
  it('a lamp lifted off its frame, a box pulled off its side, a chair moved away, a robot moved off: reported', () => {
    const ref = station('inspection');
    let ps = move(ref, find(ref, 'OP80 경광등').id, [0, 0, 300]);
    expect(checkStructure(ps, { ref }).some(i => i.rule === 'R1')).toBe(true);
    ps = move(ref, find(ref, 'OP90 제어함').id, [0, -800, 0]);
    expect(checkStructure(ps, { ref }).some(i => i.rule === 'R3')).toBe(true);
    ps = move(ref, find(ref, 'OP90 로봇').id, [-6000, 0, 0]);
    expect(checkStructure(ps, { ref }).some(i => i.rule === 'R5')).toBe(true);
    const pr = station('paste'); ps = move(pr, find(pr, '의자').id, [0, 6000, 0]);
    expect(checkStructure(ps, { ref: pr }).some(i => i.rule === 'R6')).toBe(true);
    const br = station('brazing'); ps = move(br, find(br, '진공로 부대설비').id, [0, 15000, 0]);
    expect(checkStructure(ps, { ref: br }).some(i => i.rule === 'R7' || i.rule === 'R4')).toBe(true);
  });
  it('two furnaces pushed into each other: overlap; the fix of a floating lamp puts it back', () => {
    const br = station('brazing'), f = br.filter(p => p.name === '진공 브레이징로');
    const d = f[1]!.pos[0] - f[0]!.pos[0], ps = move(br, f[1]!.id, [-Math.sign(d) * 3000, 0, 0]);
    expect(checkStructure(ps, { ref: br }).some(i => i.rule === 'R4')).toBe(true);
    const ref = station('inspection'), lamp = find(ref, 'OP80 경광등'), up = move(ref, lamp.id, [0, 0, 250]);
    const fix = checkStructure(up, { ref }).find(i => i.rule === 'R1')!.fix!; expect(fix.moves[0]!.by[2]).toBe(-250);
  });
});
