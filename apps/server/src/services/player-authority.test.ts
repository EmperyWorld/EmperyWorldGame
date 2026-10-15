import { describe, expect, it, vi, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { PlayerAuthority } from './player-authority.js';
import { applyStatsToSave } from './stats.js';
import type { PlayerSave } from '@empery/shared';

function save():PlayerSave {
  return applyStatsToSave({id:'authority',name:'Tester',race:'human',profession:'warrior',level:5,xp:0,hp:100,maxHp:100,adena:0,location:'adena_fields',worldX:2560,worldY:3120,inventory:[],equipment:{weapon:'rusty_sword'},skillLevels:{},skillCooldowns:{},questFlags:{},stamina:700,staminaAt:new Date(1000).toISOString(),createdAt:new Date(1000).toISOString(),updatedAt:new Date(1000).toISOString()});
}
function authority(){return new PlayerAuthority(fileURLToPath(new URL('../../../client/public/maps',import.meta.url)));}
afterEach(()=>vi.restoreAllMocks());
describe('server movement and stamina',()=>{
  it('acknowledges discarded movement and prevents old input moving a respawned actor',()=>{
    const service=authority(),s=save();service.beginSession(s);
    expect(service.enqueue(s,{seq:1,locationId:s.location,dx:1,dy:0,dash:true})).toBe(true);
    service.stop(s);
    const point={x:2600,y:3120};const next=service.step(s,point,Date.now()+50);
    expect(next.ack).toBe(1);expect(next.x).toBe(point.x);expect(next.y).toBe(point.y);expect(next.moving).toBe(false);
    expect(service.context(s,point).dashing).toBe(false);
  });
  it('retains a mounted burst cooldown when the authority is recreated',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    const s={...save(),mount:{ownedId:'field_horse',mounted:true,stamina:900}} as PlayerSave;
    const burst=authority().requestDash(s,1000);
    expect(burst.started).toBe(true);
    expect(Date.parse(burst.save.mount!.chargeUntil!)).toBe(7000);
    expect(authority().requestDash(burst.save,1100).started).toBe(false);
  });
  it('cancels an active charge when dismounting without clearing its cooldown',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    const service=authority(),s={...save(),mount:{ownedId:'field_horse',mounted:true,stamina:900}} as PlayerSave;
    service.beginSession(s);
    const dash=service.requestDash(s,1000);
    expect(dash.started).toBe(true);
    const onFoot={...dash.save,mount:{...dash.save.mount!,mounted:false}};
    expect(service.context(onFoot,{x:2560,y:3120},1100).dashing).toBe(false);
    expect(service.consumeCharge(onFoot,1100)).toBe(false);
    expect(service.requestDash(onFoot,1100).started).toBe(false);
  });
  it('regenerates stamina while moving with a slow analog input',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    const service=authority(),s=save();service.beginSession(s);
    service.enqueue(s,{type:'move_command',seq:1,locationId:s.location,dx:0.25,dy:0});
    const moved=service.step(s,{x:2560,y:3120},1050);
    expect(moved.moving).toBe(true);
    expect(service.tick(moved.save,1100).stamina).toBeGreaterThan(moved.save.stamina!);
  });
  it('spends a cumulative movement budget; flooding cannot teleport',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    const service=authority(),s=save();service.tick(s,1000);
    let pose={x:2560,y:3120};let current=s;
    for(let i=0;i<100;i++){
      const result=service.accept(current,pose,{x:pose.x+2,y:pose.y,moving:true},1100);
      current=result.save;if(result.accepted)pose={x:pose.x+2,y:pose.y};
    }
    expect(pose.x).toBeGreaterThan(2560);expect(pose.x).toBeLessThan(2600);
    expect(service.accept(current,pose,{x:999999,y:1,moving:true},1100).accepted).toBe(false);
    expect(service.accept(current,pose,{x:NaN,y:1,moving:true},1100).accepted).toBe(false);
  });
  it('advances drain and idle recovery with server time, independently of packet frequency',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    const service=authority(),s=save();service.tick(s,1000);
    const start=service.accept(s,{x:2560,y:3120},{x:2570,y:3120,moving:true,running:true},1100);
    expect(start.accepted).toBe(true);
    const drained=service.tick(start.save,2100);expect(drained.stamina).toBeLessThan(start.save.stamina!);
    service.stop(drained,2100);
    const recovered=service.tick(drained,3100);expect(recovered.stamina).toBeGreaterThan(drained.stamina!);
  });
  it('charges dash once, enforces cooldown, and shares attack cadence across commands',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    const service=authority(),s=save();service.tick(s,1000);
    const first=service.accept(s,{x:2560,y:3120},{x:2560,y:3120,moving:true,dash:true},1100);
    const replay=service.accept(first.save,{x:2560,y:3120},{x:2560,y:3120,moving:true,dash:true},1100);
    expect(first.save.stamina).toBeLessThan(s.stamina!);expect(replay.save.stamina).toBe(first.save.stamina);
    expect(service.attack(first.save,1100)).toBe(true);expect(service.attack(first.save,1100)).toBe(false);expect(service.attack(first.save,2100)).toBe(true);
    expect(service.accept({...s,hp:0},{x:2560,y:3120},{x:2560,y:3120,moving:true},2200).accepted).toBe(false);
  });
});
