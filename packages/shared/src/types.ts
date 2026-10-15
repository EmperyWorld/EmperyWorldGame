import { z } from 'zod';
import type { InventoryEntry } from './inventory-entries.js';
import type { DeathKind } from './death.js';

export const ServicesConfigSchema = z.object({
  llama: z.object({
    chat: z.object({
      url: z.string().url(),
      model: z.string(),
    }),
    embeddings: z.object({
      url: z.string().url(),
      model: z.string(),
    }),
    rerank: z.object({
      url: z.string().url(),
      model: z.string(),
    }),
  }),
  comfyui: z.object({
    url: z.string().url(),
    /** sd15 = CheckpointLoaderSimple; flux2_klein = UNET+CLIP+VAE Klein pipeline */
    backend: z.enum(['sd15', 'flux2_klein']).default('flux2_klein'),
    checkpoint: z.string(),
    outputDir: z.string(),
    jobsDir: z.string(),
    steps: z.number().int().positive(),
    cfg: z.number().positive(),
    flux: z
      .object({
        unet: z.string().default('flux-2-klein-4b-fp8.safetensors'),
        clip: z.string().default('qwen_3_4b.safetensors'),
        vae: z.string().default('flux2-vae.safetensors'),
        distilled: z.boolean().default(true),
        steps: z.number().int().positive().optional(),
        cfg: z.number().positive().optional(),
      })
      .default({
        unet: 'flux-2-klein-4b-fp8.safetensors',
        clip: 'qwen_3_4b.safetensors',
        vae: 'flux2-vae.safetensors',
        distilled: true,
      }),
    /** Filename in ComfyUI/models/upscale_models/ — optional 4x pass for icons/portraits */
    upscaleModel: z.string().optional(),
  }),
  server: z.object({
    port: z.number().int().positive(),
    host: z.string(),
  }),
  client: z.object({
    port: z.number().int().positive(),
    host: z.string(),
  }),
  admin: z
    .object({
      port: z.number().int().positive(),
      host: z.string(),
    })
    .default({ port: 5190, host: '0.0.0.0' }),
  worker: z.object({
    pollIntervalMs: z.number().int().positive(),
  }),
  save: z.object({
    backend: z.enum(['postgres', 'files']).default('postgres'),
    dir: z.string(),
  }),
  /** Local Podman Postgres/Redis — optional until character/presence migration lands. */
  persistence: z
    .object({
      postgres: z
        .object({
          enabled: z.boolean().default(true),
          url: z.string().min(1),
        })
        .optional(),
      redis: z
        .object({
          enabled: z.boolean().default(true),
          url: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
});

export type ServicesConfig = z.infer<typeof ServicesConfigSchema>;

export interface HealthStatus {
  service: string;
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

/** Visual / creation gender for the hero sprite. */
export type PlayerGender = 'male' | 'female';

export interface SaveSlotMeta {
  id: string;
  name: string;
  race: string;
  profession?: string;
  level: number;
  updatedAt: string;
}

export interface PlayerSave {
  id: string;
  /** Monotonic version assigned by the authoritative save store. */
  revision?: number;
  /** Owner account id (auth). Missing on legacy orphan saves. */
  accountId?: string;
  name: string;
  race: string;
  /** Defaults to male for legacy saves (see normalizeSave). */
  gender?: PlayerGender;
  profession: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  /** Текущая мана (мистик и любой класс с mpCost-скиллами). */
  mp?: number;
  maxMp?: number;
  /** Выносливость персонажа 0–1000. */
  stamina?: number;
  /** ISO — когда stamina последний раз обновляли. */
  staminaAt?: string | null;
  location: string;
  /** Последняя позиция в текущей локации (для reconnect / anti-logout). */
  worldX?: number;
  worldY?: number;
  /** Кратко: почему умер (моб / PvP / обморок / гибель), для экрана поражения. */
  lastDeathCause?: string | null;
  /** How the last HP=0 happened; drives XP penalty and death-screen copy. */
  lastDeathKind?: DeathKind | null;
  /**
   * Survival-Life Core. Values are 0–100; this block is normalised for every
   * legacy save, so it may be optional at the wire boundary only.
   */
  survival?: SurvivalState;
  adena?: number;
  inventory: string[];
  /**
   * Versioned bag instances for perishables/stacking.
   * Always normalised; `inventory` + `inventoryEnchants` stay as flattened views.
   */
  inventoryEntries?: InventoryEntry[];
  /** Уровень заточки по слотам экипировки (+0…+10). */
  equipmentEnchants?: Record<string, number>;
  /** Параллельный массив к inventory — заточка каждого экземпляра в рюкзаке. */
  inventoryEnchants?: number[];
  equipment: Record<string, string | null>;
  skillLevels: Record<string, number>;
  skillCooldowns: Record<string, string>;
  /** Активные навыки на панели [1]–[9]; null = пустой слот. */
  skillHotbar?: (string | null)[];
  /** Карма PvP (L2): >0 = хаотичный / ПК. */
  karma?: number;
  /** Число ПК-убийств (мирных игроков). */
  pkCount?: number;
  /** Число PvP-убийств (флаг / хаос). */
  pvpCount?: number;
  questFlags: Record<string, boolean | number | string>;
  /** Полевая рация: сессия батареек и записанные частоты NPC. */
  radio?: {
    powerOn: boolean;
    sessionExpiresAt: string | null;
    frequencies: string[];
    /** Стартовый срок «живой» рации. После него ломается один раз. */
    starterExpiresAt?: string | null;
    /** Рация сломана — нужен ремонт у Связиста. */
    broken?: boolean;
    /** Уже чинили — больше не ломается по стартовому таймеру. */
    repaired?: boolean;
    /** Выдали стартовый комплект (рация + 1 батарея). */
    starterKit?: boolean;
  };
  /** Верховая лошадь: владение и состояние езды. */
  mount?: {
    ownedId: string | null;
    mounted: boolean;
    /** ISO — кулдаун тарана. */
    chargeUntil?: string | null;
    /** 0–1000 выносливость коня. */
    stamina?: number;
    /** ISO — когда stamina последний раз обновляли. */
    staminaAt?: string | null;
  };
  /**
   * Квартира в Гавани (Дом жильцов).
   * storages — отдельные сумки: материалы / снаряжение / еда.
   */
  housing?: {
    tier: 1 | 2 | 3;
    purchasedAt: string;
    storages: {
      materials: InventoryEntry[];
      gear: InventoryEntry[];
      food: InventoryEntry[];
    };
  };
  /** Companion (puppy / seagull). Server-authoritative. */
  companion?: import('./companion.js').CompanionState | null;
  createdAt: string;
  updatedAt: string;
}

export type SurvivalSeverity = 'normal' | 'deficit' | 'critical';
export type SurvivalConditionId =
  | 'hungry'
  | 'dehydrated'
  | 'hypothermia'
  | 'hyperthermia'
  | 'fatigued'
  | 'infection'
  | 'food_poisoning'
  | 'exhaustion_injury'
  | 'frostbite'
  | 'heatstroke';

export interface SurvivalCondition {
  id: SurvivalConditionId;
  severity: SurvivalSeverity;
  /** ISO timestamp; conditions progress server-side only. */
  startedAt: string;
  /** `injury` persists until treated, unlike temporary deficits. */
  kind: 'deficit' | 'illness' | 'injury';
  /** Illness progression: mild → acute over time. */
  stage?: 'mild' | 'acute';
}

export interface SurvivalEvent {
  at: string;
  type: 'warning' | 'condition' | 'treatment' | 'consumed' | 'weather';
  message: string;
}

export interface SurvivalState {
  version: 1;
  /** 0 = starving/dehydrated/exhausted, 100 = fully supplied/rested. */
  satiety: number;
  hydration: number;
  /** Core temperature in Celsius; healthy baseline 37. */
  bodyTemperature: number;
  fatigue: number;
  /** Wet clothes / skin, 0–100. It amplifies cold exposure. */
  wetness: number;
  /** Oldest known acquisition timestamp per perishable item stack. */
  freshnessAt?: Record<string, string>;
  conditions: SurvivalCondition[];
  events: SurvivalEvent[];
  lastSimulatedAt: string;
  /** Current rest action, only valid in a safe zone. */
  restingUntil?: string | null;
  /** After revive, combat/collapse cannot upgrade to Гибель until this time. */
  doomGraceUntil?: string | null;
}

export interface DialogueRequest {
  npcId: string;
  playerMessage?: string;
  saveId: string;
}

export interface DialogueChoice {
  id: string;
  label: string;
  /** Портрет, который покажется при выборе (превью при наведении). */
  portrait?: string;
}

export interface WorldNavigationTarget {
  locationId: string;
  x: number;
  y: number;
  label: string;
}

export interface DialogueResponse {
  npcId: string;
  npcName?: string;
  text: string;
  choices: DialogueChoice[];
  /** Asset id портрета для визуальной сцены диалога. */
  portrait?: string;
  /** Optional world/minimap waypoint selected by this dialogue response. */
  navigationTarget?: WorldNavigationTarget;
}

export interface ChoiceResult {
  save: PlayerSave;
  followUp?: DialogueResponse;
}

export interface PlayerStats {
  maxHp: number;
  maxMp: number;
  /** @deprecated use pAtk — kept for HUD compat */
  damage: number;
  /** @deprecated use pDef */
  defense: number;
  pAtk: number;
  pDef: number;
  /** Магическая атака (мистик / посох) */
  mAtk: number;
  /** Магическая защита */
  mDef: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  speed: number;
  /** Задержка между автоатаками, мс */
  attackDelayMs: number;
  /** Рейтинг скорости атаки для HUD (выше = быстрее) */
  attackSpeed: number;
  /** Класс экипированного оружия */
  weaponWeight?: 'light' | 'normal' | 'heavy';
  /** Эффективная дистанция атаки (оружие) */
  attackRange?: number;
  /** Экипировано дальнее оружие (лук / посох) */
  rangedWeapon?: boolean;
  /** Вид дальнего оружия для VFX/оверлея */
  rangedKind?: 'bow' | 'magic';
  /** Шанс блока щитом, % */
  blockChance?: number;
  str: number;
  dex: number;
  con: number;
  evasionWhileMoving?: number;
  evasionWhileIdle?: number;
  /** MP за тик регена (обычно 5 с), из пассивок вроде Потока маны. */
  mpRegen?: number;
  /** HP за тик регена (обычно 5 с), из пассивки Поток жизни. */
  hpRegen?: number;
  /** Верхом — клиент рисует коня и не стопает мили. */
  mounted?: boolean;
  /** Оставшийся кулдаун тарана, мс. */
  mountChargeRemainingMs?: number;
  /** Тип брони на теле (для верхового силуэта). */
  bodyArmorType?: 'light' | 'heavy' | 'robe';
  /** Выносливость коня 0–1000. */
  mountStamina?: number;
  /** Можно ли бежать верхом (stamina > 100). */
  mountCanRun?: boolean;
  /** Выносливость персонажа 0–1000. */
  stamina?: number;
  /** Можно ли бежать пешком (stamina > 100). */
  staminaCanRun?: boolean;
  /** Суммарный вес (тело+экип+рюкзак), кг. */
  carryWeightKg?: number;
  bodyWeightKg?: number;
  gearWeightKg?: number;
  bagWeightKg?: number;
  /** Скорость пешком (без множителя коня) — для клиентского расчёта верхом. */
  footSpeed?: number;
  /** Environment multiplier applied after stamina and carried-weight speed. */
  movementSpeedMult?: number;
  /** Compact client-facing presentation of active survival penalties. */
  survivalConditions?: Array<{ id: SurvivalConditionId; severity: SurvivalSeverity }>;
  survivalSeverity?: SurvivalSeverity;
}

export interface ProfessionDefinition {
  id: string;
  name: string;
  description: string;
  starterSkills: Record<string, number>;
  /** Стартовые навыки по расе (мержатся поверх starterSkills). */
  starterSkillsByRace?: Record<string, Record<string, number>>;
}

export interface SkillDefinition {
  id: string;
  name: string;
  type: 'passive' | 'active';
  /**
   * Профессия (`warrior` / …) или `common` — доступно всем.
   * Общие навыки выживания/крафта используют `common`.
   */
  profession: string;
  /**
   * Вкладка в панели навыков. По умолчанию боевые.
   * `survival` / `craft` — отдельно от боевого дерева.
   */
  domain?: 'combat' | 'survival' | 'craft';
  maxLevel: number;
  description: string;
  /** Уровень персонажа для изучения (0 = только через starterSkills) */
  unlockLevel?: number;
  /** Только для этой расы (саппорт и т.п.) */
  race?: string;
  /** Пассивка работает только со щитом в слоте */
  requiresShield?: boolean;
  /** Радиус активного скилла (оверрайд/расширение дистанции) */
  attackRange?: number;
  cooldownMs?: number;
  /**
   * Цель активного навыка.
   * `ally` — выбранный союзник в пати или кастер;
   * `party` — все живые члены пати в радиусе (включая себя).
   */
  targetMode?: 'enemy' | 'ally' | 'party';
  /** Именованный баф (L2 overwrite по id). */
  buffId?: string;
  buffStat?: 'pAtk' | 'pDef' | 'mAtk' | 'mDef' | 'critRate' | 'accuracy' | 'mpRegen' | 'attackSpeed';
  buffName?: string;
  /** Особый эффект: balance = выровнять HP пати. */
  effect?: 'balance';
  /**
   * Боевая тактика активного навыка (сервер применяет).
   * `backstab` / `execute` / `cleave` / `poison` / `mark` / `snipe` / `vanish` / `seek`.
   */
  tactic?: 'backstab' | 'execute' | 'cleave' | 'poison' | 'mark' | 'snipe' | 'vanish' | 'seek';
  /** Контроль после попадания: pin — замедление, stun — стан. */
  control?: 'pin' | 'stun';
  /** Смещение по дистанции: close — сильнее в упор (костёр). */
  rangeBias?: 'close';
  effects?: Record<string, number[]>;
  levels?: Record<number, Record<string, number>>;
}

export interface EnemyDropEntry {
  /** id предмета или "adena" для валюты */
  item?: string;
  kind?: 'item' | 'adena';
  /** Шанс из 1 000 000 (L2): 700000 = 70% */
  chance: number;
  min: number;
  max: number;
}

export interface DropRollResult {
  kind: 'item' | 'adena';
  itemId?: string;
  count: number;
}

/** Spawned ground pile after a kill (not yet in inventory). */
export interface GroundLootSpawnedResult {
  id: string;
  x: number;
  y: number;
  drops: DropRollResult[];
  ownerUntil: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  hp: number;
  pAtk: number;
  pDef: number;
  /** Маг. защита; нет в YAML → ~0.9×pDef при scale */
  mDef?: number;
  accuracy: number;
  evasion: number;
  speed: number;
  xpReward: number;
  /** Базовый уровень моба для масштабирования статов */
  level: number;
  drops?: EnemyDropEntry[];
}

export interface CombatAttackResult {
  hit: boolean;
  missed: boolean;
  crit: boolean;
  damage: number;
  enemyHp: number;
  killed: boolean;
  save: PlayerSave;
  stats: PlayerStats;
  questCompleted?: boolean;
  lootAdded?: string;
  drops?: DropRollResult[];
  /** Ground loot spawned at corpse (not auto-inventoried). */
  groundLoot?: GroundLootSpawnedResult;
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  enemyLevel?: number;
  levelAdvantage?: number;
  mobDifficulty?: string;
  xpMultiplier?: number;
  skillCooldownUntil?: string;
  skillOnCooldown?: boolean;
  skillsUnlocked?: string[];
  shieldRiposteConsumed?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
}

export interface CombatEnemyHitResult {
  hit: boolean;
  missed: boolean;
  dodged: boolean;
  blocked?: boolean;
  fullyBlocked?: boolean;
  damage: number;
  dodgeChance: number;
  save: PlayerSave;
  stats: PlayerStats;
  shieldRiposteProc?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  stats: Record<string, number>;
  icon?: string;
  /** Масса предмета, кг (иначе defaultItemWeightKg). */
  weight?: number;
  /** light / normal / heavy — влияет на скорость атаки и бонус от DEX */
  weaponWeight?: 'light' | 'normal' | 'heavy';
  /** melee (дефолт), bow или staff — дальнее оружие */
  weaponKind?: 'melee' | 'bow' | 'staff';
  /** Дистанция атаки (для луков/посохов); без поля = ближний бой */
  attackRange?: number;
  armorType?: 'light' | 'heavy' | 'robe';
}

export interface CombatKillResult {
  save: PlayerSave;
  stats: PlayerStats;
  questCompleted?: boolean;
  lootAdded?: string;
}

export interface MediaJobRequest {
  profile:
    | 'portrait_npc'
    | 'dialogue_portrait'
    | 'item_icon'
    | 'skill_icon'
    | 'location_bg'
    | 'character_sheet'
    | 'game_sprite'
    | 'tileset'
    | 'terrain_tile'
    | 'prop_sprite'
    | 'ship_sprite';
  params: Record<string, string>;
}

export interface MediaJobStatus {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  profile: MediaJobRequest['profile'];
  url?: string;
  error?: string;
}
