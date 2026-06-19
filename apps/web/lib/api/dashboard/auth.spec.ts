import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '../bff-client';
import { logout, switchTenant } from './auth';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

describe('logout', () => {
  it('calls POST /auth/logout', async () => {
    mock.onPost('/auth/logout').reply(200);
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe('switchTenant', () => {
  it('calls POST /auth/switch-tenant and returns tenantSlug', async () => {
    mock.onPost('/auth/switch-tenant').reply(200, { tenantSlug: 'new-slug', expiresIn: '7d' });
    const res = await switchTenant({ targetTenantId: 'tid-2' });
    expect(res.tenantSlug).toBe('new-slug');
  });
});
