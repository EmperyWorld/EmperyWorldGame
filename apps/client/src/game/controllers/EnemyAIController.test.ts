import { describe, expect, it, vi } from 'vitest';
import { EnemyAIController } from './EnemyAIController.js';

function harness(hot: boolean): {
  controller: EnemyAIController;
  tickPresentation: ReturnType<typeof vi.fn>;
} {
  const tickPresentation = vi.fn();
  const enemy = {
    entityId: 'A',
    isDying: false,
    getLastHitAt: () => 0,
    isPresentationHot: () => hot,
    tickPresentation,
  };
  const entities = {
    forEachActive: (fn: (value: typeof enemy) => void) => fn(enemy),
  };
  const player = {
    player: {
      active: true,
      x: 100,
      y: 200,
      scene: { game: { loop: { delta: 16 } } },
    },
    isDead: false,
    isInvulnerable: () => false,
    isDashing: false,
  };
  return {
    controller: new EnemyAIController(entities as never, player as never),
    tickPresentation,
  };
}

describe('EnemyAIController presentation cadence', () => {
  it('uses the raw frame delta for on-camera enemies', () => {
    const { controller, tickPresentation } = harness(true);
    controller.update();
    expect(tickPresentation).toHaveBeenCalledWith(100, 200, 16);
  });

  it('compensates the delta for an off-camera quarter-rate update', () => {
    const { controller, tickPresentation } = harness(false);
    controller.update();
    expect(tickPresentation).toHaveBeenCalledWith(100, 200, 64);
  });
});
