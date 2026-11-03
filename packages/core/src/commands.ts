/**
 * Edit API (R1 §2 principle 4): every edit of a factory or machine document is one named command
 * with validated arguments. The UI, tests, scripts and (later) AI / MCP all call the same commands.
 * A command mutates an immer draft; the editor records the patches, so undo / redo work for every
 * command without per-command inverse code.
 */
import { z } from 'zod';
import {
  Vec2, Vec3, Params, Transform, GRID_FACTORY_MM, GRID_MACHINE_MM, snap, roundMm, Joint, Io, Socket, isTagPath,
  type Factory, type Machine,
} from '@one-twin/schema';
import { locate } from './locate';

export interface CommandContext { newId: () => string }
export type Scope = 'factory' | 'machine';
export interface CommandDef<A extends z.ZodType = z.ZodType, D = unknown> {
  scope: Scope;
  description: string;
  args: A;
  run: (draft: D, args: z.infer<A>, ctx: CommandContext) => unknown;
}
const def = <A extends z.ZodType, D>(c: CommandDef<A, D>): CommandDef<A, D> => c;

class CommandError extends Error { constructor(msg: string) { super(msg); this.name = 'CommandError'; } }
export { CommandError };

const Yaw = z.number().describe('yaw, deg, counter-clockwise seen from above');
const need = (doc: Factory, id: string) => {
  const hit = locate(doc, id);
  if (!hit) throw new CommandError(`no object with id ${id}`);
  return hit;
};
const tf = (p: [number, number] | [number, number, number], yaw = 0): Transform =>
  ({ position: [roundMm(p[0]), roundMm(p[1]), roundMm(p[2] ?? 0)], rotation: [0, 0, yaw] });
const nextPrefix = (doc: Factory): string => {
  const used = new Set(doc.machines.map(m => m.tagPrefix));
  for (let i = 1; ; i++) { const p = `ST01.M${String(i).padStart(2, '0')}`; if (!used.has(p)) return p; }
};

