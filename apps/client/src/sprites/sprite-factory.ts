import Phaser from 'phaser';
import { citizenAppearance, type CitizenAppearance } from '@empery/shared';
import { PLAYER_WALK_CYCLE, walkingLegPose } from './walking-pose.js';
import { facingRow, type Facing8, type SpriteFacingRow } from './facing4.js';
import {
  NPC_CHARACTER_IDS,
  npcAnimPrefix,
  npcFramePrefix,
  npcIsProp,
  npcWorldDef,
  type NpcWorldDef,
} from './npc-catalog.js';
import { ENEMY_WORLD_ATLAS_KEY } from './enemy-sprite-resolve.js';
import {
  cacheGearStrip,
  cloakFrameName,
  cloakFramePrefix,
  ensureGearAtlas,
  GEAR_ATLAS_KEY,
  getCachedGearStrip,
  hasGearStrip,
  shieldFrameName,
  shieldFramePrefix,
  weaponFrameName,
  weaponFramePrefix,
} from './gear-atlas.js';

const FW = 48;
const FH = 48;
const FRAMES = 6;

type CharKind = 'human' | 'elf' | 'orc';
type EnemyKind = 'goblin' | 'shadow' | 'wolf' | 'cinder' | 'bone' | 'orc_grunt';

interface Palette {
  skin: number;
  hair: number;
  body: number;
  trim: number;
  weapon: number;
  eye: number;
}

const PALETTES: Record<CharKind, Palette> = {
  human: { skin: 0xf0c8a0, hair: 0x5a4030, body: 0x3a6ea5, trim: 0xc9a66b, weapon: 0xd0d0d0, eye: 0x222222 },
  elf: { skin: 0xe8d8c8, hair: 0xd4af37, body: 0x2d6a4f, trim: 0x95d5b2, weapon: 0xa8dadc, eye: 0x1b4332 },
  orc: { skin: 0x6a9a5a, hair: 0x2d2d2d, body: 0x8b3a3a, trim: 0x4a2828, weapon: 0x909090, eye: 0xff4444 },
};

/** Female variants: longer hair tone + slightly softer body colors. */
const FEMALE_PALETTES: Record<CharKind, Palette> = {
  human: { skin: 0xf2cbb0, hair: 0x7a4830, body: 0x4a7ab0, trim: 0xd0b078, weapon: 0xd0d0d0, eye: 0x333344 },
  elf: { skin: 0xeee0d4, hair: 0xe8d090, body: 0x357a5c, trim: 0xa8e0c0, weapon: 0xa8dadc, eye: 0x1b4332 },
  orc: { skin: 0x72a462, hair: 0x3a1818, body: 0x7a4040, trim: 0x5a3030, weapon: 0x909090, eye: 0xff5555 },
};

type PlayerGender = 'male' | 'female';

const ENEMY_PALETTES: Record<EnemyKind, Palette> = {
  goblin: { skin: 0x6aad4a, hair: 0x1a3010, body: 0x3d5528, trim: 0x2a4018, weapon: 0x8a7040, eye: 0xffee00 },
  shadow: { skin: 0x3a2850, hair: 0x120818, body: 0x1a1428, trim: 0x5a4080, weapon: 0x9933cc, eye: 0xcc88ff },
  wolf: { skin: 0x8a7a6a, hair: 0x5a4a3a, body: 0x6a5a4a, trim: 0x4a3a2a, weapon: 0xcccccc, eye: 0xffaa44 },
  cinder: { skin: 0xff6633, hair: 0x331100, body: 0x992211, trim: 0xffaa22, weapon: 0xff4400, eye: 0xffff44 },
  bone: { skin: 0xd8d0c0, hair: 0x888880, body: 0xa8a098, trim: 0x686860, weapon: 0xccccbb, eye: 0x44ff88 },
  orc_grunt: { skin: 0x5a8a48, hair: 0x1a1a1a, body: 0x6a2828, trim: 0x3a1818, weapon: 0x888888, eye: 0xff2222 },
};

export const ENEMY_SPRITE: Record<string, { kind: EnemyKind; prefix: string; displayScale: number }> = {
  goblin_scout: { kind: 'goblin', prefix: 'goblin', displayScale: 0.92 },
  field_scavenger: { kind: 'goblin', prefix: 'goblin', displayScale: 0.86 },
  shadow_thug: { kind: 'shadow', prefix: 'shadow', displayScale: 1.02 },
  forest_wolf: { kind: 'wolf', prefix: 'wolf', displayScale: 1.05 },
  cinder_imp: { kind: 'cinder', prefix: 'cinder', displayScale: 0.88 },
  bone_walker: { kind: 'bone', prefix: 'bone', displayScale: 1.08 },
  cave_stalker: { kind: 'shadow', prefix: 'shadow', displayScale: 1.06 },
  deep_wraith: { kind: 'bone', prefix: 'bone', displayScale: 1.12 },
  shadow_overlord: { kind: 'shadow', prefix: 'shadow', displayScale: 1.35 },
  park_hound: { kind: 'wolf', prefix: 'wolf', displayScale: 0.98 },
  park_looter: { kind: 'goblin', prefix: 'goblin', displayScale: 0.9 },
  yard_dog: { kind: 'wolf', prefix: 'wolf', displayScale: 1.08 },
  yard_brute: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.05 },
  neon_shade: { kind: 'shadow', prefix: 'shadow', displayScale: 1.1 },
  rift_stalker: { kind: 'shadow', prefix: 'shadow', displayScale: 1.18 },
  crystal_wisp: { kind: 'cinder', prefix: 'cinder', displayScale: 0.82 },
  signal_drone: { kind: 'cinder', prefix: 'cinder', displayScale: 0.86 },
  static_fiend: { kind: 'bone', prefix: 'bone', displayScale: 1.14 },
  echo_wraith: { kind: 'bone', prefix: 'bone', displayScale: 1.08 },
  pulse_hound: { kind: 'wolf', prefix: 'wolf', displayScale: 1.12 },
  null_shade: { kind: 'shadow', prefix: 'shadow', displayScale: 1.12 },
  static_colossus: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.45 },
  warp_spawn: { kind: 'shadow', prefix: 'shadow', displayScale: 1.0 },
  chaos_reaver: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.22 },
  fold_horror: { kind: 'bone', prefix: 'bone', displayScale: 1.16 },
  rift_maw: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.28 },
  scar_wraith: { kind: 'shadow', prefix: 'shadow', displayScale: 1.14 },
  void_leviathan: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.55 },
  collapse_spawn: { kind: 'cinder', prefix: 'cinder', displayScale: 0.95 },
  entropy_hound: { kind: 'wolf', prefix: 'wolf', displayScale: 1.2 },
  siege_wraith: { kind: 'bone', prefix: 'bone', displayScale: 1.18 },
  null_knight: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.3 },
  singularity_shade: { kind: 'shadow', prefix: 'shadow', displayScale: 1.16 },
  singularity_avatar: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.65 },
  divine_echo: { kind: 'shadow', prefix: 'shadow', displayScale: 1.2 },
  godshard_hound: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.12 },
  pantheon_sentinel: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.28 },
  idol_wraith: { kind: 'bone', prefix: 'bone', displayScale: 1.14 },
  throne_shade: { kind: 'shadow', prefix: 'shadow', displayScale: 1.22 },
  fallen_sovereign: { kind: 'orc_grunt', prefix: 'orc_grunt', displayScale: 1.72 },
};

type WeaponStyle = 'none' | 'melee' | 'bow' | 'staff';

function drawMeleeWeapon(
  g: Phaser.GameObjects.Graphics,
  facing: SpriteFacingRow,
  attack: boolean,
  cx: number,
  cy: number,
  bob: number,
  color: number,
): void {
  if (facing === 'up') {
    g.fillStyle(0x1a1410, 1);
    g.fillRect(cx + 8, cy - 4 + bob, 3.5, 12);
    g.fillStyle(color, 1);
    g.fillRect(cx + 8.5, cy - 3 + bob, 2.5, 10);
  } else if (facing === 'up-side') {
    g.fillStyle(0x1a1410, 1);
    g.fillRect(cx + 9, cy - 2 + bob, 9, 3);
    g.fillStyle(color, 1);
    g.fillRect(cx + 10, cy - 1.5 + bob, 7.5, 2);
  } else if (facing === 'side') {
    g.fillStyle(0x1a1410, 1);
    if (attack) {
      g.fillRect(cx + 12, cy - 6 + bob, 10, 4);
      g.fillStyle(color, 1);
      g.fillRect(cx + 13, cy - 5 + bob, 9, 2.5);
      g.lineStyle(2, 0xffcc66, 0.85);
      g.strokeCircle(cx + 16, cy - 4 + bob, 6);
    } else {
      g.fillRect(cx + 10, cy - 1 + bob, 12, 3.5);
      g.fillStyle(color, 1);
      g.fillRect(cx + 11, cy - 0.5 + bob, 10, 2.5);
    }
  } else if (facing === 'down-side') {
    g.fillStyle(0x1a1410, 1);
    if (attack) {
      g.fillRect(cx + 11, cy - 7 + bob, 5, 16);
      g.fillStyle(color, 1);
      g.fillRect(cx + 12, cy - 6 + bob, 3.5, 14);
      g.lineStyle(2, 0xffcc66, 0.8);
      g.strokeCircle(cx + 13, cy - 1 + bob, 8);
    } else {
      g.fillRect(cx + 9, cy - 2 + bob, 4, 12);
      g.fillStyle(color, 1);
      g.fillRect(cx + 9.5, cy - 1 + bob, 3, 10);
    }
  } else {
    g.fillStyle(0x1a1410, 1);
    if (attack) {
      g.fillRect(cx + 11, cy - 9 + bob, 5, 20);
      g.fillStyle(color, 1);
      g.fillRect(cx + 12, cy - 8 + bob, 3.5, 18);
      g.fillStyle(0xffffff, 0.35);
      g.fillRect(cx + 12.5, cy - 6 + bob, 1.5, 8);
      g.lineStyle(2, 0xffcc66, 0.85);
      g.strokeCircle(cx + 10, cy - 1 + bob, 12);
    } else {
      g.fillRect(cx + 9.5, cy - 3 + bob, 4, 13);
      g.fillStyle(color, 1);
      g.fillRect(cx + 10, cy - 2 + bob, 3, 11);
    }
  }
}

