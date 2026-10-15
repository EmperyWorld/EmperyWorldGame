import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

/** Bounded aggregates: no player IDs, tokens or raw events are retained. */
export class RuntimeMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string,number>();
  gauge(name:string,value:number):void {this.gauges.set(name,value);}
  private samples = new Map<string, number[]>();
  private loop = monitorEventLoopDelay({ resolution: 20 });
  private started = performance.now();
  constructor() { this.loop.enable(); }
  count(name: string, value = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + value); }
  observe(name: string, value: number): void {
    if (!Number.isFinite(value)) return;
    const samples = this.samples.get(name) ?? [];
    if (samples.length >= 1024) samples.shift();
    samples.push(value); this.samples.set(name, samples);
  }
  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try { return fn(); } finally { this.observe(name, performance.now() - start); }
  }
  snapshot() {
    const timings = Object.fromEntries([...this.samples].map(([name, samples]) => {
      const sorted = [...samples].sort((a,b)=>a-b);
      return [name, { samples: samples.length, mean: samples.reduce((a,b)=>a+b,0)/samples.length, p95: sorted[Math.floor((sorted.length-1)*0.95)], max: sorted.at(-1) }];
    }));
    return { uptimeMs: performance.now()-this.started, counters:Object.fromEntries(this.counters), gauges:Object.fromEntries(this.gauges), timings,
      eventLoop: { p95Ms:this.loop.percentile(95)/1e6, maxMs:this.loop.max/1e6 }, memory:process.memoryUsage() };
  }
  reset():void {this.counters.clear();this.samples.clear();this.loop.reset();this.started=performance.now();}
  close(): void { this.loop.disable(); }
}
