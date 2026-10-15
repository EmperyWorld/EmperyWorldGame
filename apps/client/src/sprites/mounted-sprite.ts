import Phaser from 'phaser';
import type { SpriteFacingRow } from './facing4.js';
import { MOUNT_IDLE_FRAMES, MOUNT_WALK_FRAMES, mountedFramePose } from './mounted-pose.js';
import {
  mountedAnimKey,
  mountedTextureKey,
  type ArmorLook,
  type MountedLook,
  type MountedWeaponKind,
  type MountVisual,
} from './mounted-look.js';
import {
  cacheMountStrip,
  ensureMountAtlas,
  getCachedMountStrip,
  hasMountStrip,
  MOUNT_ATLAS_KEY,
  MOUNT_FRAMES,
  mountedFrameName,
  mountedFramePrefix,
  mountAtlasTextureKey,
} from './mount-atlas.js';

const FW = 48;
const FH = 48;
const FRAMES = MOUNT_FRAMES;

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

interface MountPalette {
  body: number;
  mid: number;
  dark: number;
  shade: number;
  mane: number;
  maneHi: number;
  muzzle: number;
  nostril: number;
  eye: number;
  eyeHi: number;
  hoof: number;
  sock: number;
  saddle: number;
  saddlePad: number;
  rein: number;
  white: number;
}

const MOUNT_PALETTES: Record<MountVisual, MountPalette> = {
  bay: {
    body: 0xa87848,
    mid: 0x8a5c38,
    dark: 0x5a3824,
    shade: 0x3a2418,
    mane: 0x2a1c12,
    maneHi: 0x4a3424,
    muzzle: 0xc8a888,
    nostril: 0x6a4838,
    eye: 0x1a1008,
    eyeHi: 0xe8d0a0,
    hoof: 0x1c1410,
    sock: 0xd8c8b0,
    saddle: 0x5a3020,
    saddlePad: 0x3a5a48,
    rein: 0x4a3020,
    white: 0xe8dcc8,
  },
  ash: {
    body: 0x4a4a52,
    mid: 0x383840,
    dark: 0x242428,
    shade: 0x141418,
    mane: 0x1a1010,
    maneHi: 0x5a2828,
    muzzle: 0x8a7870,
    nostril: 0x3a2820,
    eye: 0xcc2211,
    eyeHi: 0xff8866,
    hoof: 0x0c0c10,
    sock: 0x2a2020,
    saddle: 0x3a1818,
    saddlePad: 0x4a2030,
    rein: 0x2a1818,
    white: 0x6a6068,
  },
  pale: {
    body: 0xe8e0d4,
    mid: 0xc8c0b4,
    dark: 0xa09888,
    shade: 0x786858,
    mane: 0xb0b8c8,
    maneHi: 0xd8e0f0,
    muzzle: 0xf0e8e0,
    nostril: 0xa09080,
    eye: 0x405060,
    eyeHi: 0xe8f0ff,
    hoof: 0x3a3028,
    sock: 0xffffff,
    saddle: 0x5a6878,
    saddlePad: 0x708898,
    rein: 0x687888,
    white: 0xffffff,
  },
  prism: {
    body: 0xa888c8,
    mid: 0x7868a8,
    dark: 0x484070,
    shade: 0x282040,
    mane: 0x40c8c8,
    maneHi: 0xff88cc,
    muzzle: 0xd8c8e8,
    nostril: 0x685878,
    eye: 0x22e8ff,
    eyeHi: 0xffffff,
    hoof: 0x2a2040,
    sock: 0xffcc88,
    saddle: 0x503868,
    saddlePad: 0x286868,
    rein: 0x8860a8,
    white: 0xe8fff8,
  },
};

interface RiderPalette {
  skin: number;
  hair: number;
  eye: number;
  body: number;
  trim: number;
  pants: number;
  boot: number;
  metal: number;
  robe: number;
}

