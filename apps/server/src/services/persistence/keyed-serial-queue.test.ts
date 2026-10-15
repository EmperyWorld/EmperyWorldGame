import { describe, expect, it, vi } from 'vitest';
import { KeyedSerialTaskQueue } from './keyed-serial-queue.js';

describe('KeyedSerialTaskQueue', () => {
  it('preserves operation order for the same save', async () => {
    const queue = new KeyedSerialTaskQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue('save-1', async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = queue.enqueue('save-1', async () => {
      events.push('second');
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues after a failed operation and flushes pending work', async () => {
    const queue = new KeyedSerialTaskQueue();
    const onError = vi.fn();
    const events: string[] = [];

    void queue.enqueue(
      'save-1',
      async () => {
        throw new Error('mirror failed');
      },
      onError,
    );
    void queue.enqueue('save-1', async () => {
      events.push('recovered');
    });

    await queue.flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(events).toEqual(['recovered']);
  });
});
