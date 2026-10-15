import type { PlayerSave } from '../../api.js';
import type { LocationConfig } from '../scenes/location-types.js';
import type { EntityManager } from './EntityManager.js';
import type { NetworkManager } from './NetworkManager.js';
import type { QuestPresenter } from './QuestPresenter.js';

export interface EncounterBootstrapCtx {
  location: LocationConfig;
  save: PlayerSave;
  sceneGeneration: number;
  network: Pick<NetworkManager, 'getGeneration' | 'startEncounter'>;
  entities: Pick<EntityManager, 'recycleAll' | 'spawnFromEncounter'>;
  quests: Pick<QuestPresenter, 'refreshFromSave'>;
}

/** Start/resume encounter for the current location; no-ops if generation changed mid-await. */
export async function bootstrapEncounter(
  ctx: EncounterBootstrapCtx,
  getSceneGeneration: () => number,
): Promise<boolean> {
  const gen = ctx.sceneGeneration;
  let netGen = ctx.network.getGeneration();
  if (ctx.location.safeZone) {
    ctx.entities.recycleAll();
    ctx.quests.refreshFromSave(ctx.location, ctx.save);
    return true;
  }
  try {
    const pending = ctx.network.startEncounter(ctx.location.id);
    netGen = ctx.network.getGeneration();
    const result = await pending;
    if (gen !== getSceneGeneration() || netGen !== ctx.network.getGeneration()) return true;
    ctx.entities.recycleAll();
    ctx.entities.spawnFromEncounter(result.entities);
    ctx.quests.refreshFromSave(ctx.location, ctx.save);
    return true;
  } catch {
    if (gen !== getSceneGeneration() || netGen !== ctx.network.getGeneration()) return true;
    ctx.quests.refreshFromSave(ctx.location, ctx.save);
    return false;
  }
}
