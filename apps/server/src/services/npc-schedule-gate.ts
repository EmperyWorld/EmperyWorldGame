import {
  absoluteGameHours,
  havenScheduleEntryById,
  havenShipSkipperPresent,
  isHavenShipSkipperNpc,
  isNpcInteractable,
  isNpcRestHour,
  resolveNpcScheduleMode,
  type NpcScheduleMode,
  type NpcSchedulePhase,
} from '@empery/shared';
import type { DayNightService } from './day-night.js';
import { havenScheduleSnapshot } from './haven-schedule.js';

export const NPC_CLOSED_MESSAGE = 'Закрыто до утра.';

export const NPC_WALKING_HOME_BY_ID: Record<string, string> = {
  town_merchant: 'Лорен спешит домой: «Товар убран, замки закрыты. Ноги гудят после целого дня на рынке — спешу на ужин. Завтра приходи с рассветом!»',
  town_blacksmith: 'Гарольд вытирает руки ветошью: «Горн затушен, наковальня остывает. После целого дня с молотом мне нужен только сон. До рассвета!»',
  town_butcher: 'Бран закрывает лавку: «Прилавок пуст, ножи смазаны маслом. Пора отдыхать, добрый путник. Утром будет свежая вырезка.»',
  town_fisher: 'Ульф шагает с причала: «Сети развешаны, рыба сдана. Иду в каморку у причала — на рассвете снова выходить в реку.»',
  town_miller: 'Фаддей отряхивает фартук от муки: «Жернова остановлены, мука ссыпана в закрома. Иду отдыхать к мельнице до утреннего ветра.»',
  town_brewer: 'Хольм перекрывает кран: «Бочки закупорены, пивоварня спит до утра. В таверне у Марты ещё нальют кружку, а мне пора на покой.»',
  town_dockhand: 'Петр устало разминает плечи: «Спина железная, да и той роздых нужен после десяти барж. До утра, путник!»',
  town_radio: 'Рен укладывает антенну: «Эфир затихает, батареи на зарядке. Утром снова поймаем далёкие частоты.»',
  town_stable: 'Борис спешит к дому: «Кони накормлены и напоены свежей водой. Спешу на боковую — конюшня откроется с первыми лучами.»',
  town_scribe: 'Ирина гасит свечу: «Чернила высохли, свитки убраны в архив. Глаза устали при свечах — пора спать.»',
  town_priest: 'Отец Кассий благословляет на ходу: «Вечерняя молитва окончена, иду в соборную келью. Да хранит Свет твой сон в стенах города.»',
  town_captain: 'Капитан Гаррет проверяет караулы: «Дневной развод окончен, ночной дозор на страже. Я в казарму на пару часов. Не нарушай порядок.»',
  town_steward: 'Эдмунд аккуратно прячет ключи: «Хозяйственные книги сведены. Иду на покой, завтра с утра снова приём жильцов.»',
  town_gardener: 'Илья несёт лейку: «Грядки политы, яблоки убраны. Земля отдыхает ночью, и мне пора.»',
  town_informant: 'Информатор натягивает капюшон: «В темноте у стен слишком много лишних ушей. Не привлекай внимания, увидимся завтра.»',
  town_teacher: 'Учитель Лавр закрывает конспект: «Книги сложены, мел спрятан. Ум тоже требует отдыха. До завтрашних уроков на площади!»',
  town_bathkeeper: 'Ника выжимает полотенце: «Пар в бане спущен, полы вымыты. Завтра с утра снова истоплю парную!»',
  town_innkeeper_day: 'Олег машет рукой: «Моя дневная смена сдана Марте! Она сейчас у очага в трактире, а я спешу спать.»',
  stage_bard: 'Бард Кай бережно убирает лютню в футляр: «Струны устали, голос охрип. Ночь создана для сна, а не для баллад. До завтра!»',
};

