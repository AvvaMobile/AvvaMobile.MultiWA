import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDiagnosticsLog, diagConsoleEnabled } from '../diagnosticsLog';

describe('diagnosticsLog', () => {
  it('appends timestamped lines to the file and creates the folder', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mwa-diag-')), 'logs', 'events.log');
    const diag = createDiagnosticsLog(file, { console: false });
    diag('hello');
    expect(diag.file).toBe(file);
    expect(readFileSync(file, 'utf8')).toMatch(/^\d{4}-\d{2}-\d{2}T[^ ]+ hello\n$/);
  });
  it('console mirroring is opt-in via MULTIWA_DIAG_CONSOLE=1', () => {
    expect(diagConsoleEnabled({})).toBe(false);
    expect(diagConsoleEnabled({ MULTIWA_DIAG_CONSOLE: '1' })).toBe(true);
  });
});
