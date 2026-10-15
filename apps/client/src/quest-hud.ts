import type { PlayerSave } from './api.js';

function hasFlag(s: PlayerSave, flag: string): boolean {
  return Boolean(s.questFlags[flag]);
}

function kills(s: PlayerSave, flag: string): number {
  return Number(s.questFlags[flag] ?? 0);
}

/** Strip the redundant «Квест:» prefix — the HUD block is already titled. */
export function formatQuestHudLabel(text: string): string {
  return text.replace(/^Квест:\s*/, '');
}

/** Text for the quest strip under the HP bar. Pure — safe to unit-test. */
export function formatQuestHud(s: PlayerSave): string {
  // --- активные ---
  if (hasFlag(s, 'quest_hq_lab_active')) {
    return 'Квест: фильтр или батарея для д-ра Вейна [E]';
  }
  if (hasFlag(s, 'quest_board_bounty_active')) {
    return `Контракт: зачистка подступов ${kills(s, 'quest_board_bounty_kills')}/3 · доска [E]`;
  }
  if (hasFlag(s, 'quest_fish_delivery_active')) {
    if (hasFlag(s, 'quest_fish_delivery_delivered')) {
      return 'Квест: вернись к рыбаку Ульфу в порт [E]';
    }
    return 'Квест: доставь рыбу Марте в таверну [E]';
  }
  if (hasFlag(s, 'quest_dock_shift_active')) {
    return 'Квест: верни ящики грузчику Петру в порт [E]';
  }
  if (hasFlag(s, 'quest_miller_order_active')) {
    const flour = (s.inventory ?? []).filter((id) => id === 'mill_flour').length;
    return `Квест: мука для Фаддея (есть ${flour}/3) · мельница [E]`;
  }
  if (hasFlag(s, 'quest_scribe_folio_active')) {
    return 'Квест: забери опись у писца Ирины [E]';
  }
  if (hasFlag(s, 'quest_guard_report_active')) {
    return 'Квест: доложи стражу Леону у ворот [E]';
  }
  if (hasFlag(s, 'quest_informant_contract_active')) {
    return 'Квест: забери долю у информатора [E]';
  }
  if (hasFlag(s, 'quest_butcher_jerky_active')) {
    const meat = (s.inventory ?? []).filter((id) => id === 'raw_meat').length;
    return `Квест: принеси сырое мясо Брану (есть ${meat}/2) · рынок [E]`;
  }
  if (hasFlag(s, 'quest_garden_harvest_active')) {
    return 'Квест: забери урожай у садовника Ильи [E]';
  }
  if (hasFlag(s, 'quest_garden_active')) {
    return 'Квест: полей грядки (нужна вода) · сад [E]';
  }
  if (hasFlag(s, 'quest_grove_active')) {
    return `Квест: гоблины ${kills(s, 'quest_grove_kills')}/3`;
  }
  if (hasFlag(s, 'quest_betrayal_active')) {
    return `Квест: тень ${kills(s, 'quest_betrayal_kills')}/2`;
  }
  if (hasFlag(s, 'quest_silverwood_active')) {
    return `Квест: тени леса ${kills(s, 'quest_silverwood_kills')}/3`;
  }
  if (hasFlag(s, 'quest_ash_active')) {
    return `Квест: мутанты ${kills(s, 'quest_ash_kills')}/4`;
  }
  if (hasFlag(s, 'quest_depths_clear_active')) {
    return `Квест: пещеры — ловцы ${kills(s, 'quest_depths_clear_kills')}/4`;
  }
  if (hasFlag(s, 'quest_depths_purge_active')) {
    return `Квест: пещеры — призраки ${kills(s, 'quest_depths_purge_kills')}/3`;
  }
  if (hasFlag(s, 'quest_depths_boss_active')) {
    return 'Квест: срази Владыку теней';
  }

  if (hasFlag(s, 'quest_signal_active')) {
    return `Квест: дроны Сигнала ${kills(s, 'quest_signal_kills')}/5`;
  }
  if (hasFlag(s, 'quest_relay_active')) {
    return `Квест: эхо Шпиля ${kills(s, 'quest_relay_kills')}/4`;
  }
  if (hasFlag(s, 'quest_core_active')) {
    return 'Квест: уничтожь Статического колосса';
  }

  if (hasFlag(s, 'quest_chaos_active')) {
    return `Квест: порождения Хаоса ${kills(s, 'quest_chaos_kills')}/6`;
  }
  if (hasFlag(s, 'quest_fold_active')) {
    return `Квест: ужасы Гребня ${kills(s, 'quest_fold_kills')}/5`;
  }
  if (hasFlag(s, 'quest_scar_active')) {
    return 'Квест: срази Левиафана в Шраме';
  }

  if (hasFlag(s, 'quest_collapse_active')) {
    return `Квест: осколки Коллапса ${kills(s, 'quest_collapse_kills')}/6`;
  }
  if (hasFlag(s, 'quest_siege_active')) {
    return `Квест: осадные призраки ${kills(s, 'quest_siege_kills')}/5`;
  }
  if (hasFlag(s, 'quest_citadel_active')) {
    return 'Квест: срази Аватара в Цитадели';
  }

  if (hasFlag(s, 'quest_gods_active')) {
    return `Квест: божественные эхо ${kills(s, 'quest_gods_kills')}/6`;
  }
  if (hasFlag(s, 'quest_ascent_active')) {
    return `Квест: стражи Пантеона ${kills(s, 'quest_ascent_kills')}/5`;
  }
  if (hasFlag(s, 'quest_throne_active')) {
    return 'Квест: срази Павшего Владыку на Троне';
  }

  // --- старты / подтверждения ---
  if (hasFlag(s, 'quest_grove_started') || hasFlag(s, 'quest_betrayal_started')) {
    return 'Квест: иди к цели';
  }
  if (hasFlag(s, 'quest_silverwood_started')) {
    return 'Квест: подтверди у отшельника';
  }
  if (hasFlag(s, 'quest_ash_started')) {
    return 'Квест: подтверди у шамана';
  }
  if (hasFlag(s, 'quest_depths_clear_started')) {
    return 'Квест: подтверди приказ у капитана';
  }
  if (hasFlag(s, 'quest_signal_started')) {
    return 'Квест: подтверди у Кая на Перекрёстке';
  }
  if (hasFlag(s, 'quest_chaos_started')) {
    return 'Квест: подтверди у Лиры в Секторе Хаоса';
  }
  if (hasFlag(s, 'quest_collapse_started')) {
    return 'Квест: подтверди у Эры на Окраине';
  }
  if (hasFlag(s, 'quest_gods_started')) {
    return 'Квест: подтверди у Никс на Разломе';
  }

  if (
    s.location === 'silverwood' &&
    !hasFlag(s, 'quest_silverwood_complete') &&
    !hasFlag(s, 'quest_silverwood_active')
  ) {
    return 'Квест: поговори с отшельником [E]';
  }
  if (
    s.location === 'ash_highlands' &&
    !hasFlag(s, 'quest_ash_complete') &&
    !hasFlag(s, 'quest_ash_active')
  ) {
    return 'Квест: поговори с шаманом [E]';
  }

  // --- завершённые / следующий шаг ---
  if (hasFlag(s, 'quest_epilogue_claimed')) {
    return 'Разлом: линия богов закрыта ✓';
  }
  if (hasFlag(s, 'quest_throne_complete')) {
    return 'Эпилог: Никс на Разломе Богов [E] / рация';
  }
  if (hasFlag(s, 'quest_ascent_complete')) {
    return 'Квест: следующий шаг — Трон у Никс [E]';
  }
  if (hasFlag(s, 'quest_gods_complete')) {
    return 'Квест: следующий шаг — Подъём у Никс [E]';
  }
  if (hasFlag(s, 'quest_citadel_complete')) {
    return 'Квест: дальше — Разлом Богов, Оракул Никс';
  }
  if (hasFlag(s, 'quest_siege_complete')) {
    return 'Квест: следующий шаг — Цитадель у Эры [E]';
  }
  if (hasFlag(s, 'quest_collapse_complete')) {
    return 'Квест: следующий шаг — осада у Эры [E]';
  }
  if (hasFlag(s, 'quest_scar_complete')) {
    return 'Квест: дальше — Окраина Коллапса, Эра';
  }
  if (hasFlag(s, 'quest_fold_complete')) {
    return 'Квест: следующий шаг — Шрам у Лиры [E]';
  }
  if (hasFlag(s, 'quest_chaos_complete')) {
    return 'Квест: следующий шаг — Гребень у Лиры [E]';
  }
  if (hasFlag(s, 'quest_core_complete')) {
    return 'Квест: дальше — Зона Искажения, Лира';
  }
  if (hasFlag(s, 'quest_relay_complete')) {
    return 'Квест: следующий шаг — Ядро у Кая [E]';
  }
  if (hasFlag(s, 'quest_signal_complete')) {
    return 'Квест: следующий шаг — Шпиль у Кая [E]';
  }

  if (hasFlag(s, 'quest_depths_boss_complete')) {
    return 'Квест: Пещеры теней очищены ✓';
  }
  if (hasFlag(s, 'quest_depths_purge_complete')) {
    return 'Квест: следующий приказ у капитана — босс';
  }
  if (hasFlag(s, 'quest_depths_clear_complete')) {
    return 'Квест: следующий приказ у капитана [E]';
  }
  if (hasFlag(s, 'quest_grove_complete')) {
    return 'Квест: роща спасена ✓ · капитан: Пещеры теней?';
  }
  if (hasFlag(s, 'quest_betrayal_complete')) {
    return 'Квест: теневая сделка ✓ · капитан: Пещеры теней?';
  }
  if (hasFlag(s, 'quest_silverwood_complete')) {
    return 'Квест: Серебряный лес ✓';
  }
  if (hasFlag(s, 'quest_ash_complete')) {
    return 'Квест: испытание пепла ✓';
  }

  if (hasFlag(s, 'quest_empery_hq_access') && s.location === 'empery_haven') {
    return 'Город: ворота EmperyWorld открыты · HQ [E]';
  }
  switch (s.location) {
    case 'empery_haven':
      if (!hasFlag(s, 'quest_garden_complete') && !hasFlag(s, 'quest_garden_active')) {
        return 'Город: сад / Переулок Шепотов · HQ EmperyWorld (закрыт)';
      }
      return 'Город: торговец, трактир, HQ (ворота) [E] · путешествие [T]';
    case 'empery_hq':
      if (hasFlag(s, 'quest_hq_lab_complete')) {
        return 'Кампус: матрица откалибрована · терминал [E]';
      }
      return 'EmperyWorld HQ · ресепшен [E] · д-р Вейн [E] · терминал [E]';
    case 'adena_fields':
      return 'Фарм адены — до 60 мобов · мало XP · [T] в город';
    case 'shadow_depths':
      return 'Данж: ловцы → призраки → владыка · квест у капитана';
    case 'silverwood':
      return 'Квест: поговори с отшельником [E]';
    case 'ash_highlands':
      return 'Квест: поговори с шаманом [E]';
    case 'intersection_district':
      return 'Перекрёсток: разведчик Кай [E] · луч на восток';
    case 'chaos_sector':
      return 'Хаос: Проводница Лира [E]';
    case 'collapse_fringe':
      return 'Окраина: Провидица Эра [E]';
    case 'gods_rift':
      return 'Разлом: Оракул Никс [E]';
    case 'godfall_throne':
      return 'Трон: Павший Владыка · квест у Никс';
    default:
      return 'Поговори с Мирой [E] · путешествие [T]';
  }
}
