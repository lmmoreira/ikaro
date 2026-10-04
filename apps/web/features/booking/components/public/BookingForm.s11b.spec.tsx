// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailabilityResponse,
  BookingResponse,
  DaySummary,
  HotsiteAddressSpec,
  HotsiteServiceLeg,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { choiceRequirement, makeHotsiteService, renderWithIntl } from '@/test-utils';
import {
  createBooking,
  fetchPublicIntakeSchema,
  fetchServiceQuote,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { ApiError } from '@/shared/lib/api/errors';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import { BookingForm } from './BookingForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return {
    ...actual,
    createBooking: vi.fn(),
    createAuthenticatedBooking: vi.fn(),
    createAttachmentSignedUrl: vi.fn(),
    fetchPublicIntakeSchema: vi.fn(),
    fetchServiceResourceOptions: vi.fn(),
    fetchServiceQuote: vi.fn(),
  };
});

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

const ADDRESS_SPEC: HotsiteAddressSpec = {
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

// 12:00Z is 09:00 in the default test tenant timezone (America/Sao_Paulo).
const day: DaySummary = { date: '2026-06-15', available: true, slotCount: 1 };
const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
const availability: AvailabilityResponse = { date: '2026-06-15', available: true, slots: [slot] };

const FIXED = 'svc-fixed';
const VARIABLE = 'svc-variable';
const JOURNEY = 'svc-journey';
const BUNDLE = 'svc-bundle';

const fixedService = makeHotsiteService({
  id: FIXED,
  name: 'Avaliação Corporal',
  price: { amount: 80, currency: 'BRL', formatted: 'R$ 80,00' },
  durationMinutes: 30,
});

const variableService = makeHotsiteService({
  id: VARIABLE,
  name: 'Alongamento',
  price: { amount: 0, currency: 'BRL', formatted: 'R$ 0,00' },
  durationMinutes: 60,
  bookingPolicy: {
    ...makeHotsiteService().bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
  },
});

const legs: HotsiteServiceLeg[] = [
  {
    legIndex: 0,
    name: 'Sauna',
    durationMinutes: 20,
    transitionGapAfterMinutes: 10,
    resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }],
  },
  {
    legIndex: 1,
    name: 'Massagem',
    durationMinutes: 50,
    transitionGapAfterMinutes: 5,
    resourceRequirements: [
      choiceRequirement('STAFF'),
      { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', requiredQuantity: 1 },
    ],
  },
  {
    legIndex: 2,
    name: 'Relaxamento',
    durationMinutes: 20,
    transitionGapAfterMinutes: 0,
    resourceRequirements: [choiceRequirement('EQUIPMENT')],
  },
];

// A journey's persisted duration is its span: 20+10 + 50+5 + 20.
const journeyService = makeHotsiteService({
  id: JOURNEY,
  name: 'Jornada Spa',
  price: { amount: 260, currency: 'BRL', formatted: 'R$ 260,00' },
  durationMinutes: 105,
  resourceRequirements: [],
  legs,
});

