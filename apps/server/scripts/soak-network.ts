import { cliArgs } from './cli-args.js';
/** Real HTTP/TCP/WebSocket soak in an isolated world; never creates accounts in the live game. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isolatedNetworkWorld, connectNetwork } from './network-harness.js';
const args=cliArgs();
const players=Number(args.get('players')??50),seconds=Number(args.get('seconds')??900),delay=Number(args.get('delay')??0),jitter=Number(args.get('jitter')??0),loss=Number(args.get('loss')??0);
if(![players,seconds,delay,jitter,loss].every(Number.isFinite)||!Number.isInteger(players)||players<1||players>500||seconds<1||seconds>86400||delay<0||delay>5000||jitter<0||jitter>5000||loss<0||loss>1)throw new Error('Invalid soak parameters');
const world=await isolatedNetworkWorld(args.get('postgres')==='1'?process.env.EMPERY_POSTGRES_URL:undefined);
if(args.get('postgres')==='1'&&!process.env.EMPERY_POSTGRES_URL){await world.close();throw new Error('EMPERY_POSTGRES_URL required');}
const clients:Array<{id:string;seq:number;connection:Awaited<ReturnType<typeof connectNetwork>>}>=[];
const pending=new Set<ReturnType<typeof setTimeout>>();const timings:number[]=[],samples:unknown[]=[];
let receivedBytes=0,sentBytes=0,received=0,errors=0,httpErrors=0,reconnects=0,tick=0;
let timer:ReturnType<typeof setInterval>|undefined;let aborted=false;
process.once('SIGINT',()=>{aborted=true;});process.once('SIGTERM',()=>{aborted=true;});
try{
 const observe=(message:import('@empery/shared').MultiplayerServerMessage)=>{
   received++;receivedBytes+=Buffer.byteLength(JSON.stringify(message));
   if(message.type==='error')errors++;
   if(message.type==='pong'){const time=Date.now()-message.ts;timings.push(time);if(timings.length>10000)timings.shift();}
 };
 const registration=await world.request<{token:string;account:{id:string}}>('/api/auth/register',undefined,{username:'soak_runner',password:'isolated123'});if(registration.status!==200)throw new Error('Authentication failed');const token=registration.body.token as string;
 for(let i=0;i<players;i++){
  const save=world.server.context.saves.create({name:`Soak ${i}`,race:'human',location:'empery_haven',accountId:registration.body.account.id});
  world.server.context.saves.save({...save,worldX:2560+(i%5)*25,worldY:3136},{sync:true});
  const connection=await connectNetwork(world.base,save.id,token,observe,32);clients.push({id:save.id,seq:0,connection});
 }
 world.server.context.metrics.reset();const start=Date.now();
 timer=setInterval(()=>{
  tick++;
  for(const client of clients){
   const seq=++client.seq;if(Math.random()<loss)continue;
   const payload=JSON.stringify({type:'move_command',seq,locationId:'empery_haven',dx:Math.floor(tick/40)%2?1:-1,dy:0});
   const socket=client.connection.socket;
   const send=()=>{if(socket.readyState===WebSocket.OPEN){socket.send(payload);sentBytes+=Buffer.byteLength(payload);}};
   if(delay||jitter){const timeout=setTimeout(()=>{pending.delete(timeout);send();},Math.max(0,delay+(Math.random()*2-1)*jitter));pending.add(timeout);}else send();
   if(tick%100===0&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping',ts:Date.now()}));
  }
 },50);
 let nextSample=Date.now(),nextReconnect=Date.now()+60000,nextMutation=Date.now();
 while(!aborted&&Date.now()-start<seconds*1000){
  if(Date.now()>=nextMutation){nextMutation=Date.now()+1000;const client=clients[tick%clients.length]!;const result=await world.request(`/api/saves/${client.id}`,token,{skillHotbar:tick%2?['power_strike']:[]},'PATCH',`soak_${tick}`);if(result.status!==200)httpErrors++;}
  if(Date.now()>=nextSample){nextSample=Date.now()+30000;const ready=await world.request('/ready');if(ready.status!==200)throw new Error('Simulation became unavailable');if(clients.some(c=>c.connection.socket.readyState!==WebSocket.OPEN))throw new Error('Unexpected client disconnect');samples.push({seconds:(Date.now()-start)/1000,metrics:world.server.context.metrics.snapshot(),driverMemory:process.memoryUsage(),connections:clients.filter(c=>c.connection.socket.readyState===WebSocket.OPEN).length});console.log(JSON.stringify({progressSeconds:Math.round((Date.now()-start)/1000),players,errors,httpErrors}));}
  if(Date.now()>=nextReconnect){nextReconnect=Date.now()+60000;const client=clients[reconnects%players]!;await client.connection.close();client.seq=0;client.connection=await connectNetwork(world.base,client.id,token,observe,32);reconnects++;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 timings.sort((a,b)=>a-b);
 const result={transport:'real TCP HTTP/WebSocket; driver and server share one process',players,seconds:(Date.now()-start)/1000,delayMs:delay,jitterMs:jitter,applicationMessageDrop:loss,aborted,errors,httpErrors,reconnects,received,sentBytes,receivedBytes,rttMs:{samples:timings.length,p95:timings[Math.floor((timings.length-1)*.95)]??null,max:timings.at(-1)??null},samples,final:world.server.context.metrics.snapshot()};
 const output=args.get('output')??'data/verification/network-soak.json';mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({output,errors,httpErrors,reconnects,received}));if(errors||httpErrors||aborted)process.exitCode=1;
}finally{if(timer)clearInterval(timer);for(const timeout of pending)clearTimeout(timeout);await Promise.all(clients.map(client=>client.connection.close()));await world.close();}
