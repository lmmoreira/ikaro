import { describe, expect, it, vi } from 'vitest';
import { loadServiceDetailRouteData } from './service-route.server';
import {
  fetchServiceIntakeSchema,
  fetchStaffService,
  ServiceDetailFetchError,
  ServiceIntakeSchemaFetchError,
} from '@/features/booking/api/services.server';

vi.mock('@/features/booking/api/services.server', () => ({
  fetchStaffService: vi.fn(),
  fetchServiceIntakeSchema: vi.fn(),
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
  ServiceIntakeSchemaFetchError: class ServiceIntakeSchemaFetchError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = 'ServiceIntakeSchemaFetchError';
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
  it('returns the loaded service and intake schema', async () => {
    vi.mocked(fetchStaffService).mockResolvedValue({ serviceId: 'svc-1' } as never);
    vi.mocked(fetchServiceIntakeSchema).mockResolvedValue({ active: null, history: [] } as never);

    await expect(loadServiceDetailRouteData('token-123', 'svc-1')).resolves.toEqual({
      service: { serviceId: 'svc-1' },
      intakeSchema: { active: null, history: [] },
    });
  });

  it('calls notFound on a 404 from the service fetch', async () => {
    vi.mocked(fetchStaffService).mockRejectedValue(new ServiceDetailFetchError(404, 'missing'));
    vi.mocked(fetchServiceIntakeSchema).mockResolvedValue({ active: null, history: [] } as never);

    await expect(loadServiceDetailRouteData('token-404', 'svc-404')).rejects.toThrow('notFound');
  });

  it('calls notFound on a 404 from the intake-schema fetch', async () => {
    vi.mocked(fetchStaffService).mockResolvedValue({ serviceId: 'svc-1' } as never);
    vi.mocked(fetchServiceIntakeSchema).mockRejectedValue(
      new ServiceIntakeSchemaFetchError(404, 'missing'),
    );

    await expect(loadServiceDetailRouteData('token-404', 'svc-404')).rejects.toThrow('notFound');
  });
});
