import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isolatedNetworkWorld, connectNetwork } from '../../scripts/network-harness.js';
import { getEncounter, resetEncountersForTests } from './encounter.js';
import { applyStatsToSave } from './stats.js';
import { spawnGroundLoot, resetGroundLootForTests } from './ground-loot.js';
import type { PlayerSave } from '@empery/shared';
import { emptyHousingStorages } from './housing.js';
import { MOVEMENT_PROTOCOL } from '@empery/shared/movement';
describe.runIf(process.env.RUN_PERSISTENCE_TESTS==='1')('multiplayer over real HTTP and WebSocket',()=>{
 let world:Awaited<ReturnType<typeof isolatedNetworkWorld>>,token:string;let saves:PlayerSave[]=[];let connections:Awaited<ReturnType<typeof connectNetwork>>[]=[];
 beforeAll(async()=>{
  world=await isolatedNetworkWorld(process.env.EMPERY_POSTGRES_URL!);const account=await world.request('/api/auth/register',undefined,{username:'network_players',password:'secret123'});expect(account.status).toBe(200);token=account.body.token;
  for(let i=0;i<3;i++){
   const save=world.server.context.saves.create({name:`Network ${i}`,race:'human',profession:'warrior',location:'adena_fields',accountId:account.body.account.id});
   saves.push(world.server.context.saves.save(applyStatsToSave({...save,level:30,worldX:2560+i*15,worldY:3120}),{sync:true}));
   connections.push(await connectNetwork(world.base,save.id,token));
  }
 },20000);
 afterAll(async()=>{vi.restoreAllMocks();await Promise.all(connections.map(c=>c.close()));await world?.close();resetEncountersForTests();resetGroundLootForTests();});
 it('forms a party, resolves a shared kill and delivers XP to the other real client',async()=>{
  const [a,b]=connections;const [hero,ally]=saves;a!.send({type:'party_invite',toName:ally!.name});const invitation=await b!.wait(m=>m.type==='party_invite');if(invitation.type!=='party_invite')throw new Error('invite');b!.send({type:'party_accept',partyId:invitation.payload.partyId});const party=await a!.wait(m=>m.type==='party_snapshot'&&Boolean(m.payload?.members.some(member=>member.saveId===ally!.id)));expect(party.type).toBe('party_snapshot');
  const started=await world.request(`/api/saves/${hero!.id}/encounter/start`,token,{locationId:'adena_fields'});expect(started.status).toBe(200);const encounter=getEncounter(started.body.encounterId)!;const entity=[...encounter.entities.values()][0]!;entity.x=hero!.worldX!+5;entity.y=hero!.worldY!;entity.hp=1;entity.speed=0;
  vi.spyOn(Math,'random').mockReturnValue(.5);
  const attacked=await world.request(`/api/saves/${hero!.id}/combat/batch-attack`,token,{encounterId:encounter.encounterId,targetEntityIds:[entity.entityId]},'POST','network-kill');expect(attacked.status).toBe(200);expect(attacked.body.hits.some((h:{killed:boolean})=>h.killed)).toBe(true);
  const shared=await b!.wait(m=>m.type==='party_xp');expect(shared.type).toBe('party_xp');expect((await world.request(`/api/saves/${ally!.id}`,token)).body.xp).toBeGreaterThan(0);vi.restoreAllMocks();
 });
 it('enforces loot ownership and grants a pickup only once under concurrent requests',async()=>{
  const hero=saves[0]!,stranger=saves[2]!;const pile=spawnGroundLoot({locationId:hero.location,x:hero.worldX!,y:hero.worldY!,drops:[{kind:'adena',count:50}],owner:{kind:'solo',saveId:hero.id}})!;
  expect((await world.request(`/api/saves/${stranger.id}/loot/pickup`,token,{lootId:pile.id})).status).toBe(400);
  const before=(await world.request(`/api/saves/${hero.id}`,token)).body.adena+(await world.request(`/api/saves/${saves[1]!.id}`,token)).body.adena;
  const results=await Promise.all([world.request(`/api/saves/${hero.id}/loot/pickup`,token,{lootId:pile.id},'POST','pickup-once'),world.request(`/api/saves/${hero.id}/loot/pickup`,token,{lootId:pile.id},'POST','pickup-once')]);expect(results.map(r=>r.status)).toEqual([200,200]);expect((await world.request(`/api/saves/${hero.id}`,token)).body.adena+(await world.request(`/api/saves/${saves[1]!.id}`,token)).body.adena).toBe(before+50);
 });
 it('resolves PvP damage on the server and persists both players before emitting the result',async()=>{
  const attacker=connections[2]!,target=saves[0]!;const before=(await world.request(`/api/saves/${target.id}`,token)).body.hp;vi.spyOn(Math,'random').mockReturnValue(.5);attacker.send({type:'pvp_attack',targetSaveId:target.id});const event=await attacker.wait(m=>m.type==='pvp_event'||m.type==='pvp_error');expect(event.type).toBe('pvp_event');expect((await world.request(`/api/saves/${target.id}`,token)).body.hp).toBeLessThan(before);vi.restoreAllMocks();
 });
 it('checkpoints movement, reconnects and travels without accepting a stale location command',async()=>{
  const hero=saves[1]!,old=connections[1]!;old.send({type:'move_command',seq:1,locationId:hero.location,dx:1,dy:0,persist:true});await new Promise(resolve=>setTimeout(resolve,150));await old.close();const pose=(await world.request(`/api/saves/${hero.id}`,token)).body;
  const connected=await connectNetwork(world.base,hero.id,token);connections[1]=connected;const welcome=connected.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw new Error('welcome');expect(welcome.payload.self.x).toBeCloseTo(pose.worldX,0);
  const traveled=await world.request(`/api/saves/${hero.id}/travel`,token,{locationId:'empery_haven'});expect(traveled.status).toBe(200);connected.send({type:'join_location',locationId:'empery_haven'});connected.send({type:'move_command',seq:1,locationId:'adena_fields',dx:1,dy:0});await new Promise(resolve=>setTimeout(resolve,100));expect((await world.request(`/api/saves/${hero.id}`,token)).body.location).toBe('empery_haven');
 });
 it('moves mounted with analog input, stops and dismounts over real sockets',async()=>{
  const accountId=world.server.context.saves.load(saves[0]!.id)!.accountId;
  const hero=world.server.context.saves.create({name:'Mounted Motion',race:'human',profession:'warrior',location:'adena_fields',accountId});
  const mounted=world.server.context.saves.save({...hero,worldX:2560,worldY:3120,mount:{ownedId:'field_horse',mounted:true,stamina:1000}},{sync:true});
  const connection=await connectNetwork(world.base,mounted.id,token);connections.push(connection);
  const welcome=connection.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw new Error('welcome');
  expect(welcome.payload.protocolVersion).toBe(MOVEMENT_PROTOCOL);
  connection.send({type:'move_command',seq:1,locationId:mounted.location,dx:.25,dy:0,persist:true});
  const motion=await connection.wait(m=>m.type==='motion_snapshot'&&m.payload.ack===1);if(motion.type!=='motion_snapshot')throw new Error('motion');
  expect(motion.payload.x-welcome.payload.self.x).toBeGreaterThan(0);expect(motion.payload.x-welcome.payload.self.x).toBeLessThan(8);
  connection.send({type:'move_command',seq:2,locationId:mounted.location,dx:0,dy:0,persist:true});
  const stopped=await connection.wait(m=>m.type==='motion_snapshot'&&m.payload.ack===2);if(stopped.type!=='motion_snapshot')throw new Error('stop');
  expect(stopped.payload.x).toBeCloseTo(motion.payload.x);expect(stopped.payload.moving).toBe(false);
  const started=await world.request(`/api/saves/${mounted.id}/encounter/start`,token,{locationId:mounted.location});expect(started.status).toBe(200);
  const target=[...getEncounter(started.body.encounterId)!.entities.values()].find(entity=>entity.alive)!;
  target.x=stopped.payload.x+10;target.y=stopped.payload.y;target.hp=200;target.speed=0;
  connection.send({type:'move_command',seq:3,locationId:mounted.location,dx:0,dy:0,dash:true,persist:true});
  await connection.wait(m=>m.type==='motion_snapshot'&&m.payload.ack===3);
  const beforeCharge=(await world.request(`/api/saves/${mounted.id}`,token)).body.mount.stamina;
  const charge=await world.request(`/api/saves/${mounted.id}/combat/mount-charge`,token,{encounterId:started.body.encounterId,targetEntityIds:[target.entityId]});
  expect(charge.status).toBe(200);expect(charge.body.hits.length).toBeGreaterThan(0);
  expect((await world.request(`/api/saves/${mounted.id}`,token)).body.mount.stamina).toBeGreaterThan(beforeCharge-5);
  expect((await world.request(`/api/saves/${mounted.id}/combat/mount-charge`,token,{encounterId:started.body.encounterId,targetEntityIds:[target.entityId]})).status).toBe(409);
  const dismounted=await world.request(`/api/saves/${mounted.id}/mount/toggle`,token,{});expect(dismounted.status).toBe(200);expect(dismounted.body.save.mount.mounted).toBe(false);
 });
 it('keeps authored travel arrivals unchanged through HTTP, reconnect and automatic dismount', async () => {
  const accountId=world.server.context.saves.load(saves[0]!.id)!.accountId;
  const fresh=world.server.context.saves.create({name:'Travel Motion',race:'human',profession:'warrior',location:'empery_haven',accountId});
  const hero=world.server.context.saves.save({...fresh,level:30,worldX:1120,worldY:2976,questFlags:{quest_empery_hq_access:true},
    housing:{tier:3,purchasedAt:new Date().toISOString(),storages:emptyHousingStorages()},mount:{ownedId:'field_horse',mounted:true,stamina:1000}},{sync:true});
  for(const [locationId,x,y,mountedExpected] of [['haven_apartment',608,544,false],['empery_haven',1120,2976,false],['empery_hq',1312,1664,true],['empery_haven',4064,2720,true]] as const) {
    const result=await world.request(`/api/saves/${hero.id}/travel`,token,{locationId});expect(result.status).toBe(200);
    expect(result.body.save.worldX).toBe(x);expect(result.body.save.worldY).toBe(y);
    expect(result.body.save.mount.mounted).toBe(mountedExpected);
    const connection=await connectNetwork(world.base,hero.id,token);connections.push(connection);
    const welcome=connection.messages.find(message=>message.type==='welcome');if(welcome?.type!=='welcome')throw new Error('welcome');
    expect(welcome.payload.self.x).toBe(result.body.save.worldX);expect(welcome.payload.self.y).toBe(result.body.save.worldY);
    await connection.close();
    if(locationId==='empery_haven'&&!mountedExpected){
      const mounted=await world.request(`/api/saves/${hero.id}/mount/toggle`,token,{});expect(mounted.status).toBe(200);
    }
  }
 });
 it('replays a paid dialogue command without charging twice',async()=>{
  const clock=world.server.context.dayNight;
  const config=clock.configSnapshot();
  const noon=config.epochMs+Math.floor((Date.now()-config.epochMs)/config.cycleMs)*config.cycleMs+config.cycleMs/2;
  vi.spyOn(Date,'now').mockReturnValue(noon);
  const hero=world.server.context.saves.create({name:'Dialogue Replay',race:'human',profession:'warrior',location:'empery_haven',accountId:saves[0]!.accountId});
  world.server.context.saves.save({...hero,adena:100,worldX:864,worldY:800},{sync:true});
  const body={saveId:hero.id,npcId:'town_captain',choiceId:'captain_drill',channel:'proximity'};
  const first=await world.request('/api/dialogue/choice',token,body,'POST','paid-dialogue-once');
  expect(first.status).toBe(200);expect(first.body.save.adena).toBe(88);
  const replay=await world.request('/api/dialogue/choice',token,body,'POST','paid-dialogue-once');
  expect(replay.status).toBe(200);expect(replay.body).toEqual(first.body);
  expect((await world.request(`/api/saves/${hero.id}`,token)).body.adena).toBe(88);vi.restoreAllMocks();
 });
 it('restarts with the same sessions, committed loot and traveled character',async()=>{
  const before=await world.request(`/api/saves/${saves[0]!.id}`,token);await Promise.all(connections.map(c=>c.close()));connections=[];await world.restart();expect((await world.request('/api/auth/me',token)).status).toBe(200);expect((await world.request(`/api/saves/${saves[0]!.id}`,token)).body.adena).toBe(before.body.adena);expect((await world.request(`/api/saves/${saves[1]!.id}`,token)).body.location).toBe('empery_haven');const connected=await connectNetwork(world.base,saves[1]!.id,token);connections.push(connected);expect(connected.socket.readyState).toBe(WebSocket.OPEN);
 });
});
