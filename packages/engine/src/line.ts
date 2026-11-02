/**
 * DES layer (R1 §8.1): a production line as sources, buffers / conveyors, stations and sinks joined by
 * routes. Parts are single objects that travel the whole line (no part appears or disappears except at
 * a source, a sink or an NG exit), every move is logged, so the 3D view can replay exactly what the
 * numbers count.
 *
 * Station rules: one part at a time; processing time from the card's distribution; operation-dependent
 * failures (time to failure is consumed only while processing); blocking after service (a finished part
 * stays on the station until the next place has room). Buffers are FIFO with a capacity; a buffer with
 * `transit` is an accumulating conveyor (a part can leave no earlier than `transit` s after entering).
 */
import { Scheduler, type Ev } from './des';
import { Rng, type Dist } from './rng';

export type NodeDef =
  | { kind: 'source'; id: string; name?: string; interarrival?: Dist; limit?: number }
  | { kind: 'buffer'; id: string; name?: string; cap: number; transit?: number }
  | { kind: 'station'; id: string; name?: string; ct: Dist; okRate?: number; mtbf?: Dist; mttr?: Dist; ng?: string; operators?: number }
  | { kind: 'sink'; id: string; name?: string };
export interface RouteDef { from: string; to: string; ratio?: number }
export interface LineModel { nodes: NodeDef[]; routes: RouteDef[] }

export type StationState = 'idle' | 'busy' | 'blocked' | 'down';
export interface Part { id: number; born: number; at: string; next: string | null; ng: boolean; readyAt: number; enteredAt: number }
export type LogKind = 'create' | 'enter' | 'start' | 'finish' | 'fail' | 'repair' | 'block' | 'exit' | 'ng';
export interface LogEntry { t: number; kind: LogKind; part: number; node: string }
export interface RunOptions { seed?: number; warmup?: number; log?: boolean | number }

interface N {
  def: NodeDef; id: string;
  out: { to: string; w: number }[];
  waiters: string[]; // upstream nodes blocked on this one, FIFO
  q: Part[]; // buffer contents / source queue / station's single part
  rng: Rng;
  // station
  state: StationState; since: number; ttf: number; remaining: number; ev: Ev | null;
  acc: Record<StationState, number>; done: number; ngCount: number;
  // buffer
  levelArea: number; levelSince: number; maxLevel: number; headEv: Ev | null;
  // source
  created: number; arrivalEv: Ev | null;
}

export class ModelError extends Error {}

export class LineSim {
  readonly sched = new Scheduler();
  readonly nodes = new Map<string, N>();
  readonly log: LogEntry[] = [];
  private logLimit: number;
  private nextId = 1;
  private warmup: number;
  private statsFrom = 0;
  private wip = 0; private wipArea = 0; private wipSince = 0;
  private exits: number[] = []; // lead times of parts that left after warm-up
  private exitCount = 0; private ngExit = 0;
  readonly parts = new Map<number, Part>();

  constructor(readonly model: LineModel, opts: RunOptions = {}) {
    const root = new Rng(opts.seed ?? 1);
    this.warmup = opts.warmup ?? 0;
    this.logLimit = opts.log === true ? Infinity : typeof opts.log === 'number' ? opts.log : 0;
    for (const def of model.nodes) {
      if (this.nodes.has(def.id)) throw new ModelError(`duplicate node ${def.id}`);
      this.nodes.set(def.id, {
        def, id: def.id, out: [], waiters: [], q: [], rng: root.fork(def.id),
        state: 'idle', since: 0, ttf: Infinity, remaining: 0, ev: null, acc: { idle: 0, busy: 0, blocked: 0, down: 0 }, done: 0, ngCount: 0,
        levelArea: 0, levelSince: 0, maxLevel: 0, headEv: null, created: 0, arrivalEv: null,
      });
    }
    for (const r of model.routes) {
      const a = this.nodes.get(r.from), b = this.nodes.get(r.to);
      if (!a || !b) throw new ModelError(`route ${r.from} → ${r.to}: unknown node`);
      if (a.def.kind === 'sink') throw new ModelError(`route from sink ${r.from}`);
      if (b.def.kind === 'source') throw new ModelError(`route into source ${r.to}`);
      a.out.push({ to: r.to, w: r.ratio ?? 1 });
    }
    for (const n of this.nodes.values()) {
      if (n.def.kind !== 'sink' && !n.out.length) throw new ModelError(`${n.id} has no outgoing route`);
      if (n.def.kind === 'station') {
        if (n.def.ng && !this.nodes.has(n.def.ng)) throw new ModelError(`${n.id}: NG exit ${n.def.ng} unknown`);
        n.ttf = n.def.mtbf !== undefined ? n.rng.sample(n.def.mtbf) : Infinity;
      }
    }
    if (this.warmup > 0) this.sched.at(this.warmup, () => this.resetStats());
    for (const n of this.nodes.values()) if (n.def.kind === 'source') this.startSource(n);
  }