function drawBowWeapon(
  g: Phaser.GameObjects.Graphics,
  facing: SpriteFacingRow,
  attack: boolean,
  cx: number,
  cy: number,
  bob: number,
  color: number,
): void {
  const wood = color;
  const string = 0xe8e0d0;
  if (facing === 'up') {
    g.lineStyle(3, wood, 1);
    g.strokeEllipse(cx + 6, cy - 1 + bob, 8, 20);
    g.lineStyle(1, string, 0.85);
    g.lineBetween(cx + 6, cy - 10 + bob, cx + 6, cy + 8 + bob);
  } else if (facing === 'up-side') {
    g.lineStyle(3, wood, 1);
    g.strokeEllipse(cx + 8, cy - 1 + bob, 7, 18);
    g.lineStyle(1, string, 0.85);
    g.lineBetween(cx + 5, cy - 9 + bob, cx + 10, cy + 6 + bob);
  } else if (facing === 'side') {
    g.lineStyle(3, wood, 1);
    g.strokeEllipse(cx + 11, cy - 1 + bob, 7, 22);
    g.lineStyle(1, string, 0.9);
    if (attack) {
      g.lineBetween(cx + 4, cy - 1 + bob, cx + 11, cy - 1 + bob);
      g.fillStyle(0xc8b898, 1);
      g.fillRect(cx + 11, cy - 2 + bob, 14, 2);
      g.fillStyle(0xdddddd, 1);
      g.fillTriangle(cx + 25, cy - 1 + bob, cx + 21, cy - 3 + bob, cx + 21, cy + 1 + bob);
    } else {
      g.lineBetween(cx + 11, cy - 11 + bob, cx + 11, cy + 9 + bob);
    }
  } else if (facing === 'down-side') {
    g.lineStyle(3, wood, 1);
    g.strokeEllipse(cx - 9, cy + bob, 7, 20);
    g.lineStyle(1, string, 0.9);
    if (attack) {
      g.lineBetween(cx - 9, cy + bob, cx + 2, cy - 2 + bob);
      g.fillStyle(0xc8b898, 1);
      g.fillRect(cx + 1, cy - 3 + bob, 12, 2);
    } else {
      g.lineBetween(cx - 9, cy - 10 + bob, cx - 9, cy + 10 + bob);
    }
  } else {
    g.lineStyle(3, wood, 1);
    g.strokeEllipse(cx - 11, cy + bob, 8, 22);
    g.lineStyle(1, string, 0.9);
    if (attack) {
      g.lineBetween(cx - 11, cy + bob, cx + 2, cy - 1 + bob);
      g.fillStyle(0xc8b898, 1);
      g.fillRect(cx + 1, cy - 2 + bob, 14, 2);
      g.fillStyle(0xeeeeee, 1);
      g.fillTriangle(cx + 15, cy - 1 + bob, cx + 11, cy - 3 + bob, cx + 11, cy + 1 + bob);
      g.lineStyle(1.5, 0xffcc66, 0.7);
      g.strokeCircle(cx + 8, cy - 1 + bob, 10);
    } else {
      g.lineBetween(cx - 11, cy - 11 + bob, cx - 11, cy + 11 + bob);
    }
  }
}

