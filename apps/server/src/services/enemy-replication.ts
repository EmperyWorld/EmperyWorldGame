import type { MultiplayerEnemySnapshot, MultiplayerEnemyPresence, MultiplayerServerMessage } from '@empery/shared';
import { PRESENCE_INTEREST_RADIUS } from './presence-replication.js';
export class EnemyReplication {
  private baselines=new Map<string,{encounterId:string;enemies:Map<string,MultiplayerEnemyPresence>}>();
  forget(id:string):void {this.baselines.delete(id);}
  message(id:string,snapshot:MultiplayerEnemySnapshot,self:{x:number;y:number}):MultiplayerServerMessage|null {
    const all=new Set(snapshot.enemies.map(enemy=>enemy.entityId));
    const enemies=snapshot.enemies.filter(enemy=>Math.hypot(enemy.x-self.x,enemy.y-self.y)<=PRESENCE_INTEREST_RADIUS);
    const previous=this.baselines.get(id),next=new Map(enemies.map(enemy=>[enemy.entityId,{...enemy}]));
    this.baselines.set(id,{encounterId:snapshot.encounterId,enemies:next});
    if(!previous||previous.encounterId!==snapshot.encounterId)return {type:'enemy_snapshot',payload:{...snapshot,enemies,interestFiltered:true}};
    const added:MultiplayerEnemyPresence[]=[],changed:Array<Partial<MultiplayerEnemyPresence>&{entityId:string;unset?:Array<keyof MultiplayerEnemyPresence>}>=[],removed:string[]=[],dead:string[]=[];
    for(const enemy of enemies){
      const old=previous.enemies.get(enemy.entityId);if(!old){added.push(enemy);continue;}
      const patch:Partial<MultiplayerEnemyPresence>&{entityId:string;unset?:Array<keyof MultiplayerEnemyPresence>}={entityId:enemy.entityId};
      for(const key of new Set([...Object.keys(old),...Object.keys(enemy)]) as Set<keyof MultiplayerEnemyPresence>)if(enemy[key]!==old[key]){
        if(enemy[key]===undefined)(patch.unset??=[]).push(key);else Object.assign(patch,{[key]:enemy[key]});
      }
      if(Object.keys(patch).length>1)changed.push(patch);
    }
    for(const entityId of previous.enemies.keys())if(!next.has(entityId)){if(all.has(entityId))removed.push(entityId);else dead.push(entityId);}
    if(!added.length&&!changed.length&&!removed.length&&!dead.length)return null;
    return {type:'enemy_delta',payload:{locationId:snapshot.locationId,encounterId:snapshot.encounterId,added,changed,removed,dead}};
  }
}
