import { DataSource } from 'typeorm';
import { IOutboxPublisher } from '../../../../../shared/ports/outbox-publisher.port';
import { TypeOrmTransactionManager } from '../../../../../shared/infrastructure/typeorm-transaction-manager';
import { createTestDataSource } from '../../../../../test/test-datasource';
import { InMemoryLoyaltyPlatformPort } from '../../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { uuidv7 } from '../../../../../shared/domain/uuid-v7';
import { LoyaltyBalanceEntity } from '../../../infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../../../infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../../../infrastructure/entities/loyalty-redemption.entity';
import { ProcessedEventEntity } from '../../../infrastructure/entities/processed-event.entity';
import { TypeOrmLoyaltyBalanceRepository } from '../../../infrastructure/repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from '../../../infrastructure/repositories/typeorm-loyalty-entry.repository';
import { TypeOrmLoyaltyRedemptionRepository } from '../../../infrastructure/repositories/typeorm-loyalty-redemption.repository';
import { TypeOrmProcessedEventRepository } from '../../../infrastructure/repositories/typeorm-processed-event.repository';
import {
  CompleteBookingLoyaltyEffectsUseCase,
  CompleteBookingLoyaltyEffectsUseCaseInput,
} from './complete-booking-loyalty-effects.use-case';

// TD08 §12.3 / TD24-S03: before this story, ServicePointsEarned was published AFTER the
// entries/balance/markProcessed transaction committed — a crash or a failed publish between the
// two left the event permanently lost, since hasBeenProcessed() short-circuits any BookingCompleted
// redelivery. This spec proves the fix: the publish now lives inside the same transaction, so a
// failure there rolls back everything together, and a redelivery (same eventId) completes both.
describe('CompleteBookingLoyaltyEffectsUseCase (integration, TD24-S03 §12.3 re-emit atomicity)', () => {
  let ds: DataSource;
  let txManager: TypeOrmTransactionManager;
  let entryRepo: TypeOrmLoyaltyEntryRepository;
  let balanceRepo: TypeOrmLoyaltyBalanceRepository;
  let redemptionRepo: TypeOrmLoyaltyRedemptionRepository;
  let processedEventRepo: TypeOrmProcessedEventRepository;

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    entryRepo = new TypeOrmLoyaltyEntryRepository(ds.getRepository(LoyaltyEntryEntity));
    balanceRepo = new TypeOrmLoyaltyBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));
    redemptionRepo = new TypeOrmLoyaltyRedemptionRepository(
      ds.getRepository(LoyaltyRedemptionEntity),
    );
    processedEventRepo = new TypeOrmProcessedEventRepository(
      ds.getRepository(ProcessedEventEntity),
    );
  });

  afterAll(async () => {
    await ds.destroy();
  });

  function makeDto(
    tenantId: string,
    customerId: string,
  ): CompleteBookingLoyaltyEffectsUseCaseInput {
    return {
      tenantId,
      eventId: uuidv7(),
      correlationId: uuidv7(),
      customerId,
      bookingId: uuidv7(),
      completedBy: uuidv7(),
      lines: [
        {
          lineId: uuidv7(),
          serviceId: uuidv7(),
          pointsValueAtBooking: 10,
        },
      ],
    };
  }

  it('rolls back entries/balance/markProcessed together when the outbox publish fails, then redelivery completes both', async () => {
    const tenantId = uuidv7();
    const customerId = uuidv7();
    const dto = makeDto(tenantId, customerId);

    const failingPublisher: IOutboxPublisher = {
      publish: jest.fn().mockRejectedValue(new Error('outbox write failed')),
    };
    const failingUseCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      processedEventRepo,
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      failingPublisher,
      txManager,
    );

    await expect(failingUseCase.execute(dto)).rejects.toThrow('outbox write failed');

    // Nothing committed — the failed outbox write rolled back the whole transaction.
    expect(await balanceRepo.findByCustomer(tenantId, customerId)).toBeNull();
    expect(
      await processedEventRepo.hasBeenProcessed(dto.eventId, 'COMPLETE_BOOKING_LOYALTY_EFFECTS'),
    ).toBe(false);
    const entriesAfterFailure = await entryRepo.findByCustomerPaginated(
      tenantId,
      customerId,
      1,
      20,
    );
    expect(entriesAfterFailure.total).toBe(0);

    // Redelivery (same eventId): hasBeenProcessed() is still false, so BookingCompleted's
    // redelivery is not short-circuited — this time the outbox publish succeeds too.
    const workingPublisher: IOutboxPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const retryUseCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      processedEventRepo,
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      workingPublisher,
      txManager,
    );

    const result = await retryUseCase.execute(dto);

    expect(result.skipped).toBe(false);
    expect(result.totalPointsEarned).toBe(10);
    expect(workingPublisher.publish).toHaveBeenCalledTimes(1);

    const balance = await balanceRepo.findByCustomer(tenantId, customerId);
    expect(balance!.currentPoints).toBe(10);
    expect(
      await processedEventRepo.hasBeenProcessed(dto.eventId, 'COMPLETE_BOOKING_LOYALTY_EFFECTS'),
    ).toBe(true);
    const entriesAfterRetry = await entryRepo.findByCustomerPaginated(tenantId, customerId, 1, 20);
    expect(entriesAfterRetry.total).toBe(1);
  });
});