/** Tall wooden shaft + crystal tip (top-down mage staff). */
function drawStaffWeapon(
  g: Phaser.GameObjects.Graphics,
  facing: SpriteFacingRow,
  attack: boolean,
  cx: number,
  cy: number,
  bob: number,
  wood: number,
): void {
  const crystal = 0x7ad8ff;
  const glow = attack ? 0xcc88ff : 0x66aacc;

  const shaft = (x0: number, y0: number, x1: number, y1: number): void => {
    g.lineStyle(3.5, 0x2a1810, 1);
    g.lineBetween(x0, y0, x1, y1);
    g.lineStyle(2.2, wood, 1);
    g.lineBetween(x0, y0, x1, y1);
  };
  const tip = (x: number, y: number, r: number): void => {
    if (attack) {
      g.lineStyle(2, glow, 0.75);
      g.strokeCircle(x, y, r + 4);
    }
    g.fillStyle(0x1a2840, 1);
    g.fillCircle(x, y, r + 0.8);
    g.fillStyle(crystal, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(x - r * 0.25, y - r * 0.3, Math.max(1, r * 0.35));
  };

  if (facing === 'up') {
    shaft(cx + 7, cy + 8 + bob, cx + 7, cy - 14 + bob);
    tip(cx + 7, cy - 15 + bob, attack ? 3.5 : 2.8);
  } else if (facing === 'up-side') {
    shaft(cx + 8, cy + 7 + bob, cx + 14, cy - 12 + bob);
    tip(cx + 14.5, cy - 13 + bob, attack ? 3.2 : 2.6);
  } else if (facing === 'side') {
    if (attack) {
      shaft(cx + 6, cy + 6 + bob, cx + 20, cy - 10 + bob);
      tip(cx + 21, cy - 11 + bob, 3.6);
      g.lineStyle(1.5, glow, 0.7);
      g.strokeCircle(cx + 18, cy - 6 + bob, 9);
    } else {
      shaft(cx + 9, cy + 8 + bob, cx + 16, cy - 12 + bob);
      tip(cx + 16.5, cy - 13 + bob, 2.8);
    }
  } else if (facing === 'down-side') {
    if (attack) {
      shaft(cx + 6, cy + 8 + bob, cx + 12, cy - 14 + bob);
      tip(cx + 12.5, cy - 15 + bob, 3.4);
      g.lineStyle(1.5, glow, 0.65);
      g.strokeCircle(cx + 10, cy - 6 + bob, 10);
    } else {
      shaft(cx + 7, cy + 7 + bob, cx + 11, cy - 12 + bob);
      tip(cx + 11.5, cy - 13 + bob, 2.7);
    }
  } else {
    if (attack) {
      shaft(cx + 8, cy + 9 + bob, cx + 10, cy - 16 + bob);
      tip(cx + 10, cy - 17 + bob, 3.8);
      g.lineStyle(2, glow, 0.7);
      g.strokeCircle(cx + 10, cy - 8 + bob, 12);
    } else {
      shaft(cx + 8, cy + 8 + bob, cx + 9, cy - 13 + bob);
      tip(cx + 9, cy - 14 + bob, 2.9);
    }
  }
}

function drawHeldWeapon(
  g: Phaser.GameObjects.Graphics,
  style: WeaponStyle,
  facing: SpriteFacingRow,
  frame: number,
  cx: number,
  cy: number,
  bob: number,
  color: number,
): void {
  if (style === 'none') return;
  const attack = frame === 4;
  if (style === 'bow') drawBowWeapon(g, facing, attack, cx, cy, bob, color);
  else if (style === 'staff') drawStaffWeapon(g, facing, attack, cx, cy, bob, color);
  else drawMeleeWeapon(g, facing, attack, cx, cy, bob, color);
}

function drawTopDownChar(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  opts: {
    scale?: number;
    hood?: boolean;
    ears?: boolean;
    big?: boolean;
    hunched?: boolean;
    facing?: SpriteFacingRow;
    /** Enemies default melee; player body uses none + weapon overlay. */
    weaponStyle?: WeaponStyle;
    gender?: PlayerGender;
    appearance?: CitizenAppearance;
  },
): void {
  const scale = opts.scale ?? 1;
  const female = opts.gender === 'female';
  const headHair = opts.appearance?.hairStyle === 5 ? p.skin : p.hair;
  const facing: SpriteFacingRow = opts.facing ?? 'down';
  const weaponStyle: WeaponStyle = opts.weaponStyle ?? 'melee';
  const playerBody = weaponStyle === 'none';
  const cx = ox + FW / 2;
  const cy = FH / 2 + 2 + (opts.hunched ? 3 : 0);
  const walkPhase = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const attack = frame === 4;
  const hurt = frame === 5;
  const bob = walkPhase !== 0 ? -1 : 0;
  const bodyX = cx + (hurt ? -2 : attack ? (facing === 'up' ? 0 : 3) : 0);
  const bodyY = cy + 2 + bob;
  const headR = (opts.big ? (playerBody ? 7 : 8) : opts.hunched ? 6.5 : playerBody ? 6.3 : 7.2) * scale * (female ? 0.96 : 1);
  const bodyW = (female ? 0.82 : 1) * (opts.appearance ? [0.88,1.08,1.16,0.94][opts.appearance.build]! : 1);
  const legW = female ? 4.5 : 5.5;

  if (!playerBody) {
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(cx, cy + 15 * scale, (female ? 15 : 18) * scale, 7 * scale);
  }

  const pose = walkingLegPose(frame, facing);
  const legOffset = playerBody ? pose.x : walkPhase * 3.5;
  const footY = playerBody ? pose.y : 0;
  g.fillStyle(0x1a1410, 1);
  g.fillRect(cx - (playerBody ? 7.5 : 9.5) - legOffset, cy + 6 + bob - footY, legW, 9 * scale);
  g.fillRect(cx + (playerBody ? 2 : 4) + legOffset, cy + 6 + bob + footY, legW, 9 * scale);
  g.fillStyle(playerBody ? 0x3e4350 : p.trim, 1);
  g.fillRect(cx - (playerBody ? 7 : 9) - legOffset, cy + 6 + bob - footY, legW - 0.5, (playerBody ? 7 : 8) * scale);
  g.fillRect(cx + (playerBody ? 2.5 : 4.5) + legOffset, cy + 6 + bob + footY, legW - 0.5, (playerBody ? 7 : 8) * scale);
  if (playerBody) {
    g.fillStyle(0x30251b, 1);
    g.fillRoundedRect(cx - 8 - legOffset, cy + 12 + bob - footY, legW + 1, 4 * scale, 1);
    g.fillRoundedRect(cx + 1.5 + legOffset, cy + 12 + bob + footY, legW + 1, 4 * scale, 1);
    // Sleeves and hands counter-swing against the legs, with matching gear anchors.
    g.fillStyle(p.body, 1);
    g.fillEllipse(bodyX - 8 * scale, cy + bob + pose.arm, 5 * scale, 8 * scale);
    g.fillEllipse(bodyX + 8 * scale, cy + bob - pose.arm, 5 * scale, 8 * scale);
    g.fillStyle(p.skin, 1);
    g.fillCircle(bodyX - 8 * scale, cy + 4 + bob + pose.arm, 2 * scale);
    g.fillCircle(bodyX + 8 * scale, cy + 4 + bob - pose.arm, 2 * scale);
  }

  g.fillStyle(0x12100c, 1);
  g.fillEllipse(bodyX, bodyY, 19.5 * scale * bodyW, (opts.hunched ? 13 : 15) * scale);
  g.fillStyle(p.body, 1);
  g.fillEllipse(bodyX, bodyY, 17.5 * scale * bodyW, (opts.hunched ? 11.5 : 13.5) * scale);
  g.fillStyle(0xffffff, 0.12);
  g.fillEllipse(bodyX - 3, bodyY - 3, 8 * scale * bodyW, 5 * scale);

  g.fillStyle(p.trim, 1);
  g.fillEllipse(cx, cy + 4 + bob, (female ? 11 : 13) * scale, 5.5 * scale);

  g.fillStyle(0x12100c, 1);
  const faceWidth = opts.appearance ? [0.95,1.12,0.85,1.06][opts.appearance.faceShape]! : 1;
  const faceHeight = opts.appearance ? [1.08,0.94,1.16,1.02][opts.appearance.faceShape]! : 1;
  if (opts.appearance) g.fillEllipse(cx, cy - 8 * scale + bob, (headR + 1.2)*2*faceWidth, (headR + 1.2)*2*faceHeight);
  else g.fillCircle(cx, cy - 8 * scale + bob, headR + 1.2);
  g.fillStyle(p.skin, 1);
  if (opts.appearance) g.fillEllipse(cx, cy - 8 * scale + bob, headR*2*faceWidth, headR*2*faceHeight);
  else g.fillCircle(cx, cy - 8 * scale + bob, headR);

  if (facing === 'up') {
    g.fillStyle(headHair, 1);
    g.fillCircle(cx, cy - 9 * scale + bob, headR * 1.05);
    g.fillEllipse(cx, cy - 11 * scale + bob, headR * 1.6, headR * 0.85);
    if (female && !opts.hood) {
      g.fillEllipse(cx, cy - 1 * scale + bob, 4.5 * scale, 9 * scale);
      g.fillEllipse(cx - 5 * scale, cy - 4 * scale + bob, 3 * scale, 7 * scale);
      g.fillEllipse(cx + 5 * scale, cy - 4 * scale + bob, 3 * scale, 7 * scale);
    }
    if (opts.hood) {
      g.fillTriangle(cx - 12, cy - 1 + bob, cx + 12, cy - 1 + bob, cx, cy - 21 * scale + bob);
    }
    if (opts.ears) {
      g.fillStyle(p.skin, 1);
      g.fillTriangle(cx - 12, cy - 10 + bob, cx - 7, cy - 15 + bob, cx - 4, cy - 8 + bob);
      g.fillTriangle(cx + 12, cy - 10 + bob, cx + 7, cy - 15 + bob, cx + 4, cy - 8 + bob);
    }
  } else if (facing === 'up-side') {
    g.fillStyle(headHair, 1);
    g.fillCircle(cx + 1, cy - 9 * scale + bob, headR * 1.02);
    g.fillEllipse(cx + 2, cy - 11 * scale + bob, headR * 1.45, headR * 0.8);
    if (female && !opts.hood) {
      g.fillEllipse(cx - 2, cy - 1 * scale + bob, 4 * scale, 8.5 * scale);
      g.fillEllipse(cx + 6, cy - 5 * scale + bob, 3.2 * scale, 6.5 * scale);
    }
    if (opts.hood) {
      g.fillTriangle(cx - 10, cy - 1 + bob, cx + 14, cy - 1 + bob, cx + 3, cy - 21 * scale + bob);
    }
    if (opts.ears) {
      g.fillStyle(p.skin, 1);
      g.fillTriangle(cx - 10, cy - 9 + bob, cx - 5, cy - 15 + bob, cx - 2, cy - 7 + bob);
      g.fillTriangle(cx + 11, cy - 8 + bob, cx + 8, cy - 14 + bob, cx + 5, cy - 6 + bob);
    }
    g.fillStyle(0xffffff, 0.1);
    g.fillCircle(cx + 4, cy - 9 * scale + bob, headR * 0.22);
  } else if (facing === 'side') {
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(cx + 2, cy - 10 * scale + bob, headR * 0.3);
    g.fillStyle(headHair, 1);
    if (opts.hood) {
      g.fillTriangle(cx - 8, cy - 1 + bob, cx + 14, cy - 1 + bob, cx + 4, cy - 21 * scale + bob);
    } else {
      g.fillEllipse(cx + 1, cy - 11 * scale + bob, headR * 1.35, headR * 0.75);
      g.fillCircle(cx - 2, cy - 8 * scale + bob, headR * 0.7);
      if (female) {
        g.fillEllipse(cx - 4, cy - 3 * scale + bob, 4.5 * scale, 10 * scale);
        g.fillEllipse(cx - 1, cy - 6 * scale + bob, 3.5 * scale, 7 * scale);
      }
    }
    if (opts.ears) {
      g.fillStyle(p.skin, 1);
      g.fillTriangle(cx - 10, cy - 9 + bob, cx - 6, cy - 16 + bob, cx - 3, cy - 7 + bob);
    }
    g.fillStyle(p.eye, 1);
    g.fillRect(cx + 4, cy - 10 * scale + bob, 2.5, 2.5);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(cx + 4.5, cy - 10.5 * scale + bob, 1, 1);
  } else if (facing === 'down-side') {
    g.fillStyle(0xffffff, 0.14);
    g.fillCircle(cx + 1, cy - 10 * scale + bob, headR * 0.32);
    g.fillStyle(headHair, 1);
    if (opts.hood) {
      g.fillTriangle(cx - 10, cy - 1 + bob, cx + 13, cy - 1 + bob, cx + 2, cy - 21 * scale + bob);
      g.fillStyle(0x000000, 0.22);
      g.fillTriangle(cx - 6, cy - 2 + bob, cx + 8, cy - 2 + bob, cx + 1, cy - 13 * scale + bob);
    } else {
      // Cap + side locks only — keep cheeks/eyes clear
      g.fillEllipse(cx + 1, cy - 12.5 * scale + bob, headR * 1.35, headR * 0.55);
      g.fillEllipse(cx - 5, cy - 9 * scale + bob, 3.5 * scale, female ? 7.5 * scale : 5 * scale);
      g.fillEllipse(cx + 7, cy - 9 * scale + bob, 3.2 * scale, female ? 7 * scale : 4.5 * scale);
      if (female) {
        g.fillEllipse(cx - 6.5 * scale, cy - 4.5 * scale + bob, 3.2 * scale, 6 * scale);
        g.fillEllipse(cx + 7.5 * scale, cy - 4.5 * scale + bob, 3 * scale, 5.5 * scale);
      }
    }
    if (opts.ears) {
      g.fillStyle(p.skin, 1);
      g.fillTriangle(cx - 11, cy - 9 + bob, cx - 6, cy - 15 + bob, cx - 3, cy - 7 + bob);
      g.fillTriangle(cx + 11, cy - 8 + bob, cx + 7, cy - 14 + bob, cx + 4, cy - 6 + bob);
    }
    g.fillStyle(p.eye, 1);
    g.fillRect(cx - 1, cy - 10 * scale + bob, 2.2, 2.2);
    g.fillRect(cx + 4, cy - 10 * scale + bob, 2.4, 2.4);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(cx - 0.5, cy - 10.5 * scale + bob, 1, 1);
    g.fillRect(cx + 4.5, cy - 10.5 * scale + bob, 1, 1);
  } else {
    // Front (down): open face, hair as top cap + side locks
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(cx - 2, cy - 10 * scale + bob, headR * 0.35);

    g.fillStyle(headHair, 1);
    if (opts.hood) {
      g.fillTriangle(cx - 12, cy - 1 + bob, cx + 12, cy - 1 + bob, cx, cy - 21 * scale + bob);
      g.fillStyle(0x000000, 0.25);
      g.fillTriangle(cx - 8, cy - 2 + bob, cx + 8, cy - 2 + bob, cx, cy - 14 * scale + bob);
    } else {
      g.fillEllipse(cx, cy - 13 * scale + bob, headR * 1.45, headR * 0.55);
      g.fillEllipse(cx - 6.5 * scale, cy - 9.5 * scale + bob, 3.2 * scale, female ? 7.5 * scale : 5.5 * scale);
      g.fillEllipse(cx + 6.5 * scale, cy - 9.5 * scale + bob, 3.2 * scale, female ? 7.5 * scale : 5.5 * scale);
      // Short bang fringe above eyes only
      g.fillEllipse(cx, cy - 11.2 * scale + bob, headR * (female ? 1.05 : 0.95), headR * (female ? 0.34 : 0.28));
      if (female) {
        g.fillEllipse(cx - 7 * scale, cy - 4 * scale + bob, 3.4 * scale, 6.5 * scale);
        g.fillEllipse(cx + 7 * scale, cy - 4 * scale + bob, 3.4 * scale, 6.5 * scale);
      }
    }

    if (opts.ears) {
      g.fillStyle(p.skin, 1);
      g.fillTriangle(cx - 12, cy - 10 + bob, cx - 7, cy - (opts.hunched ? 17 : 15) + bob, cx - 4, cy - 8 + bob);
      g.fillTriangle(cx + 12, cy - 10 + bob, cx + 7, cy - (opts.hunched ? 17 : 15) + bob, cx + 4, cy - 8 + bob);
    }

    g.fillStyle(p.eye, 1);
    g.fillRect(cx - 4, cy - 9.5 * scale + bob, 2.5, 2.5);
    g.fillRect(cx + 2, cy - 9.5 * scale + bob, 2.5, 2.5);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(cx - 3.5, cy - 10 * scale + bob, 1, 1);
    g.fillRect(cx + 2.5, cy - 10 * scale + bob, 1, 1);
  }

  drawHeldWeapon(g, weaponStyle, facing, frame, cx, cy, bob, p.weapon);

  if (hurt) {
    g.lineStyle(2, 0xff4444, 0.95);
    g.strokeCircle(cx, cy + bob, 18 * scale);
  }
}

function drawWolf(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  const cx = ox + FW / 2;
  const cy = FH / 2 + 6;
  const walk = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const attack = frame === 4;
  const hurt = frame === 5;

  g.fillStyle(0x000000, 0.4);
  g.fillEllipse(cx, cy + 11, 24, 8);

  if (facing === 'up') {
    g.fillStyle(0x1a1410, 1);
    g.fillEllipse(cx, cy, 18, 14);
    g.fillStyle(p.body, 1);
    g.fillEllipse(cx, cy, 15, 12);
    g.fillStyle(p.trim, 1);
    g.fillEllipse(cx - 8 + walk * 2, cy + 6, 7, 5);
    g.fillEllipse(cx + 8 - walk * 2, cy + 6, 7, 5);
    // Rear: ears + tail tip
    g.fillStyle(p.trim, 1);
    g.fillTriangle(cx - 6, cy - 10, cx - 2, cy - 16, cx, cy - 8);
    g.fillTriangle(cx + 6, cy - 10, cx + 2, cy - 16, cx, cy - 8);
    g.fillStyle(p.skin, 1);
    g.fillEllipse(cx, cy + 10, 5, 4);
  } else if (facing === 'up-side') {
    g.fillStyle(0x1a1410, 1);
    g.fillEllipse(cx + 2, cy, 19, 13);
    g.fillStyle(p.body, 1);
    g.fillEllipse(cx + 2, cy, 16, 11);
    g.fillStyle(p.trim, 1);
    g.fillEllipse(cx - 8 + walk * 2, cy + 6, 7, 5);
    g.fillEllipse(cx + 10 - walk * 2, cy + 5, 7, 5);
    g.fillTriangle(cx + 4, cy - 12, cx + 8, cy - 17, cx + 10, cy - 8);
    g.fillTriangle(cx - 2, cy - 11, cx + 1, cy - 16, cx + 4, cy - 8);
    g.fillStyle(p.skin, 1);
    g.fillEllipse(cx - 2, cy + 9, 5, 4);
  } else if (facing === 'side') {
    g.fillStyle(0x1a1410, 1);
    g.fillEllipse(cx + (attack ? 4 : 0), cy, 22, 13);
    g.fillStyle(p.body, 1);
    g.fillEllipse(cx + (attack ? 4 : 0), cy, 19, 11);
    g.fillStyle(0xffffff, 0.1);
    g.fillEllipse(cx - 2, cy - 3, 8, 4);

    g.fillStyle(p.trim, 1);
    g.fillEllipse(cx - 10 + walk * 2, cy + 5, 8, 6);
    g.fillEllipse(cx + 10 - walk * 2, cy + 5, 8, 6);

    g.fillStyle(0x1a1410, 1);
    g.fillCircle(cx + 12, cy - 4, 8);
    g.fillStyle(p.trim, 1);
    g.fillCircle(cx + 12, cy - 4, 7);
    g.fillTriangle(cx + 17, cy - 10, cx + 22, cy - 2, cx + 15, cy - 3);
    g.fillTriangle(cx + 14, cy - 11, cx + 18, cy - 4, cx + 12, cy - 4);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx + 14, cy - 4, 3);

    g.fillStyle(p.eye, 1);
    g.fillRect(cx + 15, cy - 6, 2.5, 2.5);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(cx + 15.5, cy - 6.5, 1, 1);

    if (attack) {
      g.lineStyle(2, 0xffaa44, 0.85);
      g.strokeCircle(cx + 14, cy - 2, 11);
    }
  } else if (facing === 'down-side') {
    g.fillStyle(0x1a1410, 1);
    g.fillEllipse(cx + 2, cy + (attack ? 1 : 0), 20, 14);
    g.fillStyle(p.body, 1);
    g.fillEllipse(cx + 2, cy + (attack ? 1 : 0), 17, 12);
    g.fillStyle(0xffffff, 0.1);
    g.fillEllipse(cx, cy - 2, 7, 4);
    g.fillStyle(p.trim, 1);
    g.fillEllipse(cx - 8 + walk * 2, cy + 7, 7, 5);
    g.fillEllipse(cx + 10 - walk * 2, cy + 6, 7, 5);
    g.fillStyle(0x1a1410, 1);
    g.fillCircle(cx + 8, cy - 5, 8);
    g.fillStyle(p.trim, 1);
    g.fillCircle(cx + 8, cy - 5, 7);
    g.fillTriangle(cx + 12, cy - 12, cx + 17, cy - 6, cx + 10, cy - 5);
    g.fillTriangle(cx + 6, cy - 13, cx + 11, cy - 7, cx + 5, cy - 5);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx + 9, cy - 3, 3);
    g.fillStyle(p.eye, 1);
    g.fillRect(cx + 6, cy - 7, 2.2, 2.2);
    g.fillRect(cx + 11, cy - 7, 2.2, 2.2);
    if (attack) {
      g.lineStyle(2, 0xffaa44, 0.85);
      g.strokeCircle(cx + 9, cy - 2, 11);
    }
  } else {
    // Front (down): chest toward camera
    g.fillStyle(0x1a1410, 1);
    g.fillEllipse(cx, cy + (attack ? 2 : 0), 20, 15);
    g.fillStyle(p.body, 1);
    g.fillEllipse(cx, cy + (attack ? 2 : 0), 17, 13);
    g.fillStyle(0xffffff, 0.12);
    g.fillEllipse(cx, cy - 2, 8, 5);

    g.fillStyle(p.trim, 1);
    g.fillEllipse(cx - 9 + walk * 2, cy + 7, 7, 5);
    g.fillEllipse(cx + 9 - walk * 2, cy + 7, 7, 5);

    g.fillStyle(0x1a1410, 1);
    g.fillCircle(cx, cy - 6, 9);
    g.fillStyle(p.trim, 1);
    g.fillCircle(cx, cy - 6, 8);
    g.fillTriangle(cx - 7, cy - 12, cx - 2, cy - 18, cx, cy - 10);
    g.fillTriangle(cx + 7, cy - 12, cx + 2, cy - 18, cx, cy - 10);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx, cy - 4, 3);

    g.fillStyle(p.eye, 1);
    g.fillRect(cx - 4, cy - 8, 2.5, 2.5);
    g.fillRect(cx + 2, cy - 8, 2.5, 2.5);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(cx - 3.5, cy - 8.5, 1, 1);
    g.fillRect(cx + 2.5, cy - 8.5, 1, 1);

    if (attack) {
      g.lineStyle(2, 0xffaa44, 0.85);
      g.strokeCircle(cx, cy - 2, 12);
    }
  }

  if (hurt) {
    g.lineStyle(2, 0xff4444, 0.9);
    g.strokeCircle(cx, cy, 16);
  }
}

