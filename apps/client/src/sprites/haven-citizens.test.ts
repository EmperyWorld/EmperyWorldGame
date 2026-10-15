import { describe, expect, it } from 'vitest';
import { shouldReseedAmbientJoinFromSchedule } from './haven-citizens-join-seed.js';

describe('shouldReseedAmbientJoinFromSchedule', () => {
  it('reseeds when pending and there is no previous seed serverAt', () => {
    expect(shouldReseedAmbientJoinFromSchedule(true, null, 1000)).toBe(true);
  });

  it('does not reseed while pending if snapshot serverAt did not advance yet', () => {
    expect(shouldReseedAmbientJoinFromSchedule(true, 1000, 1000)).toBe(false);
  });

  it('reseeds once first newer authoritative snapshot arrives', () => {
    expect(shouldReseedAmbientJoinFromSchedule(true, 1000, 3000)).toBe(true);
  });

  it('never reseeds when pending flag is off', () => {
    expect(shouldReseedAmbientJoinFromSchedule(false, 1000, 3000)).toBe(false);
  });
});
