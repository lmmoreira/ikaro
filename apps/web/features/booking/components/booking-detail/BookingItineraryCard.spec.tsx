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

  it('numbers the legs, not the resource rows: six rows of three legs are steps 1, 2 and 3', () => {
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({ legIndex: 0, legName: 'Massagem', resourceName: 'Sala Fogo' }),
          leg({ legIndex: 0, legName: 'Massagem', resourceName: 'Leonardo Moreira' }),
          leg({ legIndex: 1, legName: 'Pedras Aromatizantes', resourceName: 'Sala Fogo' }),
          leg({ legIndex: 2, legName: 'Ventosas', resourceName: 'Ventosas' }),
          leg({ legIndex: 2, legName: 'Ventosas', resourceName: 'Sala Agua' }),
          leg({ legIndex: 2, legName: 'Ventosas', resourceName: 'Leonardo Moreira' }),
        ]}
      />,
    );

    const items = screen.getAllByTestId('booking-itinerary-leg');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/^1Massagem/);
    expect(items[1]).toHaveTextContent(/^2Pedras Aromatizantes/);
    expect(items[2]).toHaveTextContent(/^3Ventosas/);
    for (const badge of ['4', '5', '6']) {
      expect(screen.queryByText(badge, { selector: 'span' })).not.toBeInTheDocument();
    }
  });

  it('lists every resource of a leg under it', () => {
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({ legIndex: 0, legName: 'Massagem', resourceName: 'Sala Fogo' }),
          leg({ legIndex: 0, legName: 'Massagem', resourceName: 'Leonardo Moreira' }),
          leg({ legIndex: 1, legName: 'Pedras Aromatizantes', resourceName: 'Sala Fogo' }),
        ]}
      />,
    );

    const items = screen.getAllByTestId('booking-itinerary-leg');
    expect(items[0]).toHaveTextContent('Sala Fogo, Leonardo Moreira');
    expect(items[1]).toHaveTextContent('Sala Fogo');
    expect(items[1]).not.toHaveTextContent('Leonardo Moreira');
  });

  it('shows the time range once per leg, however many resources it has', () => {
    const times = { startsAt: '2026-06-16T12:00:00.000Z', endsAt: '2026-06-16T12:30:00.000Z' };
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({ legName: 'Massagem', resourceName: 'Sala Fogo', ...times }),
          leg({ legName: 'Massagem', resourceName: 'Leonardo Moreira', ...times }),
        ]}
      />,
    );

    const item = screen.getByTestId('booking-itinerary-leg');
    expect(item.textContent?.match(/\d{2}:\d{2}\s+—\s+\d{2}:\d{2}/g)).toHaveLength(1);
  });

  it('numbers the steps across the lines of a basket and names the service on each', () => {
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({ lineId: 'a', serviceName: 'Circuito', legIndex: 0, legName: 'Sauna' }),
          leg({ lineId: 'b', serviceName: 'Passeio', legIndex: 0, legName: 'Ida' }),
        ]}
      />,
    );

    const items = screen.getAllByTestId('booking-itinerary-leg');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1Circuito · Sauna');
    expect(items[1]).toHaveTextContent('2Passeio · Ida');
  });

  it('does not name the service when the booking has only one', () => {
    renderWithIntl(
      <BookingItineraryCard
        itinerary={[
          leg({ serviceName: 'Circuito', legIndex: 0, legName: 'Sauna' }),
          leg({ serviceName: 'Circuito', legIndex: 1, legName: 'Massagem' }),
        ]}
      />,
    );

    expect(screen.getAllByTestId('booking-itinerary-leg')[0]).not.toHaveTextContent('Circuito');
  });

  it('falls back to the step number for a leg the service no longer has', () => {
    renderWithIntl(<BookingItineraryCard itinerary={[leg({ legIndex: 0, legName: null })]} />);

    expect(screen.getByTestId('booking-itinerary-leg')).toHaveTextContent('Etapa 1');
  });

  it('falls back to "Step N" in English', () => {
    renderWithIntl(<BookingItineraryCard itinerary={[leg({ legName: null })]} />, {
      locale: 'en',
    });

    expect(screen.getByTestId('booking-itinerary-leg')).toHaveTextContent('Step 1');
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
