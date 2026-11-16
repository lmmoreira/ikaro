import { ServicePointsEarned } from '../../../domain/events/service-points-earned.event';
import { AppLogger } from '../../../../../shared/observability/app-logger';
import { InMemoryEventBus } from '../../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { InMemoryLoyaltyRedemptionRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-redemption.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantAccessPort } from '../../../../../test/infrastructure/in-memory-tenant-access.port';
import { LoyaltyBalanceBuilder } from '../../../../../test/builders/loyalty/index';
import {
  CompleteBookingLoyaltyEffectsUseCaseInput,
  CompleteBookingLoyaltyEffectsUseCase,
} from './complete-booking-loyalty-effects.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const TENANT_B_ID = '00000000-0000-7000-8000-000000000099';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const BOOKING_ID = '00000000-0000-7000-8000-000000000003';
const EVENT_ID = '00000000-0000-7000-8000-000000000010';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000011';
const STAFF_ID = '00000000-0000-7000-8000-000000000050';

function makeDto(
  overrides: Partial<CompleteBookingLoyaltyEffectsUseCaseInput> = {},
): CompleteBookingLoyaltyEffectsUseCaseInput {
  return {
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    correlationId: CORRELATION_ID,
    customerId: CUSTOMER_ID,
    bookingId: BOOKING_ID,
    completedBy: STAFF_ID,
    lines: [
      {
        lineId: '00000000-0000-7000-8000-000000000004',
        serviceId: '00000000-0000-7000-8000-000000000005',
        pointsValueAtBooking: 10,
      },
      {
        lineId: '00000000-0000-7000-8000-000000000006',
        serviceId: '00000000-0000-7000-8000-000000000007',
        pointsValueAtBooking: 5,
      },
    ],
    ...overrides,
  };
}

