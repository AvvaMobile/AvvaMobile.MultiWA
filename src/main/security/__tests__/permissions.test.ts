import { describe, expect, it } from 'vitest';
import { decidePermissionCheck, decidePermissionRequest } from '../permissions';

const req = (over: Partial<Parameters<typeof decidePermissionRequest>[0]> = {}) =>
  decidePermissionRequest({ permission: 'media', requestingUrl: 'https://web.whatsapp.com/', topLevelUrl: 'https://web.whatsapp.com/', mediaTypes: ['audio'], isMainFrame: true, ...over });

describe('permission request policy', () => {
  it('grants audio, video and both to the WhatsApp main frame', () => {
    expect(req().allow).toBe(true);
    expect(req({ mediaTypes: ['video'] }).allow).toBe(true);
    expect(req({ mediaTypes: ['audio', 'video'] }).allow).toBe(true);
  });
  it('denies media without a type, from subframes or other origins', () => {
    expect(req({ mediaTypes: [] }).allow).toBe(false);
    expect(req({ mediaTypes: undefined }).allow).toBe(false);
    expect(req({ isMainFrame: false }).allow).toBe(false);
    expect(req({ requestingUrl: 'https://evil.com/' }).allow).toBe(false);
    expect(req({ topLevelUrl: 'https://evil.com/' }).allow).toBe(false);
    expect(req({ requestingUrl: 'http://web.whatsapp.com/' }).allow).toBe(false);
  });
  it('grants notifications, clipboard and fullscreen to WhatsApp only', () => {
    for (const p of ['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']) {
      expect(decidePermissionRequest({ permission: p, requestingUrl: 'https://web.whatsapp.com/', topLevelUrl: 'https://web.whatsapp.com/' }).allow).toBe(true);
      expect(decidePermissionRequest({ permission: p, requestingUrl: 'https://evil.com/', topLevelUrl: 'https://web.whatsapp.com/' }).allow).toBe(false);
    }
  });
  it('denies everything not allowlisted', () => {
    for (const p of ['geolocation', 'midi', 'pointerLock', 'openExternal', 'display-capture', 'hid', 'serial', 'usb', 'unknown', 'idle-detection'])
      expect(decidePermissionRequest({ permission: p, requestingUrl: 'https://web.whatsapp.com/', topLevelUrl: 'https://web.whatsapp.com/' }).allow).toBe(false);
  });
});

describe('permission check policy', () => {
  it('reports granted only to WhatsApp and only for the allowlist', () => {
    expect(decidePermissionCheck({ permission: 'notifications', requestingOrigin: 'https://web.whatsapp.com' })).toBe(true);
    expect(decidePermissionCheck({ permission: 'media', requestingOrigin: 'https://web.whatsapp.com', mediaType: 'audio' })).toBe(true);
    expect(decidePermissionCheck({ permission: 'media', requestingOrigin: 'https://web.whatsapp.com', mediaType: 'video' })).toBe(true);
    expect(decidePermissionCheck({ permission: 'media', requestingOrigin: 'https://web.whatsapp.com', mediaType: 'unknown' })).toBe(false);
    expect(decidePermissionCheck({ permission: 'notifications', requestingOrigin: 'https://evil.com' })).toBe(false);
    expect(decidePermissionCheck({ permission: 'geolocation', requestingOrigin: 'https://web.whatsapp.com' })).toBe(false);
  });
});
