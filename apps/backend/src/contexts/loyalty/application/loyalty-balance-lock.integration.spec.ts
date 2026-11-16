import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { InboxRecordEntity } from '../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmInboxRepository } from '../../../shared/infrastructure/inbox/typeorm-inbox.repository';
import { TypeOrmTransactionManager } from '../../../shared/infrastructure/typeorm-transaction-manager';
import { LoyaltyEntryBuilder } from '../../../test/builders/loyalty/index';
import { InMemoryEventBus } from '../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyPlatformPort } from '../../../test/infrastructure/in-memory-loyalty-platform.port';
import { InMemoryTenantAccessPort } from '../../../test/infrastructure/in-memory-tenant-access.port';
import { createTestDataSource } from '../../../test/test-datasource';
import { LoyaltyInsufficientPointsError } from '../domain/errors/loyalty-domain.error';
import { LoyaltyBalance } from '../domain/loyalty-balance.aggregate';
import { BalanceExpiryLogEntity } from '../infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../infrastructure/entities/loyalty-redemption.entity';
import { TypeOrmBalanceExpiryLogRepository } from '../infrastructure/repositories/typeorm-balance-expiry-log.repository';
import { TypeOrmLoyaltyBalanceRepository } from '../infrastructure/repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from '../infrastructure/repositories/typeorm-loyalty-entry.repository';
import { TypeOrmLoyaltyRedemptionRepository } from '../infrastructure/repositories/typeorm-loyalty-redemption.repository';
import { ExpirePointsJob } from './jobs/expire-points.job';
import {
  CompleteBookingLoyaltyEffectsUseCase,
  CompleteBookingLoyaltyEffectsUseCaseInput,
} from './use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case';
import { RedeemPointsUseCase } from './use-cases/redeem-points/redeem-points.use-case';

// docs/LOCK_CATALOG.md H7: every writer of loyalty.loyalty_balances takes the balance row lock
// (SELECT ... FOR UPDATE) before it reads, inside its transaction. Each test holds writer A open
// right after A takes the lock, starts writer B, waits until Postgres shows B parked on a lock,
// then lets A commit. The final state must equal the serial outcome. Without the lock B would
// never park and waitForBlockedRowLock fails the test, so each one fails when the lock is removed.

// Scoped to the balance table: only the competing writer of these tests can be parked on it.
async function waitForBlockedLock(dataSource: DataSource): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [{ waiting }] = await dataSource.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%loyalty_balances%'`,
    );
    if (waiting > 0) return;
    await dataSource.query('SELECT pg_sleep(0.01)');
  }
  throw new Error('no transaction ever blocked on a lock');
}

interface Gate {
  locked: Promise<void>;
  release: () => void;
}

// Writer A's balance repository: right after the real lock is taken it signals `locked` and
// waits for `release`, keeping its transaction (and the row lock) open for as long as the test
// needs.
class GatedBalanceRepository extends TypeOrmLoyaltyBalanceRepository {
  private readonly signalLocked: () => void;
  private readonly released: Promise<void>;
  readonly gate: Gate;

  constructor(repo: ConstructorParameters<typeof TypeOrmLoyaltyBalanceRepository>[0]) {
    super(repo);
    let signalLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    this.released = new Promise<void>((resolve) => (release = resolve));
    this.signalLocked = signalLocked;
    this.gate = { locked, release };
  }

