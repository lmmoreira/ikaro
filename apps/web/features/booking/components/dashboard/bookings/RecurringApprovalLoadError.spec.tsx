// @vitest-environment jsdom
import { screen } from '@testing-library/react';
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
});
