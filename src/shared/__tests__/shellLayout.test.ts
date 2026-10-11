import { describe, expect, it } from 'vitest';
import { RIGHT_PANE_HEADER_HEIGHT, TOPBAR_HEIGHT, workAreaFor } from '../shellLayout';

describe('workAreaFor', () => {
  it('is everything below the tab strip', () => {
    expect(workAreaFor(1000, 700)).toEqual({ x: 0, y: TOPBAR_HEIGHT, width: 1000, height: 700 - TOPBAR_HEIGHT });
  });
  it('never goes negative', () => {
    expect(workAreaFor(-5, 10)).toEqual({ x: 0, y: TOPBAR_HEIGHT, width: 0, height: 0 });
  });
  it('exports the fixed chrome sizes', () => {
    expect(TOPBAR_HEIGHT).toBe(44);
    expect(RIGHT_PANE_HEADER_HEIGHT).toBe(28);
  });
});
