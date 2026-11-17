// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomerFeatureKey } from '@ikaro/types';
import {
  CustomerTenantAccessProvider,
  useCustomerCapabilities,
  useCustomerTenantAccess,
} from './customer-tenant-access-context';

function Probe(): React.JSX.Element {
  const access = useCustomerTenantAccess();
  const capabilities = useCustomerCapabilities();

  return (
    <span data-testid="probe">
      {String(access.operational)}/{JSON.stringify(access.entitledFeatures)}/
      {capabilities.newBookingMenu}/{String(capabilities.showInactiveNotice)}
    </span>
  );
}

function renderWith(operational: boolean, features: readonly CustomerFeatureKey[] | null): void {
  render(
    <CustomerTenantAccessProvider operational={operational} entitledFeatures={features}>
      <Probe />
    </CustomerTenantAccessProvider>,
  );
}

describe('the customer tenant access context', () => {
  it('provides the tenant state and the capabilities resolved from it', () => {
    renderWith(true, ['BOOKING']);

    expect(screen.getByTestId('probe')).toHaveTextContent('true/["BOOKING"]/offered/false');
  });

  it('reads a suspended tenant that holds BOOKING as a disabled menu under the inactive notice', () => {
    renderWith(false, ['BOOKING']);

    expect(screen.getByTestId('probe')).toHaveTextContent('false/["BOOKING"]/disabled/true');
  });

  it('reads a tenant without BOOKING as an absent menu', () => {
    renderWith(true, ['LOYALTY']);

    expect(screen.getByTestId('probe')).toHaveTextContent('true/["LOYALTY"]/absent/false');
  });

  it('fails open outside a provider: operational, every feature held', () => {
    render(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('true/null/offered/false');
  });
});
