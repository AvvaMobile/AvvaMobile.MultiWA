import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

class FakeWebContents extends EventEmitter {
  loadURL = vi.fn(() => Promise.resolve());
  focus = vi.fn();
  close = vi.fn(() => { setTimeout(() => { this.destroyed = true; this.emit('destroyed'); }, 50); });
  destroyed = false;
  isDestroyed = () => this.destroyed;
  isLoading = () => false;
  session = { cookies: { flushStore: vi.fn(() => Promise.resolve()) } };
}
const created: FakeWebContents[] = [];
vi.mock('../../security/remoteContent', () => ({
  redactUrlsIn: (t: string) => t,
  createAccountView: () => {
    const wc = new FakeWebContents();
    created.push(wc);
    return { webContents: wc, setBackgroundColor: vi.fn(), setBounds: vi.fn(), setVisible: vi.fn() };
  },
}));
vi.mock('electron', () => ({}));

import { AccountRuntime } from '../AccountRuntime';

function setup() {
  const deps = { diag: vi.fn(), onChange: vi.fn(), onAttention: vi.fn() };
  const rt = new AccountRuntime('acc1', deps);
  const wc = created.at(-1)!;
  return { rt, wc, deps };
}

describe('AccountRuntime', () => {
  it('loads WhatsApp and tracks status + unread, notifying on every change', () => {
    const { rt, wc, deps } = setup();
    rt.load();
    expect(wc.loadURL).toHaveBeenCalledWith('https://web.whatsapp.com/');
    wc.emit('did-start-navigation', { url: 'https://web.whatsapp.com/', isMainFrame: true, isSameDocument: false });
    wc.emit('did-finish-load');
    wc.emit('page-title-updated', {}, '(2) WhatsApp');
    expect(rt.snapshot()).toEqual({ status: 'ready', error: null, unread: 2 });
    expect(deps.onChange).toHaveBeenCalledWith('acc1');
  });
  it('sub-frame loads and in-page navigations never put a ready account back into loading', () => {
    const { rt, wc } = setup();
    rt.load();
    wc.emit('did-start-navigation', { url: 'https://web.whatsapp.com/', isMainFrame: true, isSameDocument: false });
    wc.emit('did-finish-load');
    wc.emit('did-start-loading'); // an iframe inside WhatsApp Web (may never report did-finish-load / did-stop-loading)
    wc.emit('did-start-navigation', { url: 'https://x.whatsapp.net/', isMainFrame: false, isSameDocument: false });
    wc.emit('did-start-navigation', { url: 'https://web.whatsapp.com/#chat', isMainFrame: true, isSameDocument: true });
    expect(rt.snapshot().status).toBe('ready');
    wc.emit('did-start-navigation', { url: 'https://web.whatsapp.com/', isMainFrame: true, isSameDocument: false });
    expect(rt.snapshot().status).toBe('loading');
    wc.emit('did-stop-loading');
    expect(rt.snapshot().status).toBe('ready');
  });
  it('a main-frame load failure goes offline; subframe failures are ignored', () => {
    const { rt, wc } = setup();
    wc.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://x', false);
    expect(rt.snapshot().status).toBe('loading');
    wc.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://x', true);
    expect(rt.snapshot()).toMatchObject({ status: 'offline', error: 'ERR_NAME_NOT_RESOLVED' });
  });
  it('reloads once after a crash', () => {
    const { rt, wc } = setup();
    rt.load();
    wc.loadURL.mockClear();
    wc.emit('render-process-gone', {}, { reason: 'oom' });
    expect(wc.loadURL).toHaveBeenCalledTimes(1);
    expect(rt.snapshot().status).toBe('loading');
  });
  it('a focus event on a view asks the shell for attention, except right after the shell focused it itself', () => {
    const { rt, wc, deps } = setup();
    rt.focus();
    wc.emit('focus');
    expect(deps.onAttention).not.toHaveBeenCalled();
    wc.emit('focus');
    expect(deps.onAttention).toHaveBeenCalledWith('acc1');
  });
  it('dispose resolves once the webContents reports destroyed', async () => {
    const { rt, wc } = setup();
    let done = false;
    const p = rt.dispose().then(() => (done = true));
    expect(wc.close).toHaveBeenCalled();
    await Promise.resolve();
    expect(done).toBe(false);
    wc.destroyed = true;
    wc.emit('destroyed');
    await p;
    expect(done).toBe(true);
  });
  it('after dispose, events are ignored and the page is closed', () => {
    const { rt, wc, deps } = setup();
    void rt.dispose();
    expect(wc.close).toHaveBeenCalled();
    deps.onChange.mockClear();
    wc.emit('page-title-updated', {}, '(9) WhatsApp');
    wc.emit('render-process-gone', {}, { reason: 'oom' });
    expect(deps.onChange).not.toHaveBeenCalled();
    expect(rt.snapshot().unread).toBe(0);
  });
});
