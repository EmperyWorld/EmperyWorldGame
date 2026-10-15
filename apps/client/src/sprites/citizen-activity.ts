import { facingFromDelta, facingNeedsFlipX, facingRow, type SpriteFacingRow } from './facing4.js';

import type { CitizenActivity } from './haven-ambient-defs.js';
export type { CitizenActivity } from './haven-ambient-defs.js';

export interface ActivityActor {
  walkFacing?: SpriteFacingRow;
  sprite: {x:number;y:number;setFlipX(flip:boolean):unknown};
}
export function faceCitizenToward(actor: ActivityActor, target: {x:number;y:number}): void {
  const facing=facingFromDelta(target.x-actor.sprite.x,target.y-actor.sprite.y,2);
  if (!facing) return;
  actor.walkFacing=facingRow(facing);
  actor.sprite.setFlipX(facingNeedsFlipX(facing));
}
export function applyCitizenActivity(actor: ActivityActor, activity?: CitizenActivity): void {
  if(activity)faceCitizenToward(actor,{x:activity.lookAt[0],y:activity.lookAt[1]});
}
