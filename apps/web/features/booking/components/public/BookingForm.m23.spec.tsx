// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
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
  ServiceIntakeSchemaVersion,
} from '@ikaro/types';
import {
  choiceRequirement,
  intakeFieldError,
  makeHotsiteService,
  renderWithIntl,
} from '@/test-utils';
import {
  createAuthenticatedBooking,
  createBooking,
  fetchPublicIntakeSchema,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { ApiError, AuthError } from '@/shared/lib/api/errors';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import { BookingForm } from './BookingForm';

// The fixtures use fixed 2026-06-15 slots; the picker hides a slot that has already started, so the
// clock is pinned to the morning of that day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return {
    ...actual,
    createBooking: vi.fn(),
    createAuthenticatedBooking: vi.fn(),
    createAttachmentSignedUrl: vi.fn(),
    fetchPublicIntakeSchema: vi.fn(),
    fetchServiceResourceOptions: vi.fn(),
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

const day: DaySummary = { date: '2026-06-15', available: true, slotCount: 1 };
const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
const availability: AvailabilityResponse = { date: '2026-06-15', available: true, slots: [slot] };

const SVC = 'svc-staff';
const staffService = makeHotsiteService({
  id: SVC,
  name: 'Corte + Escova',
  resourceRequirements: [choiceRequirement('STAFF')],
});

function staffOptions(...names: string[]): HotsiteServiceResourceOptionsRequirement {
  return {
    serviceId: SVC,
    legIndex: null,
    resourceType: 'STAFF',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: names.map((name, i) => ({ resourceId: `staff-${i}`, name })),
  };
}

const intakeSchema: ServiceIntakeSchemaVersion = {
  id: 'schema-1',
  version: 4,
  questions: [{ fieldKey: 'goal', label: 'Qual o objetivo?', type: 'FREE_TEXT', required: true }],
  consentText: 'Li e aceito os termos.',
  consentVersion: 1,
  requiresNamedAttendees: false,
  participantCountRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function bookingFor(
  serviceId: string,
  line: Partial<BookingResponse['lines'][number]> = {},
): BookingResponse {
  return {
    bookingId: 'booking-1',
    status: 'PENDING',
    scheduledAt: slot.startsAt,
    totalPrice: { amount: 150, currency: 'BRL' },
    totalDurationMins: 60,
    pickupAddress: null,
    beforeServicePhotoUrls: [],
    lines: [
      {
        lineId: 'line-1',
        serviceId,
        priceAtBooking: { amount: 150, currency: 'BRL' },
        durationMinsAtBooking: 60,
        pointsValueAtBooking: 0,
        requiresPickupAddressAtBooking: false,
        ...line,
      },
    ],
  };
}

function renderForm(services: HotsiteServiceResponse[]) {
  return renderWithIntl(
    <BookingForm
      slug="lavacar-beloauto"
      services={services}
      carouselDays={14}
      datePickerType="carousel"
      maxBookingAdvanceDays={90}
      timezone="UTC"
      phonePrefix="+55"
      addressSpec={ADDRESS_SPEC}
    />,
  );
}

const next = () => screen.getByTestId('step-next');

async function pickSlot(user: ReturnType<typeof userEvent.setup>) {
  const dayOptions = await screen.findAllByTestId('day-option');
  await user.click(dayOptions.find((el) => el.getAttribute('data-date') === day.date)!);
  await user.click(await screen.findByText('09:00–10:00'));
  await user.click(next());
}

async function fillGuest(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Nome'), 'Maria Silva');
  await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
  await user.type(screen.getByLabelText('Telefone'), '11999999999');
  await user.click(next());
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
  vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [] });
  vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
  vi.mocked(fetchAvailability).mockResolvedValue(availability);
});

afterEach(() => {
  [
    createBooking,
    createAuthenticatedBooking,
    fetchPublicIntakeSchema,
    fetchServiceResourceOptions,
    fetchAvailabilitySummary,
    fetchAvailability,
    getHotsiteCustomerProfile,
  ].forEach((fn) => vi.mocked(fn).mockReset());
});

