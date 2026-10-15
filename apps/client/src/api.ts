export type {
  ChatChannel,
  MultiplayerBootstrap,
  MultiplayerChatMessage,
  MultiplayerClientMessage,
  MultiplayerDesignDecision,
  MultiplayerEnemyPresence,
  MultiplayerEnemySnapshot,
  MultiplayerLocationSnapshot,
  MultiplayerPlayerPresence,
  MultiplayerReleaseTarget,
  MultiplayerServerMessage,
  MultiplayerTransport,
  PartyInvitePayload,
  PartyMemberInfo,
  PartySnapshot,
  PartyXpSharePayload,
  PartyQuestSharePayload,
  PvpDeathPayload,
  PvpHitPayload,
  AllyCastPayload,
  PvpStatus,
} from '@empery/shared/multiplayer';
export { PARTY_INVITE_TTL_MS, PARTY_MAX_SIZE, PARTY_XP_RANGE } from '@empery/shared/multiplayer';
import type { CombatPlayerDelta } from '@empery/shared/combat-delta';
import type { WorldNavigationTarget } from '@empery/shared';
export type { CombatPlayerDelta };
export { applyCombatPlayerDelta } from '@empery/shared/combat-delta';

const API = '';

const AUTH_TOKEN_KEY = 'empery_auth_token';

