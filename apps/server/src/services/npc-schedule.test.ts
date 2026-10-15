import { describe, expect, it } from 'vitest';
import {
  isHavenStaticNpc,
  isNpcInteractable,
  isNpcRestHour,
  NPC_NIGHT_OPEN,
  NPC_NIGHT_PATROL,
  resolveNpcScheduleMode,
} from '@empery/shared';

describe('npc-schedule', () => {
  const haven = { locationId: 'empery_haven' as const };

  it('merchants sleep at night in haven', () => {
    expect(resolveNpcScheduleMode('town_merchant', 22, haven)).toBe('sleep');
    expect(resolveNpcScheduleMode('town_blacksmith', 3, haven)).toBe('sleep');
  });

  it('innkeeper and healer stay open overnight', () => {
    expect(resolveNpcScheduleMode('town_innkeeper', 23, haven)).toBe('open');
    expect(resolveNpcScheduleMode('town_innkeeper', 12, haven)).toBe('sleep');
    expect(resolveNpcScheduleMode('town_innkeeper_day', 12, haven)).toBe('day');
    expect(resolveNpcScheduleMode('town_innkeeper_day', 2, haven)).toBe('sleep');
    expect(resolveNpcScheduleMode('town_healer', 2, haven)).toBe('open');
    expect(NPC_NIGHT_OPEN.has('town_innkeeper')).toBe(true);
    expect(NPC_NIGHT_OPEN.has('town_healer')).toBe(true);
  });

  it('priest vigil and informant alley stay open overnight', () => {
    expect(resolveNpcScheduleMode('town_priest', 23, haven)).toBe('open');
    expect(resolveNpcScheduleMode('town_informant', 2, haven)).toBe('open');
    expect(resolveNpcScheduleMode('town_priest', 12, haven)).toBe('day');
    expect(NPC_NIGHT_OPEN.has('town_priest')).toBe(true);
    expect(NPC_NIGHT_OPEN.has('town_informant')).toBe(true);
  });

  it('guard patrols at night', () => {
    expect(resolveNpcScheduleMode('town_guard', 1, haven)).toBe('patrol');
    expect(NPC_NIGHT_PATROL.has('town_guard')).toBe(true);
  });

  it('keeps fixed city infrastructure available without a moving schedule entry', () => {
    expect(isHavenStaticNpc('town_notice_board')).toBe(true);
    expect(isHavenStaticNpc('town_hq_sentry')).toBe(true);
    expect(isHavenStaticNpc('town_merchant')).toBe(false);
    expect(isNpcInteractable('town_notice_board', 12, haven)).toBe(true);
    expect(isNpcInteractable('town_notice_board', 23, haven)).toBe(true);
  });

  it('day hours use normal schedule', () => {
    expect(resolveNpcScheduleMode('town_merchant', 12, haven)).toBe('day');
    expect(isNpcRestHour(12)).toBe(false);
    expect(isNpcRestHour(22)).toBe(true);
    expect(isNpcRestHour(6)).toBe(true);
  });

  it('schedule disabled outside haven', () => {
    expect(resolveNpcScheduleMode('town_merchant', 23, { locationId: 'shadow_depths' })).toBe('day');
  });
});
