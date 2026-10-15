import { WORLD_STATIC_PROPS } from '@empery/shared/world-props';
import Phaser from 'phaser';
import {
  EMPERY_HQ_LOBBY,
  EMPERY_HQ_LOBBY_PROPS,
  HAVEN_RESIDENTIAL_COURT,
  HAVEN_STAGE_LAYOUT,
  HAVEN_GARRISON_LAYOUT,
  HAVEN_SHIP_DISPLAY_SCALE,
  HAVEN_WATER_BASIN,
  HAVEN_WATER_EAST_BAY,
  havenOpenWaterRowSpans,
  isHavenOpenWaterTile,
  isHavenShipHullAsset,
} from '@empery/shared';
import type { LocationConfig } from '../scenes/GameScene.js';
import { placeProp } from './texture-loader.js';
import { placeWorldProp } from './place-world-prop.js';
import { addHavenCitizens, PLAYER_XY_KEY } from './haven-citizens.js';
import { atmosphereFor } from './vfx.js';
import { HAVEN_CITY_BANNER, HAVEN_CITY_PROPS } from './haven-city-data.js';
import { EMPERY_HQ_PROPS } from './empery-hq-data.js';
import {
  HAVEN_DISTRICTS,
  HAVEN_NPC_BUILDINGS,
  havenCityPropReplacedByNpcLandmark,
} from './haven-npc-buildings.js';
import { HAVEN_TILE_WASHES } from './haven-district-washes.js';
import { loopDecorCounter } from './decor-fx.js';
import { paintHavenDockSurfaces } from './haven-dock-surface.js';
import { bindHavenHarborLife } from './haven-harbor-life.js';
import {
  bakeStaticGraphics,
  spawnGpuBirds,
  spawnGpuDriftDots,
  spawnGpuFlags,
  spawnGpuGlowDots,
  spawnGpuPuffs,
} from './gpu-decor.js';
import {
  bakeRectFromBox,
  bakeRectFromCircle,
  bakeRectFromEllipse,
  unionBakeRect,
} from './graphics-bake-limits.js';
import { placeHavenWindmill } from './haven-windmill.js';
import { placeHavenStage } from './haven-stage.js';
import { placeHavenGarrison } from './haven-garrison.js';
import { placeHavenCrafts } from './haven-crafts.js';
import { placeHavenResidentialCourt, placeHavenResidentialLife, placeHavenTenementLife } from './haven-residential.js';
import { placeHavenNightLife } from './haven-night-life.js';
import { Depth } from '../game/constants/depth.js';
import { WALKABLE_TILE_GIDS } from '../game/systems/world-geodata.js';
import type { GroundLayer } from '../game/systems/ground-layer.js';
import { getGraphicsProfile, placeHudInScreen } from '../game/systems/graphics-quality.js';
import { getHavenSchedule, getWorldGameHour, subscribeHavenSchedule } from '../world-clock.js';
import { bindPlayerToPropColliders, clearPropColliders, nudgePointFromPropColliders, addPropFootprint } from './prop-colliders.js';
import { bindHavenCityGates, registerHavenCityGate } from './haven-city-gates.js';
import { bindHavenHarborShips, type HarborShipHandle } from './haven-harbor-ships.js';
import { addStationVisuals } from './station-visuals.js';

export { bindPlayerToPropColliders, clearPropColliders, nudgePointFromPropColliders };
function drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, crown: number, trunk = 0x5a4030): void {
  g.fillStyle(trunk, 1);
  g.fillRect(x - 4, y, 8, 14);
  g.fillStyle(crown, 0.92);
  g.fillCircle(x, y - 6, 16);
  g.fillCircle(x - 10, y + 2, 12);
  g.fillCircle(x + 10, y + 2, 12);
}

function drawRock(g: Phaser.GameObjects.Graphics, x: number, y: number, color = 0x666655): void {
  g.fillStyle(color, 0.9);
  g.fillEllipse(x, y, 28, 18);
  g.fillStyle(0x888877, 0.5);
  g.fillEllipse(x - 4, y - 4, 12, 8);
}

function drawSignpost(scene: Phaser.Scene, x: number, y: number, color: string): void {
  const post = scene.add.graphics().setDepth(7);
  post.fillStyle(0x5a4030, 1);
  post.fillRect(x - 3, y - 8, 6, 36);
  post.fillStyle(0x6a5040, 1);
  post.fillRect(x - 18, y - 4, 36, 12);
  post.lineStyle(1, Phaser.Display.Color.HexStringToColor(color).color, 0.6);
  post.strokeRect(x - 18, y - 4, 36, 12);
}

function drawBanner(scene: Phaser.Scene, x: number, y: number, text: string, color: string, isPortal = false, modern = false): void {
  if (!modern) drawSignpost(scene, x, y + 24, color);
  scene.add
    .text(x, y, text, {
      color,
      fontSize: '15px',
      fontStyle: 'bold',
      backgroundColor: isPortal ? '#1a3020cc' : '#00000088',
      padding: { x: 10, y: 4 },
    })
    .setOrigin(0.5, 0)
    .setDepth(12);

  if (isPortal) {
    const glow = scene.add.rectangle(x, y + 52, 70, 28, 0x44aa66, 0.18).setDepth(6);
    scene.tweens.add({
      targets: glow,
      alpha: 0.08,
      yoyo: true,
      duration: 900,
      repeat: -1,
    });
  }
}

export function addLocationDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  if(location.id==='empery_haven')addStationVisuals(scene,location);
  switch (location.id) {
    case 'starter_grove':
      addGroveDecorations(scene, location);
      break;
    case 'empery_haven':
      addHavenDecorations(scene, location);
      break;
    case 'empery_hq_lobby':
      addEmperyHqLobbyDecorations(scene);
      break;
    case 'empery_hq':
      addEmperyHqDecorations(scene, location);
      break;
    case 'haven_apartment':
      addApartmentDecorations(scene, location);
      break;
    case 'silverwood':
      addSilverwoodDecorations(scene, location);
      break;
    case 'ash_highlands':
      addAshDecorations(scene, location);
      break;
    case 'adena_fields':
      addFieldsDecorations(scene, location);
      break;
    case 'shadow_depths':
      addDepthsDecorations(scene, location);
      break;
    case 'suburban_park':
      addParkDecorations(scene, location);
      break;
    case 'abandoned_yard':
      addYardDecorations(scene, location);
      break;
    case 'intersection_district':
      addDistrictDecorations(scene, location);
      break;
    case 'signal_block':
      addSignalDecorations(scene, location);
      break;
    case 'relay_spire':
      addRelayDecorations(scene, location);
      break;
    case 'static_core':
      addCoreDecorations(scene, location);
      break;
    case 'chaos_sector':
      addChaosDecorations(scene, location);
      break;
    case 'fracture_ridge':
      addFractureDecorations(scene, location);
      break;
    case 'void_scar':
      addVoidScarDecorations(scene, location);
      break;
    case 'collapse_fringe':
      addCollapseDecorations(scene, location);
      break;
    case 'citadel_approach':
      addApproachDecorations(scene, location);
      break;
    case 'singularity_citadel':
      addCitadelDecorations(scene, location);
      break;
    case 'gods_rift':
      addGodsRiftDecorations(scene, location);
      break;
    case 'pantheon_ascent':
      addPantheonDecorations(scene, location);
      break;
    case 'godfall_throne':
      addGodfallDecorations(scene, location);
      break;
  }

  // Survival stations ([E]) must have a world prop — not just an invisible hotspot.
  if(location.id!=='empery_haven')addStationVisuals(scene, location);

  for (const zone of location.zones ?? []) {
    // В Гавани декоративные таблички зданий дублируют подписи NPC [E].
    if (location.id === 'empery_haven' && !zone.travelTo) continue;
    let label = zone.label;
    if (zone.travelTo) {
      const save = scene.registry.get('bootSave') as { questFlags?: Record<string, unknown> } | undefined;
      const lockedHq =
        zone.travelTo === 'empery_hq' && !save?.questFlags?.quest_empery_hq_access;
      label = lockedHq ? `${zone.label}  · закрыто` : `${zone.label}  · [R]`;
    }
    drawBanner(
      scene,
      zone.x,
      zone.y,
      label,
      zone.color ?? atmosphereFor(location.id).markerColor,
      Boolean(zone.travelTo),
      location.id === 'empery_hq' || location.id === 'empery_hq_lobby',
    );
  }

  if (location.subtitle) {
    const atm = atmosphereFor(location.id);
    const sub = scene.add
      .text(scene.scale.width / 2, 68, location.subtitle, {
        color: atm.markerColor,
        fontSize: '13px',
        fontStyle: 'italic',
        backgroundColor: '#00000066',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setDepth(12)
      .setScrollFactor(0);
    placeHudInScreen(sub, scene.scale.width / 2, 68, scene.cameras.main.zoom, scene.scale.width, scene.scale.height);
  }
}

function addEmperyHqDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  // Cool cyan tech wash — contrast with warm medieval Haven.
  const wash = scene.add.rectangle(
    scene.scale.width / 2,
    scene.scale.height / 2,
    scene.scale.width * 2,
    scene.scale.height * 2,
    0x0a1824,
    0.22,
  );
  wash.setScrollFactor(0).setDepth(1);

  const floors = scene.add.graphics().setDepth(2);
  // Zone floor washes — match axial campus layout (40×32 @ 64px)
  const paintZone = (x: number, y: number, w: number, h: number, color: number, a: number) => {
    floors.fillStyle(color, a);
    floors.fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
  };
  paintZone(1312, 544, 360, 300, 0x1a4058, 0.28); // main
  paintZone(672, 544, 320, 280, 0x184848, 0.26); // labs W
  paintZone(1952, 544, 340, 280, 0x182848, 0.28); // servers E
    paintZone(1312, 1792, 360, 180, 0x203040, 0.2); // gate approach

  for (const [id, x, y, size] of EMPERY_HQ_PROPS) {
    const img = placeWorldProp(scene, id, x, y, size);
    if (!img) {
      floors.fillStyle(0x182838, 0.45);
      floors.fillRect(x - size * 0.25, y - size * 0.18, size * 0.5, size * 0.36);
      addPropFootprint(scene, id, x, y, size);
    }
  }

  // Soft cyan pulses on floodlights / holo
  for (const [id, x, y] of EMPERY_HQ_PROPS) {
    if (id !== 'prop_hq_floodlight' && id !== 'prop_hq_holo_sign') continue;
    const glow = scene.add.circle(x, y - 12, id === 'prop_hq_holo_sign' ? 36 : 28, 0x4ec5e8, 0.14).setDepth(6);
    scene.tweens.add({
      targets: glow,
      alpha: 0.05,
      yoyo: true,
      duration: 1400 + (x % 7) * 90,
      repeat: -1,
    });
  }

  const hqTitle = scene.add
    .text(scene.scale.width / 2, 112, 'EMPERYWORLD  ·  КАМПУС', {
      color: '#d8c69c',
      fontSize: '14px',
      fontStyle: 'bold',
      backgroundColor: '#061018cc',
      padding: { x: 12, y: 4 },
    })
    .setOrigin(0.5, 0)
    .setDepth(14)
    .setScrollFactor(0);
  placeHudInScreen(hqTitle, scene.scale.width / 2, 112, scene.cameras.main.zoom, scene.scale.width, scene.scale.height);

  if (location.subtitle) {
    /* subtitle drawn by shared banner below */
  }
}

function addEmperyHqLobbyDecorations(scene: Phaser.Scene): void {
  const walls=scene.add.graphics().setDepth(1);
  const width=EMPERY_HQ_LOBBY.width*64,height=EMPERY_HQ_LOBBY.height*64;
  walls.fillStyle(0x171a1c,1);walls.fillRect(0,0,width,height);
  const floors=scene.add.graphics().setDepth(2);
  const lobby = EMPERY_HQ_LOBBY.floor;
  floors.fillStyle(0xdedbd3, 1);
  floors.fillRoundedRect(lobby.x, lobby.y, lobby.width, lobby.height, 12);
  floors.lineStyle(1, 0x7c776c, 0.12);
  for(let x=lobby.x+96;x<lobby.x+lobby.width;x+=96)floors.lineBetween(x,lobby.y,x,lobby.y+lobby.height);
  for(let y=lobby.y+96;y<lobby.y+lobby.height;y+=96)floors.lineBetween(lobby.x,y,lobby.x+lobby.width,y);
  floors.lineStyle(2, 0xb09a6e, 0.65);
  floors.strokeRoundedRect(lobby.x+8,lobby.y+8,lobby.width-16,lobby.height-16,10);
  for(const sofa of EMPERY_HQ_LOBBY.sofas){
    floors.fillStyle(0xbab1a2,0.65);
    floors.fillRoundedRect(sofa.x-96,sofa.y-110,192,170,14);
  }

  walls.fillStyle(0x66574a,1);
  walls.fillRect(16,16,width-32,48);walls.fillRect(16,64,48,height-128);walls.fillRect(width-64,64,48,height-128);
  walls.fillRect(64,height-64,width/2-128,48);walls.fillRect(width/2+64,height-64,width/2-128,48);
  walls.lineStyle(3,0xb79d6d,0.8);
  walls.lineBetween(64,64,width-64,64);walls.lineBetween(64,64,64,height-64);walls.lineBetween(width-64,64,width-64,height-64);
  for(const [id,x,y,size] of EMPERY_HQ_LOBBY_PROPS){
    if(!placeWorldProp(scene,id,x,y,size))addPropFootprint(scene,id,x,y,size);
  }
  if (scene.textures.exists('emperyworld-logo')) {
    scene.add.graphics().fillStyle(0xf6f1e6, 1)
      .fillRoundedRect(EMPERY_HQ_LOBBY.reception.x - 64, 88, 128, 128, 4)
      .setDepth(Depth.FloatText - 0.01);
    const logo = scene.add.image(EMPERY_HQ_LOBBY.reception.x, 152, 'emperyworld-logo');
    // Keep the supplied image's colours and transparency; no tint or dark badge.
    const ratio = 112 / Math.max(logo.width, logo.height);
    logo.setScale(ratio).setDepth(Depth.FloatText);
  }

}

function addApartmentDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const save = scene.registry.get('bootSave') as { housing?: { tier?: number } } | undefined;
  const tier = Math.max(1, Math.min(3, Math.floor(save?.housing?.tier ?? 1)));

  // Room rects (world px)
  const living = { x: 256, y: 256, w: 768, h: 512 };
  const bedroom = { x: 256, y: 768, w: 384, h: 288 };
  const office = { x: 640, y: 768, w: 384, h: 288 };

  const g = scene.add.graphics().setDepth(2);

  // Exterior void shadow around apartment footprint
  g.fillStyle(0x12100e, 0.92);
  g.fillRect(0, 0, 1536, 1536);

  const fillRoom = (r: { x: number; y: number; w: number; h: number }, floor: number, alpha = 0.92) => {
    g.fillStyle(floor, alpha);
    g.fillRect(r.x, r.y, r.w, r.h);
  };

  fillRoom(living, 0x7a6048, 0.55);
  if (tier >= 2) fillRoom(bedroom, 0x6e5640, 0.5);
  if (tier >= 3) fillRoom(office, 0x685240, 0.5);

  // Thick walls
  const wall = 0x3a322a;
  const wallW = 14;
  const strokeRoom = (r: { x: number; y: number; w: number; h: number }) => {
    g.fillStyle(wall, 1);
    g.fillRect(r.x - wallW, r.y - wallW, r.w + wallW * 2, wallW);
    g.fillRect(r.x - wallW, r.y + r.h, r.w + wallW * 2, wallW);
    g.fillRect(r.x - wallW, r.y, wallW, r.h);
    g.fillRect(r.x + r.w, r.y, wallW, r.h);
  };
  strokeRoom(living);
  if (tier >= 2) strokeRoom(bedroom);
  if (tier >= 3) strokeRoom(office);

  // Doorways (cut openings)
  const cutDoor = (x: number, y: number, w: number, h: number) => {
    g.fillStyle(0x7a6048, 1);
    g.fillRect(x, y, w, h);
  };
  // Living → south hallway / exit
  cutDoor(600, living.y + living.h - 2, 80, wallW + 8);
  if (tier >= 2) {
    // Living → bedroom
    cutDoor(360, living.y + living.h - 2, 72, wallW + 10);
    cutDoor(360, bedroom.y - wallW, 72, wallW + 4);
  }
  if (tier >= 3) {
    cutDoor(780, living.y + living.h - 2, 72, wallW + 10);
    cutDoor(780, office.y - wallW, 72, wallW + 4);
  }

  // Sealed south wings for lower tiers — leave center corridor to the exit.
  if (tier < 2) {
    g.fillStyle(0x1c1814, 0.88);
    g.fillRect(240, 780, 300, 280);
    g.fillRect(700, 780, 340, 280);
    g.lineStyle(2, 0x4a4038, 0.5);
    g.strokeRect(280, 800, 240, 240);
    g.strokeRect(720, 800, 280, 240);
    scene.add
      .text(400, 920, 'Спальня заперта', {
        color: '#8a7860',
        fontSize: '12px',
        fontStyle: 'italic',
      })
      .setOrigin(0.5)
      .setDepth(5);
    scene.add
      .text(860, 920, 'Кабинет заперт', {
        color: '#8a7860',
        fontSize: '12px',
        fontStyle: 'italic',
      })
      .setOrigin(0.5)
      .setDepth(5);
  } else if (tier < 3) {
    g.fillStyle(0x1c1814, 0.88);
    g.fillRect(700, 780, 340, 280);
    g.lineStyle(2, 0x4a4038, 0.5);
    g.strokeRect(720, 800, 280, 240);
    scene.add
      .text(860, 920, 'Кабинет заперт', {
        color: '#8a7860',
        fontSize: '12px',
        fontStyle: 'italic',
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  // Exit threshold mat — south doorway of living room
  g.fillStyle(0x4a3830, 0.95);
  g.fillRect(580, 748, 120, 36);
  g.fillStyle(0x6a5040, 0.7);
  g.fillRect(590, 756, 100, 22);

  const placeOrFallback = (
    id: string,
    x: number,
    y: number,
    size: number,
    fallback: (gg: Phaser.GameObjects.Graphics) => void,
  ) => {
    if (!placeWorldProp(scene, id, x, y, size)) {
      const fb = scene.add.graphics().setDepth(5);
      fallback(fb);
    }
  };

  // Living room rug (center)
  placeOrFallback('prop_apt_rug', 640, 560, 160, (fb) => {
    fb.fillStyle(0x6a3040, 0.75);
    fb.fillRoundedRect(560, 500, 160, 120, 8);
    fb.lineStyle(3, 0xc9a66b, 0.55);
    fb.strokeRoundedRect(568, 508, 144, 104, 6);
  });

  // Table + benches
  placeOrFallback('prop_apt_table', 640, 620, 88, (fb) => {
    fb.fillStyle(0x5a4030, 1);
    fb.fillRoundedRect(600, 600, 80, 44, 4);
    fb.fillStyle(0x3a2820, 1);
    fb.fillRect(608, 640, 8, 12);
    fb.fillRect(664, 640, 8, 12);
  });
  placeWorldProp(scene, 'prop_bench', 580, 660, 56);
  placeWorldProp(scene, 'prop_bench', 700, 660, 56);

  // Russian stove — north wall, dominant
  const stoveX = 640;
  const stoveY = 360;
  placeOrFallback('prop_russian_stove', stoveX, stoveY, 150, (fb) => {
    fb.fillStyle(0x5a4030, 1);
    fb.fillRoundedRect(stoveX - 70, stoveY - 50, 140, 110, 10);
    fb.fillStyle(0x3a2820, 1);
    fb.fillRect(stoveX - 18, stoveY - 90, 36, 48);
    fb.fillStyle(0xff6622, 0.85);
    fb.fillCircle(stoveX, stoveY + 10, 22);
  });

  // Stove glow + embers
  const glow = scene.add.circle(stoveX, stoveY + 40, 90, 0xff8844, 0.18).setDepth(Depth.Ambient);
  scene.tweens.add({
    targets: glow,
    alpha: 0.08,
    scale: 1.12,
    yoyo: true,
    duration: 1100,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  const embers = scene.add.graphics().setDepth(Depth.Ambient);
  const drawEmbers = (phase: number) => {
    embers.clear();
    for (let i = 0; i < 8; i++) {
      const t = (phase + i * 0.7) % (Math.PI * 2);
      const rise = ((t / (Math.PI * 2)) * 36) % 36;
      const ox = stoveX + Math.sin(t * 3 + i) * (6 + (i % 3) * 3);
      const oy = stoveY + 20 - rise;
      embers.fillStyle(0xffaa44, 0.35 * (1 - rise / 36));
      embers.fillCircle(ox, oy, 2 + (i % 2));
    }
  };
  drawEmbers(0);
  if (
    !spawnGpuPuffs(
      scene,
      Array.from({ length: 8 }, (_, i) => ({
        x: stoveX + ((i % 3) - 1) * 6,
        y: stoveY + 20,
        rise: 36,
      })),
      { color: 0xffaa44, depth: Depth.Ambient, duration: 2400, puffs: 1, alpha: 0.35 },
    )
  ) {
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 2400,
      repeat: -1,
      onUpdate: (tw) => drawEmbers(tw.getValue() ?? 0),
    });
  } else {
    embers.destroy();
  }

  // Wall lanterns
  const placeLantern = (x: number, y: number) => {
    placeOrFallback('prop_apt_lantern', x, y, 48, (fb) => {
      fb.fillStyle(0x4a4030, 1);
      fb.fillRect(x - 4, y - 18, 8, 20);
      fb.fillStyle(0xffcc66, 0.85);
      fb.fillCircle(x, y + 6, 10);
    });
    const lampGlow = scene.add.circle(x, y + 8, 36, 0xffaa55, 0.12).setDepth(Depth.Ambient);
    scene.tweens.add({
      targets: lampGlow,
      alpha: 0.05,
      yoyo: true,
      duration: 1400 + ((x + y) % 400),
      repeat: -1,
    });
  };
  placeLantern(320, 320);
  placeLantern(960, 320);
  placeLantern(320, 700);
  placeLantern(960, 700);

  // Storage furniture (matches YAML interact points)
  placeOrFallback('prop_storage_chest', 360, 680, 92, (fb) => {
    fb.fillStyle(0x6a5038, 0.95);
    fb.fillRoundedRect(320, 655, 80, 50, 6);
  });
  placeOrFallback('prop_weapon_rack', 920, 680, 92, (fb) => {
    fb.fillStyle(0x505868, 0.95);
    fb.fillRoundedRect(880, 640, 80, 70, 4);
  });
  placeOrFallback('prop_icebox', 900, 520, 78, (fb) => {
    fb.fillStyle(0x6888a0, 0.95);
    fb.fillRoundedRect(870, 490, 60, 70, 6);
  });

  // Rest bed: cot by the stove (tier 1) or bedroom (tier 2+)
  // Interact hotspots sit slightly south (see EntityManager) so [E] works from the apron.
  const bedPos = tier >= 2 ? { x: 400, y: 920, size: 110 } : { x: 480, y: 500, size: 96 };
  placeOrFallback('prop_apt_bed', bedPos.x, bedPos.y, bedPos.size, (fb) => {
    fb.fillStyle(0x5a4050, 1);
    fb.fillRoundedRect(bedPos.x - 60, bedPos.y - 40, 120, 80, 6);
    fb.fillStyle(0xd8c8b0, 0.9);
    fb.fillRect(bedPos.x - 50, bedPos.y - 32, 40, 64);
  });
  if (tier >= 2) placeLantern(300, 820);

  if (tier >= 3) {
    placeOrFallback('prop_apt_table', 820, 900, 80, (fb) => {
      fb.fillStyle(0x5a4030, 1);
      fb.fillRoundedRect(780, 880, 80, 48, 4);
    });
    placeWorldProp(scene, 'prop_weapon_rack', 920, 900, 70);
    placeLantern(980, 820);
  }

  // Soft ambient dust motes
  const motes = scene.add.graphics().setDepth(Depth.Ambient);
  const motePts = Array.from({ length: 10 }, (_, i) => ({
    x: 400 + (i * 97) % 500,
    y: 360 + (i * 73) % 400,
    r: 1.5 + (i % 3),
  }));
  const drawMotes = (phase: number) => {
    motes.clear();
    for (const p of motePts) {
      const ox = p.x + Math.sin(phase + p.x * 0.01) * 8;
      const oy = p.y + Math.cos(phase * 0.7 + p.y * 0.01) * 6;
      motes.fillStyle(0xffe0b0, 0.12);
      motes.fillCircle(ox, oy, p.r);
    }
  };
  drawMotes(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 8000,
    repeat: -1,
    onUpdate: (tw) => drawMotes(tw.getValue() ?? 0),
  });

  const tierLabel = tier === 1 ? '1-комнатная' : tier === 2 ? '2-комнатная' : '3-комнатная';
  scene.add
    .text(640, 220, tierLabel, {
      color: '#c9b090',
      fontSize: '12px',
      backgroundColor: '#00000055',
      padding: { x: 8, y: 3 },
    })
    .setOrigin(0.5)
    .setDepth(8);
}

function addGroveDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  const treePositions: [number, number][] = [
    [120, 180],
    [180, 320],
    [280, 140],
    [1080, 200],
    [1120, 480],
    [1040, 680],
    [200, 680],
    [320, 600],
  ];
  const fallbackTrees = scene.add.graphics().setDepth(4);
  const greens = [0x3a7040, 0x4a8050, 0x2a6038];
  for (const [x, y] of treePositions) {
    if (!placeWorldProp(scene, 'prop_tree_oak', x, y, 88)) {
      drawTree(fallbackTrees, x, y, greens[(x + y) % greens.length]!);
    }
  }

  const pond = scene.add.graphics().setDepth(3);
  pond.fillStyle(0x3a6888, 0.55);
  pond.fillEllipse(640, 560, 200, 90);
  pond.fillStyle(0x6aaccc, 0.25);
  pond.fillEllipse(620, 548, 80, 35);
  bakeStaticGraphics(scene, pond, 'bake-grove-pond', bakeRectFromEllipse(640, 560, 200, 90));

  const flowerPts = [
    [520, 380, 0xffcc88],
    [560, 420, 0xffaaaa],
    [740, 400, 0xccffaa],
    [780, 440, 0xffdd66],
  ] as const;
  const flowers = scene.add.graphics().setDepth(5);
  let flowerBounds = bakeRectFromCircle(flowerPts[0]![0], flowerPts[0]![1], 7);
  for (const [x, y, c] of flowerPts) {
    flowers.fillStyle(c, 0.85);
    flowers.fillCircle(x, y, 4);
    flowers.fillCircle(x + 6, y + 3, 3);
    flowerBounds = unionBakeRect(flowerBounds, bakeRectFromCircle(x + 3, y + 1.5, 7));
  }
  bakeStaticGraphics(scene, flowers, 'bake-grove-flowers', flowerBounds);

  if (!placeWorldProp(scene, 'prop_hut', 388, 380, 96)) {
    const hut = scene.add.graphics().setDepth(6);
    hut.fillStyle(0x6a5030, 1);
    hut.fillRect(360, 360, 56, 40);
    hut.fillStyle(0x8a6040, 0.95);
    hut.fillTriangle(360, 360, 416, 360, 388, 332);
    hut.fillStyle(0x3a2818, 1);
    hut.fillRect(382, 378, 14, 22);
  }

  for (const lm of location.landmarks ?? []) {
    if (lm.kind === 'campfire' && !placeProp(scene, 'prop_campfire', lm.x, lm.y, 64, 6)) {
      const fire = scene.add.graphics().setDepth(6);
      fire.fillStyle(0x444444, 1);
      fire.fillCircle(lm.x, lm.y + 8, 14);
      fire.fillStyle(0xff6622, 0.85);
      fire.fillTriangle(lm.x - 8, lm.y + 8, lm.x + 8, lm.y + 8, lm.x, lm.y - 10);
      fire.fillStyle(0xffaa44, 0.75);
      fire.fillCircle(lm.x, lm.y, 6);
    }
  }
}

function placeOrDraw(
  scene: Phaser.Scene,
  assetId: string,
  x: number,
  y: number,
  size: number,
  _depth: number,
  fallback: () => void,
): void {
  if (placeWorldProp(scene, assetId, x, y, size)) return;
  fallback();
}

function addHavenDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const tw = 64;
  const px = (tx: number, ty: number) => [tx * tw + tw / 2, ty * tw + tw / 2] as const;

  const ground = scene.add.graphics().setDepth(2);
  const roads = scene.add.graphics().setDepth(2);

  // ——— Глобальные оси: главная N–S и бульвар ———
  roads.fillStyle(0x6a6050, 0.12);
  roads.fillRect(37 * tw, 3 * tw, 6 * tw, 46 * tw);
  roads.fillStyle(0x8a7c68, 0.08);
  roads.fillRect(38 * tw, 3 * tw, 4 * tw, 46 * tw);
  roads.fillStyle(0x6a6050, 0.12);
  roads.fillRect(4 * tw, 17 * tw, 72 * tw, 5 * tw);
  roads.fillStyle(0x8a7c68, 0.08);
  roads.fillRect(4 * tw, 18 * tw, 72 * tw, 3 * tw);
  // Брусчатка площади
  const [plx, ply] = px(40, 21);
  roads.fillStyle(0x5a5448, 0.08);
  roads.fillEllipse(plx, ply, 720, 520);
  roads.fillStyle(0xb8a888, 0.06);
  roads.fillEllipse(plx, ply, 520, 380);
  // Тень вдоль внутренних стен
  roads.fillStyle(0x000000, 0.07);
  roads.fillRect(3 * tw, 3 * tw, 74 * tw, 1.2 * tw);
  roads.fillRect(3 * tw, 48 * tw, 74 * tw, 1.2 * tw);
  roads.fillRect(3 * tw, 3 * tw, 1.2 * tw, 46 * tw);
  roads.fillRect(75.5 * tw, 3 * tw, 1.2 * tw, 46 * tw);

  // EmperyWorld HQ — отдельная плита, не городская брусчатка
  {
    const hx = 58 * tw;
    const hy = 31 * tw;
    const hw = 13 * tw;
    const hh = 9 * tw;
    ground.fillStyle(0x0a1824, 0.52);
    ground.fillRect(hx, hy, hw, hh);
    ground.fillStyle(0x152838, 0.32);
    ground.fillRect(hx + tw, hy + tw, hw - tw * 2, hh - tw * 2);
    ground.lineStyle(7, 0x142838, 0.9);
    ground.strokeRect(hx + 4, hy + 4, hw - 8, hh - 8);
    ground.lineStyle(2, 0x3aa0c8, 0.45);
    ground.strokeRect(hx + 10, hy + 10, hw - 20, hh - 20);
    ground.fillStyle(0x1a3040, 0.4);
    ground.fillRect(63 * tw, 39 * tw, 3 * tw, 4 * tw);
  }

  // ——— Районы: единая палитра ореолов ———
  const showHalos = getGraphicsProfile().havenDistrictHalos;
  if (showHalos) {
    for (const d of HAVEN_TILE_WASHES) {
      const [dx, dy] = px(d.tx, d.ty);
      ground.fillStyle(d.color, d.a);
      ground.fillEllipse(dx, dy, d.w, d.h);
    }
  }

  // ——— Явные кварталы: ореолы + булыжные дорожки + вывески ———
  const districtPaths = scene.add.graphics().setDepth(2);
  for (const dist of HAVEN_DISTRICTS) {
    ground.fillStyle(dist.color, dist.alpha);
    ground.fillEllipse(dist.x, dist.y, dist.w, dist.h);
    if (showHalos) {
      ground.fillStyle(dist.color, dist.alpha * 0.55);
      ground.fillEllipse(dist.x, dist.y, dist.w * 0.72, dist.h * 0.72);
    }

    if (showHalos && dist.path) {
      for (const [x1, y1, x2, y2] of dist.path) {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(4, Math.floor(len / 28));
        districtPaths.fillStyle(0x6a6050, 0.22);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          districtPaths.fillEllipse(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 52, 28);
        }
        districtPaths.fillStyle(0x9a8c78, 0.14);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          districtPaths.fillEllipse(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 34, 18);
        }
      }
    }
    drawBanner(scene, dist.signX, dist.signY, dist.label, dist.bannerColor);
  }

  const [parkX, parkY] = px(12, 8);
  const [cx, cy] = px(50, 11);
  const [hxHeal, hyHeal] = px(46, 16);
  const [bx, by] = px(60, 22);
  const [bathX, bathY] = px(54, 22);
  const [fx, fy] = px(14, 31);
  const [hx, hy] = px(62, 46);

  // Акватория — тон только по открытой воде (камень набережной не заливаем)
  const water = scene.add.graphics().setDepth(2);
  const basinX = HAVEN_WATER_BASIN.tx * tw;
  const basinY = HAVEN_WATER_BASIN.ty * tw;
  const basinW = HAVEN_WATER_BASIN.w * tw;
  const basinH = HAVEN_WATER_BASIN.h * tw;
  const bayX = HAVEN_WATER_EAST_BAY.tx * tw;
  const bayY = HAVEN_WATER_EAST_BAY.ty * tw;
  const bayW = HAVEN_WATER_EAST_BAY.w * tw;
  const bayH = HAVEN_WATER_EAST_BAY.h * tw;
  const paintWaterSpans = (x0: number, x1: number, y0: number, y1: number): void => {
    for (let ty = y0; ty < y1; ty++) {
      for (const span of havenOpenWaterRowSpans(ty, x0, x1)) {
        water.fillRect(span.tx * tw, ty * tw, span.w * tw, tw);
      }
    }
  };
  water.fillStyle(0x1a3048, 0.34);
  paintWaterSpans(
    HAVEN_WATER_BASIN.tx,
    HAVEN_WATER_BASIN.tx + HAVEN_WATER_BASIN.w,
    HAVEN_WATER_BASIN.ty,
    HAVEN_WATER_BASIN.ty + HAVEN_WATER_BASIN.h,
  );
  paintWaterSpans(
    HAVEN_WATER_EAST_BAY.tx,
    HAVEN_WATER_EAST_BAY.tx + HAVEN_WATER_EAST_BAY.w,
    HAVEN_WATER_EAST_BAY.ty,
    HAVEN_WATER_EAST_BAY.ty + HAVEN_WATER_EAST_BAY.h,
  );
  water.fillStyle(0x2a5080, 0.14);
  paintWaterSpans(
    HAVEN_WATER_BASIN.tx,
    HAVEN_WATER_BASIN.tx + HAVEN_WATER_BASIN.w,
    64,
    78,
  );
  bakeStaticGraphics(
    scene,
    water,
    'bake-haven-water',
    unionBakeRect(bakeRectFromBox(basinX, basinY, basinW, basinH), bakeRectFromBox(bayX, bayY, bayW, bayH)),
  );
  paintHavenDockSurfaces(scene);
  const shimmerPts = (
    [
      [46, 62],
      [62, 64],
      [66, 72],
      [78, 66],
      [90, 70],
      [100, 74],
      [72, 78],
      [50, 74],
    ] as const
  ).filter(([tx, ty]) => isHavenOpenWaterTile(tx, ty));
  const shimmer = scene.add.graphics().setDepth(3);
  shimmer.fillStyle(0xa8d0ff, 0.08);
  let shimmerBounds = bakeRectFromEllipse(shimmerPts[0]![0] * tw + 32, shimmerPts[0]![1] * tw + 32, 64, 26);
  for (const [ox, oy] of shimmerPts) {
    shimmer.fillEllipse(ox * tw + 32, oy * tw + 32, 64, 26);
    shimmerBounds = unionBakeRect(
      shimmerBounds,
      bakeRectFromEllipse(ox * tw + 32, oy * tw + 32, 64, 26),
    );
  }
  const shimmerObj = bakeStaticGraphics(scene, shimmer, 'bake-haven-shimmer', shimmerBounds);
  scene.tweens.add({
    targets: shimmerObj,
    alpha: { from: 0.35, to: 0.9 },
    duration: 2200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Пропы: flat / behind / trunk / arch / stall — depth + силуэт-коллизия
  const shipSprites: HarborShipHandle[] = [];
  const cartSprites: Phaser.GameObjects.Image[] = [];
  const doorApron = scene.add.graphics().setDepth(2);
  const hqAccess = Boolean(
    (scene.registry.get('bootSave') as { questFlags?: Record<string, unknown> } | undefined)?.questFlags
      ?.quest_empery_hq_access,
  );
  for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
    if (havenCityPropReplacedByNpcLandmark(id, x, y, size)) continue;
    if (id === 'prop_open_stage') {
      // Enhanced in placeHavenStage — skip the small city prop
      continue;
    }
    const propId =
      id === 'prop_hq_gate_closed' && hqAccess ? 'prop_hq_gate_open' : id;
    const placeSize =
      isHavenShipHullAsset(id) ? Math.round(size * HAVEN_SHIP_DISPLAY_SCALE) : size;
    const img = placeWorldProp(scene, propId, x, y, placeSize);
    if (!img) {
      ground.fillStyle(0x6a5a48, 0.5);
      ground.fillRect(x - size * 0.25, y - size * 0.18, size * 0.5, size * 0.36);
      // Still block walking even when texture is missing.
      addPropFootprint(scene, propId, x, y, size);
      continue;
    }
    registerHavenCityGate(scene, propId, img, x, y, size);
    if (isHavenShipHullAsset(id)) {
      shipSprites.push({ image: img, assetId: id, homeX: x, homeY: y });
    }
    if (id === 'prop_wagon' || id === 'prop_merchant_cart') cartSprites.push(img);
    // Тёмная «половица» у входа крупных зданий — намёк на зону захода
    if (size >= 150 && (id.startsWith('prop_house_') || id.includes('inn') || id.includes('palace')
      || id.includes('cathedral') || id.includes('guild') || id.includes('bath') || id.includes('brewery')
      || id.includes('library') || id.includes('barracks') || id.includes('shop') || id.includes('hall'))) {
      doorApron.fillStyle(0x2a2418, 0.18);
      doorApron.fillEllipse(x, y + size * 0.12, size * 0.28, size * 0.1);
      doorApron.fillStyle(0x5a4a38, 0.12);
      doorApron.fillEllipse(x, y + size * 0.1, size * 0.18, size * 0.06);
    }
  }

  // Колоссы у town-NPC: фасад + дым + площадь у двери (имена — только на NPC [E])
  const landmarkSmoke = scene.add.graphics().setDepth(Depth.Ambient);
  const smokeStacks: { x: number; y: number; rise: number }[] = [];
  for (const b of HAVEN_NPC_BUILDINGS) {
    const { prop: id, x, y, size, smoke, plaza } = b;
    if (id === 'prop_windmill') {
      placeHavenWindmill(scene, x, y, size);
    } else {
      const img = placeWorldProp(scene, id, x, y, size);
      if (!img) {
        ground.fillStyle(0x7a6a50, 0.6);
        ground.fillRoundedRect(x - size * 0.36, y - size * 0.42, size * 0.72, size * 0.62, 10);
        ground.fillStyle(0x4a4034, 0.85);
        ground.fillTriangle(
          x - size * 0.4,
          y - size * 0.18,
          x + size * 0.4,
          y - size * 0.18,
          x,
          y - size * 0.52,
        );
        addPropFootprint(scene, id, x, y, size);
      }
    }
    const apronScale = plaza ? 0.42 : 0.3;
    doorApron.fillStyle(0x1a140c, 0.28);
    doorApron.fillEllipse(x, y + size * 0.16, size * apronScale, size * 0.12);
    doorApron.fillStyle(0x7a6848, 0.2);
    doorApron.fillEllipse(x, y + size * 0.13, size * apronScale * 0.65, size * 0.08);
    doorApron.fillStyle(0xb0a080, 0.1);
    doorApron.fillEllipse(x, y + size * 0.11, size * 0.14, size * 0.05);
    if (smoke) {
      const chimneys = 6;
      for (let i = 0; i < chimneys; i++) {
        smokeStacks.push({
          x: x - size * 0.28 + i * (size * 0.09),
          y: y - size * 0.42,
          rise: 36 + (i % 3) * 6,
        });
      }
    }
  }
  if (smokeStacks.length > 0) {
    if (
      !spawnGpuPuffs(scene, smokeStacks, {
        color: 0xb8b0a8,
        depth: Depth.Ambient,
        duration: 3000,
        puffs: 3,
        alpha: 0.16,
      })
    ) {
      const drawLandmarkSmoke = (phase: number) => {
        landmarkSmoke.clear();
        for (let i = 0; i < smokeStacks.length; i++) {
          const c = smokeStacks[i]!;
          for (let p = 0; p < 3; p++) {
            const t = (phase + i * 0.4 + p * 0.7) % (Math.PI * 2);
            const rise = ((t / (Math.PI * 2)) * c.rise) % c.rise;
            const ox = c.x + Math.sin(t * 2 + p) * (4 + p * 2);
            const oy = c.y - rise;
            const a = 0.16 * (1 - rise / c.rise);
            landmarkSmoke.fillStyle(0xb8b0a8, a);
            landmarkSmoke.fillCircle(ox, oy, 4 + p + rise * 0.07);
          }
        }
      };
      drawLandmarkSmoke(0);
      loopDecorCounter(scene, {
        from: 0,
        to: Math.PI * 2,
        duration: 3000,
        repeat: -1,
        onUpdate: (tw) => drawLandmarkSmoke(tw.getValue() ?? 0),
      });
    } else {
      landmarkSmoke.destroy();
    }
  }

  // Корабли: швартовые качаются, крупные корпуса патрулируют акваторию
  bindHavenHarborShips(scene, shipSprites);
  bindHavenHarborLife(scene);

  // Телеги / тележки — лёгкий «люфт»
  for (let i = 0; i < cartSprites.length; i++) {
    const cart = cartSprites[i]!;
    scene.tweens.add({
      targets: cart,
      angle: { from: -1.2, to: 1.2 },
      duration: 2600 + i * 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: i * 140,
    });
  }

  // Фонтаны — блики на воде
  const fountainFx = scene.add.graphics().setDepth(4);
  const fountainPts: { x: number; y: number; s: number }[] = [];
  for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
    if (id !== 'prop_fountain' && id !== 'prop_garden_fountain') continue;
    fountainPts.push({ x, y: y - size * 0.08, s: size });
  }
  if (fountainPts.length > 0) {
    const drawFountains = (phase: number) => {
      fountainFx.clear();
      for (let i = 0; i < fountainPts.length; i++) {
        const f = fountainPts[i]!;
        const pulse = 0.55 + 0.45 * Math.sin(phase * 2.2 + i);
        fountainFx.fillStyle(0xa8d8ff, 0.1 * pulse);
        fountainFx.fillEllipse(f.x, f.y, f.s * 0.42, f.s * 0.18);
        fountainFx.fillStyle(0xe8f6ff, 0.14 * pulse);
        fountainFx.fillEllipse(f.x + Math.sin(phase + i) * 6, f.y - 4, f.s * 0.16, f.s * 0.07);
      }
    };
    drawFountains(0);
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 2800,
      repeat: -1,
      onUpdate: (tw) => drawFountains(tw.getValue() ?? 0),
    });
  }

  // Пар / дым от вентов и печных труб
  const steamFx = scene.add.graphics().setDepth(Depth.Ambient);
  const steamPts: { x: number; y: number; hot: boolean }[] = [];
  for (const [id, x, y] of HAVEN_CITY_PROPS) {
    if (id === 'prop_steam_vent') steamPts.push({ x, y, hot: false });
    if (id === 'prop_chimney_smoke') steamPts.push({ x, y: y - 20, hot: true });
  }
  if (steamPts.length > 0) {
    const hot = steamPts.filter((s) => s.hot).map((s) => ({ x: s.x, y: s.y, rise: 36 }));
    const cool = steamPts.filter((s) => !s.hot).map((s) => ({ x: s.x, y: s.y, rise: 36 }));
    const gpuHot = hot.length === 0 || spawnGpuPuffs(scene, hot, {
      color: 0xb0b0b0,
      depth: Depth.Ambient,
      duration: 4200,
      puffs: 3,
      alpha: 0.16,
    });
    const gpuCool = cool.length === 0 || spawnGpuPuffs(scene, cool, {
      color: 0xd8e8f0,
      depth: Depth.Ambient,
      duration: 4200,
      puffs: 3,
      alpha: 0.16,
    });
    if (gpuHot && gpuCool) {
      steamFx.destroy();
    } else {
      const drawSteam = (phase: number) => {
        steamFx.clear();
        for (let i = 0; i < steamPts.length; i++) {
          const s = steamPts[i]!;
          for (let p = 0; p < 3; p++) {
            const t = (phase + i * 0.7 + p * 0.9) % (Math.PI * 2);
            const rise = ((t / (Math.PI * 2)) * 36) % 36;
            const ox = s.x + Math.sin(t * 2 + p) * (6 + p * 2);
            const oy = s.y - rise;
            const a = 0.16 * (1 - rise / 36);
            steamFx.fillStyle(s.hot ? 0xb0b0b0 : 0xd8e8f0, a);
            steamFx.fillCircle(ox, oy, 4 + p * 2 + rise * 0.08);
          }
        }
      };
      drawSteam(0);
      loopDecorCounter(scene, {
        from: 0,
        to: Math.PI * 2,
        duration: 4200,
        repeat: -1,
        onUpdate: (tw) => drawSteam(tw.getValue() ?? 0),
      });
    }
  }

  // Тёплый свет из окон крупных зданий + домов спального квартала
  const WINDOW_GLOW = new Set([
    'prop_cathedral',
    'prop_chapel',
    'prop_governor_palace',
    'prop_inn',
    'prop_library',
    'prop_imperial_archive',
    'prop_guildhall',
    'prop_bathhouse',
    'prop_brewery',
    'prop_tea_house',
    'prop_healer_hall',
    'prop_clock_tower',
    'prop_tenement_block',
  ]);
  const windowFx = scene.add.graphics().setDepth(4);
  const windowPts: { x: number; y: number; size: number; hue: number }[] = [];
  for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
    const isHouse = id.startsWith('prop_house_') || WINDOW_GLOW.has(id);
    if (!isHouse) continue;
    const hue = id.includes('cathedral') || id.includes('chapel') || id.includes('archive')
      ? 0xa8c8ff
      : id.includes('brewery') || id.includes('inn')
        ? 0xffb060
        : id.startsWith('prop_house_') || id === 'prop_tenement_block'
          ? 0xffc878
          : 0xffe0a0;
    windowPts.push({ x, y, size, hue });
  }
  if (windowPts.length > 0) {
    const isNightByClock = (): boolean => {
      const hour = getWorldGameHour();
      return typeof hour === 'number' ? hour >= 21 || hour < 7 : false;
    };
    let nightBoost = 1;
    const drawWindows = (phase: number) => {
      windowFx.clear();
      for (let i = 0; i < windowPts.length; i++) {
        const w = windowPts[i]!;
        const pulse = 0.65 + 0.35 * Math.sin(phase * 1.4 + i * 0.9);
        const a = nightBoost;
        const ox = w.x;
        const oy = w.y - w.size * 0.22;
        windowFx.fillStyle(w.hue, 0.1 * pulse * a);
        windowFx.fillEllipse(ox, oy, w.size * 0.38, w.size * 0.22);
        windowFx.fillStyle(w.hue, 0.22 * pulse * a);
        windowFx.fillRect(ox - w.size * 0.12, oy - 4, 5, 7);
        windowFx.fillRect(ox + w.size * 0.06, oy - 2, 5, 7);
        windowFx.fillRect(ox - w.size * 0.02, oy + 6, 5, 6);
      }
    };
    drawWindows(0);
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 3200,
      repeat: -1,
      onUpdate: (tw) => drawWindows(tw.getValue() ?? 0),
    });
    const applyWindowNight = () => {
      const sched = getHavenSchedule();
      const night = sched?.restActive ?? isNightByClock();
      nightBoost = night ? 1.55 : 0.45;
      windowFx.setAlpha(night ? 1 : 0.55);
    };
    applyWindowNight();
    const unsubWin = subscribeHavenSchedule(applyWindowNight);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubWin);
  }

  // Тёплые ореолы фонарей + лёгкий пульс (ярче ночью)
  const lampGlow = scene.add
    .graphics()
    .setDepth(Depth.DayNightOverlay + 1.2)
    .setBlendMode(Phaser.BlendModes.ADD);
  const lampPts: { x: number; y: number }[] = [];
  for (const [id, x, y] of HAVEN_CITY_PROPS) {
    if (id !== 'prop_street_lamp') continue;
    lampPts.push({ x, y });
  }
  const drawLamps = (bright: number) => {
    lampGlow.clear();
    for (const p of lampPts) {
      lampGlow.fillStyle(0xffc878, 0.09 * bright);
      lampGlow.fillEllipse(p.x, p.y + 8, 82, 62);
      lampGlow.fillStyle(0xffe0a0, 0.05 * bright);
      lampGlow.fillEllipse(p.x, p.y + 12, 126, 88);
      if (bright > 1.1) {
        lampGlow.fillStyle(0xffd090, 0.038 * bright);
        lampGlow.fillEllipse(p.x, p.y + 14, 172, 112);
      }
    }
  };
  drawLamps(1);
  scene.tweens.add({
    targets: lampGlow,
    alpha: { from: 0.55, to: 1 },
    duration: 1800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  const applyLampNight = () => {
    const sched = getHavenSchedule();
    const hour = getWorldGameHour();
    const nightByClock = typeof hour === 'number' ? hour >= 21 || hour < 7 : false;
    const night = sched?.restActive ?? nightByClock;
    drawLamps(night ? 1.35 : 0.72);
  };
  applyLampNight();
  const unsubLamp = subscribeHavenSchedule(applyLampNight);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubLamp);
  const unsubGates = bindHavenCityGates(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubGates);

  // Бразиеры на стенах — мерцание углей
  const brazierGlow = scene.add
    .graphics()
    .setDepth(Depth.DayNightOverlay + 1.3)
    .setBlendMode(Phaser.BlendModes.ADD);
  const brazierPts: { x: number; y: number }[] = [];
  for (const [id, x, y] of HAVEN_CITY_PROPS) {
    if (id !== 'prop_wall_brazier') continue;
    brazierPts.push({ x, y });
  }
  const drawBraziers = (phase: number) => {
    brazierGlow.clear();
    for (let i = 0; i < brazierPts.length; i++) {
      const p = brazierPts[i]!;
      const flicker = 0.7 + 0.3 * Math.sin(phase * 5 + i * 1.7);
      brazierGlow.fillStyle(0xff6622, 0.2 * flicker);
      brazierGlow.fillCircle(p.x, p.y - 8, 18 + flicker * 6);
      brazierGlow.fillStyle(0xffaa44, 0.1 * flicker);
      brazierGlow.fillCircle(p.x, p.y - 10, 32);
    }
  };
  if (brazierPts.length > 0) {
    if (
      !spawnGpuGlowDots(scene, brazierPts, {
        color: 0xff6622,
        depth: 4,
        duration: 900,
        scale: 2.6,
        alpha: 0.22,
        yOffset: -8,
      })
    ) {
      drawBraziers(0);
      loopDecorCounter(scene, {
        from: 0,
        to: Math.PI * 2,
        duration: 900,
        repeat: -1,
        onUpdate: (tw) => drawBraziers(tw.getValue() ?? 0),
      });
    } else {
      brazierGlow.destroy();
    }
  }

  // Восточные ворота — холодный дозорный свет
  const [egx, egy] = px(74, 28);
  ground.fillStyle(0x8890a0, 0.1);
  ground.fillEllipse(egx, egy, 320, 260);
  const eastGlow = scene.add.graphics().setDepth(3);
  eastGlow.fillStyle(0xa8b8c8, 0.1);
  eastGlow.fillCircle(egx, egy, 70);
  scene.tweens.add({
    targets: bakeStaticGraphics(scene, eastGlow, 'bake-haven-east-glow', bakeRectFromCircle(egx, egy, 70)),
    alpha: { from: 0.4, to: 0.85 },
    duration: 2000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Кузня — пульсирующий жар
  const forgeGlow = scene.add.graphics().setDepth(3);
  forgeGlow.fillStyle(0xff6622, 0.16);
  forgeGlow.fillCircle(fx, fy, 70);
  forgeGlow.fillStyle(0xffaa44, 0.08);
  forgeGlow.fillCircle(fx, fy, 110);
  scene.tweens.add({
    targets: bakeStaticGraphics(scene, forgeGlow, 'bake-haven-forge-glow', bakeRectFromCircle(fx, fy, 110)),
    alpha: { from: 0.45, to: 0.95 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Искры у наковальни
  const [anvilX, anvilY] = px(13, 32);
  const sparks = scene.add.graphics().setDepth(Depth.Ambient);
  const sparkSeed = Array.from({ length: 10 }, (_, i) => ({
    a: (i / 10) * Math.PI * 2,
    speed: 28 + (i % 4) * 8,
    life: 0.4 + (i % 3) * 0.15,
  }));
  const drawSparks = (phase: number) => {
    sparks.clear();
    // вспышка удара ~2 раза за цикл
    const hit = Math.pow(Math.max(0, Math.sin(phase * 4)), 8);
    if (hit > 0.05) {
      sparks.fillStyle(0xffee88, 0.35 * hit);
      sparks.fillCircle(anvilX, anvilY - 10, 10 + hit * 8);
    }
    for (let i = 0; i < sparkSeed.length; i++) {
      const s = sparkSeed[i]!;
      const t = (phase * 0.55 + i * 0.11) % 1;
      if (t > s.life) continue;
      const fade = 1 - t / s.life;
      const ox = anvilX + Math.cos(s.a + phase * 0.3) * s.speed * t;
      const oy = anvilY - 12 - s.speed * t * 1.4 - t * t * 20;
      sparks.fillStyle(0xffcc44, 0.55 * fade);
      sparks.fillCircle(ox, oy, 1.6 + fade);
      sparks.fillStyle(0xff6622, 0.35 * fade);
      sparks.fillCircle(ox, oy + 1, 1);
    }
  };
  drawSparks(0);
  if (
    !spawnGpuPuffs(
      scene,
      sparkSeed.map((s, i) => ({
        x: anvilX + Math.cos(s.a) * 8,
        y: anvilY - 12,
        rise: 18 + (i % 4) * 6,
      })),
      { color: 0xffcc44, depth: Depth.Ambient, duration: 1600, puffs: 1, alpha: 0.45 },
    )
  ) {
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 1600,
      repeat: -1,
      onUpdate: (tw) => drawSparks(tw.getValue() ?? 0),
    });
  } else {
    sparks.destroy();
  }

  // Бани — клубы пара
  const steam = scene.add.graphics().setDepth(4);
  const drawSteam = (phase: number) => {
    steam.clear();
    for (let i = 0; i < 5; i++) {
      const ox = bathX + Math.sin(phase + i * 1.3) * (18 + i * 6);
      const oy = bathY - 30 - i * 10 + Math.cos(phase * 0.8 + i) * 6;
      steam.fillStyle(0xe8f0f4, 0.08 + (i % 2) * 0.04);
      steam.fillEllipse(ox, oy, 40 + i * 8, 18 + i * 3);
    }
  };
  drawSteam(0);
  if (
    !spawnGpuPuffs(
      scene,
      Array.from({ length: 5 }, (_, i) => ({
        x: bathX + ((i % 3) - 1) * 12,
        y: bathY - 20,
        rise: 36 + i * 6,
      })),
      { color: 0xe8f0f4, depth: 4, duration: 4200, puffs: 1, alpha: 0.12 },
    )
  ) {
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 4200,
      repeat: -1,
      onUpdate: (tw) => drawSteam(tw.getValue() ?? 0),
    });
  } else {
    steam.destroy();
  }

  // Пивоварня — янтарный пульс
  const brewGlow = scene.add.graphics().setDepth(3);
  brewGlow.fillStyle(0xd4a050, 0.12);
  brewGlow.fillCircle(bx, by, 55);
  scene.tweens.add({
    targets: bakeStaticGraphics(scene, brewGlow, 'bake-haven-brew-glow', bakeRectFromCircle(bx, by, 55)),
    alpha: { from: 0.4, to: 0.9 },
    duration: 1400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Лечебница — спокойное дыхание
  const healGlow = scene.add.graphics().setDepth(3);
  healGlow.fillStyle(0x88ccaa, 0.1);
  healGlow.fillCircle(hxHeal, hyHeal, 60);
  scene.tweens.add({
    targets: healGlow,
    alpha: { from: 0.35, to: 0.85 },
    duration: 2200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Собор — мягкий литургический пульс
  const cathGlow = scene.add.graphics().setDepth(3);
  cathGlow.fillStyle(0x88aadd, 0.1);
  cathGlow.fillCircle(cx, cy, 85);
  scene.tweens.add({
    targets: cathGlow,
    alpha: { from: 0.35, to: 0.9 },
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Общественная печь — жар у пекарни
  const [ovenX, ovenY] = px(17, 15);
  const ovenGlow = scene.add.graphics().setDepth(3);
  ovenGlow.fillStyle(0xff7733, 0.14);
  ovenGlow.fillCircle(ovenX, ovenY, 40);
  scene.tweens.add({
    targets: ovenGlow,
    alpha: { from: 0.4, to: 0.95 },
    duration: 1100,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Свечи у алтарей / святилищ ворот
  const shrineGlow = scene.add.graphics().setDepth(4);
  const shrinePts: { x: number; y: number }[] = [];
  for (const [id, x, y] of HAVEN_CITY_PROPS) {
    if (id !== 'prop_street_shrine' && id !== 'prop_gate_shrine') continue;
    shrinePts.push({ x, y });
  }
  const drawShrines = (phase: number) => {
    shrineGlow.clear();
    for (let i = 0; i < shrinePts.length; i++) {
      const p = shrinePts[i]!;
      const f = 0.65 + 0.35 * Math.sin(phase * 4 + i);
      shrineGlow.fillStyle(0xffe8a0, 0.16 * f);
      shrineGlow.fillCircle(p.x, p.y - 6, 14 + f * 4);
    }
  };
  if (shrinePts.length > 0) {
    drawShrines(0);
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 1200,
      repeat: -1,
      onUpdate: (tw) => drawShrines(tw.getValue() ?? 0),
    });
  }

  // Капли с акведука
  const [aqX, aqY] = px(30, 22);
  const drip = scene.add.graphics().setDepth(4);
  const drawDrip = (phase: number) => {
    drip.clear();
    for (let i = 0; i < 4; i++) {
      const t = (phase + i * 0.25) % 1;
      drip.fillStyle(0xa8d0ff, 0.25 * (1 - t));
      drip.fillCircle(aqX - 20 + i * 12, aqY + 10 + t * 36, 2.5);
    }
  };
  drawDrip(0);
  loopDecorCounter(scene, {
    from: 0,
    to: 1,
    duration: 1600,
    repeat: -1,
    onUpdate: (tw) => drawDrip(tw.getValue() ?? 0),
  });

  // Некрополь за стеной — холодная дымка у полей
  const [memX, memY] = px(14, 53);
  ground.fillStyle(0x708098, 0.1);
  ground.fillEllipse(memX, memY, 280, 200);
  const memMist = scene.add.graphics().setDepth(4);
  memMist.fillStyle(0xb0b8c8, 0.07);
  memMist.fillEllipse(memX, memY, 220, 120);
  scene.tweens.add({
    targets: memMist,
    alpha: { from: 0.45, to: 1 },
    duration: 3500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Стеклодув — голубой жар печи
  const [glX, glY] = px(8, 38);
  const glassGlow = scene.add.graphics().setDepth(3);
  glassGlow.fillStyle(0x44aacc, 0.14);
  glassGlow.fillCircle(glX, glY, 45);
  scene.tweens.add({
    targets: glassGlow,
    alpha: { from: 0.4, to: 0.95 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // ЮЗ двор — тёплый жилой ореол + газоны + булыжные дорожки
  const [cyX, cyY] = px(16, 44);
  const [courtX, courtY] = px(21, 45);
  ground.fillStyle(0xb89860, 0.1);
  ground.fillEllipse(cyX, cyY, 560, 400);
  ground.fillStyle(0xa88858, 0.06);
  ground.fillEllipse(cyX, cyY, 400, 280);
  // Травяные лужайки у двора и площадки
  ground.fillStyle(0x3a5a38, 0.12);
  ground.fillEllipse(courtX, courtY, 360, 260);
  ground.fillStyle(0x4a6840, 0.1);
  ground.fillEllipse(cyX - 40, cyY + 20, 220, 160);
  ground.fillEllipse(courtX + 80, courtY - 40, 160, 120);
  // Парклет у перголы (восток площадки)
  const [pergolaX, pergolaY] = px(24, 45);
  ground.fillStyle(0x3a6040, 0.14);
  ground.fillEllipse(pergolaX, pergolaY + 20, 200, 150);
  ground.fillStyle(0x508050, 0.08);
  ground.fillEllipse(pergolaX, pergolaY + 24, 140, 100);

  // Residential cobble paths (aligned to larger house grid)
  const residPaths = scene.add.graphics().setDepth(2);
  const residPathSegs: Array<readonly [number, number, number, number]> = [
    [5 * tw + 32, 41 * tw + 32, 30 * tw + 32, 41 * tw + 32],
    [5 * tw + 32, 45 * tw + 32, 30 * tw + 32, 45 * tw + 32],
    [8 * tw + 32, 38 * tw + 32, 8 * tw + 32, 50 * tw + 32],
    [13 * tw + 32, 38 * tw + 32, 13 * tw + 32, 50 * tw + 32],
    [18 * tw + 32, 38 * tw + 32, 18 * tw + 32, 50 * tw + 32],
    [23 * tw + 32, 38 * tw + 32, 23 * tw + 32, 50 * tw + 32],
    [28 * tw + 32, 38 * tw + 32, 28 * tw + 32, 50 * tw + 32],
    [16 * tw + 32, 35 * tw + 32, 16 * tw + 32, 41 * tw + 32],
    [16 * tw + 32, 45 * tw + 32, 16 * tw + 32, 50 * tw + 32],
    // Подход к площадке от колодца
    [13 * tw + 32, 45 * tw + 32, 21 * tw + 32, 45 * tw + 32],
    [21 * tw + 32, 42 * tw + 32, 21 * tw + 32, 48 * tw + 32],
    // Коридор от ремёсел к арке квартала
    [16 * tw + 32, 33 * tw + 32, 16 * tw + 32, 36 * tw + 32],
    [12 * tw + 32, 36 * tw + 32, 20 * tw + 32, 36 * tw + 32],
  ];
  for (const [x1, y1, x2, y2] of residPathSegs) {
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pxth = x1 + (x2 - x1) * t;
      const pyth = y1 + (y2 - y1) * t;
      residPaths.fillStyle(0x5a5040, 0.26);
      residPaths.fillEllipse(pxth, pyth, 52, 28);
      residPaths.fillStyle(0x7a7060, 0.16);
      residPaths.fillEllipse(pxth, pyth, 34, 18);
    }
  }
  residPaths.fillStyle(0x6a6050, 0.22);
  residPaths.fillEllipse(cyX, cyY, 190, 120);
  residPaths.fillStyle(0x8a8070, 0.14);
  residPaths.fillEllipse(cyX, cyY, 130, 80);
  residPaths.fillStyle(0x5a5040, 0.18);
  residPaths.fillEllipse(courtX, courtY, 200, 140);

  // Плац — пыль от спарринга (гарнизон ~14,12)
  const [spX, spY] = px(14, 12);
  ground.fillStyle(0xb8a878, 0.12);
  ground.fillEllipse(spX, spY, 280, 200);
  const sparDust = scene.add.graphics().setDepth(3);
  sparDust.fillStyle(0xd4c090, 0.1);
  sparDust.fillCircle(spX, spY, 70);
  scene.tweens.add({
    targets: sparDust,
    alpha: { from: 0.35, to: 0.85 },
    duration: 1600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Архив — сухой пергаментный тон
  const [arX, arY] = px(56, 6);
  ground.fillStyle(0xa09080, 0.09);
  ground.fillEllipse(arX, arY, 180, 140);

  // Чайная — мягкий янтарный пар
  const [teaX, teaY] = px(62, 20);
  ground.fillStyle(0xd4b080, 0.1);
  ground.fillEllipse(teaX, teaY, 220, 180);
  const teaSteam = scene.add.graphics().setDepth(4);
  const drawTeaSteam = (phase: number) => {
    teaSteam.clear();
    for (let i = 0; i < 4; i++) {
      const t = (phase + i * 0.22) % 1;
      teaSteam.fillStyle(0xe8d8c0, 0.12 * (1 - t));
      teaSteam.fillEllipse(teaX - 10 + i * 8, teaY - 20 - t * 40, 18 + t * 10, 10);
    }
  };
  drawTeaSteam(0);
  loopDecorCounter(scene, {
    from: 0,
    to: 1,
    duration: 2800,
    repeat: -1,
    onUpdate: (tw) => drawTeaSteam(tw.getValue() ?? 0),
  });

  // Якорь на набережной — холодный металл
  const [anX, anY] = px(60, 46);
  ground.fillStyle(0x607888, 0.1);
  ground.fillEllipse(anX, anY, 200, 140);

  // Маяк — луч
  const [lx, ly] = px(70, 48);
  const beacon = scene.add.graphics().setDepth(4);
  beacon.fillStyle(0xffe8a0, 0.14);
  beacon.fillCircle(lx, ly - 20, 40);
  beacon.fillStyle(0xfff0c0, 0.06);
  beacon.fillCircle(lx, ly - 20, 90);
  scene.tweens.add({
    targets: beacon,
    alpha: { from: 0.4, to: 1 },
    duration: 1600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Кольцо площади
  const shield = scene.add.graphics().setDepth(2);
  shield.lineStyle(2, 0xc9a66b, 0.3);
  shield.strokeCircle(plx, ply, 300);
  shield.lineStyle(1, 0xffe0a0, 0.14);
  shield.strokeCircle(plx, ply, 360);
  scene.tweens.add({
    targets: shield,
    alpha: { from: 0.55, to: 0.18 },
    duration: 2800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Брызги фонтана на площади
  const spray = scene.add.graphics().setDepth(4);
  const drawSpray = (phase: number) => {
    spray.clear();
    for (let i = 0; i < 8; i++) {
      const ang = phase + (i / 8) * Math.PI * 2;
      const r = 28 + Math.sin(phase * 2 + i) * 10;
      const sx = plx + Math.cos(ang) * r;
      const sy = ply - 36 + Math.sin(ang) * r * 0.45;
      spray.fillStyle(0xc8e8ff, 0.2 + (i % 2) * 0.1);
      spray.fillCircle(sx, sy, 3 + (i % 3));
    }
    spray.fillStyle(0xe8f4ff, 0.12);
    spray.fillEllipse(plx, ply - 40, 50, 28);
  };
  drawSpray(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2400,
    repeat: -1,
    onUpdate: (tw) => drawSpray(tw.getValue() ?? 0),
  });

  // Сквер — мягкое дыхание листвы
  const parkGlow = scene.add.graphics().setDepth(3);
  parkGlow.fillStyle(0x88cc88, 0.08);
  parkGlow.fillCircle(parkX, parkY, 90);
  scene.tweens.add({
    targets: parkGlow,
    alpha: { from: 0.4, to: 0.9 },
    duration: 3200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Осевые полосы главной улицы и бульвара + стыки брусчатки
  const avenues = scene.add.graphics().setDepth(2);
  avenues.lineStyle(3, 0xc9a66b, 0.16);
  avenues.lineBetween(40 * tw + 32, 3 * tw, 40 * tw + 32, 49 * tw);
  avenues.lineStyle(2, 0xb89860, 0.12);
  avenues.lineBetween(4 * tw, 19 * tw + 32, 74 * tw, 19 * tw + 32);
  avenues.lineStyle(1, 0xd4c4a0, 0.1);
  for (let ty = 4; ty < 48; ty += 2) {
    avenues.lineBetween(38 * tw, ty * tw + 32, 42 * tw, ty * tw + 32);
  }
  for (let tx = 6; tx < 74; tx += 3) {
    avenues.lineBetween(tx * tw + 32, 18 * tw, tx * tw + 32, 21 * tw);
  }
  // Кольца у ворот
  for (const [tx, ty] of [
    [40, 4],
    [40, 48],
    [74, 28],
    [62, 49],
  ] as const) {
    const [ax, ay] = px(tx, ty);
    avenues.lineStyle(2, 0xc9a66b, 0.18);
    avenues.strokeCircle(ax, ay, 90);
    avenues.lineStyle(1, 0xffe0a0, 0.1);
    avenues.strokeCircle(ax, ay, 120);
  }

  // Лёгкая городская пыль / пыльца в воздухе
  const motes = scene.add.graphics().setDepth(Depth.Ambient);
  const motePts = Array.from({ length: 28 }, (_, i) => ({
    x: (8 + (i * 97) % 64) * tw,
    y: (6 + (i * 53) % 44) * tw,
    r: 1.2 + (i % 3) * 0.6,
  }));
  if (
    spawnGpuDriftDots(scene, motePts, {
      color: 0xfff4d8,
      depth: Depth.Ambient,
      duration: 9000,
      xAmp: 18,
      yAmp: 12,
      alpha: 0.14,
    })
  ) {
    motes.destroy();
  } else {
    const drawMotes = (phase: number) => {
      motes.clear();
      for (let i = 0; i < motePts.length; i++) {
        const m = motePts[i]!;
        const ox = m.x + Math.sin(phase + i) * 18;
        const oy = m.y + Math.cos(phase * 0.6 + i * 0.7) * 12;
        motes.fillStyle(0xfff4d8, 0.12 + (i % 2) * 0.06);
        motes.fillCircle(ox, oy, m.r);
      }
    };
    drawMotes(0);
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 9000,
      repeat: -1,
      onUpdate: (tw) => drawMotes(tw.getValue() ?? 0),
    });
  }

  // Чайки над портом — выше игрока, читаемый силуэт с клювом
  const birds = scene.add.graphics().setDepth(Depth.CombatFx);
  const birdPts = [
    { x: 56 * tw, y: 54 * tw, s: 1, sc: 1.35 },
    { x: 63 * tw, y: 58 * tw, s: -1, sc: 1.15 },
    { x: 69 * tw, y: 56 * tw, s: 1, sc: 1.5 },
    { x: 74 * tw, y: 62 * tw, s: -1, sc: 1.25 },
    { x: 80 * tw, y: 54 * tw, s: 1, sc: 1.1 },
    { x: 90 * tw, y: 70 * tw, s: -1, sc: 1.3 },
    { x: 66 * tw, y: 68 * tw, s: 1, sc: 1.2 },
    { x: 52 * tw, y: 60 * tw, s: -1, sc: 1.2 },
    { x: 61 * tw, y: 72 * tw, s: 1, sc: 1.4 },
    { x: 84 * tw, y: 64 * tw, s: -1, sc: 1.25 },
    { x: 70 * tw, y: 78 * tw, s: 1, sc: 1.15 },
    { x: 88 * tw, y: 56 * tw, s: 1, sc: 1.3 },
  ];
  /** Смещение вверх: птицы «висят» в воздухе над пирсом. */
  const FLY_UP = 72;
  const drawBirds = (phase: number) => {
    birds.clear();
    for (let i = 0; i < birdPts.length; i++) {
      const b = birdPts[i]!;
      const dir = b.s;
      const ox = b.x + Math.sin(phase + i * 1.1) * 40 * dir;
      const oy = b.y - FLY_UP + Math.cos(phase * 0.7 + i * 0.8) * 14;
      const flap = 0.55 + 0.45 * Math.sin(phase * 3.4 + i);
      const sc = b.sc;
      const wing = 18 * sc * flap;
      const bodyW = 11 * sc;
      const bodyH = 6 * sc;

      // Тень
      birds.fillStyle(0x000000, 0.2);
      birds.fillEllipse(ox, oy + 14 * sc, 22 * sc, 6 * sc);

      // Крылья \/ — белая середина, серый верх, чёрные концы
      const tipY = oy - 4 * sc * flap;
      const midY = oy + 7 * sc;
      const wingY = oy + 1 * sc;
      birds.fillStyle(0xe8eef4, 0.95);
      birds.fillTriangle(ox - 2 * sc, midY, ox - wing * 0.45, wingY, ox - wing * 0.15, tipY + 2 * sc);
      birds.fillStyle(0xb8c4d0, 0.9);
      birds.fillTriangle(ox - wing * 0.4, wingY, ox - wing, tipY, ox - wing * 0.55, tipY + 3 * sc);
      birds.fillStyle(0x2a3038, 0.95);
      birds.fillTriangle(ox - wing * 0.75, tipY + 1 * sc, ox - wing, tipY, ox - wing * 0.85, tipY + 4 * sc);
      birds.fillStyle(0xe8eef4, 0.95);
      birds.fillTriangle(ox + 2 * sc, midY, ox + wing * 0.45, wingY, ox + wing * 0.15, tipY + 2 * sc);
      birds.fillStyle(0xb8c4d0, 0.9);
      birds.fillTriangle(ox + wing * 0.4, wingY, ox + wing, tipY, ox + wing * 0.55, tipY + 3 * sc);
      birds.fillStyle(0x2a3038, 0.95);
      birds.fillTriangle(ox + wing * 0.75, tipY + 1 * sc, ox + wing, tipY, ox + wing * 0.85, tipY + 4 * sc);

      birds.lineStyle(1.5 * sc, 0xffffff, 0.85);
      birds.beginPath();
      birds.moveTo(ox - wing, tipY);
      birds.lineTo(ox, midY);
      birds.lineTo(ox + wing, tipY);
      birds.strokePath();

      // Туловище + серая спинка
      birds.fillStyle(0xf7fafc, 1);
      birds.fillEllipse(ox, oy + 3 * sc, bodyW, bodyH);
      birds.fillStyle(0xc8d0d8, 0.75);
      birds.fillEllipse(ox, oy + 1.5 * sc, bodyW * 0.7, bodyH * 0.45);

      // Хвост
      birds.fillStyle(0xe0e6ec, 0.95);
      birds.fillTriangle(
        ox - dir * bodyW * 0.35,
        oy + 2 * sc,
        ox - dir * (bodyW * 0.85),
        oy - 1 * sc,
        ox - dir * (bodyW * 0.85),
        oy + 5 * sc,
      );

      // Голова
      const hxBird = ox + dir * (bodyW * 0.55);
      const hyBird = oy + 1.5 * sc;
      birds.fillStyle(0xffffff, 1);
      birds.fillCircle(hxBird, hyBird, 3.2 * sc);

      // Клюв — жёлто-оранжевый клин по направлению полёта
      const beakLen = 5.5 * sc;
      birds.fillStyle(0xf0a020, 1);
      birds.fillTriangle(
        hxBird + dir * 2.2 * sc,
        hyBird - 1.2 * sc,
        hxBird + dir * (2.2 * sc + beakLen),
        hyBird + 0.4 * sc,
        hxBird + dir * 2.2 * sc,
        hyBird + 1.8 * sc,
      );
      birds.fillStyle(0xe06030, 1);
      birds.fillTriangle(
        hxBird + dir * (2.2 * sc + beakLen * 0.55),
        hyBird - 0.3 * sc,
        hxBird + dir * (2.2 * sc + beakLen),
        hyBird + 0.4 * sc,
        hxBird + dir * (2.2 * sc + beakLen * 0.55),
        hyBird + 1.1 * sc,
      );

      // Глаз
      birds.fillStyle(0x1a1a22, 1);
      birds.fillCircle(hxBird + dir * 0.6 * sc, hyBird - 0.6 * sc, 0.9 * sc);
    }
  };
  drawBirds(0);
  if (
    spawnGpuBirds(scene, birdPts, {
      depth: Depth.CombatFx,
      duration: 5500,
      yLift: 72,
      xAmp: 40,
      yAmp: 14,
    })
  ) {
    birds.destroy();
  } else {
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 5500,
      repeat: -1,
      onUpdate: (tw) => drawBirds(tw.getValue() ?? 0),
    });
  }

  // Мелкие птицы над сквером и полями (темнее, меньше чаек)
  const sparrows = scene.add.graphics().setDepth(Depth.CombatFx);
  const sparrowPts = [
    { x: parkX - 40, y: parkY - 20, s: 1 },
    { x: parkX + 50, y: parkY + 10, s: -1 },
    { x: parkX + 10, y: parkY - 50, s: 1 },
    { x: 22 * tw, y: 52 * tw, s: -1 },
    { x: 26 * tw, y: 53 * tw, s: 1 },
    { x: 30 * tw, y: 51 * tw, s: -1 },
  ];
  const drawSparrows = (phase: number) => {
    sparrows.clear();
    for (let i = 0; i < sparrowPts.length; i++) {
      const b = sparrowPts[i]!;
      const dir = b.s;
      const ox = b.x + Math.sin(phase * 1.2 + i) * 28 * dir;
      const oy = b.y - 48 + Math.cos(phase * 0.9 + i * 0.6) * 10;
      const flap = 0.5 + 0.5 * Math.sin(phase * 5 + i * 1.4);
      const wing = 9 * flap;
      sparrows.fillStyle(0x000000, 0.15);
      sparrows.fillEllipse(ox, oy + 10, 10, 3);
      sparrows.fillStyle(0x3a342c, 0.95);
      sparrows.fillEllipse(ox, oy + 1, 6, 3.5);
      sparrows.fillTriangle(ox - wing, oy - 2 * flap, ox, oy + 2, ox - 2, oy + 1);
      sparrows.fillTriangle(ox + wing, oy - 2 * flap, ox, oy + 2, ox + 2, oy + 1);
      sparrows.fillStyle(0x2a241c, 1);
      sparrows.fillCircle(ox + dir * 3, oy, 2);
      sparrows.fillStyle(0xc87830, 1);
      sparrows.fillTriangle(
        ox + dir * 4,
        oy - 0.5,
        ox + dir * 7,
        oy + 0.5,
        ox + dir * 4,
        oy + 1.5,
      );
    }
  };
  drawSparrows(0);
  if (
    spawnGpuBirds(scene, sparrowPts.map((b) => ({ ...b, sc: 0.55 })), {
      depth: Depth.CombatFx,
      duration: 4200,
      yLift: 48,
      xAmp: 28,
      yAmp: 10,
    })
  ) {
    sparrows.destroy();
  } else {
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 4200,
      repeat: -1,
      onUpdate: (tw) => drawSparrows(tw.getValue() ?? 0),
    });
  }

  // Лёгкий туман у порта
  const mist = scene.add.graphics().setDepth(4);
  mist.fillStyle(0xb8c8d8, 0.06);
  mist.fillEllipse(hx, hy + 220, 1400, 520);
  scene.tweens.add({
    targets: mist,
    alpha: { from: 0.5, to: 1 },
    duration: 4000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Маяк — вращающийся луч
  let lighthouse: { x: number; y: number; size: number } | null = null;
  for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
    if (id === 'prop_lighthouse') {
      lighthouse = { x, y, size };
      break;
    }
  }
  if (lighthouse) {
    const lh = lighthouse;
    const beacon = scene.add.graphics().setDepth(Depth.Ambient);
    const drawBeacon = (phase: number) => {
      beacon.clear();
      const ang = phase;
      const reach = 220;
      const tipX = lh.x + Math.cos(ang) * reach;
      const tipY = lh.y - lh.size * 0.35 + Math.sin(ang) * reach * 0.55;
      const ox = lh.x;
      const oy = lh.y - lh.size * 0.38;
      beacon.fillStyle(0xfff0c0, 0.07);
      beacon.fillTriangle(ox, oy, tipX - 28, tipY, tipX + 28, tipY);
      beacon.fillStyle(0xffe8a0, 0.16);
      beacon.fillCircle(ox, oy, 14 + 4 * Math.sin(phase * 3));
      beacon.fillStyle(0xffffff, 0.35);
      beacon.fillCircle(ox, oy, 5);
    };
    drawBeacon(0);
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 7000,
      repeat: -1,
      onUpdate: (tw) => drawBeacon(tw.getValue() ?? 0),
    });
  }

  // Некрополь — холодный туман + мерцание свечей
  const [nx, ny] = px(14, 53);
  const necroMist = scene.add.graphics().setDepth(4);
  const drawNecro = (phase: number) => {
    necroMist.clear();
    necroMist.fillStyle(0x708098, 0.07 + 0.03 * Math.sin(phase));
    necroMist.fillEllipse(nx, ny, 300, 160);
    for (let i = 0; i < 6; i++) {
      const ox = nx + Math.sin(phase + i * 1.1) * (40 + i * 12);
      const oy = ny - 10 + Math.cos(phase * 0.7 + i) * 18;
      necroMist.fillStyle(0x98a8b8, 0.05);
      necroMist.fillEllipse(ox, oy, 50 + i * 6, 18);
    }
    for (let i = 0; i < 5; i++) {
      const ox = nx + (i - 2) * 28 + Math.sin(phase + i) * 3;
      const oy = ny - 8 + Math.cos(phase * 1.2 + i) * 2;
      const flicker = 0.55 + 0.45 * Math.sin(phase * 4 + i * 2.1);
      necroMist.fillStyle(0xffaa44, 0.2 * flicker);
      necroMist.fillCircle(ox, oy, 5 + flicker * 2);
      necroMist.fillStyle(0xffee88, 0.35 * flicker);
      necroMist.fillCircle(ox, oy - 2, 2);
    }
  };
  drawNecro(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 5600,
    repeat: -1,
    onUpdate: (tw) => drawNecro(tw.getValue() ?? 0),
  });

  drawBanner(scene, HAVEN_CITY_BANNER.x, HAVEN_CITY_BANNER.y, HAVEN_CITY_BANNER.text, '#ffcc88');

  // ——— Дом жильцов (спальный квартал) + дымящиеся трубы ———
  const tenementX = 1056;
  const tenementY = 2720;
  const tenementSize = 400;
  {
    const img = placeWorldProp(scene, 'prop_tenement_block', tenementX, tenementY, tenementSize);
    if (!img) {
      const g = scene.add.graphics().setDepth(7);
      g.fillStyle(0x5a5048, 0.92);
      g.fillRoundedRect(tenementX - tenementSize * 0.42, tenementY - tenementSize * 0.48, tenementSize * 0.84, tenementSize * 0.72, 8);
      g.fillStyle(0x3a342e, 0.95);
      g.fillTriangle(
        tenementX - tenementSize * 0.46,
        tenementY - tenementSize * 0.2,
        tenementX + tenementSize * 0.46,
        tenementY - tenementSize * 0.2,
        tenementX,
        tenementY - tenementSize * 0.55,
      );
      g.fillStyle(0x2a2420, 1);
      for (let i = 0; i < 8; i++) {
        const cx = tenementX - tenementSize * 0.32 + i * (tenementSize * 0.09);
        g.fillRect(cx - 4, tenementY - tenementSize * 0.52, 8, 22);
      }
      addPropFootprint(scene, 'prop_tenement_block', tenementX, tenementY, tenementSize);
    }
    const smokeFx = scene.add.graphics().setDepth(Depth.Ambient);
    const chimneys = Array.from({ length: 10 }, (_, i) => ({
      x: tenementX - tenementSize * 0.34 + i * (tenementSize * 0.075),
      y: tenementY - tenementSize * 0.48,
      rise: 42,
    }));
    if (
      spawnGpuPuffs(scene, chimneys, {
        color: 0xb0b0b0,
        depth: Depth.Ambient,
        duration: 3200,
        puffs: 3,
        alpha: 0.18,
      })
    ) {
      smokeFx.destroy();
    } else {
      const drawTenementSmoke = (phase: number) => {
        smokeFx.clear();
        for (let i = 0; i < chimneys.length; i++) {
          const c = chimneys[i]!;
          for (let p = 0; p < 3; p++) {
            const t = (phase + i * 0.55 + p * 0.85) % (Math.PI * 2);
            const rise = ((t / (Math.PI * 2)) * 42) % 42;
            const ox = c.x + Math.sin(t * 2 + p) * (5 + p * 2);
            const oy = c.y - rise;
            const a = 0.18 * (1 - rise / 42);
            smokeFx.fillStyle(0xb0b0b0, a);
            smokeFx.fillCircle(ox, oy, 5 + p * 1.5 + rise * 0.08);
          }
        }
      };
      drawTenementSmoke(0);
      loopDecorCounter(scene, {
        from: 0,
        to: Math.PI * 2,
        duration: 3200,
        repeat: -1,
        onUpdate: (tw) => drawTenementSmoke(tw.getValue() ?? 0),
      });
    }
    if (getGraphicsProfile().havenVignettes) {
      placeHavenTenementLife(scene, tenementX, tenementY, tenementSize);
    }
  }

  // Флаги на древках — лёгкое колыхание полотнища
  const flagGfx = scene.add.graphics().setDepth(Depth.Ambient);
  const flagPoles: { x: number; y: number }[] = [];
  for (const [id, x, y] of HAVEN_CITY_PROPS) {
    if (id !== 'prop_banner_pole') continue;
    flagPoles.push({ x, y });
  }
  if (flagPoles.length > 0) {
    if (spawnGpuFlags(scene, flagPoles, { depth: Depth.Ambient, duration: 2800 })) {
      flagGfx.destroy();
    } else {
      const drawFlags = (phase: number) => {
        flagGfx.clear();
        for (let i = 0; i < flagPoles.length; i++) {
          const p = flagPoles[i]!;
          const wave = Math.sin(phase * 2.2 + i) * 5;
          const topY = p.y - 28;
          flagGfx.fillStyle(0xb02028, 0.85);
          flagGfx.fillTriangle(p.x + 2, topY, p.x + 22 + wave, topY + 6, p.x + 2, topY + 14);
          flagGfx.fillStyle(0xd4a050, 0.7);
          flagGfx.fillCircle(p.x + 10 + wave * 0.4, topY + 7, 2.5);
        }
      };
      drawFlags(0);
      loopDecorCounter(scene, {
        from: 0,
        to: Math.PI * 2,
        duration: 2800,
        repeat: -1,
        onUpdate: (tw) => drawFlags(tw.getValue() ?? 0),
      });
    }
  }

  // Часовая башня — из городского декора; сцена — отдельный модуль
  let clockTower: { x: number; y: number; size: number } | null = null;
  for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
    if (id === 'prop_clock_tower') clockTower = { x, y, size };
  }

  // Городская сцена + бард (масштабный амфитеатр)
  placeHavenStage(scene, HAVEN_STAGE_LAYOUT.x, HAVEN_STAGE_LAYOUT.y, HAVEN_STAGE_LAYOUT.size);

  // Гарнизон: костёр, похлёбка, фехтование
  placeHavenGarrison(scene, HAVEN_GARRISON_LAYOUT.origin.x, HAVEN_GARRISON_LAYOUT.origin.y);
  placeHavenCrafts(scene);

  // Спальный квартал: баскетбольная площадка, дети играют днём
  placeHavenResidentialCourt(scene, HAVEN_RESIDENTIAL_COURT.x, HAVEN_RESIDENTIAL_COURT.y);
  if (getGraphicsProfile().havenVignettes) {
    placeHavenResidentialLife(scene);
  }
  placeHavenNightLife(scene);

  // Resolve resident anchors only after every city module has added its bodies.
  addHavenCitizens(scene);

  // Часовая башня — стрелки
  if (clockTower) {
    const ct = clockTower;
    const hands = scene.add.graphics().setDepth(Depth.Ambient);
    const cx = ct.x;
    const cy = ct.y - ct.size * 0.3;
    const drawHands = (phase: number) => {
      hands.clear();
      hands.fillStyle(0xf0e8d0, 0.35);
      hands.fillCircle(cx, cy, 16);
      hands.lineStyle(2, 0x2a2418, 0.85);
      const hour = phase * 0.2;
      const min = phase;
      hands.lineBetween(cx, cy, cx + Math.sin(hour) * 9, cy - Math.cos(hour) * 9);
      hands.lineStyle(1.5, 0x4a4030, 0.9);
      hands.lineBetween(cx, cy, cx + Math.sin(min) * 13, cy - Math.cos(min) * 13);
      hands.fillStyle(0xb02028, 0.9);
      hands.fillCircle(cx, cy, 2.5);
    };
    drawHands(0);
    loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 20000,
      repeat: -1,
      onUpdate: (tw) => drawHands(tw.getValue() ?? 0),
    });
  }

  // Указатели — подпись района только рядом с игроком
  const SIGN_LABELS: ReadonlyArray<{ tx: number; ty: number; text: string }> = [
    { tx: 32, ty: 18, text: '← Рынок  ·  Форум →' },
    { tx: 48, ty: 24, text: '← Собор  ·  Театр ↓' },
    { tx: 54, ty: 40, text: '↓ Порт' },
    { tx: 20, ty: 36, text: '← Ремёсла  ·  Спальный ↓' },
    { tx: 14, ty: 12, text: 'Гарнизон ↑' },
    { tx: 70, ty: 28, text: 'Восточные ворота →' },
  ];
  const signUi = SIGN_LABELS.map((s) => {
    const [sx, sy] = px(s.tx, s.ty);
    const label = scene.add
      .text(sx, sy - 48, s.text, {
        color: '#f0e6d0',
        fontSize: '12px',
        fontStyle: 'bold',
        backgroundColor: '#1a181288',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(Depth.Ambient)
      .setVisible(false);
    return { x: sx, y: sy, label };
  });
  const SIGN_RANGE_SQ = 110 * 110;
  const onSignUpdate = () => {
    if ((scene.game.loop.frame & 3) !== 0) return;
    const getPlayer = scene.data.get(PLAYER_XY_KEY) as (() => { x: number; y: number } | null) | undefined;
    const player = getPlayer?.() ?? null;
    if (!player) {
      for (const s of signUi) s.label.setVisible(false);
      return;
    }
    for (const s of signUi) {
      const dx = s.x - player.x;
      const dy = s.y - player.y;
      s.label.setVisible(dx * dx + dy * dy < SIGN_RANGE_SQ);
    }
  };
  scene.events.on('update', onSignUpdate);
  scene.events.once('shutdown', () => {
    scene.events.off('update', onSignUpdate);
    for (const s of signUi) s.label.destroy();
  });

  // Рынок — редкие выкрики у прилавков
  const stallPts: { x: number; y: number }[] = [];
  for (const [id, x, y] of HAVEN_CITY_PROPS) {
    if (id === 'prop_market_stall' || id === 'prop_market_canopy') stallPts.push({ x, y });
  }
  if (stallPts.length > 0) {
    const cries = ['Свежая рыба!', 'Пряности!', 'Попробуй сыр!', 'Дешевле не будет!', 'Ткани с востока!'];
    let cryIdx = 0;
    const shout = () => {
      const stall = stallPts[cryIdx % stallPts.length]!;
      const text = cries[cryIdx % cries.length]!;
      cryIdx += 1;
      const t = scene.add
        .text(stall.x, stall.y - 36, text, {
          color: '#ffe8c0',
          fontSize: '11px',
          backgroundColor: '#00000099',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(Depth.Ambient);
      scene.tweens.add({
        targets: t,
        y: t.y - 16,
        alpha: 0,
        duration: 2200,
        onComplete: () => t.destroy(),
      });
    };
    scene.time.addEvent({ delay: 5200, loop: true, callback: shout });
    scene.time.delayedCall(1800, shout);
  }

  // Собор — мягкий луч света с купола
  const cathedralRay = scene.add.graphics().setDepth(3);
  const drawCathRay = (phase: number) => {
    cathedralRay.clear();
    const pulse = 0.55 + 0.45 * Math.sin(phase);
    cathedralRay.fillStyle(0xc8d8ff, 0.06 * pulse);
    cathedralRay.fillTriangle(cx, cy - 90, cx - 55, cy + 40, cx + 55, cy + 40);
    cathedralRay.fillStyle(0xe8f0ff, 0.04 * pulse);
    cathedralRay.fillTriangle(cx, cy - 70, cx - 28, cy + 20, cx + 28, cy + 20);
  };
  drawCathRay(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 4800,
    repeat: -1,
    onUpdate: (tw) => drawCathRay(tw.getValue() ?? 0),
  });
}

function addSilverwoodDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  const fallbackTrees = scene.add.graphics().setDepth(4);
  const blues = [0x4a6888, 0x5a7898, 0x3a5878];
  for (const [x, y] of [
    [100, 160],
    [160, 280],
    [1120, 180],
    [1160, 400],
    [140, 620],
    [1100, 640],
  ]) {
    if (!placeWorldProp(scene, 'prop_tree_silver', x, y, 88)) {
      drawTree(fallbackTrees, x, y, blues[(x + y) % blues.length]!);
    }
  }

  const moonPool = scene.add.graphics().setDepth(3);
  moonPool.fillStyle(0x446688, 0.5);
  moonPool.fillEllipse(320, 380, 120, 70);
  moonPool.fillStyle(0x88ccff, 0.35);
  moonPool.fillEllipse(310, 370, 50, 25);

  const runes = scene.add.graphics().setDepth(5);
  runes.lineStyle(2, 0xaaccff, 0.45);
  runes.strokeCircle(640, 420, 36);
  runes.strokeCircle(640, 420, 22);

  for (const lm of location.landmarks ?? []) {
    if (lm.kind === 'shrine' && !placeWorldProp(scene, 'prop_shrine', lm.x, lm.y, 72)) {
      const shrine = scene.add.graphics().setDepth(6);
      shrine.fillStyle(0x8899aa, 0.85);
      shrine.fillRect(lm.x - 16, lm.y, 32, 24);
      shrine.fillStyle(0xaaccff, 0.6);
      shrine.fillCircle(lm.x, lm.y - 8, 10);
    }
  }
}

function addAshDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  const fallbackRocks = scene.add.graphics().setDepth(4);
  for (const [x, y] of [
    [120, 140],
    [180, 240],
    [1080, 160],
    [1120, 320],
    [160, 580],
    [1060, 620],
  ]) {
    if (!placeWorldProp(scene, 'prop_rock_volcanic', x, y, 56)) {
      drawRock(fallbackRocks, x, y, 0x554433);
    }
  }

  const lava = scene.add.graphics().setDepth(3);
  lava.fillStyle(0x882200, 0.45);
  lava.fillEllipse(640, 320, 140, 60);
  lava.fillStyle(0xff4400, 0.35);
  lava.fillEllipse(630, 312, 60, 28);

  const bones = scene.add.graphics().setDepth(5);
  bones.fillStyle(0xccccaa, 0.7);
  bones.fillEllipse(900, 480, 24, 8);
  bones.fillEllipse(920, 488, 20, 7);

  for (const lm of location.landmarks ?? []) {
    if (lm.kind === 'totem' && !placeWorldProp(scene, 'prop_totem', lm.x, lm.y, 80)) {
      const totem = scene.add.graphics().setDepth(6);
      totem.fillStyle(0x5a4030, 1);
      totem.fillRect(lm.x - 6, lm.y - 20, 12, 40);
      totem.fillStyle(0xff6622, 0.75);
      totem.fillCircle(lm.x, lm.y - 24, 8);
    }
  }
}

function addFieldsDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  const fence = scene.add.graphics().setDepth(4);
  fence.lineStyle(2, 0x8a7040, 0.7);
  for (const x of [120, 280, 440, 600, 760, 920, 1080]) {
    fence.strokeLineShape(new Phaser.Geom.Line(x, 120, x, 760));
  }

  for (const lm of location.landmarks ?? []) {
    if (lm.kind === 'hay_bale') {
      const hay = scene.add.graphics().setDepth(6);
      hay.fillStyle(0xc9a040, 0.95);
      hay.fillEllipse(lm.x, lm.y, 36, 24);
      hay.fillStyle(0x9a7828, 0.85);
      hay.fillEllipse(lm.x - 4, lm.y - 4, 28, 18);
      hay.lineStyle(1, 0x7a6020, 0.6);
      hay.strokeEllipse(lm.x, lm.y, 36, 24);
    }
  }
}

function addDepthsDecorations(scene: Phaser.Scene, location: LocationConfig): void {
  const rocks = scene.add.graphics().setDepth(4);
  rocks.fillStyle(0x2a2438, 0.9);
  for (const [x, y, w, h] of [
    [160, 200, 70, 50],
    [1080, 220, 80, 55],
    [200, 560, 60, 45],
    [1040, 580, 75, 50],
    [480, 140, 90, 40],
    [760, 140, 90, 40],
  ] as Array<[number, number, number, number]>) {
    rocks.fillEllipse(x, y, w, h);
  }
  rocks.fillStyle(0x1a1428, 0.55);
  rocks.fillEllipse(640, 300, 220, 80);

  for (const lm of location.landmarks ?? []) {
    if (lm.kind === 'shrine') {
      const g = scene.add.graphics().setDepth(6);
      g.fillStyle(0x554488, 0.95);
      g.fillRect(lm.x - 10, lm.y - 28, 20, 36);
      g.fillStyle(0x8866cc, 0.8);
      g.fillCircle(lm.x, lm.y - 32, 10);
    }
  }
}

function addParkDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  // Soft plaza under fountain
  g.fillStyle(0x6a6870, 0.14);
  g.fillEllipse(2560, 1520, 520, 360);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = WORLD_STATIC_PROPS['suburban_park']!.map(row => [...row]);

  const lamps: Array<[number, number]> = [
    [2400, 640],
    [2720, 640],
    [960, 1792],
    [1600, 1792],
    [3520, 1792],
    [4160, 1792],
    [2400, 2680],
    [2720, 2680],
    [1280, 1120],
    [3840, 1120],
  ];

  const trees: Array<[number, number]> = [
    [720, 720],
    [1120, 800],
    [4000, 720],
    [4480, 800],
    [640, 2400],
    [960, 2720],
    [4160, 2400],
    [4560, 2720],
    [1920, 640],
    [3200, 640],
    [1920, 3040],
    [3200, 3040],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x5a6a48, 0.45);
      g.fillCircle(x, y, size * 0.22);
    });
  }
  for (const [x, y] of lamps) {
    placeOrDraw(scene, 'prop_street_lamp', x, y, 58, 6, () => {
      g.fillStyle(0x444444, 1);
      g.fillRect(x - 2, y - 14, 4, 26);
      g.fillStyle(0xffdd88, 0.7);
      g.fillCircle(x, y - 16, 6);
    });
  }
  for (const [x, y] of trees) {
    const bush = (x + y) % 5 === 0;
    placeOrDraw(scene, bush ? 'prop_bush_garden' : 'prop_tree_oak', x, y, bush ? 72 : 110, 4, () => {
      g.fillStyle(bush ? 0x3a7040 : 0x2a6038, 0.85);
      g.fillCircle(x, y, bush ? 16 : 26);
    });
  }

  drawBanner(scene, 2560, 560, '🌳 Пригородный парк', '#a8d090');
}

function addYardDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x5a5040, 0.16);
  g.fillRect(1800, 1200, 2000, 1400);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_warehouse', 3600, 1600, 200, 7],
    ['prop_crate_stack', 3200, 1480, 90, 5],
    ['prop_crate_stack', 3920, 1720, 90, 5],
    ['prop_crate_stack', 2080, 2000, 85, 5],
    ['prop_barrels', 3400, 1760, 75, 5],
    ['prop_barrels', 3760, 1440, 75, 5],
    ['prop_barrels', 2400, 2200, 70, 5],
    ['prop_merchant_cart', 2880, 1920, 100, 6],
    ['prop_signpost', 480, 1680, 70, 6],
    ['prop_signpost', 4640, 1680, 70, 6],
    ['prop_guard_tower', 1200, 960, 130, 7],
    ['prop_guard_tower', 4000, 960, 130, 7],
    ['prop_city_gate', 320, 1792, 160, 7],
  ];

  const rubble: Array<[number, number]> = [
    [1600, 1200],
    [1920, 1600],
    [2560, 1400],
    [3040, 2200],
    [3520, 2480],
    [4160, 2000],
    [1280, 2200],
    [2240, 2680],
    [3680, 2800],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x6a5a48, 0.5);
      g.fillRect(x - size * 0.25, y - size * 0.18, size * 0.5, size * 0.36);
    });
  }

  for (const [x, y] of rubble) {
    placeOrDraw(scene, 'prop_rock_volcanic', x, y, 70, 4, () => {
      g.fillStyle(0x666655, 0.8);
      g.fillEllipse(x, y, 36, 22);
    });
  }

  // Scaffolding-ish lamps along roads
  for (const [x, y] of [
    [960, 1792],
    [1600, 1792],
    [3520, 1792],
    [4160, 1792],
    [2400, 960],
    [2720, 960],
    [2400, 2680],
    [2720, 2680],
  ] as Array<[number, number]>) {
    placeOrDraw(scene, 'prop_street_lamp', x, y, 56, 6, () => {
      g.fillStyle(0x444444, 1);
      g.fillRect(x - 2, y - 14, 4, 26);
      g.fillStyle(0xffcc66, 0.65);
      g.fillCircle(x, y - 16, 6);
    });
  }

  drawBanner(scene, 2560, 560, '🏗 Заброшенная стройка', '#d4b080');
}

function addDistrictDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  // Cross glow under central shrine
  g.fillStyle(0x6644aa, 0.12);
  g.fillEllipse(2560, 1792, 640, 420);
  g.lineStyle(3, 0x8866cc, 0.25);
  g.strokeCircle(2560, 1792, 280);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 120, 7],
    ['prop_banner_pole', 2320, 1600, 80, 6],
    ['prop_banner_pole', 2800, 1600, 80, 6],
    ['prop_banner_pole', 2320, 2000, 80, 6],
    ['prop_banner_pole', 2800, 2000, 80, 6],
    ['prop_street_lamp', 2080, 1792, 64, 6],
    ['prop_street_lamp', 3040, 1792, 64, 6],
    ['prop_street_lamp', 2560, 1280, 64, 6],
    ['prop_street_lamp', 2560, 2304, 64, 6],
    ['prop_street_lamp', 1280, 1792, 64, 6],
    ['prop_street_lamp', 3840, 1792, 64, 6],
    ['prop_crate_stack', 1760, 1520, 80, 5],
    ['prop_crate_stack', 3360, 2080, 80, 5],
    ['prop_barrels', 1920, 2080, 70, 5],
    ['prop_barrels', 3200, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
    ['prop_guard_tower', 960, 960, 130, 7],
    ['prop_guard_tower', 4160, 960, 130, 7],
    ['prop_guard_tower', 960, 2680, 130, 7],
    ['prop_guard_tower', 4160, 2680, 130, 7],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x554488, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 480, '✦ Перекрёсток Разлома', '#c8a0ff');
}

function addSignalDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x226655, 0.1);
  g.fillEllipse(2560, 1792, 700, 460);
  g.lineStyle(2, 0x66ccaa, 0.28);
  g.strokeCircle(2560, 1792, 300);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 110, 7],
    ['prop_guard_tower', 2560, 960, 140, 7],
    ['prop_guard_tower', 1600, 1600, 120, 7],
    ['prop_guard_tower', 3520, 1600, 120, 7],
    ['prop_guard_tower', 1600, 2200, 120, 7],
    ['prop_guard_tower', 3520, 2200, 120, 7],
    ['prop_street_lamp', 2080, 1792, 64, 6],
    ['prop_street_lamp', 3040, 1792, 64, 6],
    ['prop_street_lamp', 2560, 1280, 64, 6],
    ['prop_street_lamp', 2560, 2304, 64, 6],
    ['prop_street_lamp', 1120, 1792, 64, 6],
    ['prop_street_lamp', 4000, 1792, 64, 6],
    ['prop_crate_stack', 1920, 1440, 80, 5],
    ['prop_crate_stack', 3200, 2160, 80, 5],
    ['prop_barrels', 2240, 2160, 70, 5],
    ['prop_barrels', 2880, 1440, 70, 5],
    ['prop_banner_pole', 2400, 1600, 80, 6],
    ['prop_banner_pole', 2720, 1600, 80, 6],
    ['prop_banner_pole', 2400, 2000, 80, 6],
    ['prop_banner_pole', 2720, 2000, 80, 6],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x448866, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 480, '📡 Квартал Сигнала', '#88e0c0');
}

function addRelayDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x336688, 0.12);
  g.fillEllipse(2560, 1792, 720, 480);
  g.lineStyle(3, 0x88ccee, 0.3);
  g.strokeCircle(2560, 1792, 260);
  g.lineStyle(2, 0x66aacc, 0.2);
  g.strokeCircle(2560, 1792, 360);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 130, 7],
    ['prop_guard_tower', 2560, 880, 150, 8],
    ['prop_guard_tower', 1920, 1400, 110, 7],
    ['prop_guard_tower', 3200, 1400, 110, 7],
    ['prop_guard_tower', 1920, 2200, 110, 7],
    ['prop_guard_tower', 3200, 2200, 110, 7],
    ['prop_banner_pole', 2360, 1560, 80, 6],
    ['prop_banner_pole', 2760, 1560, 80, 6],
    ['prop_banner_pole', 2360, 2040, 80, 6],
    ['prop_banner_pole', 2760, 2040, 80, 6],
    ['prop_street_lamp', 2080, 1792, 64, 6],
    ['prop_street_lamp', 3040, 1792, 64, 6],
    ['prop_street_lamp', 2560, 1280, 64, 6],
    ['prop_street_lamp', 2560, 2304, 64, 6],
    ['prop_crate_stack', 1760, 1600, 80, 5],
    ['prop_crate_stack', 3360, 2000, 80, 5],
    ['prop_barrels', 2000, 2080, 70, 5],
    ['prop_barrels', 3120, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x4488aa, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 420, '🗼 Релейный шпиль', '#a0d8f0');
}

function addCoreDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x226655, 0.14);
  g.fillEllipse(2560, 1792, 780, 520);
  g.lineStyle(4, 0x66e0cc, 0.35);
  g.strokeCircle(2560, 1792, 220);
  g.lineStyle(2, 0x44aa99, 0.22);
  g.strokeCircle(2560, 1792, 340);
  g.lineStyle(2, 0x338877, 0.15);
  g.strokeCircle(2560, 1792, 460);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 140, 8],
    ['prop_guard_tower', 1760, 1120, 120, 7],
    ['prop_guard_tower', 3360, 1120, 120, 7],
    ['prop_guard_tower', 1760, 2480, 120, 7],
    ['prop_guard_tower', 3360, 2480, 120, 7],
    ['prop_banner_pole', 2280, 1520, 80, 6],
    ['prop_banner_pole', 2840, 1520, 80, 6],
    ['prop_banner_pole', 2280, 2080, 80, 6],
    ['prop_banner_pole', 2840, 2080, 80, 6],
    ['prop_street_lamp', 2080, 1600, 64, 6],
    ['prop_street_lamp', 3040, 1600, 64, 6],
    ['prop_street_lamp', 2080, 2000, 64, 6],
    ['prop_street_lamp', 3040, 2000, 64, 6],
    ['prop_crate_stack', 1600, 1680, 80, 5],
    ['prop_crate_stack', 3520, 1920, 80, 5],
    ['prop_barrels', 1920, 2200, 70, 5],
    ['prop_barrels', 3200, 1400, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
    ['prop_totem', 2560, 1280, 90, 6],
    ['prop_totem', 2560, 2304, 90, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x44aa88, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '⚡ Ядро Статики', '#7aefd0');
}

function addChaosDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x661133, 0.12);
  g.fillEllipse(2560, 1792, 800, 540);
  g.lineStyle(3, 0xcc4466, 0.28);
  g.strokeCircle(2560, 1792, 280);
  g.lineStyle(2, 0xaa3355, 0.18);
  g.strokeCircle(2560, 1400, 160);
  g.strokeCircle(2560, 2200, 160);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 130, 7],
    ['prop_totem', 2080, 1400, 100, 6],
    ['prop_totem', 3040, 1400, 100, 6],
    ['prop_totem', 2080, 2200, 100, 6],
    ['prop_totem', 3040, 2200, 100, 6],
    ['prop_rock_volcanic', 1600, 1120, 90, 5],
    ['prop_rock_volcanic', 3680, 2400, 90, 5],
    ['prop_rock_volcanic', 3840, 1280, 80, 5],
    ['prop_rock_volcanic', 1440, 2480, 80, 5],
    ['prop_banner_pole', 2320, 1560, 80, 6],
    ['prop_banner_pole', 2800, 1560, 80, 6],
    ['prop_banner_pole', 2320, 2040, 80, 6],
    ['prop_banner_pole', 2800, 2040, 80, 6],
    ['prop_crate_stack', 1760, 1680, 80, 5],
    ['prop_crate_stack', 3360, 1920, 80, 5],
    ['prop_barrels', 1920, 2080, 70, 5],
    ['prop_barrels', 3200, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
    ['prop_campfire', 1280, 1600, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x883344, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '✧ Сектор Хаоса', '#e080a0');
}

function addFractureDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x551122, 0.14);
  g.fillEllipse(2560, 1792, 760, 500);
  g.lineStyle(3, 0xaa4466, 0.3);
  g.strokeCircle(2560, 1792, 260);
  g.lineStyle(2, 0x883344, 0.2);
  g.lineBetween(1600, 1200, 3520, 2400);
  g.lineBetween(3520, 1200, 1600, 2400);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 120, 7],
    ['prop_rock_volcanic', 1760, 1280, 100, 5],
    ['prop_rock_volcanic', 3360, 1280, 100, 5],
    ['prop_rock_volcanic', 1760, 2304, 100, 5],
    ['prop_rock_volcanic', 3360, 2304, 100, 5],
    ['prop_rock_volcanic', 2560, 1120, 90, 5],
    ['prop_rock_volcanic', 2560, 2480, 90, 5],
    ['prop_totem', 2080, 1600, 90, 6],
    ['prop_totem', 3040, 1600, 90, 6],
    ['prop_totem', 2080, 2000, 90, 6],
    ['prop_totem', 3040, 2000, 90, 6],
    ['prop_banner_pole', 2360, 1560, 80, 6],
    ['prop_banner_pole', 2760, 1560, 80, 6],
    ['prop_crate_stack', 1600, 1760, 80, 5],
    ['prop_crate_stack', 3520, 1760, 80, 5],
    ['prop_barrels', 1920, 2160, 70, 5],
    ['prop_barrels', 3200, 1440, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x883344, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '⛰ Гребень Разлома', '#d07090');
}

function addVoidScarDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x441122, 0.16);
  g.fillEllipse(2560, 1792, 820, 540);
  g.lineStyle(4, 0xcc4466, 0.35);
  g.strokeCircle(2560, 1792, 240);
  g.lineStyle(2, 0x882244, 0.22);
  g.strokeCircle(2560, 1792, 380);
  g.lineStyle(2, 0x661133, 0.15);
  g.strokeCircle(2560, 1792, 500);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 150, 8],
    ['prop_rock_volcanic', 1600, 1200, 110, 5],
    ['prop_rock_volcanic', 3520, 1200, 110, 5],
    ['prop_rock_volcanic', 1600, 2400, 110, 5],
    ['prop_rock_volcanic', 3520, 2400, 110, 5],
    ['prop_rock_volcanic', 2080, 1600, 90, 5],
    ['prop_rock_volcanic', 3040, 2000, 90, 5],
    ['prop_totem', 2240, 1400, 100, 6],
    ['prop_totem', 2880, 1400, 100, 6],
    ['prop_totem', 2240, 2200, 100, 6],
    ['prop_totem', 2880, 2200, 100, 6],
    ['prop_banner_pole', 2400, 1560, 80, 6],
    ['prop_banner_pole', 2720, 1560, 80, 6],
    ['prop_crate_stack', 1760, 1760, 80, 5],
    ['prop_crate_stack', 3360, 1760, 80, 5],
    ['prop_barrels', 1920, 2080, 70, 5],
    ['prop_barrels', 3200, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
    ['prop_campfire', 2560, 1280, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x883344, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '☠ Шрам Пустоты', '#e07090');
}

function addCollapseDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x331018, 0.14);
  g.fillEllipse(2560, 1792, 800, 520);
  g.lineStyle(3, 0x884466, 0.3);
  g.strokeCircle(2560, 1792, 280);
  g.lineStyle(2, 0x662244, 0.18);
  g.strokeCircle(2560, 1400, 180);
  g.strokeCircle(2560, 2200, 180);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 130, 7],
    ['prop_rock_volcanic', 1600, 1120, 100, 5],
    ['prop_rock_volcanic', 3680, 2400, 100, 5],
    ['prop_rock_volcanic', 3840, 1280, 90, 5],
    ['prop_rock_volcanic', 1440, 2480, 90, 5],
    ['prop_totem', 2080, 1400, 100, 6],
    ['prop_totem', 3040, 1400, 100, 6],
    ['prop_totem', 2080, 2200, 100, 6],
    ['prop_totem', 3040, 2200, 100, 6],
    ['prop_banner_pole', 2320, 1560, 80, 6],
    ['prop_banner_pole', 2800, 1560, 80, 6],
    ['prop_banner_pole', 2320, 2040, 80, 6],
    ['prop_banner_pole', 2800, 2040, 80, 6],
    ['prop_crate_stack', 1760, 1680, 80, 5],
    ['prop_crate_stack', 3360, 1920, 80, 5],
    ['prop_barrels', 1920, 2080, 70, 5],
    ['prop_barrels', 3200, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
    ['prop_campfire', 1280, 1600, 70, 6],
    ['prop_guard_tower', 2560, 960, 140, 7],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x774455, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '🌑 Окраина Коллапса', '#c080a0');
}

function addApproachDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x2a1018, 0.14);
  g.fillEllipse(2560, 1792, 760, 500);
  g.lineStyle(3, 0xaa3366, 0.32);
  g.strokeCircle(2560, 1792, 260);
  g.lineStyle(2, 0x773355, 0.2);
  g.lineBetween(1280, 960, 3840, 960);
  g.lineBetween(1280, 960, 1280, 1120);
  g.lineBetween(3840, 960, 3840, 1120);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = WORLD_STATIC_PROPS['citadel_approach']!.map(row => [...row]);

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0x883355, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '🏰 Подступы к Цитадели', '#d090b0');
}

function addCitadelDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x3a1020, 0.16);
  g.fillEllipse(2560, 1792, 840, 560);
  g.lineStyle(4, 0xdd6699, 0.38);
  g.strokeCircle(2560, 1792, 220);
  g.lineStyle(2, 0xaa4477, 0.24);
  g.strokeCircle(2560, 1792, 360);
  g.lineStyle(2, 0x773355, 0.16);
  g.strokeCircle(2560, 1792, 480);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 160, 8],
    ['prop_guard_tower', 1760, 1120, 140, 7],
    ['prop_guard_tower', 3360, 1120, 140, 7],
    ['prop_guard_tower', 1760, 2480, 140, 7],
    ['prop_guard_tower', 3360, 2480, 140, 7],
    ['prop_banner_pole', 2280, 1520, 90, 6],
    ['prop_banner_pole', 2840, 1520, 90, 6],
    ['prop_banner_pole', 2280, 2080, 90, 6],
    ['prop_banner_pole', 2840, 2080, 90, 6],
    ['prop_totem', 2080, 1400, 110, 6],
    ['prop_totem', 3040, 1400, 110, 6],
    ['prop_totem', 2080, 2200, 110, 6],
    ['prop_totem', 3040, 2200, 110, 6],
    ['prop_rock_volcanic', 1600, 1600, 100, 5],
    ['prop_rock_volcanic', 3520, 2000, 100, 5],
    ['prop_crate_stack', 1920, 1760, 80, 5],
    ['prop_crate_stack', 3200, 1760, 80, 5],
    ['prop_barrels', 2240, 2160, 70, 5],
    ['prop_barrels', 2880, 1440, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0xaa4477, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '✦ Цитадель Сингулярности', '#f0a0c0');
}

function addGodsRiftDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x3a2810, 0.14);
  g.fillEllipse(2560, 1792, 820, 540);
  g.lineStyle(3, 0xe8c060, 0.36);
  g.strokeCircle(2560, 1792, 240);
  g.lineStyle(2, 0xc09040, 0.22);
  g.strokeCircle(2560, 1792, 380);
  g.lineStyle(2, 0x886030, 0.14);
  g.lineBetween(1280, 960, 3840, 960);
  g.lineBetween(1280, 960, 1280, 1120);
  g.lineBetween(3840, 960, 3840, 1120);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 140, 8],
    ['prop_totem', 1760, 1120, 120, 7],
    ['prop_totem', 3360, 1120, 120, 7],
    ['prop_totem', 1760, 2480, 120, 7],
    ['prop_totem', 3360, 2480, 120, 7],
    ['prop_banner_pole', 2280, 1520, 90, 6],
    ['prop_banner_pole', 2840, 1520, 90, 6],
    ['prop_banner_pole', 2280, 2080, 90, 6],
    ['prop_banner_pole', 2840, 2080, 90, 6],
    ['prop_guard_tower', 1600, 1600, 130, 7],
    ['prop_guard_tower', 3520, 2000, 130, 7],
    ['prop_rock_volcanic', 1920, 1280, 95, 5],
    ['prop_rock_volcanic', 3200, 2304, 95, 5],
    ['prop_crate_stack', 1760, 1760, 80, 5],
    ['prop_crate_stack', 3360, 1760, 80, 5],
    ['prop_barrels', 2000, 2080, 70, 5],
    ['prop_barrels', 3120, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0xd4a840, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '⚡ Разлом Богов', '#f0d080');
}

function addPantheonDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x3a3018, 0.14);
  g.fillEllipse(2560, 1792, 780, 520);
  g.lineStyle(3, 0xf0d060, 0.34);
  g.strokeCircle(2560, 1792, 250);
  g.lineStyle(2, 0xc09040, 0.2);
  g.lineBetween(1280, 800, 3840, 800);
  g.lineBetween(1600, 800, 1600, 1120);
  g.lineBetween(3520, 800, 3520, 1120);
  g.lineBetween(1920, 1120, 3200, 1120);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 130, 8],
    ['prop_guard_tower', 1600, 1120, 135, 7],
    ['prop_guard_tower', 3520, 1120, 135, 7],
    ['prop_guard_tower', 1600, 2480, 135, 7],
    ['prop_guard_tower', 3520, 2480, 135, 7],
    ['prop_totem', 2080, 1400, 110, 6],
    ['prop_totem', 3040, 1400, 110, 6],
    ['prop_totem', 2080, 2200, 110, 6],
    ['prop_totem', 3040, 2200, 110, 6],
    ['prop_banner_pole', 2360, 1560, 85, 6],
    ['prop_banner_pole', 2760, 1560, 85, 6],
    ['prop_banner_pole', 2360, 2040, 85, 6],
    ['prop_banner_pole', 2760, 2040, 85, 6],
    ['prop_rock_volcanic', 1920, 1280, 90, 5],
    ['prop_rock_volcanic', 3200, 2304, 90, 5],
    ['prop_crate_stack', 1760, 1760, 80, 5],
    ['prop_crate_stack', 3360, 1760, 80, 5],
    ['prop_barrels', 2000, 2080, 70, 5],
    ['prop_barrels', 3120, 1520, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0xe8c060, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '🏛 Подъём Пантеона', '#f5e0a0');
}

function addGodfallDecorations(scene: Phaser.Scene, _location: LocationConfig): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x3a3010, 0.16);
  g.fillEllipse(2560, 1792, 860, 580);
  g.lineStyle(4, 0xf0d060, 0.4);
  g.strokeCircle(2560, 1792, 220);
  g.lineStyle(2, 0xd4a840, 0.26);
  g.strokeCircle(2560, 1792, 360);
  g.lineStyle(2, 0x886030, 0.16);
  g.strokeCircle(2560, 1792, 500);

  type Spot = [string, number, number, number, number];
  const props: Spot[] = [
    ['prop_shrine', 2560, 1792, 170, 8],
    ['prop_guard_tower', 1760, 1120, 145, 7],
    ['prop_guard_tower', 3360, 1120, 145, 7],
    ['prop_guard_tower', 1760, 2480, 145, 7],
    ['prop_guard_tower', 3360, 2480, 145, 7],
    ['prop_banner_pole', 2280, 1520, 95, 6],
    ['prop_banner_pole', 2840, 1520, 95, 6],
    ['prop_banner_pole', 2280, 2080, 95, 6],
    ['prop_banner_pole', 2840, 2080, 95, 6],
    ['prop_totem', 2080, 1400, 120, 6],
    ['prop_totem', 3040, 1400, 120, 6],
    ['prop_totem', 2080, 2200, 120, 6],
    ['prop_totem', 3040, 2200, 120, 6],
    ['prop_rock_volcanic', 1600, 1600, 105, 5],
    ['prop_rock_volcanic', 3520, 2000, 105, 5],
    ['prop_crate_stack', 1920, 1760, 80, 5],
    ['prop_crate_stack', 3200, 1760, 80, 5],
    ['prop_barrels', 2240, 2160, 70, 5],
    ['prop_barrels', 2880, 1440, 70, 5],
    ['prop_signpost', 480, 1680, 70, 6],
  ];

  for (const [id, x, y, size, depth] of props) {
    placeOrDraw(scene, id, x, y, size, depth, () => {
      g.fillStyle(0xf0d060, 0.45);
      g.fillCircle(x, y, size * 0.2);
    });
  }

  drawBanner(scene, 2560, 400, '👑 Трон Падения Богов', '#ffe8a0');
}

const LOCATION_TINT: Record<string, number> = {};

export function tintMapLayer(layer: GroundLayer | null, locationId: string): void {
  const tint = LOCATION_TINT[locationId];
  const paintable = layer as (GroundLayer & { setTint?: (c: number) => unknown }) | null;
  if (paintable && typeof paintable.setTint === 'function') {
    paintable.setTint(tint ?? 0xffffff);
  }
}

export function applyGroundLayerStyle(layer: GroundLayer | null, locationId: string): void {
  if (!layer) return;
  layer.setAlpha(1);
  // Terrain must stay NEAREST — LINEAR + cobble frequency = shimmer/рябь while scrolling.
  layer.scene?.textures?.get('terrain-tiles')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  void locationId;
}

export function applyMapCollision(_map: Phaser.Tilemaps.Tilemap, layer: GroundLayer | null): void {
  if (!layer) return;
  layer.setCollisionByExclusion([...WALKABLE_TILE_GIDS]);
  const world = layer.scene?.physics?.world as { TILE_BIAS?: number } | undefined;
  if (world && typeof world.TILE_BIAS === 'number') {
    // 64px tiles + dash 420: default 16 lets a slow frame tunnel a wall cell.
    world.TILE_BIAS = 40;
  }
}

export function addLocationBackground(
  _scene: Phaser.Scene,
  _location: LocationConfig,
  _mapW: number,
  _mapH: number,
): void {
  // Фон локации — только меню/travel UI; в геймплее растяжка портит картинку.
}
