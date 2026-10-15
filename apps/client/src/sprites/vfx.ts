import Phaser from 'phaser';

export interface LocationAtmosphere {
  cameraTint: number;
  particleColor: number;
  particleAlpha: number;
  particleCount: number;
  fogColor: number;
  fogAlpha: number;
  markerColor: string;
}

const ATMOS: Record<string, LocationAtmosphere> = {
  starter_grove: {
    cameraTint: 0xffffff,
    particleColor: 0xc8e6a0,
    particleAlpha: 0.38,
    particleCount: 22,
    fogColor: 0x1a2a18,
    fogAlpha: 0.1,
    markerColor: '#c9e6a0',
  },
  empery_haven: {
    cameraTint: 0xfff6e4,
    particleColor: 0xffd090,
    particleAlpha: 0.36,
    particleCount: 28,
    fogColor: 0x18160f,
    fogAlpha: 0.07,
    markerColor: '#ffcc88',
  },
  empery_hq: {
    cameraTint: 0xd8f0ff,
    particleColor: 0x4ec5e8,
    particleAlpha: 0.42,
    particleCount: 36,
    fogColor: 0x061018,
    fogAlpha: 0.18,
    markerColor: '#4ec5e8',
  },
  haven_apartment: {
    cameraTint: 0xfff0d8,
    particleColor: 0xffc070,
    particleAlpha: 0.22,
    particleCount: 12,
    fogColor: 0x1a140e,
    fogAlpha: 0.06,
    markerColor: '#e8c898',
  },
  silverwood: {
    cameraTint: 0xdde8ff,
    particleColor: 0xaaccff,
    particleAlpha: 0.45,
    particleCount: 26,
    fogColor: 0x101828,
    fogAlpha: 0.2,
    markerColor: '#aaccff',
  },
  ash_highlands: {
    cameraTint: 0xffe0c8,
    particleColor: 0xff8844,
    particleAlpha: 0.5,
    particleCount: 32,
    fogColor: 0x281808,
    fogAlpha: 0.24,
    markerColor: '#ffaa66',
  },
  adena_fields: {
    cameraTint: 0xfffae8,
    particleColor: 0xffdd88,
    particleAlpha: 0.28,
    particleCount: 18,
    fogColor: 0x2a2818,
    fogAlpha: 0.06,
    markerColor: '#e8c878',
  },
  shadow_depths: {
    cameraTint: 0xd8c8f0,
    particleColor: 0x8866cc,
    particleAlpha: 0.35,
    particleCount: 28,
    fogColor: 0x100818,
    fogAlpha: 0.32,
    markerColor: '#bb88ff',
  },
  suburban_park: {
    cameraTint: 0xf0f8e8,
    particleColor: 0xb8d898,
    particleAlpha: 0.3,
    particleCount: 20,
    fogColor: 0x1a2818,
    fogAlpha: 0.08,
    markerColor: '#88bb88',
  },
  abandoned_yard: {
    cameraTint: 0xf0e8d8,
    particleColor: 0xc9a070,
    particleAlpha: 0.34,
    particleCount: 22,
    fogColor: 0x28180c,
    fogAlpha: 0.12,
    markerColor: '#c9a66b',
  },
  intersection_district: {
    cameraTint: 0xe8e0ff,
    particleColor: 0x88aaff,
    particleAlpha: 0.42,
    particleCount: 30,
    fogColor: 0x140828,
    fogAlpha: 0.18,
    markerColor: '#8866cc',
  },
  signal_block: {
    cameraTint: 0xe0fff4,
    particleColor: 0x66e0bb,
    particleAlpha: 0.4,
    particleCount: 28,
    fogColor: 0x081820,
    fogAlpha: 0.16,
    markerColor: '#66ccaa',
  },
  relay_spire: {
    cameraTint: 0xe0f0ff,
    particleColor: 0x88ccee,
    particleAlpha: 0.44,
    particleCount: 32,
    fogColor: 0x081420,
    fogAlpha: 0.2,
    markerColor: '#88ccee',
  },
  static_core: {
    cameraTint: 0xd8fff4,
    particleColor: 0x66e0cc,
    particleAlpha: 0.48,
    particleCount: 36,
    fogColor: 0x061818,
    fogAlpha: 0.22,
    markerColor: '#66e0cc',
  },
  chaos_sector: {
    cameraTint: 0xffe0e8,
    particleColor: 0xcc5577,
    particleAlpha: 0.45,
    particleCount: 34,
    fogColor: 0x180810,
    fogAlpha: 0.24,
    markerColor: '#cc4466',
  },
  fracture_ridge: {
    cameraTint: 0xffd8e0,
    particleColor: 0xaa4466,
    particleAlpha: 0.46,
    particleCount: 36,
    fogColor: 0x14080c,
    fogAlpha: 0.26,
    markerColor: '#aa4466',
  },
  void_scar: {
    cameraTint: 0xffd0dc,
    particleColor: 0xcc3355,
    particleAlpha: 0.5,
    particleCount: 38,
    fogColor: 0x12060a,
    fogAlpha: 0.28,
    markerColor: '#cc6688',
  },
  collapse_fringe: {
    cameraTint: 0xf0d8e0,
    particleColor: 0xaa5577,
    particleAlpha: 0.48,
    particleCount: 40,
    fogColor: 0x10060c,
    fogAlpha: 0.3,
    markerColor: '#884466',
  },
  citadel_approach: {
    cameraTint: 0xf8dce8,
    particleColor: 0xbb4477,
    particleAlpha: 0.46,
    particleCount: 36,
    fogColor: 0x0e050a,
    fogAlpha: 0.28,
    markerColor: '#aa3366',
  },
  singularity_citadel: {
    cameraTint: 0xffd8ec,
    particleColor: 0xee66aa,
    particleAlpha: 0.52,
    particleCount: 42,
    fogColor: 0x0c0408,
    fogAlpha: 0.32,
    markerColor: '#dd6699',
  },
  gods_rift: {
    cameraTint: 0xffe8c8,
    particleColor: 0xe8c060,
    particleAlpha: 0.5,
    particleCount: 40,
    fogColor: 0x100a04,
    fogAlpha: 0.28,
    markerColor: '#e8c060',
  },
  pantheon_ascent: {
    cameraTint: 0xfff0d0,
    particleColor: 0xf0d060,
    particleAlpha: 0.48,
    particleCount: 38,
    fogColor: 0x120c06,
    fogAlpha: 0.26,
    markerColor: '#f0d060',
  },
  godfall_throne: {
    cameraTint: 0xfff4c8,
    particleColor: 0xffe080,
    particleAlpha: 0.54,
    particleCount: 44,
    fogColor: 0x100804,
    fogAlpha: 0.3,
    markerColor: '#ffe080',
  },
};

