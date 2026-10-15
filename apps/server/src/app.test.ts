import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGameServer } from './app.js';
import { loadServicesConfig } from '@empery/shared/config';
import { SaveManager } from '@empery/save';
import { normalizeSave } from './services/save-normalize.js';
import { getEncounter, resetEncountersForTests } from './services/encounter.js';
import { spawnGroundLoot, resetGroundLootForTests } from './services/ground-loot.js';
import { DayNightService } from './services/day-night.js';
import { applyStatsToSave } from './services/stats.js';

const cleanup: Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0))await close();resetEncountersForTests();resetGroundLootForTests();});
async function fixture(location='adena_fields',simulation=false, dayNightConfig?: { cycleMs: number; epochMs: number }) {
  const root=mkdtempSync(join(tmpdir(),'empery-api-'));
  const config=structuredClone(loadServicesConfig());config.save.dir='saves';config.comfyui.outputDir='generated';config.comfyui.jobsDir='jobs';
  const {app,context}=await createGameServer({rootDir:root,config,persistence:false,simulation,logger:false,dayNightConfig});
  cleanup.push(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  const registration=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'auditor',password:'secret12'}});
  expect(registration.statusCode).toBe(200);
  const account=registration.json();
  const manager=new SaveManager(join(root,'saves'),normalizeSave);
  const fresh=manager.create({name:'Auditor',race:'human',profession:'warrior',location,accountId:account.account.id});
  const save=manager.save(applyStatsToSave({...fresh,worldX:2560,worldY:3120,adena:100000,skillLevels:{power_strike:1}}),{sync:true});
  const headers={authorization:`Bearer ${account.token}`};
  await app.ready();
  return {app,context,save,headers,root,token:account.token};
}
async function connect(f:Awaited<ReturnType<typeof fixture>>) {
  const messages: any[]=[];
  let welcome!:()=>void;
  const ready=new Promise<void>(resolve=>{welcome=resolve;});
  const ws=await f.app.injectWS(`/ws?saveId=${f.save.id}&token=${f.token}`,{}, {onInit:socket=>socket.on('message',raw=>{const message=JSON.parse(String(raw));messages.push(message);if(message.type==='welcome')welcome();})});
  await ready;
  const send=async(payload:unknown)=>{
    const mark=messages.length;ws.send(JSON.stringify(payload));
    // Ping is handled after this input on the same socket; it serves as an acknowledgement barrier.
    const done=new Promise<void>(resolve=>{const listener=(raw:unknown)=>{if(JSON.parse(String(raw)).type==='pong'){ws.off('message',listener);resolve();}};ws.on('message',listener);});
    ws.send(JSON.stringify({type:'ping',ts:1}));await done;return messages.slice(mark);
  };
  return {ws,messages,send};
}

