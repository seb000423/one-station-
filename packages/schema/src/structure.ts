/**
 * 설계 구조 카탈로그 (design structure catalogue): the platform's default rules for how equipment is built up from objects.
 *
 * Two layers. The GENERAL layer is industrial practice, not tied to any example: every object has a class; each class has a
 * role (how it is held), the slots it can take, the slots it offers to others (host capability) and how the join is
 * physically made in each slot (앵커 볼트, 레벨링 풋, 볼트, 브래킷, DIN 레일, 포스트, 적재 …). The VERIFIED layer is what has
 * been seen built: class → host pairs from the reference stations (and later from every machine the user saves); a pair
 * outside it is allowed with a warning, never refused. The core rules engine (packages/core/src/structure.ts) reads this
 * table; the UI shows it. `npm run gen:twin` writes it to assets/one-twin/structure-catalog.json.
 */
import { z } from 'zod';

export const Role = z.enum(['floor', 'top', 'side', 'robot', 'seat']);
export type Role = z.infer<typeof Role>;
/** 자리 (slot) kinds: the floor, a host's top plane, a side face, its inside volume, the space in front of it (a seat at a desk). */
export const SlotKind = z.enum(['floor', 'top', 'side', 'inside', 'front']);
export type SlotKind = z.infer<typeof SlotKind>;
/** How a join is made in a slot. */
export const MountKind = z.enum(['anchor', 'feet', 'caster', 'bolt', 'clamp', 'bracket', 'din', 'post', 'span', 'stack', 'free']);
export type MountKind = z.infer<typeof MountKind>;
export const MOUNT_LABEL: Record<MountKind, string> = {
  anchor: '앵커 볼트로 바닥 고정', feet: '레벨링 풋', caster: '캐스터 (이동식)', bolt: '볼트 체결', clamp: '클램프', bracket: '브래킷 · 측면 볼트',
  din: 'DIN 레일 장착', post: '포스트 사이 패널', span: '기둥 위에 걸침', stack: '적재', free: '놓기 (고정 없음)' };
export const ROLE_LABEL: Record<Role, string> = { floor: '바닥에 섬', top: '위에 얹힘', side: '옆면에 붙음', robot: '로봇', seat: '작업자 자리' };
export const SLOT_LABEL: Record<SlotKind, string> = { floor: '바닥', top: '받침 윗면', side: '받침 옆면', inside: '받침 안', front: '작업대 앞' };

export const HostCap = z.object({ top: z.boolean(), side: z.boolean(), inside: z.boolean().optional(), front: z.boolean().optional(), stack: z.number().positive().optional() });
export type HostCap = z.infer<typeof HostCap>;
export const ClassGroup = z.enum(['structure', 'machine', 'handling', 'control', 'safety', 'operator', 'fixture']);
export const GROUP_LABEL: Record<z.infer<typeof ClassGroup>, string> = { structure: '구조', machine: '장비', handling: '반송 · 로봇', control: '제어 · 표시', safety: '안전', operator: '작업자', fixture: '치구 · 제품' };
export const ClassDef = z.object({
  cls: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  group: ClassGroup,
  /** generic name keywords (Korean / English) that classify an unlabelled object, in priority order */
  words: z.array(z.string()),
  role: Role,
  host: HostCap,
  /** slots this class can take, best first; default by role */
  needs: z.array(SlotKind).optional(),
  /** how the join is made, per slot; default by slot */
  mount: z.partialRecord(SlotKind, MountKind).optional(),
  /** solid machine bodies that must never run into each other (others may overlap in outline: a chair under a desk) */
  solid: z.boolean().optional(),
});
export type ClassDef = z.infer<typeof ClassDef>;
export const StructureCatalog = z.object({
  version: z.string(),
  classes: z.array(ClassDef),
  /** slots per role when a class gives none */
  needsByRole: z.record(Role, z.array(SlotKind)),
  /** join per slot when a class gives none */
  mountBySlot: z.record(SlotKind, MountKind),
  /** verified part>host pairs per slot ('*' = any); a pair outside is allowed with a warning */
  verified: z.record(SlotKind, z.array(z.string())),
});
export type StructureCatalog = z.infer<typeof StructureCatalog>;

