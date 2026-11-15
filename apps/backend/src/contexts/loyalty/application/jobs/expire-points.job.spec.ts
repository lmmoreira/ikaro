import { EntryEffectiveExpiryService } from '../services/entry-effective-expiry.service';
import { InMemoryTenantExpiryPauseRepository } from '../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { InMemoryBalanceExpiryLogRepository } from '../../../../test/repositories/loyalty/in-memory-balance-expiry-log.repository';
import { InMemoryLoyaltyBalanceRepository } from '../../../../test/repositories/loyalty/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/repositories/loyalty/in-memory-loyalty-entry.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../test/builders/loyalty/index';
import { ExpirePointsJob } from './expire-points.job';

const TENANT_ID = '10000000-0000-7000-8000-000000000010';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000010';

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

describe('ExpirePointsJob', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let expiryLogRepo: InMemoryBalanceExpiryLogRepository;
  let txManager: InMemoryTransactionManager;
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let job: ExpirePointsJob;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    expiryLogRepo = new InMemoryBalanceExpiryLogRepository();
    txManager = new InMemoryTransactionManager();
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    job = new ExpirePointsJob(
      entryRepo,
      balanceRepo,
      expiryLogRepo,
      txManager,
      new EntryEffectiveExpiryService(pauseRepo),
    );
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

    const result = await job.run();

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

    const result = await job.run();

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

    await job.run();
    const result2 = await job.run();

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

    const result = await job.run();

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

    const result = await job.run();

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

    await job.run();

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

    await job.run();

    expect(await expiryLogRepo.hasBeenProcessed(entry.id)).toBe(true);
  });

  it('skips an entry deleted between the candidate read and processing', async () => {
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

    const result = await job.run();

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

    const result = await job.run();

    expect(result.processedEntries).toBe(2);
    expect(result.affectedCustomers).toBe(2);
    expect(result.totalPointsExpired).toBe(30);

    const balA = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    const balB = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_B);
    expect(balA?.currentPoints).toBe(40);
    expect(balB?.currentPoints).toBe(40);
  });

  describe('while a tenant is suspended (M25-S27)', () => {
    const OTHER_TENANT_ID = '00000000-0000-7000-8000-0000000000bb';
    const DAY = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

    async function seedEntry(tenantId: string, earnedDaysAgo: number, expiredDaysAgo: number) {
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(tenantId)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(10)
        .withEarnedAt(daysAgo(earnedDaysAgo))
        .withExpiresAt(daysAgo(expiredDaysAgo))
        .build();
      await entryRepo.save(entry);
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(tenantId)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(100)
          .build(),
      );
      return entry;
    }

    it('expires only the active tenant due points when another tenant has an open pause', async () => {
      const held = await seedEntry(TENANT_ID, 40, 10);
      const due = await seedEntry(OTHER_TENANT_ID, 40, 10);
      await pauseRepo.recordOpen(TENANT_ID, daysAgo(20));

      const result = await job.run();

      expect(result.processedEntries).toBe(1);
      expect(await expiryLogRepo.hasBeenProcessed(held.id)).toBe(false);
      expect(await expiryLogRepo.hasBeenProcessed(due.id)).toBe(true);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))?.currentPoints).toBe(100);
    });

    it('does not expire an entry whose raw expiry fell inside a closed pause until the pause length is added', async () => {
      // Raw expiry 10 days ago; a 15-day pause ended 2 days ago, so it really expires 5 days from now.
      const shifted = await seedEntry(TENANT_ID, 40, 10);
      await pauseRepo.recordClosed(TENANT_ID, daysAgo(25), daysAgo(10));

      const early = await job.run();
      const later = await job.run(new Date(Date.now() + 6 * DAY));

      expect(early.processedEntries).toBe(0);
      expect(later.processedEntries).toBe(1);
      expect(await expiryLogRepo.hasBeenProcessed(shifted.id)).toBe(true);
    });

    it('resumes normal expiry for an entry a pause never touched', async () => {
      const untouched = await seedEntry(TENANT_ID, 5, 1);
      await pauseRepo.recordClosed(TENANT_ID, daysAgo(40), daysAgo(30));

      const result = await job.run();

      expect(result.processedEntries).toBe(1);
      expect(await expiryLogRepo.hasBeenProcessed(untouched.id)).toBe(true);
    });

    it('leaves the stored expires_at unchanged', async () => {
      const held = await seedEntry(TENANT_ID, 40, 10);
      const storedExpiry = held.expiresAt;
      await pauseRepo.recordOpen(TENANT_ID, daysAgo(20));

      await job.run();

      expect(held.expiresAt).toEqual(storedExpiry);
    });
  });
});