function drawCinder(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  drawTopDownChar(g, p, frame, ox, { scale: 0.78, ears: true, hunched: true, facing });
  const cx = ox + FW / 2;
  const cy = FH / 2 + 5;
  g.fillStyle(0xff6622, 0.35);
  g.fillCircle(cx, cy, 16);
  g.fillStyle(0xffaa00, 0.5);
  g.fillCircle(cx, cy - 2, 8);
  if (frame === 4) {
    g.lineStyle(2, 0xff4400, 0.9);
    g.strokeCircle(cx, cy, 18);
  }
}

function drawBone(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  const cx = ox + FW / 2;
  const cy = FH / 2 + 2;
  const walk = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const attack = frame === 4;
  const hurt = frame === 5;

  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(cx, cy + 14, 16, 7);

  if (facing === 'up') {
    g.lineStyle(3, p.body, 1);
    g.lineBetween(cx - 6 - walk, cy + 10, cx - 3, cy - 2);
    g.lineBetween(cx + 6 + walk, cy + 10, cx + 3, cy - 2);
    g.lineBetween(cx - 6, cy, cx + 6, cy);
    g.lineBetween(cx, cy - 2, cx, cy + 8);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx, cy - 10, 8);
    g.fillStyle(0x222222, 1);
    g.fillEllipse(cx, cy - 10, 10, 6);
  } else if (facing === 'up-side') {
    g.lineStyle(3, p.body, 1);
    g.lineBetween(cx - 4 - walk, cy + 10, cx, cy - 2);
    g.lineBetween(cx + 6 + walk, cy + 10, cx + 5, cy);
    g.lineBetween(cx - 4, cy, cx + 6, cy);
    g.lineBetween(cx + 1, cy - 2, cx + 1, cy + 8);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx + 5, cy - 9, 7);
    g.fillStyle(0x222222, 1);
    g.fillEllipse(cx + 5, cy - 9, 9, 5);
  } else if (facing === 'side') {
    g.lineStyle(3, p.body, 1);
    g.lineBetween(cx - 2 - walk, cy + 10, cx + 2, cy - 2);
    g.lineBetween(cx + 4 + walk, cy + 10, cx + 6, cy);
    g.lineBetween(cx - 2, cy - 1, cx + 8, cy - 1);
    g.lineBetween(cx + 2, cy - 2, cx + 2, cy + 8);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx + 8, cy - 8, 7);
    g.fillStyle(0x222222, 1);
    g.fillRect(cx + 5, cy - 10, 8, 3);
    g.fillStyle(p.eye, 1);
    g.fillRect(cx + 10, cy - 9, 2, 3);
    g.fillStyle(p.trim, 1);
    if (attack) g.fillRect(cx + 14, cy - 4, 10, 3);
    else g.fillRect(cx + 12, cy + 1, 8, 2.5);
  } else if (facing === 'down-side') {
    g.lineStyle(3, p.body, 1);
    g.lineBetween(cx - 5 - walk, cy + 10, cx - 2, cy - 3);
    g.lineBetween(cx + 6 + walk, cy + 10, cx + 5, cy - 2);
    g.lineBetween(cx - 6, cy - 1, cx + 7, cy - 1);
    g.lineBetween(cx + 1, cy - 3, cx + 1, cy + 8);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx + 4, cy - 9, 7.5);
    g.fillStyle(0x222222, 1);
    g.fillRect(cx + 1, cy - 11, 8, 3);
    g.fillStyle(p.eye, 1);
    g.fillRect(cx + 2, cy - 9, 2, 2.5);
    g.fillRect(cx + 6, cy - 9, 2, 2.5);
    g.fillStyle(p.trim, 1);
    if (attack) g.fillRect(cx + 12, cy - 5, 4, 14);
    else g.fillRect(cx + 10, cy, 3, 9);
  } else {
    g.lineStyle(3, p.body, 1);
    g.lineBetween(cx - 6 - walk, cy + 10, cx - 4, cy - 4);
    g.lineBetween(cx + 6 + walk, cy + 10, cx + 4, cy - 4);
    g.lineBetween(cx - 8, cy - 2, cx + 8, cy - 2);
    g.lineBetween(cx, cy - 4, cx, cy + 8);

    g.fillStyle(p.skin, 1);
    g.fillCircle(cx, cy - 10, 8);
    g.fillStyle(0x222222, 1);
    g.fillRect(cx - 5, cy - 12, 10, 4);
    g.fillStyle(p.eye, 1);
    g.fillRect(cx - 3, cy - 10, 2, 3);
    g.fillRect(cx + 1, cy - 10, 2, 3);

    g.fillStyle(p.trim, 1);
    if (attack) {
      g.fillRect(cx + 10, cy - 6, 4, 16);
    } else {
      g.fillRect(cx + 8, cy, 3, 10);
    }
  }

  if (hurt) {
    g.lineStyle(2, 0xff4444, 0.9);
    g.strokeCircle(cx, cy, 16);
  }
}

function drawOrcGrunt(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  drawTopDownChar(g, p, frame, ox, { scale: 1.12, big: true, ears: false, facing });
  const cx = ox + FW / 2;
  const cy = FH / 2;
  if (facing !== 'up') {
    g.fillStyle(0x444444, 1);
    const shieldX = facing === 'side' ? cx - 10 : cx - 14;
    g.fillRect(shieldX, cy - 4, 6, 14);
    if (frame === 4 && facing === 'down') {
      g.lineStyle(2, 0xcccccc, 0.8);
      g.lineBetween(cx - 14, cy - 4, cx + 16, cy + 8);
    }
  }
}

function drawShadow(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  drawTopDownChar(g, p, frame, ox, { scale: 1, hood: true, facing });
  const cx = ox + FW / 2;
  const cy = FH / 2 + 2;
  g.fillStyle(0x6633aa, 0.25);
  g.fillCircle(cx, cy, 20);
  if (frame >= 1 && frame <= 3) {
    g.fillStyle(0x8844cc, 0.15);
    g.fillCircle(cx - 4 + frame, cy, 22);
  }
}

function drawGoblin(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  drawTopDownChar(g, p, frame, ox, { scale: 0.88, ears: true, hunched: true, facing });
}

function drawEnemyFrame(
  g: Phaser.GameObjects.Graphics,
  kind: EnemyKind,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  const p = ENEMY_PALETTES[kind];
  switch (kind) {
    case 'wolf':
      drawWolf(g, p, frame, ox, facing);
      break;
    case 'cinder':
      drawCinder(g, p, frame, ox, facing);
      break;
    case 'bone':
      drawBone(g, p, frame, ox, facing);
      break;
    case 'orc_grunt':
      drawOrcGrunt(g, p, frame, ox, facing);
      break;
    case 'shadow':
      drawShadow(g, p, frame, ox, facing);
      break;
    default:
      drawGoblin(g, p, frame, ox, facing);
  }
}

function drawCharacter(
  g: Phaser.GameObjects.Graphics,
  kind: CharKind,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
  gender: PlayerGender = 'male',
): void {
  const female = gender === 'female';
  const p = female ? FEMALE_PALETTES[kind] : PALETTES[kind];
  drawTopDownChar(g, p, frame, ox, {
    scale: kind === 'orc' ? (female ? 1.0 : 1.08) : female ? 0.96 : 1,
    ears: kind === 'elf',
    big: kind === 'orc' && !female,
    facing,
    weaponStyle: 'none',
    gender,
  });
}

/** Frame/anim prefix: player-human | player-human-f */
export function playerSpritePrefix(race: string, gender: PlayerGender | string | undefined = 'male'): string {
  const r = ['human', 'elf', 'orc'].includes(race) ? race : 'human';
  const g = gender === 'female' ? 'female' : 'male';
  return g === 'female' ? `player-${r}-f` : `player-${r}`;
}

interface CloakPalette {
  main: number;
  dark: number;
  trim: number;
  sheen: number;
}

const CLOAK_PALETTES: Record<string, CloakPalette> = {
  traveler: { main: 0x7a5840, dark: 0x3a2818, trim: 0x9a7858, sheen: 0xc8a878 },
  shadow: { main: 0x4a3068, dark: 0x1a1028, trim: 0x7744aa, sheen: 0x9966cc },
  daedric: { main: 0x2a1810, dark: 0x0c0604, trim: 0xaa2218, sheen: 0xff6644 },
  arcane: { main: 0x3a4a78, dark: 0x141828, trim: 0x66aadd, sheen: 0xaaddff },
};

