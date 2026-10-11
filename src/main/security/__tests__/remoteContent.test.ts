import { describe, expect, it, vi } from 'vitest';

// Electron is not available under vitest; the pure helpers are tested with the module mocked.
vi.mock('electron', () => ({ session: {}, shell: {}, WebContentsView: class {} }));

import { chromeLikeUserAgent, rateLimited, redactUrl, redactUrlsIn, remoteWebPreferences } from '../remoteContent';

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
  it('runs at most once per interval', () => {
    let t = 0;
    const fn = vi.fn();
    const limited = rateLimited(fn, 1000, () => t);
    expect(limited('a')).toBe(true);
    expect(limited('b')).toBe(false);
    t = 1000;
    expect(limited('c')).toBe(true);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['a', 'c']);
  });
});
