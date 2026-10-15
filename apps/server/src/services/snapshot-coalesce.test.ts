import { describe, expect, it } from 'vitest';
import { createSnapshotCoalescer } from './snapshot-coalesce.js';

function fakeTimers() {
  const queued: Array<{ fn: () => void; ms: number }> = [];
  return {
    queued,
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const handle = { fn, ms };
        queued.push(handle);
        return handle;
      },
      clearTimeout: (handle: { fn: () => void; ms: number }) => {
        const i = queued.indexOf(handle);
        if (i >= 0) queued.splice(i, 1);
      },
    },
    flushAll(): void {
      const batch = queued.splice(0);
      for (const item of batch) item.fn();
    },
  };
}

describe('createSnapshotCoalescer', () => {
  it('coalesces repeated schedule calls into one flush', () => {
    const flushed: string[] = [];
    const clock = fakeTimers();
    const coalescer = createSnapshotCoalescer((locationId) => flushed.push(locationId), {
      delayMs: 120,
      timers: clock.timers,
    });

    coalescer.schedule('adena_fields');
    coalescer.schedule('adena_fields');
    coalescer.schedule('adena_fields');
    expect(clock.queued).toHaveLength(1);
    expect(flushed).toEqual([]);

    clock.flushAll();
    expect(flushed).toEqual(['adena_fields']);
    expect(coalescer.pendingCount()).toBe(0);
  });

  it('keeps independent locations on separate timers', () => {
    const flushed: string[] = [];
    const clock = fakeTimers();
    const coalescer = createSnapshotCoalescer((locationId) => flushed.push(locationId), {
      timers: clock.timers,
    });

    coalescer.schedule('adena_fields');
    coalescer.schedule('starter_grove');
    expect(clock.queued).toHaveLength(2);
    clock.flushAll();
    expect(flushed.sort()).toEqual(['adena_fields', 'starter_grove']);
  });

  it('drops a pending flush when cancelled for an immediate snapshot', () => {
    const flushed: string[] = [];
    const clock = fakeTimers();
    const coalescer = createSnapshotCoalescer((locationId) => flushed.push(locationId), {
      timers: clock.timers,
    });

    coalescer.schedule('adena_fields');
    coalescer.cancel('adena_fields');
    clock.flushAll();
    expect(flushed).toEqual([]);
    expect(coalescer.pendingCount()).toBe(0);
  });
});
