import { describe, it, expect, vi } from 'vitest';
import { WorldEventBus, type PlayerActionEvent } from './events.js';

describe('WorldEventBus', () => {
  it('should publish events to subscribed listeners', async () => {
    const bus = new WorldEventBus();
    const callback = vi.fn();
    bus.subscribe('PLAYER_ACTION', callback);

    const event: PlayerActionEvent = { 
      type: 'PLAYER_ACTION', 
      action: 'CRAFT',
      playerId: 'player1',
      locationId: 'haven',
      payload: { itemId: 'leather' } 
    };

    await bus.publish(event);

    expect(callback).toHaveBeenCalledWith(event);
  });
});
