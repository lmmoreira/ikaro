import { InMemoryBalanceExpiryLogRepository } from '../../../../test/repositories/loyalty/in-memory-balance-expiry-log.repository';
import { Test } from '@nestjs/testing';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { BALANCE_EXPIRY_LOG_REPOSITORY } from '../ports/balance-expiry-log-repository.port';
import { EXPIRY_SWEEP_STATE_REPOSITORY } from '../ports/expiry-sweep-state-repository.port';
import { LOYALTY_BALANCE_REPOSITORY } from '../ports/loyalty-balance-repository.port';
import { LOYALTY_ENTRY_REPOSITORY } from '../ports/loyalty-entry-repository.port';
import { InMemoryExpirySweepStateRepository } from '../../../../test/repositories/loyalty/in-memory-expiry-sweep-state.repository';
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
  let sweepState: InMemoryExpirySweepStateRepository;
  let txManager: InMemoryTransactionManager;
  let job: ExpirePointsJob;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    expiryLogRepo = new InMemoryBalanceExpiryLogRepository();
    sweepState = new InMemoryExpirySweepStateRepository();
    txManager = new InMemoryTransactionManager();
    entryRepo.linkExpiryLog(expiryLogRepo);
    job = new ExpirePointsJob(entryRepo, balanceRepo, expiryLogRepo, sweepState, txManager);
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
    expect(expiryLogRepo.isProcessed(entry.id)).toBe(true);
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

    expect(expiryLogRepo.isProcessed(entry.id)).toBe(true);
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

    expect(expiryLogRepo.isProcessed(entry.id)).toBe(true);
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

  describe('balance row lock (docs/LOCK_CATALOG.md H7)', () => {
    async function seedDueEntry(points: number, balancePoints: number) {
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(points)
        .withExpiresAt(PAST)
        .build();
      await entryRepo.save(entry);
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(balancePoints)
          .build(),
      );
      return entry;
    }

    it('locks the balance row inside the per-customer transaction and never reads it unlocked', async () => {
      balanceRepo.requireTransaction(() => txManager.isInTransaction);
      await seedDueEntry(20, 50);

      await job.run();

      expect(balanceRepo.lockCallCount).toBe(1);
      expect(balanceRepo.unlockedReadCount).toBe(0);
    });

    it('does not expire entries another run processed while this one waited for the lock', async () => {
      const entry = await seedDueEntry(20, 50);
      // An overlapping run expires the same entry and commits while this one waits for the lock.
      balanceRepo.onLockAcquired(async () => {
        await expiryLogRepo.markProcessedMany([entry.id]);
        const current = (await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!;
        current.decrement(20);
      });

      const result = await job.run();

      expect(result.totalPointsExpired).toBe(0);
      // Counts reflect what this run did: the group the re-check dropped is not counted.
      expect(result.processedEntries).toBe(0);
      expect(result.affectedCustomers).toBe(0);
      const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
      expect(balance?.currentPoints).toBe(30);
    });

    it('writes every processed mark of a customer in one call', async () => {
      const first = await seedDueEntry(20, 50);
      const second = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(5)
        .withExpiresAt(PAST)
        .build();
      await entryRepo.save(second);
      const markSpy = jest.spyOn(expiryLogRepo, 'markProcessedMany');

      await job.run();

      expect(markSpy).toHaveBeenCalledTimes(1);
      expect([...markSpy.mock.calls[0][0]].sort()).toEqual([first.id, second.id].sort());
      expect(expiryLogRepo.isProcessed(first.id)).toBe(true);
      expect(expiryLogRepo.isProcessed(second.id)).toBe(true);
    });
  });

  // M25-S27 (UC-121 O-L1): points keep expiring while a tenant is suspended. The sweep is
  // system-wide and never asks who is suspended, which holds by construction: it depends on no
  // tenant-access or tenant-directory port. Resolving it from a module that provides none of those
  // fails the day someone injects one (the test then fails to compile the module).
  describe('suspended tenants (M25-S27 regression pin)', () => {
    it('resolves with only its own ports, so it can never skip a suspended tenant', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ExpirePointsJob,
          { provide: LOYALTY_ENTRY_REPOSITORY, useValue: entryRepo },
          { provide: LOYALTY_BALANCE_REPOSITORY, useValue: balanceRepo },
          { provide: BALANCE_EXPIRY_LOG_REPOSITORY, useValue: expiryLogRepo },
          { provide: EXPIRY_SWEEP_STATE_REPOSITORY, useValue: sweepState },
          { provide: TRANSACTION_MANAGER, useValue: txManager },
        ],
      }).compile();
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

      await moduleRef.get(ExpirePointsJob).run();

      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))?.currentPoints).toBe(30);
      expect(expiryLogRepo.isProcessed(entry.id)).toBe(true);
    });
  });

  describe('watermark (TD60-S01)', () => {
    const NOW = new Date('2026-11-16T02:00:00.000Z');
    const DAY_MS = 24 * 60 * 60 * 1000;

    it('reads with no lower bound on the first run (no watermark yet)', async () => {
      await job.run(NOW);

      expect(entryRepo.dueBetweenCalls).toEqual([{ from: null, to: NOW }]);
    });

    it('reads from one day before the watermark up to the run start', async () => {
      const watermark = new Date('2026-11-15T02:00:00.000Z');
      sweepState.seed(watermark);

      await job.run(NOW);

      expect(entryRepo.dueBetweenCalls).toEqual([
        { from: new Date(watermark.getTime() - DAY_MS), to: NOW },
      ]);
    });

    it('advances the watermark to the run start after a successful run, even with nothing due', async () => {
      await job.run(NOW);

      expect(sweepState.advanceCalls).toEqual([NOW]);
      expect(await sweepState.getProcessedThrough()).toEqual(NOW);
    });

    it('ignores entries that expired before the watermark window', async () => {
      sweepState.seed(new Date('2026-11-15T02:00:00.000Z'));
      await entryRepo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withPoints(10)
          .withExpiresAt(new Date(NOW.getTime() - 10 * DAY_MS))
          .build(),
      );

      const result = await job.run(NOW);

      expect(result.processedEntries).toBe(0);
    });
  });

  describe('failure isolation (TD60-S01)', () => {
    const CUSTOMER_B = 'bbbbbbbb-0000-7000-8000-000000000010';
    const NOW = new Date('2026-11-16T02:00:00.000Z');
    const DUE = new Date('2026-11-15T12:00:00.000Z');
    let failCustomerA: boolean;
    let errorSpy: jest.SpyInstance;

    async function seedCustomer(customerId: string, points: number, balancePoints: number) {
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(customerId)
        .withPoints(points)
        .withExpiresAt(DUE)
        .build();
      await entryRepo.save(entry);
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(customerId)
          .withCurrentPoints(balancePoints)
          .build(),
      );
      return entry;
    }

    beforeEach(() => {
      failCustomerA = true;
      errorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      const lockedRead = balanceRepo.findByCustomerForUpdate.bind(balanceRepo);
      jest
        .spyOn(balanceRepo, 'findByCustomerForUpdate')
        .mockImplementation(async (tenantId, customerId) => {
          if (failCustomerA && customerId === CUSTOMER_ID) throw new Error('db down');
          return lockedRead(tenantId, customerId);
        });
    });

    afterEach(() => jest.restoreAllMocks());

    it('expires the other customers when one customer fails, then rethrows once', async () => {
      const entryA = await seedCustomer(CUSTOMER_ID, 10, 50);
      const entryB = await seedCustomer(CUSTOMER_B, 20, 60);

      await expect(job.run(NOW)).rejects.toThrow('ExpirePointsJob failed for 1 customer group(s)');

      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_B))?.currentPoints).toBe(40);
      expect(expiryLogRepo.isProcessed(entryB.id)).toBe(true);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))?.currentPoints).toBe(50);
      expect(expiryLogRepo.isProcessed(entryA.id)).toBe(false);
    });

    it('logs the failed customer with its tenant and customer ids', async () => {
      await seedCustomer(CUSTOMER_ID, 10, 50);

      await expect(job.run(NOW)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        'ExpirePointsJob failed for a customer — the run will be retried',
        expect.any(String),
        { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
      );
    });

    it('leaves the watermark where it was after a failing run', async () => {
      const before = new Date('2026-11-15T02:00:00.000Z');
      sweepState.seed(before);
      await seedCustomer(CUSTOMER_ID, 10, 50);

      await expect(job.run(NOW)).rejects.toThrow();

      expect(sweepState.advanceCalls).toEqual([]);
      expect(await sweepState.getProcessedThrough()).toEqual(before);
    });

    it('expires the failed customer on the retry and only then advances the watermark', async () => {
      await seedCustomer(CUSTOMER_ID, 10, 50);
      await seedCustomer(CUSTOMER_B, 20, 60);
      await expect(job.run(NOW)).rejects.toThrow();
      failCustomerA = false;

      const retry = await job.run(NOW);

      expect(retry.processedEntries).toBe(1);
      expect(retry.totalPointsExpired).toBe(10);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))?.currentPoints).toBe(40);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_B))?.currentPoints).toBe(40);
      expect(sweepState.advanceCalls).toEqual([NOW]);
    });

    it('isolates a failing customer of one tenant from another tenant', async () => {
      const TENANT_B = '20000000-0000-7000-8000-000000000010';
      await seedCustomer(CUSTOMER_ID, 10, 50);
      const entryB = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(CUSTOMER_B)
        .withPoints(20)
        .withExpiresAt(DUE)
        .build();
      await entryRepo.save(entryB);
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_B)
          .withCustomerId(CUSTOMER_B)
          .withCurrentPoints(60)
          .build(),
      );

      await expect(job.run(NOW)).rejects.toThrow();

      expect((await balanceRepo.findByCustomer(TENANT_B, CUSTOMER_B))?.currentPoints).toBe(40);
      expect(expiryLogRepo.isProcessed(entryB.id)).toBe(true);
    });
  });
});
