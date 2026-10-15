import {
  combatBatchAttack,
  encounterFarmRespawn,
  encounterSyncQuests,
  mountCharge,
  startEncounter,
  type BatchAttackResult,
  type EncounterEntityDto,
} from '../../api.js';

export class NetworkManager {
  private saveId = '';
  private encounterId: string | null = null;
  private generation = 0;
  private abortCtrl: AbortController | null = null;
  private batchInFlight = false;

  setSaveId(id: string): void {
    if (id !== this.saveId) this.abort();
    this.saveId = id;
  }

  getEncounterId(): string | null {
    return this.encounterId;
  }

  getGeneration(): number {
    return this.generation;
  }

  abort(): void {
    this.abortCtrl?.abort();
    this.abortCtrl = null;
    this.batchInFlight = false;
    this.encounterId = null;
    this.generation += 1;
  }

  private signal(): AbortSignal {
    this.abortCtrl ??= new AbortController();
    return this.abortCtrl.signal;
  }

  async startEncounter(locationId: string): Promise<{
    encounterId: string;
    entities: EncounterEntityDto[];
  }> {
    this.abort();
    const generation = this.generation;
    const result = await startEncounter(this.saveId, locationId, this.signal());
    if (generation !== this.generation) throw new Error('Encounter start superseded');
    this.encounterId = result.encounterId;
    return result;
  }

  async batchAttack(input: {
    skillId?: string;
    moving: boolean;
    dashing: boolean;
    nearbyEnemyCount: number;
    targetEntityIds: string[];
    playerX?: number;
    playerY?: number;
  }): Promise<BatchAttackResult | null> {
    if (!this.encounterId || this.batchInFlight) return null;
    this.batchInFlight = true;
    const gen = this.generation;
    try {
      const result = await combatBatchAttack(
        this.saveId,
        {
          encounterId: this.encounterId,
          ...input,
        },
        this.signal(),
      );
      if (gen !== this.generation) return null;
      return result;
    } catch (err) {
      if (gen !== this.generation) return null;
      if (err instanceof Error && err.message === 'ENCOUNTER_STALE') {
        throw err;
      }
      throw err;
    } finally {
      if (gen === this.generation) this.batchInFlight = false;
    }
  }

  async mountCharge(input: {
    targetEntityIds: string[];
    playerX: number;
    playerY: number;
    nearbyEnemyCount: number;
  }): Promise<BatchAttackResult | null> {
    if (!this.encounterId || this.batchInFlight) return null;
    this.batchInFlight = true;
    const gen = this.generation;
    try {
      const result = await mountCharge(
        this.saveId,
        {
          encounterId: this.encounterId,
          ...input,
        },
        this.signal(),
      );
      if (gen !== this.generation) return null;
      return result;
    } catch {
      return null;
    } finally {
      if (gen === this.generation) this.batchInFlight = false;
    }
  }

  async farmRespawn(): Promise<EncounterEntityDto | null> {
    if (!this.encounterId) return null;
    const gen = this.generation;
    const encounterId = this.encounterId;
    try {
      const result = await encounterFarmRespawn(this.saveId, encounterId, this.signal());
      if (gen !== this.generation) return null;
      return result.spawned;
    } catch {
      return null;
    }
  }

  async syncQuests(): Promise<EncounterEntityDto[]> {
    if (!this.encounterId) return [];
    const gen = this.generation;
    const encounterId = this.encounterId;
    try {
      const result = await encounterSyncQuests(this.saveId, encounterId, this.signal());
      if (gen !== this.generation) return [];
      return result.entities;
    } catch {
      return [];
    }
  }
}
