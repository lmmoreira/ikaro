import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStaffServices } from './services';
import { bffServerFetch } from '../bff-server';

vi.mock('../bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

describe('fetchStaffServices', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /services with the auth token and returns the list', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [{ serviceId: 'svc-1' }], total: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchStaffServices('token-123');

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/services',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
