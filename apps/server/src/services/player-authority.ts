import { CollisionWorld, type CollisionMap } from '@empery/shared/world-collision';
import { worldProps, propCollisionBoxes } from '@empery/shared/world-props';
import { MOUNT_COLLISION_RADIUS, PLAYER_COLLISION_RADIUS, MOVEMENT_STEP_MS, MAX_INPUT_BACKLOG, FOOT_DASH_SPEED, FOOT_DASH_DURATION_MS, FOOT_DASH_COOLDOWN_MS, MOUNT_CHARGE_SPEED_MULT, type MovementCommand } from '@empery/shared/movement';
import { getLocation } from './locations.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerSave } from '@empery/shared';
import { advancePlayerStamina, advanceMountStamina, playerCanDash, mountCanCharge } from '@empery/shared';
import { computeStats, type CombatContext } from './stats.js';
import { getMount, isChargeReady, armChargeCooldown, mountStaminaOf, saveCarryWeight, setMountStamina } from './mounts.js';
import { playerStaminaOf, setPlayerStamina } from './player-stamina.js';
import { getEncounterForLocation } from './encounter.js';

type Motion = { location: string; mounted: boolean; at: number; budget: number; moving: boolean; running: boolean; dashUntil: number; nextDashAt: number; nextAttackAt: number; chargeUsed: boolean; inputs:MovementCommand[]; lastSeq:number; ack:number };
export class PlayerAuthority {
  private readonly states = new Map<string, Motion>();
  private readonly maps = new Map<string, CollisionMap>();
  private readonly geometry = new Map<string,CollisionWorld>();
  constructor(private readonly mapsDir: string, private readonly gatesOpen:()=>boolean=()=>true) {}
  private mapFor(location: string): CollisionMap {
    let map = this.maps.get(location);
    if (!map) {
      map = JSON.parse(readFileSync(join(this.mapsDir, `${location}.json`), 'utf8')) as CollisionMap;
      this.maps.set(location, map);
    }
    return map;
  }
  collisionWorld(save:PlayerSave):CollisionWorld {
    const open=save.location==='empery_haven'&&this.gatesOpen();
    const hqAccess = save.location === 'empery_haven' && Boolean(save.questFlags.quest_empery_hq_access);
    const tier = save.location === 'haven_apartment' ? save.housing?.tier ?? 1 : 1;
    const key=`${save.location}:${open}:${hqAccess}:${tier}:${Boolean(save.mount?.mounted)}`;
    let world=this.geometry.get(key);if(world)return world;
    const map=this.mapFor(save.location);
    const location=getLocation(save.location);
    const props=worldProps(save.location,{hqAccess,tier,landmarks:location?.landmarks,stations:location?.stations});
    world=new CollisionWorld(map,props.flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size,open)),save.mount?.mounted?MOUNT_COLLISION_RADIUS:PLAYER_COLLISION_RADIUS);
    this.geometry.set(key,world);return world;
  }
  beginSession(save:PlayerSave): void { const state=this.state(save,Date.now());state.inputs=[];state.lastSeq=0;state.ack=0;state.moving=false;state.running=false;state.dashUntil=0;state.chargeUsed=true; }
  enqueue(save:PlayerSave,input:MovementCommand): boolean {
    const state=this.state(save,Date.now());
    if(save.hp<=0||input.locationId!==save.location||!Number.isSafeInteger(input.seq)||input.seq<=state.lastSeq||state.inputs.length>=MAX_INPUT_BACKLOG)return false;
    if(![input.dx,input.dy].every(Number.isFinite)||Math.abs(input.dx)>1||Math.abs(input.dy)>1)return false;
    state.inputs.push(input);state.lastSeq=input.seq;return true;
  }
  step(save:PlayerSave,pose:{x:number;y:number},now:number):{save:PlayerSave;x:number;y:number;ack:number;moving:boolean;persist:boolean} {
    let next=this.tick(save,now);const state=this.state(next,now);
    if(next.hp<=0){state.inputs=[];state.ack=state.lastSeq;}
    const input=state.inputs.shift();
    if(input&&next.hp>0){
      if(input.dash)next=this.requestDash(next,now).save;
      const stats=computeStats(next);
      const speed=state.dashUntil>now?(stats.mounted?Math.max(getMount(next.mount!.ownedId!)?.chargeSpeed??480,stats.speed*MOUNT_CHARGE_SPEED_MULT):FOOT_DASH_SPEED):stats.speed;
      const world=this.collisionWorld(next),from=world.nearestWalkable(pose);
      const point=world.move(from,input.dx,input.dy,speed,MOVEMENT_STEP_MS/1000);
      state.ack=input.seq;state.moving=point.x!==from.x||point.y!==from.y;state.running=state.moving&&Math.hypot(input.dx,input.dy)>(stats.mounted?0.55:0.58);
      return {save:next,...point,ack:state.ack,moving:state.moving,persist:Boolean(input.persist)};
    }
    state.moving=false;state.running=false;
    return {save:next,...pose,ack:state.ack,moving:false,persist:false};
  }
  private state(save: PlayerSave, now: number): Motion {
    let state = this.states.get(save.id);
    if (!state || state.location !== save.location) {
      state = { location: save.location, mounted: Boolean(save.mount?.mounted && save.mount.ownedId), at: now, budget: 0, moving: false, running: false, dashUntil: 0, nextDashAt: state?.nextDashAt ?? 0, nextAttackAt: state?.nextAttackAt ?? 0, chargeUsed: false, inputs:[],lastSeq:0,ack:0 };
      this.states.set(save.id, state);
    }
    const mounted = Boolean(save.mount?.mounted && save.mount.ownedId);
    if (state.mounted !== mounted) { state.mounted = mounted; state.dashUntil = 0; state.chargeUsed = true; state.moving = false; state.running = false; state.inputs = []; state.ack = state.lastSeq; }
    return state;
  }
  tick(save: PlayerSave, now = Date.now()): PlayerSave {
    const state = this.state(save, now);
    const dtSec = Math.min(1, Math.max(0, (now - state.at) / 1000));
    const stats = computeStats(save);
    const speed = state.dashUntil > now ? (stats.mounted ? Math.max(getMount(save.mount!.ownedId!)?.chargeSpeed ?? 480, stats.speed * MOUNT_CHARGE_SPEED_MULT) : FOOT_DASH_SPEED) : stats.speed;
    state.budget = Math.min(speed * 0.3 + 2, state.budget + speed * dtSec);
    state.at = now;
    const carryWeightKg = saveCarryWeight(save).totalKg;
    const mounted = Boolean(save.mount?.mounted && save.mount.ownedId);
    const foot = advancePlayerStamina({ stamina: playerStaminaOf(save), dtSec, onFoot: !mounted, moving: state.moving, running: state.running, carryWeightKg, race: save.race });
    let next = setPlayerStamina(save, foot, now);
    if (save.mount?.ownedId) {
      const horse = getMount(save.mount.ownedId) ?? { speedMult: 1.4 };
      next = setMountStamina(next, advanceMountStamina({ stamina: mountStaminaOf(save), dtSec, mounted, moving: state.moving, running: state.running, horse, carryWeightKg }), now);
    }
    return next;
  }
  accept(save: PlayerSave, from: { x:number; y:number }, input: { x:number; y:number; moving:boolean; running?:boolean; dash?:boolean }, now = Date.now()): { save: PlayerSave; accepted: boolean } {
    let next = this.tick(save, now);
    const state = this.state(next, now);
    if (save.hp <= 0 || ![input.x,input.y].every(Number.isFinite)) return { save: next, accepted: false };
    const map = this.mapFor(save.location);
    if (input.x < 0 || input.y < 0 || input.x >= map!.width * map!.tilewidth || input.y >= map!.height * map!.tileheight) return {save:next,accepted:false};
    if (input.dash) next=this.requestDash(next,now).save;
    const distance = Math.hypot(input.x-from.x,input.y-from.y);
    // Budget is spent cumulatively: packet spam cannot accumulate a per-packet tolerance.
    if (distance > state.budget + 0.01) return {save:next,accepted:false};
    if (!input.moving && distance > 0.01) return {save:next,accepted:false};
    state.budget -= distance;
    state.moving = input.moving;
    // Derive running from displacement; an idle/walk hint cannot hide fast movement.
    state.running = input.moving && (input.running !== false || distance > computeStats(next).footSpeed! * 0.58 * 0.09);
    return {save:next,accepted:true};
  }
  context(save: PlayerSave, position: {x:number;y:number}, now = Date.now()): CombatContext & {playerX:number;playerY:number} {
    const state = this.state(save, now);
    const nearbyEnemyCount = [...(getEncounterForLocation(save.location)?.entities.values() ?? [])].filter(e=>e.alive && Math.hypot(e.x-position.x,e.y-position.y)<=200).length;
    return {playerX:position.x,playerY:position.y,lineOfSight:(x,y)=>this.collisionWorld(save).hasLineOfSight(position,{x,y}),moving:state.moving,dashing:state.dashUntil>now,counterAttack:state.nextAttackAt>now,nearbyEnemyCount};
  }
  requestDash(save: PlayerSave, now = Date.now()): {save:PlayerSave;started:boolean} {
    const state=this.state(save,now);
    if (save.hp<=0 || now < state.nextDashAt || state.dashUntil>now) return {save,started:false};
    const mounted=Boolean(save.mount?.mounted);
    const horse=mounted?getMount(save.mount!.ownedId!):undefined;
    if ((mounted && (!isChargeReady(save,now) || !mountCanCharge(mountStaminaOf(save)))) || (!mounted && !playerCanDash(playerStaminaOf(save)))) return {save,started:false};
    const carryWeightKg=saveCarryWeight(save).totalKg;
    let next=mounted
      ?setMountStamina(save,advanceMountStamina({stamina:mountStaminaOf(save),dtSec:0,mounted:true,moving:true,running:true,horse:horse??{speedMult:1.4},carryWeightKg,chargePulse:true}),now)
      :setPlayerStamina(save,advancePlayerStamina({stamina:playerStaminaOf(save),dtSec:0,onFoot:true,moving:true,running:true,carryWeightKg,race:save.race,dashPulse:true}),now);
    if(mounted)next=armChargeCooldown(next,now);
    state.chargeUsed=false;
    state.budget+=(mounted?Math.max(horse?.chargeSpeed??480,computeStats(next).speed*MOUNT_CHARGE_SPEED_MULT):FOOT_DASH_SPEED)*0.09;
    state.dashUntil=now+(mounted?horse?.chargeDurationMs??500:FOOT_DASH_DURATION_MS);
    state.nextDashAt=now+(mounted?horse?.chargeCooldownMs??2000:FOOT_DASH_COOLDOWN_MS);
    return {save:next,started:true};
  }
  consumeCharge(save: PlayerSave, now = Date.now()): boolean {
    const state=this.state(save,now);
    if (!save.mount?.mounted || state.dashUntil <= now || state.chargeUsed) return false;
    state.chargeUsed=true;
    return true;
  }
  stop(save: PlayerSave, now = Date.now()): void {
    const state=this.state(save,now);state.moving=false;state.running=false;state.dashUntil=0;state.inputs=[];state.ack=state.lastSeq;state.chargeUsed=true;
  }
  attack(save: PlayerSave, now = Date.now()): boolean {
    const state = this.state(save, now);
    if (save.hp <= 0 || state.nextAttackAt > now) return false;
    state.nextAttackAt = now + computeStats(save).attackDelayMs;
    return true;
  }
}
