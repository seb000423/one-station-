/**
 * The demo line: the default example (welding module line, five cells A–E) as a DES model.
 *
 * Every time in this model is MEASURED from the line's 3D motion (assets/one-twin/module-line-map.json,
 * written by tools/one-twin/clip-map.mjs from the baked model): how long each station's robot / press /
 * worker actually takes, how long a pallet needs between two stops, how many pallets fit in between, the
 * return trip and the lifts. So the numbers and the 3D replay run on one time base.
 *
 * Flow: tote (8 cores per tote, a worker changes it) → loader → infeed lane → robot A puts the core on the
 * jig pallet at the merge stop → 29 stops → the packer puts the cooler in the carton (3 per carton, a worker
 * changes it) → the pallet goes down the exit lift, back on the lower conveyor and up the start lift.
 * NG at the weighing check (A5) or the leak test (E3) is taken off at the next NG stop (A6 / E6) into the
 * closed NG store; the empty pallet runs on.
 *
 * Variation, OK rates and failure figures are demo assumptions (generic values, no customer data); each can
 * be overridden per scenario. Cycle times can be overridden too (the 3D replay then runs that station's
 * motion faster or slower).
 */
import MAP from '../../../assets/one-twin/module-line-map.json';
import type { LineModel, NodeDef, PoolDef } from './line';
import type { Dist } from './rng';

export type Cell = 'A' | 'B' | 'C' | 'D' | 'E';
export interface DemoStation {
  id: string; name: string; cell: Cell;
  ct: number; cv?: number; // mean cycle time (s) and coefficient of variation (normal distribution)
  okRate?: number; mtbf?: number; mttr?: number; operators?: number; kind: 'robot' | 'auto' | 'manual' | 'inspect' | 'transfer';
  emptyCt?: number; reject?: number; setup?: { every: number; time: number }; turnover?: number; pool?: string;
}
export type LineMap = typeof MAP;
export const LINE_MAP: LineMap = MAP;
const D = MAP.des;

/** what each station does (kind) and the demo assumptions on variation, quality and failures */
const CARD: Record<string, Pick<DemoStation, 'kind' | 'cv' | 'okRate' | 'mtbf' | 'mttr' | 'operators'>> = {
  A0: { kind: 'transfer', cv: 0.01 }, A1: { kind: 'robot', cv: 0.01, mtbf: 6 * 3600, mttr: 240 },
  A2: { kind: 'inspect' }, A3: { kind: 'robot', cv: 0.02, mtbf: 3 * 3600, mttr: 300 }, A4: { kind: 'inspect' }, A5: { kind: 'inspect', okRate: 0.98 }, A6: { kind: 'transfer' },
  B1: { kind: 'transfer' }, B2: { kind: 'auto', mtbf: 6 * 3600, mttr: 180 }, B3: { kind: 'auto', cv: 0.02 }, B4: { kind: 'auto', cv: 0.02 }, B5: { kind: 'inspect' },
  B6: { kind: 'robot', cv: 0.02, mtbf: 8 * 3600, mttr: 900 }, B7: { kind: 'transfer' },
  C1: { kind: 'auto' }, C2: { kind: 'robot', cv: 0.02, mtbf: 5 * 3600, mttr: 300 }, C3: { kind: 'robot', cv: 0.02, mtbf: 5 * 3600, mttr: 300 }, C4: { kind: 'transfer' },
  C5: { kind: 'robot', cv: 0.02, mtbf: 5 * 3600, mttr: 300 }, C6: { kind: 'robot', cv: 0.02, mtbf: 5 * 3600, mttr: 300 }, C7: { kind: 'manual', cv: 0.12, operators: 1 },
  D1: { kind: 'inspect' }, D2: { kind: 'auto', cv: 0.03 }, D3: { kind: 'manual', cv: 0.15, operators: 1 },
  E1: { kind: 'transfer' }, E2: { kind: 'inspect' }, E3: { kind: 'robot', cv: 0.02, okRate: 0.97, mtbf: 6 * 3600, mttr: 600 }, E4: { kind: 'auto' },
  E5: { kind: 'auto', cv: 0.03 }, E6: { kind: 'transfer' }, E7: { kind: 'robot', cv: 0.01 },
};
const cellOf = (id: string) => id[0] as Cell;

/** stations in flow order with measured times */
export const DEMO_STATIONS: DemoStation[] = [
  { id: 'A0', name: '코어 로더 (토트 → 투입 레인)', cell: 'A', ct: D.loader, ...CARD.A0! },
  { id: 'A1', name: '로봇 A: 레인 → 지그 팔레트', cell: 'A', ct: D.robotA, pool: 'PAL', ...CARD.A1! },
  ...MAP.stations.map((id): DemoStation => {
    const st: DemoStation = { id, name: (MAP.names as Record<string, string>)[id]!, cell: cellOf(id), ct: (D.stations as Record<string, number>)[id]!, turnover: (D.turnover as Record<string, number>)[id], ...CARD[id]! };
    if (id === 'A6' || id === 'E6') st.reject = D.ngTrip;
    if (id === 'B6' || id === 'E3') st.emptyCt = D.emptyPass;
    if (id === 'E7') { st.emptyCt = 1.9; st.setup = { every: D.carton.every, time: Math.max(0, D.carton.swap - st.ct) }; }
    return st;
  }),
];

