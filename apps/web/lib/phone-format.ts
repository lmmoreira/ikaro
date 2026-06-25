import { digitsOnly } from './utils';

// '#' is a digit placeholder, every other character is a literal. BR has two valid lengths
// (10-digit landline, 11-digit mobile) sharing the same area-code prefix; US has one.
const PHONE_MASKS: Readonly<Record<string, { readonly ten: string; readonly eleven?: string }>> = {
  '+55': { ten: '(##) ####-####', eleven: '(##) #####-####' },
  '+1': { ten: '(###) ###-####' },
};

const PHONE_PLACEHOLDERS: Readonly<Record<string, string>> = {
  '+55': '(11) 91234-5678',
  '+1': '(555) 123-4567',
};

function applyTemplate(digits: string, template: string): string {
  let result = '';
  let digitIndex = 0;
  for (const ch of template) {
    if (digitIndex >= digits.length) break;
    if (ch === '#') {
      result += digits[digitIndex];
      digitIndex += 1;
    } else {
      result += ch;
    }
  }
  return result;
}

// Max local-number digit count (excluding the country prefix) for a known phonePrefix.
// Unknown prefixes fall back to E.164's overall max (15 digits total, minus the prefix is not
// known here, so this is a generous cap rather than an exact one).
export function maxPhoneDigits(phonePrefix: string): number {
  const mask = PHONE_MASKS[phonePrefix];
  if (!mask) return 15;
  return mask.eleven ? 11 : 10;
}

// Formats raw local digits for display as the user types — e.g. "11999999999" -> "(11) 99999-9999"
// for +55. Unknown prefixes return the digits unchanged (no mask defined).
export function formatPhoneForDisplay(rawValue: string, phonePrefix: string): string {
  const digits = digitsOnly(rawValue).slice(0, maxPhoneDigits(phonePrefix));
  const mask = PHONE_MASKS[phonePrefix];
  if (!mask) return digits;
  const template = mask.eleven && digits.length > 10 ? mask.eleven : mask.ten;
  return applyTemplate(digits, template);
}

export function phonePlaceholder(phonePrefix: string): string {
  return PHONE_PLACEHOLDERS[phonePrefix] ?? '';
}

// Determines what to hand to buildContactPhone() from a raw <input> change event value — an
// explicit "+"-prefixed paste/typed value (already a full international number) is passed
// through untouched; a plain local-digit value is capped at the prefix's expected length.
export function sanitizePhoneInput(rawValue: string, phonePrefix: string): string {
  if (rawValue.trim().startsWith('+')) return rawValue;
  return digitsOnly(rawValue).slice(0, maxPhoneDigits(phonePrefix));
}
