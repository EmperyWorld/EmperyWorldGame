import { describe, expect, it } from 'vitest';
import { computeHavenSchedule, havenScheduleEntryById } from '@empery/shared';
import { DayNightService } from './day-night.js';
import {
  gateNpcInteract,
  gateShopOpen,
  HAVEN_SHOP_NPC,
} from './npc-schedule-gate.js';

function msAtGameHour(dayNight: DayNightService, hour: number): number {
  const { cycleMs, epochMs } = dayNight.configSnapshot();
  return epochMs + (hour / 24) * cycleMs;
}

describe('npc-schedule-gate', () => {
  const dayNight = new DayNightService();

  it('blocks merchant shop at night in haven', () => {
    const gate = gateShopOpen(dayNight, 'haven_merchant', 'empery_haven', msAtGameHour(dayNight, 23));
    expect(gate.ok).toBe(false);
    expect(gate.message).toContain('до утра');
  });

  it('keeps the notice board and HQ sentry available as static infrastructure', () => {
    const night = msAtGameHour(dayNight, 23);
    expect(gateNpcInteract(dayNight, 'town_notice_board', 'empery_haven', night).ok).toBe(true);
    expect(gateNpcInteract(dayNight, 'town_hq_sentry', 'empery_haven', night).ok).toBe(true);
  });

  it('closes a service at dusk even while its NPC is waiting to depart from the post',()=>{
    const now=msAtGameHour(dayNight,21)+1;
    const entry=havenScheduleEntryById(computeHavenSchedule(now,dayNight.configSnapshot()),'town_blacksmith');expect(entry?.phase).toBe('at_post');expect(entry?.interactable).toBe(false);
    expect(gateShopOpen(dayNight,'haven_armor','empery_haven',now).ok).toBe(false);
  });

  it('allows innkeeper provisions shop at night', () => {
    const gate = gateShopOpen(dayNight, 'haven_provisions', 'empery_haven', msAtGameHour(dayNight, 23));
    expect(gate.ok).toBe(true);
  });

  it('allows healer apothecary at night', () => {
    const gate = gateShopOpen(dayNight, 'haven_apothecary', 'empery_haven', msAtGameHour(dayNight, 2));
    expect(gate.ok).toBe(true);
  });

  it('allows shops during the day', () => {
    const gate = gateShopOpen(dayNight, 'haven_merchant', 'empery_haven', msAtGameHour(dayNight, 12));
    expect(gate.ok).toBe(true);
  });

  it('ignores schedule outside haven', () => {
    const gate = gateNpcInteract(dayNight, 'town_merchant', 'shadow_depths', msAtGameHour(dayNight, 23));
    expect(gate.ok).toBe(true);
  });

  it('maps all haven shops to NPC ids', () => {
    expect(Object.keys(HAVEN_SHOP_NPC).length).toBe(11);
    expect(HAVEN_SHOP_NPC.haven_blacksmith).toBeUndefined();
    expect(HAVEN_SHOP_NPC.haven_armor).toBe('town_blacksmith');
  });

  it('returns distinct commuting dialogue messages when walking home and to work', () => {
    const eveningNow = msAtGameHour(dayNight, 21) + 1_000;
    const eveningGate = gateNpcInteract(dayNight, 'town_merchant', 'empery_haven', eveningNow);
    expect(eveningGate.phase).toBe('walking_home');
    expect(eveningGate.isCommuting).toBe(true);
    expect(eveningGate.message).toContain('Лорен спешит домой');

    const morningNow = msAtGameHour(dayNight, 7) + 1_000;
    const morningGate = gateNpcInteract(dayNight, 'town_merchant', 'empery_haven', morningNow);
    expect(morningGate.phase).toBe('walking_to_post');
    expect(morningGate.isCommuting).toBe(true);
    expect(morningGate.message).toContain('Лорен бодро шагает');
  });
});
