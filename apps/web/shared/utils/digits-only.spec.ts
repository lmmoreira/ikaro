import { describe, expect, it } from 'vitest';
import { digitsOnly } from '@/shared/utils/digits-only';

describe('digitsOnly', () => {
  it('strips non-digit characters from a phone number with formatting', () => {
    expect(digitsOnly('+55 (31) 99999-8888')).toBe('5531999998888');
  });

  it('returns an already-clean digit string unchanged', () => {
    expect(digitsOnly('5531999998888')).toBe('5531999998888');
  });

  it('strips hyphens, spaces, parentheses, and plus signs', () => {
    expect(digitsOnly('(31) 9 9999-8888')).toBe('31999998888');
  });

  it('returns an empty string when input is all non-digits', () => {
    expect(digitsOnly('+()')).toBe('');
  });

  it('returns an empty string for an empty input', () => {
    expect(digitsOnly('')).toBe('');
  });
});
