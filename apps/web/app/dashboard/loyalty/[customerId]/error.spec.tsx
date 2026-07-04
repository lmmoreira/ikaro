// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CustomerLoyaltyRouteError from './error';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const map: Record<string, Record<string, string>> = {
      'dashboard.loyaltyPage': {
        searchErrorTitle: 'Não foi possível carregar a fidelidade',
        searchErrorBody: 'Tente novamente em instantes.',
      },
      booking: {
        'errors.tryAgain': 'Tentar novamente',
      },
    };

    return map[namespace]?.[key] ?? key;
  },
}));

describe('CustomerLoyaltyRouteError', () => {
  it('renders the fallback message and retry action', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<CustomerLoyaltyRouteError error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar a fidelidade')).toBeInTheDocument();
    expect(screen.getByText('Tente novamente em instantes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
