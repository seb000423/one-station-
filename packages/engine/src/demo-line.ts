/**
 * The demo line: the default example (welding module line, five cells A–E) as a DES model.
 * One jig-pallet conveyor runs along the spine (x, metres, the same station positions as the 3D model in
 * tools/egr-line-v3/module-line.js); every station is a pallet stop; empty pallets return on the lower
 * level. The number of jig pallets limits the parts in the line (CONWIP), exactly as in the real line.
 *
 * Cycle times, OK rates and failure figures are demo assumptions (generic values, no customer data);
 * every one of them can be overridden per scenario.
 */
import type { LineModel, NodeDef } from './line';
import type { Dist } from './rng';

export interface DemoStation {
  id: string; name: string; cell: 'A' | 'B' | 'C' | 'D' | 'E'; x: number;
  ct: number; cv?: number; // mean cycle time (s) and coefficient of variation (normal distribution)
  okRate?: number; ng?: string; mtbf?: number; mttr?: number; operators?: number; kind: 'robot' | 'auto' | 'manual' | 'inspect';
}
export const BELT_SPEED = 0.4; // m/s, pallet conveyor
export const RETURN_SPEED = 1.0; // m/s, lower return conveyor
export const PALLET_PITCH = 0.32; // m, pallet 300 mm + gap

export const DEMO_STATIONS: DemoStation[] = [
  { id: 'A1', name: '코어 투입·팔레트 로딩 (로봇)', cell: 'A', x: 2.1, ct: 14, cv: 0.05, kind: 'robot', mtbf: 4 * 3600, mttr: 240 },
  { id: 'A2', name: '프로파일 검사', cell: 'A', x: 2.8, ct: 10, kind: 'inspect' },
  { id: 'A3', name: '페이스트 도포', cell: 'A', x: 3.6, ct: 25, cv: 0.04, kind: 'robot', mtbf: 3 * 3600, mttr: 300 },
  { id: 'A4', name: '노즐·도포 비전', cell: 'A', x: 4.25, ct: 8, kind: 'inspect' },
  { id: 'A5', name: '계량 판정', cell: 'A', x: 4.9, ct: 8, kind: 'inspect', okRate: 0.98, ng: 'NG_A' },
  { id: 'B1', name: '팔레트 90° 회전', cell: 'B', x: 6.4, ct: 5, kind: 'auto' },
  { id: 'B2', name: '엔드 탱크 공급', cell: 'B', x: 7.3, ct: 15, kind: 'auto', mtbf: 6 * 3600, mttr: 180 },
  { id: 'B3', name: '1차 압입', cell: 'B', x: 8.15, ct: 20, cv: 0.03, kind: 'auto' },
  { id: 'B4', name: '2차 압입', cell: 'B', x: 8.9, ct: 20, cv: 0.03, kind: 'auto' },
  { id: 'B5', name: '압입 비전', cell: 'B', x: 9.6, ct: 8, kind: 'inspect', okRate: 0.995, ng: 'NG_B' },
  { id: 'B6', name: '레이저 용접 (로봇 이재·캐빈)', cell: 'B', x: 10.3, ct: 42, cv: 0.03, kind: 'robot', mtbf: 8 * 3600, mttr: 900 },
  { id: 'C1', name: '플랜지 공급', cell: 'C', x: 12.7, ct: 15, kind: 'auto' },
  { id: 'C2', name: 'MIG 용접 로봇 1', cell: 'C', x: 13.5, ct: 30, cv: 0.04, kind: 'robot', mtbf: 5 * 3600, mttr: 300 },
  { id: 'C3', name: 'MIG 용접 로봇 2', cell: 'C', x: 14.5, ct: 30, cv: 0.04, kind: 'robot', mtbf: 5 * 3600, mttr: 300 },
  { id: 'C4', name: '팔레트 180° 회전', cell: 'C', x: 15.0, ct: 5, kind: 'auto' },
  { id: 'C5', name: 'MIG 용접 로봇 3', cell: 'C', x: 15.5, ct: 30, cv: 0.04, kind: 'robot', mtbf: 5 * 3600, mttr: 300 },
  { id: 'C6', name: 'MIG 용접 로봇 4', cell: 'C', x: 16.5, ct: 30, cv: 0.04, kind: 'robot', mtbf: 5 * 3600, mttr: 300 },
  { id: 'C7', name: '수동 MIG 보완 용접', cell: 'C', x: 18.1, ct: 35, cv: 0.15, kind: 'manual', operators: 1 },
  { id: 'D1', name: 'C/F 검사', cell: 'D', x: 19.3, ct: 20, kind: 'inspect' },
  { id: 'D2', name: '외부 도포', cell: 'D', x: 20.4, ct: 25, cv: 0.05, kind: 'auto' },
  { id: 'D3', name: '육안 검사 (작업자)', cell: 'D', x: 21.5, ct: 30, cv: 0.2, kind: 'manual', operators: 1 },
  { id: 'E1', name: '팔레트 90° 회전', cell: 'E', x: 22.9, ct: 5, kind: 'auto' },
  { id: 'E2', name: '바코드·외관 비전', cell: 'E', x: 23.6, ct: 8, kind: 'inspect' },
  { id: 'E3', name: '리크 테스트 (로봇 이재·캐빈)', cell: 'E', x: 24.3, ct: 46, cv: 0.03, kind: 'robot', okRate: 0.97, mtbf: 6 * 3600, mttr: 600 },
  { id: 'E4', name: '마킹', cell: 'E', x: 26.15, ct: 10, kind: 'auto' },
  { id: 'E5', name: '가스켓·볼트 체결', cell: 'E', x: 27.1, ct: 18, cv: 0.05, kind: 'manual', operators: 1 },
  { id: 'E6', name: 'OK/NG 분류', cell: 'E', x: 27.85, ct: 6, kind: 'auto', ng: 'NG_E' },
  { id: 'E7', name: '포장', cell: 'E', x: 28.6, ct: 12, kind: 'manual', operators: 1 },
];

