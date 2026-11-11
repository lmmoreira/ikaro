import { TaxId } from '../../../shared/value-objects/tax-id.vo';
import { SignupTermsNotAcceptedError } from './errors/billing-domain.error';
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

  it('gives each reservation its own id', () => {
    const input = { source: 'OPERATOR' as const, taxId: null, now: NOW };

    expect(SignupRegistration.reserve(input).id).not.toBe(SignupRegistration.reserve(input).id);
  });
});
