// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RoleSelectorField } from './RoleSelectorField';

function getRoleOption(role: 'STAFF' | 'MANAGER') {
  const found = screen
    .getAllByTestId('role-option')
    .find((el) => el.getAttribute('data-role') === role);
  if (!found) throw new Error(`role-option with data-role="${role}" not found`);
  return found;
}

describe('RoleSelectorField', () => {
  it('renders both STAFF and MANAGER options with the shared copy', () => {
    renderWithIntl(<RoleSelectorField staffRole="STAFF" onSelect={vi.fn()} />);

    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Gerente')).toBeInTheDocument();
    expect(getRoleOption('STAFF')).toHaveAttribute('aria-pressed', 'true');
    expect(getRoleOption('MANAGER')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSelect with the clicked role', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithIntl(<RoleSelectorField staffRole="STAFF" onSelect={onSelect} />);

    await user.click(getRoleOption('MANAGER'));

    expect(onSelect).toHaveBeenCalledWith('MANAGER');
  });
});
