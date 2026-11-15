import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing/subscription-suspended-event.builder';
import { BookingBuilder } from '../../../../test/builders/booking';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingStatus } from '../../domain/booking.aggregate';
import { TenantUnavailableNoticeDue } from '../../domain/commands/tenant-unavailable-notice-due.command';
import { RaiseTenantUnavailableNoticesUseCase } from '../../application/use-cases/raise-tenant-unavailable-notices.use-case';
import { SubscriptionSuspendedTenantUnavailableHandler } from './subscription-suspended-tenant-unavailable.handler';

const TENANT_ID = 'aaaaaaaa-0028-4000-8000-0000000000c1';
const CUSTOMER_ID = 'cccccccc-0001-4000-8000-0000000028c1';

function makeHandler(): {
  handler: SubscriptionSuspendedTenantUnavailableHandler;
  useCase: RaiseTenantUnavailableNoticesUseCase;
  bookingRepo: InMemoryBookingRepository;
  outbox: InMemoryOutboxPublisher;
  eventBus: InMemoryEventBus;
} {
  const txManager = new InMemoryTransactionManager();
  const bookingRepo = new InMemoryBookingRepository();
  const outbox = new InMemoryOutboxPublisher(txManager);
  const useCase = new RaiseTenantUnavailableNoticesUseCase(bookingRepo, outbox, txManager);
  const eventBus = new InMemoryEventBus();
  const handler = new SubscriptionSuspendedTenantUnavailableHandler(useCase, eventBus);
  return { handler, useCase, bookingRepo, outbox, eventBus };
}

describe('SubscriptionSuspendedTenantUnavailableHandler', () => {
  it('delegates to the use case and publishes one command carrying the event correlation id', async () => {
    const { handler, bookingRepo, outbox } = makeHandler();
    await bookingRepo.save(
      new BookingBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
        .build(),
    );
    const event = new SubscriptionSuspendedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId('corr-handler-28')
      .build();

    await handler.handle(event);

    const [command] = outbox.published as TenantUnavailableNoticeDue[];
    expect(outbox.published).toHaveLength(1);
    expect(command.data.customerId).toBe(CUSTOMER_ID);
    expect(command.correlationId).toBe('corr-handler-28');
    expect(command.dedupKey).toContain(event.eventId);
  });

  it('calls the use case exactly once and rethrows on failure so Pub/Sub can nack and retry', async () => {
    const { handler, useCase } = makeHandler();
    const executeSpy = jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(new SubscriptionSuspendedEventBuilder().build())).rejects.toThrow(
      'boom',
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('subscribes to SubscriptionSuspended under its own consumer name', () => {
    const { handler, eventBus } = makeHandler();

    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'SubscriptionSuspended',
        consumerName: 'fan-out-tenant-unavailable-notice',
      }),
    ]);
  });
});
