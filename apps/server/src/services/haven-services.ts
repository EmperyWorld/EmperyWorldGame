/**
 * Haven municipal services & port quests:
 * - Father Cassian (town_priest): Cathedral blessing & karma repentance
 * - Nika (town_bathkeeper): Steam bath restoration & herbal tea
 * - Fisher Ulf & Marta (town_fisher / town_innkeeper): Fresh fish tavern delivery chain
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { applyNamedBuff } from './ally-buffs.js';
import { applyRestRecovery } from './survival.js';
import { worldEvents } from './world-events.js';

export const CATHEDRAL_BLESS_COST = 10;
export const CATHEDRAL_CONFESS_COST = 50;
export const BATH_SESSION_COST = 25;
export const BATH_TEA_COST = 10;

export const FISH_QUEST_ACTIVE_FLAG = 'quest_fish_delivery_active';
export const FISH_QUEST_DELIVERED_FLAG = 'quest_fish_delivery_delivered';
export const FISH_QUEST_COMPLETE_FLAG = 'quest_fish_delivery_complete';
export const FISH_QUEST_REWARD_ADENA = 140;

export const BARD_INSPIRATION_COST = 5;
export const HAVEN_DICE_BETS = [10, 25, 50] as const;

export interface HavenServiceResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export interface HavenDiceResult extends HavenServiceResult {
  won: boolean;
  tie: boolean;
  doubleWin: boolean;
  playerRoll: [number, number];
  hostRoll: [number, number];
  payout: number;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

/** Собор: благословение Света (+pDef на 30 мин, полное исцеление). */
export function requestCathedralBlessing(save: PlayerSave): HavenServiceResult {
  const currentAdena = save.adena ?? 0;
  const cost = currentAdena >= CATHEDRAL_BLESS_COST ? CATHEDRAL_BLESS_COST : 0;

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - cost,
    hp: save.maxHp,
    mp: save.maxMp ?? save.mp,
  };

  nextSave = applyNamedBuff(nextSave, {
    buffId: 'cathedral_bless',
    buffStat: 'pDef',
    buffName: 'Благословение Света',
    amount: 15,
    durationMs: 30 * 60 * 1000,
  });

  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'CATHEDRAL_BLESSING', cost },
    timestamp: Date.now(),
  });

  const costNote = cost > 0 ? ` (пожертвование: ${cost} адены)` : ' (в дар страннику)';
  return {
    save: finalSave,
    ok: true,
    message: `Отец Кассий возложил длань: раны затянулись, дух спокоен. Получено «Благословение Света» (+15 физ. защиты на 30 мин)${costNote}.`,
  };
}

/** Собор: покаяние и очищение кармы. */
export function confessAtCathedral(save: PlayerSave): HavenServiceResult {
  const karma = save.karma ?? 0;
  if (karma <= 0) {
    return {
      save,
      ok: false,
      message: 'Твоя совесть чиста перед Империей. Кармы греха на тебе нет.',
    };
  }

  const currentAdena = save.adena ?? 0;
  if (currentAdena < CATHEDRAL_CONFESS_COST) {
    return {
      save,
      ok: false,
      message: `Для покаяния требуется пожертвование на храм (${CATHEDRAL_CONFESS_COST} адены). У тебя: ${currentAdena}.`,
    };
  }

  const nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - CATHEDRAL_CONFESS_COST,
    karma: 0,
  };

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: nextSave.id,
    locationId: nextSave.location,
    payload: { action: 'CATHEDRAL_CONFESSION', clearedKarma: karma },
    timestamp: Date.now(),
  });

  return {
    save: nextSave,
    ok: true,
    message: `Грехи отпущены. Карма полностью очищена (${karma} → 0). Ступай с миром и не обнажай клинок против невинных.`,
  };
}

