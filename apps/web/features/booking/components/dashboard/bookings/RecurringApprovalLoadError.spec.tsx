// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { RecurringApprovalLoadError } from './RecurringApprovalLoadError';

describe('RecurringApprovalLoadError', () => {
  it('says the request was not found on a 404, with no retry (it will not appear)', () => {
    renderWithIntl(
      <RecurringApprovalLoadError
        error={new ApiError(404, 'BOOKING_RECURRING_SCHEDULE_NOT_FOUND', {})}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Este pedido não foi encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
  });

  it.each([
    ['a network error', new Error('Network Error')],
    ['a server error', new ApiError(500, 'GENERIC_INTERNAL_ERROR', {})],
    ['no error object at all', null],
  ])('offers a retry for %s', async (_label, error) => {
    const onRetry = vi.fn();
    renderWithIntl(<RecurringApprovalLoadError error={error} onRetry={onRetry} />);

    expect(screen.getByText('Não foi possível carregar este pedido.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('announces the failure with role alert inside the page-level wrapper, retry included', () => {
    renderWithIntl(<RecurringApprovalLoadError error={new Error('x')} onRetry={vi.fn()} />);

    const wrapper = screen.getByTestId('recurring-approval-error');
    const alert = within(wrapper).getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar este pedido.');
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('announces the 404 too, without a retry in the alert', () => {
    renderWithIntl(
      <RecurringApprovalLoadError
        error={new ApiError(404, 'BOOKING_RECURRING_SCHEDULE_NOT_FOUND', {})}
        onRetry={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Este pedido não foi encontrado.');
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
  });
});