const RACE_PAL: Record<string, { m: RiderPalette; f: RiderPalette }> = {
  human: {
    m: {
      skin: 0xf0c8a0,
      hair: 0x5a4030,
      eye: 0x222222,
      body: 0x3a6ea5,
      trim: 0xc9a66b,
      pants: 0x3a3a48,
      boot: 0x2a2018,
      metal: 0xa8b0b8,
      robe: 0x4a4080,
    },
    f: {
      skin: 0xf2cbb0,
      hair: 0x7a4830,
      eye: 0x333344,
      body: 0x4a7ab0,
      trim: 0xd0b078,
      pants: 0x3a3a48,
      boot: 0x2a2018,
      metal: 0xb0b8c0,
      robe: 0x5a5090,
    },
  },
  elf: {
    m: {
      skin: 0xe8d8c8,
      hair: 0xd4af37,
      eye: 0x1b4332,
      body: 0x2d6a4f,
      trim: 0x95d5b2,
      pants: 0x2a3a30,
      boot: 0x1a2818,
      metal: 0xa8dadc,
      robe: 0x2a5a68,
    },
    f: {
      skin: 0xeee0d4,
      hair: 0xe8d090,
      eye: 0x1b4332,
      body: 0x357a5c,
      trim: 0xa8e0c0,
      pants: 0x2a3a30,
      boot: 0x1a2818,
      metal: 0xb0e0e4,
      robe: 0x356878,
    },
  },
  orc: {
    m: {
      skin: 0x6a9a5a,
      hair: 0x2d2d2d,
      eye: 0xff4444,
      body: 0x8b3a3a,
      trim: 0x4a2828,
      pants: 0x2a2820,
      boot: 0x1a1810,
      metal: 0x909090,
      robe: 0x4a3038,
    },
    f: {
      skin: 0x72a462,
      hair: 0x3a1818,
      eye: 0xff5555,
      body: 0x7a4040,
      trim: 0x5a3030,
      pants: 0x2a2820,
      boot: 0x1a1810,
      metal: 0x989898,
      robe: 0x5a3840,
    },
  },
};

const PROF_TRIM: Record<string, number> = {
  warrior: 0xc9a66b,
  archer: 0x7cb87c,
  mystic: 0x88aadd,
};

const CLOAK_PAL: Record<string, { main: number; dark: number; trim: number }> = {
  traveler: { main: 0x7a5840, dark: 0x3a2818, trim: 0x9a7858 },
  shadow: { main: 0x4a3068, dark: 0x1a1028, trim: 0x7744aa },
  daedric: { main: 0x2a1810, dark: 0x0c0604, trim: 0xaa2218 },
  arcane: { main: 0x3a4a78, dark: 0x141828, trim: 0x66aadd },
};

function riderPalette(look: MountedLook): RiderPalette {
  const race = RACE_PAL[look.race] ?? RACE_PAL.human;
  const base = { ...(look.gender === 'female' ? race.f : race.m) };
  const trim = PROF_TRIM[look.profession] ?? base.trim;
  base.trim = trim;
  if (look.armorType === 'heavy') {
    base.body = base.metal;
  } else if (look.armorType === 'robe') {
    base.body = base.robe;
  } else {
    // light leather
    base.body = look.profession === 'archer' ? 0x5a6840 : 0x6a5040;
  }
  return base;
}

function mountLeg(
  g: Phaser.GameObjects.Graphics,
  p: MountPalette,
  x: number,
  y: number,
  len: number,
  kick: number,
  thin = false,
): void {
  const w = thin ? 2.4 : 3.2;
  g.fillStyle(p.dark, 1);
  g.fillRect(x - w / 2 + kick * 0.35, y, w, len * 0.55);
  g.fillStyle(p.shade, 1);
  g.fillRect(x - w / 2 + 0.4 + kick * 0.55, y + len * 0.5, w * 0.85, len * 0.45);
  g.fillStyle(p.sock, 1);
  g.fillRect(x - w / 2 + 0.3 + kick * 0.6, y + len - 3.5, w * 0.9, 2.2);
  g.fillStyle(p.hoof, 1);
  g.fillRect(x - w / 2 - 0.2 + kick * 0.65, y + len - 1.6, w + 0.6, 1.8);
}

