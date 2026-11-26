import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import {
  SlugAlreadyTakenError,
  SlugReservedError,
} from '../../domain/errors/platform-domain.error';
import { SlugPolicy } from '../../domain/slug-policy';
import { TenantProvisioningService } from './tenant-provisioning.service';

const OWNER = 'ikaro-owner';

const input = (overrides: Partial<Parameters<TenantProvisioningService['provision']>[0]> = {}) => ({
  name: 'Lava Car Top',
  slug: 'lavacar-top',
  adminEmail: 'dona@example.com',
  country_code: 'BR',
  registrationId: TEST_REGISTRATION_ID,
  allowOwnerSlug: false,
  ...overrides,
});

describe('TenantProvisioningService', () => {
  let tenantRepo: InMemoryTenantRepository;
  let hotsiteRepo: InMemoryHotsiteConfigRepository;
  let service: TenantProvisioningService;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository(new InMemoryEventBus());
    hotsiteRepo = new InMemoryHotsiteConfigRepository();
    service = new TenantProvisioningService(
      tenantRepo,
      hotsiteRepo,
      new InMemoryTransactionManager(),
      new SlugPolicy(OWNER),
    );
  });

  it('creates the tenant and its hotsite config, defaulting the timezone from the country', async () => {
    const result = await service.provision(input());

    expect(result).toMatchObject({ name: 'Lava Car Top', slug: 'lavacar-top' });
    const tenant = await tenantRepo.findBySlug('lavacar-top');
    expect(tenant?.settings.businessHours.timezone).toBe('America/Sao_Paulo');
    await expect(hotsiteRepo.findByTenantId(result.tenantId)).resolves.not.toBeNull();
  });

  it('uses the timezone it is given instead of the country default', async () => {
    await service.provision(input({ timezone: 'America/Manaus' }));

    const tenant = await tenantRepo.findBySlug('lavacar-top');
    expect(tenant?.settings.businessHours.timezone).toBe('America/Manaus');
  });

  it('refuses a reserved word', async () => {
    await expect(service.provision(input({ slug: 'dashboard' }))).rejects.toBeInstanceOf(
      SlugReservedError,
    );
  });

  // The owner slug is the one reserved word only the operator path may provision.
  it('refuses the owner slug unless the caller allows it', async () => {
    await expect(service.provision(input({ slug: OWNER }))).rejects.toBeInstanceOf(
      SlugReservedError,
    );
    await expect(
      service.provision(input({ slug: OWNER, allowOwnerSlug: true })),
    ).resolves.toMatchObject({ slug: OWNER });
  });

  it('refuses a slug that is already taken, creating nothing a second time', async () => {
    await service.provision(input());

    await expect(service.provision(input())).rejects.toBeInstanceOf(SlugAlreadyTakenError);
  });
});
