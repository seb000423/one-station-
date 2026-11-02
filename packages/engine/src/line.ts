/**
 * DES layer (R1 §8.1): a production line as sources, buffers / conveyors, stations and sinks joined by
 * routes. Parts are single objects that travel the whole line (no part appears or disappears except at
 * a source, a sink, or inside a reject station's closed NG store), every move is logged, so the 3D view
 * can replay exactly what the numbers count.
 *
 * Station rules: one part at a time; processing time from the card's distribution; operation-dependent
 * failures (time to failure is consumed only while processing); blocking after service (a finished part
 * stays on the station until the next place has room). Buffers are FIFO with a capacity; a buffer with
 * `transit` is an accumulating conveyor (a part can leave no earlier than `transit` s after entering).
 *
 * Jig pallets (carriers): a pool of pallets circulates; a station with `pool` loads a part onto the pallet
 * standing at its stop, the pallet leaves the line at a sink and comes back after the return trip, then a
 * lift brings it up to the stop one at a time. A part rejected on the way (NG) is taken off its pallet at a
 * reject station; the empty pallet runs on through the line (stations pass it in `emptyCt`) like the real one.
 */
import { Scheduler, type Ev } from './des';
import { Rng, type Dist } from './rng';

export type NodeDef =
  | { kind: 'source'; id: string; name?: string; interarrival?: Dist; limit?: number; lot?: number; gap?: number;
      /** with interarrival: an arrival that finds no room waits, and is put on once there is room (the next interval
       *  counts from then), so nothing piles up out of sight at the source */ hold?: boolean }
  | { kind: 'buffer'; id: string; name?: string; cap: number; transit?: number; /** time from the first waiting place to the next stop */ index?: number;
    /** the head asks the stop ahead for its turn this long before it would reach it (at its waiting place); default 0 */ request?: number }
  | {
    kind: 'station'; id: string; name?: string; ct: Dist; okRate?: number; mtbf?: Dist; mttr?: Dist; ng?: string; operators?: number;
    /** time to pass an empty pallet */ emptyCt?: number;
    /** NG parts are taken off here (the closed NG store); time of that trip */ reject?: number;
    /** after every `every` good parts the station is set up for `time` s (e.g. a full carton is changed) */ setup?: { every: number; time: number };
    /** loads the part onto a pallet from this pool (the pallet must stand at the stop) */ pool?: string;
    /** after a pallet leaves, the next can arrive at the stop no sooner than this (stop blade back up / approach) */ turnover?: number;
    /** coming straight from the station before (no waiting place in between): travel time from that stop to this one */ approach?: number;
  }
  | { kind: 'sink'; id: string; name?: string };
export interface RouteDef { from: string; to: string; ratio?: number }
/** a pallet loop: count pallets; return trip from the sink to the start lift; lift up time; lift cycle (up, unload, down); move-up time of the next pallet onto the lift */
export interface PoolDef { id: string; count: number; returnTrip: number; liftUp: number; liftCycle: number; liftIndex: number }
export interface LineModel { nodes: NodeDef[]; routes: RouteDef[]; pools?: PoolDef[] }

export type StationState = 'idle' | 'busy' | 'blocked' | 'down' | 'setup';
export type WorkMode = 'work' | 'reject' | 'empty';
export interface Part {
  id: number; seq: number; born: number; at: string; next: string | null; ng: boolean; empty: boolean; readyAt: number; enteredAt: number; src: string;
  carrier: number | null; pool: string | null; /** the node it came from */ prev: string | null;
}
export type LogKind = 'create' | 'enter' | 'arrive' | 'start' | 'finish' | 'fail' | 'repair' | 'block' | 'exit' | 'ng' | 'reject' | 'setup' | 'ready' | 'lift' | 'top' | 'return';
export interface LogEntry { t: number; kind: LogKind; part: number; node: string }
export interface RunOptions { seed?: number; warmup?: number; log?: boolean | number }

interface Pool { def: PoolDef; lower: { id: number; readyAt: number }[]; top: { id: number; at: number; part: number | null } | null; liftFreeAt: number; ev: Ev | null; station: string | null; returning: Map<number, number> }

