import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { LeadFormSubmissionReceivedEventBuilder } from '../../../../test/builders/platform';
import { LogLeadFormSubmissionReceivedUseCase } from '../../application/use-cases/log-lead-form-submission-received.use-case';
import { LeadFormSubmissionReceivedHandler } from './lead-form-submission-received.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-handler-test';
const SUBMISSION_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

function makeHandler(): {
  handler: LeadFormSubmissionReceivedHandler;
  useCase: LogLeadFormSubmissionReceivedUseCase;
  eventBus: InMemoryEventBus;
} {
  const eventBus = new InMemoryEventBus();
  const useCase = new LogLeadFormSubmissionReceivedUseCase(new InMemoryInboxRepository());
  const handler = new LeadFormSubmissionReceivedHandler(useCase, eventBus);
  return { handler, useCase, eventBus };
}

describe('LeadFormSubmissionReceivedHandler', () => {
  it('delegates to LogLeadFormSubmissionReceivedUseCase with the mapped fields', async () => {
    const { handler, useCase } = makeHandler();
    const executeSpy = jest.spyOn(useCase, 'execute');

    const event = new LeadFormSubmissionReceivedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withSubmissionId(SUBMISSION_ID)
      .withCustomerId(null)
      .build();

    await handler.handle(event);

    expect(executeSpy).toHaveBeenCalledWith({
      eventId: event.eventId,
      submissionId: SUBMISSION_ID,
      tenantId: TENANT_ID,
      customerId: null,
      correlationId: CORRELATION_ID,
    });
  });

  it('rethrows use case errors so Pub/Sub can nack and retry', async () => {
    const { handler, useCase } = makeHandler();
    jest.spyOn(useCase, 'execute').mockRejectedValue(new Error('boom'));

    const event = new LeadFormSubmissionReceivedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await expect(handler.handle(event)).rejects.toThrow('boom');
  });

  it('registers subscription on onModuleInit with the correct event and consumer name', () => {
    const { handler, eventBus } = makeHandler();

    handler.onModuleInit();

    expect(eventBus.subscriptions).toHaveLength(1);
    expect(eventBus.subscriptions[0]).toEqual(
      expect.objectContaining({
        eventName: 'LeadFormSubmissionReceived',
        consumerName: 'audit-log',
      }),
    );
  });
});
