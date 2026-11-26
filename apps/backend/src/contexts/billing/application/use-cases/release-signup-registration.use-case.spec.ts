import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemorySignupRegistrationLock } from '../../../../test/repositories/billing/in-memory-signup-registration-lock';
import { InMemorySignupRegistrationRepository } from '../../../../test/repositories/billing/in-memory-signup-registration.repository';
import { ReleaseSignupRegistrationUseCase } from './release-signup-registration.use-case';
import { ReserveSignupRegistrationUseCase } from './reserve-signup-registration.use-case';

describe('ReleaseSignupRegistrationUseCase', () => {
  let registrations: InMemorySignupRegistrationRepository;
  let reserve: ReserveSignupRegistrationUseCase;
  let useCase: ReleaseSignupRegistrationUseCase;

  beforeEach(() => {
    registrations = new InMemorySignupRegistrationRepository();
    const txManager = new InMemoryTransactionManager();
    reserve = new ReserveSignupRegistrationUseCase(
      registrations,
      new InMemorySignupRegistrationLock(txManager),
      txManager,
      new FixedClock(new Date('2026-11-26T12:00:00Z')),
      { termsVersion: '2026-11' },
    );
    useCase = new ReleaseSignupRegistrationUseCase(registrations);
  });

  const reserveOne = async (googleSub = 'sub-1') =>
    (
      await reserve.execute({
        source: 'SELF_SIGNUP',
        googleSub,
        countryCode: 'BR',
        taxId: '529.982.247-25',
        termsVersion: '2026-11',
      })
    ).registrationId as string;

  it('deletes a RESERVED registration, so an immediate retry is eligible again', async () => {
    const registrationId = await reserveOne();

    await expect(useCase.execute({ registrationId })).resolves.toEqual({ released: true });
    expect(registrations.saved).toHaveLength(0);
    await expect(reserveOne()).resolves.toEqual(expect.any(String));
  });

  it('is idempotent: a second release, or an unknown id, deletes nothing', async () => {
    const registrationId = await reserveOne();
    await useCase.execute({ registrationId });

    await expect(useCase.execute({ registrationId })).resolves.toEqual({ released: false });
    await expect(useCase.execute({ registrationId: 'unknown' })).resolves.toEqual({
      released: false,
    });
  });

  // Negative guarantee: a COMPLETED registration has a tenant behind it and is never deleted.
  it('never deletes a COMPLETED registration', async () => {
    const registrationId = await reserveOne();
    await registrations.complete(registrations.saved[0].complete('tenant-1'));

    await expect(useCase.execute({ registrationId })).resolves.toEqual({ released: false });
    expect(registrations.saved).toHaveLength(1);
  });

  // `scripts/provision-tenant.sh` reserves an OPERATOR registration and releases it after a definite
  // refusal of the tenant call, so both sources are releasable.
  it('releases a RESERVED operator registration too', async () => {
    const operator = await reserve.execute({ source: 'OPERATOR' });

    await expect(
      useCase.execute({ registrationId: operator.registrationId as string }),
    ).resolves.toEqual({ released: true });
    expect(registrations.saved).toHaveLength(0);
  });
});
