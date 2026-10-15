import type Phaser from 'phaser';
import type { PlayerSave, PlayerStats, SkillDefinition } from '../../api.js';
import {
  CombatSystem,
  type CombatCallbacks,
} from '../controllers/CombatSystem.js';
import type { PlayerController } from '../controllers/PlayerController.js';
import type { EnemyAIController } from '../controllers/EnemyAIController.js';
import type { InputManager } from './InputManager.js';
import type { EntityManager } from './EntityManager.js';
import type { NetworkManager } from './NetworkManager.js';
import type { VfxSystem } from './VfxSystem.js';
import type { RemotePlayerManager } from './RemotePlayerManager.js';
import type { RealtimeGateway } from './RealtimeGateway.js';
import type { GameRegistryCallbacks } from './RealtimeRouter.js';
import type { LocationConfig } from '../scenes/location-types.js';

export interface WireCombatDeps {
  scene: Phaser.Scene;
  input: InputManager;
  playerCtrl: PlayerController;
  entities: EntityManager;
  network: NetworkManager;
  vfx: VfxSystem;
  remotePlayers: RemotePlayerManager;
  realtime: RealtimeGateway;
  location: LocationConfig;
  getSave: () => PlayerSave;
  setSave: (s: PlayerSave) => void;
  setStats: (s: PlayerStats) => void;
  callbacks: GameRegistryCallbacks | undefined;
  onEncounterStale: () => Promise<void>;
  enemyAi: EnemyAIController;
}

/** Build CombatSystem + player↔enemy overlap for the active scene. */
export function wireCombatSystem(deps: WireCombatDeps): CombatSystem {
  const combatCallbacks: CombatCallbacks = {
    onSaveUpdate: (s, st, opts) => {
      deps.setSave(s);
      if (st) deps.setStats(st);
      deps.callbacks?.onSaveUpdate?.(s, st, opts);
    },
    onCombatFeedback: deps.callbacks?.onCombatFeedback,
    onSkillsChanged: deps.callbacks?.onSkillsChanged,
    onPlayerDeath: deps.callbacks?.onPlayerDeath,
    onEncounterStale: deps.onEncounterStale,
    onTimedBuffs: (buffs) => deps.callbacks?.onTimedBuffs?.(buffs),
    onRadioIncoming: (npcId) => deps.callbacks?.onRadioIncoming?.(npcId),
    onPvpAttack: (targetSaveId, skillId) => {
      deps.realtime.send({
        type: 'pvp_attack',
        targetSaveId,
        skillId,
        moving: deps.playerCtrl.isMoving,
        dashing: deps.playerCtrl.isDashing,
      });
    },
    onAllyCast: (targetSaveId, skillId) => {
      deps.realtime.send({
        type: 'ally_cast',
        ...(targetSaveId ? { targetSaveId } : {}),
        skillId,
      });
    },
    resolveAllyCastTarget: (reach) => {
      const self = { saveId: deps.getSave().id, x: deps.playerCtrl.x, y: deps.playerCtrl.y };
      const selected = deps.remotePlayers.getSelected();
      if (!selected || selected === deps.getSave().id) return self;
      const partyIds = deps.scene.registry.get('partySaveIds') as ReadonlySet<string> | undefined;
      if (!partyIds?.has(selected)) return self;
      const spr = deps.remotePlayers.getSprite(selected);
      const presence = deps.remotePlayers.getPresence(selected);
      if (!spr || !presence || presence.hp <= 0) return self;
      const dx = spr.x - deps.playerCtrl.x;
      const dy = spr.y - deps.playerCtrl.y;
      if (dx * dx + dy * dy > reach * reach) {
        deps.callbacks?.onCombatFeedback?.('Союзник слишком далеко — на себя');
        return self;
      }
      return { saveId: selected, x: spr.x, y: spr.y };
    },
  };

  const combat = new CombatSystem(
    deps.scene,
    deps.input,
    deps.playerCtrl,
    deps.entities,
    deps.network,
    deps.vfx,
    combatCallbacks,
    deps.remotePlayers,
  );

  const activeSkillIds =
    (deps.scene.registry.get('activeSkillIds') as (string | null)[] | undefined) ?? [];
  combat.setActiveSkillIds(activeSkillIds);
  const skillDefs =
    (deps.scene.registry.get('skillDefinitions') as SkillDefinition[] | undefined) ?? [];
  combat.setSkillDefinitions(skillDefs);

  return combat;
}
