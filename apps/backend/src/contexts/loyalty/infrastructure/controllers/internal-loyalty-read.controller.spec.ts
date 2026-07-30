import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryLoyaltyBalanceRepository } from '../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { LoyaltyBalanceBuilder } from '../../../../test/builders/loyalty/index';
import { GetLoyaltyBalancesUseCase } from '../../application/use-cases/get-loyalty-balances/get-loyalty-balances.use-case';
import { InternalLoyaltyReadController } from './internal-loyalty-read.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000002';
const CUSTOMER_1 = 'aaaaaaaa-0000-7000-8000-000000000001';
const CUSTOMER_2 = 'aaaaaaaa-0000-7000-8000-000000000002';

describe('InternalLoyaltyReadController', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let controller: InternalLoyaltyReadController;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    controller = new InternalLoyaltyReadController(new GetLoyaltyBalancesUseCase(balanceRepo));
  });

  describe('getBalancesRoute() — batch by customerIds', () => {
    it('returns 400 when tenantId query param is absent', async () => {
      const err = await controller
        .getBalancesRoute(undefined, `${CUSTOMER_1}`)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when customerIds query param is absent', async () => {
      const err = await controller.getBalancesRoute(TENANT_ID, undefined).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when customerIds contains only separators or whitespace', async () => {
      const err = await controller.getBalancesRoute(TENANT_ID, ',, ,').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when tenantId is bound as an array (repeated query param)', async () => {
      const err = await controller
        .getBalancesRoute([TENANT_ID, OTHER_TENANT_ID], CUSTOMER_1)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when customerIds is bound as an array (repeated query param)', async () => {
      const err = await controller
        .getBalancesRoute(TENANT_ID, [CUSTOMER_1, CUSTOMER_2])
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns currentPoints for each requested customer, defaulting missing ones to 0', async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_1)
          .withCurrentPoints(120)
          .build(),
      );

      const result = await controller.getBalancesRoute(TENANT_ID, `${CUSTOMER_1},${CUSTOMER_2}`);

      expect(result).toEqual([
        { customerId: CUSTOMER_1, currentPoints: 120 },
        { customerId: CUSTOMER_2, currentPoints: 0 },
      ]);
    });

    it('tenant isolation: does not return a balance belonging to a different tenant', async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(OTHER_TENANT_ID)
          .withCustomerId(CUSTOMER_1)
          .withCurrentPoints(999)
          .build(),
      );

      const result = await controller.getBalancesRoute(TENANT_ID, CUSTOMER_1);

      expect(result).toEqual([{ customerId: CUSTOMER_1, currentPoints: 0 }]);
    });
  });
});
