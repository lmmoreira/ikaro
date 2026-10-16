// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingErrorCode, type HotsiteServiceResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import {
  autoRequirement,
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
  renderWithIntl,
} from '@/test-utils';
import { NewRecurringScheduleForStaff } from './NewRecurringScheduleForStaff';

const createRecurringScheduleAsStaff = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/recurring-booking-schedules', () => ({
  createRecurringScheduleAsStaff,
}));
const fetchServiceResourceOptions = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions }));
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

const CUSTOMER = { customerId: 'cust-1', name: 'Ana Costa', email: 'ana@email.com' };

// Monday 2026-10-12 02:00 in São Paulo: today's 09:00 is still ahead, so the default start time
// gives a first occurrence in the future. Only `Date` is faked, so the DOM tests stay real-time.
const EARLY_MORNING = new Date('2026-10-12T05:00:00Z');
const AFTER_NINE = new Date('2026-10-12T15:00:00Z');

function eligibleService(overrides: Partial<HotsiteServiceResponse> = {}): HotsiteServiceResponse {
  return makeHotsiteService({
    name: 'Sala Aurora',
    durationMinutes: 120,
    bookingPolicy: {
      ...hotsiteServiceBookingDefaults.bookingPolicy,
      recurrenceEligible: true,
      // A notice and a horizon that would refuse a customer: staff are exempt from both.
      effectiveMinBookingAdvanceHours: 48,
      effectiveMaxBookingAdvanceDays: 7,
    },
    ...overrides,
  });
}

function renderForm(
  props: Partial<React.ComponentProps<typeof NewRecurringScheduleForStaff>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={queryClient}>
      <NewRecurringScheduleForStaff
        services={[eligibleService()]}
        emptyReason="NONE_ENABLED"
        tenantSlug="lavacar-bh"
        customer={CUSTOMER}
        {...props}
      />
    </QueryClientProvider>,
  );
}

function pickWeekday(day: string): void {
  const pill = screen
    .getAllByTestId('new-schedule-weekday')
    .find((candidate) => candidate.dataset.value === day)!;
  fireEvent.click(pill);
}

function pickEndDate(day: number): void {
  fireEvent.click(screen.getByTestId('new-schedule-ends-on'));
  const calendar = screen.getByRole('grid');
  fireEvent.click(within(calendar).getByRole('button', { name: new RegExp(`\\b${day}\\b`) }));
}

// Mondays 12, 19 and 26 October: three reservations.
function fillPattern(): void {
  pickWeekday('monday');
  pickEndDate(26);
}

// The one outcome panel carries its kind in data-outcome (a static test id, E2E-3).
async function outcomePanel(kind: string): Promise<HTMLElement> {
  const panel = await screen.findByTestId('staff-schedule-outcome');
  await waitFor(() => expect(panel).toHaveAttribute('data-outcome', kind));
  return panel;
}

