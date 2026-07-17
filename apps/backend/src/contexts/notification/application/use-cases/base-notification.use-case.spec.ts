import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryLocalizationPort } from '../../../../test/infrastructure/in-memory-localization.port';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { INotificationDispatcher, OutboundMessage } from '../ports/notification-dispatcher.port';
import { BaseNotificationUseCase } from './base-notification.use-case';

class TestNotificationUseCase extends BaseNotificationUseCase {
  localize(
    templates: NotificationTemplate[],
    localizationPort: InMemoryLocalizationPort,
    locale: string,
  ): void {
    this.localizeTemplates(templates, localizationPort, locale);
  }

  dispatchOne(
    templates: NotificationTemplate[],
    dto: { tenantId: string; eventId: string },
    to: string,
    variables: Record<string, string>,
  ): Promise<boolean> {
    return this.dispatchTemplates(templates, dto, to, variables);
  }

  dispatchMany(
    templates: NotificationTemplate[],
    dto: { tenantId: string; eventId: string },
    emails: string[],
    variables: Record<string, string>,
  ): Promise<boolean> {
    return this.dispatchTemplatesToMany(templates, dto, emails, variables);
  }
}

// Fails dispatch for a fixed set of recipients regardless of call order — used to prove
// per-recipient claim/retry behavior deterministically (InMemoryNotificationDispatcher's
// failNext only fails a single, order-dependent call).
class SelectiveFailDispatcher implements INotificationDispatcher {
  readonly dispatched: OutboundMessage[] = [];

  constructor(private readonly failingRecipients: Set<string>) {}

  async dispatch(message: OutboundMessage): Promise<void> {
    if (this.failingRecipients.has(message.to)) {
      throw new Error(`dispatch failed for ${message.to}`);
    }
    this.dispatched.push(message);
  }
}

function buildTemplate(triggerEvent: NotificationTemplateKey, id: string): NotificationTemplate {
  return NotificationTemplate.reconstitute({
    id,
    tenantId: null,
    triggerEvent,
    channel: 'EMAIL',
    locale: 'pt-BR',
    subject: 'Subject {{name}}',
    body: 'Body {{name}}',
    updatedAt: new Date(),
  });
}

describe('BaseNotificationUseCase.localizeTemplates', () => {
  let useCase: TestNotificationUseCase;
  let localizationPort: InMemoryLocalizationPort;

  beforeEach(() => {
    useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      new InMemoryInboxRepository(),
      new InMemoryNotificationDispatcher(),
      new InMemoryTransactionManager(),
    );
    localizationPort = new InMemoryLocalizationPort();
  });

  it('throws a descriptive error when triggerEvent has no entry in NOTIFICATION_TEMPLATE_KEY_MAPPING', () => {
    const template = NotificationTemplate.reconstitute({
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: null,
      triggerEvent: 'drifted-trigger-event' as NotificationTemplateKey,
      channel: 'EMAIL',
      locale: 'pt-BR',
      subject: 'subject',
      body: 'body',
      updatedAt: new Date(),
    });

    expect(() => useCase.localize([template], localizationPort, 'pt-BR')).toThrow(
      'No mapping found for trigger event "drifted-trigger-event"',
    );
  });

  it('overlays subject/body for every mapped template without throwing', () => {
    const template = NotificationTemplate.reconstitute({
      id: '00000000-0000-4000-8000-000000000002',
      tenantId: null,
      triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      channel: 'EMAIL',
      locale: 'pt-BR',
      subject: 'DB SUBJECT (unused)',
      body: 'DB BODY (unused)',
      updatedAt: new Date(),
    });
    localizationPort.setTemplate('BookingApproved:customer', {
      subject: 'Localized subject',
      body: 'Localized body',
    });

    useCase.localize([template], localizationPort, 'pt-BR');

    expect(template.subject).toBe('Localized subject');
    expect(template.body).toBe('Localized body');
  });
});

