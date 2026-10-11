/** Largest count shown anywhere (tab badge, Dock badge); WhatsApp itself never gets near this. */
export const MAX_UNREAD = 9999;

/**
 * WhatsApp Web puts the unread total at the start of the document title: "(3) WhatsApp".
 * Nothing else about the page is read. Unparseable titles mean 0 (no badge), never an error.
 */
export function parseUnreadFromTitle(title: string): number {
  const m = /^[\s‎‏‪-‮]*\((\d{1,20})\)/.exec(title);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_UNREAD, Math.floor(n));
}