function press(testId: string): void {
  // The action pane is rendered twice (mobile and desktop); the buttons are identical.
  fireEvent.click(screen.getAllByTestId(testId)[0]!);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(EARLY_MORNING);
  fetchServiceResourceOptions.mockResolvedValue({ requirements: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NewRecurringScheduleForStaff — the pattern', () => {
  it('shows the chosen customer with a way to change them, and creates directly with no review step', () => {
    renderForm();

    expect(screen.getByTestId('recipient-header')).toHaveTextContent('Ana Costa');
    expect(screen.getByTestId('recipient-header')).toHaveTextContent('ana@email.com');
    expect(screen.getByTestId('change-recipient')).toHaveAttribute(
      'href',
      '/dashboard/bookings/new?tipo=recorrencia',
    );
    expect(screen.getAllByTestId('new-schedule-create').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('new-schedule-review')).not.toBeInTheDocument();
    expect(screen.getByText(/a equipe é quem aprova/)).toBeInTheDocument();
  });

  it('names what is missing, and sends nothing, until a weekday and an end date are chosen', () => {
    renderForm();

    press('new-schedule-create');

    expect(screen.getByText('Escolha pelo menos um dia da semana.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a data em que a recorrência termina.')).toBeInTheDocument();
    expect(createRecurringScheduleAsStaff).not.toHaveBeenCalled();
  });

  it('accepts a start today inside the service’s minimum notice, which a customer would be refused', async () => {
    createRecurringScheduleAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderForm();

    fillPattern();
    press('new-schedule-create');

    expect(await outcomePanel('ACTIVE')).toBeInTheDocument();
    expect(createRecurringScheduleAsStaff).toHaveBeenCalledTimes(1);
  });

  it('refuses a first occurrence that already started on the form itself, keeping the pattern', () => {
    vi.setSystemTime(AFTER_NINE);
    renderForm();

    fillPattern();
    press('new-schedule-create');

    expect(screen.getByTestId('new-schedule-notice')).toHaveTextContent(
      'O novo horário deve ser no futuro.',
    );
    expect(createRecurringScheduleAsStaff).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByTestId('new-schedule-weekday')
        .filter((pill) => pill.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
  });

  it('sends the exact body with the customer id, and no resourceIds or assignmentPolicy', async () => {
    createRecurringScheduleAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderForm();

    fillPattern();
    press('new-schedule-create');
    await outcomePanel('ACTIVE');

    expect(createRecurringScheduleAsStaff).toHaveBeenCalledWith({
      serviceId: eligibleService().id,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['monday'],
        startTime: '09:00',
        durationMinutes: 120,
      },
      startsOn: '2026-10-12',
      endsOn: '2026-10-26',
      customerId: 'cust-1',
    });
    const body = createRecurringScheduleAsStaff.mock.calls[0]![0];
    expect(body).not.toHaveProperty('resourceIds');
    expect(body).not.toHaveProperty('assignmentPolicy');
    expect(body).not.toHaveProperty('resourceSelections');
  });
});

describe('NewRecurringScheduleForStaff — the shapes of service', () => {
  const ROOMS = {
    requirements: [
      {
        legIndex: null,
        resourceType: 'ROOM',
        options: [
          { resourceId: 'room-1', name: 'Sala Lótus' },
          { resourceId: 'room-2', name: 'Sala Horizonte' },
        ],
      },
    ],
  };

  it('shows no resource field for a service with no requirement', () => {
    renderForm({ services: [eligibleService({ resourceRequirements: [] })] });

    expect(screen.queryByTestId('new-schedule-resource')).not.toBeInTheDocument();
  });

  it('sends the room the staff member picked as one resourceSelections entry keyed by type', async () => {
    fetchServiceResourceOptions.mockResolvedValue(ROOMS);
    createRecurringScheduleAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderForm({
      services: [eligibleService({ resourceRequirements: [choiceRequirement('ROOM')] })],
    });

    await waitFor(() => expect(screen.getAllByTestId('new-schedule-create')[0]).toBeEnabled());
    fillPattern();
    press('new-schedule-create');
    await outcomePanel('ACTIVE');

    expect(createRecurringScheduleAsStaff.mock.calls[0]![0].resourceSelections).toEqual([
      { resourceType: 'ROOM', resourceId: 'room-1' },
    ]);
    expect(screen.getByText('Sala Lótus')).toBeInTheDocument();
  });

  it('for a bundle sends one pick for the customer-chosen requirement and none for the automatic one', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        {
          legIndex: null,
          resourceType: 'STAFF',
          options: [{ resourceId: 'staff-1', name: 'Dr. Paulo' }],
        },
      ],
    });
    createRecurringScheduleAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderForm({
      services: [
        eligibleService({
          resourceRequirements: [choiceRequirement('STAFF'), autoRequirement('ROOM')],
        }),
      ],
    });

    await waitFor(() => expect(screen.getAllByTestId('new-schedule-create')[0]).toBeEnabled());
    fillPattern();
    press('new-schedule-create');
    await outcomePanel('ACTIVE');

    expect(createRecurringScheduleAsStaff.mock.calls[0]![0].resourceSelections).toEqual([
      { resourceType: 'STAFF', resourceId: 'staff-1' },
    ]);
    expect(screen.getByText('Dr. Paulo')).toBeInTheDocument();
  });

  it('blocks the create button while a group has nothing to offer, without hiding the other fields', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [{ legIndex: null, resourceType: 'ROOM', options: [] }],
    });
    renderForm({
      services: [eligibleService({ resourceRequirements: [choiceRequirement('ROOM')] })],
    });

    await waitFor(() => expect(screen.getAllByTestId('new-schedule-create')[0]).toBeDisabled());
    expect(screen.getAllByTestId('new-schedule-weekday').length).toBeGreaterThan(0);
  });
});

