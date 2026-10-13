import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingResourceReassignedEventBuilder } from '../../../../test/builders/booking/booking-resource-reassigned-event.builder';
import { SendBookingResourceReassignedNotificationUseCase } from '../../application/use-cases/send-booking-resource-reassigned-notification/send-booking-resource-reassigned-notification.use-case';
import { BookingResourceReassigned } from '../../../booking/domain/events/booking-resource-reassigned.event';
import { BookingResourceReassignedHandler } from './booking-resource-reassigned.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('BookingResourceReassignedHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingResourceReassignedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingResourceReassignedHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ customerEmailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingResourceReassignedHandler(
      useCase as unknown as SendBookingResourceReassignedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes to BookingResourceReassigned only, as the notification consumer', () => {
    expect(eventBus.subscriptions.map((s) => [s.eventName, s.consumerName])).toEqual([
      [BookingResourceReassigned.name, 'notification'],
    ]);
  });

  it('calls exactly one use case and passes the event ids and the booking contact snapshot', async () => {
    const event = new BookingResourceReassignedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId('corr-from-event')
      .withContactEmail('guest@example.com')
      .withContactName('Visitante')
      .withServiceNames(['Consulta', 'Retorno'])
      .withNewResourceName('Sala 2')
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: event.eventId,
      correlationId: 'corr-from-event',
      contactEmail: 'guest@example.com',
      contactName: 'Visitante',
      slot: event.data.slot,
      lineSummary: event.data.lineSummary,
      newResourceName: 'Sala 2',
    });
  });

  it('passes a null resource name through unchanged', async () => {
    const event = new BookingResourceReassignedEventBuilder()
      .withTenantId(TENANT_ID)
      .withNewResourceName(null)
      .build();

    await handler.handle(event);

    expect(useCase.execute.mock.calls[0][0].newResourceName).toBeNull();
  });

  it('rethrows errors from the use case so the message is retried', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(new BookingResourceReassignedEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
