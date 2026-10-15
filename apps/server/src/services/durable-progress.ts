import type { CommandReceipt } from './persistence/character-repository.js';
import type { SaveManager } from '@empery/save';
import type { PlayerSave } from '@empery/shared';
import type { RuntimeMetrics } from './runtime-metrics.js';

export class ProgressUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() { super('Progress storage unavailable; restart after restoring PostgreSQL'); }
}

/** Each acknowledgement waits for its ordered, atomic database commit. */
export class DurableProgress {
  private tail: Promise<void> = Promise.resolve();
  private failure: unknown;
  private queued=0;
  constructor(private saves: SaveManager, private commit: (changes:Array<{id:string;save:PlayerSave|null}>,receipt?:CommandReceipt)=>Promise<void>, private metrics: RuntimeMetrics) {}
  assertHealthy(): void { if (this.failure) throw new ProgressUnavailableError(); }
  invalidate(error: unknown): void { this.failure = error || new Error('Primary owner lost'); this.metrics.count('progress.failures');this.metrics.gauge('progress.available',0); }
  healthy(): boolean { return !this.failure; }
  flush(receipt?:CommandReceipt): Promise<void> {
    this.assertHealthy();
    const changes = this.saves.takePending();
    if (!changes.length&&!receipt) return this.tail;
    this.metrics.gauge('progress.available',1);
    this.metrics.gauge('progress.queueDepth',this.queued+1);
    if(++this.queued>128){this.invalidate(new Error('Progress queue exceeded its bound'));return Promise.reject(new ProgressUnavailableError());}
    this.metrics.observe('progress.queuedBatches',this.queued);
    this.tail = this.tail.then(async () => {
      this.assertHealthy();
      const start = performance.now();
      try { await this.commit(changes,receipt); this.metrics.count('progress.commits'); this.metrics.count('progress.characters',changes.length); }
      catch (error) { this.invalidate(error); throw new ProgressUnavailableError(); }
      finally { this.queued--;this.metrics.gauge('progress.queueDepth',this.queued);this.metrics.observe('progress.commitMs',performance.now()-start); }
    });
    // Retain the rejection for all waiters while avoiding unhandled timer rejections.
    void this.tail.catch(()=>undefined);
    return this.tail;
  }
}
