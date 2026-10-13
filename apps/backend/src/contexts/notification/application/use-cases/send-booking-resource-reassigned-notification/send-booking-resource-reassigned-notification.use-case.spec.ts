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
  SendBookingResourceReassignedNotificationUseCase,
  SendBookingResourceReassignedNotificationUseCaseInput,
} from './send-booking-resource-reassigned-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

function input(
  overrides: Partial<SendBookingResourceReassignedNotificationUseCaseInput> = {},
): SendBookingResourceReassignedNotificationUseCaseInput {
  return {
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    correlationId: 'corr-reassigned-1',
    contactEmail: 'maria@example.com',
    contactName: 'Maria Souza',
    // 15:30 in America/Sao_Paulo
    slot: { startTime: '2026-06-01T18:30:00.000Z', endTime: '2026-06-01T19:30:00.000Z' },
    lineSummary: [{ serviceNameAtBooking: 'Consulta' }],
    newResourceName: 'Sala 2',
    ...overrides,
  };
}

describe('SendBookingResourceReassignedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingResourceReassignedNotificationUseCase;

  function setTenant(
    tenantId: string,
    overrides: { locale?: string; name?: string; timeFormat?: '12h' | '24h' } = {},
  ): void {
    tenantPort.setTenantInfo(tenantId, {
      id: tenantId,
      name: overrides.name ?? 'Clínica Sol',
      slug: 'clinica-sol',
      hotsiteUrl: 'https://app.example.com/clinica-sol',
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
        triggerEvent: NotificationTemplateKey.BOOKING_RESOURCE_REASSIGNED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
  }

  function build(): SendBookingResourceReassignedNotificationUseCase {
    return new SendBookingResourceReassignedNotificationUseCase(
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

  it('tells the customer the time is unchanged and names the new resource when it is disclosed', async () => {
    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: true });
    expect(dispatcher.dispatched).toHaveLength(1);
    const message = dispatcher.dispatched[0];
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe(
      'O recurso do seu agendamento mudou, mas o horário continua o mesmo',
    );
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('Consulta');
    expect(message.body).toContain('01/06/2026');
    expect(message.body).toContain('15:30');
    expect(message.body).toContain('<strong>Novo recurso:</strong> Sala 2');
    expect(message.body).toContain('Clínica Sol');
    expect(message.body).not.toContain('{{');
    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-resource-reassigned-customer');
  });

  it('says only that another resource serves the booking when the name is not disclosed', async () => {
    await useCase.execute(input({ newResourceName: null }));

    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('outro recurso');
    expect(body).not.toContain('Novo recurso');
    expect(body).not.toContain('Sala 2');
    expect(body).not.toContain('{{');
  });

  it('sends the English email, with the English label, to a tenant whose locale is en', async () => {
    setTenant(TENANT_ID, { locale: 'en', timeFormat: '12h' });

    await useCase.execute(input());

    const message = dispatcher.dispatched[0];
    expect(message.subject).toBe('The resource for your booking changed, but the time is the same');
    expect(message.body).toContain('Hello, Maria Souza!');
    expect(message.body).toContain('<strong>New resource:</strong> Sala 2');
    expect(message.body).not.toContain('{{');
  });

  it('falls back to pt-BR when the tenant info is missing', async () => {
    tenantPort = new InMemoryNotificationPlatformPort();
    useCase = build();

    await useCase.execute(input());

    expect(dispatcher.dispatched[0].subject).toContain('O recurso do seu agendamento mudou');
  });

  it('lists every service of a multi-line booking', async () => {
    await useCase.execute(
      input({
        lineSummary: [{ serviceNameAtBooking: 'Consulta' }, { serviceNameAtBooking: 'Retorno' }],
      }),
    );

    expect(dispatcher.dispatched[0].body).toContain('Consulta, Retorno');
  });

  it('escapes what a person typed: the contact name, the service names and the resource name', async () => {
    await useCase.execute(
      input({
        contactName: '<script>alert(1)</script>',
        lineSummary: [{ serviceNameAtBooking: 'Cera & <b>brilho</b>' }],
        newResourceName: 'Sala <i>VIP</i> & Cia',
      }),
    );

    const body = dispatcher.dispatched[0].body;
    expect(body).not.toContain('<script>');
    expect(body).not.toContain('<i>VIP</i>');
    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('Cera &amp; &lt;b&gt;brilho&lt;/b&gt;');
    expect(body).toContain('Sala &lt;i&gt;VIP&lt;/i&gt; &amp; Cia');
  });

  it('never carries the manager’s internal reason, even if the caller passes one', async () => {
    const withReason = {
      ...input(),
      reason: 'Sala fechada por causa de infiltração',
    } as SendBookingResourceReassignedNotificationUseCaseInput;

    await useCase.execute(withReason);

    const message = dispatcher.dispatched[0];
    expect(message.body).not.toContain('infiltração');
    expect(message.subject).not.toContain('infiltração');
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

  it('sends one email per moved booking: two events for the same customer both go out', async () => {
    await useCase.execute(input({ eventId: 'cccccccc-0001-4000-8000-0000000000a1' }));
    await useCase.execute(input({ eventId: 'cccccccc-0001-4000-8000-0000000000a2' }));

    expect(dispatcher.dispatched).toHaveLength(2);
  });

  it('skips quietly when the tenant has no template row', async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    useCase = build();

    const result = await useCase.execute(input());

    expect(result).toEqual({ customerEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('uses only the event tenant’s template (tenant isolation)', async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    seedTemplate(OTHER_TENANT_ID);
    useCase = build();

    const result = await useCase.execute(input());

    expect(result.customerEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });
});