function drawSeatedCloak(
  g: Phaser.GameObjects.Graphics,
  variant: string,
  facing: SpriteFacingRow,
  cx: number,
  ry: number,
  sway: number,
): void {
  const pal = CLOAK_PAL[variant] ?? CLOAK_PAL.traveler;
  if (facing === 'up') {
    g.fillStyle(pal.dark, 1);
    g.fillTriangle(cx - 10 - sway, ry + 6, cx + 10 + sway, ry + 6, cx, ry - 8);
    g.fillStyle(pal.main, 0.95);
    g.fillTriangle(cx - 8 - sway * 0.7, ry + 5, cx + 8 + sway * 0.7, ry + 5, cx, ry - 6);
  } else if (facing === 'side' || facing === 'up-side' || facing === 'down-side') {
    g.fillStyle(pal.dark, 1);
    g.fillTriangle(cx - 12 - sway, ry + 4, cx + 2, ry + 6, cx, ry - 8);
    g.fillStyle(pal.main, 0.95);
    g.fillTriangle(cx - 10 - sway * 0.7, ry + 3, cx + 1, ry + 5, cx, ry - 6);
    g.fillStyle(pal.trim, 0.7);
    g.fillEllipse(cx - 4, ry, 5, 8);
  } else {
    g.fillStyle(pal.dark, 0.85);
    g.fillEllipse(cx, ry + 2, 14, 6);
    g.fillStyle(pal.main, 0.9);
    g.fillEllipse(cx, ry + 1, 12, 5);
  }
}

function drawMountedWeapon(
  g: Phaser.GameObjects.Graphics,
  kind: MountedWeaponKind,
  facing: SpriteFacingRow,
  attack: boolean,
  cx: number,
  ry: number,
): void {
  const color = kind === 'staff' ? 0x88aacc : kind === 'bow' ? 0x8a6840 : 0xd0d0d0;
  if (kind === 'melee') {
    if (facing === 'side' || facing === 'up-side' || facing === 'down-side') {
      if (attack) {
        g.fillStyle(0x1a1410, 1);
        g.fillRect(cx + 8, ry - 10, 14, 3.5);
        g.fillStyle(color, 1);
        g.fillRect(cx + 9, ry - 9.5, 12, 2.5);
        g.lineStyle(2, 0xffcc66, 0.8);
        g.strokeCircle(cx + 16, ry - 8, 7);
      } else {
        g.fillStyle(0x1a1410, 1);
        g.fillRect(cx + 6, ry - 4, 10, 3);
        g.fillStyle(color, 1);
        g.fillRect(cx + 7, ry - 3.5, 8, 2);
      }
    } else if (facing === 'up') {
      g.fillStyle(color, 1);
      g.fillRect(cx + 6, ry - 6, 3, 10);
    } else {
      if (attack) {
        g.fillStyle(0x1a1410, 1);
        g.fillRect(cx + 8, ry - 12, 4, 16);
        g.fillStyle(color, 1);
        g.fillRect(cx + 8.5, ry - 11, 3, 14);
        g.lineStyle(2, 0xffcc66, 0.75);
        g.strokeCircle(cx + 10, ry - 4, 9);
      } else {
        g.fillStyle(color, 1);
        g.fillRect(cx + 7, ry - 6, 3, 11);
      }
    }
  } else if (kind === 'bow') {
    g.lineStyle(2.5, color, 1);
    if (facing === 'side' || facing === 'up-side' || facing === 'down-side') {
      g.strokeEllipse(cx + 8, ry - 2, 5, 14);
      g.lineStyle(1, 0xe8e0d0, 0.9);
      if (attack) {
        g.lineBetween(cx + 2, ry - 2, cx + 8, ry - 2);
        g.fillStyle(0xc8b898, 1);
        g.fillRect(cx + 8, ry - 2.5, 10, 1.5);
      } else {
        g.lineBetween(cx + 8, ry - 8, cx + 8, ry + 4);
      }
    } else {
      g.strokeEllipse(cx + 5, ry - 2, 5, 12);
      g.lineStyle(1, 0xe8e0d0, 0.85);
      g.lineBetween(cx + 5, ry - 7, cx + 5, ry + 3);
    }
  } else {
    // staff
    g.fillStyle(0x4a3020, 1);
    if (attack) {
      g.fillRect(cx + 7, ry - 14, 2.5, 18);
      g.fillStyle(0xcc88ff, 0.9);
      g.fillCircle(cx + 8.2, ry - 15, 3.5);
    } else {
      g.fillRect(cx + 6, ry - 10, 2.5, 14);
      g.fillStyle(0x88aacc, 0.85);
      g.fillCircle(cx + 7.2, ry - 11, 2.8);
    }
  }
}

