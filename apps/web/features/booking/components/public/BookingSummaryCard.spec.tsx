// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
import { BookingSummaryCard } from './BookingSummaryCard';

function makeService(overrides?: Partial<HotsiteServiceResponse>): HotsiteServiceResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Lavagem Simples',
    description: '',
    price: { amount: 60, currency: 'BRL', formatted: 'R$ 60,00' },
    durationMinutes: 30,
    loyaltyPointsValue: 5,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const slot: AvailableSlot = {
  startsAt: '2026-06-18T13:00:00.000Z',
  endsAt: '2026-06-18T14:00:00.000Z',
};

describe('BookingSummaryCard', () => {
  it('renders the selected service, total and the long-form date/time', () => {
    const service = makeService();

    renderWithIntl(
      <BookingSummaryCard
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-18"
        selectedSlot={slot}
      />,
    );

    expect(screen.getByText('Revisar pedido')).toBeInTheDocument();
    expect(screen.getByText('Serviço')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('R$ 60,00 — 30 min')).toBeInTheDocument();
    expect(screen.getByText('Data e horário')).toBeInTheDocument();
    expect(screen.getByText('Quinta-feira, 18 de junho às 10:00')).toBeInTheDocument();
  });

  it('shows the plural label and combined total when multiple services are selected', () => {
    const serviceA = makeService();
    const serviceB = makeService({
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Cera',
      price: { amount: 40, currency: 'BRL', formatted: 'R$ 40,00' },
      durationMinutes: 20,
    });

    renderWithIntl(
      <BookingSummaryCard
        services={[serviceA, serviceB]}
        selectedServiceIds={[serviceA.id, serviceB.id]}
        selectedDate="2026-06-18"
        selectedSlot={slot}
      />,
    );

    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('Cera')).toBeInTheDocument();
    expect(screen.getByText('R$ 100,00 — 50 min')).toBeInTheDocument();
  });
});
