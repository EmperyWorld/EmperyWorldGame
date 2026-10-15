/** District dialogue id + [E] label from a citizen waypoint. Phaser-free. */

export interface CitizenDistrictInput {
  look: string;
  tiles: ReadonlyArray<readonly [number, number]>;
  nightPatrolOnly?: boolean;
  courtyardRole?: 'child' | 'parent';
}

export function resolveCitizenDistrictNpcId(
  def: CitizenDistrictInput,
  _index?: number,
): { npcId: string; label: string } {
  const t0 = def.tiles[0];
  if (!t0) return { npcId: 'haven_citizen_plaza', label: 'Горожанин' };
  const [tx, ty] = t0;
  const district = districtFromTile(tx, ty, def.look);
  if (def.courtyardRole) return { npcId: 'haven_citizen_plaza', label: def.courtyardRole === 'child' ? 'Ребёнок' : 'Родитель' };

  if (def.nightPatrolOnly) {
    if (def.look === 'captain' || def.look === 'radio') {
      return { npcId: 'haven_citizen_guard', label: 'Ночной страж' };
    }
    return { npcId: district.npcId, label: nightDistrictLabel(district.npcId, tx, ty) };
  }

  return district;
}

function districtFromTile(
  tx: number,
  ty: number,
  look: string,
): { npcId: string; label: string } {
  if (tx >= 58 && tx <= 70 && ty >= 31 && ty <= 41) {
    return { npcId: 'haven_citizen_guard', label: 'Периметр HQ' };
  }
  if (tx < 24 && ty < 14) {
    return { npcId: 'haven_citizen_guard', label: 'Гарнизон' };
  }
  if (tx < 22 && ty > 13 && ty < 26) {
    return { npcId: 'haven_citizen_market', label: 'Торговец' };
  }
  if (tx < 22 && ty >= 30) {
    return { npcId: 'haven_citizen_craft', label: 'Подмастерье' };
  }
  if (tx > 45 && tx < 56 && ty < 16) {
    return { npcId: 'haven_citizen_cathedral', label: 'Паломник' };
  }
  if (tx >= 43 && tx <= 47 && ty >= 16 && ty <= 18) {
    return { npcId: 'haven_citizen_cathedral', label: 'У лекаря' };
  }
  if (tx > 52 && tx < 65 && ty >= 16 && ty <= 26) {
    return { npcId: 'haven_citizen_tavern', label: 'Горожанин' };
  }
  if (tx > 55 && ty > 42) {
    return { npcId: 'haven_citizen_harbor', label: 'Моряк' };
  }
  if (look === 'captain') {
    return { npcId: 'haven_citizen_guard', label: 'Стражник' };
  }
  return { npcId: 'haven_citizen_plaza', label: 'Горожанин' };
}

function nightDistrictLabel(npcId: string, tx: number, ty: number): string {
  if (npcId === 'haven_citizen_plaza') return 'Ночной ряд';
  if (npcId === 'haven_citizen_market') return 'Ночной торговец';
  if (npcId === 'haven_citizen_cathedral') {
    if (tx >= 43 && tx <= 47 && ty >= 16 && ty <= 18) return 'У Серы';
    return 'Всенощная';
  }
  if (npcId === 'haven_citizen_harbor') return 'Ночной причал';
  if (npcId === 'haven_citizen_tavern') return 'Завсегдатай';
  return 'Городской дозор';
}
