export type EnemyState = 'idle' | 'chase' | 'hurt' | 'dying' | 'dead';

const TRANSITIONS: Record<EnemyState, EnemyState[]> = {
  idle: ['chase', 'hurt', 'dying'],
  chase: ['idle', 'hurt', 'dying'],
  hurt: ['idle', 'chase', 'dying'],
  dying: ['dead'],
  dead: [],
};

export class EnemyFsm {
  state: EnemyState = 'idle';

  can(next: EnemyState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  tryEnter(next: EnemyState): boolean {
    if (!this.can(next)) return false;
    this.state = next;
    return true;
  }

  force(next: EnemyState): void {
    this.state = next;
  }

  reset(): void {
    this.state = 'idle';
  }

  get isDying(): boolean {
    return this.state === 'dying' || this.state === 'dead';
  }
}
