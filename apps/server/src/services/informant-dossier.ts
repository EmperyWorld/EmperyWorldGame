/**
 * Haven informant (town_informant): paid whisper dossier and one-time shady-name cut.
 * Dialogue wiring lives in informant-dossier-dialogue.ts.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { getLatestRumors, getShadyRumors } from './rumors.js';
import { worldEvents } from './world-events.js';

export const INFORMANT_NPC_ID = 'town_informant';

export const DOSSIER_COST = 18;
export const CONTRACT_COST = 25;
export const CONTRACT_REWARD_ADENA = 55;

export const WHISPER_DOSSIER_ID = 'whisper_dossier';

export const INFORMANT_CONTRACT_ACTIVE_FLAG = 'quest_informant_contract_active';
export const INFORMANT_CONTRACT_COMPLETE_FLAG = 'quest_informant_contract_complete';

export const GROVE_COMPLETE_FLAG = 'quest_grove_complete';
export const BOUNTY_COMPLETE_FLAG = 'quest_board_bounty_complete';
export const HQ_LAB_COMPLETE_FLAG = 'quest_hq_lab_complete';
export const HQ_LAB_ACTIVE_FLAG = 'quest_hq_lab_active';

export const DOSSIER_ALREADY_MESSAGE = 'Досье уже у тебя';
export const BLADE_PROOF_MESSAGE = 'Сначала докажи клинок — зачистка или роща';

/** HUD line for the integrator (`quest-hud.ts` — not wired here). */
export const INFORMANT_CONTRACT_HUD = 'Квест: забери долю у информатора [E]';

export interface InformantDossierResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function hasItem(save: PlayerSave, itemId: string): boolean {
  return (save.inventory ?? []).includes(itemId);
}

function hasBladeProof(save: PlayerSave): boolean {
  return hasFlag(save, BOUNTY_COMPLETE_FLAG) || hasFlag(save, GROVE_COMPLETE_FLAG);
}

function payOrFail(
  save: PlayerSave,
  cost: number,
  lackMessage: string,
): { save: PlayerSave; ok: true } | { save: PlayerSave; ok: false; message: string } {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < cost) {
    return { save, ok: false, message: lackMessage };
  }
  return { save: { ...save, adena: currentAdena - cost }, ok: true };
}

function publish(save: PlayerSave, action: string, extra: Record<string, unknown> = {}): void {
  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: save.id,
    locationId: save.location,
    payload: { action, ...extra },
    timestamp: Date.now(),
  });
}

/** Concrete hint from existing save flags — no quest files edited. */
export function dossierHintFromFlags(save: PlayerSave): string {
  if (hasFlag(save, HQ_LAB_COMPLETE_FLAG)) {
    return 'Лаборатория Штаба уже дышит биополем. Инженеры молчат, а ночью из-под гавани таскают колбы без герба.';
  }
  if (hasFlag(save, HQ_LAB_ACTIVE_FLAG)) {
    return 'Ты уже в лаборатории Штаба. Фильтр и батарея — не единственное, что там течёт. Не свети бумагой Вейну.';
  }
  if (hasFlag(save, BOUNTY_COMPLETE_FLAG)) {
    return 'Доска у форума закрыла контракт на твой клинок. В предместьях шепчут другое имя — кто вешал бумагу, тот же, кто таскает бочки в Переулке.';
  }
  if (hasFlag(save, GROVE_COMPLETE_FLAG)) {
    return 'Роща за Серебряным Лесом уже не орёт гоблинами — но кто заказал зачистку, всё ещё платит за молчание.';
  }
  return 'Пока клинок не отметился на доске или в роще, имена дешевле слухов. Бочки с чужой печатью уже идут мимо конюшни.';
}

function dossierIntel(save: PlayerSave): string {
  const hint = dossierHintFromFlags(save);
  const latest = getLatestRumors()[0] ?? 'В городе подозрительно тихо...';
  const shady = getShadyRumors()[0] ?? 'В Переулке Шепотов снова шепчутся про чужие печати на бочках.';
  return `${hint} Улица: «${latest}» Тень: «${shady}»`;
}

/** Платное досье: 18 адены, unsellable whisper_dossier, один раз. */
export function buyDossier(save: PlayerSave): InformantDossierResult {
  if (hasItem(save, WHISPER_DOSSIER_ID)) {
    return { save, ok: false, message: DOSSIER_ALREADY_MESSAGE };
  }

  const paid = payOrFail(
    save,
    DOSSIER_COST,
    `Досье стоит ${DOSSIER_COST} адены. Бумага и молчание — не даром.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = appendItemsToSave(paid.save, [WHISPER_DOSSIER_ID]);
  publish(next, 'INFORMANT_BUY_DOSSIER', { cost: DOSSIER_COST });
  return {
    save: next,
    ok: true,
    message: `Держи свёрток. Не разворачивай у стражи. ${dossierIntel(next)}`,
  };
}

/** Платное имя: 25 адены, ставит quest_informant_contract_active. Разово. */
export function buyShadyContract(save: PlayerSave): InformantDossierResult {
  if (hasFlag(save, INFORMANT_CONTRACT_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Это имя уже закрыто. Других контрактов нет.',
    };
  }
  if (hasFlag(save, INFORMANT_CONTRACT_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Имя уже куплено. Докажи клинок и забери долю.',
    };
  }

  const paid = payOrFail(
    save,
    CONTRACT_COST,
    `Имя стоит ${CONTRACT_COST} адены. Без звона в кармане шепот не продаётся.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next: PlayerSave = {
    ...paid.save,
    questFlags: {
      ...paid.save.questFlags,
      [INFORMANT_CONTRACT_ACTIVE_FLAG]: true,
    },
  };
  publish(next, 'INFORMANT_BUY_CONTRACT', { cost: CONTRACT_COST });
  return {
    save: next,
    ok: true,
    message:
      'Имя куплено. Я уже сделал работу в тени. Докажи клинок — зачистка или роща — и вернись за долей.',
  };
}

/** Доля за имя: +55 адены, один раз. Нужна зачистка доски или роща. */
export function claimShadyContract(save: PlayerSave): InformantDossierResult {
  if (hasFlag(save, INFORMANT_CONTRACT_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Долю уже забрал. Второй раз карман не грею.',
    };
  }
  if (!hasFlag(save, INFORMANT_CONTRACT_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала купи имя — иначе делить нечего.',
    };
  }
  if (!hasBladeProof(save)) {
    return { save, ok: false, message: BLADE_PROOF_MESSAGE };
  }

  const nextFlags: Record<string, string | number | boolean> = {
    ...save.questFlags,
    [INFORMANT_CONTRACT_COMPLETE_FLAG]: true,
  };
  delete nextFlags[INFORMANT_CONTRACT_ACTIVE_FLAG];

  const next: PlayerSave = {
    ...save,
    adena: (save.adena ?? 0) + CONTRACT_REWARD_ADENA,
    questFlags: nextFlags,
  };
  publish(next, 'INFORMANT_CLAIM_CONTRACT', { rewardAdena: CONTRACT_REWARD_ADENA });
  return {
    save: next,
    ok: true,
    message: `Клинок доказан. Держи ${CONTRACT_REWARD_ADENA} адены — твоя доля за имя.`,
  };
}
