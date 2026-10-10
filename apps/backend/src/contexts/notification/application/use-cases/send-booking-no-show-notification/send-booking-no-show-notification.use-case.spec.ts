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
  SendBookingNoShowNotificationUseCase,
  SendBookingNoShowNotificationUseCaseInput,
} from './send-booking-no-show-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

function input(
  overrides: Partial<SendBookingNoShowNotificationUseCaseInput> = {},
): SendBookingNoShowNotificationUseCaseInput {
  return {
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    correlationId: 'corr-no-show-1',
    contactEmail: 'maria@example.com',
    contactName: 'Maria Souza',
    // 15:30 in America/Sao_Paulo
    scheduledAt: '2026-06-01T18:30:00.000Z',
    lineSummary: [{ serviceNameAtBooking: 'Lavagem completa' }],
    ...overrides,
  };
}

describe('SendBookingNoShowNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingNoShowNotificationUseCase;

  function setTenant(
    tenantId: string,
    overrides: { locale?: string; name?: string; timeFormat?: '12h' | '24h' } = {},
  ): void {
    tenantPort.setTenantInfo(tenantId, {
      id: tenantId,
      name: overrides.name ?? 'Lava Car',
      slug: 'lavacar',
      hotsiteUrl: 'https://app.example.com/lavacar',
      timezone: 'America/Sao_Paulo',
      locale: overrides.locale ?? 'pt-BR',
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: overrides.timeFormat ?? '24h',
    });
  }

  function seedTemplate(tenantId: string): void {
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId,
        triggerEvent: NotificationTemplateKey.BOOKING_NO_SHOW_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
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
    useCase = new SendBookingNoShowNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
    );
  });

  it('sends the pt-BR email to the booking contact with the appointment in the tenant timezone', async () => {
    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: true });
    expect(dispatcher.dispatched).toHaveLength(1);
    const message = dispatcher.dispatched[0];
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe('Seu agendamento foi registrado como não comparecimento');
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('Lavagem completa');
    expect(message.body).toContain('01/06/2026');
    expect(message.body).toContain('15:30');
    expect(message.body).toContain('Lava Car');
    expect(message.body).not.toContain('{{');
    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-no-show-customer');
  });

  it('sends the English email to a tenant whose locale is en', async () => {
    setTenant(TENANT_ID, { locale: 'en', timeFormat: '12h' });

    await useCase.execute(input());

    const message = dispatcher.dispatched[0];
    expect(message.subject).toBe('Your appointment was recorded as a no-show');
    expect(message.body).toContain('Hello, Maria Souza!');
    expect(message.body).toContain('Lava Car');
    expect(message.body).not.toContain('{{');
  });

  it('falls back to pt-BR when the tenant info is missing', async () => {
    tenantPort = new InMemoryNotificationPlatformPort();
    useCase = new SendBookingNoShowNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
    );

    await useCase.execute(input());

    expect(dispatcher.dispatched[0].subject).toBe(
      'Seu agendamento foi registrado como não comparecimento',
    );
  });

  it('lists every service of a multi-line booking', async () => {
    await useCase.execute(
      input({
        lineSummary: [
          { serviceNameAtBooking: 'Lavagem completa' },
          { serviceNameAtBooking: 'Polimento' },
        ],
      }),
    );

    expect(dispatcher.dispatched[0].body).toContain('Lavagem completa, Polimento');
  });

  it('escapes what a person typed: the contact name and the service names', async () => {
    await useCase.execute(
      input({
        contactName: '<script>alert(1)</script>',
        lineSummary: [{ serviceNameAtBooking: 'Cera & <b>brilho</b>' }],
      }),
    );

    const body = dispatcher.dispatched[0].body;
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('Cera &amp; &lt;b&gt;brilho&lt;/b&gt;');
  });

  it('never carries the staff member’s internal reason, even if the caller passes one', async () => {
    const withReason = {
      ...input(),
      reason: 'Cliente xingou a recepcionista',
    } as SendBookingNoShowNotificationUseCaseInput;

    await useCase.execute(withReason);

    const message = dispatcher.dispatched[0];
    expect(message.body).not.toContain('xingou');
    expect(message.subject).not.toContain('xingou');
  });

  it('emails a guest booking at its contact email', async () => {
    await useCase.execute(input({ contactEmail: 'guest@example.com', contactName: 'Visitante' }));

    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(['guest@example.com']);
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
    useCase = new SendBookingNoShowNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
    );

    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(0);
  });

  it('tenant isolation: another tenant’s template row is never used', async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    seedTemplate(OTHER_TENANT_ID);
    useCase = new SendBookingNoShowNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
    );

    const result = await useCase.execute(input());

    expect(result.customerEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all.some((l) => l.tenantId === OTHER_TENANT_ID)).toBe(false);
  });
});