interface N {
  def: NodeDef; id: string;
  out: { to: string; w: number }[];
  waiters: string[]; // upstream nodes blocked on this one, FIFO
  q: Part[]; // buffer contents / source queue / station's single part
  rng: Rng;
  // station
  state: StationState; since: number; ttf: number; remaining: number; ev: Ev | null; mode: WorkMode;
  ctNow: number; workStart: number; arriveAt: number; freeSince: number; good: number; lastSetupAt: number; willFail: boolean;
  acc: Record<StationState, number>; done: number; ngCount: number;
  // buffer
  levelArea: number; levelSince: number; maxLevel: number; headEv: Ev | null;
  // source
  created: number; arrivalEv: Ev | null; lotStart: number; holdEv: Ev | null; pending: boolean;
  /** pallets still on their place that already belong to the next station but have not set off yet */ held: Part[];
}

export class ModelError extends Error {}

export class LineSim {
  readonly sched = new Scheduler();
  readonly nodes = new Map<string, N>();
  readonly pools = new Map<string, Pool>();
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
        state: 'idle', since: 0, ttf: Infinity, remaining: 0, ev: null, mode: 'work', ctNow: 0, workStart: 0, arriveAt: 0, freeSince: -Infinity, good: 0, lastSetupAt: 0, willFail: false,
        acc: { idle: 0, busy: 0, blocked: 0, down: 0, setup: 0 }, done: 0, ngCount: 0,
        levelArea: 0, levelSince: 0, maxLevel: 0, headEv: null, created: 0, arrivalEv: null, lotStart: -Infinity, holdEv: null, pending: false, held: [],
      });
    }
    for (const r of model.routes) {
      const a = this.nodes.get(r.from), b = this.nodes.get(r.to);
      if (!a || !b) throw new ModelError(`route ${r.from} → ${r.to}: unknown node`);
      if (a.def.kind === 'sink') throw new ModelError(`route from sink ${r.from}`);
      if (b.def.kind === 'source') throw new ModelError(`route into source ${r.to}`);
      a.out.push({ to: r.to, w: r.ratio ?? 1 });
    }
    for (const p of model.pools ?? []) {
      if (p.count < 1) throw new ModelError(`pool ${p.id}: no pallets`);
      // at the start one pallet stands at the stop, the others wait on the return conveyor in front of the lift
      this.pools.set(p.id, { def: p, top: { id: 0, at: 0, part: null }, lower: Array.from({ length: p.count - 1 }, (_, i) => ({ id: i + 1, readyAt: 0 })), liftFreeAt: 0, ev: null, station: null, returning: new Map() });
    }
    for (const n of this.nodes.values()) {
      if (n.def.kind !== 'sink' && !n.out.length) throw new ModelError(`${n.id} has no outgoing route`);
      if (n.def.kind === 'station') {
        if (n.def.ng && !this.nodes.has(n.def.ng)) throw new ModelError(`${n.id}: NG exit ${n.def.ng} unknown`);
        if (n.def.pool) { const pl = this.pools.get(n.def.pool); if (!pl) throw new ModelError(`${n.id}: pool ${n.def.pool} unknown`); pl.station = n.id; }
        n.ttf = n.def.mtbf !== undefined ? n.rng.sample(n.def.mtbf) : Infinity;
      }
    }
    if (this.warmup > 0) this.sched.at(this.warmup, () => this.resetStats());
    for (const n of this.nodes.values()) if (n.def.kind === 'source') this.startSource(n);
  }

  get now(): number { return this.sched.now; }
  run(until: number): this { this.sched.runUntil(until); return this; }

  /* ---------- logging & stats ---------- */
  private note(kind: LogKind, part: Part | number, node: string): void { if (this.log.length < this.logLimit) this.log.push({ t: this.now, kind, part: typeof part === 'number' ? part : part.id, node }); }
  private setState(n: N, s: StationState): void { n.acc[n.state] += this.now - n.since; n.state = s; n.since = this.now; }
  private level(n: N): void { n.levelArea += n.q.length * (this.now - n.levelSince); n.levelSince = this.now; n.maxLevel = Math.max(n.maxLevel, n.q.length); }
  private wipChange(d: number): void { this.wipArea += this.wip * (this.now - this.wipSince); this.wipSince = this.now; this.wip += d; }
  private resetStats(): void {
    this.statsFrom = this.now;
    for (const n of this.nodes.values()) {
      n.acc = { idle: 0, busy: 0, blocked: 0, down: 0, setup: 0 }; n.since = this.now; n.done = 0; n.ngCount = 0;
      n.levelArea = 0; n.levelSince = this.now; n.maxLevel = n.q.length;
    }
    this.wipArea = 0; this.wipSince = this.now; this.exits = []; this.exitCount = 0; this.ngExit = 0;
  }

  /* ---------- flow ---------- */
  private canAccept(n: N): boolean {
    switch (n.def.kind) {
      case 'sink': return true;
      case 'buffer': return n.q.length + n.held.length < n.def.cap;
      case 'station': {
        if (n.q.length !== 0 || n.state !== 'idle') return false;
        if (n.def.pool) { const top = this.pools.get(n.def.pool)!.top; return !!top && top.at <= this.now && top.part === null; }
        return true;
      }
      case 'source': return false;
    }
  }
  private accept(n: N, p: Part, from: N | null): void {
    p.prev = from ? from.def.id : null; p.at = n.id; p.next = null; p.enteredAt = this.now;
    this.note('enter', p, n.id);
    switch (n.def.kind) {
      case 'sink': {
        this.parts.delete(p.id);
        this.carrierBack(p);
        if (p.empty) return; // an empty pallet leaves the line (its part was taken off at a reject station)
        this.wipChange(-1);
        if (p.ng) { this.ngExit++; this.note('ng', p, n.id); }
        else { this.exitCount++; if (p.born >= this.statsFrom || this.statsFrom === 0) this.exits.push(this.now - p.born); this.note('exit', p, n.id); }
        return;
      }
      case 'buffer':
        this.level(n); n.q.push(p); n.maxLevel = Math.max(n.maxLevel, n.q.length);
        p.readyAt = this.now + (n.def.transit ?? 0);
        if (n.q.length === 1) this.bufferHead(n);
        return;
      case 'station': {
        n.q.push(p);
        if (n.def.pool) { const pl = this.pools.get(n.def.pool)!; pl.top!.part = p.id; p.carrier = pl.top!.id; p.pool = pl.def.id; }
        // a pallet that had to wait behind the stop moves up only once the stop is free again (blade up, previous pallet clear)
        const arrive = from && from.def.kind === 'buffer' ? Math.max(p.readyAt, n.freeSince + (n.def.turnover ?? 0))
          : from && from.def.kind === 'station' && n.def.approach ? Math.max(this.now + n.def.approach, n.freeSince + (n.def.turnover ?? 0)) : this.now;
        n.arriveAt = arrive;
        if (arrive > this.now + 1e-9) { this.note('arrive', p, n.id); n.ev = this.sched.at(arrive, () => { n.ev = null; this.startWork(n, p); }); }
        else this.startWork(n, p);
        return;
      }
      case 'source': throw new Error('unreachable');
    }
  }
  /** choose where a part goes next (once; a blocked part keeps its choice) */
  private destOf(n: N, p: Part): N {
    if (p.ng && !p.empty && n.def.kind === 'station' && n.def.ng) return this.nodes.get(n.def.ng)!;
    if (!p.next) p.next = n.out.length === 1 ? n.out[0]!.to : n.rng.pick(n.out.map(o => o.to), n.out.map(o => o.w));
    return this.nodes.get(p.next)!;
  }
  /** try to hand the part `p` held by `n` on; true if it moved */
  private push(n: N, p: Part): boolean {
    const d = this.destOf(n, p);
    if (!this.canAccept(d)) { if (!d.waiters.includes(n.id)) d.waiters.push(n.id); return false; }
    const i = n.q.indexOf(p);
    if (n.def.kind === 'buffer') this.level(n);
    if (i >= 0) n.q.splice(i, 1);
    this.accept(d, p, n);
    // a pallet whose stop ahead is not ready yet stays where it is (waiting place / the stop before) until it has to set off
    const run = d.def.kind !== 'station' ? 0 : n.def.kind === 'buffer' ? (n.def.index ?? n.def.transit ?? 0) : n.def.kind === 'station' ? (d.def.approach ?? 0) : 0;
    const depart = d.def.kind === 'station' && (n.def.kind === 'buffer' || d.def.approach) ? d.arriveAt - run : this.now;
    if (depart > this.now + 1e-9) {
      if (n.def.kind === 'buffer') { n.held.push(p); this.sched.at(depart, () => { n.held.splice(n.held.indexOf(p), 1); this.freed(n); }); return true; }
      if (n.def.kind === 'station') { this.sched.at(depart, () => this.freed(n)); return true; } // stays 'blocked' with the pallet on its stop
    }
    this.freed(n);
    return true;
  }
  /** n has room again: let blocked upstream nodes push, then n's own follow-up */
  private freed(n: N): void {
    if (n.def.kind === 'station') {
      n.freeSince = this.now;
      if (n.def.pool) { const pl = this.pools.get(n.def.pool)!; pl.top = null; this.tryLift(pl); }
      const su = n.def.setup;
      if (su && n.mode === 'work' && n.good > 0 && n.good % su.every === 0 && n.lastSetupAt !== n.good) {
        n.lastSetupAt = n.good;
        this.setState(n, 'setup'); this.note('setup', 0, n.id);
        n.ev = this.sched.after(su.time, () => { n.ev = null; this.setState(n, 'idle'); n.freeSince = this.now; this.note('ready', 0, n.id); this.wake(n); });
        return;
      }
      this.setState(n, 'idle');
    }
    if (n.def.kind === 'buffer' && n.q.length) this.bufferHead(n);
    if (n.def.kind === 'source') { this.sourceNext(n); }
    this.wake(n);
  }
  private wake(n: N): void {
    while (n.waiters.length && this.canAccept(n)) {
      const u = this.nodes.get(n.waiters.shift()!)!;
      this.retry(u);
    }
  }
  private retry(u: N): void {
    if (u.def.kind === 'source') return this.sourceNext(u);
    const p = u.q[0];
    if (!p) return;
    if (u.def.kind === 'buffer' && p.readyAt - (u.def.request ?? 0) > this.now + 1e-9) return this.bufferHead(u);
    if (u.def.kind === 'station' && u.state !== 'blocked') return;
    this.push(u, p);
  }

  /* ---------- sources ---------- */
  private newPart(src: N): Part {
    const p: Part = { id: this.nextId++, seq: src.created, born: this.now, at: src.id, next: null, ng: false, empty: false, readyAt: this.now, enteredAt: this.now, src: src.id, carrier: null, pool: null, prev: null };
    this.parts.set(p.id, p); src.created++; this.wipChange(1); this.note('create', p, src.id);
    return p;
  }
  private startSource(n: N): void {
    const d = n.def as Extract<NodeDef, { kind: 'source' }>;
    if (d.interarrival !== undefined) {
      const arrive = () => {
        if (d.limit !== undefined && n.created >= d.limit) return;
        if (d.hold) { n.pending = true; n.arrivalEv = null; this.sourceNext(n); return; }
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
      if (d.hold) {
        if (!n.pending) return;
        const probe = this.nodes.get(n.out[0]!.to)!;
        if (!this.canAccept(probe)) { if (!probe.waiters.includes(n.id)) probe.waiters.push(n.id); return; }
        n.pending = false;
        const p = this.newPart(n); n.q.push(p); this.push(n, p);
        n.arrivalEv = this.sched.after(n.rng.sample(d.interarrival), () => { n.arrivalEv = null; if (d.limit !== undefined && n.created >= d.limit) return; n.pending = true; this.sourceNext(n); });
        return;
      }
      const p = n.q[0]; if (p) this.push(n, p);
      return;
    }
    if (d.limit !== undefined && n.created >= d.limit) return;
    // supply in lots (a tote of `lot` parts): the first part of the next lot not before `gap` s after the last lot's first part
    if (d.lot && n.created > 0 && n.created % d.lot === 0) {
      const ready = n.lotStart + (d.gap ?? 0);
      if (ready > this.now + 1e-9) { if (!n.holdEv) n.holdEv = this.sched.at(ready, () => { n.holdEv = null; this.sourceNext(n); }); return; }
    }
    // decide the destination before creating, so no part waits at the source
    const probe = n.out.length === 1 ? this.nodes.get(n.out[0]!.to)! : null;
    if (probe && !this.canAccept(probe)) { if (!probe.waiters.includes(n.id)) probe.waiters.push(n.id); return; }
    if (d.lot && n.created % d.lot === d.lot - 1) n.lotStart = this.now; // the last part of a lot: the refill starts from here
    const p = this.newPart(n); n.q.push(p);
    this.push(n, p);
  }

  /* ---------- pallet pools ---------- */
  /** a pallet left the line: it comes back to the start lift after the return trip */
  private carrierBack(p: Part): void {
    if (p.carrier === null || !p.pool) return;
    const pl = this.pools.get(p.pool)!, id = p.carrier;
    pl.returning.set(id, this.now);
    this.sched.after(pl.def.returnTrip, () => { pl.returning.delete(id); pl.lower.push({ id, readyAt: this.now }); this.note('return', id, pl.def.id); this.tryLift(pl); });
  }
  private tryLift(pl: Pool): void {
    if (pl.top || !pl.lower.length) return;
    const h = pl.lower[0]!, t0 = Math.max(this.now, h.readyAt, pl.liftFreeAt);
    if (t0 > this.now + 1e-9) { this.sched.cancel(pl.ev); pl.ev = this.sched.at(t0, () => { pl.ev = null; this.tryLift(pl); }); return; }
    pl.lower.shift();
    pl.top = { id: h.id, at: this.now + pl.def.liftUp, part: null };
    pl.liftFreeAt = this.now + pl.def.liftCycle;
    if (pl.lower.length) pl.lower[0]!.readyAt = Math.max(pl.lower[0]!.readyAt, pl.liftFreeAt + pl.def.liftIndex); // the next pallet moves onto the lift once it is down again
    this.note('lift', h.id, pl.def.id);
    this.sched.after(pl.def.liftUp, () => { this.note('top', h.id, pl.def.id); if (pl.station) this.wake(this.nodes.get(pl.station)!); });
  }

  /* ---------- buffers ---------- */
  private bufferHead(n: N): void {
    const p = n.q[0]; if (!p) return;
    this.sched.cancel(n.headEv); n.headEv = null;
    const ask = p.readyAt - (n.def.kind === 'buffer' ? n.def.request ?? 0 : 0); // a merge asks at the waiting place, so two items never race for the point
    if (ask > this.now + 1e-9) { n.headEv = this.sched.at(ask, () => { n.headEv = null; this.bufferHead(n); }); return; }
    this.push(n, p);
  }

  /* ---------- stations ---------- */
  private startWork(n: N, p: Part): void {
    const d = n.def as Extract<NodeDef, { kind: 'station' }>;
    n.mode = p.empty ? 'empty' : d.reject !== undefined && p.ng ? 'reject' : 'work';
    this.setState(n, 'busy'); this.note('start', p, n.id);
    n.ctNow = n.mode === 'empty' ? (d.emptyCt ?? n.rng.sample(d.ct)) : n.mode === 'reject' ? d.reject! : n.rng.sample(d.ct);
    // the check's verdict is drawn when the work starts (the 3D view shows the NG lamp during the test, not after it)
    n.willFail = n.mode === 'work' && d.okRate !== undefined && d.okRate < 1 && n.rng.next() >= d.okRate;
    n.remaining = n.ctNow; n.workStart = this.now;
    this.work(n, p);
  }
  private work(n: N, p: Part): void {
    const d = n.def as Extract<NodeDef, { kind: 'station' }>;
    if (n.mode !== 'work' || n.ttf >= n.remaining) {
      if (n.mode === 'work') n.ttf -= n.remaining;
      n.ev = this.sched.after(n.remaining, () => { n.remaining = 0; this.finish(n, p); });
      n.workStart = this.now;
    } else {
      const run = n.ttf; n.workStart = this.now;
      n.ev = this.sched.after(run, () => {
        n.remaining -= run;
        this.setState(n, 'down'); this.note('fail', p, n.id);
        n.ev = this.sched.after(n.rng.sample(d.mttr ?? 0), () => {
          n.ttf = n.rng.sample(d.mtbf!); this.setState(n, 'busy'); this.note('repair', p, n.id); this.work(n, p);
        });
      });
    }
  }
  private finish(n: N, p: Part): void {
    const d = n.def as Extract<NodeDef, { kind: 'station' }>;
    n.ev = null;
    if (n.mode === 'reject') { p.empty = true; n.ngCount++; this.ngExit++; this.wipChange(-1); this.note('reject', p, n.id); }
    else if (n.mode === 'work') {
      n.done++;
      if (n.willFail) { p.ng = true; n.ngCount++; }
      if (!p.ng) n.good++;
    }
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
        stations[n.id] = { name: n.def.name ?? n.id, busy: f('busy'), idle: f('idle'), blocked: f('blocked'), down: f('down'), setup: f('setup'), done: n.done, ng: n.ngCount, state: n.state };
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

  /** where every part and pallet is now, with each station's progress, for drawing */
  snapshot(): Snapshot {
    const states: Snapshot['states'] = {}, stations: Snapshot['stations'] = {}, buffers: Snapshot['buffers'] = {};
    for (const n of this.nodes.values()) {
      if (n.def.kind === 'station') {
        states[n.id] = n.state;
        const p = n.q[0];
        let progress = 0;
        if (p && n.ctNow > 0) {
          const left = n.state === 'busy' && n.ev ? Math.max(0, n.remaining - (this.now - n.workStart)) : n.state === 'down' ? n.remaining : n.state === 'blocked' ? 0 : n.remaining;
          progress = n.arriveAt > this.now ? 0 : Math.min(1, Math.max(0, 1 - left / n.ctNow));
        }
        stations[n.id] = { state: n.state, part: p?.id ?? null, mode: n.mode, progress, arriveAt: n.arriveAt, ct: n.ctNow, good: n.good, since: n.since, willFail: !!p && n.willFail };
      } else if (n.def.kind === 'buffer') buffers[n.id] = [...n.held, ...n.q].map(p => p.id); // the ones about to set off for the next stop first
    }
    const pools: Snapshot['pools'] = {};
    for (const pl of this.pools.values()) pools[pl.def.id] = { top: pl.top ? { ...pl.top } : null, lower: pl.lower.map(l => ({ ...l })), returning: [...pl.returning.entries()].map(([id, since]) => ({ id, since })), liftFreeAt: pl.liftFreeAt };
    return {
      t: this.now, states, stations, buffers, pools,
      parts: [...this.parts.values()].map(p => ({ id: p.id, seq: p.seq, at: p.at, prev: p.prev, ng: p.ng, empty: p.empty, enteredAt: p.enteredAt, readyAt: p.readyAt, carrier: p.carrier })),
    };
  }
  /** created = in the line + left (good, NG at a sink or taken off at a reject station) — checked by tests */
  conservation(): { created: number; inLine: number; out: number } {
    let created = 0; for (const n of this.nodes.values()) created += n.created;
    let inLine = 0; for (const p of this.parts.values()) if (!p.empty) inLine++;
    return { created, inLine, out: created - inLine };
  }
}

export interface Snapshot {
  t: number;
  states: Record<string, StationState>;
  stations: Record<string, { state: StationState; part: number | null; mode: WorkMode; progress: number; arriveAt: number; ct: number; good: number; since: number; willFail: boolean }>;
  buffers: Record<string, number[]>;
  pools: Record<string, { top: { id: number; at: number; part: number | null } | null; lower: { id: number; readyAt: number }[]; returning: { id: number; since: number }[]; liftFreeAt: number }>;
  parts: { id: number; seq: number; at: string; prev: string | null; ng: boolean; empty: boolean; enteredAt: number; readyAt: number; carrier: number | null }[];
}

export interface LineResult {
  time: number; measured: number; produced: number; scrapped: number; throughputPerHour: number;
  wip: number; wipNow: number;
  leadTime: { mean: number; p50: number; p95: number; n: number };
  bottleneck: string | null;
  stations: Record<string, { name: string; busy: number; idle: number; blocked: number; down: number; setup: number; done: number; ng: number; state: StationState }>;
  buffers: Record<string, { name: string; cap: number; avg: number; max: number; now: number }>;
}

/** Headless run: horizon in seconds (R1 §8.2 "정식" mode uses the same code). */
export function simulateLine(model: LineModel, horizon: number, opts: RunOptions = {}): LineResult {
  return new LineSim(model, opts).run(horizon).result();
}
