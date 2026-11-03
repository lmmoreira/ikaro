// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MyAccountRouteError } from './MyAccountRouteError';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      title: 'Não foi possível carregar seus dados',
      body: 'Tente novamente em instantes.',
      retry: 'Tentar novamente',
    })[key] ?? key,
}));

describe('MyAccountRouteError', () => {
  it('shows the shared page-level message as an alert with the title and body', () => {
    render(<MyAccountRouteError onRetry={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar seus dados');
    expect(alert).toHaveTextContent('Tente novamente em instantes.');
    expect(screen.getByTestId('my-account-route-error')).toBe(alert);
  });

  it('retries by calling onRetry', async () => {
    const onRetry = vi.fn();
    render(<MyAccountRouteError onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
