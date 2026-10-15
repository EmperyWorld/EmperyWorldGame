/** Phaser-free ambient citizen waypoints — imported by haven-citizens and tests. */

import { HAVEN_AMBIENT_ACTOR_COUNT } from './haven-npc-posts.js';
import { HAVEN_RESIDENTIAL_COURT } from './haven-coords.js';
import { NPC_SLEEP_HOME_TILES, havenTileCenter } from './haven-npc-homes.js';

export type CitizenLook =
  | 'merchant'
  | 'innkeeper'
  | 'captain'
  | 'blacksmith'
  | 'radio'
  | 'stable'
  | 'mira'
  | 'hermit'
  | 'human'
  | 'elf'
  | 'orc';

export interface CitizenActivity {
  kind: 'watch' | 'rest' | 'work' | 'play';
  /** World gaze target; the patrol waypoint owns the approach position. */
  lookAt: readonly [number,number];
  durationMs?: number;
}

export interface CitizenDef {
  look: CitizenLook;
  /** Tile waypoints — loops. Single point = idle sway. */
  tiles: ReadonlyArray<readonly [number, number]>;
  /** Tile where citizen sleeps at night (defaults to AMBIENT_SLEEP_BY_INDEX). */
  sleepTile?: readonly [number, number];
  /** Day outdoor post (defaults to the first authored patrol point). */
  workTile?: readonly [number, number];
  /** Only visible while city is at rest — guard patrol. */
  nightPatrolOnly?: boolean;
  speed?: number;
  scale?: number;
  tint?: number;
  /** Pause at each waypoint (ms). */
  pauseMs?: number;
  /** Occasional floating line. */
  bark?: string;
  /** Player-race looks only. */
  gender?: 'male' | 'female';
  /** Pixel offsets from the first tile center for compact courtyard activities. */
  pathOffsets?: ReadonlyArray<readonly [number, number]>;
  activity?: CitizenActivity;
  courtyardRole?: 'child' | 'parent';
}