describe('game API contracts and authoritative state',()=>{
  it('isolates an injected simulation clock from other server instances', async () => {
    const custom = { cycleMs: 120000, epochMs: 1000 };
    const accelerated = await fixture('empery_haven', false, custom);
    const ordinary = await fixture();
    expect(accelerated.context.dayNight.configSnapshot()).toEqual(custom);
    expect(ordinary.context.dayNight.configSnapshot()).toEqual(new DayNightService().configSnapshot());
    custom.epochMs = 2000;
    expect(accelerated.context.dayNight.configSnapshot().epochMs).toBe(1000);
    expect(ordinary.context.dayNight.configSnapshot()).not.toEqual(custom);
  });
  it('rejects mounting without body clearance and preserves the unmounted save', async () => {
    const f = await fixture();
    const base = { ...f.save, mount: { ownedId: 'field_horse', mounted: false, stamina: 1000 } };
    const foot = f.context.authority.collisionWorld(base);
    const horse = f.context.authority.collisionWorld({ ...base, mount: { ...base.mount, mounted: true } });
    let pose: { x: number; y: number } | undefined;
    for (let y = 32; y < 1024 && !pose; y += 4) for (let x = 32; x < 1024; x += 4) {
      if (!foot.blocked(x, y) && horse.blocked(x, y)) { pose = { x, y }; break; }
    }
    expect(pose).toBeDefined();
    f.context.saves.save({ ...base, worldX: pose!.x, worldY: pose!.y }, { sync: true });
    const rejected = await f.app.inject({ method: 'POST', url: `/api/saves/${base.id}/mount/toggle`, headers: f.headers, payload: {} });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toContain('тесно');
    expect(f.context.saves.load(base.id)!.mount!.mounted).toBe(false);
    const free = horse.nearestWalkable(pose!);
    f.context.saves.save({ ...base, worldX: free.x, worldY: free.y }, { sync: true });
    const accepted = await f.app.inject({ method: 'POST', url: `/api/saves/${base.id}/mount/toggle`, headers: f.headers, payload: {} });
    expect(accepted.statusCode).toBe(200); expect(accepted.json().save.mount.mounted).toBe(true);
  });
  it.each(['mount/toggle', 'mount/dismount'])('returns the live pose when dismounting via %s', async route => {
    const f = await fixture();
    const mounted = f.context.saves.save({...f.save,mount:{ownedId:'field_horse',mounted:true,stamina:1000}},{sync:true});
    const connection = await connect(f);
    const live = f.context.world.presenceForSave(mounted.id)!;
    // Model an actor that moved since the last disk checkpoint.
    live.x = mounted.worldX! + 96;
    live.y = mounted.worldY! + 32;
    expect(f.context.saves.load(mounted.id)!.worldX).toBe(mounted.worldX);
    const response = await f.app.inject({method:'POST',url:`/api/saves/${mounted.id}/${route}`,headers:f.headers,payload:{}});
    expect(response.statusCode).toBe(200);
    expect(response.json().save.mount.mounted).toBe(false);
    expect(response.json().save.worldX).toBe(live.x);
    expect(response.json().save.worldY).toBe(live.y);
    expect(f.context.saves.load(mounted.id)!.worldX).toBe(live.x);
    connection.ws.close();
  });
  it('keeps loot behind an obstacle until the authoritative visibility check passes',async()=>{
    const f=await fixture();const connection=await connect(f);
    const pile=spawnGroundLoot({locationId:f.save.location,x:f.save.worldX!+10,y:f.save.worldY!,drops:[{kind:'adena',count:10}],owner:{kind:'solo',saveId:f.save.id}})!;
    const geometry=f.context.authority.collisionWorld(f.save);
    const visibility=vi.spyOn(geometry,'hasLineOfSight').mockReturnValue(false);
    const blocked=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/loot/pickup`,headers:f.headers,payload:{lootId:pile.id}});
    expect(blocked.statusCode).toBe(400);expect(blocked.json().error).toContain('препятствием');
    expect(f.context.saves.load(f.save.id)!.adena).toBe(f.save.adena);
    visibility.mockRestore();
    const picked=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/loot/pickup`,headers:f.headers,payload:{lootId:pile.id}});
    expect(picked.statusCode).toBe(200);expect(picked.json().save.adena).toBe(f.save.adena!+10);connection.ws.close();
  });
  it('keeps the new town respawn position after the next authoritative movement step',async()=>{
    const f=await fixture('empery_haven');
    const dead=f.context.saves.save({...f.save,hp:0,worldX:864,worldY:800},{sync:true});
    const connection=await connect(f);
    const response=await f.app.inject({method:'POST',url:`/api/saves/${dead.id}/respawn`,headers:f.headers,payload:{}});
    expect(response.statusCode).toBe(200);
    const revived=response.json().save;
    const presence=f.context.world.presenceForSave(dead.id)!;
    expect(presence.x).toBe(revived.worldX);expect(presence.y).toBe(revived.worldY);
    const next=f.context.authority.step(f.context.saves.load(dead.id)!,presence,Date.now()+50);
    expect(next.x).toBe(revived.worldX);expect(next.y).toBe(revived.worldY);expect(next.moving).toBe(false);connection.ws.close();
  });
  it.each(['distant','occluded','unknown','near'])('checks %s resurrection without WebSocket presence before spending a scroll',async condition=>{
    const f=await fixture();
    const caster=f.context.saves.save({...f.save,inventory:[...f.save.inventory,'resurrection_scroll']},{sync:true});
    const fresh=f.context.saves.create({name:'Fallen',race:'human',profession:'warrior',location:caster.location,accountId:caster.accountId});
    const target=f.context.saves.save({...fresh,hp:0,worldX:condition==='unknown'?undefined:caster.worldX!+(condition==='distant'?200:10),worldY:condition==='unknown'?undefined:caster.worldY},{sync:true});
    if(condition==='occluded')vi.spyOn(f.context.authority.collisionWorld(caster),'hasLineOfSight').mockReturnValue(false);
    const response=await f.app.inject({method:'POST',url:`/api/saves/${caster.id}/resurrect`,headers:f.headers,payload:{targetSaveId:target.id}});
    expect(response.statusCode).toBe(condition==='near'?200:400);
    expect(f.context.saves.load(caster.id)!.inventory.includes('resurrection_scroll')).toBe(condition!=='near');
    expect(f.context.saves.load(target.id)!.hp>0).toBe(condition==='near');
    if(condition==='near'){expect(response.json().target.save.worldX).toBe(target.worldX);expect(response.json().target.save.worldY).toBe(target.worldY);}
  });
  it('rejects a blocked travel arrival before changing location or invalidating combat', async () => {
    const f=await fixture();
    const start=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/encounter/start`,headers:f.headers,payload:{locationId:f.save.location}});
    expect(start.statusCode).toBe(200);const encounter=getEncounter(start.json().encounterId)!;
    const world=f.context.authority.collisionWorld({...f.save,location:'empery_haven'});
    vi.spyOn(world,'blocked').mockReturnValue(true);
    const travel=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/travel`,headers:f.headers,payload:{locationId:'empery_haven'}});
    expect(travel.statusCode).toBe(409);expect(f.context.saves.load(f.save.id)!.location).toBe(f.save.location);
    expect(getEncounter(encounter.encounterId)).toBe(encounter);
  });
  it('rejects invalid auth input and limits attempts',async()=>{
    const f=await fixture();
    const bad=await f.app.inject({method:'POST',url:'/api/auth/login',payload:{username:[],password:'secret12'}});expect(bad.statusCode).toBe(400);
    for(let i=0;i<20;i++)await f.app.inject({method:'POST',url:'/api/auth/login',payload:{username:'missing',password:'secret12'}});
    const limited=await f.app.inject({method:'POST',url:'/api/auth/login',payload:{username:'missing',password:'secret12'}});expect(limited.statusCode).toBe(429);
  });
  it('rejects progression PATCH and absolute stamina, preserves legitimate hotbar',async()=>{
    const f=await fixture();
    for(const patch of [{location:'godfall_throne'},{questFlags:{complete:true}},{skillLevels:{power_strike:99}},{skillCooldowns:{power_strike:0}},{worldX:999999},{hp:999999}]) {
      const result=await f.app.inject({method:'PATCH',url:`/api/saves/${f.save.id}`,headers:f.headers,payload:patch});expect(result.statusCode).toBe(400);
    }
    const hotbar=await f.app.inject({method:'PATCH',url:`/api/saves/${f.save.id}`,headers:f.headers,payload:{skillHotbar:['power_strike']}});expect(hotbar.statusCode).toBe(200);expect(hotbar.json().skillHotbar[0]).toBe('power_strike');
    for(const action of ['player-stamina','mount/stamina'])expect((await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/${action}`,headers:f.headers,payload:{stamina:1000}})).statusCode).toBe(400);
  });
  it('rejects remote encounter, fake kills and unissued bleed without changing entities',async()=>{
    const f=await fixture();
    const start=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/encounter/start`,headers:f.headers,payload:{locationId:'adena_fields'}});expect(start.statusCode).toBe(200);
    const encounter=getEncounter(start.json().encounterId)!;const entity=[...encounter.entities.values()][0]!;
    const remote=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/encounter/start`,headers:f.headers,payload:{locationId:'godfall_throne'}});expect(remote.statusCode).toBe(400);expect(getEncounter(encounter.encounterId)).toBe(encounter);
    for(const route of ['attack','kill','enemy-hit'])expect((await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/${route}`,headers:f.headers,payload:{enemyType:'field_scavenger',enemyHp:1}})).statusCode).toBe(404);
    const hp=entity.hp;const bleed=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/bleed-kill`,headers:f.headers,payload:{encounterId:encounter.encounterId,entityId:entity.entityId}});expect(bleed.statusCode).toBe(200);expect(entity.hp).toBe(hp);expect(entity.alive).toBe(true);
  });
  it('rejects forged WS metadata and teleports, persists only accepted position',async()=>{
    const f=await fixture();const c=await connect(f);const welcome=c.messages.find(m=>m.type==='welcome').payload.self;
    const forged=await c.send({type:'player_input',x:welcome.x,y:welcome.y,moving:false,facing:'right',saveId:'victim',hp:99999,locationId:'godfall_throne'});expect(forged.some(m=>m.code==='BAD_MESSAGE')).toBe(true);
    const far=await c.send({type:'player_input',x:999999,y:999999,moving:true,facing:'right'});expect(far.some(m=>m.type==='position_correction')).toBe(true);
    await c.send({type:'player_input',x:welcome.x,y:welcome.y,moving:false,facing:'right',persist:true});
    const invalid=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/position`,headers:f.headers,payload:{worldX:99999,worldY:99999,location:f.save.location}});expect(invalid.statusCode).toBe(400);
    const valid=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/position`,headers:f.headers,payload:{location:f.save.location}});expect(valid.statusCode).toBe(200);expect(valid.json().hp).toBe(f.save.hp);expect(valid.json().id).toBe(f.save.id);expect(valid.json().worldX).toBe(welcome.x);
    const stale=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/position`,headers:f.headers,payload:{location:'silverwood'}});expect(stale.statusCode).toBe(409);
  });
  it('uses accepted server pose for omitted/spoofed combat coordinates and enforces cadence',async()=>{
    const f=await fixture();await connect(f);
    const start=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/encounter/start`,headers:f.headers,payload:{locationId:'adena_fields'}});const encounter=getEncounter(start.json().encounterId)!;const entity=[...encounter.entities.values()][0]!;
    entity.x=f.save.worldX!+1000;entity.y=f.save.worldY!;
    const body={encounterId:encounter.encounterId,targetEntityIds:[entity.entityId]};
    const far=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/batch-attack`,headers:f.headers,payload:{...body,playerX:entity.x,playerY:entity.y}});expect(far.statusCode).toBe(200);expect(far.json().hits).toEqual([]);
    const spam=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/batch-attack`,headers:f.headers,payload:body});expect(spam.statusCode).toBe(409);
    const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+2000);vi.spyOn(Math,'random').mockReturnValue(0.5);
    entity.x=f.save.worldX!+10;entity.hp=1000;entity.maxHp=1000;
    const close=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/batch-attack`,headers:f.headers,payload:body});expect(close.statusCode).toBe(200);expect(close.json().hits).toHaveLength(1);expect(entity.hp).toBeLessThan(1000);
  });
  it('applies concurrent commands without losing either change and flushes on close',async()=>{
    const clock=new DayNightService().configSnapshot();vi.spyOn(Date,'now').mockReturnValue(clock.epochMs+clock.cycleMs/2);
    const f=await fixture('empery_haven');
    const responses=await Promise.all([
      f.app.inject({method:'PATCH',url:`/api/saves/${f.save.id}`,headers:f.headers,payload:{skillHotbar:['power_strike']}}),
      f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/companion/buy`,headers:f.headers,payload:{companionId:'haven_puppy'}}),
    ]);
    expect(responses.map(r=>r.statusCode)).toEqual([200,200]);
    const latest=(await f.app.inject({url:`/api/saves/${f.save.id}`,headers:f.headers})).json();expect(latest.skillHotbar[0]).toBe('power_strike');expect(latest.companion).toBeTruthy();
    await f.app.close();const disk=JSON.parse(readFileSync(join(f.root,'saves',`${f.save.id}.json`),'utf8'));expect(disk.companion).toEqual(latest.companion);expect(disk.skillHotbar).toEqual(latest.skillHotbar);expect(disk.revision).toBe(latest.revision);
  });
  it('damages an online player without client enemy-hit requests',async()=>{
    const f=await fixture('adena_fields',true);const c=await connect(f);
    const start=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/encounter/start`,headers:f.headers,payload:{locationId:'adena_fields'}});const encounter=getEncounter(start.json().encounterId)!;
    const entity=[...encounter.entities.values()][0]!;entity.x=f.save.worldX!;entity.y=f.save.worldY!;entity.aggroSaveId=f.save.id;vi.spyOn(Math,'random').mockReturnValue(0.5);
    const hit=await new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('No server enemy hit')),2000);c.ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='enemy_hit'){clearTimeout(timeout);resolve(m);}});});
    expect(hit.payload.damage).toBeGreaterThan(0);expect(hit.payload.save.hp).toBeLessThan(f.save.hp);
  });
  it('admits direction commands, rejects duplicates and never trusts legacy coordinates',async()=>{
    const f=await fixture();const c=await connect(f);const initial=c.messages.find(m=>m.type==='welcome').payload.self;
    const legacy=await c.send({type:'player_input',x:initial.x+1,y:initial.y,moving:false,facing:'right'});
    expect(legacy.some(m=>m.code==='PROTOCOL_UPGRADE')).toBe(true);
    await c.send({type:'move_command',seq:1,locationId:f.save.location,dx:1,dy:0});
    await c.send({type:'move_command',seq:1,locationId:f.save.location,dx:1,dy:0});
    const current=f.context.saves.load(f.save.id)!;
    const motion=f.context.authority.step(current,initial,Date.now()+50);
    expect(motion.ack).toBe(1);expect(motion.x).toBeGreaterThan(initial.x);expect(motion.x-initial.x).toBeLessThan(30);
    const noReplay=f.context.authority.step(motion.save,motion,Date.now()+100);
    expect(noReplay.x).toBe(motion.x);expect(noReplay.moving).toBe(false);
    const bad=await c.send({type:'move_command',seq:2,locationId:f.save.location,dx:100,dy:0});
    expect(bad.some(m=>m.code==='BAD_MESSAGE')).toBe(true);
  });
  it('keeps attack and dash cooldowns across reconnect', async () => {
    const f=await fixture();const c=await connect(f);const initial=c.messages.find(m=>m.type==='welcome').payload.self;
    const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+100);
    await c.send({type:'move_command',seq:1,locationId:f.save.location,dx:0,dy:0,dash:true});
    const charged=f.context.authority.step(f.context.saves.load(f.save.id)!,initial,now+100);f.context.saves.save(charged.save);
    const start=await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/encounter/start`,headers:f.headers,payload:{locationId:f.save.location}});
    const body={encounterId:start.json().encounterId,targetEntityIds:[]};
    expect((await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/batch-attack`,headers:f.headers,payload:body})).statusCode).toBe(200);
    const before=(await f.app.inject({url:`/api/saves/${f.save.id}`,headers:f.headers})).json();
    const next=await connect(f);
    expect((await f.app.inject({method:'POST',url:`/api/saves/${f.save.id}/combat/batch-attack`,headers:f.headers,payload:body})).statusCode).toBe(409);
    await next.send({type:'move_command',seq:1,locationId:f.save.location,dx:0,dy:0,dash:true});
    const replay=f.context.authority.step(f.context.saves.load(f.save.id)!,initial,now+100);f.context.saves.save(replay.save);
    const after=(await f.app.inject({url:`/api/saves/${f.save.id}`,headers:f.headers})).json();expect(after.stamina).toBe(before.stamina);
  });
  it('requires admin ownership and valid contracts for media job creation', async () => {
    const f=await fixture();const payload={profile:'item_icon',params:{item_name:'Test'}};
    expect((await f.app.inject({method:'POST',url:'/api/media/jobs',payload})).statusCode).toBe(401);
    expect((await f.app.inject({method:'POST',url:'/api/media/jobs',headers:f.headers,payload})).statusCode).toBe(403);
    f.context.auth.setAdmin('auditor',true);
    const accepted=await f.app.inject({method:'POST',url:'/api/media/jobs',headers:f.headers,payload});expect(accepted.statusCode).toBe(200);
    expect((await f.app.inject({method:'POST',url:'/api/media/jobs',headers:f.headers,payload:{profile:'unknown',params:{}}})).statusCode).toBe(400);
    expect((await f.app.inject({url:`/api/media/jobs/${accepted.json().id}`})).statusCode).toBe(401);
  });
  it('allows players to poll their generated portrait while hiding other accounts jobs', async () => {
    const f=await fixture();
    const character=await f.app.inject({method:'POST',url:'/api/saves',headers:f.headers,payload:{name:'Portrait',race:'human',profession:'warrior'}});expect(character.statusCode).toBe(200);
    const id=character.json().portraitJobId;
    expect((await f.app.inject({url:`/api/media/jobs/${id}`,headers:f.headers})).statusCode).toBe(200);
    const other=await f.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'other',password:'secret12'}});
    expect((await f.app.inject({url:`/api/media/jobs/${id}`,headers:{authorization:`Bearer ${other.json().token}`}})).statusCode).toBe(403);
  });
});
