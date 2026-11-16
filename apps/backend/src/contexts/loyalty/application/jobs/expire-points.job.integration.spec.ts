import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../test/builders/loyalty/index';
import { InMemoryExpirySweepStateRepository } from '../../../../test/repositories/loyalty/in-memory-expiry-sweep-state.repository';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BalanceExpiryLogEntity } from '../../infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../../infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../../infrastructure/entities/loyalty-entry.entity';
import { TypeOrmBalanceExpiryLogRepository } from '../../infrastructure/repositories/typeorm-balance-expiry-log.repository';
import { TypeOrmLoyaltyBalanceRepository } from '../../infrastructure/repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from '../../infrastructure/repositories/typeorm-loyalty-entry.repository';
import { ExpirePointsJob } from './expire-points.job';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// A balance repository whose locked read fails for one tenant, like a database error in that
// tenant's transaction. Every other tenant takes the real row lock.
class FailingForTenantBalanceRepository extends TypeOrmLoyaltyBalanceRepository {
  failingTenantId: string | null = null;

  override async findByCustomerForUpdate(tenantId: string, customerId: string) {
    if (tenantId === this.failingTenantId) throw new Error('db down');
    return super.findByCustomerForUpdate(tenantId, customerId);
  }
}

// The sweep reads across every tenant, so other suites' leftover rows can be picked up by a run.
// Every assertion is scoped to this spec's own tenants and entry ids; the watermark is an in-memory
// double because the real one is a single global row.
describe('ExpirePointsJob (integration, TD60-S01)', () => {
  let ds: DataSource;
  let entryRepo: TypeOrmLoyaltyEntryRepository;
  let expiryLogRepo: TypeOrmBalanceExpiryLogRepository;
  let balanceRepo: FailingForTenantBalanceRepository;
  let sweepState: InMemoryExpirySweepStateRepository;
  let job: ExpirePointsJob;
  let tenantIds: string[];
  const now = new Date();

  beforeAll(async () => {
    ds = await createTestDataSource();
    entryRepo = new TypeOrmLoyaltyEntryRepository(ds.getRepository(LoyaltyEntryEntity));
    expiryLogRepo = new TypeOrmBalanceExpiryLogRepository(ds.getRepository(BalanceExpiryLogEntity));
    balanceRepo = new FailingForTenantBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(() => {
    tenantIds = [];
    sweepState = new InMemoryExpirySweepStateRepository();
    balanceRepo.failingTenantId = null;
    job = new ExpirePointsJob(
      entryRepo,
      balanceRepo,
      expiryLogRepo,
      sweepState,
      new TypeOrmTransactionManager(ds),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (tenantIds.length === 0) return;
    await ds.query(
      `DELETE FROM "loyalty"."balance_expiry_log" WHERE entry_id IN
         (SELECT id FROM "loyalty"."loyalty_entries" WHERE tenant_id = ANY($1))`,
      [tenantIds],
    );
    for (const table of ['loyalty_entries', 'loyalty_balances']) {
      await ds.query(`DELETE FROM "loyalty"."${table}" WHERE tenant_id = ANY($1)`, [tenantIds]);
    }
  });

  function newTenant(): string {
    const id = uuidv7();
    tenantIds.push(id);
    return id;
  }

  async function seedEntry(tenantId: string, customerId: string, points: number, expiresAt: Date) {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withPoints(points)
      .withExpiresAt(expiresAt)
      .build();
    await entryRepo.save(entry);
    return entry;
  }

  async function seedBalance(tenantId: string, customerId: string, points: number) {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(tenantId)
        .withCustomerId(customerId)
        .withCurrentPoints(points)
        .build(),
    );
  }

  async function pointsOf(tenantId: string, customerId: string): Promise<number | undefined> {
    return (await balanceRepo.findByCustomer(tenantId, customerId))?.currentPoints;
  }

  async function processedAmong(entryIds: string[]): Promise<string[]> {
    const rows = await ds.query<{ entry_id: string }[]>(
      `SELECT entry_id FROM "loyalty"."balance_expiry_log" WHERE entry_id = ANY($1)`,
      [entryIds],
    );
    return rows.map((row) => row.entry_id);
  }

  it('expires only the due unprocessed entries, marks them once, advances the watermark, and a second run is a no-op', async () => {
    const tenantId = newTenant();
    const customerId = uuidv7();
    const due = await seedEntry(tenantId, customerId, 20, new Date(now.getTime() - HOUR_MS));
    const alreadyDone = await seedEntry(
      tenantId,
      customerId,
      5,
      new Date(now.getTime() - 2 * HOUR_MS),
    );
    const notDue = await seedEntry(tenantId, customerId, 7, new Date(now.getTime() + 30 * DAY_MS));
    await expiryLogRepo.markProcessedMany([alreadyDone.id]);
    await seedBalance(tenantId, customerId, 100);

    await job.run(now);

    expect(await pointsOf(tenantId, customerId)).toBe(80);
    expect((await processedAmong([due.id, alreadyDone.id, notDue.id])).sort()).toEqual(
      [due.id, alreadyDone.id].sort(),
    );
    expect(await sweepState.getProcessedThrough()).toEqual(now);

    await job.run(new Date(now.getTime() + HOUR_MS));

    expect(await pointsOf(tenantId, customerId)).toBe(80);
    expect(sweepState.advanceCalls).toHaveLength(2);
  });

  it('leaves the other tenant expired and the failing one untouched when one tenant fails, then expires it on the retry', async () => {
    jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    const failingTenant = newTenant();
    const healthyTenant = newTenant();
    const customerId = uuidv7();
    const failingEntry = await seedEntry(
      failingTenant,
      customerId,
      10,
      new Date(now.getTime() - HOUR_MS),
    );
    const healthyEntry = await seedEntry(
      healthyTenant,
      customerId,
      20,
      new Date(now.getTime() - HOUR_MS),
    );
    await seedBalance(failingTenant, customerId, 50);
    await seedBalance(healthyTenant, customerId, 60);
    balanceRepo.failingTenantId = failingTenant;

    await expect(job.run(now)).rejects.toThrow('ExpirePointsJob failed for 1 customer group(s)');

    expect(await pointsOf(healthyTenant, customerId)).toBe(40);
    expect(await processedAmong([healthyEntry.id])).toEqual([healthyEntry.id]);
    expect(await pointsOf(failingTenant, customerId)).toBe(50);
    expect(await processedAmong([failingEntry.id])).toEqual([]);
    expect(sweepState.advanceCalls).toEqual([]);

    balanceRepo.failingTenantId = null;
    await job.run(now);

    expect(await pointsOf(failingTenant, customerId)).toBe(40);
    expect(await pointsOf(healthyTenant, customerId)).toBe(40);
    expect(await processedAmong([failingEntry.id])).toEqual([failingEntry.id]);
    expect(sweepState.advanceCalls).toEqual([now]);
  });

  it('reads only the slice after the watermark: an unprocessed entry older than the window is left alone', async () => {
    const tenantId = newTenant();
    const customerId = uuidv7();
    sweepState.seed(new Date(now.getTime() - HOUR_MS));
    const old = await seedEntry(tenantId, customerId, 10, new Date(now.getTime() - 10 * DAY_MS));
    const recent = await seedEntry(tenantId, customerId, 15, new Date(now.getTime() - 30 * 60_000));
    await seedBalance(tenantId, customerId, 100);

    await job.run(now);

    expect(await pointsOf(tenantId, customerId)).toBe(85);
    expect(await processedAmong([old.id, recent.id])).toEqual([recent.id]);
  });
});
