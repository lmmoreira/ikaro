// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import { ResourceCreateForm } from './ResourceCreateForm';

const routerPush = vi.fn();
const mutateAsync = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => ({ data: { items: [] } }),
  useCreateResource: () => ({ mutateAsync, isPending: false }),
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

function getTypeOption(type: 'STAFF' | 'ROOM' | 'EQUIPMENT') {
  const found = screen
    .getAllByTestId('resource-identity-type-option')
    .find((el) => el.getAttribute('data-type') === type);
  if (!found) throw new Error(`resource-identity-type-option with data-type="${type}" not found`);
  return found;
}

beforeEach(() => vi.clearAllMocks());

describe('ResourceCreateForm', () => {
  it('swaps the staff-picker for a name field when switching type', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ResourceCreateForm />);

    expect(screen.getByTestId('resource-identity-staff-select')).toBeInTheDocument();

    await user.click(getTypeOption('ROOM'));

    expect(screen.queryByTestId('resource-identity-staff-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-identity-name-input')).toBeInTheDocument();
  });

  it('submits a STAFF resource', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ id: 'r-1' });
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STAFF', refId: 's-1', name: 'Camila Duarte' }),
    );
  });

  it('surfaces a 409 error inline', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(409, 'Conflict', { code: 'BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED' }),
    );
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(await screen.findByTestId('resource-create-submit-error')).toHaveTextContent(
      'Este profissional já está vinculado a outro recurso.',
    );
  });

  it('discards a stale maxCapacity value when switching from ROOM back to STAFF', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ id: 'r-1' });
    renderWithIntl(<ResourceCreateForm />);

    await user.click(getTypeOption('ROOM'));
    await user.type(screen.getByTestId('resource-max-capacity-input'), '12');
    await user.click(getTypeOption('STAFF'));
    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STAFF', maxCapacity: null }),
    );
  });

  it('requires a name for ROOM/EQUIPMENT types', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ResourceCreateForm />);

    await user.click(getTypeOption('ROOM'));
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
