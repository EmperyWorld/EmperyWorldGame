import { HAVEN_GARRISON_LAYOUT } from '../../packages/shared/dist/haven-garrison-layout.js';
/**
 * Empery Haven — полная пересборка (120×84, городское кольцо как раньше ~80×50).
 *
 * ГЕОМЕТРИЯ (суша / вода / стена):
 *
 *   ################ N-GATE ################
 *   #                                      # E-GATE → парк
 *   #   рынок   площадь   трактир          #
 *   #   кузня             часовня          #
 *   #          конюшня                     #
 *   #### S-GATE ###### HARBOR-ARCH ####### #  ← южная стена на СУШЕ (ty=50)
 *   поля (суша)        │ набережная│~~~~~~~|  ← акватория ЮВ
 *                      │  4 причала│~~~~~~~|     (ty 51–83, tx 50–119)
 *
 * Карта увеличена ~50% (80×56 → 120×84) за счёт моря и полей снаружи кольца.
 * Стена — полный прямоугольник по суше (WALL_E_TX=77); к востоку/югу — простор.
 */

export const TW = 64;
/** Полный размер карты (тайлы). Городское кольцо уже WALL_* ниже. */
export const W = 120;
export const H = 84;

/** Линия южной стены (на суше, над рекой). */
const WALL_S_TY = 50;
/** Линия северной / боковых стен. */
const WALL_N_TY = 2;
const WALL_W_TX = 2;
/** Восточная стена города — не край карты (к востоку открытое море/подход к парку). */
const WALL_E_TX = 77;

/** Портовые ворота в южной стене (tx). */

/** EmperyWorld HQ — прямоугольник у востока, севернее порта.
 *  Арт ворот: фасад/дверь СМОТРИТ ВНИЗ кадра (юг). Ставить только на южную стену.
 *  Ось как interior empery_hq: юг GATE → двор → северный корпус.
 *  ┌─T─────────────T─┐
 *  │   LAB   HQ  ANT │
 *  │      [HOLO]     │
 *  │      [PAD]      │
 *  └─T─── G ─────────┘  ← ворота с юга
 */
export const HQ_TX0 = 58;
export const HQ_TY0 = 31;
export const HQ_TX1 = 70;
export const HQ_TY1 = 39;
export const HQ_CX = 64;
export const HQ_CY = 35;
/** Южные ворота (на южной стене кампуса). */
export const HQ_GATE_TX = HQ_CX;
export const HQ_GATE_TY = HQ_TY1;

export const c = (tx, ty) => [tx * TW + TW / 2, ty * TW + TW / 2];

function xy([x, y]) {
  return { x, y };
}

/**
 * Архитектурные сеты — внутри одного квартала/улицы только один сет.
 * Wooden → окраина/ремёсла; Stone → гражданский двор; Merchant → торговый восток.
 */
export const HAVEN_HOUSE_SETS = {
  Wooden_Slum_Set: [
    'prop_house_cottage',
    'prop_house_attic',
    'prop_house_gardener',
    'prop_house_workshop_home',
    'prop_house_rooftop',
  ],
  Stone_Citizen_Set: [
    'prop_house_stone',
    'prop_house_slate',
    'prop_house_row',
    'prop_house_townhouse',
    'prop_house_manor',
    'prop_house_bay',
    'prop_house_villa',
  ],
  Merchant_HalfTimbered_Set: [
    'prop_house_timber',
    'prop_house_duplex',
    'prop_house_blue',
    'prop_house_stucco',
    'prop_house_corner_shop',
    'prop_house_redroof',
  ],
};

/** Угол/магистраль крупнее, середина блока — норма, глубина переулка — компактнее. */
const HOUSE_SIZE = { corner: 224, mid: 192, alley: 160 };

/**
 * Органическая цепочка вдоль +X: стены встык (центры через (s0+s1)/2),
 * каждый следующий дом со сдвигом dy (тайлы) относительно baseTy.
 * @param {Array<{ id: string, size?: number, dy?: number }>} specs
 * @returns {Array<[string, number, number, number]>} [id, tx, ty, size] — tx/ty в тайлах (дробные OK)
 */
export function organicTerraceX(specs, startTx, baseTy) {
  /** @type {Array<[string, number, number, number]>} */
  const out = [];
  let xPx = startTx * TW + TW / 2;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const size = sp.size ?? HOUSE_SIZE.mid;
    const dy = sp.dy ?? 0;
    if (i > 0) {
      const prevSize = specs[i - 1].size ?? HOUSE_SIZE.mid;
      xPx += prevSize / 2 + size / 2;
    }
    const tx = Math.round((xPx - TW / 2) / TW);
    const ty = baseTy + dy;
    out.push([sp.id, tx, ty, size]);
  }
  return out;
}

/**
 * Органическая цепочка вдоль +Y (Г-крыло): встык по вертикали, dx-сдвиги фасада.
 * @param {Array<{ id: string, size?: number, dx?: number }>} specs
 */
export function organicTerraceY(specs, baseTx, startTy) {
  /** @type {Array<[string, number, number, number]>} */
  const out = [];
  let yPx = startTy * TW + TW / 2;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const size = sp.size ?? HOUSE_SIZE.mid;
    const dx = sp.dx ?? 0;
    if (i > 0) {
      const prevSize = specs[i - 1].size ?? HOUSE_SIZE.mid;
      yPx += prevSize / 2 + size / 2;
    }
    const tx = baseTx + dx;
    const ty = Math.round((yPx - TW / 2) / TW);
    out.push([sp.id, tx, ty, size]);
  }
  return out;
}

/**
 * Жилой квартал — три сплошных террасных УЛИЦЫ (0-gap по X) в две крыла,
 * обрамляющие центральный колосс `prop_tenement_block` (tx≈14–19, ty≈39–45,
 * см. HAVEN_NPC_LANDMARK_EXCLUSIONS) — классическая застройка «доходный дом
 * в центре двора + частные террасы по бокам». Между рядами — 2-тайловые
 * переулки (дверной карман + двор-колодец с колодцем/грядками).
 * Крайние дома каждого крыла (включая обращённые к площади тенемента) —
 * крупнее (corner=224), середина — mid=192.
 *
 *   ряд 1 (Wooden_Slum_Set)          ty=38
 *   ── переулок / двор-колодец ──    ty 40–41
 *   ряд 2 (Stone_Citizen_Set)        ty=43   [центр: тенемент]
 *   ── переулок / грядки-бельё ──    ty 45
 *   ряд 3 (Merchant_HalfTimbered_Set) ty=47
 */
export function buildHavenResidentialLayout() {
  // ВАЖНО: внутри одной 0-gap цепочки размер должен быть ОДИНАКОВЫМ — иначе
  // Math.round(xPx/TW) на полутайловом шаге (224+192)/2=208px=3.25т даёт
  // 16px реального нахлёста между полными AABB спрайтов, и пакер молча
  // дропает второй дом (uniqueness/overlap guard). Единый шаг 192px=3т
  // всегда попадает точно на тайл — 0 дропов, 0 нахлёстов.
  const S = HOUSE_SIZE.mid;
  const WEST_TX = 5;
  const EAST_TX = 22;

  function wing(ids, startTx, baseTy) {
    const specs = ids.map((id) => ({ id, size: S }));
    return organicTerraceX(specs, startTx, baseTy);
  }

  function terraceRow(westIds, eastIds, baseTy) {
    return [...wing(westIds, WEST_TX, baseTy), ...wing(eastIds, EAST_TX, baseTy)];
  }

  // ——— Ряд 0: доп. жильё на ty36 (ty34 режется паддингом кузницы/мельницы) ———
  const rowNorth = [
    ['prop_house_cottage', 5, 36, S],
    ['prop_house_attic', 8, 36, S],
    ['prop_house_timber', 14, 36, S],
    ['prop_house_stucco', 17, 36, S],
    ['prop_house_blue', 24, 36, S],
    ['prop_house_row', 27, 36, S],
  ];

  // ——— Ряд 1: Wooden_Slum_Set — 3+3, окаймляет тенемент сверху ———
  const rowWood = terraceRow(
    ['prop_house_cottage', 'prop_house_attic', 'prop_house_gardener'],
    ['prop_house_workshop_home', 'prop_house_rooftop', 'prop_house_cottage'],
    38,
  );

  // ——— Ряд 2: Stone_Citizen_Set — 3+3, по центру (высота тенемента) ———
  const rowStone = terraceRow(
    ['prop_house_stone', 'prop_house_slate', 'prop_house_row'],
    ['prop_house_townhouse', 'prop_house_manor', 'prop_house_villa'],
    43,
  );

  // ——— Ряд 3: Merchant_HalfTimbered_Set — 3+3, окаймляет тенемент снизу ———
  const rowMerchant = terraceRow(
    ['prop_house_timber', 'prop_house_duplex', 'prop_house_blue'],
    ['prop_house_stucco', 'prop_house_corner_shop', 'prop_house_redroof'],
    47,
  );

  // Одинокий bay — south-facing accent на площади тенемента.
  const plazaAccent = [['prop_house_bay', 16, 48, S]];

  const houses = [
    ...rowNorth,
    ...rowWood,
    ...rowStone,
    ...rowMerchant,
    ...plazaAccent,
    // Двор-колодец между рядом 1 и 2 (ty 40–41) — вне 3×3 резерва Эдмунда (9,40)
    ['prop_garden_plot', 6, 41],
    ['prop_scarecrow', 26, 41],
    // Грядки между рядом 2 и 3 (ty 45)
    ['prop_garden_plot', 6, 45],
  ];

  return {
    houses,
    rows: { rowNorth, rowWood, rowStone, rowMerchant },
  };
}

const RESIDENTIAL = buildHavenResidentialLayout();

