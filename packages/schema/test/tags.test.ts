import { describe, expect, it } from 'vitest';
import { tagsFor, isTagName, isTagPath, tagBase, withPrefix, duplicateTags } from '@one-twin/schema';

describe('tag rules (R1 §4.4)', () => {
  it('ON/OFF cylinder, rotary, clamp, lifter', () => {
    expect(tagsFor('cyl 1', { kind: 'onoff' }).map(t => t.tag)).toEqual(['CYL_1_FWD', 'CYL_1_BWD', 'CYL_1_FWD_LS', 'CYL_1_BWD_LS']);
    expect(tagsFor('rot', { kind: 'onoff', variant: 'rotary' }).map(t => t.tag)).toEqual(['ROT_CW', 'ROT_CCW', 'ROT_CW_LS', 'ROT_CCW_LS']);
    expect(tagsFor('c', { kind: 'onoff', variant: 'clamp' })[0]!.tag).toBe('C_CLAMP');
    expect(tagsFor('l', { kind: 'onoff', variant: 'lifter' })[1]!.tag).toBe('L_DOWN');
  });
  it('directions are seen from the PLC', () => {
    const t = tagsFor('ax', { kind: 'position' });
    expect(t.find(x => x.tag === 'AX_POS_CMD')).toEqual({ tag: 'AX_POS_CMD', dir: 'out', type: 'real' });
    expect(t.find(x => x.tag === 'AX_INPOS')!.dir).toBe('in');
  });
  it('process, robot, carrier, sensor, machine common', () => {
    expect(tagsFor('press', { kind: 'process', values: ['load'] }).map(t => t.tag)).toContain('PRESS_LOAD_FB');
    expect(tagsFor('r1', { kind: 'robot', tools: 2 }).map(t => t.tag)).toEqual(['R1_PGM_NO', 'R1_START', 'R1_INPOS', 'R1_RUNNING', 'R1_ALARM', 'R1_TOOL_1', 'R1_TOOL_2']);
    expect(tagsFor('box', { kind: 'carrier' }).map(t => t.tag)).toEqual(['BOX_FULL', 'BOX_EMPTY', 'BOX_COUNT', 'BOX_ID']);
    expect(tagsFor('s', { kind: 'sensor', variant: 'dist' })).toEqual([{ tag: 'S_DIST', dir: 'in', type: 'real' }]);
    expect(tagsFor('', { kind: 'machine' }).map(t => t.tag)).toContain('DOOR_CLOSED');
  });
  it('every generated tag is a valid name within 32 characters', () => {
    const long = 'a very long conveyor name that goes on and on';
    for (const tpl of [{ kind: 'onoff', variant: 'clamp' }, { kind: 'gripper' }, { kind: 'position' }, { kind: 'process', values: ['x'] }] as const)
      for (const t of tagsFor(long, tpl)) expect(isTagName(t.tag), t.tag).toBe(true);
  });
  it('names, prefixes, duplicates', () => {
    expect(tagBase('Clamp-A (left)')).toBe('CLAMP_A_LEFT');
    expect(isTagPath(withPrefix('ST01.M1', 'CYL_FWD'))).toBe(true);
    expect(isTagPath('st01.m1')).toBe(false);
    expect(duplicateTags([{ tag: 'A' }, { tag: 'B' }, { tag: 'A' }])).toEqual(['A']);
  });
});