export interface ClientBugReportPayload {
  source: 'hud_bug_button';
  now: number;
  url: string;
  userAgent: string;
  saveId: string | null;
  locationId: string | null;
  worldTime?: unknown;
  havenSchedule?: unknown;
  settings?: unknown;
  graphicsQuality?: unknown;
  npcLifeEvents?: unknown[];
  note?: string;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if(['POST','PATCH','DELETE'].includes(init.method??'GET')&&path.startsWith('/api/saves')&&!headers.has('Idempotency-Key'))headers.set('Idempotency-Key',crypto.randomUUID());
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API}${path}`, { ...init, headers });
}

export interface AuthAccount {
  id: string;
  username: string;
  saveIds: string[];
  createdAt: string;
}

export interface AuthResult {
  account: AuthAccount;
  token: string;
}

async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.ok ? 'Пустой ответ сервера' : `Сервер недоступен (${res.status || 'нет связи'})`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ? 'Некорректный ответ сервера' : `Сервер недоступен (${res.status || 'нет связи'})`,
    );
  }
}

export async function registerAccount(username: string, password: string): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Нет связи с сервером — подожди запуска API (:3000)');
  }
  const data = await readJson<{ token?: string; account?: AuthAccount; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? 'Register failed');
  if (!data.token || !data.account) throw new Error('Некорректный ответ регистрации');
  setAuthToken(data.token);
  return data as AuthResult;
}

export async function loginAccount(username: string, password: string): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Нет связи с сервером — подожди запуска API (:3000)');
  }
  const data = await readJson<{ token?: string; account?: AuthAccount; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  if (!data.token || !data.account) throw new Error('Некорректный ответ входа');
  setAuthToken(data.token);
  return data as AuthResult;
}

export async function logoutAccount(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    setAuthToken(null);
  }
}

export async function fetchAuthMe(): Promise<AuthAccount | null> {
  if (!getAuthToken()) return null;
  const res = await authFetch('/api/auth/me');
  if (res.status === 401) {
    setAuthToken(null);
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json();
  return data.account as AuthAccount;
}

export async function fetchOrphanSaves(): Promise<SaveSlotMeta[]> {
  const res = await authFetch('/api/saves/orphans');
  if (!res.ok) return [];
  return res.json();
}

export async function claimOrphanSaves(opts: { saveId?: string; all?: boolean }): Promise<
  Array<{ id: string; name: string; level: number }>
> {
  const res = await authFetch('/api/saves/claim', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Claim failed');
  return data.claimed ?? [];
}


export interface Race {
  id: string;
  name: string;
  description: string;
  portraitAsset?: string;
}

export interface PlayerSave {
  /** Monotonic version assigned by the authoritative save store. */
  revision?: number;
  id: string;
  accountId?: string;
  name: string;
  race: string;
  gender?: 'male' | 'female';
  profession: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  stamina?: number;
  staminaAt?: string | null;
  location: string;
  /** Последняя позиция в локации (reconnect / anti-logout). */
  worldX?: number;
  worldY?: number;
  lastDeathCause?: string | null;
  lastDeathKind?: 'combat' | 'faint' | 'doom' | null;
  survival?: SurvivalState;
  adena?: number;
  inventory: string[];
  inventoryEntries?: Array<{
    itemId: string;
    quantity: number;
    enchant?: number;
    acquiredAt?: string;
    freshness?: number;
    temperature?: 'hot' | 'warm' | 'cold';
    waterQuality?: 'dirty' | 'filtered' | 'boiled' | 'clean';
  }>;
  /** Уровень заточки по слотам экипировки (+0…+10). */
  equipmentEnchants?: Record<string, number>;
  /** Параллельный массив к inventory — заточка каждого экземпляра в рюкзаке. */
  inventoryEnchants?: number[];
  equipment: Record<string, string | null>;
  skillLevels: Record<string, number>;
  skillCooldowns: Record<string, string>;
  /** Активные навыки на панели [1]–[9]; null = пустой слот. */
  skillHotbar?: (string | null)[];
  karma?: number;
  pkCount?: number;
  pvpCount?: number;
  questFlags: Record<string, boolean | number | string>;
  radio?: {
    powerOn: boolean;
    sessionExpiresAt: string | null;
    frequencies: string[];
    starterExpiresAt?: string | null;
    broken?: boolean;
    repaired?: boolean;
    starterKit?: boolean;
  };
  mount?: {
    ownedId: string | null;
    mounted: boolean;
    chargeUntil?: string | null;
    stamina?: number;
    staminaAt?: string | null;
  };
  companion?: import('@empery/shared').CompanionState | null;
  housing?: {
    tier: 1 | 2 | 3;
    purchasedAt: string;
    storages: {
      materials: Array<{
        id: string;
        itemId: string;
        quantity: number;
        enchant?: number;
        acquiredAt?: string;
        freshness?: number;
      }>;
      gear: Array<{
        id: string;
        itemId: string;
        quantity: number;
        enchant?: number;
        acquiredAt?: string;
        freshness?: number;
      }>;
      food: Array<{
        id: string;
        itemId: string;
        quantity: number;
        enchant?: number;
        acquiredAt?: string;
        freshness?: number;
        temperature?: string;
        waterQuality?: string;
      }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
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

export interface SurvivalState {
  version: 1;
  satiety: number;
  hydration: number;
  bodyTemperature: number;
  fatigue: number;
  wetness: number;
  freshnessAt?: Record<string, string>;
  conditions: Array<{
    id: SurvivalConditionId;
    severity: SurvivalSeverity;
    startedAt: string;
    kind: 'deficit' | 'illness' | 'injury';
    stage?: 'mild' | 'acute';
  }>;
  events: Array<{
    at: string;
    type: 'warning' | 'condition' | 'treatment' | 'consumed' | 'weather';
    message: string;
  }>;
  lastSimulatedAt: string;
  restingUntil?: string | null;
}

export interface PlayerStats {
  maxHp: number;
  maxMp?: number;
  damage: number;
  defense: number;
  pAtk: number;
  pDef: number;
  mAtk?: number;
  mDef?: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  speed: number;
  attackDelayMs?: number;
  attackSpeed?: number;
  weaponWeight?: 'light' | 'normal' | 'heavy';
  attackRange?: number;
  /** Экипировано дальнее оружие (лук / посох) */
  rangedWeapon?: boolean;
  /** Вид дальнего оружия */
  rangedKind?: 'bow' | 'magic';
  blockChance?: number;
  str: number;
  dex: number;
  con: number;
  evasionWhileMoving?: number;
  /** MP за тик регена (~5 с). */
  mpRegen?: number;
  hpRegen?: number;
  mounted?: boolean;
  mountChargeRemainingMs?: number;
  bodyArmorType?: 'light' | 'heavy' | 'robe';
  mountStamina?: number;
  mountCanRun?: boolean;
  stamina?: number;
  staminaCanRun?: boolean;
  carryWeightKg?: number;
  bodyWeightKg?: number;
  gearWeightKg?: number;
  bagWeightKg?: number;
  footSpeed?: number;
  movementSpeedMult?: number;
  survivalConditions?: Array<{ id: SurvivalConditionId; severity: SurvivalSeverity }>;
  survivalSeverity?: SurvivalSeverity;
}

export interface ProfessionDefinition {
  id: string;
  name: string;
  description: string;
  starterSkills: Record<string, number>;
  starterSkillsByRace?: Record<string, Record<string, number>>;
}

export interface SkillDefinition {
  id: string;
  name: string;
  type: 'passive' | 'active';
  profession: string;
  /** Бой / выживание / крафт (по умолчанию бой). */
  domain?: 'combat' | 'survival' | 'craft';
  maxLevel: number;
  description: string;
  unlockLevel?: number;
  race?: string;
  requiresShield?: boolean;
  attackRange?: number;
  cooldownMs?: number;
  /** `ally` — союзник/себя; `party` — пати в радиусе */
  targetMode?: 'enemy' | 'ally' | 'party';
  buffId?: string;
  buffStat?: string;
  buffName?: string;
  effect?: 'balance';
  tactic?: 'backstab' | 'execute' | 'cleave' | 'poison' | 'mark' | 'snipe' | 'vanish' | 'seek';
  control?: 'pin' | 'stun';
  rangeBias?: 'close';
  effects?: Record<string, number[]>;
  levels?: Record<number, Record<string, number>>;
  level?: number;
  cooldownUntil?: string | null;
  /** Уровень персонажа для следующего ранга навыка */
  nextRankAt?: number | null;
}

export interface EnemyDropEntry {
  item?: string;
  kind?: 'item' | 'adena';
  chance: number;
  min: number;
  max: number;
}

export interface DropRollResult {
  kind: 'item' | 'adena';
  itemId?: string;
  count: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  hp: number;
  pAtk: number;
  pDef: number;
  mDef?: number;
  accuracy: number;
  evasion: number;
  speed: number;
  xpReward: number;
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
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  enemyLevel?: number;
  levelAdvantage?: number;
  mobDifficulty?: string;
  xpMultiplier?: number;
  skillOnCooldown?: boolean;
  insufficientMp?: boolean;
  skillsUnlocked?: string[];
  swarmFrenzyProc?: boolean;
  swarmFrenzyActive?: boolean;
  swarmFrenzyEnemies?: number;
  swarmFrenzyRemainingMs?: number;
  madDualistProc?: boolean;
  madDualistActive?: boolean;
  madDualistRemainingMs?: number;
  offhandHit?: boolean;
  offhandCrit?: boolean;
  offhandDamage?: number;
  bleed?: { tickDamage: number; durationMs: number; tickMs: number };
  shieldRiposteConsumed?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
}

export interface BatchHitResult {
  entityId: string;
  hit: boolean;
  missed: boolean;
  crit: boolean;
  damage: number;
  enemyHp: number;
  killed: boolean;
  offhandHit?: boolean;
  offhandCrit?: boolean;
  offhandDamage?: number;
  bleed?: { tickDamage: number; durationMs: number; tickMs: number; kind?: 'bleed' | 'poison' };
  riposte?: boolean;
  backstab?: boolean;
  execute?: boolean;
  snipe?: boolean;
  marked?: boolean;
  markApplied?: boolean;
  vanish?: boolean;
  seek?: boolean;
  pyre?: boolean;
  controlApplied?: 'pin' | 'stun';
  arc?: 'front' | 'flank' | 'back';
  cleaveSplash?: boolean;
}

/** Ответ batch-attack / bleed-kill: дельта стейта + события (без полного save). */
export interface BatchAttackResult {
  player: CombatPlayerDelta;
  stats: PlayerStats;
  hits: BatchHitResult[];
  questCompleted?: boolean;
  lootAdded?: string;
  drops?: DropRollResult[];
  groundLoot?: Array<{
    id: string;
    x: number;
    y: number;
    drops: DropRollResult[];
    ownerUntil: number;
  }>;
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  insufficientMp?: boolean;
  skillOnCooldown?: boolean;
  skillsUnlocked?: string[];
  swarmFrenzyProc?: boolean;
  swarmFrenzyActive?: boolean;
  swarmFrenzyEnemies?: number;
  swarmFrenzyRemainingMs?: number;
  madDualistProc?: boolean;
  madDualistActive?: boolean;
  madDualistRemainingMs?: number;
  shieldRiposteConsumed?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
  noBow?: boolean;
  noAmmo?: boolean;
  insufficientStamina?: boolean;
  skillRequireFailed?: 'backstab' | 'execute' | 'vanish';
  combo?: number;
  /** Входящий вызов по рации после завершения квеста (сервер уже проверил условия). */
  radioIncoming?: { npcId: string };
}

export interface EncounterEntityDto {
  entityId: string;
  type: string;
  level: number;
  hp: number;
  maxHp: number;
  speed: number;
  x: number;
  y: number;
  quest: boolean;
}

export interface EncounterStartResult {
  encounterId: string;
  entities: EncounterEntityDto[];
}

export interface CombatEnemyHitResult {
  hit: boolean;
  missed: boolean;
  dodged: boolean;
  blocked?: boolean;
  fullyBlocked?: boolean;
  perfectDodge?: boolean;
  damage: number;
  dodgeChance: number;
  save: PlayerSave;
  stats: PlayerStats;
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  swarmFrenzyProc?: boolean;
  swarmFrenzyActive?: boolean;
  swarmFrenzyEnemies?: number;
  swarmFrenzyRemainingMs?: number;
  madDualistActive?: boolean;
  madDualistRemainingMs?: number;
  shieldRiposteProc?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
  skipped?: boolean;
}

export interface ItemDefinition {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  stats: Record<string, number>;
  icon?: string;
  weaponWeight?: 'light' | 'normal' | 'heavy';
  weaponKind?: 'melee' | 'bow' | 'staff';
  attackRange?: number;
  armorType?: 'light' | 'heavy' | 'robe';
  unsellable?: boolean;
  description?: string;
  survival?: {
    nutrition?: number;
    hydration?: number;
    shelfLifeHours?: number;
    waterQuality?: 'dirty' | 'filtered' | 'boiled' | 'clean';
    rawFood?: boolean;
    warming?: number;
    insulation?: number;
    fuel?: number;
    tool?: 'filter' | 'pot' | 'firestarter' | 'bandage' | 'antibiotic' | 'antipyretic';
  };
}

export interface EquipPreview {
  itemId: string;
  slot: string;
  replaces: string | null;
  current: Record<string, number>;
  preview: Record<string, number>;
  delta: Record<string, number>;
}

export interface EquipResult {
  save: PlayerSave;
  stats: PlayerStats;
}

export interface MediaAtlasRef {
  image: string;
  json: string;
  width: number;
  height: number;
  pack?: string;
  /** Asset ids that did not fit the sheet — preload as standalone textures. */
  leftover?: string[];
  compressed?: {
    ASTC?: string;
    ETC?: string;
    S3TC?: string;
  };
}

export interface MediaManifest {
  generatedAt?: string;
  /** Server-derived revision used for URL cache busting. */
  cacheRevision?: string;
  assets: Record<string, { url: string; profile: string; label: string }>;
  atlases?: {
    hud?: MediaAtlasRef;
    world?: Record<string, MediaAtlasRef>;
  };
}

export interface DialogueChoice {
  id: string;
  label: string;
  portrait?: string;
}

export interface DialogueResponse {
  npcId: string;
  npcName?: string;
  text: string;
  choices: DialogueChoice[];
  portrait?: string;
  navigationTarget?: WorldNavigationTarget;
}

export interface ChoiceResult {
  save: PlayerSave;
  followUp?: DialogueResponse;
  townMessage?: string;
}

export interface MediaJobStatus {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  profile: string;
  url?: string;
  error?: string;
}

export interface SaveSlotMeta {
  id: string;
  name: string;
  race: string;
  profession?: string;
  level: number;
  updatedAt: string;
}

export interface CreateSaveResponse extends PlayerSave {
  portraitJobId?: string;
}

export interface CombatKillResult {
  save: PlayerSave;
  stats: PlayerStats;
  questCompleted?: boolean;
  lootAdded?: string;
  xpGained?: number;
  leveledUp?: boolean;
}

export interface LocationDefinition {
  id: string;
  name: string;
  description: string;
  subtitle?: string;
  mapKey: string;
  backgroundAsset: string;
  safeZone?: boolean;
  privateOwnerOnly?: boolean;
  dayNight?: 'outdoor' | 'indoor' | 'dungeon';
  survivalClimate?: {
    temperatureC?: number;
    humidity?: number;
    shelter?: number;
    water?: 'none' | 'dirty' | 'clean';
  };
  stations?: Array<{
    id: string;
    kind: 'campfire' | 'hearth' | 'water' | 'pot';
    x: number;
    y: number;
    radius?: number;
  }>;
  seagulls?: Array<{ id: string; x: number; y: number }>;
  anomalyTier?: number;
  tierLabel?: string;
  recommendedLevel?: { min: number; max: number };
  spawn: { x: number; y: number };
  npcs?: Array<{
    id: string;
    x: number;
    y: number;
    label: string;
    world?: {
      role: 'character' | 'prop';
      wanderRadius?: number;
      wanderSpeed?: number;
    };
  }>;
  raceHint?: string;
  requires?: { anyFlag?: string[]; denyMessage?: string };
  zones?: Array<{ x: number; y: number; label: string; color?: string; travelTo?: string; arrival?: { x: number; y: number }; radius?: number }>;
  landmarks?: Array<{ kind: string; x: number; y: number }>;
  enemies?: Array<{ type: string; x: number; y: number; quest?: boolean; level?: number }>;
  farmSpawn?: {
    type: string;
    maxAlive: number;
    respawnMs?: number;
    level?: number;
    points: Array<{ x: number; y: number }>;
  };
  questSpawns?: Array<{
    activeFlag: string;
    killCounterFlag?: string;
    banner?: string;
    startBanner?: string;
    enemies: Array<{ type: string; x: number; y: number; quest?: boolean; level?: number }>;
  }>;
  questComplete?: Array<{ anyFlag: string[]; banner: string }>;
  canTravel?: boolean;
  lockReason?: string;
  recommended?: boolean;
}

export async function fetchProfessions(): Promise<ProfessionDefinition[]> {
  const res = await fetch(`${API}/api/professions`);
  if (!res.ok) throw new Error('Failed to load professions');
  return res.json();
}

export async function fetchEnemies(): Promise<EnemyDefinition[]> {
  const res = await fetch(`${API}/api/enemies`);
  if (!res.ok) throw new Error('Failed to load enemies');
  return res.json();
}

export async function fetchSkillsForSave(saveId: string): Promise<SkillDefinition[]> {
  const res = await authFetch(`/api/saves/${saveId}/skills`);
  if (!res.ok) throw new Error('Failed to load skills');
  return res.json();
}

export async function fetchMultiplayerBootstrap(
  saveId: string,
): Promise<import('@empery/shared').MultiplayerBootstrap> {
  const res = await authFetch(`/api/saves/${saveId}/multiplayer/bootstrap`);
  if (!res.ok) throw new Error('Failed to load multiplayer bootstrap');
  return res.json();
}

export async function combatAttack(
  saveId: string,
  body: {
    enemyType: string;
    enemyHp: number;
    enemyLevel: number;
    questId?: string;
    skillId?: string;
    moving?: boolean;
    dashing?: boolean;
    nearbyEnemyCount?: number;
  },
): Promise<CombatAttackResult> {
  const res = await authFetch(`/api/saves/${saveId}/combat/attack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Attack failed');
  return res.json();
}

