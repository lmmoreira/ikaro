// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResponse, RecurringBookingScheduleListItem } from '@ikaro/types';
import {
  earliestStartDate,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { addIsoDays } from '@/features/booking/model/booking-window';
import { ApiError } from '@/shared/lib/api/errors';
import {
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
  renderWithIntl,
} from '@/test-utils';
import { NewRecurringSchedulePage } from './NewRecurringSchedulePage';

const createRecurringScheduleAsCustomer = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/recurring-booking-schedules', () => ({
  createRecurringScheduleAsCustomer,
}));
const fetchServiceResourceOptions = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions }));

const TZ = 'America/Sao_Paulo';
const today = earliestStartDate(new Date(), TZ);
const tomorrow = addIsoDays(today, 1);

const ALL_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function eligibleService(
  overrides: Partial<HotsiteServiceResponse> = {},
  policy: Partial<HotsiteServiceResponse['bookingPolicy']> = {},
): HotsiteServiceResponse {
  return makeHotsiteService({
    name: 'Sala Aurora',
    durationMinutes: 120,
    bookingPolicy: {
      ...hotsiteServiceBookingDefaults.bookingPolicy,
      recurrenceEligible: true,
      ...policy,
    },
    ...overrides,
  });
}

// Tomorrow to a week later, every weekday: the first occurrence is always tomorrow at 10:00.
const READY: Partial<RecurringScheduleDraft> = {
  daysOfWeek: ALL_WEEKDAYS,
  startTime: '10:00',
  startsOn: tomorrow,
  endsOn: addIsoDays(tomorrow, 6),
};

function renderPage(
  options: {
    services?: HotsiteServiceResponse[];
    initialDraft?: Partial<RecurringScheduleDraft>;
    renewing?: RecurringBookingScheduleListItem | null;
  } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={queryClient}>
      <NewRecurringSchedulePage
        services={options.services ?? [eligibleService()]}
        tenantSlug="lavacar-bh"
        initialDraft={options.initialDraft}
        renewing={options.renewing}
      />
    </QueryClientProvider>,
  );
}

function press(testId: string): void {
  // The action pane is rendered twice (mobile and desktop); the buttons are identical.
  fireEvent.click(screen.getAllByTestId(testId)[0]!);
}

async function reviewAndConfirm(): Promise<void> {
  press('new-schedule-review');
  press('new-schedule-confirm');
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchServiceResourceOptions.mockResolvedValue({ requirements: [] });
});

