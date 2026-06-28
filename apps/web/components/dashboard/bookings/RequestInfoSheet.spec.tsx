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

    await userEvent.type(screen.getByRole('textbox'), 'Pode enviar mais fotos?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSubmit).toHaveBeenCalledWith('Pode enviar mais fotos?');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the backend validation message when submit fails with violations', async () => {
    const onClose = vi.fn();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('Too small: expected string to have >=20 characters'));

    renderWithIntl(
      <RequestInfoSheet open={true} isSubmitting={false} onClose={onClose} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Too small: expected string to have >=20 characters'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
