/** Serializes asynchronous work per key while allowing different keys in parallel. */
export class KeyedSerialTaskQueue {
  private readonly tails = new Map<string, Promise<void>>();

  isPending(key: string): boolean { return this.tails.has(key); }

  enqueue(
    key: string,
    operation: () => Promise<void>,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let next!: Promise<void>;
    next = previous
      .catch(() => undefined)
      .then(operation)
      .catch((error: unknown) => {
        onError?.(error);
      })
      .finally(() => {
        if (this.tails.get(key) === next) this.tails.delete(key);
      });
    this.tails.set(key, next);
    return next;
  }

  async flush(): Promise<void> {
    while (this.tails.size > 0) {
      await Promise.allSettled(this.tails.values());
    }
  }
}
