import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser',()=>({default:{}}));
import { PlayerController } from './PlayerController.js';
import { PlayerMotion } from './player-motion.js';
import { CollisionWorld } from '@empery/shared/world-collision';
import { PlayerFsm } from '../fsm/PlayerFsm.js';

function movingController(mounted=false,blocked=false) {
  const controller=Object.create(PlayerController.prototype);
  Object.assign(controller,{
    fsm:new PlayerFsm(),movementEpoch:0,mounted,playerStamina:1000,mountStamina:1000,nextBurstAt:0,
    chargeDurationMs:500,chargeCooldownMs:6000,chargeSpeed:480,dashEndsAt:0,
    clickMove:blocked?{x:300,y:100}:null,queuedClick:null,pendingDashTowardClick:false,
    race:'human',gender:'male',facing:'right',attackLockUntil:0,
    scene:{time:{now:1000},game:{loop:{delta:16,frame:1}},registry:{get:()=>({})},anims:{exists:()=>true}},
    input:{isUiBlocked:()=>blocked,getMoveAxis:()=>({x:1,y:0}),consumeDash:()=>true},
    player:{active:true,x:100,y:100,setPosition(x:number,y:number){this.x=x;this.y=y;},anims:{stop:vi.fn()},setVelocity:vi.fn(),setFlipX:vi.fn(),setAlpha:vi.fn(),setVisible:vi.fn(),play:vi.fn(),setDepth:vi.fn()},
    collisionWorld:()=>null,currentMoveSpeed:()=>200,tickVitals:vi.fn(),scheduleAlphaRestore:vi.fn(),
    applyDashStaminaPulse:vi.fn(),applyChargeStaminaPulse:vi.fn(),
    syncCloak:vi.fn(),syncShield:vi.fn(),syncWeapon:vi.fn(),syncMount:vi.fn(),updateFrenzyAura:vi.fn(),
  });
  return controller;
}

