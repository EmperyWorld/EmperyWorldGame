import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SaveManager } from '@empery/save';
import { loadServicesConfig } from '@empery/shared/config';
import { createGameServer } from '../app.js';
import { PostgresCharacterRepository } from './persistence/character-repository.js';
import { normalizeSave } from './save-normalize.js';
const enabled=process.env.RUN_PERSISTENCE_TESTS==='1';
describe.runIf(enabled)('PostgreSQL primary progression',()=>{
 const database=`ewg_test_${randomUUID().replaceAll('-','')}`;
 let control:pg.Pool;let pool:pg.Pool;let root:string;
 let server:Awaited<ReturnType<typeof createGameServer>>|null=null;
 let legacyId:string;let headers:Record<string,string>;let config:ReturnType<typeof loadServicesConfig>;
 beforeAll(async()=>{
  const url=new URL(process.env.EMPERY_POSTGRES_URL!);control=new pg.Pool({connectionString:url.toString()});
  await control.query(`CREATE DATABASE "${database}"`);url.pathname=`/${database}`;
  pool=new pg.Pool({connectionString:url.toString()});
  await pool.query(readFileSync(new URL('../../../../deploy/podman/init/01-schema.sql',import.meta.url),'utf8'));
  root=mkdtempSync(join(tmpdir(),'empery-primary-'));config=structuredClone(loadServicesConfig());
  config.save={dir:'saves',backend:'postgres'};config.persistence={postgres:{enabled:true,url:url.toString()}};
  config.comfyui.outputDir='generated';config.comfyui.jobsDir='jobs';
  const files=new SaveManager(join(root,'saves'),normalizeSave);legacyId=files.create({name:'Legacy',race:'human',location:'empery_haven'}).id;
  server=await createGameServer({rootDir:root,config,simulation:false,logger:false});
  const registration=await server.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'primarytester',password:'secret12'}});
  expect(registration.statusCode).toBe(200);headers={authorization:`Bearer ${registration.json().token}`};
 },15_000);
 afterAll(async()=>{
  vi.restoreAllMocks();if(server)await server.app.close().catch(()=>undefined);
  await pool?.end();if(control){await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await control.end();}
  if(root)rmSync(root,{recursive:true,force:true});
 });
 it('imports legacy once, commits before acknowledgement, replays after restart, and never resurrects deleted backups',async()=>{
  const claim=await server!.app.inject({method:'POST',url:'/api/saves/claim',headers:{...headers,'idempotency-key':'claim-legacy'},payload:{saveId:legacyId}});
  expect(claim.statusCode).toBe(200);
  const databaseSave=(await pool.query('SELECT payload_json FROM characters WHERE save_id=$1',[legacyId])).rows[0].payload_json;
  expect(databaseSave.accountId).toBeTruthy();
  const request={method:'PATCH' as const,url:`/api/saves/${legacyId}`,headers:{...headers,'idempotency-key':'hotbar-once'},payload:{skillHotbar:['power_strike']}};
  const first=await server!.app.inject(request);expect(first.statusCode).toBe(200);
  const revision=first.json().revision;
  const simultaneous=await Promise.all([server!.app.inject({...request,headers:{...request.headers,'idempotency-key':'first-parallel'}}),server!.app.inject({...request,headers:{...request.headers,'idempotency-key':'first-parallel'}})]);
  expect(simultaneous[0].json().revision).toBe(simultaneous[1].json().revision);
  const concurrent=await Promise.all([server!.app.inject(request),server!.app.inject(request)]);
  for(const response of concurrent){expect(response.statusCode).toBe(200);expect(response.json().revision).toBe(revision);}
  await server!.app.close();server=await createGameServer({rootDir:root,config,simulation:false,logger:false});
  const replay=await server.app.inject(request);expect(replay.json()).toEqual(first.json());
  const conflict=await server.app.inject({...request,payload:{skillHotbar:[]}});expect(conflict.statusCode).toBe(409);
  const deleteRequest={method:'DELETE' as const,url:`/api/saves/${legacyId}`,headers:{...headers,'idempotency-key':'delete-once'}};
  const deleted=await server.app.inject(deleteRequest);expect(deleted.statusCode).toBe(200);
  // The retained pre-migration JSON still contains the character; PostgreSQL deletion must win.
  expect(JSON.parse(readFileSync(join(root,'saves',`${legacyId}.json`),'utf8')).id).toBe(legacyId);
  await server.app.close();server=await createGameServer({rootDir:root,config,simulation:false,logger:false});
  expect((await server.app.inject(deleteRequest)).json()).toEqual({ok:true});
  expect((await server.app.inject({url:`/api/saves/${legacyId}`,headers})).statusCode).toBe(404);
 });
 it('rolls back a multi-character revision conflict and writes no receipt',async()=>{
  const repository=new PostgresCharacterRepository(pool),save=normalizeSave(new SaveManager(join(root,'fixtures')).create({name:'A',race:'human'}));
  const other={...save,id:randomUUID()};await repository.commitChanges([{id:save.id,save},{id:other.id,save:other}]);
  const receipt={accountId:'test',key:'conflict',fingerprint:'hash',result:{ok:true}};
  await expect(repository.commitChanges([{id:save.id,save:{...save,revision:2,adena:999}},{id:other.id,save:{...other,revision:2,adena:999}}],new Map([[save.id,1],[other.id,999]]),receipt)).rejects.toThrow('revision conflict');
  expect((await repository.getBySaveId(save.id))!.adena).toBe(save.adena);expect(await repository.findReceipt('test','conflict')).toBeNull();
 });
 it('updates checkpoint batches without rewriting unchanged JSONB child rows',async()=>{
  const repository=new PostgresCharacterRepository(pool);
  const save=normalizeSave(new SaveManager(join(root,'ordered-fixtures')).create({name:'Ordered',race:'human'}));
  const other={...save,id:randomUUID()};await repository.commitChanges([{id:save.id,save},{id:other.id,save:other}]);
  await pool.query("UPDATE character_equipment SET instance=instance || '{\"note\":\"unchanged\"}'::jsonb WHERE save_id=$1 AND slot='weapon'",[save.id]);
  await repository.commitChanges([{id:save.id,save:{...save,revision:2,worldX:128}},{id:other.id,save:{...other,revision:2,worldX:256}}],new Map([[save.id,1],[other.id,1]]));
  expect((await pool.query("SELECT instance FROM character_equipment WHERE save_id=$1 AND slot='weapon'",[save.id])).rows[0].instance.note).toBe('unchanged');
  expect((await repository.getBySaveId(other.id))!.worldX).toBe(256);
 });
 it('returns 503 on write failure and stops acknowledging progression',async()=>{
  const create=await server!.app.inject({method:'POST',url:'/api/saves',headers,payload:{name:'New',race:'human',profession:'warrior'}});expect(create.statusCode).toBe(200);
  const id=create.json().id;vi.spyOn(PostgresCharacterRepository.prototype,'commitChanges').mockRejectedValueOnce(new Error('database connection lost'));
  const failed=await server!.app.inject({method:'PATCH',url:`/api/saves/${id}`,headers,payload:{skillHotbar:['power_strike']}});expect(failed.statusCode).toBe(503);
  expect((await server!.app.inject({url:'/ready'})).statusCode).toBe(503);
  expect((await server!.app.inject({url:`/api/saves/${id}`,headers})).statusCode).toBe(503);
  const stored=(await pool.query('SELECT payload_json FROM characters WHERE save_id=$1',[id])).rows[0].payload_json;
  expect(stored.skillHotbar??[]).not.toEqual(['power_strike']);vi.restoreAllMocks();
  await expect(server!.app.close()).rejects.toThrow();server=null;
 });
 it('fails closed on real world-owner connection loss and releases resources for restart',async()=>{
  server=await createGameServer({rootDir:root,config,simulation:false,logger:false});
  const {rows}=await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=734281 AND objid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())");
  expect(rows).toHaveLength(1);await pool.query('SELECT pg_terminate_backend($1)',[rows[0].pid]);
  await vi.waitFor(async()=>expect((await server!.app.inject({url:'/ready'})).statusCode).toBe(503),{timeout:2000});
  await expect(server.app.close()).rejects.toThrow();server=null;
  server=await createGameServer({rootDir:root,config,simulation:false,logger:false});
  expect((await server.app.inject({url:'/ready'})).statusCode).toBe(200);
 });

});