export interface DemoParams {
  pallets?: number;
  /** per-station overrides (cycle time, OK rate, failure figures) */
  stations?: Record<string, Partial<Pick<DemoStation, 'ct' | 'cv' | 'okRate' | 'mtbf' | 'mttr'>>>;
  /** extra pallet places in front of a station (accumulation length), on top of the physical gap */
  extraBuffer?: Record<string, number>;
  /** run without random variation and failures (for checking against hand calculation) */
  deterministic?: boolean;
}

export interface LayoutNode { id: string; kind: NodeDef['kind']; x0: number; x1: number; cell?: string; name: string }
export interface DemoLine { model: LineModel; layout: LayoutNode[]; stations: DemoStation[]; params: Required<Pick<DemoParams, 'pallets'>> & DemoParams }

export function buildDemoLine(params: DemoParams = {}): DemoLine {
  const pallets = params.pallets ?? 8;
  const st = DEMO_STATIONS.map(s => ({ ...s, ...(params.stations?.[s.id] ?? {}) }));
  const nodes: NodeDef[] = [], routes: LineModel['routes'] = [], layout: LayoutNode[] = [];
  const first = st[0]!, last = st[st.length - 1]!;
  const loop = (last.x - first.x) + 2 * 1.2; // lower return run + two lifts
  nodes.push({ kind: 'source', id: 'IN', name: '코어 공급 · 빈 팔레트', carriers: pallets, carrierReturn: loop / RETURN_SPEED });
  layout.push({ id: 'IN', kind: 'source', x0: first.x - 0.6, x1: first.x - 0.6, name: '코어 공급' });
  let prev = 'IN', prevX = first.x;
  st.forEach((s, i) => {
    if (i > 0) {
      const dx = s.x - prevX, cap = Math.max(1, Math.floor((dx - 0.3) / PALLET_PITCH)) + (params.extraBuffer?.[s.id] ?? 0);
      const id = `CV_${s.id}`;
      nodes.push({ kind: 'buffer', id, name: `컨베이어 → ${s.id}`, cap, transit: dx / BELT_SPEED });
      routes.push({ from: prev, to: id }); prev = id;
      layout.push({ id, kind: 'buffer', x0: prevX, x1: s.x, cell: s.cell, name: `컨베이어 → ${s.name}` });
    }
    const det = params.deterministic;
    const ct: Dist = det || !s.cv ? s.ct : { kind: 'normal', mean: s.ct, sd: s.ct * s.cv, min: s.ct * 0.5 };
    const def: NodeDef = { kind: 'station', id: s.id, name: s.name, ct };
    if (!det && s.okRate !== undefined) def.okRate = s.okRate;
    if (s.ng) def.ng = s.ng;
    if (!det && s.mtbf && s.mttr) { def.mtbf = { kind: 'exp', mean: s.mtbf }; def.mttr = { kind: 'lognormal', mean: s.mttr, sd: s.mttr * 0.5 }; }
    if (s.operators) def.operators = s.operators;
    nodes.push(def); routes.push({ from: prev, to: s.id }); prev = s.id; prevX = s.x;
    layout.push({ id: s.id, kind: 'station', x0: s.x, x1: s.x, cell: s.cell, name: s.name });
  });
  nodes.push({ kind: 'sink', id: 'OUT', name: '출하' });
  routes.push({ from: prev, to: 'OUT' });
  layout.push({ id: 'OUT', kind: 'sink', x0: last.x + 0.7, x1: last.x + 0.7, name: '출하' });
  for (const [ng, x, cell] of [['NG_A', 5.5, 'A'], ['NG_B', 11.5, 'B'], ['NG_E', 27.85, 'E']] as const) {
    nodes.push({ kind: 'sink', id: ng, name: `NG 보관 ${cell}` });
    layout.push({ id: ng, kind: 'sink', x0: x, x1: x, cell, name: `NG 보관 ${cell}` });
  }
  return { model: { nodes, routes }, layout, stations: st, params: { ...params, pallets } };
}

/** Takt limit from the slowest station alone (hand calculation, s per part). */
export const slowestCt = (stations: DemoStation[]): number => Math.max(...stations.map(s => s.ct));