  get now(): number { return this.sched.now; }
  run(until: number): this { this.sched.runUntil(until); return this; }

  /* ---------- logging & stats ---------- */
  private note(kind: LogKind, part: Part, node: string): void { if (this.log.length < this.logLimit) this.log.push({ t: this.now, kind, part: part.id, node }); }
  private setState(n: N, s: StationState): void { n.acc[n.state] += this.now - n.since; n.state = s; n.since = this.now; }
  private level(n: N, delta: number): void {
    n.levelArea += n.q.length * (this.now - n.levelSince); n.levelSince = this.now;
    void delta; n.maxLevel = Math.max(n.maxLevel, n.q.length);
  }
  private wipChange(d: number): void { this.wipArea += this.wip * (this.now - this.wipSince); this.wipSince = this.now; this.wip += d; }
  private resetStats(): void {
    this.statsFrom = this.now;
    for (const n of this.nodes.values()) {
      n.acc = { idle: 0, busy: 0, blocked: 0, down: 0 }; n.since = this.now; n.done = 0; n.ngCount = 0;
      n.levelArea = 0; n.levelSince = this.now; n.maxLevel = n.q.length;
    }
    this.wipArea = 0; this.wipSince = this.now; this.exits = []; this.exitCount = 0; this.ngExit = 0;
  }

  /* ---------- flow ---------- */
  private canAccept(n: N): boolean {
    switch (n.def.kind) {
      case 'sink': return true;
      case 'buffer': return n.q.length < n.def.cap;
      case 'station': return n.q.length === 0 && n.state === 'idle';
      case 'source': return false;
    }
  }
  private accept(n: N, p: Part): void {
    p.at = n.id; p.next = null; p.enteredAt = this.now;
    this.note('enter', p, n.id);
    switch (n.def.kind) {
      case 'sink': {
        this.parts.delete(p.id); this.wipChange(-1);
        if (p.ng) { this.ngExit++; this.note('ng', p, n.id); }
        else { this.exitCount++; if (p.born >= this.statsFrom || this.statsFrom === 0) this.exits.push(this.now - p.born); this.note('exit', p, n.id); }
        return;
      }
      case 'buffer':
        this.level(n, 1); n.q.push(p); n.maxLevel = Math.max(n.maxLevel, n.q.length);
        p.readyAt = this.now + (n.def.transit ?? 0);
        if (n.q.length === 1) this.bufferHead(n);
        return;
      case 'station':
        n.q.push(p); this.startWork(n, p);
        return;
      case 'source': throw new Error('unreachable');
    }
  }
  /** choose where a part goes next (once; a blocked part keeps its choice) */
  private destOf(n: N, p: Part): N {
    if (p.ng && n.def.kind === 'station' && n.def.ng) return this.nodes.get(n.def.ng)!;
    if (!p.next) p.next = n.out.length === 1 ? n.out[0]!.to : n.rng.pick(n.out.map(o => o.to), n.out.map(o => o.w));
    return this.nodes.get(p.next)!;
  }
  /** try to hand the part `p` held by `n` on; true if it moved */
  private push(n: N, p: Part): boolean {
    const d = this.destOf(n, p);
    if (!this.canAccept(d)) { if (!d.waiters.includes(n.id)) d.waiters.push(n.id); return false; }
    const i = n.q.indexOf(p);
    if (n.def.kind === 'buffer') this.level(n, -1);
    if (i >= 0) n.q.splice(i, 1);
    this.accept(d, p);
    this.freed(n);
    return true;
  }
  /** n has room again: let blocked upstream nodes push, then n's own follow-up */
  private freed(n: N): void {
    if (n.def.kind === 'station') { this.setState(n, 'idle'); }
    if (n.def.kind === 'buffer' && n.q.length) this.bufferHead(n);
    if (n.def.kind === 'source') { this.sourceNext(n); }
    while (n.waiters.length && this.canAccept(n)) {
      const u = this.nodes.get(n.waiters.shift()!)!;
      this.retry(u);
    }
  }
  private retry(u: N): void {
    if (u.def.kind === 'source') return this.sourceNext(u);
    const p = u.def.kind === 'buffer' ? u.q[0] : u.q[0];
    if (!p) return;
    if (u.def.kind === 'buffer' && p.readyAt > this.now) return this.bufferHead(u);
    if (u.def.kind === 'station' && u.state !== 'blocked') return;
    this.push(u, p);
  }

