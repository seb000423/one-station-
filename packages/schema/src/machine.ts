import { z } from 'zod';
import { Fidelity, Id, Params, Transform, Vec3 } from './common';
import { Io, Joint, ProcessModel, Socket } from './block';
import { Spec, emptySpec } from './spec';

export const MACHINE_SCHEMA = 'one-twin/machine@1';

export const MachineNode = z.object({
  id: Id,
  type: z.enum(['block', 'glb', 'group']),
  blockType: z.string().optional(),
  name: z.string().default(''),
  params: Params.default({}),
  transform: Transform,
  parent: Id.nullable().default(null),
  sockets: z.array(Socket).default([]),
});
export type MachineNode = z.infer<typeof MachineNode>;

export const TrajectorySegment = z.object({
  type: z.enum(['PTP', 'LIN', 'CIRC', 'PATH']),
  points: z.array(z.array(z.number())),
  speed: z.number().positive(),
  blend: z.number().nonnegative().default(0),
  tool: z.string().optional(),
});
export const Trajectory = z.object({
  id: z.string(),
  segments: z.array(TrajectorySegment),
  process: z.array(z.object({ segment: z.number().int(), tag: z.string(), params: Params.default({}) })).default([]),
});
export const RobotDef = z.object({
  urdf: z.string(),
  tcp: z.array(z.number()).length(6).describe('x, y, z mm, rx, ry, rz deg'),
  tcp_vmax: z.number().positive(),
  tcp_amax: z.number().positive(),
  payload: z.number().nonnegative(),
  derating: z.array(z.object({ payload: z.number(), factor: z.number() })).default([]),
  override: z.number().min(1).max(100).default(100),
});

/** One step of the simple sequence editor: wait for a condition, then set outputs. */
export const SequenceStep = z.object({
  id: z.string(),
  name: z.string().optional(),
  wait: z.array(z.object({ tag: z.string(), op: z.enum(['==', '!=', '>', '<', '>=', '<=']).default('=='), value: z.union([z.boolean(), z.number()]) })).default([]),
  set: z.array(z.object({ tag: z.string(), value: z.union([z.boolean(), z.number()]) })).default([]),
  delay: z.number().nonnegative().optional(),
  timeout: z.number().positive().optional(),
  next: z.array(z.string()).optional().describe('parallel branches: ids of the steps that start after this one'),
});

/** 티칭 (teach pendant) program of one robot node (or 작업자 node): taught points (joint angles, deg, with the TCP where they
    were taught) and lines a pendant runs: moves, gripper, arc, signal wait/set, delay. Runs on the signal table: START starts
    it, BUSY/DONE report. A point with no joint angles (j = []) is a target only: the run solves the joints (and the rail) for
    its TCP. For a 작업자, MOVJ walks to the point (x, y) and MOVL reaches the hand to it. */
export const RobotPoint = z.object({ id: z.string(), name: z.string().optional(), j: z.array(z.number()).describe('joint angles deg, J1… (empty: solved from tcp)'), tcp: z.array(z.number()).length(3).optional().describe('TCP x, y, z mm (machine frame) when taught'),
  rail: z.number().optional().describe('travel on the rail (7th axis) mm from where the robot is placed; robots on a rail only') });
export const RobotLine = z.discriminatedUnion('op', [
  z.object({ op: z.literal('MOVJ'), point: z.string(), speed: z.number().min(1).max(100).default(50).describe('% of joint vmax') }),
  z.object({ op: z.literal('MOVL'), point: z.string(), speed: z.number().positive().default(500).describe('TCP mm/s') }),
  z.object({ op: z.literal('GRIP'), on: z.boolean() }),
  z.object({ op: z.literal('ARC'), on: z.boolean() }).describe('welding arc on / off at the TCP'),
  z.object({ op: z.literal('WAIT'), tag: z.string(), value: z.union([z.boolean(), z.number()]) }),
  z.object({ op: z.literal('SET'), tag: z.string(), value: z.union([z.boolean(), z.number()]) }),
  z.object({ op: z.literal('DELAY'), s: z.number().nonnegative() }),
]);
export const RobotProgram = z.object({ node: Id, name: z.string().default('프로그램 1'), points: z.array(RobotPoint).default([]), lines: z.array(RobotLine).default([]) });
export type RobotProgram = z.infer<typeof RobotProgram>;

export const MachineCard = z.object({
  cycle_time: z.number().nonnegative().nullable().default(null),
  ok_rate: z.number().min(0).max(1).nullable().default(null),
  footprint: z.tuple([z.number(), z.number()]).nullable().default(null),
  operators: z.number().nonnegative().default(0),
  inlet: z.string().nullable().default(null),
  outlet: z.string().nullable().default(null),
});

export const Machine = z.object({
  schema: z.literal(MACHINE_SCHEMA),
  meta: z.object({
    id: Id,
    name: z.string(),
    bbox: Vec3.describe('W × D × H mm'),
    cellFixed: z.boolean().default(false).describe('true: bbox is a fixed work cell centred on the origin (blocks stay inside); false: bbox follows the blocks'),
    fidelity: Fidelity.default('L1'),
    thumbnail: z.string().optional(),
    version: z.number().int().positive().default(1),
  }),
  card: MachineCard.default(MachineCard.parse({})),
  nodes: z.array(MachineNode).default([]),
  joints: z.array(Joint).default([]),
  robot: RobotDef.nullable().default(null),
  trajectories: z.array(Trajectory).default([]),
  io: z.array(Io).default([]),
  sequence: z.object({ steps: z.array(SequenceStep).default([]) }).default({ steps: [] }),
  programs: z.array(RobotProgram).default([]).describe('teach-pendant programs, one per robot node'),
  process: ProcessModel.nullable().default(null),
  spec: Spec.default(emptySpec()),
});
export type Machine = z.infer<typeof Machine>;
