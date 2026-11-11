import { SignupRegistrationEntity } from '../../../contexts/billing/infrastructure/entities/signup-registration.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

/** A `RESERVED` `SELF_SIGNUP` row with accepted terms by default. */
export class SignupRegistrationEntityBuilder {
  private id = uuidv7();
  private tenantId: string | null = null;
  private source = 'SELF_SIGNUP';
  private status = 'RESERVED';
  private googleSub: string | null = `sub-${uuidv7()}`;
  private taxIdType: string | null = null;
  private taxId: string | null = null;
  private termsVersion: string | null = '2026-11-01';
  private termsAcceptedAt: Date | null = new Date(Date.now() - 60_000);
  private createdAt = new Date(Date.now() - 60_000);

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withGoogleSub(googleSub: string | null): this {
    this.googleSub = googleSub;
    return this;
  }

  withSource(source: string): this {
    this.source = source;
    return this;
  }

  withStatus(status: string): this {
    this.status = status;
    return this;
  }

  /** An `OPERATOR` row has no Google `sub` and no terms. */
  asOperator(): this {
    this.withSource('OPERATOR');
    this.googleSub = null;
    this.termsVersion = null;
    this.termsAcceptedAt = null;
    return this;
  }

  withTaxId(type: string | null, value: string | null): this {
    this.taxIdType = type;
    this.taxId = value;
    return this;
  }

  /** `COMPLETED` rows belong to a tenant and no longer hold the tax id (S11 clears it). */
  completedFor(tenantId: string): this {
    this.withStatus('COMPLETED');
    this.tenantId = tenantId;
    this.taxIdType = null;
    this.taxId = null;
    return this;
  }

  withCreatedAt(createdAt: Date): this {
    this.createdAt = createdAt;
    return this;
  }

  build(): SignupRegistrationEntity {
    const e = new SignupRegistrationEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.source = this.source;
    e.status = this.status;
    e.googleSub = this.googleSub;
    e.taxIdType = this.taxIdType;
    e.taxId = this.taxId;
    e.termsVersion = this.termsVersion;
    e.termsAcceptedAt = this.termsAcceptedAt;
    e.createdAt = this.createdAt;
    return e;
  }
}
