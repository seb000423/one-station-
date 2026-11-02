import { describe, expect, it } from 'vitest';
import { storedToScene, sceneToStored, storedDirToScene, STORED_TO_SCENE_MATRIX, storedYawToScene, sceneYawToStored, snap, GRID_FACTORY_MM, uuidv7, isUuidV7, uuidv7Time } from '@one-twin/schema';

describe('coordinate convention (R1 §5, standard v2.1 §2)', () => {
  it('stored Z-up mm ↔ scene Y-up m round-trips', () => {
    const p: [number, number, number] = [1234.5, -678.25, 900];
    expect(storedToScene(p)).toEqual([1.2345, 0.9, 0.67825]);
    expect(sceneToStored(storedToScene(p))).toEqual(p);
  });
  it('stored up (+Z) is scene up (+Y); glTF up (0,1,0) stores as (0,0,1)', () => {
    expect(storedDirToScene([0, 0, 1])).toEqual([0, 1, 0]);
    expect(sceneToStored([0, 1, 0])).toEqual([0, 0, 1000]);
  });
  it('axis map is a proper rotation (right-handed stays right-handed)', () => {
    const m = STORED_TO_SCENE_MATRIX; // column-major
    const a = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]] as number[][];
    const det = a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) - a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) + a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
    expect(det).toBe(1);
    // matrix agrees with storedToScene
    const p = [3, 5, 7];
    expect([a[0]![0]! * p[0]! + a[0]![1]! * p[1]! + a[0]![2]! * p[2]!, a[1]![0]! * p[0]! + a[1]![1]! * p[1]! + a[1]![2]! * p[2]!, a[2]![0]! * p[0]! + a[2]![1]! * p[1]! + a[2]![2]! * p[2]!])
      .toEqual(storedToScene([3000, 5000, 7000]));
  });
  it('yaw: +90° about stored Z turns +X into +Y, same as +π/2 about scene Y', () => {
    const r = storedYawToScene(90);
    // three.js rotation about Y by r maps (1,0,0) to (cos r, 0, -sin r)
    const scene: [number, number, number] = [Math.cos(r), 0, -Math.sin(r)];
    const stored = sceneToStored(scene).map(v => Math.round(v));
    expect(stored).toEqual([0, 1000, 0]);
    expect(sceneYawToStored(Math.PI / 2)).toBe(90);
  });
  it('grid snap 500 mm', () => {
    expect(snap(1249, GRID_FACTORY_MM)).toBe(1000);
    expect(snap(1251, GRID_FACTORY_MM)).toBe(1500);
    expect(Object.is(snap(-1, GRID_FACTORY_MM), 0)).toBe(true);
  });
});

describe('UUID v7', () => {
  it('format, embedded time and sort order', () => {
    const t = Date.UTC(2026, 10, 2);
    const ids = Array.from({ length: 50 }, () => uuidv7(t));
    for (const id of ids) expect(isUuidV7(id)).toBe(true);
    expect(uuidv7Time(ids[0]!)).toBe(t);
    expect([...ids].sort()).toEqual(ids); // monotonic within one millisecond
    expect(new Set(ids).size).toBe(ids.length);
    expect(uuidv7(t + 1) > ids[ids.length - 1]!).toBe(true);
  });
});
