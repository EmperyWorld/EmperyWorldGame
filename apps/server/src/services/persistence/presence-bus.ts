/** Cross-node presence fan-out via Redis pub/sub. */

import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type { MultiplayerPlayerPresence } from '@empery/shared';

export const PRESENCE_EVENTS_CHANNEL = 'presence.events';

export type PresenceBusEvent =
  | {
      v: 1;
      nodeId: string;
      op: 'upsert';
      channelKey: string;
      presence: MultiplayerPlayerPresence;
    }
  | {
      v: 1;
      nodeId: string;
      op: 'remove';
      channelKey: string;
      saveId: string;
    };

export function createNodeId(): string {
  return process.env.EMPERY_NODE_ID?.trim() || `node-${randomUUID().slice(0, 8)}`;
}

export class PresenceEventBus {
  readonly nodeId: string;
  private sub: Redis | null = null;
  private started = false;

  constructor(
    private readonly redis: Redis,
    nodeId: string,
    private readonly onEvent: (event: PresenceBusEvent) => void,
  ) {
    this.nodeId = nodeId;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.sub = this.redis.duplicate();
    await this.sub.connect();
    await this.sub.subscribe(PRESENCE_EVENTS_CHANNEL);
    this.sub.on('message', (channel, raw) => {
      if (channel !== PRESENCE_EVENTS_CHANNEL) return;
      try {
        const event = JSON.parse(raw) as PresenceBusEvent;
        if (!event || event.v !== 1 || event.nodeId === this.nodeId) return;
        this.onEvent(event);
      } catch {
        /* ignore bad payload */
      }
    });
    this.started = true;
  }

  publish(
    event:
      | { op: 'upsert'; channelKey: string; presence: MultiplayerPlayerPresence }
      | { op: 'remove'; channelKey: string; saveId: string },
  ): void {
    const full = { v: 1 as const, nodeId: this.nodeId, ...event } satisfies PresenceBusEvent;
    void this.redis.publish(PRESENCE_EVENTS_CHANNEL, JSON.stringify(full)).catch(() => {
      /* best-effort */
    });
  }

  async stop(): Promise<void> {
    if (!this.sub) return;
    try {
      await this.sub.unsubscribe(PRESENCE_EVENTS_CHANNEL);
      await this.sub.quit();
    } catch {
      this.sub.disconnect();
    }
    this.sub = null;
    this.started = false;
  }
}
