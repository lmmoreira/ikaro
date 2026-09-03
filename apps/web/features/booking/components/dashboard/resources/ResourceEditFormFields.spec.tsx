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

const STAFF_RESOURCE: ResourceResponse = {
  id: 'staff-res-1',
  type: 'STAFF',
  refId: 's-1',
  name: 'Camila (Manhãs)',
  workingHours: null,
  turnoverMinutes: 15,
  maxCapacity: null,
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
  useUpdateResource: () => ({ mutateAsync, isPending: false }),
  useResourceStaffOptions: () => ({
    data: {
      items: [
        {
          id: 's-1',
          email: 'camila@acme.com',
          name: 'Camila Duarte',
          isActive: true,
          isWrapped: false,
        },
      ],
    },
  }),
}));

vi.mock('@/features/platform/hooks/useTenantSettings', () => ({
  useTenantSettings: () => ({
    data: {
      settings: {
        businessHours: {
          timezone: 'America/Sao_Paulo',
          monday: { open: '09:00', close: '18:00' },
          tuesday: { open: '09:00', close: '18:00' },
          wednesday: { open: '09:00', close: '18:00' },
          thursday: { open: '09:00', close: '18:00' },
          friday: { open: '09:00', close: '18:00' },
          saturday: null,
          sunday: null,
        },
      },
    },
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe('ResourceEditFormFields', () => {
  it('pre-fills every field from the resource', () => {
    renderWithIntl(<ResourceEditFormFields resourceId="r-1" resource={ROOM_RESOURCE} />);

    expect(screen.getByTestId('resource-identity-name-input')).toHaveValue('Estúdio 1');
  });

  it('shows the turnover and max-capacity explanatory hints, matching the create form', () => {
    renderWithIntl(<ResourceEditFormFields resourceId="r-1" resource={ROOM_RESOURCE} />);

    expect(
      screen.getByText(
        'Tempo mínimo antes da próxima reserva neste recurso, qualquer serviço — combina com o buffer do serviço, vale o maior dos dois.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Opcional para recursos sem lotação. Quando informada, nenhuma turma pode ultrapassar este limite.',
      ),
    ).toBeInTheDocument();
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

  it('locks the working-hours editor for a LOCATION resource and always sends workingHours: null (backend rejects a custom LOCATION schedule)', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(LOCATION_RESOURCE);
    renderWithIntl(<ResourceEditFormFields resourceId="loc-1" resource={LOCATION_RESOURCE} />);

    expect(screen.getByTestId('resource-hours-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-hours-inherit-toggle')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('resource-edit-save-desktop'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'loc-1',
          body: expect.objectContaining({ workingHours: null }),
        }),
      ),
    );
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

  it("preserves a STAFF resource's own custom name when editing an unrelated field (Resource.name is independent of Staff.name)", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(STAFF_RESOURCE);
    renderWithIntl(<ResourceEditFormFields resourceId="staff-res-1" resource={STAFF_RESOURCE} />);

    expect(screen.getByTestId('resource-identity-name-input')).toHaveValue('Camila (Manhãs)');

    const turnoverInput = screen.getByDisplayValue('15');
    await user.clear(turnoverInput);
    await user.type(turnoverInput, '20');
    await user.click(screen.getByTestId('resource-edit-save-desktop'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'staff-res-1',
          body: expect.objectContaining({ name: 'Camila (Manhãs)', turnoverMinutes: 20 }),
        }),
      ),
    );
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
