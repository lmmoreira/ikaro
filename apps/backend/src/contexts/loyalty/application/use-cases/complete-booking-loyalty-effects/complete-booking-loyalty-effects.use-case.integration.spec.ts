import { DataSource } from 'typeorm';
import { InMemoryTenantAccessPort } from '../../../../../test/infrastructure/in-memory-tenant-access.port';
import { TypeOrmTransactionManager } from '../../../../../shared/infrastructure/typeorm-transaction-manager';
import { createTestDataSource } from '../../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyPlatformPort } from '../../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { uuidv7 } from '../../../../../shared/domain/uuid-v7';
import { LoyaltyBalanceEntity } from '../../../infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../../../infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../../../infrastructure/entities/loyalty-redemption.entity';
import { InboxRecordEntity } from '../../../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmLoyaltyBalanceRepository } from '../../../infrastructure/repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from '../../../infrastructure/repositories/typeorm-loyalty-entry.repository';
import { TypeOrmLoyaltyRedemptionRepository } from '../../../infrastructure/repositories/typeorm-loyalty-redemption.repository';
import { TypeOrmInboxRepository } from '../../../../../shared/infrastructure/inbox/typeorm-inbox.repository';
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
  let inboxRepo: TypeOrmInboxRepository;

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    entryRepo = new TypeOrmLoyaltyEntryRepository(ds.getRepository(LoyaltyEntryEntity));
    balanceRepo = new TypeOrmLoyaltyBalanceRepository(ds.getRepository(LoyaltyBalanceEntity));
    redemptionRepo = new TypeOrmLoyaltyRedemptionRepository(
      ds.getRepository(LoyaltyRedemptionEntity),
    );
    inboxRepo = new TypeOrmInboxRepository(ds.getRepository(InboxRecordEntity));
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

    const failingPublisher = new InMemoryEventBus();
    failingPublisher.failNextPublish(new Error('outbox write failed'));
    const failingUseCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      inboxRepo,
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      failingPublisher,
      txManager,
      new InMemoryTenantAccessPort(),
    );

    await expect(failingUseCase.execute(dto)).rejects.toThrow('outbox write failed');

    // Nothing committed — the failed outbox write rolled back the whole transaction.
    expect(await balanceRepo.findByCustomer(tenantId, customerId)).toBeNull();
    expect(
      await inboxRepo.hasBeenProcessed(
        dto.eventId,
        CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
      ),
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
    const workingPublisher = new InMemoryEventBus();
    const retryUseCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      inboxRepo,
      new InMemoryLoyaltyPlatformPort().withPointsPerCurrencyUnit(10),
      workingPublisher,
      txManager,
      new InMemoryTenantAccessPort(),
    );

    const result = await retryUseCase.execute(dto);

    expect(result.skipped).toBe(false);
    expect(result.totalPointsEarned).toBe(10);
    expect(workingPublisher.published).toHaveLength(1);

    const balance = await balanceRepo.findByCustomer(tenantId, customerId);
    expect(balance!.currentPoints).toBe(10);
    expect(
      await inboxRepo.hasBeenProcessed(
        dto.eventId,
        CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
      ),
    ).toBe(true);
    const entriesAfterRetry = await entryRepo.findByCustomerPaginated(tenantId, customerId, 1, 20);
    expect(entriesAfterRetry.total).toBe(1);
  });

  // TD60-S02: the settings read fails closed. Before it, a missing tenant fell back to made-up defaults
  // (180 days, rate 0); now a failed read nacks the event and the redelivery uses the tenant's own values.
  it('writes nothing while the settings read fails, then the redelivery stores the tenant expiryDays and leaves another tenant alone', async () => {
    const tenantId = uuidv7();
    const otherTenantId = uuidv7();
    const customerId = uuidv7();
    const dto = makeDto(tenantId, customerId);
    const otherDto = makeDto(otherTenantId, customerId);
    const settings = new InMemoryLoyaltyPlatformPort()
      .withExpiryDays(90)
      .withPointsPerCurrencyUnit(10)
      .withFailureForTenant(tenantId);
    const useCase = new CompleteBookingLoyaltyEffectsUseCase(
      entryRepo,
      balanceRepo,
      redemptionRepo,
      inboxRepo,
      settings,
      new InMemoryEventBus(),
      txManager,
      new InMemoryTenantAccessPort(),
    );

    await expect(useCase.execute(dto)).rejects.toThrow('settings read failed');

    expect(await balanceRepo.findByCustomer(tenantId, customerId)).toBeNull();
    expect(
      await inboxRepo.hasBeenProcessed(
        dto.eventId,
        CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
      ),
    ).toBe(false);
    expect((await entryRepo.findByCustomerPaginated(tenantId, customerId, 1, 20)).total).toBe(0);
    expect((await redemptionRepo.findByCustomer(tenantId, customerId, 1, 20)).items).toHaveLength(
      0,
    );

    await useCase.execute(otherDto);
    settings.clearFailureForTenant(tenantId);
    await useCase.execute(dto);

    const { items } = await entryRepo.findByCustomerPaginated(tenantId, customerId, 1, 20);
    expect(items).toHaveLength(1);
    const days = (items[0].expiresAt.getTime() - items[0].earnedAt.getTime()) / 86_400_000;
    expect(days).toBe(90);
    const other = await entryRepo.findByCustomerPaginated(otherTenantId, customerId, 1, 20);
    expect(other.total).toBe(1);
  });
});
