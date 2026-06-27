// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TenantProvider, useTenant } from './tenant-provider';

function Consumer(): React.JSX.Element {
  const { tenantId, tenantSlug } = useTenant();
  return (
    <div>
      <span data-testid="tenantId">{tenantId}</span>
      <span data-testid="tenantSlug">{tenantSlug}</span>
    </div>
  );
}

describe('TenantProvider / useTenant', () => {
  it('provides tenantId and tenantSlug to consumers', () => {
    render(
      <TenantProvider tenantId="tid-1" tenantSlug="lavacar-bh">
        <Consumer />
      </TenantProvider>,
    );
    expect(screen.getByTestId('tenantId')).toHaveTextContent('tid-1');
    expect(screen.getByTestId('tenantSlug')).toHaveTextContent('lavacar-bh');
  });

  it('returns empty strings when no provider is present', () => {
    render(<Consumer />);
    expect(screen.getByTestId('tenantId')).toHaveTextContent('');
    expect(screen.getByTestId('tenantSlug')).toHaveTextContent('');
  });
});
