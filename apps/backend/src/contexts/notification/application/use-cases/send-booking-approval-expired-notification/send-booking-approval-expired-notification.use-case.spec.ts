import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  SendBookingApprovalExpiredNotificationUseCase,
  SendBookingApprovalExpiredNotificationUseCaseInput,
} from './send-booking-approval-expired-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

function input(
  overrides: Partial<SendBookingApprovalExpiredNotificationUseCaseInput> = {},
): SendBookingApprovalExpiredNotificationUseCaseInput {
  return {
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    correlationId: 'corr-expired-1',
    contactEmail: 'maria@example.com',
    contactName: 'Maria Souza',
    // 15:30 in America/Sao_Paulo
    scheduledAt: '2026-06-01T18:30:00.000Z',
    lineSummary: [{ serviceNameAtBooking: 'Sala de reunião' }],
    ...overrides,
  };
}

describe('SendBookingApprovalExpiredNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingApprovalExpiredNotificationUseCase;

  function setTenant(tenantId: string, overrides: { locale?: string; name?: string } = {}): void {
    tenantPort.setTenantInfo(tenantId, {
      id: tenantId,
      name: overrides.name ?? 'Espaço Central',
      slug: 'espaco',
      hotsiteUrl: 'https://app.example.com/espaco',
      timezone: 'America/Sao_Paulo',
      locale: overrides.locale ?? 'pt-BR',
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
  }

  function seedTemplate(tenantId: string): void {
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId,
        triggerEvent: NotificationTemplateKey.BOOKING_APPROVAL_EXPIRED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
  }

  function build(): SendBookingApprovalExpiredNotificationUseCase {
    return new SendBookingApprovalExpiredNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
    );
  }

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    tenantPort = new InMemoryNotificationPlatformPort();
    setTenant(TENANT_ID);
    templateRepo = new InMemoryNotificationTemplateRepository();
    seedTemplate(TENANT_ID);
    useCase = build();
  });

  it('sends the pt-BR email saying the request expired unanswered and nothing was booked', async () => {
    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: true });
    expect(dispatcher.dispatched).toHaveLength(1);
    const message = dispatcher.dispatched[0];
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe('Sua solicitação de agendamento expirou sem resposta');
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('Sala de reunião');
    expect(message.body).toContain('01/06/2026');
    expect(message.body).toContain('15:30');
    expect(message.body).toContain('Espaço Central');
    expect(message.body).toContain('nada foi agendado');
    expect(message.body).toContain('nova solicitação');
    expect(message.body).not.toContain('{{');
    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-approval-expired-customer');
  });

  it('sends the English email to a tenant whose locale is en', async () => {
    setTenant(TENANT_ID, { locale: 'en' });

    await useCase.execute(input());

    const message = dispatcher.dispatched[0];
    expect(message.subject).toBe('Your booking request expired without a reply');
    expect(message.body).toContain('Hello, Maria Souza!');
    expect(message.body).toContain('nothing was booked');
    expect(message.body).not.toContain('{{');
  });

  it('never names a staff member and never sends a manager email', async () => {
    await useCase.execute(input());

    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(['maria@example.com']);
  });

  it('lists every service of a multi-line booking and escapes what a person typed', async () => {
    await useCase.execute(
      input({
        contactName: '<script>alert(1)</script>',
        lineSummary: [
          { serviceNameAtBooking: 'Cera & <b>brilho</b>' },
          { serviceNameAtBooking: 'Polimento' },
        ],
      }),
    );

    const body = dispatcher.dispatched[0].body;
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('Cera &amp; &lt;b&gt;brilho&lt;/b&gt;, Polimento');
  });

  it('sends nothing on a second delivery of the same eventId', async () => {
    await useCase.execute(input());
    const second = await useCase.execute(input());

    expect(second.customerEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(logRepo.all).toHaveLength(1);
  });

  it('skips quietly when the tenant has no template row', async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    useCase = build();

    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(0);
  });

  it("tenant isolation: another tenant's template row is never used", async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    seedTemplate(OTHER_TENANT_ID);
    useCase = build();

    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });
});
