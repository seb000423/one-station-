/**
 * A line built in ONE BUILDER as a DES model: the conveyor network (which belt feeds which, where items are put on
 * and taken off) plus the equipment standing at the belts (each one a station at the point of the belt it works
 * on). The builder hands over plain geometry ({@link LayoutInput}); this module turns it into the same LineModel
 * the demo line uses, so the run view, scenario compare and the optimiser work on any line the user draws.
 *
 * Physical rules (so the 3D replay never shows two items in one place):
 *  - items are `pitch` apart at the closest (item length + gap);
 *  - the stretch of belt between two points (source, station, merge point, sink) is one accumulating conveyor:
 *    a buffer whose transit time is its length over the belt speed and whose places are the item positions that
 *    fit in it (waiting places counted back from the next stop, one pitch apart, clear of the stop behind);
 *  - a stretch too short for a waiting place links the two stations directly (the item waits on the first stop);
 *  - a station takes the next item one pitch of travel after the last one left (turnover);
 *  - where belts merge, a merge gate (a zero-time station, not shown as a process) lets one item at a time cross the
 *    merge point, two pitches of travel after the last (they meet at an angle); items from each side wait one pitch
 *    before it and ask for their turn there. A belt joining from the
 *    side carries its items across the main belt's edge to its centre line (the transfer, `next.gap`).
 * Every node keeps the belt pieces it covers ({@link LayoutPath}), so the renderer can put each item on its belt.
 */
import type { LineModel, NodeDef } from './line';
import type { Dist } from './rng';

export interface LayoutBelt {
  id: string; name: string; len: number; speed: number;
  /** where the exit leads: another belt, at distance s along it (0 = its entry; > 0 = joining its side) */
  next: { id: string; s: number; gap?: number } | null;
  /** items are put on at the entry every `interval` s */ source?: { interval: number } | null;
  /** items are taken off at the exit */ sink?: boolean;
}
export interface LayoutStation {
  id: string; name: string; belt: string; s: number; ct: number;
  cv?: number; okRate?: number; mtbf?: number; mttr?: number; kind?: string; equip?: string;
}
export interface LayoutInput { belts: LayoutBelt[]; stations: LayoutStation[]; pitch: number }
export interface LayoutPiece { belt: string; s0: number; s1: number }
export interface LayoutPath { pieces: LayoutPiece[]; len: number; speedEnd: number; endsAt: 'station' | 'merge' | 'sink'; startsAt: 'source' | 'station' | 'merge' }
export interface LayoutParams {
  stations?: Record<string, Partial<Pick<LayoutStation, 'ct' | 'cv' | 'okRate' | 'mtbf' | 'mttr'>>>;
  /** run without variation, NG and failures */ deterministic?: boolean;
}
export interface LayoutLine {
  model: LineModel;
  /** geometry of every buffer (its belt pieces) and every station / source / sink (one belt point) */
  paths: Record<string, LayoutPath>;
  points: Record<string, { belt: string; s: number }>;
  /** the stretch leading into each station (a buffer id, or '>' + station id for a direct link without waiting place) */
  into: Record<string, string>;
  stations: (LayoutStation & { turnover: number; approach?: number })[];
  /** merge gates (zero-time stations where belts join) and the stretches leading into each */
  gates: { id: string; belt: string; s: number; turnover: number; into: string[] }[];
  warnings: string[];
  pitch: number;
}

const EPS = 1e-6;

