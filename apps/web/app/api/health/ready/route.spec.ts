import { afterEach, describe, expect, it, vi } from 'vitest';

const mockIsBffLive = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/health/check-bff-liveness', () => ({
  isBffLive: mockIsBffLive,
}));

import { GET } from './route';

describe('GET /api/health/ready', () => {
  afterEach(() => {
    mockIsBffLive.mockReset();
  });

  it('returns 200 when the BFF is live', async () => {
    mockIsBffLive.mockResolvedValue(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns 503 when the BFF is not live', async () => {
    mockIsBffLive.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'error' });
  });
});