export const CITIZEN_DEFS: readonly CitizenDef[] = [
  // Рынок
  { look: 'merchant', tiles: [[12, 18], [14, 19], [16, 18], [14, 17]], speed: 38, pauseMs: 900, activity: {kind:'work',lookAt:[800,1120],durationMs:1800} },
  { look: 'human', tiles: [[10, 19], [12, 20], [11, 18]], speed: 32, tint: 0xffe0c8, pauseMs: 1200 },
  { look: 'innkeeper', tiles: [[15, 17], [13, 16], [15, 15], [16, 17]], speed: 30, pauseMs: 1400 },
  { look: 'human', tiles: [[9, 17]], speed: 0, tint: 0xf0d0b0, scale: 0.92, bark: 'Хлеб ещё тёплый.' },
  { look: 'elf', tiles: [[17, 19], [17, 18], [18, 18], [16, 18]], speed: 36, tint: 0xd0ffd8, pauseMs: 800 },
  { look: 'human', tiles: [[8, 20], [9, 21], [10, 20]], speed: 34, tint: 0xf8d0b0, pauseMs: 1000 },
  { look: 'orc', tiles: [[16, 21], [15, 22], [17, 20]], speed: 28, tint: 0xc8e0a8, pauseMs: 1100, scale: 0.95 },
  // Общинный сад (южнее спального) — старый «сквер» больше не в гарнизоне
  { look: 'mira', tiles: [[26, 45], [27, 44], [25, 45], [26, 45], [26, 46]], speed: 28, pauseMs: 1600 },
  { look: 'human', tiles: [[24, 44], [25, 45]], speed: 26, tint: 0xe8d0c0, pauseMs: 2000 },
  { look: 'hermit', tiles: [[28, 46]], speed: 0, scale: 0.95, bark: 'Тишина — тоже ответ.' },
  { look: 'elf', tiles: [[23, 45], [24, 46], [22, 45]], speed: 30, tint: 0xe0ffe8, pauseMs: 1500 },
  // Площадь / фонтан
  { look: 'captain', tiles: [[40, 20], [42, 21], [38, 21], [40, 22]], speed: 34, pauseMs: 1000 },
  { look: 'human', tiles: [[38, 19], [39, 20], [37, 20]], speed: 30, tint: 0xffd8b8, pauseMs: 1100 },
  { look: 'radio', tiles: [[42, 19], [43, 20], [43, 17], [41, 16]], speed: 33, pauseMs: 900 },
  { look: 'human', tiles: [[36, 22], [37, 23], [35, 21]], speed: 29, tint: 0xf5c8a8, pauseMs: 1300 },
  { look: 'innkeeper', tiles: [[44, 22]], speed: 0, tint: 0xffe8d0, bark: 'К сцене через двор.' },
  { look: 'human', tiles: [[41, 23], [41, 25], [42, 25], [42, 24], [40, 24]], speed: 32, tint: 0xffe4c4, pauseMs: 900 },
  { look: 'elf', tiles: [[37, 18], [36, 17], [38, 17]], speed: 35, pauseMs: 1000 },
  // Собор / паломники
  { look: 'mira', tiles: [[50, 12], [49, 13], [51, 13], [50, 14]], speed: 24, pauseMs: 1800 },
  { look: 'human', tiles: [[48, 12], [49, 11]], speed: 22, tint: 0xe8e0f0, pauseMs: 2200 },
  { look: 'hermit', tiles: [[52, 12], [53, 13], [51, 12]], speed: 25, pauseMs: 1500 },
  { look: 'human', tiles: [[47, 13]], speed: 0, tint: 0xf0e8ff, bark: 'Аминь.' },
  // Дворец / сад губернатора (СВ), не сервисный двор
  { look: 'captain', tiles: [[68, 12], [69, 13], [67, 13]], speed: 30, pauseMs: 1400 },
  { look: 'elf', tiles: [[70, 14], [71, 15], [69, 15]], speed: 28, tint: 0xf0ffe0, pauseMs: 1600 },
  { look: 'human', tiles: [[66, 14], [65, 13]], speed: 26, tint: 0xffe8d0, pauseMs: 1800 },
  { look: 'mira', tiles: [[72, 12]], speed: 0, bark: 'Сад закрыт после заката.' },
  // Трактир / бани / пивоварня
  { look: 'innkeeper', tiles: [[58, 18], [57, 19], [59, 19]], speed: 28, pauseMs: 1200 },
  { look: 'human', tiles: [[56, 21], [55, 22], [57, 22]], speed: 31, tint: 0xffccaa, pauseMs: 1000 },
  { look: 'stable', tiles: [[60, 21], [61, 20]], speed: 27, pauseMs: 1400 },
  { look: 'human', tiles: [[54, 23], [53, 22], [55, 23]], speed: 29, tint: 0xd0e8f0, pauseMs: 1200, bark: 'Пар как облако!' },
  { look: 'orc', tiles: [[61, 23], [62, 24], [60, 24]], speed: 27, tint: 0xe8d080, pauseMs: 1100, bark: 'Ещё кружку!' },
  // Кузня / мастерские
  { look: 'blacksmith', tiles: [[14, 32], [15, 33], [13, 33]], speed: 26, pauseMs: 1100, activity: {kind:'work',lookAt:[928,2016],durationMs:2200} },
  { look: 'human', tiles: [[12, 34], [11, 35], [13, 35]], speed: 30, tint: 0xd8b090, pauseMs: 900 },
  { look: 'radio', tiles: [[10, 36], [9, 37], [12, 36], [12, 37]], speed: 32, pauseMs: 1000 },
  { look: 'human', tiles: [[8, 38], [9, 39], [7, 39]], speed: 28, tint: 0xc8b8a0, pauseMs: 1300 },
  // Конюшня / юг
  { look: 'stable', tiles: [[28, 40], [29, 41], [27, 41], [28, 39]], speed: 34, pauseMs: 800 },
  { look: 'human', tiles: [[30, 42], [31, 41]], speed: 28, tint: 0xe8c8a0, pauseMs: 1200 },
  { look: 'orc', tiles: [[26, 40], [25, 41]], speed: 30, pauseMs: 1000 },
  // Порт — на камне причала (ty 52+; пояс стены 50–51 snap съедает)
  { look: 'stable', tiles: [[54, 52], [58, 52], [62, 53], [58, 53]], speed: 36, pauseMs: 700, bark: 'Швартовы трави!' },
  { look: 'captain', tiles: [[61, 52], [63, 52], [65, 53]], speed: 30, pauseMs: 1100, bark: 'Не топчи кнехт!' },
  { look: 'human', tiles: [[68, 56], [69, 58], [70, 56], [69, 55]], speed: 28, tint: 0xc8d0d8, pauseMs: 1000, bark: 'Клюёт.' },
  { look: 'radio', tiles: [[53, 58], [54, 58], [55, 58]], speed: 33, pauseMs: 900 },
  { look: 'human', tiles: [[69, 68]], speed: 0, tint: 0xb0c0c8, scale: 0.9, bark: 'Тише — леска.' },
  { look: 'orc', tiles: [[56, 53], [55, 52], [57, 52]], speed: 34, pauseMs: 800, bark: 'Ещё кружку с баржи!' },
  // Бульвар N–S (обход сцены с запада — не за ширмой)
  { look: 'human', tiles: [[40, 16], [42, 17], [40, 24], [40, 25], [36, 27], [38, 27], [37, 34], [36, 34], [40, 35], [41, 26], [40, 25]], speed: 40, tint: 0xf0d8c0, pauseMs: 400 },
  { look: 'elf', tiles: [[37, 28], [37, 18], [37, 12], [37, 18]], speed: 42, tint: 0xc8f0d0, pauseMs: 500 },
  { look: 'merchant', tiles: [[46, 11], [46, 21], [46, 11]], speed: 38, pauseMs: 600 },
  { look: 'human', tiles: [[38, 14], [37, 25], [38, 26], [38, 34], [38, 26]], speed: 44, tint: 0xffe0c0, pauseMs: 350 },
  // Восточные ворота
  { look: 'captain', tiles: [[74, 27], [72, 27], [72, 28], [73, 28], [74, 29], [75, 28]], speed: 32, pauseMs: 1500 },
  { look: 'human', tiles: [[72, 28], [71, 27]], speed: 28, tint: 0xe0d0c0, pauseMs: 1600 },
  // Поля
  { look: 'stable', tiles: [[22, 53], [24, 53], [26, 52], [24, 52]], speed: 30, pauseMs: 1000 },
  { look: 'human', tiles: [[20, 52], [18, 53]], speed: 26, tint: 0xd4c070, pauseMs: 1400 },
  { look: 'human', tiles: [[28, 53], [30, 52], [29, 53]], speed: 28, tint: 0xe8d080, pauseMs: 1200, bark: 'Урожай добрый.' },
  // Юг амфитеатра — зеваки снаружи, не на сцене / за ширмой
  { look: 'radio', tiles: [[41, 33], [41, 34], [38, 33], [41, 32]], speed: 26, pauseMs: 1500 },
  { look: 'human', tiles: [[47, 33], [48, 34], [49, 33]], speed: 26, tint: 0xf0c0d0, pauseMs: 1600, bark: 'Антракт!' },
  // Некрополь (осторожные зеваки у края)
  { look: 'hermit', tiles: [[16, 52], [15, 52]], speed: 18, pauseMs: 2500, bark: 'Не ходи дальше.' },
  { look: 'mira', tiles: [[17, 52]], sleepTile: [22, 54], speed: 0, bark: 'Свеча за упокой.' },
  // Скамейки у амфитеатра (южнее сцены)
  { look: 'human', tiles: [[36, 34]], speed: 0, tint: 0xf0d8c0, bark: 'Удобно…' },
  { look: 'elf', tiles: [[48, 34]], speed: 0, tint: 0xd0f0d8, bark: 'Спектакль скоро.' },
  { look: 'mira', tiles: [[26, 44]], speed: 0, bark: 'Сквер родной.' },
  { look: 'innkeeper', tiles: [[54, 19]], speed: 0, bark: 'От ног гудит.' },
  { look: 'human', tiles: [[34, 21]], speed: 0, tint: 0xffe0c8, bark: 'Фонтан шумит.' },
  { look: 'radio', tiles: [[46, 21]], speed: 0 },
  { look: 'stable', tiles: [[10, 42]], speed: 0, bark: 'Передышка.' },

  // ——— Дополнительная жизнь города (работа, болтовня, беготня) ———
  // Рынок: торговцы, покупатели, носильщики
  { look: 'human', gender: 'female', tiles: [[11, 18], [12, 17], [13, 18], [12, 19]], speed: 34, tint: 0xffe8d8, pauseMs: 700, bark: 'Яблоки сладкие!' },
  { look: 'human', tiles: [[14, 21], [12, 21], [10, 20], [12, 21]], speed: 36, tint: 0xe8c8a0, pauseMs: 500, bark: 'Куда мешок?' },
  { look: 'elf', gender: 'female', tiles: [[16, 16], [17, 17]], speed: 0, tint: 0xd8ffe0, bark: 'Сколько за шафран?' },
  { look: 'human', gender: 'female', tiles: [[9, 19]], speed: 0, tint: 0xf8d8c8, bark: 'Не толкайся у прилавка.' },
  { look: 'merchant', tiles: [[18, 20], [17, 21], [16, 20]], speed: 32, pauseMs: 1100, bark: 'Только сегодня!' },
  { look: 'orc', tiles: [[7, 18], [8, 19], [7, 20]], speed: 26, tint: 0xc0d898, pauseMs: 1400, scale: 0.96, bark: 'Мясо тяжёлое.' },
  // Сквер: гуляющие, кормящие птиц
  { look: 'human', gender: 'female', tiles: [[25, 45], [26, 44], [27, 45], [26, 46]], speed: 24, tint: 0xf0e0d0, pauseMs: 1800, bark: 'Голуби ручные.' },
  { look: 'human', tiles: [[24, 46], [25, 47]], speed: 0, tint: 0xe8d8c8, bark: 'Скамейка греет.' },
  { look: 'elf', tiles: [[23, 44], [22, 45], [23, 45], [23, 46]], speed: 28, tint: 0xc8f8d8, pauseMs: 1200 },
  // Фонтан / колодец
  { look: 'human', gender: 'female', tiles: [[40, 24], [39, 25], [41, 25], [40, 24]], speed: 22, tint: 0xd0e8f8, pauseMs: 1600, bark: 'Вода чистая.' },
  // [38,24] раньше стоял прямо на prop_sundial (солнечные часы) — сдвинули на [37,24].
  { look: 'human', tiles: [[37, 24], [37, 25]], speed: 0, tint: 0xc8dce8, bark: 'Вёдра полные.' },
  { look: 'mira', tiles: [[42, 25], [43, 24]], speed: 20, pauseMs: 2000, bark: 'На здоровье.' },
  // Лечебница / учитель
  // [44,16] раньше стоял прямо на prop_planter — сдвинули на [43,16].
  { look: 'human', gender: 'female', tiles: [[43, 16], [45, 17], [44, 18]], speed: 26, tint: 0xe0f0e8, pauseMs: 1500, bark: 'Очередь к лекарю.' },
  { look: 'human', tiles: [[45, 37], [46, 38], [44, 38]], speed: 30, tint: 0xf0e8d0, pauseMs: 900, bark: 'Урок после звонка.' },
  { look: 'elf', gender: 'female', tiles: [[46, 36]], speed: 0, tint: 0xd0f8e0, bark: 'Азбука на завтра.' },
  // Кузня / мастерские: ученики и заказчики
  { look: 'human', tiles: [[15, 34], [16, 33], [15, 32], [14, 33]], speed: 28, tint: 0xd0a888, pauseMs: 800, bark: 'Молот стучит.' },
  { look: 'orc', tiles: [[13, 36], [12, 37]], speed: 0, tint: 0xb8c890, bark: 'Жду подкову.' },
  { look: 'human', gender: 'female', tiles: [[11, 33], [10, 34], [11, 35]], speed: 30, tint: 0xe8c0a0, pauseMs: 1000, bark: 'Уголь привезли.' },
  // [17,36] раньше стоял прямо на prop_workbench — сдвинули на [18,36].
  { look: 'blacksmith', tiles: [[16, 35], [18, 36]], speed: 24, pauseMs: 1300, bark: 'Раскаляй сильнее!' },
  // Мельница / поля
  { look: 'stable', tiles: [[21, 36], [24, 37], [23, 36]], speed: 28, pauseMs: 1100, bark: 'Мешок к мельнице.' },
  { look: 'human', tiles: [[24, 52], [25, 53], [23, 53]], sleepTile: [22, 54], speed: 32, tint: 0xe0d070, pauseMs: 700, bark: 'Серп тупой…' },
  { look: 'human', gender: 'female', tiles: [[27, 52]], sleepTile: [22, 54], speed: 0, tint: 0xf0e090, bark: 'Сноп вяжу.' },
  // Конюшня
  { look: 'stable', tiles: [[29, 39], [30, 40], [28, 40]], speed: 32, pauseMs: 900, bark: 'Сено свежее.' },
  { look: 'human', gender: 'female', tiles: [[31, 40], [32, 41]], speed: 26, tint: 0xe8d0b0, pauseMs: 1400, bark: 'Конь спокойный.' },
  { look: 'orc', tiles: [[27, 42]], speed: 0, tint: 0xc8b070, bark: 'Чищу копыта.' },
  // Трактир / пивоварня / бани
  { look: 'innkeeper', tiles: [[59, 17], [60, 18], [58, 18]], speed: 30, pauseMs: 1000, bark: 'Стол у окна!' },
  { look: 'human', gender: 'female', tiles: [[57, 20], [56, 19]], speed: 0, tint: 0xffd0b8, bark: 'Суп горячий.' },
  { look: 'orc', tiles: [[63, 23], [64, 24], [62, 24]], speed: 28, tint: 0xe8c870, pauseMs: 900, bark: 'Ещё пены!' },
  { look: 'human', tiles: [[53, 24], [52, 23], [54, 23]], speed: 24, tint: 0xc8e0e8, pauseMs: 1500, bark: 'Пар в лицо!' },
  { look: 'human', gender: 'female', tiles: [[55, 21]], speed: 0, tint: 0xf0d8c8, bark: 'Подожди снаружи.' },
  // Порт: охрана у арки + рыбаки на рыбацком причале (tx 66–74)
  { look: 'captain', tiles: [[62, 48], [60, 48], [64, 48]], speed: 26, pauseMs: 1400, bark: 'Арка под охраной.' },
  { look: 'human', tiles: [[73, 59], [73, 56], [72, 60]], speed: 18, tint: 0xb8c8d0, pauseMs: 2200, bark: 'Клюёт!' },
  { look: 'orc', tiles: [[69, 59], [69, 62], [70, 65]], speed: 16, pauseMs: 2500, bark: 'Сеть закинул.' },
  { look: 'human', gender: 'female', tiles: [[70, 55]], speed: 0, tint: 0xc0d0d8, bark: 'Улов к вечеру.' },
  { look: 'radio', tiles: [[70, 47], [72, 46], [74, 46]], speed: 32, pauseMs: 900, bark: 'Сигнал с маяка.' },
  // Собор / библиотека
  { look: 'human', gender: 'female', tiles: [[51, 11], [50, 10], [52, 10]], speed: 22, tint: 0xe8e0f8, pauseMs: 2000, bark: 'Свечи купить.' },
  { look: 'mira', tiles: [[49, 14], [48, 15]], speed: 20, pauseMs: 2200 },
  { look: 'human', tiles: [[56, 8], [57, 9], [55, 9]], speed: 26, tint: 0xe0d8c8, pauseMs: 1600, bark: 'Книга на полке.' },
  { look: 'elf', gender: 'female', tiles: [[54, 8]], speed: 0, tint: 0xd8f0e8, bark: 'Тише в зале.' },
  // Дворец / чайная
  { look: 'human', gender: 'female', tiles: [[62, 20], [63, 21], [61, 21]], speed: 26, tint: 0xf8e0c8, pauseMs: 1400, bark: 'Чай с жасмином.' },
  { look: 'elf', tiles: [[67, 13], [68, 14]], speed: 0, tint: 0xe8ffe0, bark: 'Садовник сегодня…' },
  // Бульвар: курьеры и дети
  { look: 'human', tiles: [[39, 12], [38, 19], [39, 20], [39, 28], [36, 30], [38, 26], [37, 23], [36, 22], [39, 12]], speed: 48, tint: 0xffe8c8, pauseMs: 200, bark: 'Посторонись!' },
  { look: 'elf', gender: 'female', tiles: [[35, 18], [35, 26], [35, 34], [35, 26]], speed: 44, tint: 0xc0f0d0, pauseMs: 350 },
  { look: 'human', gender: 'female', tiles: [[42, 14], [44, 10], [43, 9], [42, 8], [44, 13], [43, 13], [42, 14], [42, 20]], speed: 40, tint: 0xf8d0c0, pauseMs: 400, bark: 'Письмо на почту!' },
  // Дом жильцов / дворецкий
  { look: 'human', tiles: [[32, 18], [33, 19], [31, 19]], speed: 28, tint: 0xe8d0b8, pauseMs: 1200, bark: 'Ключ потерял…' },
  { look: 'human', gender: 'female', tiles: [[33, 17]], speed: 0, tint: 0xf0d8c8, bark: 'Соседи шумят.' },
  // Восточные ворота / караульня
  { look: 'captain', tiles: [[75, 26], [76, 27], [74, 29], [74, 28]], speed: 30, pauseMs: 1300, bark: 'Документы.' },
  { look: 'human', tiles: [[73, 29], [72, 30]], speed: 26, tint: 0xd8c8b8, pauseMs: 1500, bark: 'Долго стоять.' },
  // Гарнизон (СЗ плац), не северная ось форума
  { look: 'captain', tiles: [[13, 11], [14, 12], [12, 12]], speed: 32, pauseMs: 1000, bark: 'Стройся!' },
  { look: 'human', tiles: [[17, 10], [18, 11]], speed: 0, tint: 0xd0c8b0, bark: 'Караул сменён.' },
  // Пара болтает у сцены (снаружи, не за ширмой)
  { look: 'human', gender: 'female', tiles: [[35, 34]], speed: 0, tint: 0xf0c8d0, bark: 'Актёры хороши.' },
  { look: 'human', tiles: [[35, 35]], speed: 0, tint: 0xe8d0b8, bark: 'Билеты дорогие.' },
  { look: 'elf', tiles: [[49, 34]], speed: 0, tint: 0xd0f0d8, bark: 'Бис!' },
  // EmperyWorld HQ — снайперы на свободных тайлах кампуса (не floodlight/вышка)
  { look: 'captain', tiles: [[59, 34]], sleepTile: [59, 34], speed: 0, tint: 0xa8c8d8, scale: 0.82, bark: 'Сектор чист.' },
  { look: 'captain', tiles: [[69, 34]], sleepTile: [69, 34], speed: 0, tint: 0xa8c8d8, scale: 0.82, bark: 'Цель в зоне.' },
  { look: 'captain', tiles: [[59, 36]], sleepTile: [59, 36], speed: 0, tint: 0xa8c8d8, scale: 0.82, bark: 'Не приближаться.' },
  { look: 'captain', tiles: [[69, 36]], sleepTile: [69, 36], speed: 0, tint: 0xa8c8d8, scale: 0.82, bark: 'Периметр закрыт.' },
  { look: 'radio', tiles: [[63, 40]], sleepTile: [63, 40], speed: 0, tint: 0xb0d8e8, bark: 'Допуск не подтверждён.' },
];

