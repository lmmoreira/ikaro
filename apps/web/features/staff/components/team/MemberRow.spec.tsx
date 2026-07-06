// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { MemberRow } from './MemberRow';

const mockInviteStaff = vi.fn();
const mockActivateStaff = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useInviteStaff: () => ({
    mutateAsync: mockInviteStaff,
    isPending: false,
  }),
  useActivateStaff: () => ({
    mutateAsync: mockActivateStaff,
    isPending: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

function buildMember(overrides?: Partial<StaffListItem>): StaffListItem {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    email: 'ana@lavacar.com.br',
    name: 'Ana Pereira',
    role: 'MANAGER',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('MemberRow', () => {
  beforeEach(() => {
    mockInviteStaff.mockReset();
    mockActivateStaff.mockReset();
    mockRouterRefresh.mockReset();
  });

  it('renders initials, name, email, role and status badges', () => {
    renderWithIntl(<MemberRow member={buildMember()} isCurrentUser={false} />);

    expect(screen.getByText('AP')).toBeInTheDocument();
    expect(screen.getByText('Ana Pereira')).toBeInTheDocument();
    expect(screen.getByText('ana@lavacar.com.br')).toBeInTheDocument();
    expect(screen.getByText('Gerente')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows a Desativar action linking to the deactivate route for active members', () => {
    const member = buildMember();
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    const action = screen.getByRole('link', { name: 'Desativar' });
    expect(action).toHaveAttribute('href', `/dashboard/team/${member.id}/deactivate`);
  });

  it('never shows Desativar or Reenviar convite on the current user own row', () => {
    renderWithIntl(<MemberRow member={buildMember()} isCurrentUser />);

    expect(screen.queryByRole('link', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('resend-invite-button')).not.toBeInTheDocument();
  });

  it('shows a Reenviar convite button (not a link) instead of Desativar for a pending member', () => {
    const member = buildMember({
      isActive: true,
      status: 'PENDING',
      role: 'STAFF',
      name: 'Novo Membro',
      email: 'novo@lavacar.com.br',
    });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    expect(screen.getByText('Convite pendente')).toBeInTheDocument();
    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(screen.getByTestId('resend-invite-button')).toHaveTextContent('Reenviar convite');
  });

  it('resends the invite directly with the row existing name/role/email, no navigation', async () => {
    const user = userEvent.setup();
    mockInviteStaff.mockResolvedValue({
      staffId: '1',
      email: 'novo@lavacar.com.br',
      role: 'STAFF',
      isActive: true,
    });
    const member = buildMember({
      status: 'PENDING',
      role: 'STAFF',
      name: 'Novo Membro',
      email: 'novo@lavacar.com.br',
    });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    await user.click(screen.getByTestId('resend-invite-button'));

    expect(mockInviteStaff).toHaveBeenCalledWith({
      email: 'novo@lavacar.com.br',
      firstName: 'Novo',
      lastName: 'Membro',
      role: 'STAFF',
    });
    expect(await screen.findByTestId('resend-invite-success')).toHaveTextContent(
      'Convite reenviado!',
    );
  });

  it('shows an inline error when the resend fails', async () => {
    const user = userEvent.setup();
    mockInviteStaff.mockRejectedValue(new Error('network down'));
    const member = buildMember({ status: 'PENDING', role: 'STAFF', name: 'Novo Membro' });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    await user.click(screen.getByTestId('resend-invite-button'));

    expect(await screen.findByTestId('resend-invite-error')).toHaveTextContent(
      'Não foi possível reenviar. Tente novamente.',
    );
  });

  it('falls back to the email local part as first/last name when member has no name', async () => {
    const user = userEvent.setup();
    mockInviteStaff.mockResolvedValue({
      staffId: '1',
      email: 'semnome@lavacar.com.br',
      role: 'STAFF',
      isActive: true,
    });
    const member = buildMember({
      status: 'PENDING',
      role: 'STAFF',
      name: null,
      email: 'semnome@lavacar.com.br',
    });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    await user.click(screen.getByTestId('resend-invite-button'));

    expect(mockInviteStaff).toHaveBeenCalledWith({
      email: 'semnome@lavacar.com.br',
      firstName: 'semnome',
      lastName: 'semnome',
      role: 'STAFF',
    });
  });

  it('shows an Ativar button (not a link) instead of Desativar for a deactivated member', () => {
    const member = buildMember({ isActive: false, status: 'DEACTIVATED' });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    expect(screen.getByText('Inativo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('resend-invite-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('activate-member-button')).toHaveTextContent('Ativar');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('activates the member directly, no navigation', async () => {
    const user = userEvent.setup();
    mockActivateStaff.mockResolvedValue({
      staffId: '30000000-0000-4000-8000-000000000001',
      isActive: true,
    });
    const member = buildMember({ isActive: false, status: 'DEACTIVATED' });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    await user.click(screen.getByTestId('activate-member-button'));

    expect(mockActivateStaff).toHaveBeenCalledWith(member.id);
    expect(await screen.findByTestId('activate-member-success')).toHaveTextContent(
      'Membro ativado!',
    );
    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it('does not refresh the route when activation fails', async () => {
    const user = userEvent.setup();
    mockActivateStaff.mockRejectedValue(new Error('network down'));
    const member = buildMember({ isActive: false, status: 'DEACTIVATED' });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    await user.click(screen.getByTestId('activate-member-button'));

    await screen.findByTestId('activate-member-error');
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it('shows an inline error when activation fails', async () => {
    const user = userEvent.setup();
    mockActivateStaff.mockRejectedValue(new Error('network down'));
    const member = buildMember({ isActive: false, status: 'DEACTIVATED' });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    await user.click(screen.getByTestId('activate-member-button'));

    expect(await screen.findByTestId('activate-member-error')).toHaveTextContent(
      'Não foi possível ativar. Tente novamente.',
    );
  });

  it('links the whole row to the staff detail page', () => {
    const member = buildMember();
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    const detailLink = screen.getByRole('link', { name: 'Ver detalhes de Ana Pereira' });
    expect(detailLink).toHaveAttribute('href', `/dashboard/team/${member.id}`);
  });

  it('falls back to the email in the name/avatar display when the member has no name', () => {
    renderWithIntl(
      <MemberRow
        member={buildMember({ name: null, status: 'DEACTIVATED', isActive: false })}
        isCurrentUser={false}
      />,
    );

    expect(screen.getAllByText('ana@lavacar.com.br').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
