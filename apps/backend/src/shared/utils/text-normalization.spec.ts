import { normalizeOptionalText, normalizeText } from './text-normalization';

describe('text-normalization', () => {
  it('trims required text', () => {
    expect(normalizeText('  João Silva  ')).toBe('João Silva');
  });

  it('normalizes blank optional text to null', () => {
    expect(normalizeOptionalText('   ')).toBeNull();
  });

  it('returns null for missing optional text', () => {
    expect(normalizeOptionalText(null)).toBeNull();
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it('trims optional text when present', () => {
    expect(normalizeOptionalText('  Favor chegar 10 minutos antes  ')).toBe(
      'Favor chegar 10 minutos antes',
    );
  });
});
