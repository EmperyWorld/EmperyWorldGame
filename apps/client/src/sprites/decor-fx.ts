import type Phaser from 'phaser';
import { decorCounterDuration } from '../game/systems/graphics-quality.js';

/** Looping Graphics counter: draw once on performance, slower on balanced. */
export function loopDecorCounter(
  scene: Phaser.Scene,
  config: {
    from?: number;
    to?: number;
    duration: number;
    repeat?: number;
    onUpdate: (tw: { getValue: () => number | null }) => void;
  },
): Phaser.Tweens.Tween | null {
  const from = config.from ?? 0;
  config.onUpdate({ getValue: () => from });
  const duration = decorCounterDuration(config.duration);
  if (duration == null) return null;
  return scene.tweens.addCounter({
    from,
    to: config.to ?? 1,
    duration,
    repeat: config.repeat ?? -1,
    onUpdate: config.onUpdate,
  });
}

/** Infinite target tween (bob, glow). Skipped when havenDecorFx is off. */
export function loopDecorTween(
  scene: Phaser.Scene,
  config: Phaser.Types.Tweens.TweenBuilderConfig,
): Phaser.Tweens.Tween | null {
  const duration = decorCounterDuration(typeof config.duration === 'number' ? config.duration : 1000);
  if (duration == null) return null;
  return scene.tweens.add({ ...config, duration });
}
