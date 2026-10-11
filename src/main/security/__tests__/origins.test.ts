import { describe, expect, it } from 'vitest';
import { isAllowedTopLevelUrl, isSafeExternalUrl, isWhatsAppAppUrl, isWhatsAppOrigin, partitionFor, WHATSAPP_HOME_URL } from '../origins';

describe('WhatsApp origin policy', () => {
  it('names the partition per account', () => {
    expect(partitionFor('3f2a')).toBe('persist:wa-3f2a');
  });
  it('accepts only https://web.whatsapp.com as the app', () => {
    expect(isWhatsAppAppUrl(WHATSAPP_HOME_URL)).toBe(true);
    expect(isWhatsAppAppUrl('https://web.whatsapp.com/accept?code=x')).toBe(true);
    expect(isWhatsAppAppUrl('http://web.whatsapp.com/')).toBe(false);
    expect(isWhatsAppAppUrl('https://web.whatsapp.com.evil.com/')).toBe(false);
    expect(isWhatsAppAppUrl('https://whatsapp.com@evil.com/')).toBe(false);
    expect(isWhatsAppAppUrl('https://web.whatsapp.com:8443/')).toBe(false);
    expect(isWhatsAppAppUrl('https://user:pw@web.whatsapp.com/')).toBe(false);
    expect(isWhatsAppAppUrl('javascript:alert(1)')).toBe(false);
    expect(isWhatsAppAppUrl('not a url')).toBe(false);
  });
  it('matches permission-handler origins', () => {
    expect(isWhatsAppOrigin('https://web.whatsapp.com')).toBe(true);
    expect(isWhatsAppOrigin('https://web.whatsapp.com/')).toBe(true);
    expect(isWhatsAppOrigin('https://static.whatsapp.net')).toBe(false);
    expect(isWhatsAppOrigin('file://')).toBe(false);
  });
  it('allows top-level navigation only within whatsapp.com / whatsapp.net over https', () => {
    for (const u of ['https://web.whatsapp.com/', 'https://www.whatsapp.com/download', 'https://static.whatsapp.net/x.js', 'https://faq.whatsapp.com/1'])
      expect(isAllowedTopLevelUrl(u)).toBe(true);
    for (const u of ['https://web.whatsapp.com.evil.com/', 'http://web.whatsapp.com/', 'https://whatsapp.com@evil.com/', 'https://example.com/', 'file:///etc/passwd', 'https://evil-whatsapp.com/'])
      expect(isAllowedTopLevelUrl(u)).toBe(false);
  });
  it('only hands http(s) links to the OS browser', () => {
    expect(isSafeExternalUrl('https://example.com/a')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/a')).toBe(true);
    expect(isSafeExternalUrl('file:///Applications/Calculator.app')).toBe(false);
    expect(isSafeExternalUrl('smb://host/share')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('https://user:pw@example.com/')).toBe(false);
  });
});