const bundleService = makeHotsiteService({
  id: BUNDLE,
  name: 'Massagem com sala',
  price: { amount: 180, currency: 'BRL', formatted: 'R$ 180,00' },
  durationMinutes: 60,
  resourceRequirements: [
    choiceRequirement('STAFF'),
    { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
  ],
});

const OPTIONS: Record<string, HotsiteServiceResourceOptionsRequirement[]> = {
  [JOURNEY]: [
    {
      serviceId: JOURNEY,
      legIndex: 1,
      resourceType: 'STAFF',
      selectionMode: 'CUSTOMER_CHOICE',
      requiredQuantity: 1,
      options: [{ resourceId: 'staff-renata', name: 'Renata Souza' }],
    },
    {
      serviceId: JOURNEY,
      legIndex: 2,
      resourceType: 'EQUIPMENT',
      selectionMode: 'CUSTOMER_CHOICE',
      requiredQuantity: 1,
      options: [{ resourceId: 'eq-1', name: 'Poltrona de relaxamento 1' }],
    },
  ],
  [BUNDLE]: [
    {
      serviceId: BUNDLE,
      legIndex: null,
      resourceType: 'STAFF',
      selectionMode: 'CUSTOMER_CHOICE',
      requiredQuantity: 1,
      options: [{ resourceId: 'staff-renata', name: 'Renata Souza' }],
    },
  ],
};

function booking(lines: Partial<BookingResponse['lines'][number]>[], total = 0): BookingResponse {
  return {
    bookingId: 'booking-1',
    status: 'PENDING',
    scheduledAt: slot.startsAt,
    totalPrice: { amount: total, currency: 'BRL' },
    totalDurationMins: lines.reduce((sum, line) => sum + (line.durationMinsAtBooking ?? 0), 0),
    pickupAddress: null,
    beforeServicePhotoUrls: [],
    lines: lines.map((line, index) => ({
      lineId: `line-${index}`,
      serviceId: FIXED,
      priceAtBooking: { amount: 0, currency: 'BRL' },
      durationMinsAtBooking: 30,
      pointsValueAtBooking: 0,
      requiresPickupAddressAtBooking: false,
      ...line,
    })),
  };
}

function renderForm(services: HotsiteServiceResponse[]) {
  return renderWithIntl(
    <BookingForm
      slug="vitta"
      services={services}
      carouselDays={14}
      datePickerType="carousel"
      maxBookingAdvanceDays={90}
      phonePrefix="+55"
      addressSpec={ADDRESS_SPEC}
    />,
  );
}

const next = () => screen.getByTestId('step-next');
type User = ReturnType<typeof userEvent.setup>;

async function pickServices(user: User, ...names: string[]) {
  for (const name of names)
    await user.click(screen.getByRole('checkbox', { name: new RegExp(name) }));
  await user.click(next());
}

async function pickSlot(user: User) {
  const dayOptions = await screen.findAllByTestId('day-option');
  await user.click(dayOptions.find((el) => el.getAttribute('data-date') === day.date)!);
  await user.click(await screen.findByText('09:00–10:00'));
  await user.click(next());
}

async function fillGuest(user: User) {
  await user.type(await screen.findByLabelText('Nome'), 'Maria Silva');
  await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
  await user.type(screen.getByLabelText('Telefone'), '11999999999');
  await user.click(next());
}

async function passJourneyPickers(user: User) {
  await user.click(await screen.findByText('Renata Souza'));
  await user.click(next());
  await user.click(await screen.findByText('Poltrona de relaxamento 1'));
  await user.click(next());
}

beforeEach(() => {
  vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
  vi.mocked(fetchServiceResourceOptions).mockImplementation(async (_slug, serviceId) => ({
    requirements: OPTIONS[serviceId] ?? [],
  }));
  vi.mocked(fetchServiceQuote).mockImplementation(async (_slug, _id, minutes) => ({
    durationMinutes: minutes,
    price: { amount: (minutes / 60) * 50, currency: 'BRL' },
  }));
  vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
  vi.mocked(fetchAvailability).mockResolvedValue(availability);
});

afterEach(() => {
  [
    createBooking,
    fetchPublicIntakeSchema,
    fetchServiceResourceOptions,
    fetchServiceQuote,
    fetchAvailabilitySummary,
    fetchAvailability,
    getHotsiteCustomerProfile,
  ].forEach((fn) => vi.mocked(fn).mockReset());
});

describe('BookingForm — variable duration (M23-S11b)', () => {
  it('adds the duration step before availability: "de 5", the minimum preselected and quoted', async () => {
    const user = userEvent.setup();
    renderForm([variableService]);
    await pickServices(user, 'Alongamento');

    expect(await screen.findByTestId('step-variable-duration')).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 5')).toBeInTheDocument();
    expect(screen.getByTestId('duration-select')).toHaveValue('60');
    expect(await screen.findByTestId('duration-total')).toHaveTextContent('Total: R$ 50,00');
    expect(fetchServiceQuote).toHaveBeenCalledWith('vitta', VARIABLE, 60);
  });

  it('searches availability with the chosen duration and books it with that duration', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue(
      booking(
        [
          {
            serviceId: VARIABLE,
            priceAtBooking: { amount: 75, currency: 'BRL' },
            durationMinsAtBooking: 90,
          },
        ],
        75,
      ),
    );
    renderForm([variableService]);
    await pickServices(user, 'Alongamento');
    await user.selectOptions(await screen.findByTestId('duration-select'), '90');
    await waitFor(() =>
      expect(screen.getByTestId('duration-total')).toHaveTextContent('Total: R$ 75,00'),
    );
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);

    expect(screen.getByText('Total: R$ 75,00 — 1h 30min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(fetchAvailability).toHaveBeenCalledWith(
      'vitta',
      '2026-06-15',
      [VARIABLE],
      expect.objectContaining({ durationMinutes: 90 }),
    );
    expect(createBooking).toHaveBeenCalledWith(
      'vitta',
      expect.objectContaining({ durationMinutes: 90, serviceIds: [VARIABLE] }),
    );
    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
  });

  it('blocks continuing while the quote fails, and continues after a retry', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchServiceQuote).mockRejectedValueOnce(new Error('boom'));
    renderForm([variableService]);
    await pickServices(user, 'Alongamento');

    expect(await screen.findByText('Não foi possível calcular o total.')).toBeInTheDocument();
    expect(next()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(next()).toBeEnabled());
  });

  it('keeps the duration when going back from availability, and clears the slot when it changes', async () => {
    const user = userEvent.setup();
    renderForm([variableService]);
    await pickServices(user, 'Alongamento');
    await user.selectOptions(await screen.findByTestId('duration-select'), '120');
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    const dayOptions = await screen.findAllByTestId('day-option');
    await user.click(dayOptions.find((el) => el.getAttribute('data-date') === day.date)!);
    await user.click(await screen.findByText('09:00–10:00'));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByTestId('duration-select')).toHaveValue('120');

    await user.selectOptions(screen.getByTestId('duration-select'), '60');
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());

    expect(await screen.findByText('Escolha data e horário')).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('returns to the duration step with the catalogue message and nothing chosen on BOOKING_DURATION_OUT_OF_RANGE', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_DURATION_OUT_OF_RANGE', field: 'durationMinutes' }),
    );
    renderForm([variableService]);
    await pickServices(user, 'Alongamento');
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('duration-error')).toBeInTheDocument();
    expect(screen.getByTestId('step-variable-duration')).toBeInTheDocument();
    expect(screen.getByTestId('duration-select')).toHaveValue('');
    expect(next()).toBeDisabled();

    await user.selectOptions(screen.getByTestId('duration-select'), '90');

    await waitFor(() => expect(next()).toBeEnabled());
    expect(screen.queryByTestId('duration-error')).not.toBeInTheDocument();
  });

  it('totals a fixed service plus the quoted amount of a variable one', async () => {
    const user = userEvent.setup();
    renderForm([fixedService, variableService]);
    await pickServices(user, 'Avaliação Corporal', 'Alongamento');
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await pickSlot(user);

    expect(await screen.findByText('R$ 130,00 — 1h 30min')).toBeInTheDocument();
  });
});

