import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { PointsExpiringSoon } from '../../../loyalty/domain/events/points-expiring-soon.event';
import { SendPointsExpiringSoonNotificationUseCase } from '../../application/use-cases/send-points-expiring-soon-notification/send-points-expiring-soon-notification.use-case';
import { PointsExpiringSoonHandler } from './points-expiring-soon.handler';

const TENANT_ID = 'aaaaaaaa-0020-4000-8000-000000001604';

const buildEvent = (): PointsExpiringSoon =>
  new PointsExpiringSoon(
    TENANT_ID,
    'corr-expiring-soon-1',
    {
      customerId: 'cccccccc-0001-4000-8000-000000001604',
      pointsExpiringSoon: 20,
      earliestExpiresAt: '2026-06-09T00:00:00.000Z',
    },
    '2026-06-02',
  );

describe('PointsExpiringSoonHandler', () => {
  let sendNotification: jest.Mocked<Pick<SendPointsExpiringSoonNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: PointsExpiringSoonHandler;

  beforeEach(() => {
    sendNotification = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new PointsExpiringSoonHandler(
      sendNotification as unknown as SendPointsExpiringSoonNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  afterEach(() => jest.resetAllMocks());

  it('delegates to use case with correct dto fields', async () => {
    const event = buildEvent();

    await handler.handle(event);

    expect(sendNotification.execute).toHaveBeenCalledTimes(1);
    const dto = sendNotification.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.correlationId).toBe('corr-expiring-soon-1');
    expect(dto.customerId).toBe('cccccccc-0001-4000-8000-000000001604');
    expect(dto.pointsExpiringSoon).toBe(20);
    expect(dto.earliestExpiresAt).toBe('2026-06-09T00:00:00.000Z');
  });

  it('rethrows errors from the use case', async () => {
    sendNotification.execute.mockRejectedValue(new Error('dispatch failure'));

    await expect(handler.handle(buildEvent())).rejects.toThrow('dispatch failure');
  });
});
