import { describe,expect,it,vi } from 'vitest';
import { applyCitizenActivity,faceCitizenToward } from './citizen-activity.js';
import { walkCadence } from './walk-cadence.js';

describe('activity facing and cadence',()=>{
  it('faces a partner north and preserves the pose when the partner is too close',()=>{
    const actor={walkFacing:'side' as const,sprite:{x:100,y:100,setFlipX:vi.fn()}};
    faceCitizenToward(actor,{x:100,y:50});expect(actor.walkFacing).toBe('up');
    faceCitizenToward(actor,{x:100.2,y:100.1});expect(actor.walkFacing).toBe('up');
  });
  it('looks toward the authored activity target without changing its approach position',()=>{
    const actor={sprite:{x:100,y:100,setFlipX:vi.fn()},walkFacing:undefined};
    applyCitizenActivity(actor,{kind:'watch',lookAt:[40,100]});
    expect(actor).toMatchObject({walkFacing:'side',sprite:{x:100,y:100}});
    expect(actor.sprite.setFlipX).toHaveBeenCalledWith(true);
  });
  it('slows walking with movement penalties and bounds burst cadence',()=>{
    expect(walkCadence(60,120)).toBe(.5);expect(walkCadence(180,180)).toBe(1);
    expect(walkCadence(600,120)).toBe(2.5);
    for(const speed of [0,NaN,Infinity])expect(walkCadence(speed,120)).toBe(1);
  });
});
