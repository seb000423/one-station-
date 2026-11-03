import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importLegacy, factoryToLegacy, legacyToFactory, type LegacyDoc, type LegacyObject } from '@one-twin/schema';

const example = JSON.parse(readFileSync(new URL('./fixtures/legacy-layout.json', import.meta.url), 'utf8')) as LegacyDoc;

const close = (a: unknown, b: unknown, path = ''): void => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (path.endsWith('.rot')) { const d = Math.abs(((a - b + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI); expect(d, path).toBeLessThan(1e-4); }
    else expect(Math.abs(a - b), path).toBeLessThan(1e-5);
    return;
  }
  if (Array.isArray(a)) { expect(Array.isArray(b), path).toBe(true); expect((b as unknown[]).length, path).toBe(a.length); a.forEach((v, i) => close(v, (b as unknown[])[i], `${path}[${i}]`)); return; }
  if (a && typeof a === 'object') {
    const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined).sort();
    const kb = Object.keys(b as object).filter(k => (b as Record<string, unknown>)[k] !== undefined).sort();
    expect(kb, path).toEqual(ka);
    for (const k of ka) close((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(b, path).toEqual(a);
};
const byId = (o: LegacyObject[]) => [...o].sort((x, y) => x.id.localeCompare(y.id)).map(x => ({ ...x, rot: x.rot ?? 0 }));

describe('old saves ⇄ factory.json', () => {
  it('a saved layout converts into a valid factory.json', () => {
    const f = importLegacy(example, { id: 'example', name: '예시' });
    expect(f.building.walls).toHaveLength(6);
    expect(f.building.columns).toHaveLength(19);
    expect(f.machines).toHaveLength(12);
    expect(f.markings).toHaveLength(8);
    expect(f.nav.paths).toHaveLength(5);
    expect(new Set(f.machines.map(m => m.tagPrefix)).size).toBe(12);
  });
  it('origin moves to the floor’s lower-left corner, north is +Y', () => {
    const f = importLegacy(example);
    const north = f.building.walls.find(w => w.id === 'em001')!; // 북쪽 벽, old z = -9.9 in a 40 × 20 m floor
    expect(north.from[1]).toBeCloseTo(19900, 3);
    expect(north.to[1]).toBeCloseTo(19900, 3);
    expect(Math.min(north.from[0], north.to[0])).toBeCloseTo(0, 3);
    expect(Math.max(north.from[0], north.to[0])).toBeCloseTo(40000, 3);
    for (const c of f.building.columns) {
      expect(c.transform.position[0]).toBeGreaterThanOrEqual(0); expect(c.transform.position[0]).toBeLessThanOrEqual(40000);
      expect(c.transform.position[1]).toBeGreaterThanOrEqual(0); expect(c.transform.position[1]).toBeLessThanOrEqual(20000);
    }
  });
  it('round trip old → new → old keeps every object', () => {
    const back = factoryToLegacy(importLegacy(example));
    close(example.factory, back.factory, 'factory');
    close(byId(example.objects!), byId(back.objects), 'objects');
  });
  it('round trip covers every type the builder keeps, incl. raised objects and rotation', () => {
    const types = ['column', 'wall', 'door', 'stairs', 'walkway', 'zone', 'amr', 'worker', 'route', 'walkroute', 'ufmodel', 'conveyor', 'rack', 'tote', 'fence', 'roof', 'bench', 'kpi', 'profile', 'plate', 'foot', 'block', 'model', 'mine'];
    const objects: LegacyObject[] = types.map((type, i) => ({
      id: `t${i}`, type, name: type, x: i * 0.5 - 5, z: 2 - i * 0.25, rot: (i % 4) * Math.PI / 2 - (i % 3) * 0.1, ...(i % 5 === 0 ? { y: 0.85 } : {}),
      params: type === 'wall' ? { length: 6, thickness: 0.2, h: 4, windows: true }
        : type === 'column' ? { w: 0.4, d: 0.6, h: 0 }
        : type === 'route' || type === 'walkroute' ? { points: [[0, 0], [3, 0], [3, 4]], oneway: true, speed: 1.2 }
        : type === 'zone' ? { kind: i % 2 ? 'keepout' : 'pickup', w: 2, d: 3, track: true, cap: 4 }
        : { a: i, nested: { b: [1, 2] }, ...(type === 'ufmodel' ? { model: 'x_model' } : {}) },
    }));
    const doc: LegacyDoc = { version: 2, factory: { width: 30, depth: 16, height: 8 }, objects };
    const f = importLegacy(doc);
    expect(f.building.walls[0]!.height).toBe(4000);
    expect(f.markings.find(m => m.params.kind === 'keepout')?.kind).toBe('safety');
    const back = factoryToLegacy(f);
    close(doc.factory, back.factory, 'factory');
    close(byId(objects), byId(back.objects), 'objects');
  });
  it('unknown fields never break the import', () => {
    expect(() => legacyToFactory({ objects: [{ id: 'x', type: 'something-new', params: {} }] })).not.toThrow();
  });
});
