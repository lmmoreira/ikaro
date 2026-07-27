import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { getCustomerLoyaltyEntries, getCustomerLoyaltyRedemptions } from './dashboard-api';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

describe('getCustomerLoyaltyEntries', () => {
  it('calls GET /customers/:id/loyalty/entries with params', async () => {
    mock.onGet('/customers/c-1/loyalty/entries').reply(200, {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const res = await getCustomerLoyaltyEntries('c-1');

    expect(res.items).toHaveLength(0);
  });
});

describe('getCustomerLoyaltyRedemptions', () => {
  it('calls GET /customers/:id/loyalty/redemptions with params', async () => {
    mock.onGet('/customers/c-1/loyalty/redemptions').reply(200, {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const res = await getCustomerLoyaltyRedemptions('c-1', { page: 1, limit: 20 });

    expect(res.items).toHaveLength(0);
  });
});
