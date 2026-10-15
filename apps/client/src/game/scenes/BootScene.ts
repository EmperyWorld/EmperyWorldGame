import Phaser from 'phaser';
import type { MediaManifest, PlayerSave, PlayerStats } from '../../api.js';
import { bindLoaderProgress, hideBootProgress } from '../boot-progress.js';
import { resourceCache } from '../systems/ResourceCache.js';
import type { LocationConfig } from './location-types.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Reset loader — a previous interrupted travel can leave it stuck.
    this.load.reset();
    bindLoaderProgress(this.load);

    const save = this.registry.get('bootSave') as PlayerSave | undefined;
    const location = this.registry.get('bootLocation') as LocationConfig | undefined;
    const manifest = (this.registry.get('mediaManifest') as MediaManifest | undefined) ?? {
      assets: {},
    };

    resourceCache.syncWorldMedia(this, manifest);

    if (location?.id === 'empery_hq_lobby' && !this.textures.exists('emperyworld-logo')) {
      this.load.image('emperyworld-logo', '/branding/emperyworld-logo.webp');
    }
    if (location) {
      resourceCache.queueMap(this.load, location.mapKey, this);
    }

    if (location && save) {
      resourceCache.preloadLocationTextures(this.load, manifest, location, save.race);
      const hasGeneratedDecor =
        Boolean(manifest.assets[location.backgroundAsset ?? '']?.url) ||
        Object.keys(manifest.assets).some(
          (id) => id.startsWith('prop_') && manifest.assets[id]?.url,
        );
      if (hasGeneratedDecor) {
        this.registry.set('useGeneratedArt', true);
      }
    } else if (location?.backgroundUrl) {
      const bgKey = `loc-bg-${location.id}`;
      if (!this.textures.exists(bgKey)) {
        this.load.image(bgKey, location.backgroundUrl);
      }
    }
  }

  create(): void {
    const save = this.registry.get('bootSave') as PlayerSave;
    const stats = this.registry.get('bootStats') as PlayerStats;
    const location = this.registry.get('bootLocation') as LocationConfig;
    const manifest = (this.registry.get('mediaManifest') as MediaManifest | undefined) ?? {
      assets: {},
    };

    if (!save || !stats || !location) {
      console.error('[BootScene] missing boot registry data');
      hideBootProgress();
      return;
    }

    void this.finishCreate(save, stats, location, manifest);
  }

  private async finishCreate(
    save: PlayerSave,
    stats: PlayerStats,
    location: LocationConfig,
    manifest: MediaManifest,
  ): Promise<void> {
    try {
      const loadedFallback = await resourceCache.ensureLocationPropCoverage(
        this,
        manifest,
        location.id,
      );
      if (loadedFallback.length > 0) {
        console.warn(
          `[BootScene] loaded missing prop textures for ${location.id}: ${loadedFallback.slice(0, 8).join(', ')}${loadedFallback.length > 8 ? ' ...' : ''}`,
        );
      }
      resourceCache.normalizeLoadedTextures(this, save.race);
      // Canvas tileset is sync; CPU TilemapLayer paints it. (GPU+async Image raced → black ground.)
      void resourceCache.ensureFallbackTileset(this, location.id);
      this.cameras.main.setBackgroundColor('#0f1115');
      hideBootProgress();
      this.scene.start('GameScene', { save, stats, location });
    } catch (err) {
      hideBootProgress();
      console.error('[BootScene] failed to start GameScene', err);
    }
  }
}
