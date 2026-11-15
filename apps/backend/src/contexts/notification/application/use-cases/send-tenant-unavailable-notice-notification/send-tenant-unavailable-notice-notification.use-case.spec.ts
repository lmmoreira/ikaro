import { SendTenantUnavailableNoticeNotificationDtoBuilder } from '../../../../../test/builders/notification';
import { NotificationTemplateBuilder } from '../../../../../test/builders/notification/notification-template.builder';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationCustomerPort } from '../../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { SendTenantUnavailableNoticeNotificationUseCase } from './send-tenant-unavailable-notice-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000002801';
const OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000002802';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000002801';

// Words that would tell the customer why the business is unavailable; the notice is reason-neutral.
const REASON_WORDS = [
  'pagamento',
  'payment',
  'inadimpl',
  'cancel',
  'suspens',
  'suspend',
  'billing',
  'cobran',
  'takedown',
];

describe('SendTenantUnavailableNoticeNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantPort: InMemoryNotificationPlatformPort;
  let customerPort: InMemoryNotificationCustomerPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendTenantUnavailableNoticeNotificationUseCase;

  const dto = () =>
    new SendTenantUnavailableNoticeNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .build();

  function setTenant(tenantId: string, overrides: { locale?: string; name?: string } = {}): void {
    tenantPort.setTenantInfo(tenantId, {
      id: tenantId,
      name: overrides.name ?? 'Lava Rápido Central',
      slug: 'lava-rapido',
      hotsiteUrl: 'https://app.example.com/lava-rapido',
      timezone: 'America/Sao_Paulo',
      locale: overrides.locale ?? 'pt-BR',
      replyToEmail: 'contato@lavarapido.example.com',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
  }

  function seedTemplate(tenantId: string): void {
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .withTenantId(tenantId)
        .withTriggerEvent(NotificationTemplateKey.TENANT_UNAVAILABLE_CUSTOMER)
        .withSubject('DB SUBJECT (unused)')
        .withBody('DB BODY (unused)')
        .build(),
    );
  }

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    tenantPort = new InMemoryNotificationPlatformPort();
    customerPort = new InMemoryNotificationCustomerPort();
    templateRepo = new InMemoryNotificationTemplateRepository();
    setTenant(TENANT_ID);
    seedTemplate(TENANT_ID);
    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'maria@example.com',
      name: 'Maria Souza',
    });
    useCase = new SendTenantUnavailableNoticeNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      customerPort,
      new InMemoryTransactionManager(),
      templateRepo,
      tenantPort,
      new JsonLocalizationAdapter(),
    );
  });

  it('sends the pt-BR notice to the customer account email, naming the business', async () => {
    const result = await useCase.execute(dto());

    expect(result).toEqual({ emailSent: true });
    expect(dispatcher.dispatched).toHaveLength(1);
    const message = dispatcher.dispatched[0];
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe('Lava Rápido Central está temporariamente indisponível');
    expect(message.body).toContain('Olá, Maria Souza!');
    expect(message.body).toContain('Lava Rápido Central');
    expect(message.body).not.toContain('{{');
    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('tenant-unavailable-customer');
  });

  it('sends the English notice to a tenant whose locale is en', async () => {
    setTenant(TENANT_ID, { locale: 'en', name: 'Central Car Wash' });

    await useCase.execute(dto());

    const message = dispatcher.dispatched[0];
    expect(message.subject).toBe('Central Car Wash is temporarily unavailable');
    expect(message.body).toContain('Hello, Maria Souza!');
    expect(message.body).not.toContain('{{');
  });

  it.each(['pt-BR', 'en'])('never says why the business is unavailable (%s)', async (locale) => {
    setTenant(TENANT_ID, { locale });

    await useCase.execute(dto());

    const text =
      `${dispatcher.dispatched[0].subject} ${dispatcher.dispatched[0].body}`.toLowerCase();
    for (const word of REASON_WORDS) expect(text).not.toContain(word);
  });

  it('carries no link: the hotsite is not published while the tenant is unavailable', async () => {
    await useCase.execute(dto());

    expect(dispatcher.dispatched[0].body).not.toContain('href');
    expect(dispatcher.dispatched[0].body).not.toContain('http');
  });

  it('escapes what a person typed', async () => {
    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'maria@example.com',
      name: '<script>alert(1)</script>',
    });

    await useCase.execute(dto());

    expect(dispatcher.dispatched[0].body).not.toContain('<script>');
    expect(dispatcher.dispatched[0].body).toContain('&lt;script&gt;');
  });

  it('sends nothing, and does not throw, when the customer cannot be read', async () => {
    const unknown = new SendTenantUnavailableNoticeNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId('cccccccc-0000-4000-8000-0000000028ff')
      .build();

    const result = await useCase.execute(unknown);

    expect(result).toEqual({ emailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('never reads a customer of another tenant: the same id under another tenant gets no email', async () => {
    customerPort.setCustomer(OTHER_TENANT_ID, CUSTOMER_ID, {
      email: 'other@example.com',
      name: 'Outra Pessoa',
    });
    setTenant(OTHER_TENANT_ID);
    seedTemplate(OTHER_TENANT_ID);

    await useCase.execute(dto());

    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(['maria@example.com']);
  });

  it('sends nothing when the tenant has no template row', async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    useCase = new SendTenantUnavailableNoticeNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      customerPort,
      new InMemoryTransactionManager(),
      templateRepo,
      tenantPort,
      new JsonLocalizationAdapter(),
    );

    const result = await useCase.execute(dto());

    expect(result).toEqual({ emailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('sends nothing when the tenant cannot be read, rather than an email with no business name', async () => {
    tenantPort = new InMemoryNotificationPlatformPort();
    useCase = new SendTenantUnavailableNoticeNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      customerPort,
      new InMemoryTransactionManager(),
      templateRepo,
      tenantPort,
      new JsonLocalizationAdapter(),
    );

    const result = await useCase.execute(dto());

    expect(result).toEqual({ emailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('sends nothing on a second delivery of the same command', async () => {
    await useCase.execute(dto());
    const second = await useCase.execute(dto());

    expect(second.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
  });
});
