// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BookingLineResourceEntry } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingResourcesCard } from './BookingResourcesCard';

const entry = (overrides: Partial<BookingLineResourceEntry>): BookingLineResourceEntry => ({
  lineId: 'line-1',
  serviceName: 'Reserva de sala',
  resourceType: 'ROOM',
  resourceName: 'Sala Aurora',
  origin: null,
  quantity: null,
  ...overrides,
});

describe('BookingResourcesCard', () => {
  it('renders nothing when the booking has no resources', () => {
    renderWithIntl(<BookingResourcesCard resources={[]} />);

    expect(screen.queryByTestId('booking-resources-card')).not.toBeInTheDocument();
  });

  it('shows each resource under its type with who picked it', () => {
    renderWithIntl(
      <BookingResourcesCard
        resources={[
          entry({ origin: 'CUSTOMER_CHOICE' }),
          entry({
            resourceType: 'STAFF',
            resourceName: 'Marcos Lima',
            origin: 'SYSTEM_ASSIGNED',
          }),
        ]}
      />,
    );

    expect(screen.getByText('Sala')).toBeInTheDocument();
    expect(screen.getByText('Sala Aurora')).toBeInTheDocument();
    expect(screen.getByText('escolhido pelo cliente')).toBeInTheDocument();
    expect(screen.getByText('Profissional')).toBeInTheDocument();
    expect(screen.getByText('Marcos Lima')).toBeInTheDocument();
    expect(screen.getByText('atribuído pelo sistema')).toBeInTheDocument();
  });

  it('shows a pool by its quantity, without naming a unit and without an origin tag', () => {
    renderWithIntl(
      <BookingResourcesCard
        resources={[entry({ resourceType: 'EQUIPMENT', resourceName: null, quantity: 2 })]}
      />,
    );

    expect(screen.getByText('Equipamento')).toBeInTheDocument();
    expect(screen.getByText('Do conjunto')).toBeInTheDocument();
    expect(screen.getByText('2 unidades reservadas')).toBeInTheDocument();
    expect(screen.queryByText('escolhido pelo cliente')).not.toBeInTheDocument();
    expect(screen.queryByText('atribuído pelo sistema')).not.toBeInTheDocument();
  });

  it('shows no origin tag when the service no longer declares the requirement', () => {
    renderWithIntl(<BookingResourcesCard resources={[entry({ origin: null })]} />);

    expect(screen.getByText('Sala Aurora')).toBeInTheDocument();
    expect(screen.queryByText('escolhido pelo cliente')).not.toBeInTheDocument();
  });
});
