// @vitest-environment jsdom
import type { FormEvent, ReactNode } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ScheduleDateTimeRangeSheet } from './ScheduleDateTimeRangeSheet';

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
    children: ReactNode;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
    cancelLabel: string;
    submitLabel: string;
    title: ReactNode;
    description: ReactNode;
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

describe('ScheduleDateTimeRangeSheet', () => {
  it('submits the collected form values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'item-1' });

    renderWithIntl(
      <ScheduleDateTimeRangeSheet<
        { date: string; startTime: string; endTime: string; notes?: string },
        { id: string }
      >
        open
        initialDate="2026-07-05"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        titleId="range-title"
        descriptionId="range-description"
        title="Título"
        description="Descrição"
        cancelLabel="Cancelar"
        submitLabel="Salvar"
        dateLabel="Data"
        startTimeLabel="Hora inicial"
        endTimeLabel="Hora final"
        notesLabel="Observações"
        timePlaceholder="Escolher"
        validate={() => null}
        buildRequest={({ date, startTime, endTime, notes }) => ({
          date,
          startTime,
          endTime,
          ...(notes ? { notes } : {}),
        })}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora final' }));
    await user.click(screen.getByRole('option', { name: '12:00' }));
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Teste' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        date: '2026-07-05',
        startTime: '09:00',
        endTime: '12:00',
        notes: 'Teste',
      }),
    );
  });

  it('shows a validation error from the provided validator', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ScheduleDateTimeRangeSheet<
        { date: string; startTime: string; endTime: string },
        { id: string }
      >
        open
        initialDate="2026-07-05"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'item-1' })}
        titleId="range-title"
        descriptionId="range-description"
        title="Título"
        cancelLabel="Cancelar"
        submitLabel="Salvar"
        dateLabel="Data"
        startTimeLabel="Hora inicial"
        endTimeLabel="Hora final"
        notesLabel="Observações"
        timePlaceholder="Escolher"
        validate={({ startTime, endTime }) =>
          startTime === '12:00' && endTime === '09:00' ? 'Horário inválido' : null
        }
        buildRequest={({ date, startTime, endTime }) => ({ date, startTime, endTime })}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '12:00' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora final' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Horário inválido')).toBeInTheDocument();
  });
});
