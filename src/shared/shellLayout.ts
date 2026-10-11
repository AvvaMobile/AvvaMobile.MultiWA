/** Fixed chrome of the shell window: the tab strip on top; the work area (panes) is everything below it. */
export const TOPBAR_HEIGHT = 44;
/** Header drawn by the shell above the right pane (account name + close). */
export const RIGHT_PANE_HEADER_HEIGHT = 28;

import type { Rect } from '../domain/layout/splitPane';
export type { Rect };

export function workAreaFor(contentWidth: number, contentHeight: number): Rect {
  return { x: 0, y: TOPBAR_HEIGHT, width: Math.max(0, contentWidth), height: Math.max(0, contentHeight - TOPBAR_HEIGHT) };
}
