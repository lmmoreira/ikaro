// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BookingItineraryLeg } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingItineraryCard } from './BookingItineraryCard';

const leg = (overrides: Partial<BookingItineraryLeg>): BookingItineraryLeg => ({
  lineId: 'line-1',
  serviceName: 'Passeio de van',
  legIndex: 0,
  legName: 'Ida',
  resourceType: 'EQUIPMENT',
  resourceName: 'Van 2',
  startsAt: null,
  endsAt: null,
  ...overrides,
});

describe('BookingItineraryCard', () => {
  it('renders nothing for a booking with no legs', () => {
    renderWithIntl(<BookingItineraryCard itinerary={[]} />);

    expect(screen.queryByTestId('booking-itinerary-card')).not.toBeInTheDocument();
  });

  it('lists the legs in the given order, numbering them and naming each resource', () => {
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({ legIndex: 0, legName: 'Ida', resourceName: 'Van 2' }),
          leg({ legIndex: 1, legName: 'Passeio', resourceName: 'Paula Nogueira' }),
          leg({ legIndex: 2, legName: 'Volta', resourceName: 'Van 2' }),
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('Van 2');
    expect(items[1]).toHaveTextContent('Paula Nogueira');
    expect(items[2]).toHaveTextContent('Van 2');
  });

  it('shows the time range of a leg that still has its reservation', () => {
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({
            startsAt: '2026-06-16T12:00:00.000Z',
            endsAt: '2026-06-16T12:40:00.000Z',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('listitem')).toHaveTextContent(/Ida · \d{2}:\d{2} — \d{2}:\d{2}/);
  });

  it('shows the leg name and resource without a time when the reservation is gone', () => {
    renderWithIntl(<BookingItineraryCard itinerary={[leg({})]} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('Van 2');
    expect(screen.getByRole('listitem')).toHaveTextContent('Ida');
    expect(screen.getByRole('listitem')).not.toHaveTextContent('—');
  });
});
