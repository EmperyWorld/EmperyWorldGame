import { describe, expect, it } from 'vitest';
import { isBackdropClick } from './overlay-backdrop.js';

describe('overlay backdrop dismiss', () => {
  it('treats only the root as a dismiss click', () => {
    const root = { id: 'overlay' };
    const panel = { id: 'panel' };
    expect(isBackdropClick({ target: root } as Event, root)).toBe(true);
    expect(isBackdropClick({ target: panel } as Event, root)).toBe(false);
  });
});
