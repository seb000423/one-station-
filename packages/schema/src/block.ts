import { z } from 'zod';
import { Fidelity, Id, Params, Vec3 } from './common';

/** Snap point on a block (R1 §4.3). position / normal in the block's own frame (mm, Z up). */
export const Socket = z.object({
  id: z.string().min(1),
  position: Vec3,
  normal: Vec3,
  kind: z.enum(['mount', 'inlet', 'outlet', 'surface', 'tool']),
  compatible: z.array(z.string()).default([]),
});
export type Socket = z.infer<typeof Socket>;

/**
 * Motion axis (R1 §4.1, §8.5). Linear limits in mm (0 = retracted), rotary in deg (0 = home).
 * vmax / amax are required: without them cycle times are not trustworthy. verified = true only for
 * values read from a maker's catalogue.
 */
export const Joint = z.object({
  id: z.string().min(1),
  node: Id,
  type: z.enum(['rot', 'lin', 'surface']),
  axis: Vec3,
  mode: z.enum(['onoff', 'position', 'continuous']),
  min: z.number(),
  max: z.number(),
  home: z.number().default(0),
  vmax: z.number().positive(),
  amax: z.number().positive(),
  jmax: z.number().positive().optional(),
  effort: z.number().positive().optional(),
  /** ON/OFF actuators: travel speed (mm/s or deg/s) and cushion time (s) instead of a profile */
  cushion_time: z.number().nonnegative().optional(),
  verified: z.object({ vmax: z.boolean(), amax: z.boolean() }).default({ vmax: false, amax: false }),
});
export type Joint = z.infer<typeof Joint>;

export const IoBinding = z.object({
  kind: z.enum(['joint', 'sensor', 'process', 'carrier', 'trajectory']),
  target: z.string(),
});
export const Io = z.object({
  tag: z.string().regex(/^[A-Z0-9_]+$/).max(32),
  dir: z.enum(['in', 'out']),
  type: z.enum(['bool', 'int', 'real']),
  binding: IoBinding.optional(),
  default: z.union([z.boolean(), z.number()]).optional(),
});
export type Io = z.infer<typeof Io>;

export const ProcessModel = z.object({
  cycle_time: z.number().nonnegative(),
  ok_rate: z.number().min(0).max(1).default(1),
  batch_size: z.number().int().positive().default(1),
  consumable: z.string().optional(),
  state_in: z.string().optional(),
  state_out: z.string().optional(),
});
export const Carrier = z.object({
  capacity: z.number().int().positive(),
  layout: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]).describe('rows × cols × layers'),
  pitch: Vec3,
});
export const Detect = z.object({
  method: z.enum(['ray', 'segment', 'area', 'volume']),
  range: z.number().positive(),
  target: z.enum(['work', 'carrier', 'any']).default('work'),
});

/** Block definition in the library (R1 §4.3, 블록 공통 구조). A block is a type, not a product. */
export const BlockDef = z.object({
  meta: z.object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'block type ids are kebab-case'),
    type: z.string(),
    name: z.string(),
    category: z.enum(['structure', 'transport', 'pneumatic', 'electric', 'robot', 'sensor', 'work', 'feeder', 'process', 'mover', 'factory']),
    fidelity: Fidelity,
    thumbnail: z.string().optional(),
    maker_note: z.string().optional(),
  }),
  geometry: z.object({
    params: Params,
    dimTable: z.string().optional(),
    glbRef: z.string().optional(),
  }),
  sockets: z.array(Socket).default([]),
  joints: z.array(Joint.omit({ node: true })).default([]),
  ioTemplate: z.array(z.object({ kind: z.string(), variant: z.string().optional(), binding: IoBinding.optional() })).default([]),
  process: ProcessModel.optional(),
  carrier: Carrier.optional(),
  detect: Detect.optional(),
});
export type BlockDef = z.infer<typeof BlockDef>;
