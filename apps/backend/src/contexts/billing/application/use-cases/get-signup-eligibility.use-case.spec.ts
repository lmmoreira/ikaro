import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemorySignupRegistrationRepository } from '../../../../test/repositories/billing/in-memory-signup-registration.repository';
import { GetSignupEligibilityUseCase } from './get-signup-eligibility.use-case';

const TERMS = '2026-11';

function tenant(tenantId: string, slug: string) {
  return {
    tenantId,
    slug,
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    isActive: true,
  };
}

describe('GetSignupEligibilityUseCase', () => {
  let registrations: InMemorySignupRegistrationRepository;
  let platform: InMemoryBillingPlatformPort;
  let useCase: GetSignupEligibilityUseCase;

  beforeEach(() => {
    registrations = new InMemorySignupRegistrationRepository();
    platform = new InMemoryBillingPlatformPort();
    useCase = new GetSignupEligibilityUseCase(registrations, platform, { termsVersion: TERMS });
  });

  it('is available with no history, and reports the current terms version', async () => {
    await expect(useCase.execute({ googleSub: 'sub-1' })).resolves.toEqual({
      trialAvailable: true,
      existingTenantSlug: null,
      termsVersion: TERMS,
    });
  });

  it('is available when every earlier tenant paid', async () => {
    registrations.seedHistory('sub-1', {
      status: 'COMPLETED',
      hasEverPaid: true,
      tenantId: 'tenant-paid',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });

    await expect(useCase.execute({ googleSub: 'sub-1' })).resolves.toMatchObject({
      trialAvailable: true,
      existingTenantSlug: null,
    });
    expect(platform.lookups).toEqual([]);
  });

  it('is unavailable with an unpaid tenant and returns the earliest unpaid tenant slug', async () => {
    platform.seed(tenant('tenant-early', 'lava-early'));
    platform.seed(tenant('tenant-late', 'lava-late'));
    registrations.seedHistory(
      'sub-1',
      {
        status: 'COMPLETED',
        hasEverPaid: false,
        tenantId: 'tenant-late',
        createdAt: new Date('2026-11-10T00:00:00Z'),
      },
      {
        status: 'COMPLETED',
        hasEverPaid: false,
        tenantId: 'tenant-early',
        createdAt: new Date('2026-11-02T00:00:00Z'),
      },
      { status: 'COMPLETED', hasEverPaid: true, tenantId: 'tenant-paid', createdAt: new Date(0) },
    );

    await expect(useCase.execute({ googleSub: 'sub-1' })).resolves.toEqual({
      trialAvailable: false,
      existingTenantSlug: 'lava-early',
      termsVersion: TERMS,
    });
  });

  it('is unavailable with an in-flight reservation but offers no slug (no tenant yet)', async () => {
    registrations.seedHistory('sub-1', { status: 'RESERVED', hasEverPaid: false });

    await expect(useCase.execute({ googleSub: 'sub-1' })).resolves.toMatchObject({
      trialAvailable: false,
      existingTenantSlug: null,
    });
  });

  it('answers no slug when the unpaid tenant no longer exists', async () => {
    registrations.seedHistory('sub-1', {
      status: 'COMPLETED',
      hasEverPaid: false,
      tenantId: 'tenant-gone',
      createdAt: new Date('2026-11-02T00:00:00Z'),
    });

    await expect(useCase.execute({ googleSub: 'sub-1' })).resolves.toMatchObject({
      trialAvailable: false,
      existingTenantSlug: null,
    });
  });

  // Negative guarantee: a read never reserves, never takes the lock and never writes.
  it('inserts nothing', async () => {
    await useCase.execute({ googleSub: 'sub-1' });

    expect(registrations.saved).toHaveLength(0);
  });

  it('rethrows a transient Platform failure instead of hiding the slug', async () => {
    platform.seed(tenant('tenant-1', 'lava-1'));
    platform.failNext(new Error('platform down'));
    registrations.seedHistory('sub-1', {
      status: 'COMPLETED',
      hasEverPaid: false,
      tenantId: 'tenant-1',
      createdAt: new Date('2026-11-02T00:00:00Z'),
    });

    await expect(useCase.execute({ googleSub: 'sub-1' })).rejects.toThrow('platform down');
  });
});
