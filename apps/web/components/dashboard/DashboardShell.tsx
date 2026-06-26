'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { ManagerSheet } from './ManagerSheet';

interface DashboardShellProps {
  readonly children: React.ReactNode;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly userName: string | null;
  readonly role: 'STAFF' | 'MANAGER';
}

export function DashboardShell({
  children,
  tenantName,
  tenantSlug,
  userName,
  role,
}: DashboardShellProps): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        userName={userName}
        role={role}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar tenantName={tenantName} userName={userName} />
        <main className="flex-1 bg-[#f9fafb] p-4 pb-24 lg:p-6 lg:pb-6">
          {children}
        </main>
        <BottomNav role={role} onOpenSheet={() => setSheetOpen(true)} />
      </div>

      {role === 'MANAGER' && (
        <ManagerSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          tenantSlug={tenantSlug}
        />
      )}
    </div>
  );
}
