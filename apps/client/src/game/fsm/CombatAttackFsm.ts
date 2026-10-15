export type CombatAttackPhase = 'idle' | 'windup' | 'resolve' | 'recovery';

const NEXT: Record<CombatAttackPhase, CombatAttackPhase[]> = {
  idle: ['windup'],
  windup: ['resolve', 'idle'],
  resolve: ['recovery', 'idle'],
  recovery: ['idle'],
};

/** Фазы HTTP-атаки: idle → windup → resolve → recovery → idle. */
export class CombatAttackFsm {
  phase: CombatAttackPhase = 'idle';

  get isBusy(): boolean {
    return this.phase !== 'idle';
  }

  tryBegin(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'windup';
    return true;
  }

  tryEnter(next: CombatAttackPhase): boolean {
    if (!NEXT[this.phase].includes(next)) return false;
    this.phase = next;
    return true;
  }

  /** После resolve — recovery, затем idle (нормальное завершение удара). */
  complete(): void {
    if (this.phase === 'resolve') this.phase = 'recovery';
    if (this.phase === 'recovery' || this.phase === 'windup') this.phase = 'idle';
    if (this.phase !== 'idle') this.phase = 'idle';
  }

  force(next: CombatAttackPhase): void {
    this.phase = next;
  }

  reset(): void {
    this.phase = 'idle';
  }
}
