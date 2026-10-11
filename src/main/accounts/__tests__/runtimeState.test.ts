import { describe, expect, it } from 'vitest';
import { CRASH_RELOAD_WINDOW_MS, initialRuntimeState, reduceRuntime, type RuntimeState } from '../runtimeState';

const run = (events: Parameters<typeof reduceRuntime>[1][], now = 1000) => {
  let s: RuntimeState = initialRuntimeState();
  const actions: Array<'reload' | null> = [];
  for (const e of events) {
    const r = reduceRuntime(s, e, now);
    s = r.state;
    actions.push(r.action);
  }
  return { s, actions };
};

describe('reduceRuntime', () => {
  it('starts loading and becomes ready', () => {
    const { s } = run([{ type: 'load-start' }, { type: 'load-finish' }]);
    expect(s).toMatchObject({ status: 'ready', error: null });
  });
  it('a sub-frame load (load-start without load-finish) ends on load-stop as ready; load-stop never clears offline', () => {
    expect(run([{ type: 'load-start' }, { type: 'load-finish' }, { type: 'load-start' }, { type: 'load-stop' }]).s.status).toBe('ready');
    expect(run([{ type: 'load-start' }, { type: 'load-fail', code: -106, description: 'x' }, { type: 'load-stop' }]).s.status).toBe('offline');
  });
  it('a main-frame load failure is offline with the description; aborted loads (-3) are ignored', () => {
    expect(run([{ type: 'load-start' }, { type: 'load-fail', code: -106, description: 'ERR_INTERNET_DISCONNECTED' }]).s).toMatchObject({ status: 'offline', error: 'ERR_INTERNET_DISCONNECTED' });
    expect(run([{ type: 'load-start' }, { type: 'load-fail', code: -3, description: 'ERR_ABORTED' }]).s.status).toBe('loading');
  });
  it('the first crash within a minute asks for one reload; the second goes offline', () => {
    const a = run([{ type: 'load-finish' }, { type: 'crash', reason: 'oom' }], 1000);
    expect(a.actions.at(-1)).toBe('reload');
    expect(a.s).toMatchObject({ status: 'loading', lastCrashAt: 1000 });
    const b = reduceRuntime(a.s, { type: 'crash', reason: 'crashed' }, 1000 + CRASH_RELOAD_WINDOW_MS - 1);
    expect(b.action).toBeNull();
    expect(b.state).toMatchObject({ status: 'offline', error: 'WhatsApp stopped responding (crashed)' });
  });
  it('a crash after the window reloads again', () => {
    const a = run([{ type: 'crash', reason: 'oom' }], 1000);
    const b = reduceRuntime(a.s, { type: 'crash', reason: 'oom' }, 1000 + CRASH_RELOAD_WINDOW_MS + 1);
    expect(b.action).toBe('reload');
  });
  it('titles update unread without changing status; reload clears error and unread', () => {
    const { s } = run([{ type: 'load-finish' }, { type: 'title', title: '(4) WhatsApp' }]);
    expect(s).toMatchObject({ status: 'ready', unread: 4 });
    const r = reduceRuntime({ ...s, status: 'offline', error: 'x' }, { type: 'reload' }, 5);
    expect(r).toEqual({ state: { status: 'loading', error: null, unread: 0, lastCrashAt: s.lastCrashAt }, action: 'reload' });
  });
});