export const HAVEN = {
  id: 'empery_haven',
  name: 'Имперская гавань',
  subtitle: 'Районы у речного порта',

  spawn: c(40, 20),

  npcs: [
    // Дверь = первый тайл южнее footprint.B плюс ещё один (радиус 1 без солида).
    // Гарнизон
    { id: 'town_captain', ...xy(c(13, 11)), label: 'Капитан [E]' },
    { id: 'town_guard', ...xy(c(15, 11)), label: 'Страж Леон [E]' },
    // Рынок
    { id: 'town_merchant', ...xy(c(12, 23)), label: 'Лорен [E]' },
    { id: 'town_butcher', ...xy(c(7, 23)), label: 'Бран [E]' },
    { id: 'town_radio', ...xy(c(18, 27)), label: 'Рен [E]' },
    // Ремёсла
    { id: 'town_blacksmith', ...xy(c(12, 35)), label: 'Гарольд [E]' },
    { id: 'town_miller', ...xy(c(20, 36)), label: 'Мельник Фаддей [E]' },
    { id: 'town_stable', ...xy(c(31, 40)), label: 'Борис [E]' },
    // Муниципальный / храмовый
    { id: 'town_priest', ...xy(c(54, 12)), label: 'Отец Кассий [E]' },
    { id: 'town_scribe', ...xy(c(60, 9)), label: 'Писец Ирина [E]' },
    { id: 'town_healer', ...xy(c(48, 17)), label: 'Лекарь Сера [E]' },
    { id: 'town_teacher', ...xy(c(44, 39)), label: 'Учитель Лавр [E]' },
    // Сервис
    { id: 'town_innkeeper', ...xy(c(58, 21)), label: 'Марта [E]' },
    { id: 'town_innkeeper_day', ...xy(c(59, 21)), label: 'Олег [E]' },
    { id: 'town_bathkeeper', ...xy(c(54, 25)), label: 'Банщица Ника [E]' },
    { id: 'town_brewer', ...xy(c(64, 25)), label: 'Пивовар Хольм [E]' },
    // Порт — колоссы сдвинуты на север, чтобы дверь не упиралась в южную стену
    { id: 'town_fisher', ...xy(c(66, 45)), label: 'Рыбак Ульф [E]' },
    { id: 'town_dockhand', ...xy(c(58, 45)), label: 'Грузчик Петр [E]' },
    // Спальный — дворецкий/садовник в кармане двора (не на фасаде)
    { id: 'town_steward', ...xy(c(9, 40)), label: 'Эдмунд [E]' },
    { id: 'town_gardener', ...xy(c(14, 38)), label: 'Садовник [E]' },
    // Переулок Шепотов
    { id: 'town_informant', ...xy(c(60, 28)), label: 'Информатор [E]' },
    // EmperyWorld HQ — часовой снаружи южных ворот
    { id: 'town_hq_sentry', ...xy(c(HQ_GATE_TX, HQ_GATE_TY + 1)), label: 'Часовой HQ [E]' },
    // Форум — городская доска объявлений
    { id: 'town_notice_board', ...xy(c(36, 17)), label: 'Доска объявлений [E]' },
    // Открытая сцена Форума — Бард Кай (сцена pass-through)
    { id: 'stage_bard', ...xy(c(42, 30)), label: 'Бард Кай [E]' },
    // Порт — шкиперы у причала, только когда судно в порту
    { id: 'harbor_skipper_barge', ...xy(c(51, 58)), label: 'Баржевой Томаш [E]' },
    { id: 'harbor_skipper_cog', ...xy(c(51, 66)), label: 'Шкипер кога [E]' },
    { id: 'harbor_skipper_fishing', ...xy(c(66, 59)), label: 'Шкипер Устья [E]' },
    { id: 'harbor_skipper_caravel', ...xy(c(66, 62)), label: 'Капитан каравеллы [E]' },
    { id: 'harbor_skipper_ferry', ...xy(c(66, 69)), label: 'Паромщик [E]' },
    { id: 'harbor_skipper_skiff', ...xy(c(74, 58)), label: 'Шкипер скифа [E]' },
    { id: 'harbor_skipper_brig', ...xy(c(89, 69)), label: 'Капитан брига [E]' },
  ],

  /** Survival [E] — колодцы, очаги и походные костры. */
  stations: [
    { id: 'haven_well_court', kind: 'water', ...xy(c(13, 45)), radius: 84 },
    { id: 'haven_well_forum', kind: 'water', ...xy(c(46, 22)), radius: 72 },
    // Трактир Марты — общественный очаг и котёл
    { id: 'haven_inn_hearth', kind: 'hearth', ...xy(c(58, 20)), radius: 140 },
    { id: 'haven_inn_pot', kind: 'pot', ...xy(c(58, 20)), radius: 140 },
    // Кузня Гарольда — горн и производственный котёл
    { id: 'haven_craft_hearth', kind: 'hearth', ...xy(c(12, 33)), radius: 140 },
    { id: 'haven_craft_pot', kind: 'pot', ...xy(c(12, 33)), radius: 140 },
    // Гарнизон и порт — походные костры
    { id: 'haven_garrison_campfire', kind: 'campfire', ...HAVEN_GARRISON_LAYOUT.hearth, radius: 140 },
    { id: 'haven_port_campfire', kind: 'campfire', ...xy(c(62, 47)), radius: 140 },
  ],

  zones: [
    { ...xy(c(40, 1)), label: '↑ К роще', color: '#c9e6a0', travelTo: 'starter_grove', radius: 200 },
    { ...xy(c(14, 9)), label: 'Гарнизон', color: '#8890a0' },
    { ...xy(c(40, 18)), label: 'Форум', color: '#d4c090' },
    { ...xy(c(42, 30)), label: 'Театр', color: '#c8a0b0' },
    { ...xy(c(12, 20)), label: 'Рынок', color: '#c9a66b' },
    { ...xy(c(14, 32)), label: 'Ремёсла', color: '#cc6644' },
    // ty44 раньше залезал под низ prop_tenement_block (footprint до ty≈44.25) —
    // указатель района был не виден за домом. Опустили на ty46, за колосс.
    { ...xy(c(16, 46)), label: 'Спальный', color: '#b89878' },
    // ty45 попадал в footprint prop_house_redroof (крыша ty47, но верх крыши
    // задирается до ty≈45.3) — указатель прятался за крышей. ty44.6 — в узком
    // переулке между рядами домов, чисто.
    { ...xy(c(27, 45)), label: 'Общинный сад', color: '#88bb66' },
    {
      ...xy(c(16, 45)),
      label: 'Дом жильцов',
      color: '#c8b090',
      travelTo: 'haven_apartment',
      arrival: { x: c(17, 46)[0], y: c(17, 46)[1] },
      radius: 72,
    },
    { ...xy(c(58, 10)), label: 'Муниципальный', color: '#a8c4e8' },
    { ...xy(c(60, 20)), label: 'Сервисный двор', color: '#dd8866' },
    { ...xy(c(62, 28)), label: 'Переулок Шепотов', color: '#6a5a78' },
    { ...xy(c(30, 38)), label: 'Конюшня', color: '#c8a878' },
    {
      ...xy(c(HQ_GATE_TX, HQ_GATE_TY)),
      label: 'Ворота EmperyWorld HQ',
      color: '#3aa0c8',
      travelTo: 'empery_hq',
      arrival: { x: c(63, 42)[0], y: c(63, 42)[1] },
      radius: 120,
    },
    { ...xy(c(64, 46)), label: 'Порт', color: '#88aacc' },
    { ...xy(c(22, 53)), label: 'Поля', color: '#d4c070' },
    { ...xy(c(14, 53)), label: 'Некрополь', color: '#9098a8' },
    { ...xy(c(78, 28)), label: 'Парк →', color: '#88bb88', travelTo: 'suburban_park', radius: 200 },
    { ...xy(c(40, 54)), label: '↓ Золотые поля', color: '#e8c878', travelTo: 'adena_fields', radius: 200, arrival: { x: c(40, 52)[0], y: c(40, 52)[1] } },
  ],

  /**
   * Уникальные постройки (каждый id ровно один раз).
   * Колоссы у NPC (barracks/inn/…) — в haven-npc-buildings.ts, сюда не дублируем.
   * [id, tx, ty, size, depth]
   */
  buildings: [
    // Ворота — узкий проём; башни вплотную к арке, стены стыкуются с пилонами.
    ['prop_city_gate', 40, WALL_N_TY, 240, 8],
    ['prop_city_gate_s', 40, WALL_S_TY, 240, 8],
    ['prop_city_gate_e', WALL_E_TX, 28, 220, 8],
    // Towers: sprites have ~56% opaque width — oversize so they visually meet the gate.
    ['prop_guard_tower', 37, WALL_N_TY, 210, 8],
    ['prop_guard_tower', 43, WALL_N_TY, 210, 8],
    ['prop_guard_tower', 37, WALL_S_TY, 210, 8],
    ['prop_guard_tower', 43, WALL_S_TY, 210, 8],
    ['prop_guard_tower', WALL_E_TX, 26, 200, 8],
    ['prop_guard_tower', WALL_E_TX, 30, 200, 8],
    // Порт: две башни, проём без створок — не «ворота в море».
    ['prop_guard_tower', 59, WALL_S_TY, 210, 8],
    ['prop_guard_tower', 65, WALL_S_TY, 210, 8],
    ['prop_guard_post', 60, WALL_S_TY - 2, 90, 6],
    ['prop_guard_post', 64, WALL_S_TY - 2, 90, 6],
    ['prop_banner_pole', 61, WALL_S_TY - 2, 70, 6],
    ['prop_banner_pole', 63, WALL_S_TY - 2, 70, 6],

    // ——— Гарнизон (СЗ): плац + цитадель (казарма — NPC-колосс) ———
    // Казарма (colossus, HAVEN_NPC_LANDMARK_EXCLUSIONS) занимает ~tx11–18,ty5–11
    // с паддингом в 1 тайл — весь плац строим вокруг этого прямоугольника,
    // а не поверх него (иначе пакер тихо раскидывает декор по всей карте).
    ['prop_keep_wing', 19, 8, 175, 7],
    ['prop_armory', 6, 8, 145, 7],
    ['prop_jail', 21, 11, 145, 7],
    ['prop_sparring_ring', 9, 13, 130, 5],
    ['prop_catapult', 6, 12, 120, 6],
    ['prop_ballista', 22, 5, 120, 6],
    ['prop_stocks', 20, 14, 85, 5],
    ['prop_pigeon_coop', 22, 9, 100, 6],
    ['prop_statue_imperial', 14, 5, 120, 6],

    // ——— Форум / центр (красота) ———
    ['prop_fountain', 40, 18, 220, 6],
    ['prop_clock_tower', 46, 16, 170, 7],
    
    // Переулок Шепотов
    ['prop_secret_arch', 60, 31, 200, 7],
    ['prop_hidden_bench', 63, 29, 80, 5],
    ['prop_shadow_lamp', 61, 28, 60, 5],

    // ——— EmperyWorld HQ (ворота Ю → двор → северный ряд) ———
    ['prop_hq_gate_closed', HQ_GATE_TX, HQ_GATE_TY, 220, 8],
    ['prop_hq_checkpoint', HQ_GATE_TX - 2, HQ_GATE_TY, 100, 6],
    ['prop_hq_checkpoint', HQ_GATE_TX + 2, HQ_GATE_TY, 100, 6],
    ['prop_hq_sniper_tower', HQ_TX0, HQ_TY0, 165, 8],
    ['prop_hq_sniper_tower', HQ_TX1, HQ_TY0, 165, 8],
    ['prop_hq_sniper_tower', HQ_TX0, HQ_TY1, 165, 8],
    ['prop_hq_sniper_tower', HQ_TX1, HQ_TY1, 165, 8],
    ['prop_hq_lab', HQ_CX - 3, HQ_CY - 2, 140, 7],
    ['prop_hq_building', HQ_CX, HQ_CY - 2, 260, 8],
    ['prop_hq_antenna', HQ_CX + 3, HQ_CY - 2, 110, 7],
    ['prop_hq_holo_sign', HQ_CX - 2, HQ_CY, 95, 6],
    ['prop_hq_pad', HQ_CX, HQ_CY + 1, 130, 5],
    ['prop_hq_lab', HQ_CX + 3, HQ_CY + 1, 120, 7],
    ['prop_hq_barrier', HQ_GATE_TX - 1, HQ_GATE_TY - 2, 70, 6],
    ['prop_hq_barrier', HQ_GATE_TX + 1, HQ_GATE_TY - 2, 70, 6],
    ['prop_hq_server_rack', HQ_CX + 4, HQ_CY, 85, 6],
    ['prop_hq_server_rack', HQ_CX + 4, HQ_CY - 1, 85, 6],
    ['prop_hq_panel', HQ_CX - 4, HQ_CY, 70, 6],
    ['prop_hq_floodlight', HQ_TX0 + 1, HQ_TY0 + 1, 64, 6],
    ['prop_hq_floodlight', HQ_TX1 - 1, HQ_TY0 + 1, 64, 6],
    ['prop_hq_floodlight', HQ_TX0 + 1, HQ_TY1 - 1, 64, 6],
    ['prop_hq_floodlight', HQ_TX1 - 1, HQ_TY1 - 1, 64, 6],

    ['prop_forum_arch', 40, 14, 155, 6],
    ['prop_colonnade', 34, 16, 130, 6],
    ['prop_obelisk', 36, 20, 110, 6],
    ['prop_victory_monument', 44, 20, 140, 6],
    ['prop_sundial', 42, 16, 80, 5],
    ['prop_notice_board', 36, 17, 66, 6],
    ['prop_crier_stand', 38, 21, 95, 6],
    ['prop_street_shrine', 44, 22, 75, 5],
    ['prop_aqueduct_arch', 30, 16, 150, 6],
    ['prop_cistern', 34, 22, 100, 5],
    ['prop_well', 46, 22, 88, 6],
    ['prop_statue_lion', 36, 14, 95, 6],
    ['prop_statue_lion', 44, 14, 95, 6],

    // ——— Муниципальный / храмовый (СВ) ———
    // Крупнее визуально — самое важное гражданское здание квартала,
    // а спрайт на 230 выглядел скромнее школы/собора (setDisplaySize = size).
    ['prop_governor_palace', 68, 10, 300, 7],
    ['prop_scriptorium', 60, 7, 155, 7],
    ['prop_imperial_archive', 64, 7, 150, 7],
    ['prop_palace_kitchen', 72, 12, 145, 7],
    ['prop_garden_fountain', 66, 14, 110, 5],
    ['prop_garden_pergola', 70, 14, 115, 5],
    ['prop_villa_garden', 72, 16, 130, 5],
    ['prop_east_garden_pool', 68, 16, 110, 5],
    ['prop_carriage', 64, 12, 115, 6],
    ['prop_rose_arch', 56, 12, 100, 5],

    // ——— Театр (юг форума) — open_stage ставит placeHavenStage ———
    ['prop_open_stage', 42, 30, 200, 6],
    ['prop_gazebo', 36, 28, 150, 6],
    ['prop_chapel', 46, 28, 150, 7],

    // ——— Рынок (З) — торговый зал / гильдия / лавки (trade_hall+butcher — NPC) ———
    ['prop_guildhall', 8, 16, 200, 7],
    ['prop_shop_front', 16, 18, 145, 7],
    ['prop_bakery', 10, 24, 135, 7],
    ['prop_jeweler', 14, 24, 125, 7],
    ['prop_apothecary', 4, 24, 130, 7],
    ['prop_moneylender', 18, 20, 125, 7],
    ['prop_tailor', 4, 19, 120, 7],
    ['prop_perfume_stall', 12, 18, 95, 6],
    ['prop_spice_stall', 14, 20, 95, 6],
    ['prop_weigh_house', 16, 22, 140, 7],
    ['prop_public_oven', 10, 25, 110, 6],
    ['prop_barber', 20, 18, 120, 7],

    // ——— Ремёсла (ЮЗ от рынка) — западнее/севернее террасы ty34 ———
    ['prop_carpenter', 8, 30, 140, 7],
    ['prop_cheese_shop', 4, 28, 120, 7],
    ['prop_candle_shop', 14, 28, 118, 7],
    ['prop_pottery_kiln', 16, 28, 100, 6],
    ['prop_weaver_loom', 18, 30, 100, 6],
    ['prop_mason_shed', 8, 32, 135, 7],
    ['prop_glassblower', 4, 30, 135, 7],
    ['prop_cobbler', 12, 29, 125, 7],
    ['prop_wagon_workshop', 16, 32, 130, 7],
    ['prop_dye_vat', 10, 30, 100, 6],
    ['prop_leatherworker', 24, 30, 135, 7],
    ['prop_granary', 28, 32, 160, 7],
    ['prop_millstone', 18, 34, 78, 5],

    // ——— Сервисный двор (В) ———
    ['prop_tea_house', 66, 20, 155, 7],
    ['prop_fire_brigade', 52, 20, 145, 7],
    ['prop_tavern_sign', 56, 17, 72, 6],

    // ——— Конюшня / центр-юг ———
    ['prop_watch_house', 74, 26, 145, 7],

    // ——— Порт: набережная на суше (ty≤48), З→В зонами ———
    // Запад: таможня у подхода к причалу
    ['prop_customs_house', 55, 44, 160, 7],
    ['prop_anchor_monument', 59, 47, 110, 6],
    // Центр у арки: карты / капитан
    ['prop_map_shop', 62, 45, 120, 7],
    ['prop_harbor_bell', 64, 47, 80, 6],
    ['prop_captain_hut', 68, 44, 120, 6],
    // Восток: судовая лавка → докерский трактир → смотровая / канаты / маяк
    ['prop_ship_chandler', 70, 44, 145, 7],
    ['prop_dock_tavern', 74, 43, 155, 7],
    ['prop_ropewalk', 72, 47, 125, 6],
    ['prop_pilot_lookout', 76, 46, 130, 7],
    ['prop_lighthouse', 85, 67, 240, 7],
    // Кран на грузовом причале (камень, не в проходе арки)
    ['prop_harbor_crane', 55, 56, 200, 6],

    // ——— Хутор / поля: без жилых домов со стороны флота (см. farmFields) ———

    // Ворота: святилища / столбы / львы / посты
    ['prop_gate_shrine', 38, 5, 80, 5],
    ['prop_gate_shrine', 42, 5, 80, 5],
    ['prop_town_milestone', 40, 6, 70, 5],
    ['prop_town_milestone', 40, WALL_S_TY - 3, 70, 5],
    ['prop_statue_lion', 36, 4, 90, 6],
    ['prop_statue_lion', 44, 4, 90, 6],
    ['prop_guard_post', 38, 4, 85, 6],
    ['prop_guard_post', 42, 4, 85, 6],
    ['prop_signpost', 32, 18, 70, 6],
    ['prop_signpost', 48, 24, 70, 6],
    ['prop_signpost', 54, 40, 68, 6],
    ['prop_signpost', 70, 28, 68, 6],
    ['prop_banner_pole', 37, 5, 78, 6],
    ['prop_banner_pole', 43, 5, 78, 6],
    ['prop_wall_brazier', 34, 3, 55, 6],
    ['prop_wall_brazier', 46, 3, 55, 6],
    ['prop_wall_brazier', 37, WALL_S_TY - 1, 55, 6],
    ['prop_wall_brazier', 43, WALL_S_TY - 1, 55, 6],
  ],

  /** Ансамбли без дублей landmark-зданий. */
  complexes: [
    ['prop_colonnade', 56, 13, 120, 6],
    ['prop_planter', 38, 15, 56, 5],
    ['prop_planter', 42, 15, 56, 5],
    ['prop_flower_bed', 36, 18, 85, 4],
    ['prop_banner_pole', 36, 14, 72, 6],
    ['prop_banner_pole', 44, 14, 72, 6],
    ['prop_bush_garden', 66, 12, 70, 4],
    ['prop_orchard_tree', 72, 18, 95, 4],
  ],

  /**
   * Спальный — архитектурные сеты + органические сдвиги фасада + Г/П дворы.
   * Собрано в buildHavenResidentialLayout(); [id, tx, ty] | [id, tx, ty, size].
   */
  houses: RESIDENTIAL.houses,

  market: [
    ['prop_market_canopy', 10, 20, 140, 6],
    ['prop_market_stall', 8, 22, 92, 6],
    ['prop_spice_stall', 12, 22, 100, 6],
    ['prop_basket_stall', 14, 20, 95, 6],
    ['prop_produce_cart', 10, 18, 95, 5],
    ['prop_flower_cart', 16, 20, 95, 5],
    ['prop_merchant_cart', 18, 22, 90, 6],
    ['prop_crate_stack', 6, 20, 68, 5],
    ['prop_barrels', 14, 18, 64, 5],
  ],

  innYard: [
    ['prop_bench', 56, 20, 64, 5],
    ['prop_outdoor_table', 60, 20, 90, 5],
    ['prop_keg_rack', 64, 20, 95, 5],
    ['prop_grape_arbor', 62, 24, 105, 5],
    ['prop_planter', 56, 18, 54, 5],
    ['prop_barrels', 60, 18, 64, 5],
  ],

  bathYard: [
    ['prop_steam_vent', 52, 22, 70, 5],
    ['prop_bench', 54, 21, 60, 5],
    ['prop_planter', 52, 20, 52, 5],
    ['prop_rain_barrel', 56, 24, 55, 4],
  ],

  libraryYard: [
    ['prop_book_cart', 58, 8, 88, 5],
    ['prop_bench', 56, 8, 62, 5],
    ['prop_planter', 62, 9, 52, 5],
    ['prop_street_lamp', 58, 10, 58, 6],
  ],

  millYard: [
    ['prop_flour_sacks', 20, 34, 78, 5],
    ['prop_flour_sacks', 21, 35, 70, 5],
    ['prop_wagon', 24, 38, 95, 6],
    ['prop_barrels', 18, 36, 64, 5],
    ['prop_barrels', 23, 34, 60, 5],
    ['prop_crate_stack', 19, 36, 64, 5],
    ['prop_wheelbarrow', 21, 33, 68, 5],
    ['prop_street_lamp', 20, 32, 58, 6],
    ['prop_signpost', 22, 33, 64, 6],
  ],

  craftYard: [
    // Центр ремёсел — верстаки и пиломатериалы
    ['prop_scaffold', 10, 32, 80, 5],
    ['prop_scaffold', 7, 31, 75, 5],
    ['prop_workbench', 7, 29, 88, 5],
    ['prop_workbench', 15, 29, 85, 5],
    ['prop_plank_stack', 9, 29, 90, 5],
    ['prop_plank_stack', 11, 31, 85, 5],
    ['prop_crate_stack', 12, 30, 66, 5],
    ['prop_crate_stack', 17, 29, 62, 5],
    ['prop_barrels', 8, 32, 62, 5],
    ['prop_barrels', 15, 32, 60, 5],
    ['prop_firewood', 9, 33, 68, 4],
    ['prop_weapon_rack', 13, 31, 70, 5],
    // Улицы / вход
    ['prop_street_lamp', 8, 28, 58, 6],
    ['prop_street_lamp', 14, 28, 58, 6],
    ['prop_banner_pole', 12, 28, 70, 6],
    ['prop_notice_board', 12, 29, 65, 5],
    ['prop_bench', 11, 28, 58, 5],
    ['prop_dye_vat', 7, 35, 90, 5],
    ['prop_chimney_smoke', 8, 29, 68, 7],
    ['prop_wheelbarrow', 13, 33, 68, 5],
    ['prop_signpost', 10, 30, 64, 6],
  ],

  parkYard: [
    ['prop_bench', 10, 6, 64, 5],
    ['prop_bench', 14, 6, 64, 5],
    ['prop_planter', 10, 5, 54, 5],
    ['prop_planter', 14, 5, 54, 5],
    ['prop_bush_garden', 8, 6, 70, 4],
    ['prop_beehive', 12, 7, 55, 4],
  ],

  stageYard: [
    ['prop_bench', 40, 32, 64, 5],
    ['prop_bench', 44, 32, 64, 5],
    ['prop_bench', 38, 34, 62, 5],
    ['prop_bench', 46, 34, 62, 5],
    ['prop_planter', 38, 30, 52, 5],
    ['prop_planter', 46, 30, 52, 5],
    ['prop_crate_stack', 48, 30, 68, 5],
  ],

  eastGateYard: [
    ['prop_banner_pole', 74, 28, 72, 6],
    ['prop_weapon_rack', 74, 27, 70, 5],
    ['prop_shield_stack', 74, 30, 75, 5],
    ['prop_bench', 72, 28, 60, 5],
    ['prop_planter', 72, 26, 52, 5],
  ],

  memorialGarden: [
    ['prop_grave_angel', 14, 53, 130, 6],
    ['prop_tombstone', 11, 52, 72, 5],
    ['prop_tombstone', 16, 52, 70, 5],
    ['prop_tombstone', 12, 54, 68, 5],
    ['prop_tombstone', 17, 54, 68, 5],
    ['prop_bush_garden', 10, 52, 65, 4],
    ['prop_candle_stand', 13, 53, 58, 5],
    ['prop_gate_shrine', 14, 52, 75, 5],
  ],

  courtYard: [
    // ——— Площадь тенемента (центр квартала, tx14–19) ———
    ['prop_neighborhood_gate', 16, 36, 128, 6],
    ['prop_banner_pole', 16, 36, 70, 6],
    ['prop_string_lights', 15, 37, 110, 5],
    ['prop_notice_board', 17, 37, 68, 6],
    ['prop_town_milestone', 15, 38, 58, 5],
    ['prop_neighborhood_well', 16, 41, 110, 6],
    ['prop_bench', 14, 41, 62, 5],
    ['prop_sundial', 18, 41, 55, 5],
    ['prop_planter', 15, 40, 52, 5],
    ['prop_flower_bed', 17, 40, 78, 4],
    ['prop_street_lamp', 14, 39, 60, 6],
    ['prop_street_lamp', 18, 39, 58, 6],
    ['prop_string_lights', 16, 43, 130, 5],
    ['prop_playground_sandbox', 16, 45, 85, 5],
    ['prop_hopscotch', 18, 44, 85, 4],
    ['prop_garden_pergola', 15, 46, 105, 5],
    ['prop_bench', 17, 46, 60, 5],
    ['prop_water_pump', 15, 48, 68, 5],
    ['prop_street_shrine', 18, 48, 68, 5],
    ['prop_yard_fountain', 16, 47, 88, 5],
    // ——— Переулок 1 (ty 40–41) — крылья ряда Wooden, дымоходы, почта, бельё ———
    // prop_picket_fence убран: переулок плотно занят домами/декором, пакер
    // не находит свободного тайла в радиусе поиска — лучше не класть на стену.
    ['prop_mailbox', 5, 41, 48, 5],
    ['prop_mailbox', 30, 41, 48, 5],
    ['prop_clothesline', 12, 41, 95, 4],
    ['prop_rain_barrel', 13, 40, 55, 4],
    ['prop_window_box', 5, 40, 55, 5],
    ['prop_window_box', 29, 40, 55, 5],
    ['prop_chimney_smoke', 5, 37, 70, 7],
    ['prop_chimney_smoke', 12, 37, 70, 7],
    ['prop_chimney_smoke', 22, 37, 68, 7],
    ['prop_chimney_smoke', 29, 37, 70, 7],
    ['prop_street_lamp', 21, 41, 58, 6],
    ['prop_bush_garden', 4, 41, 68, 4],
    ['prop_bush_garden', 31, 41, 68, 4],
    ['prop_signpost', 20, 40, 66, 6],
    // ——— Переулок 2 (ty 45) — крылья ряда Merchant, грядки, курятник ———
    ['prop_laundry_tub', 6, 45, 78, 4],
    ['prop_chicken_coop', 30, 45, 74, 5],
    ['prop_firewood', 8, 45, 68, 4],
    ['prop_herb_garden', 12, 45, 78, 4],
    ['prop_street_lamp', 21, 45, 58, 6],
    ['prop_street_shrine', 13, 45, 68, 5],
    ['prop_chimney_smoke', 5, 46, 70, 7],
    ['prop_chimney_smoke', 12, 46, 70, 7],
    ['prop_chimney_smoke', 22, 46, 68, 7],
    ['prop_chimney_smoke', 29, 46, 70, 7],
  ],

  farmFields: [
    ['prop_haystack', 18, 52, 100, 5],
    ['prop_haystack', 28, 53, 95, 5],
    ['prop_scarecrow', 24, 54, 80, 5],
    ['prop_wheat_sheaf', 20, 54, 74, 5],
    ['prop_hay_cart', 26, 52, 90, 5],
    ['prop_orchard_tree', 30, 54, 90, 4],
  ],

  plazaDecor: [
    ['prop_planter', 34, 18, 58, 5],
    ['prop_planter', 46, 18, 58, 5],
    ['prop_bench', 34, 19, 68, 5],
    ['prop_bench', 46, 19, 68, 5],
    ['prop_banner_pole', 34, 14, 72, 6],
    ['prop_memorial_stone', 38, 22, 80, 5],
  ],

  garrisonYard: [
    ['prop_wall_brazier', 12, 4, 55, 6],
    ['prop_banner_pole', 11, 5, 74, 6],
    ['prop_banner_pole', 18, 5, 74, 6],
    ['prop_soldier_tent', 5, 5, 105, 5],
    ['prop_weapon_rack', 4, 6, 72, 5],
    ['prop_barrels', 5, 6, 58, 5],
    ['prop_street_lamp', 4, 4, 58, 6],
    ['prop_street_lamp', 10, 5, 58, 6],
    ['prop_archery_target', 5, 7, 78, 5],
    ['prop_notice_board', 21, 4, 62, 5],
    ['prop_street_lamp', 23, 5, 58, 6],
    ['prop_soldier_tent', 22, 13, 100, 5],
    ['prop_bench', 12, 13, 58, 5],
    ['prop_water_trough', 22, 14, 72, 5],
  ],

  cathedralGarden: [
    ['prop_candle_stand', 52, 10, 70, 5],
    ['prop_bush_garden', 52, 12, 72, 4],
    ['prop_bench', 52, 11, 64, 5],
    ['prop_herb_garden', 48, 12, 85, 5],
    ['prop_herb_drying_rack', 46, 12, 88, 5],
  ],

  smithYard: [
    ['prop_anvil', 12, 32, 70, 5],
    ['prop_coal_pile', 14, 33, 75, 5],
    ['prop_chimney_smoke', 12, 30, 76, 5],
    ['prop_firewood', 10, 33, 68, 4],
    ['prop_weapon_rack', 13, 31, 72, 5],
    ['prop_barrels', 14, 31, 58, 5],
    ['prop_street_lamp', 12, 34, 56, 6],
    ['prop_water_trough', 14, 34, 70, 5],
  ],

  stableYard: [
    ['prop_hay_cart', 26, 37, 90, 5],
    ['prop_water_trough', 32, 38, 86, 5],
    ['prop_hitching_post', 28, 38, 70, 5],
    ['prop_barrels', 32, 40, 64, 5],
  ],

  alleyYards: [
    ['prop_clothesline', 8, 42, 95, 4],
    ['prop_clothesline', 20, 44, 95, 4],
    ['prop_firewood', 10, 40, 70, 4],
    ['prop_rain_barrel', 22, 44, 55, 4],
  ],

  dock: [
    // Суша у стены (не акватория): переход рынок → док
    ['prop_covered_wagon', 53, 45, 110, 6],
    ['prop_crate_stack', 54, 47, 72, 5],
    ['prop_barrels', 56, 47, 60, 5],
    ['prop_salt_stacks', 56, 44, 80, 5],
    ['prop_amphora_stack', 54, 44, 90, 5],
    // Набережная: кнехты по кромке, без решётки ящиков
    ['prop_quay_bollard', 52, 54, 56, 5],
    ['prop_quay_bollard', 60, 54, 56, 5],
    ['prop_quay_bollard', 70, 54, 56, 5],
    ['prop_quay_bollard', 78, 54, 56, 5],
    ['prop_dock_rope', 80, 54, 56, 5],
    // Грузовой палец: кран + кнехты
    ['prop_quay_bollard', 51, 58, 56, 5],
    ['prop_quay_bollard', 59, 61, 56, 5],
    ['prop_quay_bollard', 51, 66, 56, 5],
    ['prop_quay_bollard', 59, 70, 56, 5],
    ['prop_dock_rope', 59, 57, 56, 5],
    // Рыбацкий палец: один прилавок у берта
    ['prop_fish_stall', 66, 55, 160, 6],
    ['prop_quay_bollard', 66, 58, 56, 5],
    ['prop_quay_bollard', 74, 62, 56, 5],
    ['prop_quay_bollard', 66, 68, 56, 5],
    // Мол маяка
    ['prop_quay_bollard', 80, 55, 56, 5],
    ['prop_quay_bollard', 89, 58, 56, 5],
    ['prop_quay_bollard', 80, 64, 56, 5],
    ['prop_quay_bollard', 89, 68, 56, 5],
    ['prop_dock_rope', 80, 55, 56, 5],
    ['prop_ship_fishing', 61, 59, 280, 5],
    ['prop_ship_skiff', 76, 58, 130, 5],
    ['prop_ship_barge', 47, 58, 400, 5],
    ['prop_ship_cog', 47, 66, 440, 5],
    ['prop_ship_caravel', 62, 62, 500, 5],
    ['prop_ship_ferry', 62, 70, 440, 5],
    ['prop_ship_brig', 96, 74, 560, 5],
  ],

  lamps: [
    [36, 6], [44, 6], [36, 18], [44, 18], [36, 30], [44, 42],
    [8, 10], [12, 16], [10, 28],
    [54, 10], [58, 20], [64, 22],
    [58, 42], [30, 38],
  ],

  greenery: [
    [6, 6], [54, 5], [74, 8],
    [6, 28], [74, 34],
    [24, 28],
    [18, 52], [32, 52],
  ],
};

