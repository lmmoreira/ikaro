import { describe, expect, it, vi } from 'vitest';
import { loadServiceDetailRouteData } from './service-route.server';
import {
  fetchStaffServiceEditView,
  ServiceEditViewFetchError,
} from '@/features/booking/api/services.server';

vi.mock('@/features/booking/api/services.server', () => ({
  fetchStaffServiceEditView: vi.fn(),
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

describe('loadServiceDetailRouteData', () => {
  it('returns the composite service + intake schema from a single BFF call', async () => {
    vi.mocked(fetchStaffServiceEditView).mockResolvedValue({
      service: { serviceId: 'svc-1' },
      intakeSchema: { active: null, history: [] },
    } as never);

    await expect(loadServiceDetailRouteData('token-123', 'svc-1')).resolves.toEqual({
      service: { serviceId: 'svc-1' },
      intakeSchema: { active: null, history: [] },
    });
    expect(fetchStaffServiceEditView).toHaveBeenCalledTimes(1);
  });

  it('calls notFound on a 404', async () => {
    vi.mocked(fetchStaffServiceEditView).mockRejectedValue(
      new ServiceEditViewFetchError(404, 'missing'),
    );

    await expect(loadServiceDetailRouteData('token-404', 'svc-404')).rejects.toThrow('notFound');
  });

  it('rethrows any other error', async () => {
    vi.mocked(fetchStaffServiceEditView).mockRejectedValue(
      new ServiceEditViewFetchError(500, 'boom'),
    );

    await expect(loadServiceDetailRouteData('token-500', 'svc-500')).rejects.toThrow('boom');
  });
});
