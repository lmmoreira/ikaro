import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    });
  }),
);

vi.mock('next/navigation', () => ({ redirect, notFound: vi.fn() }));

import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { CustomerFetchError } from '@/shared/lib/api/errors';
import { fetchCustomerProfileForStaff, withAuthRedirect } from './api.server';

vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch: vi.fn() }));

describe('fetchCustomerProfileForStaff', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('reads the customer’s profile, with the saved address, from the BFF', async () => {
    const profile = { customerId: 'c-1', name: 'Ana', defaultAddress: null };
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchCustomerProfileForStaff('token', 'c-1')).resolves.toEqual(profile);

    expect(bffServerFetch).toHaveBeenCalledWith('token', '/customers/c-1');
  });

  it.each([404, 400])('is null for a customer this tenant does not have (%i)', async (status) => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status }));

    await expect(fetchCustomerProfileForStaff('token', 'nope')).resolves.toBeNull();
  });

  it('throws on any other failure', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchCustomerProfileForStaff('token', 'c-1')).rejects.toThrow(
      'Failed to fetch customer (500)',
    );
  });
});

beforeEach(() => {
  redirect.mockClear();
});

describe('withAuthRedirect', () => {
  it('resolves with the value on success', async () => {
    await expect(withAuthRedirect(Promise.resolve('ok'), 'lavacar-bh')).resolves.toBe('ok');
  });

  it.each([401, 403])('redirects to login on a %i CustomerFetchError', async (status) => {
    const rejected = Promise.reject(
      new CustomerFetchError(status, undefined, undefined, 'unauthorized'),
    );
    await expect(withAuthRedirect(rejected, 'lavacar-bh')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/lavacar-bh/login');
  });

  it('rethrows without redirecting for any other error', async () => {
    const rejected = Promise.reject(new CustomerFetchError(500, undefined, undefined, 'boom'));
    await expect(withAuthRedirect(rejected, 'lavacar-bh')).rejects.toMatchObject({
      status: 500,
      detail: 'boom',
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
