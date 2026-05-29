import { InMemoryBalanceExpiryLogRepository } from '../../../../test/infrastructure/in-memory-balance-expiry-log.repository';
import { InMemoryLoyaltyBalanceRepository } from '../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../test/builders/loyalty/index';
import { ExpirePointsUseCase } from '../../application/use-cases/expire-points/expire-points.use-case';
import { InternalLoyaltyController } from './internal-loyalty.controller';

const TENANT_ID = '10000000-0000-7000-8000-000000000011';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000011';

describe('InternalLoyaltyController', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let expiryLogRepo: InMemoryBalanceExpiryLogRepository;
  let txManager: InMemoryTransactionManager;
  let controller: InternalLoyaltyController;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    expiryLogRepo = new InMemoryBalanceExpiryLogRepository();
    txManager = new InMemoryTransactionManager();
    controller = new InternalLoyaltyController(
      new ExpirePointsUseCase(entryRepo, balanceRepo, expiryLogRepo, txManager),
    );
  });

  it('returns zero counts when nothing has expired', async () => {
    const result = await controller.runExpiry();

    expect(result.processedEntries).toBe(0);
    expect(result.affectedCustomers).toBe(0);
    expect(result.totalPointsExpired).toBe(0);
  });

  it('decrements balance for expired entries and returns summary', async () => {
    const past = new Date(Date.now() - 1000);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(20)
        .withExpiresAt(past)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(50)
        .build(),
    );

    const result = await controller.runExpiry();

    expect(result.processedEntries).toBe(1);
    expect(result.affectedCustomers).toBe(1);
    expect(result.totalPointsExpired).toBe(20);

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(30);
  });
});