function drawCloakLayer(
  g: Phaser.GameObjects.Graphics,
  palette: CloakPalette,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  const cx = ox + FW / 2;
  const cy = FH / 2 + 2;
  const walkPhase = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const attack = frame === 4;
  const bob = walkPhase !== 0 ? -1 : 0;
  const sway = walkPhase * 2.5;
  const lean = attack ? 5 : 0;

  if (facing === 'up' || facing === 'up-side') {
    // The collar sits below the head; a back-facing cape must not become a hood.
    const offset = facing === 'up-side' ? 2 : 0;
    g.fillStyle(palette.dark, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(cx - 7 + offset, cy - 1 + bob),
      new Phaser.Math.Vector2(cx + 7 + offset, cy - 1 + bob),
      new Phaser.Math.Vector2(cx + 13 + offset + sway, cy + 11 + bob),
      new Phaser.Math.Vector2(cx - 13 + offset - sway, cy + 11 + bob),
    ], true);
    g.fillStyle(palette.main, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(cx - 6 + offset, cy + bob),
      new Phaser.Math.Vector2(cx + 6 + offset, cy + bob),
      new Phaser.Math.Vector2(cx + 11 + offset + sway * 0.8, cy + 10 + bob),
      new Phaser.Math.Vector2(cx - 11 + offset - sway * 0.8, cy + 10 + bob),
    ], true);
    g.lineStyle(1, palette.trim, 0.8);
    g.lineBetween(cx - 6 + offset, cy + bob, cx + 6 + offset, cy + bob);
    g.fillStyle(palette.sheen, 0.25);
    g.fillTriangle(cx - 3 + offset, cy + 1 + bob, cx + 1 + offset, cy + 1 + bob, cx - 5 + offset, cy + 9 + bob);
  } else if (facing === 'side') {
    // Cape trails left (behind when facing right; flipX mirrors)
    g.fillStyle(palette.dark, 1);
    g.fillTriangle(
      cx - 22 - sway,
      cy + 8 + bob,
      cx + 4,
      cy + 12 + bob,
      cx + 2 + lean,
      cy - 16 + bob,
    );
    g.fillStyle(palette.main, 1);
    g.fillTriangle(
      cx - 18 - sway * 0.8,
      cy + 6 + bob,
      cx + 2,
      cy + 10 + bob,
      cx + 1 + lean * 0.8,
      cy - 14 + bob,
    );
    g.fillStyle(palette.trim, 0.7);
    g.fillEllipse(cx - 10 - sway * 0.3, cy + 1 + bob, 10, 12);
    g.fillStyle(palette.sheen, 0.3);
    g.fillTriangle(cx - 8, cy - 10 + bob, cx - 4, cy - 10 + bob, cx - 6, cy + bob);
    g.fillStyle(palette.dark, 0.85);
    g.fillEllipse(cx + lean, cy - 14 + bob, 7, 5);
  } else if (facing === 'down-side') {
    g.fillStyle(palette.dark, 1);
    g.fillTriangle(
      cx - 16 - sway,
      cy + 11 + bob,
      cx + 14 + sway,
      cy + 9 + bob,
      cx + 6 + lean,
      cy - 19 + bob,
    );
    g.fillStyle(palette.main, 1);
    g.fillTriangle(
      cx - 13 - sway * 0.8,
      cy + 9 + bob,
      cx + 11 + sway * 0.8,
      cy + 7 + bob,
      cx + 5 + lean * 0.8,
      cy - 16 + bob,
    );
    g.fillStyle(palette.trim, 0.75);
    g.fillEllipse(cx - 6, cy + 2 + bob, 7, 11);
    g.fillEllipse(cx + 8, cy + bob, 6, 10);
    g.fillStyle(palette.sheen, 0.3);
    g.fillTriangle(cx + 2, cy - 13 + bob, cx + 6, cy - 13 + bob, cx + 4, cy - 3 + bob);
  } else {
    // Front (down): cape behind shoulders
    g.fillStyle(palette.dark, 1);
    g.fillTriangle(
      cx - 18 - sway,
      cy + 10 + bob,
      cx + 18 + sway,
      cy + 10 + bob,
      cx + lean,
      cy - 20 + bob,
    );

    g.fillStyle(palette.main, 1);
    g.fillTriangle(
      cx - 15 - sway * 0.8,
      cy + 8 + bob,
      cx + 15 + sway * 0.8,
      cy + 8 + bob,
      cx + lean * 0.8,
      cy - 17 + bob,
    );

    g.fillStyle(palette.trim, 0.75);
    g.fillEllipse(cx - 8 - sway * 0.4, cy + 1 + bob, 7, 12);
    g.fillEllipse(cx + 8 + sway * 0.4, cy + 1 + bob, 7, 12);

    g.fillStyle(palette.sheen, 0.35);
    g.fillTriangle(cx - 4, cy - 14 + bob, cx + 2, cy - 14 + bob, cx - 1 + lean * 0.3, cy - 4 + bob);

    g.fillStyle(palette.dark, 0.85);
    g.fillEllipse(cx + lean, cy - 16 + bob, 9, 5);
  }
}

function drawNpcProp(
  g: Phaser.GameObjects.Graphics,
  def: NpcWorldDef,
  cx: number,
  cy: number,
  bob: number,
): void {
  const prop = def.prop;
  if (prop === 'staff') {
    g.fillStyle(0x8b6914, 1);
    g.fillRect(cx - 14, cy - 18 + bob, 3, 28);
    g.fillCircle(cx - 14, cy - 18 + bob, 4);
  } else if (prop === 'leaf') {
    g.fillStyle(0x4a8a4a, 1);
    g.fillCircle(cx + 12, cy - 4 + bob, 5);
  } else if (prop === 'sash') {
    g.fillStyle(0xcc6644, 1);
    g.fillRect(cx - 12, cy - 16 + bob, 24, 3);
  } else if (prop === 'coin') {
    g.fillStyle(0xffcc44, 1);
    g.fillCircle(cx + 14, cy + 6 + bob, 6);
    g.fillStyle(0xaa7722, 1);
    g.fillRect(cx - 16, cy + 2 + bob, 10, 8);
  } else if (prop === 'apron') {
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(cx - 10, cy - 2 + bob, 20, 14);
    g.fillStyle(0xdd8866, 1);
    g.fillRect(cx - 8, cy + bob, 16, 3);
  } else if (prop === 'spear') {
    g.fillStyle(0xcccccc, 1);
    g.fillRect(cx + 10, cy - 14 + bob, 3, 32);
    g.fillStyle(def.palette.trim, 1);
    g.fillRect(cx - 14, cy - 8 + bob, 28, 4);
  } else if (prop === 'hammer') {
    g.fillStyle(0x666666, 1);
    g.fillRect(cx - 18, cy + 8 + bob, 14, 6);
    g.fillStyle(0x444444, 1);
    g.fillRect(cx - 16, cy + 10 + bob, 10, 3);
    g.fillStyle(0x888888, 1);
    g.fillRect(cx + 12, cy - 6 + bob, 4, 14);
    g.fillStyle(0xaaaaaa, 1);
    g.fillRect(cx + 8, cy - 8 + bob, 12, 4);
  } else if (prop === 'radio') {
    g.fillStyle(0x2a3a48, 1);
    g.fillRect(cx + 8, cy - 4 + bob, 10, 12);
    g.fillStyle(0x6aaa88, 1);
    g.fillRect(cx + 10, cy - 2 + bob, 6, 4);
  } else if (prop === 'brush') {
    g.fillStyle(0x8a6840, 1);
    g.fillRect(cx + 10, cy - 2 + bob, 3, 14);
    g.fillStyle(0xc9a66b, 1);
    g.fillEllipse(cx + 11.5, cy - 4 + bob, 8, 5);
  } else if (prop === 'book') {
    g.fillStyle(0x6a4030, 1);
    g.fillRect(cx + 8, cy - 2 + bob, 10, 12);
    g.fillStyle(0xd4c4a0, 1);
    g.fillRect(cx + 9, cy + bob, 8, 2);
  } else if (prop === 'fish') {
    g.fillStyle(0x6a9aaa, 1);
    g.fillEllipse(cx + 12, cy + 4 + bob, 12, 6);
    g.fillTriangle(cx + 18, cy + 4 + bob, cx + 22, cy + 1 + bob, cx + 22, cy + 7 + bob);
  } else if (prop === 'cleaver') {
    g.fillStyle(0x888888, 1);
    g.fillRect(cx + 8, cy - 8 + bob, 12, 5);
    g.fillStyle(0x4a3020, 1);
    g.fillRect(cx + 6, cy - 4 + bob, 3, 12);
  } else if (prop === 'crate') {
    g.fillStyle(0x8a6840, 1);
    g.fillRect(cx - 16, cy + 4 + bob, 14, 10);
    g.fillStyle(0x5a4030, 1);
    g.fillRect(cx - 16, cy + 8 + bob, 14, 2);
  } else if (prop === 'towel') {
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(cx + 8, cy - 6 + bob, 10, 16);
    g.fillStyle(0xe8d0b0, 1);
    g.fillRect(cx + 8, cy + 6 + bob, 10, 3);
  } else if (prop === 'mug') {
    g.fillStyle(0xaa7722, 1);
    g.fillRect(cx + 10, cy + bob, 8, 10);
    g.fillStyle(0xc9a66b, 1);
    g.fillRect(cx + 17, cy + 2 + bob, 3, 5);
  } else if (prop === 'sack') {
    g.fillStyle(0xd4c4a0, 1);
    g.fillEllipse(cx + 12, cy + 6 + bob, 12, 10);
    g.fillStyle(0x8a6840, 1);
    g.fillRect(cx + 8, cy + 2 + bob, 8, 3);
  } else if (prop === 'mortar') {
    g.fillStyle(0x88aa88, 1);
    g.fillCircle(cx + 12, cy + 4 + bob, 6);
    g.fillStyle(0x5a7060, 1);
    g.fillRect(cx + 16, cy - 6 + bob, 2, 12);
  } else if (prop === 'scroll') {
    g.fillStyle(0xd4c4a0, 1);
    g.fillRect(cx + 8, cy - 4 + bob, 10, 14);
    g.fillStyle(0x886644, 1);
    g.fillRect(cx + 8, cy - 4 + bob, 10, 2);
    g.fillRect(cx + 8, cy + 8 + bob, 10, 2);
  } else if (prop === 'key') {
    g.fillStyle(0xd4b060, 1);
    g.fillCircle(cx + 12, cy - 2 + bob, 4);
    g.fillRect(cx + 12, cy + bob, 3, 12);
    g.fillRect(cx + 12, cy + 8 + bob, 7, 2);
  }
}

