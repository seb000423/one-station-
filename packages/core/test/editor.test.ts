import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Factory, FACTORY_SCHEMA, MACHINE_SCHEMA, importLegacy, factoryToLegacy, type LegacyDoc } from '@one-twin/schema';
import { Editor, commandCatalog, factoryCommands, machineCommands, CommandError } from '@one-twin/core';

const ids = () => { let n = 0; return () => `id${++n}`; };
const blank = () => Factory.parse({ schema: FACTORY_SCHEMA, meta: { id: 'f', levels: [{ id: 'L1', name: '1F', height: 6000 }] }, building: { slabs: [{ id: 's', polygon: [[0, 0], [20000, 0], [20000, 14000], [0, 14000]] }] } });

describe('factory edit API', () => {
  it('place, move, snap, rename, set_param, then undo everything back to the start', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const start = e.doc;
    const m = e.exec('place_machine', { ref: 'press-station@1', position: [2010, 3990] }) as string;
    expect(e.doc.machines[0]!.tagPrefix).toBe('ST01.M01');
    e.exec('move', { id: m, by: [240, -240], yaw: 90 });
    e.exec('snap', { id: m });
    expect(e.doc.machines[0]!.transform.position).toEqual([2500, 4000, 0]);
    expect(e.doc.machines[0]!.transform.rotation[2]).toBe(90);
    e.exec('rename', { id: m, name: '프레스' });
    e.exec('set_param', { id: m, key: 'tonnage', value: 30 });
    e.exec('set_param', { id: m, key: 'tonnage', value: null });
    expect(e.doc.machines[0]!.params).toEqual({});
    while (e.undo());
    expect(e.doc).toEqual(start);
    while (e.redo());
    expect(e.doc.machines[0]!.name).toBe('프레스');
    e.validate();
  });
  it('batch: several commands are one undo step and roll back together on error', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const a = e.exec('place_machine', { ref: 'press-station@1', position: [2000, 4000] }) as string;
    const b = e.exec('place_machine', { ref: 'press-station@1', position: [6000, 4000] }) as string;
    const before = e.doc; let calls = 0; e.subscribe(() => calls++);
    e.batch('move selection', () => { e.exec('move', { id: a, by: [500, 0] }); e.exec('move', { id: b, by: [500, 0] }); });
    expect(calls).toBe(1);
    expect(e.doc.machines.map(m => m.transform.position[0])).toEqual([2500, 6500]);
    e.undo(); expect(e.doc).toEqual(before);
    e.redo(); expect(e.doc.machines[1]!.transform.position[0]).toBe(6500);
    const mid = e.doc;
    expect(() => e.batch('bad', () => { e.exec('move', { id: a, by: [500, 0] }); e.exec('move', { id: 'nope', by: [1, 0] }); })).toThrow();
    expect(e.doc).toEqual(mid);
  });
  it('flows carry a transport kind; set_flow changes it; duplicates are refused', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const a = e.exec('place_machine', { ref: 'press-station@1', position: [2000, 4000] }) as string;
    const b = e.exec('place_machine', { ref: 'press-station@1', position: [6000, 4000] }) as string;
    const f = e.exec('connect_flow', { from: `${a}.outlet`, to: `${b}.inlet` }) as string;
    expect(e.doc.flows[0]!.via).toBe('auto');
    e.exec('set_flow', { id: f, via: 'amr' }); expect(e.doc.flows[0]!.via).toBe('amr');
    expect(() => e.exec('connect_flow', { from: `${a}.outlet`, to: `${b}.inlet`, ratio: 0 })).toThrow(/already exists/);
  });
  it('a new command after undo drops the redo stack', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    e.exec('add_column', { position: [0, 0] });
    e.undo();
    expect(e.canRedo).toBe(true);
    e.exec('add_column', { position: [500, 0] });
    expect(e.canRedo).toBe(false);
  });
  it('rejects bad arguments with a readable message and leaves the document alone', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const before = e.doc;
    expect(() => e.exec('draw_wall', { from: [0, 0] } as never)).toThrow(/to/);
    expect(() => e.exec('draw_wall', { from: [0, 0], to: [0, 0] })).toThrow(CommandError);
    expect(() => e.exec('move', { id: 'nope', by: [1, 1] })).toThrow(/no object/);
    expect(e.doc).toBe(before);
    expect(e.canUndo).toBe(false);
  });
  it('walls move by both ends and turn about their centre', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const w = e.exec('draw_wall', { from: [0, 0], to: [4000, 0] }) as string;
    e.exec('move', { id: w, by: [0, 1000] });
    expect(e.doc.building.walls[0]).toMatchObject({ from: [0, 1000], to: [4000, 1000] });
    e.exec('move', { id: w, yaw: 90 });
    expect(e.doc.building.walls[0]).toMatchObject({ from: [2000, -1000], to: [2000, 3000] });
  });
  it('flows: ends must exist, ratios out of one outlet ≤ 1, deleting a machine removes its flows', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const a = e.exec('place_machine', { ref: 'a@1', position: [0, 0] }) as string;
    const b = e.exec('place_machine', { ref: 'b@1', position: [3000, 0] }) as string;
    const c = e.exec('place_machine', { ref: 'c@1', position: [3000, 3000] }) as string;
    e.exec('connect_flow', { from: `${a}.out`, to: `${b}.in`, ratio: 0.7 });
    expect(() => e.exec('connect_flow', { from: `${a}.out`, to: `${c}.in`, ratio: 0.5 })).toThrow(/> 1/);
    e.exec('connect_flow', { from: `${a}.out`, to: `${c}.in`, ratio: 0.3 });
    expect(() => e.exec('connect_flow', { from: `x.out`, to: `${c}.in` })).toThrow(/no machine/);
    e.exec('delete', { id: b });
    expect(e.doc.flows.map(f => f.to)).toEqual([`${c}.in`]);
  });
  it('duplicate / mirror / array give machines their own tag prefix', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    const a = e.exec('place_machine', { ref: 'a@1', position: [1000, 2000], yaw: 30 }) as string;
    e.exec('duplicate', { id: a });
    e.exec('mirror', { id: a, axis: 5000 });
    e.exec('array', { id: a, count: 3, step: [2000, 0] });
    const pre = e.doc.machines.map(m => m.tagPrefix);
    expect(new Set(pre).size).toBe(pre.length);
    const mir = e.doc.machines[2]!;
    expect(mir.transform.position.slice(0, 2)).toEqual([9000, 2000]);
    expect(mir.transform.rotation[2]).toBe(150);
    expect(e.doc.machines.slice(3).map(m => m.transform.position[0])).toEqual([3000, 5000, 7000]);
    e.validate();
  });
  it('column grid, markings, movers, paths, storage, drops, openings, reference, card', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    expect((e.exec('add_column_grid', { origin: [0, 0], nx: 3, ny: 2, dx: 6000, dy: 7000 }) as string[]).length).toBe(6);
    const w = e.exec('draw_wall', { from: [0, 0], to: [20000, 0] }) as string;
    e.exec('add_opening', { kind: 'shutter', position: [3000, 0], wall: w });
    e.exec('add_marking', { kind: 'aisle', polyline: [[0, 2000], [20000, 2000]], params: { width: 2500 } });
    e.exec('add_mover', { kind: 'amr', position: [1000, 2000] });
    e.exec('add_path', { kind: 'amr', points: [[0, 2000], [20000, 2000]] });
    e.exec('add_storage', { kind: 'rack', position: [18000, 10000], capacity: 40 });
    e.exec('add_drop', { kind: 'air', position: [5000, 5000] });
    e.exec('add_block', { type: 'safety-fence', position: [8000, 8000], params: { length: 3000 } });
    e.exec('set_reference', { reference: { kind: 'image', src: 'plan.png', scale: 20, origin: [0, 0] } });
    const m = e.exec('place_machine', { ref: 'a@1', position: [6000, 6000] }) as string;
    e.exec('set_card', { id: m, card: { cycle_time: 25, operators: 1 } });
    expect(e.doc.machines[0]!.cardOverride).toEqual({ cycle_time: 25, operators: 1 });
    e.exec('delete', { id: w });
    expect(e.doc.building.openings[0]!.wall).toBeNull();
    e.validate();
    expect(e.log()).toHaveLength(13);
  });
  it('edits on the converted example line still save back to the old format', () => {
    const ex = JSON.parse(readFileSync(new URL('../../../assets/layouts/egr-module-asset.json', import.meta.url), 'utf8')) as LegacyDoc;
    const e = new Editor('factory', importLegacy(ex), { newId: ids() });
    const first = e.doc.machines[0]!;
    e.exec('move', { id: first.id, by: [500, 0] });
    const old = factoryToLegacy(e.doc).objects.find(o => o.id === first.id)!;
    const orig = ex.objects!.find(o => o.id === first.id)!;
    expect(old.x! - orig.x!).toBeCloseTo(0.5, 6);
  });
});

