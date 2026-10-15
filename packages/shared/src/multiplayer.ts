export type ChatChannel = 'location' | 'global' | 'private' | 'party';

export const PARTY_MAX_SIZE = 4;
export const PARTY_INVITE_TTL_MS = 60_000;
/** Max distance (px) for shared kill XP within the same location. */
export const PARTY_XP_RANGE = 900;

export interface MultiplayerChatMessage {
  id: string;
  channel: ChatChannel;
  fromSaveId: string;
  fromName: string;
  text: string;
  ts: number;
  toSaveId?: string;
  toName?: string;
}

export type MultiplayerReleaseTarget = 'coop_mvp' | 'shared_world_foundation' | 'mmo_lite';

export type MultiplayerTransport = 'http' | 'websocket';

export interface MultiplayerDesignDecision {
  releaseTarget: MultiplayerReleaseTarget;
  transport: MultiplayerTransport;
  authoritativeSimulation: boolean;
  persistence: {
    profile: 'file_saves' | 'postgres';
    realtimeState: 'memory' | 'redis';
  };
}

/** Статус имени как в L2: мирный / флаг / хаос. */
export type PvpStatus = 'peaceful' | 'flagged' | 'chaotic';

export interface MultiplayerPlayerPresence {
  saveId: string;
  name: string;
  race: string;
  /** Missing on older clients → treat as male. */
  gender?: 'male' | 'female';
  profession: string;
  level: number;
  locationId: string;
  x: number;
  y: number;
  facing: 'left' | 'right';
  moving: boolean;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  karma: number;
  pvpStatus: PvpStatus;
  /** Остаток флага PvP, мс (0 если нет). */
  pvpFlagRemainingMs?: number;
  /** Верхом на лошади (для оверлея у других игроков). */
  mounted?: boolean;
  /** Id коня (field_horse / ash_steed / …). */
  mountId?: string | null;
  /** Силуэт брони всадника. */
  armorType?: 'light' | 'heavy' | 'robe';
  /** Вариант плаща procedural-спрайта. */
  cloakVariant?: string | null;
  /** Оружие всадника. */
  weaponKind?: 'melee' | 'bow' | 'staff' | null;
  /**
   * online — живой сокет; disconnected — grace-период после выхода
   * (мобы/PvP ещё видят цель ~1 мин).
   */
  connectionStatus?: 'online' | 'disconnected';
  /** Остаток anti-logout grace, мс (только для disconnected). */
  disconnectRemainingMs?: number;
}

export interface PvpHitPayload {
  attackerId: string;
  targetId: string;
  hit: boolean;
  missed: boolean;
  crit: boolean;
  blocked?: boolean;
  fullyBlocked?: boolean;
  damage: number;
  killed: boolean;
  attacker: MultiplayerPlayerPresence;
  target: MultiplayerPlayerPresence;
  /** Использованный активный скилл (если был). */
  skillId?: string;
  /** Актуальные MP/CD атакующего после удара (для UI). */
  attackerMp?: number;
  attackerSkillCooldowns?: Record<string, string>;
  /** Атакующий потратил «Ответный удар». */
  riposteConsumed?: boolean;
  /** Защитник после блока получил окно рипоста. */
  shieldRiposteProc?: boolean;
  attackerShieldRiposteRemainingMs?: number;
  targetShieldRiposteRemainingMs?: number;
  /** Инвентарь/колчан атакующего после расхода стрелы. */
  attackerInventory?: string[];
  attackerEquipment?: Record<string, string | null>;
  attackerInventoryEnchants?: number[];
  attackerEquipmentEnchants?: Record<string, number>;
  /** Только атакующему: причины отказа не сюда, а в pvp_error. */
  skillOnCooldown?: boolean;
  insufficientMp?: boolean;
  backstab?: boolean;
  execute?: boolean;
  snipe?: boolean;
  vanish?: boolean;
  seek?: boolean;
  pyre?: boolean;
  arc?: 'front' | 'flank' | 'back';
  combo?: number;
}

export interface PvpDeathPayload {
  victimId: string;
  killerId: string;
  victimName: string;
  killerName: string;
  wasPk: boolean;
  /** Жертва была в anti-logout grace (DISCONNECT). */
  victimDisconnected?: boolean;
}

export interface AllyCastTargetEffect {
  saveId: string;
  healAmount: number;
  mpAmount: number;
  /** Изменение HP (для Balance может быть отрицательным). */
  hpDelta?: number;
  buffApplied: boolean;
  presence: MultiplayerPlayerPresence;
  buffLabels?: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
}

