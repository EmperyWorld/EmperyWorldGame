export interface LocationZone {
  x: number;
  y: number;
  label: string;
  color?: string;
  /** Stand in this zone and press [R] / HUD «Войти» to travel (server still enforces canTravel). */
  travelTo?: string;
  radius?: number;
}

export interface LocationLandmark {
  kind: string;
  x: number;
  y: number;
}

export interface LocationEnemySpawn {
  type: string;
  x: number;
  y: number;
  quest?: boolean;
}

export interface LocationQuestSpawn {
  activeFlag: string;
  killCounterFlag?: string;
  banner?: string;
  startBanner?: string;
  enemies: LocationEnemySpawn[];
}

export interface LocationQuestComplete {
  anyFlag: string[];
  banner: string;
}

export interface LocationFarmSpawn {
  type: string;
  maxAlive: number;
  respawnMs?: number;
  points: Array<{ x: number; y: number }>;
}

export interface LocationConfig {
  id: string;
  name: string;
  subtitle?: string;
  mapKey: string;
  backgroundAsset?: string;
  backgroundUrl?: string;
  safeZone?: boolean;
  anomalyTier?: number;
  dayNight?: 'outdoor' | 'indoor' | 'dungeon';
  tierLabel?: string;
  recommendedLevel?: { min: number; max: number };
  spawn: { x: number; y: number };
  npcs: Array<{
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
  /** Survival stations (hearth / campfire / water / pot) — [E] interact. */
  stations?: Array<{
    id: string;
    kind: 'campfire' | 'hearth' | 'water' | 'pot';
    x: number;
    y: number;
    radius?: number;
  }>;
  /** Port seagull interact points (secret tame). */
  seagulls?: Array<{ id: string; x: number; y: number }>;
  zones?: LocationZone[];
  landmarks?: LocationLandmark[];
  enemies?: LocationEnemySpawn[];
  farmSpawn?: LocationFarmSpawn;
  questSpawns?: LocationQuestSpawn[];
  questComplete?: LocationQuestComplete[];
}

export interface EncounterEntitySpawn {
  entityId: string;
  type: string;
  level: number;
  hp: number;
  maxHp: number;
  speed: number;
  x: number;
  y: number;
  quest: boolean;
  control?: 'pin' | 'stun';
}
