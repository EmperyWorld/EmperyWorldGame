import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parseLocationContent } from '@empery/shared';
import { contentRoot } from './paths.js';

function baseLocation(): Record<string, unknown> {
  return {
    id: 'test_loc',
    name: 'Test',
    description: 'Test location',
    mapKey: 'map-test',
    backgroundAsset: 'location_test',
    spawn: { x: 100, y: 200 },
  };
}

describe('parseLocationContent strict schema', () => {
  it('accepts real Haven YAML with nested zones/npcs/landmarks/enemies blocks', () => {
    const raw = parseYaml(readFileSync(join(contentRoot, 'locations', 'empery_haven.yaml'), 'utf8'));
    const parsed = parseLocationContent(raw);
    expect(parsed.ok).toBe(true);
  });

  it('validates explicit arrivals as finite strict points', () => {
    const zone={x:1,y:2,label:'Gate',travelTo:'test',arrival:{x:3,y:4}};
    expect(parseLocationContent({...baseLocation(),zones:[zone]}).ok).toBe(true);
    for(const arrival of [{x:NaN,y:4},{x:3},{x:3,y:4,typo:1}])expect(parseLocationContent({...baseLocation(),zones:[{...zone,arrival}]}).ok).toBe(false);
  });
  it('rejects malformed zones payload', () => {
    const parsed = parseLocationContent({
      ...baseLocation(),
      zones: [{ x: 1, y: 2, label: 'Gate', travelTo: 42 }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('zones.0.travelTo');
    }
  });

  it('rejects unknown top-level keys', () => {
    const parsed = parseLocationContent({
      ...baseLocation(),
      zonez: [],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("Unrecognized key: \"zonez\"");
    }
  });

  it('rejects quest spawn without enemies', () => {
    const parsed = parseLocationContent({
      ...baseLocation(),
      questSpawns: [{ activeFlag: 'q_test_active', enemies: [] }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('questSpawns.0.enemies');
    }
  });

  it('rejects recommended level range inversion', () => {
    const parsed = parseLocationContent({
      ...baseLocation(),
      recommendedLevel: { min: 20, max: 10 },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('recommendedLevel.max');
    }
  });
});
