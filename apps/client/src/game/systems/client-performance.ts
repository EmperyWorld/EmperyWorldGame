import { reportClientPerformance } from '../../api.js';
import type { RealtimeGateway } from './RealtimeGateway.js';
/** A fixed-size frame window; reporting never blocks rendering. */
export class ClientPerformance {
  private frames:number[]=[];
  private nextReport=0;
  private reporting=false;
  frame(now:number,delta:number,realtime:RealtimeGateway):void {
    if(!Number.isFinite(delta)||delta<=0)return;
    if(this.frames.length>=600)this.frames.shift();this.frames.push(delta);
    if(!this.nextReport){this.nextReport=now+10_000;return;}
    if(now<this.nextReport||this.reporting)return;
    this.nextReport=now+10_000;
    const sorted=[...this.frames].sort((a,b)=>a-b),sum=this.frames.reduce((a,b)=>a+b,0);
    this.frames=[];this.reporting=true;
    void reportClientPerformance({frameMeanMs:sum/sorted.length,frameP95Ms:sorted[Math.floor((sorted.length-1)*.95)]!,...realtime.performanceSnapshot()}).catch(()=>undefined).finally(()=>{this.reporting=false;});
  }
}
