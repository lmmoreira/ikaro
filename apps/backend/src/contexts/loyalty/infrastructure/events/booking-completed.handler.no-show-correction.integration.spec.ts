import { DataSource } from 'typeorm';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyPlatformPort } from '../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { BookingStatus } from '../../../booking/domain/booking.aggregate';
import { BookingCompleted } from '../../../booking/domain/events/booking-completed.event';
import { CompleteBookingLoyaltyEffectsUseCase } from '../../application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../entities/loyalty-redemption.entity';
import { InboxRecordEntity } from '../../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmLoyaltyBalanceRepository } from '../repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from '../repositories/typeorm-loyalty-entry.repository';
import { TypeOrmLoyaltyRedemptionRepository } from '../repositories/typeorm-loyalty-redemption.repository';
import { TypeOrmInboxRepository } from '../../../../shared/infrastructure/inbox/typeorm-inbox.repository';
import { BookingCompletedHandler } from './booking-completed.handler';

// UC-074 A3 — a manager's correction of a no-show completes the booking and publishes
// BookingCompleted; the existing Loyalty consumer must award the service points exactly once, at
// the correction. The original BookingNoShow must never reach Loyalty.
describe('BookingCompletedHandler — no-show correction (integration, M23-S09)', () => {
  let ds: DataSource;
  let eventBus: InMemoryEventBus;
  let loyaltyOutbox: InMemoryEventBus;
  let handler: BookingCompletedHandler;
  let entryRepo: TypeOrmLoyaltyEntryRepository;
  let balanceRepo: TypeOrmLoyaltyBalanceRepository;

  beforeAll(async () => {
    ds = await createTestDataSource();
    entryRepo = new TypeOrmLoyaltyEntryRepository(ds.getRepository(LoyaltyEntryEntity));
    balanceRepo = new TypeOrmLoyaltyBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));
    eventBus = new InMemoryEventBus();
    loyaltyOutbox = new InMemoryEventBus();
    const useCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      new TypeOrmLoyaltyRedemptionRepository(ds.getRepository(LoyaltyRedemptionEntity)),
      new TypeOrmInboxRepository(ds.getRepository(InboxRecordEntity)),
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      loyaltyOutbox,
      new TypeOrmTransactionManager(ds),
    );
    handler = new BookingCompletedHandler(useCase, eventBus);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('awards the service points exactly once when the no-show is corrected to COMPLETED', async () => {
    const tenantId = uuidv7();
    const customerId = uuidv7();
    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withStatus(BookingStatus.NO_SHOW)
      .build();
    const expectedPoints = booking.lines.reduce((sum, l) => sum + l.pointsValueAtBooking, 0);

    booking.correctNoShow({ type: 'MANAGER', id: uuidv7() }, uuidv7(), 'Marked by mistake');
    const event = booking.domainEvents[0] as BookingCompleted;
    await handler.handle(event);
    await handler.handle(event); // at-least-once redelivery must not double-award

    expect(expectedPoints).toBeGreaterThan(0);
    const balance = await balanceRepo.findByCustomer(tenantId, customerId);
    expect(balance!.currentPoints).toBe(expectedPoints);
    const entries = await entryRepo.findByCustomerPaginated(tenantId, customerId, 1, 20);
    expect(entries.total).toBe(booking.lines.length);
    expect(loyaltyOutbox.published).toHaveLength(1); // the redelivery emitted no second follow-on event
  });

  it('never subscribes to BookingNoShow — a no-show awards nothing', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions.map((s) => s.eventName)).toEqual(['BookingCompleted']);
  });
});