export function buildLayoutLine(input: LayoutInput, params: LayoutParams = {}): LayoutLine {
  const pitch = Math.max(0.05, input.pitch), det = !!params.deterministic;
  const belts = new Map(input.belts.map(b => [b.id, b])), warnings: string[] = [];
  const nodes: NodeDef[] = [], routes: LineModel['routes'] = [], paths: LayoutLine['paths'] = {}, points: LayoutLine['points'] = {}, into: LayoutLine['into'] = {};
  const st = input.stations.filter(s => belts.has(s.belt)).map(s => ({ ...s, ...(params.stations?.[s.id] ?? {}), s: Math.max(0, Math.min(belts.get(s.belt)!.len, s.s)) }));
  // points on each belt where a stretch ends: stations, and where other belts join from the side (merge points)
  const stationsOn = new Map<string, typeof st>();
  for (const s of st) (stationsOn.get(s.belt) ?? stationsOn.set(s.belt, []).get(s.belt)!).push(s);
  for (const l of stationsOn.values()) l.sort((a, b) => a.s - b.s);
  const feeders = new Map<string, LayoutBelt[]>();
  for (const b of input.belts) if (b.next && belts.has(b.next.id)) (feeders.get(b.next.id) ?? feeders.set(b.next.id, []).get(b.next.id)!).push(b);
  const mergeAt = (belt: string): number[] => {
    const f = feeders.get(belt) ?? [], s = new Set<number>();
    const atEntry = f.filter(b => b.next!.s <= EPS).length;
    for (const b of f) if (b.next!.s > EPS || atEntry > 1) s.add(+b.next!.s.toFixed(4)); // a side join, or two belts ending on one entry
    return [...s].sort((a, b) => a - b);
  };
  const outStations: (typeof st[number] & { turnover: number; approach?: number })[] = [];
  const stationDone = new Map<string, string>(); // station id → node id
  const junction = new Map<string, string>(); // merge point key → id of its gate
  const gates: LayoutLine['gates'] = [];
  let nBuf = 0, nSink = 0;

  // the stretch that starts at (belt, s) after a point of kind `startsAt`: follow belts until the next point
  function stretch(belt: string, s: number, startsAt: LayoutPath['startsAt'], visited = new Set<string>()): { pieces: LayoutPiece[]; end: { kind: 'station'; st: typeof st[number] } | { kind: 'merge'; belt: string; s: number } | { kind: 'sink'; belt: string; s: number; dead: boolean } } {
    const pieces: LayoutPiece[] = [];
    let b = belts.get(belt)!, s0 = s, firstBelt = true;
    for (let guard = 0; guard < 500; guard++) {
      const key = b.id;
      if (visited.has(key) && pieces.length) { warnings.push(`${b.name}: 컨베이어가 고리로 이어져 있어 한 바퀴에서 끊었습니다`); return { pieces, end: { kind: 'sink', belt: b.id, s: s0, dead: true } }; }
      visited.add(key);
      // the next station ahead (one standing exactly where a merge stretch starts counts too)
      const nextSt = (stationsOn.get(b.id) ?? []).find(x => (firstBelt && startsAt === 'station') ? x.s > s0 + EPS : x.s >= s0 - EPS);
      const nextMerge = mergeAt(b.id).find(m => m > s0 + EPS);
      const stS = nextSt ? nextSt.s : Infinity, mS = nextMerge ?? Infinity;
      if (stS <= mS && stS < Infinity) { pieces.push({ belt: b.id, s0, s1: stS }); return { pieces, end: { kind: 'station', st: nextSt! } }; }
      if (mS < Infinity) { pieces.push({ belt: b.id, s0, s1: mS }); return { pieces, end: { kind: 'merge', belt: b.id, s: mS } }; }
      pieces.push({ belt: b.id, s0, s1: b.len });
      if (b.sink || !b.next || !belts.has(b.next.id)) {
        if (!b.sink) warnings.push(`${b.name}: 출구가 다른 컨베이어에 이어지지 않고 배출 표시도 없어, 끝을 배출로 보았습니다`);
        return { pieces, end: { kind: 'sink', belt: b.id, s: b.len, dead: !b.sink } };
      }
      const n = b.next; const nb = belts.get(n.id)!;
      if (n.s > EPS || (feeders.get(nb.id) ?? []).filter(f => f.next!.s <= EPS).length > 1) {
        if (n.s > EPS && (n.gap ?? 0) > EPS) pieces.push({ belt: b.id, s0: b.len, s1: b.len + n.gap! }); // across onto the main belt
        return { pieces, end: { kind: 'merge', belt: nb.id, s: +n.s.toFixed(4) } };
      }
      // a station standing right at the next belt's entry
      const at0 = (stationsOn.get(nb.id) ?? []).find(x => x.s <= EPS);
      if (at0) return { pieces, end: { kind: 'station', st: at0 } };
      b = nb; s0 = 0; firstBelt = false;
    }
    warnings.push(`${belt}: 경로가 너무 깁니다`); return { pieces, end: { kind: 'sink', belt, s: s, dead: true } };
  }
  const lenOf = (pieces: LayoutPiece[]) => pieces.reduce((a, p) => a + (p.s1 - p.s0), 0);
  const timeOf = (pieces: LayoutPiece[]) => pieces.reduce((a, p) => a + (p.s1 - p.s0) / Math.max(0.01, belts.get(p.belt)!.speed), 0);

  /** build the node chain starting at a point; returns the id of the first node (to route into) */
  function from(belt: string, s: number, startsAt: LayoutPath['startsAt'], prevStation: (typeof outStations)[number] | null): string {
    const { pieces, end } = stretch(belt, s, startsAt);
    const len = lenOf(pieces), transit = timeOf(pieces), endBelt = end.kind === 'station' ? end.st.belt : end.belt, speedEnd = Math.max(0.01, belts.get(endBelt)!.speed);
    const startClear = pitch; // a new item (put on at the start, or leaving the stop behind) needs one pitch of room
    const endClear = end.kind === 'sink' ? 0 : pitch;
    // waiting places: positions len − endClear − k·pitch (k = 0, 1, …) that stay startClear clear of the start
    const places = len - endClear - startClear < -EPS ? 0 : Math.floor((len - endClear - startClear) / pitch + EPS) + 1;
    let first: string | null = null, bufId: string | null = null;
    const path: LayoutPath = { pieces, len, speedEnd, endsAt: end.kind, startsAt };
    const needBuffer = !(end.kind === 'station' && startsAt === 'station' && places === 0);
    if (needBuffer) {
      bufId = `CV${++nBuf}`;
      nodes.push({ kind: 'buffer', id: bufId, name: `컨베이어 ${pieces.map(p => belts.get(p.belt)!.name).filter((v, i, a) => a.indexOf(v) === i).join(' → ')}`, cap: Math.max(1, places), transit, index: end.kind === 'sink' ? 0 : pitch / speedEnd, ...(end.kind === 'merge' ? { request: Math.min(transit, pitch / speedEnd) } : {}) });
      paths[bufId] = path; first = bufId;
      if (places === 0 && end.kind !== 'sink') warnings.push(`${pieces[0] ? belts.get(pieces[0].belt)!.name : ''}: ${len.toFixed(2)} m 구간은 부품 하나(${pitch.toFixed(2)} m)도 기다릴 자리가 없습니다`);
    }
    const link = (to: string) => { if (bufId) routes.push({ from: bufId, to }); };
    if (end.kind === 'station') {
      if (!into[end.st.id]) { if (bufId) into[end.st.id] = bufId; else { into[end.st.id] = '>' + end.st.id; paths['>' + end.st.id] = path; } }
      const sid = station(end.st, !needBuffer ? transit : undefined);
      if (!first) first = sid;
      link(sid);
    } else if (end.kind === 'merge') {
      const key = `${end.belt}@${end.s}`;
      let j = junction.get(key);
      if (j === '') { // the network loops back here: end the loop at a sink
        warnings.push(`${belts.get(end.belt)!.name}: 컨베이어가 고리로 이어져 있어 합류 지점에서 끊었습니다`);
        j = `OUT${++nSink}`; nodes.push({ kind: 'sink', id: j, name: '배출 (고리 끊음)' }); points[j] = { belt: end.belt, s: end.s };
      } else if (j === undefined) {
        junction.set(key, '');
        // items meet at an angle here: the next one sets off from its waiting place only once the last one is a pitch past the
        // point, so it needs two pitches of travel (one item at a time through the merge, never cutting a corner)
        const id = `MG${gates.length + 1}`, turnover = 2 * pitch / Math.max(0.01, belts.get(end.belt)!.speed);
        nodes.push({ kind: 'station', id, name: `합류 ${belts.get(end.belt)!.name}`, ct: 0, turnover }); points[id] = { belt: end.belt, s: end.s };
        const g = { id, belt: end.belt, s: end.s, turnover, into: [] as string[] }; gates.push(g); into[id] = bufId!;
        routes.push({ from: id, to: from(end.belt, end.s, 'merge', null) });
        junction.set(key, id);
        j = id;
      }
      const g = gates.find(x => x.id === j); if (g && bufId) g.into.push(bufId);
      link(j);
    } else {
      const id = `OUT${++nSink}`; nodes.push({ kind: 'sink', id, name: `배출 ${belts.get(end.belt)!.name}` }); points[id] = { belt: end.belt, s: end.s }; link(id);
    }
    void prevStation;
    return first!;
  }

  function station(s: typeof st[number], approach?: number): string {
    const done = stationDone.get(s.id); if (done) return done;
    stationDone.set(s.id, s.id);
    const b = belts.get(s.belt)!, turnover = pitch / Math.max(0.01, b.speed);
    const ct: Dist = det || !s.cv ? s.ct : { kind: 'normal', mean: s.ct, sd: s.ct * s.cv, min: s.ct * 0.7 };
    const def: Extract<NodeDef, { kind: 'station' }> = { kind: 'station', id: s.id, name: s.name, ct, turnover };
    if (approach !== undefined) def.approach = approach;
    if (!det && s.okRate !== undefined && s.okRate < 1) def.okRate = s.okRate;
    if (!det && s.mtbf && s.mttr) { def.mtbf = { kind: 'exp', mean: s.mtbf }; def.mttr = { kind: 'lognormal', mean: s.mttr, sd: s.mttr * 0.5 }; }
    nodes.push(def); points[s.id] = { belt: s.belt, s: s.s };
    const out = { ...s, turnover, ...(approach !== undefined ? { approach } : {}) }; outStations.push(out);
    const nx = from(s.belt, s.s, 'station', out);
    routes.push({ from: s.id, to: nx });
    return s.id;
  }

  // every source belt starts a chain
  const sources = input.belts.filter(b => b.source);
  if (!sources.length) warnings.push('투입(소스) 컨베이어가 없습니다. 컨베이어 하나에 "투입"을 켜세요');
  sources.forEach((b, i) => {
    const id = `IN${i + 1}`;
    nodes.push({ kind: 'source', id, name: `투입 ${b.name}`, interarrival: Math.max(0.5, b.source!.interval), hold: true }); // as in the builder: the next item goes on when there is room
    points[id] = { belt: b.id, s: 0 };
    const at0 = (stationsOn.get(b.id) ?? []).find(x => x.s <= EPS);
    if (at0 && !into[at0.id]) { into[at0.id] = '>' + at0.id; paths['>' + at0.id] = { pieces: [{ belt: b.id, s0: 0, s1: 0 }], len: 0, speedEnd: Math.max(0.01, b.speed), endsAt: 'station', startsAt: 'source' }; }
    const first = at0 ? station(at0) : from(b.id, 0, 'source', null);
    routes.push({ from: id, to: first });
  });
  // stations no source reaches
  for (const s of st) if (!stationDone.has(s.id)) warnings.push(`${s.name}: 투입에서 이어지지 않는 컨베이어에 있어 시뮬레이션에서 빠졌습니다`);
  // order stations along the flow (the order they were reached from the sources)
  return { model: { nodes, routes }, paths, points, into, stations: outStations, gates, warnings, pitch };
}

