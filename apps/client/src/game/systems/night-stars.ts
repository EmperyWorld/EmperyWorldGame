/** Same LCG as the old Graphics.fillCircle stars — Phaser-free. */

export interface NightStar {
  x: number;
  y: number;
  r: number;
}

export function layoutNightStars(
  width: number,
  height: number,
  darkness: number,
  dayProgress: number,
): NightStar[] {
  let seed = Math.floor(dayProgress * 10_000);
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const count = Math.floor(28 + Math.max(0, darkness) * 40);
  const out: NightStar[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rnd() * width,
      y: rnd() * height * 0.72,
      r: rnd() > 0.92 ? 1.4 : 0.9,
    });
  }
  return out;
}
