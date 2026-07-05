import { describe, expect, it } from 'vitest';
import { formatPostalCodeForDisplay } from './postal-code-format';

describe('formatPostalCodeForDisplay', () => {
  it('formats a BR CEP progressively against the 00000-000 placeholder', () => {
    expect(formatPostalCodeForDisplay('3', '00000-000')).toBe('3');
    expect(formatPostalCodeForDisplay('30130', '00000-000')).toBe('30130');
    expect(formatPostalCodeForDisplay('301301', '00000-000')).toBe('30130-1');
    expect(formatPostalCodeForDisplay('30130100', '00000-000')).toBe('30130-100');
  });

  it('strips non-digit characters from the raw input before masking', () => {
    expect(formatPostalCodeForDisplay('30130-100', '00000-000')).toBe('30130-100');
  });

  it('truncates digits beyond what the placeholder grid holds', () => {
    expect(formatPostalCodeForDisplay('301301000000', '00000-000')).toBe('30130-100');
  });

  it('formats a US ZIP against its 90210 placeholder (no grouping)', () => {
    expect(formatPostalCodeForDisplay('902101234', '90210')).toBe('90210');
  });

  it('returns raw digits unchanged when the placeholder has no digit grid', () => {
    expect(formatPostalCodeForDisplay('AB1 2CD', '')).toBe('');
  });
});
