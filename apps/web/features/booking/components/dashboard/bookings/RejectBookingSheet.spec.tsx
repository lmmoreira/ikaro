// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RejectBookingSheet } from './RejectBookingSheet';

describe('RejectBookingSheet', () => {
  it('does not render when closed', () => {
    const { container } = renderWithIntl(
      <RejectBookingSheet open={false} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('submits a reason and closes the sheet', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithIntl(
      <RejectBookingSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await userEvent.type(screen.getByRole('textbox'), 'Serviço indisponível');
    await userEvent.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(onSubmit).toHaveBeenCalledWith('Serviço indisponível');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('surfaces the resolved message thrown by onSubmit instead of swallowing it', async () => {
    const onClose = vi.fn();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('This value must be at least 10 characters.'));

    renderWithIntl(
      <RejectBookingSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(
      await screen.findByText('This value must be at least 10 characters.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the localized fallback when onSubmit rejects without an Error instance', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue('unexpected non-Error rejection');

    renderWithIntl(
      <RejectBookingSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(
      await screen.findByText('Não foi possível rejeitar. Tente novamente.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
