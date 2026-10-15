// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulingExceptionItem } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { makeSchedulingException } from './scheduling-exception.fixtures';
import { SchedulingExceptionWorklistPage } from './SchedulingExceptionWorklistPage';

const mockList = vi.fn();
const mockResolve = vi.fn();

vi.mock('@/features/booking/api/scheduling-exceptions', () => ({
  listOpenSchedulingExceptions: () => mockList(),
  countOpenSchedulingExceptions: vi.fn().mockResolvedValue(0),
  resolveSchedulingExceptions: (body: unknown) => mockResolve(body),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const box1 = { resourceId: 'r-box-1', resourceName: 'Box 1' };

function entry(id: string, source: { id: string; name: string }, who: string) {
  return makeSchedulingException({
    id,
    sourceId: source.id,
    alternatives: [box1],
    booking: { contactName: who, resourceName: source.name },
  });
}

const BOX2 = { id: 'res-box-2', name: 'Box 2' };
const WALACE = { id: 'res-walace', name: 'Walace' };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <SchedulingExceptionWorklistPage />
    </QueryClientProvider>,
  );
}

function listOf(items: SchedulingExceptionItem[]) {
  mockList.mockResolvedValue({ items });
}

const resolvedAll = (body: { exceptionIds: string[] }) => ({
  results: body.exceptionIds.map((exceptionId) => ({ exceptionId, outcome: 'RESOLVED' })),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockImplementation(async (body: { exceptionIds: string[] }) => resolvedAll(body));
});

describe('SchedulingExceptionWorklistPage — states', () => {
  it('shows the loading skeleton while the list loads', () => {
    mockList.mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByTestId('scheduling-exceptions-loading')).toBeInTheDocument();
  });

  it('shows the load error with a retry that refetches', async () => {
    const user = userEvent.setup();
    mockList.mockRejectedValueOnce(new Error('boom'));
    renderPage();

    expect(await screen.findByTestId('scheduling-exceptions-load-error')).toHaveTextContent(
      'Não foi possível carregar as reservas',
    );
    listOf([entry('e1', BOX2, 'João Silva')]);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('João Silva')).toBeInTheDocument();
  });

  it('shows the empty state with a way to the resources', async () => {
    listOf([]);
    renderPage();

    const empty = await screen.findByTestId('scheduling-exceptions-empty');
    expect(empty).toHaveTextContent('Nenhuma reserva a resolver');
    expect(within(empty).getByRole('link', { name: 'Ver recursos' })).toHaveAttribute(
      'href',
      '/dashboard/resources',
    );
  });
});

describe('SchedulingExceptionWorklistPage — the list', () => {
  it('groups the entries by the unavailable resource, with a header and a count each', async () => {
    listOf([
      entry('e1', BOX2, 'João Silva'),
      entry('e2', WALACE, 'Carlos Lima'),
      entry('e3', BOX2, 'Maria Oliveira'),
    ]);
    renderPage();

    const groups = await screen.findAllByTestId('scheduling-exceptions-group');
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText('Box 2 ficou indisponível')).toBeInTheDocument();
    expect(within(groups[0]).getByText('2 reservas')).toBeInTheDocument();
    expect(within(groups[0]).getByText('João Silva')).toBeInTheDocument();
    expect(within(groups[0]).getByText('Maria Oliveira')).toBeInTheDocument();
    expect(within(groups[1]).getByText('Walace ficou indisponível')).toBeInTheDocument();
    expect(within(groups[1]).getByText('1 reserva')).toBeInTheDocument();
  });

  it('shows no action bar until something is selected', async () => {
    listOf([entry('e1', BOX2, 'João Silva')]);
    renderPage();
    await screen.findByText('João Silva');

    expect(screen.queryByTestId('scheduling-exceptions-bulk-bar')).not.toBeInTheDocument();
  });

  it('"Selecionar todos" selects only its own group, and again clears it', async () => {
    const user = userEvent.setup();
    listOf([
      entry('e1', BOX2, 'João Silva'),
      entry('e2', BOX2, 'Maria Oliveira'),
      entry('e3', WALACE, 'Carlos Lima'),
    ]);
    renderPage();
    const groups = await screen.findAllByTestId('scheduling-exceptions-group');

    await user.click(within(groups[0]).getByRole('button', { name: 'Selecionar todos' }));

    expect(screen.getByTestId('scheduling-exceptions-bulk-bar')).toHaveTextContent(
      '2 selecionadas',
    );
    expect(within(groups[1]).getByRole('checkbox')).not.toBeChecked();

    await user.click(within(groups[0]).getByRole('button', { name: 'Selecionar todos' }));
    expect(screen.queryByTestId('scheduling-exceptions-bulk-bar')).not.toBeInTheDocument();
  });

  it('an entry whose booking cannot be read is shown but cannot be selected', async () => {
    const user = userEvent.setup();
    listOf([entry('e1', BOX2, 'João Silva'), makeSchedulingException({ id: 'e2', booking: null })]);
    renderPage();
    const group = (await screen.findAllByTestId('scheduling-exceptions-group'))[0];

    expect(within(group).getByText('Reserva indisponível')).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Selecionar todos' }));
    expect(screen.getByTestId('scheduling-exceptions-bulk-bar')).toHaveTextContent('1 selecionada');
  });
});

