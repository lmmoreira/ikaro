import type { TaxIdType } from '@ikaro/i18n';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Address } from '../../../shared/value-objects/address';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Email } from '../../../shared/value-objects/email.vo';
import { TaxId } from '../../../shared/value-objects/tax-id.vo';
import { BillingAccountTaxIdNotAllowedError } from './errors/billing-domain.error';

export type BillingProvider = 'ASAAS' | 'STRIPE';
/** `CARD_RECURRING` only in slice F2; mirrored from the provider, never card data. */
export type AutoBilling = 'NONE' | 'PIX_AUTOMATICO' | 'CARD_RECURRING';
export type AutoBillingStatus = 'INACTIVE' | 'PENDING_AUTHORIZATION' | 'ACTIVE';

export interface AcceptedTerms {
  readonly version: string;
  readonly acceptedAt: Date;
  // The signing user's Google email; NULL when the registration came from the operator.
  readonly acceptedBy: string | null;
}

export interface BillingAccountProps {
  id: string;
  tenantId: string;
  // The billing country, taken from the tenant's subscription (immutable there): the repository
  // hydrates it and never writes it, because `billing_accounts` has no such column.
  countryCode: CountryCode;
  taxId: TaxId | null;
  legalName: string | null;
  billingEmail: Email | null;
  address: Address | null;
  provider: BillingProvider | null;
  providerCustomerId: string | null;
  autoBilling: AutoBilling;
  autoBillingStatus: AutoBillingStatus;
  autoBillingLabel: string | null;
  acceptedTerms: AcceptedTerms | null;
}

/** A tax id to build from raw input, or one already built (e.g. copied from a registration). */
export type TaxIdInput = TaxId | { raw: string | null; declaredType?: TaxIdType } | null;

export interface CreateBillingAccountInput {
  tenantId: string;
  countryCode: CountryCode;
  taxId: TaxIdInput;
  // Whether a missing tax id is refused where the country requires one (BR). The caller sets it
  // `true` only where an earlier step already enforced one (a SELF_SIGNUP registration): an
  // operator's registration may carry none (the operator is trusted, UC-110 A7) and an exempt
  // tenant is never charged, so both hold none. The aggregate does not know the subscription's
  // `exempt` flag or the registration's source.
  requireTaxId: boolean;
  legalName?: string | null;
  billingEmail?: Email | null;
  acceptedTerms?: AcceptedTerms | null;
}

/**
 * The tenant's billing identity (1 per tenant): tax id, legal name, billing email, address, the
 * provider customer and the accepted terms. A separate aggregate from `Subscription` — a different
 * actor edits it for different reasons. Tax identity is financial data: never in `tenants.settings`.
 */
export class BillingAccount extends AggregateRoot {
  readonly id: string;
  readonly tenantId: string;
  readonly countryCode: CountryCode;
  readonly taxId: TaxId | null;
  readonly legalName: string | null;
  readonly billingEmail: Email | null;
  readonly address: Address | null;
  readonly provider: BillingProvider | null;
  readonly providerCustomerId: string | null;
  readonly autoBilling: AutoBilling;
  readonly autoBillingStatus: AutoBillingStatus;
  readonly autoBillingLabel: string | null;
  readonly acceptedTerms: AcceptedTerms | null;

  private constructor(props: BillingAccountProps) {
    super();
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.countryCode = props.countryCode;
    this.taxId = props.taxId;
    this.legalName = props.legalName;
    this.billingEmail = props.billingEmail;
    this.address = props.address;
    this.provider = props.provider;
    this.providerCustomerId = props.providerCustomerId;
    this.autoBilling = props.autoBilling;
    this.autoBillingStatus = props.autoBillingStatus;
    this.autoBillingLabel = props.autoBillingLabel;
    this.acceptedTerms = props.acceptedTerms;
  }

  /**
   * A tax id always belongs to the account's country (`CountrySpec.taxId`): BR holds a CPF or
   * CNPJ, the US an EIN or a declared `OTHER`, any other country only `OTHER`. A raw value is built
   * through `TaxId.createOptional` (a blank one is `SIGNUP_TAX_ID_REQUIRED` only where the country
   * requires one and `requireTaxId` is set); a ready-made `TaxId` of a type the country does not
   * accept is refused.
   */
  static create(input: CreateBillingAccountInput): BillingAccount {
    return new BillingAccount({
      id: uuidv7(),
      tenantId: input.tenantId,
      countryCode: input.countryCode,
      taxId: BillingAccount.resolveTaxId(input),
      legalName: input.legalName ?? null,
      billingEmail: input.billingEmail ?? null,
      address: null,
      provider: null,
      providerCustomerId: null,
      autoBilling: 'NONE',
      autoBillingStatus: 'INACTIVE',
      autoBillingLabel: null,
      acceptedTerms: input.acceptedTerms ?? null,
    });
  }

  /** Never validates: an exempt tenant's shell has no tax id, whatever its country requires. */
  static reconstitute(props: BillingAccountProps): BillingAccount {
    return new BillingAccount(props);
  }

  private static resolveTaxId(input: CreateBillingAccountInput): TaxId | null {
    const spec = input.countryCode.spec.taxId;
    if (input.taxId instanceof TaxId) {
      if (!input.taxId.isAllowedFor(spec)) {
        throw new BillingAccountTaxIdNotAllowedError(
          `A ${input.taxId.type} tax id is not accepted in ${input.countryCode.value}`,
        );
      }
      return input.taxId;
    }
    const raw = input.taxId?.raw ?? null;
    const declaredType = input.taxId?.declaredType;
    const effective = input.requireTaxId ? spec : { ...spec, required: false };
    // `createOptional` throws SIGNUP_TAX_ID_REQUIRED for a blank value only when `effective.required`.
    return TaxId.createOptional(raw, effective, declaredType);
  }
}
