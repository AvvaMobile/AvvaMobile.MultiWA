import { clampSplitRatio, computeSplitGeometry, isValidSplitRatio, type Rect } from '../../domain/layout/splitPane';
import { RIGHT_PANE_HEADER_HEIGHT } from '../../shared/shellLayout';

/** The part of a WebContentsView the layout may touch: geometry and visibility only. */
export interface LayoutView {
  setBounds(bounds: Rect): void;
  setVisible(visible: boolean): void;
}

export interface PaneGeometry {
  left: Rect;
  splitter: Rect | null;
  /** Shell-drawn strip above the right pane (account name + close). */
  rightHeader: Rect | null;
  right: Rect | null;
}

/**
 * Owns the pane layout of one shell window: the active account in the left pane, optionally a second
 * account in the right pane, and the divider ratio. Only ever calls setBounds/setVisible on registered views;
 * it never navigates, reloads or recreates anything (spec §3.4).
 */
export class PaneLayoutController {
  private readonly views = new Map<string, LayoutView>();
  private readonly hidden = new Set<string>();
  private active: string | null = null;
  private right: string | null = null;
  private currentRatio: number;

  constructor(
    private readonly getWorkArea: () => Rect,
    initialRatio: number,
    private readonly onRatioCommit: (ratio: number) => void,
  ) {
    this.currentRatio = isValidSplitRatio(initialRatio) ? initialRatio : 0.5;
  }

  register(id: string, view: LayoutView): void {
    this.views.set(id, view);
    if (id !== this.active && id !== this.right) view.setVisible(false);
  }

  unregister(id: string): void {
    this.views.delete(id);
    this.hidden.delete(id);
    if (this.right === id) this.right = null;
    if (this.active === id) this.active = null;
    this.relayout();
  }

  has(id: string): boolean {
    return this.views.has(id);
  }

  get activeId(): string | null {
    return this.active;
  }

  get rightId(): string | null {
    return this.right;
  }

  /** Effective (clamped) ratio for the current work-area width. */
  get ratio(): number {
    return clampSplitRatio(this.currentRatio, this.getWorkArea().width);
  }

  /** Shows `id` in the left pane. If it was the right pane's account, the two accounts swap panes. */
  activate(id: string): void {
    if (!this.views.has(id)) throw new Error(`unknown account ${id}`);
    if (id === this.active) return this.relayout();
    if (id === this.right) this.right = this.active;
    this.active = id;
    this.relayout();
  }

  /** Shows `id` in the right pane (null closes it). The active account cannot also be the right pane. */
  setRight(id: string | null): void {
    if (id !== null && (!this.views.has(id) || id === this.active)) return;
    this.right = id;
    this.relayout();
  }

  /** Offline mask: the view stays in its slot (bounds follow the layout) but is invisible; the shell draws over it. */
  setHidden(id: string, hidden: boolean): void {
    if (hidden) this.hidden.add(id);
    else this.hidden.delete(id);
    this.relayout();
  }

  geometry(): PaneGeometry {
    const area = this.getWorkArea();
    if (this.right === null) return { left: area, splitter: null, rightHeader: null, right: null };
    const g = computeSplitGeometry(area, this.currentRatio);
    const h = Math.min(RIGHT_PANE_HEADER_HEIGHT, g.right.height);
    return {
      left: g.left,
      splitter: g.splitter,
      rightHeader: { x: g.right.x, y: g.right.y, width: g.right.width, height: h },
      right: { x: g.right.x, y: g.right.y + h, width: g.right.width, height: g.right.height - h },
    };
  }

  /** Live drag update: resizes immediately; nothing is persisted. */
  preview(ratio: number): number {
    return this.update(ratio, false);
  }

  /** End of drag: resizes and persists the clamped ratio. */
  commit(ratio: number): number {
    return this.update(ratio, true);
  }

  /** Re-applies geometry and visibility to every registered view (window resize, slot changes). */
  relayout(): void {
    const g = this.geometry();
    for (const [id, view] of this.views) {
      const slot = id === this.active ? g.left : id === this.right ? g.right : null;
      if (slot) view.setBounds(slot);
      view.setVisible(slot !== null && !this.hidden.has(id));
    }
  }

  private update(ratio: number, persist: boolean): number {
    if (!isValidSplitRatio(ratio)) throw new Error('invalid split ratio');
    this.currentRatio = clampSplitRatio(ratio, this.getWorkArea().width);
    this.relayout();
    if (persist) this.onRatioCommit(this.currentRatio);
    return this.currentRatio;
  }
}
