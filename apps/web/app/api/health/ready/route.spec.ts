import { afterEach, describe, expect, it, vi } from 'vitest';

const mockIsBffReady = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/health/check-bff-readiness', () => ({
  isBffReady: mockIsBffReady,
}));

import { GET } from './route';

describe('GET /api/health/ready', () => {
  afterEach(() => {
    mockIsBffReady.mockReset();
  });

  it('returns 200 when the BFF is ready', async () => {
    mockIsBffReady.mockResolvedValue(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns 503 when the BFF is not ready', async () => {
    mockIsBffReady.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'error' });
  });
});