/** Front-facing seated anatomy, aligned to the sofa cushion rather than standing feet. */
function drawSeatedNpc(g: Phaser.GameObjects.Graphics, def: NpcWorldDef, frame: number, ox: number): void {
  const p = def.palette, cx = ox + FW / 2;
  const female = def.appearance?.gender === 'female';
  // Thighs extend forward from the hips; shins hang over the cushion edge.
  g.fillStyle(0x262c38, 1);
  if (female) {
    g.fillEllipse(cx + 2, 33, 19, 6);
    g.fillTriangle(cx - 7, 30, cx + 10, 34, cx + 3, 38);
    g.fillRoundedRect(cx - 3, 35, 5, 8, 2);
    g.fillRoundedRect(cx + 7, 33, 5, 5, 2);
  } else {
    g.fillEllipse(cx - 6, 34, 9, 7); g.fillEllipse(cx + 6, 34, 9, 7);
    g.fillRoundedRect(cx - 10, 34, 5, 9, 2); g.fillRoundedRect(cx + 5, 34, 5, 9, 2);
  }
  g.fillStyle(0x211c1a, 1);
  if (female) { g.fillEllipse(cx - 1, 43, 7, 3); g.fillEllipse(cx + 11, 38, 7, 3); }
  else { g.fillEllipse(cx - 8, 44, 8, 3); g.fillEllipse(cx + 8, 44, 8, 3); }
  g.fillStyle(p.body, 1);
  g.fillRoundedRect(cx - 9, 17, 18, 15, 4);
  g.fillEllipse(cx, 29, 20, 9);
  g.fillStyle(0xe3d8c3, 1);
  g.fillTriangle(cx - 4, 17, cx + 4, 17, cx, 28);
  g.fillStyle(p.trim, 1); g.fillRect(cx - 7, 27, 14, 2);
  // Lady_Boss leans back with one arm resting on the sofa; po&T works on his lap.
  g.fillStyle(p.body, 1);
  g.fillEllipse(cx - 11, 23, 6, 13);
  g.fillEllipse(cx + 11, female ? 20 : 23, 6, female ? 8 : 13);
  g.fillStyle(p.skin, 1);
  g.fillCircle(cx - 10, 28, 2); g.fillCircle(cx + 12, female ? 22 : 28, 2);
  g.fillStyle(p.hair, 1);
  if (female) { g.fillEllipse(cx - 7, 12, 8, 20); g.fillEllipse(cx + 7, 12, 8, 20); }
  g.fillStyle(0x221b18, 1); g.fillEllipse(cx, 9, 15, 17);
  g.fillStyle(p.skin, 1); g.fillEllipse(cx, 8, 13, 15);
  g.fillStyle(p.eye, 1); g.fillRect(cx - 4, 8, 2, 1); g.fillRect(cx + 2, 8, 2, 1);
  if (female) {
    g.fillStyle(p.hair, 1);
    for (const x of [-6,-3,0,3,6]) g.fillCircle(cx + x, 2, 3);
    for (const y of [7,11,15,19]) { g.fillCircle(cx - 8, y, 3); g.fillCircle(cx + 8, y, 3); }
    g.fillStyle(0xb27866, 1); g.fillRect(cx - 2, 13, 4, 1);
  } else {
    g.fillStyle(p.hair, 1); g.fillRoundedRect(cx - 6, 11, 12, 7, 3);
    g.fillStyle(p.skin, 1); g.fillRect(cx - 2, 12, 4, 1);
  }
  if (def.prop === 'laptop') {
    g.fillStyle(0x202830, 1); g.fillRoundedRect(cx - 11, 23, 22, 10, 1);
    g.fillStyle(0x163d48, 1); g.fillRect(cx - 9, 24, 18, 7);
    g.fillStyle(0x93d9bd, 1); g.fillRect(cx - 7, 25, 8, 1);
    g.fillRect(cx - 5, 28, frame % 2 ? 10 : 6, 1);
    g.fillStyle(0x87949c, 1); g.fillRoundedRect(cx - 12, 33, 24, 4, 1);
    g.fillStyle(p.skin, 1);
    g.fillCircle(cx - 6, 33 + frame % 2, 2); g.fillCircle(cx + 6, 34 - frame % 2, 2);
  }
}

function drawNpcFrame(
  g: Phaser.GameObjects.Graphics,
  def: NpcWorldDef,
  frame: number,
  ox: number,
  facing: SpriteFacingRow = 'down',
): void {
  if (def.seated) { drawSeatedNpc(g, def, frame, ox); return; }
  const p = def.palette;
  drawTopDownChar(g, p, frame, ox, {
    gender: def.appearance?.gender,
    appearance: def.appearance,
    hood: def.hood,
    ears: def.ears,
    big: def.big,
    weaponStyle: 'none',
    facing,
  });
  const walkPhase = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const bob = walkPhase !== 0 ? -1 : 0;
  const cx = ox + FW / 2;
  const cy = FH / 2 + 2;
  if (def.appearance) drawIndividualDetails(g, def.appearance, def.seated ? 0 : frame, facing, ox);
  drawNpcProp(g, def, cx, cy, def.seated ? 0 : bob);

}

export const COMBAT_ATLAS_KEY = ENEMY_WORLD_ATLAS_KEY;
const ATLAS_COLS = 3;
const STRIP_W = FW * FRAMES;
const TEMP_STRIP_KEY = '__combat_atlas_strip';

function blitGraphicsStrip(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  if (scene.textures.exists(TEMP_STRIP_KEY)) scene.textures.remove(TEMP_STRIP_KEY);
  g.generateTexture(TEMP_STRIP_KEY, w, h);
  g.destroy();
  const img = scene.textures.get(TEMP_STRIP_KEY).getSourceImage() as CanvasImageSource;
  ctx.drawImage(img, dx, dy);
  scene.textures.remove(TEMP_STRIP_KEY);
}

function ensureCombatAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(COMBAT_ATLAS_KEY)) return;

  type StripPlacement = {
    dx: number;
    dy: number;
    framePrefix: string;
    frames: number;
    draw: (g: Phaser.GameObjects.Graphics) => void;
  };

  const strips: StripPlacement[] = [];
  let slot = 0;

  const addStrip = (framePrefix: string, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    strips.push({
      dx: (slot % ATLAS_COLS) * STRIP_W,
      dy: Math.floor(slot / ATLAS_COLS) * FH,
      framePrefix,
      frames: FRAMES,
      draw,
    });
    slot += 1;
  };

  const races: CharKind[] = ['human', 'elf', 'orc'];
  const genders: PlayerGender[] = ['male', 'female'];
  const playerFacings: SpriteFacingRow[] = ['down', 'side', 'up', 'down-side', 'up-side'];
  for (const race of races) {
    for (const gender of genders) {
      const base = playerSpritePrefix(race, gender);
      for (const facing of playerFacings) {
        const framePrefix = facing === 'down' ? base : `${base}-${facing}`;
        addStrip(framePrefix, (g) => {
          for (let f = 0; f < FRAMES; f++) drawCharacter(g, race, f, f * FW, facing, gender);
        });
      }
    }
  }

  const enemyKinds: EnemyKind[] = ['goblin', 'shadow', 'wolf', 'cinder', 'bone', 'orc_grunt'];
  const enemyFacings: SpriteFacingRow[] = ['down', 'side', 'up', 'down-side', 'up-side'];
  for (const kind of enemyKinds) {
    for (const facing of enemyFacings) {
      // Legacy prefix `enemy-${kind}` == down (resolveEnemySprite / art fallback).
      const framePrefix = facing === 'down' ? `enemy-${kind}` : `enemy-${kind}-${facing}`;
      addStrip(framePrefix, (g) => {
        for (let f = 0; f < FRAMES; f++) drawEnemyFrame(g, kind, f, f * FW, facing);
      });
    }
  }

  for (const npcId of NPC_CHARACTER_IDS) {
    const def = npcWorldDef(npcId);
    if (!def) continue;
    const basePrefix = npcFramePrefix(npcId);
    for (const facing of ['down', 'up'] as const) {
      const framePrefix = facing === 'down' ? basePrefix : `${basePrefix}-up`;
      addStrip(framePrefix, (g) => {
        for (let f = 0; f < FRAMES; f++) drawNpcFrame(g, def, f, f * FW, facing);
      });
    }
  }

  const atlasW = ATLAS_COLS * STRIP_W;
  const atlasH = Math.ceil(strips.length / ATLAS_COLS) * FH;
  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  for (const strip of strips) {
    blitGraphicsStrip(scene, ctx, strip.dx, strip.dy, STRIP_W, FH, strip.draw);
  }

  scene.textures.addCanvas(COMBAT_ATLAS_KEY, canvas);
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);

  for (const strip of strips) {
    for (let i = 0; i < strip.frames; i++) {
      atlas.add(`${strip.framePrefix}-${i}`, 0, strip.dx + i * FW, strip.dy, FW, FH);
    }
  }
}

function registerAtlasAnimSet(
  scene: Phaser.Scene,
  animPrefix: string,
  framePrefix: string,
  walkRate = 9,
  activeIdle = false,
): void {
  const defs = [
    { action: 'idle', start: 0, end: activeIdle ? 3 : 0, rate: 4, repeat: -1 },
    { action: 'walk', start: 1, end: 3, rate: walkRate, repeat: -1 },
    { action: 'attack', start: 4, end: 4, rate: 12, repeat: 0 },
    { action: 'hurt', start: 5, end: 5, rate: 8, repeat: 0 },
  ];
  for (const d of defs) {
    const key = `${animPrefix}-${d.action}`;
    const frames = scene.anims.generateFrameNames(COMBAT_ATLAS_KEY, {
      prefix: `${framePrefix}-`,
      start: d.start,
      end: d.end,
    });
    if (frames.length === 0) continue;
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({
      key,
      frames,
      frameRate: d.rate,
      repeat: d.repeat,
    });
  }
}

/** Procedural enemies: 8-way walk via down/side/up/down-side/up-side (+ flipX). */
function registerEnemyDirectionalWalk(
  scene: Phaser.Scene,
  animPrefix: string,
  kind: EnemyKind,
  walkRate: number,
): void {
  registerDirectionalWalkRows(
    scene,
    animPrefix,
    (row) => (row === 'down' ? `enemy-${kind}` : `enemy-${kind}-${row}`),
    walkRate,
  );
}

function registerPlayerDirectionalWalk(
  scene: Phaser.Scene,
  race: CharKind,
  gender: PlayerGender,
  walkRate: number,
): void {
  const base = playerSpritePrefix(race, gender);
  registerDirectionalWalkRows(
    scene,
    base,
    (row) => (row === 'down' ? base : `${base}-${row}`),
    walkRate,
    true,
  );
}

function registerDirectionalWalkRows(
  scene: Phaser.Scene,
  animPrefix: string,
  framePrefixForRow: (row: SpriteFacingRow) => string,
  walkRate: number,
  smooth = false,
): void {
  const rows: SpriteFacingRow[] = ['down', 'side', 'up', 'down-side', 'up-side'];
  for (const row of rows) {
    const key = `${animPrefix}-walk-${row}`;
    const framePrefix = framePrefixForRow(row);
    if (smooth) {
      const idle = `${animPrefix}-idle-${row}`;
      if (scene.anims.exists(idle)) scene.anims.remove(idle);
      scene.anims.create({ key: idle, frames: [{ key: COMBAT_ATLAS_KEY, frame: `${framePrefix}-0` }], frameRate: 1, repeat: -1 });
    }
    const frames = scene.anims.generateFrameNames(COMBAT_ATLAS_KEY, {
      prefix: `${framePrefix}-`,
      start: 1,
      end: 3,
    });
    if (frames.length === 0) continue;
    if (smooth && frames[PLAYER_WALK_CYCLE[3] - 1]) frames.push(frames[PLAYER_WALK_CYCLE[3] - 1]!);
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({
      key,
      frames,
      frameRate: walkRate,
      repeat: -1,
    });
  }
}

