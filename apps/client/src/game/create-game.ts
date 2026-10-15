import Phaser from 'phaser';
import type { EnemyDefinition, MediaManifest, PlayerSave, PlayerStats, SkillDefinition } from '../api.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import type { LocationConfig } from './scenes/location-types.js';
import {
  GRAPHICS_CHANGED_EVENT,
  applyGraphicsDocument,
  canvasGameSize,
  getGraphicsProfile,
  type GraphicsProfile,
} from './systems/graphics-quality.js';

export type { LocationConfig as GameLocationConfig } from './scenes/location-types.js';
export { GameScene, BootScene };

function parentCssSize(parent: HTMLElement): { width: number; height: number } {
  return {
    width: Math.max(640, parent.clientWidth || 1280),
    height: Math.max(360, parent.clientHeight || 720),
  };
}

function applyGraphicsToGame(game: Phaser.Game, parent: HTMLElement, profile: GraphicsProfile): void {
  applyGraphicsDocument(profile.quality);
  const css = parentCssSize(parent);
  const size = canvasGameSize(css.width, css.height, profile.resolutionScale);
  if (Math.abs(game.scale.width - size.width) > 2 || Math.abs(game.scale.height - size.height) > 2) {
    game.scale.setGameSize(size.width, size.height);
  }
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.imageRendering = profile.smoothPixelArt
      ? 'auto'
      : profile.resolutionScale >= 0.99
        ? 'pixelated'
        : 'auto';
  }
  if (typeof game.loop.setFPSLimit === 'function') {
    game.loop.setFPSLimit(profile.fpsLimit);
  }
  game.loop.targetFps = profile.fpsTarget;
  // Below this Phaser clamps delta → slow-mo while Date.now() clock still ticks.
  game.loop.minFps = 8;
  const gs = game.scene.getScene('GameScene') as GameScene | undefined;
  gs?.cameras?.main?.setZoom(profile.resolutionScale);
  const filter =
    profile.smoothPixelArt ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST;
  game.textures.each((texture) => {
    // Mid-frequency cobble + LINEAR shimmer scrolls as рябь; keep ground crisp.
    if (texture.key === 'terrain-tiles') {
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      return;
    }
    texture.setFilter(filter);
  }, game);
}

function bindGraphicsQuality(game: Phaser.Game, parent: HTMLElement): void {
  let applying = false;
  const apply = (): void => {
    if (applying) return;
    applying = true;
    try {
      applyGraphicsToGame(game, parent, getGraphicsProfile());
    } finally {
      applying = false;
    }
  };
  apply();
  const onChanged = (): void => apply();
  window.addEventListener(GRAPHICS_CHANGED_EVENT, onChanged);
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => apply())
      : null;
  ro?.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener(GRAPHICS_CHANGED_EVENT, onChanged);
    ro?.disconnect();
  });
}

export function createGame(
  parent: HTMLElement,
  save: PlayerSave,
  stats: PlayerStats,
  location: LocationConfig,
  enemyDefs: EnemyDefinition[],
  activeSkillIds: (string | null)[],
  itemNames: Map<string, string>,
  mediaManifest: MediaManifest,
  callbacks: {
    onSaveUpdate?: (
      save: PlayerSave,
      stats?: PlayerStats,
      opts?: { combatTick?: boolean },
    ) => void;
    onTalkNpc?: (npcId: string) => void;
    onUseStation?: (kinds: Array<'campfire' | 'hearth' | 'water' | 'pot'>) => void;
    onCombatFeedback?: (text: string) => void;
    onSkillsChanged?: (unlocked?: string[]) => void;
    onPlayerDeath?: () => void;
    onTravelLocation?: (locationId: string) => void;
    onTravelResult?: (ok: boolean) => void;
    onAutoAttackToggle?: (active: boolean, remainingMs: number) => void;
    onTimedBuffs?: (
      buffs: Array<{ id: string; name: string; remainingMs: number; detail?: string }>,
    ) => void;
    onChatMessage?: (msg: import('../api.js').MultiplayerChatMessage) => void;
    onChatError?: (error: string) => void;
    onPartySnapshot?: (party: import('../api.js').PartySnapshot | null) => void;
    onPartyInvite?: (invite: import('../api.js').PartyInvitePayload) => void;
    onPartyError?: (error: string) => void;
    onPartyXp?: (payload: import('../api.js').PartyXpSharePayload) => void;
    onPartyQuest?: (payload: import('../api.js').PartyQuestSharePayload) => void;
    onPartyMemberVitals?: (
      saveId: string,
      vitals: {
        hp?: number;
        maxHp?: number;
        mp?: number;
        maxMp?: number;
        online?: boolean;
        locationId?: string | null;
        locationName?: string | null;
        pvpStatus?: string;
        inCombat?: boolean;
        buffLabels?: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
      },
    ) => void;
    onPartyMemberLeft?: (saveId: string) => void;
    onPlayerTarget?: (target: { saveId: string; name: string } | null) => void;
    onPvpStatus?: (status: {
      karma: number;
      pvpStatus: string;
      pvpFlagRemainingMs?: number;
    }) => void;
    onRadioIncoming?: (npcId: string) => void;
    onPlayerResurrected?: (payload: {
      targetSaveId: string;
      casterSaveId: string;
      casterName: string;
      targetName: string;
    }) => void;
  },
  skillDefinitions: SkillDefinition[] = [],
): Phaser.Game {
  const profile = getGraphicsProfile();
  applyGraphicsDocument(profile.quality);
  const css = parentCssSize(parent);
  const size = canvasGameSize(css.width, css.height, profile.resolutionScale);
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: size.width,
    height: size.height,
    parent,
    fps: {
      target: profile.fpsTarget,
      min: 8,
      limit: profile.fpsLimit,
      smoothStep: true,
    },
    render: {
      roundPixels: true,
      antialias: false,
      pixelArt: !profile.smoothPixelArt,
      smoothPixelArt: profile.smoothPixelArt,
      powerPreference: profile.powerPreference,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
        fps: 60,
      },
    },
    scene: [BootScene, GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoRound: true,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: size.width,
      height: size.height,
    },
    callbacks: {
      preBoot: (g) => {
        g.registry.set('bootSave', save);
        g.registry.set('bootStats', stats);
        g.registry.set('bootLocation', location);
        g.registry.set('enemyDefs', enemyDefs);
        g.registry.set('itemNames', itemNames);
        g.registry.set('activeSkillIds', activeSkillIds);
        g.registry.set('skillDefinitions', skillDefinitions);
        g.registry.set('mediaManifest', mediaManifest);
        g.registry.set('callbacks', callbacks);
      },
      postBoot: (g) => bindGraphicsQuality(g, parent),
    },
  });
}

export function getGameScene(game: Phaser.Game): GameScene {
  return game.scene.getScene('GameScene') as GameScene;
}
