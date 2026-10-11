import type { AccountView, ShellState } from '../../shared/state';

/**
 * Pure helpers for multiple shell windows. Each account tab lives in exactly one window;
 * a window's renderer only ever sees its own tabs.
 */

/** The full account list narrowed to one window's tabs, with that window's pane state. */
export function stateForWindow(all: readonly AccountView[], inWindow: (id: string) => boolean, activeAccountId: string | null, rightPaneAccountId: string | null, splitRatio: number): ShellState {
  return { accounts: all.filter((a) => inWindow(a.id)), activeAccountId, rightPaneAccountId, splitRatio };
}

/** The tab a window shows after its tabs changed: the current one if it is still there, else its first tab. */
export function nextActiveTab(orderedIds: readonly string[], inWindow: (id: string) => boolean, current: string | null): string | null {
  if (current && inWindow(current) && orderedIds.includes(current)) return current;
  return orderedIds.find(inWindow) ?? null;
}

/**
 * Applies one window's reordered tabs to the global tab order: that window's slots get its new order,
 * every other window's tabs keep their positions. Null unless `windowOrder` is exactly the window's tabs.
 */
export function mergeWindowOrder(globalOrder: readonly string[], inWindow: (id: string) => boolean, windowOrder: readonly string[]): string[] | null {
  const own = globalOrder.filter(inWindow);
  if (own.length !== windowOrder.length || new Set(windowOrder).size !== windowOrder.length || !windowOrder.every((id) => own.includes(id))) return null;
  let i = 0;
  return globalOrder.map((id) => (inWindow(id) ? windowOrder[i++]! : id));
}

const pageKey = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    return decodeURIComponent(`${u.protocol}//${u.host}${u.pathname}`);
  } catch {
    return null;
  }
};

/** Whether `url` is the page `expected` (query and fragment ignored; percent-encoding normalized). */
export function isSamePage(url: string, expected: string): boolean {
  const k = pageKey(url);
  return k !== null && k === pageKey(expected);
}

export interface Bounds { x: number; y: number; width: number; height: number; }

/** Minimum visible width/height of a restored window on some display, so its title bar can still be grabbed. */
const MIN_VISIBLE = 100;

/** `bounds` when at least MIN_VISIBLE px of it lie on one of `displays` (work areas), else null (use defaults). */
export function boundsOnDisplay(bounds: Bounds | null | undefined, displays: readonly Bounds[]): Bounds | null {
  if (!bounds) return null;
  const visible = displays.some((d) => {
    const w = Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x);
    const h = Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y);
    return w >= MIN_VISIBLE && h >= MIN_VISIBLE;
  });
  return visible ? bounds : null;
}
