// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import { hotsiteServiceBookingDefaults, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleForm } from './NewRecurringScheduleForm';

vi.mock('@/features/booking/api/public', () => ({
  fetchServiceResourceOptions: vi.fn().mockResolvedValue({ requirements: [] }),
}));

const SERVICE = makeHotsiteService({
  name: 'Sala Aurora',
  durationMinutes: 120,
  price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
  bookingPolicy: {
    ...hotsiteServiceBookingDefaults.bookingPolicy,
    recurrenceEligible: true,
    recurringHorizonDays: 90,
  },
});

const DRAFT: RecurringScheduleDraft = {
  serviceId: SERVICE.id,
  resourceId: null,
  daysOfWeek: ['tuesday'],
  startTime: '10:00',
  startsOn: '2026-10-19',
  endsOn: '',
};

function renderForm(props: Partial<React.ComponentProps<typeof NewRecurringScheduleForm>> = {}) {
  const onChange = vi.fn();
  const onReview = vi.fn();
  const queryClient = new QueryClient();
  renderWithIntl(
    <QueryClientProvider client={queryClient}>
      <NewRecurringScheduleForm
        services={[SERVICE]}
        tenantSlug="lavacar-bh"
        draft={DRAFT}
        onChange={onChange}
        issues={[]}
        showIssues={false}
        refusal={null}
        onReview={onReview}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onChange, onReview };
}

beforeEach(() => vi.clearAllMocks());

describe('NewRecurringScheduleForm', () => {
  it('offers the service with its duration and price, and the read-only duration', () => {
    renderForm();

    expect(screen.getByTestId('new-schedule-service')).toHaveTextContent(
      'Sala Aurora — 2h · R$ 100,00',
    );
    expect(screen.getByTestId('new-schedule-duration')).toHaveTextContent(
      '2h — definida pelo serviço',
    );
  });

  it('shows the maximum term and the last date it allows, from the start date', () => {
    renderForm();

    // 2026-10-19 + 90 days.
    expect(screen.getByTestId('new-schedule-term-hint')).toHaveTextContent(
      'no máximo 90 dias, até 17/01/2027',
    );
  });

  it('reports a weekday toggle in week order', () => {
    const { onChange } = renderForm({ draft: { ...DRAFT, daysOfWeek: ['wednesday'] } });

    const monday = screen
      .getAllByTestId('new-schedule-weekday')
      .find((pill) => pill.dataset.value === 'monday')!;
    fireEvent.click(monday);

    expect(onChange).toHaveBeenCalledWith({ daysOfWeek: ['monday', 'wednesday'] });
  });

  it('hides the problems until the customer has tried to continue, then names each one', () => {
    const issues = ['WEEKDAY_REQUIRED', 'END_REQUIRED'] as const;
    const { onReview } = renderForm({ draft: { ...DRAFT, daysOfWeek: [] }, issues: [...issues] });
    expect(screen.queryByText('Escolha pelo menos um dia da semana.')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('new-schedule-review')[0]!);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('names the problems once they are to be shown', () => {
    renderForm({
      draft: { ...DRAFT, daysOfWeek: [] },
      issues: ['WEEKDAY_REQUIRED', 'END_REQUIRED'],
      showIssues: true,
    });

    expect(screen.getByText('Escolha pelo menos um dia da semana.')).toBeInTheDocument();
    expect(screen.getByTestId('new-schedule-ends-on-error')).toHaveTextContent(
      'Escolha a data em que a recorrência termina.',
    );
  });

  it('names the limit the backend reported when it refuses an end date past the term', () => {
    renderForm({
      draft: { ...DRAFT, endsOn: '2027-03-01' },
      refusal: { kind: 'TERM_EXCEEDED', maxTermDays: 60, latestEndsOn: '2026-12-18' },
    });

    expect(screen.getByTestId('new-schedule-ends-on-error')).toHaveTextContent(
      'passa do limite de 60 dias (até 18/12/2026)',
    );
  });

  it('shows a booking-window refusal as a notice, in the catalog wording', () => {
    renderForm({ refusal: { kind: 'BOOKING_WINDOW', code: 'BOOKING_TOO_FAR_AHEAD' } });

    expect(screen.getByTestId('new-schedule-notice')).toHaveTextContent(
      'Esse horário está além do prazo máximo de agendamento.',
    );
  });

  it('cancels back to the list of recurring reservations', () => {
    renderForm();
    expect(screen.getAllByRole('link', { name: 'Cancelar' })[0]).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules',
    );
  });

  it('renders in English', () => {
    renderWithIntl(
      <QueryClientProvider client={new QueryClient()}>
        <NewRecurringScheduleForm
          services={[SERVICE]}
          tenantSlug="lavacar-bh"
          draft={DRAFT}
          onChange={vi.fn()}
          issues={[]}
          showIssues={false}
          refusal={null}
          onReview={vi.fn()}
        />
      </QueryClientProvider>,
      { locale: 'en' },
    );
    expect(screen.getByText('Days of the week')).toBeInTheDocument();
  });
});
