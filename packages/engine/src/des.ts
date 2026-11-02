/** Discrete-event scheduler: a binary heap of (time, sequence) so equal-time events keep their order. */
export interface Ev { t: number; seq: number; fn: () => void; dead?: boolean }

export class Scheduler {
  now = 0;
  private heap: Ev[] = [];
  private seq = 0;
  get size(): number { return this.heap.length; }
  at(t: number, fn: () => void): Ev {
    if (!(t >= this.now)) throw new Error(`event in the past: ${t} < ${this.now}`);
    const e: Ev = { t, seq: this.seq++, fn };
    const h = this.heap; h.push(e);
    let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (less(h[p]!, e)) break; h[i] = h[p]!; i = p; }
    h[i] = e;
    return e;
  }
  after(dt: number, fn: () => void): Ev { return this.at(this.now + Math.max(0, dt), fn); }
  cancel(e: Ev | null | undefined): void { if (e) e.dead = true; }
  peek(): number { return this.heap.length ? this.heap[0]!.t : Infinity; }
  private pop(): Ev {
    const h = this.heap, top = h[0]!, last = h.pop()!;
    if (h.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, best = last;
        if (l < h.length && less(h[l]!, best)) { m = l; best = h[l]!; }
        if (r < h.length && less(h[r]!, best)) { m = r; }
        if (m === i) break;
        h[i] = h[m]!; i = m;
      }
      h[i] = last;
    }
    return top;
  }
  /** Run every event with t ≤ until; the clock ends at `until`. */
  runUntil(until: number): void {
    while (this.heap.length && this.heap[0]!.t <= until) {
      const e = this.pop();
      if (e.dead) continue;
      this.now = e.t; e.fn();
    }
    this.now = Math.max(this.now, until);
  }
}
const less = (a: Ev, b: Ev): boolean => a.t < b.t || (a.t === b.t && a.seq < b.seq);
