import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

// Assembles an E.164 phone number from a raw (possibly already-prefixed) user input and
// the tenant's calling-code prefix (e.g. "+55", "+1") — see manifest.localization.phonePrefix.
export function buildContactPhone(rawInput: string, phonePrefix: string): string {
  const raw = rawInput.trim();
  const localDigits = digitsOnly(raw);
  if (raw.startsWith('+')) return `+${localDigits}`;
  if (!localDigits) return '';
  return `${phonePrefix}${localDigits}`;
}
