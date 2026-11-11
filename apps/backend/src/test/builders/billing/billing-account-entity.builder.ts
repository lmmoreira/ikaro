import type { AddressProps } from '../../../shared/value-objects/address';
import { BillingAccountEntity } from '../../../contexts/billing/infrastructure/entities/billing-account.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class BillingAccountEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private taxIdType: string | null = null;
  private taxId: string | null = null;
  private legalName: string | null = null;
  private billingEmail: string | null = null;
  private address: AddressProps | null = null;
  private provider: string | null = null;
  private providerCustomerId: string | null = null;
  private readonly autoBilling = 'NONE';
  private readonly autoBillingStatus = 'INACTIVE';
  private readonly autoBillingLabel: string | null = null;
  private termsVersion: string | null = null;
  private termsAcceptedAt: Date | null = null;
  private termsAcceptedBy: string | null = null;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withTaxId(type: string | null, value: string | null): this {
    this.taxIdType = type;
    this.taxId = value;
    return this;
  }

  withLegalName(legalName: string | null): this {
    this.legalName = legalName;
    return this;
  }

  withBillingEmail(billingEmail: string | null): this {
    this.billingEmail = billingEmail;
    return this;
  }

  withAddress(address: AddressProps | null): this {
    this.address = address;
    return this;
  }

  withProvider(provider: string | null, providerCustomerId: string | null): this {
    this.provider = provider;
    this.providerCustomerId = providerCustomerId;
    return this;
  }

  withTerms(version: string | null, acceptedAt: Date | null, acceptedBy: string | null): this {
    this.termsVersion = version;
    this.termsAcceptedAt = acceptedAt;
    this.termsAcceptedBy = acceptedBy;
    return this;
  }

  build(): BillingAccountEntity {
    const e = new BillingAccountEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.taxIdType = this.taxIdType;
    e.taxId = this.taxId;
    e.legalName = this.legalName;
    e.billingEmail = this.billingEmail;
    e.address = this.address;
    e.provider = this.provider;
    e.providerCustomerId = this.providerCustomerId;
    e.autoBilling = this.autoBilling;
    e.autoBillingStatus = this.autoBillingStatus;
    e.autoBillingLabel = this.autoBillingLabel;
    e.termsVersion = this.termsVersion;
    e.termsAcceptedAt = this.termsAcceptedAt;
    e.termsAcceptedBy = this.termsAcceptedBy;
    e.updatedAt = new Date();
    return e;
  }
}