export interface DemoParams {
  pallets?: number;
  /** per-station overrides (cycle time, variation, OK rate, failure figures) */
  stations?: Record<string, Partial<Pick<DemoStation, 'ct' | 'cv' | 'okRate' | 'mtbf' | 'mttr'>>>;
  /** extra pallet places in front of a station (a longer accumulation section), on top of the physical ones */
  extraBuffer?: Record<string, number>;
  /** run without random variation, NG and failures (for checking against hand calculation) */
  deterministic?: boolean;
}

export interface LayoutNode { id: string; kind: NodeDef['kind']; cell?: string; name: string }
export interface DemoLine { model: LineModel; layout: LayoutNode[]; stations: DemoStation[]; params: Required<Pick<DemoParams, 'pallets'>> & DemoParams; pool: PoolDef }

export function buildDemoLine(params: DemoParams = {}): DemoLine {
  const pallets = params.pallets ?? 8, det = !!params.deterministic;
  const st = DEMO_STATIONS.map(s => ({ ...s, ...(params.stations?.[s.id] ?? {}) }));
  const nodes: NodeDef[] = [], routes: LineModel['routes'] = [], layout: LayoutNode[] = [];
  const pool: PoolDef = { id: 'PAL', count: pallets, returnTrip: D.returnTrip, liftUp: D.liftUp, liftCycle: D.liftCycle, liftIndex: D.liftIndex };
  nodes.push({ kind: 'source', id: 'IN', name: '코어 토트', lot: D.tote.lot, gap: D.tote.gap });
  layout.push({ id: 'IN', kind: 'source', cell: 'A', name: '코어 토트' });
  let prev = 'IN';
  const link = (id: string) => { routes.push({ from: prev, to: id }); prev = id; };
  for (const s of st) {
    if (s.id === 'A1') { nodes.push({ kind: 'buffer', id: 'LANE', name: '투입 레인 (2열)', cap: 2, transit: D.lane }); layout.push({ id: 'LANE', kind: 'buffer', cell: 'A', name: '투입 레인' }); link('LANE'); }
    else if (s.id !== 'A0') {
      const cv = (D.conveyors as Record<string, { transit: number; places: number; index: number }>)[s.id]!;
      const id = `CV_${s.id}`;
      nodes.push({ kind: 'buffer', id, name: `컨베이어 → ${s.id}`, cap: cv.places + (params.extraBuffer?.[s.id] ?? 0), transit: cv.transit });
      layout.push({ id, kind: 'buffer', cell: s.cell, name: `컨베이어 → ${s.name}` }); link(id);
    }
    const ct: Dist = det || !s.cv ? s.ct : { kind: 'normal', mean: s.ct, sd: s.ct * s.cv, min: s.ct * 0.7 };
    const def: Extract<NodeDef, { kind: 'station' }> = { kind: 'station', id: s.id, name: s.name, ct };
    if (!det && s.okRate !== undefined) def.okRate = s.okRate;
    if (!det && s.mtbf && s.mttr) { def.mtbf = { kind: 'exp', mean: s.mtbf }; def.mttr = { kind: 'lognormal', mean: s.mttr, sd: s.mttr * 0.5 }; }
    for (const k of ['operators', 'emptyCt', 'reject', 'setup', 'turnover', 'pool'] as const) if (s[k] !== undefined) (def as Record<string, unknown>)[k] = s[k];
    nodes.push(def); layout.push({ id: s.id, kind: 'station', cell: s.cell, name: s.name }); link(s.id);
  }
  nodes.push({ kind: 'sink', id: 'OUT', name: '출하 (카톤)' }); layout.push({ id: 'OUT', kind: 'sink', cell: 'E', name: '출하' }); link('OUT');
  return { model: { nodes, routes, pools: [pool] }, layout, stations: st, params: { ...params, pallets }, pool };
}

/** Hand calculation: the slowest station's cycle (its time + the time until the next pallet stands at its stop), s per part. */
export const slowestCycle = (stations: DemoStation[]): { id: string; cycle: number } =>
  stations.filter(s => s.id !== 'A0' && s.id !== 'A1').map(s => ({ id: s.id, cycle: s.ct + (s.turnover ?? 0) })).sort((a, b) => b.cycle - a.cycle)[0]!;

/** Hand calculation: one pallet's round trip when nothing waits (lift up, robot A, every conveyor and station, return trip). */
export function palletLoop(line: DemoLine): number {
  let t = line.pool.liftUp + line.pool.returnTrip;
  for (const n of line.model.nodes) {
    if (n.kind === 'station' && n.id !== 'A0') t += typeof n.ct === 'number' ? n.ct : 0;
    if (n.kind === 'buffer' && n.id !== 'LANE') t += n.transit ?? 0;
  }
  return t;
}
