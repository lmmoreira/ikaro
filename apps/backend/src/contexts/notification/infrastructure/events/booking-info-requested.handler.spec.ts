import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingInfoRequestedEventBuilder } from '../../../../test/builders/booking/booking-info-requested-event.builder';
import { SendBookingInfoRequestedNotificationUseCase } from '../../application/use-cases/send-booking-info-requested-notification/send-booking-info-requested-notification.use-case';
import { BookingInfoRequestedHandler } from './booking-info-requested.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000013';

describe('BookingInfoRequestedHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingInfoRequestedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingInfoRequestedHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingInfoRequestedHandler(
      useCase as unknown as SendBookingInfoRequestedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('delegates to use case with correct dto fields', async () => {
    const event = new BookingInfoRequestedEventBuilder().withTenantId(TENANT_ID).build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.contactEmail).toBe('joao@example.com');
    expect(dto.contactName).toBe('João Silva');
    expect(dto.customerId).toBeNull();
    expect(dto.informationNeeded).toBe('Por favor envie fotos melhores do veículo');
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(
      handler.handle(new BookingInfoRequestedEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
