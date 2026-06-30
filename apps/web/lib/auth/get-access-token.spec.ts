import { describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => Promise.resolve({ get: mockCookieGet })),
}));

import { getAccessToken } from './get-access-token';

describe('getAccessToken', () => {
  it('returns the access_token cookie value when present', async () => {
    mockCookieGet.mockReturnValue({ value: 'my-token' });
    await expect(getAccessToken()).resolves.toBe('my-token');
    expect(mockCookieGet).toHaveBeenCalledWith('access_token');
  });

  it('returns empty string when cookie is absent', async () => {
    mockCookieGet.mockReturnValue(undefined);
    await expect(getAccessToken()).resolves.toBe('');
  });
});
