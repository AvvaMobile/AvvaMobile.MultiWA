import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { showItemInFolder: vi.fn() } }));
import { shell } from 'electron';
import { DownloadManager, type DownloadEvent } from '../DownloadManager';

class FakeItem extends EventEmitter {
  savePath = '';
  constructor(private name: string) { super(); }
  getFilename() { return this.name; }
  setSavePath(p: string) { this.savePath = p; }
  getSavePath() { return this.savePath; }
}

function setup() {
  const ses = new EventEmitter();
  const events: DownloadEvent[] = [];
  const existing = new Set<string>();
  const dm = new DownloadManager({ downloadsDir: () => '/dl', exists: (p) => existing.has(p), onEvent: (e) => events.push(e), newId: () => 'id-1' });
  dm.attach(ses as never, 'acc');
  return { ses, events, existing, dm };
}

describe('DownloadManager', () => {
  it('saves into Downloads without a dialog and reports completion', () => {
    const { ses, events, dm } = setup();
    const item = new FakeItem('photo.jpg');
    ses.emit('will-download', {}, item, {});
    expect(item.savePath).toBe('/dl/photo.jpg');
    item.emit('done', {}, 'completed');
    expect(events).toEqual([{ kind: 'done', id: 'id-1', accountId: 'acc', filename: 'photo.jpg', path: '/dl/photo.jpg' }]);
    dm.reveal('id-1');
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/dl/photo.jpg');
  });
  it('picks a free name and reports failures', () => {
    const { ses, events, existing } = setup();
    existing.add('/dl/photo.jpg');
    const item = new FakeItem('../photo.jpg');
    ses.emit('will-download', {}, item, {});
    expect(item.savePath).toBe('/dl/photo (2).jpg');
    item.emit('done', {}, 'interrupted');
    expect(events[0]).toMatchObject({ kind: 'failed', filename: 'photo (2).jpg', state: 'interrupted' });
  });
  it('ignores reveal of unknown ids', () => {
    const { dm } = setup();
    vi.mocked(shell.showItemInFolder).mockClear();
    dm.reveal('nope');
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });
});
