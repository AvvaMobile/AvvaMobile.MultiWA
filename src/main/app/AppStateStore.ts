import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AccountRecord } from '../../domain/accounts/account';
import { isPermutation } from '../../domain/accounts/order';
import { DEFAULT_SPLIT_RATIO, isValidSplitRatio } from '../../domain/layout/splitPane';
import { renameWithRetry } from './renameWithRetry';

/**
 * Persisted AppState (spec §10). Atomic writes, schema version, corrupt-file recovery, defensive load.
 * Runtime objects (views, sessions, unread counts) are never persisted.
 */
const APP_STATE_SCHEMA_VERSION = 1;
export const MAIN_WINDOW_ID = 'main';

export interface WindowBounds { x: number; y: number; width: number; height: number; }

export interface WindowRecord {
  id: string;
  isMain: boolean;
  bounds: WindowBounds | null;
  activeAccountId: string | null;
  splitRatio: number;
  rightPaneAccountId: string | null;
}

export interface Prefs { lastVersionSeen: string; }

export interface AppState {
  schemaVersion: number;
  accounts: AccountRecord[];
  windows: WindowRecord[];
  prefs: Prefs;
}

const mainWindow = (): WindowRecord => ({ id: MAIN_WINDOW_ID, isMain: true, bounds: null, activeAccountId: null, splitRatio: DEFAULT_SPLIT_RATIO, rightPaneAccountId: null });
const empty = (): AppState => ({ schemaVersion: APP_STATE_SCHEMA_VERSION, accounts: [], windows: [mainWindow()], prefs: { lastVersionSeen: '' } });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

export class AppStateStore {
  private state: AppState;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly file: string,
    private readonly debounceMs = 150,
    private readonly log: (line: string) => void = (line) => console.error(line),
    private readonly retryMs = 5_000,
  ) {
    this.state = this.load();
  }

  get(): Readonly<AppState> {
    return this.state;
  }

  // ---- accounts ----

  account(id: string): AccountRecord | undefined {
    return this.state.accounts.find((a) => a.id === id);
  }

  /** All accounts in global tab order. */
  accounts(): AccountRecord[] {
    return [...this.state.accounts].sort((a, b) => a.order - b.order);
  }

  addAccount(a: AccountRecord): void {
    this.state.accounts.push(a);
    this.save();
  }

  updateAccount(id: string, patch: Partial<Omit<AccountRecord, 'id'>>): void {
    const a = this.account(id);
    if (!a) throw new Error(`unknown account ${id}`);
    Object.assign(a, patch);
    this.save();
  }

  removeAccount(id: string): void {
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
    for (const w of this.state.windows) {
      if (w.activeAccountId === id) w.activeAccountId = null;
      if (w.rightPaneAccountId === id) w.rightPaneAccountId = null;
    }
    this.save();
  }

  /** Persists a new global tab order; `ids` must be a permutation of all account ids. */
  reorderAccounts(ids: readonly string[]): boolean {
    if (!isPermutation(this.accounts().map((a) => a.id), ids)) return false;
    ids.forEach((id, i) => {
      this.account(id)!.order = i;
    });
    this.save();
    return true;
  }

  // ---- windows ----

  window(id: string): WindowRecord | undefined {
    return this.state.windows.find((w) => w.id === id);
  }

  windows(): WindowRecord[] {
    return [...this.state.windows];
  }

  mainWindowRecord(): WindowRecord {
    return this.state.windows.find((w) => w.isMain)!;
  }

  upsertWindow(rec: WindowRecord): void {
    const i = this.state.windows.findIndex((w) => w.id === rec.id);
    if (i >= 0) this.state.windows[i] = rec;
    else this.state.windows.push(rec);
    this.save();
  }

  /** Forgets a secondary window; its accounts go back to the main window. The main window record is never removed. */
  removeWindow(id: string): void {
    const w = this.window(id);
    if (!w || w.isMain) return;
    for (const a of this.state.accounts) if (a.windowId === id) a.windowId = MAIN_WINDOW_ID;
    this.state.windows = this.state.windows.filter((x) => x.id !== id);
    this.save();
  }

  // ---- prefs ----

  prefs(): Prefs {
    return this.state.prefs;
  }

  setPrefs(patch: Partial<Prefs>): void {
    this.state.prefs = { ...this.state.prefs, ...patch };
    this.save();
  }

  // ---- persistence ----

  /** Writes immediately (application shutdown). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.write();
  }

  save(): void {
    if (this.debounceMs <= 0) {
      if (!this.write()) this.scheduleRetry();
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.write()) this.scheduleRetry();
    }, this.debounceMs);
  }

  /** A failed write (disk full, permissions, a locked file) is retried later, never in a tight loop. */
  private scheduleRetry(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.write()) this.scheduleRetry();
    }, this.retryMs);
    this.timer.unref?.();
  }

  private write(): boolean {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      renameWithRetry(tmp, this.file);
      return true;
    } catch (err) {
      this.log(`state save failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private load(): AppState {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return empty();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.schemaVersion !== APP_STATE_SCHEMA_VERSION || !Array.isArray(parsed.accounts)) throw new Error('schema');
      const windowsRaw = Array.isArray(parsed.windows) ? parsed.windows : [];
      const windows: WindowRecord[] = windowsRaw.filter(isRecord).filter((w) => typeof w.id === 'string').map((w) => ({
        id: w.id as string,
        isMain: w.isMain === true || w.id === MAIN_WINDOW_ID,
        bounds: isRecord(w.bounds) && [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height].every((n) => typeof n === 'number' && Number.isFinite(n))
          ? { x: w.bounds.x as number, y: w.bounds.y as number, width: w.bounds.width as number, height: w.bounds.height as number }
          : null,
        activeAccountId: str(w.activeAccountId, '') || null,
        splitRatio: isValidSplitRatio(w.splitRatio) ? w.splitRatio : DEFAULT_SPLIT_RATIO,
        rightPaneAccountId: str(w.rightPaneAccountId, '') || null,
      }));
      if (!windows.some((w) => w.isMain)) windows.unshift(mainWindow());
      const windowIds = new Set(windows.map((w) => w.id));
      const accounts: AccountRecord[] = parsed.accounts
        .filter(isRecord)
        .filter((a) => typeof a.id === 'string' && a.id.length > 0)
        .map((a, i) => ({
          id: a.id as string,
          name: str(a.name, `Account ${i + 1}`),
          color: /^#[0-9a-f]{6}$/i.test(str(a.color)) ? (a.color as string).toLowerCase() : '#25d366',
          order: typeof a.order === 'number' && Number.isFinite(a.order) ? a.order : i,
          windowId: typeof a.windowId === 'string' && windowIds.has(a.windowId) ? a.windowId : MAIN_WINDOW_ID,
          createdAt: str(a.createdAt),
        }));
      const accountIds = new Set(accounts.map((a) => a.id));
      for (const w of windows) {
        if (w.activeAccountId && !accountIds.has(w.activeAccountId)) w.activeAccountId = null;
        if (w.rightPaneAccountId && !accountIds.has(w.rightPaneAccountId)) w.rightPaneAccountId = null;
      }
      const prefs: Prefs = { lastVersionSeen: str(isRecord(parsed.prefs) ? parsed.prefs.lastVersionSeen : '') };
      return { schemaVersion: APP_STATE_SCHEMA_VERSION, accounts, windows, prefs };
    } catch {
      try {
        copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      } catch {
        // ignore
      }
      return empty();
    }
  }
}
