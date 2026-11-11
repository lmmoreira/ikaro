import { uuidv7 } from '../../../shared/domain/uuid-v7';
import type { TaxId } from '../../../shared/value-objects/tax-id.vo';
import { SignupTermsNotAcceptedError } from './errors/billing-domain.error';

export type SignupSource = 'SELF_SIGNUP' | 'OPERATOR';
export type SignupRegistrationStatus = 'RESERVED' | 'COMPLETED';

export interface SignupTerms {
  readonly version: string;
  readonly acceptedAt: Date;
}

export interface SignupRegistrationProps {
  id: string;
  /** NULL until the `TenantProvisioned` handler completes the registration (S11). */
  tenantId: string | null;
  source: SignupSource;
  status: SignupRegistrationStatus;
  /** Present for `SELF_SIGNUP` only. */
  googleSub: string | null;
  /** Held until the registration completes, then copied to `billing_accounts` and cleared (S11). */
  taxId: TaxId | null;
  /** Present for `SELF_SIGNUP` only. */
  terms: SignupTerms | null;
  createdAt: Date;
}

export interface ReserveSignupRegistrationInput {
  source: SignupSource;
  googleSub?: string | null;
  taxId: TaxId | null;
  termsVersion?: string | null;
  now: Date;
}

/**
 * The provisioning registration: a thin record reserved before the tenant exists, so the Google
 * `sub`, the tax id and the accepted terms never travel through Pub/Sub or the audit log. Not a
 * rich aggregate: it raises no events and S09 only creates it; S11 completes it.
 */
export class SignupRegistration {
  readonly id: string;
  readonly tenantId: string | null;
  readonly source: SignupSource;
  readonly status: SignupRegistrationStatus;
  readonly googleSub: string | null;
  readonly taxId: TaxId | null;
  readonly terms: SignupTerms | null;
  readonly createdAt: Date;

  private constructor(props: SignupRegistrationProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.source = props.source;
    this.status = props.status;
    this.googleSub = props.googleSub;
    this.taxId = props.taxId;
    this.terms = props.terms;
    this.createdAt = props.createdAt;
  }

  /**
   * A new `RESERVED` registration. `SELF_SIGNUP` keeps its Google `sub` and the accepted terms (a
   * missing version is `SIGNUP_TERMS_NOT_ACCEPTED`); `OPERATOR` has neither, so both are dropped
   * even when passed: eligibility history is `SELF_SIGNUP` rows only.
   */
  static reserve(input: ReserveSignupRegistrationInput): SignupRegistration {
    const selfSignup = input.source === 'SELF_SIGNUP';
    if (selfSignup && !input.googleSub) {
      throw new TypeError('A SELF_SIGNUP registration needs the Google sub');
    }
    const version = input.termsVersion?.trim();
    if (selfSignup && !version) throw new SignupTermsNotAcceptedError();
    return new SignupRegistration({
      id: uuidv7(),
      tenantId: null,
      source: input.source,
      status: 'RESERVED',
      googleSub: selfSignup ? (input.googleSub ?? null) : null,
      taxId: input.taxId,
      terms: selfSignup && version ? { version, acceptedAt: input.now } : null,
      createdAt: input.now,
    });
  }

  static reconstitute(props: SignupRegistrationProps): SignupRegistration {
    return new SignupRegistration(props);
  }
}
