// @vitest-environment jsdom
import { renderWithIntl, hotsiteServiceBookingDefaults } from '@/test-utils';
import { screen, within } from '@testing-library/react';
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
    ...hotsiteServiceBookingDefaults,
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
    const rows = screen.getAllByTestId('basket-line');
    expect(rows[0]).toHaveTextContent('Lavagem SimplesR$ 60,00');
    expect(rows[1]).toHaveTextContent('CeraR$ 40,00');
    expect(screen.getByText('Total: R$ 100,00 — 50 min')).toBeInTheDocument();
    expect(screen.getByText('Quinta-feira, 18 de junho às 10:00')).toBeInTheDocument();
  });

  it('fixed + variable duration: one row per line, the quoted amount joins the total', () => {
    const fixed = makeService();
    const variable = makeService({
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Alongamento',
      price: { amount: 0, currency: 'BRL', formatted: 'R$ 0,00' },
      durationMinutes: 60,
      bookingPolicy: {
        ...hotsiteServiceBookingDefaults.bookingPolicy,
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 120,
        durationIncrementMinutes: 30,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
      },
    });

    renderWithIntl(
      <BookingSummaryCard
        services={[fixed, variable]}
        selectedServiceIds={[fixed.id, variable.id]}
        selectedDate="2026-06-18"
        selectedSlot={slot}
        duration={{ minutes: 90, quotedAmount: 75 }}
      />,
    );

    const rows = screen.getAllByTestId('basket-line');
    expect(rows[0]).toHaveTextContent('Lavagem SimplesR$ 60,00');
    expect(rows[1]).toHaveTextContent('AlongamentoR$ 75,00');
    expect(within(rows[1]!).getByTestId('line-chosen-duration')).toHaveTextContent('1h 30min');
    expect(screen.getByText('Total: R$ 135,00 — 2h')).toBeInTheDocument();
  });

  it('bundle + fixed: one row per line and no automatic resource named', () => {
    const bundle = makeService({
      id: '00000000-0000-0000-0000-000000000004',
      name: 'Massagem com sala',
      price: { amount: 180, currency: 'BRL', formatted: 'R$ 180,00' },
      durationMinutes: 60,
      resourceRequirements: [
        { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', requiredQuantity: 1 },
        { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
      ],
    });
    const fixed = makeService();

    renderWithIntl(
      <BookingSummaryCard
        services={[bundle, fixed]}
        selectedServiceIds={[bundle.id, fixed.id]}
        selectedDate="2026-06-18"
        selectedSlot={slot}
        picks={[{ serviceId: bundle.id, legIndex: null, resourceType: 'STAFF', resourceId: 's1' }]}
        requirements={[
          {
            serviceId: bundle.id,
            legIndex: null,
            resourceType: 'STAFF',
            selectionMode: 'CUSTOMER_CHOICE',
            requiredQuantity: 1,
            options: [{ resourceId: 's1', name: 'Renata Souza' }],
          },
        ]}
      />,
    );

    const rows = screen.getAllByTestId('basket-line');
    expect(rows[0]).toHaveTextContent('Massagem com salaR$ 180,00');
    expect(within(rows[0]!).getByTestId('line-own-pick')).toHaveTextContent(
      'com Renata Souza (sua escolha)',
    );
    expect(rows[1]).toHaveTextContent('Lavagem SimplesR$ 60,00');
    expect(screen.queryByText(/atribuíd/)).not.toBeInTheDocument();
    expect(screen.getByText('Total: R$ 240,00 — 1h 30min')).toBeInTheDocument();
  });
});
