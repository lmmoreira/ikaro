// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { TeamListPage } from './TeamListPage';

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock('@/features/staff/hooks/useStaff', () => ({
  useInviteStaff: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

const CURRENT_ID = '30000000-0000-4000-8000-000000000001';

function buildMembers(): StaffListItem[] {
  return [
    {
      id: CURRENT_ID,
      email: 'ana@lavacar.com.br',
      name: 'Ana Pereira',
      role: 'MANAGER',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'ACTIVE',
    },
    {
      id: '30000000-0000-4000-8000-000000000002',
      email: 'bruno@lavacar.com.br',
      name: 'Bruno Costa',
      role: 'STAFF',
      isActive: true,
      createdAt: '2026-01-02T00:00:00.000Z',
      status: 'ACTIVE',
    },
    {
      id: '30000000-0000-4000-8000-000000000003',
      email: 'novo@lavacar.com.br',
      name: 'Novo Membro',
      role: 'STAFF',
      isActive: false,
      createdAt: '2026-01-03T00:00:00.000Z',
      status: 'PENDING',
    },
    {
      id: '30000000-0000-4000-8000-000000000004',
      email: 'antigo@lavacar.com.br',
      name: 'Antigo Membro',
      role: 'STAFF',
      isActive: false,
      createdAt: '2026-01-04T00:00:00.000Z',
      status: 'DEACTIVATED',
    },
  ];
}

describe('TeamListPage', () => {
  beforeEach(() => {
    routerReplace.mockReset();
  });

  it('renders all four filter tabs with correct counts', () => {
    renderWithIntl(
      <TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    expect(screen.getByRole('button', { name: 'Todos (4)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativos (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convites pendentes (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inativos (1)' })).toBeInTheDocument();
  });

  it('filters the list client-side when a tab is selected', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'Convites pendentes (1)' }));

    expect(screen.getByText('Novo Membro')).toBeInTheDocument();
    expect(screen.queryByText('Ana Pereira')).not.toBeInTheDocument();
    expect(screen.queryByText('Antigo Membro')).not.toBeInTheDocument();
  });

  it('shows the empty message when a filter has no members', async () => {
    const user = userEvent.setup();
    const onlyActive = buildMembers().filter((member) => member.status === 'ACTIVE');
    renderWithIntl(
      <TeamListPage members={onlyActive} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'Inativos (0)' }));

    expect(screen.getByText('Nenhum membro encontrado.')).toBeInTheDocument();
  });

  it('hides Desativar on the current admin own row but shows it for other active members', () => {
    renderWithIntl(
      <TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    const deactivateLinks = screen.getAllByRole('link', { name: 'Desativar' });
    expect(deactivateLinks).toHaveLength(1);
    expect(deactivateLinks[0]).toHaveAttribute(
      'href',
      '/dashboard/team/30000000-0000-4000-8000-000000000002/deactivate',
    );
  });

  it('links the mobile FAB to the invite route (desktop entry point lives in the topbar)', () => {
    renderWithIntl(
      <TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    const inviteLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/dashboard/team/invite');
    expect(inviteLinks).toHaveLength(1);
  });

  it('hides the invited-success banner when no invitedEmail is provided', () => {
    renderWithIntl(
      <TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    expect(screen.queryByText('Convite enviado!')).not.toBeInTheDocument();
  });

  it('shows the invited-success banner with the email when provided', () => {
    renderWithIntl(
      <TeamListPage
        members={buildMembers()}
        currentStaffId={CURRENT_ID}
        hasMore={false}
        invitedEmail="maria.oliveira@gmail.com"
      />,
    );

    expect(screen.getByTestId('team-invite-success-banner')).toBeInTheDocument();
    expect(screen.getByText('Convite enviado para maria.oliveira@gmail.com.')).toBeInTheDocument();
  });

  it('auto-dismisses the invited-success banner by redirecting back to the plain list URL', () => {
    vi.useFakeTimers();

    renderWithIntl(
      <TeamListPage
        members={buildMembers()}
        currentStaffId={CURRENT_ID}
        hasMore={false}
        invitedEmail="maria.oliveira@gmail.com"
      />,
    );

    vi.advanceTimersByTime(1800);

    expect(routerReplace).toHaveBeenCalledWith('/dashboard/team', { scroll: false });

    vi.useRealTimers();
  });

  it('shows a truncation notice when the backend page did not return the full roster', () => {
    renderWithIntl(<TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore />);

    expect(screen.getByTestId('team-list-truncated-notice')).toBeInTheDocument();
  });

  it('hides the truncation notice when the roster fits in one page', () => {
    renderWithIntl(
      <TeamListPage members={buildMembers()} currentStaffId={CURRENT_ID} hasMore={false} />,
    );

    expect(screen.queryByTestId('team-list-truncated-notice')).not.toBeInTheDocument();
  });
});
