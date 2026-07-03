// @vitest-environment jsdom
import type { FormEvent, ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ScheduleRemovalDialog } from './ScheduleRemovalDialog';

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

describe('ScheduleRemovalDialog', () => {
  it('renders the shared removal details and submits the selected target', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithIntl(
      <ScheduleRemovalDialog
        open
        target={{
          id: 'removal-1',
          date: '2026-07-05',
          startTime: '09:00',
          endTime: '14:00',
          notes: 'Horário especial',
        }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        titleId="removal-title"
        descriptionId="removal-description"
        title="Remover abertura"
        description="Este horário deixará de ser exibido."
        submitLabel="Remover abertura"
        rangeLabel="09:00–14:00"
        notesLabel="Observações"
      />,
    );

    expect(screen.getByText(/julho/i)).toBeInTheDocument();
    expect(screen.getByText('09:00–14:00')).toBeInTheDocument();
    expect(screen.getByText('Horário especial')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover abertura' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('removal-1'));
  });
});