/** Баня Ники: горячая парная (+pAtk на 20 мин, снятие усталости, полное HP/MP). */
export function takeBathSession(save: PlayerSave): HavenServiceResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < BATH_SESSION_COST) {
    return {
      save,
      ok: false,
      message: `Парная стоит ${BATH_SESSION_COST} адены. Дрова и дубовые веники нынче в цене.`,
    };
  }

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - BATH_SESSION_COST,
    hp: save.maxHp,
    mp: save.maxMp ?? save.mp,
  };

  // Снятие усталости через survival
  const restResult = applyRestRecovery(nextSave, Date.now(), {
    instantFatigueRelief: 45,
    restMinutes: 30,
  });
  if (restResult.ok) {
    nextSave = restResult.save;
  }

  nextSave = applyNamedBuff(nextSave, {
    buffId: 'bath_steam',
    buffStat: 'pAtk',
    buffName: 'Банный пар',
    amount: 10,
    durationMs: 20 * 60 * 1000,
  });

  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'BATH_SESSION' },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message: 'Крепкий берёзовый пар выгнал всю хворь и ломоту! Здоровье и силы на максимуме, получен бафф «Банный пар» (+10 физ. атаки на 20 мин).',
  };
}

/** Баня Ники: покупка бодрящего травяного взвара. */
export function buyBathTea(save: PlayerSave): HavenServiceResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < BATH_TEA_COST) {
    return {
      save,
      ok: false,
      message: `Травяной взвар стоит ${BATH_TEA_COST} адены.`,
    };
  }

  const curMp = save.mp ?? 0;
  const maxMp = save.maxMp ?? 50;
  const nextMp = Math.min(maxMp, curMp + 35);

  const nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - BATH_TEA_COST,
    mp: nextMp,
  };

  return {
    save: nextSave,
    ok: true,
    message: 'Горячий взвар на лесных травах согревает изнутри (+35 маны). Голова свежая!',
  };
}

/** Порт: Рыбак Ульф даёт поручение доставить рыбу в таверну Марте. */
export function startFishDeliveryQuest(save: PlayerSave): HavenServiceResult {
  if (hasFlag(save, FISH_QUEST_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Марта уже получила свежий улов. Портовые поставки в полном порядке!',
    };
  }
  if (hasFlag(save, FISH_QUEST_ACTIVE_FLAG)) {
    if (hasFlag(save, FISH_QUEST_DELIVERED_FLAG)) {
      return {
        save,
        ok: true,
        message: 'Рыба уже у Марты! Забери у меня причитающуюся долю за доставку.',
      };
    }
    return {
      save,
      ok: true,
      message: 'Рыба ждёт! Скорее отнеси улов Марте в трактир на восточной стороне города.',
    };
  }

  const withFish = appendItemsToSave(save, ['raw_fish', 'raw_fish', 'raw_fish']);
  const nextSave: PlayerSave = {
    ...withFish,
    questFlags: {
      ...withFish.questFlags,
      [FISH_QUEST_ACTIVE_FLAG]: true,
    },
  };

  return {
    save: nextSave,
    ok: true,
    message: 'Ульф передал три отборные рыбины: «Отнеси Марте на кухню трактира, пока свежие. Она выпишет расписку, а я рассчитаюсь монетой!»',
  };
}

/** Трактир: Марта принимает рыбу от Ульфа. */
export function deliverFishToInn(save: PlayerSave): HavenServiceResult {
  if (hasFlag(save, FISH_QUEST_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Утренняя рыба уже на сковороде. Спасибо за помощь!',
    };
  }
  if (!hasFlag(save, FISH_QUEST_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Если у тебя есть дело от портовых рыбаков — сначала возьми у них груз.',
    };
  }
  if (hasFlag(save, FISH_QUEST_DELIVERED_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Я уже приняла улов и отдала расписку. Ступай к Ульфу на причал за наградой.',
    };
  }

  // Забираем рыбу у игрока (если есть в сумке)
  const fishInBag = save.inventory.filter((id) => id === 'raw_fish').length;
  const toRemove = Array(Math.min(3, fishInBag)).fill('raw_fish');
  const withoutFish = (toRemove.length > 0 ? removeItemIdsFromSave(save, toRemove) : null) ?? save;

  // Награда от Марты: 2 порции горячей жареной рыбы в дорогу
  const withSnack = appendItemsToSave(withoutFish, ['cooked_fish', 'cooked_fish']);
  const nextSave: PlayerSave = {
    ...withSnack,
    questFlags: {
      ...withSnack.questFlags,
      [FISH_QUEST_DELIVERED_FLAG]: true,
    },
  };

  return {
    save: nextSave,
    ok: true,
    message: 'Марта радостно забирает рыбу: «Как раз к обеду! Вот тебе две порции горячей жареной рыбы в дорогу, а эту расписку покажи Ульфу на причале — он отдаст монеты.»',
  };
}

