import {describe,expect,it} from 'vitest';
import {ALL_CITIZEN_DEFS,HAVEN_GARRISON_SOLDIERS,residentAppearance,residentIdentity,residentPortraitId,citizenAppearance,citizenPortraitDescription} from '@empery/shared';

describe('permanent individual citizen appearances',()=>{
  it('gives every resident a distinct appearance and portrait identity',()=>{
    const appearances=ALL_CITIZEN_DEFS.map((_,slot)=>residentAppearance(slot));
    expect(new Set(appearances.map(a=>JSON.stringify({...a,id:undefined,seed:undefined})) ).size).toBe(appearances.length);
    expect(new Set(appearances.map((_,slot)=>residentPortraitId(slot))).size).toBe(appearances.length);
    appearances.forEach((a,slot)=>{expect(a).toEqual(residentAppearance(slot));expect(a.id).toBe(residentIdentity(slot));});
  });
  it('retains child ages and explicit gender while giving guards their own faces',()=>{
    ALL_CITIZEN_DEFS.forEach((def,slot)=>{
      const a=residentAppearance(slot);
      if(def.courtyardRole==='child')expect(a.age).toBeLessThan(14);
      if(def.gender)expect(a.gender).toBe(def.gender);
    });
    const soldiers=HAVEN_GARRISON_SOLDIERS.map((_,slot)=>citizenAppearance(`garrison-soldier-${slot}`,{soldier:true}));
    expect(new Set(soldiers.map(a=>JSON.stringify({...a,id:undefined,seed:undefined}))).size).toBe(soldiers.length);
  });
  it('describes the same race, age, clothing and hair used in the sprite',()=>{
    const a=residentAppearance(0),description=citizenPortraitDescription(a);
    expect(description).toContain(`${a.age} year old ${a.gender} ${a.race}`);
    expect(description).toContain(a.hair.toString(16));expect(description).toContain(a.body.toString(16));
  });
});
