import { describe, expect, it } from 'vitest';
import { isValidTimezone, resolveDateFormat } from './locale-validators';

describe('locale validators', () => {
  it('accepts a real IANA timezone and rejects an invalid one', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('Not/A-Timezone')).toBe(false);
  });

  it('falls back to the default date format when the input is unsupported', () => {
    expect(resolveDateFormat('DD/MM/YYYY')).toBe('DD/MM/YYYY');
    expect(resolveDateFormat('YYYY/MM/DD')).toBe('DD/MM/YYYY');
  });
});
