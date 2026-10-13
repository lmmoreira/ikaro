import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ResourceDeactivationImpactRaisedEventBuilder } from '../../../../test/builders/booking/resource-deactivation-impact-raised-event.builder';
import { SendResourceDeactivationImpactNotificationUseCase } from '../../application/use-cases/send-resource-deactivation-impact-notification/send-resource-deactivation-impact-notification.use-case';
import { ResourceDeactivationImpactRaised } from '../../../booking/domain/events/resource-deactivation-impact-raised.event';
import { ResourceDeactivationImpactHandler } from './resource-deactivation-impact.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('ResourceDeactivationImpactHandler', () => {
  let useCase: jest.Mocked<Pick<SendResourceDeactivationImpactNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: ResourceDeactivationImpactHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ adminEmailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new ResourceDeactivationImpactHandler(
      useCase as unknown as SendResourceDeactivationImpactNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes to ResourceDeactivationImpactRaised only, as the notification consumer', () => {
    expect(eventBus.subscriptions.map((s) => [s.eventName, s.consumerName])).toEqual([
      [ResourceDeactivationImpactRaised.name, 'notification'],
    ]);
  });

  it('calls exactly one use case with the event ids, the resource name and the count', async () => {
    const event = new ResourceDeactivationImpactRaisedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId('corr-from-event')
      .withResourceName('Sala 1')
      .withAffectedCount(11)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: event.eventId,
      correlationId: 'corr-from-event',
      resourceName: 'Sala 1',
      affectedCount: 11,
    });
  });

  it('rethrows errors from the use case so the message is retried', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(
        new ResourceDeactivationImpactRaisedEventBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('use case failure');
  });
});
