interface WalkingSprite {
  texture: { has(frame: string): boolean };
  anims: { isPlaying: boolean; stop(): unknown };
  setFrame(frame: string): unknown;
  setFlipX(flip: boolean): unknown;
}

/** Select steps from actual displacement, so blocked and seated actors stay idle. */
export class CityActorAnimation {
  private phase = 0;
  private north = false;
  constructor(private readonly prefix: string) {}

  update(sprite: WalkingSprite, dx: number, dy: number, elapsedMs: number): void {
    const moving = Math.hypot(dx, dy) > 0.01;
    if (moving) {
      this.north = dy < -Math.abs(dx) * 0.5;
      // Distance-based cadence stays consistent during deferred city updates.
      this.phase += Math.hypot(dx, dy) / 5;
      if (Math.abs(dx) > 0.01) sprite.setFlipX(dx < 0);
    }
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    const step = moving ? 1 + Math.floor(this.phase) % 3 : 0;
    const base = this.north ? `${this.prefix}-up` : this.prefix;
    const candidates = [`${base}-${step}`, `${this.prefix}-${step}`, `${base}-0`, `${this.prefix}-0`];
    const frame = candidates.find(candidate => sprite.texture.has(candidate));
    if (!frame) return;
    if (sprite.anims.isPlaying) sprite.anims.stop();
    sprite.setFrame(frame);
  }
}