export function atmosphereFor(locationId: string): LocationAtmosphere {
  return ATMOS[locationId] ?? ATMOS.starter_grove!;
}

/** @deprecated Fog/vignette сняты — карта должна читаться без фильтров. */
export function addAtmosphereOverlay(_scene: Phaser.Scene, _locationId: string): void {
  /* no-op */
}

export function styleDirectionSign(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  const bg = scene.add
    .rectangle(x, y + 8, text.length * 8 + 20, 22, 0x000000, 0.45)
    .setDepth(10);
  scene.add
    .text(x, y, text, { color, fontSize: '15px', fontStyle: 'bold' })
    .setOrigin(0.5, 0)
    .setDepth(11);
  void bg;
}

/** Декорации города: фонтан, лавки, фонари */
export function addCityDecorations(scene: Phaser.Scene): void {
  const fountain = scene.add.graphics().setDepth(5);
  fountain.fillStyle(0x8899aa, 0.85);
  fountain.fillCircle(640, 360, 28);
  fountain.fillStyle(0xaaccff, 0.55);
  fountain.fillCircle(640, 356, 16);
  fountain.fillStyle(0x666655, 0.9);
  fountain.fillRect(632, 384, 16, 10);

  const stallL = scene.add.graphics().setDepth(6);
  stallL.fillStyle(0x8b6914, 1);
  stallL.fillRect(420, 280, 56, 36);
  stallL.fillStyle(0xc9a050, 0.9);
  stallL.fillTriangle(420, 280, 476, 280, 448, 258);

  const stallR = scene.add.graphics().setDepth(6);
  stallR.fillStyle(0x6a4030, 1);
  stallR.fillRect(804, 280, 56, 36);
  stallR.fillStyle(0xa06040, 0.9);
  stallR.fillTriangle(804, 280, 860, 280, 832, 256);

  for (const lx of [320, 520, 760, 960]) {
    const lamp = scene.add.graphics().setDepth(6);
    lamp.fillStyle(0x444444, 1);
    lamp.fillRect(lx, 240, 4, 28);
    lamp.fillStyle(0xffdd88, 0.75);
    lamp.fillCircle(lx + 2, 234, 7);
  }

  scene.add
    .text(640, 128, '⚔ Имперская гавань ⚔', {
      color: '#ffcc88',
      fontSize: '16px',
      fontStyle: 'bold',
      backgroundColor: '#00000088',
      padding: { x: 10, y: 4 },
    })
    .setOrigin(0.5)
    .setDepth(12);
}
