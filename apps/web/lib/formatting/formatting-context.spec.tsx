// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it } from 'vitest';
import { FormattingContext, type FormattingState } from './formatting-context';

function DefaultConsumer(): React.JSX.Element {
  const ctx = useContext(FormattingContext);
  return (
    <div>
      <span data-testid="locale">{ctx.locale}</span>
      <span data-testid="currency">{ctx.currency}</span>
      <span data-testid="timezone">{ctx.timezone}</span>
      <span data-testid="dateFormat">{ctx.dateFormat}</span>
      <span data-testid="timeFormat">{ctx.timeFormat}</span>
      <span data-testid="welcomeStaffScreenDays">{ctx.welcomeStaffScreenDays}</span>
    </div>
  );
}

describe('FormattingContext', () => {
  it('provides pt-BR defaults when no provider is present', () => {
    render(<DefaultConsumer />);

    expect(screen.getByTestId('locale')).toHaveTextContent('pt-BR');
    expect(screen.getByTestId('currency')).toHaveTextContent('BRL');
    expect(screen.getByTestId('timezone')).toHaveTextContent('America/Sao_Paulo');
    expect(screen.getByTestId('dateFormat')).toHaveTextContent('DD/MM/YYYY');
    expect(screen.getByTestId('timeFormat')).toHaveTextContent('24h');
    expect(screen.getByTestId('welcomeStaffScreenDays')).toHaveTextContent('14');
  });

  it('FormattingState interface has required fields with correct types', () => {
    const state: FormattingState = {
      locale: 'en',
      currency: 'USD',
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      welcomeStaffScreenDays: 14,
    };
    expect(state.dateFormat).toBe('MM/DD/YYYY');
    expect(state.timeFormat).toBe('12h');
    expect(state.welcomeStaffScreenDays).toBe(14);
  });
});
