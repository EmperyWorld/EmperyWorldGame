import type Phaser from 'phaser';
import type {
  AuthAccount,
  EnemyDefinition,
  ItemDefinition,
  MediaManifest,
  PlayerSave,
  PlayerStats,
  ProfessionDefinition,
  Race,
  SaveSlotMeta,
  SkillDefinition,
} from './api.js';
import type { LocationConfig as GameLocationConfig } from './game/scenes/location-types.js';

/** Mutable client session state with shared accessors for wiring. */
export function createAppState() {
  let save: PlayerSave | null = null;
  let stats: PlayerStats | null = null;
  let currentLocation: GameLocationConfig | null = null;
  let items: ItemDefinition[] = [];
  let mediaManifest: MediaManifest = { assets: {} };
  let races: Race[] = [];
  let professions: ProfessionDefinition[] = [];
  let enemies: EnemyDefinition[] = [];
  let playerSkills: SkillDefinition[] = [];
  let activeSkillIds: (string | null)[] = [];
  let saveSlots: SaveSlotMeta[] = [];
  let game: Phaser.Game | null = null;
  let currentAccount: AuthAccount | null = null;

  return {
    getSave: () => save,
    setSave: (s: PlayerSave | null) => {
      save = s;
    },
    /** Non-null setter for action factories. */
    patchSave: (s: PlayerSave) => {
      save = s;
    },
    getStats: () => stats,
    setStats: (s: PlayerStats | null) => {
      stats = s;
    },
    patchStats: (s: PlayerStats) => {
      stats = s;
    },
    getLocation: () => currentLocation,
    setLocation: (loc: GameLocationConfig | null) => {
      currentLocation = loc;
    },
    patchLocation: (loc: GameLocationConfig) => {
      currentLocation = loc;
    },
    getItems: () => items,
    setItems: (next: ItemDefinition[]) => {
      items = next;
    },
    getManifest: () => mediaManifest,
    setManifest: (m: MediaManifest) => {
      mediaManifest = m;
    },
    getRaces: () => races,
    setRaces: (next: Race[]) => {
      races = next;
    },
    getProfessions: () => professions,
    setProfessions: (next: ProfessionDefinition[]) => {
      professions = next;
    },
    getEnemies: () => enemies,
    setEnemies: (next: EnemyDefinition[]) => {
      enemies = next;
    },
    getPlayerSkills: () => playerSkills,
    setPlayerSkills: (skills: SkillDefinition[]) => {
      playerSkills = skills;
    },
    getActiveSkillIds: () => activeSkillIds,
    setActiveSkillIds: (ids: (string | null)[]) => {
      activeSkillIds = ids;
    },
    getSaveSlots: () => saveSlots,
    setSaveSlots: (slots: SaveSlotMeta[]) => {
      saveSlots = slots;
    },
    getGame: () => game,
    setGame: (g: Phaser.Game | null) => {
      game = g;
    },
    getAccount: () => currentAccount,
    setAccount: (a: AuthAccount | null) => {
      currentAccount = a;
    },
    raceLabel: (raceId: string) => races.find((r) => r.id === raceId)?.name ?? raceId,
    professionLabel: (id: string) => professions.find((p) => p.id === id)?.name ?? id,
  };
}

export type AppState = ReturnType<typeof createAppState>;
