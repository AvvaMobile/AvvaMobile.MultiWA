import { parseUnreadFromTitle } from '../../domain/unread/parseTitle';
import type { AccountStatus } from '../../shared/state';

/** One automatic reload per crash within this window; a second crash inside it goes offline (spec §7). */
export const CRASH_RELOAD_WINDOW_MS = 60_000;

export interface RuntimeState {
  status: AccountStatus;
  error: string | null;
  unread: number;
  lastCrashAt: number | null;
}

export type RuntimeEvent =
  | { type: 'load-start' }
  | { type: 'load-finish' }
  | { type: 'load-fail'; code: number; description: string }
  | { type: 'crash'; reason: string }
  | { type: 'title'; title: string }
  | { type: 'load-stop' }
  | { type: 'reload' };

export const initialRuntimeState = (): RuntimeState => ({ status: 'loading', error: null, unread: 0, lastCrashAt: null });

/** Pure status machine of one account view. `action: 'reload'` tells the runtime to load the page again. */
export function reduceRuntime(state: RuntimeState, event: RuntimeEvent, now: number): { state: RuntimeState; action: 'reload' | null } {
  switch (event.type) {
    case 'load-start':
      return { state: { ...state, status: state.status === 'offline' ? 'offline' : 'loading' }, action: null };
    case 'load-finish':
      return { state: { ...state, status: 'ready', error: null }, action: null };
    case 'load-stop':
      // did-stop-loading follows every load-start, including sub-frame loads that never report did-finish-load
      // (and failed loads, so it must not clear offline).
      return { state: { ...state, status: state.status === 'loading' ? 'ready' : state.status }, action: null };
    case 'load-fail':
      // -3 = ERR_ABORTED: a navigation replaced by another one, not a failure.
      if (event.code === -3) return { state, action: null };
      return { state: { ...state, status: 'offline', error: event.description || `Load failed (${event.code})` }, action: null };
    case 'crash': {
      const recent = state.lastCrashAt !== null && now - state.lastCrashAt < CRASH_RELOAD_WINDOW_MS;
      if (recent) return { state: { ...state, status: 'offline', error: `WhatsApp stopped responding (${event.reason})`, lastCrashAt: now }, action: null };
      return { state: { ...state, status: 'loading', error: null, unread: 0, lastCrashAt: now }, action: 'reload' };
    }
    case 'title':
      return { state: { ...state, unread: parseUnreadFromTitle(event.title) }, action: null };
    case 'reload':
      return { state: { ...state, status: 'loading', error: null, unread: 0 }, action: 'reload' };
  }
}