describe('NewRecurringSchedulePage — the pattern', () => {
  it('blocks the review and names what is missing until a weekday and an end date are chosen', () => {
    renderPage();

    press('new-schedule-review');

    expect(screen.getByText('Escolha pelo menos um dia da semana.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a data em que a recorrência termina.')).toBeInTheDocument();
    expect(screen.queryByTestId('new-schedule-review-step')).not.toBeInTheDocument();
    expect(createRecurringScheduleAsCustomer).not.toHaveBeenCalled();
  });

  it('shows the maximum term and its last date next to the end date', () => {
    renderPage({ services: [eligibleService({}, { recurringHorizonDays: 30 })] });

    expect(screen.getByTestId('new-schedule-term-hint')).toHaveTextContent('no máximo 30 dias');
  });

  it('blocks a first occurrence that already started, with the booking-window message', () => {
    renderPage({
      initialDraft: { ...READY, startsOn: today, endsOn: today, startTime: '00:00' },
    });

    press('new-schedule-review');

    expect(screen.getByTestId('new-schedule-notice')).toHaveTextContent(
      'O novo horário deve ser no futuro.',
    );
    expect(createRecurringScheduleAsCustomer).not.toHaveBeenCalled();
  });

  it('blocks a pattern none of whose weekdays falls in the term', () => {
    // A one-day term (tomorrow only) and a weekday that is not tomorrow's.
    const tomorrowIndex = (new Date(`${tomorrow}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const otherDay = ALL_WEEKDAYS[(tomorrowIndex + 1) % 7]!;
    renderPage({
      initialDraft: { ...READY, daysOfWeek: [otherDay], endsOn: tomorrow },
    });

    press('new-schedule-review');

    expect(screen.getByTestId('new-schedule-notice')).toHaveTextContent(
      'Nenhum dos dias da semana selecionados cai entre as datas de início e de término.',
    );
  });
});

describe('NewRecurringSchedulePage — the outcomes', () => {
  it('sends the exact body and shows the created state for an auto-confirm service', async () => {
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('new-schedule-created')).toBeInTheDocument();
    expect(createRecurringScheduleAsCustomer).toHaveBeenCalledWith({
      serviceId: '00000000-0000-0000-0000-000000000001',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: [...ALL_WEEKDAYS],
        startTime: '10:00',
        durationMinutes: 120,
      },
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      startsOn: tomorrow,
      endsOn: addIsoDays(tomorrow, 6),
    });
    expect(screen.getAllByTestId('new-schedule-view')[0]).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules/s-1',
    );
  });

  it('shows the "em análise" state with the protected-until time for a pending schedule', async () => {
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-1',
      status: 'PENDING_APPROVAL',
      approvalHoldExpiresAt: '2999-06-20T12:30:00.000Z',
    });
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('recurring-schedule-pending')).toBeInTheDocument();
    expect(screen.getByText(/Estamos analisando seu pedido de recorrência/)).toBeInTheDocument();
  });

  it('lists every conflicting occurrence with its reason and goes back with the pattern kept', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(409, 'conflict', {
        code: 'BOOKING_RECURRING_SCHEDULE_CONFLICT',
        conflicts: [
          { occurrenceStart: '2999-06-20T13:00:00.000Z', reason: 'OCCUPIED' },
          { occurrenceStart: '2999-06-27T13:00:00.000Z', reason: 'CLOSED' },
          { occurrenceStart: '2999-07-04T13:00:00.000Z', reason: 'OUTSIDE_HOURS' },
        ],
      }),
    );
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    const items = await screen.findAllByTestId('conflict-item');
    expect(items.map((item) => item.dataset.reason)).toEqual([
      'OCCUPIED',
      'CLOSED',
      'OUTSIDE_HOURS',
    ]);
    expect(within(items[1]!).getByText('Fechado')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Fora do horário')).toBeInTheDocument();

    press('new-schedule-change-pattern');

    expect(await screen.findByTestId('new-schedule-form')).toBeInTheDocument();
    const pressed = screen
      .getAllByTestId('new-schedule-weekday')
      .filter((pill) => pill.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(7);
  });

  it('falls back to the generic message when the conflict body carries no occurrence list', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(409, 'conflict', { code: 'BOOKING_RECURRING_SCHEDULE_CONFLICT' }),
    );
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('new-schedule-conflict')).toHaveTextContent(
      'Este padrão recorrente não pode ser reservado em uma ou mais das suas datas.',
    );
    expect(screen.queryByTestId('conflict-list')).not.toBeInTheDocument();
  });

  it('shows the limit state when the active-schedule cap is reached', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(409, 'cap', { code: 'BOOKING_RECURRING_SCHEDULE_CAP_REACHED' }),
    );
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('new-schedule-cap')).toBeInTheDocument();
    expect(screen.getByText('Limite de reservas recorrentes atingido')).toBeInTheDocument();
  });

  it('returns to the pattern with the end-date error when the backend refuses the date range', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(422, 'range', { code: 'BOOKING_RECURRING_SCHEDULE_INVALID_DATE_RANGE' }),
    );
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('new-schedule-form')).toBeInTheDocument();
    expect(screen.getByTestId('new-schedule-ends-on-error')).toHaveTextContent(
      'A data de término não pode ser anterior à data de início.',
    );
  });

  it('shows the booking-window refusal as a notice above the pattern, nothing created', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(422, 'soon', { code: 'BOOKING_TOO_SOON' }),
    );
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('new-schedule-notice')).toHaveTextContent(
      'Esse horário exige mais antecedência.',
    );
  });

  it('keeps the typed pattern after a network failure and sends the same body again on retry', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValueOnce(new Error('Network Error'));
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();
    expect(await screen.findByTestId('new-schedule-failure')).toBeInTheDocument();

    createRecurringScheduleAsCustomer.mockResolvedValueOnce({
      id: 's-2',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    press('new-schedule-retry');

    await waitFor(() => expect(screen.getByTestId('new-schedule-created')).toBeInTheDocument());
    expect(createRecurringScheduleAsCustomer).toHaveBeenCalledTimes(2);
    expect(createRecurringScheduleAsCustomer.mock.calls[1]![0]).toEqual(
      createRecurringScheduleAsCustomer.mock.calls[0]![0],
    );
  });

  it('treats an ineligible-service refusal, which the filtered list makes unreachable, as a failure', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(422, 'x', { code: 'BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE' }),
    );
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    expect(await screen.findByTestId('new-schedule-failure')).toBeInTheDocument();
  });
});

describe('NewRecurringSchedulePage — a service with a customer-chosen resource', () => {
  const roomService = eligibleService({ resourceRequirements: [choiceRequirement('ROOM')] });

  it('preselects the first resource and sends FIXED_ASSIGNMENT with exactly that one', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        {
          serviceId: roomService.id,
          legIndex: null,
          resourceType: 'ROOM',
          selectionMode: 'CUSTOMER_CHOICE',
          requiredQuantity: 1,
          options: [
            { resourceId: 'room-a', name: 'Sala Aurora' },
            { resourceId: 'room-b', name: 'Sala Horizonte' },
          ],
        },
      ],
    });
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderPage({ services: [roomService], initialDraft: READY });

    fireEvent.click(await screen.findByRole('radio', { name: 'Sala Horizonte' }));
    await reviewAndConfirm();

    await screen.findByTestId('new-schedule-created');
    expect(createRecurringScheduleAsCustomer.mock.calls[0]![0]).toMatchObject({
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: ['room-b'],
    });
  });

  it('does not show a resource field for an auto-assigned service', () => {
    renderPage({ initialDraft: READY });
    expect(screen.queryByTestId('new-schedule-resource')).not.toBeInTheDocument();
    expect(fetchServiceResourceOptions).not.toHaveBeenCalled();
  });
});

describe('NewRecurringSchedulePage — no eligible service', () => {
  it('says so instead of rendering an empty form', () => {
    renderPage({ services: [] });
    expect(screen.getByTestId('new-schedule-no-services')).toBeInTheDocument();
  });

  it('still tells the customer the renewal could not be found', () => {
    renderPage({ services: [], renewing: null });
    expect(screen.getByTestId('new-schedule-renewal-not-found')).toBeInTheDocument();
    expect(screen.getByTestId('new-schedule-no-services')).toBeInTheDocument();
  });
});

describe('NewRecurringSchedulePage — a renewal', () => {
  const ended: RecurringBookingScheduleListItem = {
    id: 'ended-1',
    customerId: 'c1',
    serviceId: 'service-1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-19',
    endsOn: '2026-11-11',
    status: 'ENDED',
    assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
    resourceIds: [],
    approvalHoldExpiresAt: null,
  };
  // Today at 00:00 is already past: a new schedule is refused client-side, a renewal is not.
  const STARTED: Partial<RecurringScheduleDraft> = {
    ...READY,
    startsOn: today,
    endsOn: today,
    startTime: '00:00',
  };

  it('shows the banner for the schedule being renewed and the renewal heading', () => {
    renderPage({ initialDraft: READY, renewing: ended });

    expect(screen.getByTestId('new-schedule-renewal-banner')).toHaveTextContent(
      'Renovando sua reserva de Sala Aurora',
    );
    expect(screen.getByRole('heading', { name: 'Renovar reserva recorrente' })).toBeInTheDocument();
  });

  it('leaves the booking-window check to the backend, so a renewal reaches the review step', () => {
    renderPage({ initialDraft: STARTED, renewing: ended });

    press('new-schedule-review');

    expect(screen.getAllByTestId('new-schedule-confirm').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('new-schedule-notice')).not.toBeInTheDocument();
  });

  it('still refuses the same pattern client-side when it is not a renewal', () => {
    renderPage({ initialDraft: STARTED });

    press('new-schedule-review');

    expect(screen.queryAllByTestId('new-schedule-confirm')).toHaveLength(0);
    expect(screen.getByTestId('new-schedule-notice')).toBeInTheDocument();
  });

  it('names the renewed schedule in the request', async () => {
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-2',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderPage({ initialDraft: READY, renewing: ended });

    await reviewAndConfirm();

    await screen.findByTestId('new-schedule-created');
    expect(createRecurringScheduleAsCustomer.mock.calls[0]![0]).toMatchObject({
      renewsScheduleId: 'ended-1',
    });
  });

  it('does not send renewsScheduleId for a normal creation', async () => {
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-3',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderPage({ initialDraft: READY });

    await reviewAndConfirm();

    await screen.findByTestId('new-schedule-created');
    expect(createRecurringScheduleAsCustomer.mock.calls[0]![0]).not.toHaveProperty(
      'renewsScheduleId',
    );
  });

  it('shows the not-found notice over the blank form when the link could not be honored', () => {
    renderPage({ renewing: null });

    expect(screen.getByTestId('new-schedule-renewal-not-found')).toHaveTextContent(
      'Não encontramos a reserva que você queria renovar.',
    );
    expect(screen.queryByTestId('new-schedule-renewal-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nova reserva recorrente' })).toBeInTheDocument();
  });

  it('shows neither banner nor notice on a plain creation', () => {
    renderPage();

    expect(screen.queryByTestId('new-schedule-renewal-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-schedule-renewal-not-found')).not.toBeInTheDocument();
  });
});

describe('NewRecurringSchedulePage — a renewal whose fixed resource is no longer offered', () => {
  it('replaces the stale resource with the first one offered, so the request names a real resource', async () => {
    const roomService = eligibleService({ resourceRequirements: [choiceRequirement('ROOM')] });
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        {
          serviceId: roomService.id,
          legIndex: null,
          resourceType: 'ROOM',
          selectionMode: 'CUSTOMER_CHOICE',
          requiredQuantity: 1,
          options: [{ resourceId: 'room-a', name: 'Sala Aurora' }],
        },
      ],
    });
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-4',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderPage({
      services: [roomService],
      initialDraft: { ...READY, resourceId: 'room-gone' },
    });

    await screen.findByRole('radio', { name: 'Sala Aurora' });
    await reviewAndConfirm();

    await screen.findByTestId('new-schedule-created');
    expect(createRecurringScheduleAsCustomer.mock.calls[0]![0]).toMatchObject({
      resourceIds: ['room-a'],
    });
  });
});