describe('NewRecurringScheduleForStaff — the outcomes', () => {
  const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
    new ApiError(status, 'x', { type: 't', title: 't', status, code, ...extra });

  async function submit(): Promise<void> {
    fillPattern();
    press('new-schedule-create');
  }

  it('shows the created panel with the customer and the number of reservations', async () => {
    createRecurringScheduleAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    renderForm();

    await submit();

    const panel = await outcomePanel('ACTIVE');
    expect(panel).toHaveTextContent('Recorrência criada para Ana Costa');
    expect(panel).toHaveTextContent('Criamos as 3 reservas');
    expect(screen.getByTestId('staff-schedule-result')).toHaveTextContent('Sala Aurora');
    expect(screen.getAllByTestId('staff-schedule-create-another')[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/new?tipo=recorrencia',
    );
  });

  it('shows the conflict panel with every colliding date, and "Alterar padrão" brings the pattern back untouched', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(
      problem(409, BookingErrorCode.RECURRING_SCHEDULE_CONFLICT, {
        conflicts: [
          { occurrenceStart: '2026-10-19T13:00:00Z', reason: 'OCCUPIED' },
          { occurrenceStart: '2026-10-26T13:00:00Z', reason: 'CLOSED' },
        ],
      }),
    );
    renderForm();

    await submit();

    expect(await outcomePanel('CONFLICT')).toHaveTextContent('Nada foi criado.');
    expect(screen.getAllByTestId('conflict-item')).toHaveLength(2);
    expect(screen.getByTestId('staff-schedule-result')).not.toHaveTextContent('Criamos as');

    press('staff-schedule-change-pattern');

    expect(await screen.findByTestId('new-schedule-staff-form')).toBeInTheDocument();
    expect(
      screen
        .getAllByTestId('new-schedule-weekday')
        .filter((pill) => pill.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
    expect(screen.getByTestId('new-schedule-ends-on')).toHaveTextContent('26/10/2026');
  });

  it('falls back to the generic conflict message when the body has no occurrence list', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(
      problem(409, BookingErrorCode.RECURRING_SCHEDULE_CONFLICT),
    );
    renderForm();

    await submit();

    expect(await outcomePanel('CONFLICT')).toBeInTheDocument();
    expect(screen.queryByTestId('conflict-list')).not.toBeInTheDocument();
  });

  it('shows the limit panel without naming a resource', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(
      problem(409, BookingErrorCode.RECURRING_SCHEDULE_CAP_REACHED),
    );
    renderForm();

    await submit();

    const panel = await outcomePanel('CAP_REACHED');
    expect(panel).toHaveTextContent('Limite de reservas recorrentes atingido');
    expect(panel).not.toHaveTextContent('Sala Aurora');
  });

  it('shows the no-phone panel and sends the staff member back to the customer step', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(
      problem(422, BookingErrorCode.CUSTOMER_PHONE_NOT_SET),
    );
    renderForm();

    await submit();

    expect(await outcomePanel('PHONE_NOT_SET')).toHaveTextContent(
      'Ana Costa não tem telefone cadastrado',
    );
    expect(screen.getAllByTestId('staff-schedule-choose-other')[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/new?tipo=recorrencia',
    );
  });

  it('shows the customer-not-found panel and sends the staff member back to the customer step', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(
      problem(404, BookingErrorCode.CUSTOMER_NOT_FOUND),
    );
    renderForm();

    await submit();

    expect(await outcomePanel('CUSTOMER_NOT_FOUND')).toHaveTextContent('Cliente não encontrado');
    expect(screen.getAllByTestId('staff-schedule-choose-other').length).toBeGreaterThan(0);
  });

  it('shows the failure panel for a network error, keeping the typed pattern', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(new Error('network'));
    renderForm();

    await submit();

    expect(await outcomePanel('FAILURE')).toHaveTextContent('o padrão que você montou foi mantido');
    press('staff-schedule-change-pattern');
    expect(await screen.findByTestId('new-schedule-ends-on')).toHaveTextContent('26/10/2026');
  });

  it('shows a pending answer, which a staff schedule never gets, as a failure rather than a panel it has none for', async () => {
    createRecurringScheduleAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'PENDING_APPROVAL',
      approvalHoldExpiresAt: '2026-10-12T05:30:00Z',
    });
    renderForm();

    await submit();

    expect(await outcomePanel('FAILURE')).toBeInTheDocument();
  });

  it.each([
    [
      'an end date past the maximum term',
      422,
      BookingErrorCode.RECURRING_SCHEDULE_TERM_EXCEEDED,
      { params: { maxTermDays: 90, latestEndsOn: '2027-01-10' } },
      /limite de 90 dias/,
    ],
    [
      'an end date before the start',
      422,
      BookingErrorCode.RECURRING_SCHEDULE_INVALID_DATE_RANGE,
      {},
      /anterior/i,
    ],
  ])(
    'returns to the form with the pattern kept for %s, never to a result panel',
    async (_label, status, code, extra, text) => {
      createRecurringScheduleAsStaff.mockRejectedValue(problem(status, code, extra));
      renderForm();

      await submit();

      expect(await screen.findByTestId('new-schedule-ends-on-error')).toHaveTextContent(text);
      expect(screen.queryByTestId('staff-schedule-result')).not.toBeInTheDocument();
      expect(
        screen
          .getAllByTestId('new-schedule-weekday')
          .filter((pill) => pill.getAttribute('aria-pressed') === 'true'),
      ).toHaveLength(1);
    },
  );

  it('returns to the form for a start in the past or a term with no occurrence the server catches', async () => {
    createRecurringScheduleAsStaff.mockRejectedValue(
      problem(422, BookingErrorCode.SCHEDULED_IN_PAST),
    );
    renderForm();

    await submit();

    expect(await screen.findByTestId('new-schedule-notice')).toHaveTextContent(
      'O novo horário deve ser no futuro.',
    );
    expect(screen.queryByTestId('staff-schedule-result')).not.toBeInTheDocument();
  });
});