function drawRider(
  g: Phaser.GameObjects.Graphics,
  look: MountedLook,
  facing: SpriteFacingRow,
  cx: number,
  y: number,
  attack: boolean,
  sway: number,
): void {
  const rp = riderPalette(look);
  const armor: ArmorLook = look.armorType;
  const ry = y - (facing === 'up' ? 6 : 8) + (attack ? -1 : 0);
  const rx = facing === 'side' || facing === 'up-side' || facing === 'down-side' ? cx - 1 : cx;

  if (look.cloakVariant && facing !== 'down') {
    drawSeatedCloak(g, look.cloakVariant, facing, rx, ry, sway);
  }

  // Bent knees hug the saddle; boots hang down into the stirrups.
  g.fillStyle(rp.pants, 1);
  if (facing === 'side' || facing === 'up-side' || facing === 'down-side') {
    g.fillEllipse(rx + 3, ry + 3, 7, 4);
    g.fillRoundedRect(rx + 3.5, ry + 3, 3, 7, 1);
    g.fillStyle(rp.boot, 1);
    g.fillRoundedRect(rx + 3.5, ry + 8, 5, 3, 1);
    g.lineStyle(1, 0xaaa49a, 0.9);
    g.strokeEllipse(rx + 6, ry + 10, 6, 3);
  } else {
    g.fillEllipse(rx - 5, ry + 3, 5.5, 3.2);
    g.fillEllipse(rx + 5, ry + 3, 5.5, 3.2);
    g.fillRoundedRect(rx - 7, ry + 3, 3, 6, 1);
    g.fillRoundedRect(rx + 4, ry + 3, 3, 6, 1);
    g.fillStyle(rp.boot, 1);
    g.fillRoundedRect(rx - 8, ry + 8, 5, 3, 1);
    g.fillRoundedRect(rx + 3, ry + 8, 5, 3, 1);
    g.lineStyle(1, 0xaaa49a, 0.9);
    g.strokeEllipse(rx - 5.5, ry + 10, 6, 3);
    g.strokeEllipse(rx + 5.5, ry + 10, 6, 3);
  }

  // torso by armor
  if (armor === 'heavy') {
    g.fillStyle(rp.metal, 1);
    g.fillRoundedRect(rx - 5, ry - 9, 10, 11, 1.5);
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(rx - 4, ry - 8, 3, 8);
    g.fillStyle(rp.trim, 1);
    g.fillRect(rx - 5, ry - 1, 10, 1.5);
    // helm hint
    g.fillStyle(rp.metal, 1);
    const sideish = facing === 'side' || facing === 'up-side' || facing === 'down-side';
    g.fillEllipse(rx + (sideish ? 0.5 : 0), ry - 12.5, 8, 5);
  } else if (armor === 'robe') {
    g.fillStyle(rp.body, 1);
    g.fillRoundedRect(rx - 5.5, ry - 9, 11, 13, 2.5);
    g.fillStyle(rp.trim, 0.85);
    g.fillRect(rx - 5.5, ry - 2, 11, 1.5);
    // sleeve drape
    g.fillStyle(rp.body, 0.9);
    g.fillEllipse(rx - 6, ry - 3, 4, 7);
    g.fillEllipse(rx + 6, ry - 3, 4, 7);
  } else {
    g.fillStyle(rp.body, 1);
    g.fillRoundedRect(rx - 4, ry - 8, 8, 10, 2);
    g.fillStyle(rp.trim, 0.9);
    g.fillRect(rx - 4, ry - 0.5, 8, 1.3);
  }

  // arms
  g.fillStyle(rp.skin, 1);
  if (facing === 'side' || facing === 'up-side' || facing === 'down-side') {
    g.fillEllipse(rx + 5, ry - 5 + (attack ? -2 : 0), 5, 2.4);
    g.fillCircle(rx + 8, ry - 4.5 + (attack ? -2 : 0), 1.4);
  } else {
    g.fillEllipse(rx - 6.5, ry - 4, 3.5, 2.2);
    g.fillEllipse(rx + 6.5, ry - 4 + (attack ? -2 : 0), 3.5, 2.2);
  }

  // head (unless heavy helm already covers)
  if (armor !== 'heavy') {
    g.fillStyle(rp.skin, 1);
    const hx = facing === 'side' || facing === 'up-side' || facing === 'down-side' ? rx + 0.5 : rx;
    g.fillCircle(hx, ry - 11.5, 3.7);
    if (look.race === 'elf') {
      g.fillTriangle(hx - 3, ry - 12, hx - 6, ry - 13.5, hx - 3, ry - 10);
      g.fillTriangle(hx + 3, ry - 12, hx + 6, ry - 13.5, hx + 3, ry - 10);
    } else if (look.race === 'orc' && facing !== 'up') {
      g.fillStyle(0xe8dfbd, 1);
      g.fillTriangle(hx + 1, ry - 9, hx + 2, ry - 11, hx + 3, ry - 9);
    }
    g.fillStyle(rp.hair, 1);
    const longHair = look.gender === 'female';
    g.fillEllipse(hx, ry - 13, longHair ? 7.5 : 6.5, longHair ? 5 : 4);
    if (facing !== 'up') {
      g.fillStyle(rp.eye, 1);
      if (facing === 'side' || facing === 'up-side' || facing === 'down-side') {
        g.fillCircle(hx + 1.5, ry - 11.5, 0.65);
      } else {
        g.fillCircle(hx - 1.3, ry - 11.3, 0.6);
        g.fillCircle(hx + 1.3, ry - 11.3, 0.6);
      }
    }
  } else {
    // visor slit
    g.fillStyle(0x1a1a20, 1);
    const hx = facing === 'side' || facing === 'up-side' || facing === 'down-side' ? rx + 1 : rx;
    g.fillRect(hx - 2, ry - 12.5, 4, 1.2);
  }

  if (look.cloakVariant && facing === 'down') {
    drawSeatedCloak(g, look.cloakVariant, facing, rx, ry, sway);
  }

  if (look.weaponKind) {
    drawMountedWeapon(g, look.weaponKind, facing, attack, rx, ry);
  }
}

