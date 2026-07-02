import { digitsOnly } from './digits-only';

// Determines what to hand to buildContactPhone() from a raw <input> change event value — an
// explicit "+"-prefixed paste/typed value (already a full international number) is passed
// through untouched; a plain local-digit value is capped at the prefix's expected length.
export function buildContactPhone(rawInput: string, phonePrefix: string): string {
  const raw = rawInput.trim();
  const localDigits = digitsOnly(raw);
  if (raw.startsWith('+')) return `+${localDigits}`;
  if (!localDigits) return '';
  return `${phonePrefix}${localDigits}`;
}
