// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { RecurringScheduleApprovalDetail } from './RecurringScheduleApprovalDetail';

const mockScheduleQuery = vi.fn();
const mockCustomerQuery = vi.fn();
const mockServiceQuery = vi.fn();
const mockResourceNames = vi.fn();
const approveMutateAsync = vi.fn();
const rejectMutateAsync = vi.fn();
const refreshAfterDecision = vi.fn();
const approveState = { isPending: false };
const rejectState = { isPending: false };

vi.mock('@/features/booking/hooks/useRecurringSchedules', () => ({
  useRecurringScheduleForStaff: (...args: unknown[]) => mockScheduleQuery(...args),
  useRecurringScheduleService: (...args: unknown[]) => mockServiceQuery(...args),
  useAllResourceNames: (...args: unknown[]) => mockResourceNames(...args),
  useApproveRecurringSchedule: () => ({
    mutateAsync: approveMutateAsync,
    isPending: approveState.isPending,
  }),
  useRejectRecurringSchedule: () => ({
    mutateAsync: rejectMutateAsync,
    isPending: rejectState.isPending,
  }),
  useInvalidateAfterDecision: () => refreshAfterDecision,
}));

vi.mock('@/features/customer/hooks/useStaffCustomer', () => ({
  useStaffCustomer: (...args: unknown[]) => mockCustomerQuery(...args),
}));

const CUSTOMER = {
  customerId: 'cust-1',
  email: 'ana@email.com',
  name: 'Ana Costa',
  phone: '+5531999990000',
  defaultAddress: null,
};

function schedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'sched-1',
    customerId: 'cust-1',
    serviceId: 'svc-1',
    serviceName: 'Reserva de sala',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-18',
    endsOn: '2026-11-10',
    status: 'PENDING_APPROVAL',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [{ resourceType: 'ROOM', resourceId: 'room-1' }],
    approvalHoldExpiresAt: '2099-08-11T12:30:00.000Z',
    createdAt: '2026-08-11T12:00:00.000Z',
    ...overrides,
  };
}

function ready(data: RecurringBookingScheduleListItem) {
  mockScheduleQuery.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return new ApiError(status, code, { code, ...extra });
}

async function decideApprove() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: /Aprovar recorrência|Tentar aprovar de novo/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));
}

async function decideReject() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Recusar' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar recusa' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  approveState.isPending = false;
  rejectState.isPending = false;
  ready(schedule());
  mockCustomerQuery.mockReturnValue({ data: CUSTOMER, isError: false });
  mockServiceQuery.mockReturnValue({
    data: {
      resourceRequirements: [
        {
          type: 'ROOM',
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: null,
          requiredQuantity: 1,
        },
      ],
    },
  });
  mockResourceNames.mockReturnValue({ data: new Map([['room-1', 'Sala Aurora']]) });
});

