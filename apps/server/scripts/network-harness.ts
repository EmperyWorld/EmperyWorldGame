import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../src/app.js';
import { loadServicesConfig } from '@empery/shared/config';
import type { MultiplayerServerMessage, MultiplayerClientMessage } from '@empery/shared';
export async function isolatedNetworkWorld(postgresUrl?:string) {
 const root=mkdtempSync(join(tmpdir(),'ewg-network-'));
 const config=structuredClone(loadServicesConfig());config.save={dir:'saves',backend:postgresUrl?'postgres':'files'};config.comfyui.outputDir='generated';config.comfyui.jobsDir='jobs';config.persistence={};
 let control:pg.Pool|undefined;const database=`ewg_network_${randomUUID().replaceAll('-','')}`;
 try{
  if(postgresUrl){
   const url=new URL(postgresUrl);control=new pg.Pool({connectionString:url.toString()});await control.query(`CREATE DATABASE "${database}"`);url.pathname=`/${database}`;
   const init=new pg.Pool({connectionString:url.toString()});try{await init.query(readFileSync(new URL('../../../deploy/podman/init/01-schema.sql',import.meta.url),'utf8'));}finally{await init.end();}
   config.persistence={postgres:{enabled:true,url:url.toString()}};
  }
  let server=await createGameServer({rootDir:root,config,persistence:Boolean(postgresUrl),logger:false});
  let base=await server.app.listen({host:'127.0.0.1',port:0});
  return {
   root,config,get server(){return server;},get base(){return base;},
   async request<T=unknown>(path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST',key?:string){
    const init:RequestInit={method,headers:{...(token?{authorization:`Bearer ${token}`}:{}) ,...(body!==undefined?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},signal:AbortSignal.timeout(15000)};
    if(body!==undefined&&method!=='GET'&&method!=='HEAD')init.body=JSON.stringify(body);
    const response=await fetch(base+path,init);
    return {status:response.status,body:await response.json() as T};
   },
   async restart(){await server.app.close();server=await createGameServer({rootDir:root,config,persistence:Boolean(postgresUrl),logger:false});base=await server.app.listen({host:'127.0.0.1',port:0});},
   async close(){try{await server.app.close();}finally{if(control){try{await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);}finally{await control.end();}}rmSync(root,{recursive:true,force:true});}}
  };
 }catch(error){if(control){await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(()=>undefined);await control.end();}rmSync(root,{recursive:true,force:true});throw error;}
}
export async function connectNetwork(base:string,saveId:string,token:string,onMessage?:(message:MultiplayerServerMessage)=>void,historyLimit=512){
 const socket=new WebSocket(`${base.replace(/^http/,'ws')}/ws?saveId=${encodeURIComponent(saveId)}&token=${encodeURIComponent(token)}`);
 const messages:MultiplayerServerMessage[]=[];
 const waiters=new Set<{predicate:(message:MultiplayerServerMessage)=>boolean;resolve:(message:MultiplayerServerMessage)=>void}>();
 socket.addEventListener('message',event=>{
  const message=JSON.parse(String(event.data)) as MultiplayerServerMessage;messages.push(message);if(messages.length>historyLimit)messages.shift();onMessage?.(message);
  for(const waiter of waiters)if(waiter.predicate(message)){waiters.delete(waiter);waiter.resolve(message);}
 });
 const wait=(predicate:(message:MultiplayerServerMessage)=>boolean,timeout=8000):Promise<MultiplayerServerMessage>=>new Promise((resolve,reject)=>{
  const found=messages.find(predicate);if(found){resolve(found);return;}
  const waiter={predicate,resolve:(message:MultiplayerServerMessage)=>{clearTimeout(timer);resolve(message);}};
  const timer=setTimeout(()=>{waiters.delete(waiter);reject(new Error('WebSocket message timeout'));},timeout);waiters.add(waiter);
 });
 await wait(message=>message.type==='welcome');
 return {socket,messages,wait,send:(message:MultiplayerClientMessage)=>socket.send(JSON.stringify(message)),async close(){if(socket.readyState===WebSocket.CLOSED)return;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,1500);socket.addEventListener('close',()=>{clearTimeout(timer);resolve();},{once:true});socket.close();});}};
}
