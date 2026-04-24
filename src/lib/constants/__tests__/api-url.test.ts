import {
  extractHostFromUri,
  normalizeBaseUrl,
  resolveApiUrl,
} from '@/lib/constants/api-url';

describe('api url helpers', () => {
  it('extracts the LAN host from Expo host URIs', () => {
    expect(extractHostFromUri('192.168.1.55:8081')).toBe('192.168.1.55');
    expect(extractHostFromUri('exp://192.168.1.55:8081')).toBe('192.168.1.55');
  });

  it('normalizes explicit backend URLs', () => {
    expect(normalizeBaseUrl('http://192.168.1.20:8021/')).toBe('http://192.168.1.20:8021');
    expect(normalizeBaseUrl('192.168.1.20:8021')).toBe('http://192.168.1.20:8021');
  });

  it('prefers an explicit backend url when provided', () => {
    expect(
      resolveApiUrl({
        explicitApiUrl: '192.168.1.20:8021',
        hostUri: '192.168.1.55:8081',
        platform: 'android',
      }),
    ).toBe('http://192.168.1.20:8021');
  });

  it('derives the backend host from the Expo dev host when no explicit url is set', () => {
    expect(
      resolveApiUrl({
        explicitApiUrl: null,
        hostUri: '192.168.1.55:8081',
        platform: 'android',
      }),
    ).toBe('http://192.168.1.55:8021');
  });

  it('falls back to the Android emulator loopback only when needed', () => {
    expect(
      resolveApiUrl({
        explicitApiUrl: null,
        hostUri: null,
        platform: 'android',
      }),
    ).toBe('http://10.0.2.2:8021');
  });
});
