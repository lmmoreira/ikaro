import { InMemoryNotificationTemplateRepository } from '../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryNotificationPlatformPort } from '../../../../test/infrastructure/in-memory-notification-platform.port';
import { NotificationTemplateBuilder } from '../../../../test/builders/notification/notification-template.builder';
import { TenantProvisionedEventBuilder } from '../../../../test/builders/platform';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { SeedDefaultTemplatesUseCase } from '../../application/use-cases/seed-default-templates/seed-default-templates.use-case';
import { TenantProvisionedNotificationHandler } from './tenant-provisioned.handler';

const TENANT_ID = '10000000-0000-4000-8000-000000000041';

describe('TenantProvisionedNotificationHandler', () => {
  let templateRepo: InMemoryNotificationTemplateRepository;
  let handler: TenantProvisionedNotificationHandler;

  beforeEach(() => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    const seedUseCase = new SeedDefaultTemplatesUseCase(
      templateRepo,
      new InMemoryNotificationPlatformPort(),
    );
    handler = new TenantProvisionedNotificationHandler(seedUseCase, {
      publish: jest.fn(),
      subscribe: jest.fn(),
    });
  });

  it('seeds all global defaults for the new tenant', async () => {
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .asGlobalDefault()
        .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
        .withSubject('Confirmado!')
        .withBody('<p>Ok</p>')
        .build(),
    );

    await handler.handle(
      new TenantProvisionedEventBuilder()
        .withTenantId(TENANT_ID)
        .withCorrelationId('corr-id')
        .withName('Test Tenant')
        .withSlug('test-tenant')
        .withAdminEmail('admin@test.com')
        .build(),
    );

    const tenantTemplate = await templateRepo.findByTriggerEventAndChannel(
      TENANT_ID,
      NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      'EMAIL',
    );
    expect(tenantTemplate).not.toBeNull();
    expect(tenantTemplate!.tenantId).toBe(TENANT_ID);
  });

  it('onModuleInit subscribes to TenantProvisioned with correct consumer name', async () => {
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .asGlobalDefault()
        .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
        .withSubject('Ok')
        .withBody('<p>Ok</p>')
        .build(),
    );
    const mockEventBus = { publish: jest.fn(), subscribe: jest.fn() };
    const seedUseCase = new SeedDefaultTemplatesUseCase(
      new InMemoryNotificationTemplateRepository(),
      new InMemoryNotificationPlatformPort(),
    );
    const h = new TenantProvisionedNotificationHandler(seedUseCase, mockEventBus);

    h.onModuleInit();

    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'TenantProvisioned',
      expect.any(Function),
      'notification-template-seed',
    );

    // Invoke the registered callback to cover the arrow function branch
    const callback = mockEventBus.subscribe.mock.calls[0][1] as (event: unknown) => Promise<void>;
    await expect(
      callback(
        new TenantProvisionedEventBuilder()
          .withTenantId(TENANT_ID)
          .withCorrelationId('corr-id')
          .withName('Test Tenant')
          .withSlug('test-tenant')
          .withAdminEmail('admin@test.com')
          .build(),
      ),
    ).resolves.not.toThrow();
  });

  it('rethrows Error instances so Pub/Sub nacks and retries', async () => {
    jest.spyOn(templateRepo, 'copyGlobalDefaultsForTenant').mockRejectedValue(new Error('DB down'));

    await expect(
      handler.handle(
        new TenantProvisionedEventBuilder()
          .withTenantId(TENANT_ID)
          .withCorrelationId('corr-id')
          .withName('Test Tenant')
          .withSlug('test-tenant')
          .withAdminEmail('admin@test.com')
          .build(),
      ),
    ).rejects.toThrow('DB down');
  });

  it('rethrows non-Error rejections (covers String(err) branch)', async () => {
    jest.spyOn(templateRepo, 'copyGlobalDefaultsForTenant').mockRejectedValue('plain-string-error');

    await expect(
      handler.handle(
        new TenantProvisionedEventBuilder()
          .withTenantId(TENANT_ID)
          .withCorrelationId('corr-id')
          .withName('Test Tenant')
          .withSlug('test-tenant')
          .withAdminEmail('admin@test.com')
          .build(),
      ),
    ).rejects.toBe('plain-string-error');
  });
});