/** Порт: Ульф выплачивает награду по расписке Марты. */
export function claimFishDeliveryReward(save: PlayerSave): HavenServiceResult {
  if (hasFlag(save, FISH_QUEST_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Расчёт уже произведён полностью.',
    };
  }
  if (!hasFlag(save, FISH_QUEST_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала возьми поручение на доставку улова.',
    };
  }
  if (!hasFlag(save, FISH_QUEST_DELIVERED_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Марта ещё не подтвердила доставку рыбы. Сначала отнеси улов в трактир.',
    };
  }

  const nextAdena = (save.adena ?? 0) + FISH_QUEST_REWARD_ADENA;
  const nextFlags: Record<string, string | number | boolean> = {
    ...save.questFlags,
    [FISH_QUEST_COMPLETE_FLAG]: true,
  };
  delete nextFlags[FISH_QUEST_ACTIVE_FLAG];
  delete nextFlags[FISH_QUEST_DELIVERED_FLAG];

  const nextSave: PlayerSave = {
    ...save,
    adena: nextAdena,
    questFlags: nextFlags,
  };

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: nextSave.id,
    locationId: nextSave.location,
    payload: { action: 'FISH_DELIVERY_COMPLETE', rewardAdena: FISH_QUEST_REWARD_ADENA },
    timestamp: Date.now(),
  });

  return {
    save: nextSave,
    ok: true,
    message: `Ульф забирает расписку Марты: «Честная работа! Держи ${FISH_QUEST_REWARD_ADENA} адены. Всегда приятно иметь дело с надёжным человеком.»`,
  };
}

/** Амфитеатр: песня барда Кая — бафф «Вдохновение барда» (+25 к скорости, +12% скорости атаки, +10 MP/с на 15 мин). */
export function requestBardInspiration(save: PlayerSave): HavenServiceResult {
  const currentAdena = save.adena ?? 0;
  const cost = currentAdena >= BARD_INSPIRATION_COST ? BARD_INSPIRATION_COST : 0;

  let nextSave: PlayerSave = {
    ...save,
    adena: Math.max(0, currentAdena - cost),
    mp: Math.min(save.maxMp ?? 100, (save.mp ?? 0) + 25),
  };

  const durationMs = 15 * 60 * 1000;
  nextSave = applyNamedBuff(nextSave, {
    buffId: 'bard_inspiration',
    buffStat: 'speed',
    buffName: 'Вдохновение барда',
    amount: 25,
    durationMs,
  });
  nextSave = applyNamedBuff(nextSave, {
    buffId: 'bard_tempo',
    buffStat: 'attackSpeed',
    buffName: 'Ритм струн',
    amount: 12,
    durationMs,
  });
  nextSave = applyNamedBuff(nextSave, {
    buffId: 'bard_harmony',
    buffStat: 'mpRegen',
    buffName: 'Гармония мелодии',
    amount: 10,
    durationMs,
  });

  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'BARD_INSPIRATION', cost },
    timestamp: Date.now(),
  });

  const costNote = cost > 0 ? `(пожертвовано ${cost} адены)` : '(песня в дар страннику)';
  return {
    save: finalSave,
    ok: true,
    message: `Бард Кай перебирает струны лютни: «Вдохновение барда» наполняет сердце бодростью, а шаг — стремительностью! ${costNote} [+25 к скорости бега, +12% к скорости атаки, +10 к регенерации MP/с на 15 мин]`,
  };
}

