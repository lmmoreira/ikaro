import {
  SignupRegistration,
  type SignupRegistrationStatus,
  type SignupSource,
  type SignupTerms,
} from '../../../contexts/billing/domain/signup-registration';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TaxId } from '../../../shared/value-objects/tax-id.vo';

/** A persisted-looking registration (`reconstitute`): a `RESERVED` `SELF_SIGNUP` with terms. */
export class SignupRegistrationBuilder {
  private id = uuidv7();
  private tenantId: string | null = null;
  private source: SignupSource = 'SELF_SIGNUP';
  private status: SignupRegistrationStatus = 'RESERVED';
  private googleSub: string | null = `sub-${uuidv7()}`;
  private taxId: TaxId | null = null;
  private terms: SignupTerms | null = {
    version: '2026-11-01',
    acceptedAt: new Date(Date.now() - 60_000),
  };
  private createdAt = new Date(Date.now() - 60_000);

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withGoogleSub(googleSub: string | null): this {
    this.googleSub = googleSub;
    return this;
  }

  withTaxId(taxId: TaxId | null): this {
    this.taxId = taxId;
    return this;
  }

  asOperator(): this {
    this.source = 'OPERATOR';
    this.googleSub = null;
    this.terms = null;
    return this;
  }

  completedFor(tenantId: string): this {
    this.status = 'COMPLETED';
    this.tenantId = tenantId;
    this.taxId = null;
    return this;
  }

  build(): SignupRegistration {
    return SignupRegistration.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      source: this.source,
      status: this.status,
      googleSub: this.googleSub,
      taxId: this.taxId,
      terms: this.terms,
      createdAt: this.createdAt,
    });
  }
}