  override async findByCustomerForUpdate(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyBalance | null> {
    const balance = await super.findByCustomerForUpdate(tenantId, customerId);
    this.signalLocked();
    await this.released;
    return balance;
  }

  override async findOrCreateByCustomerForUpdate(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyBalance> {
    const balance = await super.findOrCreateByCustomerForUpdate(tenantId, customerId);
    this.signalLocked();
    await this.released;
    return balance;
  }
}

// Reports "not processed" on its first read (the use case's pre-transaction check) and tells the
// truth afterwards (the re-check under the lock).
class StalePreCheckInboxRepository extends TypeOrmInboxRepository {
  private firstRead = true;

  override async hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean> {
    if (this.firstRead) {
      this.firstRead = false;
      return false;
    }
    return super.hasBeenProcessed(eventId, consumerName);
  }
}

describe('Loyalty balance row lock (integration, H7)', () => {
  let ds: DataSource;
  let txManager: TypeOrmTransactionManager;
  let entryRepo: TypeOrmLoyaltyEntryRepository;
  let redemptionRepo: TypeOrmLoyaltyRedemptionRepository;
  let expiryLogRepo: TypeOrmBalanceExpiryLogRepository;
  let inboxRepo: TypeOrmInboxRepository;
  let plainBalanceRepo: TypeOrmLoyaltyBalanceRepository;
  let tenantIds: string[];
  let eventIds: string[];

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    entryRepo = new TypeOrmLoyaltyEntryRepository(ds.getRepository(LoyaltyEntryEntity));
    redemptionRepo = new TypeOrmLoyaltyRedemptionRepository(
      ds.getRepository(LoyaltyRedemptionEntity),
    );
    expiryLogRepo = new TypeOrmBalanceExpiryLogRepository(ds.getRepository(BalanceExpiryLogEntity));
    inboxRepo = new TypeOrmInboxRepository(ds.getRepository(InboxRecordEntity));
    plainBalanceRepo = new TypeOrmLoyaltyBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(() => {
    tenantIds = [];
    eventIds = [];
  });

  afterEach(async () => {
    if (tenantIds.length > 0) {
      await ds.query(
        `DELETE FROM "loyalty"."balance_expiry_log" WHERE entry_id IN
           (SELECT id FROM "loyalty"."loyalty_entries" WHERE tenant_id = ANY($1))`,
        [tenantIds],
      );
      for (const table of ['loyalty_redemptions', 'loyalty_entries', 'loyalty_balances']) {
        await ds.query(`DELETE FROM "loyalty"."${table}" WHERE tenant_id = ANY($1)`, [tenantIds]);
      }
    }
    if (eventIds.length > 0) {
      await ds.query(`DELETE FROM "shared"."inbox" WHERE event_id = ANY($1)`, [eventIds]);
    }
  });

  function newTenant(): string {
    const id = uuidv7();
    tenantIds.push(id);
    return id;
  }

  async function seedBalance(tenantId: string, customerId: string, points: number) {
    const balance = LoyaltyBalance.create(tenantId, customerId);
    if (points > 0) balance.increment(points);
    await plainBalanceRepo.upsert(balance);
  }

  async function pointsOf(tenantId: string, customerId: string): Promise<number | null> {
    return (await plainBalanceRepo.findByCustomer(tenantId, customerId))?.currentPoints ?? null;
  }

  function redeemUseCase(balanceRepo: TypeOrmLoyaltyBalanceRepository): RedeemPointsUseCase {
    return new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager);
  }

  function redeemInput(tenantId: string, customerId: string, points: number) {
    return {
      tenantId,
      customerId,
      pointsToRedeem: points,
      pointsPerCurrencyUnit: 10,
      redeemedBy: uuidv7(),
    };
  }

  function expireJob(balanceRepo: TypeOrmLoyaltyBalanceRepository): ExpirePointsJob {
    return new ExpirePointsJob(entryRepo, balanceRepo, expiryLogRepo, txManager);
  }

  async function seedDueEntry(tenantId: string, customerId: string, points: number) {
    const entry = new LoyaltyEntryBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withPoints(points)
      .withExpiresAt(new Date(Date.now() - 60_000))
      .build();
    await entryRepo.save(entry);
    return entry;
  }

  function earnUseCase(
    balanceRepo: TypeOrmLoyaltyBalanceRepository,
    access = new InMemoryTenantAccessPort(),
  ): CompleteBookingLoyaltyEffectsUseCase {
    return new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      inboxRepo,
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      new InMemoryEventBus(),
      txManager,
      access,
    );
  }

  function earnDto(
    tenantId: string,
    customerId: string,
    overrides: Partial<CompleteBookingLoyaltyEffectsUseCaseInput> = {},
  ): CompleteBookingLoyaltyEffectsUseCaseInput {
    const eventId = uuidv7();
    eventIds.push(eventId);
    return {
      tenantId,
      eventId,
      correlationId: uuidv7(),
      customerId,
      bookingId: uuidv7(),
      completedBy: uuidv7(),
      lines: [{ lineId: uuidv7(), serviceId: uuidv7(), pointsValueAtBooking: 10 }],
      ...overrides,
    };
  }

  it('redeem versus the expiry sweep: no expired point is resurrected', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    await seedBalance(tenant, customer, 100);
    await seedDueEntry(tenant, customer, 60);
    const gatedSweepRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const sweep = expireJob(gatedSweepRepo).run();
    await gatedSweepRepo.gate.locked;
    const redeem = redeemUseCase(plainBalanceRepo).execute(redeemInput(tenant, customer, 30));
    await waitForBlockedLock(ds);
    gatedSweepRepo.gate.release();
    await Promise.all([sweep, redeem]);

    // Serial outcome: the sweep expires 60 (100 -> 40), then the redeem takes 30 (-> 10).
    // An unlocked redeem would have read 100 and written 70, resurrecting the 60 expired points.
    expect(await pointsOf(tenant, customer)).toBe(10);
  });

