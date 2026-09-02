// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceEditFormFields } from './ResourceEditFormFields';

const routerPush = vi.fn();
const mutateAsync = vi.fn();

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
  useResources: () => ({ data: { items: [] } }),
  useUpdateResource: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useStaff: () => ({
    data: {
      items: [
        {
          id: 's-1',
          email: 'camila@acme.com',
          name: 'Camila Duarte',
          role: 'STAFF',
          isActive: true,
          createdAt: '',
        },
      ],
    },
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe('ResourceEditFormFields', () => {
  it('pre-fills every field from the resource', () => {
    renderWithIntl(<ResourceEditFormFields resourceId="r-1" resource={ROOM_RESOURCE} />);

    expect(screen.getByTestId('resource-identity-name-input')).toHaveValue('Estúdio 1');
  });

  it('hides the type picker for a LOCATION resource and still allows editing its name', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(LOCATION_RESOURCE);
    renderWithIntl(<ResourceEditFormFields resourceId="loc-1" resource={LOCATION_RESOURCE} />);

    expect(screen.queryByTestId('resource-identity-type-option')).not.toBeInTheDocument();

    const nameInput = screen.getByTestId('resource-identity-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Unidade Renomeada');
    await user.click(screen.getByTestId('resource-edit-save-desktop'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'loc-1',
          body: expect.objectContaining({ name: 'Unidade Renomeada' }),
        }),
      ),
    );
    // A LOCATION update never sends `type`/`refId` — its type can never change.
    const call = mutateAsync.mock.calls[0]?.[0];
    expect(call.body).not.toHaveProperty('type');
    expect(call.body).not.toHaveProperty('refId');
  });

  it('submits updated fields and redirects to the list', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(ROOM_RESOURCE);
    renderWithIntl(<ResourceEditFormFields resourceId="r-1" resource={ROOM_RESOURCE} />);

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
    expect(routerPush).toHaveBeenCalledWith('/dashboard/resources');
  });

  it('discards the existing maxCapacity when switching type from ROOM to STAFF', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(ROOM_RESOURCE);
    renderWithIntl(<ResourceEditFormFields resourceId="r-1" resource={ROOM_RESOURCE} />);

    expect(screen.getByTestId('resource-max-capacity-input')).toHaveValue(12);

    const found = screen
      .getAllByTestId('resource-identity-type-option')
      .find((el) => el.getAttribute('data-type') === 'STAFF');
    await user.click(found!);
    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-edit-save-desktop'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'r-1',
          body: expect.objectContaining({ type: 'STAFF', maxCapacity: null }),
        }),
      ),
    );
  });
});