export function registerCombatSprites(scene: Phaser.Scene, _playerRace: string): void {
  ensureCombatAtlas(scene);

  for (const race of ['human', 'elf', 'orc'] as CharKind[]) {
    for (const gender of ['male', 'female'] as PlayerGender[]) {
      const prefix = playerSpritePrefix(race, gender);
      registerAtlasAnimSet(scene, prefix, prefix, 10);
      registerPlayerDirectionalWalk(scene, race, gender, 10);
    }
  }

  const enemyAnims: Array<{ prefix: string; kind: EnemyKind; rate: number }> = [
    { prefix: 'goblin', kind: 'goblin', rate: 9 },
    { prefix: 'shadow', kind: 'shadow', rate: 10 },
    { prefix: 'wolf', kind: 'wolf', rate: 12 },
    { prefix: 'cinder', kind: 'cinder', rate: 11 },
    { prefix: 'bone', kind: 'bone', rate: 7 },
    { prefix: 'orc_grunt', kind: 'orc_grunt', rate: 8 },
  ];
  for (const e of enemyAnims) {
    registerAtlasAnimSet(scene, e.prefix, `enemy-${e.kind}`, e.rate);
    registerEnemyDirectionalWalk(scene, e.prefix, e.kind, e.rate);
  }

  for (const npcId of NPC_CHARACTER_IDS) {
    const prefix = npcAnimPrefix(npcId);
    registerAtlasAnimSet(scene, prefix, npcFramePrefix(npcId), 8, npcWorldDef(npcId)?.prop === 'laptop');
    for (const action of ['idle', 'walk'] as const) {
      const key = `${prefix}-${action}-up`;
      if (!animNeedsAtlasRefresh(scene, key, COMBAT_ATLAS_KEY)) continue;
      if (scene.anims.exists(key)) scene.anims.remove(key);
      const frames = scene.anims.generateFrameNames(COMBAT_ATLAS_KEY, {
        prefix: `${npcFramePrefix(npcId)}-up-`, start: action === 'walk' ? 1 : 0, end: action === 'walk' ? 3 : 0,
      });
      if (frames.length) scene.anims.create({ key, frames, frameRate: action === 'walk' ? 8 : 1, repeat: -1 });
    }
  }
}

/** True if anim missing or still bound to a destroyed/old atlas key. */
function animNeedsAtlasRefresh(
  scene: Phaser.Scene,
  animKey: string,
  atlasKey: string,
): boolean {
  if (!scene.anims.exists(animKey)) return true;
  const anim = scene.anims.get(animKey);
  const first = anim?.frames?.[0];
  if (!first) return true;
  if (first.textureKey !== atlasKey) return true;
  if (!scene.textures.exists(atlasKey)) return true;
  const frame = first.frame;
  if (!frame || !frame.source) return true;
  return false;
}

/** Cloak/shield overlays pack into gear-atlas (equip variants). */
function registerGearIdleRow(scene: Phaser.Scene, prefix: string, framePrefix: string, row: SpriteFacingRow): void {
  const key = `${prefix}-idle-${row}`;
  if (!animNeedsAtlasRefresh(scene, key, GEAR_ATLAS_KEY)) return;
  if (scene.anims.exists(key)) scene.anims.remove(key);
  scene.anims.create({ key, frames: [{ key: GEAR_ATLAS_KEY, frame: `${framePrefix}-0` }], frameRate: 1, repeat: -1 });
}

function registerGearAnimSet(
  scene: Phaser.Scene,
  prefix: string,
  framePrefix: string,
  walkRate = 9,
): void {
  const defs = [
    { key: `${prefix}-idle`, start: 0, end: 0, rate: 4, repeat: -1 },
    { key: `${prefix}-walk`, start: 1, end: 3, rate: walkRate, repeat: -1 },
    { key: `${prefix}-attack`, start: 4, end: 4, rate: 12, repeat: 0 },
    { key: `${prefix}-hurt`, start: 5, end: 5, rate: 8, repeat: 0 },
  ];
  for (const d of defs) {
    if (!animNeedsAtlasRefresh(scene, d.key, GEAR_ATLAS_KEY)) continue;
    if (scene.anims.exists(d.key)) scene.anims.remove(d.key);
    const frames = scene.anims.generateFrameNames(GEAR_ATLAS_KEY, {
      prefix: `${framePrefix}-`,
      start: d.start,
      end: d.end,
    });
    if (frames.length === 0) continue;
    if (d.start === 1 && frames[1]) frames.push(frames[1]);
    scene.anims.create({
      key: d.key,
      frames,
      frameRate: d.start === 1 ? 10 : d.rate,
      repeat: d.repeat,
    });
  }
}

function blitStripToCache(
  scene: Phaser.Scene,
  prefix: string,
  draw: (g: Phaser.GameObjects.Graphics, frame: number) => void,
): void {
  if (getCachedGearStrip(prefix)) return;
  const tempKey = `__gear_tmp_${prefix}`;
  const canvas = document.createElement('canvas');
  canvas.width = FW * FRAMES;
  canvas.height = FH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let frame = 0; frame < FRAMES; frame++) {
    if (scene.textures.exists(tempKey)) scene.textures.remove(tempKey);
    g.clear();
    draw(g, frame);
    g.generateTexture(tempKey, FW, FH);
    const src = scene.textures.get(tempKey).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, frame * FW, 0);
  }
  g.destroy();
  scene.textures.remove(tempKey);
  cacheGearStrip(prefix, canvas);
}

function buildCloakFacingSheet(
  scene: Phaser.Scene,
  variant: string,
  facing: SpriteFacingRow,
): void {
  const prefix = cloakFramePrefix(variant, facing);
  if (hasGearStrip(scene, prefix)) return;
  const palette = CLOAK_PALETTES[variant] ?? CLOAK_PALETTES.traveler;
  blitStripToCache(scene, prefix, (g, frame) => drawCloakLayer(g, palette, frame, 0, facing));
}

export function registerCloakOverlay(scene: Phaser.Scene, variant: string): void {
  const rows: SpriteFacingRow[] = ['down', 'side', 'up', 'down-side', 'up-side'];
  for (const row of rows) {
    buildCloakFacingSheet(scene, variant, row);
  }
  ensureGearAtlas(scene);
  const downPrefix = cloakFramePrefix(variant, 'down');
  registerGearAnimSet(scene, `cloak-${variant}`, downPrefix, 10);
  for (const row of rows) {
    const animKey = `cloak-${variant}-walk-${row}`;
    const framePrefix = cloakFramePrefix(variant, row);
    registerGearIdleRow(scene, `cloak-${variant}`, framePrefix, row);
    if (!animNeedsAtlasRefresh(scene, animKey, GEAR_ATLAS_KEY)) continue;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    const frames = scene.anims.generateFrameNames(GEAR_ATLAS_KEY, {
      prefix: `${framePrefix}-`,
      start: 1,
      end: 3,
    });
    if (frames.length === 0) continue;
    if (frames[1]) frames.push(frames[1]);
    scene.anims.create({
      key: animKey,
      frames,
      frameRate: 10,
      repeat: -1,
    });
  }
}

export function cloakTextureKey(_variant: string, _facing: SpriteFacingRow = 'down'): string {
  return GEAR_ATLAS_KEY;
}

export { cloakFrameName, cloakFramePrefix };

interface ShieldPalette {
  face: number;
  rim: number;
  boss: number;
  glow: number;
}

const SHIELD_PALETTES: Record<string, ShieldPalette> = {
  wood: { face: 0x8a6040, rim: 0x4a3018, boss: 0xc8a060, glow: 0xd8b888 },
  iron: { face: 0x6a7480, rim: 0x2a3038, boss: 0xa8b0b8, glow: 0xc8d0d8 },
  steel: { face: 0x8898a8, rim: 0x304050, boss: 0xd0e0f0, glow: 0xe8f0ff },
  daedric: { face: 0x2a1410, rim: 0x100808, boss: 0xaa2218, glow: 0xff5533 },
  holy: { face: 0xf0e8d0, rim: 0xc8a848, boss: 0xfff8e0, glow: 0xffe080 },
};

function drawShieldLayer(
  g: Phaser.GameObjects.Graphics,
  palette: ShieldPalette,
  frame: number,
  ox: number,
): void {
  const cx = ox + FW / 2;
  const cy = FH / 2 + 4;
  const walkPhase = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const attack = frame === 4;
  const bob = walkPhase !== 0 ? -1 : 0;
  // Left arm side when facing right (flipX handles facing)
  const sx = cx - 11 - walkPhase * 1.5 - (attack ? 2 : 0);
  const sy = cy + 2 + bob;

  g.fillStyle(palette.rim, 1);
  g.fillEllipse(sx, sy, 18, 24);
  g.fillStyle(palette.face, 1);
  g.fillEllipse(sx, sy, 14, 20);
  g.fillStyle(palette.boss, 1);
  g.fillCircle(sx, sy - 1, 3.5);
  g.fillStyle(palette.glow, 0.35);
  g.fillEllipse(sx - 2, sy - 4, 5, 7);

  // Holy crusader: gold cross + EW mark
  if (palette === SHIELD_PALETTES.holy || palette.face === SHIELD_PALETTES.holy.face) {
    g.fillStyle(0xc8a848, 0.95);
    g.fillRect(sx - 1, sy - 8, 2, 14);
    g.fillRect(sx - 5, sy - 2, 10, 2);
    g.fillStyle(0xfff8e0, 0.9);
    g.fillRect(sx - 4, sy + 4, 2, 2);
    g.fillRect(sx - 1, sy + 4, 2, 2);
    g.fillRect(sx + 2, sy + 4, 2, 2);
  }
}

function buildShieldSheet(scene: Phaser.Scene, variant: string): void {
  const prefix = shieldFramePrefix(variant);
  if (hasGearStrip(scene, prefix)) return;
  const palette = SHIELD_PALETTES[variant] ?? SHIELD_PALETTES.iron;
  blitStripToCache(scene, prefix, (g, frame) => drawShieldLayer(g, palette, frame, 0));
}

export function registerShieldOverlay(scene: Phaser.Scene, variant: string): void {
  buildShieldSheet(scene, variant);
  ensureGearAtlas(scene);
  registerGearAnimSet(scene, `shield-${variant}`, shieldFramePrefix(variant), 10);
}

export function shieldTextureKey(_variant: string): string {
  return GEAR_ATLAS_KEY;
}

export { shieldFrameName, shieldFramePrefix };

export type WeaponOverlayKind = 'melee' | 'bow' | 'staff';

const WEAPON_OVERLAY_COLOR: Record<WeaponOverlayKind, number> = {
  melee: 0xd0d0d0,
  bow: 0x8a5a28,
  staff: 0x8b6914,
};

function drawWeaponOverlayFrame(
  g: Phaser.GameObjects.Graphics,
  kind: WeaponOverlayKind,
  facing: SpriteFacingRow,
  frame: number,
  ox: number,
): void {
  const cx = ox + FW / 2;
  const cy = FH / 2 + 2;
  const walkPhase = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const bob = walkPhase !== 0 ? -1 : 0;
  drawHeldWeapon(g, kind, facing, frame, cx, cy, bob, WEAPON_OVERLAY_COLOR[kind]);
}

function buildWeaponFacingSheet(
  scene: Phaser.Scene,
  kind: WeaponOverlayKind,
  facing: SpriteFacingRow,
): void {
  const prefix = weaponFramePrefix(kind, facing);
  if (hasGearStrip(scene, prefix)) return;
  blitStripToCache(scene, prefix, (g, frame) => drawWeaponOverlayFrame(g, kind, facing, frame, 0));
}