export const NIGHT_GUARD_BARKS = [
  'Патруль до рассвета.',
  'Ночная смена.',
  'Кто бродит?',
  'Город спит — мы нет.',
  'Стой, путник.',
  'Огни гаси.',
  'По домам!',
  'Тише у ворот.',
  'Марта кормит до утра.',
  'Лекарь на посту.',
  'Работаем ночью.',
  'Смена до колокола.',
  'Дозор не дремлет.',
  'Путь свободен.',
];

/** Extra guards visible only at night — street-aligned loops (avoid cutting through props). */
export const NIGHT_GUARD_PATROLS: readonly CitizenDef[] = [
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [40, 8], [40, 12], [40, 16], [42, 17], [41, 19], [40, 20], [40, 24], [36, 29], [36, 28],
      [36, 32], [38, 32], [37, 34], [36, 34], [38, 34], [38, 30], [40, 24],
      [42, 16], [41, 16], [40, 16], [40, 8],
    ],
    speed: 34,
    pauseMs: 500,
    bark: NIGHT_GUARD_BARKS[0],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [36, 20], [38, 20], [42, 20], [44, 22], [42, 25], [42, 24], [37, 24], [37, 23], [36, 22], [36, 20],
    ],
    speed: 32,
    pauseMs: 600,
    tint: 0xd0c8b8,
    bark: NIGHT_GUARD_BARKS[1],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [12, 10], [12, 14], [12, 18], [14, 20], [12, 22], [10, 20], [10, 16], [12, 12], [12, 10],
    ],
    speed: 30,
    pauseMs: 700,
    tint: 0xc8c0b0,
    bark: NIGHT_GUARD_BARKS[2],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [14, 32], [14, 34], [16, 36], [19, 36], [19, 40], [16, 38], [14, 36], [14, 32],
    ],
    speed: 32,
    pauseMs: 650,
    scale: 0.92,
    bark: NIGHT_GUARD_BARKS[3],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [26, 40], [28, 40], [30, 42], [28, 44], [31, 44], [34, 43], [34, 40], [24, 40], [26, 40],
    ],
    speed: 33,
    pauseMs: 550,
    tint: 0xd8d0c0,
    bark: NIGHT_GUARD_BARKS[4],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [54, 18], [56, 18], [58, 20], [60, 22], [62, 24], [60, 22], [58, 18], [56, 16], [54, 18],
    ],
    speed: 31,
    pauseMs: 600,
    bark: NIGHT_GUARD_BARKS[8],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [60, 46], [62, 46], [64, 46], [66, 48], [64, 48], [64, 50], [62, 48], [60, 48], [60, 46],
    ],
    speed: 34,
    pauseMs: 500,
    tint: 0xb8c0c8,
    bark: NIGHT_GUARD_BARKS[5],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [48, 12], [52, 12], [56, 14], [58, 18], [62, 22], [66, 24], [72, 25], [74, 28], [76, 27],
      [72, 25], [66, 24], [58, 18], [54, 17], [50, 15], [52, 14], [48, 12],
    ],
    speed: 35,
    pauseMs: 450,
    scale: 0.94,
    bark: NIGHT_GUARD_BARKS[6],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [32, 16], [32, 18], [34, 20], [36, 18], [36, 14], [34, 12], [32, 14], [32, 16],
    ],
    speed: 30,
    pauseMs: 700,
    bark: NIGHT_GUARD_BARKS[7],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [20, 52], [22, 54], [24, 52], [28, 52], [26, 54], [22, 54], [20, 52],
    ],
    // The field watch rests outside the locked city gates.
    sleepTile: [22, 54],
    speed: 31,
    pauseMs: 650,
    bark: NIGHT_GUARD_BARKS[10],
  },
  {
    look: 'captain',
    nightPatrolOnly: true,
    tiles: [
      [12, 8], [16, 8], [16, 12], [12, 12], [12, 8],
    ],
    speed: 33,
    pauseMs: 550,
    tint: 0xc0b8a8,
    bark: NIGHT_GUARD_BARKS[13],
  },
];

