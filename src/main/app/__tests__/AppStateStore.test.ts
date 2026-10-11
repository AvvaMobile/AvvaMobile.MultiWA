import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AccountRecord } from '../../../domain/accounts/account';
import { AppStateStore, MAIN_WINDOW_ID } from '../AppStateStore';

const acc = (id: string, order = 0): AccountRecord => ({ id, name: id, color: '#25d366', order, windowId: MAIN_WINDOW_ID, createdAt: '' });
const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'mwa-state-')), 'app-state.json');

describe('AppStateStore', () => {
  it('starts with the main window record and no accounts', () => {
    const s = new AppStateStore(tmpFile(), 0);
    expect(s.accounts()).toEqual([]);
    expect(s.mainWindowRecord()).toMatchObject({ id: MAIN_WINDOW_ID, isMain: true, splitRatio: 0.5, rightPaneAccountId: null, activeAccountId: null });
  });

  it('persists accounts, windows and prefs across instances', () => {
    const file = tmpFile();
    const s = new AppStateStore(file, 0);
    s.addAccount(acc('a', 0));
    s.addAccount(acc('b', 1));
    s.updateAccount('b', { name: 'Work', windowId: 'w2' });
    s.upsertWindow({ id: 'w2', isMain: false, bounds: { x: 1, y: 2, width: 900, height: 600 }, activeAccountId: 'b', splitRatio: 0.4, rightPaneAccountId: null });
    s.upsertWindow({ ...s.mainWindowRecord(), activeAccountId: 'a', rightPaneAccountId: 'b', splitRatio: 0.62 });
    s.setPrefs({ lastVersionSeen: '0.1.0' });
    const r = new AppStateStore(file, 0);
    expect(r.accounts().map((a) => [a.id, a.name, a.windowId])).toEqual([['a', 'a', MAIN_WINDOW_ID], ['b', 'Work', 'w2']]);
    expect(r.window('w2')?.bounds).toEqual({ x: 1, y: 2, width: 900, height: 600 });
    expect(r.mainWindowRecord()).toMatchObject({ activeAccountId: 'a', rightPaneAccountId: 'b', splitRatio: 0.62 });
    expect(r.prefs().lastVersionSeen).toBe('0.1.0');
  });

  it('accounts() is sorted by order; reorderAccounts accepts only permutations', () => {
    const s = new AppStateStore(tmpFile(), 0);
    s.addAccount(acc('a', 0));
    s.addAccount(acc('b', 1));
    s.addAccount(acc('c', 2));
    expect(s.reorderAccounts(['c', 'a', 'b'])).toBe(true);
    expect(s.accounts().map((a) => a.id)).toEqual(['c', 'a', 'b']);
    expect(s.reorderAccounts(['c', 'a'])).toBe(false);
    expect(s.reorderAccounts(['c', 'a', 'a'])).toBe(false);
  });

  it('removing an account clears window references to it', () => {
    const s = new AppStateStore(tmpFile(), 0);
    s.addAccount(acc('a'));
    s.addAccount(acc('b', 1));
    s.upsertWindow({ ...s.mainWindowRecord(), activeAccountId: 'a', rightPaneAccountId: 'b' });
    s.removeAccount('b');
    expect(s.accounts().map((a) => a.id)).toEqual(['a']);
    expect(s.mainWindowRecord().rightPaneAccountId).toBeNull();
    s.removeAccount('a');
    expect(s.mainWindowRecord().activeAccountId).toBeNull();
  });

  it('removeWindow sends its accounts back to the main window and refuses to remove main', () => {
    const s = new AppStateStore(tmpFile(), 0);
    s.addAccount({ ...acc('a'), windowId: 'w2' });
    s.upsertWindow({ id: 'w2', isMain: false, bounds: null, activeAccountId: 'a', splitRatio: 0.5, rightPaneAccountId: null });
    s.removeWindow('w2');
    expect(s.window('w2')).toBeUndefined();
    expect(s.account('a')?.windowId).toBe(MAIN_WINDOW_ID);
    s.removeWindow(MAIN_WINDOW_ID);
    expect(s.mainWindowRecord()).toBeDefined();
  });

  it('loads defensively: unknown windowIds fall back to main, dangling references are dropped, bad ratios reset', () => {
    const file = tmpFile();
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        accounts: [{ ...acc('a'), windowId: 'ghost' }, { id: 7 }, { ...acc('b', 1) }],
        windows: [{ id: MAIN_WINDOW_ID, isMain: true, bounds: null, activeAccountId: 'zzz', splitRatio: 5, rightPaneAccountId: 'a' }],
        prefs: { lastVersionSeen: 3 },
      }),
    );
    const s = new AppStateStore(file, 0);
    expect(s.accounts().map((a) => [a.id, a.windowId])).toEqual([['a', MAIN_WINDOW_ID], ['b', MAIN_WINDOW_ID]]);
    expect(s.mainWindowRecord()).toMatchObject({ activeAccountId: null, splitRatio: 0.5, rightPaneAccountId: 'a' });
    expect(s.prefs().lastVersionSeen).toBe('');
  });

  it('recovers from a corrupt file and keeps a copy', () => {
    const file = tmpFile();
    writeFileSync(file, '{oops');
    const s = new AppStateStore(file, 0);
    expect(s.accounts()).toEqual([]);
    expect(readdirSync(join(file, '..')).some((f) => f.includes('corrupt'))).toBe(true);
  });

  it('a failed save is logged and retried later instead of throwing', () => {
    vi.useFakeTimers();
    try {
      const root = mkdtempSync(join(tmpdir(), 'mwa-state-'));
      const blocker = join(root, 'blocked');
      writeFileSync(blocker, 'not a directory');
      const file = join(blocker, 'state.json');
      const logs: string[] = [];
      const s = new AppStateStore(file, 10, (l) => logs.push(l), 1_000);
      s.addAccount(acc('a'));
      expect(() => vi.advanceTimersByTime(10)).not.toThrow();
      expect(logs).toHaveLength(1);
      vi.advanceTimersByTime(500);
      expect(logs).toHaveLength(1);
      rmSync(blocker);
      vi.advanceTimersByTime(500);
      expect(existsSync(file)).toBe(true);
      expect(() => s.flush()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pending partition removals', () => {
  it('are persisted in prefs so a failed delete is retried at the next launch', () => {
    const file = tmpFile();
    const s = new AppStateStore(file, 0);
    s.setPrefs({ pendingPartitionRemovals: ['wa-a', 'wa-b'] });
    const r = new AppStateStore(file, 0);
    expect(r.prefs().pendingPartitionRemovals).toEqual(['wa-a', 'wa-b']);
    expect(new AppStateStore(tmpFile(), 0).prefs().pendingPartitionRemovals).toEqual([]);
  });
  it('ignores junk entries when loading', () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, accounts: [], windows: [], prefs: { lastVersionSeen: '', pendingPartitionRemovals: ['wa-x', 7, '../etc'] } }));
    expect(new AppStateStore(file, 0).prefs().pendingPartitionRemovals).toEqual(['wa-x']);
  });
});
