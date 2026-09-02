// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceReactivateConfirm } from './ResourceReactivateConfirm';

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
  isActive: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, back: routerBack }),
}));

vi.mock('@/features/booking/hooks/useResources', () => ({
  useReactivateResource: () => ({ mutateAsync, isPending: false }),
}));

beforeEach(() => vi.clearAllMocks());

describe('ResourceReactivateConfirm', () => {
  it('reactivates the resource and redirects on confirm', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ ...RESOURCE, isActive: true });
    renderWithIntl(<ResourceReactivateConfirm resource={RESOURCE} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar reativação' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('r-1'));
    expect(routerPush).toHaveBeenCalledWith('/dashboard/resources');
  });

  it('shows an inline error on failure', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('network down'));
    renderWithIntl(<ResourceReactivateConfirm resource={RESOURCE} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar reativação' }));

    expect(await screen.findByTestId('resource-reactivate-error')).toBeInTheDocument();
  });
});