/** Night-only patrons at open venues (inn, healer, night market, cathedral, harbor). */
export const NIGHT_VENUE_PATRONS: readonly CitizenDef[] = [
  {
    look: 'human',
    nightPatrolOnly: true,
    gender: 'female',
    tiles: [[56, 19], [57, 20], [55, 20], [56, 19]],
    speed: 22,
    pauseMs: 1600,
    tint: 0xffe0c8,
    bark: 'Марта не спит — и слава богам.',
  },
  {
    look: 'orc',
    nightPatrolOnly: true,
    tiles: [[58, 20], [59, 21], [57, 21]],
    speed: 24,
    pauseMs: 1400,
    tint: 0xe8d080,
    bark: 'Ещё кружку. Ночная смена.',
  },
  {
    look: 'human',
    nightPatrolOnly: true,
    tiles: [[55, 21]],
    speed: 0,
    tint: 0xf0d0b8,
    bark: 'Очаг греет до утра.',
  },
  {
    look: 'elf',
    nightPatrolOnly: true,
    gender: 'female',
    tiles: [[54, 19], [55, 18], [56, 19]],
    speed: 26,
    pauseMs: 1200,
    tint: 0xd0f8e0,
    bark: 'Трактир открыт ночью.',
  },
  {
    look: 'mira',
    nightPatrolOnly: true,
    tiles: [[44, 17], [45, 17], [44, 18]],
    speed: 20,
    pauseMs: 2000,
    bark: 'К лекарю — не к рассвету.',
  },
  {
    look: 'human',
    nightPatrolOnly: true,
    tiles: [[45, 16]],
    speed: 0,
    tint: 0xe0f0e8,
    bark: 'Сера принимает и ночью.',
  },
  {
    look: 'human',
    nightPatrolOnly: true,
    gender: 'female',
    tiles: [[46, 17], [47, 16], [46, 16]],
    speed: 22,
    pauseMs: 1500,
    tint: 0xf0e8d0,
    bark: 'Очередь короткая, слава.',
  },
  {
    look: 'merchant',
    nightPatrolOnly: true,
    tiles: [[38, 20]],
    speed: 0,
    tint: 0xffd090,
    bark: 'После колокола — ночной ряд.',
  },
  {
    look: 'human',
    nightPatrolOnly: true,
    gender: 'female',
    tiles: [[42, 20], [41, 21], [42, 21]],
    speed: 18,
    pauseMs: 1800,
    tint: 0xe8c8a0,
    bark: 'Цены шёпотом. Платят молчанием.',
  },
  {
    look: 'orc',
    nightPatrolOnly: true,
    tiles: [[40, 22]],
    speed: 0,
    tint: 0xd8c070,
    bark: 'Сны, имена, чужие долги.',
  },
  {
    look: 'elf',
    nightPatrolOnly: true,
    tiles: [[57, 18], [58, 18], [56, 18]],
    speed: 20,
    pauseMs: 1500,
    tint: 0xffe8c0,
    bark: 'Со двора пахнет очагом.',
  },
  {
    look: 'mira',
    nightPatrolOnly: true,
    tiles: [[50, 11]],
    speed: 0,
    tint: 0xe8e0ff,
    bark: 'Всенощная до зари.',
  },
  {
    look: 'human',
    nightPatrolOnly: true,
    tiles: [[52, 10], [51, 11], [52, 11]],
    speed: 16,
    pauseMs: 2200,
    tint: 0xf0e8ff,
    bark: 'Кассий не гасит свечи.',
  },
  {
    look: 'human',
    nightPatrolOnly: true,
    tiles: [[63, 47], [62, 46], [64, 47]],
    speed: 22,
    pauseMs: 1400,
    tint: 0xb8c8d0,
    bark: 'Огоньки на воде — не маяк.',
  },
];


