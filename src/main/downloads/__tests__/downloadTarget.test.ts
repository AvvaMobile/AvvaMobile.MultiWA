import { describe, expect, it } from 'vitest';
import { sanitizeFilename, uniquePath } from '../downloadTarget';

describe('sanitizeFilename', () => {
  it('keeps ordinary names', () => {
    expect(sanitizeFilename('IMG-2026-10-11-WA0001.jpg')).toBe('IMG-2026-10-11-WA0001.jpg');
    expect(sanitizeFilename('Rapor final (2).pdf')).toBe('Rapor final (2).pdf');
  });
  it('removes path separators and traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\win.ini')).toBe('win.ini');
    expect(sanitizeFilename('a/b/c.txt')).toBe('c.txt');
    expect(sanitizeFilename('..')).toBe('download');
    expect(sanitizeFilename('')).toBe('download');
    expect(sanitizeFilename('.hidden')).toBe('hidden');
  });
  it('strips control and reserved characters, trailing dots/spaces', () => {
    expect(sanitizeFilename('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
    expect(sanitizeFilename('bad\u0000name\u001f.png')).toBe('badname.png');
    expect(sanitizeFilename('name. . ')).toBe('name');
  });
  it('avoids Windows reserved device names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('aux.txt')).toBe('_aux.txt');
    expect(sanitizeFilename('COM1')).toBe('_COM1');
  });
  it('caps length but keeps the extension', () => {
    const long = `${'x'.repeat(300)}.jpeg`;
    const s = sanitizeFilename(long);
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith('.jpeg')).toBe(true);
  });
});

describe('uniquePath', () => {
  it('returns dir/name when free', () => {
    expect(uniquePath('/d', 'a.txt', () => false)).toBe('/d/a.txt');
  });
  it('adds " (n)" before the extension until free', () => {
    const taken = new Set(['/d/a.txt', '/d/a (2).txt']);
    expect(uniquePath('/d', 'a.txt', (p) => taken.has(p))).toBe('/d/a (3).txt');
    expect(uniquePath('/d', 'noext', (p) => p === '/d/noext')).toBe('/d/noext (2)');
    expect(uniquePath('/d', '.tar.gz', (p) => p === '/d/tar.gz')).toBe('/d/tar (2).gz');
  });
  it('never escapes the directory', () => {
    expect(uniquePath('/d', '../x.txt', () => false)).toBe('/d/x.txt');
  });
});
