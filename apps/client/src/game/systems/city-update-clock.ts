/** Actor-local elapsed time; cadence never depends on display frame numbers. */
export class CityUpdateClock {
 private actors=new WeakMap<object,number>();
 take(actor:object,deltaMs:number,intervalMs:number,maxElapsedMs=500):number|null {
  if(!Number.isFinite(deltaMs)||deltaMs<0)return null;
  const accumulated=Math.min(maxElapsedMs,(this.actors.get(actor)??0)+deltaMs);
  if(accumulated+1e-6<intervalMs){this.actors.set(actor,accumulated);return null;}
  this.actors.set(actor,0);return accumulated;
 }
}

/** A small valid step at high refresh rates is progress, not a blocked actor. */
export function advanceStallTimer(previousMs:number,distance:number,deltaMs:number):number {
 return distance>0.001?0:previousMs+Math.max(0,deltaMs);
}
