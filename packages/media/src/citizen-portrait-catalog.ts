import { ALL_CITIZEN_DEFS, residentAppearance, residentPortraitId, citizenPortraitDescription } from '@empery/shared';
import type { MediaAssetSpec } from './catalog.js';
/** The same permanent appearance controls both the map sprite and dialogue portrait. */
export function citizenPortraitCatalog(): MediaAssetSpec[] {
  return ALL_CITIZEN_DEFS.map((_def,slot)=>{
    const appearance=residentAppearance(slot);
    return {id:residentPortraitId(slot),profile:'portrait_npc',label:`Resident ${slot}`,
      params:{npc_name:citizenPortraitDescription(appearance),race:appearance.race,mood:'natural relaxed expression',seed:String(appearance.seed%2000000000)}};
  });
}
