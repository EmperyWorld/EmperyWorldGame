import Phaser from 'phaser';
import { ensureNightGlowTexture } from './sprites/night-glow-texture.js';
import { HAVEN_TRAVEL_PAD_Y_OFFSET, type DayNightSnapshot } from '@empery/shared';
import { Depth } from './game/constants/depth.js';
import type { LocationConfig } from './game/scenes/location-types.js';
import { HAVEN_CITY_PROPS } from './sprites/haven-city-data.js';
import { HAVEN_NIGHT_VENUES } from './sprites/haven-night-venues.js';
import { EMPERY_HQ_PROPS } from './sprites/empery-hq-data.js';
import { getGraphicsProfile } from './game/systems/graphics-quality.js';
import { isSceneLight2DEnabled } from './sprites/light2d-pipeline.js';

const LIGHT_LANDMARKS = new Set([
  'tavern',
  'inn',
  'forge',
  'brewery',
  'chapel',
  'bathhouse',
  'stage',
  'amphitheatre',
  'healer',
  'library',
  'gazebo',
]);

const STREET_LAMP_PROPS = new Set([
  'prop_street_lamp',
  'prop_wall_brazier',
  'prop_apt_lantern',
  'prop_hq_floodlight',
  'prop_hq_holo_sign',
]);

interface LightPoint {
  x: number;
  y: number;
  r: number;
  /** 0 = warm (default), 1 = cyan tech */
  tech?: boolean;
}

/** Warm window/torch/lantern glows — drawn above the night overlay so they punch through. */
export class DayNightLights {
  private scene: Phaser.Scene | null = null;
  private usePipelineLights = false;
  private staticLights: Phaser.GameObjects.Light[] = [];
  private movingLights: Phaser.GameObjects.Light[] = [];
  private gfx: Phaser.GameObjects.Container | null = null;
  private dynamicGfx: Phaser.GameObjects.Container | null = null;
  private points: LightPoint[] = [];
  private movingHalos: Array<{ halo: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Image }> = [];
  private pulse = 0;

  bind(scene: Phaser.Scene, location: LocationConfig): void {
    this.scene = scene;
    this.points = collectNightLightPoints(location);
    this.pulse = 0;
    this.usePipelineLights = isSceneLight2DEnabled(scene);

    if (this.usePipelineLights) {
      try {
        scene.lights.enable().setAmbientColor(0x2a2e38);
        this.staticLights = this.points.map((p) =>
          scene.lights.addLight(
            p.x,
            p.y - (p.tech ? 8 : 10),
            p.r * (p.tech ? 2.8 : 3.2),
            p.tech ? 0x74d8ff : 0xffcd7a,
            0,
          ),
        );
      } catch {
        this.usePipelineLights = false;
      }
    }

    this.gfx = scene.add.container(0, 0).setDepth(Depth.DayNightOverlay + 1);
    this.dynamicGfx = scene.add.container(0, 0).setDepth(Depth.DayNightOverlay + 1);
    this.redrawStatic();
    this.gfx.setVisible(false).setAlpha(0);
    this.dynamicGfx.setVisible(false).setAlpha(0);
  }

  /** Cached gradient sprites avoid hard-edged floodlight circles and per-frame redraws. */
  private redrawStatic(): void {
    const group = this.gfx;
    const scene = this.scene;
    if (!group || !scene) return;
    group.removeAll(true);
    const texture = ensureNightGlowTexture(scene);
    for (const point of this.points) {
      const halo = scene.add.image(point.x, point.y - 6, texture)
        .setDisplaySize(point.r * 3.3, point.r * 3.3)
        .setTint(point.tech ? 0x74d8ff : 0xffbd70)
        .setBlendMode(Phaser.BlendModes.ADD);
      group.add(halo);
    }
  }

  update(
    snap: DayNightSnapshot,
    dtMs: number,
    movingLights?: ReadonlyArray<{ x: number; y: number }>,
  ): void {
    if (this.usePipelineLights) {
      this.updatePipelineLights(snap, dtMs, movingLights);
    }
    const g = this.gfx;
    const dg = this.dynamicGfx;
    if (!g) return;
    const profile = getGraphicsProfile();
    if (!profile.nightLights || snap.darkness < 0.12) {
      g.setVisible(false);
      if (dg) dg.setVisible(false);
      return;
    }
    if (!this.usePipelineLights) this.pulse += dtMs * 0.0025;
    const flicker = 0.97 + 0.03 * Math.sin(this.pulse * 1.4);
    // Cap so Haven lamps don't wash the ColorMatrix night back to "day".
    const strength = Math.min(0.92, 0.18 + (snap.darkness - 0.1) * 1.12) * flicker;
    g.setVisible(true);
    g.setAlpha(strength * (this.usePipelineLights ? 0.65 : 1));

    if (dg) {
      const count = Math.min(profile.movingLights ? 14 : 4, movingLights?.length ?? 0);
      const texture = this.scene ? ensureNightGlowTexture(this.scene) : '';
      while (this.movingHalos.length < count && this.scene) {
        const halo = this.scene.add.image(0, 0, texture).setDisplaySize(76, 76).setTint(0xffba66).setAlpha(0.65).setBlendMode(Phaser.BlendModes.ADD);
        const flame = this.scene.add.image(0, 0, texture).setDisplaySize(10, 10).setTint(0xffefc8).setBlendMode(Phaser.BlendModes.ADD);
        dg.add([halo, flame]);this.movingHalos.push({halo,flame});
      }
      dg.setVisible(count > 0).setAlpha(strength * 0.85);
      for (let i=0;i<this.movingHalos.length;i++) {
        const pair=this.movingHalos[i]!, point=movingLights?.[i];
        pair.halo.setVisible(i<count);pair.flame.setVisible(i<count);
        if(i<count&&point){pair.halo.setPosition(point.x,point.y-6);pair.flame.setPosition(point.x,point.y-12);}
      }
    }
  }

