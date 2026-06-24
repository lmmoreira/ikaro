import { InMemoryEventBus } from '../../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { InMemoryLoyaltyRedemptionRepository } from '../../../../../test/infrastructure/in-memory-loyalty-redemption.repository';
import { InMemoryProcessedEventRepository } from '../../../../../test/infrastructure/in-memory-processed-event.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { LoyaltyBalance } from '../../../domain/loyalty-balance.aggregate';
import { RecordLoyaltyEntriesUseCase } from '../record-loyalty-entries/record-loyalty-entries.use-case';
import { RedeemPointsUseCase } from '../redeem-points/redeem-points.use-case';
import {
  ProcessBookingCompletedLoyaltyEffectsDto,
  ProcessBookingCompletedLoyaltyEffectsUseCase,
} from './process-booking-completed-loyalty-effects.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const BOOKING_ID = '00000000-0000-7000-8000-000000000003';
const EVENT_ID = '00000000-0000-7000-8000-000000000010';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000011';
const STAFF_ID = '00000000-0000-7000-8000-000000000050';

function makeDto(
  overrides: Partial<ProcessBookingCompletedLoyaltyEffectsDto> = {},
): ProcessBookingCompletedLoyaltyEffectsDto {
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
    ],
    ...overrides,
  };
}

describe('ProcessBookingCompletedLoyaltyEffectsUseCase', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let redemptionRepo: InMemoryLoyaltyRedemptionRepository;
  let processedEventRepo: InMemoryProcessedEventRepository;
  let tenantSettingsPort: InMemoryLoyaltyPlatformPort;
  let eventBus: InMemoryEventBus;
  let recordLoyaltyEntries: RecordLoyaltyEntriesUseCase;
  let redeemPoints: RedeemPointsUseCase;
  let useCase: ProcessBookingCompletedLoyaltyEffectsUseCase;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
    processedEventRepo = new InMemoryProcessedEventRepository();
    tenantSettingsPort = new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10);
    eventBus = new InMemoryEventBus();

    recordLoyaltyEntries = new RecordLoyaltyEntriesUseCase(
      entryRepo,
      balanceRepo,
      processedEventRepo,
      tenantSettingsPort,
      eventBus,
      new InMemoryTransactionManager(),
    );
    redeemPoints = new RedeemPointsUseCase(
      balanceRepo,
      redemptionRepo,
      new InMemoryTransactionManager(),
    );
    useCase = new ProcessBookingCompletedLoyaltyEffectsUseCase(
      recordLoyaltyEntries,
      redeemPoints,
      processedEventRepo,
      tenantSettingsPort,
    );
  });

  async function seedBalance(points: number): Promise<void> {
    await balanceRepo.upsert(
      LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: points,
      }),
    );
  }

  it('always records earning entries, even without a discount', async () => {
    await useCase.execute(makeDto());

    expect(entryRepo.entries).toHaveLength(1);
    expect(redemptionRepo.saved).toHaveLength(0);
  });

  it('redeems points when discountByPoints is present and customerId exists', async () => {
    await seedBalance(500);

    await useCase.execute(makeDto({ discountByPoints: { pointsUsed: 200, amountDeducted: 20 } }));

    expect(redemptionRepo.saved).toHaveLength(1);
    expect(redemptionRepo.saved[0].pointsRedeemed).toBe(200);
    expect(redemptionRepo.saved[0].redeemedBy).toBe(STAFF_ID);
    expect(redemptionRepo.saved[0].bookingId).toBe(BOOKING_ID);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance!.currentPoints).toBe(310); // 500 - 200 redeemed + 10 earned
  });

  it('does not redeem when discountByPoints is absent', async () => {
    await seedBalance(500);

    await useCase.execute(makeDto());

    expect(redemptionRepo.saved).toHaveLength(0);
  });

  it('does not redeem on a guest booking (customerId null), regardless of discountByPoints', async () => {
    await useCase.execute(
      makeDto({ customerId: null, discountByPoints: { pointsUsed: 200, amountDeducted: 20 } }),
    );

    expect(redemptionRepo.saved).toHaveLength(0);
  });

  it('is idempotent — replaying the same eventId does not redeem twice', async () => {
    await seedBalance(500);
    const dto = makeDto({ discountByPoints: { pointsUsed: 200, amountDeducted: 20 } });

    await useCase.execute(dto);
    await useCase.execute(dto);

    expect(redemptionRepo.saved).toHaveLength(1);
    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance!.currentPoints).toBe(310);
  });

  it('replaying the same eventId does not re-record earning entries either', async () => {
    await seedBalance(500);
    const dto = makeDto({ discountByPoints: { pointsUsed: 200, amountDeducted: 20 } });

    await useCase.execute(dto);
    await useCase.execute(dto);

    expect(entryRepo.entries).toHaveLength(1);
  });
});
