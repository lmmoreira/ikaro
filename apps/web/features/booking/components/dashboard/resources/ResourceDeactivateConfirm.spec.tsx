// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceDeactivateConfirm } from './ResourceDeactivateConfirm';

const routerPush = vi.fn();
const routerBack = vi.fn();
const mutateAsync = vi.fn();

const RESOURCE: ResourceResponse = {
  id: 'r-1',
  type: 'ROOM',
  refId: null,
  name: 'Estúdio 1',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: 12,
  isActive: true,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, back: routerBack }),
}));

vi.mock('@/features/booking/hooks/useResources', () => ({
  useDeactivateResource: () => ({ mutateAsync, isPending: false }),
}));

beforeEach(() => vi.clearAllMocks());

describe('ResourceDeactivateConfirm', () => {
  it('deactivates the resource and redirects on confirm', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(undefined);
    renderWithIntl(<ResourceDeactivateConfirm resource={RESOURCE} />);

    await user.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('r-1'));
    expect(routerPush).toHaveBeenCalledWith('/dashboard/resources');
  });

  it('shows an inline error on failure', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('network down'));
    renderWithIntl(<ResourceDeactivateConfirm resource={RESOURCE} />);

    await user.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    expect(await screen.findByTestId('resource-deactivate-error')).toBeInTheDocument();
  });
});
