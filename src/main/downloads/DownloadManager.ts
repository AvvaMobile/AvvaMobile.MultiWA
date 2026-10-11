import { shell, type DownloadItem, type Session } from 'electron';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { uniquePath } from './downloadTarget';

export type DownloadEvent =
  | { kind: 'done'; id: string; accountId: string; filename: string; path: string }
  | { kind: 'failed'; id: string; accountId: string; filename: string; state: string };

export interface DownloadManagerDeps {
  downloadsDir: () => string;
  exists?: (path: string) => boolean;
  onEvent: (e: DownloadEvent) => void;
  newId?: () => string;
}

/**
 * Every download of every account session lands in the user's Downloads folder under a free name, with no dialog.
 * Finished downloads are remembered by id so a toast can reveal them later; the renderer never sees a path.
 */
export class DownloadManager {
  private readonly paths = new Map<string, string>();
  private readonly attached = new WeakSet<Session>();

  constructor(private readonly deps: DownloadManagerDeps) {}

  attach(ses: Session, accountId: string): void {
    if (this.attached.has(ses)) return;
    this.attached.add(ses);
    ses.on('will-download', (_event, item: DownloadItem) => {
      const id = (this.deps.newId ?? randomUUID)();
      const target = uniquePath(this.deps.downloadsDir(), item.getFilename(), this.deps.exists ?? existsSync);
      item.setSavePath(target);
      const filename = basename(target);
      item.once('done', (_e, state) => {
        if (state === 'completed') {
          this.paths.set(id, target);
          this.deps.onEvent({ kind: 'done', id, accountId, filename, path: target });
        } else this.deps.onEvent({ kind: 'failed', id, accountId, filename, state });
      });
    });
  }

  pathOf(id: string): string | undefined {
    return this.paths.get(id);
  }

  reveal(id: string): void {
    const p = this.paths.get(id);
    if (p) shell.showItemInFolder(p);
  }
}
