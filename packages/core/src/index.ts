export type GameEventType =
  | 'game:init'
  | 'player:spawn'
  | 'player:move'
  | 'combat:hit'
  | 'combat:enemy_defeated'
  | 'item:equipped'
  | 'quest:started'
  | 'quest:branch_taken'
  | 'dialogue:choice'
  | 'media:requested'
  | 'media:ready'
  | 'save:loaded'
  | 'save:saved';

export interface GameEvent<TPayload = unknown> {
  type: GameEventType;
  payload: TPayload;
  timestamp: number;
}

export type EventHandler = (event: GameEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<GameEventType, Set<EventHandler>>();

  on(type: GameEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  async emit<TPayload>(type: GameEventType, payload: TPayload): Promise<void> {
    const event: GameEvent<TPayload> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    const handlers = this.handlers.get(type);
    if (!handlers) return;

    for (const handler of handlers) {
      await handler(event);
    }
  }
}

export interface ModuleContext {
  bus: EventBus;
  config: import('@empery/shared').ServicesConfig;
}

export interface GameModule {
  id: string;
  init(ctx: ModuleContext): Promise<void>;
  onEvent?(event: GameEvent): void | Promise<void>;
}

export class ModuleRegistry {
  private modules = new Map<string, GameModule>();

  register(module: GameModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): GameModule | undefined {
    return this.modules.get(id);
  }

  list(): GameModule[] {
    return [...this.modules.values()];
  }

  async initAll(ctx: ModuleContext): Promise<void> {
    for (const mod of this.modules.values()) {
      await mod.init(ctx);
    }
  }
}

export class GameKernel {
  readonly bus = new EventBus();
  readonly modules = new ModuleRegistry();

  constructor(public readonly config: import('@empery/shared').ServicesConfig) {}

  register(module: GameModule): this {
    this.modules.register(module);
    return this;
  }

  async start(): Promise<void> {
    const ctx: ModuleContext = { bus: this.bus, config: this.config };
    await this.modules.initAll(ctx);
    await this.bus.emit('game:init', { modules: this.modules.list().map((m) => m.id) });
  }
}
