// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountView } from '../../../shared/state';
import { TabBar } from '../components/TabBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const acc = (id: string, over: Partial<AccountView> = {}): AccountView => ({ id, name: id, color: '#25d366', status: 'ready', error: null, unread: 0, ...over });

let root: Root | null = null;
let host: HTMLElement;
function render(props: Partial<Parameters<typeof TabBar>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const p = { accounts: [acc('a', { unread: 3 }), acc('b', { status: 'offline', error: 'x' })], activeId: 'a', onSelect: vi.fn(), onReorder: vi.fn(), onContextMenu: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), onRename: vi.fn(), renamingId: null, onRenameStart: vi.fn(), onRenameEnd: vi.fn(), splitOpen: false, onToggleSplit: vi.fn(), ...props };
  act(() => root!.render(<TabBar {...p} />));
  return p;
}
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

describe('TabBar', () => {
  it('shows the unread count and the offline marker', () => {
    render();
    expect(host.querySelector('.tab[aria-selected="true"] .tab-unread')?.textContent).toBe('3');
    expect(host.querySelector('.tab.offline')).not.toBeNull();
  });
  it('double-click starts a rename; Enter commits the trimmed name; Escape cancels', () => {
    const p = render();
    const tab = host.querySelectorAll<HTMLElement>('.tab')[0]!;
    act(() => tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(p.onRenameStart).toHaveBeenCalledWith('a');
    act(() => root!.render(<TabBar {...p} renamingId="a" />));
    const input = host.querySelector<HTMLInputElement>('.tab-rename')!;
    expect(input).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '  Work  '); // bypass React's value tracker so the input event counts as a change
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(p.onRename).toHaveBeenCalledWith('a', 'Work');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(p.onRenameEnd).toHaveBeenCalled();
  });
  it('the split button at the right end toggles the right pane and needs two accounts', () => {
    const p = render({ splitOpen: false, onToggleSplit: vi.fn() });
    const btn = host.querySelector<HTMLButtonElement>('.topbar > .tab-split')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => btn.click());
    expect(p.onToggleSplit).toHaveBeenCalledTimes(1);
    act(() => root!.render(<TabBar {...p} splitOpen={true} />));
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    act(() => root!.render(<TabBar {...p} accounts={[acc('a')]} splitOpen={false} />));
    expect(host.querySelector<HTMLButtonElement>('.tab-split')!.disabled).toBe(true);
  });
  it('the close button asks to close only its tab', () => {
    const p = render();
    const close = host.querySelectorAll<HTMLButtonElement>('.tab-close')[1]!;
    act(() => close.click());
    expect(p.onClose).toHaveBeenCalledWith('b');
    expect(p.onSelect).not.toHaveBeenCalled();
  });
});
