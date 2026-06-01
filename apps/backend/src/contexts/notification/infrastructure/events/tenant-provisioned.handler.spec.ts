import { InMemoryNotificationTemplateRepository } from '../../../../test/repositories/notification/in-memory-notification-template.repository';
import { NotificationTemplateBuilder } from '../../../../test/builders/notification/notification-template.builder';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { SeedDefaultTemplatesUseCase } from '../../application/use-cases/seed-default-templates/seed-default-templates.use-case';
import { TenantProvisionedNotificationHandler } from './tenant-provisioned.handler';
import { TenantProvisioned } from '../../../platform/domain/events/tenant-provisioned.event';

const TENANT_ID = '10000000-0000-4000-8000-000000000041';

function makeEvent(tenantId = TENANT_ID): TenantProvisioned {
  return new TenantProvisioned(tenantId, 'corr-id', {
    name: 'Test Tenant',
    slug: 'test-tenant',
    adminEmail: 'admin@test.com',
    timezone: 'America/Sao_Paulo',
  });
}

describe('TenantProvisionedNotificationHandler', () => {
  let templateRepo: InMemoryNotificationTemplateRepository;
  let handler: TenantProvisionedNotificationHandler;

  beforeEach(() => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    const seedUseCase = new SeedDefaultTemplatesUseCase(templateRepo);
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

    await handler.handle(makeEvent());

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
    );
    const h = new TenantProvisionedNotificationHandler(seedUseCase, mockEventBus);

    h.onModuleInit();

    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'TenantProvisioned',
      expect.any(Function),
      'notification-template-seed',
    );

    // Invoke the registered callback to cover the arrow function branch
    const callback = mockEventBus.subscribe.mock.calls[0][1] as (
      event: TenantProvisioned,
    ) => Promise<void>;
    await expect(callback(makeEvent())).resolves.not.toThrow();
  });

  it('rethrows Error instances so Pub/Sub nacks and retries', async () => {
    jest.spyOn(templateRepo, 'copyGlobalDefaultsForTenant').mockRejectedValue(new Error('DB down'));

    await expect(handler.handle(makeEvent())).rejects.toThrow('DB down');
  });

  it('rethrows non-Error rejections (covers String(err) branch)', async () => {
    jest.spyOn(templateRepo, 'copyGlobalDefaultsForTenant').mockRejectedValue('plain-string-error');

    await expect(handler.handle(makeEvent())).rejects.toBe('plain-string-error');
  });
});
