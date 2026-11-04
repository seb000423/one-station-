import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkStructure, findMounts, placePart, snapPlace, withRoles, classify, type Part, type SlotKind } from '@one-twin/core';
import { StructureCatalog, STRUCTURE_CATALOG } from '@one-twin/schema';

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
    expect(checkStructure(ps, { ref }).some(i => (i.rule === 'R1' || i.rule === 'R3') && i.lv === 'err')).toBe(true);
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

describe('proof: the four stations rebuilt from an empty cell, one object at a time, by the slot rules only', () => {
  for (const k of ['assembly', 'paste', 'brazing', 'inspection']) it(`${k}: same host, same place`, () => {
    const ref = withRoles(station(k)), M = findMounts(ref), depth = (id: string): number => { const h = M.get(id)?.host; return h ? 1 + depth(h) : 0; };
    const order = [...ref].sort((a, b) => depth(a.id) - depth(b.id)); const built: Part[] = []; const bad: string[] = []; let zOff = 0, snapped = 0, warns = 0;
    for (const p of order) { const m = M.get(p.id)!, host = m.host, face = (m.rel === 'top' ? 'top' : m.rel === 'side' ? 'side' : m.rel === 'in' ? 'inside' : p.role === 'seat' ? 'front' : 'floor') as SlotKind;
      const at: [number, number, number] = face === 'side' ? [p.pos[0], p.pos[1], p.pos[2] + p.size[2] / 2] : [p.pos[0], p.pos[1], p.pos[2]];
      const nearDesk = face === 'front' ? built.filter(o => o.cls === 'desk').sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[1] - p.pos[1]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[1] - p.pos[1]))[0] : null;
      const r = placePart(built, { ...p, pos: [0, 0, 0] }, { at, face, host: nearDesk ? nearDesk.id : host });
      if (!r.ok) { bad.push(`${p.name}: ${r.why}`); continue; }
      if (r.host !== host) bad.push(`${p.name}: host ${r.host} ≠ ${host}`);
      if (r.why) warns++;
      const xy = Math.hypot(r.pos[0] - p.pos[0], r.pos[1] - p.pos[1]); if (xy > 50 && xy <= (face === 'front' ? 900 : 400) && (face === 'side' || face === 'front')) snapped++; else if (xy > 50) bad.push(`${p.name}: xy off ${Math.round(Math.hypot(r.pos[0] - p.pos[0], r.pos[1] - p.pos[1]))}`);
      if (Math.abs(r.pos[2] - p.pos[2]) > 400) bad.push(`${p.name}: z off ${Math.round(r.pos[2] - p.pos[2])}`); else if (Math.abs(r.pos[2] - p.pos[2]) > 20) zOff++;
      built.push({ ...p, pos: r.pos, yaw: r.yaw }); }
    if (bad.length) console.log("##" + k + "\n" + bad.join("\n")); expect(bad).toEqual([]); expect(built.length).toBe(ref.length);
    expect(checkStructure(built, { ref: built }).filter(i => i.lv === 'err').map(i => i.txt)).toEqual([]);
    const vsRef = checkStructure(built, { ref }).filter(i => i.lv === 'err').length;
    console.log(`${k}: ${built.length} objects rebuilt, ${zOff} snapped to the host top instead of a bracket height, ${snapped} pulled to the face, ${warns} warnings, ${vsRef} differences from the reference`);
  });
  it('wrong slots are refused with a reason; a chair goes in front of its desk; trays stack', () => {
    const ref = station('inspection'), frame = find(ref, 'OP80 프레임'), box = find(ref, 'OP80 제어함'), lamp = find(ref, 'OP80 경광등');
    expect(placePart(ref, { ...box, id: 'new' }, { at: [frame.pos[0], frame.pos[1], 0], face: 'top', host: frame.id }).why).toMatch(/옆면/);
    expect(placePart(ref, { ...lamp, id: 'new' }, { at: [0, 0, 0], face: 'floor' }).why).toMatch(/바닥에 놓을 수 없습니다/);
    const pr = station('paste'), desk = find(pr, '작업대'), chair = find(pr, '의자');
    const r = placePart(pr.filter(p => p.name !== '의자'), { ...chair, id: 'c' }, { at: [desk.pos[0], desk.pos[1], desk.size[2]], face: 'top', host: desk.id });
    expect(r.ok).toBe(true); expect(r.host).toBe(null); expect(Math.max(...gaps2(r.pos, desk))).toBeLessThan(450);
    const asm = station('assembly'), tray = find(asm, '트레이', 2);
    const t2 = placePart(asm, { ...tray, id: 't2' }, { at: [tray.pos[0], tray.pos[1], tray.pos[2] + tray.size[2]], face: 'top', host: tray.id });
    expect(t2.pos[2] - tray.pos[2]).toBe(315);
  });
});
const gaps2 = (pos: number[], h: Part) => [Math.abs(pos[0]! - h.pos[0]) - h.size[0] / 2, Math.abs(pos[1]! - h.pos[1]) - h.size[1] / 2];

