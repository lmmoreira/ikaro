import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  SendResourceDeactivationImpactNotificationUseCase,
  SendResourceDeactivationImpactNotificationUseCaseInput,
} from './send-resource-deactivation-impact-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const EVENT_ID = 'cccccccc-0002-4000-8000-000000000001';

const config = {
  getOrThrow: (key: string): string => {
    if (key === 'FRONTEND_URL') return 'https://app.example.com';
    throw new Error(`Unknown config key: ${key}`);
  },
};

function input(
  overrides: Partial<SendResourceDeactivationImpactNotificationUseCaseInput> = {},
): SendResourceDeactivationImpactNotificationUseCaseInput {
  return {
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    correlationId: 'corr-impact-1',
    resourceName: 'Sala 1',
    affectedCount: 11,
    ...overrides,
  };
}

describe('SendResourceDeactivationImpactNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendResourceDeactivationImpactNotificationUseCase;

  function setTenant(tenantId: string, locale = 'pt-BR'): void {
    tenantPort.setTenantInfo(tenantId, {
      id: tenantId,
      name: 'Clínica Sol',
      slug: 'clinica-sol',
      hotsiteUrl: 'https://app.example.com/clinica-sol',
      timezone: 'America/Sao_Paulo',
      locale,
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
  }

  function seedTemplate(tenantId: string): void {
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId,
        triggerEvent: NotificationTemplateKey.RESOURCE_DEACTIVATION_IMPACT_ADMIN,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
  }

  function build(): SendResourceDeactivationImpactNotificationUseCase {
    return new SendResourceDeactivationImpactNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
      config,
    );
  }

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setManagerEmails(TENANT_ID, ['ana@example.com', 'bruno@example.com']);
    tenantPort = new InMemoryNotificationPlatformPort();
    setTenant(TENANT_ID);
    templateRepo = new InMemoryNotificationTemplateRepository();
    seedTemplate(TENANT_ID);
    useCase = build();
  });

  it('sends every manager one email naming the resource and the number of bookings', async () => {
    const result = await useCase.execute(input());

    expect(result).toEqual({ adminEmailSent: true });
    expect(dispatcher.dispatched.map((m) => m.to).sort()).toEqual([
      'ana@example.com',
      'bruno@example.com',
    ]);
    const message = dispatcher.dispatched[0];
    expect(message.subject).toBe('Reservas precisam de decisão: Sala 1 foi desativado(a)');
    expect(message.body).toContain('Sala 1');
    expect(message.body).toContain('<strong>11</strong>');
    expect(message.body).not.toContain('{{');
  });

  it('links to the dashboard root, not to the worklist page that does not exist yet', async () => {
    await useCase.execute(input());

    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('href="https://app.example.com/dashboard"');
    expect(body).not.toContain('scheduling-exceptions');
  });

  it('sends one email per manager for one deactivation, however many bookings are affected', async () => {
    await useCase.execute(input({ affectedCount: 40 }));

    expect(dispatcher.dispatched).toHaveLength(2);
  });

  it('sends the English email to a tenant whose locale is en', async () => {
    setTenant(TENANT_ID, 'en');

    await useCase.execute(input());

    expect(dispatcher.dispatched[0].subject).toBe(
      'Bookings need a decision: Sala 1 was deactivated',
    );
    expect(dispatcher.dispatched[0].body).toContain('Open the dashboard');
  });

  it('escapes the resource name', async () => {
    await useCase.execute(input({ resourceName: 'Sala <b>VIP</b> & Cia' }));

    const body = dispatcher.dispatched[0].body;
    expect(body).not.toContain('<b>VIP</b>');
    expect(body).toContain('Sala &lt;b&gt;VIP&lt;/b&gt; &amp; Cia');
  });

  it('sends nothing when the tenant has no manager', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(input());

    expect(result).toEqual({ adminEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('skips quietly when the tenant has no template row', async () => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    useCase = build();

    const result = await useCase.execute(input());

    expect(result).toEqual({ adminEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('sends nothing on a second delivery of the same eventId', async () => {
    await useCase.execute(input());
    const second = await useCase.execute(input());

    expect(second.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(2);
  });

  it('never reaches another tenant’s managers (tenant isolation)', async () => {
    staffPort.setManagerEmails(OTHER_TENANT_ID, ['outro@example.com']);
    setTenant(OTHER_TENANT_ID);
    seedTemplate(OTHER_TENANT_ID);

    await useCase.execute(input());

    expect(dispatcher.dispatched.map((m) => m.to)).not.toContain('outro@example.com');
  });
});
