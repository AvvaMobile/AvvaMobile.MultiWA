/**
 * Split-pane geometry for the work area: left account | splitter | right account.
 * Pure functions shared by the shell renderer (splitter drag) and the main process (view bounds),
 * so both sides always agree.
 */

/** Fraction of the work area given to the left pane. */
export type SplitRatio = number;

export const DEFAULT_SPLIT_RATIO: SplitRatio = 0.5;
export const MIN_PANE_WIDTH = 360;
export const SPLITTER_WIDTH = 6;

export interface Rect { x: number; y: number; width: number; height: number; }

export interface SplitGeometry { left: Rect; splitter: Rect; right: Rect; }

export function isValidSplitRatio(value: unknown): value is SplitRatio {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1;
}

/** Clamps a ratio so neither pane drops below MIN_PANE_WIDTH; a too-narrow area is shared equally. */
export function clampSplitRatio(ratio: number, workAreaWidth: number): SplitRatio {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : DEFAULT_SPLIT_RATIO;
  const usable = workAreaWidth - SPLITTER_WIDTH;
  if (!(usable > 0)) return isValidSplitRatio(r) ? r : DEFAULT_SPLIT_RATIO;
  if (usable < 2 * MIN_PANE_WIDTH) return 0.5;
  const min = MIN_PANE_WIDTH / usable;
  return Math.min(1 - min, Math.max(min, r));
}

/** Ratio for a splitter dragged to `pointerX` (relative to the work area's left edge). */
export function ratioFromPointer(pointerX: number, workAreaWidth: number): SplitRatio {
  const usable = workAreaWidth - SPLITTER_WIDTH;
  if (!(usable > 0)) return DEFAULT_SPLIT_RATIO;
  return clampSplitRatio((pointerX - SPLITTER_WIDTH / 2) / usable, workAreaWidth);
}

/** Integer pixel geometry for a work area at (`area.x`, `area.y`). */
export function computeSplitGeometry(area: Rect, ratio: number): SplitGeometry {
  const usable = Math.max(0, area.width - SPLITTER_WIDTH);
  const leftWidth = Math.round(usable * clampSplitRatio(ratio, area.width));
  const rightWidth = Math.max(0, usable - leftWidth);
  return {
    left: { x: area.x, y: area.y, width: leftWidth, height: area.height },
    splitter: { x: area.x + leftWidth, y: area.y, width: SPLITTER_WIDTH, height: area.height },
    right: { x: area.x + leftWidth + SPLITTER_WIDTH, y: area.y, width: rightWidth, height: area.height },
  };
}