function isLandGateGap(tx, ty, side) {
  // Match ~240px gate footprint (~3 tiles) so wall segments abut the piers.
  if (side === 'n') return ty === WALL_N_TY && tx >= 39 && tx <= 41;
  if (side === 's') return ty === WALL_S_TY && tx >= 39 && tx <= 41;
  if (side === 'e') return tx === WALL_E_TX && ty >= 27 && ty <= 29;
  return false;
}

function isHarborGateGap(tx, ty) {
  return ty === WALL_S_TY && tx >= 60 && tx <= 64;
}

/**
 * Полное кольцо стены по суше + портовый проём в южной стене.
 */
export function havenWallPlacements() {
  /** @type {Array<[string, number, number, number, number]>} */
  const out = [];
  const depth = 8;
  const hSize = 148;
  /** Wider stubs that bite into gate jambs so the curtain reads continuous. */
  const hSizeGate = 176;
  const vSize = 148;
  const vSizeGate = 176;
  const step = 2;
  /** Guard towers flank land gates — skip duplicate wall tiles under them. */
  const eastTowerTy = new Set([26, 30]);

  // Четыре угла (все на суше: юг = WALL_S_TY)
  for (const [tx, ty] of [
    [WALL_W_TX, WALL_N_TY],
    [WALL_E_TX, WALL_N_TY],
    [WALL_W_TX, WALL_S_TY],
    [WALL_E_TX, WALL_S_TY],
  ]) {
    out.push(['prop_wall_tower', ...c(tx, ty), 138, depth]);
  }

  // Север — только городское кольцо
  for (let tx = 4; tx <= WALL_E_TX - 2; tx += step) {
    if (isLandGateGap(tx, WALL_N_TY, 'n')) continue;
    if (tx === 20 || tx === 60) out.push(['prop_wall_tower', ...c(tx, WALL_N_TY), 122, depth]);
    else {
      const sz = tx === 38 || tx === 42 ? hSizeGate : hSize;
      out.push(['prop_city_wall_n', ...c(tx, WALL_N_TY), sz, depth]);
    }
  }

  // Юг — полный, с сухопутными и портовыми воротами
  for (let tx = 4; tx <= WALL_E_TX - 2; tx += step) {
    if (isLandGateGap(tx, WALL_S_TY, 's')) continue;
    if (isHarborGateGap(tx, WALL_S_TY)) continue;
    if (tx === 20 || tx === 72) out.push(['prop_wall_tower', ...c(tx, WALL_S_TY), 122, depth]);
    else {
      const sz =
        tx === 38 || tx === 42 || tx === 58 || tx === 66 ? hSizeGate : hSize;
      out.push(['prop_city_wall_s', ...c(tx, WALL_S_TY), sz, depth]);
    }
  }

  // Запад
  for (let ty = 4; ty <= WALL_S_TY - 2; ty += step) {
    if (ty === 16 || ty === 36) out.push(['prop_wall_tower', ...c(WALL_W_TX, ty), 122, depth]);
    else out.push(['prop_city_wall_w', ...c(WALL_W_TX, ty), vSize, depth]);
  }

  // Восток — полный до южного угла
  for (let ty = 4; ty <= WALL_S_TY - 2; ty += step) {
    if (isLandGateGap(WALL_E_TX, ty, 'e')) continue;
    if (eastTowerTy.has(ty)) continue;
    if (ty === 16 || ty === 40) out.push(['prop_wall_tower', ...c(WALL_E_TX, ty), 122, depth]);
    else {
      const sz = ty === 24 || ty === 32 ? vSizeGate : vSize;
      out.push(['prop_city_wall_e', ...c(WALL_E_TX, ty), sz, depth]);
    }
  }

  return out;
}