function courtOffsets(points: ReadonlyArray<readonly [number, number]>): Array<readonly [number, number]> {
  const tile = havenTileCenter(HAVEN_RESIDENTIAL_COURT.tx, HAVEN_RESIDENTIAL_COURT.ty);
  return points.map(([ox, oy]) => [ox + HAVEN_RESIDENTIAL_COURT.x - tile.x, oy + HAVEN_RESIDENTIAL_COURT.y - tile.y]);
}

export const COURT_CITIZEN_DEFS: readonly CitizenDef[] = [
  ...([[-58, -30], [58, -28], [-44, -8], [46, -6]] as const).map(([ox, oy], i): CitizenDef => ({
    look: 'human', gender: i % 2 ? 'female' : 'male', courtyardRole: 'child',
    tiles: [[HAVEN_RESIDENTIAL_COURT.tx, HAVEN_RESIDENTIAL_COURT.ty]],
    pathOffsets: courtOffsets([[ox, oy], [-ox * 0.65, oy], [-ox * 0.65, oy - 16], [ox, oy - 16]]),
    sleepTile: i < 2 ? [20, 38] : [21, 38],
    speed: 42 + i * 2, pauseMs: 450, scale: 0.6,
    activity:{kind:'play',lookAt:[HAVEN_RESIDENTIAL_COURT.x,HAVEN_RESIDENTIAL_COURT.y-36],durationMs:450},
    tint: [0xffe0c0, 0xe8f0ff, 0xfff0d0, 0xe0ffe8][i],
  })),
  ...([[-90, -10], [90, -10], [0, 62]] as const).map(([ox, oy], i): CitizenDef => ({
    look: 'human', gender: i === 1 ? 'female' : 'male', courtyardRole: 'parent',
    tiles: [[HAVEN_RESIDENTIAL_COURT.tx, HAVEN_RESIDENTIAL_COURT.ty]],
    pathOffsets: courtOffsets([[ox, oy]]), sleepTile: i === 0 ? [20, 38] : i === 1 ? [21, 38] : [22, 39],
    activity:{kind:'watch',lookAt:[HAVEN_RESIDENTIAL_COURT.x,HAVEN_RESIDENTIAL_COURT.y-20]},
    speed: 0, scale: 0.85, bark: 'Хорошо, когда во дворе слышен смех.',
  })),
];

