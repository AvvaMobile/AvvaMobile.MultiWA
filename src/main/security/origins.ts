/**
 * Single source of truth for every remote origin MultiWA trusts. Any change here must be reflected in origins.test.ts.
 */

export const WHATSAPP_APP_HOST = 'web.whatsapp.com';
export const WHATSAPP_HOME_URL = 'https://web.whatsapp.com/';
export const WHATSAPP_ORIGIN = 'https://web.whatsapp.com';

/** Registrable domains whose https hosts the account view may navigate to at top level. */
const ALLOWED_DOMAINS: readonly string[] = ['whatsapp.com', 'whatsapp.net'];

/** Chromium session partition of one account (its cookies, IndexedDB, cache, service workers). */
export function partitionFor(accountId: string): string {
  return `persist:wa-${accountId}`;
}

function parseHttps(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  // Credentials in URLs and non-default ports are never part of legitimate flows.
  if (url.username || url.password || url.port) return null;
  return url;
}

const hostInDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** True for https://web.whatsapp.com/... (exact host, default port). */
export function isWhatsAppAppUrl(raw: string): boolean {
  const url = parseHttps(raw);
  return url !== null && url.hostname.toLowerCase() === WHATSAPP_APP_HOST;
}

/** Origin string form ("https://web.whatsapp.com"), as delivered by permission handlers. */
export function isWhatsAppOrigin(origin: string): boolean {
  const url = parseHttps(origin);
  return url !== null && url.origin === origin.replace(/\/$/, '') && url.hostname.toLowerCase() === WHATSAPP_APP_HOST;
}

/** Top-level navigation allowlist for an account view. */
export function isAllowedTopLevelUrl(raw: string): boolean {
  const url = parseHttps(raw);
  if (url === null) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => hostInDomain(host, d));
}

/** Only plain web links may be handed to the OS browser. */
export function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
}
