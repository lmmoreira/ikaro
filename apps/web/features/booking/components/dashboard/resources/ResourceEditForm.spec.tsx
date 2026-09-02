// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceEditForm } from './ResourceEditForm';

const routerPush = vi.fn();
const mutateAsync = vi.fn();
const useResourceMock = vi.fn();

const ROOM_RESOURCE: ResourceResponse = {
  id: 'r-1',
  type: 'ROOM',
  refId: null,
  name: 'Estúdio 1',
  workingHours: null,
  turnoverMinutes: 10,
  maxCapacity: 12,
  isActive: true,
};

const LOCATION_RESOURCE: ResourceResponse = {
  id: 'loc-1',
  type: 'LOCATION',
  refId: null,
  name: 'Localização Principal',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: null,
  isActive: true,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResource: (id: string) => useResourceMock(id),
  useResources: () => ({ data: { items: [] } }),
  useUpdateResource: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useStaff: () => ({ data: { items: [] } }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => null,
}));

beforeEach(() => vi.clearAllMocks());

describe('ResourceEditForm', () => {
  it('pre-fills the form with the resource current values', () => {
    useResourceMock.mockReturnValue({ data: ROOM_RESOURCE, isLoading: false });
    renderWithIntl(<ResourceEditForm resourceId="r-1" />);

    expect(screen.getByTestId('resource-identity-name-input')).toHaveValue('Estúdio 1');
  });

  it('hides the type picker for a LOCATION resource', () => {
    useResourceMock.mockReturnValue({ data: LOCATION_RESOURCE, isLoading: false });
    renderWithIntl(<ResourceEditForm resourceId="loc-1" />);

    expect(screen.queryByTestId('resource-identity-type-option')).not.toBeInTheDocument();
  });

  it('submits updated fields', async () => {
    const user = userEvent.setup();
    useResourceMock.mockReturnValue({ data: ROOM_RESOURCE, isLoading: false });
    mutateAsync.mockResolvedValue(ROOM_RESOURCE);
    renderWithIntl(<ResourceEditForm resourceId="r-1" />);

    const nameInput = screen.getByTestId('resource-identity-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Estúdio 2');
    await user.click(screen.getByTestId('resource-edit-save-desktop'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'r-1',
          body: expect.objectContaining({ name: 'Estúdio 2' }),
        }),
      ),
    );
  });

  it('shows a distinct error state on fetch failure instead of an infinite spinner', () => {
    useResourceMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });
    renderWithIntl(<ResourceEditForm resourceId="r-1" />);

    expect(screen.getByTestId('resource-edit-load-error')).toBeInTheDocument();
  });
});
