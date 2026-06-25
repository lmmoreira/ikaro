// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailabilityResponse,
  DaySummary,
  HotsiteAddressSpec,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { CreateBookingError, createBooking } from '@/lib/api/bookings';
import { fetchAvailability, fetchAvailabilitySummary } from '@/lib/api/schedule';
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

vi.mock('@/lib/api/bookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/bookings')>();
  return {
    ...actual,
    createBooking: vi.fn(),
    createAttachmentSignedUrl: vi.fn(),
  };
});

vi.mock('@/lib/api/schedule', () => ({
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

async function advanceToStep3(
  user: ReturnType<typeof userEvent.setup>,
  services: HotsiteServiceResponse[],
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

  await screen.findByLabelText('Nome');
}

async function fillContactFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
  await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
  await user.type(screen.getByLabelText('Telefone'), '11999999999');
  await user.click(screen.getByRole('button', { name: 'Próximo' }));
}

describe('BookingForm', () => {
  afterEach(() => {
    vi.mocked(fetchAvailabilitySummary).mockReset();
    vi.mocked(fetchAvailability).mockReset();
    vi.mocked(createBooking).mockReset();
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
