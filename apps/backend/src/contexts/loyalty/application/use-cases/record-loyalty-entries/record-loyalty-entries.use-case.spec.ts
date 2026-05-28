import { ServicePointsEarned } from '../../../domain/events/service-points-earned.event';
import { InMemoryEventBus } from '../../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyTenantSettingsPort } from '../../../../../test/infrastructure/in-memory-loyalty-tenant-settings.port';
import { InMemoryProcessedEventRepository } from '../../../../../test/infrastructure/in-memory-processed-event.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import {
  RecordLoyaltyEntriesDto,
  RecordLoyaltyEntriesUseCase,
} from './record-loyalty-entries.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const BOOKING_ID = '00000000-0000-7000-8000-000000000003';
const EVENT_ID = '00000000-0000-7000-8000-000000000010';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000011';

function makeDto(overrides: Partial<RecordLoyaltyEntriesDto> = {}): RecordLoyaltyEntriesDto {
  return {
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    correlationId: CORRELATION_ID,
    customerId: CUSTOMER_ID,
    bookingId: BOOKING_ID,
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

describe('RecordLoyaltyEntriesUseCase', () => {
  let useCase: RecordLoyaltyEntriesUseCase;
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let processedEventRepo: InMemoryProcessedEventRepository;
  let tenantSettingsPort: InMemoryLoyaltyTenantSettingsPort;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    processedEventRepo = new InMemoryProcessedEventRepository();
    tenantSettingsPort = new InMemoryLoyaltyTenantSettingsPort();
    eventBus = new InMemoryEventBus();

    useCase = new RecordLoyaltyEntriesUseCase(
      entryRepo,
      balanceRepo,
      processedEventRepo,
      tenantSettingsPort,
      eventBus,
      new InMemoryTransactionManager(),
    );
  });

  it('creates one LoyaltyEntry per line and increments balance', async () => {
    const result = await useCase.execute(makeDto());

    expect(result.skipped).toBe(false);
    expect(result.entriesCreated).toBe(2);
    expect(result.totalPointsEarned).toBe(15);
    expect(entryRepo.entries).toHaveLength(2);

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(15);
  });

  it('emits one ServicePointsEarned event per line', async () => {
    await useCase.execute(makeDto());

    const events = eventBus.published.filter((e) => e instanceof ServicePointsEarned);
    expect(events).toHaveLength(2);
    expect((events[0] as ServicePointsEarned).data.pointsEarned).toBe(10);
    expect((events[1] as ServicePointsEarned).data.pointsEarned).toBe(5);
  });

  it('each ServicePointsEarned event carries earnedAt', async () => {
    await useCase.execute(makeDto());

    const events = eventBus.published.filter((e) => e instanceof ServicePointsEarned);
    for (const event of events as ServicePointsEarned[]) {
      expect(event.data.earnedAt).toBeDefined();
      expect(typeof event.data.earnedAt).toBe('string');
    }
  });

  it('skips guest bookings (customerId = null) with no side effects', async () => {
    const result = await useCase.execute(makeDto({ customerId: null }));

    expect(result.skipped).toBe(true);
    expect(entryRepo.entries).toHaveLength(0);
    expect(eventBus.published).toHaveLength(0);
  });

  it('is idempotent — second execution with same eventId is a no-op', async () => {
    await useCase.execute(makeDto());
    const second = await useCase.execute(makeDto());

    expect(second.skipped).toBe(true);
    expect(entryRepo.entries).toHaveLength(2);

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(15);
  });

  it('accumulates balance across multiple bookings', async () => {
    await useCase.execute(makeDto({ eventId: '00000000-0000-7000-8000-aaaaaaaaaaaa' }));
    await useCase.execute(
      makeDto({
        eventId: '00000000-0000-7000-8000-bbbbbbbbbbbb',
        bookingId: '00000000-0000-7000-8000-000000000099',
        lines: [
          {
            lineId: '00000000-0000-7000-8000-000000000020',
            serviceId: '00000000-0000-7000-8000-000000000005',
            pointsValueAtBooking: 20,
          },
        ],
      }),
    );

    const balance = await balanceRepo.findByCustomer(TENANT_ID, CUSTOMER_ID);
    expect(balance?.currentPoints).toBe(35);
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
});
