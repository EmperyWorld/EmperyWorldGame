interface VisualTarget {
  displayOriginX: number; displayOriginY: number; scaleX: number; scaleY: number;
  setDisplayOrigin(x: number, y: number): unknown;
}
/** Cosmetic channels never alter the actor's world anchor or collision pose. */
export class ActorVisualOffset {
  private channels = new Map<string, { x: number; y: number }>();
  private origin: { x: number; y: number };
  constructor(private target: VisualTarget) { this.origin = { x: target.displayOriginX, y: target.displayOriginY }; }
  set(channel: string, x: number, y: number): void { this.channels.set(channel, { x, y }); this.apply(); }
  clear(): void { this.channels.clear(); this.apply(); }
  private apply(): void {
    let x=0,y=0;for(const offset of this.channels.values()){x+=offset.x;y+=offset.y;}
    this.target.setDisplayOrigin(this.origin.x-x/(Math.abs(this.target.scaleX)||1),this.origin.y-y/(Math.abs(this.target.scaleY)||1));
  }
}
