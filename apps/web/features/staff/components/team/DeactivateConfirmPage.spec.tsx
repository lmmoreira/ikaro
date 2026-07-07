// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffResponse } from '@ikaro/types';
import { ApiError, ForbiddenError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { DeactivateConfirmPage } from './DeactivateConfirmPage';

const routerPush = vi.fn();
const routerBack = vi.fn();
const mockDeactivateStaff = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, back: routerBack }),
}));

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useDeactivateStaff: () => ({
    mutateAsync: mockDeactivateStaff,
    isPending: false,
  }),
}));

const STAFF: StaffResponse = {
  id: '30000000-0000-4000-8000-000000000002',
  email: 'rafael.costa@gmail.com',
  name: 'Rafael Costa',
  role: 'MANAGER',
  isActive: true,
  createdAt: '2026-01-02T00:00:00.000Z',
};

describe('DeactivateConfirmPage', () => {
  beforeEach(() => {
    routerPush.mockReset();
    routerBack.mockReset();
    mockDeactivateStaff.mockReset();
  });

  it('renders the member summary card and warning bullets', () => {
    renderWithIntl(<DeactivateConfirmPage staff={STAFF} />);

    expect(screen.getByText('Rafael Costa')).toBeInTheDocument();
    expect(screen.getByText('rafael.costa@gmail.com · Gerente')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Perde o acesso ao painel imediatamente (sessões já abertas expiram no próximo uso)',
      ),
    ).toBeInTheDocument();
  });

  it('deactivates and redirects to the team list on success', async () => {
    mockDeactivateStaff.mockResolvedValue({ staffId: STAFF.id, isActive: false });
    renderWithIntl(<DeactivateConfirmPage staff={STAFF} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    expect(mockDeactivateStaff).toHaveBeenCalledWith(STAFF.id);
    expect(routerPush).toHaveBeenCalledWith('/dashboard/team');
  });

  it('shows the self-deactivation error screen on 403', async () => {
    mockDeactivateStaff.mockRejectedValue(new ForbiddenError('Cannot deactivate self'));
    renderWithIntl(<DeactivateConfirmPage staff={STAFF} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    expect(
      await screen.findByText('Você não pode desativar sua própria conta.'),
    ).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('shows the last-active-manager error screen on 409', async () => {
    mockDeactivateStaff.mockRejectedValue(new ApiError(409, 'Last active manager'));
    renderWithIntl(<DeactivateConfirmPage staff={STAFF} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    expect(
      await screen.findByText('O estabelecimento precisa de pelo menos um gerente ativo.'),
    ).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('shows a generic inline error on an unexpected failure and keeps the form visible', async () => {
    mockDeactivateStaff.mockRejectedValue(new Error('network error'));
    renderWithIntl(<DeactivateConfirmPage staff={STAFF} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Confirmar desativação' })[0]);

    expect(
      await screen.findByText('Não foi possível desativar. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rafael Costa')).toBeInTheDocument();
  });

  it('cancels back to the previous page without calling the API', async () => {
    renderWithIntl(<DeactivateConfirmPage staff={STAFF} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);

    expect(routerBack).toHaveBeenCalledOnce();
    expect(mockDeactivateStaff).not.toHaveBeenCalled();
  });
});
