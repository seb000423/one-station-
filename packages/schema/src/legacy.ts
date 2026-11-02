/**
 * Saves made before the schema (ONE BUILDER document version 2) ⇄ factory.json.
 *
 * Old document: { version: 2, factory: { width, depth, height }, objects: [{ id, type, name, x, z, y?, rot, params }] }
 * in metres, three.js Y-up, origin at the centre of the floor, rot = yaw in radians.
 * factory.json: millimetres, Z-up, origin at the floor's lower-left corner (standard v2.1 §2), yaw in degrees.
 *
 * The map is lossless for every object type the builder keeps, so a save can go old → new → old and
 * open unchanged. Type-specific settings stay in `params` with their old units (metres, seconds);
 * stage 2 moves them into blocks with mm units. Objects that came from an old save keep their old id
 * (new objects get UUID v7) and machines get ref `legacy:<type>[:<model>]`.
 */
import { Factory, FACTORY_SCHEMA } from './factory';
import { emptySpec } from './spec';
import { mToMm, radToDeg, degToRad, roundMm } from './units';
import type { Transform } from './common';

export interface LegacyObject { id: string; type: string; name?: string; x?: number; z?: number; y?: number; rot?: number; params?: Record<string, unknown> }
export interface LegacyDoc { version?: number; factory?: { width?: number; depth?: number; height?: number }; objects?: LegacyObject[] }

export const LEGACY_FACTORY_DEFAULT = { width: 20, depth: 14, height: 6 };

/** Which collection each old object type goes to. */
export const LEGACY_BUCKET: Record<string, string> = {
  column: 'columns', wall: 'walls', door: 'openings', roof: 'roofs',
  walkway: 'markings', zone: 'markings',
  amr: 'movers', worker: 'movers', route: 'paths', walkroute: 'paths',
  rack: 'storage',
  ufmodel: 'machines', mine: 'machines', conveyor: 'machines', bench: 'machines',
  tote: 'blocks', fence: 'blocks', stairs: 'blocks', kpi: 'blocks',
  profile: 'blocks', plate: 'blocks', foot: 'blocks', block: 'blocks', model: 'blocks',
};