function drawHorseSide(
  g: Phaser.GameObjects.Graphics,
  p: MountPalette,
  look: MountedLook,
  cx: number,
  cy: number,
  bob: number,
  gait: number,
  diag: 'flat' | 'up' | 'down',
  attack: boolean,
  sway: number,
): void {
  const y = cy + bob;
  const neckLift = diag === 'up' ? -3 : diag === 'down' ? 2 : 0;
  const headDrop = diag === 'up' ? -2 : diag === 'down' ? 3 : 0;
  const fl = Math.sin(gait) * 4;
  const bl = Math.sin(gait + Math.PI) * 4;
  const fr = Math.sin(gait + Math.PI * 0.5) * 3.5;
  const br = Math.sin(gait + Math.PI * 1.5) * 3.5;
  const tail = Math.sin(gait) * 1.5;

  mountLeg(g, p, cx - 8, y + 4, 11 + Math.max(0, bl * 0.15), bl, true);
  mountLeg(g, p, cx + 7, y + 4, 11 + Math.max(0, fr * 0.15), fr, true);

  g.fillStyle(p.mane, 1);
  g.fillTriangle(cx - 15, y - 2, cx - 21 - tail, y + 2, cx - 16, y + 5);
  g.fillStyle(p.maneHi, 0.85);
  g.fillTriangle(cx - 14, y - 1, cx - 19 - tail * 0.8, y + 1, cx - 15, y + 3);

  g.fillStyle(p.shade, 1);
  g.fillEllipse(cx - 1, y + 3, 26, 12);
  g.fillStyle(p.mid, 1);
  g.fillEllipse(cx, y + 1, 24, 11);
  g.fillStyle(p.body, 1);
  g.fillEllipse(cx + 1, y - 1, 22, 10);
  g.fillStyle(p.white, 0.55);
  g.fillEllipse(cx + 4, y - 3, 8, 4);

  if (look.visual === 'prism') {
    g.fillStyle(0x66ffe8, 0.35);
    g.fillEllipse(cx + 2, y - 2, 10, 5);
    g.fillStyle(0xff88cc, 0.3);
    g.fillEllipse(cx - 4, y, 8, 4);
  }

  g.fillStyle(p.mid, 1);
  g.fillEllipse(cx - 10, y - 1, 12, 11);
  g.fillStyle(p.body, 0.9);
  g.fillEllipse(cx - 9, y - 2, 9, 8);
  g.fillStyle(p.body, 1);
  g.fillEllipse(cx + 9, y + 1, 11, 10);

  g.fillStyle(p.saddlePad, 1);
  g.fillRoundedRect(cx - 6, y - 7, 12, 5, 2);
  g.fillStyle(p.saddle, 1);
  g.fillRoundedRect(cx - 4.5, y - 8, 9, 4, 1.5);

  drawRider(g, look, diag === 'up' ? 'up-side' : diag === 'down' ? 'down-side' : 'side', cx, y, attack, sway);

  g.fillStyle(p.mid, 1);
  g.fillTriangle(cx + 8, y - 2, cx + 14, y - 10 + neckLift, cx + 6, y - 6 + neckLift);
  g.fillStyle(p.body, 1);
  g.fillTriangle(cx + 9, y - 3, cx + 13.5, y - 9 + neckLift, cx + 7.5, y - 5.5 + neckLift);
  g.fillStyle(p.mane, 1);
  g.fillTriangle(cx + 7, y - 5, cx + 11, y - 12 + neckLift, cx + 9, y - 4);
  g.fillTriangle(cx + 8, y - 7, cx + 12, y - 14 + neckLift, cx + 10, y - 6);

  const hx = cx + 14;
  const hy = y - 8 + headDrop + neckLift;
  g.fillStyle(p.mid, 1);
  g.fillEllipse(hx, hy, 11, 7.5);
  g.fillStyle(p.body, 1);
  g.fillEllipse(hx + 0.5, hy - 0.5, 9.5, 6.5);
  g.fillStyle(p.muzzle, 1);
  g.fillEllipse(hx + 5, hy + 1.5, 6, 4);
  g.fillStyle(p.nostril, 1);
  g.fillCircle(hx + 7, hy + 1.2, 0.9);
  g.fillStyle(p.eye, 1);
  g.fillCircle(hx + 1, hy - 1.5, 1.3);
  g.fillStyle(p.eyeHi, 0.9);
  g.fillCircle(hx + 1.4, hy - 1.8, 0.45);
  g.fillStyle(p.mane, 1);
  g.fillTriangle(hx - 1, hy - 4, hx + 1, hy - 8, hx + 2.5, hy - 3.5);
  g.fillStyle(p.rein, 0.85);
  g.lineStyle(1, p.rein, 0.9);
  g.lineBetween(hx - 2, hy + 1, cx + 7, y - 12.5 - (attack ? 2 : 0));

  mountLeg(g, p, cx - 6, y + 5, 12 + Math.max(0, br * 0.2), br);
  mountLeg(g, p, cx + 9, y + 5, 12 + Math.max(0, fl * 0.2), fl);
}