const NO: HostCap = { top: false, side: false };
export const STRUCTURE_CATALOG: StructureCatalog = StructureCatalog.parse({
  version: '1.0',
  needsByRole: { floor: ['floor', 'inside'], top: ['top', 'inside'], side: ['side', 'inside'], robot: ['floor', 'top', 'inside'], seat: ['floor'] },
  mountBySlot: { floor: 'feet', top: 'bolt', side: 'bracket', inside: 'free', front: 'free' },
  classes: [
    // 구조
    { cls: 'base', label: '셀 베이스', group: 'structure', words: ['셀 베이스', '베이스', 'base'], role: 'floor', host: { top: true, side: true, inside: true }, mount: { floor: 'anchor' } },
    { cls: 'plate', label: '베이스 플레이트', group: 'structure', words: ['베이스 플레이트', '정반', 'plate'], role: 'floor', host: { top: true, side: false }, mount: { floor: 'anchor' } },
    { cls: 'frame', label: '프레임', group: 'structure', words: ['프레임', 'frame'], role: 'floor', host: { top: true, side: true, inside: true }, needs: ['floor', 'top', 'inside'], mount: { floor: 'anchor', top: 'bolt' } },
    { cls: 'column', label: '기둥 · 받침대', group: 'structure', words: ['기둥', '받침대', '페데스탈', 'pedestal', 'column'], role: 'floor', host: { top: true, side: true }, mount: { floor: 'anchor' } },
    { cls: 'gantry', label: '갠트리 · 천장 빔', group: 'structure', words: ['갠트리', '빔', 'gantry'], role: 'top', host: { top: true, side: true }, needs: ['top'], mount: { top: 'span' } },
    { cls: 'shelf', label: '선반', group: 'structure', words: ['선반', '랙', 'shelf'], role: 'floor', host: { top: true, side: true, inside: true }, needs: ['floor', 'top', 'inside'], mount: { floor: 'feet', top: 'bolt' } },
    // 장비
    { cls: 'furnace', label: '로 · 대형 장비', group: 'machine', words: ['브레이징로', '진공로', '열처리로'], role: 'floor', host: { top: false, side: true }, mount: { floor: 'anchor' }, solid: true },
    { cls: 'rotary', label: '회전 테이블', group: 'machine', words: ['회전 테이블', '턴테이블'], role: 'floor', host: { top: true, side: false }, mount: { floor: 'anchor', top: 'bolt' } },
    { cls: 'dispenser', label: '디스펜서', group: 'machine', words: ['디스펜서'], role: 'floor', host: NO, mount: { floor: 'feet' }, solid: true },
    { cls: 'conveyor', label: '컨베이어', group: 'machine', words: ['컨베이어', 'conveyor'], role: 'floor', host: { top: true, side: true }, needs: ['floor', 'top'], mount: { floor: 'feet', top: 'bolt' } },
    { cls: 'utility', label: '부대 설비', group: 'machine', words: ['부대설비', '부대 설비', '용접 전원', '에어 필터', '컴프레서', '전원'], role: 'floor', host: NO, mount: { floor: 'feet' }, solid: true },
    { cls: 'cabinet', label: '제어반 (바닥 설치)', group: 'machine', words: ['캐비닛', '분전반', 'cabinet'], role: 'floor', host: { top: false, side: true, inside: true }, mount: { floor: 'anchor' }, solid: true },
    // 반송 · 로봇
    { cls: 'rail', label: '레일', group: 'handling', words: ['레일', 'rail'], role: 'floor', host: { top: true, side: true }, needs: ['floor', 'top', 'inside'], mount: { floor: 'anchor', top: 'bolt' } },
    { cls: 'robot', label: '로봇', group: 'handling', words: ['로봇', 'robot'], role: 'robot', host: NO, needs: ['top', 'floor', 'inside'], mount: { floor: 'anchor', top: 'bolt' } },
    { cls: 'tray', label: '트레이', group: 'handling', words: ['트레이', 'tray'], role: 'top', host: { top: true, side: false, stack: 315 }, needs: ['top', 'inside', 'floor'], mount: { top: 'free', floor: 'free' } },
    // 제어 · 표시
    { cls: 'control', label: '제어함', group: 'control', words: ['제어함', '제어반', 'control'], role: 'side', host: NO, mount: { side: 'bracket' } },
    { cls: 'device', label: '제어 기기 (DIN)', group: 'control', words: ['PLC', '인버터', '릴레이', '차단기', 'DIN'], role: 'side', host: NO, needs: ['inside', 'side'], mount: { inside: 'din', side: 'bracket' } },
    { cls: 'monitor', label: '모니터', group: 'control', words: ['모니터', 'monitor'], role: 'side', host: NO, mount: { side: 'bracket' } },
    { cls: 'sensor', label: '센서', group: 'control', words: ['센서', 'sensor'], role: 'side', host: NO, mount: { side: 'bracket' } },
    { cls: 'lamp', label: '경광등', group: 'control', words: ['경광등', '타워램프', 'lamp'], role: 'top', host: NO, mount: { top: 'bolt' } },
    // 안전
    { cls: 'post', label: '펜스 포스트', group: 'safety', words: ['포스트', 'post'], role: 'floor', host: { top: false, side: true }, mount: { floor: 'anchor' } },
    { cls: 'fence', label: '안전 펜스 패널', group: 'safety', words: ['펜스', '안전 울타리', 'fence'], role: 'side', host: NO, needs: ['side', 'floor'], mount: { side: 'post', floor: 'anchor' } },
    { cls: 'guard', label: '가림판 · 가드', group: 'safety', words: ['가림판', '가드', 'guard'], role: 'side', host: NO, mount: { side: 'bracket' } },
    // 작업자
    { cls: 'desk', label: '작업대', group: 'operator', words: ['작업대', '테이블'], role: 'floor', host: { top: true, side: true, front: true }, mount: { floor: 'feet' }, solid: true },
    { cls: 'seat', label: '의자', group: 'operator', words: ['의자', 'chair'], role: 'seat', host: NO, needs: ['front', 'floor'], mount: { front: 'free', floor: 'free' } },
    // 치구 · 제품
    { cls: 'jig', label: '지그', group: 'fixture', words: ['지그', 'jig'], role: 'top', host: { top: true, side: false }, needs: ['top', 'inside', 'floor'], mount: { top: 'bolt', inside: 'bolt', floor: 'anchor' } },
    { cls: 'work', label: '제품', group: 'fixture', words: ['제품', '워크', 'work'], role: 'top', host: { top: true, side: false }, mount: { top: 'free' } },
    { cls: 'aux', label: '부속 · 부대 장치', group: 'fixture', words: ['부대 장치', '부속'], role: 'side', host: NO, mount: { side: 'bracket' } },
  ],
  verified: {
    floor: ['*'],
    top: ['lamp>frame', 'lamp>shelf', 'lamp>tray', 'lamp>base', 'shelf>shelf', 'work>tray', 'tray>jig', 'tray>tray', 'robot>base', 'jig>base',
      // standard practice (not from the stations): a robot or jig on its pedestal / plate, a gantry across columns, a conveyor on a frame
      'robot>column', 'robot>plate', 'jig>plate', 'jig>desk', 'gantry>column', 'gantry>frame', 'conveyor>frame', 'rail>frame', 'control>column'],
    side: ['control>shelf', 'control>frame', 'aux>frame', 'monitor>frame', 'fence>post', 'control>column', 'sensor>frame', 'sensor>conveyor', 'guard>frame', 'monitor>column', 'control>cabinet'],
    inside: ['aux>shelf', 'sensor>base', 'guard>base', 'monitor>base', 'jig>base', 'tray>base', 'lamp>base', 'robot>base', 'device>cabinet', 'device>control'],
    front: ['seat>desk'],
  },
});
