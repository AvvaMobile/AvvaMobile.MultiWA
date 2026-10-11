import { describe, expect, it, vi } from 'vitest';
import { SPLITTER_WIDTH } from '../../../domain/layout/splitPane';
import { RIGHT_PANE_HEADER_HEIGHT } from '../../../shared/shellLayout';
import { PaneLayoutController, type LayoutView } from '../PaneLayoutController';

const area = { x: 0, y: 44, width: 1206, height: 800 };
const fakeView = () => ({ setBounds: vi.fn<LayoutView['setBounds']>(), setVisible: vi.fn<LayoutView['setVisible']>() });

function setup(ratio = 0.5) {
  const commit = vi.fn();
  const c = new PaneLayoutController(() => area, ratio, commit);
  const a = fakeView(), b = fakeView(), d = fakeView();
  c.register('a', a);
  c.register('b', b);
  c.register('d', d);
  return { c, a, b, d, commit };
}

describe('PaneLayoutController', () => {
  it('registering hides the view until it is shown somewhere', () => {
    const { a } = setup();
    expect(a.setVisible).toHaveBeenLastCalledWith(false);
  });

  it('activate fills the whole work area when the right pane is closed', () => {
    const { c, a, b } = setup();
    c.activate('a');
    expect(c.activeId).toBe('a');
    expect(a.setBounds).toHaveBeenLastCalledWith(area);
    expect(a.setVisible).toHaveBeenLastCalledWith(true);
    expect(b.setVisible).toHaveBeenLastCalledWith(false);
    expect(c.geometry()).toEqual({ left: area, splitter: null, rightHeader: null, right: null });
  });

  it('setRight splits the area and shows both views', () => {
    const { c, a, b } = setup();
    c.activate('a');
    c.setRight('b');
    const g = c.geometry();
    expect(g.left).toEqual({ x: 0, y: 44, width: 600, height: 800 });
    expect(g.splitter).toEqual({ x: 600, y: 44, width: SPLITTER_WIDTH, height: 800 });
    expect(g.rightHeader).toEqual({ x: 606, y: 44, width: 600, height: RIGHT_PANE_HEADER_HEIGHT });
    expect(g.right).toEqual({ x: 606, y: 44 + RIGHT_PANE_HEADER_HEIGHT, width: 600, height: 800 - RIGHT_PANE_HEADER_HEIGHT });
    expect(a.setBounds).toHaveBeenLastCalledWith(g.left);
    expect(b.setBounds).toHaveBeenLastCalledWith(g.right);
    expect(b.setVisible).toHaveBeenLastCalledWith(true);
  });

  it('activating the right-pane account swaps the panes', () => {
    const { c, a, b } = setup();
    c.activate('a');
    c.setRight('b');
    c.activate('b');
    expect(c.activeId).toBe('b');
    expect(c.rightId).toBe('a');
    expect(b.setBounds).toHaveBeenLastCalledWith(c.geometry().left);
    expect(a.setBounds).toHaveBeenLastCalledWith(c.geometry().right);
  });

  it('activating a third account keeps the right pane', () => {
    const { c, d } = setup();
    c.activate('a');
    c.setRight('b');
    c.activate('d');
    expect(c.activeId).toBe('d');
    expect(c.rightId).toBe('b');
    expect(d.setVisible).toHaveBeenLastCalledWith(true);
  });

  it('setRight with the active account is ignored; setRight(null) closes the pane', () => {
    const { c, a, b } = setup();
    c.activate('a');
    c.setRight('a');
    expect(c.rightId).toBeNull();
    c.setRight('b');
    c.setRight(null);
    expect(c.rightId).toBeNull();
    expect(b.setVisible).toHaveBeenLastCalledWith(false);
    expect(a.setBounds).toHaveBeenLastCalledWith(area);
  });

  it('unregister clears whichever slot held the view', () => {
    const { c, a } = setup();
    c.activate('a');
    c.setRight('b');
    c.unregister('b');
    expect(c.rightId).toBeNull();
    expect(c.has('b')).toBe(false);
    expect(a.setBounds).toHaveBeenLastCalledWith(area);
    c.unregister('a');
    expect(c.activeId).toBeNull();
  });

  it('hidden (offline) views stay invisible but keep their slot and bounds', () => {
    const { c, a } = setup();
    c.activate('a');
    c.setHidden('a', true);
    expect(a.setVisible).toHaveBeenLastCalledWith(false);
    c.relayout();
    expect(a.setBounds).toHaveBeenLastCalledWith(area);
    c.setHidden('a', false);
    expect(a.setVisible).toHaveBeenLastCalledWith(true);
  });

  it('preview resizes without persisting; commit persists the clamped ratio', () => {
    const { c, commit } = setup();
    c.activate('a');
    c.setRight('b');
    expect(c.preview(0.3)).toBeCloseTo(0.3);
    expect(commit).not.toHaveBeenCalled();
    expect(c.commit(0.01)).toBeCloseTo(360 / 1200);
    expect(commit).toHaveBeenCalledWith(c.ratio);
    expect(() => c.commit(NaN)).toThrow();
  });

  it('activate of an unknown id throws', () => {
    const { c } = setup();
    expect(() => c.activate('zzz')).toThrow();
  });
});
