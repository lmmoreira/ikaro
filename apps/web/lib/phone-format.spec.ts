import { describe, expect, it } from 'vitest';
import {
  formatPhoneForDisplay,
  maxPhoneDigits,
  phonePlaceholder,
  sanitizePhoneInput,
} from './phone-format';

describe('maxPhoneDigits', () => {
  it('returns 11 for +55 (BR mobile is the longest valid form)', () => {
    expect(maxPhoneDigits('+55')).toBe(11);
  });

  it('returns 10 for +1', () => {
    expect(maxPhoneDigits('+1')).toBe(10);
  });

  it('falls back to 15 for an unknown prefix', () => {
    expect(maxPhoneDigits('+999')).toBe(15);
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats a BR mobile number (11 digits) progressively', () => {
    expect(formatPhoneForDisplay('1', '+55')).toBe('(1');
    expect(formatPhoneForDisplay('11', '+55')).toBe('(11');
    expect(formatPhoneForDisplay('119999', '+55')).toBe('(11) 9999');
    expect(formatPhoneForDisplay('11999999999', '+55')).toBe('(11) 99999-9999');
  });

  it('formats a BR landline number (10 digits) with the shorter template', () => {
    expect(formatPhoneForDisplay('1133334444', '+55')).toBe('(11) 3333-4444');
  });

  it('formats a US number (10 digits)', () => {
    expect(formatPhoneForDisplay('5551234567', '+1')).toBe('(555) 123-4567');
  });

  it('strips non-digit characters from the raw input before masking', () => {
    expect(formatPhoneForDisplay('(11) 99999-9999', '+55')).toBe('(11) 99999-9999');
  });

  it('truncates digits beyond the max for the prefix', () => {
    expect(formatPhoneForDisplay('119999999999999', '+55')).toBe('(11) 99999-9999');
  });

  it('returns raw digits unchanged for an unknown prefix', () => {
    expect(formatPhoneForDisplay('12345', '+999')).toBe('12345');
  });
});

describe('sanitizePhoneInput', () => {
  it('caps a plain local-digit value at the prefix max', () => {
    expect(sanitizePhoneInput('119999999999999', '+55')).toBe('11999999999');
  });

  it('strips mask literals from a plain local-digit value', () => {
    expect(sanitizePhoneInput('(11) 99999-9999', '+55')).toBe('11999999999');
  });

  it('passes a "+"-prefixed value through untouched, without truncating', () => {
    expect(sanitizePhoneInput('+5511912345678', '+55')).toBe('+5511912345678');
  });
});

describe('phonePlaceholder', () => {
  it('returns the BR example for +55', () => {
    expect(phonePlaceholder('+55')).toBe('(11) 91234-5678');
  });

  it('returns the US example for +1', () => {
    expect(phonePlaceholder('+1')).toBe('(555) 123-4567');
  });

  it('returns an empty string for an unknown prefix', () => {
    expect(phonePlaceholder('+999')).toBe('');
  });
});
