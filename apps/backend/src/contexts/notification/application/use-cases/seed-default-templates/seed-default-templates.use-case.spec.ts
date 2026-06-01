import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { NotificationTemplateBuilder } from '../../../../../test/builders/notification/notification-template.builder';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SeedDefaultTemplatesUseCase } from './seed-default-templates.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000031';
const TENANT_B = '10000000-0000-4000-8000-000000000032';

describe('SeedDefaultTemplatesUseCase', () => {
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SeedDefaultTemplatesUseCase;

  beforeEach(() => {
    templateRepo = new InMemoryNotificationTemplateRepository();
    useCase = new SeedDefaultTemplatesUseCase(templateRepo);
  });

  it('copies all global defaults to the given tenantId', async () => {
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .asGlobalDefault()
        .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
        .withSubject('Confirmado!')
        .withBody('<p>Ok</p>')
        .build(),
    );
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .asGlobalDefault()
        .withTriggerEvent(NotificationTemplateKey.STAFF_INVITATION)
        .withSubject('Convite')
        .withBody('<p>Olá</p>')
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.seeded).toBe(2);
    const tenantApproved = await templateRepo.findByTriggerEventAndChannel(
      TENANT_A,
      NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      'EMAIL',
    );
    expect(tenantApproved).not.toBeNull();
    expect(tenantApproved!.tenantId).toBe(TENANT_A);
    expect(tenantApproved!.subject).toBe('Confirmado!');
  });

  it('returns seeded=0 when no defaults exist', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A });
    expect(result.seeded).toBe(0);
  });

  it('tenant isolation: Tenant A templates not accessible under Tenant B', async () => {
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .asGlobalDefault()
        .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
        .withSubject('Ok')
        .withBody('<p>Ok</p>')
        .build(),
    );

    await useCase.execute({ tenantId: TENANT_A });

    const underB = await templateRepo.findByTriggerEventAndChannel(
      TENANT_B,
      NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      'EMAIL',
    );
    expect(underB).toBeNull();
  });
});