describe('SchedulingExceptionWorklistPage — bulk reassign', () => {
  async function selectTwoAndOpenReassign(user: ReturnType<typeof userEvent.setup>) {
    listOf([entry('e1', BOX2, 'João Silva'), entry('e2', BOX2, 'Maria Oliveira')]);
    renderPage();
    const group = (await screen.findAllByTestId('scheduling-exceptions-group'))[0];
    await user.click(within(group).getByRole('button', { name: 'Selecionar todos' }));
    await user.click(
      within(screen.getByTestId('scheduling-exceptions-bulk-bar')).getByRole('button', {
        name: 'Reatribuir',
      }),
    );
  }

  it('sends every selected id with AUTO and shows the per-entry result', async () => {
    const user = userEvent.setup();
    await selectTwoAndOpenReassign(user);

    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));

    await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(1));
    expect(mockResolve).toHaveBeenCalledWith({
      exceptionIds: ['e1', 'e2'],
      resolutionType: 'REASSIGN',
      target: { mode: 'AUTO' },
    });
    expect(await screen.findByTestId('scheduling-exceptions-result')).toHaveTextContent(
      '2 reservas resolvidas',
    );
    // The selection and the bar are gone once the action went through.
    expect(screen.queryByTestId('scheduling-exceptions-bulk-bar')).not.toBeInTheDocument();
  });

  it('shows which entries stayed open and why', async () => {
    const user = userEvent.setup();
    mockResolve.mockResolvedValue({
      results: [
        { exceptionId: 'e1', outcome: 'RESOLVED' },
        { exceptionId: 'e2', outcome: 'STILL_OPEN', errorCode: 'BOOKING_SLOT_UNAVAILABLE' },
      ],
    });
    await selectTwoAndOpenReassign(user);

    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));

    const result = await screen.findByTestId('scheduling-exceptions-result');
    expect(result).toHaveTextContent('1 reserva resolvida · 1 continua aberta');
    expect(within(result).getByTestId('still-open-reason')).toBeInTheDocument();
  });

  it('when the whole request fails, nothing changed: the error stays in the sheet and the selection is kept', async () => {
    const user = userEvent.setup();
    mockResolve.mockRejectedValue(new Error('network down'));
    await selectTwoAndOpenReassign(user);

    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));

    expect(await screen.findByTestId('action-sheet-error')).toHaveTextContent(
      'Nenhuma reserva foi alterada',
    );
    expect(screen.queryByTestId('scheduling-exceptions-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('scheduling-exceptions-bulk-bar')).toHaveTextContent(
      '2 selecionadas',
    );
  });

  it('translates an API error into the sheet', async () => {
    const user = userEvent.setup();
    mockResolve.mockRejectedValue(
      new ApiError(400, 'bad', { code: 'BOOKING_EXCEPTION_REASSIGN_TARGET_INVALID' }),
    );
    await selectTwoAndOpenReassign(user);

    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));

    expect(await screen.findByTestId('action-sheet-error')).not.toHaveTextContent(
      'BOOKING_EXCEPTION_REASSIGN_TARGET_INVALID',
    );
  });

  it('goes back to the list from the result', async () => {
    const user = userEvent.setup();
    await selectTwoAndOpenReassign(user);
    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));
    await screen.findByTestId('scheduling-exceptions-result');

    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }));

    expect(screen.queryByTestId('scheduling-exceptions-result')).not.toBeInTheDocument();
  });
});

describe('SchedulingExceptionWorklistPage — cancel and a single row', () => {
  it('cancels one entry from its own row', async () => {
    const user = userEvent.setup();
    listOf([entry('e1', BOX2, 'João Silva'), entry('e2', BOX2, 'Maria Oliveira')]);
    renderPage();
    await screen.findByText('João Silva');

    await user.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    expect(screen.getByRole('dialog', { name: 'Cancelar 1 reserva?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar 1 reserva' }));

    await waitFor(() =>
      expect(mockResolve).toHaveBeenCalledWith({ exceptionIds: ['e1'], resolutionType: 'CANCEL' }),
    );
  });

  it('cancels the whole selection from the bar with the reason', async () => {
    const user = userEvent.setup();
    listOf([entry('e1', BOX2, 'João Silva'), entry('e2', BOX2, 'Maria Oliveira')]);
    renderPage();
    const group = (await screen.findAllByTestId('scheduling-exceptions-group'))[0];
    await user.click(within(group).getByRole('button', { name: 'Selecionar todos' }));
    await user.click(
      within(screen.getByTestId('scheduling-exceptions-bulk-bar')).getByRole('button', {
        name: 'Cancelar',
      }),
    );
    await user.type(screen.getByRole('textbox'), 'Box 2 fechou');
    await user.click(screen.getByRole('button', { name: 'Cancelar 2 reservas' }));

    await waitFor(() =>
      expect(mockResolve).toHaveBeenCalledWith({
        exceptionIds: ['e1', 'e2'],
        resolutionType: 'CANCEL',
        reason: 'Box 2 fechou',
      }),
    );
  });
});

describe('SchedulingExceptionWorklistPage — more than 100 entries', () => {
  it('"Selecionar todos" on 150 entries is sent in batches of 100 and 50, never as one request', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 150 }, (_, i) =>
      entry(`e${i + 1}`, BOX2, `Cliente ${i + 1}`),
    );
    listOf(many);
    renderPage();
    const group = (await screen.findAllByTestId('scheduling-exceptions-group'))[0];
    await user.click(within(group).getByRole('button', { name: 'Selecionar todos' }));
    await user.click(
      within(screen.getByTestId('scheduling-exceptions-bulk-bar')).getByRole('button', {
        name: 'Cancelar',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar 150 reservas' }));

    await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(2));
    expect(mockResolve.mock.calls.map(([body]) => body.exceptionIds.length)).toEqual([100, 50]);
    expect(await screen.findByTestId('scheduling-exceptions-result')).toHaveTextContent(
      '150 reservas resolvidas',
    );
  });
});
