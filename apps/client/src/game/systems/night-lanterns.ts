type Point = { x: number; y: number };
type View = { x: number; y: number; width: number; height: number };

/** Live actor positions only: schedule coordinates can lead or lag visual movement. */
export function selectNightLanterns(
  npcs: ReadonlyArray<{ id: string; phase: string }>,
  actorPosition: (id: string) => Point | null,
  guards: readonly Point[],
  view: View,
  limit = 14,
): Point[] {
  const points: Point[] = [];
  for (const npc of npcs) {
    if (npc.phase !== 'walking_home' && npc.phase !== 'walking_to_post' && npc.phase !== 'patrol') continue;
    const point = actorPosition(npc.id);
    if (point) points.push(point);
  }
  points.push(...guards);
  const cx=view.x+view.width/2,cy=view.y+view.height/2,pad=96;
  const seen=new Set<string>();
  return points.filter(p=>{
    if (!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<view.x-pad||p.x>view.x+view.width+pad||p.y<view.y-pad||p.y>view.y+view.height+pad) return false;
    const key=`${Math.round(p.x/8)}:${Math.round(p.y/8)}`;
    if(seen.has(key))return false;seen.add(key);return true;
  }).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy)).slice(0,Math.max(0,Math.min(14,Math.floor(limit))));
}
