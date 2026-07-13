// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RequestInfoSheet } from './RequestInfoSheet';

describe('RequestInfoSheet', () => {
  it('does not render when closed', () => {
    const { container } = renderWithIntl(
      <RequestInfoSheet open={false} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('submits a message and closes the sheet', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithIntl(
      <RequestInfoSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await userEvent.type(screen.getByRole('textbox'), 'Pode enviar mais fotos?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSubmit).toHaveBeenCalledWith('Pode enviar mais fotos?');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('surfaces the resolved message thrown by onSubmit instead of swallowing it', async () => {
    const onClose = vi.fn();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('This value must be at least 20 characters.'));

    renderWithIntl(
      <RequestInfoSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('This value must be at least 20 characters.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the localized fallback when onSubmit rejects without an Error instance', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue('unexpected non-Error rejection');

    renderWithIntl(
      <RequestInfoSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Não foi possível enviar a solicitação. Tente novamente.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