  it('two redeems that together exceed the balance: exactly one succeeds', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    await seedBalance(tenant, customer, 100);
    const gatedRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const first = redeemUseCase(gatedRepo).execute(redeemInput(tenant, customer, 60));
    await gatedRepo.gate.locked;
    const second = redeemUseCase(plainBalanceRepo).execute(redeemInput(tenant, customer, 60));
    const secondSettled = second.then(
      () => 'ok' as const,
      (err: unknown) => err,
    );
    await waitForBlockedLock(ds);
    gatedRepo.gate.release();
    await first;

    expect(await secondSettled).toBeInstanceOf(LoyaltyInsufficientPointsError);
    expect(await pointsOf(tenant, customer)).toBe(40);
  });

  it('two BookingCompleted earns for one customer are both counted', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    await seedBalance(tenant, customer, 10);
    const gatedRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const first = earnUseCase(gatedRepo).execute(earnDto(tenant, customer));
    await gatedRepo.gate.locked;
    const second = earnUseCase(plainBalanceRepo).execute(earnDto(tenant, customer));
    await waitForBlockedLock(ds);
    gatedRepo.gate.release();
    await Promise.all([first, second]);

    // An unlocked pair both read 10 and one earn would be lost (balance 20).
    expect(await pointsOf(tenant, customer)).toBe(30);
  });

  it('two concurrent first earns with no balance row: both counted, one row', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    const gatedRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const first = earnUseCase(gatedRepo).execute(earnDto(tenant, customer));
    await gatedRepo.gate.locked;
    const second = earnUseCase(plainBalanceRepo).execute(earnDto(tenant, customer));
    // The second writer parks on the first one's uncommitted insert (unique key wait).
    await waitForBlockedLock(ds);
    gatedRepo.gate.release();
    await Promise.all([first, second]);

    expect(await pointsOf(tenant, customer)).toBe(20);
    const [{ rows }] = await ds.query<{ rows: number }[]>(
      `SELECT count(*)::int AS rows FROM "loyalty"."loyalty_balances"
        WHERE tenant_id = $1 AND customer_id = $2`,
      [tenant, customer],
    );
    expect(rows).toBe(1);
  });

  it('a duplicate discount-only BookingCompleted delivered concurrently decrements once', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    await seedBalance(tenant, customer, 100);
    // A suspended tenant earns nothing, so the event carries only the discount settlement.
    const access = new InMemoryTenantAccessPort();
    access.seedSuspended(tenant);
    const dto = earnDto(tenant, customer, {
      lines: [],
      discountByPoints: { pointsUsed: 30, amountDeducted: 3 },
    });
    const gatedRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const first = earnUseCase(gatedRepo, access).execute(dto);
    await gatedRepo.gate.locked;
    const duplicate = earnUseCase(plainBalanceRepo, access).execute(dto);
    await waitForBlockedLock(ds);
    gatedRepo.gate.release();
    const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);

    expect(firstResult.skipped).toBe(false);
    expect(duplicateResult.skipped).toBe(true);
    expect(await pointsOf(tenant, customer)).toBe(70);
  });

  it('two overlapping sweeps for one customer expire the same entries once', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    await seedBalance(tenant, customer, 100);
    await seedDueEntry(tenant, customer, 60);
    const gatedRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const first = expireJob(gatedRepo).run();
    await gatedRepo.gate.locked;
    const overlapping = expireJob(plainBalanceRepo).run();
    await waitForBlockedLock(ds);
    gatedRepo.gate.release();
    await Promise.all([first, overlapping]);

    // The second run read the entry as unprocessed before the first committed; the re-check
    // under the lock drops it. Without it the balance would be clamped to 0.
    expect(await pointsOf(tenant, customer)).toBe(40);
  });

  it("a lock held on tenant A's balance never blocks tenant B's writer for the same customer id", async () => {
    const tenantA = newTenant();
    const tenantB = newTenant();
    const customer = uuidv7();
    await seedBalance(tenantA, customer, 100);
    await seedBalance(tenantB, customer, 100);
    const gatedRepo = new GatedBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));

    const holder = redeemUseCase(gatedRepo).execute(redeemInput(tenantA, customer, 10));
    await gatedRepo.gate.locked;
    // Resolves while A's lock is still held: it is a different row.
    await redeemUseCase(plainBalanceRepo).execute(redeemInput(tenantB, customer, 20));
    gatedRepo.gate.release();
    await holder;

    expect(await pointsOf(tenantA, customer)).toBe(90);
    expect(await pointsOf(tenantB, customer)).toBe(80);
  });

  it('an event processed after the lock leaves no balance row behind', async () => {
    const tenant = newTenant();
    const customer = uuidv7();
    const dto = earnDto(tenant, customer);
    await inboxRepo.markProcessed(dto.eventId, CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME);
    // The pre-transaction check misses it (a concurrent delivery committed after it ran); only the
    // re-check under the lock sees it, after the first-earn ensure already inserted the row.
    const staleInbox = new StalePreCheckInboxRepository(ds.getRepository(InboxRecordEntity));
    const useCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      plainBalanceRepo,
      redemptionRepo,
      staleInbox,
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      new InMemoryEventBus(),
      txManager,
      new InMemoryTenantAccessPort(),
    );

    const result = await useCase.execute(dto);

    expect(result.skipped).toBe(true);
    expect(await pointsOf(tenant, customer)).toBeNull();
  });
});