describe('BookingForm — journey review and success box (M23-S11b)', () => {
  it('replaces the final summary with the journey review: leg times, own picks, automatic types, totals', async () => {
    const user = userEvent.setup();
    renderForm([journeyService]);
    await pickServices(user, 'Jornada Spa');
    await passJourneyPickers(user);
    await pickSlot(user);
    await fillGuest(user);

    expect(screen.getByRole('heading', { name: 'Confirme sua jornada' })).toBeInTheDocument();
    expect(screen.getByText('Passo 6 de 6')).toBeInTheDocument();
    const legsList = screen.getAllByTestId('leg-item');
    expect(within(legsList[0]!).getByText('09:00 – 09:20')).toBeInTheDocument();
    expect(within(legsList[0]!).getByText('Sala atribuída automaticamente')).toBeInTheDocument();
    expect(within(legsList[1]!).getByText('09:30 – 10:20')).toBeInTheDocument();
    expect(
      within(legsList[1]!).getByText(
        'com Renata Souza (sua escolha) · Sala atribuída automaticamente',
      ),
    ).toBeInTheDocument();
    expect(within(legsList[2]!).getByText('10:25 – 10:45')).toBeInTheDocument();
    expect(screen.getByTestId('leg-reserved')).toHaveTextContent(
      '1h 30min de serviço + 15 min de transição = 1h 45min reservados (09:00–10:45)',
    );
    expect(screen.getByText('Total: R$ 260,00 — 1h 45min')).toBeInTheDocument();
  });

  it('shows every leg with every assigned resource, automatic rooms included, after booking', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue(
      booking(
        [
          {
            serviceId: JOURNEY,
            priceAtBooking: { amount: 260, currency: 'BRL' },
            durationMinsAtBooking: 105,
            itinerary: [
              {
                legIndex: 0,
                resourceName: 'Sala Aurora',
                startsAt: '2026-06-15T12:00:00.000Z',
                endsAt: '2026-06-15T12:20:00.000Z',
              },
              {
                legIndex: 1,
                resourceName: 'Renata Souza',
                startsAt: '2026-06-15T12:30:00.000Z',
                endsAt: '2026-06-15T13:20:00.000Z',
              },
              {
                legIndex: 1,
                resourceName: 'Sala Horizonte',
                startsAt: '2026-06-15T12:30:00.000Z',
                endsAt: '2026-06-15T13:20:00.000Z',
              },
              {
                legIndex: 2,
                resourceName: 'Poltrona de relaxamento 1',
                startsAt: '2026-06-15T13:25:00.000Z',
                endsAt: '2026-06-15T13:45:00.000Z',
              },
            ],
          },
        ],
        260,
      ),
    );
    renderForm([journeyService]);
    await pickServices(user, 'Jornada Spa');
    await passJourneyPickers(user);
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const timeline = await screen.findByTestId('booking-itinerary');
    const items = within(timeline).getAllByTestId('itinerary-leg');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('09:00 – 09:20 · Sauna');
    expect(items[0]).toHaveTextContent('Sala Aurora');
    expect(items[1]).toHaveTextContent('09:30 – 10:20 · Massagem');
    expect(items[1]).toHaveTextContent('Renata Souza · Sala Horizonte');
    expect(items[2]).toHaveTextContent('Poltrona de relaxamento 1');
    expect(screen.getByTestId('submitted-total')).toHaveTextContent('Total: R$ 260,00 · 1h 45min');
    expect(screen.queryByTestId('submitted-resource')).not.toBeInTheDocument();
  });

  it('starts the journey where the preceding fixed line ends (selection order), one total', async () => {
    const user = userEvent.setup();
    renderForm([fixedService, journeyService]);
    await pickServices(user, 'Avaliação Corporal', 'Jornada Spa');
    await passJourneyPickers(user);
    await pickSlot(user);
    await fillGuest(user);

    const rows = screen.getAllByTestId('basket-line');
    expect(within(rows[0]!).getByText('Avaliação Corporal')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('09:00 – 09:30 · 30 min')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('09:30 – 11:15 · 1h 45min')).toBeInTheDocument();
    const legsList = screen.getAllByTestId('leg-item');
    expect(within(legsList[0]!).getByText('09:30 – 09:50')).toBeInTheDocument();
    expect(within(legsList[2]!).getByText('10:55 – 11:15')).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 340,00 — 2h 15min')).toBeInTheDocument();
  });

  it('puts a variable-duration line after the journey with its chosen duration and quote', async () => {
    const user = userEvent.setup();
    renderForm([journeyService, variableService]);
    await pickServices(user, 'Jornada Spa', 'Alongamento');
    await passJourneyPickers(user);
    await waitFor(() => expect(next()).toBeEnabled());
    expect(screen.getByText('Passo 4 de 7')).toBeInTheDocument();
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);

    const rows = screen.getAllByTestId('basket-line');
    expect(within(rows[0]!).getByText('09:00 – 10:45 · 1h 45min')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Alongamento')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('10:45 – 11:45 · 1h')).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 310,00 — 2h 45min')).toBeInTheDocument();
  });

  it('names only the staff pick of a bundle in the review, never its automatic room', async () => {
    const user = userEvent.setup();
    renderForm([bundleService, fixedService]);
    await pickServices(user, 'Massagem com sala', 'Avaliação Corporal');
    await user.click(await screen.findByText('Renata Souza'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);

    expect(screen.getByRole('heading', { name: 'Confirme seu agendamento' })).toBeInTheDocument();
    expect(screen.getByTestId('line-own-pick')).toHaveTextContent('com Renata Souza (sua escolha)');
    expect(screen.queryByText(/Sala atribuída/)).not.toBeInTheDocument();
    expect(screen.getByText('Total: R$ 260,00 — 1h 30min')).toBeInTheDocument();
    expect(screen.queryByText(/ – /)).not.toBeInTheDocument();
  });

  it('shows the same lines and total on the summary card and the success box for a mixed basket', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue(
      booking(
        [
          {
            serviceId: FIXED,
            priceAtBooking: { amount: 80, currency: 'BRL' },
            durationMinsAtBooking: 30,
            assignedResourceName: 'Camila Prado',
          },
          {
            serviceId: JOURNEY,
            priceAtBooking: { amount: 260, currency: 'BRL' },
            durationMinsAtBooking: 105,
            itinerary: [
              {
                legIndex: 0,
                resourceName: 'Sala Aurora',
                startsAt: '2026-06-15T12:30:00.000Z',
                endsAt: '2026-06-15T12:50:00.000Z',
              },
              {
                legIndex: 1,
                resourceName: 'Renata Souza',
                startsAt: '2026-06-15T13:00:00.000Z',
                endsAt: '2026-06-15T13:50:00.000Z',
              },
              {
                legIndex: 2,
                resourceName: 'Poltrona de relaxamento 1',
                startsAt: '2026-06-15T13:55:00.000Z',
                endsAt: '2026-06-15T14:15:00.000Z',
              },
            ],
          },
        ],
        340,
      ),
    );
    const autoStaffService = {
      ...fixedService,
      resourceRequirements: [
        { type: 'STAFF' as const, selectionMode: 'AUTO_ANY' as const, requiredQuantity: 1 },
      ],
    };
    renderForm([autoStaffService, journeyService]);
    await pickServices(user, 'Avaliação Corporal', 'Jornada Spa');
    await passJourneyPickers(user);
    await pickSlot(user);

    const summary = screen.getByTestId('basket-lines');
    expect(within(summary).getByText('09:00 – 09:30 · 30 min')).toBeInTheDocument();
    expect(within(summary).getByText('09:30 – 11:15 · 1h 45min')).toBeInTheDocument();
    expect(
      within(summary).getByText('3 etapas: Sauna · Massagem · Relaxamento'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 340,00 — 2h 15min')).toBeInTheDocument();

    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const lines = await screen.findAllByTestId('submitted-line');
    expect(lines[0]).toHaveTextContent('09:00 – 09:30');
    expect(lines[0]).toHaveTextContent('Camila Prado');
    expect(lines[1]).toHaveTextContent('09:30 – 11:15');
    expect(screen.getByTestId('submitted-datetime')).toHaveTextContent('09:00–11:15');
    expect(screen.getByTestId('submitted-total')).toHaveTextContent('Total: R$ 340,00 · 2h 15min');
  });
});
