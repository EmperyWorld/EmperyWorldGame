import { describe, expect, it } from 'vitest';
import type { HavenNpcScheduleEntry } from '@empery/shared';
import { havenShipTimetable } from '@empery/shared';
import { npcAvailableForInteraction } from './npc-availability.js';

function scheduleEntry(interactable: boolean): HavenNpcScheduleEntry {
  return {
    id: 'town_merchant',
    mode: 'day',
    phase: 'at_post',
    x: 0,
    y: 0,
    asleep: false,
    interactable,
  };
}

describe('npcAvailableForInteraction', () => {
  it('shows harbor skippers only while their ship is docked', () => {
    const tt = havenShipTimetable('prop_ship_brig');
    const dockedAt = tt.offsetHours + 0.05;
    const awayAt = tt.offsetHours + tt.dockHours + 1;
    expect(
      npcAvailableForInteraction('harbor_skipper_brig', 'empery_haven', 12, undefined, true, dockedAt),
    ).toBe(true);
    expect(
      npcAvailableForInteraction('harbor_skipper_brig', 'empery_haven', 12, undefined, true, awayAt),
    ).toBe(false);
  });

  it('allows fixed city infrastructure without a moving schedule entry', () => {
    expect(
      npcAvailableForInteraction(
        'town_notice_board',
        'empery_haven',
        12,
        undefined,
      ),
    ).toBe(true);
    expect(
      npcAvailableForInteraction(
        'town_notice_board',
        'empery_haven',
        23,
        undefined,
      ),
    ).toBe(true);
    expect(
      npcAvailableForInteraction(
        'town_hq_sentry',
        'empery_haven',
        23,
        undefined,
      ),
    ).toBe(true);
  });

  it('does not treat a missing moving NPC entry as an open static service', () => {
    expect(
      npcAvailableForInteraction(
        'town_merchant',
        'empery_haven',
        12,
        undefined,
      ),
    ).toBe(false);
  });

  it('never shows an interaction for a hidden actor or a sleeping schedule entry',()=>{
    expect(npcAvailableForInteraction('town_merchant','empery_haven',12,scheduleEntry(true),false)).toBe(false);
    expect(npcAvailableForInteraction('town_merchant','empery_haven',12,{...scheduleEntry(true),asleep:true})).toBe(false);
  });

  it('uses the authoritative schedule when an entry exists', () => {
    expect(
      npcAvailableForInteraction(
        'town_merchant',
        'empery_haven',
        12,
        scheduleEntry(true),
      ),
    ).toBe(true);
    expect(
      npcAvailableForInteraction(
        'town_merchant',
        'empery_haven',
        12,
        scheduleEntry(false),
      ),
    ).toBe(false);
  });
});
