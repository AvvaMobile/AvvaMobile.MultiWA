/** One WhatsApp account = one tab = one session partition (`persist:wa-<id>`). */
export interface AccountRecord {
  id: string;
  name: string;
  /** `#rrggbb` from ACCOUNT_COLORS; kept for life. */
  color: string;
  /** Global tab order across all windows. */
  order: number;
  /** The shell window that shows this tab (WindowRecord.id). */
  windowId: string;
  createdAt: string;
}

/** Tab colors on the light tab strip; an account keeps its color for life. */
export const ACCOUNT_COLORS: readonly string[] = ['#25d366', '#1971c2', '#e8590c', '#9c36b5', '#c2255c', '#0c8599', '#f08c00', '#5f3dc4', '#2b8a3e', '#d6336c'];

/** First palette color nobody uses; when all are taken, cycles by how many accounts exist. */
export function colorForNew(taken: readonly string[]): string {
  const free = ACCOUNT_COLORS.find((c) => !taken.includes(c));
  return free ?? ACCOUNT_COLORS[taken.length % ACCOUNT_COLORS.length]!;
}

export const MAX_ACCOUNT_NAME = 40;

export function validateAccountName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.replace(/\p{Cc}/gu, '').trim().replace(/\s+/g, ' ');
  return n.length >= 1 && n.length <= MAX_ACCOUNT_NAME ? n : null;
}

/** "Account N": N is one more than the highest existing "Account <n>" name, at least existing.length + 1. */
export function nextAccountName(existing: readonly string[]): string {
  let max = existing.length;
  for (const name of existing) {
    const m = /^Account (\d{1,6})$/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Account ${max + 1}`;
}
