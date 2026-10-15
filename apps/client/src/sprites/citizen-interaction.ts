export const PLAYER_INTERACTION_LOS_KEY = 'playerInteractionLineOfSight';
export type InteractionVisibility = (x: number, y: number) => boolean;
export interface TalkCitizen {
  slotIndex: number;
  districtNpcId: string;
  districtLabel: string;
  asleep: boolean;
  homeTransition: string;
  sprite: { x: number; y: number; active: boolean; visible: boolean; alpha: number };
}
type Point = { x: number; y: number };

function available(citizen: TalkCitizen, from: Point, range: number, visible: InteractionVisibility): boolean {
  const actor = citizen.sprite;
  return actor.active && actor.visible && actor.alpha >= 0.5 && !citizen.asleep && citizen.homeTransition === 'none' &&
    Math.hypot(actor.x - from.x, actor.y - from.y) < range && visible(actor.x, actor.y);
}

/** Preserve the actor selected by E across the asynchronous dialogue handoff. */
export class CitizenTalkSelection {
  private requested: { slot: number; npcId: string } | null = null;
  select<T extends TalkCitizen>(citizens: readonly T[], from: Point, range: number, visible: InteractionVisibility): T | null {
    let best: T | null = null, distance = range;
    for (const citizen of citizens) {
      if (!available(citizen, from, range, visible)) continue;
      const d = Math.hypot(citizen.sprite.x-from.x,citizen.sprite.y-from.y);
      if (d < distance) { best = citizen; distance = d; }
    }
    this.requested = best ? { slot: best.slotIndex, npcId: best.districtNpcId } : null;
    return best;
  }
  resolve<T extends TalkCitizen>(citizens: readonly T[], id: string | number, from: Point, visible: InteractionVisibility): T | null {
    const requested = this.requested;
    this.requested = null;
    if (typeof id === 'number' || requested?.npcId === id) {
      const target = citizens.find(c => c.slotIndex === (typeof id === 'number' ? id : requested!.slot));
      return target && available(target,from,72,visible) ? target : null;
    }
    const result = this.select(citizens.filter(c=>c.districtNpcId === id),from,72,visible);
    this.requested = null;
    return result;
  }
}
