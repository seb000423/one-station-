import { describe, expect, it } from 'vitest';
import { checkLayout, cellGap, obbOverlap, type Cell } from '@one-twin/core';

const cell = (id: string, x: number, y: number, w = 6000, d = 4000, yaw = 0): Cell => { const r = yaw * Math.PI / 180, dir: [number, number] = [Math.cos(r), Math.sin(r)];
  return { id, name: id, c: [x, y], size: [w, d], yaw, inlet: [x - dir[0] * w / 2, y - dir[1] * w / 2], outlet: [x + dir[0] * w / 2, y + dir[1] * w / 2], dir }; };
const flow = (a: string, b: string) => ({ id: `${a}-${b}`, from: `${a}.out`, to: `${b}.in` });

describe('factory layout rules F1–F6', () => {
  it('four cells in a line with 1 m between: no issues', () => {
    const cs = [cell('M01', 0, 0), cell('M02', 7000, 0), cell('M03', 14000, 0), cell('M04', 21000, 0)];
    expect(checkLayout(cs, [flow('M01', 'M02'), flow('M02', 'M03'), flow('M03', 'M04')])).toEqual([]);
  });
  it('F1: a cell moved onto another is an error whose fix pushes it clear by the gap', () => {
    const cs = [cell('M01', 0, 0), cell('M02', 2000, 500)], is = checkLayout(cs, []);
    const f1 = is.find(i => i.rule === 'F1')!; expect(f1.lv).toBe('err'); expect(f1.ids[0]).toBe('M02');
    const by = f1.fix!.moves[0]!.by, moved = [cs[0]!, { ...cs[1]!, c: [cs[1]!.c[0] + by[0], cs[1]!.c[1] + by[1]] as [number, number] }];
    expect(obbOverlap(moved[0]!, moved[1]!).depth).toBeLessThanOrEqual(0); expect(Math.round(cellGap(moved[0]!, moved[1]!))).toBe(600);
  });
  it('F1 sees rotation: a 90° cell beside a straight one overlaps only where the rectangles really meet', () => {
    expect(checkLayout([cell('A', 0, 0), cell('B', 4500, 0, 6000, 4000, 90)], []).some(i => i.rule === 'F1')).toBe(true);
    expect(checkLayout([cell('A', 0, 0), cell('B', 5700, 0, 6000, 4000, 90)], []).some(i => i.rule === 'F1')).toBe(false);
  });
  it('F2: 300 mm between cells warns, the fix opens 600 mm', () => {
    const cs = [cell('M01', 0, 0), cell('M02', 6300, 0)], w = checkLayout(cs, []).find(i => i.rule === 'F2')!; expect(w.lv).toBe('warn');
    const by = w.fix!.moves[0]!.by; expect(Math.round(cellGap(cs[0]!, { ...cs[1]!, c: [6300 + by[0], by[1]] }))).toBe(600);
  });
  it('F5: a flow into a cell that faces away, or back behind the outlet, is flagged with a move fix', () => {
    const back = checkLayout([cell('M01', 0, 0), cell('M02', -8000, 0)], [flow('M01', 'M02')]); expect(back.some(i => i.rule === 'F5' && /뒤로/.test(i.txt))).toBe(true);
    const turned = checkLayout([cell('M01', 0, 0), cell('M02', 4500, 0, 2000, 4000, 180)], [flow('M01', 'M02')]); const f = turned.find(i => i.rule === 'F5')!; expect(f.txt).toMatch(/등지고/);
    expect(checkLayout([cell('M01', 0, 0), cell('M02', 8000, -6000, 6000, 4000, 180)], [flow('M01', 'M02')]).some(i => i.rule === 'F5')).toBe(false); // a U turn with room is a line layout
  });
  it('F6: a straight flow through a third cell, F3 a cell on an aisle, F4 a cell off the slab', () => {
    const is = checkLayout([cell('M01', 0, 0), cell('M02', 14000, 0), cell('M03', 7000, 0)], [flow('M01', 'M02')], { aisles: [{ id: 'a', name: '주통로', poly: [[-10000, 1000], [30000, 1000], [30000, 4000], [-10000, 4000]] }], slab: [[-5000, -5000], [12000, -5000], [12000, 5000], [-5000, 5000]] });
    expect(is.some(i => i.rule === 'F6' && i.ids.includes('M03'))).toBe(true); expect(is.filter(i => i.rule === 'F3').length).toBe(3); expect(is.some(i => i.rule === 'F4' && i.ids[0] === 'M02')).toBe(true);
  });
});
