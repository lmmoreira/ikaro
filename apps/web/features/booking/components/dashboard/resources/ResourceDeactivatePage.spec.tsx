// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceDeactivatePage } from './ResourceDeactivatePage';

const useResourceMock = vi.fn();
const routerReplace = vi.fn();

const ACTIVE_RESOURCE: ResourceResponse = {
  id: 'r-1',
  type: 'ROOM',
  refId: null,
  name: 'Estúdio 1',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: 12,
  isActive: true,
};

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResource: (id: string) => useResourceMock(id),
  useDeactivateResource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: routerReplace }),
}));

describe('ResourceDeactivatePage', () => {
  it('shows the deactivate confirmation for an active resource', () => {
    useResourceMock.mockReturnValue({ data: ACTIVE_RESOURCE, isLoading: false });
    renderWithIntl(<ResourceDeactivatePage resourceId="r-1" />);

    expect(screen.getByText('Desativar recurso?')).toBeInTheDocument();
  });

  it('redirects away instead of rendering anything for an already-inactive resource — reactivation has no dedicated screen', async () => {
    useResourceMock.mockReturnValue({
      data: { ...ACTIVE_RESOURCE, isActive: false },
      isLoading: false,
    });
    renderWithIntl(<ResourceDeactivatePage resourceId="r-1" />);

    expect(screen.queryByText('Desativar recurso?')).not.toBeInTheDocument();
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/dashboard/resources'));
  });

  it('shows a distinct error state on fetch failure instead of an infinite spinner', () => {
    useResourceMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });
    renderWithIntl(<ResourceDeactivatePage resourceId="r-1" />);

    expect(screen.getByTestId('resource-deactivate-load-error')).toBeInTheDocument();
  });
});
