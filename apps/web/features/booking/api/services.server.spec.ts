import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStaffServiceEditView,
  fetchStaffServices,
  ServiceEditViewFetchError,
  ServiceListFetchError,
} from './services.server';
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

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/services');
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('throws ServiceListFetchError on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchStaffServices('token-123')).rejects.toBeInstanceOf(ServiceListFetchError);
    await expect(fetchStaffServices('token-123')).rejects.toMatchObject({ status: 500 });
  });

  it('parses code from the response body instead of discarding it', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'PLATFORM_TENANT_INACTIVE' }), { status: 403 }),
    );

    await expect(fetchStaffServices('token-123')).rejects.toMatchObject({
      status: 403,
      code: 'PLATFORM_TENANT_INACTIVE',
    });
  });
});

describe('fetchStaffServiceEditView', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /services/:id/edit-view with the auth token and returns the composite', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          service: { serviceId: 'svc-1' },
          intakeSchema: { active: null, history: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await fetchStaffServiceEditView('token-123', 'svc-1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/services/svc-1/edit-view');
    expect(result.service.serviceId).toBe('svc-1');
    expect(result.intakeSchema).toEqual({ active: null, history: [] });
  });

  it('throws ServiceEditViewFetchError carrying the status on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchStaffServiceEditView('token-123', 'svc-1')).rejects.toBeInstanceOf(
      ServiceEditViewFetchError,
    );
    await expect(fetchStaffServiceEditView('token-123', 'svc-1')).rejects.toMatchObject({
      status: 404,
    });
  });
});
