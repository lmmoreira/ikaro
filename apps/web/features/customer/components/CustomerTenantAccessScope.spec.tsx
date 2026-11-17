// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerFeatureKey } from '@ikaro/types';
import { CustomerTenantAccessScope } from './CustomerTenantAccessScope';
import { useCustomerCapabilities, useCustomerTenantAccess } from './customer-tenant-access-context';

const access = vi.hoisted(() => ({
  fetchCustomerTenantOperational: vi.fn(),
  fetchCustomerFeatures: vi.fn(),
}));
vi.mock('@/shared/lib/billing/access.server', () => access);

function Probe(): React.JSX.Element {
  const { operational, entitledFeatures } = useCustomerTenantAccess();
  const { newBookingMenu, canReschedule } = useCustomerCapabilities();

  return (
    <span data-testid="probe">
      {String(operational)}/{JSON.stringify(entitledFeatures)}/{newBookingMenu}/
      {String(canReschedule)}
    </span>
  );
}

// An async server component: its result is awaited, then rendered, as the page does.
async function renderScope(): Promise<void> {
  const scope = await CustomerTenantAccessScope({ token: 't', children: <Probe /> });
  render(scope);
}

function answer(operational: boolean | null, features: readonly CustomerFeatureKey[] | null): void {
  access.fetchCustomerTenantOperational.mockResolvedValue(operational);
  access.fetchCustomerFeatures.mockResolvedValue(features);
}

describe('CustomerTenantAccessScope', () => {
  beforeEach(() => {
    access.fetchCustomerTenantOperational.mockReset();
    access.fetchCustomerFeatures.mockReset();
  });

  it('provides the state read for this page to the components below it', async () => {
    answer(true, ['BOOKING', 'LOYALTY']);

    await renderScope();

    expect(screen.getByTestId('probe')).toHaveTextContent(
      'true/["BOOKING","LOYALTY"]/offered/true',
    );
  });

  // The regression this scope exists for: a tenant suspended after the account layout rendered must
  // show on the next page, so the page's own read decides, not the layout's earlier one.
  it('provides a suspended tenant: no reschedule, a disabled menu', async () => {
    answer(false, null);

    await renderScope();

    expect(screen.getByTestId('probe')).toHaveTextContent('false/null/disabled/false');
  });

  it('fails open when the access answer is unreadable: operational, every feature held', async () => {
    answer(null, null);

    await renderScope();

    expect(screen.getByTestId('probe')).toHaveTextContent('true/null/offered/true');
  });

  it('provides a tenant without BOOKING: the menu is absent', async () => {
    answer(true, ['LOYALTY']);

    await renderScope();

    expect(screen.getByTestId('probe')).toHaveTextContent('true/["LOYALTY"]/absent/true');
  });
});
