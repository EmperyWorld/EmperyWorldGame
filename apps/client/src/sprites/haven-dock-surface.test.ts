import { describe, expect, it } from 'vitest';
import {
  chooseHavenDockSett,
  dockFillLuminance,
  HAVEN_DOCK_MORTAR,
  HAVEN_DOCK_STONE,
} from './haven-dock-sett.js';

describe('chooseHavenDockSett', () => {
  it('avoids matching left/up neighbor on both variant and rotation', () => {
    const n = 4;
    let sameBoth = 0;
    let cells = 0;
    for (let ty = 51; ty < 71; ty++) {
      for (let tx = 50; tx < 90; tx++) {
        const cur = chooseHavenDockSett(tx, ty, n);
        const left = chooseHavenDockSett(tx - 1, ty, n);
        const up = chooseHavenDockSett(tx, ty - 1, n);
        if (cur.variant === left.variant && cur.rot90 === left.rot90) sameBoth += 1;
        if (cur.variant === up.variant && cur.rot90 === up.rot90) sameBoth += 1;
        cells += 2;
      }
    }
    expect(sameBoth / cells).toBeLessThan(0.08);
  });

  it('uses all four stamped variants across a pier', () => {
    const seen = new Set<number>();
    for (let ty = 55; ty < 72; ty++) {
      for (let tx = 51; tx < 60; tx++) {
        seen.add(chooseHavenDockSett(tx, ty, 4).variant);
      }
    }
    expect(seen.size).toBe(4);
  });
});

describe('haven dock fill', () => {
  it('keeps mortar and setts above a black-square luminance', () => {
    expect(dockFillLuminance(HAVEN_DOCK_MORTAR)).toBeGreaterThan(70);
    for (const color of HAVEN_DOCK_STONE) {
      expect(dockFillLuminance(color)).toBeGreaterThan(90);
    }
  });
});