export async function startEncounter(
  saveId: string,
  locationId: string,
  signal?: AbortSignal,
): Promise<EncounterStartResult> {
  const res = await authFetch(`/api/saves/${saveId}/encounter/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locationId }),
    signal,
  });
  if (!res.ok) throw new Error('Encounter start failed');
  return res.json();
}

export async function combatBatchAttack(
  saveId: string,
  body: {
    encounterId: string;
    skillId?: string;
    moving?: boolean;
    dashing?: boolean;
    nearbyEnemyCount?: number;
    targetEntityIds: string[];
    playerX?: number;
    playerY?: number;
  },
  signal?: AbortSignal,
): Promise<BatchAttackResult> {
  const res = await authFetch(`/api/saves/${saveId}/combat/batch-attack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('ENCOUNTER_STALE');
    throw new Error('Batch attack failed');
  }
  return res.json();
}

export async function combatBleedKill(
  saveId: string,
  body: {
    encounterId: string;
    entityId: string;
    moving?: boolean;
    dashing?: boolean;
    nearbyEnemyCount?: number;
  },
  signal?: AbortSignal,
): Promise<BatchAttackResult> {
  const res = await authFetch(`/api/saves/${saveId}/combat/bleed-kill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error('Bleed kill failed');
  return res.json();
}

export async function encounterFarmRespawn(
  saveId: string,
  encounterId: string,
  signal?: AbortSignal,
): Promise<{ spawned: EncounterEntityDto | null }> {
  const res = await authFetch(`/api/saves/${saveId}/encounter/farm-respawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encounterId }),
    signal,
  });
  if (!res.ok) throw new Error('Farm respawn failed');
  return res.json();
}

