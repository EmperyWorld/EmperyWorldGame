export type PlayerActionEvent = {
  type: 'PLAYER_ACTION';
  action: 'CRAFT' | 'COMBAT' | 'DIALOGUE' | 'MOVE' | 'REST' | 'TRADE';
  playerId: string;
  locationId: string;
  payload: Record<string, unknown>;
  timestamp?: number;
};

export type EnvironmentChangeEvent = {
  type: 'ENVIRONMENT_CHANGE';
  change: 'TIME_TICK' | 'WEATHER';
  locationId: string;
  payload: Record<string, unknown>;
};

export type NpcInteractionEvent = {
  type: 'NPC_INTERACTION';
  interaction: 'SCHEDULE_CHANGE' | 'SHOP_OPEN';
  npcId: string;
  locationId: string;
  payload: Record<string, unknown>;
};

export type WorldEvent = PlayerActionEvent | EnvironmentChangeEvent | NpcInteractionEvent;

export type WorldEventByType = {
  PLAYER_ACTION: PlayerActionEvent;
  ENVIRONMENT_CHANGE: EnvironmentChangeEvent;
  NPC_INTERACTION: NpcInteractionEvent;
};

export type EventCallback<T extends WorldEvent = WorldEvent> = (event: T) => void | Promise<void>;

export class WorldEventBus {
  private listeners: Map<WorldEvent['type'], EventCallback[]> = new Map();

  subscribe<K extends keyof WorldEventByType>(
    type: K,
    callback: EventCallback<WorldEventByType[K]>,
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback as EventCallback);
  }

  unsubscribe<K extends keyof WorldEventByType>(
    type: K,
    callback: EventCallback<WorldEventByType[K]>,
  ): void {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      this.listeners.set(
        type,
        callbacks.filter((cb) => cb !== callback),
      );
    }
  }

  async publish(event: WorldEvent) {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      await Promise.all(callbacks.map((cb) => cb(event)));
    }
  }
}
