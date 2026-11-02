/**
 * Signal layer (R1 §2 principle 2, §8.1): one signal table that every layer reads and writes; nothing
 * else connects the layers. A tag is a name → slot in a Float64Array (bool = 0 / 1), so the table can
 * later be shared with a worker or replaced by real PLC tags through a mapping.
 * SequenceRunner executes a machine's simple sequence (wait → set → delay) on a fixed 10 ms tick, and
 * OnOffAxis is the device model of an ON/OFF actuator (FWD / BWD commands → position → limit switches).
 */
import type { Profile } from './kinematics';
import { trapezoid, positionAt } from './kinematics';

export const TICK = 0.01; // s (R1 §5)

export class SignalTable {
  private index = new Map<string, number>();
  values = new Float64Array(64);
  private listeners: ((tag: string, v: number, t: number) => void)[] = [];
  t = 0;
  define(tag: string, init = 0): number {
    let i = this.index.get(tag);
    if (i === undefined) {
      i = this.index.size; this.index.set(tag, i);
      if (i >= this.values.length) { const v = new Float64Array(this.values.length * 2); v.set(this.values); this.values = v; }
      this.values[i] = init;
    }
    return i;
  }
  has(tag: string): boolean { return this.index.has(tag); }
  get(tag: string): number { const i = this.index.get(tag); if (i === undefined) throw new Error(`unknown tag ${tag}`); return this.values[i]!; }
  set(tag: string, v: number | boolean): void {
    const i = this.define(tag), n = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    if (this.values[i] === n) return;
    this.values[i] = n; for (const l of this.listeners) l(tag, n, this.t);
  }
  on(fn: (tag: string, v: number, t: number) => void): () => void { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  tags(): string[] { return [...this.index.keys()]; }
  snapshot(): Record<string, number> { return Object.fromEntries([...this.index].map(([k, i]) => [k, this.values[i]!])); }
}

export interface Device { tick(sig: SignalTable, dt: number): void }

/** ON/OFF axis: n_FWD / n_BWD drive it, n_FWD_LS / n_BWD_LS report the ends (words per R1 §4.4). */
export class OnOffAxis implements Device {
  pos = 0; private move: { p: Profile; t: number; from: number } | null = null;
  constructor(readonly name: string, readonly stroke: number, readonly vmax: number, readonly amax: number, readonly words: [string, string] = ['FWD', 'BWD'], readonly cushion = 0) {}
  private tag(s: string): string { return `${this.name}_${s}`; }
  init(sig: SignalTable): void {
    const [a, b] = this.words;
    for (const s of [a, b, `${a}_LS`, `${b}_LS`]) sig.define(this.tag(s));
    sig.set(this.tag(`${b}_LS`), 1);
  }
  tick(sig: SignalTable, dt: number): void {
    const [a, b] = this.words;
    const target = sig.get(this.tag(a)) ? this.stroke : sig.get(this.tag(b)) ? 0 : null;
    if (target !== null && (!this.move || this.move.from + this.move.p.d !== target) && this.pos !== target) {
      this.move = { p: trapezoid(target - this.pos, this.vmax, this.amax), t: 0, from: this.pos };
      this.move.p.T += this.cushion;
    }
    if (this.move) {
      this.move.t += dt;
      const p = this.move.p, tm = Math.min(this.move.t, p.T - this.cushion);
      this.pos = this.move.from + positionAt({ ...p, T: p.T - this.cushion }, tm);
      if (this.move.t >= p.T - 1e-9) { this.pos = this.move.from + p.d; this.move = null; }
    }
    const atA = !this.move && Math.abs(this.pos - this.stroke) < 1e-6, atB = !this.move && Math.abs(this.pos) < 1e-6;
    sig.set(this.tag(`${a}_LS`), atA); sig.set(this.tag(`${b}_LS`), atB);
  }
}

export interface Step { id: string; name?: string; wait?: { tag: string; op?: '==' | '!=' | '>' | '<' | '>=' | '<='; value: number | boolean }[]; set?: { tag: string; value: number | boolean }[]; delay?: number; timeout?: number }
const cmp = (a: number, op: string, b: number): boolean =>
  op === '==' ? a === b : op === '!=' ? a !== b : op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;

/**
 * Runs steps in order, looping: a step first waits until all its conditions hold, then writes its
 * outputs, then waits `delay` s, then the next step starts. A step waiting longer than `timeout`
 * raises an alarm (sequence stops) — the same contract as a PLC step sequence.
 */
export class SequenceRunner implements Device {
  i = 0; private phase: 'wait' | 'delay' = 'wait'; private clock = 0; private waited = 0;
  alarm: string | null = null; cycles = 0; cycleTimes: number[] = []; private cycleStart = 0; private t = 0;
  constructor(readonly steps: Step[], readonly loop = true) {}
  tick(sig: SignalTable, dt: number): void {
    this.t += dt;
    if (this.alarm || this.i >= this.steps.length) return;
    const s = this.steps[this.i]!;
    if (this.phase === 'wait') {
      const ok = (s.wait ?? []).every(c => cmp(sig.get(c.tag), c.op ?? '==', typeof c.value === 'boolean' ? (c.value ? 1 : 0) : c.value));
      if (!ok) { this.waited += dt; if (s.timeout && this.waited > s.timeout) this.alarm = `step ${s.id} timed out`; return; }
      for (const o of s.set ?? []) sig.set(o.tag, o.value);
      this.phase = 'delay'; this.clock = 0; this.waited = 0;
    }
    this.clock += this.phase === 'delay' && this.clock === 0 && !(s.delay ?? 0) ? 0 : dt;
    if (this.clock + 1e-9 >= (s.delay ?? 0)) {
      this.phase = 'wait'; this.i++;
      if (this.i >= this.steps.length && this.loop) { this.i = 0; this.cycles++; this.cycleTimes.push(this.t - this.cycleStart); this.cycleStart = this.t; }
    }
  }
}

/** Fixed-step loop over devices on one signal table (L2 machines). */
export function runTicks(sig: SignalTable, devices: Device[], seconds: number, dt = TICK): void {
  const n = Math.round(seconds / dt);
  for (let k = 0; k < n; k++) { sig.t += dt; for (const d of devices) d.tick(sig, dt); }
}