describe('player controller physical pose and speed',()=>{
  it('lets only the latest hurt recovery restore the directional idle pose', () => {
    const controller = movingController();
    const callbacks: (() => void)[] = [];
    controller.hurtPoseEpoch = 0;
    controller.facing = 'up';
    controller.scene.time.delayedCall = (_delay: number, fn: () => void) => callbacks.push(fn);
    controller.playHurt();
    controller.playHurt();
    callbacks[0]!();
    expect(controller.fsm.state).toBe('hurt');
    callbacks[1]!();
    expect(controller.fsm.state).toBe('idle');
    expect(controller.player.play).toHaveBeenLastCalledWith('player-human-idle-up',true);
  });
  it('does not let a hurt recovery interrupt a newer attack', () => {
    const controller = movingController();
    let recover = () => {};
    controller.hurtPoseEpoch = 0;
    controller.scene.time.delayedCall = (_delay: number, fn: () => void) => { recover = fn; };
    controller.playHurt();
    controller.fsm.tryEnter('attack');
    controller.player.play.mockClear();
    recover();
    expect(controller.fsm.state).toBe('attack');
    expect(controller.player.play).not.toHaveBeenCalled();
  });
  it('keeps a blocked horse idle and resumes its gait after physical movement', () => {
    const controller = movingController(true);
    const mount = { visible:true, texture:{key:'mount-atlas-v1'}, displayWidth:0,
      anims:{currentAnim:undefined}, setPosition:vi.fn(), setFlipX:vi.fn(), setAlpha:vi.fn(),
      setDisplaySize:vi.fn(), setOrigin:vi.fn(), clearTint:vi.fn(), play:vi.fn() };
    Object.assign(controller, {mount, mountLook:{visual:'bay',race:'human',gender:'male',profession:'warrior',armorType:'light',cloakVariant:null,weaponKind:null}, movedLastStep:false});
    controller.fsm.force('move');
    Object.getPrototypeOf(controller).syncMount.call(controller);
    expect(mount.play.mock.lastCall?.[0]).toMatch(/-idle-side$/);
    controller.movedLastStep = true;
    Object.getPrototypeOf(controller).syncMount.call(controller);
    expect(mount.play.mock.lastCall?.[0]).toMatch(/-walk-side$/);
  });
  it('settles a nearby click and preserves facing during idle position corrections', () => {
    const controller = movingController();
    const world = new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]});
    Object.assign(controller, { predictedMotion:new PlayerMotion({x:100,y:100}), motionFrames:[],
      clickMove:{x:100.4,y:100}, collisionWorld:()=>world, input:{isUiBlocked:()=>false,getMoveAxis:()=>({x:0,y:0}),consumeDash:()=>false} });
    controller.update({});
    expect(controller.clickMove).toBeNull();
    expect(controller.facing).toBe('right');
    for (let i = 0; i < 120; i++) {
      controller.reconcileMotion(100 + (i % 2 ? -0.2 : 0.2), 100);
      controller.update({});
      expect(controller.getMoveIntent().kind).toBe('none');
      expect(controller.facing).toBe('right');
    }
    expect(controller.player.play).toHaveBeenLastCalledWith('player-human-idle-side', true);
  });
  it('opens a reached interaction once and cancels it on manual movement', () => {
    const world = new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]});
    const controller = movingController();
    Object.assign(controller,{motionFrames:[],collisionWorld:()=>world,input:{isUiBlocked:()=>false,getMoveAxis:()=>({x:0,y:0}),consumeDash:()=>false}});
    controller.beginInteractionApproach('captain',()=>({x:150,y:100}));
    controller.update({});
    expect(controller.takeReachedInteraction()).toBe('captain');
    expect(controller.takeReachedInteraction()).toBeNull();
    controller.beginInteractionApproach('captain',()=>({x:150,y:100}));
    controller.input.getMoveAxis=()=>({x:1,y:0});
    controller.update({});
    expect(controller.takeReachedInteraction()).toBeNull();
    expect(controller.interactionApproach).toBeNull();
  });
  it('keeps the predicted pose and queued motion when a delayed dismount checkpoint arrives', () => {
    const controller = movingController(true);
    const motion = new PlayerMotion({x:240,y:180});
    const route = {x:400,y:180};
    const frames = [{dx:1,dy:0}];
    Object.assign(controller,{predictedMotion:motion,motionFrames:frames,clickMove:route,syncMountRuntime:vi.fn(),clearMountVisual:vi.fn(),
      collisionWorld:()=>new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]})});
    controller.refreshMount({race:'human',hp:100,worldX:100,worldY:100,mount:{ownedId:'field_horse',mounted:false}});
    expect(controller.getPosition()).toEqual({x:240,y:180});
    expect(controller.motionFrames).toBe(frames);
    expect(controller.clickMove).toBe(route);
    expect(controller.isMounted()).toBe(false);
  });
  it.each([30,60,144])('waits the same elapsed time before cancelling a blocked click at %i FPS',fps=>{
    const controller=movingController();
    const world=new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]});
    vi.spyOn(world,'move').mockImplementation(from=>({...from}));
    Object.assign(controller,{collisionWorld:()=>world,predictedMotion:new PlayerMotion({x:100,y:100}),motionFrames:[],
      movedLastStep:false,clickMove:{x:300,y:100},clickStuckMs:0,clickStuckLastX:100,clickStuckLastY:100,
      input:{isUiBlocked:()=>false,getMoveAxis:()=>({x:0,y:0}),consumeDash:()=>false}});
    controller.scene.game.loop.delta=1000/fps;
    let elapsed=0;
    while(controller.clickMove&&elapsed<1000){controller.scene.time.now+=1000/fps;controller.update({});elapsed+=1000/fps;}
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(485);
    expect(controller.tickVitals).toHaveBeenLastCalledWith(expect.any(Number),false,1);
  });
  it.each([false,true])('enforces the predicted burst cooldown with mounted=%s',mounted=>{
    const controller=movingController(mounted);
    const pulse=mounted?controller.applyChargeStaminaPulse:controller.applyDashStaminaPulse;
    controller.update({});
    expect(pulse).toHaveBeenCalledTimes(1);
    controller.scene.time.now=1600;controller.update({});
    controller.scene.time.now=1601;controller.update({});
    expect(pulse).toHaveBeenCalledTimes(1);
    controller.scene.time.now=mounted?7001:1701;controller.update({});
    expect(pulse).toHaveBeenCalledTimes(2);
  });
  it.each([false,true])('blocks movement and new bursts without transport capacity, mounted=%s',mounted=>{
    const controller=movingController(mounted);controller.setMovementAllowance(0);controller.update({});
    expect(controller.getMoveIntent()).toEqual({kind:'none',vx:0,vy:0});
    expect(controller.applyDashStaminaPulse).not.toHaveBeenCalled();expect(controller.applyChargeStaminaPulse).not.toHaveBeenCalled();
  });
  it('does not start a click-directed dash through a blocking UI',()=>{
    const controller=movingController(false,true);controller.update({});
    expect(controller.applyDashStaminaPulse).not.toHaveBeenCalled();
    expect(controller.isDashing).toBe(false);
  });
  it.each([false,true])('applies environment penalties after foot/mount stamina with mounted=%s',mounted=>{
    const controller=Object.create(PlayerController.prototype);
    Object.assign(controller,{mounted,footSpeed:200,playerStamina:1000,mountStamina:1000,horse:{speedMult:1.5},carryWeightKg:80,race:'human'});
    expect(controller.currentMoveSpeed({movementSpeedMult:0.5})).toBe(mounted?150:100);
  });
  it('cancels a route on focus loss and drops an expired double-click burst', () => {
    const controller=movingController();
    Object.assign(controller,{movementEpoch:0,clickMove:{x:300,y:100},pendingDashTowardClick:true,pendingClickDashUntil:900,
      input:{movementEpoch:1,isUiBlocked:()=>false,getMoveAxis:()=>({x:0,y:0}),consumeDash:()=>false}});
    controller.update({});expect(controller.clickMove).toBeNull();expect(controller.applyDashStaminaPulse).not.toHaveBeenCalled();
    controller.clickMove={x:300,y:100};controller.pendingDashTowardClick=true;controller.pendingClickDashUntil=900;
    controller.update({});expect(controller.applyDashStaminaPulse).not.toHaveBeenCalled();
  });
  it('does not buffer a click burst through a blocking UI', () => {
    const controller=movingController(false,true);controller.pendingDashTowardClick=true;controller.pendingClickDashUntil=2000;
    controller.update({});expect(controller.pendingDashTowardClick).toBe(false);
  });
  it('exposes the physical pose while display interpolation lags and resets both on teleport',()=>{
    const controller=Object.create(PlayerController.prototype);
    const world=new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]});
    const motion=new PlayerMotion({x:100,y:100});motion.advance(world,75,1,0,200);
    Object.assign(controller,{predictedMotion:motion,motionFrames:[{}],player:{x:105,y:100,setPosition(x:number,y:number){this.x=x;this.y=y;}}});
    expect(controller.getPosition().x).toBeCloseTo(110);
    controller.setPosition(300,300);
    expect(controller.getPosition()).toEqual({x:300,y:300});
    expect(motion.renderPosition()).toEqual({x:300,y:300});
    expect(controller.motionFrames).toEqual([]);
    expect(controller.clickMove).toBeNull();
  });
  it('revives at server coordinates and invalidates the old death animation',()=>{
    const controller=movingController();let complete!:()=>void;
    const tween={stop:vi.fn()};
    Object.assign(controller,{deathEpoch:0,scene:{...controller.scene,tweens:{add:(opts:{onComplete:()=>void})=>{complete=opts.onComplete;return tween;}}},clearMountVisual:vi.fn(),cancelAlphaRestore:vi.fn(),refreshCloak:vi.fn(),refreshShield:vi.fn(),refreshMount:vi.fn()});
    for(const method of ['setActive','setVisible','setAlpha','setScale','setAngle','setTexture'])controller.player[method]=vi.fn(()=>controller.player);
    const death=vi.fn();controller.beginDeath(death);
    controller.respawn({race:'human',hp:100,worldX:300,worldY:400},{spawn:{x:10,y:20}});
    expect(controller.getPosition()).toEqual({x:300,y:400});expect(tween.stop).toHaveBeenCalled();complete();expect(death).not.toHaveBeenCalled();
    expect(controller.fsm.isDead).toBe(false);expect(controller.consumeChargeHitRequest()).toBe(false);
  });

});
