'use client';

import { useState } from 'react';
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
  readonly topbarAction?: React.ReactNode;
}

export function DashboardShell({
  children,
  tenantName,
  tenantSlug,
  userName,
  role,
  leadFormEnabled,
  topbarAction,
}: DashboardShellProps): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        userName={userName}
        role={role}
        leadFormEnabled={leadFormEnabled}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar tenantName={tenantName} userName={userName} action={topbarAction} />
        <main className="flex-1 bg-[#f9fafb] p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        <BottomNav
          role={role}
          leadFormEnabled={leadFormEnabled}
          onOpenSheet={() => setSheetOpen(true)}
        />
      </div>

      {(role === 'MANAGER' || leadFormEnabled) && (
        <MoreSheet
          role={role}
          leadFormEnabled={leadFormEnabled}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          tenantSlug={tenantSlug}
        />
      )}
    </div>
  );
}