/** Closed campus + south gate gap. Must run after stampWalk. */
export function stampHqCompound(rect, d) {
  rect(d, HQ_TX0, HQ_TY0, HQ_TX1 - HQ_TX0 + 1, 1, 4);
  rect(d, HQ_TX0, HQ_TY1, HQ_TX1 - HQ_TX0 + 1, 1, 4);
  rect(d, HQ_TX0, HQ_TY0, 1, HQ_TY1 - HQ_TY0 + 1, 4);
  rect(d, HQ_TX1, HQ_TY0, 1, HQ_TY1 - HQ_TY0 + 1, 4);
  rect(d, HQ_TX0 + 1, HQ_TY0 + 1, HQ_TX1 - HQ_TX0 - 1, HQ_TY1 - HQ_TY0 - 1, 2);
  rect(d, HQ_GATE_TX - 1, HQ_TY1, 3, 1, 2);
  rect(d, HQ_GATE_TX - 1, HQ_TY1, 3, 3, 2);
}

export function havenHotspots() {
  const pts = [HAVEN.spawn];
  for (const n of HAVEN.npcs) pts.push([n.x, n.y]);
  for (const z of HAVEN.zones) pts.push([z.x, z.y]);
  for (const [, tx, ty] of HAVEN.buildings) pts.push(c(tx, ty));
  for (const [, tx, ty] of HAVEN.complexes) pts.push(c(tx, ty));
  for (const [, tx, ty] of HAVEN.houses) pts.push(c(tx, ty));
  for (const block of [
    HAVEN.market,
    HAVEN.innYard,
    HAVEN.bathYard,
    HAVEN.libraryYard,
    HAVEN.millYard,
    HAVEN.craftYard,
    HAVEN.parkYard,
    HAVEN.stageYard,
    HAVEN.eastGateYard,
    HAVEN.memorialGarden,
    HAVEN.courtYard,
    HAVEN.farmFields,
    HAVEN.dock,
    HAVEN.plazaDecor,
    HAVEN.stableYard,
    HAVEN.smithYard,
    HAVEN.garrisonYard,
    HAVEN.cathedralGarden,
    HAVEN.alleyYards,
  ]) {
    for (const row of block) pts.push(c(row[1], row[2]));
  }
  for (const [tx, ty] of HAVEN.lamps) pts.push(c(tx, ty));
  return pts;
}