describe('BaseNotificationUseCase.dispatchTemplates (single recipient)', () => {
  const dto = { tenantId: 'tenant-1', eventId: '00000000-0000-4000-8000-0000000000e1' };

  it('dispatches, logs, and marks the claim on success', async () => {
    const dispatcher = new InMemoryNotificationDispatcher();
    const inboxRepo = new InMemoryInboxRepository();
    const logRepo = new InMemoryNotificationLogRepository();
    const useCase = new TestNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
    );
    const template = buildTemplate(
      NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      '00000000-0000-4000-8000-000000000010',
    );

    const sent = await useCase.dispatchOne([template], dto, 'customer@test.com', {
      name: 'Ana',
    });

    expect(sent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0]?.to).toBe('customer@test.com');
    expect(logRepo.all).toHaveLength(1);
    expect(await inboxRepo.hasBeenProcessed(dto.eventId, 'booking-approved-customer:EMAIL')).toBe(
      true,
    );
  });

  it('unclaims and rethrows on dispatch failure, leaving the claim open for retry', async () => {
    const dispatcher = new InMemoryNotificationDispatcher();
    dispatcher.failNext(new Error('smtp timeout'));
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
    );
    const template = buildTemplate(
      NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      '00000000-0000-4000-8000-000000000011',
    );

    await expect(
      useCase.dispatchOne([template], dto, 'customer@test.com', { name: 'Ana' }),
    ).rejects.toThrow('smtp timeout');

    expect(await inboxRepo.hasBeenProcessed(dto.eventId, 'booking-approved-customer:EMAIL')).toBe(
      false,
    );
  });
});

describe('BaseNotificationUseCase.dispatchTemplatesToMany (multi-recipient)', () => {
  const dto = { tenantId: 'tenant-1', eventId: '00000000-0000-4000-8000-0000000000e2' };
  const emails = ['a@test.com', 'b@test.com', 'c@test.com'];

  it('dispatches to every recipient and claims each one independently', async () => {
    const dispatcher = new InMemoryNotificationDispatcher();
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
    );
    const template = buildTemplate(
      NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      '00000000-0000-4000-8000-000000000020',
    );

    const sent = await useCase.dispatchMany([template], dto, emails, { name: 'Ana' });

    expect(sent).toBe(true);
    expect(dispatcher.dispatched.map((m) => m.to).sort()).toEqual([...emails].sort());
    for (const email of emails) {
      expect(
        await inboxRepo.hasBeenProcessed(dto.eventId, `booking-requested-admin:EMAIL:${email}`),
      ).toBe(true);
    }
  });

  it('continue-on-error: one failing recipient does not block the others, then throws once', async () => {
    const dispatcher = new SelectiveFailDispatcher(new Set(['a@test.com']));
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
    );
    const template = buildTemplate(
      NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      '00000000-0000-4000-8000-000000000021',
    );

    await expect(useCase.dispatchMany([template], dto, emails, { name: 'Ana' })).rejects.toThrow(
      'dispatch failed for a@test.com',
    );

    expect(dispatcher.dispatched.map((m) => m.to).sort()).toEqual(['b@test.com', 'c@test.com']);
    expect(
      await inboxRepo.hasBeenProcessed(dto.eventId, 'booking-requested-admin:EMAIL:a@test.com'),
    ).toBe(false);
    expect(
      await inboxRepo.hasBeenProcessed(dto.eventId, 'booking-requested-admin:EMAIL:b@test.com'),
    ).toBe(true);
    expect(
      await inboxRepo.hasBeenProcessed(dto.eventId, 'booking-requested-admin:EMAIL:c@test.com'),
    ).toBe(true);
  });

  it('throws an AggregateError when more than one recipient fails', async () => {
    const dispatcher = new SelectiveFailDispatcher(new Set(['a@test.com', 'b@test.com']));
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
    );
    const template = buildTemplate(
      NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      '00000000-0000-4000-8000-000000000022',
    );

    await expect(useCase.dispatchMany([template], dto, emails, { name: 'Ana' })).rejects.toThrow(
      AggregateError,
    );
  });

  it('retry only re-dispatches to the recipient that previously failed', async () => {
    const failingDispatcher = new SelectiveFailDispatcher(new Set(['a@test.com']));
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      failingDispatcher,
      new InMemoryTransactionManager(),
    );
    const template = buildTemplate(
      NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      '00000000-0000-4000-8000-000000000023',
    );

    await expect(useCase.dispatchMany([template], dto, emails, { name: 'Ana' })).rejects.toThrow();
    expect(failingDispatcher.dispatched.map((m) => m.to).sort()).toEqual([
      'b@test.com',
      'c@test.com',
    ]);

    // Simulate Pub/Sub redelivery of the same event: same eventId, same use case instance, but
    // this time the recipient's dispatch succeeds.
    const retryDispatcher = new SelectiveFailDispatcher(new Set());
    const retryUseCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      retryDispatcher,
      new InMemoryTransactionManager(),
    );

    const sent = await retryUseCase.dispatchMany([template], dto, emails, { name: 'Ana' });

    expect(sent).toBe(true);
    expect(retryDispatcher.dispatched.map((m) => m.to)).toEqual(['a@test.com']);
  });
});
