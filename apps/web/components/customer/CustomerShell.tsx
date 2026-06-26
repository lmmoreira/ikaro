'use client';

import { useEffect } from 'react';
import { configureBffClient } from '@/lib/api/bff-client';
import { CustomerTopbar } from './CustomerTopbar';
import { CustomerTabNav } from './CustomerTabNav';
import { CustomerBottomNav } from './CustomerBottomNav';

interface CustomerShellProps {
  readonly children: React.ReactNode;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly tenantId: string;
  readonly userName: string | null;
}

export function CustomerShell({
  children,
  tenantName,
  tenantSlug,
  tenantId,
  userName,
}: CustomerShellProps): React.JSX.Element {
  useEffect(() => {
    configureBffClient({ token: '', tenantSlug, tenantId });
  }, [tenantSlug, tenantId]);

  return (
    <div className="flex min-h-screen flex-col">
      <CustomerTopbar tenantName={tenantName} tenantSlug={tenantSlug} userName={userName} />
      <CustomerTabNav tenantSlug={tenantSlug} />
      <main className="flex-1 bg-[#f9fafb] p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      <CustomerBottomNav tenantSlug={tenantSlug} />
    </div>
  );
}
