import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingApprovedEventBuilder } from '../../../../test/builders/booking/booking-approved-event.builder';
import { SendBookingApprovedNotificationUseCase } from '../../application/use-cases/send-booking-approved-notification/send-booking-approved-notification.use-case';
import { BookingApprovedHandler } from './booking-approved.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('BookingApprovedHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingApprovedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingApprovedHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingApprovedHandler(
      useCase as unknown as SendBookingApprovedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('delegates to use case with correct dto fields', async () => {
    const event = new BookingApprovedEventBuilder().withTenantId(TENANT_ID).build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.correlationId).toBe('corr-approved-1');
    expect(dto.contactEmail).toBe('joao@example.com');
    expect(dto.contactName).toBe('João Silva');
    expect(dto.approvedSlot).toEqual({
      startTime: '2026-06-15T16:00:00.000Z',
      endTime: '2026-06-15T17:00:00.000Z',
    });
    expect(dto.totalPrice).toEqual({ amount: '150.00', currency: 'BRL' });
    expect(dto.lineSummary).toHaveLength(1);
    expect(dto.lineSummary[0].serviceNameAtBooking).toBe('Lavagem Completa');
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(
      handler.handle(new BookingApprovedEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
