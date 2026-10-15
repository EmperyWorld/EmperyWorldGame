import type { EnemyEntity } from '../entities/EnemyEntity.js';
import type { EntityManager } from '../systems/EntityManager.js';
import type { PlayerController } from './PlayerController.js';

/**
 * Клиентская презентация мобов: локальный chase + мягкая коррекция с сервера.
 * Если серверный тик подлагивает на combat HTTP — мобы всё равно продолжают бежать.
 *
 * Off-camera: colder cadence (every 4th frame by id) — hot on-camera every frame.
 */
export class EnemyAIController {
  private frame = 0;

  constructor(
    private entities: EntityManager,
    private player: PlayerController,
  ) {}

  update(): void {
    const p = this.player.player;
    if (!p?.active) return;
    const dt = p.scene.game.loop.delta;
    this.frame++;
    const coldSlot = this.frame & 3;
    this.entities.forEachActive((enemy) => {
      let stepDt = dt;
      if (!enemy.isPresentationHot()) {
        // Far / off-camera: tick ~1/4 of enemies per frame (stable by id).
        if ((enemy.entityId.charCodeAt(0) & 3) !== coldSlot) return;
        // Compensate skipped frames so presentation speed remains time-based.
        stepDt *= 4;
      }
      enemy.tickPresentation(p.x, p.y, stepDt);
    });
  }

  shouldProcessOverlap(enemy: EnemyEntity, now: number): boolean {
    if (enemy.isDying) return false;
    if (this.player.isDead) return false;
    if (this.player.isInvulnerable() && !this.player.isDashing) return false;
    if (now - enemy.getLastHitAt() < 1400) return false;
    return true;
  }
}
