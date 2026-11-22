import { SignupRegistrationBuilder } from '../../../../test/builders/billing';
import { InMemorySignupRegistrationRepository } from '../../../../test/repositories/billing/in-memory-signup-registration.repository';
import { STALE_SIGNUP_RESERVATION_HOURS } from '../../domain/billing-constants';
import { ReleaseStaleSignupRegistrationsUseCase } from './release-stale-signup-registrations.use-case';

const NOW = new Date('2026-03-10T15:00:00Z');
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

describe('ReleaseStaleSignupRegistrationsUseCase (UC-140 step 1b)', () => {
  let registrations: InMemorySignupRegistrationRepository;
  let useCase: ReleaseStaleSignupRegistrationsUseCase;

  beforeEach(() => {
    registrations = new InMemorySignupRegistrationRepository();
    useCase = new ReleaseStaleSignupRegistrationsUseCase(registrations);
  });

  it('deletes a RESERVED registration older than one hour and counts it', async () => {
    const stale = new SignupRegistrationBuilder().withCreatedAt(hoursAgo(1.5)).build();
    await registrations.save(stale);

    await expect(useCase.execute({ now: NOW })).resolves.toEqual({ released: 1 });

    expect(await registrations.findById(stale.id)).toBeNull();
  });

  it('keeps a younger registration, one at exactly one hour, and a COMPLETED one', async () => {
    const young = new SignupRegistrationBuilder().withCreatedAt(hoursAgo(0.5)).build();
    const exactly = new SignupRegistrationBuilder()
      .withCreatedAt(hoursAgo(STALE_SIGNUP_RESERVATION_HOURS))
      .build();
    const completed = new SignupRegistrationBuilder()
      .withCreatedAt(hoursAgo(48))
      .completedFor('00000000-0000-7000-8000-000000000001')
      .build();
    for (const row of [young, exactly, completed]) await registrations.save(row);

    await expect(useCase.execute({ now: NOW })).resolves.toEqual({ released: 0 });

    for (const row of [young, exactly, completed]) {
      expect(await registrations.findById(row.id)).not.toBeNull();
    }
  });

  it('releases an operator registration too', async () => {
    const operator = new SignupRegistrationBuilder()
      .asOperator()
      .withCreatedAt(hoursAgo(3))
      .build();
    await registrations.save(operator);

    await expect(useCase.execute({ now: NOW })).resolves.toEqual({ released: 1 });
  });
});