  /* ---------- sources ---------- */
  private newPart(src: N): Part {
    const p: Part = { id: this.nextId++, born: this.now, at: src.id, next: null, ng: false, readyAt: this.now, enteredAt: this.now };
    this.parts.set(p.id, p); src.created++; this.wipChange(1); this.note('create', p, src.id);
    return p;
  }
  private startSource(n: N): void {
    const d = n.def as Extract<NodeDef, { kind: 'source' }>;
    if (d.interarrival !== undefined) {
      const arrive = () => {
        if (d.limit !== undefined && n.created >= d.limit) return;
        n.q.push(this.newPart(n));
        if (n.q.length === 1) this.sourceNext(n);
        n.arrivalEv = this.sched.after(n.rng.sample(d.interarrival!), arrive);
      };
      n.arrivalEv = this.sched.after(n.rng.sample(d.interarrival), arrive);
    } else {
      this.sched.after(0, () => this.sourceNext(n));
    }
  }
  /** infinite supply: create a part only when the next place can take it */
  private sourceNext(n: N): void {
    const d = n.def as Extract<NodeDef, { kind: 'source' }>;
    if (d.interarrival !== undefined) {
      const p = n.q[0]; if (p) this.push(n, p);
      return;
    }
    if (d.limit !== undefined && n.created >= d.limit) return;
    // decide the destination before creating, so no part waits at the source
    const probe = n.out.length === 1 ? this.nodes.get(n.out[0]!.to)! : null;
    if (probe && !this.canAccept(probe)) { if (!probe.waiters.includes(n.id)) probe.waiters.push(n.id); return; }
    const p = this.newPart(n); n.q.push(p);
    this.push(n, p);
  }

  /* ---------- buffers ---------- */
  private bufferHead(n: N): void {
    const p = n.q[0]; if (!p) return;
    this.sched.cancel(n.headEv); n.headEv = null;
    if (p.readyAt > this.now) { n.headEv = this.sched.at(p.readyAt, () => { n.headEv = null; this.bufferHead(n); }); return; }
    this.push(n, p);
  }

  /* ---------- stations ---------- */
  private startWork(n: N, p: Part): void {
    const d = n.def as Extract<NodeDef, { kind: 'station' }>;
    this.setState(n, 'busy'); this.note('start', p, n.id);
    n.remaining = n.rng.sample(d.ct);
    this.work(n, p);
  }
  private work(n: N, p: Part): void {
    const d = n.def as Extract<NodeDef, { kind: 'station' }>;
    if (n.ttf >= n.remaining) {
      n.ttf -= n.remaining;
      n.ev = this.sched.after(n.remaining, () => this.finish(n, p));
    } else {
      const run = n.ttf; n.remaining -= run;
      n.ev = this.sched.after(run, () => {
        this.setState(n, 'down'); this.note('fail', p, n.id);
        n.ev = this.sched.after(n.rng.sample(d.mttr ?? 0), () => {
          n.ttf = n.rng.sample(d.mtbf!); this.setState(n, 'busy'); this.note('repair', p, n.id); this.work(n, p);
        });
      });
    }
  }
  private finish(n: N, p: Part): void {
    const d = n.def as Extract<NodeDef, { kind: 'station' }>;
    n.ev = null; n.done++;
    if (d.okRate !== undefined && d.okRate < 1 && n.rng.next() >= d.okRate) { p.ng = true; n.ngCount++; }
    this.note('finish', p, n.id);
    this.setState(n, 'blocked');
    if (!this.push(n, p)) this.note('block', p, n.id);
  }

