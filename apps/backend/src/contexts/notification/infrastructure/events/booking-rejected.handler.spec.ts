import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingRejectedEventBuilder } from '../../../../test/builders/booking/booking-rejected-event.builder';
import { SendBookingRejectedNotificationUseCase } from '../../application/use-cases/send-booking-rejected-notification/send-booking-rejected-notification.use-case';
import { BookingRejectedHandler } from './booking-rejected.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000012';

describe('BookingRejectedHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingRejectedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingRejectedHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingRejectedHandler(
      useCase as unknown as SendBookingRejectedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('delegates to use case with correct dto fields', async () => {
    const event = new BookingRejectedEventBuilder().withTenantId(TENANT_ID).build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.contactEmail).toBe('joao@example.com');
    expect(dto.contactName).toBe('João Silva');
    expect(dto.reason).toBe('Horário indisponível para os serviços selecionados');
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(
      handler.handle(new BookingRejectedEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
