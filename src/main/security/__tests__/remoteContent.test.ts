import { describe, expect, it, vi } from 'vitest';

// Electron is not available under vitest; the pure helpers are tested with the module mocked.
import { EventEmitter } from 'node:events';
vi.mock('electron', () => ({ session: {}, shell: { openExternal: vi.fn(() => Promise.resolve()) }, WebContentsView: class {} }));
import { shell } from 'electron';

import { applyNavigationPolicy, chromeLikeUserAgent, rateLimited, redactUrl, redactUrlsIn, remoteWebPreferences, type NavigationLogEntry } from '../remoteContent';

describe('chromeLikeUserAgent', () => {
  it('drops the Electron and app tokens, keeps Chrome', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) MultiWA/0.1.0 Chrome/134.0.0.0 Electron/44.5.1 Safari/537.36';
    expect(chromeLikeUserAgent(ua)).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
  });
});

describe('remoteWebPreferences', () => {
  it('is hardened and has no preload', () => {
    const p = remoteWebPreferences('persist:wa-x');
    expect(p).toMatchObject({ partition: 'persist:wa-x', nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false });
    expect('preload' in p).toBe(false);
  });
});

describe('redactUrl', () => {
  it('strips query and fragment', () => {
    expect(redactUrl('https://web.whatsapp.com/accept?code=abc#x')).toBe('https://web.whatsapp.com/accept');
    expect(redactUrl('nope')).toBe('<invalid>');
    expect(redactUrlsIn('failed https://a.com/x?y=1 and http://b.org/p#f')).toBe('failed https://a.com/x and http://b.org/p');
  });
});

describe('rateLimited', () => {
  it('allows a short burst per interval, then drops until the interval has passed', () => {
    let t = 0;
    const fn = vi.fn();
    const limited = rateLimited(fn, 1000, () => t, 3);
    expect([limited('a'), limited('b'), limited('c')]).toEqual([true, true, true]);
    expect(limited('d')).toBe(false);
    t = 999;
    expect(limited('e')).toBe(false);
    t = 1000;
    expect(limited('f')).toBe(true);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c', 'f']);
  });
});

class FakeWebContents extends EventEmitter {
  handler: ((d: { url: string }) => { action: string }) | null = null;
  setWindowOpenHandler(h: (d: { url: string }) => { action: string }) { this.handler = h; }
}

describe('applyNavigationPolicy', () => {
  const setup = () => {
    const wc = new FakeWebContents();
    const log: NavigationLogEntry[] = [];
    applyNavigationPolicy(wc as never, (e) => log.push(e));
    return { wc, log };
  };
  const nav = (url: string) => {
    const e = { url, preventDefault: vi.fn() };
    return e;
  };
  it('lets WhatsApp navigate and blocks everything else, opening safe links in the OS browser', () => {
    const { wc, log } = setup();
    vi.mocked(shell.openExternal).mockClear();
    const ok = nav('https://web.whatsapp.com/');
    wc.emit('will-navigate', ok);
    expect(ok.preventDefault).not.toHaveBeenCalled();
    const bad = nav('https://example.com/x?y=1');
    wc.emit('will-navigate', bad);
    expect(bad.preventDefault).toHaveBeenCalled();
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/x?y=1');
    const file = nav('file:///etc/passwd');
    wc.emit('will-navigate', file);
    expect(file.preventDefault).toHaveBeenCalled();
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    expect(log.map((l) => l.kind)).toEqual(['navigate-allowed', 'navigate-blocked', 'navigate-blocked']);
  });
  it('denies every window.open in-app', () => {
    const { wc, log } = setup();
    expect(wc.handler!({ url: 'https://example.com/' })).toEqual({ action: 'deny' });
    expect(wc.handler!({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(log.map((l) => l.kind)).toEqual(['popup-external', 'popup-blocked']);
  });
  it('logs origins only: no paths (phone numbers, invite codes) or queries', () => {
    const { wc, log } = setup();
    wc.emit('will-navigate', nav('https://wa.me/905551234567?text=hi'));
    wc.emit('will-navigate', nav('https://chat.whatsapp.com/AbCdEfGh123'));
    wc.handler!({ url: 'https://example.com/secret/path' });
    expect(log.map((l) => l.url)).toEqual(['https://wa.me', 'https://chat.whatsapp.com', 'https://example.com']);
  });
});
