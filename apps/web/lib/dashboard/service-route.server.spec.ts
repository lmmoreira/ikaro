import { describe, expect, it, vi } from 'vitest';
import { loadServiceDetailRouteData } from './service-route.server';
import { fetchStaffService, ServiceDetailFetchError } from '@/lib/api/dashboard/services';

vi.mock('@/lib/api/dashboard/services', () => ({
  fetchStaffService: vi.fn(),
  ServiceDetailFetchError: class ServiceDetailFetchError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = 'ServiceDetailFetchError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  },
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

describe('loadServiceDetailRouteData', () => {
  it('returns the loaded service', async () => {
    vi.mocked(fetchStaffService).mockResolvedValue({ serviceId: 'svc-1' } as never);

    await expect(loadServiceDetailRouteData('token-123', 'svc-1')).resolves.toEqual({
      service: { serviceId: 'svc-1' },
    });
  });

  it('calls notFound on 404', async () => {
    vi.mocked(fetchStaffService).mockRejectedValue(new ServiceDetailFetchError(404, 'missing'));

    await expect(loadServiceDetailRouteData('token-404', 'svc-404')).rejects.toThrow('notFound');
  });
});
