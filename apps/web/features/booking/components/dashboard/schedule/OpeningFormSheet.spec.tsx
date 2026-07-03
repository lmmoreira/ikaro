// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { OpeningFormSheet } from './OpeningFormSheet';

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

describe('OpeningFormSheet', () => {
  it('submits the selected special opening values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'opening-1' });
    const onClose = vi.fn();

    renderWithIntl(
      <OpeningFormSheet
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/5 de julho/i);

    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora final' }));
    await user.click(screen.getByRole('option', { name: '14:00' }));
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Horário especial' },
    });
    await user.click(screen.getByRole('button', { name: 'Abrir dia' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        date: '2026-07-05',
        startTime: '09:00',
        endTime: '14:00',
        notes: 'Horário especial',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('shows a validation error when the opening times are incomplete', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <OpeningFormSheet
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-1' })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir dia' }));

    expect(screen.getByText('Informe o horário inicial e final.')).toBeInTheDocument();
  });

  it('resets the date when the sheet is reopened for a different day', () => {
    const { unmount } = renderWithIntl(
      <OpeningFormSheet
        key="opening-a"
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-1' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/5 de julho/i);

    unmount();

    renderWithIntl(
      <OpeningFormSheet
        key="opening-b"
        open
        initialDate="2026-07-12"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-2' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/12 de julho/i);
  });
});
