import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingRequestedEventBuilder } from '../../../../test/builders/booking/booking-requested-event.builder';
import { SendBookingRequestedNotificationUseCase } from '../../application/use-cases/send-booking-requested-notification/send-booking-requested-notification.use-case';
import { BookingRequestedHandler } from './booking-requested.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('BookingRequestedHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingRequestedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingRequestedHandler;

  beforeEach(() => {
    useCase = {
      execute: jest.fn().mockResolvedValue({ adminEmailSent: true, customerEmailSent: true }),
    };
    eventBus = new InMemoryEventBus();
    handler = new BookingRequestedHandler(
      useCase as unknown as SendBookingRequestedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('delegates to use case with correct dto fields', async () => {
    const event = new BookingRequestedEventBuilder().withTenantId(TENANT_ID).build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.correlationId).toBe('corr-1');
    expect(dto.contactEmail).toBe('joao@example.com');
    expect(dto.contactName).toBe('João Silva');
    expect(dto.scheduledAt).toBe('2026-06-15T13:00:00.000Z');
    expect(dto.totalPrice).toEqual({ amount: '150.00', currency: 'BRL' });
    expect(dto.lines).toEqual([{ serviceNameAtBooking: 'Lavagem Completa' }]);
    expect(dto.pickupAddress).toBeNull();
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(
      handler.handle(new BookingRequestedEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
