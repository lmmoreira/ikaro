import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemorySignupRegistrationLock } from '../../../../test/repositories/billing/in-memory-signup-registration-lock';
import { InMemorySignupRegistrationRepository } from '../../../../test/repositories/billing/in-memory-signup-registration.repository';
import { TaxIdValidationError } from '../../../../shared/value-objects/tax-id.vo';
import { SignupTermsNotAcceptedError } from '../../domain/errors/billing-domain.error';
import { ReserveSignupRegistrationUseCase } from './reserve-signup-registration.use-case';

const NOW = new Date('2026-11-11T12:00:00Z');
const CPF = { raw: '529.982.247-25', countryCode: 'BR' };
const CNPJ = { raw: '11.222.333/0001-81', countryCode: 'BR' };
const EIN = { raw: '12-3456789', countryCode: 'US' };
const TERMS = '2026-11-01';

describe('ReserveSignupRegistrationUseCase', () => {
  let registrations: InMemorySignupRegistrationRepository;
  let txManager: InMemoryTransactionManager;
  let lock: InMemorySignupRegistrationLock;
  let useCase: ReserveSignupRegistrationUseCase;

  beforeEach(() => {
    registrations = new InMemorySignupRegistrationRepository();
    txManager = new InMemoryTransactionManager();
    lock = new InMemorySignupRegistrationLock(txManager);
    useCase = new ReserveSignupRegistrationUseCase(
      registrations,
      lock,
      txManager,
      new FixedClock(NOW),
    );
  });

  describe('SELF_SIGNUP', () => {
    const selfSignup = (googleSub: string, extra = {}) =>
      useCase.execute({ source: 'SELF_SIGNUP', googleSub, termsVersion: TERMS, ...extra });

    it('reserves a registration for a Google account with no history, under lock B-A1', async () => {
      const result = await selfSignup('sub-1', { taxId: CPF });

      expect(result.trialAvailable).toBe(true);
      expect(result.registrationId).toEqual(expect.any(String));
      expect(lock.locked).toEqual(['sub-1']);
      expect(registrations.saved).toHaveLength(1);
      const [saved] = registrations.saved;
      expect(saved.id).toBe(result.registrationId);
      expect(saved.status).toBe('RESERVED');
      expect(saved.taxId?.value).toBe('52998224725');
      expect(saved.terms).toEqual({ version: TERMS, acceptedAt: NOW });
    });

    it('reserves for a Google account whose earlier tenants all paid', async () => {
      registrations.seedHistory(
        'sub-1',
        { status: 'COMPLETED', hasEverPaid: true },
        { status: 'COMPLETED', hasEverPaid: true },
      );

      await expect(selfSignup('sub-1')).resolves.toMatchObject({ trialAvailable: true });
    });

    it.each([
      ['an unpaid earlier tenant', [{ status: 'COMPLETED', hasEverPaid: false }]],
      [
        'a mixed history (one paid, one unpaid)',
        [
          { status: 'COMPLETED', hasEverPaid: true },
          { status: 'COMPLETED', hasEverPaid: false },
        ],
      ],
      ['an in-flight RESERVED row', [{ status: 'RESERVED', hasEverPaid: false }]],
    ] as const)(
      'is ineligible with %s: nothing is inserted and there is no id to release',
      async (_name, history) => {
        registrations.seedHistory('sub-1', ...history);

        const result = await selfSignup('sub-1');

        expect(result).toEqual({ registrationId: null, trialAvailable: false });
        expect(registrations.saved).toHaveLength(0);
      },
    );

    it('is ineligible when the tax id belongs to a never-paid account, even for a different Google account', async () => {
      registrations.seedUnpaidTaxId('52998224725');

      const result = await selfSignup('sub-other', { taxId: CPF });

      expect(result).toEqual({ registrationId: null, trialAvailable: false });
      expect(registrations.saved).toHaveLength(0);
    });

    it('is ineligible when an in-flight RESERVED registration holds the tax id', async () => {
      await selfSignup('sub-1', { taxId: CPF });

      const result = await selfSignup('sub-2', { taxId: CPF });

      expect(result).toEqual({ registrationId: null, trialAvailable: false });
      expect(registrations.saved).toHaveLength(1);
    });

    it('skips the tax-id half when none is given', async () => {
      registrations.seedUnpaidTaxId('52998224725');

      await expect(selfSignup('sub-1')).resolves.toMatchObject({ trialAvailable: true });
    });

    it('a second reservation of the same Google account loses once the first is in flight', async () => {
      const first = await selfSignup('sub-1');
      const second = await selfSignup('sub-1');

      expect(first.trialAvailable).toBe(true);
      expect(second.trialAvailable).toBe(false);
    });

    it('refuses without terms with SIGNUP_TERMS_NOT_ACCEPTED, before taking the lock', async () => {
      await expect(
        useCase.execute({ source: 'SELF_SIGNUP', googleSub: 'sub-1' }),
      ).rejects.toBeInstanceOf(SignupTermsNotAcceptedError);
      expect(lock.locked).toHaveLength(0);
      expect(registrations.saved).toHaveLength(0);
    });

    it('validates the tax id format with the spec of the given country', async () => {
      await expect(selfSignup('sub-1', { taxId: CNPJ })).resolves.toMatchObject({
        trialAvailable: true,
      });
      await expect(selfSignup('sub-2', { taxId: EIN })).resolves.toMatchObject({
        trialAvailable: true,
      });
      expect(registrations.saved.map((row) => row.taxId?.type)).toEqual(['CNPJ', 'EIN']);
    });

    it.each([
      ['an invalid CPF', { raw: '111.111.111-11', countryCode: 'BR' }],
      ['an EIN given with the BR country', { raw: '12-3456789', countryCode: 'BR' }],
    ])('rejects %s with SIGNUP_TAX_ID_INVALID, before any lock or insert', async (_name, taxId) => {
      await expect(selfSignup('sub-1', { taxId })).rejects.toBeInstanceOf(TaxIdValidationError);
      expect(lock.locked).toHaveLength(0);
      expect(registrations.saved).toHaveLength(0);
    });

    // Negative guarantee: the Google sub, tax id and terms never leave the registration. The use case
    // has no event bus, and its result carries only the id and the flag.
    it('returns nothing but the registration id and the flag', async () => {
      const result = await selfSignup('sub-1', { taxId: CPF });

      expect(Object.keys(result).sort()).toEqual(['registrationId', 'trialAvailable']);
    });
  });

  describe('OPERATOR', () => {
    it('always reserves a fresh row, with no lock and no eligibility check', async () => {
      registrations.seedUnpaidTaxId('52998224725');

      const result = await useCase.execute({ source: 'OPERATOR', taxId: CPF });

      expect(result.trialAvailable).toBe(true);
      expect(lock.locked).toHaveLength(0);
      expect(registrations.saved).toHaveLength(1);
      expect(registrations.saved[0].taxId?.value).toBe('52998224725');
    });

    it('ignores a Google sub and terms, and never stores them', async () => {
      await useCase.execute({ source: 'OPERATOR', googleSub: 'sub-ignored', termsVersion: TERMS });

      const [saved] = registrations.saved;
      expect(saved.googleSub).toBeNull();
      expect(saved.terms).toBeNull();
    });

    it('creates an independent RESERVED row on every call', async () => {
      const first = await useCase.execute({ source: 'OPERATOR' });
      const second = await useCase.execute({ source: 'OPERATOR' });

      expect(first.registrationId).not.toBe(second.registrationId);
      expect(registrations.saved).toHaveLength(2);
    });

    it('still rejects an invalid tax id', async () => {
      await expect(
        useCase.execute({
          source: 'OPERATOR',
          taxId: { raw: '123', countryCode: 'BR' },
        }),
      ).rejects.toBeInstanceOf(TaxIdValidationError);
    });
  });
});