/* ---------- factory scope ---------- */
export const factoryCommands = {
  place_machine: def({
    scope: 'factory', description: '설비 인스턴스를 공장에 배치 (machine@version 참조). 반환: 새 id',
    args: z.object({ ref: z.string(), name: z.string().optional(), position: z.union([Vec2, Vec3]), yaw: Yaw.optional(), tagPrefix: z.string().optional(), params: Params.optional() }),
    run: (d: Factory, a, ctx) => {
      if (a.tagPrefix && !isTagPath(a.tagPrefix)) throw new CommandError(`bad tag prefix ${a.tagPrefix}`);
      const prefix = a.tagPrefix ?? nextPrefix(d);
      if (d.machines.some(m => m.tagPrefix === prefix)) throw new CommandError(`tag prefix ${prefix} is already used`);
      const id = ctx.newId();
      d.machines.push({ id, name: a.name ?? '', ref: a.ref, transform: tf(a.position, a.yaw), params: a.params ?? {}, tagPrefix: prefix, cardOverride: {} });
      return id;
    },
  }),
  add_block: def({
    scope: 'factory', description: '공장 블록(펜스·계단·안돈·용기 …) 배치. 반환: 새 id',
    args: z.object({ type: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), name: z.string().optional(), position: z.union([Vec2, Vec3]), yaw: Yaw.optional(), params: Params.optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.blocks.push({ id, type: a.type, name: a.name ?? '', transform: tf(a.position, a.yaw), params: a.params ?? {} }); return id; },
  }),
  draw_wall: def({
    scope: 'factory', description: '벽을 선으로 그림 (from → to, mm). 반환: 새 id',
    args: z.object({ from: Vec2, to: Vec2, thickness: z.number().positive().default(200), height: z.number().positive().nullable().default(null), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => {
      if (a.from[0] === a.to[0] && a.from[1] === a.to[1]) throw new CommandError('a wall needs two different points');
      const id = ctx.newId(); d.building.walls.push({ id, name: a.name ?? '', from: a.from, to: a.to, thickness: a.thickness, height: a.height, params: {} }); return id;
    },
  }),
  add_column: def({
    scope: 'factory', description: '기둥 배치',
    args: z.object({ position: Vec2, size: Vec2.default([500, 500]), height: z.number().positive().nullable().default(null), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.building.columns.push({ id, name: a.name ?? '', transform: tf(a.position), params: {}, size: a.size, height: a.height }); return id; },
  }),
  add_column_grid: def({
    scope: 'factory', description: '기둥을 X×Y 간격 격자로 자동 배치. 반환: 새 id 목록',
    args: z.object({ origin: Vec2, nx: z.number().int().positive(), ny: z.number().int().positive(), dx: z.number().positive(), dy: z.number().positive(), size: Vec2.default([500, 500]) }),
    run: (d: Factory, a, ctx) => {
      const ids: string[] = [];
      for (let i = 0; i < a.nx; i++) for (let j = 0; j < a.ny; j++) {
        const id = ctx.newId(); ids.push(id);
        d.building.columns.push({ id, name: '', transform: tf([a.origin[0] + i * a.dx, a.origin[1] + j * a.dy]), params: {}, size: a.size, height: null });
      }
      return ids;
    },
  }),
  add_opening: def({
    scope: 'factory', description: '문·셔터·도크·비상구 (벽 위에 두면 wall에 벽 id)',
    args: z.object({ kind: z.enum(['door', 'shutter', 'dock', 'exit', 'window']), position: Vec2, yaw: Yaw.optional(), wall: z.string().nullable().default(null), params: Params.optional(), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => {
      if (a.wall && !d.building.walls.some(w => w.id === a.wall)) throw new CommandError(`no wall ${a.wall}`);
      const id = ctx.newId(); d.building.openings.push({ id, name: a.name ?? '', kind: a.kind, wall: a.wall, transform: tf(a.position, a.yaw), params: a.params ?? {} }); return id;
    },
  }),
  add_marking: def({
    scope: 'factory', description: '바닥 마킹: 통로선(aisle, polyline) · 구역(zone) · 안전 구역(safety, polygon)',
    args: z.object({ kind: z.enum(['aisle', 'zone', 'safety']), polygon: z.array(Vec2).min(3).optional(), polyline: z.array(Vec2).min(2).optional(), params: Params.optional(), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => {
      if (!a.polygon && !a.polyline) throw new CommandError('a marking needs a polygon or a polyline');
      const pts = (a.polygon ?? a.polyline)!, cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const id = ctx.newId();
      d.markings.push({ id, name: a.name ?? '', kind: a.kind, transform: tf([cx, cy]), params: a.params ?? {}, ...(a.polygon ? { polygon: a.polygon } : {}), ...(a.polyline ? { polyline: a.polyline } : {}) });
      return id;
    },
  }),
  add_mover: def({
    scope: 'factory', description: '이동체 배치 (작업자 · AMR · 지게차)',
    args: z.object({ kind: z.enum(['worker', 'amr', 'forklift']), position: Vec2, yaw: Yaw.optional(), params: Params.optional(), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.movers.push({ id, name: a.name ?? '', kind: a.kind, transform: tf(a.position, a.yaw), params: a.params ?? {} }); return id; },
  }),
  add_path: def({
    scope: 'factory', description: '동선(AMR · 보행 · 지게차) 폴리라인',
    args: z.object({ kind: z.enum(['amr', 'walk', 'forklift']), points: z.array(Vec2).min(2), oneway: z.boolean().default(false), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.nav.paths.push({ id, name: a.name ?? '', kind: a.kind, points: a.points, oneway: a.oneway, params: {} }); return id; },
  }),
  add_storage: def({
    scope: 'factory', description: '랙 · 바닥 보관 · 버퍼',
    args: z.object({ kind: z.enum(['rack', 'floor', 'buffer']), position: Vec2, yaw: Yaw.optional(), capacity: z.number().int().nonnegative().nullable().default(null), params: Params.optional(), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.storage.push({ id, name: a.name ?? '', kind: a.kind, capacity: a.capacity, transform: tf(a.position, a.yaw), params: a.params ?? {} }); return id; },
  }),
  add_drop: def({
    scope: 'factory', description: '유틸리티 드롭 (전원 · 에어 · 가스 · 물)',
    args: z.object({ kind: z.enum(['power', 'air', 'gas', 'water']), position: Vec2, params: Params.optional(), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.utilities.drops.push({ id, name: a.name ?? '', kind: a.kind, transform: tf(a.position), params: a.params ?? {} }); return id; },
  }),
  connect_flow: def({
    scope: 'factory', description: '자재 흐름: 설비 출구 → 설비 입구 ("인스턴스id.소켓id"), 분기 비율',
    args: z.object({ from: z.string(), to: z.string(), ratio: z.number().min(0).max(1).default(1), via: z.enum(['auto', 'conveyor', 'amr', 'forklift', 'worker']).default('auto') }),
    run: (d: Factory, a, ctx) => {
      for (const end of [a.from, a.to]) {
        const mid = end.split('.')[0]!;
        if (!d.machines.some(m => m.id === mid) && !d.storage.some(s => s.id === mid)) throw new CommandError(`flow end ${end}: no machine or storage ${mid}`);
      }
      if (a.from.split('.')[0] === a.to.split('.')[0]) throw new CommandError('a flow cannot start and end at the same object');
      const out = d.flows.filter(f => f.from === a.from).reduce((s, f) => s + f.ratio, 0);
      if (out + a.ratio > 1 + 1e-9) throw new CommandError(`ratios out of ${a.from} would add up to ${out + a.ratio} (> 1)`);
      if (d.flows.some(f => f.from === a.from && f.to === a.to)) throw new CommandError(`flow ${a.from} → ${a.to} already exists`);
      const id = ctx.newId(); d.flows.push({ id, from: a.from, to: a.to, ratio: a.ratio, via: a.via }); return id;
    },
  }),
  set_flow: def({
    scope: 'factory', description: '흐름의 운반 수단 · 분기 비율 변경',
    args: z.object({ id: z.string(), via: z.enum(['auto', 'conveyor', 'amr', 'forklift', 'worker']).optional(), ratio: z.number().min(0).max(1).optional() }),
    run: (d: Factory, a) => {
      const f = d.flows.find(x => x.id === a.id); if (!f) throw new CommandError(`no flow ${a.id}`);
      if (a.ratio !== undefined) { const out = d.flows.filter(x => x.from === f.from && x !== f).reduce((s, x) => s + x.ratio, 0); if (out + a.ratio > 1 + 1e-9) throw new CommandError(`ratios out of ${f.from} would add up to ${out + a.ratio} (> 1)`); f.ratio = a.ratio; }
      if (a.via) f.via = a.via;
    },
  }),
  set_meta: def({
    scope: 'factory', description: '공장 이름 · 사이트 변경',
    args: z.object({ name: z.string().min(1).optional(), site: z.string().optional() }),
    run: (d: Factory, a) => { if (a.name !== undefined) d.meta.name = a.name; if (a.site !== undefined) d.meta.site = a.site; },
  }),
  set_slab: def({
    scope: 'factory', description: '바닥 슬래브 외곽(다각형, mm) 설정. id가 없으면 첫 슬래브, 슬래브가 없으면 새로 만듦. 반환: 슬래브 id',
    args: z.object({ id: z.string().optional(), polygon: z.array(Vec2).min(3), thickness: z.number().nonnegative().optional(), finish: z.string().optional() }),
    run: (d: Factory, a, ctx) => {
      let s = a.id ? d.building.slabs.find(x => x.id === a.id) : d.building.slabs[0];
      if (a.id && !s) throw new CommandError(`no slab ${a.id}`);
      if (!s) { s = { id: ctx.newId(), name: '', polygon: a.polygon, thickness: 200, finish: 'epoxy' }; d.building.slabs.push(s); }
      s.polygon = a.polygon.map(p => [roundMm(p[0]), roundMm(p[1])] as [number, number]);
      if (a.thickness !== undefined) s.thickness = a.thickness;
      if (a.finish !== undefined) s.finish = a.finish;
      return s.id;
    },
  }),
  add_roof: def({
    scope: 'factory', description: '지붕 배치 (position = 지붕 중심, params: w·d mm, eave 처마 높이, type flat|gable). 반환: 새 id',
    args: z.object({ position: z.union([Vec2, Vec3]), yaw: Yaw.optional(), params: Params.optional(), name: z.string().optional() }),
    run: (d: Factory, a, ctx) => { const id = ctx.newId(); d.building.roofs.push({ id, name: a.name ?? '', transform: tf(a.position, a.yaw), params: a.params ?? {} }); return id; },
  }),
  set_reference: def({
    scope: 'factory', description: '평면도 레퍼런스(DXF·이미지) 설정, null이면 제거',
    args: z.object({ reference: z.object({ kind: z.enum(['dxf', 'image']), src: z.string(), scale: z.number().positive(), origin: Vec2, rotation: z.number().default(0) }).nullable() }),
    run: (d: Factory, a) => { d.reference = a.reference; },
  }),
  move: def({
    scope: 'factory', description: '객체 이동·회전 (position mm, yaw deg). 벽은 두 끝점이 함께 이동',
    args: z.object({ id: z.string(), position: z.union([Vec2, Vec3]).optional(), by: z.union([Vec2, Vec3]).optional(), yaw: Yaw.optional() }),
    run: (d: Factory, a) => {
      const { item, path } = need(d, a.id);
      if (path === 'building.walls') {
        const w = item as unknown as Factory['building']['walls'][number];
        const c: [number, number] = [(w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2];
        const target = a.position ? [a.position[0], a.position[1]] : a.by ? [c[0] + a.by[0], c[1] + a.by[1]] : c;
        const dx = target[0]! - c[0], dy = target[1]! - c[1];
        let hx = (w.to[0] - w.from[0]) / 2, hy = (w.to[1] - w.from[1]) / 2;
        if (a.yaw !== undefined) { const L = Math.hypot(hx, hy), r = (a.yaw * Math.PI) / 180; hx = Math.cos(r) * L; hy = Math.sin(r) * L; w.params.yaw = a.yaw; }
        w.from = [roundMm(c[0] + dx - hx), roundMm(c[1] + dy - hy)]; w.to = [roundMm(c[0] + dx + hx), roundMm(c[1] + dy + hy)];
        return;
      }
      if (path === 'nav.paths' || path === 'flows' || path === 'building.slabs') throw new CommandError(`${path} objects are edited point by point, not moved`);
      const t = (item as unknown as { transform: Transform }).transform;
      if (a.position) t.position = [roundMm(a.position[0]), roundMm(a.position[1]), roundMm(a.position[2] ?? t.position[2])];
      if (a.by) t.position = [roundMm(t.position[0] + a.by[0]), roundMm(t.position[1] + a.by[1]), roundMm(t.position[2] + (a.by[2] ?? 0))];
      if (a.yaw !== undefined) t.rotation = [t.rotation[0], t.rotation[1], a.yaw];
    },
  }),
  snap: def({
    scope: 'factory', description: '객체 위치를 그리드에 맞춤 (기본 500 mm, 표준 v2.1)',
    args: z.object({ id: z.string(), grid: z.number().positive().default(GRID_FACTORY_MM) }),
    run: (d: Factory, a) => {
      const { item } = need(d, a.id), t = (item as { transform?: Transform }).transform;
      if (!t) throw new CommandError('this object has no position to snap');
      t.position = [snap(t.position[0], a.grid), snap(t.position[1], a.grid), t.position[2]];
    },
  }),
  set_param: def({
    scope: 'factory', description: '객체 설정값 하나 변경 (params.key = value, value가 null이면 삭제)',
    args: z.object({ id: z.string(), key: z.string().min(1), value: z.unknown() }),
    run: (d: Factory, a) => {
      const { item } = need(d, a.id), p = ((item as { params?: Record<string, unknown> }).params ??= {});
      if (a.value === null || a.value === undefined) delete p[a.key]; else p[a.key] = a.value;
    },
  }),
  rename: def({
    scope: 'factory', description: '객체 이름 변경',
    args: z.object({ id: z.string(), name: z.string() }),
    run: (d: Factory, a) => { (need(d, a.id).item as unknown as { name: string }).name = a.name; },
  }),
  set_card: def({
    scope: 'factory', description: '설비 인스턴스의 카드 값 덮어쓰기 (사이클·가동률·불량률·작업자 수)',
    args: z.object({ id: z.string(), card: z.object({ cycle_time: z.number().nonnegative(), availability: z.number().min(0).max(1), ok_rate: z.number().min(0).max(1), operators: z.number().nonnegative() }).partial() }),
    run: (d: Factory, a) => {
      const m = d.machines.find(x => x.id === a.id); if (!m) throw new CommandError(`no machine ${a.id}`);
      Object.assign(m.cardOverride, a.card);
    },
  }),
  delete: def({
    scope: 'factory', description: '객체 삭제 (그 객체에 연결된 자재 흐름도 함께 삭제)',
    args: z.object({ id: z.string() }),
    run: (d: Factory, a) => {
      const { list, index } = need(d, a.id); list.splice(index, 1);
      d.flows = d.flows.filter(f => f.from.split('.')[0] !== a.id && f.to.split('.')[0] !== a.id);
      d.building.openings.forEach(o => { if (o.wall === a.id) o.wall = null; });
    },
  }),
  duplicate: def({
    scope: 'factory', description: '객체 복사 (offset mm 만큼 옮겨서). 반환: 새 id',
    args: z.object({ id: z.string(), offset: Vec2.default([GRID_FACTORY_MM, GRID_FACTORY_MM]) }),
    run: (d: Factory, a, ctx) => {
      const { list, path, item } = need(d, a.id);
      if (path === 'flows' || path === 'building.slabs') throw new CommandError(`${path} objects cannot be duplicated`);
      const c = JSON.parse(JSON.stringify(item)) as Record<string, unknown> & { id: string };
      c.id = ctx.newId();
      const [ox, oy] = a.offset, sh = (p: number[]) => [roundMm(p[0]! + ox), roundMm(p[1]! + oy), ...p.slice(2)];
      if (c.transform) (c.transform as Transform).position = sh((c.transform as Transform).position) as never;
      if (c.from) { c.from = sh(c.from as number[]); c.to = sh(c.to as number[]); }
      if (Array.isArray(c.points)) c.points = (c.points as number[][]).map(sh);
      if (path === 'machines') c.tagPrefix = nextPrefix(d);
      list.push(c);
      return c.id;
    },
  }),
  mirror: def({
    scope: 'factory', description: '객체를 세로선 x = axis (또는 가로선 y = axis) 기준으로 대칭 복사. 반환: 새 id',
    args: z.object({ id: z.string(), axis: z.number(), along: z.enum(['x', 'y']).default('x') }),
    run: (d: Factory, a, ctx) => {
      const { list, path, item } = need(d, a.id);
      if (path === 'flows' || path === 'building.slabs') throw new CommandError(`${path} objects cannot be mirrored`);
      const c = JSON.parse(JSON.stringify(item)) as Record<string, unknown> & { id: string };
      c.id = ctx.newId();
      const i = a.along === 'x' ? 0 : 1, mp = (p: number[]) => { const q = [...p]; q[i] = roundMm(2 * a.axis - p[i]!); return q; };
      if (c.transform) {
        const t = c.transform as Transform; t.position = mp(t.position) as never;
        const yaw = t.rotation[2]; t.rotation = [t.rotation[0], t.rotation[1], (a.along === 'x' ? 180 - yaw : -yaw) % 360];
      }
      if (c.from) { c.from = mp(c.from as number[]); c.to = mp(c.to as number[]); }
      if (Array.isArray(c.points)) c.points = (c.points as number[][]).map(mp);
      if (path === 'machines') c.tagPrefix = nextPrefix(d);
      list.push(c);
      return c.id;
    },
  }),
  array: def({
    scope: 'factory', description: '선형 배열 복사: count개를 step(mm) 간격으로. 반환: 새 id 목록',
    args: z.object({ id: z.string(), count: z.number().int().min(1).max(200), step: Vec2 }),
    run: (d: Factory, a, ctx) => {
      const ids: string[] = [];
      for (let k = 1; k <= a.count; k++) ids.push(factoryCommands.duplicate.run(d, { id: a.id, offset: [a.step[0] * k, a.step[1] * k] }, ctx) as string);
      return ids;
    },
  }),
};

/* ---------- machine scope ---------- */
const needNode = (m: Machine, id: string) => { const n = m.nodes.find(x => x.id === id); if (!n) throw new CommandError(`no node ${id}`); return n; };
export const machineCommands = {
  add_block: def({
    scope: 'machine', description: '블록 배치 (blockType = 라이브러리 블록 id, mm 좌표). 반환: 새 노드 id',
    args: z.object({
      blockType: z.string(), name: z.string().optional(), parent: z.string().nullable().default(null), position: Vec3, rotation: Vec3.optional(), params: Params.optional(), sockets: z.array(Socket).optional(),
      joints: z.array(Joint.omit({ node: true })).optional().describe('axes of this block (node = the new block)'),
      io: z.array(Io).optional().describe('signal tags of this block'),
    }),
    run: (m: Machine, a, ctx) => {
      if (a.parent) needNode(m, a.parent);
      for (const j of a.joints ?? []) if (m.joints.some(x => x.id === j.id)) throw new CommandError(`joint ${j.id} exists`);
      for (const t of a.io ?? []) if (m.io.some(x => x.tag === t.tag)) throw new CommandError(`tag ${t.tag} exists`);
      const id = ctx.newId();
      m.nodes.push({ id, type: 'block', blockType: a.blockType, name: a.name ?? '', params: a.params ?? {}, parent: a.parent,
        transform: { position: [snap(a.position[0], GRID_MACHINE_MM), snap(a.position[1], GRID_MACHINE_MM), snap(a.position[2], GRID_MACHINE_MM)], rotation: a.rotation ?? [0, 0, 0] }, sockets: a.sockets ?? [] });
      for (const j of a.joints ?? []) { if (j.max < j.min) throw new CommandError(`joint ${j.id}: max < min`); m.joints.push({ ...j, node: id }); }
      for (const t of a.io ?? []) {
        if (t.binding?.kind === 'joint' && !m.joints.some(j => j.id === t.binding!.target)) throw new CommandError(`tag ${t.tag}: no joint ${t.binding.target}`);
        m.io.push(t);
      }
      return id;
    },
  }),
  move: def({
    scope: 'machine', description: '노드 이동·회전 (position mm, 5 mm 스냅 / rotation deg)',
    args: z.object({ id: z.string(), position: Vec3.optional(), rotation: Vec3.optional() }),
    run: (m: Machine, a) => {
      const n = needNode(m, a.id);
      if (a.position) n.transform.position = [snap(a.position[0], GRID_MACHINE_MM), snap(a.position[1], GRID_MACHINE_MM), snap(a.position[2], GRID_MACHINE_MM)];
      if (a.rotation) n.transform.rotation = [a.rotation[0], a.rotation[1], ((a.rotation[2] % 360) + 360) % 360];
    },
  }),
  set_parent: def({
    scope: 'machine', description: '노드를 다른 노드 위에 붙이거나 (parent id) 떼어 바닥으로 (null). 자기 자신·자손 아래로는 붙일 수 없음',
    args: z.object({ id: z.string(), parent: z.string().nullable() }),
    run: (m: Machine, a) => {
      const n = needNode(m, a.id);
      if (a.parent !== null) {
        needNode(m, a.parent);
        for (let p: string | null = a.parent; p; p = m.nodes.find(x => x.id === p)?.parent ?? null) if (p === a.id) throw new CommandError(`${a.id} cannot sit on itself or its own child`);
      }
      n.parent = a.parent;
    },
  }),
  rename: def({
    scope: 'machine', description: '노드 이름 변경',
    args: z.object({ id: z.string(), name: z.string() }),
    run: (m: Machine, a) => { needNode(m, a.id).name = a.name; },
  }),
  set_meta: def({
    scope: 'machine', description: '설비 이름 · 외곽 크기(W × D × H mm) · fidelity 변경',
    args: z.object({ name: z.string().min(1).optional(), bbox: Vec3.optional(), fidelity: z.enum(['L1', 'L2', 'L3']).optional() }),
    run: (m: Machine, a) => {
      if (a.bbox && a.bbox.some(v => v <= 0)) throw new CommandError('bbox values must be > 0');
      if (a.name !== undefined) m.meta.name = a.name;
      if (a.bbox) m.meta.bbox = a.bbox;
      if (a.fidelity) m.meta.fidelity = a.fidelity;
    },
  }),
  set_card: def({
    scope: 'machine', description: '설비 카드 값 변경 (사이클 s · 양품률 · 작업자 수 · 투입/배출 소켓)',
    args: z.object({ cycle_time: z.number().nonnegative().nullable(), ok_rate: z.number().min(0).max(1).nullable(), operators: z.number().nonnegative(), inlet: z.string().nullable(), outlet: z.string().nullable() }).partial(),
    run: (m: Machine, a) => { Object.assign(m.card, a); },
  }),
  set_param: def({
    scope: 'machine', description: '블록 파라미터 변경',
    args: z.object({ id: z.string(), key: z.string().min(1), value: z.unknown() }),
    run: (m: Machine, a) => { const n = needNode(m, a.id); if (a.value === null || a.value === undefined) delete n.params[a.key]; else n.params[a.key] = a.value; },
  }),
  add_joint: def({
    scope: 'machine', description: '노드에 동작 축 추가 (vmax·amax 필수)',
    args: Joint,
    run: (m: Machine, a) => {
      needNode(m, a.node);
      if (m.joints.some(j => j.id === a.id)) throw new CommandError(`joint ${a.id} exists`);
      if (a.max < a.min) throw new CommandError('max < min');
      m.joints.push(a);
    },
  }),
  bind_tag: def({
    scope: 'machine', description: '신호 태그 추가 또는 변경 (같은 tag면 덮어씀)',
    args: Io,
    run: (m: Machine, a) => {
      if (a.binding?.kind === 'joint' && !m.joints.some(j => j.id === a.binding!.target)) throw new CommandError(`no joint ${a.binding.target}`);
      const i = m.io.findIndex(x => x.tag === a.tag); if (i >= 0) m.io[i] = a; else m.io.push(a);
    },
  }),
  delete: def({
    scope: 'machine', description: '노드 삭제 (자식 노드와 그 축·태그 바인딩도 함께)',
    args: z.object({ id: z.string() }),
    run: (m: Machine, a) => {
      needNode(m, a.id);
      const gone = new Set([a.id]);
      for (let grew = true; grew;) { grew = false; for (const n of m.nodes) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; } }
      const joints = new Set(m.joints.filter(j => gone.has(j.node)).map(j => j.id));
      m.nodes = m.nodes.filter(n => !gone.has(n.id));
      m.joints = m.joints.filter(j => !joints.has(j.id));
      m.io = m.io.filter(t => !(t.binding?.kind === 'joint' && joints.has(t.binding.target)));
    },
  }),
};

export type FactoryCommandName = keyof typeof factoryCommands;
export type MachineCommandName = keyof typeof machineCommands;

/** The command list as data (name, scope, description, JSON Schema of the arguments). */
export function commandCatalog(): { name: string; scope: Scope; description: string; args: unknown }[] {
  const all: [string, CommandDef][] = [...Object.entries(factoryCommands), ...Object.entries(machineCommands)] as never;
  return all.map(([name, c]) => ({ name, scope: c.scope, description: c.description, args: z.toJSONSchema(c.args, { io: 'input', unrepresentable: 'any' }) }));
}

