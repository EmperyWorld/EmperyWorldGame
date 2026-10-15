import type { HavenStageActorSchedule } from '@empery/shared';
import { pointAlongWorldPath } from '@empery/shared';
import { CityRouteFollower, type CityPoint, type CityRouteWorld } from './city-route-follower.js';

/** Schedule availability and physical arrival are separate conditions. */
export class CityStageMotion {
  private follower: CityRouteFollower;
  asleep = false;
  atSeat = false;
  constructor(private world: CityRouteWorld, private seat: CityPoint, private home: CityPoint | (() => CityPoint | null)) {
    this.follower = new CityRouteFollower(world);
  }
  private homeEntrance(): CityPoint | null {
    const home = typeof this.home === 'function' ? this.home() : this.home;
    return home && Number.isFinite(home.x) && Number.isFinite(home.y) && this.world.walkable(home) ? home : null;
  }
  seed(entry: HavenStageActorSchedule, rest = false): void {
    const home = this.homeEntrance();
    this.asleep = entry.asleep || (!rest && !entry.atSeat && !home);
    this.atSeat = entry.atSeat && !this.asleep;
    this.follower.clear();
    if (this.asleep) { if (home) this.world.move(home); return; }
    const from = rest ? this.seat : home ?? this.seat, to = rest ? home : this.seat;
    let pose=entry.atSeat?this.seat:entry;
    if(!entry.asleep&&!entry.atSeat&&typeof entry.walkT==='number' && Number.isFinite(entry.walkT)){
      const route=to?this.world.route(from,to):[];
      pose=route.length?pointAlongWorldPath(route,entry.walkT):from;
    }
    if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !this.world.walkable(pose)) pose = from;
    if (pose && this.world.walkable(pose)) this.world.move(pose);
  }
  update(entry: HavenStageActorSchedule, rest: boolean, elapsedMs: number, speed: number): void {
    this.atSeat = false;
    if (this.asleep && (rest || entry.asleep)) return;
    const home = this.homeEntrance();
    if (this.asleep && !home) return;
    if (this.asleep && !entry.atSeat && (entry.walkT === 0 || (home && Math.hypot(entry.x - home.x, entry.y - home.y) < 0.05))) return;
    if (this.asleep && home) this.world.move(home);
    this.asleep = false;
    // Respect the server's staggered departure while it still samples the seat.
    if (rest && !entry.asleep && Math.hypot(entry.x - this.seat.x, entry.y - this.seat.y) < 0.05) return;
    const destination = rest || entry.asleep ? home : this.seat;
    if (!destination) { this.follower.clear(); return; }
    this.follower.setGoal(destination);
    const pose = this.world.position();
    const distance = Math.hypot(pose.x - destination.x, pose.y - destination.y);
    if ((rest || entry.asleep) && distance <= 16) {
      this.asleep = true;
      this.follower.clear();
      return;
    }
    if (entry.atSeat && !rest && distance <= 6) {
      this.atSeat = true;
      return;
    }
    this.follower.step(elapsedMs, speed);
  }
}
