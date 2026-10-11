import { describe, expect, it } from 'vitest';
import { isPermutation } from '../order';

describe('isPermutation', () => {
  it('accepts exactly the same ids in any order', () => {
    expect(isPermutation(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });
  it('rejects additions, removals, duplicates and non-strings', () => {
    expect(isPermutation(['a', 'b'], ['a'])).toBe(false);
    expect(isPermutation(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(isPermutation(['a', 'b'], ['a', 'a'])).toBe(false);
    expect(isPermutation(['a', 'b'], ['a', 1])).toBe(false);
  });
});