describe('design structure catalogue (platform default, packages/schema)', () => {
  it('is valid and every verified pair names known classes', () => {
    const cat = StructureCatalog.parse(STRUCTURE_CATALOG), known = new Set(cat.classes.map(c => c.cls));
    for (const pairs of Object.values(cat.verified)) for (const pr of pairs) if (pr !== '*') for (const c of pr.split('>')) expect(known.has(c), pr).toBe(true);
    expect(cat.classes.length).toBeGreaterThan(25);
  });
  it('classifies by the most specific keyword and knows standard industrial objects', () => {
    expect(classify('진공로 부대설비').cls).toBe('utility'); expect(classify('회전 테이블').cls).toBe('rotary'); expect(classify('PLC 모듈', undefined, 800).cls).toBe('device');
    expect(classify('안전 펜스 패널', undefined, 0).cls).toBe('fence'); expect(classify('로봇 받침대').cls).toBe('column'); expect(classify('컨베이어 1').cls).toBe('conveyor');
  });
  it('a stored class wins over the name: a 로봇 단상 block classed frame carries a robot, whatever it is called', () => {
    const ped: Part = { id: 'p', name: '로봇 단상 1', cls: 'frame', size: [700, 700, 600], pos: [0, 0, 0] }, rb: Part = { id: 'r', name: '6축 다관절 로봇', cls: 'robot', size: [600, 600, 1400], pos: [0, 0, 0] };
    expect(withRoles([ped])[0]!.cls).toBe('frame'); expect(withRoles([ped])[0]!.role).toBe('floor');
    const r = placePart([ped], rb, { at: [0, 0, 600], face: 'top', host: 'p' }); expect(r.ok, r.why).toBe(true); expect(r.pos[2]).toBe(600); expect(r.host).toBe('p');
    const r2 = placePart([{ ...ped, name: 'Robot pedestal' }], { ...rb, name: '받침' }, { at: [0, 0, 600], face: 'top', host: 'p' }); expect(r2.ok).toBe(true);
  });
  it('standard joins: a robot bolts onto its pedestal, a fence panel hangs between posts, a DIN device goes inside a cabinet, a conveyor stands on feet', () => {
    const col: Part = { id: 'c', name: '로봇 받침대', size: [500, 500, 600], pos: [0, 0, 0] }, rb: Part = { id: 'r', name: '로봇', kind: 'robot', size: [600, 600, 1400], pos: [0, 0, 0] };
    const r1 = placePart([col], rb, { at: [0, 0, 600], face: 'top', host: 'c' }); expect(r1.ok).toBe(true); expect(r1.pos[2]).toBe(600); expect(r1.how).toBe('bolt'); expect(r1.lv).toBeUndefined();
    const post: Part = { id: 'p', name: '포스트', size: [50, 50, 2000], pos: [3000, 0, 0] }, fence: Part = { id: 'f', name: '안전 펜스 패널', size: [1500, 30, 1800], pos: [0, 0, 0] };
    const r2 = placePart([post], fence, { at: [3000, -30, 1000], face: 'side', host: 'p' }); expect(r2.ok).toBe(true); expect(r2.how).toBe('post'); expect(r2.rel).toBe('side');
    const cab: Part = { id: 'k', name: '캐비닛', size: [800, 400, 2000], pos: [6000, 0, 0] }, dev: Part = { id: 'd', name: 'PLC', size: [120, 90, 100], pos: [0, 0, 0] };
    const r3 = placePart([cab], dev, { at: [6000, 0, 1200], face: 'inside', host: 'k' }); expect(r3.ok).toBe(true); expect(r3.how).toBe('din'); expect(r3.rel).toBe('in');
    const cv: Part = { id: 'v', name: '컨베이어', size: [3000, 500, 800], pos: [0, 0, 0] };
    const r4 = placePart([cab], cv, { at: [0, 3000, 0], face: 'floor' }); expect(r4.ok).toBe(true); expect(r4.how).toBe('feet');
    const r5 = placePart([cab], rb, { at: [6000, 0, 2000], face: 'top', host: 'k' }); expect(r5.ok).toBe(false); // a cabinet carries nothing on top
  });
});

