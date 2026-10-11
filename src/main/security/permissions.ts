import { isWhatsAppAppUrl, isWhatsAppOrigin } from './origins';

/**
 * Pure permission policy for an account session. Everything not explicitly allowed is denied.
 * Allowed, for the WhatsApp main frame only: media (microphone and camera: voice notes, calls),
 * notifications, clipboard read / sanitized write, fullscreen.
 */
const ALLOWED_SIMPLE = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);

export interface PermissionRequestInput {
  permission: string;
  /** Origin/URL of the frame making the request. */
  requestingUrl: string;
  /** Top-level URL of the webContents, when known. */
  topLevelUrl?: string;
  /** Media types for "media" requests (Electron: details.mediaTypes). */
  mediaTypes?: readonly string[];
  /** Electron: details.isMainFrame. Requests from subframes are denied. */
  isMainFrame?: boolean;
}

export type PermissionDecision = { allow: true; reason: string } | { allow: false; reason: string };

export function decidePermissionRequest(input: PermissionRequestInput): PermissionDecision {
  const fromWhatsApp = isWhatsAppAppUrl(input.requestingUrl) || isWhatsAppOrigin(input.requestingUrl);
  const topIsWhatsApp = input.topLevelUrl === undefined || isWhatsAppAppUrl(input.topLevelUrl);
  if (!fromWhatsApp || !topIsWhatsApp) return { allow: false, reason: `${input.permission}: origin not approved` };
  if (input.isMainFrame === false) return { allow: false, reason: `${input.permission}: subframe request` };

  if (input.permission === 'media') {
    const types = input.mediaTypes ?? [];
    if (types.length === 0) return { allow: false, reason: 'media: unspecified media type' };
    if (!types.every((t) => t === 'audio' || t === 'video')) return { allow: false, reason: 'media: unknown media type' };
    return { allow: true, reason: `media: ${types.join('+')} for WhatsApp` };
  }
  if (ALLOWED_SIMPLE.has(input.permission)) return { allow: true, reason: `${input.permission}: WhatsApp` };
  return { allow: false, reason: `${input.permission}: not allowlisted` };
}

export interface PermissionCheckInput {
  permission: string;
  requestingOrigin: string;
  mediaType?: string;
}

/** Synchronous permission *checks* (Notification.permission, navigator.permissions.query, device labels). */
export function decidePermissionCheck(input: PermissionCheckInput): boolean {
  if (!isWhatsAppOrigin(input.requestingOrigin) && !isWhatsAppAppUrl(input.requestingOrigin)) return false;
  if (input.permission === 'media') return input.mediaType === 'audio' || input.mediaType === 'video';
  return ALLOWED_SIMPLE.has(input.permission);
}