export interface AllyCastPayload {
  casterSaveId: string;
  /** @deprecated single-target; use targets[0] */
  targetSaveId?: string;
  skillId: string;
  skillName: string;
  healAmount: number;
  buffApplied: boolean;
  caster: MultiplayerPlayerPresence;
  /** @deprecated single-target; use targets[0].presence */
  target?: MultiplayerPlayerPresence;
  casterMp?: number;
  casterSkillCooldowns?: Record<string, string>;
  targetBuffLabels?: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
  targets: AllyCastTargetEffect[];
}

export interface MultiplayerLocationSnapshot {
  locationId: string;
  players: MultiplayerPlayerPresence[];
  generatedAt: number;
  /** Active ground loot piles in this location. */
  groundLoot?: import('./companion.js').GroundLootPile[];
}

export interface MultiplayerEnemyPresence {
  entityId: string;
  type: string;
  level: number;
  hp: number;
  maxHp: number;
  speed: number;
  x: number;
  y: number;
  quest: boolean;
  facing: 'left' | 'right';
  moving: boolean;
  alive: boolean;
  /** Контроль с сервера: pin — медленный, stun — стоит. */
  control?: 'pin' | 'stun';
}

export interface MultiplayerEnemySnapshot {
  interestFiltered?:boolean;
  locationId: string;
  encounterId: string;
  enemies: MultiplayerEnemyPresence[];
  generatedAt: number;
}

export interface PartyMemberInfo {
  saveId: string;
  name: string;
  level: number;
  race: string;
  profession: string;
  locationId: string | null;
  /** Человекочитаемое имя локации (для UI). */
  locationName: string | null;
  online: boolean;
  hp: number | null;
  maxHp: number | null;
  mp: number | null;
  maxMp: number | null;
  pvpStatus?: PvpStatus;
  inCombat?: boolean;
}

export interface PartySnapshot {
  id: string;
  leaderSaveId: string;
  members: PartyMemberInfo[];
  /** Цель, которой лидер поделился (assist). */
  assistTargetSaveId?: string | null;
  assistTargetName?: string | null;
}

export interface PartyInvitePayload {
  partyId: string;
  fromSaveId: string;
  fromName: string;
  expiresAt: number;
}

export interface PartyXpSharePayload {
  fromSaveId: string;
  fromName: string;
  xpGained: number;
  leveledUp: boolean;
  enemyHint?: string;
}

export interface PartyQuestSharePayload {
  fromSaveId: string;
  fromName: string;
  enemyTypes?: string[];
  questCompleted?: boolean;
  questId?: string;
  /** Входящий вызов рации после завершения квеста у союзника. */
  radioNpcId?: string;
  /** Союзник получил тот же активный квест от лидера/члена пати. */
  activatedFlag?: string;
}

export interface MultiplayerBootstrap {
  protocolVersion?:number;
  self: MultiplayerPlayerPresence;
  snapshot: MultiplayerLocationSnapshot;
  decision: MultiplayerDesignDecision;
  party?: PartySnapshot | null;
  /** Shared world clock (base; client applies location lighting profile). */
  worldTime?: import('./day-night.js').DayNightSnapshot;
  /** Authoritative Haven NPC positions / schedule phase (empery_haven only). */
  havenSchedule?: import('./haven-schedule-state.js').HavenScheduleSnapshot;
}

export type MultiplayerClientMessage =
  | import('./movement.js').MovementCommand
  | {
      type: 'hello';
      saveId: string;
    }
  | {
      type: 'join_location';
      locationId: string;
    }
    | {
      type: 'player_input';
      x: number;
      y: number;
      moving: boolean;
      facing: 'left' | 'right';
      /** Сразу записать worldX/Y в сейв (закрытие вкладки / hide). */
      persist?: boolean;
      running?: boolean;
      /** Request a dash; duration, cooldown and stamina are server-owned. */
      dash?: boolean;
    }
  | {
      type: 'chat_send';
      channel: ChatChannel;
      text: string;
      /** Target display name for private messages (case-insensitive). */
      toName?: string;
    }
  | {
      type: 'party_invite';
      toName: string;
    }
  | {
      type: 'party_accept';
      partyId: string;
    }
  | {
      type: 'party_decline';
      partyId: string;
    }
  | {
      type: 'party_leave';
    }
  | {
      type: 'party_kick';
      saveId: string;
    }
  | {
      type: 'party_disband';
    }
  | {
      type: 'party_promote';
      saveId: string;
    }
  | {
      type: 'party_assist';
      targetSaveId: string | null;
    }
  | {
      /** Союзный heal/buff по цели (себя или пати). */
      type: 'ally_cast';
      /** Для targetMode ally; для party можно опустить. */
      targetSaveId?: string | null;
      skillId: string;
    }
  | {
      type: 'pvp_attack';
      targetSaveId: string;
      skillId?: string;
      moving?: boolean;
      dashing?: boolean;
    }
  | {
      type: 'loot_pickup';
      lootId: string;
    }
  | {
      type: 'ping';
      ts: number;
    };

