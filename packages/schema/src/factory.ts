import { z } from 'zod';
import { Id, Params, Polygon, Polyline, Transform, Vec2 } from './common';
import { Spec, emptySpec } from './spec';

export const FACTORY_SCHEMA = 'one-twin/factory@1';

/** Fields shared by placed factory objects. `params` keeps type-specific settings. */
const Placed = { id: Id, name: z.string().default(''), transform: Transform, params: Params.default({}) };

export const Level = z.object({ id: Id, name: z.string(), elevation: z.number().default(0), height: z.number().positive() });
export const Slab = z.object({ id: Id, name: z.string().default(''), polygon: Polygon, thickness: z.number().nonnegative().default(200), finish: z.string().default('epoxy') });
export const Wall = z.object({
  id: Id, name: z.string().default(''), from: Vec2, to: Vec2,
  thickness: z.number().positive(), height: z.number().positive().nullable().describe('null = level height'),
  params: Params.default({}),
});
export const Column = z.object({ ...Placed, size: Vec2, height: z.number().positive().nullable() });
export const Opening = z.object({
  ...Placed, kind: z.enum(['door', 'shutter', 'dock', 'exit', 'window']),
  wall: Id.nullable().default(null),
});
export const Roof = z.object({ ...Placed });
export const Marking = z.object({
  ...Placed, kind: z.enum(['aisle', 'zone', 'safety']),
  polygon: Polygon.optional(), polyline: Polyline.optional(),
});
/** A machine placed in the factory: a reference to a machine document (R1 §7.3). */
export const MachineInstance = z.object({
  ...Placed,
  ref: z.string().describe('machine@version, or legacy:<type>[:<model>] for objects saved before the schema'),
  tagPrefix: z.string().regex(/^[A-Z0-9_]+(\.[A-Z0-9_]+)*$/),
  cardOverride: Params.default({}),
});
export const Flow = z.object({
  id: Id,
  from: z.string().describe('machineInstanceId.outletSocketId'),
  to: z.string().describe('machineInstanceId.inletSocketId'),
  ratio: z.number().min(0).max(1).default(1),
});
export const Storage = z.object({ ...Placed, kind: z.enum(['rack', 'floor', 'buffer']), capacity: z.number().int().nonnegative().nullable().default(null) });
export const Mover = z.object({ ...Placed, kind: z.enum(['worker', 'amr', 'forklift']) });
export const NavPath = z.object({
  id: Id, name: z.string().default(''), kind: z.enum(['amr', 'walk', 'forklift']),
  points: Polyline, oneway: z.boolean().default(false), params: Params.default({}),
});
export const Nav = z.object({
  nodes: z.array(z.object({ id: Id, p: Vec2 })).default([]),
  edges: z.array(z.object({ a: Id, b: Id, oneway: z.boolean().default(false), kind: z.enum(['amr', 'walk', 'forklift']) })).default([]),
  docks: z.array(z.object({ id: Id, node: Id, target: Id })).default([]),
  /** drawn routes (the editor's source for nodes / edges) */
  paths: z.array(NavPath).default([]),
});
export const Utilities = z.object({
  drops: z.array(z.object({ ...Placed, kind: z.enum(['power', 'air', 'gas', 'water']) })).default([]),
  panels: z.array(z.object({ ...Placed })).default([]),
  supply: z.array(z.object({ ...Placed, kind: z.string() })).default([]),
});
/** Other factory blocks of the 팩토리빌더 블록 목록 (fence, stairs, andon board, containers …). */
export const FactoryBlock = z.object({ ...Placed, type: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/) });

export const Factory = z.object({
  schema: z.literal(FACTORY_SCHEMA),
  meta: z.object({
    id: Id, name: z.string().default(''), site: z.string().default(''),
    levels: z.array(Level).min(1),
    version: z.number().int().positive().default(1),
  }),
  reference: z.object({
    kind: z.enum(['dxf', 'image']), src: z.string(), scale: z.number().positive(), origin: Vec2, rotation: z.number().default(0),
  }).nullable().default(null),
  building: z.object({
    slabs: z.array(Slab).default([]), walls: z.array(Wall).default([]), columns: z.array(Column).default([]),
    roofs: z.array(Roof).default([]), openings: z.array(Opening).default([]),
  }),
  markings: z.array(Marking).default([]),
  machines: z.array(MachineInstance).default([]),
  flows: z.array(Flow).default([]),
  storage: z.array(Storage).default([]),
  movers: z.array(Mover).default([]),
  nav: Nav.default(Nav.parse({})),
  utilities: Utilities.default(Utilities.parse({})),
  blocks: z.array(FactoryBlock).default([]),
  spec: Spec.default(emptySpec()),
});
export type Factory = z.infer<typeof Factory>;

/** Collections of a factory document that hold placed objects with an id. */
export const FACTORY_COLLECTIONS = [
  'building.walls', 'building.columns', 'building.roofs', 'building.openings', 'building.slabs',
  'markings', 'machines', 'flows', 'storage', 'movers', 'nav.paths', 'utilities.drops', 'utilities.panels', 'utilities.supply', 'blocks',
] as const;
export type FactoryCollection = (typeof FACTORY_COLLECTIONS)[number];
