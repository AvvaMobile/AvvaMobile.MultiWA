import type { WebContentsView } from 'electron';
import { WHATSAPP_HOME_URL } from '../security/origins';
import { createAccountView, redactUrlsIn } from '../security/remoteContent';
import { initialRuntimeState, reduceRuntime, type RuntimeEvent, type RuntimeState } from './runtimeState';

/** Longest wait for Chromium to release a closed page's storage before the caller goes on (partition removal). */
const DISPOSE_GRACE_MS = 3_000;

export interface AccountRuntimeDeps {
  diag(line: string): void;
  /** Status or unread changed; the shell rebroadcasts state. */
  onChange(id: string): void;
  /** The page asked for focus (e.g. the user clicked one of its OS notifications): show this account. */
  onAttention(id: string): void;
}

/**
 * One account's WhatsApp view and its status (loading / ready / offline) and unread count, derived only
 * from webContents events and the page title. Never reads the DOM. Disposed runtimes ignore late events.
 */
export class AccountRuntime {
  readonly view: WebContentsView;
  private state: RuntimeState = initialRuntimeState();
  private disposed = false;
  /** Set while the shell itself focuses the view, so that focus event is not mistaken for a page request. */
  private ownFocus = false;

  constructor(
    readonly id: string,
    private readonly deps: AccountRuntimeDeps,
  ) {
    const tag = `[${id.slice(0, 8)}]`;
    this.view = createAccountView(id, {
      onPermission: (e) => deps.diag(`${tag} permission ${e.kind} ${e.permission} ${e.origin} -> ${e.allowed ? 'ALLOW' : 'DENY'} (${e.reason})`),
      onNavigation: (e) => deps.diag(`${tag} ${e.kind} ${e.url}`),
    });
    this.view.setBackgroundColor('#111b21');
    const wc = this.view.webContents;
    wc.on('did-start-loading', () => this.dispatch({ type: 'load-start' }));
    wc.on('did-finish-load', () => this.dispatch({ type: 'load-finish' }));
    wc.on('did-stop-loading', () => this.dispatch({ type: 'load-stop' }));
    wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      if (isMainFrame) this.dispatch({ type: 'load-fail', code, description });
    });
    wc.on('render-process-gone', (_e, details) => {
      deps.diag(`${tag} render-process-gone ${details.reason}`);
      this.dispatch({ type: 'crash', reason: details.reason });
    });
    wc.on('page-title-updated', (_e, title) => this.dispatch({ type: 'title', title }));
    wc.on('did-navigate', () => void wc.session.cookies.flushStore());
    // WhatsApp's beforeunload handler would otherwise veto closing the window / quitting the app.
    wc.on('will-prevent-unload', (e) => e.preventDefault());
    wc.on('focus', () => {
      if (this.ownFocus) {
        this.ownFocus = false;
        return;
      }
      if (!this.disposed) deps.onAttention(id);
    });
  }

  snapshot(): Pick<RuntimeState, 'status' | 'error' | 'unread'> {
    const { status, error, unread } = this.state;
    return { status, error, unread };
  }

  load(): void {
    if (this.disposed) return;
    void this.view.webContents.loadURL(WHATSAPP_HOME_URL).catch((err: Error) => this.deps.diag(`[${this.id.slice(0, 8)}] load error ${redactUrlsIn(err.message)}`));
  }

  /** Reload button / menu: goes through the reducer so status and unread reset consistently. */
  reload(): void {
    this.dispatch({ type: 'reload' });
  }

  /** Shell-initiated focus (tab selected, window focused). The resulting focus event is swallowed. */
  focus(): void {
    if (this.disposed || this.view.webContents.isDestroyed()) return;
    this.ownFocus = true;
    this.view.webContents.focus();
    // If Chromium emits no focus event (hidden window), the flag must not swallow a later real one.
    setTimeout(() => (this.ownFocus = false), 500);
  }

  /** Stops listening and closes the page. Resolves once the webContents is destroyed (or after a short grace period). */
  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.disposed = true;
    const wc = this.view.webContents;
    wc.removeAllListeners();
    if (wc.isDestroyed()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DISPOSE_GRACE_MS);
      wc.once('destroyed', () => {
        clearTimeout(timer);
        resolve();
      });
      wc.close();
    });
  }

  private dispatch(event: RuntimeEvent): void {
    if (this.disposed) return;
    const { state, action } = reduceRuntime(this.state, event, Date.now());
    const changed = state.status !== this.state.status || state.error !== this.state.error || state.unread !== this.state.unread;
    this.state = state;
    if (action === 'reload') this.load();
    if (changed) this.deps.onChange(this.id);
  }
}
