import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  getCustomerLoyaltyBalance,
  getCustomerLoyaltyEntries,
  getCustomerLoyaltyRedemptions,
  getLoyaltyBalance,
  getLoyaltyEntries,
  getLoyaltyRedemptions,
  redeemPoints,
} from './api';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const balance = { currentPoints: 150, nextExpiryDate: null, nextExpiryPoints: null };
const entriesResponse = { entries: [], pagination: { page: 1, limit: 20, total: 0 } };
const redemptionsResponse = { redemptions: [], pagination: { page: 1, limit: 20, total: 0 } };

describe('getLoyaltyBalance', () => {
  it('calls GET /loyalty/balance', async () => {
    mock.onGet('/loyalty/balance').reply(200, balance);
    const res = await getLoyaltyBalance();
    expect(res.currentPoints).toBe(150);
  });
});

describe('getLoyaltyEntries', () => {
  it('calls GET /loyalty/entries', async () => {
    mock.onGet('/loyalty/entries').reply(200, entriesResponse);
    const res = await getLoyaltyEntries();
    expect(res.entries).toHaveLength(0);
  });
});

describe('getLoyaltyRedemptions', () => {
  it('calls GET /loyalty/redemptions', async () => {
    mock.onGet('/loyalty/redemptions').reply(200, redemptionsResponse);
    const res = await getLoyaltyRedemptions();
    expect(res.redemptions).toHaveLength(0);
  });
});

describe('getCustomerLoyaltyBalance', () => {
  it('calls GET /customers/:id/loyalty/balance', async () => {
    mock.onGet('/customers/c-1/loyalty/balance').reply(200, balance);
    const res = await getCustomerLoyaltyBalance('c-1');
    expect(res.currentPoints).toBe(150);
  });
});

describe('getCustomerLoyaltyEntries', () => {
  it('calls GET /customers/:id/loyalty/entries', async () => {
    mock.onGet('/customers/c-1/loyalty/entries').reply(200, entriesResponse);
    const res = await getCustomerLoyaltyEntries('c-1');
    expect(res.entries).toHaveLength(0);
  });
});

describe('getCustomerLoyaltyRedemptions', () => {
  it('calls GET /customers/:id/loyalty/redemptions', async () => {
    mock.onGet('/customers/c-1/loyalty/redemptions').reply(200, redemptionsResponse);
    const res = await getCustomerLoyaltyRedemptions('c-1');
    expect(res.redemptions).toHaveLength(0);
  });
});

describe('redeemPoints', () => {
  it('calls POST /loyalty/redeem', async () => {
    const response = {
      redemptionId: 'r-1',
      customerId: 'c-1',
      pointsRedeemed: 50,
      newBalance: 100,
      redeemedAt: '',
    };
    mock.onPost('/loyalty/redeem').reply(201, response);
    const res = await redeemPoints({ customerId: 'c-1', pointsToRedeem: 50 });
    expect(res.redemptionId).toBe('r-1');
  });
});