describe('BookingForm — Step 1 (M23)', () => {
  it('lists only APPOINTMENT services', () => {
    renderForm([
      makeHotsiteService({ id: 'a', name: 'Corte' }),
      makeHotsiteService({ id: 'b', name: 'Aula de Pilates', bookingModel: 'SESSION' }),
    ]);

    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(screen.queryByText('Aula de Pilates')).not.toBeInTheDocument();
  });

  it('stays on Step 1 with the unavailable message when a choice requirement has no option', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [staffOptions()] });
    renderForm([staffService]);

    await user.click(screen.getByRole('checkbox'));
    await user.click(next());

    expect(await screen.findByTestId('service-unavailable')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('enables Próximo again after the unavailable service is unticked', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [staffOptions()] });
    renderForm([staffService, makeHotsiteService({ id: 'ok', name: 'Corte' })]);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(next());
    await screen.findByTestId('service-unavailable');
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getAllByRole('checkbox')[1]!);

    expect(screen.queryByTestId('service-unavailable')).not.toBeInTheDocument();
    expect(next()).toBeEnabled();
  });

  it('fails closed on a form-data fetch error and continues after a retry', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPublicIntakeSchema).mockRejectedValueOnce(new Error('boom'));
    renderForm([makeHotsiteService()]);

    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    expect(await screen.findByTestId('step1-form-error')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Escolha data e horário')).toBeInTheDocument();
  });

  it('shows the inline rejection when the basket mixes two variable/intake services', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_INVALID_MULTIPLE_VARIABLE_SERVICES' }),
    );
    renderForm([makeHotsiteService()]);

    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const alert = await screen.findByTestId('step1-submit-error');
    expect(alert).toHaveTextContent('Só é possível incluir um serviço de duração variável');
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
  });
});

describe('BookingForm — chosen resource (M23)', () => {
  beforeEach(() => {
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({
      requirements: [staffOptions('Camila Duarte', 'Bruno Alves')],
    });
  });

  async function toPicker(user: ReturnType<typeof userEvent.setup>) {
    renderForm([staffService]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    await screen.findByTestId('resource-picker');
  }

  it('adds a picker step: 5 steps, nothing pre-selected, Próximo disabled until a pick', async () => {
    const user = userEvent.setup();
    await toPicker(user);

    expect(screen.getByText('Passo 2 de 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Escolha o profissional' })).toBeInTheDocument();
    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked());
    expect(next()).toBeDisabled();

    await user.click(screen.getByText('Bruno Alves'));
    expect(next()).toBeEnabled();
  });

  it('pins the pick on the availability queries and sends it, in the booking, with the name in the details box', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue(bookingFor(SVC));
    await toPicker(user);
    await user.click(screen.getByText('Bruno Alves'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const pick = { serviceId: SVC, legIndex: null, resourceType: 'STAFF', resourceId: 'staff-1' };
    expect(fetchAvailability).toHaveBeenCalledWith('lavacar-beloauto', '2026-06-15', [SVC], {
      resourceSelections: [pick],
      durationMinutes: undefined,
    });
    expect(createBooking).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.objectContaining({ resourceSelections: [pick] }),
    );
    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
    const resource = await screen.findByTestId('submitted-resource');
    expect(within(resource).getByText('Bruno Alves')).toBeInTheDocument();
  });

  it('keeps the pick when going back from availability', async () => {
    const user = userEvent.setup();
    await toPicker(user);
    await user.click(screen.getByText('Bruno Alves'));
    await user.click(next());
    await screen.findByText('Escolha data e horário');

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByRole('radio', { name: 'Bruno Alves' })).toBeChecked();
  });

  it('re-prompts the picker with the invalid pick cleared when the pick is no longer offered (05e)', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_SERVICE_RESOURCE_TYPE_UNAVAILABLE' }),
    );
    await toPicker(user);
    await user.click(screen.getByText('Bruno Alves'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({
      requirements: [staffOptions('Camila Duarte')],
    });
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const alert = await screen.findByTestId('picker-reselect-error');
    expect(alert).toHaveTextContent('Não há recursos ativos do tipo selecionado.');
    expect(screen.getByRole('radio', { name: 'Camila Duarte' })).not.toBeChecked();
    expect(next()).toBeDisabled();
  });

  it('returns to Step 1 with the service shown as unavailable when the re-fetched options are empty', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_SERVICE_RESOURCE_TYPE_UNAVAILABLE' }),
    );
    await toPicker(user);
    await user.click(screen.getByText('Bruno Alves'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [staffOptions()] });
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('service-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('step-service-selection')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-picker')).not.toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('offers a retry when re-fetching the options after a pick error fails', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_RESOURCE_SELECTION_REQUIRED' }),
    );
    await toPicker(user);
    await user.click(screen.getByText('Bruno Alves'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    vi.mocked(fetchServiceResourceOptions).mockRejectedValueOnce(new Error('boom'));
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('picker-load-error')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findAllByRole('radio')).toHaveLength(2);
  });
});

