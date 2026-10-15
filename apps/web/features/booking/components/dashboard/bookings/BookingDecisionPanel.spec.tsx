// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulingExceptionItem, StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingDecisionPanel } from './BookingDecisionPanel';

const push = vi.fn();
const decision = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/features/booking/hooks/useBookingDecision', () => ({
  useBookingDecision: () => decision.value,
}));
vi.mock('@/features/booking/components/dashboard/scheduling-exceptions/ReassignSheet', () => ({
  ReassignSheet: (props: { open: boolean; items: readonly SchedulingExceptionItem[] }) => (
    <div data-testid="reassign-sheet" data-open={String(props.open)}>
      {props.items.map((i) => i.id).join(',')}
    </div>
  ),
}));
vi.mock('@/features/booking/components/dashboard/scheduling-exceptions/CancelSheet', () => ({
  CancelSheet: (props: { open: boolean; count: number }) => (
    <div data-testid="cancel-sheet" data-open={String(props.open)}>
      {props.count}
    </div>
  ),
}));

function entry(
  id: string,
  resourceName: string,
  alternatives = [{ resourceId: 'alt', resourceName: 'Sala 2' }],
): SchedulingExceptionItem {
  return {
    id,
    sourceType: 'RESOURCE_DEACTIVATION',
    sourceId: `res-${id}`,
    affectedType: 'BOOKING',
    affectedId: 'b-1',
    status: 'OPEN',
    alternatives,
    createdAt: '2026-10-15T10:00:00.000Z',
    booking: {
      contactName: 'Ana',
      scheduledAt: '2026-10-20T10:00:00.000Z',
      totalDurationMins: 60,
      serviceNames: ['Sessão'],
      status: 'APPROVED',
      resourceName,
      isCustomer: true,
      totalPrice: { amount: 100, currency: 'BRL' },
    },
  };
}

function booking(status: string): StaffBookingDetailResponse {
  return { bookingId: 'b-1', status, hasOpenException: true } as StaffBookingDetailResponse;
}

const openSheet = vi.fn();

function setDecision(overrides: Record<string, unknown> = {}) {
  decision.value = {
    entries: [entry('e1', 'Sala 1')],
    isLoading: false,
    isError: false,
    retryLoad: vi.fn(),
    sheet: null,
    sheetError: null,
    isSubmitting: false,
    refreshFailed: false,
    openSheet,
    closeSheet: vi.fn(),
    submitReassign: vi.fn(),
    submitCancel: vi.fn(),
    ...overrides,
  };
}

function renderPanel(status = 'APPROVED') {
  return renderWithIntl(
    <BookingDecisionPanel booking={booking(status)} onBookingRefreshed={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setDecision();
});

describe('BookingDecisionPanel (M23-S46)', () => {
  it('offers Reatribuir, Reagendar and Cancelar agendamento for an approved booking with one entry', () => {
    renderPanel('APPROVED');

    expect(screen.getByText('Decisão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeEnabled();
  });

  // Negative guarantee: the resolve contract allows RESCHEDULE only for an APPROVED booking.
  it.each(['PENDING', 'INFO_REQUESTED'])('offers no Reagendar for a %s booking', (status) => {
    renderPanel(status);

    expect(screen.queryByRole('button', { name: 'Reagendar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeInTheDocument();
  });

  it('shows one Reatribuir per entry, named by its resource, when the booking has several', async () => {
    const user = userEvent.setup();
    setDecision({ entries: [entry('e1', 'Sala Aurora'), entry('e2', 'Projetor 2')] });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Reatribuir Projetor 2' }));

    expect(screen.getByRole('button', { name: 'Reatribuir Sala Aurora' })).toBeInTheDocument();
    expect(openSheet).toHaveBeenCalledWith('reassign', ['e2']);
    expect(screen.getAllByRole('button', { name: 'Reagendar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cancelar agendamento' })).toHaveLength(1);
  });

  it('opens the cancel sheet with every entry id of the booking', async () => {
    const user = userEvent.setup();
    setDecision({ entries: [entry('e1', 'Sala Aurora'), entry('e2', 'Projetor 2')] });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));

    expect(openSheet).toHaveBeenCalledWith('cancel', ['e1', 'e2']);
  });

  it('disables Reatribuir for an entry with no alternative and says why', () => {
    setDecision({ entries: [entry('e1', 'Sala 1', [])] });
    renderPanel();

    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeDisabled();
    expect(screen.getByText(/Sem alternativa compatível/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeEnabled();
  });

  it('navigates Reagendar to the first entry’s route and comes back to this booking', async () => {
    const user = userEvent.setup();
    renderPanel('APPROVED');

    await user.click(screen.getByRole('button', { name: 'Reagendar' }));

    expect(push).toHaveBeenCalledWith(
      '/dashboard/scheduling-exceptions/e1/reschedule?returnTo=%2Fdashboard%2Fbookings%2Fb-1',
    );
  });

  it('hands only the chosen entry to the Reatribuir sheet and the count to the cancel sheet', () => {
    setDecision({
      entries: [entry('e1', 'Sala Aurora'), entry('e2', 'Projetor 2')],
      sheet: { kind: 'reassign', ids: ['e2'], nonce: 1 },
    });
    renderPanel();

    expect(screen.getByTestId('reassign-sheet')).toHaveTextContent('e2');
    expect(screen.getByTestId('reassign-sheet')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('cancel-sheet')).toHaveAttribute('data-open', 'false');
  });

  // Nothing left to decide (resolved elsewhere a moment ago): the panel disappears.
  it('renders nothing when no open entry matches', () => {
    setDecision({ entries: [] });
    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a skeleton while the entries load and no actions yet', () => {
    setDecision({ entries: [], isLoading: true });
    renderPanel();

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a load error with a retry button', async () => {
    const user = userEvent.setup();
    const retryLoad = vi.fn();
    setDecision({ entries: [], isError: true, retryLoad });
    renderPanel();

    expect(screen.getByText('Não foi possível carregar as reservas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retryLoad).toHaveBeenCalledTimes(1);
  });

  it('disables every action while a resolve is in flight', () => {
    setDecision({ isSubmitting: true });
    renderPanel();

    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeDisabled();
  });

  // The resolve went through but the booking could not be reloaded, so every entry on screen is
  // stale: no action may stay clickable (a second click would act on state that no longer exists).
  it('says so and offers no action when the booking could not be reloaded after a resolve', () => {
    setDecision({ refreshFailed: true });
    renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent('Recarregue a página');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reassign-sheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cancel-sheet')).not.toBeInTheDocument();
  });
});
