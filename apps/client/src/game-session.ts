import type Phaser from 'phaser';
import type {
  EnemyDefinition,
  MediaManifest,
  PlayerSave,
  PlayerStats,
} from './api.js';
import { createGameInstance, getGameScene } from './game/game-loader.js';
import { bindWebGlContextRecovery } from './game/webgl-context-recovery.js';
import type { LocationConfig } from './game/scenes/location-types.js';

export type CreateGameCallbacks = Parameters<typeof createGameInstance>[8];

/** Narrow host so main.ts owns session state, this module owns Phaser boot/travel. */
export interface GameSessionHost {
  getSave: () => PlayerSave | null;
  getStats: () => PlayerStats | null;
  getLocation: () => LocationConfig | null;
  getEnemies: () => EnemyDefinition[];
  getActiveSkillIds: () => (string | null)[];
  getSkillDefinitions: () => import('./api.js').SkillDefinition[];
  getItems: () => Array<{ id: string; name: string }>;
  getMediaManifest: () => MediaManifest;
  setMediaManifest?: (m: MediaManifest) => void;
  refreshMediaManifest?: () => Promise<void>;
  getGame: () => Phaser.Game | null;
  setGame: (game: Phaser.Game | null) => void;
  getGameCallbacks: () => CreateGameCallbacks;
}

/**
 * Lazy Phaser boot + location handoff without destroying WebGL.
 */
export class GameSession {
  private bootPromise: Promise<void> | null = null;

  constructor(private readonly host: GameSessionHost) {}

  ensureGame(): Promise<void> {
    const save = this.host.getSave();
    const stats = this.host.getStats();
    const location = this.host.getLocation();
    if (!save || !stats || !location) return Promise.resolve();
    if (this.host.getGame()) return Promise.resolve();
    if (this.bootPromise) return this.bootPromise;

    const itemNames = new Map(this.host.getItems().map((item) => [item.id, item.name]));
    this.bootPromise = createGameInstance(
      document.getElementById('game')!,
      save,
      stats,
      location,
      this.host.getEnemies(),
      this.host.getActiveSkillIds(),
      itemNames,
      this.host.getMediaManifest(),
      this.host.getGameCallbacks(),
      this.host.getSkillDefinitions(),
    )
      .then((instance) => {
        this.host.setGame(instance);
        bindWebGlContextRecovery(instance, () => {
          this.host.getGameCallbacks().onCombatFeedback?.('WebGL сброшен — перезапуск сцены');
          try {
            instance.destroy(true);
          } catch {
            /* already dead */
          }
          if (this.host.getGame() === instance) this.host.setGame(null);
          void this.ensureGame();
        });
      })
      .finally(() => {
        this.bootPromise = null;
      });

    return this.bootPromise;
  }

  transitionLocation(): void {
    const save = this.host.getSave();
    const stats = this.host.getStats();
    const location = this.host.getLocation();
    if (!save || !stats || !location) return;

    const game = this.host.getGame();
    if (!game) {
      void this.ensureGame();
      return;
    }

    const run = (): void => {
      try {
        const gs = getGameScene(game);
        if (gs.scene.isActive()) gs.network.abort();
      } catch {
        /* scene may be mid-shutdown */
      }

      game.registry.set('bootSave', save);
      game.registry.set('bootStats', stats);
      game.registry.set('bootLocation', location);
      game.registry.set('mediaManifest', this.host.getMediaManifest());
      game.registry.set('activeSkillIds', this.host.getActiveSkillIds());
      game.registry.set('skillDefinitions', this.host.getSkillDefinitions());

      const g = game;
      const kickBoot = (): void => {
        if (this.host.getGame() !== g) return;
        try {
          g.scene.start('BootScene');
        } catch (err) {
          console.error('[travel] BootScene start failed, recreating game', err);
          g.destroy(true);
          this.host.setGame(null);
          void this.ensureGame();
        }
      };

      if (g.scene.isActive('GameScene') || g.scene.isSleeping('GameScene')) {
        g.scene.stop('GameScene');
        window.setTimeout(kickBoot, 0);
      } else {
        kickBoot();
      }
    };

    const refresh = this.host.refreshMediaManifest;
    if (refresh) {
      void refresh()
        .catch(() => undefined)
        .finally(run);
      return;
    }
    run();
  }
}
