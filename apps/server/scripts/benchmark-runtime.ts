import { cliArgs } from './cli-args.js';
/** Isolated in-process transport/simulation benchmark; never touches real saves or services. */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../src/app.js';
import { loadServicesConfig } from '@empery/shared/config';
import { resetEncountersForTests } from '../src/services/encounter.js';
const args=cliArgs();
const duration=Number(args.get('seconds')??3)*1000,delay=Number(args.get('delay')??0),jitter=Number(args.get('jitter')??0),loss=Number(args.get('loss')??0);
const counts=(args.get('players')??'10,50,100').split(',').map(Number);
if(!counts.every(n=>Number.isInteger(n)&&n>0&&n<=1000)||![duration,delay,jitter,loss].every(Number.isFinite)||duration<1000||duration>60000||delay<0||delay>5000||jitter<0||jitter>5000||loss<0||loss>1)throw new Error('Invalid benchmark parameters');
const results=[];
for(const players of counts){
 const root=mkdtempSync(join(tmpdir(),'empery-benchmark-')),config=structuredClone(loadServicesConfig());
 config.save={dir:'saves',backend:'files'};config.comfyui.outputDir='generated';config.comfyui.jobsDir='jobs';
 let admin:pg.Pool|undefined;let database:string|undefined;
 if(args.get('postgres')==='1'){
  if(!process.env.EMPERY_POSTGRES_URL)throw new Error('EMPERY_POSTGRES_URL required for disposable database benchmark');
  const url=new URL(process.env.EMPERY_POSTGRES_URL);admin=new pg.Pool({connectionString:url.toString()});
  database=`ewg_bench_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE "${database}"`);url.pathname=`/${database}`;
  const init=new pg.Pool({connectionString:url.toString()});
  try{await init.query(readFileSync(new URL('../../../deploy/podman/init/01-schema.sql',import.meta.url),'utf8'));}finally{await init.end();}
  config.save.backend='postgres';config.persistence={postgres:{enabled:true,url:url.toString()}};
 }
 const server=await createGameServer({rootDir:root,config,persistence:args.get('postgres')==='1',simulation:true,logger:false});
 await server.app.ready();
 const sockets:Awaited<ReturnType<typeof server.app.injectWS>>[]=[],pending=new Set<ReturnType<typeof setTimeout>>();
 let timer:ReturnType<typeof setInterval>|undefined;
 try {
  const account=await server.context.auth.register('benchmark','secret12');
  const login=await server.context.auth.login('benchmark','secret12');
  if('error' in account||'error' in login)throw new Error('Benchmark authentication failed');
  let seed=1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<players;i++){
   const save=server.context.saves.create({name:`Bot ${i}`,race:'human',location:'adena_fields',accountId:account.account.id});
   server.context.saves.save({...save,worldX:2560,worldY:3120},{sync:true});
   let ready!:()=>void;const welcome=new Promise<void>(resolve=>{ready=resolve;});
   const ws=await server.app.injectWS(`/ws?saveId=${save.id}&token=${login.token}`,{}, {onInit:socket=>socket.on('message',raw=>{if(JSON.parse(String(raw)).type==='welcome')ready();})});
   await Promise.race([welcome,new Promise<never>((_,reject)=>{const timeout=setTimeout(()=>reject(new Error('Benchmark handshake timeout')),3000);void welcome.then(()=>clearTimeout(timeout));})]);sockets.push(ws);
   await server.app.inject({method:'POST',url:`/api/saves/${save.id}/encounter/start`,headers:{authorization:`Bearer ${login.token}`},payload:{locationId:'adena_fields'}});
  }
  server.context.metrics.reset();
  let seq=0;
  timer=setInterval(()=>{
   seq++;const direction=Math.floor(seq/20)%2===0?1:-1;
   for(const ws of sockets){
    if(random()<loss)continue;
    const send=()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'move_command',seq,locationId:'adena_fields',dx:direction,dy:0}));};
    if(delay||jitter){const capturedSeq=seq;const timeout=setTimeout(()=>{pending.delete(timeout);if(ws.readyState===1)ws.send(JSON.stringify({type:'move_command',seq:capturedSeq,locationId:'adena_fields',dx:direction,dy:0}));},Math.max(0,delay+(random()*2-1)*jitter));pending.add(timeout);}else send();
   }
  },50);
  await new Promise(resolve=>setTimeout(resolve,duration));
  results.push({players,seconds:duration/1000,delayMs:delay,jitterMs:jitter,loss,transport:'Fastify injectWS (in-process)',persistence:database?'isolated PostgreSQL':'isolated files',metrics:server.context.metrics.snapshot()});
 } finally {
  if(timer)clearInterval(timer);for(const timeout of pending)clearTimeout(timeout);
  for(const socket of sockets)socket.close();await server.app.close();resetEncountersForTests();rmSync(root,{recursive:true,force:true});
  if(admin&&database){await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await admin.end();}
 }
}
console.log(JSON.stringify(results,null,2));