function drawHorseFront(
  g: Phaser.GameObjects.Graphics,
  p: MountPalette,
  look: MountedLook,
  cx: number,
  cy: number,
  bob: number,
  gait: number,
  attack: boolean,
  sway: number,
): void {
  const y = cy + bob;
  const lKick = Math.sin(gait) * 2.5;
  const rKick = Math.sin(gait + Math.PI) * 2.5;

  mountLeg(g, p, cx - 7, y + 5, 10, -1, true);
  mountLeg(g, p, cx + 7, y + 5, 10, 1, true);

  g.fillStyle(p.shade, 1);
  g.fillEllipse(cx, y + 4, 22, 13);
  g.fillStyle(p.mid, 1);
  g.fillEllipse(cx, y + 2, 20, 12);
  g.fillStyle(p.body, 1);
  g.fillEllipse(cx, y, 18, 11);
  g.fillStyle(p.white, 0.45);
  g.fillEllipse(cx, y - 2, 6, 4);

  if (look.visual === 'prism') {
    g.fillStyle(0x88ffdd, 0.35);
    g.fillEllipse(cx - 3, y - 1, 7, 4);
    g.fillStyle(0xff99cc, 0.3);
    g.fillEllipse(cx + 3, y, 7, 4);
  }

  g.fillStyle(p.saddlePad, 1);
  g.fillEllipse(cx, y - 5, 14, 5);
  g.fillStyle(p.saddle, 1);
  g.fillEllipse(cx, y - 6, 10, 3.5);

  drawRider(g, look, 'down', cx, y, attack, sway);

  g.fillStyle(p.mid, 1);
  g.fillEllipse(cx, y - 8, 10, 7);
  g.fillStyle(p.body, 1);
  g.fillEllipse(cx, y - 10, 9, 6.5);
  g.fillStyle(p.mane, 1);
  g.fillTriangle(cx - 3, y - 13, cx, y - 17.5, cx + 3, y - 13);
  g.fillStyle(p.maneHi, 0.85);
  g.fillTriangle(cx - 1.5, y - 13, cx, y - 16, cx + 1.5, y - 13);
  g.fillStyle(p.mane, 1);
  g.fillTriangle(cx - 5, y - 12, cx - 7, y - 16.5, cx - 2, y - 13);
  g.fillTriangle(cx + 5, y - 12, cx + 7, y - 16.5, cx + 2, y - 13);
  g.fillStyle(p.muzzle, 1);
  g.fillEllipse(cx, y - 7, 7, 5);
  g.fillStyle(p.nostril, 1);
  g.fillCircle(cx - 1.8, y - 6.2, 0.85);
  g.fillCircle(cx + 1.8, y - 6.2, 0.85);
  g.fillStyle(p.eye, 1);
  g.fillCircle(cx - 3.2, y - 10, 1.15);
  g.fillCircle(cx + 3.2, y - 10, 1.15);
  g.fillStyle(p.eyeHi, 0.9);
  g.fillCircle(cx - 2.9, y - 10.3, 0.4);
  g.fillCircle(cx + 3.5, y - 10.3, 0.4);


  g.lineStyle(1, p.rein, 0.9);
  g.lineBetween(cx - 3, y - 7, cx - 6.5, y - 12);
  g.lineBetween(cx + 3, y - 7, cx + 6.5, y - 12 - (attack ? 2 : 0));

  mountLeg(g, p, cx - 5 + lKick * 0.2, y + 6, 11, lKick);
  mountLeg(g, p, cx + 5 + rKick * 0.2, y + 6, 11, rKick);
}

