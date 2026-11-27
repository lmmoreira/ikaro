import type { TaxIdType } from '@ikaro/i18n';
import { normalizeOptionalText } from '../../../shared/utils/text-normalization';
import { Address } from '../../../shared/value-objects/address';
import type { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Email } from '../../../shared/value-objects/email.vo';
import { TaxId } from '../../../shared/value-objects/tax-id.vo';

/** The part of a `BillingAccount` a manager edits (UC-118). */
export interface BillingIdentity {
  readonly taxId: TaxId | null;
  readonly legalName: string | null;
  readonly billingEmail: Email | null;
  readonly address: Address | null;
}

export interface BillingIdentityAddressPatch {
  street?: string;
  number?: string;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string;
  state?: string;
  zipCode?: string;
}

/**
 * A partial update. A field left out (`undefined`) is untouched; `null` or a blank string clears
 * `taxId`, `legalName` and `billingEmail`; `address` carries only the sub-fields to change.
 */
export interface BillingIdentityPatch {
  taxId?: string | null;
  taxIdType?: TaxIdType | null;
  legalName?: string | null;
  billingEmail?: string | null;
  address?: BillingIdentityAddressPatch;
}

// A blank value clears the id where the country does not require one (`createOptional` throws
// `SIGNUP_TAX_ID_REQUIRED` where it does, so a BR tax id is replaced, never cleared). Clearing an
// id the account never had changes nothing, so an account that holds none (an exempt tenant's
// shell) is not refused for asking.
function resolveTaxId(
  current: TaxId | null,
  patch: BillingIdentityPatch,
  country: CountryCode,
): TaxId | null {
  if (patch.taxId === undefined) return current;
  if (normalizeOptionalText(patch.taxId) === null && current === null) return null;
  return TaxId.createOptional(patch.taxId, country.spec.taxId, patch.taxIdType ?? undefined);
}

function resolveText(current: string | null, patch: string | null | undefined): string | null {
  return patch === undefined ? current : normalizeOptionalText(patch);
}

function resolveEmail(current: Email | null, patch: string | null | undefined): Email | null {
  if (patch === undefined) return current;
  const address = normalizeOptionalText(patch);
  return address === null ? null : Email.create(address);
}

// The sent sub-fields are merged over the stored address (or over nothing) and the merged whole is
// validated, so a half-typed address is never stored: what is still missing is `Address.create`'s
// own field error. `complement` and `neighborhood` clear with `null` or a blank string.
function resolveAddress(
  current: Address | null,
  patch: BillingIdentityPatch['address'],
  country: CountryCode,
): Address | null {
  if (patch === undefined) return current;
  const optional = (sent: string | null | undefined, stored: string | undefined) =>
    sent === undefined ? stored : (sent ?? undefined);
  return Address.create(
    {
      street: patch.street ?? current?.street ?? '',
      number: patch.number ?? current?.number ?? '',
      complement: optional(patch.complement, current?.complement),
      neighborhood: optional(patch.neighborhood, current?.neighborhood),
      city: patch.city ?? current?.city ?? '',
      state: patch.state ?? current?.state ?? '',
      zipCode: patch.zipCode ?? current?.zipCode ?? '',
    },
    country.spec.address,
  );
}

/**
 * The identity after `patch`, or a thrown value-object error with the identity unchanged (every
 * field is resolved before anything is assigned). Throws `TaxIdValidationError`,
 * `EmailValidationError` or `AddressValidationError`.
 */
export function applyBillingIdentityPatch(
  current: BillingIdentity,
  patch: BillingIdentityPatch,
  country: CountryCode,
): BillingIdentity {
  return {
    taxId: resolveTaxId(current.taxId, patch, country),
    legalName: resolveText(current.legalName, patch.legalName),
    billingEmail: resolveEmail(current.billingEmail, patch.billingEmail),
    address: resolveAddress(current.address, patch.address, country),
  };
}
