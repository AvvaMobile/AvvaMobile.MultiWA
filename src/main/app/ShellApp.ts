import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, screen, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type Rectangle } from 'electron';
import { autoUpdater } from 'electron-updater';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { colorForNew, nextAccountName, validateAccountName, type AccountRecord } from '../../domain/accounts/account';
import { isValidSplitRatio } from '../../domain/layout/splitPane';
import { TOPBAR_HEIGHT, workAreaFor } from '../../shared/shellLayout';
import { SHELL_CHANNELS, type AccountView, type ShellCommand, type ShellState, type ToastMessage } from '../../shared/state';
import { AccountRuntime } from '../accounts/AccountRuntime';
import { createDiagnosticsLog } from '../diagnostics/diagnosticsLog';
import { DownloadManager } from '../downloads/DownloadManager';
import { PaneLayoutController } from '../layout/PaneLayoutController';
import { partitionFor } from '../security/origins';
import { AppStateStore, MAIN_WINDOW_ID, type WindowRecord } from './AppStateStore';
import { boundsOnDisplay, isSamePage, mergeWindowOrder, nextActiveTab, stateForWindow } from './shellWindows';
import { UpdateService } from './updater';

/** One shell window: its BrowserWindow, its persisted record id and its pane layout. */
interface ShellWindow {
  id: string;
  win: BrowserWindow;
  layout: PaneLayoutController;
}

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const APP_TITLE = 'MultiWA';

const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(v);

/**
 * Product shell: account tab strip, one WhatsApp WebContentsView per account, optional right pane, several
 * windows. Wires the tested modules (store, layout, runtimes, downloads) to Electron.
 */
