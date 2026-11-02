import { z } from 'zod';

/** Millimetre triple [x, y, z] in the stored frame (Z up). */
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const Vec2 = z.tuple([z.number(), z.number()]);
/**
 * Placement in the stored frame: position in mm, rotation [rx, ry, rz] in degrees, applied
 * intrinsic Z → Y → X (yaw, pitch, roll). Factory objects normally use rz (yaw) only.
 */
export const Transform = z.object({
  position: Vec3,
  rotation: Vec3.default([0, 0, 0]),
  scale: Vec3.optional(),
});
export type Transform = z.infer<typeof Transform>;
/** UUID v7 for new objects; ids carried over from saves made before the schema keep their old form. */
export const Id = z.string().min(1).max(64);
export const Params = z.record(z.string(), z.unknown());
export const Fidelity = z.enum(['L1', 'L2', 'L3']);
export const Polygon = z.array(Vec2).min(3);
export const Polyline = z.array(Vec2).min(2);
