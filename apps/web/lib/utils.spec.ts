import { describe, expect, it } from 'vitest';
import { buildContactPhone, digitsOnly } from './utils';

describe('digitsOnly', () => {
  it('strips every non-digit character', () => {
    expect(digitsOnly('(11) 99999-9999')).toBe('11999999999');
  });
});

describe('buildContactPhone', () => {
  it('prepends the phone prefix to raw local digits', () => {
    expect(buildContactPhone('11999999999', '+55')).toBe('+5511999999999');
  });

  it('strips formatting characters before applying the prefix', () => {
    expect(buildContactPhone('(11) 99999-9999', '+55')).toBe('+5511999999999');
  });

  it('keeps an already-prefixed input as-is (digits only, re-prefixed with +)', () => {
    expect(buildContactPhone('+5511999999999', '+1')).toBe('+5511999999999');
  });

  it('returns an empty string when there are no digits', () => {
    expect(buildContactPhone('   ', '+55')).toBe('');
  });

  it('supports a non-BR prefix', () => {
    expect(buildContactPhone('5551234567', '+1')).toBe('+15551234567');
  });
});
