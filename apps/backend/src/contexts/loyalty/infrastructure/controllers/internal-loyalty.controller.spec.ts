import { BadRequestException } from '@nestjs/common';
import { InMemoryLoyaltyBalanceRepository } from '../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { LoyaltyBalanceBuilder } from '../../../../test/builders/loyalty/index';
import { GetLoyaltyBalanceUseCase } from '../../application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case';
import { InternalLoyaltyController } from './internal-loyalty.controller';

const TENANT_A = '10000000-0000-7000-8000-000000000001';
const TENANT_B = '10000000-0000-7000-8000-000000000002';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';

describe('InternalLoyaltyController', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let controller: InternalLoyaltyController;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    controller = new InternalLoyaltyController(
      new GetLoyaltyBalanceUseCase(balanceRepo, new InMemoryLoyaltyEntryRepository()),
    );
  });

  describe('getBalance()', () => {
    it('throws BadRequestException when tenantId query param is missing', () => {
      expect(() => controller.getBalance(CUSTOMER_ID, '')).toThrow(BadRequestException);
    });

    it('returns zero balance when customer has no data in the given tenant', async () => {
      const result = await controller.getBalance(CUSTOMER_ID, TENANT_A);
      expect(result.currentPoints).toBe(0);
    });

    it('returns the balance for the specified (customerId, tenantId) pair', async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

      const result = await controller.getBalance(CUSTOMER_ID, TENANT_A);
      expect(result.currentPoints).toBe(50);
    });

    it('does not leak balance from a different tenant for the same customer', async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

      const result = await controller.getBalance(CUSTOMER_ID, TENANT_B);
      expect(result.currentPoints).toBe(0);
    });
  });
});
