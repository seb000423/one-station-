import { enablePatches, produceWithPatches, applyPatches, type Patch } from 'immer';
import type { z } from 'zod';
import { Factory, Machine, uuidv7 } from '@one-twin/schema';
import { factoryCommands, machineCommands, CommandError, type CommandContext } from './commands';

enablePatches();

export interface HistoryEntry { name: string; args: unknown; patches: Patch[]; inverse: Patch[]; at: number }
type Cmds<S> = S extends 'factory' ? typeof factoryCommands : typeof machineCommands;
type Doc<S> = S extends 'factory' ? Factory : Machine;

/**
 * Editor core for one document. exec() validates the arguments, runs the command on an immer
 * draft and records forward / inverse patches; undo() / redo() replay them. The document is
 * immutable (structural sharing), so views can compare references to see what changed.
 */
export class Editor<S extends 'factory' | 'machine'> {
  doc: Doc<S>;
  readonly scope: S;
  private done: HistoryEntry[] = [];
  private undone: HistoryEntry[] = [];
  private listeners = new Set<(doc: Doc<S>, entry: HistoryEntry | null) => void>();
  limit = 200;
  ctx: CommandContext;
  private batching: HistoryEntry[] | null = null;

  constructor(scope: S, doc: Doc<S>, opts: { newId?: () => string; validate?: boolean } = {}) {
    this.scope = scope;
    this.doc = (opts.validate === false ? doc : (scope === 'factory' ? Factory : Machine).parse(doc)) as Doc<S>;
    this.ctx = { newId: opts.newId ?? (() => uuidv7()) };
  }

  exec<N extends keyof Cmds<S> & string>(name: N, args: z.input<(Cmds<S>[N] & { args: z.ZodType })['args']>): unknown {
    const table = (this.scope === 'factory' ? factoryCommands : machineCommands) as Record<string, { args: z.ZodType; run: (d: unknown, a: unknown, c: CommandContext) => unknown }>;
    const cmd = table[name];
    if (!cmd) throw new CommandError(`unknown ${this.scope} command ${name}`);
    const parsed = cmd.args.safeParse(args);
    if (!parsed.success) throw new CommandError(`${name}: ${parsed.error.issues.map(i => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}`);
    let result: unknown;
    const [next, patches, inverse] = produceWithPatches(this.doc, (d: unknown) => { result = cmd.run(d, parsed.data, this.ctx); });
    if (!patches.length) return result;
    this.doc = next as Doc<S>;
    const entry = { name, args: parsed.data, patches, inverse, at: Date.now() };
    if (this.batching) { this.batching.push(entry); return result; }
    this.done.push(entry); if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    this.emit(entry);
    return result;
  }
  /**
   * Run several commands as one step: one undo entry, one change notification (e.g. moving a multi-selection).
   * If any command throws, the ones already applied are rolled back and the error is rethrown.
   */
  batch<R>(name: string, fn: () => R): R {
    if (this.batching) return fn();
    const list: HistoryEntry[] = (this.batching = []);
    let r: R;
    try { r = fn(); }
    catch (e) { for (const x of list.slice().reverse()) this.doc = applyPatches(this.doc, x.inverse); this.batching = null; throw e; }
    this.batching = null;
    if (!list.length) return r;
    const entry: HistoryEntry = { name, args: list.map(x => ({ name: x.name, args: x.args })), patches: list.flatMap(x => x.patches), inverse: list.slice().reverse().flatMap(x => x.inverse), at: Date.now() };
    this.done.push(entry); if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    this.emit(entry);
    return r;
  }
  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }
  undo(): boolean {
    const e = this.done.pop(); if (!e) return false;
    this.doc = applyPatches(this.doc, e.inverse); this.undone.push(e); this.emit(e); return true;
  }
  redo(): boolean {
    const e = this.undone.pop(); if (!e) return false;
    this.doc = applyPatches(this.doc, e.patches); this.done.push(e); this.emit(e); return true;
  }
  /** Command log (oldest first): what was done, for autosave and regression replay. */
  log(): { name: string; args: unknown; at: number }[] { return this.done.map(({ name, args, at }) => ({ name, args, at })); }
  validate(): void { (this.scope === 'factory' ? Factory : Machine).parse(this.doc); }
  subscribe(fn: (doc: Doc<S>, entry: HistoryEntry | null) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(e: HistoryEntry | null): void { for (const fn of this.listeners) fn(this.doc, e); }
}