  private updatePipelineLights(
    snap: DayNightSnapshot,
    dtMs: number,
    movingLights?: ReadonlyArray<{ x: number; y: number }>,
  ): void {
    const scene = this.scene;
    if (!scene) return;
    const profile = getGraphicsProfile();
    this.pulse += dtMs * 0.0025;
    const flicker = 0.97 + 0.03 * Math.sin(this.pulse * 1.4);
    const active = profile.nightLights && snap.darkness >= 0.1;
    const strength = active ? Math.min(1.35, 0.26 + (snap.darkness - 0.08) * 1.6) * flicker : 0;

    const ambient = active
      ? Math.max(8, Math.min(38, Math.round(54 - snap.darkness * 42)))
      : 84;
    scene.lights.setAmbientColor((ambient << 16) | (ambient << 8) | Math.min(255, ambient + 8));

    for (let i = 0; i < this.staticLights.length; i++) {
      const light = this.staticLights[i]!;
      const p = this.points[i];
      if (!p) continue;
      light.radius = p.r * (p.tech ? 2.9 : 3.4);
      const individualFlicker = p.tech ? 1 : 0.97 + 0.03 * Math.sin(this.pulse * 1.7 + p.x * 0.013 + p.y * 0.017);
      light.intensity = strength * (p.tech ? 1.55 : 1.8) * individualFlicker;
    }

    const wantMoving = active && profile.movingLights ? Math.min(14, movingLights?.length ?? 0) : 0;
    this.ensureMovingLights(wantMoving);
    for (let i = 0; i < this.movingLights.length; i++) {
      const light = this.movingLights[i]!;
      const p = movingLights?.[i];
      if (!p || i >= wantMoving) {
        light.intensity = 0;
        continue;
      }
      light.x = p.x;
      light.y = p.y - 6;
      light.radius = 92;
      (light as unknown as { setColor?: (color: number) => unknown }).setColor?.(0xffd088);
      light.intensity = strength * 1.22;
    }
  }

  private ensureMovingLights(count: number): void {
    const scene = this.scene;
    if (!scene || !this.usePipelineLights) return;
    while (this.movingLights.length < count) {
      this.movingLights.push(scene.lights.addLight(0, 0, 88, 0xffd088, 0));
    }
    while (this.movingLights.length > count) {
      const light = this.movingLights.pop();
      if (!light) break;
      scene.lights.removeLight(light);
    }
  }

  shutdown(): void {
    if (this.scene && this.usePipelineLights) {
      for (const light of this.staticLights) {
        this.scene.lights.removeLight(light);
      }
      for (const light of this.movingLights) {
        this.scene.lights.removeLight(light);
      }
      this.scene.lights.setAmbientColor(0xffffff);
    }
    this.scene = null;
    this.usePipelineLights = false;
    this.staticLights = [];
    this.movingLights = [];
    this.gfx?.destroy();
    this.gfx = null;
    this.dynamicGfx?.destroy();
    this.dynamicGfx = null;
    this.movingHalos = [];
    this.points = [];
  }
}

export function collectNightLightPoints(location: LocationConfig): LightPoint[] {
  const points: LightPoint[] = [];
  for (const s of location.stations ?? []) {
    if (s.kind === 'hearth' || s.kind === 'campfire') {
      points.push({ x: s.x, y: s.y, r: s.radius ?? 130 });
    }
  }
  for (const lm of location.landmarks ?? []) {
    if (LIGHT_LANDMARKS.has(lm.kind)) {
      points.push({ x: lm.x, y: lm.y, r: 110 });
    }
  }
  if (location.id === 'empery_haven') {
    // Small warm pools identify the services that remain available overnight.
    for (const point of Object.values(HAVEN_NIGHT_VENUES)) points.push({ ...point, r: 48 });
    // Preserve authored portal coordinates: lights introduce no new collision props.
    for (const zone of location.zones ?? []) {
      if (zone.travelTo) points.push({ x: zone.x, y: zone.y + HAVEN_TRAVEL_PAD_Y_OFFSET, r: 32 });
    }
    for (const [id, x, y] of HAVEN_CITY_PROPS) {
      if (!STREET_LAMP_PROPS.has(id)) continue;
      const tech = id.startsWith('prop_hq_');
      const r = id === 'prop_wall_brazier' ? 40 : tech ? 70 : 52;
      points.push({ x, y, r, tech });
    }
  }
  if (location.id === 'empery_hq') {
    for (const [id, x, y] of EMPERY_HQ_PROPS) {
      if (id !== 'prop_hq_floodlight' && id !== 'prop_hq_holo_sign') continue;
      points.push({ x, y, r: id === 'prop_hq_holo_sign' ? 70 : 95, tech: true });
    }
  }
  const unique = new Map<string, LightPoint>();
  for (const point of points) {
    if (![point.x, point.y, point.r].every(Number.isFinite) || point.r <= 0) continue;
    const key = `${point.x}:${point.y}:${Boolean(point.tech)}`;
    const previous = unique.get(key);
    if (!previous || point.r > previous.r) unique.set(key, point);
  }
  return [...unique.values()];
}
