import { TaxId } from '../../../shared/value-objects/tax-id.vo';
import { SignupRegistrationBuilder } from '../../../test/builders/billing';
import {
  SignupRegistrationNotAvailableError,
  SignupTermsNotAcceptedError,
} from './errors/billing-domain.error';
import { SignupRegistration } from './signup-registration';

const NOW = new Date('2026-11-11T12:00:00Z');
const CPF = TaxId.reconstitute('52998224725', 'CPF');

describe('SignupRegistration.reserve', () => {
  it('reserves a SELF_SIGNUP with the Google sub, tax id and the terms stamped at now', () => {
    const registration = SignupRegistration.reserve({
      source: 'SELF_SIGNUP',
      googleSub: 'sub-1',
      taxId: CPF,
      termsVersion: '2026-11-01',
      now: NOW,
    });

    expect(registration.status).toBe('RESERVED');
    expect(registration.tenantId).toBeNull();
    expect(registration.googleSub).toBe('sub-1');
    expect(registration.taxId).toBe(CPF);
    expect(registration.terms).toEqual({ version: '2026-11-01', acceptedAt: NOW });
    expect(registration.createdAt).toEqual(NOW);
  });

  it.each([undefined, null, '', '   '])(
    'refuses a SELF_SIGNUP without terms (%p) with SIGNUP_TERMS_NOT_ACCEPTED',
    (termsVersion) => {
      expect(() =>
        SignupRegistration.reserve({
          source: 'SELF_SIGNUP',
          googleSub: 'sub-1',
          taxId: null,
          termsVersion,
          now: NOW,
        }),
      ).toThrow(SignupTermsNotAcceptedError);
    },
  );

  it('refuses a SELF_SIGNUP without a Google sub', () => {
    expect(() =>
      SignupRegistration.reserve({
        source: 'SELF_SIGNUP',
        taxId: null,
        termsVersion: '2026-11-01',
        now: NOW,
      }),
    ).toThrow(TypeError);
  });

  // Negative guarantee: an OPERATOR row never stores a Google sub or terms, even when passed, because
  // eligibility history is SELF_SIGNUP rows only.
  it('drops the Google sub and the terms of an OPERATOR registration', () => {
    const registration = SignupRegistration.reserve({
      source: 'OPERATOR',
      googleSub: 'sub-ignored',
      taxId: CPF,
      termsVersion: '2026-11-01',
      now: NOW,
    });

    expect(registration.googleSub).toBeNull();
    expect(registration.terms).toBeNull();
    expect(registration.taxId).toBe(CPF);
  });

  describe('exempt', () => {
    it('is false unless asked for', () => {
      const registration = SignupRegistration.reserve({
        source: 'OPERATOR',
        taxId: null,
        now: NOW,
      });

      expect(registration.exempt).toBe(false);
    });

    it('is kept for an OPERATOR registration, which then needs no tax id', () => {
      const registration = SignupRegistration.reserve({
        source: 'OPERATOR',
        taxId: null,
        exempt: true,
        now: NOW,
      });

      expect(registration.exempt).toBe(true);
      expect(registration.taxId).toBeNull();
    });

    it('is refused for a SELF_SIGNUP: a self-signup is never free of charge', () => {
      expect(() =>
        SignupRegistration.reserve({
          source: 'SELF_SIGNUP',
          googleSub: 'sub-1',
          taxId: null,
          termsVersion: '2026-11-01',
          exempt: true,
          now: NOW,
        }),
      ).toThrow(TypeError);
    });

    it('is false for a SELF_SIGNUP that says exempt: false', () => {
      const registration = SignupRegistration.reserve({
        source: 'SELF_SIGNUP',
        googleSub: 'sub-1',
        taxId: null,
        termsVersion: '2026-11-01',
        exempt: false,
        now: NOW,
      });

      expect(registration.exempt).toBe(false);
    });
  });

  it('gives each reservation its own id', () => {
    const input = { source: 'OPERATOR' as const, taxId: null, now: NOW };

    expect(SignupRegistration.reserve(input).id).not.toBe(SignupRegistration.reserve(input).id);
  });
});

describe('SignupRegistration.complete', () => {
  const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('returns the COMPLETED record with the tenant id set and the tax id cleared', () => {
    const registration = new SignupRegistrationBuilder()
      .withTaxId(TaxId.reconstitute('52998224725', 'CPF'))
      .build();

    const completed = registration.complete(TENANT_ID);

    expect(completed).toMatchObject({
      id: registration.id,
      status: 'COMPLETED',
      tenantId: TENANT_ID,
      taxId: null,
      googleSub: registration.googleSub,
      terms: registration.terms,
      exempt: registration.exempt,
    });
    expect(registration.status).toBe('RESERVED');
    expect(registration.taxId?.value).toBe('52998224725');
  });

  it('refuses a registration that is already COMPLETED', () => {
    const completed = new SignupRegistrationBuilder().completedFor(TENANT_ID).build();

    expect(() => completed.complete('bbbbbbbb-0000-4000-8000-000000000002')).toThrow(
      SignupRegistrationNotAvailableError,
    );
  });
});
