import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import { getItem } from './items.js';
import {
  BOARD_BOUNTY_ACTIVE_FLAG,
  BOARD_BOUNTY_COMPLETE_FLAG,
  BOARD_BOUNTY_KILLS_FLAG,
  BOARD_BOUNTY_TARGET_KILLS,
} from './notice-board.js';
import {
  applyNoticePetitionChoice,
  generateNoticePetitionDialogue,
} from './notice-petition-dialogue.js';
import {
  BOARD_COPY_COST,
  BOARD_PETITION_COST,
  copyBoardBulletin,
  fileBoardPetition,
  FORUM_BULLETIN_ID,
  FORUM_PETITION_COMPLETE_FLAG,
  FORUM_SEAL_ID,
} from './notice-petition.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-notice-petition',
    name: 'BoardReader',
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
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function loadBoardNpc(): HavenNpcLike {
  return parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_notice_board.yaml'), 'utf8'),
  ) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_scribe',
  name: 'Писец Ирина',
  defaultGreeting: 'Архив не любит сырость.',
  choices: [],
  nodes: {},
};

describe('notice petition items', () => {
  it('loads forum_bulletin and forum_seal from haven-notice.yaml', () => {
    expect(getItem(FORUM_BULLETIN_ID)?.name).toBe('Бюллетень доски');
    expect(getItem(FORUM_SEAL_ID)?.name).toBe('Печать прошения');
    expect(getItem(FORUM_BULLETIN_ID)?.slot).toBe('material');
    expect(getItem(FORUM_SEAL_ID)?.slot).toBe('material');
    expect(getItem(FORUM_BULLETIN_ID)?.icon).toBe('/media/assets/item_forum_bulletin.webp');
    expect(getItem(FORUM_SEAL_ID)?.icon).toBe('/media/assets/item_forum_seal.webp');
  });
});

describe('copyBoardBulletin', () => {
  it('fails without enough adena and does not grant a bulletin', () => {
    const res = copyBoardBulletin(testSave({ adena: 5 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).not.toContain(FORUM_BULLETIN_ID);
    expect(res.message).toContain(String(BOARD_COPY_COST));
  });

  it('buys a bulletin for 6 adena and is repeatable', () => {
    const first = copyBoardBulletin(testSave({ adena: 20 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(20 - BOARD_COPY_COST);
    expect(first.save.inventory).toContain(FORUM_BULLETIN_ID);

    const second = copyBoardBulletin(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - BOARD_COPY_COST * 2);
    expect(second.save.inventory.filter((id) => id === FORUM_BULLETIN_ID)).toHaveLength(2);
  });
});

describe('fileBoardPetition', () => {
  it('files once: 15 adena, seal, complete flag', () => {
    const res = fileBoardPetition(testSave({ adena: 20 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - BOARD_PETITION_COST);
    expect(res.save.inventory).toContain(FORUM_SEAL_ID);
    expect(res.save.questFlags[FORUM_PETITION_COMPLETE_FLAG]).toBe(true);
  });

  it('fails a second petition without extra adena or seal', () => {
    const first = fileBoardPetition(testSave({ adena: 40 }));
    expect(first.ok).toBe(true);
    const second = fileBoardPetition(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(first.save.adena);
    expect(second.save.inventory.filter((id) => id === FORUM_SEAL_ID)).toHaveLength(1);
    expect(second.message).toContain('уже');
  });
});

describe('notice petition dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateNoticePetitionDialogue(otherNpc, save)).toBeNull();
    expect(applyNoticePetitionChoice(otherNpc, save, 'board_copy')).toBeNull();
  });

  it('shows bounty accept when flags are empty and hides claim', () => {
    const dlg = generateNoticePetitionDialogue(loadBoardNpc(), testSave());
    expect(dlg).not.toBeNull();
    expect(dlg!.text).toContain('ГОРОДСКАЯ ДОСКА ОБЪЯВЛЕНИЙ');
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('board_bounty_accept');
    expect(ids).not.toContain('board_bounty_claim');
    expect(ids).toContain('board_copy');
    expect(ids).toContain('board_petition');
    expect(ids).toContain('board_news');
    expect(ids).toContain('board_guide');
    expect(ids).toContain('board_leave');
  });

  it('hides bounty accept when active and shows claim plus progress', () => {
    const dlg = generateNoticePetitionDialogue(
      loadBoardNpc(),
      testSave({
        questFlags: {
          [BOARD_BOUNTY_ACTIVE_FLAG]: true,
          [BOARD_BOUNTY_KILLS_FLAG]: 2,
        },
      }),
    );
    expect(dlg!.text).toContain(`2/${BOARD_BOUNTY_TARGET_KILLS}`);
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).not.toContain('board_bounty_accept');
    expect(ids).toContain('board_bounty_claim');
    expect(ids).toContain('board_copy');
  });

  it('uses complete greeting and hides accept/claim', () => {
    const dlg = generateNoticePetitionDialogue(
      loadBoardNpc(),
      testSave({ questFlags: { [BOARD_BOUNTY_COMPLETE_FLAG]: true } }),
    );
    expect(dlg!.text).toContain('закрыт с почётом');
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).not.toContain('board_bounty_accept');
    expect(ids).not.toContain('board_bounty_claim');
  });

  it('hides petition after complete', () => {
    const dlg = generateNoticePetitionDialogue(
      loadBoardNpc(),
      testSave({ questFlags: { [FORUM_PETITION_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('board_copy');
    expect(ids).not.toContain('board_petition');
    expect(ids).toContain('board_bounty_accept');
  });

  it('applies copy buy through dialogue', () => {
    const npc = loadBoardNpc();
    const res = applyNoticePetitionChoice(npc, testSave({ adena: 20 }), 'board_copy');
    expect(res).not.toBeNull();
    expect(res!.save.adena).toBe(20 - BOARD_COPY_COST);
    expect(res!.save.inventory).toContain(FORUM_BULLETIN_ID);
    expect(res!.followUp?.choices.map((c) => c.id)).toContain('board_copy');
  });

  it('applies petition once and hides it on follow-up', () => {
    const npc = loadBoardNpc();
    const first = applyNoticePetitionChoice(npc, testSave({ adena: 20 }), 'board_petition');
    expect(first).not.toBeNull();
    expect(first!.save.questFlags[FORUM_PETITION_COMPLETE_FLAG]).toBe(true);
    expect(first!.save.inventory).toContain(FORUM_SEAL_ID);
    expect(first!.followUp?.choices.map((c) => c.id)).not.toContain('board_petition');

    const second = applyNoticePetitionChoice(npc, first!.save, 'board_petition');
    expect(second).not.toBeNull();
    expect(second!.save.adena).toBe(first!.save.adena);
    expect(second!.save.inventory.filter((id) => id === FORUM_SEAL_ID)).toHaveLength(1);
    expect(second!.followUp?.text).toContain('уже');
  });

  it('apply returns null for board_bounty_accept and other YAML ids', () => {
    const npc = loadBoardNpc();
    const save = testSave();
    expect(applyNoticePetitionChoice(npc, save, 'board_bounty_accept')).toBeNull();
    expect(applyNoticePetitionChoice(npc, save, 'board_bounty_claim')).toBeNull();
    expect(applyNoticePetitionChoice(npc, save, 'board_news')).toBeNull();
    expect(applyNoticePetitionChoice(npc, save, 'board_guide')).toBeNull();
    expect(applyNoticePetitionChoice(npc, save, 'board_leave')).toBeNull();
  });
});
