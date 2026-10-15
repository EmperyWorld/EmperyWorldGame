import { describe, expect, it } from 'vitest';
import { sanitizeChatText } from './chat.js';

describe('chat sanitize', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeChatText('  привет   мир  ')).toBe('привет мир');
  });

  it('rejects empty text', () => {
    expect(sanitizeChatText('   ')).toBeNull();
  });

  it('caps length at 200', () => {
    const long = 'a'.repeat(250);
    expect(sanitizeChatText(long)?.length).toBe(200);
  });
});
