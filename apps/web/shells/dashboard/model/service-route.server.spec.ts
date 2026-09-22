import { describe, expect, it, vi } from 'vitest';
import { loadServiceDetailRouteData, loadServiceEditRouteData } from './service-route.server';
import {
  fetchStaffService,
  fetchStaffServiceEditView,
  ServiceDetailFetchError,
  ServiceEditViewFetchError,
} from '@/features/booking/api/services.server';

vi.mock('@/features/booking/api/services.server', () => ({
  fetchStaffService: vi.fn(),
  fetchStaffServiceEditView: vi.fn(),
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
  ServiceEditViewFetchError: class ServiceEditViewFetchError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = 'ServiceEditViewFetchError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  },
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

describe('loadServiceEditRouteData', () => {
  it('returns the composite service + intake schema from a single BFF call', async () => {
    vi.mocked(fetchStaffServiceEditView).mockResolvedValue({
      service: { serviceId: 'svc-1' },
      intakeSchema: { active: null, history: [] },
    } as never);

    await expect(loadServiceEditRouteData('token-123', 'svc-1')).resolves.toEqual({
      service: { serviceId: 'svc-1' },
      intakeSchema: { active: null, history: [] },
    });
    expect(fetchStaffServiceEditView).toHaveBeenCalledTimes(1);
  });

  it('calls notFound on a 404', async () => {
    vi.mocked(fetchStaffServiceEditView).mockRejectedValue(
      new ServiceEditViewFetchError(404, 'missing'),
    );

    await expect(loadServiceEditRouteData('token-404', 'svc-404')).rejects.toThrow('notFound');
  });

  it('rethrows any other error', async () => {
    vi.mocked(fetchStaffServiceEditView).mockRejectedValue(
      new ServiceEditViewFetchError(500, 'boom'),
    );

    await expect(loadServiceEditRouteData('token-500', 'svc-500')).rejects.toThrow('boom');
  });
});

describe('loadServiceDetailRouteData', () => {
  it('loads only the service — no intake-schema fetch for the layout/deactivate routes', async () => {
    vi.mocked(fetchStaffServiceEditView).mockClear();
    vi.mocked(fetchStaffService).mockResolvedValue({ serviceId: 'svc-1' } as never);

    await expect(loadServiceDetailRouteData('token-a', 'svc-1')).resolves.toEqual({
      service: { serviceId: 'svc-1' },
    });
    expect(fetchStaffServiceEditView).not.toHaveBeenCalled();
  });

  it('calls notFound on a 404', async () => {
    vi.mocked(fetchStaffService).mockRejectedValue(new ServiceDetailFetchError(404, 'missing'));

    await expect(loadServiceDetailRouteData('token-b', 'svc-404')).rejects.toThrow('notFound');
  });

  it('rethrows any other error', async () => {
    vi.mocked(fetchStaffService).mockRejectedValue(new ServiceDetailFetchError(500, 'boom'));

    await expect(loadServiceDetailRouteData('token-c', 'svc-500')).rejects.toThrow('boom');
  });
});
