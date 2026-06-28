// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { AdminCancelBookingSheet } from './AdminCancelBookingSheet';

describe('AdminCancelBookingSheet', () => {
  it('renders the optional reason form and submits empty reason', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithIntl(
      <AdminCancelBookingSheet
        open={true}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));

    expect(onSubmit).toHaveBeenCalledWith(undefined);
  });
});
