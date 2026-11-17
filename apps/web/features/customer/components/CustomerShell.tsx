'use client';

import type { CustomerFeatureKey } from '@ikaro/types';
import { CustomerFeaturesProvider } from './customer-features-context';
import { CustomerTopbar } from './CustomerTopbar';
import { CustomerTabNav } from './CustomerTabNav';
import { CustomerBottomNav } from './CustomerBottomNav';

interface CustomerShellProps {
  readonly children: React.ReactNode;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly userName: string | null;
  /** `false` while the tenant is suspended (UC-121): the topbar's "+ Novo" menu is disabled. */
  readonly tenantOperational?: boolean;
  /** The customer-facing features the tenant holds; `null` when unknown (every tab is shown). */
  readonly entitledFeatures?: readonly CustomerFeatureKey[] | null;
}

export function CustomerShell({
  children,
  tenantName,
  tenantSlug,
  userName,
  tenantOperational = true,
  entitledFeatures = null,
}: CustomerShellProps): React.JSX.Element {
  return (
    <CustomerFeaturesProvider entitledFeatures={entitledFeatures}>
      <div className="flex min-h-screen flex-col">
        <CustomerTopbar
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          userName={userName}
          tenantOperational={tenantOperational}
        />
        <CustomerTabNav tenantSlug={tenantSlug} entitledFeatures={entitledFeatures} />
        <main className="flex-1 bg-surface-app p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        <CustomerBottomNav tenantSlug={tenantSlug} entitledFeatures={entitledFeatures} />
      </div>
    </CustomerFeaturesProvider>
  );
}