describe('RecurringScheduleApprovalDetail — loading and failure', () => {
  it('shows a loading state while the request is read', () => {
    mockScheduleQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByTestId('recurring-approval-loading')).toHaveTextContent(
      'Carregando pedido…',
    );
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument();
  });

  it('says the request was not found on a 404, with the way back and no retry', () => {
    mockScheduleQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: problem(404, 'BOOKING_RECURRING_SCHEDULE_NOT_FOUND'),
      refetch: vi.fn(),
    });

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-9" />);

    expect(screen.getByText('Este pedido não foi encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
  });

  it('offers a retry on any other load failure', async () => {
    const refetch = vi.fn();
    mockScheduleQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network Error'),
      refetch,
    });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByText('Não foi possível carregar este pedido.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('RecurringScheduleApprovalDetail — a pending request', () => {
  it('asks for the right schedule, customer and service', () => {
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(mockScheduleQuery).toHaveBeenCalledWith('sched-1');
    expect(mockCustomerQuery).toHaveBeenCalledWith('cust-1');
    expect(mockServiceQuery).toHaveBeenCalledWith('svc-1');
  });

  it('shows the deadline, the customer, the request and what each decision does', () => {
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByTestId('recurring-status-badge')).toHaveTextContent(
      'Recorrência · Pendente',
    );
    expect(screen.getByTestId('recurring-hold-banner')).toHaveTextContent('Decidir até 09:30.');
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    const rows = screen.getByTestId('recurring-request-rows');
    expect(within(rows).getByText('Sala Aurora')).toBeInTheDocument();
    expect(within(rows).getByText('Toda terça · 10:00–12:00')).toBeInTheDocument();
    expect(within(rows).getByText('Até 13')).toBeInTheDocument();
    expect(within(rows).getByText('11/08/2026 às 09:00')).toBeInTheDocument();
    expect(screen.getByTestId('recurring-what-happens')).toHaveTextContent(
      'Nenhuma reserva foi criada ainda.',
    );
    expect(screen.getByRole('button', { name: 'Aprovar recorrência' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
  });

  it('draws the rows of a bundle: picks by name and the automatic requirement per occurrence', () => {
    ready(
      schedule({
        resourceAssignments: [
          { resourceType: 'ROOM', resourceId: 'room-1' },
          { resourceType: 'EQUIPMENT', resourceId: 'eq-1' },
        ],
      }),
    );
    mockServiceQuery.mockReturnValue({
      data: {
        resourceRequirements: [
          {
            type: 'ROOM',
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: null,
            requiredQuantity: 1,
          },
          {
            type: 'EQUIPMENT',
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: null,
            requiredQuantity: 1,
          },
          { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
        ],
      },
    });
    mockResourceNames.mockReturnValue({
      data: new Map([
        ['room-1', 'Sala Aurora'],
        ['eq-1', 'Projetor 2'],
      ]),
    });

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    const rows = screen.getByTestId('recurring-request-rows');
    expect(within(rows).getByText('Sala Aurora')).toBeInTheDocument();
    expect(within(rows).getByText('Projetor 2')).toBeInTheDocument();
    expect(within(rows).getByText('Resolvido a cada ocorrência')).toBeInTheDocument();
  });

  it('draws no resource row for a service with no resource (#simples)', () => {
    ready(schedule({ resourceAssignments: [] }));
    mockServiceQuery.mockReturnValue({
      data: {
        resourceRequirements: [
          { type: 'LOCATION', selectionMode: 'NONE', resourcePoolIds: null, requiredQuantity: 1 },
        ],
      },
    });

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    const rows = screen.getByTestId('recurring-request-rows');
    expect(within(rows).queryByText('Local')).not.toBeInTheDocument();
    expect(within(rows).queryByText('Sala')).not.toBeInTheDocument();
  });

  it('still shows the stored picks when the service could not be read', () => {
    mockServiceQuery.mockReturnValue({ data: undefined, isError: true });

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(
      within(screen.getByTestId('recurring-request-rows')).getByText('Sala Aurora'),
    ).toBeInTheDocument();
  });

  it('does not block the decision when the customer cannot be read', () => {
    mockCustomerQuery.mockReturnValue({ data: undefined, isError: true });

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByText('Não foi possível ler os dados do cliente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar recorrência' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
  });
});

describe('RecurringScheduleApprovalDetail — approving', () => {
  it('asks to confirm, names the customer and period, and does not call until confirmed', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await user.click(screen.getByRole('button', { name: 'Aprovar recorrência' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      'As reservas de Ana Costa (18/08/2026 → 10/11/2026, Toda terça · 10:00–12:00, até 13)',
    );
    expect(approveMutateAsync).not.toHaveBeenCalled();

    await user.click(within(dialog).getAllByRole('button', { name: 'Voltar' })[0]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approveMutateAsync).not.toHaveBeenCalled();
  });

  it('approves the request and reports every reservation created', async () => {
    approveMutateAsync.mockResolvedValue({ id: 'sched-1', status: 'ACTIVE', occurrenceCount: 13 });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(approveMutateAsync).toHaveBeenCalledWith('sched-1');
    expect(await screen.findByTestId('recurring-outcome-approved')).toHaveTextContent(
      'Criamos as 13 reservas',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recurring-hold-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar recorrência' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
  });

  it('reports fewer reservations than asked from the response count (#aprovada-parcial)', async () => {
    approveMutateAsync.mockResolvedValue({ id: 'sched-1', status: 'ACTIVE', occurrenceCount: 12 });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId('recurring-outcome-approved-partial')).toHaveTextContent(
      '12 de 13 reservas criadas',
    );
  });

  it('keeps the request pending and lists the dates on a 409 conflict (#conflito)', async () => {
    approveMutateAsync.mockRejectedValue(
      problem(409, 'BOOKING_RECURRING_SCHEDULE_CONFLICT', {
        conflicts: [{ occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' }],
      }),
    );
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    const banner = await screen.findByTestId('recurring-outcome-conflict');
    expect(within(banner).getAllByTestId('conflict-item')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Tentar aprovar de novo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
    expect(refreshAfterDecision).not.toHaveBeenCalled();
  });

  it('keeps the request pending when the customer has no phone (#telefone)', async () => {
    approveMutateAsync.mockRejectedValue(problem(422, 'BOOKING_CUSTOMER_PHONE_NOT_SET'));
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId('recurring-outcome-phone')).toHaveTextContent(
      'Ana Costa não tem telefone cadastrado',
    );
    expect(screen.getByRole('button', { name: 'Tentar aprovar de novo' })).toBeInTheDocument();
  });

  it.each([
    ['BOOKING_SCHEDULED_IN_PAST', 'recurring-outcome-past'],
    ['BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE', 'recurring-outcome-ineligible'],
  ])('leaves only "Recusar" useful on %s', async (code, testId) => {
    approveMutateAsync.mockRejectedValue(problem(422, code));
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
  });

  it('says the request is no longer pending on a 409, offers only the way back and refreshes (#expirada)', async () => {
    approveMutateAsync.mockRejectedValue(
      problem(409, 'BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL'),
    );
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId('recurring-outcome-not-pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar|Recusar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
    expect(refreshAfterDecision).toHaveBeenCalledTimes(1);
  });

  it('reports a generic failure and lets staff try again (#falha)', async () => {
    approveMutateAsync.mockRejectedValue(new Error('Network Error'));
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId('recurring-outcome-failure')).toHaveTextContent('Nada mudou.');
    expect(screen.getByRole('button', { name: 'Tentar aprovar de novo' })).toBeEnabled();
  });

  it('disables both decisions while one is being sent', () => {
    approveState.isPending = true;

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByRole('button', { name: 'Aprovar recorrência' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled();
  });
});

describe('RecurringScheduleApprovalDetail — a request whose hold has passed', () => {
  const EXPIRED_HOLD = '2020-01-01T12:30:00.000Z';

  it('says the deadline passed and offers only "Recusar" (the expiry job has not cancelled it yet)', () => {
    ready(schedule({ approvalHoldExpiresAt: EXPIRED_HOLD }));

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByTestId('recurring-hold-expired-banner')).toHaveTextContent(
      'O prazo para decidir terminou às 09:30.',
    );
    expect(screen.queryByTestId('recurring-hold-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
    // The "what happens" card no longer promises an approval that cannot happen.
    expect(screen.getByTestId('recurring-what-happens')).not.toHaveTextContent(
      'cria as reservas do período',
    );
  });

  it('lets staff reject it, which clears the request', async () => {
    ready(schedule({ approvalHoldExpiresAt: EXPIRED_HOLD }));
    rejectMutateAsync.mockResolvedValue({ id: 'sched-1', status: 'CANCELLED' });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideReject();

    expect(rejectMutateAsync).toHaveBeenCalledWith('sched-1');
    expect(await screen.findByTestId('recurring-outcome-rejected')).toBeInTheDocument();
  });

  it('does not strand staff after a refused approval: the re-read shows it is still pending and expired, so Recusar stays', async () => {
    // The approval is attempted while the page still thinks the hold is running; the backend
    // answers 409 not-pending, and the re-read then shows the request is still PENDING_APPROVAL.
    approveMutateAsync.mockImplementation(() => {
      ready(schedule({ approvalHoldExpiresAt: EXPIRED_HOLD }));
      return Promise.reject(problem(409, 'BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL'));
    });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId('recurring-hold-expired-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('recurring-outcome-not-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument();
  });

  it('still treats a "not pending" refusal as someone else having decided when the request is no longer pending', async () => {
    approveMutateAsync.mockImplementation(() => {
      ready(schedule({ status: 'CANCELLED', approvalHoldExpiresAt: null }));
      return Promise.reject(problem(409, 'BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL'));
    });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideApprove();

    expect(await screen.findByTestId('recurring-outcome-not-pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar|Recusar/ })).not.toBeInTheDocument();
  });
});

describe('RecurringScheduleApprovalDetail — rejecting', () => {
  it('rejects with only the id (the endpoint takes no reason) and settles the request (#recusada)', async () => {
    rejectMutateAsync.mockResolvedValue({ id: 'sched-1', status: 'CANCELLED' });
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideReject();

    expect(rejectMutateAsync).toHaveBeenCalledTimes(1);
    expect(rejectMutateAsync).toHaveBeenCalledWith('sched-1');
    expect(approveMutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByTestId('recurring-outcome-rejected')).toHaveTextContent(
      'Nenhuma reserva foi criada.',
    );
    expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
  });

  it('asks to confirm without any field', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await user.click(screen.getByRole('button', { name: 'Recusar' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Nenhuma reserva foi criada, então não há nada a liberar.',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(rejectMutateAsync).not.toHaveBeenCalled();
  });

  it('says the request is no longer pending when someone else decided first', async () => {
    rejectMutateAsync.mockRejectedValue(
      problem(409, 'BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL'),
    );
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideReject();

    expect(await screen.findByTestId('recurring-outcome-not-pending')).toBeInTheDocument();
    expect(refreshAfterDecision).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain "Aprovar recorrência" label after a failed rejection', async () => {
    rejectMutateAsync.mockRejectedValue(new Error('Network Error'));
    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    await decideReject();

    expect(await screen.findByTestId('recurring-outcome-failure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar recorrência' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tentar aprovar de novo' }),
    ).not.toBeInTheDocument();
  });
});

describe('RecurringScheduleApprovalDetail — a request that is not pending (read-only)', () => {
  it.each([
    ['ACTIVE', 'Recorrência · Ativa'],
    ['CANCELLED', 'Recorrência · Cancelada'],
    ['ENDED', 'Recorrência · Encerrada'],
  ] as const)('shows a %s request with its status and no way to decide', (status, label) => {
    ready(schedule({ status, approvalHoldExpiresAt: null }));

    renderWithIntl(<RecurringScheduleApprovalDetail scheduleId="sched-1" />);

    expect(screen.getByTestId('recurring-status-badge')).toHaveTextContent(label);
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    expect(screen.queryByTestId('recurring-hold-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recurring-what-happens')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar|Recusar/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('Este pedido já foi decidido e não tem ações disponíveis.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
  });
});
