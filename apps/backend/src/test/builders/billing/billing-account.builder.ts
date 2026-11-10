import type { TaxIdType } from '@ikaro/i18n';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Address } from '../../../shared/value-objects/address';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Email } from '../../../shared/value-objects/email.vo';
import { TaxId } from '../../../shared/value-objects/tax-id.vo';
import {
  type AcceptedTerms,
  type AutoBilling,
  type AutoBillingStatus,
  BillingAccount,
  type BillingProvider,
} from '../../../contexts/billing/domain/billing-account.aggregate';

/** A persisted-looking billing account (`reconstitute`): a BR shell with no tax id (exempt/backfill). */
export class BillingAccountBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private countryCode = 'BR';
  private taxId: TaxId | null = null;
  private legalName: string | null = null;
  private billingEmail: Email | null = null;
  private address: Address | null = null;
  private provider: BillingProvider | null = null;
  private providerCustomerId: string | null = null;
  private readonly autoBilling: AutoBilling = 'NONE';
  private readonly autoBillingStatus: AutoBillingStatus = 'INACTIVE';
  private readonly autoBillingLabel: string | null = null;
  private acceptedTerms: AcceptedTerms | null = null;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCountryCode(countryCode: string): this {
    this.countryCode = countryCode;
    return this;
  }

  /** Built with `reconstitute`, so it skips the country check on purpose (tests can hold a mismatch). */
  withTaxId(value: string, type: TaxIdType): this {
    this.taxId = TaxId.reconstitute(value, type);
    return this;
  }

  withLegalName(legalName: string | null): this {
    this.legalName = legalName;
    return this;
  }

  withBillingEmail(address: string | null): this {
    this.billingEmail = address === null ? null : Email.create(address);
    return this;
  }

  withAddress(address: Address | null): this {
    this.address = address;
    return this;
  }

  withProvider(provider: BillingProvider | null, providerCustomerId: string | null): this {
    this.provider = provider;
    this.providerCustomerId = providerCustomerId;
    return this;
  }

  withAcceptedTerms(acceptedTerms: AcceptedTerms | null): this {
    this.acceptedTerms = acceptedTerms;
    return this;
  }

  build(): BillingAccount {
    const account = BillingAccount.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      countryCode: CountryCode.create(this.countryCode),
      taxId: this.taxId,
      legalName: this.legalName,
      billingEmail: this.billingEmail,
      address: this.address,
      provider: this.provider,
      providerCustomerId: this.providerCustomerId,
      autoBilling: this.autoBilling,
      autoBillingStatus: this.autoBillingStatus,
      autoBillingLabel: this.autoBillingLabel,
      acceptedTerms: this.acceptedTerms,
    });
    account.clearDomainEvents();
    return account;
  }
}
