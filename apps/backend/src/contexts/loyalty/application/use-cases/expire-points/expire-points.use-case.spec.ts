import { InMemoryBalanceExpiryLogRepository } from '../../../../../test/infrastructure/in-memory-balance-expiry-log.repository';
import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../../test/builders/loyalty/index';
import { ExpirePointsUseCase } from './expire-points.use-case';

const TENANT_ID = '10000000-0000-7000-8000-000000000010';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000010';

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

describe('ExpirePointsUseCase', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let expiryLogRepo: InMemoryBalanceExpiryLogRepository;
  let txManager: InMemoryTransactionManager;
  let useCase: ExpirePointsUseCase;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    expiryLogRepo = new InMemoryBalanceExpiryLogRepository();
    txManager = new InMemoryTransactionManager();
    useCase = new ExpirePointsUseCase(entryRepo, balanceRepo, expiryLogRepo, txManager);
  });

  it('returns zero counts when no entries have expired', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(10)
        .withExpiresAt(FUTURE)
        .build(),
    );

    const result = await useCase.execute();

    expect(result.processedEntries).toBe(0);
    expect(result.affectedCustomers).toBe(0);
    expect(result.totalPointsExpired).toBe(0);
  });

  it('decrements balance and marks entry as processed', async () => {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(20)
      .withExpiresAt(PAST)
      .build();
    await entryRepo.save(entry);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(50)
        .build(),
    );

    const result = await useCase.execute();

    expect(result.processedEntries).toBe(1);
    expect(result.affectedCustomers).toBe(1);
    expect(result.totalPointsExpired).toBe(20);

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(30);
    expect(await expiryLogRepo.hasBeenProcessed(entry.id)).toBe(true);
  });

  it('is idempotent — running twice does not double-decrement', async () => {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(10)
      .withExpiresAt(PAST)
      .build();
    await entryRepo.save(entry);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(100)
        .build(),
    );

    await useCase.execute();
    const result2 = await useCase.execute();

    expect(result2.processedEntries).toBe(0);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(90);
  });

  it('accumulates points across multiple entries for the same customer', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(15)
        .withExpiresAt(PAST)
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(25)
        .withExpiresAt(PAST)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(80)
        .build(),
    );

    const result = await useCase.execute();

    expect(result.processedEntries).toBe(2);
    expect(result.totalPointsExpired).toBe(40);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(40);
  });

  it('clamps decrement to current balance when balance is less than expired points', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(50)
        .withExpiresAt(PAST)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(30)
        .build(),
    );

    const result = await useCase.execute();

    expect(result.totalPointsExpired).toBe(30);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(0);
  });

  it('marks entry as processed even when balance is already zero', async () => {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(10)
      .withExpiresAt(PAST)
      .build();
    await entryRepo.save(entry);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(0)
        .build(),
    );

    await useCase.execute();

    expect(await expiryLogRepo.hasBeenProcessed(entry.id)).toBe(true);
  });

  it('marks entry as processed when no balance row exists', async () => {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(10)
      .withExpiresAt(PAST)
      .build();
    await entryRepo.save(entry);

    await useCase.execute();

    expect(await expiryLogRepo.hasBeenProcessed(entry.id)).toBe(true);
  });

  it('skips an entry deleted between findExpiringBefore and processing', async () => {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(10)
      .withExpiresAt(PAST)
      .build();
    await entryRepo.save(entry);
    entryRepo.markDeleted(entry.id);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(50)
        .build(),
    );

    const result = await useCase.execute();

    expect(result.processedEntries).toBe(0);
    expect(result.affectedCustomers).toBe(0);
    expect(result.totalPointsExpired).toBe(0);
    expect(await expiryLogRepo.hasBeenProcessed(entry.id)).toBe(false);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(50);
  });

  it('handles multiple customers independently', async () => {
    const CUSTOMER_B = 'bbbbbbbb-0000-7000-8000-000000000010';

    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(10)
        .withExpiresAt(PAST)
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_B)
        .withPoints(20)
        .withExpiresAt(PAST)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(50)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_B)
        .withCurrentPoints(60)
        .build(),
    );

    const result = await useCase.execute();

    expect(result.processedEntries).toBe(2);
    expect(result.affectedCustomers).toBe(2);
    expect(result.totalPointsExpired).toBe(30);

    const balA = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    const balB = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_B);
    expect(balA?.currentPoints).toBe(40);
    expect(balB?.currentPoints).toBe(40);
  });
});