export const ALL_CITIZEN_DEFS: readonly CitizenDef[] = [
  ...CITIZEN_DEFS,
  ...COURT_CITIZEN_DEFS,
  ...NIGHT_VENUE_PATRONS,
  ...NIGHT_GUARD_PATROLS.map(def => ({
    ...def,
    sleepTile: def.sleepTile ?? NPC_SLEEP_HOME_TILES.town_guard,
  })),
];

export const HAVEN_AMBIENT_CITIZEN_DEFS = ALL_CITIZEN_DEFS;

export type HavenAmbientNightRole = 'day' | 'venue' | 'guard';

export function havenAmbientNightRole(slotIndex: number): HavenAmbientNightRole {
  const dayCount = CITIZEN_DEFS.length + COURT_CITIZEN_DEFS.length;
  if (slotIndex < dayCount) return 'day';
  if (slotIndex < dayCount + NIGHT_VENUE_PATRONS.length) return 'venue';
  return 'guard';
}

if (ALL_CITIZEN_DEFS.length !== HAVEN_AMBIENT_ACTOR_COUNT) {
  console.error(
    `[haven-citizens] ambient count mismatch: defs=${ALL_CITIZEN_DEFS.length} expected=${HAVEN_AMBIENT_ACTOR_COUNT}`,
  );
}