function drawHorseBack(
  g: Phaser.GameObjects.Graphics,
  p: MountPalette,
  look: MountedLook,
  cx: number,
  cy: number,
  bob: number,
  gait: number,
  attack: boolean,
  sway: number,
): void {
  const y = cy + bob;
  const lKick = Math.sin(gait) * 2;
  const rKick = Math.sin(gait + Math.PI) * 2;

  mountLeg(g, p, cx - 7, y + 5, 11, lKick);
  mountLeg(g, p, cx + 7, y + 5, 11, rKick);
  mountLeg(g, p, cx - 3, y + 5, 10, -lKick * 0.6, true);
  mountLeg(g, p, cx + 3, y + 5, 10, -rKick * 0.6, true);

  g.fillStyle(p.shade, 1);
  g.fillEllipse(cx, y + 2, 22, 14);
  g.fillStyle(p.mid, 1);
  g.fillEllipse(cx, y, 20, 13);
  g.fillStyle(p.body, 1);
  g.fillEllipse(cx, y - 2, 18, 11);

  if (look.visual === 'prism') {
    g.fillStyle(0xaaffcc, 0.3);
    g.fillEllipse(cx, y - 1, 12, 6);
  }

  g.fillStyle(p.saddlePad, 1);
  g.fillEllipse(cx, y - 6, 14, 5);
  g.fillStyle(p.saddle, 1);
  g.fillEllipse(cx, y - 7, 10, 3.2);

  g.fillStyle(p.mane, 1);
  g.fillEllipse(cx, y - 10, 8, 6);
  g.fillStyle(p.maneHi, 0.75);
  g.fillEllipse(cx, y - 11, 5, 4);
  g.fillStyle(p.mane, 1);
  g.fillTriangle(cx - 4, y - 12, cx - 6, y - 17, cx - 1, y - 13);
  g.fillTriangle(cx + 4, y - 12, cx + 6, y - 17, cx + 1, y - 13);

  drawRider(g, look, 'up', cx, y, attack, sway);

  g.fillStyle(p.mane, 1);
  g.fillTriangle(cx - 3, y + 2, cx + 3, y + 2, cx + Math.sin(gait) * 2, y + 12);
  g.fillStyle(p.maneHi, 0.8);
  g.fillTriangle(cx - 1.5, y + 3, cx + 1.5, y + 3, cx + Math.sin(gait) * 1.5, y + 9);
}

function drawMountedFrame(
  g: Phaser.GameObjects.Graphics,
  look: MountedLook,
  facing: SpriteFacingRow,
  frame: number,
  ox: number,
): void {
  const cx = ox + FW / 2;
  const cy = FH / 2 + 4;
  const { gait, bob, attack, sway } = mountedFramePose(frame);
  const basePal = MOUNT_PALETTES[look.visual] ?? MOUNT_PALETTES.bay;
  const p: MountPalette = basePal;

  if (facing === 'up') {
    drawHorseBack(g, p, look, cx, cy, bob, gait, attack, sway);
  } else if (facing === 'side') {
    drawHorseSide(g, p, look, cx, cy, bob, gait, 'flat', attack, sway);
  } else if (facing === 'up-side') {
    drawHorseSide(g, p, look, cx, cy, bob, gait, 'up', attack, sway);
  } else if (facing === 'down-side') {
    drawHorseSide(g, p, look, cx, cy, bob, gait, 'down', attack, sway);
  } else {
    drawHorseFront(g, p, look, cx, cy, bob, gait, attack, sway);
  }
}

