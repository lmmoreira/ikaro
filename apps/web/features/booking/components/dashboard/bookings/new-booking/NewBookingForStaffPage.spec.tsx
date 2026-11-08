// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import type {
  AvailableSlot,
  BookingResponse,
  CustomerProfileResponse,
  ServiceIntakeSchemaVersion,
} from '@ikaro/types';
import {
  fetchPublicIntakeSchema,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { createBookingByStaff } from '@/features/booking/api/staff-bookings';
import {
  clearStaffGuestContact,
  setStaffGuestContact,
} from '@/features/booking/hooks/useStaffGuestContact';
import { ApiError } from '@/shared/lib/api/errors';
import {
  BR_ADDRESS_SPEC,
  choiceRequirement,
  makeHotsiteService,
  renderWithIntl,
} from '@/test-utils';
import { NewBookingForStaffPage } from './NewBookingForStaffPage';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/features/booking/api/public', () => ({
  fetchPublicIntakeSchema: vi.fn(),
  fetchServiceResourceOptions: vi.fn(),
  fetchServiceQuote: vi.fn(),
}));
vi.mock('@/features/booking/api/staff-bookings', () => ({ createBookingByStaff: vi.fn() }));
vi.mock('@/features/booking/components/public/AvailabilityCarousel', () => ({
  AvailabilityCarousel: ({ onSelectDate }: { onSelectDate: (date: string) => void }) => (
    <button type="button" data-testid="mock-date" onClick={() => onSelectDate('2026-06-15')}>
      data
    </button>
  ),
}));
vi.mock('@/features/booking/components/public/SlotPicker', () => ({
  SlotPicker: ({ onSelectSlot }: { onSelectSlot: (slot: AvailableSlot) => void }) => (
    <button type="button" data-testid="mock-slot" onClick={() => onSelectSlot(SLOT)}>
      horário
    </button>
  ),
}));

const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  appointmentEndsAt: '2026-06-15T12:30:00.000Z',
  endsAt: '2026-06-15T12:30:00.000Z',
};
const WASH = makeHotsiteService({ id: 'wash', name: 'Lavagem Simples' });
const CUT = makeHotsiteService({
  id: 'cut',
  name: 'Corte',
  resourceRequirements: [choiceRequirement('STAFF')],
});
const PICKUP = makeHotsiteService({
  id: 'pickup',
  name: 'Leva e traz',
  requiresPickupAddress: true,
});
const CUSTOMER: CustomerProfileResponse = {
  customerId: 'cust-1',
  name: 'Ana Costa',
  email: 'ana@x.com',
  phone: '+5531999991111',
  defaultAddress: {
    street: 'Rua das Flores',
    number: '10',
    complement: '',
    neighborhood: 'Centro',
    city: 'Belo Horizonte',
    state: 'MG',
    zipCode: '30130010',
  },
};
const BOOKING = {
  bookingId: 'b-1',
  status: 'APPROVED',
  scheduledAt: SLOT.startsAt,
  totalPrice: { amount: 150, currency: 'BRL' },
  totalDurationMins: 60,
  beforeServicePhotoUrls: [],
  lines: [],
} as unknown as BookingResponse;
const SCHEMA: ServiceIntakeSchemaVersion = {
  id: 's',
  version: 1,
  questions: [{ fieldKey: 'goal', label: 'Objetivo', type: 'FREE_TEXT', required: true }],
  consentText: 'Aceito',
  consentVersion: 1,
  requiresNamedAttendees: false,
  participantCountRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderPage(overrides: Partial<React.ComponentProps<typeof NewBookingForStaffPage>> = {}) {
  return renderWithIntl(
    <NewBookingForStaffPage
      slug="vitta"
      services={[WASH, CUT, PICKUP]}
      timezone="America/Sao_Paulo"
      maxBookingAdvanceDays={60}
      addressSpec={BR_ADDRESS_SPEC}
      customer={CUSTOMER}
      {...overrides}
    />,
  );
}

async function next() {
  await userEvent.click(screen.getAllByTestId('step-next')[0]!);
}

async function chooseSlot() {
  await userEvent.click(await screen.findByTestId('mock-date'));
  await userEvent.click(await screen.findByTestId('mock-slot'));
  await next();
}

async function chooseService(name: string) {
  await userEvent.click(within(screen.getByText(name).closest('label')!).getByRole('checkbox'));
  await next();
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null } as never);
  vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [] });
  vi.mocked(createBookingByStaff).mockReset();
  clearStaffGuestContact();
});

afterEach(() => clearStaffGuestContact());

