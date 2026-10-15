import { describe, expect, it } from 'vitest';
import { addEntry, normalizeInventoryEntries } from '@empery/shared';

describe('inventory-entries stacking', () => {
  it('stacks consumables beyond 99', () => {
    let entries = addEntry([], {
      id: 'e1',
      itemId: 'bread_loaf',
      quantity: 1,
    });
    for (let i = 0; i < 110; i++) {
      entries = addEntry(entries, {
        id: `e${i + 2}`,
        itemId: 'bread_loaf',
        quantity: 1,
      });
    }
    expect(entries).toHaveLength(1);
    expect(entries[0]!.quantity).toBe(111);
  });

  it('does not clamp stored quantity on normalize', () => {
    const normalized = normalizeInventoryEntries(
      [{ id: 'e1', itemId: 'bread_loaf', quantity: 150 }],
      [],
      [],
    );
    expect(normalized[0]!.quantity).toBe(150);
  });
});
