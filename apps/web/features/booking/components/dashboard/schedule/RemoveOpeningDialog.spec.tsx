// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RemoveOpeningDialog } from './RemoveOpeningDialog';

vi.mock('@/features/booking/components/dashboard/bookings/BookingActionSheetShell', () => ({
  BookingActionSheetShell: ({
    children,
    onClose,
    onSubmit,
    cancelLabel,
    submitLabel,
    title,
    description,
    error,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
    cancelLabel: string;
    submitLabel: string;
    title: React.ReactNode;
    description: React.ReactNode;
    error: string | null;
  }) => (
    <form onSubmit={onSubmit}>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={onClose}>
        {cancelLabel}
      </button>
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

beforeEach(() => vi.clearAllMocks());

describe('RemoveOpeningDialog', () => {
  it('shows the selected opening details and removes it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const target = {
      id: 'opening-1',
      date: '2026-07-05',
      startTime: '09:00',
      endTime: '14:00',
      notes: 'Horário especial',
    };

    renderWithIntl(
      <RemoveOpeningDialog open target={target} onClose={vi.fn()} onSubmit={onSubmit} />,
    );

    expect(screen.getByText(/julho/i)).toBeInTheDocument();
    expect(screen.getByText('09:00–14:00')).toBeInTheDocument();
    expect(screen.getByText('Horário especial')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover abertura' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('opening-1'));
  });
});
