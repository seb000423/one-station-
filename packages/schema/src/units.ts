/**
 * Coordinate system and units (ONE Twin standard R1 §5, project standard v2.1 §2).
 *
 * Stored documents (machine.json / factory.json): millimetres, degrees, right-handed, **Z up**,
 * X = infeed → outfeed. The three.js scene: metres, radians, **Y up** (1 unit = 1 m).
 * Every conversion between the two goes through this file only.
 *
 * Axis map (a proper rotation, +90° about X):
 *   stored (X, Y, Z)  →  scene (x, y, z) = (X, Z, −Y) / 1000
 *   scene  (x, y, z)  →  stored (X, Y, Z) = (x, −z, y) × 1000
 * glTF is Y-up like the scene, so a glTF asset needs no correction for the scene; written into a
 * stored (Z-up) document it gets the same map as any scene point.
 */
export type Point3 = [number, number, number];

export const MM_PER_M = 1000;
export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/** Round to 0.001 mm so stored values do not carry float noise. */
export const roundMm = (v: number): number => Math.round(v * 1000) / 1000;
/** Round to 1e-4 degree. */
export const roundDeg = (v: number): number => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};
const clean = (v: number): number => (Object.is(v, -0) ? 0 : v);

export const mToMm = (m: number): number => roundMm(m * MM_PER_M);
export const mmToM = (mm: number): number => mm / MM_PER_M;
export const radToDeg = (r: number): number => roundDeg(r * DEG);
export const degToRad = (d: number): number => d * RAD;

/** Stored point (mm, Z-up) → scene point (m, Y-up). */
export function storedToScene(p: Point3): Point3 {
  return [clean(p[0] / MM_PER_M), clean(p[2] / MM_PER_M), clean(-p[1] / MM_PER_M)];
}
/** Scene point (m, Y-up) → stored point (mm, Z-up). */
export function sceneToStored(p: Point3): Point3 {
  return [clean(roundMm(p[0] * MM_PER_M)), clean(roundMm(-p[2] * MM_PER_M)), clean(roundMm(p[1] * MM_PER_M))];
}
/** Stored direction (unit vector, Z-up) → scene direction (Y-up). Joint axes, socket normals. */
export function storedDirToScene(d: Point3): Point3 {
  return [clean(d[0]), clean(d[2]), clean(-d[1])];
}
export function sceneDirToStored(d: Point3): Point3 {
  return [clean(d[0]), clean(-d[2]), clean(d[1])];
}
/**
 * Yaw: a rotation about the stored Z axis (deg, counter-clockwise seen from above) is the same
 * physical rotation as a rotation about the scene Y axis (rad, counter-clockwise seen from above).
 */
export const storedYawToScene = (deg: number): number => degToRad(deg);
export const sceneYawToStored = (rad: number): number => radToDeg(rad);

/** Column-major 4×4 (three.js Matrix4.fromArray order) that maps stored metres to scene metres. */
export const STORED_TO_SCENE_MATRIX: readonly number[] = Object.freeze([
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
]);

/** Grid snap (standard v2.1 §2): 500 mm at factory level, 5 mm inside a machine. */
export const GRID_FACTORY_MM = 500;
export const GRID_MACHINE_MM = 5;
export const snap = (v: number, step: number): number => clean(Math.round(v / step) * step);