export const NPC_WALKING_WORK_BY_ID: Record<string, string> = {
  town_merchant: 'Лорен бодро шагает к торговым рядам: «Утро доброе! Свежий товар только доставили, бегу открывать лавку. Заходи через пару минут, как разложу прилавок!»',
  town_blacksmith: 'Гарольд направляется к кузне: «С рассветом! Иду раздувать меха в кузне. Как разгорится уголь — сделаем всё в лучшем виде.»',
  town_butcher: 'Бран несёт связку крюков: «Утро доброе! Туши уже доставлены, иду рубить свежее мясо к завтраку.»',
  town_fisher: 'Ульф спешит к реке: «Свежий туман над рекой — самое время для клёва! Спешу на причал, скоро будет свежая рыба.»',
  town_miller: 'Фаддей глядит на флюгер: «С рассветом! Ветер хороший, жернова сегодня споро пойдут. Жду за свежей мукой!»',
  town_brewer: 'Хольм бодро шагает: «С рассветом! Пора ставить новую закваску. К вечеру эль будет как слеза.»',
  town_dockhand: 'Петр ускоряет шаг: «Первая баржа уже швартуется! Бегу на пирс принимать канаты.»',
  town_radio: 'Рен на ходу проверяет приёмник: «Утренний диапазон уже чист! Спешу включить радиоузел.»',
  town_stable: 'Борис направляется к стойлам: «Утречко! Спешу вычесать коней и проверить упряжь. Скоро можно будет оседлать скакуна.»',
  town_scribe: 'Ирина идёт к ступеням: «Утренний свет — лучший для письма. Иду открывать скрипторий.»',
  town_priest: 'Отец Кассий тепло улыбается: «Мир этому дню. Спешу к утренней службе на ступенях собора. Да пребудет с тобой Свет!»',
  town_captain: 'Капитан Гаррет чеканит шаг: «Утренний обход гарнизона. Проверю караулы и открою канцелярию.»',
  town_steward: 'Эдмунд приветливо кивает: «Доброе утро. Иду проверить Дом жильцов и подготовить ключи для новосёлов.»',
  town_gardener: 'Илья улыбается утреннему солнцу: «Пока роса на траве — лучший час для работы в саду. Скоро буду на грядках!»',
  town_informant: 'Информатор тихо шепчет: «Новый день — новые слухи. Скоро буду в переулке, не мельтеши.»',
  town_teacher: 'Учитель Лавр бодро идёт: «Новый день — новые знания! Спешу к ученикам на площадь.»',
  town_bathkeeper: 'Ника несёт свежие веники: «Доброе утро! Иду растапливать печи в бане — к полудню будет отличный пар.»',
  town_innkeeper_day: 'Олег спешит в трактир: «Иду сменять Марту за стойкой! Скоро буду в трактире с горячим чаем и свежими новостями.»',
  stage_bard: 'Бард Кай напевает утренний мотив: «С рассветом! Спешу на сцену амфитеатра — сегодня прозвучат новые баллады!»',
};

const NPC_CLOSED_BY_ID: Record<string, string> = {
  town_merchant: 'Лавка Лорена закрыта до утра.',
  town_blacksmith: 'Кузня Гарольда закрыта до утра.',
  town_butcher: 'Мясная Брана закрыта до утра.',
  town_fisher: 'Рыбный прилавок закрыт до утра.',
  town_miller: 'Пекарня Фаддея закрыта до утра.',
  town_brewer: 'Пивоварня закрыта до утра.',
  town_dockhand: 'Склад на пристани закрыт до утра.',
  town_radio: 'Радиолавка закрыта до утра.',
  town_stable: 'Конюшня закрыта до утра.',
  town_scribe: 'Скрипторий закрыт до утра.',
  town_priest: 'Собор открыт для молитвы, но службы — утром.',
  town_captain: 'Капитан отдыхает до утра.',
  town_steward: 'Дворецкий до утра не принимает.',
  town_gardener: 'Сад спит до рассвета — Илья ушёл отдыхать.',
  town_informant: 'Информатор растворился в тенях до утра.',
  town_hq_sentry: 'Часовой на посту. Ворота EmperyWorld закрыты.',
  town_teacher: 'Уроки с рассвета.',
  town_bathkeeper: 'Бани закрыты до утра.',
  town_innkeeper_day: 'Олег на дневной смене — приходи с рассвета.',
  town_innkeeper: 'Марта на ночной смене — приходи после заката.',
  stage_bard: 'Сцена амфитеатра пуста до утра. Бард Кай отдыхает.',
};

