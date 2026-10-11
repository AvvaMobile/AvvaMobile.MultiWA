import { describe, expect, it } from 'vitest';
import { parseUnreadFromTitle } from '../parseTitle';

describe('parseUnreadFromTitle', () => {
  it('reads the leading parenthesised count', () => {
    expect(parseUnreadFromTitle('(3) WhatsApp')).toBe(3);
    expect(parseUnreadFromTitle('(12) WhatsApp Business')).toBe(12);
  });
  it('is 0 without a count', () => {
    expect(parseUnreadFromTitle('WhatsApp')).toBe(0);
    expect(parseUnreadFromTitle('')).toBe(0);
  });
  it('ignores leading direction marks and whitespace', () => {
    expect(parseUnreadFromTitle('‎(3) WhatsApp')).toBe(3);
    expect(parseUnreadFromTitle('  (7) WhatsApp')).toBe(7);
  });
  it('never returns NaN or negatives for junk', () => {
    for (const t of ['(abc) WhatsApp', '() WhatsApp', '(-2) WhatsApp', 'WhatsApp (3)', '(99999999999999999999) x']) {
      const n = parseUnreadFromTitle(t);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
    expect(parseUnreadFromTitle('WhatsApp (3)')).toBe(0);
  });
  it('caps absurd counts', () => {
    expect(parseUnreadFromTitle('(99999999999999999999) x')).toBe(9999);
  });
});
