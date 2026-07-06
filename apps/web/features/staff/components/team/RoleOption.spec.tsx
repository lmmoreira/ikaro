// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleOption } from './RoleOption';

describe('RoleOption', () => {
  it('renders the title and description', () => {
    render(
      <RoleOption
        staffRole="STAFF"
        selected={false}
        title="Equipe"
        description="Gerencia agenda, horários e serviços"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Gerencia agenda, horários e serviços')).toBeInTheDocument();
  });

  it('reflects selected state via aria-pressed', () => {
    render(
      <RoleOption
        staffRole="MANAGER"
        selected
        title="Gerente"
        description="Tudo da Equipe + configurações"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('role-option')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('role-option')).toHaveAttribute('data-role', 'MANAGER');
  });

  it('calls onSelect with its own staffRole when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <RoleOption
        staffRole="MANAGER"
        selected={false}
        title="Gerente"
        description="Tudo da Equipe + configurações"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByTestId('role-option'));

    expect(onSelect).toHaveBeenCalledWith('MANAGER');
  });
});
