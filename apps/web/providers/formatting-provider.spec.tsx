// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it } from 'vitest';
import { FormattingContext } from '@/lib/formatting/formatting-context';
import { FormattingProvider } from './formatting-provider';

function Consumer(): React.JSX.Element {
  const ctx = useContext(FormattingContext);
  return (
    <div>
      <span data-testid="locale">{ctx.locale}</span>
      <span data-testid="currency">{ctx.currency}</span>
      <span data-testid="timezone">{ctx.timezone}</span>
      <span data-testid="dateFormat">{ctx.dateFormat}</span>
      <span data-testid="timeFormat">{ctx.timeFormat}</span>
    </div>
  );
}

const DEFAULT_PROPS = {
  locale: 'en',
  currency: 'USD',
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h' as const,
};

describe('FormattingProvider', () => {
  it('provides formatting state to consumers', () => {
    render(
      <FormattingProvider {...DEFAULT_PROPS}>
        <Consumer />
      </FormattingProvider>,
    );

    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('currency')).toHaveTextContent('USD');
    expect(screen.getByTestId('timezone')).toHaveTextContent('America/New_York');
    expect(screen.getByTestId('dateFormat')).toHaveTextContent('MM/DD/YYYY');
    expect(screen.getByTestId('timeFormat')).toHaveTextContent('12h');
  });

  it('provides pt-BR state for a BR tenant', () => {
    render(
      <FormattingProvider
        locale="pt-BR"
        currency="BRL"
        timezone="America/Sao_Paulo"
        dateFormat="DD/MM/YYYY"
        timeFormat="24h"
      >
        <Consumer />
      </FormattingProvider>,
    );

    expect(screen.getByTestId('locale')).toHaveTextContent('pt-BR');
    expect(screen.getByTestId('currency')).toHaveTextContent('BRL');
    expect(screen.getByTestId('timeFormat')).toHaveTextContent('24h');
  });
});
