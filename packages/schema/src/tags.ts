/**
 * Signal tags (R1 §4.4, 머신빌더 블록 목록 "I-O 태그 규칙").
 * Direction is seen from the PLC, as in an I/O list: `out` = PLC output (a command to the device),
 * `in` = PLC input (feedback from the device). Names: upper case, digits, underscore, at most 32
 * characters; an instance placed in a factory gets the prefix `{station}.{machine}.` (R1 §7.3).
 */
export type TagDir = 'in' | 'out';
export type TagType = 'bool' | 'int' | 'real';
export interface TagDef { tag: string; dir: TagDir; type: TagType }

export const TAG_MAX = 32;
export const TAG_NAME = /^[A-Z0-9_]+$/;
export const TAG_PATH = /^[A-Z0-9_]+(\.[A-Z0-9_]+)*$/;
export const isTagName = (s: string): boolean => TAG_NAME.test(s) && s.length <= TAG_MAX;
export const isTagPath = (s: string): boolean => TAG_PATH.test(s) && s.split('.').every(p => p.length <= TAG_MAX);

/** Normalise a free name ("cyl 1", "Clamp-A") into a tag base name ("CYL_1", "CLAMP_A"). */
export function tagBase(name: string): string {
  const s = name.normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (s || 'N').slice(0, TAG_MAX);
}
export const withPrefix = (prefix: string, tag: string): string => (prefix ? `${prefix}.${tag}` : tag);

/** ON/OFF axis word pairs: cylinder FWD/BWD, rotary CW/CCW, clamp CLAMP/UNCLAMP, lifter UP/DOWN. */
export const ONOFF_WORDS = {
  linear: ['FWD', 'BWD'], rotary: ['CW', 'CCW'], clamp: ['CLAMP', 'UNCLAMP'], lifter: ['UP', 'DOWN'],
} as const;
export type OnOffKind = keyof typeof ONOFF_WORDS;
export type SensorKind = 'on' | 'dist' | 'value' | 'safe';

export type TagTemplate =
  | { kind: 'onoff'; variant?: OnOffKind }
  | { kind: 'position' }
  | { kind: 'speed' }
  | { kind: 'gripper' }
  | { kind: 'vacuum' }
  | { kind: 'sensor'; variant?: SensorKind }
  | { kind: 'process'; values?: readonly string[] }
  | { kind: 'robot'; tools?: number }
  | { kind: 'carrier' }
  | { kind: 'machine' };

const t = (tag: string, dir: TagDir, type: TagType = 'bool'): TagDef => ({ tag, dir, type });

/** Tag set for one block or axis named `name` (R1 §4.4). */
export function tagsFor(name: string, tpl: TagTemplate): TagDef[] {
  const n = tpl.kind === 'machine' ? '' : tagBase(name);
  // the base name gives way to the suffix so every tag stays within 32 characters
  return raw(n, tpl).map(d => (d.tag.length <= TAG_MAX ? d : { ...d, tag: n.slice(0, TAG_MAX - (d.tag.length - n.length)) + d.tag.slice(n.length) }));
}
function raw(n: string, tpl: TagTemplate): TagDef[] {
  switch (tpl.kind) {
    case 'onoff': {
      const [a, b] = ONOFF_WORDS[tpl.variant ?? 'linear'];
      return [t(`${n}_${a}`, 'out'), t(`${n}_${b}`, 'out'), t(`${n}_${a}_LS`, 'in'), t(`${n}_${b}_LS`, 'in')];
    }
    case 'position':
      return [t(`${n}_POS_CMD`, 'out', 'real'), t(`${n}_POS_FB`, 'in', 'real'), t(`${n}_INPOS`, 'in'), t(`${n}_HOME`, 'out'), t(`${n}_SVON`, 'out'), t(`${n}_ALARM`, 'in')];
    case 'speed':
      return [t(`${n}_RUN`, 'out'), t(`${n}_DIR`, 'out'), t(`${n}_SPEED`, 'out', 'real')];
    case 'gripper':
      return [t(`${n}_OPEN`, 'out'), t(`${n}_CLOSE`, 'out'), t(`${n}_OPEN_LS`, 'in'), t(`${n}_CLOSE_LS`, 'in')];
    case 'vacuum':
      return [t(`${n}_VAC_ON`, 'out'), t(`${n}_VAC_OK`, 'in')];
    case 'sensor': {
      const v = tpl.variant ?? 'on';
      return [v === 'on' ? t(`${n}_ON`, 'in') : v === 'safe' ? t(`${n}_SAFE`, 'in') : t(`${n}_${v.toUpperCase()}`, 'in', 'real')];
    }
    case 'process':
      return [t(`${n}_START`, 'out'), t(`${n}_BUSY`, 'in'), t(`${n}_DONE`, 'in'), t(`${n}_OK`, 'in'), t(`${n}_NG`, 'in'), t(`${n}_ALARM`, 'in'), t(`${n}_READY`, 'in'),
        ...(tpl.values ?? []).map(v => t(`${n}_${tagBase(v).slice(0, 12)}_FB`, 'in', 'real'))];
    case 'robot':
      return [t(`${n}_PGM_NO`, 'out', 'int'), t(`${n}_START`, 'out'), t(`${n}_INPOS`, 'in'), t(`${n}_RUNNING`, 'in'), t(`${n}_ALARM`, 'in'),
        ...Array.from({ length: tpl.tools ?? 1 }, (_, k) => t(`${n}_TOOL_${k + 1}`, 'out'))];
    case 'carrier':
      return [t(`${n}_FULL`, 'in'), t(`${n}_EMPTY`, 'in'), t(`${n}_COUNT`, 'in', 'int'), t(`${n}_ID`, 'in', 'int')];
    case 'machine':
      // panel buttons / safety are PLC inputs, lamps are PLC outputs
      return [t('START', 'in'), t('STOP', 'in'), t('RESET', 'in'), t('EMO', 'in'), t('AUTO_MAN', 'in'), t('DOOR_CLOSED', 'in'), t('SAFE', 'in'), t('RUN', 'out'), t('ALARM', 'out')];
  }
}

/** Duplicate tag names in a list (case sensitive, after prefixing). */
export function duplicateTags(tags: { tag: string }[]): string[] {
  const seen = new Set<string>(), dup = new Set<string>();
  for (const { tag } of tags) (seen.has(tag) ? dup : seen).add(tag);
  return [...dup];
}