describe('NewBookingForStaffPage', () => {
  it('goes back to the chooser when nobody was chosen', async () => {
    renderPage({ customer: null });

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard/bookings/new'));
    expect(screen.queryByTestId('new-booking-page')).not.toBeInTheDocument();
  });

  it('books a registered customer through the steps and shows the created outcome', async () => {
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    renderPage();

    expect(screen.getByTestId('recipient-header')).toHaveTextContent('Ana Costa');
    await chooseService('Lavagem Simples');
    await chooseSlot();
    expect(await screen.findByTestId('step-confirmation')).toBeInTheDocument();
    await next();

    expect(await screen.findByTestId('outcome-banner-title')).toHaveTextContent(
      'Agendamento criado',
    );
    expect(createBookingByStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        serviceIds: ['wash'],
        scheduledAt: SLOT.startsAt,
      }),
    );
    expect(screen.getAllByRole('link', { name: 'Ver agendamento' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-1',
    );
  });

  it('books a new contact with the contact trio and no customer id', async () => {
    setStaffGuestContact({
      contactName: 'Maria',
      contactPhone: '+5531999990000',
      contactEmail: 'maria@x.com',
    });
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    renderPage({ customer: null });

    expect(screen.getByTestId('recipient-header')).toHaveTextContent('novo contato');
    await chooseService('Lavagem Simples');
    await chooseSlot();
    await next();

    await screen.findByTestId('outcome-banner-title');
    const body = vi.mocked(createBookingByStaff).mock.calls[0]![0];
    expect(body).toMatchObject({ contactName: 'Maria', contactEmail: 'maria@x.com' });
    expect(body).not.toHaveProperty('customerId');
  });

  it('adds a picker step for a service with a resource to choose, and sends the pick', async () => {
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({
      requirements: [
        {
          serviceId: 'cut',
          legIndex: null,
          resourceType: 'STAFF',
          selectionMode: 'CUSTOMER_CHOICE',
          requiredQuantity: 1,
          options: [{ resourceId: 'r-1', name: 'Ana Souza' }],
        },
      ],
    });
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    renderPage();

    await chooseService('Corte');
    expect(await screen.findByTestId('step-resource-picker')).toBeInTheDocument();
    expect(screen.getByTestId('step-indicator')).toHaveTextContent('Passo 2 de 4');
    await userEvent.click(screen.getByTestId('picker-option'));
    await next();
    await chooseSlot();
    await next();

    await screen.findByTestId('outcome-banner-title');
    expect(createBookingByStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceSelections: [expect.objectContaining({ resourceType: 'STAFF', resourceId: 'r-1' })],
      }),
    );
  });

  it('shows the intake step when the service has a schema, and lets staff skip it', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: SCHEMA } as never);
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    renderPage();

    await chooseService('Lavagem Simples');
    await chooseSlot();
    expect(await screen.findByTestId('step-intake')).toBeInTheDocument();
    await next();
    await next();

    await screen.findByTestId('outcome-banner-title');
    const body = vi.mocked(createBookingByStaff).mock.calls[0]![0];
    expect(body).not.toHaveProperty('intakeSchemaVersion');
    expect(body).not.toHaveProperty('consentAccepted');
  });

  it('pre-fills the pickup address from the chosen customer’s saved one', async () => {
    renderPage();

    await userEvent.click(
      within(screen.getByText('Leva e traz').closest('label')!).getByRole('checkbox'),
    );

    expect(screen.getByLabelText('Rua')).toHaveValue('Rua das Flores');
    expect(screen.getByLabelText('CEP')).toHaveValue('30130010');
  });

  it('leaves the pickup address blank for a new contact', async () => {
    setStaffGuestContact({
      contactName: 'Maria',
      contactPhone: '+5531999990000',
      contactEmail: 'maria@x.com',
    });
    renderPage({ customer: null });

    await userEvent.click(
      within(screen.getByText('Leva e traz').closest('label')!).getByRole('checkbox'),
    );

    expect(screen.getByLabelText('Rua')).toHaveValue('');
  });

  it('sends a taken slot back to the date step with the choices kept', async () => {
    vi.mocked(createBookingByStaff).mockRejectedValue(
      new ApiError(409, 'taken', { code: BookingErrorCode.SLOT_UNAVAILABLE }),
    );
    renderPage();

    await chooseService('Lavagem Simples');
    await chooseSlot();
    await next();

    expect(await screen.findByTestId('step2-error')).toBeInTheDocument();
    expect(screen.getByTestId('step-availability')).toBeInTheDocument();
    expect(screen.getByTestId('summary-lines')).toHaveTextContent('Lavagem Simples');
  });

  it('shows the no-phone outcome with a way to pick another customer', async () => {
    vi.mocked(createBookingByStaff).mockRejectedValue(
      new ApiError(422, 'no phone', { code: BookingErrorCode.CUSTOMER_PHONE_NOT_SET }),
    );
    renderPage();

    await chooseService('Lavagem Simples');
    await chooseSlot();
    await next();

    expect(await screen.findByTestId('outcome-banner-title')).toHaveTextContent(
      'Ana Costa não tem telefone cadastrado',
    );
    expect(screen.getAllByTestId('outcome-choose-customer')[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/new',
    );
  });

  it('after a date-window refusal, "Escolher outra data" returns to the date step with no slot', async () => {
    vi.mocked(createBookingByStaff).mockRejectedValue(
      new ApiError(422, 'late', { code: BookingErrorCode.TOO_FAR_AHEAD }),
    );
    renderPage();

    await chooseService('Lavagem Simples');
    await chooseSlot();
    await next();
    await userEvent.click((await screen.findAllByTestId('outcome-choose-date'))[0]!);

    expect(await screen.findByTestId('step-availability')).toBeInTheDocument();
    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
  });

  it('offers a retry after an unclassified failure, with the choices kept', async () => {
    vi.mocked(createBookingByStaff).mockRejectedValueOnce(new Error('network'));
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    renderPage();

    await chooseService('Lavagem Simples');
    await chooseSlot();
    await next();
    await userEvent.click((await screen.findAllByTestId('outcome-retry'))[0]!);

    expect(await screen.findByTestId('outcome-banner-title')).toHaveTextContent(
      'Agendamento criado',
    );
    expect(createBookingByStaff).toHaveBeenCalledTimes(2);
  });

  it('returns to the chooser from the first step', async () => {
    renderPage();

    await userEvent.click(screen.getAllByTestId('step-back')[0]!);

    expect(nav.push).toHaveBeenCalledWith('/dashboard/bookings/new');
    await act(async () => undefined);
  });
});
