import { digitsOnly } from './digits-only';
import { applyMaskTemplate } from './mask-template';

// Derives a digit-grid mask straight from the country's postal placeholder
// (e.g. AddressSpec.postalPlaceholder '00000-000' -> '#####-###'), so the mask
// stays in sync with countrySpec() instead of a second, hand-maintained template.
function maskTemplateFromPlaceholder(postalPlaceholder: string): string {
  return postalPlaceholder.replaceAll(/\d/g, '#');
}

// Formats raw digits for display as the user types — e.g. "30130100" -> "30130-100"
// for a '00000-000' placeholder. A placeholder with no digit grouping (e.g. a country
// with no postal code) returns the digits unchanged.
export function formatPostalCodeForDisplay(rawValue: string, postalPlaceholder: string): string {
  const template = maskTemplateFromPlaceholder(postalPlaceholder);
  const maxDigits = template.replaceAll(/[^#]/g, '').length;
  const digits = digitsOnly(rawValue).slice(0, maxDigits);
  if (maxDigits === 0) return digits;
  return applyMaskTemplate(digits, template);
}
