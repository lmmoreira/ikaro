// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleActionRail } from './RescheduleActionRail';

const CURRENT_START = new Date('2026-06-16T10:00:00.000Z');
const CURRENT_END = new Date('2026-06-16T10:30:00.000Z');

describe('RescheduleActionRail', () => {
  it('shows the error card when error is set', () => {
    renderWithIntl(
      <RescheduleActionRail
        error="Algo deu errado"
        pendingSubmit={false}
        backHref="/dashboard/bookings/b-1"
        currentStart={CURRENT_START}
        currentEnd={CURRENT_END}
        selectedSlot={null}
      />,
    );

    expect(screen.getAllByText('Algo deu errado').length).toBeGreaterThan(0);
  });

  it('omits the error card when error is null', () => {
    renderWithIntl(
      <RescheduleActionRail
        error={null}
        pendingSubmit={false}
        backHref="/dashboard/bookings/b-1"
        currentStart={CURRENT_START}
        currentEnd={CURRENT_END}
        selectedSlot={null}
      />,
    );

    expect(screen.queryByText('Algo deu errado')).not.toBeInTheDocument();
  });

  it('shows the pending placeholder in the "to" summary until a slot is selected', () => {
    renderWithIntl(
      <RescheduleActionRail
        error={null}
        pendingSubmit={false}
        backHref="/dashboard/bookings/b-1"
        currentStart={CURRENT_START}
        currentEnd={CURRENT_END}
        selectedSlot={null}
      />,
    );

    expect(screen.getAllByText('Ainda não selecionado').length).toBeGreaterThan(0);
  });

  it('shows the formatted range once a slot is selected', () => {
    renderWithIntl(
      <RescheduleActionRail
        error={null}
        pendingSubmit={false}
        backHref="/dashboard/bookings/b-1"
        currentStart={CURRENT_START}
        currentEnd={CURRENT_END}
        selectedSlot={{
          startsAt: '2026-06-17T14:00:00.000Z',
          endsAt: '2026-06-17T14:30:00.000Z',
        }}
      />,
    );

    expect(screen.queryAllByText('Ainda não selecionado')).toHaveLength(0);
  });

  it('disables the submit button while pendingSubmit is true', () => {
    renderWithIntl(
      <RescheduleActionRail
        error={null}
        pendingSubmit
        backHref="/dashboard/bookings/b-1"
        currentStart={CURRENT_START}
        currentEnd={CURRENT_END}
        selectedSlot={null}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Reagendar' })[0]).toBeDisabled();
  });
});
