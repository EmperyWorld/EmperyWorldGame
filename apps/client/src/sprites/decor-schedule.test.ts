import { describe, expect, it, vi } from 'vitest';
const clock=vi.hoisted(()=>({rest:false,listener:undefined as (()=>void)|undefined}));
vi.mock('../world-clock.js',()=>({getHavenSchedule:()=>({restActive:clock.rest}),subscribeHavenSchedule:(listener:()=>void)=>{clock.listener=listener;return ()=>{clock.listener=undefined;};}}));
import { bindDecorSchedule } from './decor-schedule.js';
describe('decorative city job lifecycle',()=>{
  it('starts once per phase and disposes its subscription with the scene',()=>{
    clock.rest=false;let shutdown!:()=>void;
    const scene={events:{once:(_event:string,listener:()=>void)=>{shutdown=listener;}}} as unknown as Phaser.Scene;
    const day=vi.fn(),night=vi.fn(),dispose=vi.fn();
    bindDecorSchedule(scene,day,night,dispose);
    for(let i=0;i<100;i++)clock.listener?.();expect(day).toHaveBeenCalledTimes(1);
    clock.rest=true;for(let i=0;i<100;i++)clock.listener?.();expect(night).toHaveBeenCalledTimes(1);
    clock.rest=false;clock.listener?.();expect(day).toHaveBeenCalledTimes(2);
    shutdown();expect(dispose).toHaveBeenCalledOnce();expect(clock.listener).toBeUndefined();
  });
});