export function buildHavenTiles(rect, border, gate, base, stampWalk) {
  /** GID: 1 plaza/dirt/apron · 2 stone road · 3 water · 4 wall · 5 gravel yard · 6 apron brick */
  const STONE = 2;
  const DIRT = 1;
  const GRAVEL = 5;
  const APRON = 6;
  const d = base(DIRT);

  border(d, 4);
  rect(d, 1, WALL_N_TY - 1, WALL_E_TX - 1, 2, 4);
  rect(d, 1, WALL_S_TY, WALL_E_TX - 1, 2, 4);
  rect(d, WALL_W_TX - 1, 1, 2, WALL_S_TY, 4);
  rect(d, WALL_E_TX, 1, 2, WALL_S_TY + 1, 4);
  gate(d, 39, 0, 3, WALL_N_TY + 1, STONE);
  gate(d, 39, WALL_S_TY, 3, 3, STONE);
  gate(d, WALL_E_TX, 27, 3, 3, STONE);
  gate(d, 60, WALL_S_TY, 5, 2, STONE);

  // ——— Главные каменные артерии (ширина 3) ———
  // N–S форум / ворота
  rect(d, 38, 1, 3, WALL_S_TY, STONE);
  // E–W бульвар через форум (только внутри кольца)
  rect(d, 3, 18, WALL_E_TX - 5, 3, STONE);
  // К гарнизону (СЗ)
  rect(d, 12, 6, 3, 14, STONE);
  rect(d, 12, 8, 28, 3, STONE);
  // К собору / муниципальному (СВ)
  rect(d, 48, 8, 3, 12, STONE);
  rect(d, 48, 10, 22, 3, STONE);
  // К рынку (З)
  rect(d, 6, 16, 3, 10, STONE);
  rect(d, 4, 19, 12, 3, STONE);
  // К ремёслам / кузне
  rect(d, 10, 21, 3, 16, STONE);
  // К конюшне (камень → грунт ниже)
  rect(d, 26, 21, 3, 14, STONE);
  rect(d, 26, 35, 3, 6, GRAVEL);
  rect(d, 22, 37, 14, 4, GRAVEL);
  // К порту / HQ (обход кампуса с запада)
  rect(d, 52, 21, 3, 20, STONE);
  rect(d, 52, 38, 18, 3, STONE);
  rect(d, HQ_GATE_TX - 1, HQ_GATE_TY, 3, 6, STONE);
  // К школе / театру
  rect(d, 40, 21, 3, 16, STONE);
  rect(d, 38, 28, 10, 3, STONE);

  // ——— Площади (гравий) у POI ———
  rect(d, 30, 14, 20, 10, GRAVEL); // форум
  rect(d, 4, 15, 16, 10, GRAVEL); // рынок
  rect(d, 52, 14, 20, 12, GRAVEL); // трактир / сервис
  rect(d, 44, 6, 18, 10, GRAVEL); // соборный двор
  rect(d, 8, 5, 16, 8, GRAVEL); // гарнизонный плац
  rect(d, 8, 28, 14, 10, GRAVEL); // кузня
  rect(d, 54, 40, 18, 8, GRAVEL); // порт / набережная

  // ——— Спальный: две террасных улицы-крыла вокруг тенемента ———
  rect(d, 3, 35, 29, 15, APRON); // весь квартал (обе крыла + площадь тенемента)
  // Переулки между рядами (дверной карман + двор-колодец)
  rect(d, 3, 40, 29, 2, DIRT); // переулок 1 (после ряда Wooden)
  rect(d, 3, 45, 29, 1, DIRT); // переулок 2 (после ряда Stone)
  // Площадь тенемента между крыльями (центр квартала)
  rect(d, 14, 36, 6, 14, GRAVEL);
  rect(d, 16, 36, 2, 4, STONE); // связка к ремёслам

  // Отмостка под колоссы (AABB footprint + 1 тайл ≈ size*0.72/64 + 2)
  const apronAround = (tx, ty, halfW, halfH) => {
    rect(d, tx - halfW, ty - halfH, halfW * 2 + 1, halfH * 2 + 1, APRON);
  };
  apronAround(12, 20, 3, 3); // trade
  apronAround(7, 20, 3, 3); // butcher
  apronAround(18, 24, 3, 3); // radio
  apronAround(12, 32, 3, 3); // smith
  apronAround(22, 34, 3, 3); // mill
  apronAround(30, 38, 3, 3); // stable → gravel blend
  rect(d, 27, 36, 8, 6, GRAVEL);
  apronAround(58, 18, 4, 3); // inn
  apronAround(54, 22, 3, 3); // bath
  apronAround(64, 22, 3, 3); // brew
  apronAround(48, 14, 3, 3); // healer
  apronAround(54, 9, 4, 3); // cathedral
  apronAround(60, 6, 3, 3); // library
  apronAround(44, 36, 3, 3); // school
  apronAround(14, 8, 4, 3); // barracks
  apronAround(66, 43, 3, 3); // fish
  apronAround(58, 42, 3, 3); // warehouse
  apronAround(16, 42, 4, 4); // tenement

  // Террасы: отмостка под каждым домом, ширина по факту размера (+1 тайл)
  for (const row of HAVEN.houses) {
    if (!String(row[0]).startsWith('prop_house_')) continue;
    const [, tx, ty, size] = row;
    const txi = Math.round(Number(tx));
    const tyi = Math.round(Number(ty));
    const half = Math.round(Number(size ?? 192) / TW / 2) + 1;
    rect(d, txi - half, tyi - half, half * 2 + 1, half * 2 + 1, APRON);
  }

  // Юг снаружи: поля (З, tx<44) + акватория (В)
  rect(d, 2, WALL_S_TY + 2, 42, H - WALL_S_TY - 2, DIRT);
  rect(d, 30, WALL_S_TY + 2, 16, 8, STONE);
  rect(d, 36, WALL_S_TY, 8, 5, STONE);
  rect(d, 14, WALL_S_TY, 2, 4, STONE);
  rect(d, 8, 51, 36, 4, DIRT);
  rect(d, 9, 51, 12, 4, GRAVEL); // некрополь

  stampWalk(d, havenHotspots(), STONE);

  // Стены / ворота / река снова (stampWalk не ломает геометрию)
  rect(d, 1, WALL_N_TY - 1, WALL_E_TX - 1, 2, 4);
  rect(d, 1, WALL_S_TY, WALL_E_TX - 1, 2, 4);
  rect(d, WALL_W_TX - 1, 1, 2, WALL_S_TY, 4);
  rect(d, WALL_E_TX, 1, 2, WALL_S_TY + 1, 4);
  gate(d, 39, 0, 3, WALL_N_TY + 1, STONE);
  gate(d, 39, WALL_S_TY, 3, 3, STONE);
  gate(d, WALL_E_TX, 27, 3, 3, STONE);
  gate(d, 60, WALL_S_TY, 5, 2, STONE);

  rect(d, 2, WALL_S_TY + 2, 42, H - WALL_S_TY - 2, DIRT);
  rect(d, 30, WALL_S_TY + 2, 16, 8, STONE);

  // Акватория: южнее стены и восточнее кольца (sync: packages/shared haven-harbor.ts)
  rect(d, 44, WALL_S_TY + 1, W - 44, H - WALL_S_TY - 1, 3);
  rect(d, WALL_E_TX + 1, 40, W - WALL_E_TX - 1, WALL_S_TY - 39, 3);
  // Деревянная набережная + широкие рабочие причалы / мол
  rect(d, 50, WALL_S_TY + 1, 40, 4, STONE);
  rect(d, 51, 55, 9, 17, STONE);
  rect(d, 66, 55, 9, 15, STONE);
  rect(d, 80, 51, 10, 20, STONE);

  stampHqCompound(rect, d);
  diversifyHavenGround(d);
  return d;
}

