import type Phaser from 'phaser';
import { getHavenSchedule, subscribeHavenSchedule } from '../world-clock.js';
/** Clock messages refresh data; only phase changes start or stop decorative jobs. */
export function bindDecorSchedule(scene: Phaser.Scene, day: () => void, night: () => void, dispose?: () => void): void {
  let previous: boolean | undefined;
  const apply=()=>{const rest=Boolean(getHavenSchedule()?.restActive);if(rest===previous)return;previous=rest;if(rest)night();else day();};
  apply();
  const unsubscribe=subscribeHavenSchedule(apply);
  scene.events.once('shutdown',()=>{unsubscribe();dispose?.();});
}
