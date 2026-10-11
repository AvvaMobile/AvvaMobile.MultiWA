import type { ShellCommand, ShellState, ToastMessage } from './state';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; code?: string; detail?: string };

/** The whole surface the trusted shell renderer gets (`window.multiwa`), exposed by src/preload/shell.ts. */
export interface MultiWAApi {
  /** `process.platform` of the app (window chrome and shortcut labels differ on Windows). */
  platform: string;
  getState(): Promise<ShellState>;
  addAccount(): Promise<Result<{ id: string }>>;
  selectAccount(id: string): Promise<void>;
  renameAccount(id: string, name: string): Promise<Result>;
  /** Main shows the confirmation dialog; `code: 'cancelled'` when the user kept the account. */
  removeAccount(id: string): Promise<Result>;
  reorderAccounts(ids: string[]): Promise<Result>;
  accountContextMenu(id: string): Promise<void>;
  reloadAccount(id: string): Promise<void>;
  showInRightPane(id: string): Promise<void>;
  hideRightPane(): Promise<void>;
  /** Live divider drag (commit=false, at most once per frame) and drag end (commit=true). */
  setSplit(ratio: number, commit: boolean): void;
  revealDownload(downloadId: string): Promise<void>;
  /** Gives the shell page keyboard focus (the active account view normally holds it); used when an inline editor opens. */
  focusShell(): Promise<void>;
  onState(cb: (s: ShellState) => void): () => void;
  onToast(cb: (t: ToastMessage) => void): () => void;
  onCommand(cb: (c: ShellCommand) => void): () => void;
}
