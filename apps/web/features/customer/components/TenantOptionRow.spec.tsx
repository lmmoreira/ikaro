// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TenantOption } from '@ikaro/types';
import { TenantAvatar, TenantOptionRow } from './TenantOptionRow';

function makeTenant(overrides?: Partial<TenantOption>): TenantOption {
  return {
    id: 't-1',
    name: 'Lava Rápido BH',
    slug: 'lavacar-bh',
    loyaltyPoints: 120,
    ...overrides,
  };
}

describe('TenantAvatar', () => {
  it('renders the first letter of the name, uppercased', () => {
    render(<TenantAvatar name="lava rápido" />);
    expect(screen.getByText('L')).toBeInTheDocument();
  });
});

describe('TenantOptionRow', () => {
  it('renders as a static (non-clickable) block with the current badge when isCurrent', () => {
    render(
      <TenantOptionRow
        tenant={makeTenant()}
        isCurrent
        disabled={false}
        currentBadgeLabel="Atual"
        loyaltyPointsLabel="120 pontos"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('switch-tenant-current')).toBeInTheDocument();
    expect(screen.queryByTestId('switch-tenant-option')).not.toBeInTheDocument();
    expect(screen.getByText('Atual')).toBeInTheDocument();
    expect(screen.getByText('Lava Rápido BH')).toBeInTheDocument();
    expect(screen.getByText('120 pontos')).toBeInTheDocument();
  });

  it('renders as a clickable button without the badge when not current', () => {
    render(
      <TenantOptionRow
        tenant={makeTenant()}
        isCurrent={false}
        disabled={false}
        currentBadgeLabel="Atual"
        loyaltyPointsLabel="120 pontos"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('switch-tenant-option')).toBeInTheDocument();
    expect(screen.queryByText('Atual')).not.toBeInTheDocument();
  });

  it('calls onSelect when the option button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TenantOptionRow
        tenant={makeTenant()}
        isCurrent={false}
        disabled={false}
        currentBadgeLabel="Atual"
        loyaltyPointsLabel="120 pontos"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByTestId('switch-tenant-option'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disables the option button when disabled is true', () => {
    render(
      <TenantOptionRow
        tenant={makeTenant()}
        isCurrent={false}
        disabled
        currentBadgeLabel="Atual"
        loyaltyPointsLabel="120 pontos"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('switch-tenant-option')).toBeDisabled();
  });
});

describe('TenantOptionRow readable colours (TD51-S05)', () => {
  it.each([
    ['static current row', true, 'switch-tenant-current'],
    ['selectable row', false, 'switch-tenant-option'],
  ])('%s: name and points read on the secondary surface', (_label, isCurrent, testId) => {
    render(
      <TenantOptionRow
        tenant={makeTenant()}
        isCurrent={isCurrent}
        disabled={false}
        currentBadgeLabel="Atual"
        loyaltyPointsLabel="120 pontos"
        onSelect={vi.fn()}
      />,
    );

    const row = screen.getByTestId(testId);
    expect(row.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(row.style.color).toBe('var(--ba-secondary-text)');
    expect(screen.getByText('Lava Rápido BH').style.color).toBe('var(--ba-secondary-text)');
    expect(screen.getByText('120 pontos').style.color).toBe('var(--ba-secondary-text)');
  });
});
