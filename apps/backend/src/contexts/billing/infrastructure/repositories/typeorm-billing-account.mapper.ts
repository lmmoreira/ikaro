import type { TaxIdType } from '@ikaro/i18n';
import { Address } from '../../../../shared/value-objects/address';
import type { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { Email } from '../../../../shared/value-objects/email.vo';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import {
  type AutoBilling,
  type AutoBillingStatus,
  BillingAccount,
  type BillingProvider,
} from '../../domain/billing-account.aggregate';
import { BillingAccountEntity } from '../entities/billing-account.entity';

export function billingAccountToDomain(
  entity: BillingAccountEntity,
  countryCode: CountryCode,
): BillingAccount {
  const hasTerms = entity.termsVersion !== null && entity.termsAcceptedAt !== null;
  return BillingAccount.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    countryCode,
    taxId:
      entity.taxId !== null && entity.taxIdType !== null
        ? TaxId.reconstitute(entity.taxId, entity.taxIdType as TaxIdType)
        : null,
    legalName: entity.legalName,
    billingEmail: entity.billingEmail === null ? null : Email.reconstitute(entity.billingEmail),
    address: entity.address === null ? null : Address.reconstitute(entity.address),
    provider: entity.provider as BillingProvider | null,
    providerCustomerId: entity.providerCustomerId,
    autoBilling: entity.autoBilling as AutoBilling,
    autoBillingStatus: entity.autoBillingStatus as AutoBillingStatus,
    autoBillingLabel: entity.autoBillingLabel,
    acceptedTerms: hasTerms
      ? {
          version: entity.termsVersion as string,
          acceptedAt: entity.termsAcceptedAt as Date,
          acceptedBy: entity.termsAcceptedBy,
        }
      : null,
  });
}

/** The country is never written: it lives on the tenant's subscription. */
export function billingAccountToEntity(account: BillingAccount): BillingAccountEntity {
  const entity = new BillingAccountEntity();
  entity.id = account.id;
  entity.tenantId = account.tenantId;
  entity.taxIdType = account.taxId?.type ?? null;
  entity.taxId = account.taxId?.value ?? null;
  entity.legalName = account.legalName;
  entity.billingEmail = account.billingEmail?.address ?? null;
  entity.address = account.address?.toJSON() ?? null;
  entity.provider = account.provider;
  entity.providerCustomerId = account.providerCustomerId;
  entity.autoBilling = account.autoBilling;
  entity.autoBillingStatus = account.autoBillingStatus;
  entity.autoBillingLabel = account.autoBillingLabel;
  entity.termsVersion = account.acceptedTerms?.version ?? null;
  entity.termsAcceptedAt = account.acceptedTerms?.acceptedAt ?? null;
  entity.termsAcceptedBy = account.acceptedTerms?.acceptedBy ?? null;
  entity.updatedAt = new Date();
  return entity;
}
