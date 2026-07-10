import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBffReady } from './check-bff-readiness';

const BFF_URL = 'http://bff-test:3002/v1';

describe('isBffReady', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let timeoutSpy: ReturnType<typeof vi.spyOn>;
  let previousBffUrl: string | undefined;

  beforeEach(() => {
    previousBffUrl = process.env.NEXT_PUBLIC_BFF_URL;
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    timeoutSpy.mockRestore();
    if (previousBffUrl === undefined) delete process.env.NEXT_PUBLIC_BFF_URL;
    else process.env.NEXT_PUBLIC_BFF_URL = previousBffUrl;
  });

  it('returns true when the BFF responds ok', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(isBffReady()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/health/ready`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(timeoutSpy).toHaveBeenCalledWith(2000);
  });

  it('returns false when the BFF responds with a non-2xx status', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 503 }));

    await expect(isBffReady()).resolves.toBe(false);
  });

  it('returns false when the fetch throws (network error or timeout)', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));

    await expect(isBffReady()).resolves.toBe(false);
  });
});
