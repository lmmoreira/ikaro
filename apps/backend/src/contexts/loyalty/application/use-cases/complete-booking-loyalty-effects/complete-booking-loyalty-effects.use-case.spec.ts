import { ServicePointsEarned } from '../../../domain/events/service-points-earned.event';
import { InMemoryEventBus } from '../../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { InMemoryLoyaltyRedemptionRepository } from '../../../../../test/infrastructure/in-memory-loyalty-redemption.repository';
import { InMemoryProcessedEventRepository } from '../../../../../test/infrastructure/in-memory-processed-event.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { LoyaltyBalance } from '../../../domain/loyalty-balance.aggregate';
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
  let processedEventRepo: InMemoryProcessedEventRepository;
  let tenantSettingsPort: InMemoryLoyaltyPlatformPort;
  let outboxPublisher: InMemoryEventBus;
  let useCase: CompleteBookingLoyaltyEffectsUseCase;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
    processedEventRepo = new InMemoryProcessedEventRepository();
    tenantSettingsPort = new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10);
    outboxPublisher = new InMemoryEventBus();

    useCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      processedEventRepo,
      tenantSettingsPort,
      outboxPublisher,
      new InMemoryTransactionManager(),
    );
  });

  async function seedBalance(
    points: number,
    tenantId = TENANT_ID,
    customerId = CUSTOMER_ID,
  ): Promise<void> {
    await balanceRepo.upsert(
      LoyaltyBalance.reconstitute({ tenantId, customerId, currentPoints: points }),
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
});
