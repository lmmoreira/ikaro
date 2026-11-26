import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';
import { SignupSlugTakenError } from '../../domain/errors/signup-domain.error';
import { SlugReservedError } from '../../domain/errors/platform-domain.error';
import { SlugPolicy } from '../../domain/slug-policy';
import { TenantProvisioningService } from '../services/tenant-provisioning.service';
import { SignupTenantUseCase } from './signup-tenant.use-case';

const input = (overrides: Partial<{ slug: string }> = {}) => ({
  name: 'Lava Car Top',
  slug: 'lavacar-top',
  adminEmail: 'dona@gmail.com',
  countryCode: 'BR',
  registrationId: TEST_REGISTRATION_ID,
  ...overrides,
});

describe('SignupTenantUseCase', () => {
  let eventBus: InMemoryEventBus;
  let tenantRepo: InMemoryTenantRepository;
  let useCase: SignupTenantUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    tenantRepo = new InMemoryTenantRepository(eventBus);
    // The real provisioning service over in-memory ports: what matters is what it is called with.
    useCase = new SignupTenantUseCase(
      new TenantProvisioningService(
        tenantRepo,
        new InMemoryHotsiteConfigRepository(),
        new InMemoryTransactionManager(),
        new SlugPolicy('ikaro'),
      ),
    );
  });

  it('provisions the tenant with the Google email as first manager and the registration id', async () => {
    const result = await useCase.execute(input());

    expect(result).toMatchObject({ slug: 'lavacar-top', name: 'Lava Car Top' });
    const event = eventBus.published[0] as TenantProvisioned;
    expect(event.data).toMatchObject({
      adminEmail: 'dona@gmail.com',
      countryCode: 'BR',
      registrationId: TEST_REGISTRATION_ID,
    });
  });

  it('answers SIGNUP_SLUG_TAKEN, not the operator code, for a slug that is already in use', async () => {
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(SignupSlugTakenError);
  });

  // Negative guarantee: self-signup can never provision Ikaro's own tenant.
  it('refuses the platform owner slug', async () => {
    await expect(useCase.execute(input({ slug: 'ikaro' }))).rejects.toBeInstanceOf(
      SlugReservedError,
    );
    await expect(tenantRepo.existsBySlug('ikaro')).resolves.toBe(false);
  });

  // Negative guarantee (decided at M26-S24 discovery): the tax id and the Terms version are
  // Billing's, checked at the reservation; this use case neither takes nor re-checks them, and it
  // does not verify Turnstile (the token was consumed by `validate`).
  it('takes no tax id, terms version or Turnstile token', () => {
    expect(Object.keys(input()).sort()).toEqual([
      'adminEmail',
      'countryCode',
      'name',
      'registrationId',
      'slug',
    ]);
  });
});
