import Phaser from 'phaser';
import { atmosphereFor } from '../../sprites/vfx.js';
import type { PlayerSave } from '../../api.js';
import type { LocationConfig } from '../scenes/location-types.js';
import { placeHudInScreen } from './graphics-quality.js';

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

/** Banner-only quest UI presenter. */
export class QuestPresenter {
  private banner!: Phaser.GameObjects.Text;

  create(scene: Phaser.Scene, location: LocationConfig): void {
    const atm = atmosphereFor(location.id);
    this.banner = scene.add
      .text(scene.scale.width / 2, 40, location.name, {
        color: atm.markerColor,
        fontSize: '18px',
        fontStyle: 'bold',
        backgroundColor: '#00000099',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setScrollFactor(0);
    placeHudInScreen(this.banner, scene.scale.width / 2, 40, scene.cameras.main.zoom, scene.scale.width, scene.scale.height);
  }

  show(text: string): void {
    this.banner?.setText(text);
  }

  refreshFromSave(location: LocationConfig, save: PlayerSave): void {
    for (const done of location.questComplete ?? []) {
      if (done.anyFlag.some((f) => hasFlag(save, f))) {
        this.show(done.banner);
        return;
      }
    }
    for (const group of location.questSpawns ?? []) {
      if (!hasFlag(save, group.activeFlag)) continue;
      if (group.banner && group.killCounterFlag) {
        const kills = Number(save.questFlags[group.killCounterFlag] ?? 0);
        this.show(group.banner.replace('{kills}', String(kills)));
      }
      return;
    }
    if (location.farmSpawn) {
      this.show('Фарм адены — до 60 мобов, мало XP');
    } else {
      this.show(location.name);
    }
  }
}