const r6 = (v: number): number => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const omit = (o: Record<string, unknown>, keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** Old document → factory.json (not yet validated; call Factory.parse on the result). */
export function legacyToFactory(doc: LegacyDoc, opts: { id?: string; name?: string } = {}): Factory {
  const f = { ...LEGACY_FACTORY_DEFAULT, ...(doc.factory ?? {}) };
  const W = mToMm(f.width), D = mToMm(f.depth), H = mToMm(f.height);
  // centre-origin metres (x, z) → lower-left-origin millimetres (X, Y)
  const XY = (x = 0, z = 0): [number, number] => [roundMm(mToMm(x) + W / 2), roundMm(-mToMm(z) + D / 2)];
  const tf = (o: LegacyObject): Transform => {
    const [X, Y] = XY(o.x, o.z);
    return { position: [X, Y, o.y !== undefined ? mToMm(o.y) : 0], rotation: [0, 0, radToDeg(o.rot ?? 0)] };
  };
  const out: Factory = {
    schema: FACTORY_SCHEMA,
    meta: { id: opts.id ?? 'factory', name: opts.name ?? '', site: '', levels: [{ id: 'L1', name: '1F', elevation: 0, height: H }], version: 1 },
    reference: null,
    building: { slabs: [{ id: 'slab', name: '바닥', polygon: [[0, 0], [W, 0], [W, D], [0, D]], thickness: 200, finish: 'epoxy' }], walls: [], columns: [], roofs: [], openings: [] },
    markings: [], machines: [], flows: [], storage: [], movers: [],
    nav: { nodes: [], edges: [], docks: [], paths: [] },
    utilities: { drops: [], panels: [], supply: [] },
    blocks: [], spec: emptySpec(),
  };
  let m = 0;
  for (const o of doc.objects ?? []) {
    const p = clone(o.params ?? {}) as Record<string, unknown>, name = o.name ?? '', base = { id: o.id, name, transform: tf(o), params: p };
    switch (o.type) {
      case 'wall': {
        const L = mToMm(Number(p.length ?? 4)), a = degToRad(radToDeg(o.rot ?? 0)), [cx, cy] = XY(o.x, o.z);
        const dx = (Math.cos(a) * L) / 2, dy = (Math.sin(a) * L) / 2;
        out.building.walls.push({
          id: o.id, name, from: [roundMm(cx - dx), roundMm(cy - dy)], to: [roundMm(cx + dx), roundMm(cy + dy)],
          thickness: mToMm(Number(p.thickness ?? 0.2)), height: p.h ? mToMm(Number(p.h)) : null,
          params: { ...omit(p, ['length', 'thickness', 'h']), yaw: radToDeg(o.rot ?? 0) },
        });
        break;
      }
      case 'column':
        out.building.columns.push({ ...base, params: omit(p, ['w', 'd', 'h']), size: [mToMm(Number(p.w ?? 0.5)), mToMm(Number(p.d ?? 0.5))], height: p.h ? mToMm(Number(p.h)) : null });
        break;
      case 'door': out.building.openings.push({ ...base, kind: 'shutter', wall: null }); break;
      case 'roof': out.building.roofs.push(base); break;
      case 'walkway': out.markings.push({ ...base, kind: 'aisle' }); break;
      case 'zone': out.markings.push({ ...base, kind: p.kind === 'keepout' ? 'safety' : 'zone' }); break;
      case 'amr': case 'worker': out.movers.push({ ...base, kind: o.type }); break;
      case 'route': case 'walkroute': {
        const pts = (Array.isArray(p.points) ? p.points : []) as [number, number][];
        out.nav.paths.push({
          id: o.id, name, kind: o.type === 'route' ? 'amr' : 'walk', oneway: !!p.oneway,
          points: pts.map(([x, z]) => XY(x, z)) as [number, number][],
          params: { ...omit(p, ['points', 'oneway']), anchor: base.transform },
        });
        break;
      }
      case 'rack': out.storage.push({ ...base, kind: 'rack', capacity: null }); break;
      default:
        if (LEGACY_BUCKET[o.type] === 'machines') {
          m++;
          out.machines.push({ ...base, ref: `legacy:${o.type}${typeof p.model === 'string' ? ':' + p.model : ''}`, tagPrefix: `ST01.M${String(m).padStart(2, '0')}`, cardOverride: {} });
        } else {
          out.blocks.push({ ...base, type: o.type.replace(/[^a-z0-9]+/gi, '-').toLowerCase() });
        }
    }
  }
  return out;
}

/** factory.json → old document (so ONE BUILDER can open what the new code saves). */
export function factoryToLegacy(f: Factory): Required<LegacyDoc> {
  const slab = f.building.slabs[0];
  const xs = slab ? slab.polygon.map(p => p[0]) : [0], ys = slab ? slab.polygon.map(p => p[1]) : [0];
  const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...ys) - Math.min(...ys);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const level = f.meta.levels[0];
  const toXZ = (X: number, Y: number): [number, number] => [r6((X - x0 - W / 2) / 1000), r6(-(Y - y0 - D / 2) / 1000)];
  const fromTf = (type: string, e: { id: string; name: string; transform: Transform; params: Record<string, unknown> }, params?: Record<string, unknown>): LegacyObject => {
    const [x, z] = toXZ(e.transform.position[0], e.transform.position[1]);
    const o: LegacyObject = { id: e.id, type, name: e.name, x, z, rot: r6(degToRad(e.transform.rotation[2])), params: clone(params ?? e.params) };
    if (e.transform.position[2]) o.y = r6(e.transform.position[2] / 1000);
    return o;
  };
  const objects: LegacyObject[] = [];
  for (const w of f.building.walls) {
    const { yaw, ...rest } = w.params as { yaw?: number };
    const L = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    const [x, z] = toXZ((w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2);
    const a = yaw !== undefined ? degToRad(yaw) : Math.atan2(w.to[1] - w.from[1], w.to[0] - w.from[0]);
    objects.push({ id: w.id, type: 'wall', name: w.name, x, z, rot: r6(a), params: { length: r6(L / 1000), thickness: r6(w.thickness / 1000), h: w.height ? r6(w.height / 1000) : 0, ...clone(rest) } });
  }
  for (const c of f.building.columns) objects.push(fromTf('column', c, { w: r6(c.size[0] / 1000), d: r6(c.size[1] / 1000), h: c.height ? r6(c.height / 1000) : 0, ...clone(c.params) }));
  for (const o of f.building.openings) objects.push(fromTf('door', o));
  for (const r of f.building.roofs) objects.push(fromTf('roof', r));
  for (const k of f.markings) objects.push(fromTf(k.kind === 'aisle' ? 'walkway' : 'zone', k));
  for (const v of f.movers) objects.push(fromTf(v.kind, v));
  for (const p of f.nav.paths) {
    const { anchor, ...rest } = p.params as { anchor?: Transform };
    const e = { id: p.id, name: p.name, transform: anchor ?? { position: [x0 + W / 2, y0 + D / 2, 0], rotation: [0, 0, 0] }, params: {} } as const;
    objects.push(fromTf(p.kind === 'amr' ? 'route' : 'walkroute', e as never, { points: p.points.map(([X, Y]) => toXZ(X, Y)), oneway: p.oneway, ...clone(rest) }));
  }
  for (const s of f.storage) objects.push(fromTf('rack', s));
  for (const m of f.machines) objects.push(fromTf(m.ref.startsWith('legacy:') ? m.ref.split(':')[1]! : 'mine', m));
  for (const b of f.blocks) objects.push(fromTf(b.type, b));
  return { version: 2, factory: { width: r6(W / 1000), depth: r6(D / 1000), height: r6((level?.height ?? 6000) / 1000) }, objects };
}

/** Parse + validate an old save into factory.json. Throws a ZodError with the offending path. */
export const importLegacy = (doc: LegacyDoc, opts?: { id?: string; name?: string }): Factory => Factory.parse(legacyToFactory(doc, opts));
