// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import type {
  DraftIssue,
  PatternRefusal,
  RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { hotsiteServiceBookingDefaults, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { useResourcePicks } from './NewRecurringScheduleResources';
import { RecurringScheduleFields } from './RecurringScheduleFields';

const fetchServiceResourceOptions = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions }));

const SERVICE = makeHotsiteService({
  name: 'Sala Aurora',
  durationMinutes: 120,
  bookingPolicy: {
    ...hotsiteServiceBookingDefaults.bookingPolicy,
    recurrenceEligible: true,
    recurringHorizonDays: 90,
  },
});

const DRAFT: RecurringScheduleDraft = {
  serviceId: SERVICE.id,
  resourceIds: [],
  daysOfWeek: ['tuesday'],
  startTime: '10:00',
  startsOn: '2026-10-19',
  endsOn: '',
};

interface HarnessProps {
  readonly service?: HotsiteServiceResponse;
  readonly draft?: RecurringScheduleDraft;
  readonly issues?: readonly DraftIssue[];
  readonly showIssues?: boolean;
  readonly refusal?: PatternRefusal | null;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
}

// What both shells do: read the picks once, hand them to the fields card.
function Harness({
  service = SERVICE,
  draft = DRAFT,
  issues = [],
  showIssues = false,
  refusal = null,
  onChange,
}: HarnessProps): React.JSX.Element {
  const picks = useResourcePicks({ service, tenantSlug: 'lavacar-bh', draft, onChange });
  return (
    <RecurringScheduleFields
      services={[service]}
      service={service}
      draft={draft}
      onChange={onChange}
      issues={issues}
      showIssues={showIssues}
      refusal={refusal}
      picks={picks}
    />
  );
}

function renderFields(props: Partial<HarnessProps> = {}) {
  const onChange = vi.fn();
  renderWithIntl(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchServiceResourceOptions.mockResolvedValue({ requirements: [] });
});

describe('RecurringScheduleFields', () => {
  it('shows the service, the read-only duration, the weekdays and the term hint', () => {
    renderFields();

    expect(screen.getByTestId('new-schedule-service')).toHaveTextContent('Sala Aurora — 2h');
    expect(screen.getByTestId('new-schedule-duration')).toHaveTextContent(
      '2h — definida pelo serviço',
    );
    expect(screen.getAllByTestId('new-schedule-weekday')).toHaveLength(7);
    expect(screen.getByTestId('new-schedule-term-hint')).toHaveTextContent('no máximo 90 dias');
  });

  it('reports a weekday toggle in week order', () => {
    const onChange = renderFields({ draft: { ...DRAFT, daysOfWeek: ['wednesday'] } });

    fireEvent.click(
      screen
        .getAllByTestId('new-schedule-weekday')
        .find((pill) => pill.dataset.value === 'monday')!,
    );

    expect(onChange).toHaveBeenCalledWith({ daysOfWeek: ['monday', 'wednesday'] });
  });

  it('hides every problem until the person has tried to continue, then names each one', () => {
    renderFields({
      draft: { ...DRAFT, daysOfWeek: [] },
      issues: ['WEEKDAY_REQUIRED', 'END_REQUIRED'],
    });
    expect(screen.queryByText('Escolha pelo menos um dia da semana.')).not.toBeInTheDocument();
  });

  it('names the problems once they are shown', () => {
    renderFields({
      draft: { ...DRAFT, daysOfWeek: [] },
      issues: ['WEEKDAY_REQUIRED', 'END_REQUIRED'],
      showIssues: true,
    });

    expect(screen.getByText('Escolha pelo menos um dia da semana.')).toBeInTheDocument();
    expect(screen.getByTestId('new-schedule-ends-on-error')).toHaveTextContent(
      'Escolha a data em que a recorrência termina.',
    );
  });

  it('shows the server’s term refusal on the end date, with its limit', () => {
    renderFields({
      refusal: { kind: 'TERM_EXCEEDED', maxTermDays: 30, latestEndsOn: '2026-11-18' },
    });

    expect(screen.getByTestId('new-schedule-ends-on-error')).toHaveTextContent('30 dias');
  });

  it('shows a booking-window or no-occurrence refusal as a notice above the card', () => {
    renderFields({ refusal: { kind: 'BOOKING_WINDOW', code: 'BOOKING_SCHEDULED_IN_PAST' } });

    expect(screen.getByTestId('new-schedule-notice')).toHaveTextContent(
      'O novo horário deve ser no futuro.',
    );
  });

  it('shows no notice when nothing was refused', () => {
    renderFields();

    expect(screen.queryByTestId('new-schedule-notice')).not.toBeInTheDocument();
  });
});
