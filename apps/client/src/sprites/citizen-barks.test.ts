import { describe, expect, it } from 'vitest';
import {
  pickContextualGreetingBark,
  KARMA_CITIZEN_BARKS,
  KARMA_GUARD_BARKS,
  MOUNTED_CITIZEN_BARKS,
  MOUNTED_GUARD_BARKS,
  MORNING_BARKS,
  MIDDAY_BARKS,
  EVENING_BARKS,
  NIGHT_CITIZEN_BARKS,
  NIGHT_GUARD_BARKS,
  DEFAULT_GREET_BARKS,
} from './citizen-barks.js';

describe('citizen-barks', () => {
  it('triggers positive PK karma reaction for criminal players', () => {
    const barkCitizen = pickContextualGreetingBark({ playerKarma: 10 });
    expect(KARMA_CITIZEN_BARKS).toContain(barkCitizen);

    const barkGuard = pickContextualGreetingBark({ playerKarma: 10, isNightGuard: true });
    expect(KARMA_GUARD_BARKS).toContain(barkGuard);
  });

  it('triggers mounted reactions when player is mounted', () => {
    const barkCitizen = pickContextualGreetingBark({ playerMounted: true });
    expect(MOUNTED_CITIZEN_BARKS).toContain(barkCitizen);

    const barkGuard = pickContextualGreetingBark({ playerMounted: true, isNightGuard: true });
    expect(MOUNTED_GUARD_BARKS).toContain(barkGuard);
  });

  it('prioritizes PK karma warning over mounted reaction', () => {
    const bark = pickContextualGreetingBark({ playerMounted: true, playerKarma: 5 });
    expect(KARMA_CITIZEN_BARKS).toContain(bark);
  });

  it('does not treat zero or legacy negative karma as PK', () => {
    expect(KARMA_CITIZEN_BARKS).not.toContain(
      pickContextualGreetingBark({ playerKarma: 0 }, () => 0),
    );
    expect(KARMA_CITIZEN_BARKS).not.toContain(
      pickContextualGreetingBark({ playerKarma: -5 }, () => 0),
    );
  });

  it('reacts to morning hours', () => {
    const bark = pickContextualGreetingBark({ hour: 8 });
    expect(MORNING_BARKS).toContain(bark);
  });

  it('reacts to midday hours', () => {
    const bark = pickContextualGreetingBark({ hour: 14 });
    expect(MIDDAY_BARKS).toContain(bark);
  });

  it('reacts to evening hours', () => {
    const bark = pickContextualGreetingBark({ hour: 19 });
    expect(EVENING_BARKS).toContain(bark);
  });

  it('reacts to night hours for citizens and guards', () => {
    const barkCit = pickContextualGreetingBark({ hour: 23 });
    expect(NIGHT_CITIZEN_BARKS).toContain(barkCit);

    const barkGrd = pickContextualGreetingBark({ hour: 23, isNightGuard: true });
    expect(NIGHT_GUARD_BARKS).toContain(barkGrd);
  });

  it('falls back to default greetings when no hour or context is provided', () => {
    const bark = pickContextualGreetingBark({});
    expect(DEFAULT_GREET_BARKS).toContain(bark);
  });
});