export type MultiplayerServerMessage =
  | {type:'enemy_delta';payload:{locationId:string;encounterId:string;added:MultiplayerEnemyPresence[];changed:Array<Partial<MultiplayerEnemyPresence>&{entityId:string;unset?:Array<keyof MultiplayerEnemyPresence>}>;removed:string[];dead:string[]}}
  | {type:'presence_delta';payload:{locationId:string;added:MultiplayerPlayerPresence[];changed:Array<Partial<MultiplayerPlayerPresence>&{saveId:string;unset?:Array<keyof MultiplayerPlayerPresence>}>;removed:string[];groundLoot?:import('./companion.js').GroundLootPile[]}}
  | {type:'motion_snapshot';payload:import('./movement.js').MovementSnapshot}
  | { type: 'player_state'; payload: { save: import('./types.js').PlayerSave; stats: import('./types.js').PlayerStats } }
  | { type: 'position_correction'; payload: { x: number; y: number } }
  | { type: 'enemy_hit'; payload: { save: import('./types.js').PlayerSave; stats: import('./types.js').PlayerStats; damage: number; dodged: boolean; perfectDodge?: boolean } }
  | {
      type: 'welcome';
      payload: MultiplayerBootstrap;
    }
  | {
      type: 'location_snapshot';
      payload: MultiplayerLocationSnapshot;
    }
  | {
      type: 'player_joined' | 'player_updated' | 'player_left';
      payload: MultiplayerPlayerPresence;
    }
  | {
      type: 'enemy_snapshot';
      payload: MultiplayerEnemySnapshot;
    }
  | {
      type: 'chat_message';
      payload: MultiplayerChatMessage;
    }
  | {
      type: 'chat_error';
      error: string;
      code?: string;
    }
  | {
      type: 'party_snapshot';
      payload: PartySnapshot | null;
    }
  | {
      type: 'party_invite';
      payload: PartyInvitePayload;
    }
  | {
      type: 'party_xp';
      payload: PartyXpSharePayload;
    }
  | {
      type: 'party_quest';
      payload: PartyQuestSharePayload;
    }
  | {
      type: 'party_error';
      error: string;
      code?: string;
    }
  | {
      type: 'pvp_result';
      payload: PvpHitPayload;
    }
  | {
      type: 'pvp_event';
      payload: PvpHitPayload;
    }
  | {
      type: 'pvp_death';
      payload: PvpDeathPayload;
    }
  | {
      type: 'player_resurrected';
      payload: {
        targetSaveId: string;
        casterSaveId: string;
        casterName: string;
        targetName: string;
      };
    }
  | {
      type: 'ally_cast_result';
      payload: AllyCastPayload;
    }
  | {
      type: 'ally_cast_error';
      error: string;
      code?: string;
    }
  | {
      type: 'pvp_error';
      error: string;
      code?: string;
    }
  | {
      type: 'pong';
      ts: number;
    }
  | {
      type: 'survival_update';
      payload: {
        saveId: string;
        survival: import('./types.js').SurvivalState;
        /** Synced when survival collapse or vitals change (client must not wait for refresh). */
        hp?: number;
        maxHp?: number;
        lastDeathCause?: string | null;
        lastDeathKind?: import('./death.js').DeathKind | null;
        stats?: {
          survivalSeverity?: import('./types.js').SurvivalSeverity;
          survivalConditions?: Array<{
            id: import('./types.js').SurvivalConditionId;
            severity: import('./types.js').SurvivalSeverity;
          }>;
        };
      };
    }
  | {
      type: 'ground_loot_spawned';
      payload: import('./companion.js').GroundLootPile;
    }
  | {
      type: 'ground_loot_removed';
      payload: import('./companion.js').GroundLootRemovedPayload;
    }
  | {
      type: 'loot_pickup_result';
      payload: {
        ok: boolean;
        error?: string;
        lootId?: string;
        saveId: string;
        /** Summary for toast. */
        summary?: string;
      };
    }
  | {
      type: 'world_time';
      payload: {
        timeOfDay: import('./day-night.js').DayNightSnapshot;
        havenSchedule?: import('./haven-schedule-state.js').HavenScheduleSnapshot;
      };
    }
  | {
      type: 'companion_fetch_started';
      payload: import('./companion.js').CompanionFetchStartedPayload;
    }
  | {
      type: 'companion_tamed';
      payload: {
        saveId: string;
        kind: import('./companion.js').CompanionKind;
        variantId: string;
      };
    }
  | {
      type: 'error';
      error: string;
      code?: string;
    };
