import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBffLive } from './check-bff-liveness';

const BFF_URL = 'http://bff-test:3002';

describe('isBffLive', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns true when the BFF responds ok', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(isBffLive()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/health/live`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns false when the BFF responds with a non-2xx status', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 503 }));

    await expect(isBffLive()).resolves.toBe(false);
  });

  it('returns false when the fetch throws (network error or timeout)', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));

    await expect(isBffLive()).resolves.toBe(false);
  });
});
