import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { redeemPoints } from './api';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

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
