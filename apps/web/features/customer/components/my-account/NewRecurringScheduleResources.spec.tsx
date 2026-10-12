// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import {
  autoRequirement,
  choiceRequirement,
  makeHotsiteService,
  renderWithIntl,
} from '@/test-utils';
import { ResourceFields, useResourcePicks } from './NewRecurringScheduleResources';

const fetchServiceResourceOptions = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions }));

const entry = (
  serviceId: string,
  type: 'STAFF' | 'ROOM',
  options: readonly { resourceId: string; name: string }[],
) => ({
  serviceId,
  legIndex: null,
  resourceType: type,
  selectionMode: 'CUSTOMER_CHOICE' as const,
  requiredQuantity: 1,
  options: [...options],
});

const DRAFT: RecurringScheduleDraft = {
  serviceId: '00000000-0000-0000-0000-000000000001',
  resourceIds: [],
  daysOfWeek: ['tuesday'],
  startTime: '10:00',
  startsOn: '2026-10-19',
  endsOn: '',
};

interface HarnessProps {
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
  readonly showRequired?: boolean;
}

// What the form does with the two exports: ask for the options, then render the groups.
function Harness({ service, draft, onChange, showRequired = false }: HarnessProps) {
  const picks = useResourcePicks({ service, tenantSlug: 'lavacar-bh', draft, onChange });
  return (
    <>
      <p data-testid="blocked">{String(picks.blocked)}</p>
      <ResourceFields
        service={service}
        draft={draft}
        picks={picks}
        showRequired={showRequired}
        onChange={onChange}
      />
    </>
  );
}

function renderHarness(props: HarnessProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchServiceResourceOptions.mockResolvedValue({ requirements: [] });
});

describe('useResourcePicks', () => {
  it('does not ask for options when no requirement is customer-chosen', () => {
    const service = makeHotsiteService({
      resourceRequirements: [autoRequirement('STAFF'), autoRequirement('ROOM')],
    });
    renderHarness({ service, draft: DRAFT, onChange: vi.fn() });

    expect(fetchServiceResourceOptions).not.toHaveBeenCalled();
    expect(screen.getByTestId('blocked')).toHaveTextContent('false');
  });

  it('preselects the first option of every group and does not repeat itself once they are set', async () => {
    const service = makeHotsiteService({
      resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('ROOM')],
    });
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        entry(service.id, 'STAFF', [{ resourceId: 's1', name: 'Marina' }]),
        entry(service.id, 'ROOM', [{ resourceId: 'r1', name: 'Sala Aurora' }]),
      ],
    });
    const onChange = vi.fn();
    renderHarness({ service, draft: { ...DRAFT, resourceIds: ['s1', 'r1'] }, onChange });

    await screen.findByRole('radio', { name: 'Marina' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a valid pick and replaces only the one that is no longer offered', async () => {
    const service = makeHotsiteService({
      resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('ROOM')],
    });
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        entry(service.id, 'STAFF', [{ resourceId: 's1', name: 'Marina' }]),
        entry(service.id, 'ROOM', [{ resourceId: 'r1', name: 'Sala Aurora' }]),
      ],
    });
    const onChange = vi.fn();
    renderHarness({ service, draft: { ...DRAFT, resourceIds: ['s1', 'gone'] }, onChange });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ resourceIds: ['s1', 'r1'] }));
  });

  it('is blocked while loading and when a group has no options, and free once every group has some', async () => {
    const service = makeHotsiteService({
      resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('ROOM')],
    });
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        entry(service.id, 'STAFF', [{ resourceId: 's1', name: 'Marina' }]),
        entry(service.id, 'ROOM', []),
      ],
    });
    renderHarness({ service, draft: { ...DRAFT, resourceIds: ['s1', null] }, onChange: vi.fn() });

    expect(screen.getByTestId('blocked')).toHaveTextContent('true');
    await screen.findByTestId('new-schedule-resource-empty');
    expect(screen.getByTestId('blocked')).toHaveTextContent('true');
  });
});

describe('ResourceFields', () => {
  it('renders nothing for a default-shape service', () => {
    const service = makeHotsiteService({ resourceRequirements: [] });
    renderHarness({ service, draft: DRAFT, onChange: vi.fn() });

    expect(screen.queryByTestId('new-schedule-resource')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-schedule-resource-auto')).not.toBeInTheDocument();
  });

  it('writes the pick into its own slot and keeps the other groups', async () => {
    const service = makeHotsiteService({
      resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('STAFF')],
    });
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        entry(service.id, 'STAFF', [
          { resourceId: 'a', name: 'Marina' },
          { resourceId: 'b', name: 'Rafael' },
        ]),
        entry(service.id, 'STAFF', [
          { resourceId: 'a', name: 'Marina' },
          { resourceId: 'b', name: 'Rafael' },
        ]),
      ],
    });
    const onChange = vi.fn();
    renderHarness({ service, draft: { ...DRAFT, resourceIds: ['a', 'a'] }, onChange });

    const second = await screen.findByRole('radiogroup', { name: 'Profissional 2' });
    fireEvent.click(second.querySelector('[data-value="b"]')!);

    expect(onChange).toHaveBeenCalledWith({ resourceIds: ['a', 'b'] });
  });

  it('asks for the missing pick of the group that has none', async () => {
    const service = makeHotsiteService({
      resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('ROOM')],
    });
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        entry(service.id, 'STAFF', [{ resourceId: 's1', name: 'Marina' }]),
        entry(service.id, 'ROOM', [{ resourceId: 'r1', name: 'Sala Aurora' }]),
      ],
    });
    renderHarness({
      service,
      draft: { ...DRAFT, resourceIds: ['s1', null] },
      onChange: vi.fn(),
      showRequired: true,
    });

    expect(await screen.findByText('Escolha a sala')).toBeInTheDocument();
    expect(screen.queryByText('Escolha o profissional')).not.toBeInTheDocument();
  });
});
