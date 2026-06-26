'use client';

import { createContext, useContext, useMemo } from 'react';

interface TenantState {
  readonly tenantId: string;
  readonly tenantSlug: string;
}

interface TenantProviderProps extends TenantState {
  readonly children: React.ReactNode;
}

const TenantContext = createContext<TenantState>({ tenantId: '', tenantSlug: '' });

export function TenantProvider({
  tenantId,
  tenantSlug,
  children,
}: TenantProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ tenantId, tenantSlug }), [tenantId, tenantSlug]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  return useContext(TenantContext);
}