describe('CompleteBookingLoyaltyEffectsUseCase', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let redemptionRepo: InMemoryLoyaltyRedemptionRepository;
  let inboxRepo: InMemoryInboxRepository;
  let tenantSettingsPort: InMemoryLoyaltyPlatformPort;
  let outboxPublisher: InMemoryEventBus;
  let tenantAccess: InMemoryTenantAccessPort;
  let txManager: InMemoryTransactionManager;
  let useCase: CompleteBookingLoyaltyEffectsUseCase;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
    inboxRepo = new InMemoryInboxRepository();
    tenantSettingsPort = new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10);
    outboxPublisher = new InMemoryEventBus();
    tenantAccess = new InMemoryTenantAccessPort();
    txManager = new InMemoryTransactionManager();

    useCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      inboxRepo,
      tenantSettingsPort,
      outboxPublisher,
      txManager,
      tenantAccess,
    );
  });

  async function seedBalance(
    points: number,
    tenantId = TENANT_ID,
    customerId = CUSTOMER_ID,
  ): Promise<void> {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(tenantId)
        .withCustomerId(customerId)
        .withCurrentPoints(points)
        .build(),
    );
  }

  it('creates one LoyaltyEntry per line and increments balance', async () => {
    const result = await useCase.execute(makeDto());

    expect(result.skipped).toBe(false);
    expect(result.entriesCreated).toBe(2);
    expect(result.totalPointsEarned).toBe(15);
    expect(result.pointsRedeemed).toBe(0);
    expect(entryRepo.entries).toHaveLength(2);

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(15);
  });

  it('emits ONE ServicePointsEarned event per booking with all lines summarised', async () => {
    await useCase.execute(makeDto());

    const events = outboxPublisher.published.filter((e) => e instanceof ServicePointsEarned);
    expect(events).toHaveLength(1);

    const event = events[0] as ServicePointsEarned;
    expect(event.data.totalPointsEarned).toBe(15);
    expect(event.data.currentBalance).toBe(15);
    expect(event.data.lines).toHaveLength(2);
    expect(event.data.bookingId).toBe(BOOKING_ID);
  });

  it('skips guest bookings (customerId = null) with no side effects', async () => {
    const result = await useCase.execute(makeDto({ customerId: null }));

    expect(result.skipped).toBe(true);
    expect(entryRepo.entries).toHaveLength(0);
    expect(redemptionRepo.saved).toHaveLength(0);
    expect(outboxPublisher.published).toHaveLength(0);
  });

  it('uses expiryDays from tenant settings', async () => {
    tenantSettingsPort.withExpiryDays(30);
    await useCase.execute(makeDto());

    const entry = entryRepo.entries[0];
    const diffDays = Math.round(
      (entry.expiresAt.getTime() - entry.earnedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(30);
  });

  it('redeems points in the same transaction when discountByPoints is present', async () => {
    await seedBalance(500);

    const result = await useCase.execute(
      makeDto({ discountByPoints: { pointsUsed: 200, amountDeducted: 20 } }),
    );

    expect(result.pointsRedeemed).toBe(200);
    expect(redemptionRepo.saved).toHaveLength(1);
    expect(redemptionRepo.saved[0].pointsRedeemed).toBe(200);
    expect(redemptionRepo.saved[0].redeemedBy).toBe(STAFF_ID);
    expect(redemptionRepo.saved[0].bookingId).toBe(BOOKING_ID);
    expect(redemptionRepo.saved[0].pointsPerCurrencyUnit).toBe(10);

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance!.currentPoints).toBe(315); // 500 + 15 earned - 200 redeemed
  });

  it('does not redeem when discountByPoints is absent', async () => {
    await seedBalance(500);

    await useCase.execute(makeDto());

    expect(redemptionRepo.saved).toHaveLength(0);
  });

  it('is idempotent — replaying the same eventId skips earning and redemption together', async () => {
    await seedBalance(500);
    const dto = makeDto({ discountByPoints: { pointsUsed: 200, amountDeducted: 20 } });

    const first = await useCase.execute(dto);
    const second = await useCase.execute(dto);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(entryRepo.entries).toHaveLength(2);
    expect(redemptionRepo.saved).toHaveLength(1);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance!.currentPoints).toBe(315);
  });

  describe('discount larger than the balance (TD60-S03)', () => {
    const discount = (pointsUsed: number) => ({
      discountByPoints: { pointsUsed, amountDeducted: pointsUsed / 10 },
    });
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => jest.restoreAllMocks());

    const shortfallWarnings = (): unknown[][] =>
      warnSpy.mock.calls.filter(
        ([message]) =>
          message === 'Points discount exceeded the balance: settled what the balance covered',
      );

    it('settles the points the balance covers, records the earn, empties the balance and logs the shortfall', async () => {
      await seedBalance(40);

      const result = await useCase.execute(makeDto(discount(100)));

      expect(result.skipped).toBe(false);
      expect(result.totalPointsEarned).toBe(15);
      expect(result.pointsRedeemed).toBe(55);
      expect(entryRepo.entries).toHaveLength(2);
      expect(redemptionRepo.saved).toHaveLength(1);
      expect(redemptionRepo.saved[0].pointsRedeemed).toBe(55);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(0);
      const earned = outboxPublisher.published.find(
        (e): e is ServicePointsEarned => e instanceof ServicePointsEarned,
      );
      expect(earned?.data.currentBalance).toBe(0);
      expect(shortfallWarnings()).toHaveLength(1);
      expect(shortfallWarnings()[0][1]).toEqual({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        bookingId: BOOKING_ID,
        eventId: EVENT_ID,
        pointsUsed: 100,
        pointsRedeemed: 55,
        pointsShortfall: 45,
      });
    });

    it('does not retry: a redelivery of the settled event is a no-op', async () => {
      await seedBalance(40);
      const dto = makeDto(discount(100));
      await useCase.execute(dto);

      const second = await useCase.execute(dto);

      expect(second.skipped).toBe(true);
      expect(redemptionRepo.saved).toHaveLength(1);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(0);
    });

    it('settles in full without a warning when the balance plus the earn exactly covers the discount', async () => {
      await seedBalance(85);

      const result = await useCase.execute(makeDto(discount(100)));

      expect(result.pointsRedeemed).toBe(100);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(0);
      expect(shortfallWarnings()).toHaveLength(0);
    });

    it('settles in full without a warning when the balance exceeds the discount', async () => {
      await seedBalance(500);

      const result = await useCase.execute(makeDto(discount(100)));

      expect(result.pointsRedeemed).toBe(100);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(415);
      expect(shortfallWarnings()).toHaveLength(0);
    });

    it('writes no redemption when nothing is covered, still marks the event processed and logs the shortfall', async () => {
      tenantAccess.seedSuspended(TENANT_ID);
      const dto = makeDto(discount(100));

      const result = await useCase.execute(dto);

      expect(result.skipped).toBe(false);
      expect(result.pointsRedeemed).toBe(0);
      expect(redemptionRepo.saved).toHaveLength(0);
      expect(entryRepo.entries).toHaveLength(0);
      expect(
        await inboxRepo.hasBeenProcessed(
          dto.eventId,
          CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
        ),
      ).toBe(true);
      expect(shortfallWarnings()).toHaveLength(1);
      expect((await useCase.execute(dto)).skipped).toBe(true);
    });

    it("a shortfall for one tenant's customer never touches another tenant's balance", async () => {
      await seedBalance(40);
      await seedBalance(500, TENANT_B_ID);

      await useCase.execute(makeDto(discount(100)));

      expect((await balanceRepo.findByCustomer(TENANT_B_ID, CUSTOMER_ID))!.currentPoints).toBe(500);
      expect(await redemptionRepo.findByCustomer(TENANT_B_ID, CUSTOMER_ID, 1, 20)).toEqual(
        expect.objectContaining({ items: [] }),
      );
    });
  });

  describe("earning follows the tenant's access; the redemption always settles", () => {
    const discount = { discountByPoints: { pointsUsed: 200, amountDeducted: 20 } };
    const withoutLoyalty = {
      status: 'ACTIVE' as const,
      suspensionReason: null,
      operational: true,
      features: [{ key: 'BOOKING' as const, tier: 'STANDARD' as const }],
    };

    it('earns for an operational tenant entitled to LOYALTY', async () => {
      const result = await useCase.execute(makeDto());

      expect(result.entriesCreated).toBe(2);
      expect(tenantAccess.getAccessCalls).toEqual([TENANT_ID]);
    });

    it('settles the redemption but earns nothing for a suspended tenant', async () => {
      await seedBalance(500);
      tenantAccess.seedSuspended(TENANT_ID);

      const result = await useCase.execute(makeDto(discount));

      expect(result.skipped).toBe(false);
      expect(result.entriesCreated).toBe(0);
      expect(result.totalPointsEarned).toBe(0);
      expect(result.pointsRedeemed).toBe(200);
      expect(entryRepo.entries).toHaveLength(0);
      expect(redemptionRepo.saved).toHaveLength(1);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(300);
      expect(
        outboxPublisher.published.filter((e) => e instanceof ServicePointsEarned),
      ).toHaveLength(0);
    });

    it('settles the redemption but earns nothing for a tenant without LOYALTY', async () => {
      await seedBalance(500);
      tenantAccess.seed(TENANT_ID, withoutLoyalty);

      const result = await useCase.execute(makeDto(discount));

      expect(result.entriesCreated).toBe(0);
      expect(result.pointsRedeemed).toBe(200);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(300);
    });

    it('records no points and no redemption when it may not earn and no discount was spent, but marks the event processed', async () => {
      tenantAccess.seedSuspended(TENANT_ID);

      const result = await useCase.execute(makeDto());

      expect(result.skipped).toBe(true);
      expect(entryRepo.entries).toHaveLength(0);
      expect(await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID)).toBeNull();
      expect(
        await inboxRepo.hasBeenProcessed(
          EVENT_ID,
          CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
        ),
      ).toBe(true);
    });

    it('does not earn for a duplicate delivery once access is restored', async () => {
      tenantAccess.seedSuspended(TENANT_ID);
      await useCase.execute(makeDto());

      tenantAccess.reactivate(TENANT_ID);
      const duplicate = await useCase.execute(makeDto());

      expect(duplicate.skipped).toBe(true);
      expect(entryRepo.entries).toHaveLength(0);
      expect(await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID)).toBeNull();
    });

    it('earns when the access lookup fails (fail open)', async () => {
      tenantAccess.getAccessError = new Error('billing unreachable');

      const result = await useCase.execute(makeDto());

      expect(result.entriesCreated).toBe(2);
    });

    it("never lets another tenant's suspension stop this tenant's earning", async () => {
      tenantAccess.seedSuspended(TENANT_B_ID);

      const result = await useCase.execute(makeDto());

      expect(result.entriesCreated).toBe(2);
    });

    it('does not settle a redemption twice when the event is redelivered after a suspended earning', async () => {
      await seedBalance(500);
      tenantAccess.seedSuspended(TENANT_ID);
      const dto = makeDto(discount);

      await useCase.execute(dto);
      const second = await useCase.execute(dto);

      expect(second.skipped).toBe(true);
      expect(redemptionRepo.saved).toHaveLength(1);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))!.currentPoints).toBe(300);
    });
  });

  it('tenant isolation: processing for tenant B does not touch tenant A balance or redemptions', async () => {
    await seedBalance(500, TENANT_ID, CUSTOMER_ID);
    await seedBalance(900, TENANT_B_ID, CUSTOMER_ID);
    tenantSettingsPort.withPointsPerCurrencyUnitForTenant(TENANT_B_ID, 5);

    await useCase.execute(
      makeDto({
        tenantId: TENANT_B_ID,
        eventId: 'b-event-id',
        discountByPoints: { pointsUsed: 100, amountDeducted: 20 },
      }),
    );

    const tenantABalance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(tenantABalance!.currentPoints).toBe(500);
    const tenantARedemptions = await redemptionRepo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);
    expect(tenantARedemptions.items).toHaveLength(0);

    const tenantBBalance = await balanceRepo.findByCustomer(TENANT_B_ID, CUSTOMER_ID);
    expect(tenantBBalance!.currentPoints).toBe(815); // 900 + 15 earned - 100 redeemed
    const tenantBRedemptions = await redemptionRepo.findByCustomer(TENANT_B_ID, CUSTOMER_ID, 1, 20);
    expect(tenantBRedemptions.items).toHaveLength(1);
  });

  describe('failed settings read (TD60-S02)', () => {
    const DISCOUNT = { pointsUsed: 100, amountDeducted: 10 };

    beforeEach(() => {
      tenantSettingsPort.withFailureForTenant(TENANT_ID, new Error('tenant read failed'));
    });

    it('rejects and writes nothing: no entry, no balance change, no redemption, no event, no inbox mark', async () => {
      await seedBalance(500);

      await expect(useCase.execute(makeDto({ discountByPoints: DISCOUNT }))).rejects.toThrow(
        'tenant read failed',
      );

      expect(entryRepo.entries).toHaveLength(0);
      expect((await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID))?.currentPoints).toBe(500);
      expect(
        (await redemptionRepo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20)).items,
      ).toHaveLength(0);
      expect(outboxPublisher.published).toHaveLength(0);
      expect(
        await inboxRepo.hasBeenProcessed(
          EVENT_ID,
          CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
        ),
      ).toBe(false);
    });

    it('applies the effects on the redelivery once the read recovers', async () => {
      await expect(useCase.execute(makeDto())).rejects.toThrow();
      tenantSettingsPort.clearFailureForTenant(TENANT_ID);

      const result = await useCase.execute(makeDto());

      expect(result.skipped).toBe(false);
      expect(result.totalPointsEarned).toBe(15);
      expect(entryRepo.entries).toHaveLength(2);
    });

    it("does not affect another tenant's delivery", async () => {
      const result = await useCase.execute(makeDto({ tenantId: TENANT_B_ID }));

      expect(result.totalPointsEarned).toBe(15);
      expect(entryRepo.entries).toHaveLength(2);
      expect(entryRepo.entries.every((entry) => entry.tenantId === TENANT_B_ID)).toBe(true);
    });
  });

  describe('balance row lock (docs/LOCK_CATALOG.md H7)', () => {
    it('ensures and locks the balance row inside the transaction and never reads it unlocked', async () => {
      balanceRepo.requireTransaction(() => txManager.isInTransaction);

      await useCase.execute(makeDto());

      expect(balanceRepo.lockCallCount).toBe(1);
      expect(balanceRepo.unlockedReadCount).toBe(0);
      expect(txManager.runCallCount).toBe(1);
    });

    it('creates the first balance row for a customer who has none', async () => {
      await useCase.execute(makeDto());

      const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
      expect(balance?.currentPoints).toBe(15);
    });

    it('writes nothing when a concurrent delivery processed the event while it waited for the lock', async () => {
      balanceRepo.onLockAcquired(async () => {
        await inboxRepo.markProcessed(EVENT_ID, CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME);
      });

      const result = await useCase.execute(makeDto());

      expect(result.skipped).toBe(true);
      expect(entryRepo.entries).toHaveLength(0);
      expect(outboxPublisher.published).toHaveLength(0);
    });
  });
});
