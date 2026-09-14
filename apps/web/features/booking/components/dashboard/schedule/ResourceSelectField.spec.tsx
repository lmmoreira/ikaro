// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceSelectField } from './ResourceSelectField';

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

describe('ResourceSelectField', () => {
  it('renders the tenant\'s active non-LOCATION resources plus the "Todo o negócio" default', () => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithIntl(<ResourceSelectField value={null} onValueChange={vi.fn()} />);

    const select = screen.getByTestId('resource-select-field');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Todo o negócio', 'Camila Duarte', 'Estúdio 1']);
  });

  it('defaults to "Todo o negócio" when value is null', () => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithIntl(<ResourceSelectField value={null} onValueChange={vi.fn()} />);

    expect(screen.getByTestId('resource-select-field')).toHaveValue('');
  });

  it('selects the matching option when value is set', () => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithIntl(<ResourceSelectField value="staff-1" onValueChange={vi.fn()} />);

    expect(screen.getByTestId('resource-select-field')).toHaveValue('staff-1');
  });

  it('calls onValueChange with the resource id when a resource is picked', async () => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });
    const onValueChange = vi.fn();
    renderWithIntl(<ResourceSelectField value={null} onValueChange={onValueChange} />);

    await userEvent.selectOptions(screen.getByTestId('resource-select-field'), 'staff-1');
    expect(onValueChange).toHaveBeenCalledWith('staff-1');
  });

  it('calls onValueChange with null when "Todo o negócio" is picked', async () => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });
    const onValueChange = vi.fn();
    renderWithIntl(<ResourceSelectField value="staff-1" onValueChange={onValueChange} />);

    await userEvent.selectOptions(screen.getByTestId('resource-select-field'), '');
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it('disables the field and shows a loading placeholder while resources are still loading', () => {
    useResourcesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderWithIntl(<ResourceSelectField value={null} onValueChange={vi.fn()} />);

    const select = screen.getByTestId('resource-select-field');
    expect(select).toBeDisabled();
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Carregando...']);
  });

  it('disables the field and shows a translated error, not raw backend text, on fetch failure', () => {
    useResourcesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });
    renderWithIntl(<ResourceSelectField value={null} onValueChange={vi.fn()} />);

    expect(screen.getByTestId('resource-select-field')).toBeDisabled();
    expect(screen.getByTestId('resource-select-field-error')).toBeInTheDocument();
    expect(screen.queryByText('network down')).not.toBeInTheDocument();
  });
});
