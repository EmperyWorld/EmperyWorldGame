import { describe, expect, it } from 'vitest';
import { redactRequestUrl } from './request-logging.js';
describe('request token redaction',()=>{
 it('removes plaintext bearer tokens from ordinary, repeated and encoded query keys',()=>{
  for(const url of ['/ws?saveId=hero&token=secret','/ws?%74oken=secret','/ws?token=secret&token=other','/ws?TOKEN=secret']){const redacted=redactRequestUrl(url);expect(redacted).not.toContain('secret');expect(redacted).not.toContain('other');expect(redacted).toContain('REDACTED');}
 });
 it('preserves useful route and non-secret query fields',()=>{expect(redactRequestUrl('/api/saves?limit=10')).toBe('/api/saves?limit=10');});
});
