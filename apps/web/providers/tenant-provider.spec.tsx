// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TenantProvider, useTenant } from './tenant-provider';

function Consumer(): React.JSX.Element {
  const { tenantId, tenantSlug, role } = useTenant();
  return (
    <div>
      <span data-testid="tenantId">{tenantId}</span>
      <span data-testid="tenantSlug">{tenantSlug}</span>
      <span data-testid="role">{role}</span>
    </div>
  );
}

describe('TenantProvider / useTenant', () => {
  it('provides tenantId, tenantSlug, and role to consumers', () => {
    // Passed via a variable, not a literal, so jsx-a11y/aria-role (which validates a literal
    // `role="..."` JSX attribute against the ARIA role list) doesn't misfire on this unrelated,
    // non-DOM `role` prop — same reason every real call site passes `role={shell.role}`.
    const managerRole = 'MANAGER' as const;
    render(
      <TenantProvider tenantId="tid-1" tenantSlug="lavacar-bh" role={managerRole}>
        <Consumer />
      </TenantProvider>,
    );
    expect(screen.getByTestId('tenantId')).toHaveTextContent('tid-1');
    expect(screen.getByTestId('tenantSlug')).toHaveTextContent('lavacar-bh');
    expect(screen.getByTestId('role')).toHaveTextContent('MANAGER');
  });

  it('provides the STAFF role to consumers', () => {
    const staffRole = 'STAFF' as const;
    render(
      <TenantProvider tenantId="tid-1" tenantSlug="lavacar-bh" role={staffRole}>
        <Consumer />
      </TenantProvider>,
    );
    expect(screen.getByTestId('role')).toHaveTextContent('STAFF');
  });

  it('returns empty strings and an undefined role when no provider is present', () => {
    render(<Consumer />);
    expect(screen.getByTestId('tenantId')).toHaveTextContent('');
    expect(screen.getByTestId('tenantSlug')).toHaveTextContent('');
    expect(screen.getByTestId('role')).toHaveTextContent('');
  });

  it('leaves role undefined when the provider omits it (e.g. the customer shell)', () => {
    render(
      <TenantProvider tenantId="tid-1" tenantSlug="lavacar-bh">
        <Consumer />
      </TenantProvider>,
    );
    expect(screen.getByTestId('tenantId')).toHaveTextContent('tid-1');
    expect(screen.getByTestId('role')).toHaveTextContent('');
  });
});
