import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingNoShowEventBuilder } from '../../../../test/builders/booking/booking-no-show-event.builder';
import { SendBookingNoShowNotificationUseCase } from '../../application/use-cases/send-booking-no-show-notification/send-booking-no-show-notification.use-case';
import { BookingNoShow } from '../../../booking/domain/events/booking-no-show.event';
import { BookingNoShowHandler } from './booking-no-show.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('BookingNoShowHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingNoShowNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingNoShowHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ customerEmailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingNoShowHandler(
      useCase as unknown as SendBookingNoShowNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes to BookingNoShow only, as the notification consumer', () => {
    expect(eventBus.subscriptions.map((s) => [s.eventName, s.consumerName])).toEqual([
      [BookingNoShow.name, 'notification'],
    ]);
  });

  it('calls exactly one use case and passes the event ids and the booking contact snapshot', async () => {
    const event = new BookingNoShowEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId('corr-from-event')
      .withContactEmail('guest@example.com')
      .withContactName('Visitante')
      .withScheduledAt('2026-06-01T12:00:00.000Z')
      .withServiceNames(['Lavagem completa', 'Polimento'])
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: event.eventId,
      correlationId: 'corr-from-event',
      contactEmail: 'guest@example.com',
      contactName: 'Visitante',
      scheduledAt: '2026-06-01T12:00:00.000Z',
      lineSummary: event.data.lineSummary,
    });
  });

  it('passes a pre-snapshot payload through unchanged so the use case can skip it', async () => {
    const event = new BookingNoShowEventBuilder().withTenantId(TENANT_ID).asLegacyPayload().build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: event.eventId,
      correlationId: event.correlationId,
      contactEmail: undefined,
      contactName: undefined,
      scheduledAt: undefined,
      lineSummary: undefined,
    });
  });

  it('never hands the internal reason to the use case', async () => {
    const event = new BookingNoShowEventBuilder()
      .withTenantId(TENANT_ID)
      .withReason('Cliente não atendeu o telefone')
      .build();

    await handler.handle(event);

    expect(JSON.stringify(useCase.execute.mock.calls[0][0])).not.toContain('atendeu');
  });

  it('rethrows errors from the use case so the message is retried', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(new BookingNoShowEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
