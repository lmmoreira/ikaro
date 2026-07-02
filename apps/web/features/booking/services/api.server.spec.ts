import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStaffService, fetchStaffServices, ServiceDetailFetchError } from './api';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

vi.mock('@/shared/lib/api/bff-server', () => ({
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

describe('fetchStaffService', () => {
  it('calls GET /services/:id with the auth token and returns the service', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ serviceId: 'svc-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchStaffService('token-123', 'svc-1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/services/svc-1');
    expect(result.serviceId).toBe('svc-1');
  });

  it('throws ServiceDetailFetchError on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(null, {
        status: 404,
      }),
    );

    await expect(fetchStaffService('token-123', 'svc-1')).rejects.toMatchObject(
      new ServiceDetailFetchError(404, 'Service not found'),
    );
  });
});
