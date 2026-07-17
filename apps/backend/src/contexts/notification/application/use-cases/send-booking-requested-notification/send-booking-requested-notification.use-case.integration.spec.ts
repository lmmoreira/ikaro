import { DataSource } from 'typeorm';
import { InboxRecordEntity } from '../../../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmInboxRepository } from '../../../../../shared/infrastructure/inbox/typeorm-inbox.repository';
import { createTestDataSource } from '../../../../../test/test-datasource';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingRequestedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { INotificationDispatcher, OutboundMessage } from '../../ports/notification-dispatcher.port';
import { NotificationTemplateBuilder } from '../../../../../test/builders/notification/notification-template.builder';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingRequestedNotificationUseCase } from './send-booking-requested-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0005-4000-8000-000000000001';

// Fails dispatch for a fixed set of recipients regardless of call order — deterministic proof of
// which recipient(s) actually failed, unlike InMemoryNotificationDispatcher's order-dependent
// single-shot failNext().
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

// AUD-004 item 3: proves the per-recipient inbox claim against a REAL Postgres instance — a
// redelivery of the same eventId must skip recipients who already succeeded (cheap tryClaim-false
// no-op) and only re-dispatch to the recipient whose send actually failed.
describe('SendBookingRequestedNotificationUseCase — multi-recipient partial-failure retry (integration)', () => {
  let ds: DataSource;
  let inboxRepo: TypeOrmInboxRepository;

  beforeAll(async () => {
    ds = await createTestDataSource();
    inboxRepo = new TypeOrmInboxRepository(ds.getRepository(InboxRecordEntity));
  });

  afterAll(async () => {
    await ds.destroy();
  });

  function makeUseCase(
    dispatcher: INotificationDispatcher,
  ): SendBookingRequestedNotificationUseCase {
    const tenantPort = new InMemoryNotificationPlatformPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    const staffPort = new InMemoryNotificationStaffPort();
    staffPort.setManagerEmails(TENANT_ID, [
      'mgr1@lavacar.com.br',
      'mgr2@lavacar.com.br',
      'mgr3@lavacar.com.br',
    ]);
    const templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .withTenantId(TENANT_ID)
        .withTriggerEvent(NotificationTemplateKey.BOOKING_REQUESTED_ADMIN)
        .withChannel('EMAIL')
        .withSubject('unused — sourced from ILocalizationPort')
        .withBody('unused')
        .build(),
    );
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .withTenantId(TENANT_ID)
        .withTriggerEvent(NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER)
        .withChannel('EMAIL')
        .withSubject('unused — sourced from ILocalizationPort')
        .withBody('unused')
        .build(),
    );
    const localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('BookingRequested:admin', {
      subject: 'Nova solicitação',
      body: '<p>Cliente: {{contactName}}</p>',
    });
    localizationPort.setTemplate('BookingRequested:customer', {
      subject: 'Agendamento recebido',
      body: '<p>Olá, {{contactName}}!</p>',
    });

    return new SendBookingRequestedNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
    );
  }

  it('a redelivery after one recipient fails only re-dispatches to that recipient', async () => {
    const dto = new SendBookingRequestedNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0005-4000-8000-000000000001')
      .build();

    const firstAttemptDispatcher = new SelectiveFailDispatcher(new Set(['mgr2@lavacar.com.br']));
    const firstUseCase = makeUseCase(firstAttemptDispatcher);

    await expect(firstUseCase.execute(dto)).rejects.toThrow(
      'dispatch failed for mgr2@lavacar.com.br',
    );

    // mgr1 and mgr3 succeeded on the first pass — continue-on-error means they were attempted
    // even though mgr2 failed later in the same dispatchTemplatesToMany call. The customer
    // dispatch (a separate statement in execute(), after the admin dispatch) is never reached
    // because dispatchTemplatesToMany throws once it's done with all 3 admin recipients.
    expect(firstAttemptDispatcher.dispatched.map((m) => m.to).sort()).toEqual(
      ['mgr1@lavacar.com.br', 'mgr3@lavacar.com.br'].sort(),
    );

    // Simulate Pub/Sub redelivering the same event after the nack: a fresh use case instance
    // (as a new handler invocation would construct), same eventId, no failures this time.
    const retryDispatcher = new SelectiveFailDispatcher(new Set());
    const retryUseCase = makeUseCase(retryDispatcher);

    const result = await retryUseCase.execute(dto);

    expect(result.adminEmailSent).toBe(true);
    expect(result.customerEmailSent).toBe(true); // never reached on the first attempt — not skipped
    // Only mgr2 should be re-dispatched among admins; mgr1/mgr3 are already claimed. The customer
    // dispatches for the first time here, since it was never attempted on the first pass.
    expect(retryDispatcher.dispatched.map((m) => m.to)).toEqual([
      'mgr2@lavacar.com.br',
      'joao@example.com',
    ]);
  });
});
