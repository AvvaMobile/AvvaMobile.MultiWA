/**
 * Serializable view state shared by the main process and the trusted shell renderer.
 * A window's renderer only ever receives its own tabs.
 */
export type AccountStatus = 'loading' | 'ready' | 'offline';

export interface AccountView {
  id: string;
  name: string;
  color: string;
  status: AccountStatus;
  /** Load/crash error text when `status === 'offline'`. */
  error: string | null;
  /** From the page title "(n) WhatsApp"; 0 when unknown. */
  unread: number;
}

export interface ShellState {
  /** Tabs of this window in order. */
  accounts: AccountView[];
  activeAccountId: string | null;
  /** Account shown in the right pane of this window, or null when the pane is closed. */
  rightPaneAccountId: string | null;
  splitRatio: number;
}

export interface ToastMessage {
  id: string;
  accountId: string | null;
  kind: 'success' | 'error' | 'info';
  title: string;
  body: string;
  /** A finished download: clicking the toast reveals the file (main resolves the id to a path). */
  downloadId?: string;
}

export type ShellCommand = 'fullscreen-enter' | 'fullscreen-leave' | 'rename-active';

/** Fixed IPC push channel names for the shell preload (no generic channel access). */
export const SHELL_CHANNELS = { state: 'shell:state', toast: 'shell:toast', command: 'shell:command' } as const;
