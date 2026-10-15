import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { resetRumorsForTests } from './rumors.js';
import {
  applyInformantChoice,
  generateInformantDialogue,
  informantDossierPlugin,
} from './informant-dossier-dialogue.js';
import {
  BLADE_PROOF_MESSAGE,
  BOUNTY_COMPLETE_FLAG,
  CONTRACT_COST,
  CONTRACT_REWARD_ADENA,
  DOSSIER_ALREADY_MESSAGE,
  DOSSIER_COST,
  GROVE_COMPLETE_FLAG,
  HQ_LAB_ACTIVE_FLAG,
  HQ_LAB_COMPLETE_FLAG,
  INFORMANT_CONTRACT_ACTIVE_FLAG,
  INFORMANT_CONTRACT_COMPLETE_FLAG,
  INFORMANT_CONTRACT_HUD,
  WHISPER_DOSSIER_ID,
  buyDossier,
  buyShadyContract,
  claimShadyContract,
  dossierHintFromFlags,
} from './informant-dossier.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-informant-player',
    name: 'AlleyAdventurer',
    race: 'human',
    profession: 'rogue',
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

function loadInformantNpc(): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_informant.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, nodes: raw.nodes ?? {} };
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

describe('informant dossier item', () => {
  it('loads whisper_dossier as unsellable material', () => {
    const item = getItem(WHISPER_DOSSIER_ID);
    expect(item?.name).toBe('Досье Переулка');
    expect(item?.slot).toBe('material');
    expect(item?.unsellable).toBe(true);
  });
});

describe('buyDossier', () => {
  it('rejects when player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const res = buyDossier(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).not.toContain(WHISPER_DOSSIER_ID);
    expect(res.message).toContain(String(DOSSIER_COST));
  });

  it('gives the dossier once and fails on duplicate', () => {
    resetRumorsForTests();
    const s0 = testSave({ adena: 50 });
    const first = buyDossier(s0);
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(50 - DOSSIER_COST);
    expect(first.save.inventory).toContain(WHISPER_DOSSIER_ID);
    expect(first.message).toContain('подозрительно тихо');
    expect(first.message).toContain('Переулке Шепотов');

    const dup = buyDossier(first.save);
    expect(dup.ok).toBe(false);
    expect(dup.message).toBe(DOSSIER_ALREADY_MESSAGE);
    expect(dup.save.adena).toBe(first.save.adena);
    expect(dup.save.inventory.filter((id) => id === WHISPER_DOSSIER_ID)).toHaveLength(1);
  });

  it('mentions a concrete hint from grove / bounty / hq lab flags', () => {
    resetRumorsForTests();
    const grove = buyDossier(testSave({ questFlags: { [GROVE_COMPLETE_FLAG]: true } }));
    expect(grove.ok).toBe(true);
    expect(grove.message).toContain('Роща');
    expect(grove.message).toContain(dossierHintFromFlags(grove.save));

    const bounty = buyDossier(testSave({ questFlags: { [BOUNTY_COMPLETE_FLAG]: true } }));
    expect(bounty.message).toContain('Доска');

    const lab = buyDossier(testSave({ questFlags: { [HQ_LAB_COMPLETE_FLAG]: true } }));
    expect(lab.message).toContain('Лаборатория Штаба');

    const labActive = buyDossier(testSave({ questFlags: { [HQ_LAB_ACTIVE_FLAG]: true } }));
    expect(labActive.message).toContain('лаборатории Штаба');
  });
});

