import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    });
  }),
);

vi.mock('next/navigation', () => ({ redirect, notFound: vi.fn() }));

import { CustomerFetchError, withAuthRedirect } from './api.server';

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
