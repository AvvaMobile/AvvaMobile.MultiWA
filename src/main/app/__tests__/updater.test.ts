import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { UpdateService, type UpdaterLike } from '../updater';

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(() => Promise.resolve());
  quitAndInstall = vi.fn();
}

const setup = (enabled = true) => {
  const updater = new FakeUpdater();
  const showMessage = vi.fn(() => Promise.resolve(0));
  const log = vi.fn();
  const svc = new UpdateService({ updater, enabled, currentVersion: '0.1.0', showMessage, log });
  return { updater, showMessage, log, svc };
};

describe('UpdateService', () => {
  it('configures background download and install-on-quit', () => {
    const { updater } = setup();
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });
  it('a manual check in a development run explains instead of checking', async () => {
    const { svc, updater, showMessage } = setup(false);
    await svc.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledTimes(1);
  });
  it('background checks stay silent about "up to date" and errors; manual ones report', async () => {
    const { svc, updater, showMessage } = setup();
    await svc.check(false);
    updater.emit('update-not-available');
    updater.emit('error', new Error('offline'));
    expect(showMessage).not.toHaveBeenCalled();
    await svc.check(true);
    updater.emit('update-not-available');
    expect(showMessage).toHaveBeenCalledTimes(1);
  });
  it('asks once per downloaded version and restarts on confirmation', async () => {
    const { svc, updater, showMessage } = setup();
    void svc;
    updater.emit('update-downloaded', { version: '0.2.0' });
    updater.emit('update-downloaded', { version: '0.2.0' });
    await Promise.resolve();
    await Promise.resolve();
    expect(showMessage).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
