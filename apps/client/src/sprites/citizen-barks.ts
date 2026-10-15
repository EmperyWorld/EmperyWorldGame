export interface CitizenBarkContext {
  districtNpcId?: string;
  isNightGuard?: boolean;
  hour?: number;
  playerMounted?: boolean;
  playerKarma?: number;
}

export const MOUNTED_CITIZEN_BARKS = [
  'Поберегись, конный!',
  'Осторожнее на мостовой — не сбей прохожих!',
  'Славный скакун, путник.',
  'Дорогу всаднику!',
  'Лихо скачешь, путник!',
  'Придержи поводья у поворота!',
] as const;

export const MOUNTED_GUARD_BARKS = [
  'Всадник, сбавь аллюр в черте города!',
  'Держи поводья крепче на мостовой.',
  'На площади не гарцуй — здесь ходят люди.',
] as const;

export const KARMA_CITIZEN_BARKS = [
  'Не подходи ко мне... От тебя разит бедой.',
  'В Гавани чтят закон. Держи руки при себе, разбойник.',
  'Стража, приглядите за этим бродягой!',
  'Лучше обойду тебя стороной...',
  'Дурная слава бежит впереди тебя.',
] as const;

export const KARMA_GUARD_BARKS = [
  'Оружие в ножны, преступник! Мы следим за каждым твоим шагом.',
  'Один неверный шаг в Гавани — и окажешься в колодках.',
  'Закон Гавани суров к тем, чьи руки запятнаны кровью.',
  'Стой на месте и не делай резких движений.',
] as const;

export const MORNING_BARKS = [
  'Доброе утро, путник.',
  'Лавки только открылись — самый свежий товар!',
  'Пекарня Фаддея уже пахнет горячей сдобой.',
  'Хороший день для торговли и добрых дел.',
  'С первыми лучами город оживает.',
] as const;

export const MIDDAY_BARKS = [
  'Доброго полудня, странник.',
  'Жаркое солнце сегодня над Гаванью.',
  'Караваны с востока как раз разгружают на форуме.',
  'Удачного дня и полных карманов адены!',
  'Смотри под ноги на людной мостовой.',
] as const;

export const EVENING_BARKS = [
  'Добрый вечер. Скоро колокол Собора пробьёт ко сну.',
  'Марта в таверне уже растопила жаркий очаг.',
  'Темнеет, не задерживайся в тёмных переулках.',
  'Мирного вечера, путник.',
  'После заката у городских ворот закрывают засовы.',
] as const;

export const NIGHT_CITIZEN_BARKS = [
  'Ночной ряд шепчет... Ищешь редкую вещицу?',
  'Тише говори, стража рядом бродит.',
  'После отбоя у фонтана свои дела.',
  'Холодный ночной ветерок с моря.',
] as const;

export const NIGHT_GUARD_BARKS = [
  'Ночной дозор. На улицах Гавани спокойно.',
  'После вечернего колокола мирным жителям лучше быть дома.',
  'Следи за кошельком в ночной темноте.',
  'Тише в переулках — город спит.',
  'Городские ворота заперты до первых лучей.',
] as const;

export const DEFAULT_GREET_BARKS = [
  'Привет, путник.',
  'Доброго пути.',
  'Смотри под ноги.',
  'Город большой — не потеряйся.',
  'Ого, странник.',
  'Мир тебе.',
] as const;

/**
 * Selects an appropriate atmospheric greeting bark for a citizen or guard
 * based on player presence, mount status, karma, and world hour.
 */
export function pickContextualGreetingBark(
  ctx: CitizenBarkContext,
  rnd: () => number = Math.random,
): string {
  // 1. L2-style karma: positive values mark a PK / outlaw.
  if (ctx.playerKarma != null && ctx.playerKarma > 0) {
    const pool = ctx.isNightGuard ? KARMA_GUARD_BARKS : KARMA_CITIZEN_BARKS;
    const idx = Math.floor(rnd() * pool.length) % pool.length;
    return pool[idx]!;
  }

  // 2. Mounted player reaction
  if (ctx.playerMounted) {
    const pool = ctx.isNightGuard ? MOUNTED_GUARD_BARKS : MOUNTED_CITIZEN_BARKS;
    const idx = Math.floor(rnd() * pool.length) % pool.length;
    return pool[idx]!;
  }

  // 3. Night guard on patrol
  if (ctx.isNightGuard) {
    const idx = Math.floor(rnd() * NIGHT_GUARD_BARKS.length) % NIGHT_GUARD_BARKS.length;
    return NIGHT_GUARD_BARKS[idx]!;
  }

  // 4. Time-of-day contextual barks for citizens
  const hour = ctx.hour;
  if (hour != null) {
    if (hour >= 6 && hour < 11) {
      const idx = Math.floor(rnd() * MORNING_BARKS.length) % MORNING_BARKS.length;
      return MORNING_BARKS[idx]!;
    }
    if (hour >= 11 && hour < 18) {
      const idx = Math.floor(rnd() * MIDDAY_BARKS.length) % MIDDAY_BARKS.length;
      return MIDDAY_BARKS[idx]!;
    }
    if (hour >= 18 && hour < 21) {
      const idx = Math.floor(rnd() * EVENING_BARKS.length) % EVENING_BARKS.length;
      return EVENING_BARKS[idx]!;
    }
    // Deep night (21:00 - 06:00)
    const idx = Math.floor(rnd() * NIGHT_CITIZEN_BARKS.length) % NIGHT_CITIZEN_BARKS.length;
    return NIGHT_CITIZEN_BARKS[idx]!;
  }

  // 5. General fallback
  const idx = Math.floor(rnd() * DEFAULT_GREET_BARKS.length) % DEFAULT_GREET_BARKS.length;
  return DEFAULT_GREET_BARKS[idx]!;
}
