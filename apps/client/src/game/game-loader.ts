import type Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene.js';

type GameModule = typeof import('./create-game.js');

let module: GameModule | null = null;
let loadPromise: Promise<GameModule> | null = null;

/** Lazy-load Phaser + scenes (separate Vite chunk). */
export async function loadGameModule(): Promise<GameModule> {
  if (module) return module;
  loadPromise ??= import('./create-game.js').then((loaded) => {
    module = loaded;
    return loaded;
  });
  return loadPromise;
}

export function requireGameModule(): GameModule {
  if (!module) throw new Error('Phaser game module not loaded yet');
  return module;
}

export function getGameScene(game: Phaser.Game): GameScene {
  return requireGameModule().getGameScene(game);
}

export async function createGameInstance(
  ...args: Parameters<GameModule['createGame']>
): Promise<Phaser.Game> {
  const loaded = await loadGameModule();
  return loaded.createGame(...args);
}
