// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  AvailableSlot,
  BookingResponse,
  HotsiteServiceResourceOptionsRequirement,
  ResourceSelectionItem,
} from '@ikaro/types';
import { choiceRequirement, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { BookingSubmittedDetails } from './BookingSubmittedDetails';

const slot: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  endsAt: '2026-06-15T13:15:00.000Z',
};

function makeBooking(
  lineOverrides: Partial<BookingResponse['lines'][number]> = {},
): BookingResponse {
  return {
    bookingId: 'b-1',
    status: 'PENDING',
    scheduledAt: slot.startsAt,
    totalPrice: { amount: 80, currency: 'BRL' },
    totalDurationMins: 75,
    pickupAddress: null,
    beforeServicePhotoUrls: [],
    lines: [
      {
        lineId: 'l-1',
        serviceId: 'svc-1',
        priceAtBooking: { amount: 80, currency: 'BRL' },
        durationMinsAtBooking: 75,
        pointsValueAtBooking: 0,
        requiresPickupAddressAtBooking: false,
        ...lineOverrides,
      },
    ],
  };
}

const staffRequirement: HotsiteServiceResourceOptionsRequirement = {
  serviceId: 'svc-1',
  legIndex: null,
  resourceType: 'STAFF',
  selectionMode: 'CUSTOMER_CHOICE',
  requiredQuantity: 1,
  options: [{ resourceId: 'r-1', name: 'Renata Souza' }],
};
const staffPick: ResourceSelectionItem = {
  serviceId: 'svc-1',
  legIndex: null,
  resourceType: 'STAFF',
  resourceId: 'r-1',
};

function renderDetails(props: {
  booking?: BookingResponse;
  service?: ReturnType<typeof makeHotsiteService>;
  picks?: ResourceSelectionItem[];
  requirements?: HotsiteServiceResourceOptionsRequirement[];
}) {
  renderWithIntl(
    <BookingSubmittedDetails
      services={[props.service ?? makeHotsiteService({ id: 'svc-1', name: 'Corte + Escova' })]}
      booking={props.booking ?? makeBooking()}
      selectedDate="2026-06-15"
      selectedSlot={slot}
      picks={props.picks ?? []}
      requirements={props.requirements ?? []}
    />,
  );
}

describe('BookingSubmittedDetails', () => {
  it('shows the service lines with the persisted price and duration, the date/time and the total', () => {
    renderDetails({});

    expect(
      screen.getByRole('heading', { name: 'Detalhes da sua solicitação' }),
    ).toBeInTheDocument();
    const line = screen.getByTestId('submitted-line');
    expect(line).toHaveTextContent('Corte + Escova');
    expect(line).toHaveTextContent('R$ 80,00 · 1h 15min');
    expect(screen.getByTestId('submitted-datetime')).toHaveTextContent(
      'Segunda-feira, 15 de junho às 09:00',
    );
    expect(screen.getByTestId('submitted-total')).toHaveTextContent('Total: R$ 80,00 · 1h 15min');
  });

  it('shows no resource row for a service without chosen or assigned resources (pool)', () => {
    renderDetails({});

    expect(screen.queryByTestId('submitted-resource')).not.toBeInTheDocument();
  });

  it('shows the chosen resource name from the picker state', () => {
    renderDetails({
      service: makeHotsiteService({
        id: 'svc-1',
        name: 'Corte + Escova',
        resourceRequirements: [choiceRequirement('STAFF')],
      }),
      picks: [staffPick],
      requirements: [staffRequirement],
    });

    expect(
      within(screen.getByTestId('submitted-resource')).getByText('Renata Souza'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('submitted-resource')).toHaveTextContent('Profissional:');
  });

  it('shows the staff name the system assigned for an AUTO_ANY requirement', () => {
    renderDetails({
      booking: makeBooking({ assignedResourceName: 'Camila Duarte' }),
      service: makeHotsiteService({
        id: 'svc-1',
        name: 'Corte + Escova',
        resourceRequirements: [{ type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }],
      }),
    });

    expect(screen.getByTestId('submitted-resource')).toHaveTextContent(
      'Profissional: Camila Duarte',
    );
  });

  it('ignores a pick that has no matching option name', () => {
    renderDetails({ picks: [staffPick], requirements: [] });

    expect(screen.queryByTestId('submitted-resource')).not.toBeInTheDocument();
  });
});
