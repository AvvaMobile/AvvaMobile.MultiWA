import { describe, expect, it } from 'vitest';
import { ACCOUNT_COLORS, colorForNew, nextAccountName, validateAccountName } from '../account';

describe('validateAccountName', () => {
  it('trims and collapses whitespace, 1–40 chars', () => {
    expect(validateAccountName('  Work   phone ')).toBe('Work phone');
    expect(validateAccountName('a'.repeat(40))).toHaveLength(40);
    expect(validateAccountName('a'.repeat(41))).toBeNull();
    expect(validateAccountName('   ')).toBeNull();
    expect(validateAccountName(42)).toBeNull();
    expect(validateAccountName(null)).toBeNull();
  });
  it('strips control characters', () => {
    expect(validateAccountName('Ab\u0000c\u001b')).toBe('Abc');
  });
});

describe('nextAccountName', () => {
  it('counts up from the highest existing "Account N"', () => {
    expect(nextAccountName([])).toBe('Account 1');
    expect(nextAccountName(['Account 1'])).toBe('Account 2');
    expect(nextAccountName(['Account 3', 'Work'])).toBe('Account 4');
    expect(nextAccountName(['Work', 'Home'])).toBe('Account 3');
  });
});

describe('colorForNew', () => {
  it('picks the first unused palette color, then cycles', () => {
    expect(colorForNew([])).toBe(ACCOUNT_COLORS[0]);
    expect(colorForNew([ACCOUNT_COLORS[0]!])).toBe(ACCOUNT_COLORS[1]);
    expect(colorForNew(ACCOUNT_COLORS)).toBe(ACCOUNT_COLORS[ACCOUNT_COLORS.length % ACCOUNT_COLORS.length]);
    expect(colorForNew([...ACCOUNT_COLORS, ACCOUNT_COLORS[0]!])).toBe(ACCOUNT_COLORS[1]);
  });
  it('palette entries are #rrggbb', () => {
    for (const c of ACCOUNT_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
