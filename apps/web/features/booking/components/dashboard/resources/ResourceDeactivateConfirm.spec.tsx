// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
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

  it('shows the failure in the action pane with an alert role, not in the card', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(409, 'Conflict', { code: 'BOOKING_RESOURCE_LOCATION_CANNOT_BE_DEACTIVATED' }),
    );
    renderWithIntl(<ResourceDeactivateConfirm resource={RESOURCE} />);

    await user.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    const feedback = await within(screen.getByTestId('action-pane-desktop')).findByTestId(
      'form-feedback',
    );
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('resource-deactivate-error')).not.toBeInTheDocument();
  });

  it('clears the previous failure when the confirmation is submitted again', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new ApiError(500, 'Server Error', { code: 'X' }));
    mutateAsync.mockResolvedValueOnce(undefined);
    renderWithIntl(<ResourceDeactivateConfirm resource={RESOURCE} />);

    await user.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);
    await screen.findByTestId('form-feedback');
    await user.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/dashboard/resources'));
    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
  });
});
