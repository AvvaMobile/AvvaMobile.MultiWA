import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Architectural boundaries (spec §5):
 * - domain code is Electron-free and imports nothing from main/renderer;
 * - remote-content-side modules (security, accounts, downloads) never import renderer code and never push to a renderer;
 * - the renderer never imports main-process code;
 * - the preload exposes no generic IPC channel access.
 */
const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const offenders = (list: string[], patterns: RegExp[]) =>
  list.flatMap((f) => {
    const text = readFileSync(f, 'utf8');
    return patterns.filter((re) => re.test(text)).map((re) => `${relative(SRC, f)} ~ ${re}`);
  });

describe('isolation boundaries', () => {
  it('domain modules import neither electron nor main/renderer code', () => {
    const domain = files(join(SRC, 'domain'));
    expect(domain.length).toBeGreaterThan(3);
    expect(offenders(domain, [/from ['"]electron['"]/, /from ['"][^'"]*\/main\//, /from ['"][^'"]*\/renderer\//])).toEqual([]);
  });
  it('remote-content-side modules never import renderer code or push to a renderer', () => {
    const remoteSide = ['main/security', 'main/accounts', 'main/downloads', 'main/diagnostics'].flatMap((d) => files(join(SRC, d)));
    expect(remoteSide.length).toBeGreaterThan(5);
    expect(offenders(remoteSide, [/from ['"][^'"]*\/renderer\//, /webContents\.send\(/, /ipcMain/])).toEqual([]);
  });
  it('the renderer never imports main-process code or electron', () => {
    const renderer = files(join(SRC, 'renderer'));
    expect(offenders(renderer, [/from ['"][^'"]*\/main\//, /from ['"]electron['"]/])).toEqual([]);
  });
  it('the preload exposes fixed channels only', () => {
    const preload = readFileSync(join(SRC, 'preload/shell.ts'), 'utf8');
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer\b/);
    expect(preload).not.toMatch(/invoke\(\s*[a-z]\w*\s*[,)]/i); // every invoke names a literal channel
    expect(preload).not.toMatch(/diag|log/i);
  });
  it('account views get no preload', () => {
    const remote = readFileSync(join(SRC, 'main/security/remoteContent.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // code only, not comments
    expect(remote).not.toMatch(/preload/);
  });
});
