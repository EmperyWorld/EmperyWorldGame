import type { MultiplayerPlayerPresence, PlayerSave } from '@empery/shared';

/**
 * Persistence contracts for the next multiplayer phases.
 * PostgreSQL stores progression; the single simulation owner holds active state in memory.
 */

export interface CharacterRepository {
  getBySaveId(saveId: string): Promise<PlayerSave | null>;
  saveCharacter(save: PlayerSave): Promise<void>;
  deleteCharacter?(saveId: string): Promise<void>;
  listSaveIdsForAccount?(accountId: string): Promise<string[]>;
}

export interface PresenceRepository {
  upsertPresence(presence: MultiplayerPlayerPresence, channelKey?: string): Promise<void>;
  removePresence(saveId: string): Promise<void>;
  listByLocation(locationId: string): Promise<MultiplayerPlayerPresence[]>;
}

export interface MultiplayerPersistencePlan {
  postgres: {
    tables: string[];
    notes: string[];
  };
  redis: {
    keys: string[];
    channels: string[];
    notes: string[];
  };
  migration: string[];
}

export const MULTIPLAYER_PERSISTENCE_PLAN: MultiplayerPersistencePlan = {
  postgres: {
    tables: [
      'characters',
      'character_equipment',
      'character_inventory_items',
      'character_skills',
      'player_sessions',
      'parties',
      'party_members',
    ],
    notes: [
      'Keep character progression durable in Postgres.',
      'Split inventory instances from item definitions.',
      'Store reconnect/session metadata separately from gameplay state.',
    ],
  },
  redis: {
    keys: [
      'presence:location:{locationId}',
      'presence:player:{saveId}',
      'world:instance:{instanceId}',
    ],
    channels: [
      'world.events.{instanceId}',
      'presence.events.{locationId}',
    ],
    notes: [
      'Redis carries ephemeral presence and fan-out.',
      'World snapshots can stay memory-local until scale-out is needed.',
    ],
  },
  migration: [
    'DONE: One-time file import; PostgreSQL primary with transactional revisions and receipts.',
    'DONE: Server intent simulation and shared collision geometry.',
    'DONE: Mirror WorldRuntime presence into Redis (player hash + location sets).',
    'DONE: Redis pub/sub presence fan-out across nodes.',
    'NEXT: Partitioned instance ownership, durable handoff and recovery.',
  ],
};
