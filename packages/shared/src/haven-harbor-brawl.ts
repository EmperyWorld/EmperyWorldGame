/**
 * Harbor sailor brawl — boxing-round cadence, Phaser-free.
 * One exchange is wind-up → lunge → hold contact → recoil → pause.
 * The other fighter answers on the next exchange. Not a sine smear.
 */

export const HAVEN_HARBOR_BRAWL_BARK = 'Получай!';

/** Procedural punch key — client Web Audio, same family as stage applause. */
export const HAVEN_HARBOR_BRAWL_HIT_SFX = 'harbor_brawl_hit';

/** Tavern-scuffle lines. Swap on a hit, never every frame. */
export const HAVEN_HARBOR_BRAWL_BARKS = [
  'Получай!',
  'На, держи!',
  'Ах ты крыса!',
  'Ух!',
  'По морде!',
  'Не рыпайся!',
  'Вот тебе!',
  'Грр!',
  'За борт его!',
  'Пьянь портовая!',
  'Ещё раз?',
  'Ха!',
  'По зубам!',
  'Не лезь!',
  'Держи карман!',
  'Сейчас получишь!',
  'Эй, матрос!',
  'За кружку!',
  'Бей!',
  'Ого-го!',
] as const;

/** One directed punch (attacker → defender), milliseconds. */
export const HAVEN_HARBOR_BRAWL_EXCHANGE_MS = 3000;

export const HAVEN_HARBOR_BRAWL_PHASE_MS = {
  windup: 700,
  lunge: 300,
  contact: 360,
  recoil: 540,
  pause: 1100,
} as const;

/** Left then right. Bind this as the loop length. */
export const HAVEN_HARBOR_BRAWL_ROUND_MS = HAVEN_HARBOR_BRAWL_EXCHANGE_MS * 2;

export type HavenHarborBrawlPhase = 'windup' | 'lunge' | 'contact' | 'recoil' | 'pause';

export type HavenHarborBrawlPose = {
  readonly attacker: 0 | 1;
  readonly phase: HavenHarborBrawlPhase;
  readonly phaseT: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly leftAngle: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly rightAngle: number;
  /** 0–1 impact flash; peaks only on contact. */
  readonly impact: number;
  readonly bark: boolean;
  readonly exchangeIndex: number;
};

type Body = { x: number; y: number; angle: number };

const REST_SEP = 32;

const PHASE_ORDER: readonly HavenHarborBrawlPhase[] = [
  'windup',
  'lunge',
  'contact',
  'recoil',
  'pause',
];

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function easeInOutQuad(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function mix(a: Body, b: Body, t: number): Body {
  const u = clamp01(t);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    angle: a.angle + (b.angle - a.angle) * u,
  };
}

function rest(sign: 1 | -1): Body {
  return { x: sign * REST_SEP, y: 0, angle: sign * 8 };
}

export function havenHarborBrawlWrapMs(ms: number): number {
  const period = HAVEN_HARBOR_BRAWL_ROUND_MS;
  return ((ms % period) + period) % period;
}

export function pickHavenHarborBrawlBark(seed: number): string {
  const n = HAVEN_HARBOR_BRAWL_BARKS.length;
  const i = ((Math.floor(Math.abs(seed)) % n) + n) % n;
  return HAVEN_HARBOR_BRAWL_BARKS[i]!;
}

export function havenHarborBrawlNextBark(prev: string, rand: () => number): string {
  const n = HAVEN_HARBOR_BRAWL_BARKS.length;
  const prevIdx = HAVEN_HARBOR_BRAWL_BARKS.indexOf(prev as (typeof HAVEN_HARBOR_BRAWL_BARKS)[number]);
  const offset = 1 + Math.floor(rand() * (n - 1));
  const i = ((prevIdx < 0 ? 0 : prevIdx) + offset) % n;
  return HAVEN_HARBOR_BRAWL_BARKS[i]!;
}

/** Rising edge of a readable punch — one trigger per exchange. */
export function havenHarborBrawlHitEdge(prevImpact: number, impact: number): boolean {
  return prevImpact < 0.45 && impact >= 0.45;
}