/** Active innkeeper for haven_provisions by time of day. */
export function resolveHavenInnkeeperId(hour: number, locationId: string): string {
  if (locationId !== 'empery_haven') return 'town_innkeeper';
  return isNpcRestHour(hour) ? 'town_innkeeper' : 'town_innkeeper_day';
}

export function closedMessageForNpc(npcId: string, phase?: NpcSchedulePhase): string {
  if (phase === 'walking_home') {
    return NPC_WALKING_HOME_BY_ID[npcId] ?? `${npcId} спешит домой после смены. Закрыто до утра.`;
  }
  if (phase === 'walking_to_post') {
    return NPC_WALKING_WORK_BY_ID[npcId] ?? `${npcId} идёт на работу. Откроется с минуты на минуту!`;
  }
  return NPC_CLOSED_BY_ID[npcId] ?? NPC_CLOSED_MESSAGE;
}

/** Haven shop YAML id → interactive NPC id. */
export const HAVEN_SHOP_NPC: Record<string, string> = {
  haven_merchant: 'town_merchant',
  haven_armor: 'town_blacksmith',
  haven_provisions: 'town_innkeeper',
  haven_fish: 'town_fisher',
  haven_butcher: 'town_butcher',
  haven_bakery: 'town_miller',
  haven_brew: 'town_brewer',
  haven_supplies: 'town_dockhand',
  haven_apothecary: 'town_healer',
  haven_radio: 'town_radio',
  haven_stable: 'town_stable',
};

export interface NpcScheduleGate {
  ok: boolean;
  message: string;
  hour: number;
  mode: NpcScheduleMode;
  phase?: NpcSchedulePhase;
  isCommuting?: boolean;
}

export function gateNpcInteract(
  dayNight: DayNightService,
  npcId: string,
  locationId: string,
  now = Date.now(),
): NpcScheduleGate {
  const hour = dayNight.snapshotForLocation(locationId, now).hour;
  if (isHavenShipSkipperNpc(npcId)) {
    const snap = dayNight.baseSnapshot(now);
    const absHours = absoluteGameHours(now, snap.cycleMs, snap.epochMs);
    const docked = havenShipSkipperPresent(npcId, absHours);
    return {
      ok: docked,
      message: docked ? '' : 'Судно в море. Шкипер ушёл с прилива.',
      hour,
      mode: 'day',
    };
  }
  const mode = resolveNpcScheduleMode(npcId, hour, { locationId });

  let phase: NpcSchedulePhase | undefined;
  let available=true;
  if (locationId === 'empery_haven') {
    const sched = havenScheduleSnapshot(dayNight, now);
    const entry = havenScheduleEntryById(sched, npcId);
    phase = entry?.phase;
    available=entry?entry.interactable&&!entry.asleep:true;
  }

  const isCommuting = phase === 'walking_home' || phase === 'walking_to_post';
  const ok = phase
    ? available && (phase === 'at_post' || phase === 'open' || phase === 'patrol')
    : isNpcInteractable(npcId, hour, { locationId, phase });

  return {
    ok,
    message: ok ? '' : closedMessageForNpc(npcId, phase),
    hour,
    mode,
    phase,
    isCommuting,
  };
}

export function gateShopOpen(
  dayNight: DayNightService,
  shopId: string,
  locationId: string,
  now = Date.now(),
): NpcScheduleGate {
  const hour = dayNight.snapshotForLocation(locationId, now).hour;
  const npcId =
    shopId === 'haven_provisions'
      ? resolveHavenInnkeeperId(hour, locationId)
      : HAVEN_SHOP_NPC[shopId];
  if (!npcId) return { ok: true, message: '', hour, mode: 'day' };
  return gateNpcInteract(dayNight, npcId, locationId, now);
}
