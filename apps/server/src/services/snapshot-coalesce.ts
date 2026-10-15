/** Debounce window for movement-driven location snapshots. */
export const LOCATION_SNAPSHOT_COALESCE_MS = 120;

type TimeoutHandle = { unref?: () => void };

export interface SnapshotCoalesceTimers {
  setTimeout: (fn: () => void, ms: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
}

const defaultTimers: SnapshotCoalesceTimers = {
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/**
 * One pending flush per location key. Immediate broadcasts should `cancel`
 * first so join/leave/combat snapshots are not followed by a stale movement tick.
 */
export function createSnapshotCoalescer(
  flush: (locationId: string, saveId?: string) => void,
  opts?: { delayMs?: number; timers?: SnapshotCoalesceTimers },
): {
  schedule: (locationId: string, saveId?: string) => void;
  cancel: (locationId: string, saveId?: string) => void;
  pendingCount: () => number;
  cancelAll:()=>void;
} {
  const delayMs = opts?.delayMs ?? LOCATION_SNAPSHOT_COALESCE_MS;
  const timers = opts?.timers ?? defaultTimers;
  const pending = new Map<string, TimeoutHandle>();

  const keyOf = (locationId: string, saveId?: string): string =>
    saveId ? `${locationId}#${saveId}` : locationId;

  return {
    schedule(locationId: string, saveId?: string): void {
      const key = keyOf(locationId, saveId);
      if (pending.has(key)) return;
      const handle = timers.setTimeout(() => {
        pending.delete(key);
        flush(locationId, saveId);
      }, delayMs);
      pending.set(key, handle);
    },
    cancel(locationId: string, saveId?: string): void {
      const key = keyOf(locationId, saveId);
      const handle = pending.get(key);
      if (!handle) return;
      timers.clearTimeout(handle);
      pending.delete(key);
    },
    cancelAll():void {for(const handle of pending.values())timers.clearTimeout(handle);pending.clear();},
    pendingCount(): number {
      return pending.size;
    },
  };
}
