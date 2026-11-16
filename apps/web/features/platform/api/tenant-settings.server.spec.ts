import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));

import { fetchLeadFormStatus } from './tenant-settings.server';

function response(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  bffServerFetch.mockReset();
});

describe('fetchLeadFormStatus', () => {
  it('returns the module status', async () => {
    bffServerFetch.mockResolvedValue(response(200, { enabled: true }));

    await expect(fetchLeadFormStatus('token')).resolves.toEqual({ enabled: true });
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/tenants/lead-form/status', {
      cache: 'no-store',
    });
  });

  it('reads the backend typed denial (403) as not enabled instead of failing the layout', async () => {
    bffServerFetch.mockResolvedValue(response(403, { code: 'BILLING_FEATURE_NOT_ENTITLED' }));

    await expect(fetchLeadFormStatus('token')).resolves.toEqual({ enabled: false });
  });

  it('still throws on any other failure', async () => {
    bffServerFetch.mockResolvedValue(response(500));

    await expect(fetchLeadFormStatus('token')).rejects.toThrow(
      'Failed to fetch lead form status (500)',
    );
  });
});