export async function startShell(): Promise<{ focusMainWindow: () => void }> {
  const userData = app.getPath('userData');
  const diag = createDiagnosticsLog(join(userData, 'logs', 'events.log'));
  const store = new AppStateStore(join(userData, 'app-state.json'), 150, diag);
  const runtimes = new Map<string, AccountRuntime>();
  const windows = new Map<string, ShellWindow>(); // by WindowRecord id
  const windowOf = new Map<string, ShellWindow>(); // accountId -> window
  let quitting = false;

  // ---------- Shell page / renderer ----------

  const shellPageUrl = process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/shell/index.html` : pathToFileURL(join(__dirname, '../renderer/shell/index.html')).href;
  const isShellPage = (url: string) => isSamePage(url, shellPageUrl);
  const loadShellRenderer = async (sw: ShellWindow) => {
    if (process.env.ELECTRON_RENDERER_URL) await sw.win.loadURL(shellPageUrl);
    else await sw.win.loadFile(join(__dirname, '../renderer/shell/index.html'));
  };

  const mainWindow = (): ShellWindow => windows.get(MAIN_WINDOW_ID)!;
  const focusedWindow = (): ShellWindow => {
    const f = BrowserWindow.getFocusedWindow();
    for (const sw of windows.values()) if (f && sw.win === f) return sw;
    return mainWindow();
  };
  /** For menu actions: the focused window, or the main window shown first (on macOS it may be hidden behind the Dock). */
  const visibleWindow = (): ShellWindow => {
    const sw = focusedWindow();
    if (!sw.win.isDestroyed() && !sw.win.isVisible()) sw.win.show();
    return sw;
  };
  const tabsIn = (sw: ShellWindow) => store.accounts().filter((a) => windowOf.get(a.id) === sw).map((a) => a.id);
  const sendCommand = (sw: ShellWindow, c: ShellCommand) => {
    if (!sw.win.isDestroyed()) sw.win.webContents.send(SHELL_CHANNELS.command, c);
  };

  // ---------- Windows ----------

  function persistWindow(sw: ShellWindow): void {
    if (sw.win.isDestroyed()) return;
    const b = sw.win.getNormalBounds();
    store.upsertWindow({
      id: sw.id,
      isMain: sw.id === MAIN_WINDOW_ID,
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      activeAccountId: sw.layout.activeId,
      splitRatio: sw.layout.ratio,
      rightPaneAccountId: sw.layout.rightId,
    });
  }

  function createShellWindow(record: WindowRecord): ShellWindow {
    const bounds: Partial<Rectangle> = boundsOnDisplay(record.bounds, screen.getAllDisplays().map((d) => d.workArea)) ?? {};
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      ...bounds,
      minWidth: 900,
      minHeight: 560,
      title: APP_TITLE,
      // The tab strip doubles as the title bar: traffic lights sit inside it and its empty space drags the window.
      ...(isWindows
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#e8e8ea', symbolColor: '#1f1f1f', height: TOPBAR_HEIGHT - 1 }, autoHideMenuBar: true }
        : { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 15 } }),
      backgroundColor: '#111b21',
      show: false,
      webPreferences: { preload: join(__dirname, '../preload/shell.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
    });
    win.once('ready-to-show', () => win.show());
    // The shell renderer never navigates or opens windows itself.
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const layout = new PaneLayoutController(
      () => {
        const [w, h] = win.getContentSize();
        return workAreaFor(w!, h!);
      },
      record.splitRatio,
      () => persistWindow(sw),
    );
    const sw: ShellWindow = { id: record.id, win, layout };
    windows.set(record.id, sw);

    win.on('enter-full-screen', () => sendCommand(sw, 'fullscreen-enter'));
    win.on('leave-full-screen', () => sendCommand(sw, 'fullscreen-leave'));
    win.on('resize', () => {
      layout.relayout();
      persistWindow(sw);
    });
    win.on('move', () => persistWindow(sw));
    win.on('focus', () => {
      if (isWindows) win.flashFrame(false);
      routeRecentAttention();
      const id = layout.activeId;
      if (id) runtimes.get(id)?.focus();
    });
    win.on('close', (e) => {
      if (quitting) return;
      if (sw.id === MAIN_WINDOW_ID) {
        // macOS: the main window hides (Dock keeps the app alive); elsewhere closing it quits.
        if (isMac) {
          e.preventDefault();
          win.hide();
          return;
        }
        quitting = true;
        app.quit();
        return;
      }
      // A secondary window hands its tabs back to the main window; runtimes keep running.
      const main = mainWindow();
      for (const id of tabsIn(sw)) attachTab(id, main);
      store.removeWindow(sw.id);
      afterTabsChanged(main);
      if (!main.win.isVisible()) main.win.show();
    });
    win.on('closed', () => {
      if (sw.id !== MAIN_WINDOW_ID) windows.delete(sw.id);
      for (const [id, owner] of windowOf) if (owner === sw) windowOf.delete(id);
      broadcast();
    });
    return sw;
  }

  /** Puts a tab's view into `sw` (taking it out of its current window) without selecting it. */
  function attachTab(id: string, sw: ShellWindow): void {
    const rt = runtimes.get(id);
    if (!rt) return;
    const from = windowOf.get(id);
    if (from === sw) return;
    if (from) {
      from.layout.unregister(id);
      if (!from.win.isDestroyed()) from.win.contentView.removeChildView(rt.view);
    }
    sw.win.contentView.addChildView(rt.view);
    sw.layout.register(id, rt.view);
    sw.layout.setHidden(id, rt.snapshot().status === 'offline');
    windowOf.set(id, sw);
    if (store.account(id)?.windowId !== sw.id) store.updateAccount(id, { windowId: sw.id });
  }

  // ---------- State to renderers ----------

  function accountViews(): AccountView[] {
    return store
      .accounts()
      .filter((a) => runtimes.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, color: a.color, ...runtimes.get(a.id)!.snapshot() }));
  }
  const windowState = (sw: ShellWindow, all = accountViews()): ShellState => stateForWindow(all, (id) => windowOf.get(id) === sw, sw.layout.activeId, sw.layout.rightId, sw.layout.ratio);

  let broadcastQueued = false;
  function broadcast(): void {
    if (broadcastQueued) return;
    broadcastQueued = true;
    setTimeout(() => {
      broadcastQueued = false;
      const all = accountViews();
      for (const sw of windows.values()) if (!sw.win.isDestroyed()) sw.win.webContents.send(SHELL_CHANNELS.state, windowState(sw, all));
      app.setBadgeCount(all.reduce((n, a) => n + a.unread, 0));
    }, 16);
  }

  const sendToast = (t: Omit<ToastMessage, 'id'>) => {
    const sw = (t.accountId && windowOf.get(t.accountId)) || focusedWindow();
    if (!sw.win.isDestroyed()) sw.win.webContents.send(SHELL_CHANNELS.toast, { ...t, id: randomUUID() });
  };

  /** Brings a window and an account tab to the front (notification click, page focus request). */
  function bringToFront(id: string): void {
    const sw = windowOf.get(id);
    if (!sw || sw.win.isDestroyed()) return;
    if (sw.layout.activeId !== id && sw.layout.rightId !== id) selectAccount(id);
    if (sw.win.isMinimized()) sw.win.restore();
    if (!sw.win.isVisible()) sw.win.show();
    if (!sw.win.isFocused()) sw.win.focus();
  }

  // ---------- Downloads ----------

  const downloads = new DownloadManager({
    downloadsDir: () => app.getPath('downloads'),
    onEvent: (e) => {
      diag(`[${e.accountId.slice(0, 8)}] download ${e.kind}${e.kind === 'failed' ? ` ${e.state}` : ''}`);
      if (e.kind === 'done') {
        sendToast({ accountId: e.accountId, kind: 'success', title: `Saved ${e.filename}`, body: 'Click to show in folder', downloadId: e.id });
        const owner = windowOf.get(e.accountId);
        if (Notification.isSupported() && (!owner || !owner.win.isFocused())) {
          const note = new Notification({ title: 'Download finished', body: e.filename, silent: true });
          note.on('click', () => downloads.reveal(e.id));
          note.show();
        }
      } else sendToast({ accountId: e.accountId, kind: 'error', title: `Download ${e.state}`, body: e.filename });
    },
  });

  // ---------- Account runtimes ----------

  const lastStatus = new Map<string, AccountView['status']>();
  // Notification-click routing, fallback branch (docs/M0-FEASIBILITY.md Q3 could not be observed): an unread
  // increase that arrives while no MultiWA window is focused is remembered; if a window is activated within a short
  // window after it, that account is brought to the front. Increases while the user is working in MultiWA are
  // ignored, so clicking between windows never switches tabs. The primary branch (the page's own focus request →
  // onAttention → bringToFront) stays in place as well.
  const ATTENTION_WINDOW_MS = 2_000;
  const lastUnread = new Map<string, number>();
  let recentIncrease: { id: string; at: number } | null = null;
  function routeRecentAttention(): void {
    if (!recentIncrease || Date.now() - recentIncrease.at > ATTENTION_WINDOW_MS) return;
    const { id } = recentIncrease;
    recentIncrease = null;
    if (runtimes.has(id)) bringToFront(id);
  }
  function createRuntime(a: AccountRecord, sw: ShellWindow): AccountRuntime {
    const rt = new AccountRuntime(a.id, {
      diag,
      onChange: (id) => {
        const owner = windowOf.get(id);
        const r = runtimes.get(id);
        if (!r) return;
        const { status, error, unread } = r.snapshot();
        if (unread > (lastUnread.get(id) ?? 0) && BrowserWindow.getFocusedWindow() === null) recentIncrease = { id, at: Date.now() };
        lastUnread.set(id, unread);
        owner?.layout.setHidden(id, status === 'offline');
        const wentOffline = status === 'offline' && lastStatus.get(id) !== 'offline';
        lastStatus.set(id, status);
        if (wentOffline) diag(`[${id.slice(0, 8)}] offline ${error ?? ''}`);
        if (wentOffline && owner && !owner.win.isFocused() && Notification.isSupported()) {
          const name = store.account(id)?.name ?? 'Account';
          new Notification({ title: `${name} is offline`, body: error ?? '', silent: true }).show();
        }
        broadcast();
      },
      onAttention: (id) => bringToFront(id),
    });
    runtimes.set(a.id, rt);
    downloads.attach(rt.view.webContents.session, a.id);
    attachTab(a.id, sw);
    rt.load();
    return rt;
  }

  /** Detaches and disposes the runtime; resolves once its page is gone. */
  function destroyRuntime(id: string): Promise<void> {
    const rt = runtimes.get(id);
    const sw = windowOf.get(id);
    runtimes.delete(id);
    windowOf.delete(id);
    lastStatus.delete(id);
    lastUnread.delete(id);
    sw?.layout.unregister(id);
    if (!rt) return Promise.resolve();
    if (sw && !sw.win.isDestroyed()) sw.win.contentView.removeChildView(rt.view);
    return rt.dispose();
  }

  function selectAccount(id: string): void {
    const a = store.account(id);
    const sw = windowOf.get(id);
    if (!a || !runtimes.has(id) || !sw) return;
    sw.layout.activate(id);
    runtimes.get(id)?.focus();
    sw.win.setTitle(a.name);
    persistWindow(sw);
    broadcast();
  }

  function addAccount(sw: ShellWindow): string {
    const all = store.accounts();
    const record: AccountRecord = {
      id: randomUUID(),
      name: nextAccountName(all.map((a) => a.name)),
      color: colorForNew(all.map((a) => a.color)),
      order: all.reduce((m, a) => Math.max(m, a.order), -1) + 1,
      windowId: sw.id,
      createdAt: new Date().toISOString(),
    };
    store.addAccount(record);
    createRuntime(record, sw);
    selectAccount(record.id);
    diag(`[${record.id.slice(0, 8)}] account added`);
    return record.id;
  }

  /** Deletes a partition directory; a failure (file still held open, antivirus) is remembered and retried at the next launch. */
  function removePartitionDir(dirName: string): boolean {
    const dir = join(userData, 'Partitions', dirName);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      diag(`partition ${dirName} delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const gone = !existsSync(dir);
    const pending = store.prefs().pendingPartitionRemovals;
    if (gone && pending.includes(dirName)) store.setPrefs({ pendingPartitionRemovals: pending.filter((p) => p !== dirName) });
    if (!gone && !pending.includes(dirName)) store.setPrefs({ pendingPartitionRemovals: [...pending, dirName] });
    return gone;
  }

  /** Removes the account, its view and its whole session partition. Never throws: the IPC caller already saw the tab go. */
  async function removeAccount(id: string): Promise<void> {
    const sw = windowOf.get(id);
    const rt = runtimes.get(id);
    const ses = rt?.view.webContents.session ?? session.fromPartition(partitionFor(id));
    const disposed = destroyRuntime(id);
    store.removeAccount(id);
    afterTabsChanged(sw ?? mainWindow());
    // Let Chromium close the page and release its storage files before clearing and deleting them.
    await disposed;
    try {
      await ses.clearStorageData();
      await ses.clearCache();
    } catch (err) {
      diag(`[${id.slice(0, 8)}] clearStorageData failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Electron keeps a `persist:` partition under <userData>/Partitions/<name>; remove what clearStorageData left.
    const gone = removePartitionDir(`wa-${id}`);
    diag(`[${id.slice(0, 8)}] account removed${gone ? '' : ' (partition delete pending)'}`);
  }

  function confirmRemove(sw: ShellWindow, id: string): boolean {
    const a = store.account(id);
    if (!a) return false;
    const choice = dialog.showMessageBoxSync(sw.win, {
      type: 'warning',
      buttons: ['Cancel', 'Remove'],
      defaultId: 0,
      cancelId: 0,
      message: `Remove “${a.name}”?`,
      detail: "This account's WhatsApp session is removed from this computer. You will need to scan the QR code again to add it back. Nothing on your phone is changed.",
    });
    return choice === 1;
  }

  /** A window whose tabs changed shows its current or first remaining tab; an emptied secondary window closes. */
  function afterTabsChanged(sw: ShellWindow | undefined): void {
    if (!sw || sw.win.isDestroyed()) return broadcast();
    const ordered = store.accounts().map((a) => a.id);
    const next = nextActiveTab(ordered, (id) => windowOf.get(id) === sw, sw.layout.activeId);
    if (sw.layout.rightId && !windowOf.has(sw.layout.rightId)) sw.layout.setRight(null);
    if (next) selectAccount(next);
    else if (sw.id !== MAIN_WINDOW_ID) sw.win.close();
    else {
      sw.win.setTitle(APP_TITLE);
      persistWindow(sw);
    }
    broadcast();
  }

  function moveTab(id: string, to: ShellWindow): void {
    const from = windowOf.get(id);
    if (!from || from === to) return;
    if (from.layout.rightId === id) from.layout.setRight(null);
    attachTab(id, to);
    selectAccount(id);
    if (to.win.isVisible()) to.win.focus();
    afterTabsChanged(from);
  }

  function moveTabToNewWindow(id: string): void {
    const from = windowOf.get(id);
    if (!from) return;
    const b = from.win.getBounds();
    const record: WindowRecord = { id: randomUUID(), isMain: false, bounds: { x: b.x + 30, y: b.y + 30, width: b.width, height: b.height }, activeAccountId: id, splitRatio: 0.5, rightPaneAccountId: null };
    store.upsertWindow(record);
    const sw = createShellWindow(record);
    void loadShellRenderer(sw);
    moveTab(id, sw);
  }

  function showInRightPane(sw: ShellWindow, id: string): void {
    if (windowOf.get(id) !== sw) moveTab(id, sw);
    if (sw.layout.activeId === id) {
      // Asked to show the active account on the right: put the previous right account (or the next tab) on the left.
      const other = sw.layout.rightId ?? tabsIn(sw).find((x) => x !== id);
      if (!other) return;
      sw.layout.activate(other);
    }
    sw.layout.setRight(id);
    persistWindow(sw);
    broadcast();
  }

  /** Last account shown in a window's right pane, so ⌘\ re-opens it (the persisted record holds only the current pane). */
  const lastRight = new Map<string, string>();
  function hideRightPane(sw: ShellWindow): void {
    if (sw.layout.rightId) lastRight.set(sw.id, sw.layout.rightId);
    sw.layout.setRight(null);
    persistWindow(sw);
    broadcast();
  }

  // ---------- IPC (trusted shell renderer only) ----------

  const fromShell = (e: IpcMainInvokeEvent | IpcMainEvent): ShellWindow | undefined => {
    const frame = e.senderFrame;
    if (!frame || !isShellPage(frame.url)) return undefined;
    for (const sw of windows.values()) if (!sw.win.isDestroyed() && e.sender === sw.win.webContents && frame === sw.win.webContents.mainFrame) return sw;
    return undefined;
  };
  const handleIn = (channel: string, fn: (sw: ShellWindow, ...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, async (e, ...args) => {
      const sw = fromShell(e);
      if (!sw) throw new Error('unauthorized sender');
      return fn(sw, ...args);
    });
  const onIn = (channel: string, fn: (sw: ShellWindow, arg: unknown) => void) =>
    ipcMain.on(channel, (e, arg) => {
      const sw = fromShell(e);
      if (sw) fn(sw, arg);
    });
  const known = (id: unknown): id is string => isId(id) && runtimes.has(id);

  handleIn('shell:get-state', (sw) => windowState(sw));
  handleIn('account:add', (sw) => ({ ok: true, id: addAccount(sw) }));
  handleIn('account:select', (_sw, id) => {
    if (known(id)) selectAccount(id);
  });
  handleIn('account:rename', (sw, id, name) => {
    if (!known(id)) return { ok: false, detail: 'Account not found.' };
    const n = validateAccountName(name);
    if (!n) return { ok: false, detail: 'Enter a name (1–40 characters).' };
    store.updateAccount(id, { name: n });
    if (sw.layout.activeId === id) sw.win.setTitle(n);
    broadcast();
    return { ok: true };
  });
  handleIn('account:remove', async (sw, id) => {
    if (!known(id)) return { ok: false, detail: 'Account not found.' };
    if (!confirmRemove(sw, id)) return { ok: false, code: 'cancelled' };
    if (!known(id)) return { ok: false, detail: 'Account not found.' };
    await removeAccount(id);
    return { ok: true };
  });
  // A window reorders only its own tabs; tabs of other windows keep their slots in the global order.
  handleIn('account:reorder', (sw, ids) => {
    if (!Array.isArray(ids) || !ids.every(isId)) return { ok: false };
    const merged = mergeWindowOrder(store.accounts().map((a) => a.id), (id) => windowOf.get(id) === sw, ids);
    if (!merged || !store.reorderAccounts(merged)) return { ok: false };
    broadcast();
    return { ok: true };
  });
  handleIn('account:context-menu', (sw, id) => {
    if (!known(id)) return;
    const owner = windowOf.get(id);
    const inRight = owner?.layout.rightId === id;
    const moves: MenuItemConstructorOptions[] = [
      ...(owner && tabsIn(owner).length > 1 ? [{ label: 'Move to New Window', click: () => moveTabToNewWindow(id) }] : []),
      ...(owner && owner.id !== MAIN_WINDOW_ID ? [{ label: 'Move to Main Window', click: () => moveTab(id, mainWindow()) }] : []),
    ];
    Menu.buildFromTemplate([
      { label: 'Rename…', click: () => selectAndRename(sw, id) },
      inRight ? { label: 'Hide Right Pane', click: () => hideRightPane(sw) } : { label: 'Show in Right Pane', enabled: tabsIn(sw).length > 1 || windowOf.get(id) !== sw, click: () => showInRightPane(sw, id) },
      { type: 'separator' },
      ...(moves.length ? [...moves, { type: 'separator' } as const] : []),
      { label: 'Reload', click: () => runtimes.get(id)?.reload() },
      { type: 'separator' },
      {
        label: 'Remove Account…',
        click: () => {
          if (confirmRemove(sw, id) && known(id)) void removeAccount(id);
        },
      },
    ]).popup({ window: sw.win });
  });
  handleIn('account:reload', (_sw, id) => {
    if (known(id)) runtimes.get(id)!.reload();
  });
  handleIn('split:show', (sw, id) => {
    if (known(id)) showInRightPane(sw, id);
  });
  handleIn('split:hide', (sw) => hideRightPane(sw));
  // An inline editor (tab rename) needs the keyboard, which selectAccount handed to the account view.
  handleIn('shell:focus', (sw) => {
    if (!sw.win.isDestroyed()) sw.win.webContents.focus();
  });
  handleIn('download:reveal', (_sw, id) => {
    if (isId(id)) downloads.reveal(id);
  });
  // Fire-and-forget so dragging stays smooth: only setBounds on existing views.
  onIn('layout:set-split', (sw, arg) => {
    const { ratio, commit } = (arg ?? {}) as { ratio?: unknown; commit?: unknown };
    if (!isValidSplitRatio(ratio) || sw.layout.rightId === null) return;
    if (commit === true) {
      sw.layout.commit(ratio);
      broadcast();
    } else sw.layout.preview(ratio);
  });

  const selectAndRename = (sw: ShellWindow, id: string) => {
    selectAccount(id);
    const owner = windowOf.get(id) ?? sw;
    if (!owner.win.isDestroyed()) owner.win.webContents.focus();
    sendCommand(owner, { type: 'rename', id });
  };

  // ---------- Menu ----------

  const activeRuntime = () => {
    const id = focusedWindow().layout.activeId;
    return id ? runtimes.get(id) : undefined;
  };
  const zoom = (delta: number | null) => {
    const wc = activeRuntime()?.view.webContents;
    if (!wc) return;
    wc.setZoomLevel(delta === null ? 0 : Math.max(-3, Math.min(3, wc.getZoomLevel() + delta)));
  };
  const cycleTab = (dir: 1 | -1) => {
    const sw = focusedWindow();
    const ids = tabsIn(sw);
    if (ids.length < 2) return;
    const i = Math.max(0, ids.indexOf(sw.layout.activeId ?? ''));
    selectAccount(ids[(i + dir + ids.length) % ids.length]!);
  };
  const selectTabAt = (n: number) => {
    const ids = tabsIn(focusedWindow());
    const id = n === 9 ? ids.at(-1) : ids[n - 1];
    if (id) selectAccount(id);
  };
  const updates = new UpdateService({
    updater: autoUpdater,
    enabled: app.isPackaged && !process.env.MULTIWA_NO_UPDATES,
    currentVersion: app.getVersion(),
    showMessage: async (options) => (await dialog.showMessageBox(visibleWindow().win, options)).response,
    log: (event, data) => diag(`${event}${typeof data?.version === 'string' ? ` ${data.version}` : ''}`),
  });
  const updatesItem: MenuItemConstructorOptions = { label: 'Check for Updates…', click: () => void updates.check() };
  const buildMenu = () => {
    const template: MenuItemConstructorOptions[] = [
      ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, updatesItem, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] } satisfies MenuItemConstructorOptions] : []),
      {
        label: 'File',
        submenu: [
          { label: 'New Account', accelerator: 'CmdOrCtrl+T', click: () => addAccount(visibleWindow()) },
          {
            label: 'New Window',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              const sw = visibleWindow();
              const id = addAccount(sw);
              if (tabsIn(sw).length > 1) moveTabToNewWindow(id);
            },
          },
          { type: 'separator' },
          {
            label: 'Rename Account…',
            click: () => {
              const sw = visibleWindow();
              if (sw.layout.activeId) selectAndRename(sw, sw.layout.activeId);
            },
          },
          {
            label: 'Remove Account…',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              const sw = visibleWindow();
              const id = sw.layout.activeId;
              if (id && confirmRemove(sw, id) && known(id)) void removeAccount(id);
            },
          },
          { type: 'separator' },
          { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' },
          ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'about' } as const, { role: 'quit' } as const]),
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { label: 'Toggle Right Pane', accelerator: 'CmdOrCtrl+\\', click: () => {
              const sw = focusedWindow();
              if (sw.layout.rightId) return hideRightPane(sw);
              const saved = lastRight.get(sw.id);
              const candidate = (saved && windowOf.get(saved) === sw && saved !== sw.layout.activeId ? saved : null) ?? tabsIn(sw).find((x) => x !== sw.layout.activeId);
              if (candidate) showInRightPane(sw, candidate);
            } },
          { label: 'Reload Account', accelerator: 'CmdOrCtrl+R', click: () => activeRuntime()?.reload() },
          { type: 'separator' },
          { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => zoom(null) },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => zoom(0.5) },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => cycleTab(1) },
          { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => cycleTab(-1) },
          ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => ({ label: n === 9 ? 'Last Tab' : `Tab ${n}`, accelerator: `CmdOrCtrl+${n}`, click: () => selectTabAt(n) })),
          ...(isMac ? [{ type: 'separator' } as const, { role: 'front' } as const] : []),
        ],
      },
      {
        label: 'Developer',
        submenu: [
          { label: 'Shell DevTools', click: () => focusedWindow().win.webContents.openDevTools({ mode: 'detach' }) },
          { label: 'WhatsApp DevTools (active account)', click: () => activeRuntime()?.view.webContents.openDevTools({ mode: 'detach' }) },
        ],
      },
      {
        role: 'help',
        submenu: [
          ...(isMac ? [] : [updatesItem, { type: 'separator' } as MenuItemConstructorOptions]),
          { label: 'Open Logs Folder', click: () => shell.showItemInFolder(diag.file) },
          { label: 'MultiWA on GitHub', click: () => void shell.openExternal('https://github.com/AvvaMobile/AvvaMobile.MultiWA') },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };
  buildMenu();

  // ---------- Lifecycle ----------

  app.on('before-quit', () => {
    quitting = true;
    diag('lifecycle before-quit');
    updates.stop();
    for (const sw of windows.values()) persistWindow(sw);
    store.flush();
    // Persist every account's login even if the process is terminated soon after quitting.
    for (const rt of runtimes.values()) void rt.view.webContents.session.cookies.flushStore();
    for (const rt of runtimes.values()) void rt.dispose();
  });
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
  app.on('activate', () => {
    const main = mainWindow();
    if (!main.win.isDestroyed()) {
      main.win.show();
      main.win.focus();
    }
    routeRecentAttention();
  });

  // ---------- Startup ----------

  for (const dirName of store.prefs().pendingPartitionRemovals) {
    if (removePartitionDir(dirName)) diag(`partition ${dirName} deleted (retry)`);
  }

  const first = createShellWindow(store.mainWindowRecord());
  await loadShellRenderer(first);

  const accounts = store.accounts();
  // Secondary windows are restored only when at least one account still lives in them.
  for (const rec of store.windows()) {
    if (rec.isMain) continue;
    if (!accounts.some((a) => a.windowId === rec.id)) {
      store.removeWindow(rec.id);
      continue;
    }
    const sw = createShellWindow(rec);
    void loadShellRenderer(sw);
  }
  for (const a of accounts) createRuntime(a, windows.get(a.windowId) ?? first);
  for (const sw of windows.values()) {
    const rec = store.window(sw.id)!;
    const ids = tabsIn(sw);
    const active = rec.activeAccountId && ids.includes(rec.activeAccountId) ? rec.activeAccountId : ids[0];
    if (active) selectAccount(active);
    if (rec.rightPaneAccountId && ids.includes(rec.rightPaneAccountId) && rec.rightPaneAccountId !== active) sw.layout.setRight(rec.rightPaneAccountId);
  }
  broadcast();
  updates.start();
  diag(`lifecycle started v${app.getVersion()} accounts=${accounts.length}`);

  return {
    focusMainWindow: () => {
      const { win } = first;
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
}
