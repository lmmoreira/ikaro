import { AvailabilityAlertMatched } from '../../../booking/domain/events/availability-alert-matched.event';
import { SendAvailabilityAlertMatchedNotificationUseCase } from '../../application/use-cases/send-availability-alert-matched-notification/send-availability-alert-matched-notification.use-case';
import { AvailabilityAlertMatchedNotificationHandler } from './availability-alert-matched.handler';

function buildEvent(): AvailabilityAlertMatched {
  return new AvailabilityAlertMatched('tenant-1', 'corr-1', {
    alertId: 'alert-1',
    customerId: 'customer-1',
    serviceId: 'service-1',
    matchingWindowStart: '2030-03-04T13:00:00.000Z',
    matchingWindowEnd: '2030-03-04T14:00:00.000Z',
    resourceId: null,
  });
}

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
    const event = buildEvent();

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      eventId: event.eventId,
      correlationId: 'corr-1',
      customerId: 'customer-1',
      serviceId: 'service-1',
      alertId: 'alert-1',
      matchingWindowStart: '2030-03-04T13:00:00.000Z',
      matchingWindowEnd: '2030-03-04T14:00:00.000Z',
    });
  });

  it('rethrows a failure so the message is nacked', async () => {
    execute.mockRejectedValue(new Error('smtp down'));

    await expect(handler.handle(buildEvent())).rejects.toThrow('smtp down');
  });
});