describe('machine edit API', () => {
  it('set_parent attaches a node on top of another, detaches with null, and refuses cycles', () => {
    const e = new Editor('machine', { schema: MACHINE_SCHEMA, meta: { id: 'm', name: 't', bbox: [1000, 1000, 1000] } } as never, { newId: ids() });
    const cv = e.exec('add_block', { blockType: 'roller-conveyor', position: [0, 0, 0] }) as string;
    const rb = e.exec('add_block', { blockType: 'robot-6axis', position: [0, 0, 0] }) as string;
    e.exec('set_parent', { id: rb, parent: cv });
    expect(e.doc.nodes.find(n => n.id === rb)!.parent).toBe(cv);
    expect(() => e.exec('set_parent', { id: cv, parent: rb })).toThrow(/itself or its own child/);
    e.exec('set_parent', { id: rb, parent: null });
    expect(e.doc.nodes.find(n => n.id === rb)!.parent).toBeNull();
  });
  it('blocks, joints, tags, cascading delete', () => {
    const e = new Editor('machine', { schema: MACHINE_SCHEMA, meta: { id: 'm', name: 'Pick & place', bbox: [1200, 800, 1600] } } as never, { newId: ids() });
    const frame = e.exec('add_block', { blockType: 'frame-table', position: [0, 0, 0] }) as string;
    const cyl = e.exec('add_block', { blockType: 'cylinder-guide', parent: frame, position: [101.2, 0, 802.4] }) as string;
    expect(e.doc.nodes[1]!.transform.position).toEqual([100, 0, 800]); // 5 mm grid inside a machine
    e.exec('add_joint', { id: 'j1', node: cyl, type: 'lin', axis: [0, 0, -1], mode: 'onoff', min: 0, max: 50, vmax: 300, amax: 3000 });
    e.exec('bind_tag', { tag: 'CYL_FWD', dir: 'out', type: 'bool', binding: { kind: 'joint', target: 'j1' } });
    expect(() => e.exec('bind_tag', { tag: 'cyl_fwd', dir: 'out', type: 'bool' })).toThrow();
    expect(() => e.exec('bind_tag', { tag: 'X', dir: 'out', type: 'bool', binding: { kind: 'joint', target: 'nope' } })).toThrow(/no joint/);
    e.exec('delete', { id: frame });
    expect(e.doc.nodes).toEqual([]);
    expect(e.doc.joints).toEqual([]);
    expect(e.doc.io).toEqual([]);
    e.undo();
    expect(e.doc.io).toHaveLength(1);
  });
});