export async function encounterSyncQuests(
  saveId: string,
  encounterId: string,
  signal?: AbortSignal,
): Promise<{ entities: EncounterEntityDto[] }> {
  const res = await authFetch(`/api/saves/${saveId}/encounter/sync-quests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encounterId }),
    signal,
  });
  if (!res.ok) throw new Error('Quest sync failed');
  return res.json();
}

export async function combatEnemyHit(
  saveId: string,
  body: {
    enemyType: string;
    enemyLevel: number;
    moving?: boolean;
    dashing?: boolean;
    counterAttack?: boolean;
    nearbyEnemyCount?: number;
    encounterId?: string;
    entityId?: string;
  },
  signal?: AbortSignal,
): Promise<CombatEnemyHitResult> {
  const res = await authFetch(`/api/saves/${saveId}/combat/enemy-hit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error('Enemy hit failed');
  return res.json();
}

export async function fetchRaces(): Promise<Race[]> {
  const res = await fetch(`${API}/api/races`);
  if (!res.ok) throw new Error('Failed to load races');
  return res.json();
}

export async function fetchMediaManifest(): Promise<MediaManifest> {
  const res = await fetch(`${API}/api/media/manifest`);
  if (!res.ok) return { assets: {} };
  return res.json();
}

export async function fetchItems(): Promise<ItemDefinition[]> {
  const res = await fetch(`${API}/api/items`);
  if (!res.ok) throw new Error('Failed to load items');
  return res.json();
}

export async function fetchSaves(): Promise<SaveSlotMeta[]> {
  const res = await authFetch(`/api/saves`);
  if (!res.ok) throw new Error('Failed to load saves');
  return res.json();
}

export async function fetchSave(id: string, signal?: AbortSignal): Promise<PlayerSave> {
  const res = await authFetch(`/api/saves/${id}`, { signal });
  if (!res.ok) throw new Error('Save not found');
  return res.json();
}

export async function deleteSave(id: string): Promise<void> {
  const res = await authFetch(`/api/saves/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete save');
}

export async function respawnSave(saveId: string, signal?: AbortSignal): Promise<{
  save: PlayerSave;
  stats: PlayerStats;
  location?: LocationDefinition;
  relocated?: boolean;
  xpLost?: number;
  adenaLost?: number;
  deathKind?: 'combat' | 'faint' | 'doom';
  mode?: 'town';
}> {
  const res = await authFetch(`/api/saves/${saveId}/respawn`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Respawn failed');
  }
  return res.json();
}

export async function resurrectAlly(
  saveId: string,
  targetSaveId: string,
): Promise<{
  save: PlayerSave;
  stats: PlayerStats;
  target: { save: PlayerSave; stats: PlayerStats };
  message: string;
}> {
  const res = await authFetch(`/api/saves/${saveId}/resurrect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetSaveId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Resurrect failed');
  return data;
}

export async function createSave(
  name: string,
  race: string,
  profession: string,
  gender: 'male' | 'female' = 'male',
): Promise<CreateSaveResponse> {
  const res = await authFetch(`/api/saves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, race, profession, gender }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to create save');
  return data as CreateSaveResponse;
}

export async function fetchMediaJob(jobId: string): Promise<MediaJobStatus> {
  const res = await authFetch(`/api/media/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error('Media job not found');
  return res.json();
}

export async function fetchStats(saveId: string, signal?: AbortSignal): Promise<PlayerStats> {
  const res = await authFetch(`/api/saves/${saveId}/stats`, { signal });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export async function updateSave(id: string, patch: Partial<PlayerSave>): Promise<PlayerSave> {
  const res = await authFetch(`/api/saves/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update save');
  return res.json();
}

/** Checkpoint the authoritative pose; location only prevents a stale travel handoff. */
export function flushSavePosition(
  saveId: string,
  _worldX: number,
  _worldY: number,
  location?: string,
): void {
  const token = getAuthToken();
  if(!location)return;
  const body={location};
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    void fetch(`${API}/api/saves/${saveId}/position`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* ignore — best effort */
  }
}

export interface ShopOffer {
  item: ItemDefinition;
  price: number;
  sellPrice: number;
}

export async function fetchShopCatalog(
  shopId = 'haven_merchant',
  opts?: { saveId?: string; locationId?: string },
): Promise<{
  merchantName: string;
  offers: ShopOffer[];
  shopId: string;
  open?: boolean;
  closedMessage?: string;
}> {
  if (opts?.saveId) {
    const q =
      shopId && shopId !== 'haven_merchant'
        ? `?shopId=${encodeURIComponent(shopId)}`
        : '';
    const res = await authFetch(`/api/saves/${opts.saveId}/shop${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to load shop');
    return data;
  }
  const params = new URLSearchParams();
  if (shopId && shopId !== 'haven_merchant') params.set('shopId', shopId);
  if (opts?.locationId) params.set('locationId', opts.locationId);
  const q = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`${API}/api/shop${q}`);
  if (!res.ok) throw new Error('Failed to load shop');
  return res.json();
}

export async function buyShopItem(
  saveId: string,
  itemId: string,
  quantity = 1,
  shopId = 'haven_merchant',
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, quantity, shopId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Buy failed');
  return data;
}

export async function sellShopItem(
  saveId: string,
  inventoryIndex: number,
  shopId = 'haven_merchant',
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/shop/sell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventoryIndex, shopId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Sell failed');
  return data;
}

export async function sellAllShopItems(
  saveId: string,
  shopId = 'haven_merchant',
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/shop/sell-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Sell all failed');
  return data;
}

export async function fetchShopBag(saveId: string): Promise<{
  items: Array<{ inventoryIndex: number; item: ItemDefinition; sellPrice: number }>;
}> {
  const res = await authFetch(`/api/saves/${saveId}/shop/bag`);
  if (!res.ok) throw new Error('Failed to load bag for shop');
  return res.json();
}

export interface ForgeMenuState {
  open?: boolean;
  closedMessage?: string;
  smithName: string;
  adena: number;
  hint: string;
  enchant: Array<{
    slot: string;
    slotLabel: string;
    itemId: string;
    itemName: string;
    level: number;
    maxed: boolean;
    cost: number;
    chance: string;
    affordable: boolean;
  }>;
  craft: Array<{
    id: string;
    name: string;
    resultId: string;
    resultName: string;
    ingredients: Array<{ id: string; name: string; need: number; have: number }>;
    canCraft: boolean;
  }>;
}

export async function fetchForgeMenu(saveId: string): Promise<ForgeMenuState> {
  const res = await authFetch(`/api/saves/${saveId}/forge`);
  if (!res.ok) throw new Error('Кузня недоступна');
  return res.json();
}

export async function enchantAtForge(
  saveId: string,
  slot: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; ok: boolean }> {
  const res = await authFetch(`/api/saves/${saveId}/forge/enchant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Заточка не удалась');
  return data;
}

export async function craftAtForge(
  saveId: string,
  recipeId: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; ok: boolean }> {
  const res = await authFetch(`/api/saves/${saveId}/forge/craft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Крафт не удался');
  return data;
}

export async function fetchDialogue(
  saveId: string,
  npcId: string,
  channel: 'proximity' | 'radio' = 'proximity',
  signal?: AbortSignal,
): Promise<DialogueResponse & { save?: PlayerSave }> {
  const res = await authFetch(`/api/dialogue`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saveId, npcId, channel }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Dialogue failed');
  return data;
}

export async function applyDialogueChoice(
  saveId: string,
  npcId: string,
  choiceId: string,
  channel: 'proximity' | 'radio' = 'proximity',
  signal?: AbortSignal,
  requestKey: string = crypto.randomUUID(),
): Promise<ChoiceResult> {
  const res = await authFetch(`/api/dialogue/choice`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
    body: JSON.stringify({ saveId, npcId, choiceId, channel }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Choice failed');
  return data;
}

export interface RadioStatus {
  owned: boolean;
  powerOn: boolean;
  sessionLive: boolean;
  sessionExpiresAt: string | null;
  remainingMs: number;
  frequencies: string[];
  batteryPacks: number;
  batteries?: Record<string, number>;
  batteryOffers?: Array<{ id: string; label: string; hours: number; count: number }>;
  broken?: boolean;
  repaired?: boolean;
  starterExpiresAt?: string | null;
  starterRemainingMs?: number;
  repairCost?: number;
  message?: string;
  save?: PlayerSave;
}

export async function fetchRadioStatus(saveId: string): Promise<RadioStatus> {
  const res = await authFetch(`/api/saves/${saveId}/radio`);
  if (!res.ok) throw new Error('Radio status failed');
  return res.json();
}

export async function activateRadioBattery(saveId: string, packId?: string): Promise<RadioStatus> {
  const res = await authFetch(`/api/saves/${saveId}/radio/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(packId ? { packId } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Activate failed');
  return data;
}

export async function setRadioPowerOn(saveId: string, on: boolean): Promise<RadioStatus> {
  const res = await authFetch(`/api/saves/${saveId}/radio/power`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Power failed');
  return data;
}

export interface SurvivalEnvironment {
  locationId: string;
  weather: { id: string; name: string; temperatureDelta: number; humidity: number };
  season?: { id: string; name: string };
  forecast?: Array<{
    at: string;
    weather: { id: string; name: string; temperatureDelta: number; humidity: number };
    season: { id: string; name: string };
  }>;
  temperatureC: number;
  humidity: number;
  shelter: number;
  water: 'none' | 'dirty' | 'clean';
  safeZone?: boolean;
  timeOfDay?: import('@empery/shared').DayNightSnapshot;
  stations?: Array<{
    id: string;
    kind: 'campfire' | 'hearth' | 'water' | 'pot';
    x: number;
    y: number;
    radius?: number;
  }>;
}

export interface SurvivalSnapshot {
  save: PlayerSave;
  stats: PlayerStats;
  survival: SurvivalState;
  environment: SurvivalEnvironment;
}

async function survivalAction(
  saveId: string,
  action: 'consume' | 'treat' | 'process' | 'rest',
  body: Record<string, unknown> = {},
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/survival/${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Survival action failed');
  return data;
}

export async function fetchSurvival(saveId: string): Promise<SurvivalSnapshot> {
  const res = await authFetch(`/api/saves/${saveId}/survival`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Survival unavailable');
  return data;
}

export function consumeSurvivalItem(saveId: string, itemId: string) {
  return survivalAction(saveId, 'consume', { itemId });
}

export function treatSurvival(saveId: string, itemId: string) {
  return survivalAction(saveId, 'treat', { itemId });
}

export function processSurvival(saveId: string, recipeId: string) {
  return survivalAction(saveId, 'process', { recipeId });
}

export function restSurvival(saveId: string) {
  return survivalAction(saveId, 'rest');
}

export type HousingStorageKind = 'materials' | 'gear' | 'food';

export interface HousingView {
  owned: null | {
    tier: 1 | 2 | 3;
    purchasedAt: string;
    storages: {
      materials: Array<{ id: string; itemId: string; quantity: number }>;
      gear: Array<{ id: string; itemId: string; quantity: number }>;
      food: Array<{ id: string; itemId: string; quantity: number }>;
    };
    capacities?: {
      tier: number;
      name: string;
      price: number;
      materials: number;
      gear: number;
      food: number;
      rooms: number;
    };
  };
  tiers: Array<{
    tier: number;
    name: string;
    price: number;
    materials: number;
    gear: number;
    food: number;
    rooms: number;
  }>;
  apartmentLocationId: string;
}

export async function fetchHousing(saveId: string): Promise<HousingView> {
  const res = await authFetch(`/api/saves/${saveId}/housing`);
  if (!res.ok) throw new Error('Housing failed');
  return res.json();
}

export async function buyHousing(
  saveId: string,
  tier: number,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; housing: HousingView }> {
  const res = await authFetch(`/api/saves/${saveId}/housing/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Buy housing failed');
  return data;
}

export async function enterHousing(saveId: string): Promise<{
  save: PlayerSave;
  stats: PlayerStats;
  message: string;
  location: LocationDefinition;
}> {
  const res = await authFetch(`/api/saves/${saveId}/housing/enter`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Enter housing failed');
  return data;
}

export async function restAtHousing(saveId: string): Promise<{
  save: PlayerSave;
  stats: PlayerStats;
  message: string;
}> {
  const res = await authFetch(`/api/saves/${saveId}/housing/rest`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Rest failed');
  return data;
}

export async function depositHousingStorage(
  saveId: string,
  kind: HousingStorageKind,
  inventoryIndex: number,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; housing: HousingView }> {
  const res = await authFetch(`/api/saves/${saveId}/housing/storage/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, inventoryIndex }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Deposit failed');
  return data;
}

export async function withdrawHousingStorage(
  saveId: string,
  kind: HousingStorageKind,
  storageIndex: number,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; housing: HousingView }> {
  const res = await authFetch(`/api/saves/${saveId}/housing/storage/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, storageIndex }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Withdraw failed');
  return data;
}

export interface MountDefinition {
  id: string;
  name: string;
  visual?: 'bay' | 'ash' | 'pale' | 'prism';
  speedMult: number;
  chargeDamageMult: number;
  chargeDurationMs: number;
  chargeCooldownMs: number;
  chargeSpeed: number;
  chargeReach: number;
  shopPrice: number;
  description?: string;
  staminaDrainMult?: number;
  staminaRegenMult?: number;
  carryComfortKg?: number;
  carryMaxKg?: number;
}

export async function fetchMounts(): Promise<MountDefinition[]> {
  const res = await authFetch('/api/mounts');
  if (!res.ok) throw new Error('Mounts failed');
  const data = (await res.json()) as { mounts: MountDefinition[] };
  return data.mounts ?? [];
}

export async function syncMountStamina(
  saveId: string,
  _body: { stamina?: number; moving?: boolean; running?: boolean; dtSec?: number },
): Promise<{
  save: Pick<PlayerSave, 'id' | 'mount'>;
  stats: Pick<PlayerStats, 'mountStamina' | 'mountCanRun'>;
}> {
  const res = await authFetch(`/api/saves/${saveId}/mount/stamina`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Mount stamina sync failed');
  return data;
}

export async function submitBugReport(payload: ClientBugReportPayload): Promise<{ ok: true; reportId: string }> {
  const res = await authFetch('/api/debug/bug-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ ok?: true; reportId?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? 'Bug report failed');
  if (!data.ok || !data.reportId) throw new Error('Некорректный ответ bug-report');
  return { ok: true, reportId: data.reportId };
}

export async function syncPlayerStamina(
  saveId: string,
  _stamina: number,
): Promise<{
  save: PlayerSave;
  stats: Pick<PlayerStats, 'stamina' | 'staminaCanRun'>;
}> {
  const res = await authFetch(`/api/saves/${saveId}/player-stamina`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Player stamina sync failed');
  return data;
}

export async function buyMount(
  saveId: string,
  mountId = 'field_horse',
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/mount/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mountId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Buy mount failed');
  return data;
}

export async function toggleMount(
  saveId: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; mounted: boolean }> {
  const res = await authFetch(`/api/saves/${saveId}/mount/toggle`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Mount toggle failed');
  return data;
}

export async function dismountMount(
  saveId: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; mounted: boolean }> {
  const res = await authFetch(`/api/saves/${saveId}/mount/dismount`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Dismount failed');
  return data;
}

export async function mountCharge(
  saveId: string,
  body: {
    encounterId: string;
    targetEntityIds: string[];
    playerX: number;
    playerY: number;
    nearbyEnemyCount?: number;
  },
  signal?: AbortSignal,
): Promise<BatchAttackResult> {
  const res = await authFetch(`/api/saves/${saveId}/combat/mount-charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Mount charge failed');
  }
  return res.json();
}

export async function pickupLoot(
  saveId: string,
  lootId: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; summary?: string }> {
  const res = await authFetch(`/api/saves/${saveId}/loot/pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lootId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Pickup failed');
  return data;
}

export async function buyCompanion(
  saveId: string,
  companionId = 'haven_puppy',
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/companion/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companionId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Buy companion failed');
  return data;
}

export async function feedCompanion(
  saveId: string,
  itemId: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/companion/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Feed failed');
  return data;
}

export async function trainCompanion(
  saveId: string,
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string }> {
  const res = await authFetch(`/api/saves/${saveId}/companion/train`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Train failed');
  return data;
}

export async function offerBreadToSeagull(
  saveId: string,
  body: { seagullId: string; x: number; y: number },
): Promise<{ save: PlayerSave; stats: PlayerStats; message: string; tamed?: boolean }> {
  const res = await authFetch(`/api/saves/${saveId}/companion/offer-bread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Offer failed');
  return data;
}

export async function repairFieldRadio(saveId: string): Promise<RadioStatus> {
  const res = await authFetch(`/api/saves/${saveId}/radio/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Repair failed');
  return data;
}

export async function fetchEquipPreview(saveId: string, itemId: string): Promise<EquipPreview> {
  const res = await authFetch(`/api/saves/${saveId}/inventory/preview?itemId=${encodeURIComponent(itemId)}`);
  if (!res.ok) throw new Error('Preview failed');
  return res.json() as Promise<EquipPreview>;
}

export async function equipItem(
  saveId: string,
  itemId: string,
  targetSlot?: string,
): Promise<EquipResult> {
  const res = await authFetch(`/api/saves/${saveId}/equip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, slot: targetSlot }),
  });
  if (!res.ok) throw new Error('Equip failed');
  return res.json() as Promise<EquipResult>;
}

export async function unequipItem(saveId: string, slot: string): Promise<EquipResult> {
  const res = await authFetch(`/api/saves/${saveId}/unequip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot }),
  });
  if (!res.ok) throw new Error('Unequip failed');
  return res.json() as Promise<EquipResult>;
}

export async function fetchLocation(id: string, signal?: AbortSignal): Promise<LocationDefinition> {
  const res = await fetch(`${API}/api/locations/${id}`, { signal });
  if (!res.ok) throw new Error('Location not found');
  return res.json();
}

export async function fetchTravelOptions(saveId: string): Promise<LocationDefinition[]> {
  const res = await authFetch(`/api/saves/${saveId}/travel/options`);
  if (!res.ok) throw new Error('Travel options failed');
  return res.json();
}

export async function travelTo(saveId: string, locationId: string, signal?: AbortSignal): Promise<{
  save: PlayerSave;
  location: LocationDefinition;
  stats: PlayerStats;
}> {
  const res = await authFetch(`/api/saves/${saveId}/travel`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locationId }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? 'Travel failed');
  }
  return res.json();
}

export async function reportCombatKill(
  saveId: string,
  enemyType: string,
  questId?: string,
): Promise<CombatKillResult> {
  const res = await authFetch(`/api/saves/${saveId}/combat/kill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enemyType, questId }),
  });
  if (!res.ok) throw new Error('Combat kill failed');
  return res.json();
}

export async function reportClientPerformance(payload:{frameMeanMs:number;frameP95Ms:number;rttMs:number;corrections:number;correctionPx:number;rxBytes:number;txBytes:number}):Promise<void> {
  await authFetch('/api/telemetry/client',{method:'POST',body:JSON.stringify(payload)});
}