function buildMountedFacingSheet(scene: Phaser.Scene, look: MountedLook, facing: SpriteFacingRow): void {
  const prefix = mountedFramePrefix(look, facing);
  if (hasMountStrip(scene, prefix)) return;

  if (!getCachedMountStrip(prefix)) {
    const tempKey = `__mnt_tmp_${prefix}`;
    if (scene.textures.exists(tempKey)) scene.textures.remove(tempKey);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let f = 0; f < FRAMES; f++) drawMountedFrame(g, look, facing, f, f * FW);
    g.generateTexture(tempKey, FW * FRAMES, FH);
    g.destroy();
    const src = scene.textures.get(tempKey).getSourceImage() as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = FW * FRAMES;
    canvas.height = FH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    scene.textures.remove(tempKey);
    cacheMountStrip(prefix, canvas);
  }

  ensureMountAtlas(scene);
}

/** Build idle/walk/attack anims for one mounted look (all facings). */
export function registerMountedLook(scene: Phaser.Scene, look: MountedLook): void {
  const rows: SpriteFacingRow[] = ['down', 'side', 'up', 'down-side', 'up-side'];
  for (const row of rows) {
    buildMountedFacingSheet(scene, look, row);
  }
  ensureMountAtlas(scene);

  const atlas = MOUNT_ATLAS_KEY;
  for (const row of rows) {
    const prefix = mountedFramePrefix(look, row);
    const idleKey = mountedAnimKey(look, 'idle', row);
    const walkKey = mountedAnimKey(look, 'walk', row);
    const atkKey = mountedAnimKey(look, 'attack', row);
    const stale =
      animNeedsAtlasRefresh(scene, idleKey, atlas) ||
      animNeedsAtlasRefresh(scene, walkKey, atlas) ||
      animNeedsAtlasRefresh(scene, atkKey, atlas);
    if (!stale) continue;
    if (scene.anims.exists(idleKey)) scene.anims.remove(idleKey);
    if (scene.anims.exists(walkKey)) scene.anims.remove(walkKey);
    if (scene.anims.exists(atkKey)) scene.anims.remove(atkKey);
    const idleFrames = MOUNT_IDLE_FRAMES.map(frame => ({ key: atlas, frame: `${prefix}-${frame}` }));
    const walkFrames = MOUNT_WALK_FRAMES.map(frame => ({ key: atlas, frame: `${prefix}-${frame}` }));
    const atkFrames = scene.anims.generateFrameNames(atlas, {
      prefix: `${prefix}-`,
      start: 4,
      end: 4,
    });
    if (idleFrames.length === 0 || walkFrames.length === 0 || atkFrames.length === 0) continue;
    scene.anims.create({
      key: idleKey,
      frames: idleFrames,
      frameRate: 2,
      repeat: -1,
    });
    scene.anims.create({
      key: walkKey,
      frames: walkFrames,
      frameRate: 12,
      repeat: -1,
    });
    scene.anims.create({
      key: atkKey,
      frames: atkFrames,
      frameRate: 8,
      repeat: 0,
    });
  }
}

export { MOUNT_ATLAS_KEY, mountedFrameName, mountedFramePrefix, mountAtlasTextureKey };

/** @deprecated legacy single horse — prefer registerMountedLook */
export function registerMountOverlay(scene: Phaser.Scene): void {
  registerMountedLook(scene, {
    mountId: 'field_horse',
    visual: 'bay',
    race: 'human',
    gender: 'male',
    profession: 'warrior',
    armorType: 'light',
    cloakVariant: null,
    weaponKind: null,
  });
}

export function mountTextureKey(facing: SpriteFacingRow = 'down'): string {
  return mountedTextureKey(
    {
      mountId: 'field_horse',
      visual: 'bay',
      race: 'human',
      gender: 'male',
      profession: 'warrior',
      armorType: 'light',
      cloakVariant: null,
      weaponKind: null,
    },
    facing,
  );
}

export function isPrismMount(visual: MountVisual): boolean {
  return visual === 'prism';
}
