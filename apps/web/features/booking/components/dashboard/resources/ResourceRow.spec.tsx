// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { ResourceRow } from './ResourceRow';

const reactivateMutateAsync = vi.fn();

vi.mock('@/features/booking/hooks/useResources', () => ({
  useReactivateResource: () => ({ mutateAsync: reactivateMutateAsync, isPending: false }),
}));

const ACTIVE_ROOM: ResourceResponse = {
  id: 'room-1',
  type: 'ROOM',
  refId: null,
  name: 'Estúdio 1',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: 12,
  isActive: true,
};

const INACTIVE_ROOM: ResourceResponse = { ...ACTIVE_ROOM, isActive: false };

describe('ResourceRow', () => {
  it("links the whole row to the resource's edit screen", () => {
    renderWithIntl(<ResourceRow resource={ACTIVE_ROOM} />);

    expect(screen.getByTestId('resource-row-edit-link')).toHaveAttribute(
      'href',
      '/dashboard/resources/room-1',
    );
  });

  it('shows a Desativar link for an active, non-LOCATION resource', () => {
    renderWithIntl(<ResourceRow resource={ACTIVE_ROOM} />);

    expect(screen.getByTestId('resource-row-deactivate-link')).toHaveAttribute(
      'href',
      '/dashboard/resources/room-1/deactivate',
    );
  });

  it('reactivates inline on click — no navigation, no confirmation screen', async () => {
    const user = userEvent.setup();
    reactivateMutateAsync.mockResolvedValue({ id: 'room-1', isActive: true });
    renderWithIntl(<ResourceRow resource={INACTIVE_ROOM} />);

    expect(screen.queryByTestId('resource-row-deactivate-link')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('resource-row-reactivate-button'));

    expect(reactivateMutateAsync).toHaveBeenCalledWith('room-1');
    // The refetch flips the badge and unmounts this action; no success text of its own.
    expect(screen.queryByTestId('resource-row-reactivate-success')).not.toBeInTheDocument();
    expect(screen.queryByText('Recurso reativado!')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the backend-resolved message inline if reactivation fails', async () => {
    const user = userEvent.setup();
    reactivateMutateAsync.mockRejectedValue(
      new ApiError(422, 'invalid', { code: 'BOOKING_RESOURCE_NO_WORKING_HOURS' }),
    );
    renderWithIntl(<ResourceRow resource={INACTIVE_ROOM} />);

    await user.click(screen.getByTestId('resource-row-reactivate-button'));

    const error = await screen.findByTestId('resource-row-reactivate-error');
    expect(error).toHaveTextContent(
      'Este recurso não tem horário de funcionamento e o negócio também não tem horário padrão.',
    );
    expect(error).toHaveAttribute('role', 'alert');
  });
});