/** Stable hash — keep in sync with apps/client/.../terrain-tiles.ts */
function terrainVariantIndex(tx, ty, salt, n) {
  const v = Math.imul(tx + 1, 374761393) ^ Math.imul(ty + 1, 668265263) ^ Math.imul(salt, 1274126177);
  return Math.abs(v) % Math.max(1, n);
}

function diversifyHavenGround(data) {
  const plaza = [1, 5, 6];
  const road = [2, 7, 8];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx;
      const g = data[i];
      if (g === 1 || g === 5 || g === 6) {
        data[i] = plaza[terrainVariantIndex(tx, ty, 11, plaza.length)];
      } else if (g === 2 || g === 7 || g === 8) {
        data[i] = road[terrainVariantIndex(tx, ty, 29, road.length)];
      }
    }
  }
}

/**
 * Колоссы из apps/client/.../haven-npc-buildings.ts + tenement.
 * Городские пропы не должны вставать на эти footprints.
 */
export const HAVEN_NPC_LANDMARK_EXCLUSIONS = [
  { prop: 'prop_tenement_block', x: 1056, y: 2720, size: 400 },
  { prop: 'prop_trade_hall', x: 800, y: 1312, size: 300 },
  { prop: 'prop_butcher', x: 480, y: 1312, size: 260 },
  { prop: 'prop_radio_booth', x: 1184, y: 1568, size: 240 },
  { prop: 'prop_blacksmith', x: 800, y: 2080, size: 300 },
  { prop: 'prop_windmill', x: 1440, y: 2208, size: 300 },
  { prop: 'prop_stable', x: 1952, y: 2464, size: 300 },
  { prop: 'prop_inn', x: 3744, y: 1184, size: 340 },
  { prop: 'prop_bathhouse', x: 3488, y: 1440, size: 280 },
  { prop: 'prop_brewery', x: 4128, y: 1440, size: 280 },
  { prop: 'prop_healer_hall', x: 3104, y: 928, size: 280 },
  { prop: 'prop_cathedral', x: 3488, y: 608, size: 360 },
  { prop: 'prop_library', x: 3872, y: 416, size: 260 },
  { prop: 'prop_schoolhouse', x: 2848, y: 2336, size: 300 },
  { prop: 'prop_barracks', x: 928, y: 544, size: 320 },
  { prop: 'prop_fishmonger', x: 4256, y: 2784, size: 260 },
  { prop: 'prop_warehouse', x: 3744, y: 2720, size: 300 },
];

function havenFootprint(x, y, size) {
  const w = size * 0.72;
  const h = size * 0.62;
  const cy = y - size * 0.08;
  return { L: x - w / 2, R: x + w / 2, T: cy - h / 2, B: cy + h / 2 };
}

/** Visual sprite quad (origin 0.5 / 0.72) — z-fighting between buildings. */
function spriteAabb(x, y, size) {
  return {
    L: x - size * 0.5,
    R: x + size * 0.5,
    T: y - size * 0.72,
    B: y + size * 0.28,
  };
}

function footprintsOverlap(a, b, pad = 6) {
  return a.R > b.L + pad && a.L < b.R - pad && a.B > b.T + pad && a.T < b.B - pad;
}

function tilesOfBox(box) {
  const tx0 = Math.floor(box.L / TW);
  const ty0 = Math.floor(box.T / TW);
  const tx1 = Math.floor((box.R - 0.01) / TW);
  const ty1 = Math.floor((box.B - 0.01) / TW);
  const out = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) out.push(`${tx},${ty}`);
  }
  return out;
}

function isWallInfra(id) {
  return (
    id.startsWith('prop_city_wall') ||
    id === 'prop_wall_tower' ||
    id.startsWith('prop_city_gate') ||
    id === 'prop_harbor_guard_arch' ||
    id === 'prop_guard_tower' ||
    id.startsWith('prop_hq_fence') ||
    id === 'prop_hq_sniper_tower' ||
    id === 'prop_hq_gate_closed' ||
    id === 'prop_hq_gate_open'
  );
}

function isPierOrShip(id) {
  return id.startsWith('prop_pier') || id.startsWith('prop_ship_') || id === 'prop_ship_skiff';
}

function isPassDecor(id) {
  return /street_lamp|banner_pole|chimney_smoke|string_lights|signpost|tavern_sign|notice_board|wall_brazier|clothesline|steam_vent|candle_stand|quay_bollard|shop_awning|window_box/.test(
    id,
  );
}

function isSolidBuilding(id, size) {
  if (isWallInfra(id) || isPierOrShip(id) || isPassDecor(id)) return false;
  if (id.startsWith('prop_house_')) return true;
  if (isUniqueBuildingId(id)) return true;
  return size >= 120;
}

/** Décor / infra may repeat; landmark buildings must be unique. */
function isUniqueBuildingId(id) {
  if (isWallInfra(id) || isPierOrShip(id)) return false;
  // Terrace housing intentionally reuses facade kits across rows.
  if (id.startsWith('prop_house_')) return false;
  if (
    /street_lamp|bench|planter|barrels|crate_stack|tree_|bush_|banner_pole|tombstone|quay_bollard|weapon_rack|training_dummy|shield_stack|haystack|wheat_sheaf|rain_barrel|firewood|rope_coil|amphora|candle_stand|hitching|clothesline|steam_vent|chimney_smoke|flour_sacks|salt_stacks|lobster|flower_bed|orchard|gate_shrine|town_milestone|statue_lion|wall_brazier|guard_post|signpost|scaffold|hay_cart|water_trough|chicken_coop|laundry|water_pump|beehive|outdoor_table|keg_rack|produce_cart|flower_cart|merchant_cart|covered_wagon|wagon$|sail_rack|drying_nets|fish_stall|spice_stall|market_stall|market_canopy|basket_stall|book_cart|herb_|grape_arbor|rose_arch|colonnade|cookpot|campfire|anvil|coal_pile|notice_board|memorial_stone|sundial|crier|playground_sandbox|neighborhood_gate|neighborhood_well|street_shrine|picket_fence|mailbox|hopscotch|pigeon_coop|villa_garden|garden_pergola|window_box|yard_fountain|washbasin|doghouse|string_lights|shop_awning|wheelbarrow|workbench|plank_stack|soldier_tent|archery_target|hq_fence|hq_sniper_tower|hq_floodlight|hq_barrier|hq_panel|secret_arch|hidden_bench|shadow_lamp|garden_plot|watering_can/.test(
      id,
    )
  ) {
    return false;
  }
  return id.startsWith('prop_');
}

const CORE_CITY_BUILDING_IDS = new Set(HAVEN.buildings.map((row) => String(row[0])));

