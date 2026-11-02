import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Factory, Machine, BlockDef, Joint, emptySpec, Spec, SPEC_SECTIONS, FACTORY_SCHEMA, MACHINE_SCHEMA } from '@one-twin/schema';

describe('spec (R1 §4.5)', () => {
  it('12 sections + meta, all null by default', () => {
    expect(SPEC_SECTIONS).toHaveLength(12);
    const s = emptySpec();
    expect(Object.keys(s)).toHaveLength(13);
    expect(Spec.parse(s)).toEqual(s);
    expect(s.electrical).toBeNull();
  });
  it('accepts a partly filled section with nulls', () => {
    const s = { ...emptySpec(), electrical: { voltage: 380, phase: '3P', rated_power: null } };
    expect(Spec.parse(s).electrical).toEqual({ voltage: 380, phase: '3P', rated_power: null });
  });
});

describe('documents', () => {
  it('minimal machine fills defaults and keeps spec nulls', () => {
    const m = Machine.parse({ schema: MACHINE_SCHEMA, meta: { id: 'm', name: 'Press station', bbox: [1200, 800, 1800] } });
    expect(m.meta.fidelity).toBe('L1');
    expect(m.card.cycle_time).toBeNull();
    expect(m.spec.gas).toBeNull();
    expect(JSON.parse(JSON.stringify(m)).spec.gas).toBeNull(); // nulls survive export
  });
  it('minimal factory', () => {
    const f = Factory.parse({ schema: FACTORY_SCHEMA, meta: { id: 'f', levels: [{ id: 'L1', name: '1F', height: 6000 }] }, building: {} });
    expect(f.machines).toEqual([]);
    expect(f.nav.paths).toEqual([]);
  });
  it('joints require vmax / amax', () => {
    const j = { id: 'j1', node: 'n', type: 'lin', axis: [1, 0, 0], mode: 'onoff', min: 0, max: 100 };
    expect(Joint.safeParse(j).success).toBe(false);
    expect(Joint.parse({ ...j, vmax: 300, amax: 3000 }).verified).toEqual({ vmax: false, amax: false });
  });
  it('block type ids are kebab-case', () => {
    const b = { meta: { id: 'cylinder-thin', type: 'cylinder', name: '박형 실린더', category: 'pneumatic', fidelity: 'L2' }, geometry: { params: { bore: 20 } } };
    expect(BlockDef.safeParse(b).success).toBe(true);
    expect(BlockDef.safeParse({ ...b, meta: { ...b.meta, id: 'CylinderThin' } }).success).toBe(false);
  });
  it('exports JSON Schema for every document type', () => {
    for (const s of [Factory, Machine, BlockDef]) expect(z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' })).toHaveProperty('type', 'object');
  });
});
