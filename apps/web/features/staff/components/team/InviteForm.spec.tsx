// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { InviteForm } from './InviteForm';

const routerPush = vi.fn();
const mockInviteStaff = vi.fn();
const mockSetStaffRoleStatus = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useInviteStaff: () => ({
    mutateAsync: mockInviteStaff,
    isPending: false,
  }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setStaffRoleStatus: mockSetStaffRoleStatus,
  }),
}));

describe('InviteForm', () => {
  function getPrimarySubmitButton() {
    return screen.getByTestId('invite-submit-desktop');
  }

  function getRoleOption(role: 'STAFF' | 'MANAGER') {
    const found = screen
      .getAllByTestId('role-option')
      .find((el) => el.getAttribute('data-role') === role);
    if (!found) throw new Error(`role-option with data-role="${role}" not found`);
    return found;
  }

  beforeEach(() => {
    routerPush.mockReset();
    mockInviteStaff.mockReset();
    mockSetStaffRoleStatus.mockReset();
  });

  it('renders all 4 fields with the role selector defaulting to Equipe', () => {
    renderWithIntl(<InviteForm />);

    expect(screen.getByLabelText('Nome *')).toHaveValue('');
    expect(screen.getByLabelText('Sobrenome *')).toHaveValue('');
    expect(screen.getByLabelText('E-mail *')).toHaveValue('');
    expect(getRoleOption('STAFF')).toHaveAttribute('aria-pressed', 'true');
    expect(getRoleOption('MANAGER')).toHaveAttribute('aria-pressed', 'false');
    expect(mockSetStaffRoleStatus).toHaveBeenCalledWith('STAFF');
  });

  it('keeps the topbar role status in sync with the selected role', async () => {
    const user = userEvent.setup();
    renderWithIntl(<InviteForm />);

    await user.click(getRoleOption('MANAGER'));

    expect(mockSetStaffRoleStatus).toHaveBeenLastCalledWith('MANAGER');
    expect(getRoleOption('MANAGER')).toHaveAttribute('aria-pressed', 'true');
    expect(getRoleOption('STAFF')).toHaveAttribute('aria-pressed', 'false');
  });

  it('validates required fields inline', async () => {
    const user = userEvent.setup();
    renderWithIntl(<InviteForm />);

    await user.click(getPrimarySubmitButton());

    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe o sobrenome.')).toBeInTheDocument();
    expect(screen.getByText('E-mail inválido.')).toBeInTheDocument();
    expect(mockInviteStaff).not.toHaveBeenCalled();
  });

  it('submits the invite and redirects to the team list with the invited email', async () => {
    const user = userEvent.setup();
    mockInviteStaff.mockResolvedValue({ staffId: 'staff-1' });

    renderWithIntl(<InviteForm />);

    await user.type(screen.getByLabelText('Nome *'), 'Maria');
    await user.type(screen.getByLabelText('Sobrenome *'), 'Oliveira');
    await user.type(screen.getByLabelText('E-mail *'), 'maria.oliveira@gmail.com');
    await user.click(getRoleOption('MANAGER'));
    await user.click(getPrimarySubmitButton());

    expect(mockInviteStaff).toHaveBeenCalledWith({
      firstName: 'Maria',
      lastName: 'Oliveira',
      email: 'maria.oliveira@gmail.com',
      role: 'MANAGER',
    });
    expect(routerPush).toHaveBeenCalledWith('/dashboard/team?invited=maria.oliveira%40gmail.com');
  });

  it('shows the duplicate-email error inline and preserves the other fields', async () => {
    const user = userEvent.setup();
    mockInviteStaff.mockRejectedValue(new ApiError(409, 'Conflict', {}));

    renderWithIntl(<InviteForm />);

    await user.type(screen.getByLabelText('Nome *'), 'Maria');
    await user.type(screen.getByLabelText('Sobrenome *'), 'Oliveira');
    await user.type(screen.getByLabelText('E-mail *'), 'joao.silva@gmail.com');
    await user.click(getPrimarySubmitButton());

    expect(
      await screen.findByText('Este e-mail já está cadastrado na sua equipe.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nome *')).toHaveValue('Maria');
    expect(screen.getByLabelText('Sobrenome *')).toHaveValue('Oliveira');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('shows a generic error for non-409 failures', async () => {
    const user = userEvent.setup();
    mockInviteStaff.mockRejectedValue(new Error('network down'));

    renderWithIntl(<InviteForm />);

    await user.type(screen.getByLabelText('Nome *'), 'Maria');
    await user.type(screen.getByLabelText('Sobrenome *'), 'Oliveira');
    await user.type(screen.getByLabelText('E-mail *'), 'maria.oliveira@gmail.com');
    await user.click(getPrimarySubmitButton());

    expect(
      await screen.findByText('Não foi possível enviar o convite. Tente novamente.'),
    ).toBeInTheDocument();
  });

  it('links Cancelar to the team list on both desktop and mobile action bars', () => {
    renderWithIntl(<InviteForm />);

    const cancelLinks = screen.getAllByRole('link', { name: 'Cancelar' });
    expect(cancelLinks).toHaveLength(2);
    for (const link of cancelLinks) {
      expect(link).toHaveAttribute('href', '/dashboard/team');
    }
  });
});