/** Higher = keep when footprints collide. */
function propStackPriority(id, size) {
  if (isWallInfra(id)) return 1000;
  if (isPierOrShip(id)) return 900;
  if (id.startsWith('prop_house_')) return 750;
  // One-off city buildings and monuments must win over replaceable yard clutter.
  // Previously their priority depended only on sprite size, so the packer
  // silently deleted the apothecary, tailor, captain hut, and imperial statue.
  if (CORE_CITY_BUILDING_IDS.has(id)) return 700;
  if (
    /^(prop_market_canopy|prop_villa_garden|prop_neighborhood_gate|prop_playground_sandbox|prop_hopscotch|prop_east_garden_pool)$/.test(
      id,
    )
  ) {
    return 650;
  }
  if (
    /tree_|bush_|orchard|clothesline|steam_vent|banner_pole|planter|flower_bed|chimney|street_lamp|crate_stack|barrels|firewood|keg_rack|playground_sandbox|hopscotch|window_box|picket_fence|mailbox/.test(
      id,
    )
  ) {
    return 40;
  }
  if (size >= 180) return 700;
  if (size >= 140) return 550;
  if (size >= 110) return 400;
  if (size >= 90) return 300;
  return 120;
}

function allowStackedProps(aId, bId) {
  if (isWallInfra(aId) && isWallInfra(bId)) return true;
  if (
    (isPierOrShip(aId) && isPierOrShip(bId)) ||
    (isPierOrShip(aId) && isWallInfra(bId)) ||
    (isPierOrShip(bId) && isWallInfra(aId))
  ) {
    return true;
  }
  if (
    (aId === 'prop_campfire' && bId === 'prop_cookpot') ||
    (aId === 'prop_cookpot' && bId === 'prop_campfire')
  ) {
    return true;
  }
  if (
    (aId === 'prop_chimney_smoke' && bId.startsWith('prop_house_')) ||
    (bId === 'prop_chimney_smoke' && aId.startsWith('prop_house_')) ||
    (aId === 'prop_chimney_smoke' && bId === 'prop_tenement_block') ||
    (bId === 'prop_chimney_smoke' && aId === 'prop_tenement_block')
  ) {
    return true;
  }
  if (
    (aId === 'prop_window_box' && bId.startsWith('prop_house_')) ||
    (bId === 'prop_window_box' && aId.startsWith('prop_house_'))
  ) {
    return true;
  }
  if (
    (aId === 'prop_string_lights' &&
      (bId === 'prop_neighborhood_gate' || bId.includes('arch') || bId.startsWith('prop_house_'))) ||
    (bId === 'prop_string_lights' &&
      (aId === 'prop_neighborhood_gate' || aId.includes('arch') || aId.startsWith('prop_house_')))
  ) {
    return true;
  }
  return false;
}

function ringSearch(tx, ty, maxR, ok) {
  if (ok(tx, ty)) return [tx, ty];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        // Стена — 2 тайла толщиной с каждой стороны (rect(...,4) в buildHavenTiles).
        // Раньше клэмп был полуплоскостью (`ny >= WALL_S_TY` запрещал ВСЁ южнее
        // 50-й строки) — из-за этого некрополь/поля (ty 52-55, легитимная зона
        // ЗА стеной) стали недостижимы для ringSearch, и надгробья/пшеница при
        // локальной коллизии убегали не наружу, а НАЗАД в спальный район.
        // Запрещаем только сам двухтайловый пояс стены + внешнюю границу карты.
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const onWallBand =
          (nx === WALL_W_TX - 1 || nx === WALL_W_TX) ||
          (nx === WALL_E_TX || nx === WALL_E_TX + 1) ||
          (ny === WALL_N_TY - 1 || ny === WALL_N_TY) ||
          (ny === WALL_S_TY || ny === WALL_S_TY + 1);
        if (onWallBand) continue;
        if (ok(nx, ny)) return [nx, ny];
      }
    }
  }
  return null;
}

/**
 * Occupancy packer: 1-tile gap between buildings, no solid-on-solid tiles,
 * décor relocates instead of stacking on walls / foundations.
 */
export function resolveHavenPropOverlaps(props) {
  const occ = new Set();
  const claim = (keys) => {
    for (const k of keys) occ.add(k);
  };
  const free = (keys) => keys.every((k) => !occ.has(k));
  // npcReserve (3×3 у каждого NPC) существует только чтобы МЕЛКИЙ декор не
  // вставал прямо в точку, где стоит NPC. Раньше он клался в общий `occ` —
  // и как только резерв claim'ился (после первого дома), он блокировал
  // AБСОЛЮТНО ВСЁ, включая уникальные именные здания (bakery/lighthouse/
  // scriptorium/hq_building) в совершенно других районах карты, если их
  // footprint хоть краем касался чьего-то NPC-поста. Итог — тихо стирались
  // целые постройки. Здания должны игнорировать npcReserve (двигаться из-за
  // столкновения с реальными объектами, а не с точкой стояния NPC).
  const npcReserveKeys = new Set();
  const freeForBuilding = (keys) => keys.every((k) => !occ.has(k) || npcReserveKeys.has(k));

  for (const lm of HAVEN_NPC_LANDMARK_EXCLUSIONS) {
    const box = havenFootprint(lm.x, lm.y, lm.size);
    // Pad 1 тайл для декора; террасы кладём вручную вне footprint.
    claim(tilesOfBox({ L: box.L - TW, R: box.R + TW, T: box.T - TW, B: box.B + TW }));
  }
  // NPC 3×3 — claim после террас, иначе двери кузни/колоссов вытесняют фасады.
  const npcReserve = [];
  for (const n of HAVEN.npcs) {
    const tx = Math.round((n.x - TW / 2) / TW);
    const ty = Math.round((n.y - TW / 2) / TW);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) npcReserve.push(`${tx + dx},${ty + dy}`);
    }
  }
  let npcReserveClaimed = false;

  const items = props.map(([id, x, y, size, depth], idx) => ({
    id,
    x,
    y,
    size,
    depth,
    vis: spriteAabb(x, y, size),
    foot: havenFootprint(x, y, size),
    pri: propStackPriority(id, size),
    idx,
    tx: Math.round((x - TW / 2) / TW),
    ty: Math.round((y - TW / 2) / TW),
  }));
  items.sort((a, b) => b.pri - a.pri || b.size - a.size || a.idx - b.idx);

  const kept = [];
  const seenUnique = new Set();
  for (const item of items) {
    if (isUniqueBuildingId(item.id) && seenUnique.has(item.id) && !isWallInfra(item.id)) continue;

    const pinned =
      isWallInfra(item.id) ||
      isPierOrShip(item.id) ||
      // Authored district landmarks stay put — ringSearch was teleporting shops
      // into garrison/farm and breaking the admin-map district layout.
      CORE_CITY_BUILDING_IDS.has(item.id);
    const terrace = item.id.startsWith('prop_house_');
    const coreBuilding = CORE_CITY_BUILDING_IDS.has(item.id);
    const protectedFeature = coreBuilding || item.pri >= 650;
    // Терраса: стены встык → полный AABB делит крайний тайл. Claim только ядро.
    const gap = terrace ? 0 : isSolidBuilding(item.id, item.size) ? TW : 0;
    const occupyBox = (x, y) => {
      const vis = spriteAabb(x, y, item.size);
      if (terrace) {
        const core = item.size * 0.48;
        return { L: x - core / 2, R: x + core / 2, T: y - core * 0.55, B: y + core * 0.2 };
      }
      return {
        L: vis.L - gap,
        R: vis.R + gap,
        T: vis.T - gap,
        B: vis.B + gap,
      };
    };

    // Спрайтовый AABB-конфликт с уже размещёнными пропами (не только занятость
    // тайлов). Раньше это проверялось ПОСЛЕ поиска и просто тихо стирало
    // предмет (фонтан/качели/арка исчезали без единого лога) — теперь это
    // часть условия для запуска ringSearch, чтобы предмет искал другое место
    // вместо немого исчезновения.
    const spriteHitsKept = (px, py, padOverride, includeInfrastructure = false) => {
      if (pinned || isPassDecor(item.id)) return null;
      const a = spriteAabb(px, py, item.size);
      for (const k of kept) {
        if (allowStackedProps(item.id, k.id)) continue;
        if (isPassDecor(k.id) || (!includeInfrastructure && isWallInfra(k.id))) continue;
        const pad =
          padOverride ??
          (terrace && k.id.startsWith('prop_house_') ? 0 : gap > 0 ? TW : 8);
        if (footprintsOverlap(a, spriteAabb(k.x, k.y, k.size), pad)) return k;
      }
      return null;
    };
    const hitsLandmarkExclusion = (px, py) => {
      const a = spriteAabb(px, py, item.size);
      return HAVEN_NPC_LANDMARK_EXCLUSIONS.some((lm) => {
        const b = havenFootprint(lm.x, lm.y, lm.size);
        return footprintsOverlap(
          a,
          { L: b.L - 16, R: b.R + 16, T: b.T - 16, B: b.B + 16 },
          0,
        );
      });
    };
    const hitsNpcPost = (px, py) => {
      const a = spriteAabb(px, py, item.size);
      return HAVEN.npcs.some(
        (npc) =>
          npc.x > a.L - 16 &&
          npc.x < a.R + 16 &&
          npc.y > a.T - 16 &&
          npc.y < a.B + 16,
      );
    };

    let x = item.x;
    let y = item.y;
    let relaxedPlacement = false;
    let keys = tilesOfBox(occupyBox(x, y));
    const itemFree = isUniqueBuildingId(item.id) ? freeForBuilding : free;
    if (
      !pinned &&
      !terrace &&
      !isPassDecor(item.id) &&
      (!itemFree(keys) || spriteHitsKept(x, y) || (coreBuilding && hitsNpcPost(x, y)))
    ) {
      // maxR=10 для ВСЕХ пропов при локальной коллизии давал «телепортацию»
      // через весь квартал: надгробья с некрополя долетали в спальный район,
      // пшеница с полей — туда же. Ужимать радиус для ВСЕХ (включая здания)
      // оказалось хуже: 37+ уникальных именных построек (bakery, lighthouse,
      // scriptorium, сам hq_building!) при тесноте попросту не находили выход
      // и пакер их стирал целиком. Поэтому маленький радиус — точечно только
      // для декора конкретных «дальних» районов (некрополь/поля), у которого
      // и был реально замечен побег в чужой квартал; всё остальное (здания,
      // обычный декор двориков) — прежний широкий поиск.
      const DISTRICT_LOCAL = /^prop_(tombstone|grave_angel|wheat_sheaf|hay_cart|haystack|scarecrow|farmhouse|traveler_camp|candle_stand)$/;
      // Уникальным зданиям — запас побольше (14): лучше отъехать подальше от
      // родного места, чем пропасть с карты насовсем (маяк, ратуша, лавки).
      const searchR = DISTRICT_LOCAL.test(item.id) ? 4 : isUniqueBuildingId(item.id) ? 20 : 10;
      let found = ringSearch(item.tx, item.ty, searchR, (tx, ty) => {
        const [nx, ny] = c(tx, ty);
        if (coreBuilding && hitsNpcPost(nx, ny)) return false;
        if (isSolidBuilding(item.id, item.size)) {
          for (const k of kept) {
            if (allowStackedProps(item.id, k.id)) continue;
            if (!isSolidBuilding(k.id, k.size) && k.size < 90) continue;
            const a = occupyBox(nx, ny);
            const b = spriteAabb(k.x, k.y, k.size);
            // occupyBox уже даёт +TW зазора сам по себе (см. `gap` выше) —
            // здесь достаточно половины тайла доп.буфера, иначе двойной зазор
            // (TW+TW) душит и без того тесные кварталы (маяк/лавки пропадали).
            const pad = TW / 2;
            if (footprintsOverlap(a, { L: b.L - pad, R: b.R + pad, T: b.T - pad, B: b.B + pad }, 0)) {
              return false;
            }
          }
        }
        if (!itemFree(tilesOfBox(occupyBox(nx, ny)))) return false;
        return !spriteHitsKept(nx, ny);
      });
      if (!found && protectedFeature) {
        // Tile occupancy is deliberately coarse (a 65px half-width occupies
        // three whole 64px columns). For named city buildings, make a second
        // AABB-precise pass before deleting the landmark. Colossi, walls,
        // existing sprites, and NPC posts remain protected.
        found = ringSearch(item.tx, item.ty, Math.max(searchR, 24), (tx, ty) => {
          const [nx, ny] = c(tx, ty);
          if (hitsLandmarkExclusion(nx, ny) || hitsNpcPost(nx, ny)) return false;
          return !spriteHitsKept(nx, ny, 8, true);
        });
        relaxedPlacement = Boolean(found);
      }
      if (!found) {
        if (process.env.HAVEN_DEBUG_DROPS) {
          // eslint-disable-next-line no-console -- временный дебаг, вкл. через env
          console.error(`[drop] ${item.id}@${item.tx},${item.ty} size=${item.size} pri=${item.pri}`);
        }
        continue;
      }
      x = found[0] * TW + TW / 2;
      y = found[1] * TW + TW / 2;
      keys = tilesOfBox(occupyBox(x, y));
    }
    if (terrace && !free(keys)) continue;

    // После террас — резерв дверей, чтобы декор не вставал в 3×3 NPC.
    if (!npcReserveClaimed && !terrace && kept.some((k) => k.id.startsWith('prop_house_'))) {
      claim(npcReserve);
      for (const k of npcReserve) npcReserveKeys.add(k);
      npcReserveClaimed = true;
    }

    const hitKeptWith = spriteHitsKept(
      x,
      y,
      relaxedPlacement ? 8 : undefined,
      relaxedPlacement,
    );
    if (hitKeptWith) {
      if (process.env.HAVEN_DEBUG_DROPS) {
        // eslint-disable-next-line no-console -- временный дебаг, вкл. через env
        console.error(
          `[drop-hitkept] ${item.id}@${item.tx},${item.ty} size=${item.size} vs ${hitKeptWith.id}@${Math.round(hitKeptWith.x / TW)},${Math.round(hitKeptWith.y / TW)} size=${hitKeptWith.size}`,
        );
      }
      continue;
    }

    if (!isPassDecor(item.id) && !pinned) claim(keys);
    kept.push({ ...item, x, y });
    if (isUniqueBuildingId(item.id)) seenUnique.add(item.id);
  }

  if (!npcReserveClaimed) claim(npcReserve);

  kept.sort((a, b) => a.idx - b.idx);
  return kept.map((k) => /** @type {[string, number, number, number, number]} */ ([k.id, k.x, k.y, k.size, k.depth]));
}

