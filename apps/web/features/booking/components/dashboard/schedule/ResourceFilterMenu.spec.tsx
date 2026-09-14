// @vitest-environment jsdom
import { createRef } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceFilterMenu } from './ResourceFilterMenu';

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
    isActive: true,
  },
];

const useResourcesMock = vi.fn();

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => useResourcesMock(),
}));

function baseProps() {
  return {
    containerRef: createRef<HTMLDivElement>(),
    open: false,
    onToggleOpen: vi.fn(),
    selectedResourceIdSet: new Set<string>(),
    onToggleResource: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('ResourceFilterMenu', () => {
  beforeEach(() => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('does not render the popover content when closed', () => {
    renderWithIntl(<ResourceFilterMenu {...baseProps()} />);
    expect(screen.queryByText('Recursos visíveis')).not.toBeInTheDocument();
  });

  it('renders active non-LOCATION resources and calls onToggleResource for a checkbox', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), open: true, selectedResourceIdSet: new Set(['staff-1']) };
    renderWithIntl(<ResourceFilterMenu {...props} />);

    expect(screen.getByText('Recursos visíveis')).toBeInTheDocument();
    expect(screen.queryByText('Localização Principal')).not.toBeInTheDocument();

    const staffCheckbox = screen.getByRole('checkbox', { name: 'Camila Duarte' });
    expect(staffCheckbox).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Estúdio 1' }));
    expect(props.onToggleResource).toHaveBeenCalledWith('room-1');
  });

  it('calls onReset and onClose from the popover footer', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), open: true };
    renderWithIntl(<ResourceFilterMenu {...props} />);

    await user.click(screen.getByRole('button', { name: 'Padrão' }));
    expect(props.onReset).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleOpen when the trigger button is clicked', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<ResourceFilterMenu {...props} />);

    await user.click(screen.getByRole('button', { name: 'Filtrar recurso' }));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(1);
  });

  it('shows a loading placeholder instead of checkboxes while resources are loading', () => {
    useResourcesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    renderWithIntl(<ResourceFilterMenu {...baseProps()} open />);

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows an empty-state message instead of a blank area when there are no selectable resources', () => {
    useResourcesMock.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithIntl(<ResourceFilterMenu {...baseProps()} open />);

    expect(screen.getByTestId('resource-filter-empty')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows a translated error, not raw backend text, instead of checkboxes on fetch failure', () => {
    useResourcesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });
    renderWithIntl(<ResourceFilterMenu {...baseProps()} open />);

    expect(screen.getByTestId('resource-filter-error')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-filter-options')).not.toBeInTheDocument();
    expect(screen.queryByText('network down')).not.toBeInTheDocument();
  });
});
