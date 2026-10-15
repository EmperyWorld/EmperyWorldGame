import { describe, it, expect } from 'vitest';
import { EMPTY_EQUIPMENT, PLAYER_STAMINA_MAX } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  DOCKHAND_NPC_ID,
  DOCK_SHIFT_ACTIVE_FLAG,
  DOCK_SHIFT_COUNT_FLAG,
  DOCK_SHIFT_CRATE_ID,
  DOCK_SHIFT_CRATE_COUNT,
  DOCK_SHIFT_REWARD_ADENA,
  DOCK_SHIFT_STAMINA_COST,
  abandonDockShift,
  countPortCrates,
  finishDockShift,
  startDockShift,
} from './dock-shift.js';
import { applyDockChoice, generateDockDialogue } from './dock-shift-dialogue.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-dock-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 2,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'empery_haven',
    adena: 100,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    stamina: PLAYER_STAMINA_MAX,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

const dockhand: HavenNpcLike = {
  id: DOCKHAND_NPC_ID,
  name: 'Грузчик Петр',
  defaultGreeting:
    'Бочки, канаты, котелки — вот и вся поэзия порта. Походные припасы есть. Рыбу бери у Ульфа рядом, еду в городе — у Брана и Фаддея.',
  portraits: { default: 'neutral' },
  choices: [
    {
      id: 'dock_shift_start',
      label: 'Взять смену с ящиками',
      flag: '_dock_shift_start',
      portrait: 'work',
      blocks: [DOCK_SHIFT_ACTIVE_FLAG],
    },
    { id: 'dock_shift_finish', label: 'Сдать ящики', flag: '_dock_shift_finish', portrait: 'happy' },
    {
      id: 'dock_shift_abandon',
      label: 'Отказаться от смены',
      flag: '_dock_shift_abandon',
      portrait: 'serious',
    },
    { id: 'dock_supplies', label: 'Купить походные припасы', flag: '_dock_supplies', portrait: 'work' },
    { id: 'dock_work', label: 'Чем занят порт сегодня?', flag: '_dock_work', nextNode: 'work', portrait: 'work' },
    { id: 'dock_warn', label: 'Куда лучше не соваться?', flag: '_dock_warn', nextNode: 'warn', portrait: 'serious' },
    { id: 'dock_leave', label: 'Уйти', flag: '_dock_done', portrait: 'neutral' },
  ],
  nodes: {
    work: {
      text: 'Разгружаем галеру.',
      portrait: 'work',
      choices: [{ id: 'dock_work_bye', label: 'Не мешаю', flag: '_dock_done', portrait: 'happy' }],
    },
  },
};

