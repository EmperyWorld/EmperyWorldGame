import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { LoreRAG, LlamaStack } from '@empery/llm';
import { cancelConflictingQuests } from './quests.js';
import {
  buyFromMerchant,
  craftItem,
  craftRecipeFromChoice,
  merchantChoiceToItem,
  restAtInn,
} from './town-services.js';
import { getLatestRumors, getShadyRumors } from './rumors.js';
import { acceptGardenQuest, waterGardenBeds } from './garden-quest.js';
import {
  acceptHqLabQuest,
  submitHqLabComponent,
  rebootHqBiofield,
  HQ_LAB_ACTIVE_FLAG,
  HQ_LAB_COMPLETE_FLAG,
} from './hq-lab-quest.js';
import {
  acceptBoardBounty,
  claimBoardBounty,
  formatBoardNews,
} from './notice-board.js';
import {
  requestCathedralBlessing,
  confessAtCathedral,
  takeBathSession,
  buyBathTea,
  startFishDeliveryQuest,
  deliverFishToInn,
  claimFishDeliveryReward,
  requestBardInspiration,
  playHavenDice,
} from './haven-services.js';
import { treatAtNpc } from './medical.js';
import { survivalOf } from './survival.js';
import { recordSurvival } from './survival-telemetry.js';
import { appendItemsToSave } from './inventory-bag.js';
import {
  blacksmithSlotFromChoice,
  buildBlacksmithDialogue,
  enchantAtBlacksmith,
} from './enchant.js';
import {
  mapDialogueChoices,
  portraitForNode,
  questStatePortrait,
  withDialogueScene,
  type NpcPortraits,
} from './dialogue-portraits.js';
import {
  formatCitizenGreeting,
  getCitizenRumors,
  getCitizenAdvice,
  citizenNightGreeting,
  HAVEN_CITY_DIRECTIONS,
  getCityDirection,
} from './citizen-rumors.js';
import { generateMillerDialogue, applyMillerChoice } from './miller-bakery-dialogue.js';
import { generateStableDialogue, applyStableChoice } from './stable-care-dialogue.js';
import { generateBrewerDialogue, applyBrewerChoice } from './brewery-tasting-dialogue.js';
import { generateScribeDialogue, applyScribeChoice } from './scribe-archive-dialogue.js';
import { generateDockDialogue, applyDockChoice } from './dock-shift-dialogue.js';
import { generateCaptainDialogue, applyCaptainChoice } from './captain-drill-dialogue.js';
import { generateGuardDialogue, applyGuardChoice } from './guard-watch-dialogue.js';
import { generateHealerDialogue, applyHealerChoice } from './healer-clinic-dialogue.js';
import { generateTeacherDialogue, applyTeacherChoice } from './teacher-lesson-dialogue.js';
import { generateInformantDialogue, applyInformantChoice } from './informant-dossier-dialogue.js';
import { generateStewardDialogue, applyStewardChoice } from './steward-rest-dialogue.js';
import { generateGardenHarvestDialogue, applyGardenHarvestChoice } from './garden-harvest-dialogue.js';
import { generateButcherDialogue, applyButcherChoice } from './butcher-smoke-dialogue.js';
import { generateRadioBroadcastDialogue, applyRadioBroadcastChoice } from './radio-broadcast-dialogue.js';
import { generateMerchantDialogue, applyMerchantChoice } from './merchant-deal-dialogue.js';
import { generateSmithDialogue, applySmithChoice } from './smith-sharpen-dialogue.js';
import { generatePriestVotiveDialogue, applyPriestVotiveChoice } from './priest-votive-dialogue.js';
import { generateMartaStewDialogue, applyMartaStewChoice } from './marta-stew-dialogue.js';
import { generateOlegLunchDialogue, applyOlegLunchChoice } from './oleg-lunch-dialogue.js';
import { generateBathOilDialogue, applyBathOilChoice } from './bath-oil-dialogue.js';
import { generateFisherNetsDialogue, applyFisherNetsChoice } from './fisher-nets-dialogue.js';
import { generateNoticePetitionDialogue, applyNoticePetitionChoice } from './notice-petition-dialogue.js';
import { generateBardEncoreDialogue, applyBardEncoreChoice } from './bard-encore-dialogue.js';
import { generateHqGateDialogue, applyHqGateChoice } from './hq-gate-dialogue.js';
import { generateApartmentBedDialogue, applyApartmentBedChoice } from './apartment-bed-dialogue.js';
import { generateApartmentFridgeDialogue, applyApartmentFridgeChoice } from './apartment-fridge-dialogue.js';
import { generateApartmentChestDialogue, applyApartmentChestChoice } from './apartment-chest-dialogue.js';
import { generateApartmentRackDialogue, applyApartmentRackChoice } from './apartment-rack-dialogue.js';
import { generateCitizenMarketDialogue, applyCitizenMarketChoice } from './citizen-market-dialogue.js';
import { generateCitizenPlazaDialogue, applyCitizenPlazaChoice } from './citizen-plaza-dialogue.js';
import { generateCitizenHarborDialogue, applyCitizenHarborChoice } from './citizen-harbor-dialogue.js';
import { generateCitizenCathedralDialogue, applyCitizenCathedralChoice } from './citizen-cathedral-dialogue.js';
import { generateCitizenCraftDialogue, applyCitizenCraftChoice } from './citizen-craft-dialogue.js';
import { generateCitizenTavernDialogue, applyCitizenTavernChoice } from './citizen-tavern-dialogue.js';
import { generateCitizenMilitiaDialogue, applyCitizenMilitiaChoice } from './citizen-militia-dialogue.js';
import { contentRoot } from './paths.js';
import type { DayNightService } from './day-night.js';
import { gateNpcInteract, NPC_CLOSED_MESSAGE } from './npc-schedule-gate.js';

interface NpcChoice {
  id: string;
  label: string;
  flag: string;
  nextNode?: string;
  blocks?: string[];
  portrait?: string;
}

interface NpcNode {
  text: string;
  choices: NpcChoice[];
  portrait?: string;
}

interface NpcConfig {
  dialogueMode?: 'authored' | 'generated';
  id: string;
  name: string;
  race: string;
  location: string;
  questId: string;
  defaultGreeting: string;
  portraits?: NpcPortraits;
  choices: NpcChoice[];
  nodes: Record<string, NpcNode>;
}

const npcConfigCache = new Map<string, NpcConfig>();

function loadLoreChunks(): string[] {
  const lorePath = join(contentRoot, 'lore/world.json');
  const data = JSON.parse(readFileSync(lorePath, 'utf8')) as Array<{ id: string; text: string }>;
  return data.map((item) => item.text);
}

function loadNpc(npcId: string): NpcConfig {
  if (!/^[a-z][a-z0-9_]*$/.test(npcId)) {
    throw new Error('Invalid NPC id');
  }
  const cached = npcConfigCache.get(npcId);
  if (cached) return cached;
  const path = join(contentRoot, `npcs/${npcId}.yaml`);
  const npc = parseYaml(readFileSync(path, 'utf8')) as NpcConfig;
  npcConfigCache.set(npcId, npc);
  return npc;
}

