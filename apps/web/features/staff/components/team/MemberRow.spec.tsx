// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { MemberRow } from './MemberRow';

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

  it('never shows Desativar on the current user own row', () => {
    renderWithIntl(<MemberRow member={buildMember()} isCurrentUser />);

    expect(screen.queryByRole('link', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reenviar convite' })).not.toBeInTheDocument();
  });

  it('shows Reenviar convite instead of Desativar for a pending member', () => {
    const member = buildMember({
      isActive: false,
      status: 'PENDING',
      role: 'STAFF',
      name: null,
      email: 'novo@lavacar.com.br',
    });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    expect(screen.getByText('Convite pendente')).toBeInTheDocument();
    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Desativar' })).not.toBeInTheDocument();
    const resend = screen.getByRole('link', { name: 'Reenviar convite' });
    expect(resend).toHaveAttribute('href', '/dashboard/team/invite?email=novo%40lavacar.com.br');
  });

  it('shows no action link for a deactivated member, only the row-to-detail link', () => {
    const member = buildMember({ isActive: false, status: 'DEACTIVATED' });
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    expect(screen.getByText('Inativo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reenviar convite' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('links the whole row to the staff detail page', () => {
    const member = buildMember();
    renderWithIntl(<MemberRow member={member} isCurrentUser={false} />);

    const detailLink = screen.getByRole('link', { name: 'Ver detalhes de Ana Pereira' });
    expect(detailLink).toHaveAttribute('href', `/dashboard/team/${member.id}`);
  });

  it('falls back to the email when the member has no name', () => {
    renderWithIntl(
      <MemberRow
        member={buildMember({ name: null, status: 'PENDING', isActive: false })}
        isCurrentUser={false}
      />,
    );

    expect(screen.getAllByText('ana@lavacar.com.br').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