describe('NewRecurringScheduleForStaff — when no service can recur', () => {
  it('says recurrence is off everywhere, with links to Serviços and a one-off booking for this customer', () => {
    renderForm({ services: [], emptyReason: 'NONE_ENABLED' });

    const empty = screen.getByTestId('new-schedule-no-services');
    expect(empty).toHaveTextContent('Nenhum serviço permite reserva recorrente no momento.');
    expect(empty).toHaveTextContent('agendamento avulso para Ana Costa');
    expect(within(empty).getByRole('link', { name: 'Ver serviços' })).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
    expect(within(empty).getByRole('link', { name: 'Fazer um agendamento' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/new/booking?customerId=cust-1',
    );
    expect(screen.queryByTestId('new-schedule-staff-form')).not.toBeInTheDocument();
  });

  it('says some services have recurrence on but none qualifies', () => {
    renderForm({ services: [], emptyReason: 'NONE_QUALIFY' });

    expect(screen.getByTestId('new-schedule-no-services')).toHaveTextContent(
      'ainda não aceitam reserva recorrente',
    );
  });

  it('renders both variants in English too', () => {
    renderWithIntl(
      <QueryClientProvider client={new QueryClient()}>
        <NewRecurringScheduleForStaff
          services={[]}
          emptyReason="NONE_QUALIFY"
          tenantSlug="lavacar-bh"
          customer={CUSTOMER}
        />
      </QueryClientProvider>,
      { locale: 'en' },
    );

    expect(screen.getByTestId('new-schedule-no-services')).toHaveTextContent(
      'do not accept recurring reservations yet',
    );
  });
});