/** Tests / content hot-reload — discard parsed NPC YAML. */
export function clearDialogueContentCache(): void {
  npcConfigCache.clear();
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function filterChoices(choices: NpcChoice[], save: PlayerSave): NpcChoice[] {
  return choices.filter((choice) => {
    if (!choice.blocks?.length) return true;
    return !choice.blocks.some((flag) => hasFlag(save, flag));
  });
}

function cityDirectionMenu(returnChoice: NpcChoice): NpcChoice[] {
  return [
    ...HAVEN_CITY_DIRECTIONS.map((direction) => ({
      id: direction.id,
      label: direction.label,
      flag: `_city_${direction.id}`,
      portrait: 'happy',
    })),
    returnChoice,
  ];
}

function nodeResponse(npc: NpcConfig, nodeId: string, choice?: NpcChoice): DialogueResponse | null {
  const node = npc.nodes[nodeId];
  if (!node) return null;
  return withDialogueScene(npc, {
    text: node.text,
    choices: mapDialogueChoices(npc, node.choices),
    portrait: portraitForNode(npc, node, choice),
  });
}

function getMiraQuestDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_grove_complete')) {
    return withDialogueScene(npc, {
      text: 'Спасибо, герой. Роща снова спокойна. Бери награду — ты заслужил.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_betrayal_complete')) {
    return withDialogueScene(npc, {
      text: 'Торговцы довольны. Больше мы не имеем дел с этой старейшиной — и ты тоже.',
      choices: [],
      portrait: 'angry',
    });
  }

  if (hasFlag(save, 'quest_grove_active')) {
    const kills = Number(flags.quest_grove_kills ?? 0);
    if (kills >= 3) {
      return withDialogueScene(npc, {
        text: 'Пещера чиста. Роща дышит спокойнее — спасибо тебе.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: `Гоблины в пещере на востоке. Убито: ${kills}/3.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_betrayal_active')) {
    const kills = Number(flags.quest_betrayal_kills ?? 0);
    if (kills >= 2) {
      return withDialogueScene(npc, {
        text: 'Сделка закрыта. Роща знает цену — иди дальше.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: `Теневая роща на западе. Разберись с охраной торговцев: ${kills}/2.`,
      choices: [],
      portrait: 'serious',
    });
  }

  if (hasFlag(save, 'quest_grove_started') && !hasFlag(save, 'quest_grove_active')) {
    return nodeResponse(npc, 'send_to_cave');
  }

  if (hasFlag(save, 'quest_betrayal_started') && !hasFlag(save, 'quest_betrayal_active')) {
    return nodeResponse(npc, 'betray_path');
  }

  return null;
}

function getSilverwoodQuestDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_silverwood_complete')) {
    return withDialogueScene(npc, {
      text: 'Серебряный лес снова тих. Эльфы не забудут твою помощь.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_silverwood_active')) {
    const kills = Number(flags.quest_silverwood_kills ?? 0);
    if (kills >= 3) {
      return withDialogueScene(npc, {
        text: 'Опушка чиста. Лес помнит — иди дальше с лёгким шагом.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: `Тени на северной опушке. Убито: ${kills}/3.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_silverwood_started') && !hasFlag(save, 'quest_silverwood_active')) {
    return nodeResponse(npc, 'silverwood_brief');
  }

  return null;
}

function getCaptainDepthsDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_depths_boss_complete')) {
    return withDialogueScene(npc, {
      text: 'Пещеры тихи. Гавань в долгу перед тобой — носи добычу с честью.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_depths_boss_active')) {
    const kills = Number(flags.quest_depths_boss_kills ?? 0);
    if (kills >= 1) {
      return withDialogueScene(npc, {
        text: 'Пещеры тихи. Гавань в долгу перед тобой — носи добычу с честью.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: 'Владыка теней ждёт в сердце пещеры. Не геройствуй в одиночку без экипа.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_depths_purge_complete') && !hasFlag(save, 'quest_depths_boss_active')) {
    return withDialogueScene(npc, {
      text: 'Призраки рассеяны. Остался Владыка — один удар, одна жизнь. Готов?',
      choices: mapDialogueChoices(npc, [
        { id: 'depths_boss_go', label: 'Иду за головой владыки', flag: 'quest_depths_boss_active', portrait: 'action' },
      ]),
      portrait: 'serious',
    });
  }

  if (hasFlag(save, 'quest_depths_purge_active')) {
    const kills = Number(flags.quest_depths_purge_kills ?? 0);
    if (kills >= 3) {
      return withDialogueScene(npc, {
        text: 'Призраки рассеяны. Остался Владыка — один удар, одна жизнь. Готов?',
        choices: mapDialogueChoices(npc, [
          { id: 'depths_boss_go', label: 'Иду за головой владыки', flag: 'quest_depths_boss_active', portrait: 'action' },
        ]),
        portrait: 'serious',
      });
    }
    return withDialogueScene(npc, {
      text: `Глубинные призраки: ${kills}/3. Изгони их — и путь к владыке откроется.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_depths_clear_complete') && !hasFlag(save, 'quest_depths_purge_active')) {
    return withDialogueScene(npc, {
      text: 'Ловцы пали. Теперь — три глубинных призрака. Они любят верхние залы.',
      choices: mapDialogueChoices(npc, [
        { id: 'depths_purge_go', label: 'Принимаю приказ', flag: 'quest_depths_purge_active', portrait: 'action' },
      ]),
      portrait: 'serious',
    });
  }

  if (hasFlag(save, 'quest_depths_clear_active')) {
    const kills = Number(flags.quest_depths_clear_kills ?? 0);
    if (kills >= 4) {
      return withDialogueScene(npc, {
        text: 'Ловцы пали. Теперь — три глубинных призрака. Они любят верхние залы.',
        choices: mapDialogueChoices(npc, [
          { id: 'depths_purge_go', label: 'Принимаю приказ', flag: 'quest_depths_purge_active', portrait: 'action' },
        ]),
        portrait: 'serious',
      });
    }
    return withDialogueScene(npc, {
      text: `Пещерные ловцы: ${kills}/4. Жми T → Пещеры теней.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_depths_clear_started') && !hasFlag(save, 'quest_depths_clear_active')) {
    return nodeResponse(npc, 'depths_brief');
  }

  return null;
}

function getAshQuestDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_ash_complete')) {
    return withDialogueScene(npc, {
      text: 'Пепел принял тебя. Иди с честью — высокогорья за тобой.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_ash_active')) {
    const kills = Number(flags.quest_ash_kills ?? 0);
    if (kills >= 4) {
      return withDialogueScene(npc, {
        text: 'Пепел принял тебя. Иди с честью — высокогорья за тобой.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: `Мутанты у восточных скал. Убито: ${kills}/4.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_ash_started') && !hasFlag(save, 'quest_ash_active')) {
    return nodeResponse(npc, 'ash_brief');
  }

  return null;
}

function getRiftScoutDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_core_complete')) {
    return withDialogueScene(npc, {
      text: 'Ядро погасло — луч под контролем. Дальше на восток — Зона Искажения. Там Проводница Лира; моя линия здесь кончается.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_core_active')) {
    const kills = Number(flags.quest_core_kills ?? 0);
    if (kills >= 1) {
      return withDialogueScene(npc, {
        text: 'Ядро погасло — луч под контролем. Дальше на восток — Зона Искажения. Там Проводница Лира; моя линия здесь кончается.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: 'Статический колосс в Ядре Статики. За шпилем, восточные ворота. Не геройствуй вслепую.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_relay_complete') && !hasFlag(save, 'quest_core_active')) {
    return nodeResponse(npc, 'core_brief');
  }

  if (hasFlag(save, 'quest_relay_active')) {
    const kills = Number(flags.quest_relay_kills ?? 0);
    if (kills >= 4) {
      return nodeResponse(npc, 'core_brief');
    }
    return withDialogueScene(npc, {
      text: `Эхо-призраки: ${kills}/4. Релейный шпиль — за восточными воротами Квартала Сигнала.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_signal_complete') && !hasFlag(save, 'quest_relay_active')) {
    return nodeResponse(npc, 'relay_brief');
  }

  if (hasFlag(save, 'quest_signal_active')) {
    const kills = Number(flags.quest_signal_kills ?? 0);
    if (kills >= 5) {
      return nodeResponse(npc, 'relay_brief');
    }
    return withDialogueScene(npc, {
      text: `Дроны сбиты: ${kills}/5. Квартал Сигнала — за восточными воротами.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_signal_started') && !hasFlag(save, 'quest_signal_active')) {
    return nodeResponse(npc, 'signal_brief');
  }

  return null;
}

function getRiftGuideDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_scar_complete')) {
    return withDialogueScene(npc, {
      text: 'Левиафан пал. Дальше на восток — Окраина Коллапса. Там Провидица Эра; моя линия здесь кончается.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_scar_active')) {
    const kills = Number(flags.quest_scar_kills ?? 0);
    if (kills >= 1) {
      return withDialogueScene(npc, {
        text: 'Левиафан пал. Дальше на восток — Окраина Коллапса. Там Провидица Эра; моя линия здесь кончается.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: 'Шрам Пустоты — за восточными воротами Гребня. Левиафан на дне. Не стой в лужах пустоты.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_fold_complete') && !hasFlag(save, 'quest_scar_active')) {
    return nodeResponse(npc, 'scar_brief');
  }

  if (hasFlag(save, 'quest_fold_active')) {
    const kills = Number(flags.quest_fold_kills ?? 0);
    if (kills >= 5) {
      return nodeResponse(npc, 'scar_brief');
    }
    return withDialogueScene(npc, {
      text: `Ужасы складки: ${kills}/5. Гребень Разлома — за восточными воротами сектора.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_chaos_complete') && !hasFlag(save, 'quest_fold_active')) {
    return nodeResponse(npc, 'fold_brief');
  }

  if (hasFlag(save, 'quest_chaos_active')) {
    const kills = Number(flags.quest_chaos_kills ?? 0);
    if (kills >= 6) {
      return nodeResponse(npc, 'fold_brief');
    }
    return withDialogueScene(npc, {
      text: `Порождения искажения: ${kills}/6. Держись троп у трещин — они любят края карты.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_chaos_started') && !hasFlag(save, 'quest_chaos_active')) {
    return nodeResponse(npc, 'chaos_brief');
  }

  return null;
}

function getGodsOracleDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_epilogue_claimed')) {
    return withDialogueScene(npc, {
      text: 'Память Разлома у тебя. Мир не стал добрее — но линия богов оборвана. Когда снова позовёт пустота — ты уже знаешь цену.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_throne_complete')) {
    return withDialogueScene(npc, {
      text: 'Владыка пал. Пантеон молчит. Осталось принять память Разлома — печать того, что ты закрыл эту линию.',
      choices: mapDialogueChoices(npc, [
        {
          id: 'epilogue_claim',
          label: 'Принять память Разлома',
          flag: 'quest_epilogue_claimed',
          portrait: 'action',
        },
      ]),
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_throne_active')) {
    const kills = Number(flags.quest_throne_kills ?? 0);
    if (kills >= 1) {
      return withDialogueScene(npc, {
        text: 'Владыка пал. Пантеон молчит. Осталось принять память Разлома — печать того, что ты закрыл эту линию.',
        choices: mapDialogueChoices(npc, [
          {
            id: 'epilogue_claim',
            label: 'Принять память Разлома',
            flag: 'quest_epilogue_claimed',
            portrait: 'action',
          },
        ]),
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: 'Трон Падения — за восточными воротами Подъёма. Владыка у пустого трона. Не стой в центре зала вслепую.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_ascent_complete') && !hasFlag(save, 'quest_throne_active')) {
    return nodeResponse(npc, 'throne_brief');
  }

  if (hasFlag(save, 'quest_ascent_active')) {
    const kills = Number(flags.quest_ascent_kills ?? 0);
    if (kills >= 5) {
      return nodeResponse(npc, 'throne_brief');
    }
    return withDialogueScene(npc, {
      text: `Стражи Пантеона: ${kills}/5. Подъём — за восточными воротами Разлома.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_gods_complete') && !hasFlag(save, 'quest_ascent_active')) {
    return nodeResponse(npc, 'ascent_brief');
  }

  if (hasFlag(save, 'quest_gods_active')) {
    const kills = Number(flags.quest_gods_kills ?? 0);
    if (kills >= 6) {
      return nodeResponse(npc, 'ascent_brief');
    }
    return withDialogueScene(npc, {
      text: `Божественные эхо: ${kills}/6. Они сгущаются у золотых трещин и восточного горизонта.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_gods_started') && !hasFlag(save, 'quest_gods_active')) {
    return nodeResponse(npc, 'gods_brief');
  }

  return null;
}

function getCollapseSeerDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  const flags = save.questFlags;

  if (hasFlag(save, 'quest_citadel_complete')) {
    return withDialogueScene(npc, {
      text: 'Аватар пал. Дальше на восток — Разлом Богов. Там Оракул Никс; моя линия здесь кончается.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'complete'),
    });
  }

  if (hasFlag(save, 'quest_citadel_active')) {
    const kills = Number(flags.quest_citadel_kills ?? 0);
    if (kills >= 1) {
      return withDialogueScene(npc, {
        text: 'Аватар пал. Дальше на восток — Разлом Богов. Там Оракул Никс; моя линия здесь кончается.',
        choices: [],
        portrait: questStatePortrait(npc.id, 'complete'),
      });
    }
    return withDialogueScene(npc, {
      text: 'Цитадель Сингулярности — за восточными воротами Подступов. Аватар в тронном зале. Не стой в центре зала вслепую.',
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_siege_complete') && !hasFlag(save, 'quest_citadel_active')) {
    return nodeResponse(npc, 'citadel_brief');
  }

  if (hasFlag(save, 'quest_siege_active')) {
    const kills = Number(flags.quest_siege_kills ?? 0);
    if (kills >= 5) {
      return nodeResponse(npc, 'citadel_brief');
    }
    return withDialogueScene(npc, {
      text: `Осадные призраки: ${kills}/5. Подступы — за восточными воротами окраины.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_collapse_complete') && !hasFlag(save, 'quest_siege_active')) {
    return nodeResponse(npc, 'siege_brief');
  }

  if (hasFlag(save, 'quest_collapse_active')) {
    const kills = Number(flags.quest_collapse_kills ?? 0);
    if (kills >= 6) {
      return nodeResponse(npc, 'siege_brief');
    }
    return withDialogueScene(npc, {
      text: `Осколки коллапса: ${kills}/6. Они сыплются у трещин и восточного горизонта.`,
      choices: [],
      portrait: questStatePortrait(npc.id, 'active'),
    });
  }

  if (hasFlag(save, 'quest_collapse_started') && !hasFlag(save, 'quest_collapse_active')) {
    return nodeResponse(npc, 'collapse_brief');
  }

  return null;
}

function getNpcQuestDialogue(npc: NpcConfig, save: PlayerSave): DialogueResponse | null {
  switch (npc.id) {
    case 'elder_mira':
      return getMiraQuestDialogue(npc, save);
    case 'silvan_hermit':
      return getSilverwoodQuestDialogue(npc, save);
    case 'ash_shaman':
      return getAshQuestDialogue(npc, save);
    case 'town_captain':
      return getCaptainDepthsDialogue(npc, save);
    case 'rift_scout':
      return getRiftScoutDialogue(npc, save);
    case 'rift_guide':
      return getRiftGuideDialogue(npc, save);
    case 'collapse_seer':
      return getCollapseSeerDialogue(npc, save);
    case 'gods_oracle':
      return getGodsOracleDialogue(npc, save);
    default:
      return null;
  }
}

function followUpFromNode(npc: NpcConfig, node: NpcNode, choice?: NpcChoice): DialogueResponse {
  return withDialogueScene(npc, {
    text: node.text,
    choices: mapDialogueChoices(npc, node.choices),
    portrait: portraitForNode(npc, node, choice),
  });
}

export interface ChoiceResult {
  save: PlayerSave;
  followUp?: DialogueResponse;
  townMessage?: string;
}

export class DialogueService {
  private readonly rag: LoreRAG;

  constructor(
    private readonly llm: LlamaStack,
    private readonly dayNight?: DayNightService,
  ) {
    this.rag = new LoreRAG(llm, loadLoreChunks());
  }

  private proximityScheduleGate(npcId: string, save: PlayerSave) {
    if (!this.dayNight) return null;
    return gateNpcInteract(this.dayNight, npcId, save.location);
  }

  private worldHour(): number | undefined {
    return this.dayNight?.snapshot().hour;
  }

  private withCitizenNightVoice(
    npc: { id: string },
    save: PlayerSave,
    res: DialogueResponse,
  ): DialogueResponse {
    const night = citizenNightGreeting(npc.id, this.worldHour());
    if (!night) return res;
    const formatted = formatCitizenGreeting(night, save);
    return {
      ...res,
      text: formatted.text,
      portrait: formatted.mood !== 'neutral' ? formatted.mood : res.portrait,
    };
  }

  async generate(input: {
    npcId: string;
    save: PlayerSave;
    playerMessage?: string;
    channel?: 'proximity' | 'radio';
  }): Promise<DialogueResponse> {
    const npc = loadNpc(input.npcId);

    if (input.channel !== 'radio') {
      const scheduleGate = this.proximityScheduleGate(input.npcId, input.save);
      if (scheduleGate && !scheduleGate.ok) {
        const exitLabel =
          scheduleGate.phase === 'walking_to_post'
            ? 'Хорошего дня.'
            : scheduleGate.phase === 'walking_home'
              ? 'Доброй ночи, не буду задерживать.'
              : 'Понятно.';
        return withDialogueScene(npc, {
          text: scheduleGate.message,
          choices: mapDialogueChoices(npc, [
            { id: 'walk_bye', label: exitLabel, flag: '_walk_bye', portrait: 'neutral' },
          ]),
          portrait: scheduleGate.phase === 'walking_to_post' ? 'happy' : 'neutral',
        });
      }
    }

    const questDialogue = getNpcQuestDialogue(npc, input.save);
    if (questDialogue) return questDialogue;

    const millerDialogue = generateMillerDialogue(npc, input.save);
    if (millerDialogue) return millerDialogue;
    const stableDialogue = generateStableDialogue(npc, input.save);
    if (stableDialogue) return stableDialogue;
    const brewerDialogue = generateBrewerDialogue(npc, input.save);
    if (brewerDialogue) return brewerDialogue;
    const scribeDialogue = generateScribeDialogue(npc, input.save);
    if (scribeDialogue) return scribeDialogue;
    const dockDialogue = generateDockDialogue(npc, input.save);
    if (dockDialogue) return dockDialogue;
    const captainDialogue = generateCaptainDialogue(npc, input.save);
    if (captainDialogue) return captainDialogue;
    const guardDialogue = generateGuardDialogue(npc, input.save);
    if (guardDialogue) return guardDialogue;
    const healerDialogue = generateHealerDialogue(npc, input.save);
    if (healerDialogue) return healerDialogue;
    const teacherDialogue = generateTeacherDialogue(npc, input.save);
    if (teacherDialogue) return teacherDialogue;
    const informantDialogue = generateInformantDialogue(npc, input.save);
    if (informantDialogue) return informantDialogue;
    const stewardDialogue = generateStewardDialogue(npc, input.save);
    if (stewardDialogue) return stewardDialogue;
    const gardenHarvest = generateGardenHarvestDialogue(npc, input.save);
    if (gardenHarvest) return gardenHarvest;
    const butcherDialogue = generateButcherDialogue(npc, input.save);
    if (butcherDialogue) return butcherDialogue;
    const radioDialogue = generateRadioBroadcastDialogue(npc, input.save);
    if (radioDialogue) return radioDialogue;
    const merchantDialogue = generateMerchantDialogue(npc, input.save);
    if (merchantDialogue) return merchantDialogue;
    const smithDialogue = generateSmithDialogue(npc, input.save);
    if (smithDialogue) return smithDialogue;
    const priestVotive = generatePriestVotiveDialogue(npc, input.save);
    if (priestVotive) return priestVotive;
    const martaStew = generateMartaStewDialogue(npc, input.save);
    if (martaStew) return martaStew;
    const olegLunch = generateOlegLunchDialogue(npc, input.save);
    if (olegLunch) return olegLunch;
    const bathOil = generateBathOilDialogue(npc, input.save);
    if (bathOil) return bathOil;
    const fisherNets = generateFisherNetsDialogue(npc, input.save);
    if (fisherNets) return fisherNets;
    const noticePetition = generateNoticePetitionDialogue(npc, input.save);
    if (noticePetition) return noticePetition;
    const bardEncore = generateBardEncoreDialogue(npc, input.save);
    if (bardEncore) return bardEncore;
    const hqGate = generateHqGateDialogue(npc, input.save);
    if (hqGate) return hqGate;
    const aptBed = generateApartmentBedDialogue(npc, input.save);
    if (aptBed) return aptBed;
    const aptFridge = generateApartmentFridgeDialogue(npc, input.save);
    if (aptFridge) return aptFridge;
    const aptChest = generateApartmentChestDialogue(npc, input.save);
    if (aptChest) return aptChest;
    const aptRack = generateApartmentRackDialogue(npc, input.save);
    if (aptRack) return aptRack;
    const citizenRes =
      generateCitizenMarketDialogue(npc, input.save) ??
      generateCitizenPlazaDialogue(npc, input.save) ??
      generateCitizenHarborDialogue(npc, input.save) ??
      generateCitizenCathedralDialogue(npc, input.save) ??
      generateCitizenCraftDialogue(npc, input.save) ??
      generateCitizenTavernDialogue(npc, input.save) ??
      generateCitizenMilitiaDialogue(npc, input.save);
    if (citizenRes) return this.withCitizenNightVoice(npc, input.save, citizenRes);

    if (input.npcId.startsWith('haven_citizen_')) {
      const base = citizenNightGreeting(npc.id, this.worldHour()) ?? npc.defaultGreeting;
      const formatted = formatCitizenGreeting(base, input.save);
      return withDialogueScene(npc, {
        text: formatted.text,
        choices: mapDialogueChoices(npc, filterChoices(npc.choices, input.save)),
        portrait: formatted.mood !== 'neutral' ? formatted.mood : 'neutral',
      });
    }

    if (input.npcId === 'town_hq_receptionist') {
      if (!input.playerMessage) {
        return withDialogueScene(npc, {
          text: npc.defaultGreeting,
          choices: mapDialogueChoices(npc, filterChoices(npc.choices, input.save)),
          portrait: 'neutral',
        });
      }
    }

    if (input.npcId === 'town_hq_researcher') {
      if (!input.playerMessage) {
        const flags = input.save.questFlags;
        const choices = (npc.choices ?? []).filter((c) => {
          if (c.id === 'hq_research_accept') return !flags[HQ_LAB_COMPLETE_FLAG] && !flags[HQ_LAB_ACTIVE_FLAG];
          if (c.id === 'hq_research_submit') return Boolean(flags[HQ_LAB_ACTIVE_FLAG]) && !flags[HQ_LAB_COMPLETE_FLAG];
          return true;
        });
        let text = npc.defaultGreeting;
        if (flags[HQ_LAB_COMPLETE_FLAG]) {
          text = 'Матрица работает в штатном режиме. Спасибо за образец, коллега. Готовим следующие серии испытаний.';
        } else if (flags[HQ_LAB_ACTIVE_FLAG]) {
          text = 'Ожидаю стабилизирующий компонент (фильтр, батарейный блок или лепесток разлома).';
        }
        return withDialogueScene(npc, {
          text,
          choices: mapDialogueChoices(npc, choices),
          portrait: flags[HQ_LAB_COMPLETE_FLAG] ? 'happy' : 'neutral',
        });
      }
    }

    if (input.npcId === 'town_hq_terminal') {
      if (!input.playerMessage) {
        const flags = input.save.questFlags;
        const choices = (npc.choices ?? []).filter((c) => {
          if (c.id === 'hq_term_reboot') return Boolean(flags[HQ_LAB_COMPLETE_FLAG]);
          return true;
        });
        return withDialogueScene(npc, {
          text: npc.defaultGreeting,
          choices: mapDialogueChoices(npc, choices),
          portrait: 'neutral',
        });
      }
    }

    if (npc.dialogueMode === 'authored' && !input.playerMessage) {
      return withDialogueScene(npc, {
        text: npc.defaultGreeting,
        choices: mapDialogueChoices(npc, filterChoices(npc.choices, input.save)),
        portrait: 'neutral',
      });
    }

    const query = input.playerMessage ?? npc.defaultGreeting;
    const lore = await this.rag.retrieve(`${query} (race: ${input.save.race})`, 3);

    const systemPrompt = [
      'Ты NPC в dark-fantasy action RPG.',
      `Имя NPC: ${npc.name}. Локация: ${npc.location}.`,
      `Игрок: ${input.save.name}, раса ${input.save.race}.`,
      lore.length > 0 ? `Контекст:\n${lore.join('\n')}` : '',
      'Ответь 2-4 предложениями, без markdown.',
    ]
      .filter(Boolean)
      .join('\n');

    let text: string;
    try {
      text = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        256,
      );
    } catch {
      text = npc.defaultGreeting;
    }

    let choices = filterChoices(npc.choices, input.save);
    if (
      npc.id === 'town_captain' &&
      !hasFlag(input.save, 'quest_grove_complete') &&
      !hasFlag(input.save, 'quest_betrayal_complete')
    ) {
      choices = choices.filter((c) => c.id !== 'captain_depths');
    }

    return withDialogueScene(npc, {
      text,
      choices: mapDialogueChoices(npc, choices),
    });
  }

  applyChoice(
    save: PlayerSave,
    npcId: string,
    choiceId: string,
    opts?: { channel?: 'proximity' | 'radio' },
  ): ChoiceResult {
    if (choiceId === 'walk_bye') {
      return { save };
    }
    const npc = loadNpc(npcId);
    if (opts?.channel !== 'radio') {
      const scheduleGate = this.proximityScheduleGate(npcId, save);
      if (scheduleGate && !scheduleGate.ok) {
        return {
          save,
          townMessage: NPC_CLOSED_MESSAGE,
          followUp: withDialogueScene(npc, {
            text: NPC_CLOSED_MESSAGE,
            choices: [],
            portrait: 'neutral',
          }),
        };
      }
    }

    const miller = applyMillerChoice(save, npc, choiceId);
    if (miller) return miller;
    const stableCare = applyStableChoice(save, npc, choiceId);
    if (stableCare) return stableCare;
    const brewer = applyBrewerChoice(save, npc, choiceId);
    if (brewer) return brewer;
    const scribeApplied = applyScribeChoice(npc, save, choiceId);
    if (scribeApplied) return scribeApplied;
    const dockChoice = applyDockChoice(npc, save, choiceId);
    if (dockChoice) return dockChoice;
    const captain = applyCaptainChoice(save, npc, choiceId);
    if (captain) return captain;
    const guard = applyGuardChoice(save, npc, choiceId);
    if (guard) return guard;
    const healerClinic = applyHealerChoice(npc, save, choiceId);
    if (healerClinic) return healerClinic;
    const teacherApplied = applyTeacherChoice(save, npc, choiceId);
    if (teacherApplied) return teacherApplied;
    const informantApplied = applyInformantChoice(npc, save, choiceId);
    if (informantApplied) return informantApplied;
    const stewardRest = applyStewardChoice(npc, save, choiceId);
    if (stewardRest) return stewardRest;
    const gardenHarvestChoice = applyGardenHarvestChoice(npc, save, choiceId);
    if (gardenHarvestChoice) return gardenHarvestChoice;
    const butcher = applyButcherChoice(save, npc, choiceId);
    if (butcher) return butcher;
    const radioBroadcast = applyRadioBroadcastChoice(npc, save, choiceId);
    if (radioBroadcast) return radioBroadcast;
    const merchant = applyMerchantChoice(save, npc, choiceId);
    if (merchant) return merchant;
    const smith = applySmithChoice(npc, save, choiceId);
    if (smith) return smith;
    const priestVotiveApplied = applyPriestVotiveChoice(npc, save, choiceId);
    if (priestVotiveApplied) return priestVotiveApplied;
    const martaStewApplied = applyMartaStewChoice(npc, save, choiceId);
    if (martaStewApplied) return martaStewApplied;
    const olegLunchApplied = applyOlegLunchChoice(npc, save, choiceId);
    if (olegLunchApplied) return olegLunchApplied;
    const bathOilApplied = applyBathOilChoice(npc, save, choiceId);
    if (bathOilApplied) return bathOilApplied;
    const fisherNetsApplied = applyFisherNetsChoice(npc, save, choiceId);
    if (fisherNetsApplied) return fisherNetsApplied;
    const noticePetitionApplied = applyNoticePetitionChoice(npc, save, choiceId);
    if (noticePetitionApplied) return noticePetitionApplied;
    const bardEncoreApplied = applyBardEncoreChoice(npc, save, choiceId);
    if (bardEncoreApplied) return bardEncoreApplied;
    const hqGateApplied = applyHqGateChoice(npc, save, choiceId);
    if (hqGateApplied) return hqGateApplied;
    const aptBedApplied = applyApartmentBedChoice(npc, save, choiceId);
    if (aptBedApplied) return aptBedApplied;
    const aptFridgeApplied = applyApartmentFridgeChoice(npc, save, choiceId);
    if (aptFridgeApplied) return aptFridgeApplied;
    const aptChestApplied = applyApartmentChestChoice(npc, save, choiceId);
    if (aptChestApplied) return aptChestApplied;
    const aptRackApplied = applyApartmentRackChoice(npc, save, choiceId);
    if (aptRackApplied) return aptRackApplied;
    const citizenMarketApplied = applyCitizenMarketChoice(npc, save, choiceId);
    if (citizenMarketApplied) return citizenMarketApplied;
    const citizenPlazaApplied = applyCitizenPlazaChoice(npc, save, choiceId);
    if (citizenPlazaApplied) return citizenPlazaApplied;
    const citizenHarborApplied = applyCitizenHarborChoice(npc, save, choiceId);
    if (citizenHarborApplied) return citizenHarborApplied;
    const citizenCathedralApplied = applyCitizenCathedralChoice(npc, save, choiceId);
    if (citizenCathedralApplied) return citizenCathedralApplied;
    const citizenCraftApplied = applyCitizenCraftChoice(npc, save, choiceId);
    if (citizenCraftApplied) return citizenCraftApplied;
    const citizenTavernApplied = applyCitizenTavernChoice(npc, save, choiceId);
    if (citizenTavernApplied) return citizenTavernApplied;
    const citizenMilitiaApplied = applyCitizenMilitiaChoice(npc, save, choiceId);
    if (citizenMilitiaApplied) return citizenMilitiaApplied;

    if (npcId === 'gods_oracle' && choiceId === 'epilogue_claim') {
      if (save.questFlags.quest_epilogue_claimed) {
        return {
          save,
          followUp: withDialogueScene(npc, {
            text: 'Память Разлома уже у тебя.',
            choices: [],
            portrait: questStatePortrait(npc.id, 'complete'),
          }),
        };
      }
      const throneDone =
        Boolean(save.questFlags.quest_throne_complete) ||
        (Boolean(save.questFlags.quest_throne_active) &&
          Number(save.questFlags.quest_throne_kills ?? 0) >= 1);
      if (!throneDone) return { save };

      const rewarded = appendItemsToSave(save, [
        'resurrection_scroll',
        'resurrection_scroll',
        ...(save.inventory.includes('starfall_fang') ? [] : ['starfall_fang']),
      ]);
      const next: PlayerSave = {
        ...rewarded,
        adena: (save.adena ?? 0) + 75_000,
        questFlags: {
          ...save.questFlags,
          quest_throne_complete: true,
          quest_throne_active: false,
          quest_epilogue_claimed: true,
        },
      };
      return {
        save: next,
        townMessage: 'Память Разлома: +75000 adena, трофей и свитки.',
        followUp: withDialogueScene(npc, {
          text: 'Память Разлома принята. Мир не стал добрее — но линия богов оборвана. Носи это с честью.',
          choices: [],
          portrait: questStatePortrait(npc.id, 'complete'),
        }),
      };
    }

    const shopItem = merchantChoiceToItem(choiceId);
    if (npcId === 'town_merchant' && shopItem) {
      const result = buyFromMerchant(save, shopItem);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: [],
          portrait: result.ok ? 'happy' : 'neutral',
        }),
      };
    }
    if (npcId === 'town_merchant' && choiceId === 'browse_done') {
      return { save };
    }

    if (
      (npcId === 'town_innkeeper' || npcId === 'town_innkeeper_day') &&
      choiceId === 'inn_rest'
    ) {
      const result = restAtInn(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: [],
          portrait: result.ok ? 'happy' : 'neutral',
        }),
      };
    }
    if (
      (npcId === 'town_innkeeper' || npcId === 'town_innkeeper_day') &&
      choiceId === 'inn_leave'
    ) {
      return { save };
    }

    if (npcId === 'town_informant' && (choiceId === 'rumor_latest' || choiceId === 'rumor_shady')) {
      const pool = choiceId === 'rumor_shady' ? getShadyRumors() : getLatestRumors();
      const rumor = pool[Math.floor(Math.random() * pool.length)] ?? 'В городе подозрительно тихо...';
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: rumor,
          choices: [],
          portrait: choiceId === 'rumor_shady' ? 'happy' : 'neutral',
        }),
      };
    }
    if (npcId === 'town_informant' && choiceId === 'rumor_leave') {
      return { save };
    }

    if (npcId === 'town_gardener' && choiceId === 'garden_accept') {
      const result = acceptGardenQuest(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: [],
          portrait: result.ok ? 'happy' : 'neutral',
        }),
      };
    }
    if (npcId === 'town_gardener' && choiceId === 'garden_water') {
      const result = waterGardenBeds(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: [],
          portrait: result.ok ? 'happy' : 'serious',
        }),
      };
    }
    if (npcId === 'town_gardener' && choiceId === 'garden_leave') {
      return { save };
    }

    if (npcId === 'town_hq_sentry' && choiceId === 'hq_verify_credentials') {
      const qualified =
        hasFlag(save, 'quest_grove_complete') ||
        hasFlag(save, 'quest_depths_boss_complete') ||
        (save.level ?? 1) >= 5;
      if (!qualified) {
        return {
          save,
          followUp: withDialogueScene(npc, {
            text: 'Запрос отклонён. Статус в системе: неизвестный бродяга. Сначала помоги Гавани или заверши испытание в Роще.',
            choices: [],
            portrait: 'serious',
          }),
        };
      }
      const next: PlayerSave = {
        ...save,
        questFlags: {
          ...save.questFlags,
          quest_empery_hq_access: true,
        },
      };
      return {
        save: next,
        townMessage: 'Допуск EmperyWorld HQ получен! Ворота открыты.',
        followUp: withDialogueScene(npc, {
          text: 'Биометрия подтверждена. Статус: признанный герой Гавани. Допуск первого уровня активирован — ворота открыты, проходи.',
          choices: mapDialogueChoices(npc, [
            { id: 'hq_leave', label: 'Спасибо.', flag: '_hq_done', portrait: 'happy' },
          ]),
          portrait: 'happy',
        }),
      };
    }

    if (npcId === 'town_hq_researcher' && choiceId === 'hq_research_accept') {
      const result = acceptHqLabQuest(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: mapDialogueChoices(npc, [
            { id: 'hq_research_leave', label: 'Принято.', flag: '_hq_res_done', portrait: 'neutral' },
          ]),
          portrait: 'work',
        }),
      };
    }
    if (npcId === 'town_hq_researcher' && choiceId === 'hq_research_submit') {
      const result = submitHqLabComponent(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: mapDialogueChoices(npc, [
            { id: 'hq_research_leave', label: 'Отлично.', flag: '_hq_res_done', portrait: 'happy' },
          ]),
          portrait: result.ok ? 'happy' : 'serious',
        }),
      };
    }
    if (npcId === 'town_hq_researcher' && choiceId === 'hq_research_about') {
      const node = npc.nodes?.hq_research_about_node;
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: node?.text ?? 'Мы изучаем резонанс Аномалий.',
          choices: mapDialogueChoices(npc, node?.choices ?? []),
          portrait: 'neutral',
        }),
      };
    }
    if (npcId === 'town_hq_researcher' && choiceId === 'hq_research_leave') {
      return { save };
    }

    if (npcId === 'town_hq_terminal' && choiceId === 'hq_term_telemetry') {
      const node = npc.nodes?.node_telemetry;
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: node?.text ?? '[ОТЧЁТ ДАТЧИКОВ]: Показатели в норме.',
          choices: mapDialogueChoices(npc, node?.choices ?? []),
          portrait: 'neutral',
        }),
      };
    }
    if (npcId === 'town_hq_terminal' && choiceId === 'hq_term_archives') {
      const node = npc.nodes?.node_archives;
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: node?.text ?? '[АРХИВ]: Доступ открыт.',
          choices: mapDialogueChoices(npc, node?.choices ?? []),
          portrait: 'neutral',
        }),
      };
    }
    if (npcId === 'town_hq_terminal' && choiceId === 'hq_term_reboot') {
      const result = rebootHqBiofield(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: mapDialogueChoices(npc, [
            { id: 'hq_term_leave', label: 'Принято.', flag: '_hq_term_done', portrait: 'neutral' },
          ]),
          portrait: result.ok ? 'happy' : 'serious',
        }),
      };
    }
    if (npcId === 'town_hq_terminal' && choiceId === 'hq_term_leave') {
      return { save };
    }

    if (npcId === 'town_notice_board' && choiceId === 'board_bounty_accept') {
      const result = acceptBoardBounty(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: mapDialogueChoices(npc, [
            { id: 'board_leave', label: 'Принято к исполнению.', flag: '_board_done', portrait: 'neutral' },
          ]),
          portrait: 'serious',
        }),
      };
    }
    if (npcId === 'town_notice_board' && choiceId === 'board_bounty_claim') {
      const result = claimBoardBounty(save);
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: mapDialogueChoices(npc, [
            { id: 'board_leave', label: 'Отлично.', flag: '_board_done', portrait: 'happy' },
          ]),
          portrait: result.ok ? 'happy' : 'serious',
        }),
      };
    }
    if (npcId === 'town_notice_board' && choiceId === 'board_news') {
      const news = formatBoardNews();
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: news,
          choices: mapDialogueChoices(npc, [
            { id: 'board_leave', label: 'Завершить чтение.', flag: '_board_done', portrait: 'neutral' },
          ]),
          portrait: 'neutral',
        }),
      };
    }
    if (npcId.startsWith('haven_citizen_')) {
      if (choiceId === 'citizen_rumors') {
        const text = getCitizenRumors(npcId, this.worldHour());
        return {
          save,
          followUp: withDialogueScene(npc, {
            text,
            choices: mapDialogueChoices(npc, [
              { id: 'citizen_advice', label: 'Что посоветуешь страннику?', flag: '_cit_advice', portrait: 'happy' },
              { id: 'citizen_directions', label: 'Подскажи дорогу в городе', flag: '_cit_directions', portrait: 'neutral' },
              { id: 'citizen_leave', label: 'Спасибо за весть, пойду дальше.', flag: '_cit_done', portrait: 'neutral' },
            ]),
            portrait: 'serious',
          }),
        };
      }
      if (choiceId === 'citizen_advice') {
        const text = getCitizenAdvice(npcId, this.worldHour());
        return {
          save,
          followUp: withDialogueScene(npc, {
            text,
            choices: mapDialogueChoices(npc, [
              { id: 'citizen_directions', label: 'Подскажи дорогу в городе', flag: '_cit_directions', portrait: 'happy' },
              { id: 'citizen_rumors', label: 'А какие слухи в этом квартале?', flag: '_cit_rumors', portrait: 'neutral' },
              { id: 'citizen_leave', label: 'Дельный совет, благодарю!', flag: '_cit_done', portrait: 'happy' },
            ]),
            portrait: 'happy',
          }),
        };
      }
      if (choiceId === 'citizen_directions') {
        return {
          save,
          followUp: withDialogueScene(npc, {
            text: 'Куда тебе нужно пройти, путник? В Гавани легко заблудиться, если не знать ориентиров.',
            choices: mapDialogueChoices(
              npc,
              cityDirectionMenu({
                id: 'citizen_leave',
                label: 'Спасибо, сам разберусь.',
                flag: '_cit_done',
                portrait: 'neutral',
              }),
            ),
            portrait: 'happy',
          }),
        };
      }
      if (choiceId === 'citizen_leave') {
        return { save };
      }
    }

    if (npcId === 'town_notice_board' && choiceId === 'board_guide') {
      const node = npc.nodes?.node_guide;
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: node?.text ?? '[ПУТЕВОДИТЕЛЬ]: Карта районов Гавани.',
          choices: mapDialogueChoices(
            npc,
            cityDirectionMenu({
              id: 'board_leave',
              label: 'Завершить чтение карты.',
              flag: '_board_done',
              portrait: 'neutral',
            }),
          ),
          portrait: 'neutral',
        }),
      };
    }
    if (
      choiceId.startsWith('dir_') &&
      (npcId.startsWith('haven_citizen_') || npcId === 'town_notice_board')
    ) {
      const direction = getCityDirection(choiceId);
      const board = npcId === 'town_notice_board';
      return {
        save,
        followUp: withDialogueScene(npc, {
          text: direction?.text ?? 'Этот маршрут на карте не отмечен.',
          choices: mapDialogueChoices(
            npc,
            board
              ? [
                  {
                    id: 'board_guide',
                    label: 'Выбрать другой маршрут.',
                    flag: '_board_guide',
                    portrait: 'neutral',
                  },
                  {
                    id: 'board_leave',
                    label: 'Убрать карту.',
                    flag: '_board_done',
                    portrait: 'neutral',
                  },
                ]
              : [
                  {
                    id: 'citizen_directions',
                    label: 'А как пройти в другое место?',
                    flag: '_cit_directions',
                    portrait: 'happy',
                  },
                  {
                    id: 'citizen_rumors',
                    label: 'А какие слухи в этом квартале?',
                    flag: '_cit_rumors',
                    portrait: 'neutral',
                  },
                  {
                    id: 'citizen_leave',
                    label: 'Благодарю за помощь!',
                    flag: '_cit_done',
                    portrait: 'happy',
                  },
                ],
          ),
          portrait: 'happy',
          navigationTarget: direction
            ? {
                locationId: 'empery_haven',
                x: direction.target.x,
                y: direction.target.y,
                label: direction.target.label,
              }
            : undefined,
        }),
      };
    }
    if (npcId === 'town_notice_board' && choiceId === 'board_leave') {
      return { save };
    }

    if (npcId === 'town_priest') {
      if (choiceId === 'priest_bless') {
        const result = requestCathedralBlessing(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'priest_leave', label: 'Благодарю, отче.', flag: '_priest_done', portrait: 'happy' },
            ]),
            portrait: 'happy',
          }),
        };
      }
      if (choiceId === 'priest_confess') {
        const result = confessAtCathedral(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'priest_leave', label: 'Аминь.', flag: '_priest_done', portrait: result.ok ? 'happy' : 'serious' },
            ]),
            portrait: result.ok ? 'happy' : 'serious',
          }),
        };
      }
      if (choiceId === 'priest_leave') {
        return { save };
      }
    }

    if (npcId === 'town_bathkeeper') {
      if (choiceId === 'bath_session') {
        const result = takeBathSession(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'bath_leave', label: 'С лёгким паром!', flag: '_bath_done', portrait: 'happy' },
            ]),
            portrait: result.ok ? 'happy' : 'serious',
          }),
        };
      }
      if (choiceId === 'bath_tea') {
        const result = buyBathTea(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'bath_leave', label: 'Спасибо.', flag: '_bath_done', portrait: 'happy' },
            ]),
            portrait: result.ok ? 'happy' : 'serious',
          }),
        };
      }
      if (choiceId === 'bath_leave') {
        return { save };
      }
    }

    if (npcId === 'town_fisher') {
      if (choiceId === 'fisher_quest_start') {
        const result = startFishDeliveryQuest(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'fisher_leave', label: 'Я доставлю улов.', flag: '_fisher_done', portrait: 'happy' },
            ]),
            portrait: result.ok ? 'happy' : 'serious',
          }),
        };
      }
      if (choiceId === 'fisher_quest_claim') {
        const result = claimFishDeliveryReward(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'fisher_leave', label: 'Спасибо за награду!', flag: '_fisher_done', portrait: 'happy' },
            ]),
            portrait: result.ok ? 'happy' : 'serious',
          }),
        };
      }
      if (choiceId === 'fisher_leave') {
        return { save };
      }
    }

    if (npcId === 'stage_bard') {
      if (choiceId === 'bard_buff') {
        const result = requestBardInspiration(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'bard_leave', label: 'Благодарю за песнь!', flag: '_bard_done', portrait: 'happy' },
            ]),
            portrait: 'happy',
          }),
        };
      }
      if (choiceId === 'bard_song_custom') {
        const result = requestBardInspiration(save);
        const verse = '«Пусть ветер в спину страннику поёт, клинок не подведёт, огонь не обожжёт. За горизонтом — слава или бой, но город встретит странника домой!»';
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: `Бард Кай ударяет по струнам и звонко поёт:\n\n${verse}\n\n[+25 к скорости бега, +12% к скорости атаки, +10 MP/с на 15 мин]`,
            choices: mapDialogueChoices(npc, [
              { id: 'bard_leave', label: 'Браво, Кай!', flag: '_bard_done', portrait: 'sing' },
            ]),
            portrait: 'sing',
          }),
        };
      }
      if (choiceId === 'bard_leave') {
        return { save };
      }
    }

    if (npcId === 'town_innkeeper' || npcId === 'town_innkeeper_day') {
      if (choiceId === 'inn_dice_10' || choiceId === 'inn_dice_25' || choiceId === 'inn_dice_50') {
        const bet = choiceId === 'inn_dice_10' ? 10 : choiceId === 'inn_dice_25' ? 25 : 50;
        const result = playHavenDice(save, bet);
        const diceChoices = [
          { id: 'inn_dice_10', label: 'Бросить на 10 адены', flag: '_inn_dice_10', portrait: 'happy' },
          { id: 'inn_dice_25', label: 'Бросить на 25 адены', flag: '_inn_dice_25', portrait: 'happy' },
          { id: 'inn_dice_50', label: 'Бросить на 50 адены', flag: '_inn_dice_50', portrait: 'serious' },
          { id: 'inn_leave', label: 'Отойти от стола', flag: '_inn_done', portrait: 'neutral' },
        ];
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, diceChoices),
            portrait: result.won ? 'happy' : result.tie ? 'neutral' : 'serious',
          }),
        };
      }
      if (choiceId === 'inn_fish_delivery') {
        const result = deliverFishToInn(save);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: mapDialogueChoices(npc, [
              { id: 'inn_leave', label: 'Иду к Ульфу на причал.', flag: '_inn_done', portrait: 'happy' },
            ]),
            portrait: result.ok ? 'happy' : 'serious',
          }),
        };
      }
      if (choiceId === 'inn_dice_leave') {
        return { save };
      }
    }

    if (npcId === 'town_healer' && choiceId === 'healer_treat') {
      const result = treatAtNpc(save, 'town_healer', survivalOf(save));
      if (result.ok) recordSurvival('npcCare');
      return {
        save: result.save,
        townMessage: result.message,
        followUp: withDialogueScene(npc, {
          text: result.message,
          choices: [],
          portrait: result.ok ? 'happy' : 'serious',
        }),
      };
    }

    if (npcId === 'town_blacksmith') {
      if (choiceId === 'forge_leave') {
        return { save };
      }
      const craftId = craftRecipeFromChoice(choiceId);
      if (craftId) {
        const result = craftItem(save, craftId);
        const menu = buildBlacksmithDialogue(result.save, npc);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: menu.choices,
            portrait: result.ok ? 'happy' : 'angry',
          }),
        };
      }
      const slot = blacksmithSlotFromChoice(choiceId);
      if (slot) {
        const result = enchantAtBlacksmith(save, slot);
        const menu = buildBlacksmithDialogue(result.save, npc);
        return {
          save: result.save,
          townMessage: result.message,
          followUp: withDialogueScene(npc, {
            text: result.message,
            choices: menu.choices,
            portrait: result.ok ? 'happy' : 'angry',
          }),
        };
      }
    }

    const allChoices = [
      ...npc.choices,
      ...Object.values(npc.nodes).flatMap((node) => node.choices),
    ];
    const choice = allChoices.find((item) => item.id === choiceId);
    if (!choice) return { save };

    if (choice.flag.startsWith('_')) {
      if (choice.nextNode) {
        const node = npc.nodes[choice.nextNode];
        if (node) {
          return {
            save,
            followUp: followUpFromNode(npc, node, choice),
          };
        }
      }
      return { save };
    }

    let next = cancelConflictingQuests(save, [choice.flag]);
    next = {
      ...next,
      questFlags: {
        ...next.questFlags,
        [choice.flag]: true,
      },
    };

    if (choice.nextNode) {
      const node = npc.nodes[choice.nextNode];
      if (node) {
        return {
          save: next,
          followUp: followUpFromNode(npc, node, choice),
        };
      }
    }

    return { save: next };
  }
}