export function registerWeaponOverlay(scene: Phaser.Scene, kind: WeaponOverlayKind): void {
  const rows: SpriteFacingRow[] = ['down', 'side', 'up', 'down-side', 'up-side'];
  for (const row of rows) {
    buildWeaponFacingSheet(scene, kind, row);
  }
  ensureGearAtlas(scene);
  const downPrefix = weaponFramePrefix(kind, 'down');
  registerGearAnimSet(scene, `weapon-${kind}`, downPrefix, 10);
  for (const row of rows) {
    const animKey = `weapon-${kind}-walk-${row}`;
    const framePrefix = weaponFramePrefix(kind, row);
    registerGearIdleRow(scene, `weapon-${kind}`, framePrefix, row);
    if (!animNeedsAtlasRefresh(scene, animKey, GEAR_ATLAS_KEY)) continue;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    const frames = scene.anims.generateFrameNames(GEAR_ATLAS_KEY, {
      prefix: `${framePrefix}-`,
      start: 1,
      end: 3,
    });
    if (frames.length === 0) continue;
    if (frames[1]) frames.push(frames[1]);
    scene.anims.create({
      key: animKey,
      frames,
      frameRate: 10,
      repeat: -1,
    });
  }
}

export function weaponTextureKey(_kind: WeaponOverlayKind, _facing: SpriteFacingRow = 'down'): string {
  return GEAR_ATLAS_KEY;
}

export { weaponFrameName, weaponFramePrefix };

export {
  registerMountOverlay,
  mountTextureKey,
  registerMountedLook,
  isPrismMount,
} from './mounted-sprite.js';

export function registerNpcSprites(scene: Phaser.Scene): void {
  ensureCombatAtlas(scene);
}

export function combatAtlasKey(): string {
  return COMBAT_ATLAS_KEY;
}

export function playerSpriteFrame(
  race: string,
  frame = 0,
  gender: PlayerGender | string | undefined = 'male',
): string {
  return `${playerSpritePrefix(race, gender)}-${frame}`;
}

export function enemySpriteFrame(type: string, frame = 0): string {
  const kind = enemySpriteConfig(type).kind;
  return `enemy-${kind}-${frame}`;
}

export function npcSpriteFrame(npcId: string): string {
  if (npcIsProp(npcId)) return `${npcFramePrefix('town_merchant')}-0`;
  if (npcWorldDef(npcId)) return `${npcFramePrefix(npcId)}-0`;
  return `${npcFramePrefix('elder_mira')}-0`;
}

export function npcIdleAnimKey(npcId: string): string {
  return `${npcAnimPrefix(npcId)}-idle`;
}

export function npcWalkAnimKey(npcId: string): string {
  return `${npcAnimPrefix(npcId)}-walk`;
}

export function playerTextureKey(_race?: string): string {
  return COMBAT_ATLAS_KEY;
}

export type PlayerAnimAction = 'idle' | 'walk' | 'attack' | 'hurt';

export function playerAnimKey(
  race: string,
  action: PlayerAnimAction,
  gender: PlayerGender | string | undefined = 'male',
): string {
  return `${playerSpritePrefix(race, gender)}-${action}`;
}

/** 8-way walk: player-{race}[-f]-walk-{down|side|up|down-side|up-side}. */
export function playerIdleAnimKey(race: string, facing: Facing8, gender: PlayerGender | string | undefined = 'male'): string {
  return `${playerSpritePrefix(race, gender)}-idle-${facingRow(facing)}`;
}

export function playerWalkAnimKey(
  race: string,
  facing: Facing8,
  gender: PlayerGender | string | undefined = 'male',
): string {
  return `${playerSpritePrefix(race, gender)}-walk-${facingRow(facing)}`;
}

export function enemySpriteConfig(type: string): { kind: EnemyKind; prefix: string; displayScale: number } {
  return ENEMY_SPRITE[type] ?? { kind: 'goblin', prefix: 'goblin', displayScale: 0.92 };
}

export function enemyTextureKey(_type: string): string {
  return COMBAT_ATLAS_KEY;
}

export function enemyAnimPrefix(type: string): string {
  return enemySpriteConfig(type).prefix;
}

export function enemyDisplayScale(type: string): number {
  return enemySpriteConfig(type).displayScale;
}

export function npcTextureKey(_npcId: string): string {
  return COMBAT_ATLAS_KEY;
}

/** Frame name inside {@link COMBAT_ATLAS_KEY} for an NPC id. */
export function npcFrame(npcId: string): string {
  return npcSpriteFrame(npcId);
}

export const SPRITE_SIZE = { width: FW, height: FH, hitRadius: 14 };

function drawIndividualDetails(g: Phaser.GameObjects.Graphics, a: CitizenAppearance, frame:number,row:SpriteFacingRow, ox=0): void {
  const cx=ox+FW/2,cy=FH/2+2,bob=frame>=1&&frame<=3&&frame!==2?-1:0;
  const headY=cy-8+bob,north=row==='up'||row==='up-side',side=row==='side';
  g.fillStyle(a.hair,1);
  if(a.hairStyle===1){
    for(const offset of [-5,-2,2,5])g.fillCircle(cx+offset,headY-5,2.5);
    if(a.gender==='female')for(const dy of [1,4,7,10]){g.fillCircle(cx-7,headY+dy,2.5);g.fillCircle(cx+7,headY+dy,2.5);}
  }
  else if(a.hairStyle===2){g.fillEllipse(cx-5,headY+5,4,13);g.fillStyle(a.trim,1);g.fillRect(cx-7,headY+10,4,2);}
  else if(a.hairStyle===3){g.fillEllipse(cx-(side?6:0),headY+6,5,10);}
  else if(a.hairStyle===4){g.fillTriangle(cx-6,headY-6,cx+7,headY-5,cx-1,headY+1);}
  else if(a.hairStyle===5){g.fillStyle(a.skin,1);g.fillEllipse(cx,headY-4,10,7);}
  // Clothing shapes differ as well as palette; all stay within the 48px cell.
  g.fillStyle(a.trim,1);
  if(a.outfit===0){g.fillRect(cx-1,cy+1+bob,2,9);}
  else if(a.outfit===1){g.fillRect(cx-6,cy+3+bob,12,3);g.fillCircle(cx+5,cy+1+bob,2);}
  else if(a.outfit===2){g.fillTriangle(cx-8,cy+2+bob,cx-10,cy+11+bob,cx-2,cy+10+bob);g.fillTriangle(cx+8,cy+2+bob,cx+10,cy+11+bob,cx+2,cy+10+bob);}
  else if(a.outfit===3){g.fillEllipse(cx-5,cy-1+bob,7,9);}
  else {g.fillEllipse(cx-8,cy-1+bob,7,5);g.fillEllipse(cx+8,cy-1+bob,7,5);g.fillRect(cx-3,cy+3+bob,6,4);}
  if(a.accessory===0&&a.gender==='male'&&a.age>=28&&!north){g.fillStyle(a.hair,1);g.fillTriangle(cx-4,headY+3,cx+4,headY+3,cx,headY+8);}
  if(a.accessory===1&&!north){g.lineStyle(1,a.trim,1);g.strokeCircle(cx-3,headY+1,2);if(!side)g.strokeCircle(cx+3,headY+1,2);}
  if(a.accessory===2){g.fillStyle(a.trim,1);g.fillRect(cx-6,cy-2+bob,12,3);}
  if(a.accessory===3){g.fillStyle(0x6b4931,1);g.fillRoundedRect(cx+7,cy+5+bob,5,7,1);}
  if(a.accessory===4){g.fillStyle(a.body,1);g.fillEllipse(cx,headY-6,16,5);g.fillStyle(a.trim,1);g.fillRect(cx-6,headY-7,12,2);}
}

/** One cached directional sheet per actor; shared templates never identify residents. */
export function registerCitizenSprite(scene: Phaser.Scene, id:string, baseFrame:string, appearance?:CitizenAppearance): {texture:string;prefix:string;frame:string} {
  const prefix=`citizen-${id}`,texture=`individual-${id}`;
  if(scene.textures.exists(texture))return {texture,prefix,frame:`${prefix}-0`};
  const npcId=baseFrame.startsWith('npc-')?baseFrame.replace(/^npc-/,'').replace(/-(?:up-)?\d+$/,''):null;
  const template=npcId?npcWorldDef(npcId):null;
  const a=appearance??citizenAppearance(id,{race:baseFrame.includes('elf')?'elf':baseFrame.includes('orc')?'orc':'human',
    soldier:Boolean(id.includes('garrison')||npcId?.includes('guard')||npcId?.includes('captain'))});
  const palette={skin:a.skin,hair:a.hair,body:a.body,trim:a.trim,eye:a.eye,weapon:template?.palette.weapon??0xc9c4b8};
  const rows:SpriteFacingRow[]=['down','side','up','down-side','up-side'];
  const canvas=document.createElement('canvas');canvas.width=FW*FRAMES;canvas.height=FH*rows.length;
  const ctx=canvas.getContext('2d')!;
  const g=scene.make.graphics({x:0,y:0},false),temp='__individual_citizen_frame';
  for(let ri=0;ri<rows.length;ri++){
    const row=rows[ri]!;g.clear();
    for(let frame=0;frame<FRAMES;frame++){
      const ox=frame*FW;
      drawTopDownChar(g,palette,frame,ox,{gender:a.gender,ears:a.race==='elf',big:a.race==='orc',weaponStyle:'none',facing:row,appearance:a});
      drawIndividualDetails(g,a,frame,row,ox);
      if(template)drawNpcProp(g,{...template,palette},ox+FW/2,FH/2+2,frame>=1&&frame<=3&&frame!==2?-1:0);
    }
    if(scene.textures.exists(temp))scene.textures.remove(temp);
    g.generateTexture(temp,FW*FRAMES,FH);ctx.drawImage(scene.textures.get(temp).getSourceImage() as CanvasImageSource,0,ri*FH);
  }
  g.destroy();scene.textures.remove(temp);
  const pixels=ctx.getImageData(0,0,FW,FH).data;
  let fingerprint=2166136261;for(const channel of pixels)fingerprint=Math.imul(fingerprint^channel,16777619)>>>0;
  const fingerprints=(scene.data.get('citizenAppearanceFingerprints') as Map<string,number>|undefined)??new Map<string,number>();
  fingerprints.set(id,fingerprint);scene.data.set('citizenAppearanceFingerprints',fingerprints);
  scene.textures.addCanvas(texture,canvas);
  const atlas=scene.textures.get(texture);
  for(let ri=0;ri<rows.length;ri++){
    const row=rows[ri]!,rowPrefix=row==='down'?prefix:`${prefix}-${row}`;
    for(let frame=0;frame<FRAMES;frame++)atlas.add(`${rowPrefix}-${frame}`,0,frame*FW,ri*FH,FW,FH);
    for(const action of ['walk','idle'] as const){
      const key=`${prefix}-${action}-${row}`;
      if(scene.anims.exists(key))scene.anims.remove(key);
      scene.anims.create({key,frames:(action==='walk'?[1,2,3,2]:[0]).map(frame=>({key:texture,frame:`${rowPrefix}-${frame}`})),frameRate:action==='walk'?9:1,repeat:-1});
    }
  }
  for(const action of ['idle','walk'] as const){
    const key=`${prefix}-${action}`;
    if(scene.anims.exists(key))scene.anims.remove(key);
    scene.anims.create({key,frames:(action==='walk'?[1,2,3,2]:[0]).map(frame=>({key:texture,frame:`${prefix}-${frame}`})),frameRate:action==='walk'?9:1,repeat:-1});
  }
  return {texture,prefix,frame:`${prefix}-0`};
}
