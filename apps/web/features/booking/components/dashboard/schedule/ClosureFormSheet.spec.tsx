// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ClosureFormSheet } from './ClosureFormSheet';

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

describe('ClosureFormSheet', () => {
  it('submits the selected closure values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'closure-1' });
    const onClose = vi.fn();

    renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/4 de julho/i);

    await user.selectOptions(screen.getByLabelText('Motivo'), 'MAINTENANCE');
    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora final' }));
    await user.click(screen.getByRole('option', { name: '12:00' }));
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Manutenção preventiva' },
    });
    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        date: '2026-07-04',
        reason: 'MAINTENANCE',
        startTime: '09:00',
        endTime: '12:00',
        notes: 'Manutenção preventiva',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('shows a validation error for past dates', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-06-30"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(screen.getByText('Escolha hoje ou uma data futura para bloquear.')).toBeInTheDocument();
  });

  it('shows a validation error when only one time is selected', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(screen.getByText('Informe o horário inicial e final juntos.')).toBeInTheDocument();
  });

  it('shows a validation error when the time range is inverted', () => {
    const { container } = renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    const timeSelects = container.querySelectorAll('select[aria-hidden="true"]');
    expect(timeSelects).toHaveLength(2);

    fireEvent.change(timeSelects[0], { target: { value: '12:00' } });
    fireEvent.change(timeSelects[1], { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(
      screen.getByText('O horário inicial precisa ser anterior ao final.'),
    ).toBeInTheDocument();
  });

  it('resets the date when the sheet is reopened for a different day', () => {
    const { unmount } = renderWithIntl(
      <ClosureFormSheet
        key="closure-a"
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/4 de julho/i);

    unmount();

    renderWithIntl(
      <ClosureFormSheet
        key="closure-b"
        open
        initialDate="2026-07-11"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-2' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/11 de julho/i);
  });
});
