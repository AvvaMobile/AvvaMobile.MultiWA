import { describe, expect, it } from 'vitest';
import { clampSplitRatio, computeSplitGeometry, DEFAULT_SPLIT_RATIO, isValidSplitRatio, MIN_PANE_WIDTH, ratioFromPointer, SPLITTER_WIDTH } from '../splitPane';

describe('splitPane', () => {
  it('validates ratios strictly inside (0,1)', () => {
    expect(isValidSplitRatio(0.5)).toBe(true);
    for (const v of [0, 1, -0.1, 1.2, NaN, Infinity, '0.5', null]) expect(isValidSplitRatio(v)).toBe(false);
  });
  it('clamps so neither pane drops below MIN_PANE_WIDTH', () => {
    const w = 1206; // usable 1200
    expect(clampSplitRatio(0.01, w)).toBeCloseTo(MIN_PANE_WIDTH / 1200);
    expect(clampSplitRatio(0.99, w)).toBeCloseTo(1 - MIN_PANE_WIDTH / 1200);
    expect(clampSplitRatio(0.5, w)).toBe(0.5);
  });
  it('shares a too-narrow area equally and survives zero width', () => {
    expect(clampSplitRatio(0.2, 500)).toBe(0.5);
    expect(clampSplitRatio(0.3, 0)).toBe(0.3);
    expect(clampSplitRatio(NaN, 0)).toBe(DEFAULT_SPLIT_RATIO);
  });
  it('maps the pointer to a ratio', () => {
    expect(ratioFromPointer(603, 1206)).toBeCloseTo(0.5);
    expect(ratioFromPointer(0, 0)).toBe(DEFAULT_SPLIT_RATIO);
  });
  it('produces integer, adjacent rectangles', () => {
    const g = computeSplitGeometry({ x: 0, y: 44, width: 1206, height: 800 }, 0.5);
    expect(g.left).toEqual({ x: 0, y: 44, width: 600, height: 800 });
    expect(g.splitter).toEqual({ x: 600, y: 44, width: SPLITTER_WIDTH, height: 800 });
    expect(g.right).toEqual({ x: 606, y: 44, width: 600, height: 800 });
    expect(g.left.width + g.splitter.width + g.right.width).toBe(1206);
  });
});
