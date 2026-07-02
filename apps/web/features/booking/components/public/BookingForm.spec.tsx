// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailabilityResponse,
  Address,
  DaySummary,
  HotsiteAddressSpec,
  HotsiteServiceResponse,
  CustomerProfileResponse,
} from '@ikaro/types';
import {
  CreateBookingError,
  createAuthenticatedBooking,
  createBooking,
} from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import { BookingForm } from './BookingForm';

const BR_ADDRESS_SPEC: HotsiteAddressSpec = {
  postalLabel: 'CEP',
  postalPlaceholder: '00000-000',
  stateLabel: 'UF',
  requireNeighborhood: true,
  neighborhoodLabel: 'Bairro',
  streetLabel: 'Rua',
  numberLabel: 'Número',
  complementLabel: 'Complemento',
  cityLabel: 'Cidade',
  lookupService: 'viacep',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return {
    ...actual,
    createBooking: vi.fn(),
    createAuthenticatedBooking: vi.fn(),
    createAttachmentSignedUrl: vi.fn(),
  };
});

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

function makeService(overrides?: Partial<HotsiteServiceResponse>): HotsiteServiceResponse {
  return {
    id: 'svc-1',
    name: 'Lavagem Completa',
    description: 'Lavagem externa e interna',
    price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const day: DaySummary = { date: '2026-06-15', available: true, slotCount: 1 };
const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
const availability: AvailabilityResponse = { date: '2026-06-15', available: true, slots: [slot] };
const pickupAddress: Address = {
  street: 'Rua das Acácias',
  number: '45',
  complement: '',
  neighborhood: 'Jardim América',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30130-020',
};

async function advanceToStep3(
  user: ReturnType<typeof userEvent.setup>,
  services: HotsiteServiceResponse[],
  expectContactFields = true,
) {
  vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
  vi.mocked(fetchAvailability).mockResolvedValue(availability);

  renderWithIntl(
    <BookingForm
      slug="lavacar-beloauto"
      services={services}
      carouselDays={14}
      phonePrefix="+55"
      addressSpec={BR_ADDRESS_SPEC}
    />,
  );

  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Próximo' }));

  const dayOptions = await screen.findAllByTestId('day-option');
  const dayBtn = dayOptions.find((el) => el.getAttribute('data-date') === day.date);
  expect(dayBtn).toBeTruthy();
  await user.click(dayBtn!);
  await user.click(await screen.findByText('09:00–10:00'));
  await user.click(screen.getByRole('button', { name: 'Próximo' }));

  if (expectContactFields) {
    await screen.findByLabelText('Nome');
  } else {
    await screen.findByText('Revisar pedido');
  }
}

async function fillContactFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
  await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
  await user.type(screen.getByLabelText('Telefone'), '11999999999');
  await user.click(screen.getByRole('button', { name: 'Próximo' }));
}

describe('BookingForm', () => {
  beforeEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.mocked(fetchAvailabilitySummary).mockReset();
    vi.mocked(fetchAvailability).mockReset();
    vi.mocked(createBooking).mockReset();
    vi.mocked(createAuthenticatedBooking).mockReset();
    vi.mocked(getHotsiteCustomerProfile).mockReset();
  });

  it('renders Step 1 with the service list', () => {
    renderWithIntl(
      <BookingForm
        slug="lavacar-beloauto"
        services={[makeService()]}
        carouselDays={14}
        phonePrefix="+55"
        addressSpec={BR_ADDRESS_SPEC}
      />,
    );

    expect(screen.getByText('Escolha os serviços')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
  });

  it('moves to Step 2 after selecting a service', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);

    renderWithIntl(
      <BookingForm
        slug="lavacar-beloauto"
        services={[makeService()]}
        carouselDays={14}
        phonePrefix="+55"
        addressSpec={BR_ADDRESS_SPEC}
      />,
    );

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(screen.getByText('Escolha data e horário')).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument();
  });

  it('moves to Step 3 after selecting a date and slot', async () => {
    const user = userEvent.setup();

    await advanceToStep3(user, [makeService()]);

    expect(screen.getByText('Seus dados')).toBeInTheDocument();
    expect(screen.getByText('Passo 3 de 4')).toBeInTheDocument();
  });

  it('shows the order review card with the selected service and date/time on Step 3', async () => {
    const user = userEvent.setup();

    await advanceToStep3(user, [makeService()]);

    expect(screen.getByText('Revisar pedido')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByText('Segunda-feira, 15 de junho às 09:00')).toBeInTheDocument();
  });

  it('moves to Step 4 with a booking summary after filling personal info', async () => {
    const user = userEvent.setup();

    await advanceToStep3(user, [makeService()]);
    await fillContactFields(user);

    expect(screen.getByText('Confirme seu agendamento')).toBeInTheDocument();
    expect(screen.getByText('Passo 4 de 4')).toBeInTheDocument();
    expect(screen.getByText('Segunda-feira, 15 de junho às 09:00')).toBeInTheDocument();
  });

  it('shows the pickup address section in Step 1 when a selected service requires it', async () => {
    const user = userEvent.setup();
    const service = makeService({ requiresPickupAddress: true });

    renderWithIntl(
      <BookingForm
        slug="lavacar-beloauto"
        services={[service]}
        carouselDays={14}
        phonePrefix="+55"
        addressSpec={BR_ADDRESS_SPEC}
      />,
    );
    await user.click(screen.getByRole('checkbox'));

    expect(screen.getByText('Endereço de coleta')).toBeInTheDocument();
  });

  it('hides the contact fields on Step 3 for an authenticated customer', async () => {
    const user = userEvent.setup();
    const service = makeService();
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: '+5511999999999',
      defaultAddress: pickupAddress,
    } satisfies CustomerProfileResponse);

    await advanceToStep3(user, [service], false);

    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Telefone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toggle-contact-address')).not.toBeInTheDocument();
  });

  it('prefills the pickup address from the authenticated customer profile', async () => {
    const user = userEvent.setup();
    const service = makeService({ requiresPickupAddress: true });
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: '+5511999999999',
      defaultAddress: pickupAddress,
    });

    renderWithIntl(
      <BookingForm
        slug="lavacar-beloauto"
        services={[service]}
        carouselDays={14}
        phonePrefix="+55"
        addressSpec={BR_ADDRESS_SPEC}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(await screen.findByDisplayValue(pickupAddress.street)).toBeInTheDocument();
    expect(screen.getByDisplayValue(pickupAddress.number)).toBeInTheDocument();
    expect(screen.getByDisplayValue(pickupAddress.neighborhood ?? '')).toBeInTheDocument();
    expect(screen.getByDisplayValue(pickupAddress.city)).toBeInTheDocument();
    expect(screen.getByDisplayValue(pickupAddress.state)).toBeInTheDocument();
    expect(screen.getByDisplayValue(pickupAddress.zipCode)).toBeInTheDocument();
  });

  it('submits authenticated bookings without contact fields through the authenticated endpoint', async () => {
    const user = userEvent.setup();
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: '+5511999999999',
      defaultAddress: pickupAddress,
    } satisfies CustomerProfileResponse);
    vi.mocked(createAuthenticatedBooking).mockResolvedValue({
      bookingId: 'booking-1',
      status: 'PENDING',
    });

    await advanceToStep3(user, [makeService()], false);

    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(createAuthenticatedBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledAt: slot.startsAt,
        serviceIds: ['svc-1'],
      }),
    );
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('submits the booking and shows the success message', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue({
      bookingId: 'booking-1',
      status: 'PENDING',
      scheduledAt: slot.startsAt,
      totalPrice: { amount: 150, currency: 'BRL' },
      totalDurationMins: 60,
      pickupAddress: null,
      beforeServicePhotoUrls: [],
      lines: [],
    });

    await advanceToStep3(user, [makeService()]);
    await fillContactFields(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
    expect(createBooking).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.objectContaining({
        contactName: 'Maria Silva',
        contactEmail: 'maria@example.com',
        contactPhone: '+5511999999999',
        scheduledAt: slot.startsAt,
        serviceIds: ['svc-1'],
      }),
    );
  });

  it('returns to Step 2 with an error message when the slot is no longer available (409)', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(new CreateBookingError(409, 'Conflict'));

    await advanceToStep3(user, [makeService()]);
    await fillContactFields(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('step2-error')).toHaveTextContent(
      'Horário indisponível, escolha outro',
    );
    expect(screen.getByText('Escolha data e horário')).toBeInTheDocument();
  });

  it('shows an address-specific error message when the backend rejects an address (400)', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new CreateBookingError(400, 'Invalid ZIP Code: 12245-500'),
    );

    await advanceToStep3(user, [makeService()]);
    await fillContactFields(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('confirmation-error')).toHaveTextContent(
      'Verifique o endereço informado e tente novamente.',
    );
  });

  it('shows a generic error message for other submission failures', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(new Error('network error'));

    await advanceToStep3(user, [makeService()]);
    await fillContactFields(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('confirmation-error')).toHaveTextContent(
      'Não foi possível enviar o agendamento. Tente novamente.',
    );
  });
});
