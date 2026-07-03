// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RemoveClosureDialog } from './RemoveClosureDialog';

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

describe('RemoveClosureDialog', () => {
  it('shows the selected closure details and removes it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const target = {
      id: 'closure-1',
      date: '2026-07-04',
      startTime: '09:00',
      endTime: '12:00',
      reason: 'MAINTENANCE' as const,
      notes: 'Preventive work',
    };

    renderWithIntl(
      <RemoveClosureDialog open target={target} onClose={vi.fn()} onSubmit={onSubmit} />,
    );

    expect(screen.getByText('Manutenção')).toBeInTheDocument();
    expect(screen.getByText('09:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('Preventive work')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover bloqueio' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('closure-1'));
  });
});
