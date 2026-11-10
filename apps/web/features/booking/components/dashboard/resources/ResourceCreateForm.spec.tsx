// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
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
  useCreateResource: () => ({ mutateAsync, isPending: false }),
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

function getTypeOption(type: 'STAFF' | 'ROOM' | 'EQUIPMENT') {
  const found = screen
    .getAllByTestId('resource-identity-type-option')
    .find((el) => el.getAttribute('data-type') === type);
  if (!found) throw new Error(`resource-identity-type-option with data-type="${type}" not found`);
  return found;
}

const seenWorkingHoursOnChange = vi.hoisted(() => [] as unknown[]);

// Passes straight through to the real editor; it only records the onChange each render hands it.
vi.mock('./ResourceWorkingHoursEditor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ResourceWorkingHoursEditor')>();
  return {
    ...actual,
    ResourceWorkingHoursEditor: (
      props: React.ComponentProps<typeof actual.ResourceWorkingHoursEditor>,
    ) => {
      seenWorkingHoursOnChange.push(props.onChange);
      return <actual.ResourceWorkingHoursEditor {...props} />;
    },
  };
});

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrollIntoView; the hook calls it before focusing the first invalid field.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});

describe('ResourceCreateForm', () => {
  it('hands the working-hours editor an onChange that keeps its identity across re-renders', async () => {
    const user = userEvent.setup();
    seenWorkingHoursOnChange.length = 0;
    renderWithIntl(<ResourceCreateForm />);

    await user.type(screen.getByTestId('resource-identity-name-input'), 'x');

    expect(seenWorkingHoursOnChange.length).toBeGreaterThan(1);
    expect(new Set(seenWorkingHoursOnChange).size).toBe(1);
  });

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

  it('lets a custom denormalized name override the seeded staff name (Resource.name is independent of Staff.name)', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ id: 'r-1' });
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    const nameInput = screen.getByTestId('resource-identity-name-input');
    expect(nameInput).toHaveValue('Camila Duarte');
    await user.clear(nameInput);
    await user.type(nameInput, 'Camila (Manhãs)');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STAFF', refId: 's-1', name: 'Camila (Manhãs)' }),
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

    const feedback = await screen.findByTestId('form-feedback');
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(feedback).toHaveTextContent('Este profissional já está vinculado a outro recurso.');
    expect(screen.queryByTestId('resource-create-submit-error')).not.toBeInTheDocument();
  });

  it('renders the server error in the action pane, under the buttons', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(409, 'Conflict', { code: 'BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED' }),
    );
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    const pane = screen.getByTestId('action-pane-desktop');
    expect(await within(pane).findByTestId('form-feedback')).toBeInTheDocument();
  });

  it('marks and focuses the staff select when the server names refId as the offending field', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(409, 'Conflict', {
        code: 'BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED',
        field: 'refId',
      }),
    );
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    const select = screen.getByTestId('resource-identity-staff-select');
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'));
    expect(select).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('falls back to the form-level message when the server field is not one the form registers', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(422, 'Unprocessable Entity', {
        code: 'BOOKING_RESOURCE_NO_WORKING_HOURS',
        field: 'workingHours.monday',
      }),
    );
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(await screen.findByTestId('form-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('resource-identity-staff-select')).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(screen.getByTestId('resource-identity-name-input')).not.toHaveAttribute('aria-invalid');
  });

  it('marks and focuses the first invalid field when client validation fails', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ResourceCreateForm />);

    await user.click(screen.getByTestId('resource-create-save-desktop'));

    const select = screen.getByTestId('resource-identity-staff-select');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveFocus();
    expect(screen.getByTestId('resource-identity-name-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('clears the server error as soon as the manager edits a field', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(409, 'Conflict', { code: 'BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED' }),
    );
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));
    await screen.findByTestId('form-feedback');

    await user.type(screen.getByTestId('resource-identity-name-input'), 'x');

    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
  });

  it('surfaces a 422 no-working-hours error inline (UC-045 A2)', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(422, 'Unprocessable Entity', { code: 'BOOKING_RESOURCE_NO_WORKING_HOURS' }),
    );
    renderWithIntl(<ResourceCreateForm />);

    await user.selectOptions(screen.getByTestId('resource-identity-staff-select'), 's-1');
    await user.click(screen.getByTestId('resource-create-save-desktop'));

    expect(await screen.findByTestId('form-feedback')).toHaveTextContent(
      'Este recurso não tem horário de funcionamento e o negócio também não tem horário padrão.',
    );
  });

  it('names the turnover and capacity inputs through their labels', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ResourceCreateForm />);

    await user.click(getTypeOption('ROOM'));

    expect(screen.getByTestId('resource-max-capacity-input')).toHaveAccessibleName(/\S/);
    expect(screen.getAllByRole('spinbutton', { name: /\S/ })).toHaveLength(2);
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

  it('offers a Cancelar link back to the resources list on both the desktop and mobile action panes', () => {
    renderWithIntl(<ResourceCreateForm />);

    const cancelLinks = screen.getAllByRole('link', { name: 'Cancelar' });
    expect(cancelLinks).toHaveLength(2);
    for (const link of cancelLinks) {
      expect(link).toHaveAttribute('href', '/dashboard/resources');
    }
  });
});

describe('ResourceCreateForm units (TD51-S3)', () => {
  it('shows minutes on the turnover and spots on the capacity', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ResourceCreateForm />);

    await user.click(getTypeOption('ROOM'));

    expect(document.getElementById('resource-turnover-minutes')?.parentElement).toHaveTextContent(
      'min',
    );
    expect(screen.getByTestId('resource-max-capacity-input').parentElement).toHaveTextContent(
      'vagas',
    );
  });
});
