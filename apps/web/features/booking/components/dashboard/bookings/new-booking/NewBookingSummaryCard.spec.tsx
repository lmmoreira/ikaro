// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  AvailableSlot,
  HotsiteServiceResourceOptionsRequirement,
  ResourceSelectionItem,
} from '@ikaro/types';
import { choiceRequirement, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { NewBookingSummaryCard } from './NewBookingSummaryCard';

// 12:00Z is 09:00 in the default test tenant timezone (America/Sao_Paulo).
const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  appointmentEndsAt: '2026-06-15T12:30:00.000Z',
  endsAt: '2026-06-15T12:30:00.000Z',
};

const WASH = makeHotsiteService({
  id: 'wash',
  name: 'Lavagem Simples',
  price: { amount: 60, currency: 'BRL', formatted: 'R$ 60,00' },
  durationMinutes: 30,
});
const CUT = makeHotsiteService({
  id: 'cut',
  name: 'Corte',
  price: { amount: 80, currency: 'BRL', formatted: 'R$ 80,00' },
  durationMinutes: 45,
  resourceRequirements: [choiceRequirement('STAFF')],
});
const STAFF_OPTIONS: HotsiteServiceResourceOptionsRequirement = {
  serviceId: 'cut',
  legIndex: null,
  resourceType: 'STAFF',
  selectionMode: 'CUSTOMER_CHOICE',
  requiredQuantity: 1,
  options: [{ resourceId: 'r-1', name: 'Ana Souza' }],
};

function renderSummary(
  overrides: Partial<React.ComponentProps<typeof NewBookingSummaryCard>> = {},
) {
  return renderWithIntl(
    <NewBookingSummaryCard
      recipientName="Ana Costa"
      services={[WASH, CUT]}
      selectedServiceIds={[]}
      picks={[]}
      requirements={[]}
      duration={null}
      slot={null}
      {...overrides}
    />,
  );
}

describe('NewBookingSummaryCard', () => {
  it('names who the booking is for and asks for services before any is chosen', () => {
    renderSummary();

    const card = screen.getByTestId('new-booking-summary');
    expect(within(card).getByText('Ana Costa')).toBeInTheDocument();
    expect(within(card).getByText('Escolha os serviços')).toBeInTheDocument();
    expect(within(card).getByText('Escolha a data e o horário')).toBeInTheDocument();
    expect(screen.queryByTestId('summary-total')).not.toBeInTheDocument();
  });

  it('lists the chosen services with their price and the total', () => {
    renderSummary({ selectedServiceIds: ['wash', 'cut'] });

    const lines = screen.getByTestId('summary-lines');
    expect(within(lines).getByText('Lavagem Simples')).toBeInTheDocument();
    expect(within(lines).getByText('R$ 80,00')).toBeInTheDocument();
    expect(screen.getByTestId('summary-total')).toHaveTextContent('R$ 140,00');
  });

  it('shows the resource staff picked, never an automatic one', () => {
    const picks: ResourceSelectionItem[] = [
      { serviceId: 'cut', resourceType: 'STAFF', resourceId: 'r-1' },
    ];
    renderSummary({ selectedServiceIds: ['cut'], picks, requirements: [STAFF_OPTIONS] });

    expect(screen.getByText('com Ana Souza')).toBeInTheDocument();
    expect(screen.queryByText(/sua escolha/)).not.toBeInTheDocument();
  });

  it('shows the chosen date and time', () => {
    renderSummary({ selectedServiceIds: ['wash'], slot: SLOT });

    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    expect(screen.queryByText('Escolha a data e o horário')).not.toBeInTheDocument();
  });

  it('lays a legged service out as its stages', () => {
    const journey = makeHotsiteService({
      id: 'spa',
      name: 'Dia de spa',
      legs: [
        {
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 30,
          transitionGapAfterMinutes: 0,
          resourceRequirements: [],
        },
        {
          legIndex: 1,
          name: 'Massagem',
          durationMinutes: 50,
          transitionGapAfterMinutes: 0,
          resourceRequirements: [],
        },
      ],
    });
    renderSummary({ services: [journey], selectedServiceIds: ['spa'], slot: SLOT });

    expect(screen.getByText(/Sauna/)).toBeInTheDocument();
    expect(screen.getByText(/Massagem/)).toBeInTheDocument();
  });
});
