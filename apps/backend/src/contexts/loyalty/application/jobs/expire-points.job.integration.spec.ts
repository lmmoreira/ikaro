import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../test/builders/loyalty/index';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BalanceExpiryLogEntity } from '../../infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../../infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../../infrastructure/entities/loyalty-entry.entity';
import { TenantExpiryPauseEntity } from '../../infrastructure/entities/tenant-expiry-pause.entity';
import { TypeOrmBalanceExpiryLogRepository } from '../../infrastructure/repositories/typeorm-balance-expiry-log.repository';
import { TypeOrmLoyaltyBalanceRepository } from '../../infrastructure/repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from '../../infrastructure/repositories/typeorm-loyalty-entry.repository';
import { TypeOrmTenantExpiryPauseRepository } from '../../infrastructure/repositories/typeorm-tenant-expiry-pause.repository';
import { EntryEffectiveExpiryService } from '../services/entry-effective-expiry.service';
import { ExpirePointsJob } from './expire-points.job';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

// M25-S27: the real sweep, real ledger. Other suites' leftover rows can be swept too (the job is
// unscoped by design), so every assertion looks at this suite's own tenants and entries only.
describe('ExpirePointsJob (integration, suspension pauses)', () => {
  let ds: DataSource;
  let entryRepo: TypeOrmLoyaltyEntryRepository;
  let pauseRepo: TypeOrmTenantExpiryPauseRepository;
  let balanceRepo: TypeOrmLoyaltyBalanceRepository;
  let logRepo: TypeOrmBalanceExpiryLogRepository;
  let job: ExpirePointsJob;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    ds = await createTestDataSource();
    entryRepo = new TypeOrmLoyaltyEntryRepository(ds.getRepository(LoyaltyEntryEntity));
    pauseRepo = new TypeOrmTenantExpiryPauseRepository(ds.getRepository(TenantExpiryPauseEntity));
    balanceRepo = new TypeOrmLoyaltyBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));
    logRepo = new TypeOrmBalanceExpiryLogRepository(ds.getRepository(BalanceExpiryLogEntity));
    job = new ExpirePointsJob(
      entryRepo,
      balanceRepo,
      logRepo,
      new TypeOrmTransactionManager(ds),
      new EntryEffectiveExpiryService(pauseRepo),
    );
  });

  afterAll(async () => {
    await ds.destroy();
  });

  afterEach(async () => {
    const ids = tenantIds.splice(0);
    await ds.query(
      `DELETE FROM "loyalty"."balance_expiry_log" WHERE entry_id IN (SELECT id FROM "loyalty"."loyalty_entries" WHERE tenant_id = ANY($1))`,
      [ids],
    );
    await ds.query(`DELETE FROM "loyalty"."loyalty_entries" WHERE tenant_id = ANY($1)`, [ids]);
    await ds.query(`DELETE FROM "loyalty"."loyalty_balances" WHERE tenant_id = ANY($1)`, [ids]);
    await ds.query(`DELETE FROM "loyalty"."tenant_expiry_pauses" WHERE tenant_id = ANY($1)`, [ids]);
  });

  async function seed(tenantId: string, earnedDaysAgo: number, expiredDaysAgo: number) {
    tenantIds.push(tenantId);
    const customerId = uuidv7();
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withPoints(10)
      .withEarnedAt(daysAgo(earnedDaysAgo))
      .withExpiresAt(daysAgo(expiredDaysAgo))
      .build();
    await entryRepo.save(entry);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(tenantId)
        .withCustomerId(customerId)
        .withCurrentPoints(100)
        .build(),
    );
    return { entry, customerId };
  }

  const storedExpiry = async (entryId: string): Promise<Date> => {
    const rows = (await ds.query(
      `SELECT expires_at FROM "loyalty"."loyalty_entries" WHERE id = $1`,
      [entryId],
    )) as { expires_at: Date }[];
    return rows[0].expires_at;
  };

  it('expires only the active tenant due points when the other tenant is suspended', async () => {
    const suspended = await seed(uuidv7(), 40, 10);
    const active = await seed(uuidv7(), 40, 10);
    await pauseRepo.recordOpen(suspended.entry.tenantId, daysAgo(20));

    await job.run();

    expect(await logRepo.hasBeenProcessed(suspended.entry.id)).toBe(false);
    expect(await logRepo.hasBeenProcessed(active.entry.id)).toBe(true);
    expect(
      (await balanceRepo.findByCustomer(suspended.entry.tenantId, suspended.customerId))
        ?.currentPoints,
    ).toBe(100);
  });

  it('suspend, wait past the original expiry, reactivate: the entry is intact and expires only after the pause length is added', async () => {
    const { entry } = await seed(uuidv7(), 40, 10);
    const original = await storedExpiry(entry.id);
    // Suspended 25 days ago, reactivated 10 days ago: a 15-day pause over the entry's last 15 days.
    await pauseRepo.recordClosed(entry.tenantId, daysAgo(25), daysAgo(10));

    await job.run(new Date());
    expect(await logRepo.hasBeenProcessed(entry.id)).toBe(false);

    await job.run(new Date(Date.now() + 6 * DAY));
    expect(await logRepo.hasBeenProcessed(entry.id)).toBe(true);
    expect(await storedExpiry(entry.id)).toEqual(original);
  });

  it('with no pause rows an overdue entry expires exactly as before', async () => {
    const { entry } = await seed(uuidv7(), 40, 10);

    await job.run();

    expect(await logRepo.hasBeenProcessed(entry.id)).toBe(true);
  });
});
