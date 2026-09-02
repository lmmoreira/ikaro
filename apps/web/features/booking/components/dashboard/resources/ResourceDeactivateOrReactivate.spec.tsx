// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceDeactivateOrReactivate } from './ResourceDeactivateOrReactivate';

const useResourceMock = vi.fn();

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
  useReactivateResource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

describe('ResourceDeactivateOrReactivate', () => {
  it('shows the deactivate confirmation for an active resource', () => {
    useResourceMock.mockReturnValue({ data: ACTIVE_RESOURCE, isLoading: false });
    renderWithIntl(<ResourceDeactivateOrReactivate resourceId="r-1" />);

    expect(screen.getByText('Desativar recurso?')).toBeInTheDocument();
  });

  it('shows the reactivate confirmation for an inactive resource', () => {
    useResourceMock.mockReturnValue({
      data: { ...ACTIVE_RESOURCE, isActive: false },
      isLoading: false,
    });
    renderWithIntl(<ResourceDeactivateOrReactivate resourceId="r-1" />);

    expect(screen.getByText('Reativar recurso?')).toBeInTheDocument();
  });

  it('shows a distinct error state on fetch failure instead of an infinite spinner', () => {
    useResourceMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });
    renderWithIntl(<ResourceDeactivateOrReactivate resourceId="r-1" />);

    expect(screen.getByTestId('resource-deactivate-load-error')).toBeInTheDocument();
  });
});
