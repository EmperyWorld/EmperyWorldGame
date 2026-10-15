import { readFileSync, existsSync, mkdirSync, renameSync, rmSync, readdirSync, statSync, writeFileSync, copyFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { parse } from 'yaml';
import pg from 'pg';
const root=fileURLToPath(new URL('../../../',import.meta.url));process.chdir(root);
const config=parse(readFileSync('config/services.yaml','utf8'));
const operations=JSON.parse(readFileSync('config/operations.json','utf8'));
const url=new URL(process.env.EMPERY_POSTGRES_URL??config.persistence.postgres.url);
let command=process.argv[2];
if(command==='verify-latest'){const latest=readdirSync(operations.backupDir).filter(name=>name.startsWith('backup-')).sort().at(-1);if(!latest)throw new Error('No backup to verify');process.argv[3]=join(operations.backupDir,latest);command='verify-restore';}
const run=(executable,args,options={})=>new Promise((resolvePromise,reject)=>{
 const child=spawn(executable,args,{...options,stdio:options.stdio??'pipe'});let stdout='',stderr='';child.stdout?.on('data',data=>{stdout+=data;if(stdout.length>1048576)stdout=stdout.slice(-1048576);});child.stderr?.on('data',data=>{stderr+=data;if(stderr.length>16384)stderr=stderr.slice(-16384);});child.on('error',reject);child.on('exit',code=>code===0?resolvePromise(stdout):reject(new Error(`${executable} failed (${code}): ${stderr}`)));
});
const pgArgs=(tool,args)=>['exec','--env',`PGPASSWORD=${decodeURIComponent(url.password)}`,operations.postgresContainer,tool,'--host=127.0.0.1','--port=5432',`--username=${decodeURIComponent(url.username)}`,...args];
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const validateBackup=dir=>{
 const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
 for(const name of ['postgres.dump','files.tar.gz'])if(digest(join(dir,name))!==manifest.sha256[name])throw new Error(`Backup checksum mismatch: ${name}`);
 return manifest;
};
if(command==='backup'){
 const backupDir=resolve(operations.backupDir);mkdirSync(backupDir,{recursive:true,mode:0o700});
 const name=`backup-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`;
 const partial=join(backupDir,`.${name}.partial`),destination=join(backupDir,name);mkdirSync(partial,{mode:0o700});
 try{
  const remote=`/tmp/${name}.dump`,pool=new pg.Pool({connectionString:url.toString()});const client=await pool.connect();let expectedCounts;
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
   expectedCounts={};for(const table of ['characters','game_accounts','game_auth_sessions','game_command_receipts'])expectedCounts[table]=Number((await client.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
   await run('podman',pgArgs('pg_dump',['--format=custom',`--snapshot=${snapshot}`,`--file=${remote}`,`--dbname=${decodeURIComponent(url.pathname.slice(1))}`]));await client.query('COMMIT');
   await run('podman',['cp',`${operations.postgresContainer}:${remote}`,join(partial,'postgres.dump')]);
  }finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();await pool.end();await run('podman',['exec',operations.postgresContainer,'rm','-f',remote]).catch(()=>undefined);}
  const paths=['config/services.yaml','config/operations.json','content','data/generated','data/media-jobs','data/saves','data/accounts.json','data/sessions.json','data/admin-jobs.json','data/bug-reports.jsonl'].filter(path=>existsSync(path));
  await run('tar',['-czf',join(partial,'files.tar.gz'),'--',...paths]);
  const manifest={version:1,expectedCounts,createdAt:new Date().toISOString(),postgresVersion:(await run('podman',['exec',operations.postgresContainer,'postgres','--version'])).trim(),files:paths,sha256:{'postgres.dump':digest(join(partial,'postgres.dump')),'files.tar.gz':digest(join(partial,'files.tar.gz'))}};
  writeFileSync(join(partial,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});for(const name of ['postgres.dump','files.tar.gz'])chmodSync(join(partial,name),0o600);
  validateBackup(partial);renameSync(partial,destination);
  if(operations.externalBackupDir){const target=join(resolve(operations.externalBackupDir),name);mkdirSync(target,{recursive:true,mode:0o700});for(const file of ['postgres.dump','files.tar.gz','manifest.json']){copyFileSync(join(destination,file),join(target,file));chmodSync(join(target,file),0o600);}validateBackup(target);}
  const retention=Number(operations.retentionDays);if(!Number.isInteger(retention)||retention<2)throw new Error('retentionDays must be >=2');
  for(const entry of readdirSync(backupDir))if(entry.startsWith('backup-')&&join(backupDir,entry)!==destination&&statSync(join(backupDir,entry)).mtimeMs<Date.now()-retention*86400000){validateBackup(join(backupDir,entry));rmSync(join(backupDir,entry),{recursive:true});}
  console.log(JSON.stringify({ok:true,backup:destination,external:Boolean(operations.externalBackupDir)}));
 }catch(error){rmSync(partial,{recursive:true,force:true});throw error;}
}else if(command==='verify-restore'){
 const dir=resolve(process.argv[3]??'');const manifest=validateBackup(dir);
 const database=`ewg_restore_${randomUUID().replaceAll('-','')}`,remote=`/tmp/${database}.dump`,pool=new pg.Pool({connectionString:url.toString()});
 let created=false;
 try{
  await pool.query(`CREATE DATABASE "${database}"`);created=true;
  await run('podman',['cp',join(dir,'postgres.dump'),`${operations.postgresContainer}:${remote}`]);
  await run('podman',pgArgs('pg_restore',['--exit-on-error','--no-owner',`--dbname=${database}`,remote]));
  const restoredUrl=new URL(url);restoredUrl.pathname=`/${database}`;const restored=new pg.Pool({connectionString:restoredUrl.toString()});
  try{
   const counts={};for(const table of ['characters','game_accounts','game_auth_sessions','game_command_receipts'])counts[table]=Number((await restored.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
   if(JSON.stringify(counts)!==JSON.stringify(manifest.expectedCounts))throw new Error('Restored database counts differ from the exported snapshot');
   const broken=await restored.query('SELECT count(*) FROM game_auth_sessions s LEFT JOIN game_accounts a ON a.id=s.account_id WHERE a.id IS NULL');if(Number(broken.rows[0].count))throw new Error('Orphan sessions after restore');
   const files=(await run('tar',['-tzf',join(dir,'files.tar.gz')])).split('\n').filter(Boolean);if(files.some(name=>name.startsWith('/')||name.split('/').includes('..')))throw new Error('Unsafe archive paths');
   const restoredRoot=mkdtempSync(join(tmpdir(),'ewg-restore-files-'));
   try{
    await run('tar',['-xzf',join(dir,'files.tar.gz'),'--no-same-owner','-C',restoredRoot]);
    for(const path of manifest.files)if(!existsSync(join(restoredRoot,path)))throw new Error(`Restored file missing: ${path}`);
    const {createGameServer}=await import('../dist/app.js');const {loadServicesConfig}=await import('@empery/shared/config');const restoredConfig=structuredClone(loadServicesConfig());restoredConfig.save.backend='postgres';restoredConfig.persistence={postgres:{enabled:true,url:restoredUrl.toString()}};
    const server=await createGameServer({rootDir:restoredRoot,config:restoredConfig,simulation:false,logger:false});try{const ready=await server.app.inject({url:'/ready'});if(ready.statusCode!==200)throw new Error('Restored game is not ready');}finally{await server.app.close();}
   }finally{rmSync(restoredRoot,{recursive:true,force:true});}
   const verification={ok:true,backup:dir,createdAt:manifest.createdAt,verifiedAt:new Date().toISOString(),counts,archiveEntries:files.length,restoredServerReady:true};writeFileSync(join(dir,'restore-verification.json'),JSON.stringify(verification,null,2),{mode:0o600});console.log(JSON.stringify(verification));
  }finally{await restored.end();}
 }finally{await run('podman',['exec',operations.postgresContainer,'rm','-f',remote]).catch(()=>undefined);if(created)await pool.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await pool.end();}
}else if(command==='monitor'){
 const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:operations.requestTimeoutMs,query_timeout:operations.requestTimeoutMs});const issues=[];
 try{
  const start=performance.now();try{await pool.query('SELECT 1');const ms=performance.now()-start;if(ms>operations.slowDatabaseMs)issues.push(`PostgreSQL latency ${Math.round(ms)} ms`);}catch{issues.push('PostgreSQL unavailable');}
  try{const response=await fetch(operations.readyUrl,{signal:AbortSignal.timeout(operations.requestTimeoutMs)});if(!response.ok)issues.push(`Game readiness HTTP ${response.status}`);}catch{issues.push('Game readiness unavailable');}
  try{const pong=await run('podman',['exec',operations.redisContainer,'redis-cli','ping']);if(pong.trim()!=='PONG')issues.push('Redis unavailable');}catch{issues.push('Redis unavailable');}
  for(const path of operations.storagePaths??[root]){const df=await run('df',['-P',path]);const used=Number(df.trim().split('\n').at(-1).trim().split(/\s+/)[4].replace('%',''));if(used>=operations.maxDiskUsedPercent)issues.push(`Storage ${path}: ${used}% used`);}
  if(operations.metricsToken){
   try{
    const response=await fetch(new URL('/api/ops/metrics',operations.readyUrl),{headers:{authorization:`Bearer ${operations.metricsToken}`},signal:AbortSignal.timeout(operations.requestTimeoutMs)});
    if(!response.ok)issues.push(`Runtime metrics HTTP ${response.status}`);else{
     const metrics=await response.json();
     if((metrics.gauges?.['progress.queueDepth']??0)>16)issues.push('Progress queue depth exceeds 16');
     if((metrics.timings?.['progress.commitMs']?.p95??0)>operations.slowDatabaseMs)issues.push('Progress commit p95 exceeds limit');
     if((metrics.eventLoop?.p95Ms??0)>200)issues.push('Event loop p95 exceeds 200 ms');
    }
   }catch{issues.push('Runtime metrics unavailable');}
  }
  const backups=existsSync(operations.backupDir)?readdirSync(operations.backupDir).filter(name=>name.startsWith('backup-')):[];
  const newest=Math.max(0,...backups.map(name=>statSync(join(operations.backupDir,name)).mtimeMs));if(Date.now()-newest>36*3600000)issues.push('No successful backup within 36 hours');
  const alerts='data/operations-alerts';
  if(existsSync(alerts))for(const name of readdirSync(alerts)){
   if(!/^empery-[a-z0-9@.-]+\.service$/.test(name))continue;
   const status=await run('systemctl',['--user','show',name,'-p','Result','-p','ActiveState']).catch(()=>null);
   if(status?.includes('Result=success')&&!status.includes('ActiveState=failed')&&!status.includes('ActiveState=activating')){rmSync(join(alerts,name));await run('logger',['-p','user.notice','-t','empery-service-recovered','--',`${name} recovered`]);}
  }
  const state='data/operations-monitor.json';const previous=existsSync(state)?JSON.parse(readFileSync(state,'utf8')):{issues:[]};
  if(JSON.stringify(issues)!==JSON.stringify(previous.issues)){
   const message=issues.length?issues.join('; '):'Empery services recovered';await run('logger',['-p',issues.length?'user.err':'user.notice','-t','empery-monitor','--',message]);console.log(message);
   await run('notify-send',['Empery World',message]).catch(()=>undefined);
  }
  writeFileSync(state,JSON.stringify({checkedAt:new Date().toISOString(),issues},null,2),{mode:0o600});console.log(JSON.stringify({ok:issues.length===0,issues}));
 }finally{await pool.end();}
}else if(command==='alert'){
 const unit=process.argv[3]??'empery-server.service';if(!/^empery-[a-z0-9@.-]+\.service$/.test(unit))throw new Error('Invalid Empery unit name');
 mkdirSync('data/operations-alerts',{recursive:true,mode:0o700});const state=join('data/operations-alerts',unit);
 if(!existsSync(state)){writeFileSync(state,new Date().toISOString(),{mode:0o600});const message=`Empery service failed: ${unit}. Inspect journalctl --user -u ${unit}`;await run('logger',['-p','user.err','-t','empery-service-failure','--',message]);await run('notify-send',['Empery World',message]).catch(()=>undefined);console.log(message);}

}else throw new Error('Usage: operations.mjs backup | verify-restore BACKUP_DIR | monitor');
