import { AppLogger } from '../../observability/app-logger';
import { InMemoryInboxRepository } from '../../../test/infrastructure/in-memory-inbox.repository';
import { LogDomainEventUseCase } from './log-domain-event.use-case';

const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000036';
const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000036';
const TENANT_B_ID = 'bbbbbbbb-0000-4000-8000-000000000036';
const CORRELATION_ID = '00000000-0000-4000-8000-000000000036';
const OCCURRED_AT = '2026-10-08T12:00:00.000Z';

function makeUseCase(): { useCase: LogDomainEventUseCase; inboxRepo: InMemoryInboxRepository } {
  const inboxRepo = new InMemoryInboxRepository();
  return { useCase: new LogDomainEventUseCase(inboxRepo), inboxRepo };
}

function baseInput(
  overrides: Partial<{ eventId: string; eventName: string; tenantId: string }> = {},
) {
  return {
    eventId: EVENT_ID,
    eventName: 'BookingApproved',
    tenantId: TENANT_ID,
    occurredAt: OCCURRED_AT,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('LogDomainEventUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is the audit-log consumer', () => {
    expect(LogDomainEventUseCase.CONSUMER_NAME).toBe('audit-log');
  });

  it('logs the event name with the envelope fields and claims the event', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith('BookingApproved received', {
      tenantId: TENANT_ID,
      eventId: EVENT_ID,
      occurredAt: OCCURRED_AT,
      correlationId: CORRELATION_ID,
    });
    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogDomainEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(true);
  });

  it('logs each event name distinctly', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();

    await useCase.execute(baseInput({ eventId: 'e1', eventName: 'StaffActivated' }));
    await useCase.execute(baseInput({ eventId: 'e2', eventName: 'ServicePointsEarned' }));

    expect(logSpy).toHaveBeenNthCalledWith(1, 'StaffActivated received', expect.anything());
    expect(logSpy).toHaveBeenNthCalledWith(2, 'ServicePointsEarned received', expect.anything());
  });

  it('logs only envelope fields — never event data, even when a caller passes it along', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();
    const input = {
      ...baseInput(),
      data: { contactEmail: 'customer@example.com' },
    } as unknown as ReturnType<typeof baseInput>;

    await useCase.execute(input);

    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('customer@example.com');
    expect(Object.keys(logSpy.mock.calls[0][1] as object).sort()).toEqual([
      'correlationId',
      'eventId',
      'occurredAt',
      'tenantId',
    ]);
  });

  it('is idempotent: a redelivered eventId is not logged a second time', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();

    await useCase.execute(baseInput());
    await useCase.execute(baseInput());

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('unclaims and rethrows when the log call itself fails, so a redelivery can retry', async () => {
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => {
      throw new Error('logger backend unavailable');
    });
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).rejects.toThrow('logger backend unavailable');

    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogDomainEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(false);
  });

  it("logs the tenantId of the event it was given, never another tenant's", async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();

    await useCase.execute(baseInput({ eventId: 'tenant-a' }));
    await useCase.execute(baseInput({ eventId: 'tenant-b', tenantId: TENANT_B_ID }));

    expect(logSpy.mock.calls.map((call) => (call[1] as { tenantId: string }).tenantId)).toEqual([
      TENANT_ID,
      TENANT_B_ID,
    ]);
  });
});
