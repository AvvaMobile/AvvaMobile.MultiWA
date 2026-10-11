import { session, shell, WebContentsView, type Session, type WebContents, type WebPreferences } from 'electron';
import { isAllowedTopLevelUrl, isSafeExternalUrl, partitionFor } from './origins';
import { decidePermissionCheck, decidePermissionRequest } from './permissions';

/**
 * Hardened webPreferences for remote WhatsApp content (docs/SECURITY.md). No preload: remote content gets
 * no bridge of any kind. One partition per account.
 */
export function remoteWebPreferences(partition: string): WebPreferences {
  return {
    partition,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    spellcheck: true,
  };
}

export interface PermissionLogEntry {
  at: string;
  kind: 'request' | 'check';
  permission: string;
  origin: string;
  mediaTypes?: readonly string[];
  allowed: boolean;
  reason: string;
}

export interface NavigationLogEntry {
  at: string;
  kind: 'navigate-allowed' | 'navigate-blocked' | 'popup-external' | 'popup-blocked';
  url: string;
}

export interface RemoteHooks {
  onPermission?(entry: PermissionLogEntry): void;
  onNavigation?(entry: NavigationLogEntry): void;
}

const configured = new WeakSet<Session>();

/**
 * Removes the "Electron/x" and app tokens from the UA so WhatsApp Web sees the embedded Chromium version's
 * normal UA (otherwise it may show "browser not supported"). Changes no security behaviour.
 */
export function chromeLikeUserAgent(ua: string): string {
  return ua
    .replace(/\s*Electron\/\S+/g, '')
    // App name token(s) Electron inserts between "(KHTML, like Gecko)" and "Chrome/".
    .replace(/(\(KHTML, like Gecko\))\s+.*?\s*(Chrome\/)/, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function safeOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return '<invalid>';
  }
}

/** Configures one account's session exactly once: UA, permission handlers, device denials. Downloads are left to DownloadManager. */
export function configureAccountSession(ses: Session, hooks: RemoteHooks): Session {
  if (configured.has(ses)) return ses;
  configured.add(ses);

  ses.setUserAgent(chromeLikeUserAgent(ses.getUserAgent()));

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
    const decision = decidePermissionRequest({
      permission,
      requestingUrl: details.requestingUrl ?? '',
      topLevelUrl: wc?.getURL() || undefined,
      mediaTypes,
      isMainFrame: details.isMainFrame,
    });
    hooks.onPermission?.({ at: new Date().toISOString(), kind: 'request', permission, origin: safeOrigin(details.requestingUrl ?? ''), mediaTypes, allowed: decision.allow, reason: decision.reason });
    callback(decision.allow);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) =>
    decidePermissionCheck({ permission, requestingOrigin, mediaType: 'mediaType' in details ? details.mediaType : undefined }),
  );
  // USB/HID/serial/bluetooth and screen capture are never needed.
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_req, callback) => callback({}));
  return ses;
}

const EXTERNAL_OPEN_INTERVAL_MS = 2_000;

/** Wraps `fn` so it runs at most once per `intervalMs`; calls in between are dropped (a page must not spam the OS browser). */
export function rateLimited<A extends unknown[]>(fn: (...args: A) => void, intervalMs = EXTERNAL_OPEN_INTERVAL_MS, now: () => number = Date.now): (...args: A) => boolean {
  let last = -Infinity;
  return (...args: A) => {
    const t = now();
    if (t - last < intervalMs) return false;
    last = t;
    fn(...args);
    return true;
  };
}

/** Strip query/fragment (they can carry invite codes) before logging. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '<invalid>';
  }
}

/** Replaces every http(s) URL in free text (e.g. an error message) by its origin and path. */
export function redactUrlsIn(text: string): string {
  return text.replace(/https?:\/\/[^\s'"<>()]+/g, (u) => redactUrl(u));
}

/**
 * Navigation and window-open policy for an account webContents:
 * - top-level navigation outside whatsapp.com / whatsapp.net is blocked and handed to the OS browser;
 * - every window.open is denied in-app; safe http(s) targets open in the OS browser.
 */
function applyNavigationPolicy(wc: WebContents, onLog?: (e: NavigationLogEntry) => void): void {
  const log = (kind: NavigationLogEntry['kind'], url: string) => onLog?.({ at: new Date().toISOString(), kind, url: redactUrl(url) });
  const openExternal = rateLimited((url: string) => void shell.openExternal(url));

  const guard = (event: { preventDefault(): void }, url: string) => {
    if (isAllowedTopLevelUrl(url)) return log('navigate-allowed', url);
    event.preventDefault();
    log('navigate-blocked', url);
    if (isSafeExternalUrl(url)) openExternal(url);
  };
  wc.on('will-navigate', (event) => guard(event, event.url));
  wc.on('will-redirect', (event) => {
    if (event.isMainFrame) guard(event, event.url);
  });
  wc.on('will-attach-webview', (event) => event.preventDefault());
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      log('popup-external', url);
      openExternal(url);
    } else log('popup-blocked', url);
    return { action: 'deny' };
  });
}

/** A hardened, bridge-less WebContentsView on the account's own partition, with navigation policy applied. */
export function createAccountView(accountId: string, hooks: RemoteHooks): WebContentsView {
  const partition = partitionFor(accountId);
  configureAccountSession(session.fromPartition(partition), hooks);
  const view = new WebContentsView({ webPreferences: remoteWebPreferences(partition) });
  applyNavigationPolicy(view.webContents, hooks.onNavigation);
  return view;
}
