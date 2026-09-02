// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceListPage } from './ResourceListPage';

const RESOURCES: ResourceResponse[] = [
  {
    id: 'loc-1',
    type: 'LOCATION',
    refId: null,
    name: 'Localização Principal',
    workingHours: null,
    turnoverMinutes: 0,
    maxCapacity: null,
    isActive: true,
  },
  {
    id: 'staff-1',
    type: 'STAFF',
    refId: 's-1',
    name: 'Camila Duarte',
    workingHours: null,
    turnoverMinutes: 15,
    maxCapacity: null,
    isActive: true,
  },
  {
    id: 'room-1',
    type: 'ROOM',
    refId: null,
    name: 'Estúdio 1',
    workingHours: null,
    turnoverMinutes: 0,
    maxCapacity: 12,
    isActive: false,
  },
];

const useResourcesMock = vi.fn();

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => useResourcesMock(),
}));

describe('ResourceListPage', () => {
  it('renders resources grouped by type with Ativo/Inativo badges', () => {
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    expect(screen.getByText('Localização Principal')).toBeInTheDocument();
    expect(screen.getByText('Camila Duarte')).toBeInTheDocument();
    expect(screen.getByText('Estúdio 1')).toBeInTheDocument();
    expect(screen.getAllByText('Ativo')).toHaveLength(2);
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('renders one type-group heading per type present, in TYPE_ORDER, not a flat undivided list', () => {
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    const headings = screen.getAllByTestId('resource-type-group-heading');
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Local',
      'Profissional',
      'Sala',
    ]);

    // Each row must sit under its own type's heading, not just co-exist somewhere on the page —
    // a flat list with headings sprinkled in the wrong place would still pass a presence-only
    // assertion.
    const staffHeading = headings[1]!;
    expect(staffHeading.nextElementSibling?.textContent).toContain('Camila Duarte');
  });

  it('never shows a Desativar action on the LOCATION row', () => {
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    const locationRow = screen.getByText('Localização Principal').closest('div[class*="relative"]');
    expect(locationRow).not.toBeNull();
    expect(locationRow!.querySelector('a[href$="/deactivate"]')).toBeNull();
  });

  it('shows a Reativar action for an inactive resource', () => {
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    expect(screen.getByText('Reativar')).toBeInTheDocument();
  });

  it('filters by type using the tabs', async () => {
    const user = userEvent.setup();
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    await user.click(screen.getByRole('button', { name: /Salas/ }));

    expect(screen.queryByText('Camila Duarte')).not.toBeInTheDocument();
    expect(screen.getByText('Estúdio 1')).toBeInTheDocument();
  });

  it('filters by the LOCATION type tab (UC-044 lists LOCATION among the filterable types)', async () => {
    const user = userEvent.setup();
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    await user.click(screen.getByRole('button', { name: /Local/ }));

    expect(screen.getByText('Localização Principal')).toBeInTheDocument();
    expect(screen.queryByText('Camila Duarte')).not.toBeInTheDocument();
    expect(screen.queryByText('Estúdio 1')).not.toBeInTheDocument();
  });

  it('filters by active/inactive status using the second tab row (UC-044)', async () => {
    const user = userEvent.setup();
    useResourcesMock.mockReturnValue({ data: { items: RESOURCES }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    const statusFilters = screen.getByTestId('resource-status-filters');
    await user.click(within(statusFilters).getByRole('button', { name: /Ativos/ }));

    expect(screen.getByText('Camila Duarte')).toBeInTheDocument();
    expect(screen.queryByText('Estúdio 1')).not.toBeInTheDocument();

    await user.click(within(statusFilters).getByRole('button', { name: /Inativos/ }));

    expect(screen.queryByText('Camila Duarte')).not.toBeInTheDocument();
    expect(screen.getByText('Estúdio 1')).toBeInTheDocument();
  });

  it('shows the empty state when there are no resources', () => {
    useResourcesMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    renderWithIntl(<ResourceListPage />);

    expect(screen.getByText('Nenhum recurso encontrado.')).toBeInTheDocument();
  });

  it('shows a distinct error state on fetch failure instead of the empty state', () => {
    useResourcesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });
    renderWithIntl(<ResourceListPage />);

    expect(screen.getByTestId('resource-list-error')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum recurso encontrado.')).not.toBeInTheDocument();
  });
});