export function havenPropPlacements() {
  /** @type {Array<[string, number, number, number, number]>} */
  const out = [...havenWallPlacements()];

  for (const [id, tx, ty, size, depth] of HAVEN.buildings) {
    out.push([id, ...c(tx, ty), size, depth]);
  }
  for (const [id, tx, ty, size, depth] of HAVEN.complexes) {
    out.push([id, ...c(tx, ty), size, depth]);
  }
  for (const row of HAVEN.houses) {
    const id = String(row[0]);
    const tx = Number(row[1]);
    const ty = Number(row[2]);
    // Терраса: size из layout (угол/середина/переулок); прочий двор-декор — 96.
    const size = id.startsWith('prop_house_') ? Number(row[3] ?? 192) : 96;
    out.push([id, ...c(tx, ty), size, 6]);
  }
  for (const block of [
    HAVEN.market,
    HAVEN.innYard,
    HAVEN.bathYard,
    HAVEN.libraryYard,
    HAVEN.millYard,
    HAVEN.craftYard,
    HAVEN.parkYard,
    HAVEN.stageYard,
    HAVEN.eastGateYard,
    HAVEN.memorialGarden,
    HAVEN.courtYard,
    HAVEN.farmFields,
    HAVEN.dock,
    HAVEN.plazaDecor,
    HAVEN.stableYard,
    HAVEN.smithYard,
    HAVEN.garrisonYard,
    HAVEN.cathedralGarden,
    HAVEN.alleyYards,
  ]) {
    for (const [id, tx, ty, size, depth] of block) {
      out.push([id, ...c(tx, ty), size, depth]);
    }
  }
  for (const [tx, ty] of HAVEN.lamps) {
    out.push(['prop_street_lamp', ...c(tx, ty), 62, 6]);
  }
  let gi = 0;
  for (const [tx, ty] of HAVEN.greenery) {
    const bush = gi % 3 === 0;
    out.push([bush ? 'prop_bush_garden' : 'prop_tree_oak', ...c(tx, ty), bush ? 74 : 106, 4]);
    gi += 1;
  }

  // EmperyWorld HQ — забор каждый тайл; разрыв на южных воротах.
  // Угловые колонны (HQ_TX0/HQ_TX1) уже закрыты prop_hq_fence_corner +
  // prop_hq_sniper_tower — обычный прямой сегмент забора там лишний
  // тройной стек спрайтов на одном тайле.
  for (let tx = HQ_TX0 + 1; tx <= HQ_TX1 - 1; tx += 1) {
    out.push(['prop_hq_fence', ...c(tx, HQ_TY0), 104, 7]);
    const southGate = tx >= HQ_GATE_TX - 1 && tx <= HQ_GATE_TX + 1;
    if (!southGate) out.push(['prop_hq_fence', ...c(tx, HQ_TY1), 104, 7]);
  }
  for (let ty = HQ_TY0 + 1; ty <= HQ_TY1 - 1; ty += 1) {
    out.push(['prop_hq_fence', ...c(HQ_TX0, ty), 104, 7]);
    out.push(['prop_hq_fence', ...c(HQ_TX1, ty), 104, 7]);
  }
  out.push(['prop_hq_fence_corner', ...c(HQ_TX0, HQ_TY0), 112, 7]);
  out.push(['prop_hq_fence_corner', ...c(HQ_TX1, HQ_TY0), 112, 7]);
  out.push(['prop_hq_fence_corner', ...c(HQ_TX0, HQ_TY1), 112, 7]);
  out.push(['prop_hq_fence_corner', ...c(HQ_TX1, HQ_TY1), 112, 7]);

  return resolveHavenPropOverlaps(out);
}

export function havenYamlFragment() {
  const [sx, sy] = HAVEN.spawn;
  const lines = ['spawn:', `  x: ${sx}`, `  y: ${sy}`, 'npcs:'];
  for (const n of HAVEN.npcs) {
    lines.push(`  - id: ${n.id}`, `    x: ${n.x}`, `    y: ${n.y}`, `    label: ${n.label}`);
  }
  lines.push('zones:');
  for (const z of HAVEN.zones) {
    lines.push(`  - x: ${z.x}`, `    y: ${z.y}`, `    label: '${z.label}'`, `    color: '${z.color}'`);
    if (z.travelTo) lines.push(`    travelTo: ${z.travelTo}`, `    radius: ${z.radius ?? 200}`);
    if (z.arrival) lines.push(`    arrival: { x: ${z.arrival.x}, y: ${z.arrival.y} }`);
  }
  if (HAVEN.stations?.length) {
    lines.push('stations:');
    for (const st of HAVEN.stations) {
      lines.push(
        `  - id: ${st.id}`,
        `    kind: ${st.kind}`,
        `    x: ${st.x}`,
        `    y: ${st.y}`,
        `    radius: ${st.radius}`,
      );
    }
  }
  lines.push('landmarks:');
  for (const [kind, tx, ty] of [
    ['fountain', 40, 18],
    ['statue', 14, 6],
    ['cathedral', 54, 9],
    ['library', 60, 6],
    ['bathhouse', 54, 22],
    ['brewery', 64, 22],
    ['healer', 48, 14],
    ['jail', 20, 10],
    ['gazebo', 36, 28],
    ['stage', 42, 30],
    ['chapel', 46, 28],
    ['farmhouse', 22, 54],
    ['chandler', 70, 44],
    ['dock_tavern', 74, 43],
    ['watch_house', 74, 26],
    ['carpenter', 8, 30],
    ['aqueduct', 40, 16],
    ['scriptorium', 60, 7],
    ['leatherworker', 26, 36],
    ['weigh_house', 16, 22],
    ['palace_kitchen', 72, 12],
    ['school', 44, 36],
    ['memorial', 14, 53],
    ['map_shop', 61, 42],
    ['glassblower', 6, 34],
    ['cobbler', 12, 36],
    ['archive', 64, 7],
    ['sparring', 14, 12],
    ['garrison_fire', 14, 10],
    ['pilot', 74, 46],
    ['tea_house', 66, 20],
    ['anchor', 60, 46],
    ['fire_brigade', 52, 20],
    ['palace', 68, 10],
    ['guildhall', 8, 16],
    ['clock_tower', 46, 16],
    ['lighthouse', 80, 54],
    ['windmill', 22, 34],
    ['shop', 16, 18],
    ['inn', 58, 18],
    ['blacksmith', 12, 32],
    ['stable', 30, 38],
    ['barracks', 14, 8],
    ['tenement', 16, 42],
    ['empery_hq', HQ_CX, HQ_CY],
    ['hq_gate', HQ_GATE_TX, HQ_GATE_TY],
    ['gate_north', 40, WALL_N_TY],
    ['gate_south', 40, WALL_S_TY],
    ['gate_east', WALL_E_TX, 28],
    ['harbor_gate', 62, WALL_S_TY],
    ['warehouse', 58, 42],
    ['pier', 63, 58],
  ]) {
    const point=kind==='garrison_fire'?HAVEN_GARRISON_LAYOUT.hearth:kind==='sparring'?{x:(HAVEN_GARRISON_LAYOUT.fencing[0].x+HAVEN_GARRISON_LAYOUT.fencing[1].x)/2,y:HAVEN_GARRISON_LAYOUT.fencing[0].y}:xy(c(tx,ty));
    lines.push(`  - kind: ${kind}`, `    x: ${point.x}`, `    y: ${point.y}`);
  }
  return lines.join('\n');
}
