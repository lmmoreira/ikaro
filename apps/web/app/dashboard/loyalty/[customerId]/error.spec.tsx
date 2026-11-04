// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CustomerLoyaltyRouteError from './error';

describe('CustomerLoyaltyRouteError', () => {
  it('renders the page-level message with the real pt-BR copy and a retry', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    renderWithIntl(<CustomerLoyaltyRouteError error={new Error('boom')} reset={reset} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-testid', 'page-feedback');
    expect(alert).toHaveTextContent('Não foi possível carregar a fidelidade do cliente');
    expect(alert).toHaveTextContent('Tente novamente em instantes.');
    expect(alert.parentElement?.className).toContain('border');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('renders the real en copy, never a raw translation key', () => {
    renderWithIntl(<CustomerLoyaltyRouteError error={new Error('boom')} reset={vi.fn()} />, {
      locale: 'en',
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Could not load the customer's loyalty");
    expect(alert).toHaveTextContent('Please try again in a moment.');
    expect(alert.textContent).not.toMatch(/routeError|searchErrorBody/);
  });
});