describe('BookingForm — journey picks and conflicts (M23)', () => {
  const JOURNEY = 'svc-journey';
  const legs: HotsiteServiceLeg[] = [0, 1, 2].map((legIndex) => ({
    legIndex,
    name: ['Sauna', 'Massagem', 'Relaxamento'][legIndex]!,
    durationMinutes: 20,
    transitionGapAfterMinutes: 0,
    resourceRequirements:
      legIndex === 0
        ? [{ type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }]
        : [choiceRequirement(legIndex === 1 ? 'STAFF' : 'EQUIPMENT')],
  }));
  const journey = makeHotsiteService({ id: JOURNEY, name: 'Jornada Spa', legs });

  function legRequirement(legIndex: number, resourceType: 'STAFF' | 'EQUIPMENT') {
    return {
      serviceId: JOURNEY,
      legIndex,
      resourceType,
      selectionMode: 'CUSTOMER_CHOICE' as const,
      requiredQuantity: 1,
      options: [{ resourceId: `leg${legIndex}-a`, name: `Opção da etapa ${legIndex}` }],
    };
  }

  beforeEach(() => {
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({
      requirements: [legRequirement(1, 'STAFF'), legRequirement(2, 'EQUIPMENT')],
    });
  });

  it('shows one picker step per leg with a choice, headed by the leg name, "de 6"', async () => {
    const user = userEvent.setup();
    renderForm([journey]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());

    expect(await screen.findByRole('heading', { name: 'Massagem' })).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 6')).toBeInTheDocument();
    expect(screen.getByText('Jornada Spa · Etapa 2 de 3 da jornada')).toBeInTheDocument();

    await user.click(screen.getByText('Opção da etapa 1'));
    await user.click(next());

    expect(await screen.findByRole('heading', { name: 'Relaxamento' })).toBeInTheDocument();
    expect(screen.getByText('Passo 3 de 6')).toBeInTheDocument();
  });

  it('sends one selection per leg and keeps an earlier leg pick when going back', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue(bookingFor(JOURNEY));
    renderForm([journey]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    await user.click(await screen.findByText('Opção da etapa 1'));
    await user.click(next());
    await user.click(await screen.findByText('Opção da etapa 2'));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('radio', { name: 'Opção da etapa 1' })).toBeChecked();
    await user.click(next());
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    await screen.findByTestId('booking-success');
    expect(createBooking).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.objectContaining({
        resourceSelections: [
          { serviceId: JOURNEY, legIndex: 1, resourceType: 'STAFF', resourceId: 'leg1-a' },
          { serviceId: JOURNEY, legIndex: 2, resourceType: 'EQUIPMENT', resourceId: 'leg2-a' },
        ],
      }),
    );
  });

  it.each([['BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE'], ['BOOKING_LEG_UNAVAILABLE']])(
    'returns to availability with the catalogue message and the slot cleared on %s',
    async (code) => {
      const user = userEvent.setup();
      vi.mocked(createBooking).mockRejectedValue(new ApiError(409, 'x', { code }));
      renderForm([journey]);
      await user.click(screen.getByRole('checkbox'));
      await user.click(next());
      await user.click(await screen.findByText('Opção da etapa 1'));
      await user.click(next());
      await user.click(await screen.findByText('Opção da etapa 2'));
      await user.click(next());
      await pickSlot(user);
      await fillGuest(user);
      await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

      expect(await screen.findByTestId('step2-error')).toHaveTextContent(
        /não está mais disponível/,
      );
      expect(screen.getByText('Escolha data e horário')).toBeInTheDocument();
      expect(next()).toBeDisabled();
    },
  );
});

