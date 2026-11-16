'use client';

import { useState } from 'react';
import type { FeatureKey } from '@ikaro/types';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';

interface DashboardShellProps {
  readonly children: React.ReactNode;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly userName: string | null;
  readonly role: 'STAFF' | 'MANAGER';
  readonly leadFormEnabled: boolean;
  readonly lockedFeatures: readonly FeatureKey[];
  readonly topbarAction?: React.ReactNode;
}

export function DashboardShell({
  children,
  tenantName,
  tenantSlug,
  userName,
  role,
  leadFormEnabled,
  lockedFeatures,
  topbarAction,
}: DashboardShellProps): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Leads is shown when the manager enabled it or, locked, when the tenant is not entitled.
  const leadsVisible = leadFormEnabled || lockedFeatures.includes('LEAD_FORM');

  return (
    <div className="flex min-h-screen">
      <Sidebar
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        userName={userName}
        role={role}
        leadFormEnabled={leadFormEnabled}
        lockedFeatures={lockedFeatures}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar tenantName={tenantName} userName={userName} action={topbarAction} />
        <main className="flex-1 bg-surface-app p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        <BottomNav
          role={role}
          leadFormEnabled={leadFormEnabled}
          lockedFeatures={lockedFeatures}
          onOpenSheet={() => setSheetOpen(true)}
        />
      </div>

      {(role === 'MANAGER' || leadsVisible) && (
        <MoreSheet
          role={role}
          leadFormEnabled={leadFormEnabled}
          lockedFeatures={lockedFeatures}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          tenantSlug={tenantSlug}
        />
      )}
    </div>
  );
}