describe('machine builder commands', () => {
  const blankM = () => new Editor('machine', { schema: MACHINE_SCHEMA, meta: { id: 'm', name: '컨베이어 스테이션', bbox: [4000, 1200, 1800] } } as never, { newId: ids() });
  it('add_block brings its axes and tags in one undo step', () => {
    const e = blankM();
    const cv = e.exec('add_block', { blockType: 'roller-conveyor', name: '롤러 컨베이어 1', position: [0, 0, 0],
      joints: [{ id: 'CV1_BELT', type: 'lin', axis: [1, 0, 0], mode: 'continuous', min: 0, max: 3000, vmax: 300, amax: 1000 }],
      io: [{ tag: 'CV1_RUN', dir: 'out', type: 'bool', binding: { kind: 'joint', target: 'CV1_BELT' } }, { tag: 'CV1_SPEED', dir: 'out', type: 'real' }] }) as string;
    expect(e.doc.joints[0]!.node).toBe(cv);
    expect(e.doc.io.map(t => t.tag)).toEqual(['CV1_RUN', 'CV1_SPEED']);
    e.undo();
    expect(e.doc.nodes).toEqual([]); expect(e.doc.joints).toEqual([]); expect(e.doc.io).toEqual([]);
    e.redo();
    expect(() => e.exec('add_block', { blockType: 'x', position: [0, 0, 0], io: [{ tag: 'CV1_RUN', dir: 'out', type: 'bool' }] })).toThrow(/exists/);
    expect(() => e.exec('add_block', { blockType: 'x', position: [0, 0, 0], io: [{ tag: 'Q_RUN', dir: 'out', type: 'bool', binding: { kind: 'joint', target: 'nope' } }] })).toThrow(/no joint/);
    expect(e.doc.nodes).toHaveLength(1);
  });
  it('move snaps to 5 mm, rename, set_meta, set_card', () => {
    const e = blankM();
    const n = e.exec('add_block', { blockType: 'cylinder', position: [0, 0, 0] }) as string;
    e.exec('move', { id: n, position: [1002, -498, 801], rotation: [0, 0, -90] });
    expect(e.doc.nodes[0]!.transform).toEqual({ position: [1000, -500, 800], rotation: [0, 0, 270] });
    e.exec('rename', { id: n, name: '실린더 1' });
    e.exec('set_meta', { name: '푸셔 스테이션', bbox: [3000, 1000, 1500] });
    expect(() => e.exec('set_meta', { bbox: [0, 1, 1] })).toThrow(/> 0/);
    e.exec('set_card', { cycle_time: 12.5, ok_rate: 0.98 });
    expect(e.doc.card).toMatchObject({ cycle_time: 12.5, ok_rate: 0.98 });
    expect(e.doc.meta).toMatchObject({ name: '푸셔 스테이션', bbox: [3000, 1000, 1500] });
    e.validate();
  });
});