describe('pull to a valid slot', () => {
  const frame: Part = { id: 'f', name: '프레임', cls: 'frame', size: [1200, 800, 850], pos: [0, 0, 0] }, lamp: Part = { id: 'l', name: '경광등', cls: 'lamp', size: [80, 80, 500], pos: [0, 0, 0] };
  it('a lamp dropped on the floor 300 mm from a frame is pulled onto the frame top; 2 m away it stays refused', () => {
    const r = snapPlace([frame], lamp, { at: [900, 0, 0], face: 'floor' }); expect(r.ok).toBe(true); expect(r.snapped).toBe(true); expect(r.host).toBe('f'); expect(r.pos).toEqual([560, 0, 850]);
    const far = snapPlace([frame], lamp, { at: [2600, 0, 0], face: 'floor' }); expect(far.ok).toBe(false);
  });
  it('a control box dropped on a frame top slides to its nearest side face', () => {
    const box: Part = { id: 'b', name: '제어함', cls: 'control', size: [300, 200, 400], pos: [0, 0, 0] };
    const r = snapPlace([frame], box, { at: [500, 100, 850], face: 'top', host: 'f' }); expect(r.ok).toBe(true); expect(r.rel).toBe('side'); expect(r.pos[0]).toBe(600 + 150); expect(r.snapped).toBe(true);
  });
  it('a robot set on the floor beside its pedestal goes up onto it; a desk beside a desk stays on the floor', () => {
    const col: Part = { id: 'c', name: '로봇 단상', cls: 'column', size: [700, 700, 600], pos: [0, 0, 0] }, rb: Part = { id: 'r', name: '로봇', cls: 'robot', size: [400, 400, 1400], pos: [0, 0, 0] };
    const r = snapPlace([col], rb, { at: [650, 0, 0], face: 'floor' }); expect(r.host).toBe('c'); expect(r.pos[2]).toBe(600); expect(r.snapped).toBe(true);
    const alone = snapPlace([], rb, { at: [650, 0, 0], face: 'floor' }); expect(alone.ok).toBe(true); expect(alone.rel).toBe('floor');
  });
  it('a floor block set 100 mm from another closes the gap and lines up its edge', () => {
    const desk: Part = { id: 'd', name: '작업대', cls: 'desk', size: [1500, 700, 750], pos: [0, 0, 0] }, next: Part = { id: 'n', name: '작업대 2', cls: 'desk', size: [1500, 700, 750], pos: [0, 0, 0] };
    const r = snapPlace([desk], next, { at: [1600, 60, 0], face: 'floor' }); expect(r.snapped).toBe(true); expect(r.pos).toEqual([1500, 0, 0]); expect(r.snapWhy).toMatch(/맞닿게/);
    const r2 = snapPlace([desk], next, { at: [2000, 60, 0], face: 'floor' }); expect(r2.snapped).toBeUndefined(); expect(r2.pos).toEqual([2000, 60, 0]);
  });
});
