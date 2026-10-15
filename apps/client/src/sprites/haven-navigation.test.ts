import { havenScene } from './haven-navigation.test-fixture.js';
import { ambientPlacement, ambientPatrolPlacement } from './ambient-placement.js';
import { ALL_CITIZEN_DEFS } from './haven-ambient-defs.js';
import { resolveNpcHomeEntrance } from './npc-home-entrance.js';
import { describe, expect, it } from 'vitest';
import { HAVEN_NPC_POSTS, resolveNpcSleepHome, stageHomeWorld, havenStageSeat, HAVEN_STAGE_ACTOR_COUNT, computeHavenSchedule } from '@empery/shared';
import { buildNpcRoute } from './npc-pathing.js';
import { isInsidePropAabb } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';

describe('Haven navigation on shipped ground and prop geometry', () => {
  it('uses the same stage positions in server schedules and client rendering, with personal space', () => {
    const schedule = computeHavenSchedule(12 * 60000, { cycleMs: 24 * 60000, epochMs: 0 });
    expect(schedule.stage.length).toBe(HAVEN_STAGE_ACTOR_COUNT);
    for (let i = 0; i < schedule.stage.length; i++) {
      const seat = havenStageSeat(i);
      expect(schedule.stage[i]).toMatchObject({ ...seat, atSeat: true, asleep: false });
      for (let j = 0; j < i; j++) {
        const other = havenStageSeat(j);
        expect(Math.hypot(seat.x - other.x, seat.y - other.y)).toBeGreaterThanOrEqual(36);
      }
    }
  });
  it.each([true,false])('provides service home commutes with gatesOpen=%s', gatesOpen => {
    const scene = havenScene(gatesOpen);
    const failures: string[] = [];
    for (const post of HAVEN_NPC_POSTS) {
      const home = resolveNpcSleepHome(post.id, post.postX, post.postY);
      const door = resolveNpcHomeEntrance(scene,home.x,home.y);
      if(!door){failures.push(`${post.id}: missing entrance`);continue;}
      const route = buildNpcRoute(scene, post.postX, post.postY, door.x, door.y, 1);
      const back = buildNpcRoute(scene,door.x,door.y,post.postX,post.postY,-1);
      if(!back.length)failures.push(`${post.id}: no return route`);
      if (!route.length) failures.push(`${post.id}: no route start=${isInsidePropAabb(scene,post.postX,post.postY,13)} tile=${isTileBlockedAt(scene,post.postX,post.postY)}`);
      else if (Math.hypot(route.at(-1)!.x-door.x,route.at(-1)!.y-door.y)>16) failures.push(`${post.id}: remote endpoint`);
    }
    expect(failures).toEqual([]);
  });
  it.each([true,false])('provides stage home routes with gatesOpen=%s', gatesOpen => {
    const scene = havenScene(gatesOpen);
    const failures:string[]=[];
    for(let i=0;i<HAVEN_STAGE_ACTOR_COUNT;i++) {
      const home=stageHomeWorld(i),seat=havenStageSeat(i),door=resolveNpcHomeEntrance(scene,home.x,home.y);
      if(!door){failures.push(`stage_${i}: missing entrance`);continue;}
      for(const [from,to] of [[seat,door],[door,seat]]) {
        const route=buildNpcRoute(scene,from!.x,from!.y,to!.x,to!.y,1);
        if(!route.length){failures.push(`stage_${i}: no route start=${isInsidePropAabb(scene,from!.x,from!.y,13)} end=${isInsidePropAabb(scene,to!.x,to!.y,13)}`);continue;}
        if(Math.hypot(route.at(-1)!.x-to!.x,route.at(-1)!.y-to!.y)>6)failures.push(`stage_${i}: remote endpoint`);
        for(const point of route){expect(isTileBlockedAt(scene,point.x,point.y)).toBe(false);if(isInsidePropAabb(scene,point.x,point.y,13))failures.push(`stage_${i}: blocked point ${Math.round(point.x)},${Math.round(point.y)}`);}
      }
    }
    expect(failures).toEqual([]);
  });
  it.each([true,false])('resolves every resident post, entrance and patrol point with gatesOpen=%s', (gatesOpen) => {
    const scene=havenScene(gatesOpen),failures:string[]=[];
    for(let i=0;i<ALL_CITIZEN_DEFS.length;i++){
      const def=ALL_CITIZEN_DEFS[i]!,placement=ambientPlacement(scene,def,i);
      if(!placement){failures.push(`resident_${i}: unavailable placement`);continue;}
      for(const point of [placement.post,placement.door,...placement.path]){
        if(isTileBlockedAt(scene,point.x,point.y)||isInsidePropAabb(scene,point.x,point.y,13))failures.push(`resident_${i}: blocked anchor`);
      }
      const patrol=ambientPatrolPlacement(scene,def,i,placement.path);
      const pairs=patrol.path.map((p,j)=>[p,patrol.path[(j+1)%patrol.path.length]!] as const);
      pairs.push([placement.post,placement.door],[placement.door,placement.post]);
      for(const [from,to] of pairs){
        const route=buildNpcRoute(scene,from.x,from.y,to.x,to.y,1);
        if(!route.length)failures.push(`resident_${i}: no route ${Math.round(from.x)},${Math.round(from.y)} -> ${Math.round(to.x)},${Math.round(to.y)}`);
        else if(Math.hypot(route.at(-1)!.x-to.x,route.at(-1)!.y-to.y)>6)failures.push(`resident_${i}: remote endpoint`);
      }
    }
    expect(failures).toEqual([]);
  });

});