/**
 * Hand calculation for a BUILDER line (deterministic): the supply of each source flows down the line; a station
 * passes at most one item per cycle (time + turnover), a merge gate one per turnover, so the output is the flow
 * reaching the sinks. `station` is the station holding the flow back nearest the sink (or the slowest station when none does).
 */
export function layoutCapacity(L: LayoutLine): { station: { id: string; name: string; cycle: number; perHour: number } | null; supply: { perHour: number }; perHour: number; limit: 'station' | 'supply' } {
  const byId = new Map(L.model.nodes.map(n => [n.id, n])), preds = new Map<string, string[]>();
  for (const r of L.model.routes) (preds.get(r.to) ?? preds.set(r.to, []).get(r.to)!).push(r.from);
  const cycleOf = new Map(L.stations.map(s => [s.id, s.ct + s.turnover]));
  for (const g of L.gates) cycleOf.set(g.id, g.turnover);
  const outRate = new Map<string, number>(), binding: { id: string; cycle: number }[] = [];
  const out = (id: string, seen = new Set<string>()): number => {
    if (outRate.has(id)) return outRate.get(id)!;
    if (seen.has(id)) return 0; seen.add(id);
    const n = byId.get(id)!;
    let r: number;
    if (n.kind === 'source') r = typeof n.interarrival === 'number' ? 3600 / n.interarrival : 0;
    else {
      const inflow = (preds.get(id) ?? []).reduce((a, p) => a + out(p, seen), 0), c = cycleOf.get(id);
      r = c !== undefined && c > 0 ? Math.min(inflow, 3600 / c) : inflow;
      if (c !== undefined && inflow > 3600 / c + 1e-9) binding.push({ id, cycle: c });
    }
    outRate.set(id, r); return r;
  };
  const sinks = L.model.nodes.filter(n => n.kind === 'sink');
  const perHour = sinks.reduce((a, n) => a + out(n.id), 0);
  const supply = L.model.nodes.reduce((a, n) => a + (n.kind === 'source' && typeof n.interarrival === 'number' ? 3600 / n.interarrival : 0), 0);
  const named = new Map(L.stations.map(s => [s.id, s.name]));
  const bind = binding[binding.length - 1]; // upstream nodes are visited first: the last one holding the flow back is closest to the sink
  const slow = bind ?? L.stations.map(s => ({ id: s.id, cycle: s.ct + s.turnover })).sort((a, b) => b.cycle - a.cycle)[0];
  const station = slow ? { id: slow.id, name: named.get(slow.id) ?? byId.get(slow.id)?.name ?? slow.id, cycle: slow.cycle, perHour: 3600 / slow.cycle } : null;
  return { station, supply: { perHour: supply }, perHour, limit: bind ? 'station' : 'supply' };
}
