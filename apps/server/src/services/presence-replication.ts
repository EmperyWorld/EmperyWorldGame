import type { MultiplayerLocationSnapshot, MultiplayerPlayerPresence, MultiplayerServerMessage } from '@empery/shared';
export const PRESENCE_INTEREST_RADIUS = 1200;
/** Per-connection baseline: new observers always receive complete state before patches. */
export class PresenceReplication {
  private baselines=new Map<string,{id:number;locationId:string;players:Map<string,MultiplayerPlayerPresence>;loot:string}>();
  private snapshot:MultiplayerLocationSnapshot|null=null;
  private groupCounter=0;
  private groups=new Map<string,{baseline:{id:number;locationId:string;players:Map<string,MultiplayerPlayerPresence>;loot:string};message:MultiplayerServerMessage|null}>();
  forget(connectionId:string):void {this.baselines.delete(connectionId);}
  message(connectionId:string,snapshot:MultiplayerLocationSnapshot,self:MultiplayerPlayerPresence):MultiplayerServerMessage|null {
    if(this.snapshot!==snapshot){this.snapshot=snapshot;this.groups.clear();}
    const players=snapshot.players.filter(player=>player.saveId===self.saveId||Math.hypot(player.x-self.x,player.y-self.y)<=PRESENCE_INTEREST_RADIUS);
    const groundLoot=snapshot.groundLoot?.filter(pile=>Math.hypot(pile.x-self.x,pile.y-self.y)<=PRESENCE_INTEREST_RADIUS);
    const filtered={...snapshot,players,groundLoot};
    const previous=this.baselines.get(connectionId);
    const groupKey=`${previous?.id??0}:${players.map(player=>player.saveId).join(',')}:${JSON.stringify(groundLoot??[])}`;
    const cached=this.groups.get(groupKey);
    if(cached){this.baselines.set(connectionId,cached.baseline);return cached.message;}
    const next=new Map(players.map(player=>[player.saveId,{...player}]));
    const loot=JSON.stringify(groundLoot??[]);
    const baseline={id:++this.groupCounter,locationId:snapshot.locationId,players:next,loot};
    const finish=(message:MultiplayerServerMessage|null)=>{this.baselines.set(connectionId,baseline);this.groups.set(groupKey,{baseline,message});return message;};
    if(!previous||previous.locationId!==snapshot.locationId)return finish({type:'location_snapshot',payload:filtered});
    const added:MultiplayerPlayerPresence[]=[],changed:Array<Partial<MultiplayerPlayerPresence>&{saveId:string;unset?:Array<keyof MultiplayerPlayerPresence>}>=[];
    for(const player of players){
      const old=previous.players.get(player.saveId);
      if(!old){added.push(player);continue;}
      const patch:Partial<MultiplayerPlayerPresence>&{saveId:string;unset?:Array<keyof MultiplayerPlayerPresence>}={saveId:player.saveId};
      for(const key of new Set([...Object.keys(old),...Object.keys(player)]) as Set<keyof MultiplayerPlayerPresence>)if(player[key]!==old[key]){
        if(player[key]===undefined)(patch.unset??=[]).push(key);else Object.assign(patch,{[key]:player[key]});
      }
      if(Object.keys(patch).length>1)changed.push(patch);
    }
    const removed=[...previous.players.keys()].filter(id=>!next.has(id));
    if(!added.length&&!changed.length&&!removed.length&&previous.loot===loot)return finish(null);
    return finish({type:'presence_delta',payload:{locationId:snapshot.locationId,added,changed,removed,...(previous.loot!==loot?{groundLoot}: {})}});
  }
}
