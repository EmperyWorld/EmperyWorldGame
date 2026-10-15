import { describe, expect, it } from 'vitest';
import type { PlayerSave } from './api.js';
import { formatQuestHud, formatQuestHudLabel } from './quest-hud.js';

function save(partial: Partial<PlayerSave> & Pick<PlayerSave, 'location'>): PlayerSave {
  return {
    id: 's1',
    accountId: 'a1',
    name: 'Hero',
    race: 'human',
    profession: 'warrior',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    adena: 0,
    inventory: [],
    equipment: {},
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    pkCount: 0,
    pvpCount: 0,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('formatQuestHud', () => {
  it('shows grove kill progress while quest active', () => {
    expect(
      formatQuestHud(
        save({
          location: 'starter_grove',
          questFlags: { quest_grove_active: true, quest_grove_kills: 2 },
        }),
      ),
    ).toBe('Квест: гоблины 2/3');
  });

  it('shows a haven location hint', () => {
    const text = formatQuestHud(save({ location: 'empery_haven', questFlags: {} }));
    expect(text).toMatch(/Город|HQ|торговец|сад/);
  });

  it('hints town services in haven after garden quest', () => {
    expect(
      formatQuestHud(
        save({ location: 'empery_haven', questFlags: { quest_garden_complete: true } }),
      ),
    ).toContain('торговец');
  });

  it('prefers active quest over location default', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_depths_boss_active: true },
        }),
      ),
    ).toBe('Квест: срази Владыку теней');
  });

  it('shows haven board bounty progress when active', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_board_bounty_active: true, quest_board_bounty_kills: 1 },
        }),
      ),
    ).toBe('Контракт: зачистка подступов 1/3 · доска [E]');
  });

  it('shows fish delivery quest hints for active and delivered states', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_fish_delivery_active: true },
        }),
      ),
    ).toBe('Квест: доставь рыбу Марте в таверну [E]');

    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_fish_delivery_active: true, quest_fish_delivery_delivered: true },
        }),
      ),
    ).toBe('Квест: вернись к рыбаку Ульфу в порт [E]');
  });

  it('shows miller flour order progress', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          inventory: ['mill_flour', 'mill_flour'],
          questFlags: { quest_miller_order_active: true },
        }),
      ),
    ).toBe('Квест: мука для Фаддея (есть 2/3) · мельница [E]');
  });

  it('shows dock shift and scribe folio quest hints', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_dock_shift_active: true },
        }),
      ),
    ).toBe('Квест: верни ящики грузчику Петру в порт [E]');

    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_scribe_folio_active: true },
        }),
      ),
    ).toBe('Квест: забери опись у писца Ирины [E]');
  });

  it('shows guard report, informant cut, butcher jerky, and garden harvest hints', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_guard_report_active: true },
        }),
      ),
    ).toBe('Квест: доложи стражу Леону у ворот [E]');

    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_informant_contract_active: true },
        }),
      ),
    ).toBe('Квест: забери долю у информатора [E]');

    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          inventory: ['raw_meat'],
          questFlags: { quest_butcher_jerky_active: true },
        }),
      ),
    ).toBe('Квест: принеси сырое мясо Брану (есть 1/2) · рынок [E]');

    expect(
      formatQuestHud(
        save({
          location: 'empery_haven',
          questFlags: { quest_garden_harvest_active: true },
        }),
      ),
    ).toBe('Квест: забери урожай у садовника Ильи [E]');
  });

  it('shows HQ campus and lab quest hints', () => {
    expect(
      formatQuestHud(
        save({
          location: 'empery_hq',
          questFlags: { quest_empery_hq_access: true },
        }),
      ),
    ).toContain('д-р Вейн');

    expect(
      formatQuestHud(
        save({
          location: 'empery_hq',
          questFlags: { quest_empery_hq_access: true, quest_hq_lab_active: true },
        }),
      ),
    ).toContain('фильтр или батарея');

    expect(
      formatQuestHud(
        save({
          location: 'empery_hq',
          questFlags: { quest_empery_hq_access: true, quest_hq_lab_complete: true },
        }),
      ),
    ).toContain('матрица откалибрована');
  });
});

describe('formatQuestHudLabel', () => {
  it('drops the Квест prefix and keeps other labels', () => {
    expect(formatQuestHudLabel('Квест: гоблины 2/3')).toBe('гоблины 2/3');
    expect(formatQuestHudLabel('Город: торговец, трактир')).toBe('Город: торговец, трактир');
    expect(formatQuestHudLabel('Контракт: зачистка')).toBe('Контракт: зачистка');
  });
});
