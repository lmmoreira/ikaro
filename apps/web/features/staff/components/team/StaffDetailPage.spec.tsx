// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { StaffDetailPage } from './StaffDetailPage';

const routerPush = vi.fn();
const mockUpdateStaff = vi.fn();
const mockSetStaffRoleStatus = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useUpdateStaff: () => ({
    mutateAsync: mockUpdateStaff,
    isPending: false,
  }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setStaffRoleStatus: mockSetStaffRoleStatus,
  }),
}));

const STAFF: StaffResponse = {
  id: '30000000-0000-4000-8000-000000000002',
  email: 'bruno@lavacar.com.br',
  name: 'Bruno Costa',
  role: 'STAFF',
  isActive: true,
  createdAt: '2026-01-02T00:00:00.000Z',
};

describe('StaffDetailPage', () => {
  function getRoleOption(role: 'STAFF' | 'MANAGER') {
    const found = screen
      .getAllByTestId('role-option')
      .find((el) => el.getAttribute('data-role') === role);
    if (!found) throw new Error(`role-option with data-role="${role}" not found`);
    return found;
  }

  function getPrimarySaveButton() {
    return screen.getByTestId('staff-detail-save-desktop');
  }

  beforeEach(() => {
    routerPush.mockReset();
    mockUpdateStaff.mockReset();
    mockSetStaffRoleStatus.mockReset();
  });

  it('renders the current name, read-only email, and role selection', () => {
    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    expect(screen.getByTestId('staff-detail-name-input')).toHaveValue('Bruno Costa');
    expect(screen.getByTestId('staff-detail-email-input')).toHaveValue('bruno@lavacar.com.br');
    expect(screen.getByTestId('staff-detail-email-input')).toBeDisabled();
    expect(getRoleOption('STAFF')).toHaveAttribute('aria-pressed', 'true');
    expect(getRoleOption('MANAGER')).toHaveAttribute('aria-pressed', 'false');
    expect(mockSetStaffRoleStatus).toHaveBeenCalledWith('STAFF');
  });

  it('keeps the topbar role status in sync with the selected role', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.click(getRoleOption('MANAGER'));

    expect(mockSetStaffRoleStatus).toHaveBeenLastCalledWith('MANAGER');
    expect(getRoleOption('MANAGER')).toHaveAttribute('aria-pressed', 'true');
  });

  it('validates that name cannot be empty', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.clear(screen.getByTestId('staff-detail-name-input'));
    await user.click(getPrimarySaveButton());

    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByTestId('staff-detail-name-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('staff-detail-name-input')).toHaveFocus();
    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
    expect(mockUpdateStaff).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('submits the update and redirects to the team list', async () => {
    const user = userEvent.setup();
    mockUpdateStaff.mockResolvedValue({
      staffId: STAFF.id,
      name: 'Bruno Editado',
      role: 'MANAGER',
    });

    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.clear(screen.getByTestId('staff-detail-name-input'));
    await user.type(screen.getByTestId('staff-detail-name-input'), 'Bruno Editado');
    await user.click(getRoleOption('MANAGER'));
    await user.click(getPrimarySaveButton());

    expect(mockUpdateStaff).toHaveBeenCalledWith({
      id: STAFF.id,
      body: { name: 'Bruno Editado', role: 'MANAGER' },
    });
    expect(routerPush).toHaveBeenCalledWith('/dashboard/team');
  });

  it('shows the last-active-manager error inline based on the response code', async () => {
    const user = userEvent.setup();
    mockUpdateStaff.mockRejectedValue(
      new ApiError(409, 'Conflict', { code: 'STAFF_LAST_ACTIVE_MANAGER' }),
    );

    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.click(getRoleOption('MANAGER'));
    await user.click(getPrimarySaveButton());

    const feedback = await within(screen.getByTestId('action-pane-desktop')).findByTestId(
      'form-feedback',
    );
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(feedback).toHaveTextContent('Não é possível remover o último gerente ativo.');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('shows a generic fallback error for a failure with no recognizable code', async () => {
    const user = userEvent.setup();
    mockUpdateStaff.mockRejectedValue(new Error('network down'));

    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.click(getPrimarySaveButton());

    const feedback = await within(screen.getByTestId('action-pane-desktop')).findByTestId(
      'form-feedback',
    );
    expect(feedback).toHaveTextContent('Algo deu errado. Tente novamente.');
    expect(screen.getByTestId('staff-detail-name-input')).not.toHaveAttribute('aria-invalid');
  });

  it('marks and focuses the name input when the server reports the name field', async () => {
    const user = userEvent.setup();
    mockUpdateStaff.mockRejectedValue(
      new ApiError(422, 'Unprocessable', { code: 'STAFF_NAME_REQUIRED', field: 'name' }),
    );

    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.click(getPrimarySaveButton());

    await within(screen.getByTestId('action-pane-desktop')).findByTestId('form-feedback');
    expect(screen.getByTestId('staff-detail-name-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('staff-detail-name-input')).toHaveFocus();
  });

  it('removes the form-level message as soon as the form is edited', async () => {
    const user = userEvent.setup();
    mockUpdateStaff.mockRejectedValue(new Error('network down'));

    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    await user.click(getPrimarySaveButton());
    await within(screen.getByTestId('action-pane-desktop')).findByTestId('form-feedback');
    await user.click(getRoleOption('MANAGER'));

    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
  });

  it('links Cancelar to the team list on both desktop and mobile action bars', () => {
    renderWithIntl(<StaffDetailPage staff={STAFF} />);

    const cancelLinks = screen.getAllByRole('link', { name: 'Cancelar' });
    expect(cancelLinks).toHaveLength(2);
    for (const link of cancelLinks) {
      expect(link).toHaveAttribute('href', '/dashboard/team');
    }
  });
});