describe('BookingForm — intake (M23)', () => {
  const svc = makeHotsiteService({ id: 'svc-intake', name: 'Massagem' });

  beforeEach(() => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: intakeSchema });
  });

  async function toIntake(user: ReturnType<typeof userEvent.setup>) {
    renderForm([svc]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    expect(await screen.findByText('Passo 2 de 5')).toBeInTheDocument();
    await pickSlot(user);
    await fillGuest(user);
    await screen.findByTestId('step-intake');
  }

  it('adds the intake step after personal info: indicator "de 5"', async () => {
    const user = userEvent.setup();
    await toIntake(user);

    expect(screen.getByText('Passo 4 de 5')).toBeInTheDocument();
    expect(screen.getByText(/versão atual do formulário \(v4\)/)).toBeInTheDocument();
  });

  it('blocks Próximo on missing answers, then submits the displayed version with the answers', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockResolvedValue(bookingFor('svc-intake'));
    await toIntake(user);

    await user.click(next());
    expect(intakeFieldError('goal')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Qual o objetivo/), 'Treino');
    await user.click(screen.getByTestId('intake-consent'));
    await user.click(next());
    await user.click(await screen.findByRole('button', { name: 'Confirmar agendamento' }));

    await screen.findByTestId('booking-success');
    expect(createBooking).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.objectContaining({
        intakeSchemaVersion: 4,
        intakeAnswers: { goal: 'Treino' },
        consentAccepted: true,
      }),
    );
  });

  it('shows the summary banner only, keeping the answers, on a server-side rejection', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_INTAKE_ANSWER_MISSING' }),
    );
    await toIntake(user);
    await user.type(screen.getByLabelText(/Qual o objetivo/), 'Treino');
    await user.click(screen.getByTestId('intake-consent'));
    await user.click(next());
    await user.click(await screen.findByRole('button', { name: 'Confirmar agendamento' }));

    const summary = await screen.findByTestId('intake-error-summary');
    expect(summary).toHaveTextContent('É necessário responder às perguntas obrigatórias');
    expect(intakeFieldError('goal')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Qual o objetivo/)).toHaveValue('Treino');
  });
});

describe('BookingForm — other submit routes (M23)', () => {
  it('sends an authenticated customer whose session expired to the hotsite login', async () => {
    const user = userEvent.setup();
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: '+5511999999999',
      defaultAddress: null,
    });
    vi.mocked(createAuthenticatedBooking).mockRejectedValue(new AuthError('expired'));
    renderForm([makeHotsiteService()]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    await pickSlot(user);
    await user.click(next());
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/lavacar-beloauto/login?returnTo=${encodeURIComponent('/lavacar-beloauto/booking')}`,
      ),
    );
  });

  it('lands on Confirmation with the generic message for a code with no dedicated step', async () => {
    const user = userEvent.setup();
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_DURATION_OUT_OF_RANGE' }),
    );
    renderForm([makeHotsiteService()]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('confirmation-error')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    );
  });

  it('shows the assigned staff name of an AUTO_ANY booking in the details box', async () => {
    const user = userEvent.setup();
    const auto = makeHotsiteService({
      id: 'svc-auto',
      resourceRequirements: [{ type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }],
    });
    vi.mocked(createBooking).mockResolvedValue(
      bookingFor('svc-auto', { assignedResourceName: 'Camila Duarte' }),
    );
    renderForm([auto]);
    await user.click(screen.getByRole('checkbox'));
    await user.click(next());
    expect(await screen.findByText('Passo 2 de 4')).toBeInTheDocument();
    await pickSlot(user);
    await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByTestId('submitted-resource')).toHaveTextContent('Camila Duarte');
  });
});
