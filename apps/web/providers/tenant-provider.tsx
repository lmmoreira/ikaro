'use client';

import { createContext, useContext, useMemo } from 'react';
import type { StaffRole } from '@ikaro/types';

interface TenantState {
  readonly tenantId: string;
  readonly tenantSlug: string;
  // Only the staff/manager dashboard shell (/dashboard/**) has a use for this today — the
  // customer shell (/{slug}/my-account/**) never passes it, so it stays optional rather than
  // inventing a CUSTOMER role value with no real consumer yet.
  readonly role?: StaffRole;
}

interface TenantProviderProps extends TenantState {
  readonly children: React.ReactNode;
}

const TenantContext = createContext<TenantState>({ tenantId: '', tenantSlug: '' });

export function TenantProvider({
  tenantId,
  tenantSlug,
  role,
  children,
}: TenantProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ tenantId, tenantSlug, role }), [tenantId, tenantSlug, role]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  return useContext(TenantContext);
}
