import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchServiceIntakeSchema,
  fetchStaffService,
  fetchStaffServices,
  ServiceDetailFetchError,
  ServiceIntakeSchemaFetchError,
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

describe('fetchStaffService', () => {
  it('calls GET /services/:id with the auth token and returns the service', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ serviceId: 'svc-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchStaffService('token-123', 'svc/1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/services/svc%2F1');
    expect(result.serviceId).toBe('svc-1');
  });

  it('throws ServiceDetailFetchError on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(null, {
        status: 404,
      }),
    );

    await expect(fetchStaffService('token-123', 'svc-1')).rejects.toBeInstanceOf(
      ServiceDetailFetchError,
    );
    await expect(fetchStaffService('token-123', 'svc-1')).rejects.toMatchObject({ status: 404 });
  });

  it('parses code from the response body instead of discarding it', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'BOOKING_SERVICE_NOT_FOUND' }), { status: 404 }),
    );

    await expect(fetchStaffService('token-123', 'svc-1')).rejects.toMatchObject({
      status: 404,
      code: 'BOOKING_SERVICE_NOT_FOUND',
    });
  });
});

describe('fetchServiceIntakeSchema', () => {
  it('calls GET /services/:id/intake-schema with the auth token and returns the schema', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ active: null, history: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchServiceIntakeSchema('token-123', 'svc-1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/services/svc-1/intake-schema');
    expect(result.active).toBeNull();
    expect(result.history).toEqual([]);
  });

  it('throws ServiceIntakeSchemaFetchError on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchServiceIntakeSchema('token-123', 'svc-1')).rejects.toBeInstanceOf(
      ServiceIntakeSchemaFetchError,
    );
    await expect(fetchServiceIntakeSchema('token-123', 'svc-1')).rejects.toMatchObject({
      status: 404,
    });
  });
});
