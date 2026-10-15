import Phaser from 'phaser';
import type { MediaManifest } from '../../api.js';
import {
  registerCombatSprites,
  registerNpcSprites,
  registerCloakOverlay,
} from '../../sprites/sprite-factory.js';
import {
  ensureFallbackTileset,
  normalizeLoadedTextures,
  packWorldMediaAtlas,
  preloadGameTextures,
  queueMissingLocationPropTextures,
  clearWorldMediaTextures,
  syncWorldMediaTextures,
} from '../../sprites/texture-loader.js';
import { bindAllEnemyArtAnims } from '../../sprites/sprite-loader.js';
import type { LocationConfig } from '../scenes/location-types.js';
import { mapJsonUrl } from '../maps-stamp.js';

/** Persistent texture/anim/map helpers — call ensure* instead of regenerating blindly. */
export class ResourceCache {
  ensureCombatAssets(scene: Phaser.Scene, playerRace: string): void {
    registerCombatSprites(scene, playerRace);
    registerNpcSprites(scene);
  }

  ensureCloak(scene: Phaser.Scene, variant: string): void {
    registerCloakOverlay(scene, variant);
  }

  ensureVignette(scene: Phaser.Scene, w: number, h: number): void {
    if (scene.textures.exists('vignette-mask')) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.55);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(w / 2, h / 2, w * 0.92, h * 0.88);
    g.generateTexture('vignette-mask', w, h);
    g.destroy();
  }

  ensureFallbackTileset(scene: Phaser.Scene, locationId: string): Promise<void> {
    return ensureFallbackTileset(scene, locationId);
  }

  normalizeLoadedTextures(scene: Phaser.Scene, race: string): void {
    const dirty = normalizeLoadedTextures(scene, race);
    if (dirty) packWorldMediaAtlas(scene);
    bindAllEnemyArtAnims(scene);
  }

  /** Queue map JSON if not already in cache (BootScene / travel load). */
  queueMap(loader: Phaser.Loader.LoaderPlugin, mapKey: string, scene: Phaser.Scene): void {
    if (scene.cache.tilemap.exists(mapKey)) return;
    loader.tilemapTiledJSON(mapKey, mapJsonUrl(mapKey));
  }

  /** Reload world media only when generate:media bumped manifest.generatedAt. */
  syncWorldMedia(scene: Phaser.Scene, manifest: MediaManifest): void {
    syncWorldMediaTextures(scene, manifest);
  }

  preloadLocationTextures(
    loader: Phaser.Loader.LoaderPlugin,
    manifest: MediaManifest,
    location: LocationConfig,
    race: string,
  ): void {
    preloadGameTextures(
      loader,
      manifest,
      location,
      race,
      manifest.cacheRevision ?? manifest.generatedAt ?? '0',
    );
  }

  clearWorldMedia(scene: Phaser.Scene): void {
    clearWorldMediaTextures(scene);
  }

  async ensureLocationPropCoverage(
    scene: Phaser.Scene,
    manifest: MediaManifest,
    locationId: string,
  ): Promise<string[]> {
    scene.load.reset();
    const missing = queueMissingLocationPropTextures(
      scene.load,
      scene,
      manifest,
      locationId,
      manifest.cacheRevision ?? manifest.generatedAt ?? '0',
    );
    if (missing.length === 0) return [];
    await new Promise<void>((resolve) => {
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      scene.load.start();
    });
    return missing;
  }
}

export const resourceCache = new ResourceCache();