  /* ---------- results ---------- */
  result(): LineResult {
    const T = this.now - this.statsFrom;
    const stations: LineResult['stations'] = {}, buffers: LineResult['buffers'] = {};
    for (const n of this.nodes.values()) {
      if (n.def.kind === 'station') {
        const acc = { ...n.acc }; acc[n.state] += this.now - n.since;
        const f = (k: StationState) => (T > 0 ? acc[k] / T : 0);
        stations[n.id] = { name: n.def.name ?? n.id, busy: f('busy'), idle: f('idle'), blocked: f('blocked'), down: f('down'), done: n.done, ng: n.ngCount, state: n.state };
      } else if (n.def.kind === 'buffer') {
        const area = n.levelArea + n.q.length * (this.now - n.levelSince);
        buffers[n.id] = { name: n.def.name ?? n.id, cap: n.def.cap, avg: T > 0 ? area / T : 0, max: n.maxLevel, now: n.q.length };
      }
    }
    const lt = [...this.exits].sort((a, b) => a - b);
    const q = (x: number) => (lt.length ? lt[Math.min(lt.length - 1, Math.floor(x * lt.length))]! : 0);
    const ranked = Object.entries(stations).sort((a, b) => (b[1].busy + b[1].down) - (a[1].busy + a[1].down));
    return {
      time: this.now, measured: T,
      produced: this.exitCount, scrapped: this.ngExit,
      throughputPerHour: T > 0 ? (this.exitCount / T) * 3600 : 0,
      wip: T > 0 ? (this.wipArea + this.wip * (this.now - this.wipSince)) / T : 0,
      wipNow: this.wip,
      leadTime: { mean: lt.length ? lt.reduce((a, b) => a + b, 0) / lt.length : 0, p50: q(0.5), p95: q(0.95), n: lt.length },
      bottleneck: ranked[0]?.[0] ?? null,
      stations, buffers,
    };
  }
  /** where every part is now, for drawing */
  snapshot(): { t: number; parts: { id: number; at: string; ng: boolean; enteredAt: number }[]; states: Record<string, StationState> } {
    const states: Record<string, StationState> = {};
    for (const n of this.nodes.values()) if (n.def.kind === 'station') states[n.id] = n.state;
    return { t: this.now, parts: [...this.parts.values()].map(p => ({ id: p.id, at: p.at, ng: p.ng, enteredAt: p.enteredAt })), states };
  }
  /** created = in the line + left as good + left as NG (checked by tests) */
  conservation(): { created: number; inLine: number; out: number } {
    let created = 0; for (const n of this.nodes.values()) created += n.created;
    return { created, inLine: this.parts.size, out: created - this.parts.size };
  }
}

export interface LineResult {
  time: number; measured: number; produced: number; scrapped: number; throughputPerHour: number;
  wip: number; wipNow: number;
  leadTime: { mean: number; p50: number; p95: number; n: number };
  bottleneck: string | null;
  stations: Record<string, { name: string; busy: number; idle: number; blocked: number; down: number; done: number; ng: number; state: StationState }>;
  buffers: Record<string, { name: string; cap: number; avg: number; max: number; now: number }>;
}

/** Headless run: horizon in seconds (R1 §8.2 "정식" mode uses the same code). */
export function simulateLine(model: LineModel, horizon: number, opts: RunOptions = {}): LineResult {
  return new LineSim(model, opts).run(horizon).result();
}