/** Таверна: игра в кости Гавани (2d6 игрока против 2d6 трактирщика). */
export function playHavenDice(
  save: PlayerSave,
  bet: number,
  customRolls?: { player?: [number, number]; host?: [number, number] },
): HavenDiceResult {
  const currentAdena = save.adena ?? 0;
  if (bet <= 0 || currentAdena < bet) {
    return {
      save,
      ok: false,
      message: `У тебя не хватает звонкой адены на ставку в ${bet} адены!`,
      won: false,
      tie: false,
      doubleWin: false,
      playerRoll: [1, 1],
      hostRoll: [1, 1],
      payout: 0,
    };
  }

  const pRoll: [number, number] = customRolls?.player ?? [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
  const hRoll: [number, number] = customRolls?.host ?? [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];

  const pTotal = pRoll[0] + pRoll[1];
  const hTotal = hRoll[0] + hRoll[1];
  const isDouble = pRoll[0] === pRoll[1];

  let won = false;
  let tie = false;
  let doubleWin = false;
  let payout = 0;
  let nextAdena = currentAdena;
  let message = '';
  let finalSave = save;

  const currentWins = Number(save.questFlags.haven_dice_wins) || 0;
  const currentGames = Number(save.questFlags.haven_dice_games) || 0;
  let nextWins = currentWins;

  if (pTotal > hTotal) {
    won = true;
    nextWins += 1;
    if (isDouble) {
      doubleWin = true;
      payout = Math.floor(bet * 2.5);
      nextAdena = currentAdena - bet + payout;
      finalSave = appendItemsToSave(save, ['haven_ale']);
      message = `🎲 Победа с дублем! Ваши кости: [${pRoll[0]} + ${pRoll[1]} = ${pTotal}], трактирщик: [${hRoll[0]} + ${hRoll[1]} = ${hTotal}]. Двойной триумф! Получено: ${payout} адены и кружка «Эля Гавани»!`;
    } else {
      payout = bet * 2;
      nextAdena = currentAdena - bet + payout;
      message = `🎲 Чистая победа! Ваши кости: [${pRoll[0]} + ${pRoll[1]} = ${pTotal}], трактирщик: [${hRoll[0]} + ${hRoll[1]} = ${hTotal}]. Забирай выигрыш: ${payout} адены (+${bet} чистыми)!`;
    }
  } else if (pTotal === hTotal) {
    tie = true;
    payout = bet;
    nextAdena = currentAdena;
    message = `🎲 Ничья! Ваши кости: [${pRoll[0]} + ${pRoll[1]} = ${pTotal}], трактирщик: [${hRoll[0]} + ${hRoll[1]} = ${hTotal}]. Кости легли ровно — ставка в ${bet} адены возвращена.`;
  } else {
    payout = 0;
    nextAdena = currentAdena - bet;
    message = `🎲 Не в этот раз! Ваши кости: [${pRoll[0]} + ${pRoll[1]} = ${pTotal}], трактирщик: [${hRoll[0]} + ${hRoll[1]} = ${hTotal}]. Ставка в ${bet} адены переходит в кассу трактира. Сыграем ещё раунд?`;
  }

  finalSave = {
    ...finalSave,
    adena: nextAdena,
    questFlags: {
      ...finalSave.questFlags,
      haven_dice_wins: nextWins,
      haven_dice_games: currentGames + 1,
    },
  };

  finalSave = applyStatsToSave(finalSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'HAVEN_DICE', bet, won, doubleWin, tie, payout },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message,
    won,
    tie,
    doubleWin,
    playerRoll: pRoll,
    hostRoll: hRoll,
    payout,
  };
}
