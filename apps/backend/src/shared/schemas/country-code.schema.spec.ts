import { CountryCodeErrorCode } from '@ikaro/types';
import { CountryCodeSchema } from './country-code.schema';

describe('CountryCodeSchema', () => {
  it('accepts a supported code and normalizes it to uppercase', () => {
    const result = CountryCodeSchema.safeParse('br');

    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('BR');
  });

  it('trims surrounding whitespace before validating', () => {
    const result = CountryCodeSchema.safeParse('  BR  ');

    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('BR');
  });

  it('rejects a malformed code with GENERIC_FORMAT_INVALID from the regex stage', () => {
    const result = CountryCodeSchema.safeParse('brazil');

    expect(result.success).toBe(false);
  });

  it('rejects a well-formed but unsupported code with CountryCodeErrorCode.UNSUPPORTED', () => {
    const result = CountryCodeSchema.safeParse('ZZ');

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.code).toBe('custom');
      expect((issue as { params?: { code?: string } }).params?.code).toBe(
        CountryCodeErrorCode.UNSUPPORTED,
      );
    }
  });
});
