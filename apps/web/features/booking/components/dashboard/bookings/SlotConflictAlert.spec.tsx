// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SlotConflictAlert } from './SlotConflictAlert';

describe('SlotConflictAlert', () => {
  it('renders slot suggestions and handles retry/back actions', async () => {
    const onChooseSlot = vi.fn();
    const onBack = vi.fn();

    renderWithIntl(
      <SlotConflictAlert
        requestedAt="2026-06-16T10:00:00.000Z"
        totalDurationMins={30}
        suggestions={[{ startsAt: '2026-06-16T09:00:00.000Z', endsAt: '2026-06-16T09:30:00.000Z' }]}
        onChooseSlot={onChooseSlot}
        onBack={onBack}
      />,
    );

    expect(screen.getByText('Horário não disponível')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aprovar neste/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Aprovar neste/ }));
    expect(onChooseSlot).toHaveBeenCalledWith('2026-06-16T09:00:00.000Z');

    await userEvent.click(screen.getByRole('button', { name: /Voltar sem aprovar/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each([
    ['BOOKING_SLOT_CLOSED', 'O negócio está fechado no horário solicitado.'],
    [
      'BOOKING_OUTSIDE_BUSINESS_HOURS',
      'O horário solicitado está fora do horário de funcionamento.',
    ],
  ])('says why for %s instead of "occupied"', (conflictCode, message) => {
    renderWithIntl(
      <SlotConflictAlert
        requestedAt="2026-06-16T10:00:00.000Z"
        conflictCode={conflictCode}
        totalDurationMins={30}
        suggestions={[]}
        onChooseSlot={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/foi ocupado/)).not.toBeInTheDocument();
  });

  it('keeps the occupied body for a slot taken by another booking', () => {
    renderWithIntl(
      <SlotConflictAlert
        requestedAt="2026-06-16T10:00:00.000Z"
        conflictCode="BOOKING_SLOT_UNAVAILABLE"
        totalDurationMins={30}
        suggestions={[]}
        onChooseSlot={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText(/foi ocupado/)).toBeInTheDocument();
  });

  it('shows the loading state while alternate slots are being fetched', () => {
    renderWithIntl(
      <SlotConflictAlert
        requestedAt="2026-06-16T10:00:00.000Z"
        totalDurationMins={30}
        suggestions={[]}
        isLoading
        onChooseSlot={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText('Carregando horários alternativos...')).toBeInTheDocument();
    expect(screen.queryByText('Não encontramos horários alternativos')).not.toBeInTheDocument();
  });
});
