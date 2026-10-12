// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import {
  autoRequirement,
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
  renderWithIntl,
  storedLocationRequirement,
} from '@/test-utils';
import { NewRecurringScheduleForm } from './NewRecurringScheduleForm';

const fetchServiceResourceOptions = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions }));

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
  resourceIds: [],
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

beforeEach(() => {
  vi.clearAllMocks();
  fetchServiceResourceOptions.mockResolvedValue({ requirements: [] });
});

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

// TD49 Story 2 — one pick group per CUSTOMER_CHOICE requirement; the automatic ones are a line.
describe('NewRecurringScheduleForm — resource requirements', () => {
  const entry = (type: 'STAFF' | 'ROOM' | 'EQUIPMENT', names: readonly string[]) => ({
    serviceId: SERVICE.id,
    legIndex: null,
    resourceType: type,
    selectionMode: 'CUSTOMER_CHOICE' as const,
    requiredQuantity: 1,
    options: names.map((name) => ({ resourceId: `id-${name}`, name })),
  });

  function withRequirements(
    resourceRequirements: ReturnType<typeof makeHotsiteService>['resourceRequirements'],
  ) {
    return { ...SERVICE, resourceRequirements };
  }

  function renderBundle(
    service: ReturnType<typeof makeHotsiteService>,
    props: Partial<React.ComponentProps<typeof NewRecurringScheduleForm>> = {},
  ) {
    const onChange = vi.fn();
    renderWithIntl(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NewRecurringScheduleForm
          services={[service]}
          tenantSlug="lavacar-bh"
          draft={{ ...DRAFT, resourceIds: ['id-Marina', 'id-Sala Aurora'] }}
          onChange={onChange}
          issues={[]}
          showIssues={false}
          refusal={null}
          onReview={vi.fn()}
          {...props}
        />
      </QueryClientProvider>,
    );
    return { onChange };
  }

  it('A2: shows a titled group for each of two customer-chosen requirements', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('STAFF', ['Marina', 'Rafael']), entry('ROOM', ['Sala Aurora'])],
    });
    renderBundle(withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]));

    expect(await screen.findByRole('radiogroup', { name: 'Profissional' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Sala' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Marina' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Rafael' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Se algum dos recursos não estiver livre/)).toBeInTheDocument();
  });

  it('A: shows a group for the chosen requirement and a line for the automatic one', async () => {
    fetchServiceResourceOptions.mockResolvedValue({ requirements: [entry('STAFF', ['Marina'])] });
    renderBundle(withRequirements([choiceRequirement('STAFF'), autoRequirement('ROOM')]));

    expect(await screen.findByRole('radiogroup', { name: 'Profissional' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Sala' })).not.toBeInTheDocument();
    expect(screen.getByTestId('new-schedule-resource-auto')).toHaveTextContent(
      'Escolhida automaticamente a cada semana, entre as salas livres',
    );
  });

  it('B: numbers the groups when a type repeats', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('STAFF', ['Marina', 'Rafael']), entry('STAFF', ['Marina', 'Rafael'])],
    });
    renderBundle(withRequirements([choiceRequirement('STAFF'), choiceRequirement('STAFF')]));

    expect(await screen.findByRole('radiogroup', { name: 'Profissional 1' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Profissional 2' })).toBeInTheDocument();
  });

  it('writes a pick into its own slot and keeps the others', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('STAFF', ['Marina', 'Rafael']), entry('ROOM', ['Sala Aurora'])],
    });
    const { onChange } = renderBundle(
      withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]),
    );

    fireEvent.click(await screen.findByRole('radio', { name: 'Rafael' }));

    expect(onChange).toHaveBeenCalledWith({ resourceIds: ['id-Rafael', 'id-Sala Aurora'] });
  });

  it('preselects the first option of every group that has no pick', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('STAFF', ['Marina', 'Rafael']), entry('ROOM', ['Sala Aurora'])],
    });
    const { onChange } = renderBundle(
      withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]),
      { draft: { ...DRAFT, resourceIds: [] } },
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ resourceIds: ['id-Marina', 'id-Sala Aurora'] }),
    );
  });

  it('replaces a pick that is no longer offered with the first option', async () => {
    fetchServiceResourceOptions.mockResolvedValue({ requirements: [entry('STAFF', ['Marina'])] });
    const { onChange } = renderBundle(withRequirements([choiceRequirement('STAFF')]), {
      draft: { ...DRAFT, resourceIds: ['id-gone'] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ resourceIds: ['id-Marina'] }));
  });

  it('C: names the group that still has no pick and leaves the others alone', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('STAFF', ['Marina']), entry('ROOM', ['Sala Aurora'])],
    });
    renderBundle(withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]), {
      draft: { ...DRAFT, resourceIds: [null, 'id-Sala Aurora'] },
      issues: ['RESOURCE_REQUIRED'],
      showIssues: true,
    });

    expect(await screen.findByText('Escolha o profissional')).toBeInTheDocument();
    expect(screen.queryByText('Escolha a sala')).not.toBeInTheDocument();
  });

  it('D: an all-automatic bundle shows only lines and asks for no options', async () => {
    renderBundle(withRequirements([autoRequirement('STAFF'), autoRequirement('ROOM')]), {
      draft: { ...DRAFT, resourceIds: [] },
    });

    expect(screen.getAllByTestId('new-schedule-resource-auto')).toHaveLength(2);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(fetchServiceResourceOptions).not.toHaveBeenCalled();
  });

  it('E: a pool requirement is an info line', () => {
    renderBundle(
      withRequirements([
        autoRequirement('EQUIPMENT', 'AUTO_FUNGIBLE_POOL'),
        autoRequirement('ROOM'),
      ]),
    );

    expect(screen.getAllByTestId('new-schedule-resource-auto')[0]).toHaveTextContent(
      'Uma unidade livre é reservada a cada semana',
    );
  });

  it('F: an older location + staff service shows the staff group and nothing for the location', async () => {
    fetchServiceResourceOptions.mockResolvedValue({ requirements: [entry('STAFF', ['Marina'])] });
    renderBundle(withRequirements([storedLocationRequirement(), choiceRequirement('STAFF')]));

    const group = await screen.findByRole('radiogroup', { name: 'Recurso' });
    expect(group).toBeInTheDocument();
    expect(screen.queryByTestId('new-schedule-resource-auto')).not.toBeInTheDocument();
  });

  it('keeps the plain "Recurso" field for a single customer-chosen requirement', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('ROOM', ['Sala Aurora'])],
    });
    renderBundle(withRequirements([choiceRequirement('ROOM')]));

    expect(await screen.findByRole('radiogroup', { name: 'Recurso' })).toBeInTheDocument();
    expect(screen.queryByText(/Se algum dos recursos não estiver livre/)).not.toBeInTheDocument();
  });

  it('shows nothing for a single automatic requirement or the default shape', () => {
    renderBundle(withRequirements([autoRequirement('ROOM')]));
    expect(screen.queryByTestId('new-schedule-resource-auto')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('H: a group with no options says so and blocks the review without hiding the others', async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [entry('STAFF', ['Marina']), entry('ROOM', [])],
    });
    renderBundle(withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]));

    expect(await screen.findByTestId('new-schedule-resource-empty')).toHaveTextContent(
      'Nenhuma sala está disponível para este serviço no momento.',
    );
    expect(screen.getByRole('radiogroup', { name: 'Profissional' })).toBeInTheDocument();
    expect(screen.getAllByTestId('new-schedule-review')[0]).toBeDisabled();
  });

  it('H: blocks the review while the options load and when they fail', async () => {
    fetchServiceResourceOptions.mockReturnValue(new Promise(() => undefined));
    renderBundle(withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]));
    expect(screen.getAllByTestId('new-schedule-review')[0]).toBeDisabled();
    expect(screen.getAllByText('Carregando recursos…').length).toBeGreaterThan(0);
  });

  it('H: says the options could not be loaded', async () => {
    fetchServiceResourceOptions.mockRejectedValue(new Error('network'));
    renderBundle(withRequirements([choiceRequirement('STAFF'), choiceRequirement('ROOM')]));

    expect(
      (await screen.findAllByText('Não foi possível carregar os recursos. Tente novamente.'))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByTestId('new-schedule-review')[0]).toBeDisabled();
  });

  it('lets the review go ahead when nothing needs a pick', () => {
    renderBundle(withRequirements([autoRequirement('STAFF'), autoRequirement('ROOM')]), {
      draft: { ...DRAFT, resourceIds: [] },
    });
    expect(screen.getAllByTestId('new-schedule-review')[0]).toBeEnabled();
  });
});
