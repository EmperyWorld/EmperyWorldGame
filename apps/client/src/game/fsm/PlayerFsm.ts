export type PlayerState = 'idle' | 'move' | 'attack' | 'dash' | 'charge' | 'hurt' | 'dead';

const TRANSITIONS: Record<PlayerState, PlayerState[]> = {
  idle: ['move', 'attack', 'dash', 'charge', 'hurt', 'dead'],
  move: ['idle', 'attack', 'dash', 'charge', 'hurt', 'dead'],
  attack: ['idle', 'move', 'hurt', 'dead'],
  dash: ['idle', 'move', 'hurt', 'dead'],
  charge: ['idle', 'move', 'hurt', 'dead'],
  hurt: ['idle', 'move', 'attack', 'dash', 'charge', 'dead'],
  dead: [],
};

export class PlayerFsm {
  state: PlayerState = 'idle';

  can(next: PlayerState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  tryEnter(next: PlayerState): boolean {
    if (!this.can(next)) return false;
    this.state = next;
    return true;
  }

  force(next: PlayerState): void {
    this.state = next;
  }

  reset(): void {
    this.state = 'idle';
  }

  get isBusy(): boolean {
    return this.state === 'attack' || this.state === 'dash' || this.state === 'charge' || this.state === 'hurt' || this.state === 'dead';
  }

  get isDead(): boolean {
    return this.state === 'dead';
  }
}