describe('factory slab and roof', () => {
  it('set_slab resizes the floor (or creates one), add_roof places a roof', () => {
    const e = new Editor('factory', blank(), { newId: ids() });
    e.exec('set_slab', { polygon: [[0, 0], [30000, 0], [30000, 20000], [0, 20000]] });
    expect(e.doc.building.slabs[0]!.polygon[2]).toEqual([30000, 20000]);
    expect(() => e.exec('set_slab', { id: 'nope', polygon: [[0, 0], [1, 0], [1, 1]] })).toThrow(/no slab/);
    const r = e.exec('add_roof', { position: [15000, 10000], params: { w: 30000, d: 20000, type: 'gable' } }) as string;
    expect(e.doc.building.roofs[0]!.id).toBe(r);
    e.exec('set_meta', { name: '1공장' });
    expect(e.doc.meta.name).toBe('1공장');
    const empty = Factory.parse({ schema: FACTORY_SCHEMA, meta: { id: 'f', levels: [{ id: 'L1', name: '1F', height: 6000 }] }, building: {} });
    const e2 = new Editor('factory', empty, { newId: ids() });
    e2.exec('set_slab', { polygon: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]] });
    expect(e2.doc.building.slabs).toHaveLength(1);
    e.validate(); e2.validate();
  });
});

describe('command catalogue', () => {
  it('lists every command with a JSON Schema for its arguments', () => {
    const cat = commandCatalog();
    expect(cat.length).toBe(Object.keys(factoryCommands).length + Object.keys(machineCommands).length);
    for (const c of cat) { expect(c.description.length).toBeGreaterThan(3); expect(c.args).toHaveProperty('type', 'object'); }
    expect(cat.map(c => c.name)).toEqual(expect.arrayContaining(['place_machine', 'draw_wall', 'connect_flow', 'snap', 'set_param', 'add_block', 'add_joint', 'bind_tag']));
  });
});
