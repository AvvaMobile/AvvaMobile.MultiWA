// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MultiWAApi } from '../../../shared/api';
import type { ShellCommand, ShellState, ToastMessage } from '../../../shared/state';
import { App } from '../App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: ShellState = {
  accounts: [
    { id: 'a', name: 'A', color: '#25d366', status: 'ready', error: null, unread: 0 },
    { id: 'b', name: 'B', color: '#1971c2', status: 'ready', error: null, unread: 0 },
  ],
  activeAccountId: 'a',
  rightPaneAccountId: null,
  splitRatio: 0.5,
};

function fakeApi() {
  const listeners = { state: [] as ((s: ShellState) => void)[], toast: [] as ((t: ToastMessage) => void)[], command: [] as ((c: ShellCommand) => void)[] };
  const api = {
    platform: 'darwin',
    getState: vi.fn(() => Promise.resolve(state)),
    addAccount: vi.fn(), selectAccount: vi.fn(), renameAccount: vi.fn(() => Promise.resolve({ ok: true as const })), removeAccount: vi.fn(), reorderAccounts: vi.fn(),
    accountContextMenu: vi.fn(), reloadAccount: vi.fn(), showInRightPane: vi.fn(), hideRightPane: vi.fn(), setSplit: vi.fn(), revealDownload: vi.fn(), focusShell: vi.fn(() => Promise.resolve()),
    onState: (cb: (s: ShellState) => void) => { listeners.state.push(cb); return () => {}; },
    onToast: (cb: (t: ToastMessage) => void) => { listeners.toast.push(cb); return () => {}; },
    onCommand: (cb: (c: ShellCommand) => void) => { listeners.command.push(cb); return () => {}; },
  } as unknown as MultiWAApi;
  return { api, listeners };
}

let root: Root | null = null;
let host: HTMLElement;
async function render() {
  const f = fakeApi();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<App api={f.api} />));
  await act(async () => {});
  return f;
}
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

describe('App', () => {
  it('draws toasts inside the top bar, the only area native account views never cover', async () => {
    const { listeners } = await render();
    act(() => listeners.toast[0]!({ id: 't1', accountId: 'a', kind: 'success', title: 'Saved photo.jpg', body: 'Click to show in folder', downloadId: 'd1' }));
    expect(host.querySelector('.topbar .toast')).not.toBeNull();
    expect(host.querySelector('.topbar .toast')?.textContent).toContain('Saved photo.jpg');
  });
  it('starting a rename by double-click asks main to give the shell keyboard focus (the native view holds it after a select)', async () => {
    const { api } = await render();
    const tab = host.querySelectorAll<HTMLElement>('.tab')[1]!;
    act(() => tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(api.focusShell).toHaveBeenCalledTimes(1);
    expect(tab.querySelector('.tab-rename')).not.toBeNull();
  });
  it('a rename command carrying an account id opens the rename input on that tab, not the active one', async () => {
    const { listeners } = await render();
    act(() => listeners.command[0]!({ type: 'rename', id: 'b' }));
    const tabs = host.querySelectorAll<HTMLElement>('.tab');
    expect(tabs[1]!.querySelector('.tab-rename')).not.toBeNull();
    expect(tabs[0]!.querySelector('.tab-rename')).toBeNull();
  });
});
