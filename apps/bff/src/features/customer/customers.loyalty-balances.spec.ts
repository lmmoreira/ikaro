import { HttpException, HttpStatus } from '@nestjs/common';
import { BillingErrorCode } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { fetchLoyaltyBalancesForSearch } from './customers.loyalty-balances';

const CUSTOMER_A = '20000000-0000-4000-8000-000000000001';
const CUSTOMER_B = '20000000-0000-4000-8000-000000000002';

const denial = (code: string, status = HttpStatus.FORBIDDEN) =>
  new HttpException({ status, code }, status);

describe('fetchLoyaltyBalancesForSearch', () => {
  afterEach(() => jest.resetAllMocks());

  it('reads the balances of the given customers in one call', async () => {
    const balances = [{ customerId: CUSTOMER_A, currentPoints: 40 }];
    const getMock = jest.fn().mockResolvedValue(balances);

    const result = await fetchLoyaltyBalancesForSearch(makeBackendHttp({ get: getMock }), [
      CUSTOMER_A,
      CUSTOMER_B,
    ]);

    expect(result).toEqual(balances);
    expect(getMock).toHaveBeenCalledWith('/loyalty/balances', {
      customerIds: `${CUSTOMER_A},${CUSTOMER_B}`,
    });
  });

  it('answers no balances for a tenant without LOYALTY', async () => {
    const getMock = jest.fn().mockRejectedValue(denial(BillingErrorCode.FEATURE_NOT_ENTITLED));

    const result = await fetchLoyaltyBalancesForSearch(makeBackendHttp({ get: getMock }), [
      CUSTOMER_A,
    ]);

    expect(result).toEqual([]);
  });

  it.each([
    ['a suspended tenant', denial(BillingErrorCode.TENANT_SUSPENDED)],
    ['another 403', denial('STAFF_DEACTIVATED')],
    ['a server error', denial('INTERNAL', HttpStatus.INTERNAL_SERVER_ERROR)],
    ['a non-HTTP failure', new Error('socket hang up')],
  ])('still surfaces %s', async (_label, failure) => {
    const getMock = jest.fn().mockRejectedValue(failure);

    await expect(
      fetchLoyaltyBalancesForSearch(makeBackendHttp({ get: getMock }), [CUSTOMER_A]),
    ).rejects.toBe(failure);
  });
});