function phaseAt(exchangeMs: number): { phase: HavenHarborBrawlPhase; phaseT: number } {
  let cursor = 0;
  for (const phase of PHASE_ORDER) {
    const dur = HAVEN_HARBOR_BRAWL_PHASE_MS[phase];
    if (exchangeMs < cursor + dur) {
      return { phase, phaseT: (exchangeMs - cursor) / dur };
    }
    cursor += dur;
  }
  return { phase: 'pause', phaseT: 1 };
}

function directedBodies(
  atkSign: 1 | -1,
  phase: HavenHarborBrawlPhase,
  phaseT: number,
): { atk: Body; def: Body; impact: number } {
  const defSign = (atkSign === 1 ? -1 : 1) as 1 | -1;
  const punch = -atkSign;
  const atkRest = rest(atkSign);
  const defRest = rest(defSign);
  const atkWind: Body = {
    x: atkSign * REST_SEP - punch * 24,
    y: -8,
    angle: atkSign * 10 - punch * 26,
  };
  const defWind: Body = { x: defSign * REST_SEP + punch * 2, y: 0, angle: defSign * 6 };
  const atkLunge: Body = {
    x: atkSign * REST_SEP + punch * 46,
    y: -20,
    angle: atkSign * 4 + punch * 28,
  };
  const defBrace: Body = {
    x: defSign * REST_SEP - punch * 6,
    y: -4,
    angle: defSign * 12,
  };
  const atkHit: Body = {
    x: atkSign * REST_SEP + punch * 50,
    y: -10,
    angle: atkSign * 2 + punch * 30,
  };
  const defHit: Body = {
    x: defSign * REST_SEP + punch * 30,
    y: -16,
    angle: defSign * 8 + punch * 26,
  };
  const atkRecoil: Body = {
    x: atkSign * REST_SEP + punch * 8,
    y: -3,
    angle: atkSign * 8,
  };
  const defRecoil: Body = {
    x: defSign * REST_SEP + punch * 20,
    y: -6,
    angle: defSign * 12 + punch * 14,
  };

  switch (phase) {
    case 'windup': {
      const u = easeInOutQuad(phaseT);
      return { atk: mix(atkRest, atkWind, u), def: mix(defRest, defWind, u), impact: 0 };
    }
    case 'lunge': {
      const u = easeOutCubic(phaseT);
      return {
        atk: mix(atkWind, atkLunge, u),
        def: mix(defWind, defBrace, u),
        impact: u > 0.86 ? (u - 0.86) / 0.14 : 0,
      };
    }
    case 'contact': {
      const u = phaseT < 0.16 ? easeOutCubic(phaseT / 0.16) : 1;
      const impact = phaseT < 0.38 ? 1 : 0.32 + 0.28 * (1 - phaseT);
      return { atk: mix(atkLunge, atkHit, u), def: mix(defBrace, defHit, u), impact };
    }
    case 'recoil': {
      const u = easeOutCubic(phaseT);
      return {
        atk: mix(atkHit, atkRecoil, u),
        def: mix(defHit, defRecoil, u),
        impact: Math.max(0, 0.2 * (1 - phaseT * 2.4)),
      };
    }
    case 'pause': {
      const u = easeInOutQuad(Math.min(1, phaseT / 0.35));
      return { atk: mix(atkRecoil, atkRest, u), def: mix(defRecoil, defRest, u), impact: 0 };
    }
  }
}

export function havenHarborBrawlPose(ms: number): HavenHarborBrawlPose {
  const wrapped = havenHarborBrawlWrapMs(ms);
  const attacker: 0 | 1 = wrapped < HAVEN_HARBOR_BRAWL_EXCHANGE_MS ? 0 : 1;
  const local = wrapped % HAVEN_HARBOR_BRAWL_EXCHANGE_MS;
  const { phase, phaseT } = phaseAt(local);
  const atkSign = (attacker === 0 ? -1 : 1) as 1 | -1;
  const { atk, def, impact } = directedBodies(atkSign, phase, phaseT);
  const left = attacker === 0 ? atk : def;
  const right = attacker === 0 ? def : atk;
  return {
    attacker,
    phase,
    phaseT,
    leftX: left.x,
    leftY: left.y,
    leftAngle: left.angle,
    rightX: right.x,
    rightY: right.y,
    rightAngle: right.angle,
    impact,
    bark: phase === 'contact' || (phase === 'recoil' && phaseT < 0.28),
    exchangeIndex: Math.floor(ms / HAVEN_HARBOR_BRAWL_EXCHANGE_MS),
  };
}