describe('buyShadyContract / claimShadyContract', () => {
  it('rejects contract when player cannot pay', () => {
    const s0 = testSave({ adena: 10 });
    const res = buyShadyContract(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.questFlags[INFORMANT_CONTRACT_ACTIVE_FLAG]).toBeFalsy();
    expect(res.message).toContain(String(CONTRACT_COST));
  });

  it('starts a one-time contract and reminds if already active', () => {
    const started = buyShadyContract(testSave({ adena: 40 }));
    expect(started.ok).toBe(true);
    expect(started.save.adena).toBe(40 - CONTRACT_COST);
    expect(started.save.questFlags[INFORMANT_CONTRACT_ACTIVE_FLAG]).toBe(true);

    const remind = buyShadyContract(started.save);
    expect(remind.ok).toBe(true);
    expect(remind.save.adena).toBe(started.save.adena);
    expect(remind.message).toContain('уже куплено');
  });

  it('refuses claim without blade proof', () => {
    const started = buyShadyContract(testSave({ adena: 40 }));
    const claimed = claimShadyContract(started.save);
    expect(claimed.ok).toBe(false);
    expect(claimed.message).toBe(BLADE_PROOF_MESSAGE);
    expect(claimed.save.adena).toBe(started.save.adena);
    expect(claimed.save.questFlags[INFORMANT_CONTRACT_ACTIVE_FLAG]).toBe(true);
  });

  it('pays the cut after grove or bounty, then locks the contract', () => {
    const started = buyShadyContract(testSave({ adena: 40 }));
    const groveSave = {
      ...started.save,
      questFlags: { ...started.save.questFlags, [GROVE_COMPLETE_FLAG]: true },
    };
    const claimed = claimShadyContract(groveSave);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.adena).toBe(started.save.adena + CONTRACT_REWARD_ADENA);
    expect(claimed.save.questFlags[INFORMANT_CONTRACT_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.questFlags[INFORMANT_CONTRACT_ACTIVE_FLAG]).toBeFalsy();

    const again = claimShadyContract(claimed.save);
    expect(again.ok).toBe(false);
    expect(again.save.adena).toBe(claimed.save.adena);

    const buyAgain = buyShadyContract(claimed.save);
    expect(buyAgain.ok).toBe(false);
    expect(buyAgain.save.questFlags[INFORMANT_CONTRACT_ACTIVE_FLAG]).toBeFalsy();
  });

  it('accepts bounty complete as blade proof', () => {
    const started = buyShadyContract(testSave({ adena: 30 }));
    const bountySave = {
      ...started.save,
      questFlags: { ...started.save.questFlags, [BOUNTY_COMPLETE_FLAG]: true },
    };
    const claimed = claimShadyContract(bountySave);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.adena).toBe(started.save.adena + CONTRACT_REWARD_ADENA);
  });

  it('refuses claim without an active contract', () => {
    const res = claimShadyContract(testSave({ questFlags: { [GROVE_COMPLETE_FLAG]: true } }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(100);
    expect(res.message).toContain('купи имя');
  });
});

describe('informant dossier HUD constant', () => {
  it('matches the quest strip copy', () => {
    expect(INFORMANT_CONTRACT_HUD).toBe('Квест: забери долю у информатора [E]');
  });
});

describe('informant dossier dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateInformantDialogue(otherNpc, save)).toBeNull();
    expect(applyInformantChoice(otherNpc, save, 'informant_dossier')).toBeNull();
    expect(informantDossierPlugin.generate(otherNpc, save)).toBeNull();
  });

  it('adds mechanic choices and keeps rumor choices', () => {
    const npc = loadInformantNpc();

    const idle = generateInformantDialogue(npc, testSave());
    expect(idle).not.toBeNull();
    const idleIds = idle!.choices.map((c) => c.id);
    expect(idleIds).toEqual(
      expect.arrayContaining([
        'informant_dossier',
        'informant_contract',
        'rumor_latest',
        'rumor_shady',
        'informant_night',
        'rumor_leave',
      ]),
    );
    expect(idleIds).not.toContain('informant_claim');
    expect(idle!.text).toContain('Тише');

    const active = generateInformantDialogue(
      npc,
      testSave({ questFlags: { [INFORMANT_CONTRACT_ACTIVE_FLAG]: true } }),
    );
    const activeIds = active!.choices.map((c) => c.id);
    expect(activeIds).toContain('informant_claim');
    expect(activeIds).toContain('rumor_latest');
    expect(activeIds).not.toContain('informant_contract');
    expect(active!.text).toContain('Забери долю');

    const complete = generateInformantDialogue(
      npc,
      testSave({ questFlags: { [INFORMANT_CONTRACT_COMPLETE_FLAG]: true } }),
    );
    const completeIds = complete!.choices.map((c) => c.id);
    expect(completeIds).not.toContain('informant_contract');
    expect(completeIds).not.toContain('informant_claim');
    expect(completeIds).toContain('rumor_shady');
  });

  it('greets a player who already holds the dossier', () => {
    const npc = loadInformantNpc();
    const withPaper = generateInformantDialogue(npc, testSave({ inventory: [WHISPER_DOSSIER_ID] }));
    expect(withPaper?.text).toContain('Бумага у тебя');
  });

  it('applies mechanic choices and returns null for rumor ids', () => {
    const npc = loadInformantNpc();
    const save = testSave({ adena: 80 });

    const dossier = applyInformantChoice(npc, save, 'informant_dossier');
    expect(dossier).not.toBeNull();
    expect(dossier!.save.inventory).toContain(WHISPER_DOSSIER_ID);
    expect(dossier!.townMessage).toContain('свёрток');
    expect(dossier!.followUp?.choices.map((c) => c.id)).toContain('rumor_latest');

    const contracted = applyInformantChoice(npc, save, 'informant_contract');
    expect(contracted).not.toBeNull();
    expect(contracted!.save.questFlags[INFORMANT_CONTRACT_ACTIVE_FLAG]).toBe(true);
    expect(contracted!.followUp?.choices.map((c) => c.id)).toContain('informant_claim');

    const claimed = applyInformantChoice(
      npc,
      {
        ...contracted!.save,
        questFlags: { ...contracted!.save.questFlags, [BOUNTY_COMPLETE_FLAG]: true },
      },
      'informant_claim',
    );
    expect(claimed).not.toBeNull();
    expect(claimed!.save.questFlags[INFORMANT_CONTRACT_COMPLETE_FLAG]).toBe(true);
    expect(claimed!.save.adena).toBe(contracted!.save.adena + CONTRACT_REWARD_ADENA);

    expect(applyInformantChoice(npc, save, 'rumor_latest')).toBeNull();
    expect(applyInformantChoice(npc, save, 'rumor_shady')).toBeNull();
    expect(applyInformantChoice(npc, save, 'rumor_leave')).toBeNull();
  });
});
