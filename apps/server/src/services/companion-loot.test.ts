import { describe, expect, it, beforeEach } from 'vitest';
import type { CompanionState, PlayerSave } from '@empery/shared';
import { resetGroundLootForTests, spawnGroundLoot, type PickupDeps } from './ground-loot.js';
import { resetCompanionLootForTests, tickCompanionLoot } from './companion-loot.js';

function makeSave(id: string, companion?: CompanionState): PlayerSave {
  return {
    id,
    name: id,
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'test_loc',
    adena: 0,
    inventory: [],
    inventoryEnchants: [],
    equipment: {},
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    companion,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const puppy: CompanionState = {
  kind: 'puppy',
  variantId: 'haven_puppy',
  hunger: 80,
  fatigue: 10,
  obedience: 200,
  energy: 600,
  fetchSkill: 100,
  tamedAt: new Date().toISOString(),
};

describe('companion-loot', () => {
  beforeEach(() => {
    resetGroundLootForTests();
    resetCompanionLootForTests();
  });

  function deps(saves: Map<string, PlayerSave>): PickupDeps {
    return {
      partyIdForSave: () => null,
      partyMemberSaveIds: () => [],
      presenceForSave: (id) => {
        const s = saves.get(id);
        if (!s) return null;
        return { saveId: id, locationId: 'test_loc', x: 100, y: 100 };
      },
      loadSave: (id) => saves.get(id) ?? null,
      savePlayer: (save) => {
        saves.set(save.id, save);
        return save;
      },
      random: () => 0,
    };
  }

  it('starts fetch without picking up immediately', () => {
    const saves = new Map<string, PlayerSave>();
    const save = makeSave('hero', puppy);
    saves.set(save.id, save);
    const pile = spawnGroundLoot({
      locationId: 'test_loc',
      x: 120,
      y: 120,
      drops: [{ kind: 'adena', count: 50 }],
      owner: { kind: 'solo', saveId: 'hero' },
    });
    expect(pile).toBeTruthy();

    const start = tickCompanionLoot(
      save,
      { locationId: 'test_loc', x: 100, y: 100 },
      deps(saves),
      0,
    );
    expect(start.status).toBe('started');
    if (start.status !== 'started') return;
    expect(start.lootId).toBe(pile!.id);
    expect(start.arriveAt).toBeGreaterThan(0);

    const mid = tickCompanionLoot(
      save,
      { locationId: 'test_loc', x: 100, y: 100 },
      deps(saves),
      start.arriveAt - 50,
    );
    expect(mid.status).toBe('idle');
    expect(saves.get('hero')?.adena ?? 0).toBe(0);
  });

  it('picks up loot only after arriveAt', () => {
    const saves = new Map<string, PlayerSave>();
    const save = makeSave('hero', puppy);
    saves.set(save.id, save);
    spawnGroundLoot({
      locationId: 'test_loc',
      x: 120,
      y: 120,
      drops: [{ kind: 'adena', count: 50 }],
      owner: { kind: 'solo', saveId: 'hero' },
    });

    const start = tickCompanionLoot(
      save,
      { locationId: 'test_loc', x: 100, y: 100 },
      deps(saves),
      0,
    );
    expect(start.status).toBe('started');
    if (start.status !== 'started') return;

    const done = tickCompanionLoot(
      save,
      { locationId: 'test_loc', x: 100, y: 100 },
      deps(saves),
      start.arriveAt,
    );
    expect(done.status).toBe('completed');
    expect(saves.get('hero')?.adena).toBe(50);
  });
  it('skips an occluded nearest pile and fetches the next visible one',()=>{
    const save=makeSave('hero',puppy),saves=new Map([['hero',save]]),services=deps(saves);
    const blocked=spawnGroundLoot({locationId:'test_loc',x:110,y:100,drops:[{kind:'adena',count:10}],owner:{kind:'solo',saveId:'hero'},now:0})!;
    const visible=spawnGroundLoot({locationId:'test_loc',x:140,y:100,drops:[{kind:'adena',count:20}],owner:{kind:'solo',saveId:'hero'},now:0})!;
    services.canPickupAt=(_id,x)=>x!==blocked.x;
    const start=tickCompanionLoot(save,{locationId:'test_loc',x:100,y:100},services,1);
    expect(start.status).toBe('started');if(start.status==='started')expect(start.lootId).toBe(visible.id);
  });
  it('rechecks visibility at arrival without consuming an occluded pile',()=>{
    const save=makeSave('hero',puppy),saves=new Map([['hero',save]]),services=deps(saves);
    spawnGroundLoot({locationId:'test_loc',x:140,y:100,drops:[{kind:'adena',count:20}],owner:{kind:'solo',saveId:'hero'},now:0});
    services.canPickupAt=()=>true;
    const start=tickCompanionLoot(save,{locationId:'test_loc',x:100,y:100},services,1);expect(start.status).toBe('started');if(start.status!=='started')return;
    services.canPickupAt=()=>false;
    expect(tickCompanionLoot(save,{locationId:'test_loc',x:100,y:100},services,start.arriveAt).status).toBe('idle');expect(saves.get('hero')!.adena).toBe(0);
    services.canPickupAt=()=>true;
    const retry=tickCompanionLoot(save,{locationId:'test_loc',x:100,y:100},services,start.arriveAt+100000);expect(retry.status).toBe('started');
  });

});
