import {
  FutureCommitmentExceptionDismissedEventBuilder,
  FutureCommitmentExceptionRaisedEventBuilder,
  FutureCommitmentExceptionResolvedEventBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LogFutureCommitmentExceptionEventUseCase } from '../../application/use-cases/log-future-commitment-exception-event.use-case';
import { FutureCommitmentExceptionEventsHandler } from './future-commitment-exception-events.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = 'corr-fce-handler-test';

describe('FutureCommitmentExceptionEventsHandler', () => {
  let handler: FutureCommitmentExceptionEventsHandler;
  let useCase: jest.Mocked<Pick<LogFutureCommitmentExceptionEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new FutureCommitmentExceptionEventsHandler(
      useCase as unknown as LogFutureCommitmentExceptionEventUseCase,
      eventBus,
    );
  });

  it('subscribes to all 3 event types with the audit-log consumer name on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');
    handler.onModuleInit();

    for (const eventName of [
      'FutureCommitmentExceptionRaised',
      'FutureCommitmentExceptionResolved',
      'FutureCommitmentExceptionDismissed',
    ]) {
      expect(spy).toHaveBeenCalledWith(
        eventName,
        expect.any(Function),
        LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME,
      );
    }
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('calls the log use case exactly once with the correct DTO for FutureCommitmentExceptionRaised', async () => {
    const event = new FutureCommitmentExceptionRaisedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventName: 'FutureCommitmentExceptionRaised',
      tenantId: TENANT_ID,
      exceptionId: event.data.exceptionId,
      correlationId: CORRELATION_ID,
    });
  });

  it('handles FutureCommitmentExceptionResolved', async () => {
    const event = new FutureCommitmentExceptionResolvedEventBuilder()
      .withTenantId(TENANT_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'FutureCommitmentExceptionResolved' }),
    );
  });

  it('handles FutureCommitmentExceptionDismissed', async () => {
    const event = new FutureCommitmentExceptionDismissedEventBuilder()
      .withTenantId(TENANT_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'FutureCommitmentExceptionDismissed' }),
    );
  });

  it('rethrows when the use case fails so the message is nacked', async () => {
    const event = new FutureCommitmentExceptionRaisedEventBuilder().build();
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(event)).rejects.toThrow(error);
  });
});
