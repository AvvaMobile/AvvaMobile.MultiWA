import { basename, extname, join } from 'node:path';

const MAX_NAME = 120;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * A safe basename for a file WhatsApp wants to download: no directories, no control or reserved characters,
 * no Windows device names, no leading dots, bounded length. Empty input becomes "download".
 */
export function sanitizeFilename(name: string): string {
  // Take the last path segment of either separator style, then clean it.
  let base = name.split(/[\\/]+/).filter(Boolean).pop() ?? '';
  base = base.replace(/\p{Cc}/gu, '').replace(/[<>:"|?*]/g, '_');
  base = base.replace(/^\.+/, '').replace(/[. ]+$/g, '');
  if (!base) return 'download';
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`;
  if (base.length > MAX_NAME) {
    const ext = extname(base).slice(0, 16);
    base = `${base.slice(0, MAX_NAME - ext.length)}${ext}`;
  }
  return base;
}

/** `dir/<name>`; when taken, `dir/<stem> (2)<ext>`, `(3)`, … Never outside `dir`. */
export function uniquePath(dir: string, filename: string, exists: (path: string) => boolean): string {
  const safe = sanitizeFilename(filename);
  const ext = extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  let candidate = join(dir, safe);
  for (let n = 2; exists(candidate); n++) candidate = join(dir, `${stem} (${n})${ext}`);
  // Defensive: the sanitized name has no separators, so basename(candidate) is the file itself.
  return join(dir, basename(candidate));
}
