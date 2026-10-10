// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleReview } from './NewRecurringScheduleReview';

const SERVICE = makeHotsiteService({
  name: 'Sala Aurora',
  durationMinutes: 120,
  price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
});

// Tuesdays between Aug 18 and Nov 10, 2026: 13 of them.
const DRAFT: RecurringScheduleDraft = {
  serviceId: SERVICE.id,
  resourceId: 'room-a',
  daysOfWeek: ['tuesday'],
  startTime: '10:00',
  startsOn: '2026-08-18',
  endsOn: '2026-11-10',
};

function renderReview(
  props: Partial<React.ComponentProps<typeof NewRecurringScheduleReview>> = {},
) {
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  renderWithIntl(
    <NewRecurringScheduleReview
      service={SERVICE}
      draft={DRAFT}
      resourceName="Sala Aurora"
      submitting={false}
      onConfirm={onConfirm}
      onBack={onBack}
      {...props}
    />,
  );
  return { onConfirm, onBack };
}

describe('NewRecurringScheduleReview', () => {
  it('reads the pattern back: service, resource, weekday, time, period with its count, price', () => {
    renderReview();

    expect(screen.getByTestId('review-service')).toHaveTextContent('Sala Aurora');
    expect(screen.getByTestId('review-resource')).toHaveTextContent('Sala Aurora');
    expect(screen.getByTestId('review-pattern')).toHaveTextContent('Toda terça');
    expect(screen.getByTestId('review-time')).toHaveTextContent('10:00–12:00 (2h)');
    expect(screen.getByTestId('review-period')).toHaveTextContent(
      '18/08/2026 → 10/11/2026 · 13 reservas',
    );
    expect(screen.getByTestId('review-price')).toHaveTextContent('R$ 100,00 por reserva');
  });

  it('says how many reservations are checked one by one', () => {
    renderReview();
    expect(screen.getAllByText(/Verificamos as 13 reservas do período/).length).toBeGreaterThan(0);
  });

  it('omits the resource row for an auto-assigned service', () => {
    renderReview({ resourceName: null });
    expect(screen.queryByTestId('review-resource')).not.toBeInTheDocument();
  });

  it('confirms and goes back through its two buttons', () => {
    const { onConfirm, onBack } = renderReview();

    fireEvent.click(screen.getAllByTestId('new-schedule-confirm')[0]!);
    fireEvent.click(screen.getAllByTestId('new-schedule-back')[0]!);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('locks both buttons while the request is on its way', () => {
    renderReview({ submitting: true });

    expect(screen.getAllByTestId('new-schedule-confirm')[0]).toBeDisabled();
    expect(screen.getAllByTestId('new-schedule-confirm')[0]).toHaveTextContent('Enviando…');
    expect(screen.getAllByTestId('new-schedule-back')[0]).toBeDisabled();
  });
});
