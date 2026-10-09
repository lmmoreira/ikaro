import { AvailabilityAlertMatchedEventBuilder } from '../../../../test/builders/booking';
import { SendAvailabilityAlertMatchedNotificationUseCase } from '../../application/use-cases/send-availability-alert-matched-notification/send-availability-alert-matched-notification.use-case';
import { AvailabilityAlertMatchedNotificationHandler } from './availability-alert-matched.handler';

describe('AvailabilityAlertMatchedNotificationHandler', () => {
  const subscribe = jest.fn();
  const execute = jest.fn();
  const useCase = { execute } as unknown as SendAvailabilityAlertMatchedNotificationUseCase;
  let handler: AvailabilityAlertMatchedNotificationHandler;

  beforeEach(() => {
    jest.resetAllMocks();
    handler = new AvailabilityAlertMatchedNotificationHandler(useCase, {
      subscribe,
    } as never);
  });

  it('subscribes to AvailabilityAlertMatched with the notification consumer', () => {
    handler.onModuleInit();

    expect(subscribe).toHaveBeenCalledWith(
      'AvailabilityAlertMatched',
      expect.any(Function),
      'notification',
    );
  });

  it('calls exactly one use case with the event ids, window and correlation id', async () => {
    execute.mockResolvedValue({ emailSent: true });
    const event = new AvailabilityAlertMatchedEventBuilder()
      .withTenantId('tenant-1')
      .withCorrelationId('corr-1')
      .withAlertId('alert-1')
      .withResourceId('resource-1')
      .withDurationMinutes(90)
      .build();

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      eventId: event.eventId,
      correlationId: 'corr-1',
      customerId: event.data.customerId,
      serviceId: event.data.serviceId,
      alertId: 'alert-1',
      matchingWindowStart: event.data.matchingWindowStart,
      matchingWindowEnd: event.data.matchingWindowEnd,
      resourceId: 'resource-1',
      durationMinutes: 90,
    });
  });

  it('rethrows a failure so the message is nacked', async () => {
    execute.mockRejectedValue(new Error('smtp down'));

    await expect(
      handler.handle(new AvailabilityAlertMatchedEventBuilder().build()),
    ).rejects.toThrow('smtp down');
  });
});