describe('dock-shift (town_dockhand)', () => {
  it('start gives 2 crates, sets active, drains stamina', () => {
    const s0 = testSave({ stamina: PLAYER_STAMINA_MAX });
    const res = startDockShift(s0);

    expect(res.ok).toBe(true);
    expect(res.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBe(true);
    expect(countPortCrates(res.save)).toBe(DOCK_SHIFT_CRATE_COUNT);
    expect(res.save.stamina).toBe(PLAYER_STAMINA_MAX - DOCK_SHIFT_STAMINA_COST);
    expect(res.message).toContain('Петр');
  });

  it('finish without crates fails and keeps shift active', () => {
    const s0 = testSave({
      questFlags: { [DOCK_SHIFT_ACTIVE_FLAG]: true },
      inventory: [],
    });
    const res = finishDockShift(s0);

    expect(res.ok).toBe(false);
    expect(res.message).toContain('Ящики потеряны? Без груза смены нет.');
    expect(res.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBe(true);
    expect(res.save.adena).toBe(100);
  });

  it('finish with 2 crates pays, clears active, counts haven_dock_shifts', () => {
    const started = startDockShift(testSave({ adena: 40, stamina: 400 }));
    const res = finishDockShift(started.save);

    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 + DOCK_SHIFT_REWARD_ADENA);
    expect(res.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBeUndefined();
    expect(res.save.questFlags[DOCK_SHIFT_COUNT_FLAG]).toBe(1);
    expect(countPortCrates(res.save)).toBe(0);
  });

  it('finish strips leftover unsellable crates beyond the shift quota', () => {
    const started = startDockShift(testSave());
    const extra = {
      ...started.save,
      inventory: [...started.save.inventory, DOCK_SHIFT_CRATE_ID],
    };
    const res = finishDockShift(extra);
    expect(res.ok).toBe(true);
    expect(countPortCrates(res.save)).toBe(0);
  });

  it('abandon strips all crates, clears active, no pay', () => {
    const started = startDockShift(testSave({ adena: 80, stamina: 500 }));
    const res = abandonDockShift(started.save);

    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(80);
    expect(res.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBeUndefined();
    expect(countPortCrates(res.save)).toBe(0);
    expect(res.save.questFlags[DOCK_SHIFT_COUNT_FLAG]).toBeUndefined();
  });

  it('second start while active reminds without extra crates', () => {
    const first = startDockShift(testSave({ stamina: 300 }));
    const second = startDockShift(first.save);

    expect(second.ok).toBe(true);
    expect(second.message).toContain('Ящики ещё у тебя');
    expect(countPortCrates(second.save)).toBe(DOCK_SHIFT_CRATE_COUNT);
    expect(second.save.stamina).toBe(first.save.stamina);
    expect(second.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBe(true);
  });

  it('dock_supplies apply returns save', () => {
    const s0 = testSave();
    const applied = applyDockChoice(dockhand, s0, 'dock_supplies');

    expect(applied).not.toBeNull();
    expect(applied?.save).toBe(s0);
    expect(applied?.followUp).toBeUndefined();
  });

  it('apply returns null for wrong npc and flavor choices', () => {
    const s0 = testSave();
    const other: HavenNpcLike = { ...dockhand, id: 'town_fisher' };

    expect(applyDockChoice(other, s0, 'dock_shift_start')).toBeNull();
    expect(applyDockChoice(dockhand, s0, 'dock_work')).toBeNull();
    expect(applyDockChoice(dockhand, s0, 'dock_warn')).toBeNull();
    expect(applyDockChoice(dockhand, s0, 'dock_leave')).toBeNull();
    expect(applyDockChoice(dockhand, s0, 'dock_work_bye')).toBeNull();
  });

  it('generateDockDialogue is null unless town_dockhand; greeting and abandon depend on active', () => {
    const idle = generateDockDialogue(dockhand, testSave());
    expect(idle).not.toBeNull();
    expect(idle?.text).toContain('поэзия порта');
    expect(idle?.choices.map((c) => c.id)).toContain('dock_shift_start');
    expect(idle?.choices.map((c) => c.id)).toContain('dock_supplies');
    expect(idle?.choices.map((c) => c.id)).not.toContain('dock_shift_abandon');

    const active = generateDockDialogue(
      dockhand,
      testSave({ questFlags: { [DOCK_SHIFT_ACTIVE_FLAG]: true } }),
    );
    expect(active?.text).toBe('Ну что, ящики на месте?');
    expect(active?.choices.map((c) => c.id)).toContain('dock_shift_finish');
    expect(active?.choices.map((c) => c.id)).toContain('dock_shift_abandon');
    expect(active?.choices.map((c) => c.id)).toContain('dock_supplies');
    expect(active?.choices.map((c) => c.id)).not.toContain('dock_shift_start');

    const other: HavenNpcLike = { ...dockhand, id: 'town_fisher' };
    expect(generateDockDialogue(other, testSave())).toBeNull();
  });

  it('apply start/finish/abandon mutate save via plugin', () => {
    const started = applyDockChoice(dockhand, testSave({ stamina: 200 }), 'dock_shift_start');
    expect(started?.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBe(true);
    expect(countPortCrates(started!.save)).toBe(DOCK_SHIFT_CRATE_COUNT);

    const finished = applyDockChoice(dockhand, started!.save, 'dock_shift_finish');
    expect(finished?.save.adena).toBe(100 + DOCK_SHIFT_REWARD_ADENA);
    expect(finished?.save.questFlags[DOCK_SHIFT_COUNT_FLAG]).toBe(1);

    const again = applyDockChoice(dockhand, testSave({ stamina: 200 }), 'dock_shift_start');
    const abandoned = applyDockChoice(dockhand, again!.save, 'dock_shift_abandon');
    expect(countPortCrates(abandoned!.save)).toBe(0);
    expect(abandoned?.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBeUndefined();
  });

  it('shift is repeatable after a paid finish', () => {
    const first = finishDockShift(startDockShift(testSave({ stamina: 800 })).save);
    expect(first.save.questFlags[DOCK_SHIFT_COUNT_FLAG]).toBe(1);

    const secondStart = startDockShift(first.save);
    expect(secondStart.ok).toBe(true);
    expect(secondStart.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBe(true);
    expect(countPortCrates(secondStart.save)).toBe(DOCK_SHIFT_CRATE_COUNT);
  });
});
