import { describe, expect, it } from 'vitest';
import { FormattingContext, type FormattingState } from './formatting-context';

describe('FormattingContext', () => {
  it('has pt-BR defaults', () => {
    const defaults = (FormattingContext as unknown as { _currentValue: FormattingState })
      ._currentValue;
    expect(defaults.locale).toBe('pt-BR');
    expect(defaults.currency).toBe('BRL');
    expect(defaults.timezone).toBe('America/Sao_Paulo');
    expect(defaults.dateFormat).toBe('DD/MM/YYYY');
    expect(defaults.timeFormat).toBe('24h');
  });
});
